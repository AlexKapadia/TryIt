/**
 * @tryit/widget/api — minimal browser API client for the try-on service.
 *
 * This is the browser-runtime client used inside the embeddable web component. It deliberately
 * does NOT depend on `@tryit/sdk-node` (Node-only, carries server concerns and secrets); the
 * widget ships to untrusted retailer pages and must stay tiny and dependency-light.
 *
 * Defensive posture: `fetch` is injected (never read off `globalThis`) so the element can pass
 * the real browser fetch and tests can pass a fake — there is no implicit network. Every
 * response is validated against the shared `@tryit/contracts` schemas before it is trusted; an
 * error response is parsed into a typed `ApiError` and surfaced as a typed `ErrorCode`. Anything
 * that does not match a known shape fails closed to `PROVIDER_ERROR` rather than being trusted.
 */

import {
  safeParseTryOnJob,
  safeParseApiError,
  type TryOnJob,
  type TryOnRequest,
  type ErrorCode,
} from '@tryit/contracts';

/** The subset of the Fetch API surface this client needs. Injected for testability. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Configuration for the client: where the API lives, how to auth, and which fetch to use. */
export interface ApiClientConfig {
  readonly baseUrl: string;
  /** Publishable tenant key sent as a bearer token. Never a secret server key. */
  readonly publishableKey: string;
  /** Injected fetch implementation — no implicit `globalThis.fetch`. */
  readonly fetch: FetchLike;
}

/** A discriminated result type so callers branch on success/failure without exceptions. */
export type ApiResult<T> = { ok: true; value: T } | { ok: false; code: ErrorCode };

/** A typed try-on API client bound to a tenant and a fetch implementation. */
export interface TryOnApiClient {
  /** Create a try-on job from a validated request body. */
  createTryOn(request: TryOnRequest, idempotencyKey?: string): Promise<ApiResult<TryOnJob>>;
  /** Poll a job by id. */
  getJob(jobId: string): Promise<ApiResult<TryOnJob>>;
}

/** Build the Authorization + content headers for a request, optionally with an idempotency key. */
function buildHeaders(config: ApiClientConfig, idempotencyKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    // least privilege: a publishable key, scoped to create/read try-ons, never a god key.
    authorization: `Bearer ${config.publishableKey}`,
  };
  if (idempotencyKey !== undefined) {
    headers['idempotency-key'] = idempotencyKey;
  }
  return headers;
}

/** Normalise a base URL + path into a single URL without a doubled slash. */
function joinUrl(baseUrl: string, path: string): string {
  const trimmed = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${trimmed}${path}`;
}

/**
 * Interpret a `Response` whose body should be a `TryOnJob`. On a 2xx, the body is parsed against
 * the job schema and only a valid job is trusted. On a non-2xx, the body is parsed against the
 * `ApiError` schema to recover the typed code. Any parse failure or unexpected shape fails closed
 * to `PROVIDER_ERROR` — the widget never trusts an unvalidated payload.
 */
async function interpretJobResponse(response: Response): Promise<ApiResult<TryOnJob>> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // A non-JSON / truncated body is treated as a provider failure (fail-closed).
    return { ok: false, code: 'PROVIDER_ERROR' };
  }

  if (response.ok) {
    const parsed = safeParseTryOnJob(body);
    if (parsed.success) {
      return { ok: true, value: parsed.data };
    }
    // 2xx with a body that is not a valid job is a contract breach — do not trust it.
    return { ok: false, code: 'PROVIDER_ERROR' };
  }

  const apiError = safeParseApiError(body);
  if (apiError.success) {
    return { ok: false, code: apiError.data.code };
  }
  // Non-2xx without a recognisable error body still fails closed with a typed code.
  return { ok: false, code: 'PROVIDER_ERROR' };
}

/** Wrap a fetch call so a thrown network error becomes a typed `PROVIDER_ERROR`, never an unhandled reject. */
async function safeFetch(
  config: ApiClientConfig,
  path: string,
  init: RequestInit,
): Promise<ApiResult<TryOnJob>> {
  let response: Response;
  try {
    response = await config.fetch(joinUrl(config.baseUrl, path), init);
  } catch {
    // Network/CORS failure: fail closed with a retryable provider error.
    return { ok: false, code: 'PROVIDER_ERROR' };
  }
  return interpretJobResponse(response);
}

/**
 * Construct a {@link TryOnApiClient}. All I/O goes through the injected `config.fetch`; this
 * function performs no network access itself, so the client is safe to build in any context.
 */
export function createApiClient(config: ApiClientConfig): TryOnApiClient {
  return {
    async createTryOn(
      request: TryOnRequest,
      idempotencyKey?: string,
    ): Promise<ApiResult<TryOnJob>> {
      return safeFetch(config, '/v1/tryons', {
        method: 'POST',
        headers: buildHeaders(config, idempotencyKey),
        body: JSON.stringify(request),
      });
    },
    async getJob(jobId: string): Promise<ApiResult<TryOnJob>> {
      // Encode the id so a hostile/odd job id cannot break out of the path.
      const path = `/v1/tryons/${encodeURIComponent(jobId)}`;
      return safeFetch(config, path, {
        method: 'GET',
        headers: buildHeaders(config),
      });
    },
  };
}
