/**
 * @tryit/engine — try-on provider abstraction and routing for the TryIt platform.
 *
 * Public surface: the {@link TryOnProvider} interface and its {@link ProviderContext}, the
 * concrete provider adapters (deterministic terminal fallback, fal.ai, self-hosted inference,
 * Replicate, Google VTO — every external one with an injected client so the core stays testable
 * and network-free), and the {@link EngineRouter} that selects a provider per request from a
 * tenant's policy, falls through on failure/timeout, and always lands on the deterministic
 * fallback. The routing core is deterministic and fail-closed; provider calls are untrusted I/O.
 */

export type { EngineLogger, ProviderContext, TryOnProvider } from './provider.js';
export { NOOP_LOGGER } from './provider.js';

export { DeterministicProvider } from './providers/deterministic.js';
export {
  buildPlaceholderSvg,
  buildPlaceholderImageDataUrl,
} from './providers/deterministic_placeholder_svg.js';

export { FalProvider, FAL_TRYON_ENDPOINT, defaultFalRunnerFactory } from './providers/fal.js';
export type {
  FalRunner,
  FalRunResult,
  FalProviderOptions,
  FalTryOnInput,
  FalTryOnOutput,
} from './providers/fal.js';

export { SelfHostedProvider } from './providers/self-hosted.js';
export type { FetchLike, SelfHostedProviderOptions } from './providers/self-hosted.js';

export { ReplicateProvider } from './providers/replicate.js';
export type {
  ReplicateHttpClient,
  ReplicatePrediction,
  ReplicateProviderOptions,
} from './providers/replicate.js';

export { GoogleVtoProvider } from './providers/google-vto.js';
export type {
  GoogleVtoHttpClient,
  GoogleVtoPrediction,
  GoogleVtoResponse,
  GoogleVtoProviderOptions,
} from './providers/google-vto.js';

export {
  EngineRouter,
  routingFromConfigs,
  type EngineRouterOptions,
  type RouteOptions,
  type RouteOutcome,
} from './router.js';
export { orderCandidates } from './router_ordering.js';
export type { OrderedCandidate, ProviderRouting } from './router_ordering.js';
export {
  runWithTimeout,
  ProviderTimeoutError,
  SYSTEM_CLOCK,
  type RouterClock,
  type RunWithTimeoutOptions,
} from './router_timeout.js';

export { stableRequestHash, canonicalize, fnv1a32 } from './internal/stable_request_hash.js';
export { imageRefToInput } from './internal/image_ref_to_input.js';
export { validateProviderResult } from './internal/validate_provider_result.js';
