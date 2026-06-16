/**
 * @tryit/contracts/errors — the API error contract and code -> HTTP status mapping.
 *
 * Errors crossing the API boundary use a closed set of machine-readable codes plus a
 * human-readable message and an HTTP status. The code -> status mapping is exhaustive (the
 * compiler enforces a status for every code via a total `Record`) and fail-closed: an
 * unrecognised code maps to 500 rather than leaking through as a success. Keeping the mapping
 * here means the API, SDKs, and clients all agree on how each failure surfaces over HTTP.
 */

import { z } from 'zod';

/**
 * The closed set of API error codes. Each names a distinct, client-actionable failure mode
 * at a trust or policy boundary (bad input, rate/budget limits, provider failure, the global
 * kill switch, auth failure, and oversized payloads).
 */
export const ErrorCodeSchema = z.enum([
  'INVALID_INPUT',
  'RATE_LIMITED',
  'BUDGET_EXCEEDED',
  'PROVIDER_ERROR',
  'KILL_SWITCH_ENGAGED',
  'UNAUTHORIZED',
  'PAYLOAD_TOO_LARGE',
]);

/** A machine-readable API error code. */
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/**
 * Total mapping from each {@link ErrorCode} to its HTTP status. Declared as a `Record` keyed by
 * the union so the compiler fails the build if any code is added without a status — there is no
 * way to omit a case. Every status is a deliberate 4xx (client/policy) or 5xx (server/provider).
 */
export const ERROR_CODE_HTTP_STATUS: Record<ErrorCode, number> = {
  INVALID_INPUT: 400, // malformed/invalid request body
  PAYLOAD_TOO_LARGE: 413, // request/image exceeds size bounds
  UNAUTHORIZED: 401, // missing or invalid credentials
  RATE_LIMITED: 429, // per-shopper or per-tenant rate limit hit
  BUDGET_EXCEEDED: 402, // tenant monthly spend cap reached
  KILL_SWITCH_ENGAGED: 503, // global or tenant kill switch halting calls
  PROVIDER_ERROR: 502, // upstream image provider failed
};

/** The fail-closed status used when a code is somehow unrecognised at runtime. */
export const FAIL_CLOSED_HTTP_STATUS = 500;

/**
 * Resolve the HTTP status for an error code.
 *
 * @returns The mapped 4xx/5xx status, or {@link FAIL_CLOSED_HTTP_STATUS} (500) for an unknown
 *   code. Fail-closed: an unrecognised code never resolves to a 2xx/3xx success.
 */
export function httpStatusForErrorCode(code: ErrorCode): number {
  // `?? FAIL_CLOSED_HTTP_STATUS` guards against a runtime value outside the known union
  // (noUncheckedIndexedAccess makes the lookup `number | undefined`).
  return ERROR_CODE_HTTP_STATUS[code] ?? FAIL_CLOSED_HTTP_STATUS;
}

/**
 * The wire shape of an API error: a code, a human-readable message, and the HTTP status the
 * caller will have received. `httpStatus` is bounded to the 4xx/5xx error range.
 */
export const ApiErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string().min(1),
  httpStatus: z.number().int().min(400).max(599),
});

/** A validated API error. */
export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * Parse an unknown input into a validated {@link ApiError}.
 *
 * @throws {z.ZodError} if the input does not satisfy {@link ApiErrorSchema}.
 */
export function parseApiError(input: unknown): ApiError {
  return ApiErrorSchema.parse(input);
}

/** Non-throwing variant of {@link parseApiError}. */
export function safeParseApiError(input: unknown): z.SafeParseReturnType<unknown, ApiError> {
  return ApiErrorSchema.safeParse(input);
}

/**
 * Build a wire-ready {@link ApiError} for a code and message, deriving the HTTP status from
 * the canonical mapping so the status can never disagree with the code.
 */
export function makeApiError(code: ErrorCode, message: string): ApiError {
  return { code, message, httpStatus: httpStatusForErrorCode(code) };
}
