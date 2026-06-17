/**
 * Mutation-hardening tests for the fal adapter. Each test targets a specific survivor the
 * happy-path suite missed:
 *  - L19  endpoint string literal — assert the exact FAL_TRYON_ENDPOINT value.
 *  - L82/L86 the `single.length > 0` / `first.length > 0` boundary — an EMPTY string url must
 *    fail closed, killing `>=`/`true` mutants that would accept `''` as a valid image url.
 *  - L85 optional-chaining on `images?.[0]?.url` — an empty `images` array must fail closed with
 *    the typed "no image url" error, not a TypeError from a stripped `?.`.
 *  - L119 the `fal.tryOn` debug event name + payload — asserted via a recording logger.
 *  - L131 `cached: false` boolean — asserted exact.
 *  - L134 the `'fal'` validation label — surfaced in the malformed-result error message.
 *  - L146/L147/L156 the default runner factory's `FAL_KEY` lookup + success path.
 */
import { describe, expect, it } from 'vitest';
import {
  FalProvider,
  FAL_TRYON_ENDPOINT,
  defaultFalRunnerFactory,
  type FalRunner,
  type FalTryOnOutput,
} from './fal.js';
import type { EngineLogger } from '../provider.js';
import { makeContext, makeRequest } from '../test_support/fixtures.js';

function fakeRunner(output: FalTryOnOutput): FalRunner {
  return { async subscribe() { return { data: output, requestId: 'r' }; } };
}

/** A logger that records every (event, fields) call so we can assert exact emissions. */
function recordingLogger(): EngineLogger & { calls: Array<[string, string, Record<string, unknown> | undefined]> } {
  const calls: Array<[string, string, Record<string, unknown> | undefined]> = [];
  return {
    calls,
    debug: (event, fields) => calls.push(['debug', event, fields]),
    warn: (event, fields) => calls.push(['warn', event, fields]),
    error: (event, fields) => calls.push(['error', event, fields]),
  };
}

describe('FalProvider (mutation-hardening)', () => {
  it('targets exactly the fal-ai/cat-vton endpoint (kills the endpoint string-blank mutant)', () => {
    expect(FAL_TRYON_ENDPOINT).toBe('fal-ai/cat-vton');
  });

  it('fails closed when image.url is an EMPTY string (kills the length>0 boundary mutant)', async () => {
    // `single.length > 0` must reject ''. A `>= 0` / `true` mutant would WRONGLY accept the empty
    // string as a usable url and then fail later inside validation with a different message.
    const runner = fakeRunner({ image: { url: '' } });
    await expect(new FalProvider({ runner }).tryOn(makeRequest(), makeContext())).rejects.toThrow(
      /fal: response contained no image url/,
    );
  });

  it('fails closed when images[0].url is an EMPTY string (kills the second length>0 mutant)', async () => {
    const runner = fakeRunner({ images: [{ url: '' }] });
    await expect(new FalProvider({ runner }).tryOn(makeRequest(), makeContext())).rejects.toThrow(
      /fal: response contained no image url/,
    );
  });

  it('fails closed with the typed error on an EMPTY images[] (kills the ?. strip on images[0])', async () => {
    // Stripping `?.` to `images?.[0].url` would throw a TypeError reading `.url` of undefined.
    // The contract is a typed "no image url" error, never a TypeError.
    const runner = fakeRunner({ images: [] });
    await expect(new FalProvider({ runner }).tryOn(makeRequest(), makeContext())).rejects.toThrow(
      /fal: response contained no image url/,
    );
  });

  it('emits the exact fal.tryOn debug event with endpoint + tenantId (kills logger mutants)', async () => {
    const logger = recordingLogger();
    const runner = fakeRunner({ image: { url: 'https://cdn.fal.ai/out.png' } });
    await new FalProvider({ runner }).tryOn(
      makeRequest({ tenantId: 'tenant-z' }),
      makeContext({ logger }),
    );
    expect(logger.calls).toContainEqual([
      'debug',
      'fal.tryOn',
      { endpoint: FAL_TRYON_ENDPOINT, tenantId: 'tenant-z' },
    ]);
  });

  it('stamps cached === false on success (kills the cached BooleanLiteral mutant)', async () => {
    const runner = fakeRunner({ image: { url: 'https://cdn.fal.ai/out.png' } });
    const result = await new FalProvider({ runner }).tryOn(makeRequest(), makeContext());
    expect(result.cached).toBe(false);
  });

  it('uses the "fal" label in the malformed-result error (kills the label string-blank mutant)', async () => {
    // A non-https url makes validateProviderResult throw; the message must be prefixed `fal:`.
    const runner = fakeRunner({ image: { url: 'http://cdn.fal.ai/out.png' } });
    await expect(new FalProvider({ runner }).tryOn(makeRequest(), makeContext())).rejects.toThrow(
      /^fal: malformed provider result/,
    );
  });

  it('default factory fails closed without FAL_KEY and builds a runner with one (kills factory mutants)', () => {
    // A SINGLE test exercises BOTH branches of `if (!key || key.length === 0)` so the same
    // covering test reaches the kill for every factory mutant (Stryker perTest attributes line
    // coverage to whichever test executed it un-mutated):
    //   1. unset FAL_KEY -> the guard is TRUE -> the factory throws and returns NO runner. Under
    //      the `if (false)` mutant it would instead build a credential-less client. Asserting the
    //      throw (and that nothing was built) kills the ConditionalExpression mutant.
    //   2. valid FAL_KEY -> the guard is FALSE -> the factory builds a runner via createFalClient
    //      (no network — only constructs a client object), reaching the L156 object literal.
    const saved = process.env['FAL_KEY'];
    try {
      delete process.env['FAL_KEY'];
      let built: unknown;
      expect(() => {
        built = defaultFalRunnerFactory();
      }).toThrow('fal: FAL_KEY is not configured');
      expect(built).toBeUndefined();

      process.env['FAL_KEY'] = 'synthetic-test-key';
      const runner = defaultFalRunnerFactory();
      expect(typeof runner.subscribe).toBe('function');
    } finally {
      if (saved === undefined) {
        delete process.env['FAL_KEY'];
      } else {
        process.env['FAL_KEY'] = saved;
      }
    }
  });
});
