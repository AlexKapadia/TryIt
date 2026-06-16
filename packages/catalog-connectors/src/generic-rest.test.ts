/**
 * Tests for the generic REST connector — driven by dot-path field mappings, no network.
 *
 * Covers: the getByPath resolver (nested objects, array indices, out-of-range, primitives),
 * several distinct mapping configs (flat, nested itemsPath, single-string vs array image,
 * numeric id, currency upcasing), fail-closed skipping of records missing required fields
 * (never throws), the limit option, non-2xx handling, and getProduct hit/miss.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { FetchLike, FetchLikeResponse } from './connector.js';
import { GenericRestConnector, getByPath, type FieldMapping } from './generic-rest.js';

function res(body: unknown, opts?: { ok?: boolean; status?: number }): FetchLikeResponse {
  return {
    ok: opts?.ok ?? true,
    status: opts?.status ?? 200,
    headers: { get: () => null },
    json: async () => body,
  };
}

function fetchReturning(body: unknown, opts?: { ok?: boolean; status?: number }): FetchLike {
  return async () => res(body, opts);
}

const flatMapping: FieldMapping = {
  idPath: 'sku',
  titlePath: 'name',
  imagePath: 'image',
  pricePath: 'price',
  currencyPath: 'currency',
  vendorPath: 'brand',
};

describe('getByPath resolver', () => {
  it('reads a nested object path', () => {
    expect(getByPath({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42);
  });

  it('reads an array index segment', () => {
    expect(getByPath({ items: [{ id: 'x' }, { id: 'y' }] }, 'items.1.id')).toBe('y');
  });

  it('returns the root for an empty path', () => {
    const root = { ok: true };
    expect(getByPath(root, '')).toBe(root);
  });

  it('returns undefined for an out-of-range index (boundary: length)', () => {
    expect(getByPath({ a: ['only'] }, 'a.1')).toBeUndefined();
    expect(getByPath({ a: ['only'] }, 'a.0')).toBe('only');
  });

  it('returns undefined for a non-integer array segment', () => {
    expect(getByPath({ a: ['x'] }, 'a.foo')).toBeUndefined();
    expect(getByPath({ a: ['x'] }, 'a.-1')).toBeUndefined();
  });

  it('returns undefined when descending into a primitive or null', () => {
    expect(getByPath({ a: 5 }, 'a.b')).toBeUndefined();
    expect(getByPath({ a: null }, 'a.b')).toBeUndefined();
    expect(getByPath(null, 'a')).toBeUndefined();
  });
});

describe('GenericRestConnector mapping configs', () => {
  it('normalizes a flat record with a single image string', async () => {
    const body = [{ sku: 'A1', name: 'Tee', image: 'https://cdn/a.jpg', price: 12.5, currency: 'usd', brand: 'Acme' }];
    const c = new GenericRestConnector({ url: 'https://api/x', fetch: fetchReturning(body), mapping: flatMapping });
    const products = await c.listProducts();
    expect(products[0]).toMatchObject({
      id: 'A1',
      title: 'Tee',
      imageRefs: ['https://cdn/a.jpg'],
      price: 12.5,
      currency: 'USD', // upper-cased by the connector
      vendor: 'Acme',
      category: 'apparel',
    });
  });

  it('reads products from a nested itemsPath and an image array', async () => {
    const body = {
      data: { products: [{ id: 99, label: 'Jacket', photos: ['https://cdn/1.jpg', 'https://cdn/2.jpg'] }] },
    };
    const mapping: FieldMapping = { itemsPath: 'data.products', idPath: 'id', titlePath: 'label', imagePath: 'photos' };
    const c = new GenericRestConnector({ url: 'https://api/x', fetch: fetchReturning(body), mapping });
    const products = await c.listProducts();
    expect(products[0]).toMatchObject({ id: '99', title: 'Jacket', imageRefs: ['https://cdn/1.jpg', 'https://cdn/2.jpg'] });
  });

  it('uses a category override path and defaults category when absent', async () => {
    const body = [
      { sku: '1', name: 'A', image: 'https://cdn/a.jpg', kind: 'shoes' },
      { sku: '2', name: 'B', image: 'https://cdn/b.jpg' },
    ];
    const mapping: FieldMapping = { ...flatMapping, categoryPath: 'kind' };
    const c = new GenericRestConnector({ url: 'https://api/x', fetch: fetchReturning(body), mapping });
    const products = await c.listProducts();
    expect(products[0]?.category).toBe('shoes');
    expect(products[1]?.category).toBe('apparel'); // defaulted
  });

  it('extracts a deeply nested image via a dotted imagePath', async () => {
    const body = [{ sku: 'Z', name: 'Deep', media: { hero: { url: 'https://cdn/h.jpg' } } }];
    const mapping: FieldMapping = { idPath: 'sku', titlePath: 'name', imagePath: 'media.hero.url' };
    const c = new GenericRestConnector({ url: 'https://api/x', fetch: fetchReturning(body), mapping });
    const products = await c.listProducts();
    expect(products[0]?.imageRefs).toEqual(['https://cdn/h.jpg']);
  });
});

describe('GenericRestConnector fail-closed handling', () => {
  it('skips records missing required fields and reports them, never throwing', async () => {
    const body = [
      { sku: 'ok', name: 'Good', image: 'https://cdn/g.jpg' },
      { name: 'no id', image: 'https://cdn/x.jpg' }, // missing id
      { sku: 'no-img', name: 'No image' }, // missing image
      { sku: 'http', name: 'Insecure', image: 'http://cdn/x.jpg' }, // non-https
    ];
    const c = new GenericRestConnector({ url: 'https://api/x', fetch: fetchReturning(body), mapping: flatMapping });
    const products = await c.listProducts();
    expect(products.map((p) => p.id)).toEqual(['ok']);
    expect(c.skipped).toHaveLength(3);
    // the http record is identified by its id; the missing-id record falls back to a positional ref.
    expect(c.skipped.map((s) => s.ref).sort()).toEqual(['http', 'index:1', 'no-img']);
  });

  it('drops non-string entries inside an image array but keeps valid ones', async () => {
    const body = [{ sku: 'M', name: 'Mixed', photos: ['https://cdn/a.jpg', 42, null, 'https://cdn/b.jpg'] }];
    const mapping: FieldMapping = { idPath: 'sku', titlePath: 'name', imagePath: 'photos' };
    const c = new GenericRestConnector({ url: 'https://api/x', fetch: fetchReturning(body), mapping });
    const products = await c.listProducts();
    expect(products[0]?.imageRefs).toEqual(['https://cdn/a.jpg', 'https://cdn/b.jpg']);
  });

  it('ignores a negative price rather than emitting an invalid product', async () => {
    const body = [{ sku: 'N', name: 'Neg', image: 'https://cdn/a.jpg', price: -5 }];
    const c = new GenericRestConnector({ url: 'https://api/x', fetch: fetchReturning(body), mapping: flatMapping });
    // a negative price violates the schema -> the whole record is skipped fail-closed.
    expect(await c.listProducts()).toEqual([]);
    expect(c.skipped).toHaveLength(1);
  });

  it('returns no products when the body is not an array at itemsPath', async () => {
    const c = new GenericRestConnector({
      url: 'https://api/x',
      fetch: fetchReturning({ data: { products: 'oops' } }),
      mapping: { itemsPath: 'data.products', idPath: 'id', titlePath: 't', imagePath: 'img' },
    });
    expect(await c.listProducts()).toEqual([]);
  });

  it('fails closed on a non-2xx feed', async () => {
    const c = new GenericRestConnector({
      url: 'https://api/x',
      fetch: fetchReturning([], { ok: false, status: 503 }),
      mapping: flatMapping,
    });
    expect(await c.listProducts()).toEqual([]);
    expect(c.skipped[0]?.reason).toContain('503');
  });

  it('respects the limit option', async () => {
    const body = Array.from({ length: 5 }, (_, i) => ({ sku: `s${i}`, name: 'X', image: 'https://cdn/a.jpg' }));
    const c = new GenericRestConnector({ url: 'https://api/x', fetch: fetchReturning(body), mapping: flatMapping });
    expect(await c.listProducts({ limit: 2 })).toHaveLength(2);
  });
});

describe('GenericRestConnector.getProduct', () => {
  const body = [
    { sku: 'a', name: 'A', image: 'https://cdn/a.jpg' },
    { sku: 'b', name: 'B', image: 'https://cdn/b.jpg' },
  ];

  it('returns the matching product', async () => {
    const c = new GenericRestConnector({ url: 'https://api/x', fetch: fetchReturning(body), mapping: flatMapping });
    expect((await c.getProduct('b'))?.title).toBe('B');
  });

  it('returns null when no product matches', async () => {
    const c = new GenericRestConnector({ url: 'https://api/x', fetch: fetchReturning(body), mapping: flatMapping });
    expect(await c.getProduct('zzz')).toBeNull();
  });
});

describe('GenericRestConnector property: it never throws on arbitrary records', () => {
  it('always returns an array and records skips for invalid records', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.object(), { maxLength: 20 }), async (records) => {
        const c = new GenericRestConnector({
          url: 'https://api/x',
          fetch: fetchReturning(records),
          mapping: flatMapping,
        });
        const products = await c.listProducts();
        // robustness invariant: any garbage feed yields a valid (possibly empty) product array.
        expect(Array.isArray(products)).toBe(true);
        expect(products.length + c.skipped.length).toBe(records.length);
      }),
      { numRuns: 100 },
    );
  });
});
