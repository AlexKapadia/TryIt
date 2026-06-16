/**
 * GET /v1/tryons/[id] — fetch a stored try-on job by id, authenticated and tenant-scoped.
 *
 * The caller MUST present a Bearer key (same auth path as the write route): a missing/malformed
 * credential is a 401 UNAUTHORIZED. A job is returned ONLY when the key verifies against that
 * job's OWN tenant (correct tenant + `tryon` scope), closing the cross-tenant result-leak vector
 * (threat I1). For a missing job OR a job owned by another tenant the response is the SAME typed
 * 404 — a caller can never distinguish "no such job" from "someone else's job" (anti-enumeration).
 * Fail-closed: an unknown id never returns a fabricated job, and an unauthorised read never reveals
 * existence. CORS is applied and an OPTIONS preflight is served.
 */

import { getRuntime } from '../../../_lib/runtime';
import { extractBearerToken } from '../../../_lib/bearer';
import { canReadJob } from '../../../_lib/job-access';
import { preflightResponse, jsonResponse, apiErrorResponse } from '../../../_lib/http';
import { makeApiError } from '@tryit/contracts';

/** CORS preflight for the job-read endpoint. */
export async function OPTIONS(request: Request): Promise<Response> {
  return preflightResponse(request);
}

/** The single not-found body, shared by the miss and the cross-tenant paths (anti-enumeration). */
function notFoundResponse(request: Request): Response {
  // Identical body for "absent" and "other tenant's" so existence is never revealed.
  return jsonResponse({ error: 'not_found', message: 'no job exists for that id' }, 404, request);
}

/** Return the stored job for `id` when the caller is authorised, else a typed 401/404. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  // Extract the bearer key first; a missing/malformed credential is refused before any lookup.
  const apiKeyPlaintext = extractBearerToken(request);
  if (apiKeyPlaintext === null) {
    // fail-closed: no credential -> 401, with no detail about why.
    return apiErrorResponse(makeApiError('UNAUTHORIZED', 'missing or malformed bearer token'), request);
  }

  const { id } = await context.params;
  const runtime = getRuntime();
  const job = runtime.jobs.get(id);
  if (job === undefined) {
    // fail-closed: an unknown id is a typed 404 body, not an empty 200.
    return notFoundResponse(request);
  }

  // tenant isolation: the key must verify against the job's OWN tenant, or this read is a 404
  // (NOT a 401) so a valid key for tenant A cannot confirm the existence of tenant B's job.
  if (!canReadJob(runtime, apiKeyPlaintext, job)) {
    return notFoundResponse(request);
  }

  return jsonResponse(job, 200, request);
}
