/**
 * @tryit/engine/provider — the TryOnProvider abstraction and its execution context.
 *
 * Every image backend (fal, replicate, google-vto, self-hosted, deterministic) implements
 * the same {@link TryOnProvider} interface so the router (see ./router.ts) can treat them
 * interchangeably and fall through from one to the next. A provider receives a validated
 * {@link TryOnRequest} plus a {@link ProviderContext} that carries the per-call deadline,
 * an {@link AbortSignal} for cooperative cancellation, and a structured logger. Providers
 * perform untrusted external I/O; their outputs are re-validated by the router before use.
 */

import type { ProviderId, TryOnRequest, TryOnResult } from '@tryit/contracts';

/**
 * A structured logger sink injected into providers so they never reach for a global
 * `console` (which would be unmockable and could leak into production logs untyped).
 * Implementations decide where the records go; the engine only emits structured events.
 */
export interface EngineLogger {
  debug(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

/** A no-op logger used as the safe default so a missing logger never throws. */
export const NOOP_LOGGER: EngineLogger = {
  debug: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/**
 * Per-call execution context handed to a provider on each {@link TryOnProvider.tryOn}.
 *
 * `timeoutMs` is the wall-clock budget the caller allows for this attempt; `signal` is
 * aborted when that budget is exceeded (or the caller cancels) so providers doing real I/O
 * can bail early. `logger` is a structured sink. The context is read-only to the provider.
 */
export interface ProviderContext {
  /** Wall-clock budget for this single attempt, in milliseconds. Always >= 1. */
  readonly timeoutMs: number;
  /** Abort signal fired when the deadline is hit or the caller cancels. */
  readonly signal: AbortSignal;
  /** Structured logger; defaults to {@link NOOP_LOGGER} when the caller supplies none. */
  readonly logger: EngineLogger;
}

/**
 * A virtual try-on backend. Implementations map a {@link TryOnRequest} to a
 * {@link TryOnResult}, performing whatever external work they need within the
 * {@link ProviderContext} budget. They must reject (throw) on failure rather than
 * returning a partial/invalid result — the router treats a thrown error as a signal
 * to fall through to the next candidate.
 */
export interface TryOnProvider {
  /** The provider's stable identity, used by the router for ordering and accounting. */
  readonly id: ProviderId;
  /**
   * Produce a try-on result for `req` within `ctx`'s budget.
   *
   * @throws on any failure (network, timeout, malformed upstream response). The router
   *   catches and falls through; providers must not swallow errors into a fake success.
   */
  tryOn(req: TryOnRequest, ctx: ProviderContext): Promise<TryOnResult>;
}
