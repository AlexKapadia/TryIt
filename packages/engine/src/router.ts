/**
 * @tryit/engine/router — deterministic, fail-closed provider routing.
 *
 * Given a {@link TenantConfig} (its `allowedProviders` allow-list plus per-provider priority and
 * cost) the router orders candidate providers cheapest/highest-priority first, then tries each
 * in turn. On any error or per-call timeout it falls through to the next candidate, with the
 * {@link DeterministicProvider} as the guaranteed terminal fallback so the engine never hard
 * fails. The chosen result is stamped with the real provider id, measured `latencyMs`,
 * `cached: false`, and the provider's `costUsd`. Only if even the deterministic fallback is
 * excluded does the router return a typed {@link ApiError} (`PROVIDER_ERROR`) — fail-closed.
 *
 * All time and cancellation are injectable (clock + AbortController factory) so the timeout and
 * latency paths are fully deterministic and network-free under test.
 */

import {
  makeApiError,
  type ApiError,
  type ProviderConfig,
  type ProviderId,
  type TenantConfig,
  type TryOnRequest,
  type TryOnResult,
} from '@tryit/contracts';
import { type EngineLogger, NOOP_LOGGER, type TryOnProvider } from './provider.js';
import { orderCandidates, type ProviderRouting } from './router_ordering.js';
import { runWithTimeout, type RouterClock, SYSTEM_CLOCK } from './router_timeout.js';
import { validateProviderResult } from './internal/validate_provider_result.js';

/** A discriminated result: either a stamped {@link TryOnResult} or a typed {@link ApiError}. */
export type RouteOutcome =
  | { readonly ok: true; readonly result: TryOnResult }
  | { readonly ok: false; readonly error: ApiError };

/** Construction options for the router. */
export interface EngineRouterOptions {
  /** Per-provider routing metadata (priority + cost), keyed by provider id. */
  readonly routing: ReadonlyMap<ProviderId, ProviderRouting>;
  /** Default per-call timeout (ms) when a call does not specify one. Always >= 1. */
  readonly defaultTimeoutMs: number;
  /** Injectable clock for measuring latency and scheduling timeouts. Defaults to wall clock. */
  readonly clock?: RouterClock | undefined;
  /** Factory for the per-attempt AbortController; injectable for deterministic tests. */
  readonly abortControllerFactory?: (() => AbortController) | undefined;
  /** Structured logger; defaults to a no-op. */
  readonly logger?: EngineLogger | undefined;
}

/** Per-call overrides accepted by {@link EngineRouter.route}. */
export interface RouteOptions {
  /** Override the per-call timeout budget (ms). Falls back to the router default. */
  readonly timeoutMs?: number | undefined;
  /** Caller cancellation signal; when aborted, in-flight and pending attempts stop. */
  readonly signal?: AbortSignal | undefined;
}

/** Build a {@link ProviderRouting} map from an array of {@link ProviderConfig}. */
export function routingFromConfigs(
  configs: ReadonlyArray<ProviderConfig>,
): Map<ProviderId, ProviderRouting> {
  const map = new Map<ProviderId, ProviderRouting>();
  for (const config of configs) {
    if (!config.enabled) {
      continue; // disabled providers are never routing candidates.
    }
    map.set(config.id, {
      priority: config.priority,
      costPerCallUsd: config.costPerCallUsd,
      timeoutMs: config.timeoutMs,
    });
  }
  return map;
}

/**
 * The engine router. It owns a registry of provider implementations and the routing metadata,
 * and selects/falls-through per request against a tenant's policy.
 */
export class EngineRouter {
  private readonly registry: ReadonlyMap<ProviderId, TryOnProvider>;
  private readonly routing: ReadonlyMap<ProviderId, ProviderRouting>;
  private readonly defaultTimeoutMs: number;
  private readonly clock: RouterClock;
  private readonly abortControllerFactory: () => AbortController;
  private readonly logger: EngineLogger;

  public constructor(
    registry: ReadonlyMap<ProviderId, TryOnProvider>,
    options: EngineRouterOptions,
  ) {
    this.registry = registry;
    this.routing = options.routing;
    this.defaultTimeoutMs = options.defaultTimeoutMs;
    this.clock = options.clock ?? SYSTEM_CLOCK;
    this.abortControllerFactory = options.abortControllerFactory ?? (() => new AbortController());
    this.logger = options.logger ?? NOOP_LOGGER;
  }

  /**
   * Route a request through the tenant's allowed providers, cheapest/highest-priority first,
   * falling through on error/timeout and ending at the deterministic fallback.
   *
   * @returns `{ ok: true, result }` with the result stamped, or `{ ok: false, error }` with a
   *   `PROVIDER_ERROR` only when no candidate (not even deterministic) is permitted/usable.
   */
  public async route(
    req: TryOnRequest,
    tenant: TenantConfig,
    options: RouteOptions = {},
  ): Promise<RouteOutcome> {
    const candidates = orderCandidates(tenant.allowedProviders, this.routing, this.registry);
    if (candidates.length === 0) {
      // fail-closed: an empty allow-list (or no registered candidate) yields a typed error,
      // never a silent success. The deterministic fallback only applies when it is allow-listed.
      this.logger.warn('router.noCandidates', { tenantId: tenant.tenantId });
      return {
        ok: false,
        error: makeApiError('PROVIDER_ERROR', 'no provider is permitted for this tenant'),
      };
    }

    let lastError: unknown;
    for (const candidate of candidates) {
      // orderCandidates guarantees every candidate has a registered implementation, so the
      // non-null assertion is sound; deny-by-default filtering already dropped the rest.
      const provider = this.registry.get(candidate.id)!;
      const timeoutMs = this.resolveTimeout(candidate, options.timeoutMs);
      const started = this.clock.now();
      try {
        const result = await runWithTimeout(
          (signal) => provider.tryOn(req, { timeoutMs, signal, logger: this.logger }),
          {
            timeoutMs,
            clock: this.clock,
            callerSignal: options.signal,
            controller: this.abortControllerFactory(),
            providerLabel: candidate.id,
          },
        );
        const latencyMs = Math.max(0, this.clock.now() - started);
        // Stamp authoritative routing metadata over whatever the provider returned, then
        // re-validate at the router boundary (defence in depth): a provider that bypassed its
        // own validation and returned a contract-violating result (e.g. a non-https url) is
        // rejected here too and the router falls through rather than surfacing it. fail-closed.
        const stamped = validateProviderResult(
          {
            ...result,
            provider: candidate.id,
            latencyMs,
            cached: false,
            costUsd: candidate.costPerCallUsd,
          },
          `router:${candidate.id}`,
        );
        return { ok: true, result: stamped };
      } catch (error) {
        lastError = error;
        this.logger.warn('router.providerFailed', {
          provider: candidate.id,
          tenantId: tenant.tenantId,
          reason: error instanceof Error ? error.message : String(error),
        });
        // fall through to the next candidate.
      }
    }

    // Every candidate (including any deterministic fallback) failed.
    this.logger.error('router.allFailed', {
      tenantId: tenant.tenantId,
      reason: lastError instanceof Error ? lastError.message : String(lastError),
    });
    return {
      ok: false,
      error: makeApiError('PROVIDER_ERROR', 'all permitted providers failed'),
    };
  }

  /** Resolve the effective timeout: per-call override, else provider config, else default. */
  private resolveTimeout(candidate: ProviderRouting, callTimeoutMs: number | undefined): number {
    if (callTimeoutMs !== undefined) {
      return callTimeoutMs;
    }
    return candidate.timeoutMs ?? this.defaultTimeoutMs;
  }
}
