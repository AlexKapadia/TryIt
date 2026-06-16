/**
 * @tryit/api/_lib/runtime — process-singleton wiring for the API.
 *
 * Holds the long-lived collaborators the request pipeline shares: the tenant store, the rate
 * limiter, the result cache, the audit sink, the in-memory jobs store, and the engine router.
 * These are constructed once per process (lazily, behind a single accessor) so every request
 * sees the same rate-limit counters, cache, and audit trail. A test-only reset swaps in a fresh
 * runtime so each test starts from clean state.
 *
 * Kill switch: {@link isKillSwitchEngaged} is the single fail-closed gate combining the global
 * `TRYIT_KILL_SWITCH==='1'` env flag with a tenant's own `killSwitch`. Either being set halts
 * the tenant's external calls.
 */

import { RateLimiter, InMemoryRateLimitStore, InMemoryAuditSink, type AuditSink } from '@tryit/security';
import { ResultCache, InMemoryCacheStore } from '@tryit/cache';
import { EngineRouter } from '@tryit/engine';
import { type TenantConfig, type TryOnJob, type TryOnResult } from '@tryit/contracts';
import { InMemoryTenantStore, type TenantStore } from './tenant-store';
import { buildProviderRegistry } from './provider-registry';

/** The bundle of shared collaborators a request handler operates against. */
export interface Runtime {
  readonly tenantStore: TenantStore;
  readonly rateLimiter: RateLimiter;
  /** Result cache values are {@link TryOnResult}; the cache is content+tenant addressed. */
  readonly resultCache: ResultCache<TryOnResult>;
  readonly auditSink: AuditSink;
  /** In-memory job records keyed by jobId. Production swaps a durable store. */
  readonly jobs: Map<string, TryOnJob>;
  readonly engine: EngineRouter;
}

/** Construct a fresh, fully-wired runtime. Called once per process (and per test reset). */
function buildRuntime(): Runtime {
  const tenantStore = new InMemoryTenantStore();
  // Real wall clock for the limiter; deterministic clocks are injected in unit tests directly.
  const rateLimiter = new RateLimiter({ now: () => Date.now() }, new InMemoryRateLimitStore());
  // Cap the in-memory cache so a long-lived dev process cannot grow unbounded.
  const resultCache = new ResultCache<TryOnResult>(
    new InMemoryCacheStore<TryOnResult>({ maxEntries: 1_000 }),
  );
  const auditSink = new InMemoryAuditSink();
  const jobs = new Map<string, TryOnJob>();

  const { registry, routing } = buildProviderRegistry();
  const engine = new EngineRouter(registry, {
    routing,
    defaultTimeoutMs: 30_000,
  });

  return { tenantStore, rateLimiter, resultCache, auditSink, jobs, engine };
}

// Module singleton: one runtime per process, lazily initialised on first access.
let runtimeSingleton: Runtime | undefined;

/** Return the process-wide runtime, building it on first use. */
export function getRuntime(): Runtime {
  if (runtimeSingleton === undefined) {
    runtimeSingleton = buildRuntime();
  }
  return runtimeSingleton;
}

/**
 * Test-only: discard the current runtime so the next {@link getRuntime} builds a fresh one.
 * Lets each test start from clean rate-limit, cache, audit, and jobs state.
 */
export function resetRuntimeForTest(): void {
  runtimeSingleton = undefined;
}

/**
 * The single fail-closed kill-switch gate. Returns true when EITHER the global env flag
 * `TRYIT_KILL_SWITCH==='1'` is set OR the tenant's own `killSwitch` is engaged. When true the
 * pipeline refuses the request with `KILL_SWITCH_ENGAGED` rather than calling any provider.
 */
export function isKillSwitchEngaged(tenant: TenantConfig): boolean {
  // fail-closed: a global halt overrides everything; a tenant halt is honoured independently.
  return process.env.TRYIT_KILL_SWITCH === '1' || tenant.killSwitch === true;
}
