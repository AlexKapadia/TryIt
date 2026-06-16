/**
 * @tryit/engine/router_timeout — injectable per-attempt timeout + cancellation for the router.
 *
 * Wraps a single provider attempt so it races against a wall-clock deadline and an optional
 * caller cancellation signal. Both time and timer scheduling come from an injectable
 * {@link RouterClock}, and the {@link AbortController} is injected too, so tests drive the
 * timeout path deterministically with zero real timers and zero network. On timeout the
 * attempt's signal is aborted (so a well-behaved provider stops its I/O) and a typed timeout
 * error is thrown for the router to catch and fall through.
 */

/**
 * The clock surface the router depends on. `now()` measures latency; `setTimer`/`clearTimer`
 * schedule the deadline. The default binds to the real `Date`/`setTimeout`; tests inject a fake.
 */
export interface RouterClock {
  now(): number;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

/** The production clock, bound to wall-clock time and the host timer functions. */
export const SYSTEM_CLOCK: RouterClock = {
  now: () => Date.now(),
  setTimer: (callback, ms) => setTimeout(callback, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Options controlling a single timed attempt. */
export interface RunWithTimeoutOptions {
  readonly timeoutMs: number;
  readonly clock: RouterClock;
  /** The injected controller whose signal is passed to the attempt and aborted on timeout. */
  readonly controller: AbortController;
  /** Optional caller cancellation; aborting it aborts the attempt too. */
  readonly callerSignal?: AbortSignal | undefined;
  /** Provider label used to make the timeout error actionable. */
  readonly providerLabel: string;
}

/** Error thrown when an attempt exceeds its deadline, distinguishable from provider errors. */
export class ProviderTimeoutError extends Error {
  public constructor(providerLabel: string, timeoutMs: number) {
    super(`${providerLabel}: timed out after ${timeoutMs}ms`);
    this.name = 'ProviderTimeoutError';
  }
}

/**
 * Run `attempt` with a deadline and cancellation, resolving with its value or rejecting with the
 * provider's error / a {@link ProviderTimeoutError}.
 *
 * The attempt receives the controller's {@link AbortSignal}; on timeout the controller is
 * aborted before the timeout error is raised so a cooperating provider can stop work.
 */
export function runWithTimeout<T>(
  attempt: (signal: AbortSignal) => Promise<T>,
  options: RunWithTimeoutOptions,
): Promise<T> {
  const { timeoutMs, clock, controller, callerSignal, providerLabel } = options;

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) {
        return; // guard against a late timer/abort firing after the attempt already settled.
      }
      settled = true;
      clock.clearTimer(timer);
      if (callerSignal) {
        callerSignal.removeEventListener('abort', onCallerAbort);
      }
      fn();
    };

    const onCallerAbort = (): void => {
      // Propagate caller cancellation into the attempt, then reject this race.
      controller.abort();
      finish(() => reject(new Error(`${providerLabel}: cancelled by caller`)));
    };

    const timer = clock.setTimer(() => {
      // fail-closed on deadline: abort the attempt's signal, then reject with a timeout error.
      controller.abort();
      finish(() => reject(new ProviderTimeoutError(providerLabel, timeoutMs)));
    }, timeoutMs);

    if (callerSignal) {
      if (callerSignal.aborted) {
        onCallerAbort();
        return;
      }
      callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }

    // Kick off the attempt; its resolution/rejection wins the race if it beats the deadline.
    attempt(controller.signal).then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}
