/**
 * @tryit/sdk-node — typed server SDK for retailer backends.
 *
 * Gives a retailer's backend a typed, ergonomic, fail-closed client over the TryIt API, built
 * on the shared `@tryit/contracts` schemas so requests and responses are validated and type
 * safe end to end. The client takes no ambient dependencies — `fetch` and the clock are injected
 * — so it is fully testable without a network and deterministic under test. Credentials are
 * supplied by the caller via env/secret manager, sent only as a Bearer token, and never logged.
 *
 * This file is a barrel — the client and its typed error live in focused modules and are
 * re-exported here as the public surface.
 */

export {
  TryItClient,
  type TryItClientOptions,
  type WaitForJobOptions,
  type FetchLike,
  type FetchLikeResponse,
} from './client.js';
export {
  ApiClientError,
  apiClientErrorFromContract,
  failClosedError,
} from './api-error.js';
