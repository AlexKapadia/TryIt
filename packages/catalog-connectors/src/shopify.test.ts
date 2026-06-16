/**
 * Tests for the Shopify connector — fixture-driven, no network (fetch is injected).
 *
 * Covers: multi-image + variant normalization, cursor pagination across two pages via the
 * Link header, fail-closed skipping of malformed/missing-field products (never throws), the
 * limit option, non-2xx fail-closed behaviour, getProduct hit/miss, and the nextPageInfo parser.
 */

import { describe, expect, it } from 'vitest';
import type { FetchLike, FetchLikeResponse } from './connector.js';
import { ShopifyConnector, nextPageInfo } from './shopify.js';

/** Build a fixture response. `link` populates the pagination Link header for the next page. */
function res(body: unknown, opts?: { ok?: boolean; status?: number; link?: string }): FetchLikeResponse {
  const headers = new Map<string, string>();
  if (opts?.link) headers.set('link', opts.link);
  return {
    ok: opts?.ok ?? true,
    status: opts?.status ?? 200,
    headers: { get: (n) => headers.get(n.toLowerCase()) ?? null },
    json: async () => body,
  };
}

/** A fetch fake that returns queued responses in order, recording the URLs it was called with. */
function queuedFetch(responses: FetchLikeResponse[]): { fetch: FetchLike; calls: string[] } {
  const calls: string[] = [];
  let i = 0;
  const fetch: FetchLike = async (url) => {
    calls.push(url);
    const r = responses[i++];
    if (!r) throw new Error('unexpected extra fetch call');
    return r;
  };
  return { fetch, calls };
}

const shopifyProduct = {
  id: 12345,
  title: 'Wool Coat',
  vendor: 'NorthWind',
  images: [{ src: 'https://cdn.shopify.com/a.jpg' }, { src: 'https://cdn.shopify.com/b.jpg' }],
  variants: [{ price: '249.00' }, { price: '259.00' }],
};

async function collect(connector: ShopifyConnector, limit?: number) {
  const out = [];
  for await (const p of connector.listProducts(limit === undefined ? undefined : { limit })) out.push(p);
  return out;
}

describe('ShopifyConnector normalization', () => {
  it('maps a product with multiple images and the lead variant price', async () => {
    const { fetch } = queuedFetch([res({ products: [shopifyProduct] })]);
    const products = await collect(new ShopifyConnector({ shop: 's.myshopify.com', token: 't', fetch }));
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      id: '12345',
      title: 'Wool Coat',
      vendor: 'NorthWind',
      price: 249,
      category: 'apparel',
      imageRefs: ['https://cdn.shopify.com/a.jpg', 'https://cdn.shopify.com/b.jpg'],
    });
  });

  it('sends the access token header and never the global fetch', async () => {
    let seenHeader: string | undefined;
    const fetch: FetchLike = async (_u, init) => {
      seenHeader = init?.headers?.['X-Shopify-Access-Token'];
      return res({ products: [] });
    };
    await collect(new ShopifyConnector({ shop: 's.myshopify.com', token: 'secret-tok', fetch }));
    expect(seenHeader).toBe('secret-tok'); // least-privilege auth header is wired through
  });
});

describe('ShopifyConnector pagination', () => {
  it('follows the Link rel="next" cursor across two pages', async () => {
    const link = '<https://s.myshopify.com/admin/api/2024-01/products.json?page_info=CURSOR2>; rel="next"';
    const p1 = res({ products: [{ ...shopifyProduct, id: 1 }] }, { link });
    const p2 = res({ products: [{ ...shopifyProduct, id: 2 }] }); // no link => stop
    const { fetch, calls } = queuedFetch([p1, p2]);
    const products = await collect(new ShopifyConnector({ shop: 's.myshopify.com', token: 't', fetch }));
    expect(products.map((p) => p.id)).toEqual(['1', '2']);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain('page_info=CURSOR2'); // second call carried the cursor
  });

  it('stops paginating when limit is reached mid-page', async () => {
    const link = '<https://s.myshopify.com/x?page_info=NEXT>; rel="next"';
    const p1 = res({ products: [{ ...shopifyProduct, id: 1 }, { ...shopifyProduct, id: 2 }] }, { link });
    const { fetch, calls } = queuedFetch([p1]);
    const products = await collect(new ShopifyConnector({ shop: 's.myshopify.com', token: 't', fetch }), 1);
    expect(products.map((p) => p.id)).toEqual(['1']);
    expect(calls).toHaveLength(1); // limit hit before the second page was ever fetched
  });
});

describe('ShopifyConnector fail-closed handling', () => {
  it('skips (not throws) a product with no images and records the skip', async () => {
    const noImages = { ...shopifyProduct, id: 9, images: [] };
    const { fetch } = queuedFetch([res({ products: [noImages, shopifyProduct] })]);
    const connector = new ShopifyConnector({ shop: 's.myshopify.com', token: 't', fetch });
    const products = await collect(connector);
    expect(products.map((p) => p.id)).toEqual(['12345']);
    expect(connector.skipped).toEqual([{ ref: '9', reason: expect.stringContaining('imageRef') }]);
  });

  it('skips a product missing a title and one with a null image src', async () => {
    const noTitle = { id: 7, images: [{ src: 'https://cdn/x.jpg' }], variants: [] };
    const nullSrc = { id: 8, title: 'X', images: [{ src: null }], variants: [] };
    const { fetch } = queuedFetch([res({ products: [noTitle, nullSrc, shopifyProduct] })]);
    const connector = new ShopifyConnector({ shop: 's.myshopify.com', token: 't', fetch });
    const products = await collect(connector);
    expect(products.map((p) => p.id)).toEqual(['12345']);
    expect(connector.skipped.map((s) => s.ref).sort()).toEqual(['7', '8']);
  });

  it('tolerates extra unknown fields on a product (does not break normalization)', async () => {
    const extra = { ...shopifyProduct, id: 5, tags: ['a'], options: [{ name: 'Size' }], junk: 42 };
    const { fetch } = queuedFetch([res({ products: [extra] })]);
    const products = await collect(new ShopifyConnector({ shop: 's.myshopify.com', token: 't', fetch }));
    expect(products[0]?.id).toBe('5');
  });

  it('ignores an unparseable variant price rather than emitting NaN', async () => {
    const badPrice = { ...shopifyProduct, id: 6, variants: [{ price: 'not-a-number' }] };
    const { fetch } = queuedFetch([res({ products: [badPrice] })]);
    const products = await collect(new ShopifyConnector({ shop: 's.myshopify.com', token: 't', fetch }));
    expect(products[0]?.price).toBeUndefined(); // dropped, not coerced to NaN
  });

  it('fails closed on a non-2xx page (no products, pagination halts)', async () => {
    const { fetch, calls } = queuedFetch([res({ products: [] }, { ok: false, status: 429 })]);
    const connector = new ShopifyConnector({ shop: 's.myshopify.com', token: 't', fetch });
    const products = await collect(connector);
    expect(products).toEqual([]);
    expect(connector.skipped[0]?.reason).toContain('429');
    expect(calls).toHaveLength(1);
  });

  it('handles a malformed body with no products array', async () => {
    const { fetch } = queuedFetch([res({ unexpected: true })]);
    const products = await collect(new ShopifyConnector({ shop: 's.myshopify.com', token: 't', fetch }));
    expect(products).toEqual([]);
  });

  it('skips a product with no usable id, recording ref "unknown"', async () => {
    // id is an object (neither number nor string) -> candidate id undefined -> "unknown" ref.
    const noId = { id: { nested: true }, title: 'X', images: [{ src: 'https://cdn/x.jpg' }], variants: [] };
    const { fetch } = queuedFetch([res({ products: [noId] })]);
    const connector = new ShopifyConnector({ shop: 's.myshopify.com', token: 't', fetch });
    expect(await collect(connector)).toEqual([]);
    expect(connector.skipped).toEqual([{ ref: 'unknown', reason: expect.any(String) }]);
  });

  it('tolerates non-array images and non-array variants on a record', async () => {
    // images is an object (not an array) and variants is a string -> both coerced to empty.
    const weird = { id: 3, title: 'Weird', images: { src: 'https://cdn/x.jpg' }, variants: 'oops' };
    const { fetch } = queuedFetch([res({ products: [weird] })]);
    const connector = new ShopifyConnector({ shop: 's.myshopify.com', token: 't', fetch });
    // no images survive -> the product is skipped fail-closed, never crashes on the bad shapes.
    expect(await collect(connector)).toEqual([]);
    expect(connector.skipped[0]?.ref).toBe('3');
  });

  it('drops a non-object image entry (e.g. a bare string) within the images array', async () => {
    const mixed = { id: 4, title: 'Mixed', images: ['bare-string', { src: 'https://cdn/ok.jpg' }], variants: [] };
    const { fetch } = queuedFetch([res({ products: [mixed] })]);
    const products = await collect(new ShopifyConnector({ shop: 's.myshopify.com', token: 't', fetch }));
    expect(products[0]?.imageRefs).toEqual(['https://cdn/ok.jpg']); // only the object.src survived
  });
});

describe('ShopifyConnector.getProduct', () => {
  it('returns the matching product', async () => {
    const { fetch } = queuedFetch([res({ products: [shopifyProduct] })]);
    const got = await new ShopifyConnector({ shop: 's.myshopify.com', token: 't', fetch }).getProduct('12345');
    expect(got?.title).toBe('Wool Coat');
  });

  it('returns null for a missing id (fail-closed lookup)', async () => {
    const { fetch } = queuedFetch([res({ products: [shopifyProduct] })]);
    const got = await new ShopifyConnector({ shop: 's.myshopify.com', token: 't', fetch }).getProduct('nope');
    expect(got).toBeNull();
  });
});

describe('nextPageInfo parser', () => {
  it('extracts page_info from a rel="next" link entry', () => {
    expect(nextPageInfo('<https://x/y?page_info=ABC&limit=5>; rel="next"')).toBe('ABC');
  });

  it('returns null when only a previous link is present', () => {
    expect(nextPageInfo('<https://x/y?page_info=ABC>; rel="previous"')).toBeNull();
  });

  it('returns null for a null/empty header', () => {
    expect(nextPageInfo(null)).toBeNull();
    expect(nextPageInfo('')).toBeNull();
  });

  it('picks next out of a combined previous+next header', () => {
    const h = '<https://x?page_info=PREV>; rel="previous", <https://x?page_info=NEXT>; rel="next"';
    expect(nextPageInfo(h)).toBe('NEXT');
  });

  it('returns null when a next entry has no <url> brackets', () => {
    expect(nextPageInfo('rel="next"')).toBeNull();
  });

  it('returns null when a next url carries no page_info param', () => {
    expect(nextPageInfo('<https://x/y?limit=5>; rel="next"')).toBeNull();
  });
});
