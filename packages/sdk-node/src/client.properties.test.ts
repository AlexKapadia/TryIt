/**
 * Property-based tests for TryItClient — invariants that must hold across many generated inputs.
 *
 * Rather than enumerating examples, these assert structural laws with fast-check:
 *  - Polling resolves on the first terminal status and performs exactly (index-of-terminal) sleeps.
 *  - Any valid ApiError contract on a non-2xx is re-thrown with code and httpStatus preserved.
 *  - The injected api key never appears in any thrown error regardless of the failure mode.
 * High example counts give the suite teeth: a regression in the polling arithmetic or error
 * mapping would be caught by the randomised search, not just by hand-picked cases.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ErrorCodeSchema, makeApiError } from '@tryit/contracts';
import { ApiClientError, TryItClient } from './index.js';
import { makeCapturingFetch, makeManualClock } from './test-support.js';
import { PROCESSING_JOB, QUEUED_JOB, SUCCEEDED_JOB, asBody } from './test-fixtures.js';

const BASE = 'https://api.tryit.example';
const KEY = 'sk-property-secret-xyz';
const ALL_CODES = ErrorCodeSchema.options;

describe('property: error mapping preserves code and status', () => {
  it('re-throws any valid ApiError on any 4xx/5xx with code + httpStatus intact', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...ALL_CODES),
        fc.string({ minLength: 1, maxLength: 80 }),
        fc.integer({ min: 400, max: 599 }),
        async (code, message, transportStatus) => {
          const apiError = makeApiError(code, message);
          const cap = makeCapturingFetch([{ status: transportStatus, body: asBody(apiError) }]);
          const c = new TryItClient({ apiKey: KEY, baseUrl: BASE, fetch: cap.fetch });

          const err = (await c.getJob('job-1').catch((e: unknown) => e)) as ApiClientError;
          expect(err).toBeInstanceOf(ApiClientError);
          // The CODE and STATUS come from the body, independent of the transport status.
          expect(err.code).toBe(code);
          expect(err.httpStatus).toBe(apiError.httpStatus);
          expect(err.message).toBe(message);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('property: polling resolves at the first terminal and sleeps exactly that many times', () => {
  it('performs (index of first terminal) sleeps and returns that job', async () => {
    await fc.assert(
      fc.asyncProperty(
        // A run of non-terminal polls (queued/processing) followed by a terminal one.
        fc.integer({ min: 0, max: 8 }),
        fc.constantFrom(QUEUED_JOB, PROCESSING_JOB),
        async (nonTerminalCount, nonTerminalJob) => {
          const script = [
            ...Array.from({ length: nonTerminalCount }, () => ({
              status: 200,
              body: asBody(nonTerminalJob),
            })),
            { status: 200, body: asBody(SUCCEEDED_JOB) },
          ];
          const cap = makeCapturingFetch(script);
          const clock = makeManualClock(0);
          const c = new TryItClient({
            apiKey: KEY,
            baseUrl: BASE,
            fetch: cap.fetch,
            now: clock.now,
            sleep: clock.sleep,
          });

          const job = await c.waitForJob('job-1', { pollMs: 10, timeoutMs: 10_000_000 });
          expect(job).toEqual(SUCCEEDED_JOB);
          // One fetch per poll: nonTerminalCount + 1; one sleep between each pair.
          expect(cap.calls).toHaveLength(nonTerminalCount + 1);
          expect(clock.sleepCount()).toBe(nonTerminalCount);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('property: the api key never leaks into any thrown error', () => {
  it('omits the key from transport, parse, and contract errors alike', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant<{ throwTransport: string }>({ throwTransport: 'net' }),
          fc.record({ status: fc.integer({ min: 200, max: 599 }), body: fc.string() }),
        ),
        async (scripted) => {
          const cap = makeCapturingFetch([scripted]);
          const c = new TryItClient({ apiKey: KEY, baseUrl: BASE, fetch: cap.fetch });
          const outcome = await c.getJob('job-1').then(
            () => null,
            (e: unknown) => e,
          );
          if (outcome instanceof ApiClientError) {
            expect(outcome.message).not.toContain(KEY);
            expect(JSON.stringify(outcome.apiError)).not.toContain(KEY);
          }
          // The key is, however, always present on the wire as the bearer header.
          expect(cap.calls[0]!.headers['Authorization']).toBe(`Bearer ${KEY}`);
        },
      ),
      { numRuns: 200 },
    );
  });
});
