/**
 * @tryit/sdk-node/test-support — fakes for driving the SDK without a network or real clock.
 *
 * The SDK injects `fetch`, `now`, and `sleep`, so tests supply deterministic fakes here:
 * - {@link makeCapturingFetch} records every call (url/method/headers/body) and replies from a
 *   scripted queue of responses, so assertions can prove the exact wire shape that was sent.
 * - {@link makeManualClock} advances time only when `sleep` is awaited, so polling/timeout logic
 *   is exercised with zero real delay and full determinism.
 *
 * This module is test-only support, excluded from coverage thresholds via the SDK's vitest config
 * only for `*.test.ts`; it is intentionally a `.ts` helper, not a test, and carries real logic.
 */

import type { FetchLike, FetchLikeResponse } from './client.js';

/** A single recorded outbound call. */
export interface CapturedCall {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string | undefined;
}

/** A scripted response: either a normal reply or a transport-level throw. */
export type ScriptedResponse =
  | { readonly status: number; readonly body: string }
  | { readonly throwTransport: string }
  | { readonly throwOnRead: string };

/** A capturing fetch plus the list it records into. */
export interface CapturingFetch {
  readonly fetch: FetchLike;
  readonly calls: CapturedCall[];
}

/**
 * Build a fake `fetch` that records each call and replies from `script` in order. If the script
 * is exhausted, the last entry is reused (handy for `waitForJob` polling the same reply N times).
 */
export function makeCapturingFetch(script: ScriptedResponse[]): CapturingFetch {
  const calls: CapturedCall[] = [];
  let index = 0;
  const fetch: FetchLike = (url, init) => {
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers: { ...(init?.headers ?? {}) },
      body: init?.body,
    });
    const entry = script[Math.min(index, script.length - 1)] ?? script[script.length - 1];
    index += 1;
    if (entry && 'throwTransport' in entry) {
      return Promise.reject(new Error(entry.throwTransport));
    }
    const response: FetchLikeResponse = {
      status: entry && 'status' in entry ? entry.status : 200,
      text: () => {
        if (entry && 'throwOnRead' in entry) {
          return Promise.reject(new Error(entry.throwOnRead));
        }
        return Promise.resolve(entry && 'body' in entry ? entry.body : '');
      },
    };
    return Promise.resolve(response);
  };
  return { fetch, calls };
}

/** A manually-advanced clock: `now()` reads the current time, `sleep(ms)` advances it. */
export interface ManualClock {
  now(): number;
  sleep(ms: number): Promise<void>;
  /** Count of sleeps performed — lets tests assert how many polls slept. */
  sleepCount(): number;
}

/**
 * Build a deterministic clock starting at `start` millis. `sleep(ms)` resolves immediately but
 * advances the virtual clock by `ms`, so timeout arithmetic in the SDK plays out with no real
 * waiting. The resolution is deferred to a microtask so interleaving matches real async order.
 */
export function makeManualClock(start = 0): ManualClock {
  let current = start;
  let sleeps = 0;
  return {
    now: () => current,
    sleep: (ms: number) => {
      current += ms;
      sleeps += 1;
      return Promise.resolve();
    },
    sleepCount: () => sleeps,
  };
}
