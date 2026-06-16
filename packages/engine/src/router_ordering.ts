/**
 * @tryit/engine/router_ordering — deterministic candidate ordering for the router.
 *
 * Turns a tenant's `allowedProviders` allow-list into the concrete, ordered list of provider
 * candidates the router will try. Ordering is by lowest `costPerCallUsd` first, then lowest
 * `priority` value (higher precedence), then provider id as a stable final tiebreak so the order
 * is fully deterministic. Only providers that are both allow-listed AND have routing metadata
 * AND have a registered implementation become candidates — deny-by-default everywhere.
 */

import type { ProviderId } from '@tryit/contracts';
import type { TryOnProvider } from './provider.js';

/** Routing metadata for one provider, independent of its implementation. */
export interface ProviderRouting {
  /** Lower value = higher precedence after cost. */
  readonly priority: number;
  /** Non-negative per-call cost in USD, the primary ordering key. */
  readonly costPerCallUsd: number;
  /** Optional per-provider timeout (ms); the router falls back to its default when absent. */
  readonly timeoutMs?: number | undefined;
}

/** A resolved, ordered candidate: its id plus the routing metadata used to order it. */
export interface OrderedCandidate extends ProviderRouting {
  readonly id: ProviderId;
}

/**
 * Order the tenant's allowed providers into the sequence the router should attempt.
 *
 * @param allowedProviders The tenant allow-list (deny-by-default; only these are eligible).
 * @param routing Per-provider routing metadata; a provider absent here is not a candidate.
 * @param registry Registered implementations; a provider with no implementation is dropped.
 * @returns Candidates sorted by cost asc, then priority asc, then id asc. May be empty.
 */
export function orderCandidates(
  allowedProviders: ReadonlyArray<ProviderId>,
  routing: ReadonlyMap<ProviderId, ProviderRouting>,
  registry: ReadonlyMap<ProviderId, TryOnProvider>,
): OrderedCandidate[] {
  // Dedupe the allow-list so a repeated entry cannot duplicate a candidate.
  const seen = new Set<ProviderId>();
  const candidates: OrderedCandidate[] = [];
  for (const id of allowedProviders) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const meta = routing.get(id);
    // deny-by-default: skip providers without routing metadata or a registered implementation.
    if (!meta || !registry.has(id)) {
      continue;
    }
    candidates.push({ id, ...meta });
  }
  candidates.sort(compareCandidates);
  return candidates;
}

/** Total, deterministic ordering: cost asc, then priority asc, then id asc. */
function compareCandidates(a: OrderedCandidate, b: OrderedCandidate): number {
  if (a.costPerCallUsd !== b.costPerCallUsd) {
    return a.costPerCallUsd - b.costPerCallUsd;
  }
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }
  // Stable final tiebreak so equal cost+priority never depends on input order.
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
