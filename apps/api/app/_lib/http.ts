/**
 * @tryit/api/_lib/http — CORS + error-response helpers shared by the route handlers.
 *
 * Centralises two concerns so every route is consistent: (1) CORS headers, driven by an
 * allow-list from `TRYIT_CORS_ORIGINS` (comma-separated) with a `*` dev fallback, including the
 * `Authorization` header so browser clients can send the bearer key; and (2) turning a typed
 * {@link ApiError} into a JSON error response at the canonical HTTP status. Errors never leak the
 * API key or an internal stack — only the contract's `{ code, message, httpStatus }` shape.
 */

import { httpStatusForErrorCode, type ApiError } from '@tryit/contracts';

/** The methods the API exposes for CORS preflight. */
const ALLOWED_METHODS = 'GET, POST, OPTIONS';
/** Headers a browser client may send; Authorization is required for the bearer key. */
const ALLOWED_HEADERS = 'Authorization, Content-Type';

/** Parse the configured CORS allow-list, or fall back to `*` for local development. */
function corsOrigin(requestOrigin: string | null): string {
  const configured = process.env.TRYIT_CORS_ORIGINS;
  if (!configured) {
    return '*'; // dev fallback: permissive only when no allow-list is configured.
  }
  const allow = configured.split(',').map((o) => o.trim()).filter(Boolean);
  // fail-closed: echo the origin only when it is explicitly allow-listed; else deny via 'null'.
  if (requestOrigin !== null && allow.includes(requestOrigin)) {
    return requestOrigin;
  }
  return 'null';
}

/** Build the CORS header set for a given request origin. */
export function corsHeaders(request: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': corsOrigin(request.headers.get('origin')),
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    Vary: 'Origin', // caches must key on Origin since the allowed value varies per request.
  };
}

/** Standard preflight response: no body, 204, CORS headers only. */
export function preflightResponse(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

/** Serialise an {@link ApiError} into a JSON response at its canonical status, with CORS. */
export function apiErrorResponse(
  error: ApiError,
  request: Request,
  extraHeaders: Record<string, string> = {},
): Response {
  const headers = { ...corsHeaders(request), 'Content-Type': 'application/json', ...extraHeaders };
  // Only the contract shape is returned — never the api key, request body, or a stack trace.
  return new Response(JSON.stringify(error), {
    status: httpStatusForErrorCode(error.code),
    headers,
  });
}

/** Serialise an arbitrary JSON body at a status with CORS headers. */
export function jsonResponse(body: unknown, status: number, request: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  });
}
