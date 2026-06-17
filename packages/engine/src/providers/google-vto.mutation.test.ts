/**
 * Mutation-hardening tests for the Google VTO adapter:
 *  - L74 the `googleVto.tryOn` debug event + tenantId payload (recording logger).
 *  - L79 optional-chaining on `predictions?.[0]?.resultImageUrl` — empty predictions fails closed.
 *  - L80 the `url.length === 0` boundary — an empty-string url must fail closed (kills `false`).
 *  - L89 `cached: false` boolean — asserted exact.
 *  - L92 the `'google-vto'` validation label — surfaced in the malformed-result error message.
 */
import { describe, expect, it } from 'vitest';
import { GoogleVtoProvider, type GoogleVtoHttpClient, type GoogleVtoResponse } from './google-vto.js';
import type { EngineLogger } from '../provider.js';
import { makeContext, makeRequest } from '../test_support/fixtures.js';

function fakeClient(response: GoogleVtoResponse): GoogleVtoHttpClient {
  return { async predict() { return response; } };
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

describe('GoogleVtoProvider (mutation-hardening)', () => {
  it('emits the exact googleVto.tryOn debug event with tenantId (kills logger mutants)', async () => {
    const logger = recordingLogger();
    const client = fakeClient({ predictions: [{ resultImageUrl: 'https://cdn.g.com/o.png' }] });
    await new GoogleVtoProvider({ httpClient: client }).tryOn(
      makeRequest({ tenantId: 'tenant-g' }),
      makeContext({ logger }),
    );
    expect(logger.calls).toContainEqual(['debug', 'googleVto.tryOn', { tenantId: 'tenant-g' }]);
  });

  it('fails closed on an empty predictions array with the TYPED error, not a TypeError (kills the ?. strip)', async () => {
    // With predictions: [], `predictions?.[0]` is undefined. The original `?.resultImageUrl`
    // safely yields undefined -> the typed "no result image url" error. Stripping the second `?.`
    // (mutant `predictions?.[0].resultImageUrl`) reads `.resultImageUrl` off undefined -> a
    // TypeError with a DIFFERENT message. We capture the error and assert its exact message so the
    // mutant's TypeError fails the assertion.
    const client = fakeClient({ predictions: [] });
    let caught: unknown;
    try {
      await new GoogleVtoProvider({ httpClient: client }).tryOn(makeRequest(), makeContext());
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('google-vto: response contained no result image url');
    // A stripped `?.` would surface a TypeError instead — explicitly forbid that class.
    expect((caught as Error).constructor.name).toBe('Error');
  });

  it('fails closed when the url is an EMPTY string (kills the length===0 boundary mutant)', async () => {
    // `url.length === 0` must reject ''. A `false` mutant would WRONGLY treat '' as usable.
    const client = fakeClient({ predictions: [{ resultImageUrl: '' }] });
    await expect(
      new GoogleVtoProvider({ httpClient: client }).tryOn(makeRequest(), makeContext()),
    ).rejects.toThrow(/google-vto: response contained no result image url/);
  });

  it('stamps cached === false on success (kills the cached BooleanLiteral mutant)', async () => {
    const client = fakeClient({ predictions: [{ resultImageUrl: 'https://cdn.g.com/o.png' }] });
    const result = await new GoogleVtoProvider({ httpClient: client }).tryOn(makeRequest(), makeContext());
    expect(result.cached).toBe(false);
  });

  it('uses the "google-vto" label in the malformed-result error (kills the label mutant)', async () => {
    const client = fakeClient({ predictions: [{ resultImageUrl: 'http://cdn.g.com/o.png' }] });
    await expect(
      new GoogleVtoProvider({ httpClient: client }).tryOn(makeRequest(), makeContext()),
    ).rejects.toThrow(/^google-vto: malformed provider result/);
  });
});
