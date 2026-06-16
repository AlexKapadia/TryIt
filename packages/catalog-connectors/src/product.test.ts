/**
 * Tests for the NormalizedProduct schema — the contract every connector must satisfy.
 *
 * These assertions are boundary-exact (min lengths, https-only images, non-negative finite
 * price) and property-based (any well-formed record round-trips; any missing-required field
 * is rejected), so they would fail if the schema were silently loosened.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  DEFAULT_CATEGORY,
  NormalizedProductSchema,
  parseNormalizedProduct,
  safeParseNormalizedProduct,
} from './product.js';

const validProduct = {
  id: 'sku-1',
  title: 'Linen Shirt',
  imageRefs: ['https://cdn.example.com/a.jpg'],
};

describe('NormalizedProductSchema accepts well-formed products', () => {
  it('parses a minimal valid product and defaults the category to apparel', () => {
    const parsed = parseNormalizedProduct(validProduct);
    expect(parsed.category).toBe(DEFAULT_CATEGORY);
    expect(parsed.imageRefs).toEqual(['https://cdn.example.com/a.jpg']);
    expect(parsed.price).toBeUndefined();
  });

  it('preserves all optional commercial fields when present', () => {
    const parsed = parseNormalizedProduct({
      ...validProduct,
      price: 19.99,
      currency: 'USD',
      vendor: 'Acme',
      category: 'outerwear',
    });
    expect(parsed).toMatchObject({ price: 19.99, currency: 'USD', vendor: 'Acme', category: 'outerwear' });
  });

  it('keeps multiple https images in order', () => {
    const refs = ['https://a.example/1.jpg', 'https://a.example/2.jpg', 'https://a.example/3.jpg'];
    expect(parseNormalizedProduct({ ...validProduct, imageRefs: refs }).imageRefs).toEqual(refs);
  });
});

describe('NormalizedProductSchema fails closed on bad data', () => {
  it('rejects an empty id (boundary: min length 1)', () => {
    expect(safeParseNormalizedProduct({ ...validProduct, id: '' }).success).toBe(false);
  });

  it('rejects an empty title', () => {
    expect(safeParseNormalizedProduct({ ...validProduct, title: '' }).success).toBe(false);
  });

  it('rejects a product with zero images (boundary: min 1)', () => {
    expect(safeParseNormalizedProduct({ ...validProduct, imageRefs: [] }).success).toBe(false);
  });

  it('rejects a non-https image ref (http)', () => {
    const r = safeParseNormalizedProduct({ ...validProduct, imageRefs: ['http://a.example/x.jpg'] });
    expect(r.success).toBe(false);
  });

  it('rejects data: and file: image schemes (SSRF vectors)', () => {
    for (const bad of ['data:image/png;base64,AAAA', 'file:///etc/passwd', 'ftp://a/x.jpg']) {
      expect(safeParseNormalizedProduct({ ...validProduct, imageRefs: [bad] }).success).toBe(false);
    }
  });

  it('rejects a negative price (boundary: just under zero)', () => {
    expect(safeParseNormalizedProduct({ ...validProduct, price: -0.01 }).success).toBe(false);
  });

  it('accepts a zero price (boundary: exactly zero)', () => {
    expect(safeParseNormalizedProduct({ ...validProduct, price: 0 }).success).toBe(true);
  });

  it('rejects a non-finite price (NaN/Infinity)', () => {
    expect(safeParseNormalizedProduct({ ...validProduct, price: Number.POSITIVE_INFINITY }).success).toBe(false);
    expect(safeParseNormalizedProduct({ ...validProduct, price: Number.NaN }).success).toBe(false);
  });

  it('rejects a currency that is not exactly 3 chars (boundary: 2 and 4)', () => {
    expect(safeParseNormalizedProduct({ ...validProduct, currency: 'US' }).success).toBe(false);
    expect(safeParseNormalizedProduct({ ...validProduct, currency: 'USDD' }).success).toBe(false);
    expect(safeParseNormalizedProduct({ ...validProduct, currency: 'USD' }).success).toBe(true);
  });
});

describe('NormalizedProductSchema property-based invariants', () => {
  it('round-trips any record built from valid generators', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
          title: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
          imageRefs: fc
            .array(fc.webUrl({ withQueryParameters: true }), { minLength: 1, maxLength: 5 })
            .map((urls) => urls.map((u) => u.replace(/^https?:/, 'https:'))),
          price: fc.option(fc.float({ min: 0, max: 1e6, noNaN: true }), { nil: undefined }),
        }),
        (rec) => {
          const r = safeParseNormalizedProduct(rec);
          // every generated record is structurally valid, so parse must succeed and preserve id.
          expect(r.success).toBe(true);
          if (r.success) expect(r.data.id).toBe(rec.id);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('rejects any record missing a required field', () => {
    fc.assert(
      fc.property(fc.constantFrom('id', 'title', 'imageRefs'), (field) => {
        const broken: Record<string, unknown> = { ...validProduct };
        delete broken[field];
        expect(NormalizedProductSchema.safeParse(broken).success).toBe(false);
      }),
      { numRuns: 30 },
    );
  });
});
