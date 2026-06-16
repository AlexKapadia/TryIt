/**
 * @tryit/sdk-node/client — the typed server SDK client for the TryIt API.
 *
 * {@link TryItClient} is what a retailer's backend uses to create and track virtual try-on
 * jobs. It is built on the shared `@tryit/contracts` schemas so it is fail-closed in both
 * directions: outgoing requests are validated with the contract parser *before* a byte leaves
 * the process, and every server response is parsed against its contract *before* being returned
 * to the caller — a malformed, partial, or empty response is rejected, never trusted.
 *
 * The client takes no ambient dependencies: `fetch` and the clock (`now`/`sleep`) are injected,
 * so it is fully testable without a network and deterministic under test. The API key is sent
 * only as a `Bearer` Authorization header and is never logged, stringified, or placed in an
 * error message.
 */

import {
  type ApiError,
  type TryOnJob,
  type TryOnRequest,
  makeApiError,
  parseTryOnRequest,
  safeParseTryOnJob,
  safeParseApiError,
} from '@tryit/contracts';
import {
  type ApiClientError,
  apiClientErrorFromContract,
  failClosedError,
} from './api-error.js';

/** Build an `INVALID_INPUT` {@link ApiError}; httpStatus (400) is derived from the contract map. */
function invalidInput(message: string): ApiError {
  return makeApiError('INVALID_INPUT', message);
}

/** The subset of the WHATWG `fetch` signature the SDK depends on. Injected for testability. */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<FetchLikeResponse>;

/** The subset of a `fetch` `Response` the SDK reads. */
export interface FetchLikeResponse {
  /** HTTP status code; `ok` (2xx) is derived from it, not trusted from the response. */
  readonly status: number;
  /** Resolves to the raw response body text; the SDK parses it itself (fail-closed). */
  text(): Promise<string>;
}

/** Options for constructing a {@link TryItClient}. */
export interface TryItClientOptions {
  /** Secret API key, sent only as a Bearer token. Supply via env/secret manager. */
  readonly apiKey: string;
  /** Base URL of the TryIt API, e.g. `https://api.tryit.example`. No trailing slash required. */
  readonly baseUrl: string;
  /** Injected fetch implementation. Defaults to the global `fetch` when omitted. */
  readonly fetch?: FetchLike;
  /** Injected monotonic-ish clock returning epoch millis. Defaults to `Date.now`. */
  readonly now?: () => number;
  /** Injected delay used by {@link TryItClient.waitForJob}. Defaults to a real `setTimeout`. */
  readonly sleep?: (ms: number) => Promise<void>;
}

/** Options controlling {@link TryItClient.waitForJob} polling. */
export interface WaitForJobOptions {
  /** Delay between polls, in milliseconds. Must be a positive integer. */
  readonly pollMs: number;
  /** Maximum total wall-clock time to wait before failing closed, in milliseconds. */
  readonly timeoutMs: number;
}

/** Terminal job statuses — once reached, the job will not change again. */
const TERMINAL_STATUSES: ReadonlySet<TryOnJob['status']> = new Set(['succeeded', 'failed']);

/** Default real-clock sleep used when the caller does not inject one. */
function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Typed client over the TryIt API.
 *
 * All methods reject with an {@link ApiClientError} (never an untyped throwable) on any failure,
 * including transport errors and unparseable responses. Construct once per credential and reuse.
 */
export class TryItClient {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #fetch: FetchLike;
  readonly #now: () => number;
  readonly #sleep: (ms: number) => Promise<void>;

  public constructor(options: TryItClientOptions) {
    if (options.apiKey.length === 0) {
      // fail-closed: refuse to construct a client that could only ever send an empty credential.
      throw failClosedError('apiKey must be a non-empty string');
    }
    if (options.baseUrl.length === 0) {
      throw failClosedError('baseUrl must be a non-empty string');
    }
    this.#apiKey = options.apiKey;
    // Normalise a single trailing slash so path joins never produce `//v1`.
    this.#baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.#fetch = options.fetch ?? (globalThis.fetch as unknown as FetchLike);
    this.#now = options.now ?? Date.now;
    this.#sleep = options.sleep ?? defaultSleep;
  }

  /**
   * Create a new try-on job.
   *
   * Validates `request` with the contract parser before sending (fail-closed — an invalid
   * request never reaches the network), POSTs it to `${baseUrl}/v1/tryons`, and parses the
   * response body into a {@link TryOnJob} before returning.
   *
   * @throws {ApiClientError} `INVALID_INPUT` if the request fails contract validation; the
   *   mapped contract error on a non-2xx response; `PROVIDER_ERROR` (fail-closed) on a
   *   transport failure or an unparseable success body.
   */
  public async createTryOn(request: TryOnRequest): Promise<TryOnJob> {
    let validated: TryOnRequest;
    try {
      // fail-closed: parse BEFORE any fetch so a bad request never leaves the process.
      validated = parseTryOnRequest(request);
    } catch {
      // Do not echo the request contents (may contain inline image bytes / shopper data).
      // Build via contract so httpStatus (400) is derived, never hand-written.
      throw apiClientErrorFromContract(invalidInput('try-on request failed contract validation'));
    }

    const response = await this.#send('POST', '/v1/tryons', JSON.stringify(validated));
    return this.#parseJobResponse(response);
  }

  /**
   * Fetch a single try-on job by id.
   *
   * GETs `${baseUrl}/v1/tryons/${jobId}` and parses the response into a {@link TryOnJob}.
   *
   * @throws {ApiClientError} `INVALID_INPUT` for an empty id; the mapped contract error on a
   *   non-2xx response; `PROVIDER_ERROR` (fail-closed) on transport/parse failure.
   */
  public async getJob(jobId: string): Promise<TryOnJob> {
    if (jobId.length === 0) {
      // fail-closed: never issue a GET against `/v1/tryons/` with no id.
      throw apiClientErrorFromContract(invalidInput('jobId must be a non-empty string'));
    }
    const response = await this.#send('GET', `/v1/tryons/${encodeURIComponent(jobId)}`);
    return this.#parseJobResponse(response);
  }

  /**
   * Poll {@link getJob} until the job reaches a terminal status or the timeout elapses.
   *
   * Uses the injected clock (`now`/`sleep`) exclusively, so it is deterministic under test and
   * never sleeps on a real timer when one is injected. The timeout is checked against elapsed
   * wall-clock time from the injected `now`, not against a poll count.
   *
   * @throws {ApiClientError} `PROVIDER_ERROR` (fail-closed) when the timeout elapses before a
   *   terminal status; or any error propagated from {@link getJob}.
   */
  public async waitForJob(jobId: string, options: WaitForJobOptions): Promise<TryOnJob> {
    if (!Number.isInteger(options.pollMs) || options.pollMs <= 0) {
      throw apiClientErrorFromContract(invalidInput('pollMs must be a positive integer'));
    }
    if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 0) {
      throw apiClientErrorFromContract(invalidInput('timeoutMs must be a non-negative integer'));
    }

    const deadline = this.#now() + options.timeoutMs;
    for (;;) {
      const job = await this.getJob(jobId);
      if (TERMINAL_STATUSES.has(job.status)) {
        return job;
      }
      // Check the deadline AFTER a poll so a job already terminal on the first poll is returned
      // even with timeoutMs === 0. A poll that would land at/after the deadline fails closed.
      if (this.#now() + options.pollMs > deadline) {
        throw failClosedError(`timed out waiting for job to reach a terminal status`);
      }
      await this.#sleep(options.pollMs);
    }
  }

  /**
   * Issue a request and return the raw response, translating transport failures into a typed,
   * fail-closed {@link ApiClientError}. The API key is attached here and nowhere else.
   */
  async #send(
    method: 'GET' | 'POST',
    path: string,
    body?: string,
  ): Promise<FetchLikeResponse> {
    const headers: Record<string, string> = {
      // Credential travels only as a Bearer token; never logged or placed in an error message.
      Authorization: `Bearer ${this.#apiKey}`,
    };
    // Build init incrementally so `body` is only set when present — exactOptionalPropertyTypes
    // forbids passing an explicit `undefined` for an optional property.
    const init: { method: string; headers: Record<string, string>; body?: string } = {
      method,
      headers,
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = body;
    }
    try {
      return await this.#fetch(`${this.#baseUrl}${path}`, init);
    } catch {
      // fail-closed: any transport-level throw becomes a typed PROVIDER_ERROR. We deliberately
      // do not include the underlying error message — it could echo the URL or headers.
      throw failClosedError('request to the TryIt API failed at the transport layer');
    }
  }

  /**
   * Read a response, raise the typed error for any non-2xx, and otherwise parse the body into a
   * validated {@link TryOnJob}. Every exit is fail-closed: an unparseable body becomes a typed
   * `PROVIDER_ERROR` rather than a trusted partial object.
   */
  async #parseJobResponse(response: FetchLikeResponse): Promise<TryOnJob> {
    const raw = await this.#readBody(response);

    if (response.status < 200 || response.status >= 300) {
      throw this.#errorFromBody(raw);
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      throw failClosedError('success response body was not valid JSON');
    }
    const result = safeParseTryOnJob(parsedJson);
    if (!result.success) {
      // fail-closed: a 2xx with a body that is not a valid TryOnJob is treated as a failure.
      throw failClosedError('success response did not match the TryOnJob contract');
    }
    return result.data;
  }

  /** Read the body text, converting a throwing/streaming failure into a fail-closed error. */
  async #readBody(response: FetchLikeResponse): Promise<string> {
    try {
      return await response.text();
    } catch {
      throw failClosedError('failed to read the response body');
    }
  }

  /**
   * Turn a non-2xx response body into a typed error: parse it against the {@link ApiError}
   * contract and, if that fails (malformed/empty error body), fail closed with `PROVIDER_ERROR`.
   */
  #errorFromBody(raw: string): ApiClientError {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      return failClosedError('error response body was not valid JSON');
    }
    const result = safeParseApiError(parsedJson);
    if (!result.success) {
      return failClosedError('error response did not match the ApiError contract');
    }
    return apiClientErrorFromContract(result.data);
  }
}
