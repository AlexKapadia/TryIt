/**
 * Mutation-hardening tests for the self-hosted adapter:
 *  - L76 the `selfHosted.tryOn` debug event + baseUrl/tenantId payload (recording logger).
 *  - L89 the `url.length === 0` boundary — an empty-string image_url must fail closed.
 *  - L97 `cached: false` boolean — asserted exact.
 *  - L100 the `'self-hosted'` validation label — surfaced in the malformed-result error message.
 */
import { describe, expect, it } from 'vitest';
import { SelfHostedProvider, type FetchLike } from './self-hosted.js';
import type { EngineLogger } from '../provider.js';
import { makeContext, makeRequest } from '../test_support/fixtures.js';

function fakeFetch(body: unknown, ok = true, status = 200): FetchLike {
  return async () => ({ ok, status, json: async () => body });
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

describe('SelfHostedProvider (mutation-hardening)', () => {
  it('emits the exact selfHosted.tryOn debug event with baseUrl + tenantId (kills logger mutants)', async () => {
    const logger = recordingLogger();
    const fetchImpl = fakeFetch({ image_url: 'https://infer.internal/o.png' });
    // baseUrl with a trailing slash also confirms the normalised value is the one logged.
    await new SelfHostedProvider({ baseUrl: 'https://infer.internal/', fetchImpl }).tryOn(
      makeRequest({ tenantId: 'tenant-s' }),
      makeContext({ logger }),
    );
    expect(logger.calls).toContainEqual([
      'debug',
      'selfHosted.tryOn',
      { baseUrl: 'https://infer.internal', tenantId: 'tenant-s' },
    ]);
  });

  it('fails closed when image_url is an EMPTY string (kills the length===0 boundary mutant)', async () => {
    // `url.length === 0` must reject ''. A `false` mutant would WRONGLY treat '' as usable and
    // then fail later in validation with a different message.
    const fetchImpl = fakeFetch({ image_url: '' });
    await expect(
      new SelfHostedProvider({ baseUrl: 'https://infer.internal', fetchImpl }).tryOn(makeRequest(), makeContext()),
    ).rejects.toThrow(/self-hosted: response missing image_url/);
  });

  it('stamps cached === false on success (kills the cached BooleanLiteral mutant)', async () => {
    const fetchImpl = fakeFetch({ image_url: 'https://infer.internal/o.png' });
    const result = await new SelfHostedProvider({ baseUrl: 'https://infer.internal', fetchImpl }).tryOn(
      makeRequest(),
      makeContext(),
    );
    expect(result.cached).toBe(false);
  });

  it('uses the "self-hosted" label in the malformed-result error (kills the label mutant)', async () => {
    const fetchImpl = fakeFetch({ image_url: 'http://infer.internal/o.png' });
    await expect(
      new SelfHostedProvider({ baseUrl: 'https://infer.internal', fetchImpl }).tryOn(makeRequest(), makeContext()),
    ).rejects.toThrow(/^self-hosted: malformed provider result/);
  });
});
