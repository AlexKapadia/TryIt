/**
 * Mutation-hardening tests for the deterministic tiebreak chain in router_ordering.ts.
 *
 * The existing suite covered the *combined* ordering, leaving two secondary-key mutants alive:
 *  - line 66 (`if (a.priority !== b.priority) return a.priority - b.priority`): emptying this
 *    block / forcing the condition false breaks PRIORITY ordering when cost is tied.
 *  - line 70 (`a.id < b.id ? -1 : a.id > b.id ? 1 : 0`): flipping the comparator breaks the
 *    ID tiebreak when BOTH cost and priority are tied.
 * These tests isolate each secondary key so the relevant mutant changes the observed order.
 */
import { describe, expect, it } from 'vitest';
import type { ProviderId } from '@tryit/contracts';
import { orderCandidates, type ProviderRouting } from './router_ordering.js';
import type { TryOnProvider } from './provider.js';

function registry(ids: ProviderId[]): Map<ProviderId, TryOnProvider> {
  return new Map(ids.map((id) => [id, { id, tryOn: async () => ({}) as never }]));
}

describe('orderCandidates — priority tiebreak (cost tied)', () => {
  it('orders by priority ASC when cost is identical (kills the priority-branch mutant)', () => {
    // Identical cost forces the comparator past the cost key; ONLY priority can decide.
    // 'fal' has the WORSE (higher) priority than 'replicate', so input-order 'fal' first must
    // still be reordered to put the lower-priority-number provider first.
    const routing = new Map<ProviderId, ProviderRouting>([
      ['fal', { priority: 9, costPerCallUsd: 0.02 }],
      ['replicate', { priority: 1, costPerCallUsd: 0.02 }],
    ]);
    const ordered = orderCandidates(['fal', 'replicate'], routing, registry(['fal', 'replicate']));
    expect(ordered.map((c) => c.id)).toEqual(['replicate', 'fal']);
  });

  it('reverses correctly when the lower-priority provider is listed first', () => {
    const routing = new Map<ProviderId, ProviderRouting>([
      ['replicate', { priority: 9, costPerCallUsd: 0.02 }],
      ['fal', { priority: 1, costPerCallUsd: 0.02 }],
    ]);
    const ordered = orderCandidates(['replicate', 'fal'], routing, registry(['replicate', 'fal']));
    expect(ordered.map((c) => c.id)).toEqual(['fal', 'replicate']);
  });
});

describe('orderCandidates — id tiebreak (cost AND priority tied)', () => {
  it('orders by id ASC when cost and priority are both identical (kills the id-comparator mutant)', () => {
    // 'google-vto' < 'self-hosted' lexicographically. Listed in the OPPOSITE order so a broken
    // comparator (>=, <=, or a constant) would leave them in input order and fail this assertion.
    const routing = new Map<ProviderId, ProviderRouting>([
      ['self-hosted', { priority: 3, costPerCallUsd: 0.04 }],
      ['google-vto', { priority: 3, costPerCallUsd: 0.04 }],
    ]);
    const ordered = orderCandidates(
      ['self-hosted', 'google-vto'],
      routing,
      registry(['self-hosted', 'google-vto']),
    );
    expect(ordered.map((c) => c.id)).toEqual(['google-vto', 'self-hosted']);
  });
});
