/**
 * @tryit/api/_lib/provider-registry — assemble the engine's provider registry + routing.
 *
 * Builds the map of {@link TryOnProvider} implementations the {@link EngineRouter} routes over,
 * plus the parallel routing metadata (priority/cost/timeout) keyed by provider id. The
 * {@link DeterministicProvider} is ALWAYS registered as the guaranteed, offline, never-failing
 * terminal fallback, so the API answers fully without any external credential. The networked
 * providers are registered conditionally and fail-closed: FalProvider only when `FAL_KEY` is
 * present, SelfHostedProvider only when `TRYIT_INFERENCE_URL` is set. A missing credential means
 * the provider simply is not a candidate — it is never half-wired.
 */

import {
  DeterministicProvider,
  FalProvider,
  SelfHostedProvider,
  type TryOnProvider,
  type ProviderRouting,
} from '@tryit/engine';
import { type ProviderId } from '@tryit/contracts';

/** The provider registry plus its routing metadata, ready for {@link EngineRouter}. */
export interface BuiltRegistry {
  readonly registry: ReadonlyMap<ProviderId, TryOnProvider>;
  readonly routing: ReadonlyMap<ProviderId, ProviderRouting>;
}

/** Minimal environment surface this builder reads. Injected so tests stay env-independent. */
export interface ProviderEnv {
  readonly FAL_KEY?: string | undefined;
  readonly TRYIT_INFERENCE_URL?: string | undefined;
}

/**
 * Build the registry from the environment.
 *
 * Routing priority orders networked providers ahead of the deterministic fallback (lower
 * number = preferred) so a real provider is tried first when configured, with deterministic as
 * the always-present last resort. Costs are nominal placeholders for budget accounting; the
 * deterministic fallback costs nothing because it makes no external call.
 */
export function buildProviderRegistry(env: ProviderEnv = process.env as ProviderEnv): BuiltRegistry {
  const registry = new Map<ProviderId, TryOnProvider>();
  const routing = new Map<ProviderId, ProviderRouting>();

  // Always-on, offline, never-fails terminal fallback. Registered first and unconditionally.
  registry.set('deterministic', new DeterministicProvider());
  routing.set('deterministic', { priority: 100, costPerCallUsd: 0, timeoutMs: 5_000 });

  // fail-closed: only wire fal when its credential exists; otherwise it is not a candidate.
  if (env.FAL_KEY) {
    registry.set('fal', new FalProvider({ costPerCallUsd: 0.04 }));
    routing.set('fal', { priority: 10, costPerCallUsd: 0.04, timeoutMs: 30_000 });
  }

  // fail-closed: only wire self-hosted when its endpoint is configured.
  if (env.TRYIT_INFERENCE_URL) {
    registry.set(
      'self-hosted',
      new SelfHostedProvider({
        baseUrl: env.TRYIT_INFERENCE_URL,
        // No global fetch is used implicitly; bind the platform fetch explicitly here.
        fetchImpl: (input, init) => fetch(input, init as RequestInit),
        costPerCallUsd: 0.01,
      }),
    );
    routing.set('self-hosted', { priority: 20, costPerCallUsd: 0.01, timeoutMs: 30_000 });
  }

  return { registry, routing };
}
