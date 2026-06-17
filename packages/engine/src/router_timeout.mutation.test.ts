/**
 * Mutation-hardening tests for router_timeout.ts. Targets survivors the FakeClock suite missed:
 *  - L23-L26 SYSTEM_CLOCK: the production clock's now()/setTimer()/clearTimer() must really bind
 *    to wall-clock + host timers, not be blanked to no-ops.
 *  - L44/L45 ProviderTimeoutError: the EXACT `<label>: timed out after <ms>ms` message and the
 *    `ProviderTimeoutError` name.
 *  - L70/L71 the caller-signal listener removal: once an attempt settles, a LATER caller abort
 *    must NOT propagate into the (already-finished) attempt — proving the 'abort' listener was
 *    removed on settle.
 *
 * Note: the single-settle guard mutants (L65 `if (settled) return`, L68 `settled = true`) are
 * equivalent — JS promises lock in their first settlement and clearTimer/removeEventListener are
 * idempotent, so a broken guard yields no observable change. Listed in the report, not faked.
 */
import { describe, expect, it, vi } from 'vitest';
import { ProviderTimeoutError, runWithTimeout, SYSTEM_CLOCK } from './router_timeout.js';
import { FakeClock } from './test_support/fixtures.js';

describe('SYSTEM_CLOCK (mutation-hardening)', () => {
  it('now() returns real wall-clock ms (kills the now()->undefined arrow mutant)', () => {
    const before = Date.now();
    const t = SYSTEM_CLOCK.now();
    const after = Date.now();
    expect(typeof t).toBe('number');
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
  });

  it('setTimer schedules a real timer that fires, and clearTimer cancels it', async () => {
    // Real timers (kept tiny). setTimer must return a handle and actually fire the callback;
    // a no-op mutant would never fire. clearTimer must prevent a fire; a no-op mutant would fire.
    vi.useRealTimers();
    const fired = await new Promise<boolean>((resolve) => {
      let did = false;
      SYSTEM_CLOCK.setTimer(() => {
        did = true;
        resolve(true);
      }, 1);
      setTimeout(() => resolve(did), 30);
    });
    expect(fired).toBe(true);

    const cancelledFired = await new Promise<boolean>((resolve) => {
      let did = false;
      const handle = SYSTEM_CLOCK.setTimer(() => {
        did = true;
      }, 1);
      SYSTEM_CLOCK.clearTimer(handle);
      setTimeout(() => resolve(did), 30);
    });
    expect(cancelledFired).toBe(false);
  });
});

describe('ProviderTimeoutError (mutation-hardening)', () => {
  it('carries the exact actionable message and name (kills the template + name string mutants)', () => {
    const err = new ProviderTimeoutError('replicate', 1500);
    expect(err.message).toBe('replicate: timed out after 1500ms');
    expect(err.name).toBe('ProviderTimeoutError');
    expect(err).toBeInstanceOf(Error);
  });

  it('a timed-out attempt rejects with that exact message (end-to-end)', async () => {
    const clock = new FakeClock();
    const p = runWithTimeout(() => new Promise<string>(() => undefined), {
      timeoutMs: 250,
      clock,
      controller: new AbortController(),
      providerLabel: 'fal',
    });
    clock.advance(250);
    await expect(p).rejects.toThrow('fal: timed out after 250ms');
  });
});

describe('runWithTimeout caller-listener cleanup (mutation-hardening)', () => {
  it('removes the caller-abort listener on settle so a LATE abort does not abort the attempt', async () => {
    // The attempt resolves first. On settle, finish() must removeEventListener('abort', ...). If
    // the removal is skipped (L70 guard false) or targets the wrong event (L71 'abort'->''), a
    // later caller abort would still invoke onCallerAbort and abort the attempt controller.
    const clock = new FakeClock();
    const caller = new AbortController();
    const controller = new AbortController();
    const value = await runWithTimeout(async () => 'done', {
      timeoutMs: 1000,
      clock,
      controller,
      callerSignal: caller.signal,
      providerLabel: 'fal',
    });
    expect(value).toBe('done');
    expect(controller.signal.aborted).toBe(false);

    // Now abort the caller AFTER the attempt already settled. A correctly-removed listener means
    // this is a no-op; the attempt's controller must stay un-aborted.
    caller.abort();
    await Promise.resolve();
    expect(controller.signal.aborted).toBe(false);
  });
});
