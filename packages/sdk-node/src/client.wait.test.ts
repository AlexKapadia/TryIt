/**
 * Tests for TryItClient.waitForJob — polling, terminal resolution, and timeout (injected clock).
 *
 * The clock is injected and advanced only by `sleep`, so these prove the SDK polls the right
 * number of times, resolves the instant a terminal status appears, and fails closed on timeout —
 * all with zero real delay. Boundary cases around the deadline are exercised exactly.
 */

import { describe, expect, it } from 'vitest';
import { ApiClientError, TryItClient } from './index.js';
import { makeCapturingFetch, makeManualClock } from './test-support.js';
import {
  FAILED_JOB,
  PROCESSING_JOB,
  QUEUED_JOB,
  SUCCEEDED_JOB,
  asBody,
} from './test-fixtures.js';

const BASE = 'https://api.tryit.example';
const KEY = 'sk-secret';

function clientWith(script: Parameters<typeof makeCapturingFetch>[0], start = 0) {
  const cap = makeCapturingFetch(script);
  const clock = makeManualClock(start);
  const c = new TryItClient({
    apiKey: KEY,
    baseUrl: BASE,
    fetch: cap.fetch,
    now: clock.now,
    sleep: clock.sleep,
  });
  return { c, cap, clock };
}

describe('waitForJob', () => {
  it('resolves immediately when the first poll is already terminal (timeoutMs=0)', async () => {
    const { c, cap, clock } = clientWith([{ status: 200, body: asBody(SUCCEEDED_JOB) }]);
    const job = await c.waitForJob('job-1', { pollMs: 10, timeoutMs: 0 });
    expect(job.status).toBe('succeeded');
    expect(cap.calls).toHaveLength(1);
    expect(clock.sleepCount()).toBe(0); // never slept — terminal on first look
  });

  it('polls N times then resolves on a terminal status, advancing the injected clock', async () => {
    const { c, cap, clock } = clientWith([
      { status: 200, body: asBody(QUEUED_JOB) },
      { status: 200, body: asBody(PROCESSING_JOB) },
      { status: 200, body: asBody(PROCESSING_JOB) },
      { status: 200, body: asBody(SUCCEEDED_JOB) },
    ]);

    const job = await c.waitForJob('job-1', { pollMs: 100, timeoutMs: 10_000 });

    expect(job).toEqual(SUCCEEDED_JOB);
    expect(cap.calls).toHaveLength(4); // 3 non-terminal + 1 terminal
    expect(clock.sleepCount()).toBe(3); // slept between the 4 polls
    expect(clock.now()).toBe(300); // 3 sleeps * 100ms
  });

  it('treats a failed status as terminal and resolves with it', async () => {
    const { c } = clientWith([
      { status: 200, body: asBody(PROCESSING_JOB) },
      { status: 200, body: asBody(FAILED_JOB) },
    ]);
    const job = await c.waitForJob('job-1', { pollMs: 50, timeoutMs: 1000 });
    expect(job.status).toBe('failed');
    expect(job.error).toBe('provider exhausted');
  });

  it('throws a typed PROVIDER_ERROR on timeout when the job never goes terminal', async () => {
    // Script always returns processing; capturing fetch reuses the last entry indefinitely.
    const { c, clock } = clientWith([{ status: 200, body: asBody(PROCESSING_JOB) }]);
    const err = (await c
      .waitForJob('job-1', { pollMs: 100, timeoutMs: 250 })
      .catch((e: unknown) => e)) as ApiClientError;

    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.code).toBe('PROVIDER_ERROR');
    // deadline=250, pollMs=100. Polls at t=0,100,200 (200+100=300 > 250 -> stop). Never overruns.
    expect(clock.now()).toBe(200);
  });

  it('allows a poll landing exactly on the deadline, then fails closed (boundary-exact)', async () => {
    // deadline=100, pollMs=100. Poll@t=0 (now+poll=100, not > 100 -> sleep). Poll@t=100
    // (now+poll=200 > 100 -> stop). A poll that lands *on* the deadline is permitted; the next
    // one that would overrun is refused. Proves the boundary is `>` not `>=`.
    const { c, cap, clock } = clientWith([{ status: 200, body: asBody(PROCESSING_JOB) }]);
    await expect(
      c.waitForJob('job-1', { pollMs: 100, timeoutMs: 100 }),
    ).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
    expect(cap.calls).toHaveLength(2);
    expect(clock.now()).toBe(100);
  });

  it('refuses to overrun the deadline: a poll past it is never issued (boundary-exact)', async () => {
    // deadline=99, pollMs=100. Poll@t=0 (now+poll=100 > 99 -> stop). Exactly one poll, no sleep.
    const { c, cap, clock } = clientWith([{ status: 200, body: asBody(PROCESSING_JOB) }]);
    await expect(
      c.waitForJob('job-1', { pollMs: 100, timeoutMs: 99 }),
    ).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
    expect(cap.calls).toHaveLength(1);
    expect(clock.sleepCount()).toBe(0);
  });

  it('propagates a non-2xx error encountered mid-poll instead of swallowing it', async () => {
    const { c } = clientWith([
      { status: 200, body: asBody(PROCESSING_JOB) },
      { status: 429, body: asBody({ code: 'RATE_LIMITED', message: 'slow down', httpStatus: 429 }) },
    ]);
    const err = (await c
      .waitForJob('job-1', { pollMs: 10, timeoutMs: 10_000 })
      .catch((e: unknown) => e)) as ApiClientError;
    expect(err.code).toBe('RATE_LIMITED');
  });

  it('rejects a non-positive pollMs (fail-closed) before polling', async () => {
    const { c, cap } = clientWith([{ status: 200, body: asBody(SUCCEEDED_JOB) }]);
    await expect(c.waitForJob('job-1', { pollMs: 0, timeoutMs: 100 })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(cap.calls).toHaveLength(0);
  });

  it('rejects a negative timeoutMs (fail-closed) before polling', async () => {
    const { c, cap } = clientWith([{ status: 200, body: asBody(SUCCEEDED_JOB) }]);
    await expect(c.waitForJob('job-1', { pollMs: 10, timeoutMs: -1 })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(cap.calls).toHaveLength(0);
  });

  it('rejects a non-integer pollMs', async () => {
    const { c } = clientWith([{ status: 200, body: asBody(SUCCEEDED_JOB) }]);
    await expect(c.waitForJob('job-1', { pollMs: 1.5, timeoutMs: 100 })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });
});
