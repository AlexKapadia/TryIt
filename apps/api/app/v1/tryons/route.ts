/**
 * POST /v1/tryons — the try-on entry point.
 *
 * Parses the JSON body into a validated {@link TryOnRequest}, extracts the bearer API key, and
 * runs the fail-closed pipeline. On success it returns the terminal {@link TryOnJob} as JSON; on
 * any typed failure it maps the {@link PipelineError}'s {@link ApiError} onto the canonical HTTP
 * status. The handler never leaks the API key, the request body, or an internal error message —
 * only the contract error shape crosses the boundary. CORS is applied to every response and an
 * OPTIONS preflight is served.
 */

import { parseTryOnRequest, makeApiError } from '@tryit/contracts';
import { runTryOn } from '../../_lib/pipeline';
import { isPipelineError } from '../../_lib/pipeline-errors';
import { extractBearerToken } from '../../_lib/bearer';
import { preflightResponse, apiErrorResponse, jsonResponse } from '../../_lib/http';

/** CORS preflight for the try-on endpoint. */
export async function OPTIONS(request: Request): Promise<Response> {
  return preflightResponse(request);
}

/** Handle a try-on request: authenticate, run the pipeline, return the job or a typed error. */
export async function POST(request: Request): Promise<Response> {
  // Extract the bearer key first; a missing credential is refused before any body parsing.
  const apiKeyPlaintext = extractBearerToken(request);
  if (apiKeyPlaintext === null) {
    // fail-closed: no credential -> 401, with no detail about why.
    return apiErrorResponse(makeApiError('UNAUTHORIZED', 'missing or malformed bearer token'), request);
  }

  // Parse the JSON body; a malformed body or schema violation is a 400 INVALID_INPUT.
  let request_;
  try {
    const body: unknown = await request.json();
    request_ = parseTryOnRequest(body);
  } catch {
    // fail-closed: never echo the offending body or a Zod stack — just the typed error.
    return apiErrorResponse(makeApiError('INVALID_INPUT', 'request body is not a valid try-on request'), request);
  }

  try {
    const job = await runTryOn({ request: request_, apiKeyPlaintext });
    return jsonResponse(job, 200, request);
  } catch (error) {
    if (isPipelineError(error)) {
      // Surface Retry-After (seconds) for rate-limit denials so clients back off correctly.
      const extra: Record<string, string> = {};
      if (error.retryAfterMs !== undefined) {
        extra['Retry-After'] = String(Math.ceil(error.retryAfterMs / 1000));
      }
      return apiErrorResponse(error.apiError, request, extra);
    }
    // fail-closed: any unexpected error becomes an opaque provider error, never a leak.
    return apiErrorResponse(makeApiError('PROVIDER_ERROR', 'an internal error occurred'), request);
  }
}
