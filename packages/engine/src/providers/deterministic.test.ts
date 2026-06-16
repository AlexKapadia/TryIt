/**
 * Tests for the deterministic provider: reproducibility (byte-identical for identical input),
 * full offline operation, https/contract-valid output, sensitivity to request changes, and
 * fail-closed on an already-aborted context. Property-based with fast-check; no network.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { safeParseTryOnResult, type TryOnRequest } from '@tryit/contracts';
import { DeterministicProvider, DETERMINISTIC_RESULT_ORIGIN } from './deterministic.js';
import { makeContext, makeRequest } from '../test_support/fixtures.js';

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

  it('emits an https URL under the deterministic origin embedding the digest', async () => {
    const result = await provider.tryOn(makeRequest(), makeContext());
    expect(result.resultImageUrl.startsWith(`${DETERMINISTIC_RESULT_ORIGIN}/`)).toBe(true);
    expect(result.resultImageUrl.startsWith('https://')).toBe(true);
    // The digest is 16 hex chars; assert that exact shape appears in the path segment.
    expect(result.resultImageUrl).toMatch(/\/[0-9a-f]{16}\.svg\?img=/);
  });

  it('embeds the placeholder SVG as a base64 query param (offline, self-contained)', async () => {
    const result = await provider.tryOn(makeRequest(), makeContext());
    const img = new URL(result.resultImageUrl).searchParams.get('img');
    expect(img).not.toBeNull();
    const decoded = Buffer.from(img as string, 'base64').toString('utf-8');
    expect(decoded.startsWith('<svg')).toBe(true);
    expect(decoded).toContain('viewBox="0 0 512 640"');
  });

  it('fails closed when the context signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      provider.tryOn(makeRequest(), makeContext({ signal: controller.signal })),
    ).rejects.toThrow(/already aborted/);
  });
});
