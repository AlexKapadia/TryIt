/**
 * Tests for candidate ordering: cost-asc primary, priority-asc secondary, id-asc tiebreak;
 * deny-by-default for non-allow-listed, unregistered, or routing-less providers; dedupe of a
 * repeated allow-list entry; and a property that the order is a total, deterministic sort.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { ProviderId } from '@tryit/contracts';
import { orderCandidates, type ProviderRouting } from './router_ordering.js';
import type { TryOnProvider } from './provider.js';

const ALL_IDS: ProviderId[] = ['fal', 'replicate', 'google-vto', 'self-hosted', 'deterministic'];

/** Minimal registry whose presence is all ordering cares about. */
function registry(ids: ProviderId[]): Map<ProviderId, TryOnProvider> {
  const map = new Map<ProviderId, TryOnProvider>();
  for (const id of ids) {
    map.set(id, { id, tryOn: async () => ({}) as never });
  }
  return map;
}

describe('orderCandidates', () => {
  it('orders by cost ascending, then priority ascending, then id', () => {
    const routing = new Map<ProviderId, ProviderRouting>([
      ['fal', { priority: 1, costPerCallUsd: 0.05 }],
      ['replicate', { priority: 1, costPerCallUsd: 0.02 }],
      ['self-hosted', { priority: 5, costPerCallUsd: 0.02 }],
      ['deterministic', { priority: 9, costPerCallUsd: 0 }],
    ]);
    const ordered = orderCandidates(
      ['fal', 'replicate', 'self-hosted', 'deterministic'],
      routing,
      registry(ALL_IDS),
    );
    // 0 (deterministic) < 0.02 (replicate prio1 < self-hosted prio5) < 0.05 (fal).
    expect(ordered.map((c) => c.id)).toEqual(['deterministic', 'replicate', 'self-hosted', 'fal']);
  });

  it('breaks an exact cost+priority tie by provider id ascending', () => {
    const routing = new Map<ProviderId, ProviderRouting>([
      ['replicate', { priority: 1, costPerCallUsd: 0.01 }],
      ['fal', { priority: 1, costPerCallUsd: 0.01 }],
    ]);
    const ordered = orderCandidates(['replicate', 'fal'], routing, registry(ALL_IDS));
    expect(ordered.map((c) => c.id)).toEqual(['fal', 'replicate']); // 'fal' < 'replicate'.
  });

  it('denies providers that are not allow-listed', () => {
    const routing = new Map<ProviderId, ProviderRouting>([
      ['fal', { priority: 1, costPerCallUsd: 0.05 }],
      ['replicate', { priority: 1, costPerCallUsd: 0.02 }],
    ]);
    const ordered = orderCandidates(['fal'], routing, registry(ALL_IDS));
    expect(ordered.map((c) => c.id)).toEqual(['fal']);
  });

  it('drops allow-listed providers with no routing metadata or no implementation', () => {
    const routing = new Map<ProviderId, ProviderRouting>([
      ['fal', { priority: 1, costPerCallUsd: 0.05 }],
      ['replicate', { priority: 1, costPerCallUsd: 0.02 }],
    ]);
    // 'replicate' has routing but no registered impl; 'google-vto' has impl but no routing.
    const ordered = orderCandidates(
      ['fal', 'replicate', 'google-vto'],
      routing,
      registry(['fal', 'google-vto']),
    );
    expect(ordered.map((c) => c.id)).toEqual(['fal']);
  });

  it('dedupes a repeated allow-list entry', () => {
    const routing = new Map<ProviderId, ProviderRouting>([
      ['fal', { priority: 1, costPerCallUsd: 0.05 }],
    ]);
    const ordered = orderCandidates(['fal', 'fal', 'fal'], routing, registry(['fal']));
    expect(ordered).toHaveLength(1);
  });

  it('produces a total deterministic order regardless of allow-list ordering (property)', () => {
    const routing = new Map<ProviderId, ProviderRouting>(
      ALL_IDS.map((id, i) => [id, { priority: i % 3, costPerCallUsd: (i % 2) * 0.01 }]),
    );
    const reg = registry(ALL_IDS);
    fc.assert(
      fc.property(fc.shuffledSubarray(ALL_IDS, { minLength: ALL_IDS.length }), (shuffled) => {
        const a = orderCandidates(shuffled, routing, reg).map((c) => c.id);
        const b = orderCandidates([...ALL_IDS], routing, reg).map((c) => c.id);
        // Same set in, identical sorted order out — order is independent of input order.
        expect([...a].sort()).toEqual([...b].sort());
        expect(a).toEqual(b);
      }),
    );
  });
});
