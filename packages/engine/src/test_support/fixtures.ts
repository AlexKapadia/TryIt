/**
 * @tryit/engine/test_support/fixtures — shared synthetic fixtures and fakes for engine tests.
 *
 * Provides validated synthetic {@link TryOnRequest} / {@link TenantConfig} builders plus a fake
 * clock, a controllable provider, and a no-network context — so every test injects its
 * dependencies and never touches the network, the environment, or real time. Synthetic only:
 * no real PII, secrets, or credentials appear here.
 */

import type {
  ProviderId,
  TenantConfig,
  TryOnRequest,
  TryOnResult,
} from '@tryit/contracts';
import type { EngineLogger, ProviderContext, TryOnProvider } from '../provider.js';
import type { RouterClock } from '../router_timeout.js';

/** Build a valid synthetic try-on request, overridable per field. */
export function makeRequest(overrides: Partial<TryOnRequest> = {}): TryOnRequest {
  return {
    tenantId: 'tenant-a',
    shopperId: 'shopper-1',
    personImage: { kind: 'url', url: 'https://cdn.example.com/person.jpg' },
    productId: 'sku-123',
    category: 'apparel',
    ...overrides,
  };
}

/** Build a valid synthetic tenant config, overridable per field. */
export function makeTenant(overrides: Partial<TenantConfig> = {}): TenantConfig {
  return {
    tenantId: 'tenant-a',
    allowedProviders: ['fal', 'deterministic'],
    rateLimit: { perShopperPerMinute: 10, perTenantPerMinute: 100 },
    monthlyBudgetUsd: 1000,
    retentionSeconds: 3600,
    killSwitch: false,
    ...overrides,
  };
}

/** A silent logger that records nothing — adequate for assertions that don't inspect logs. */
export const SILENT_LOGGER: EngineLogger = {
  debug: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** Build a {@link ProviderContext} with a fresh, never-aborted signal by default. */
export function makeContext(overrides: Partial<ProviderContext> = {}): ProviderContext {
  return {
    timeoutMs: 1000,
    signal: new AbortController().signal,
    logger: SILENT_LOGGER,
    ...overrides,
  };
}

/** A valid synthetic provider result for use as a fake's return value. */
export function makeResult(overrides: Partial<TryOnResult> = {}): TryOnResult {
  return {
    resultImageUrl: 'https://cdn.example.com/result.png',
    provider: 'fal',
    latencyMs: 0,
    cached: false,
    costUsd: 0,
    ...overrides,
  };
}

/** A provider whose behaviour (resolve/reject/hang) is fully controlled by the test. */
export class FakeProvider implements TryOnProvider {
  public calls = 0;
  public constructor(
    public readonly id: ProviderId,
    private readonly behaviour:
      | { kind: 'resolve'; result: TryOnResult }
      | { kind: 'reject'; error: Error }
      | { kind: 'hang' },
  ) {}

  public async tryOn(): Promise<TryOnResult> {
    this.calls += 1;
    if (this.behaviour.kind === 'resolve') {
      return this.behaviour.result;
    }
    if (this.behaviour.kind === 'reject') {
      throw this.behaviour.error;
    }
    // 'hang': never resolves on its own, forcing the timeout path to fire.
    return new Promise<TryOnResult>(() => undefined);
  }
}

/**
 * A fully manual clock: time advances only when the test calls {@link FakeClock.advance}, and
 * timers fire deterministically when their deadline is crossed. No real timers are scheduled.
 */
export class FakeClock implements RouterClock {
  private current = 0;
  private nextId = 1;
  private readonly timers = new Map<number, { fireAt: number; callback: () => void }>();

  public now(): number {
    return this.current;
  }

  public setTimer(callback: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.timers.set(id, { fireAt: this.current + ms, callback });
    return id;
  }

  public clearTimer(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  /** Advance time by `ms`, firing any timers whose deadline is now reached, in order. */
  public advance(ms: number): void {
    this.current += ms;
    const due = [...this.timers.entries()]
      .filter(([, timer]) => timer.fireAt <= this.current)
      .sort((a, b) => a[1].fireAt - b[1].fireAt);
    for (const [id, timer] of due) {
      this.timers.delete(id);
      timer.callback();
    }
  }

  /** Number of timers still pending — used to assert cleanup happened. */
  public pendingTimers(): number {
    return this.timers.size;
  }
}
