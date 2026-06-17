/**
 * Mutation-hardening tests for the router's structured logging and fail-closed error messages.
 * The happy-path suite asserted outcomes but never inspected the emitted log events or the exact
 * ApiError messages, leaving these survivors alive:
 *  - L112/L115/L118 the empty-allow-list path: the `length === 0` guard, the `router.noCandidates`
 *    warn event + tenantId payload, and the exact 'no provider is permitted...' message.
 *  - L153 the `router:<id>` validation label, surfaced in the providerFailed `reason`.
 *  - L156/L158 the per-candidate catch body: the `router.providerFailed` warn event + payload.
 *  - L168 the `router.allFailed` error event + payload.
 *  - L174 the exact 'all permitted providers failed' message.
 */
import { describe, expect, it } from 'vitest';
import type { ProviderId } from '@tryit/contracts';
import { EngineRouter } from './router.js';
import type { ProviderRouting } from './router_ordering.js';
import type { EngineLogger, TryOnProvider } from './provider.js';
import { DeterministicProvider } from './providers/deterministic.js';
import { FakeClock, FakeProvider, makeRequest, makeResult, makeTenant } from './test_support/fixtures.js';

function registryOf(...providers: TryOnProvider[]): Map<ProviderId, TryOnProvider> {
  return new Map(providers.map((p) => [p.id, p]));
}

interface LogCall {
  level: 'debug' | 'warn' | 'error';
  event: string;
  fields: Record<string, unknown> | undefined;
}

function recordingLogger(): EngineLogger & { calls: LogCall[] } {
  const calls: LogCall[] = [];
  return {
    calls,
    debug: (event, fields) => calls.push({ level: 'debug', event, fields }),
    warn: (event, fields) => calls.push({ level: 'warn', event, fields }),
    error: (event, fields) => calls.push({ level: 'error', event, fields }),
  };
}

describe('EngineRouter logging — empty allow-list (mutation-hardening)', () => {
  it('warns router.noCandidates with tenantId and returns the exact fail-closed message', async () => {
    const logger = recordingLogger();
    const router = new EngineRouter(registryOf(new DeterministicProvider()), {
      routing: new Map<ProviderId, ProviderRouting>([
        ['deterministic', { priority: 1, costPerCallUsd: 0 }],
      ]),
      defaultTimeoutMs: 100,
      clock: new FakeClock(),
      logger,
    });
    // Empty allow-list -> the `length === 0` guard fires (kills the conditional->false mutant).
    const outcome = await router.route(makeRequest(), makeTenant({ tenantId: 'tnt-1', allowedProviders: [] }));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe('PROVIDER_ERROR');
      // Exact message kills the StringLiteral->'' mutant on the makeApiError argument.
      expect(outcome.error.message).toBe('no provider is permitted for this tenant');
    }
    // The exact warn event + payload kills the event/payload mutants.
    expect(logger.calls).toContainEqual({
      level: 'warn',
      event: 'router.noCandidates',
      fields: { tenantId: 'tnt-1' },
    });
  });
});

describe('EngineRouter logging — per-provider failure (mutation-hardening)', () => {
  it('warns router.providerFailed with provider, tenantId and the router:<id> validation reason', async () => {
    const logger = recordingLogger();
    // A provider that bypasses its own validation and returns a contract-violating (http) url.
    // The router's post-stamp validation rejects it; the thrown message carries the `router:fal`
    // label, which must appear in the warn `reason` (kills the L153 label-blank mutant).
    const bad: TryOnProvider = {
      id: 'fal',
      async tryOn() {
        return { ...makeResult(), resultImageUrl: 'http://insecure/r.png' };
      },
    };
    const deterministic = new DeterministicProvider();
    const router = new EngineRouter(registryOf(bad, deterministic), {
      routing: new Map<ProviderId, ProviderRouting>([
        ['fal', { priority: 1, costPerCallUsd: 0.05 }],
        ['deterministic', { priority: 9, costPerCallUsd: 0.99 }],
      ]),
      defaultTimeoutMs: 100,
      clock: new FakeClock(),
      logger,
    });

    const outcome = await router.route(
      makeRequest({ tenantId: 'tnt-2' }),
      makeTenant({ tenantId: 'tnt-2', allowedProviders: ['fal', 'deterministic'] }),
    );
    expect(outcome.ok).toBe(true); // falls through to deterministic.

    const warned = logger.calls.find((c) => c.event === 'router.providerFailed');
    expect(warned).toBeDefined();
    expect(warned?.level).toBe('warn');
    expect(warned?.fields?.['provider']).toBe('fal');
    expect(warned?.fields?.['tenantId']).toBe('tnt-2');
    // The reason is the thrown validation error, prefixed with the `router:fal` label.
    expect(String(warned?.fields?.['reason'])).toContain('router:fal');
  });
});

describe('EngineRouter logging — all providers failed (mutation-hardening)', () => {
  it('errors router.allFailed with tenantId + reason and returns the exact message', async () => {
    const logger = recordingLogger();
    // Only a throwing provider is permitted; deterministic is NOT allow-listed, so the router
    // exhausts all candidates and reaches the terminal fail-closed branch.
    const boom = new FakeProvider('fal', { kind: 'reject', error: new Error('upstream-503') });
    const router = new EngineRouter(registryOf(boom, new DeterministicProvider()), {
      routing: new Map<ProviderId, ProviderRouting>([
        ['fal', { priority: 1, costPerCallUsd: 0.05 }],
      ]),
      defaultTimeoutMs: 100,
      clock: new FakeClock(),
      logger,
    });

    const outcome = await router.route(
      makeRequest({ tenantId: 'tnt-3' }),
      makeTenant({ tenantId: 'tnt-3', allowedProviders: ['fal'] }),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      // Exact message kills the StringLiteral->'' mutant on the terminal makeApiError argument.
      expect(outcome.error.message).toBe('all permitted providers failed');
    }

    const errored = logger.calls.find((c) => c.event === 'router.allFailed');
    expect(errored).toBeDefined();
    expect(errored?.level).toBe('error');
    expect(errored?.fields?.['tenantId']).toBe('tnt-3');
    // The last error's message is threaded into the reason (kills the emptied-payload mutant).
    expect(String(errored?.fields?.['reason'])).toContain('upstream-503');
  });
});
