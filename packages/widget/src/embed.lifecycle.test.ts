/**
 * End-to-end network-lifecycle tests for `embed.ts`. These drive the REAL element FSM into
 * `uploading` and assert the loader's create -> poll -> terminal orchestration: that it calls
 * createTryOn, feeds JOB_CREATED, polls getJob, and feeds JOB_SUCCEEDED / JOB_FAILED back into the
 * element. Every fetch and timer is injected, so there is NO real network and NO real clock — the
 * poll loop advances only when a test ticks the controllable timer.
 *
 * Why this is in its own file: the lifecycle harness (controllable fetch sequencer + timer queue +
 * fake clock) is substantial; splitting keeps each file focused and under the 300-line limit.
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { mount, resolveOptions, type MountOptions } from './embed.js';
import { defineTryItWidget, TAG_NAME, type TryItWidget } from './element.js';
import type { FetchLike } from './api.js';
import type { TryOnJob } from '@tryit/contracts';

beforeAll(() => {
  defineTryItWidget();
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

/** Settle queued microtasks (MutationObserver callback + awaited promises in the loop). */
const flush = (): Promise<void> => new Promise<void>((r) => setTimeout(r, 0));

/** Build a valid job of a given status, optionally with a result image. */
function job(status: TryOnJob['status'], resultUrl?: string): TryOnJob {
  const base: TryOnJob = {
    jobId: 'job-7',
    status,
    request: {
      tenantId: 't1',
      shopperId: 's1',
      personImage: { kind: 'url', url: 'https://img/p.jpg' },
      productId: 'p1',
      category: 'apparel',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  return resultUrl === undefined
    ? base
    : {
        ...base,
        result: {
          resultImageUrl: resultUrl,
          provider: 'prov',
          latencyMs: 9,
          cached: false,
          costUsd: 0.01,
        },
      };
}

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * A fetch fake that returns scripted responses by URL: the POST /v1/tryons create call gets
 * `createRes`; each GET /v1/tryons/:id poll gets the next item from `pollRes` (last item repeats).
 * Records each call so a test can assert how many polls happened.
 */
function sequencedFetch(createRes: Response, pollRes: Response[]): { fetch: FetchLike; polls: () => number } {
  let pollIdx = 0;
  let polls = 0;
  const fetchFn: FetchLike = async (input, init) => {
    const method = init?.method ?? 'GET';
    if (method === 'POST') {
      return createRes.clone();
    }
    polls += 1;
    const res = pollRes[Math.min(pollIdx, pollRes.length - 1)]!;
    pollIdx += 1;
    return res.clone();
  };
  return { fetch: fetchFn, polls: () => polls };
}

/** Controllable timer queue: setTimeoutFn enqueues; tick() fires the oldest pending callback. */
function makeTimers(): {
  setTimeoutFn: (cb: () => void, ms: number) => unknown;
  pending: () => number;
  tick: () => Promise<void>;
} {
  const q: Array<() => void> = [];
  return {
    setTimeoutFn: (cb: () => void) => q.push(cb),
    pending: () => q.length,
    tick: async () => {
      const cb = q.shift();
      if (cb !== undefined) cb();
      await flush();
    },
  };
}

function host(): HTMLDivElement {
  const h = document.createElement('div');
  for (const [k, v] of Object.entries({
    'data-api-base': 'https://api.test',
    'data-publishable-key': 'pk_1',
    'data-tenant-id': 't1',
    'data-shopper-id': 's1',
    'data-product-id': 'p1',
    'data-product-image': 'https://img/p.jpg',
  })) {
    h.setAttribute(k, v);
  }
  document.body.appendChild(h);
  return h;
}

/** Mount with injected deps and return the element. */
function mountWith(overrides: Partial<MountOptions>): TryItWidget {
  const opts = resolveOptions(host(), overrides)!;
  return mount(opts);
}

/** Drive idle -> uploading through real FSM events, then flush so the observer fires. */
async function submit(el: TryItWidget): Promise<void> {
  el.send({ type: 'OPEN' });
  el.send({ type: 'CONSENT_ACCEPT' });
  el.send({
    type: 'FILE_STAGED',
    photo: { fileName: 'me.jpg', mimeType: 'image/jpeg', sizeBytes: 10, previewUrl: '' },
  });
  el.send({ type: 'SUBMIT' });
  await flush();
}

describe('happy path: create -> poll -> succeeded', () => {
  it('creates the job, transitions to processing, then result with the result URL', async () => {
    const timers = makeTimers();
    const { fetch, polls } = sequencedFetch(ok(job('queued')), [
      ok(job('processing')),
      ok(job('succeeded', 'https://cdn/out.png')),
    ]);
    const el = mountWith({ fetch, setTimeoutFn: timers.setTimeoutFn });

    await submit(el);
    // After create resolves the element is in `processing` (JOB_CREATED fed in).
    expect(el.currentState.name).toBe('processing');
    // First poll returned `processing` -> the loop scheduled a wait. Advance it.
    expect(timers.pending()).toBe(1);
    await timers.tick();
    // Second poll returned `succeeded` -> JOB_SUCCEEDED fed in, element on result.
    expect(el.currentState.name).toBe('result');
    expect(el.currentState.resultUrl).toBe('https://cdn/out.png');
    expect(polls()).toBe(2);
  });

  it('reaches result on the very first poll when already terminal (no wait scheduled)', async () => {
    const timers = makeTimers();
    const { fetch } = sequencedFetch(ok(job('queued')), [ok(job('succeeded', 'https://cdn/a.png'))]);
    const el = mountWith({ fetch, setTimeoutFn: timers.setTimeoutFn });
    await submit(el);
    expect(el.currentState.name).toBe('result');
    expect(timers.pending()).toBe(0); // terminal immediately -> no poll delay queued
  });
});

describe('terminal failure paths feed JOB_FAILED', () => {
  it('a terminal `failed` job -> error(PROVIDER_ERROR)', async () => {
    const timers = makeTimers();
    const { fetch } = sequencedFetch(ok(job('queued')), [ok(job('failed'))]);
    const el = mountWith({ fetch, setTimeoutFn: timers.setTimeoutFn });
    await submit(el);
    expect(el.currentState.name).toBe('error');
    expect(el.currentState.errorCode).toBe('PROVIDER_ERROR');
  });

  it('a `succeeded` job with NO result -> error(PROVIDER_ERROR) (fail-closed)', async () => {
    const timers = makeTimers();
    const { fetch } = sequencedFetch(ok(job('queued')), [ok(job('succeeded'))]);
    const el = mountWith({ fetch, setTimeoutFn: timers.setTimeoutFn });
    await submit(el);
    expect(el.currentState.name).toBe('error');
    expect(el.currentState.errorCode).toBe('PROVIDER_ERROR');
  });
});

describe('create failure short-circuits before polling', () => {
  it('createTryOn {ok:false} -> JOB_FAILED with that code, no poll happens', async () => {
    const timers = makeTimers();
    const errBody = { code: 'RATE_LIMITED', message: 'slow', httpStatus: 429 };
    const createErr = new Response(JSON.stringify(errBody), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    });
    const { fetch, polls } = sequencedFetch(createErr, [ok(job('succeeded', 'https://cdn/x.png'))]);
    const el = mountWith({ fetch, setTimeoutFn: timers.setTimeoutFn });
    await submit(el);
    // Element was in `uploading`; JOB_FAILED moves it straight to error with the propagated code.
    expect(el.currentState.name).toBe('error');
    expect(el.currentState.errorCode).toBe('RATE_LIMITED');
    expect(polls()).toBe(0); // never polled — create failed first
  });
});

describe('poll read failure fails closed', () => {
  it('getJob {ok:false} -> JOB_FAILED PROVIDER_ERROR', async () => {
    const timers = makeTimers();
    const pollErr = new Response('not json', { status: 500 });
    const { fetch } = sequencedFetch(ok(job('queued')), [pollErr]);
    const el = mountWith({ fetch, setTimeoutFn: timers.setTimeoutFn });
    await submit(el);
    expect(el.currentState.name).toBe('error');
    expect(el.currentState.errorCode).toBe('PROVIDER_ERROR');
  });
});

describe('poll timeout fails closed', () => {
  it('status stays `processing` past POLL_TIMEOUT_MS -> JOB_FAILED PROVIDER_ERROR', async () => {
    const timers = makeTimers();
    // Always processing — only the timeout can end the loop.
    const { fetch, polls } = sequencedFetch(ok(job('queued')), [ok(job('processing'))]);
    // Fake clock: first read at t=0; on the next Date.now() jump past the 60s ceiling.
    let now = 1_000_000;
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockImplementation(() => now);
    const el = mountWith({ fetch, setTimeoutFn: timers.setTimeoutFn });
    await submit(el); // create + first poll (processing) -> schedules a wait

    expect(el.currentState.name).toBe('processing');
    expect(timers.pending()).toBe(1);
    now += 61_000; // advance the clock past POLL_TIMEOUT_MS before the next loop iteration
    await timers.tick(); // second poll runs, sees deadline exceeded -> undefined -> JOB_FAILED

    expect(el.currentState.name).toBe('error');
    expect(el.currentState.errorCode).toBe('PROVIDER_ERROR');
    expect(polls()).toBe(2); // polled, still processing, then timed out
  });
});

describe('inFlight guard: the lifecycle runs at most once per submit', () => {
  it('extra re-renders while a job is in flight do not start a second lifecycle', async () => {
    const timers = makeTimers();
    const { fetch, polls } = sequencedFetch(ok(job('queued')), [
      ok(job('processing')),
      ok(job('succeeded', 'https://cdn/o.png')),
    ]);
    const el = mountWith({ fetch, setTimeoutFn: timers.setTimeoutFn });
    await submit(el);
    // While in `processing` (still in flight), force extra shadow-root mutations that re-fire the
    // observer. The inFlight guard must swallow these — no extra create/poll bursts.
    el.shadowRoot!.appendChild(document.createElement('span'));
    el.shadowRoot!.appendChild(document.createElement('span'));
    await flush();
    expect(polls()).toBe(1); // still just the single first poll; guard held
    await timers.tick();
    expect(el.currentState.name).toBe('result');
    expect(polls()).toBe(2); // exactly the two polls of the ONE lifecycle
  });
});

describe('no lifecycle starts before the FSM reaches uploading', () => {
  it('mounting and merely opening/consenting never calls fetch', async () => {
    const fetch = vi.fn() as unknown as FetchLike;
    const el = mountWith({ fetch, setTimeoutFn: makeTimers().setTimeoutFn });
    el.send({ type: 'OPEN' });
    el.send({ type: 'CONSENT_ACCEPT' });
    await flush();
    expect(fetch).not.toHaveBeenCalled();
    expect(el.tagName.toLowerCase()).toBe(TAG_NAME);
  });
});
