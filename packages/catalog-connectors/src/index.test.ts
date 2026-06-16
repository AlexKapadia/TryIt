/**
 * Barrel smoke test — asserts the public surface is re-exported from the package root so
 * downstream consumers import from one place and the connectors satisfy the shared interface.
 */

import { describe, expect, it } from 'vitest';
import {
  ShopifyConnector,
  GenericRestConnector,
  parseNormalizedProduct,
  NormalizedProductSchema,
  DEFAULT_CATEGORY,
  nextPageInfo,
  getByPath,
} from './index.js';
import type { CatalogConnector } from './index.js';

describe('package barrel', () => {
  it('re-exports every connector and product helper', () => {
    expect(ShopifyConnector).toBeTypeOf('function');
    expect(GenericRestConnector).toBeTypeOf('function');
    expect(parseNormalizedProduct).toBeTypeOf('function');
    expect(NormalizedProductSchema).toBeDefined();
    expect(nextPageInfo).toBeTypeOf('function');
    expect(getByPath).toBeTypeOf('function');
    expect(DEFAULT_CATEGORY).toBe('apparel');
  });

  it('both connectors structurally satisfy the CatalogConnector interface', () => {
    const noopFetch = async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({}) });
    const shopify: CatalogConnector = new ShopifyConnector({ shop: 's.myshopify.com', token: 't', fetch: noopFetch });
    const generic: CatalogConnector = new GenericRestConnector({
      url: 'https://api/x',
      fetch: noopFetch,
      mapping: { idPath: 'id', titlePath: 't', imagePath: 'img' },
    });
    expect(shopify.listProducts).toBeTypeOf('function');
    expect(shopify.getProduct).toBeTypeOf('function');
    expect(generic.listProducts).toBeTypeOf('function');
    expect(generic.getProduct).toBeTypeOf('function');
  });
});
