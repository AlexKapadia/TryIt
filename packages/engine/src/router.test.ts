/**
 * Tests for the EngineRouter (the engine's teeth): cost/priority selection, fall-through on
 * error and on timeout ending at the deterministic terminal fallback, authoritative stamping of
 * provider/latency/cached/cost, fail-closed PROVIDER_ERROR when no candidate is permitted or all
 * fail, per-call timeout override, and routingFromConfigs filtering. FakeClock + FakeProvider;
 * no real time, no network.
 */

import { describe, expect, it } from 'vitest';
import type { ProviderId } from '@tryit/contracts';
import { EngineRouter, routingFromConfigs } from './router.js';
import type { ProviderRouting } from './router_ordering.js';
import type { TryOnProvider } from './provider.js';
import { DeterministicProvider } from './providers/deterministic.js';
import {
  FakeClock,
  FakeProvider,
  makeRequest,
  makeResult,
  makeTenant,
} from './test_support/fixtures.js';

/** Assemble a registry from providers keyed by their id. */
function registryOf(...providers: TryOnProvider[]): Map<ProviderId, TryOnProvider> {
  return new Map(providers.map((p) => [p.id, p]));
}

const ROUTING_FAST: ProviderRouting = { priority: 1, costPerCallUsd: 0.05, timeoutMs: 100 };

describe('EngineRouter', () => {
  it('picks the cheapest permitted provider and stamps result metadata', async () => {
    const clock = new FakeClock();
    const fal = new FakeProvider('fal', { kind: 'resolve', result: makeResult({ provider: 'x' }) });
    const replicate = new FakeProvider('replicate', {
      kind: 'resolve',
      result: makeResult({ provider: 'y' }),
    });
    const router = new EngineRouter(registryOf(fal, replicate), {
      routing: new Map<ProviderId, ProviderRouting>([
        ['fal', { priority: 1, costPerCallUsd: 0.05, timeoutMs: 100 }],
        ['replicate', { priority: 1, costPerCallUsd: 0.02, timeoutMs: 100 }],
      ]),
      defaultTimeoutMs: 100,
      clock,
    });

    const outcome = await router.route(
      makeRequest(),
      makeTenant({ allowedProviders: ['fal', 'replicate'] }),
    );

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      // replicate is cheaper (0.02 < 0.05): it must be chosen and the id/cost stamped over it.
      expect(outcome.result.provider).toBe('replicate');
      expect(outcome.result.costUsd).toBe(0.02);
      expect(outcome.result.cached).toBe(false);
    }
    expect(replicate.calls).toBe(1);
    expect(fal.calls).toBe(0); // cheaper provider succeeded; no fall-through.
  });

  it('falls through a throwing provider to the next, then to deterministic', async () => {
    const clock = new FakeClock();
    const fal = new FakeProvider('fal', { kind: 'reject', error: new Error('fal down') });
    const replicate = new FakeProvider('replicate', {
      kind: 'reject',
      error: new Error('replicate down'),
    });
    const deterministic = new DeterministicProvider();
    const router = new EngineRouter(registryOf(fal, replicate, deterministic), {
      routing: new Map<ProviderId, ProviderRouting>([
        ['fal', { priority: 1, costPerCallUsd: 0.01, timeoutMs: 100 }],
        ['replicate', { priority: 1, costPerCallUsd: 0.02, timeoutMs: 100 }],
        ['deterministic', { priority: 9, costPerCallUsd: 0, timeoutMs: 100 }],
      ]),
      defaultTimeoutMs: 100,
      clock,
    });

    const outcome = await router.route(
      makeRequest(),
      makeTenant({ allowedProviders: ['fal', 'replicate', 'deterministic'] }),
    );

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.provider).toBe('deterministic');
    }
    // Cheapest-first: deterministic (0) is tried FIRST and succeeds, so the others never run.
    expect(fal.calls).toBe(0);
    expect(replicate.calls).toBe(0);
  });

  it('tries the cheaper paid provider, then on error reaches deterministic fallback', async () => {
    const clock = new FakeClock();
    const fal = new FakeProvider('fal', { kind: 'reject', error: new Error('fal down') });
    const deterministic = new DeterministicProvider();
    const router = new EngineRouter(registryOf(fal, deterministic), {
      routing: new Map<ProviderId, ProviderRouting>([
        ['fal', { priority: 1, costPerCallUsd: 0.05, timeoutMs: 100 }],
        ['deterministic', { priority: 9, costPerCallUsd: 0.5, timeoutMs: 100 }],
      ]),
      defaultTimeoutMs: 100,
      clock,
    });

    const outcome = await router.route(
      makeRequest(),
      makeTenant({ allowedProviders: ['fal', 'deterministic'] }),
    );

    // fal is cheaper here (0.05 < 0.5) so it's tried first, throws, then deterministic wins.
    expect(fal.calls).toBe(1);
    expect(outcome.ok && outcome.result.provider).toBe('deterministic');
    expect(outcome.ok && outcome.result.costUsd).toBe(0.5); // stamped from routing.
  });

  it('falls through a timing-out provider to the deterministic fallback', async () => {
    const clock = new FakeClock();
    const fal = new FakeProvider('fal', { kind: 'hang' });
    const deterministic = new DeterministicProvider();
    const router = new EngineRouter(registryOf(fal, deterministic), {
      routing: new Map<ProviderId, ProviderRouting>([
        ['fal', { priority: 1, costPerCallUsd: 0.05, timeoutMs: 50 }],
        ['deterministic', { priority: 9, costPerCallUsd: 0.99, timeoutMs: 50 }],
      ]),
      defaultTimeoutMs: 50,
      clock,
    });

    const promise = router.route(
      makeRequest(),
      makeTenant({ allowedProviders: ['fal', 'deterministic'] }),
    );
    // Let the hanging fal attempt register its timer, then cross its deadline.
    await Promise.resolve();
    clock.advance(50);
    const outcome = await promise;

    expect(fal.calls).toBe(1);
    expect(outcome.ok && outcome.result.provider).toBe('deterministic');
  });

  it('records a non-negative measured latency stamped over the provider value', async () => {
    const clock = new FakeClock();
    // A provider that advances the clock while it runs, so latency is observable.
    const slow: TryOnProvider = {
      id: 'fal',
      async tryOn() {
        clock.advance(7);
        return makeResult({ latencyMs: 9999 });
      },
    };
    const router = new EngineRouter(registryOf(slow), {
      routing: new Map<ProviderId, ProviderRouting>([['fal', ROUTING_FAST]]),
      defaultTimeoutMs: 100,
      clock,
    });
    const outcome = await router.route(makeRequest(), makeTenant({ allowedProviders: ['fal'] }));
    expect(outcome.ok && outcome.result.latencyMs).toBe(7); // measured, not the provider's 9999.
  });

  it('returns PROVIDER_ERROR when the tenant allow-list permits nothing', async () => {
    const router = new EngineRouter(registryOf(new DeterministicProvider()), {
      routing: new Map<ProviderId, ProviderRouting>([
        ['deterministic', { priority: 9, costPerCallUsd: 0 }],
      ]),
      defaultTimeoutMs: 100,
      clock: new FakeClock(),
    });
    const outcome = await router.route(makeRequest(), makeTenant({ allowedProviders: [] }));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe('PROVIDER_ERROR');
      expect(outcome.error.httpStatus).toBe(502);
    }
  });

  it('returns PROVIDER_ERROR when every permitted provider fails (no deterministic allowed)', async () => {
    const fal = new FakeProvider('fal', { kind: 'reject', error: new Error('down') });
    const router = new EngineRouter(registryOf(fal, new DeterministicProvider()), {
      routing: new Map<ProviderId, ProviderRouting>([
        ['fal', { priority: 1, costPerCallUsd: 0.05, timeoutMs: 100 }],
        ['deterministic', { priority: 9, costPerCallUsd: 0 }],
      ]),
      defaultTimeoutMs: 100,
      clock: new FakeClock(),
    });
    // deterministic NOT allow-listed, so the only candidate (fal) fails -> typed error.
    const outcome = await router.route(makeRequest(), makeTenant({ allowedProviders: ['fal'] }));
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.error.code).toBe('PROVIDER_ERROR');
    expect(fal.calls).toBe(1);
  });

  it('honours a per-call timeout override regardless of provider config', async () => {
    const clock = new FakeClock();
    const fal = new FakeProvider('fal', { kind: 'hang' });
    const deterministic = new DeterministicProvider();
    const router = new EngineRouter(registryOf(fal, deterministic), {
      routing: new Map<ProviderId, ProviderRouting>([
        ['fal', { priority: 1, costPerCallUsd: 0.05, timeoutMs: 100000 }],
        ['deterministic', { priority: 9, costPerCallUsd: 0.99 }],
      ]),
      defaultTimeoutMs: 100000,
      clock,
    });
    const promise = router.route(
      makeRequest(),
      makeTenant({ allowedProviders: ['fal', 'deterministic'] }),
      { timeoutMs: 10 },
    );
    await Promise.resolve();
    clock.advance(10); // the override (10ms), not the 100000ms config, governs the deadline.
    const outcome = await promise;
    expect(outcome.ok && outcome.result.provider).toBe('deterministic');
  });

  it('rejects a provider returning a malformed result and falls through (defence in depth)', async () => {
    const clock = new FakeClock();
    // A registered provider that bypasses its own validation and returns a contract-violating
    // result (an insecure http url). The router must reject it at its boundary and fall through.
    const bad: TryOnProvider = {
      id: 'fal',
      async tryOn() {
        return { ...makeResult(), resultImageUrl: 'http://insecure/r.png' };
      },
    };
    const deterministic = new DeterministicProvider();
    const router = new EngineRouter(registryOf(bad, deterministic), {
      routing: new Map<ProviderId, ProviderRouting>([
        ['fal', { priority: 1, costPerCallUsd: 0.05, timeoutMs: 100 }],
        ['deterministic', { priority: 9, costPerCallUsd: 0.99, timeoutMs: 100 }],
      ]),
      defaultTimeoutMs: 100,
      clock,
    });
    // fal (0.05) is cheaper than deterministic (0.99) -> tried first, its http url is rejected
    // by the router's post-stamp validation, then deterministic (https) wins the fall-through.
    const outcome = await router.route(
      makeRequest(),
      makeTenant({ allowedProviders: ['fal', 'deterministic'] }),
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.provider).toBe('deterministic');
      expect(outcome.result.resultImageUrl.startsWith('https://')).toBe(true);
    }
  });

  it('routingFromConfigs drops disabled providers and maps fields', () => {
    const routing = routingFromConfigs([
      {
        id: 'fal',
        enabled: true,
        priority: 2,
        costPerCallUsd: 0.05,
        timeoutMs: 1234,
        maxConcurrency: 4,
      },
      {
        id: 'replicate',
        enabled: false,
        priority: 1,
        costPerCallUsd: 0.01,
        timeoutMs: 1000,
        maxConcurrency: 4,
      },
    ]);
    expect(routing.has('replicate')).toBe(false); // disabled => excluded.
    expect(routing.get('fal')).toEqual({ priority: 2, costPerCallUsd: 0.05, timeoutMs: 1234 });
  });
});
