/**
 * @tryit/sdk-node/api-error — the typed error thrown by {@link TryItClient}.
 *
 * Every failure the SDK surfaces to a retailer backend is raised as an {@link ApiClientError}:
 * a real `Error` subclass carrying the machine-readable {@link ApiError} contract (code,
 * message, httpStatus) so callers can branch on `code` and reach for `httpStatus` without
 * string-matching. The SDK is fail-closed — when a server response cannot be parsed into the
 * `ApiError` contract (malformed/empty body, transport failure), the SDK still raises a typed
 * error with a synthesised `PROVIDER_ERROR` code rather than leaking an untyped throwable.
 */

import { type ApiError, makeApiError } from '@tryit/contracts';

/**
 * A typed error raised by the SDK for any non-success outcome.
 *
 * Wraps the {@link ApiError} contract so callers get `error.code` / `error.httpStatus` directly.
 * Construct via the helpers below rather than `new` so the wire shape is always validated and
 * the status can never disagree with the code.
 */
export class ApiClientError extends Error {
  /** The machine-readable error code from the closed contract set. */
  public readonly code: ApiError['code'];
  /** The HTTP status associated with the code (4xx/5xx). */
  public readonly httpStatus: number;
  /** The full validated wire-shape error, for callers that want the raw contract. */
  public readonly apiError: ApiError;

  public constructor(apiError: ApiError) {
    super(apiError.message);
    this.name = 'ApiClientError';
    this.code = apiError.code;
    this.httpStatus = apiError.httpStatus;
    this.apiError = apiError;
    // Restore the prototype chain so `instanceof ApiClientError` works after transpilation.
    Object.setPrototypeOf(this, ApiClientError.prototype);
  }
}

/**
 * Build an {@link ApiClientError} from a validated {@link ApiError} contract object.
 *
 * Used when the server returned a body that successfully parsed as the error contract.
 */
export function apiClientErrorFromContract(apiError: ApiError): ApiClientError {
  return new ApiClientError(apiError);
}

/**
 * Build a fail-closed {@link ApiClientError} with a `PROVIDER_ERROR` code.
 *
 * Used when the SDK cannot trust or parse a response (malformed/empty error body, unparseable
 * success body, transport failure, or a timeout). Fail-closed: an ambiguous outcome surfaces as
 * a typed error, never as a silent success or an untyped throwable.
 *
 * @param message Human-readable detail; must be non-empty to satisfy the contract.
 */
export function failClosedError(message: string): ApiClientError {
  // makeApiError derives httpStatus from the canonical code->status map, so it cannot drift.
  return new ApiClientError(makeApiError('PROVIDER_ERROR', message));
}
