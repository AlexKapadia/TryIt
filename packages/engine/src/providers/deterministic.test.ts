/**
 * Tests for the deterministic provider: reproducibility (byte-identical for identical input),
 * full offline operation, a renderable data:image/svg+xml contract-valid output, sensitivity to
 * request changes, and fail-closed on an already-aborted context. Property-based with fast-check;
 * no network.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { safeParseTryOnResult, type TryOnRequest } from '@tryit/contracts';
import { DeterministicProvider } from './deterministic.js';
import { makeContext, makeRequest } from '../test_support/fixtures.js';

/** The exact data-URL prefix every deterministic result must carry (renderable inline SVG). */
const DATA_URL_PREFIX = 'data:image/svg+xml;base64,';

/** Arbitrary that produces a structurally-valid, varied TryOnRequest. */
const requestArb: fc.Arbitrary<TryOnRequest> = fc
  .record({
    tenantId: fc.string({ minLength: 1, maxLength: 20 }),
    shopperId: fc.string({ minLength: 1, maxLength: 20 }),
    productId: fc.string({ minLength: 1, maxLength: 20 }),
    url: fc.webUrl().filter((u) => u.startsWith('https://')),
    seed: fc.option(fc.integer(), { nil: undefined }),
  })
  .map(({ tenantId, shopperId, productId, url, seed }) => {
    const base: TryOnRequest = {
      tenantId,
      shopperId,
      productId,
      personImage: { kind: 'url', url },
      category: 'apparel',
    };
    return seed === undefined ? base : { ...base, params: { seed } };
  });

describe('DeterministicProvider', () => {
  const provider = new DeterministicProvider();

  it('produces a byte-identical result for the identical request (property)', async () => {
    await fc.assert(
      fc.asyncProperty(requestArb, async (req) => {
        const a = await provider.tryOn(req, makeContext());
        const b = await provider.tryOn(req, makeContext());
        // Reproducibility: every field, including the full result URL, must match exactly.
        expect(b.resultImageUrl).toBe(a.resultImageUrl);
        expect(JSON.stringify(b)).toBe(JSON.stringify(a));
      }),
      { numRuns: 200 },
    );
  });

  it('produces distinct URLs for requests differing only in productId (property)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.string({ minLength: 1, maxLength: 12 }),
        async (p1, p2) => {
          fc.pre(p1 !== p2);
          const r1 = await provider.tryOn(makeRequest({ productId: p1 }), makeContext());
          const r2 = await provider.tryOn(makeRequest({ productId: p2 }), makeContext());
          expect(r1.resultImageUrl).not.toBe(r2.resultImageUrl);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns a contract-valid result with the deterministic provider id and zero cost', async () => {
    const result = await provider.tryOn(makeRequest(), makeContext());
    const parsed = safeParseTryOnResult(result);
    expect(parsed.success).toBe(true);
    expect(result.provider).toBe('deterministic');
    expect(result.costUsd).toBe(0);
    expect(result.cached).toBe(false);
  });

  it('emits a renderable data:image/svg+xml base64 url that satisfies the result contract', async () => {
    const result = await provider.tryOn(makeRequest(), makeContext());
    // The result must be an inline, browser-renderable image — not a non-resolvable fake host.
    expect(result.resultImageUrl.startsWith(DATA_URL_PREFIX)).toBe(true);
    // And it must PASS the contract's TryOnResultSchema (the router re-validates the same way).
    expect(safeParseTryOnResult(result).success).toBe(true);
  });

  it('embeds the deterministic SVG inline as the base64 payload (offline, self-contained)', async () => {
    const result = await provider.tryOn(makeRequest(), makeContext());
    const b64 = result.resultImageUrl.slice(DATA_URL_PREFIX.length);
    const decoded = Buffer.from(b64, 'base64').toString('utf-8');
    expect(decoded.startsWith('<svg')).toBe(true);
    expect(decoded).toContain('viewBox="0 0 512 640"');
    expect(decoded).toContain('tryit:'); // the digest label is embedded -> traceable to its request.
  });

  it('fails closed when the context signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      provider.tryOn(makeRequest(), makeContext({ signal: controller.signal })),
    ).rejects.toThrow(/already aborted/);
  });
});
