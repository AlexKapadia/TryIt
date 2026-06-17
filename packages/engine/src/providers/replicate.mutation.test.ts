/**
 * Mutation-hardening tests for the Replicate adapter:
 *  - L43 the string-output `output.length > 0` boundary — an empty string fails closed.
 *  - L46 the `Array.isArray(output)` guard — a non-array, non-string output fails closed (kills
 *    the `true` mutant that would treat any value as an array).
 *  - L48 the array-element `first.length > 0` boundary — an empty first element fails closed.
 *  - L78 the `replicate.tryOn` debug event + version/tenantId payload (recording logger).
 *  - L93 `cached: false` boolean — asserted exact.
 *  - L96 the `'replicate'` validation label — surfaced in the malformed-result error message.
 */
import { describe, expect, it } from 'vitest';
import { ReplicateProvider, type ReplicateHttpClient, type ReplicatePrediction } from './replicate.js';
import type { EngineLogger } from '../provider.js';
import { makeContext, makeRequest } from '../test_support/fixtures.js';

function fakeClient(prediction: ReplicatePrediction): ReplicateHttpClient {
  return { async createPrediction() { return prediction; } };
}

function recordingLogger(): EngineLogger & { calls: Array<[string, string, Record<string, unknown> | undefined]> } {
  const calls: Array<[string, string, Record<string, unknown> | undefined]> = [];
  return {
    calls,
    debug: (event, fields) => calls.push(['debug', event, fields]),
    warn: (event, fields) => calls.push(['warn', event, fields]),
    error: (event, fields) => calls.push(['error', event, fields]),
  };
}

describe('ReplicateProvider (mutation-hardening)', () => {
  it('fails closed when a STRING output is empty (kills the output.length>0 mutant)', async () => {
    const client = fakeClient({ status: 'succeeded', output: '' });
    await expect(
      new ReplicateProvider({ modelVersion: 'v', httpClient: client }).tryOn(makeRequest(), makeContext()),
    ).rejects.toThrow(/replicate: prediction output contained no image url/);
  });

  it('fails closed for an array-LIKE object that is not a real array (kills the isArray->true mutant)', async () => {
    // `{ 0: url }` has a usable `[0]` but is NOT an array. The original `Array.isArray` guard is
    // false -> fail-closed. An `if (true)` mutant would skip the guard, read `output[0]` and
    // WRONGLY return the url. Asserting the throw makes that mutant observable.
    const client = fakeClient({ status: 'succeeded', output: { 0: 'https://replicate.delivery/a.png' } });
    await expect(
      new ReplicateProvider({ modelVersion: 'v', httpClient: client }).tryOn(makeRequest(), makeContext()),
    ).rejects.toThrow(/replicate: prediction output contained no image url/);
  });

  it('fails closed when the first array element is an EMPTY string (kills the first.length>0 mutant)', async () => {
    const client = fakeClient({ status: 'succeeded', output: [''] });
    await expect(
      new ReplicateProvider({ modelVersion: 'v', httpClient: client }).tryOn(makeRequest(), makeContext()),
    ).rejects.toThrow(/replicate: prediction output contained no image url/);
  });

  it('emits the exact replicate.tryOn debug event with version + tenantId (kills logger mutants)', async () => {
    const logger = recordingLogger();
    const client = fakeClient({ status: 'succeeded', output: 'https://replicate.delivery/r.png' });
    await new ReplicateProvider({ modelVersion: 'v-xyz', httpClient: client }).tryOn(
      makeRequest({ tenantId: 'tenant-r' }),
      makeContext({ logger }),
    );
    expect(logger.calls).toContainEqual(['debug', 'replicate.tryOn', { version: 'v-xyz', tenantId: 'tenant-r' }]);
  });

  it('stamps cached === false on success (kills the cached BooleanLiteral mutant)', async () => {
    const client = fakeClient({ status: 'succeeded', output: 'https://replicate.delivery/r.png' });
    const result = await new ReplicateProvider({ modelVersion: 'v', httpClient: client }).tryOn(
      makeRequest(),
      makeContext(),
    );
    expect(result.cached).toBe(false);
  });

  it('uses the "replicate" label in the malformed-result error (kills the label mutant)', async () => {
    const client = fakeClient({ status: 'succeeded', output: 'http://replicate.delivery/r.png' });
    await expect(
      new ReplicateProvider({ modelVersion: 'v', httpClient: client }).tryOn(makeRequest(), makeContext()),
    ).rejects.toThrow(/^replicate: malformed provider result/);
  });
});
