/**
 * Mutation-hardening tests for the router's correctness-critical arithmetic and timeout resolution.
 *
 * Targets two survivors the existing suite missed:
 *  - router.ts:140 (`Math.max(0, this.clock.now() - started)`): a `-`->`+` mutant on the latency
 *    computation survived because no test pinned an EXACT non-zero latency. We drive a stepping
 *    clock and assert the precise elapsed value, so `+` (which yields a wrong large number) dies.
 *  - router.ts:183 (`candidate.timeoutMs ?? this.defaultTimeoutMs`): a `??`->`&&` mutant survived
 *    because no test proved the per-provider timeout is preferred over the default. We give the
 *    provider a SHORT timeout and a LONG default, then assert the short one fires.
 */
import { describe, expect, it } from 'vitest';
import type { ProviderId } from '@tryit/contracts';
import { EngineRouter } from './router.js';
import type { ProviderRouting } from './router_ordering.js';
import type { TryOnProvider } from './provider.js';
import type { RouterClock } from './router_timeout.js';
import { FakeClock, FakeProvider, makeRequest, makeResult, makeTenant } from './test_support/fixtures.js';

function registryOf(...providers: TryOnProvider[]): Map<ProviderId, TryOnProvider> {
  return new Map(providers.map((p) => [p.id, p]));
}

describe('EngineRouter — latency arithmetic (mutation-hardening)', () => {
  it('stamps latencyMs as (now - started), an exact positive elapsed value', async () => {
    // A clock that returns `started` on the first now() and started+250 on the second.
    let calls = 0;
    const STEP = 250;
    const clock: RouterClock = {
      now: () => (calls++ === 0 ? 1000 : 1000 + STEP),
      setTimer: () => 0,
      clearTimer: () => undefined,
    };
    const fal = new FakeProvider('fal', { kind: 'resolve', result: makeResult({ provider: 'x' }) });
    const router = new EngineRouter(registryOf(fal), {
      routing: new Map<ProviderId, ProviderRouting>([
        ['fal', { priority: 1, costPerCallUsd: 0.05, timeoutMs: 100 }],
      ]),
      defaultTimeoutMs: 100,
      clock,
    });

    const outcome = await router.route(makeRequest(), makeTenant({ allowedProviders: ['fal'] }));
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      // now - started = 250. A `+` mutant would yield 1000 + 1250 = 2250 (≠ 250). Exact-kill.
      expect(outcome.result.latencyMs).toBe(STEP);
    }
  });
});

describe('EngineRouter — per-provider timeout preferred over default (mutation-hardening)', () => {
  it('uses the candidate.timeoutMs (short) and times out before the long default would', async () => {
    const clock = new FakeClock();
    // A provider that hangs forever: only a timeout can end the attempt.
    const hanging = new FakeProvider('fal', { kind: 'hang' });
    const router = new EngineRouter(registryOf(hanging), {
      routing: new Map<ProviderId, ProviderRouting>([
        // SHORT per-provider timeout; LONG default. `??` must pick 50; `&&` would pick the default.
        ['fal', { priority: 1, costPerCallUsd: 0.05, timeoutMs: 50 }],
      ]),
      defaultTimeoutMs: 100_000,
      clock,
    });

    const outcome = router.route(makeRequest(), makeTenant({ allowedProviders: ['fal'] }));
    // Advance past the SHORT 50ms deadline but well short of the long default.
    clock.advance(50);
    const resolved = await outcome;
    // The only candidate hung and was timed out, so the router reports a fail-closed error.
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.error.code).toBe('PROVIDER_ERROR');
    }
    expect(hanging.calls).toBe(1);
  });

  it('does NOT time out at the short deadline when default is short and used (control)', async () => {
    // Control: with no per-provider timeout, the default governs. Advancing only 50ms must NOT
    // fire a 100ms default deadline — proving the 50ms kill above came from candidate.timeoutMs.
    const clock = new FakeClock();
    const hanging = new FakeProvider('fal', { kind: 'hang' });
    const router = new EngineRouter(registryOf(hanging), {
      routing: new Map<ProviderId, ProviderRouting>([
        ['fal', { priority: 1, costPerCallUsd: 0.05 }],
      ]),
      defaultTimeoutMs: 100,
      clock,
    });
    let settled = false;
    const p = router.route(makeRequest(), makeTenant({ allowedProviders: ['fal'] })).then((o) => {
      settled = true;
      return o;
    });
    clock.advance(50); // before the 100ms default deadline
    await Promise.resolve();
    expect(settled).toBe(false); // still pending — default timeout has not fired
    clock.advance(50); // now at 100ms — default deadline fires
    await p;
    expect(settled).toBe(true);
  });
});
