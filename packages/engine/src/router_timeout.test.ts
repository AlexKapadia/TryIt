/**
 * Tests for the timed-attempt helper using a FakeClock (no real timers/network). Asserts: a
 * fast attempt resolves and clears its timer; a hanging attempt rejects with a timeout AND
 * aborts the attempt signal; a rejecting attempt propagates its error; caller cancellation
 * aborts and rejects; an already-aborted caller signal rejects immediately; and late timer
 * firing after settle is a no-op (single-settle guard).
 */

import { describe, expect, it } from 'vitest';
import { ProviderTimeoutError, runWithTimeout } from './router_timeout.js';
import { FakeClock } from './test_support/fixtures.js';

function run<T>(
  clock: FakeClock,
  attempt: (signal: AbortSignal) => Promise<T>,
  opts: { timeoutMs?: number; callerSignal?: AbortSignal } = {},
): Promise<T> {
  return runWithTimeout(attempt, {
    timeoutMs: opts.timeoutMs ?? 100,
    clock,
    controller: new AbortController(),
    ...(opts.callerSignal ? { callerSignal: opts.callerSignal } : {}),
    providerLabel: 'fal',
  });
}

describe('runWithTimeout', () => {
  it('resolves with the attempt value and clears the pending timer', async () => {
    const clock = new FakeClock();
    const p = run(clock, async () => 'ok');
    await expect(p).resolves.toBe('ok');
    expect(clock.pendingTimers()).toBe(0); // timer cleared on settle.
  });

  it('rejects with a ProviderTimeoutError and aborts the attempt signal on deadline', async () => {
    const clock = new FakeClock();
    let observed: AbortSignal | undefined;
    const p = run(
      clock,
      (signal) =>
        new Promise<string>(() => {
          observed = signal; // never resolves — the timeout must win.
        }),
      { timeoutMs: 50 },
    );
    clock.advance(50); // cross the deadline; fires the timer.
    await expect(p).rejects.toBeInstanceOf(ProviderTimeoutError);
    expect(observed?.aborted).toBe(true);
  });

  it('does not time out a hanging attempt before the deadline is crossed', async () => {
    const clock = new FakeClock();
    const p = run(clock, () => new Promise<string>(() => undefined), { timeoutMs: 100 });
    clock.advance(99); // one ms short — no timer fires yet.
    // Race a resolved sentinel: the attempt must still be pending (timeout not yet thrown).
    const sentinel = Symbol('pending');
    const winner = await Promise.race([p.catch(() => 'timed-out'), Promise.resolve(sentinel)]);
    expect(winner).toBe(sentinel);
    clock.advance(1); // now cross it to clean up.
    await expect(p).rejects.toBeInstanceOf(ProviderTimeoutError);
  });

  it('propagates a rejecting attempt error unchanged', async () => {
    const clock = new FakeClock();
    const p = run(clock, async () => {
      throw new Error('boom');
    });
    await expect(p).rejects.toThrow(/boom/);
    expect(clock.pendingTimers()).toBe(0);
  });

  it('rejects immediately when the caller signal is already aborted', async () => {
    const clock = new FakeClock();
    const controller = new AbortController();
    controller.abort();
    const p = run(clock, () => new Promise<string>(() => undefined), {
      callerSignal: controller.signal,
    });
    await expect(p).rejects.toThrow(/cancelled by caller/);
  });

  it('aborts and rejects when the caller cancels mid-flight', async () => {
    const clock = new FakeClock();
    const controller = new AbortController();
    let observed: AbortSignal | undefined;
    const p = run(
      clock,
      (signal) =>
        new Promise<string>(() => {
          observed = signal;
        }),
      { callerSignal: controller.signal },
    );
    controller.abort();
    await expect(p).rejects.toThrow(/cancelled by caller/);
    expect(observed?.aborted).toBe(true);
  });

  it('ignores a timer that fires after the attempt already resolved (single settle)', async () => {
    const clock = new FakeClock();
    const p = run(clock, async () => 'ok', { timeoutMs: 10 });
    await expect(p).resolves.toBe('ok');
    // Advancing now must not throw or re-settle; the timer was already cleared.
    expect(() => clock.advance(100)).not.toThrow();
  });
});
