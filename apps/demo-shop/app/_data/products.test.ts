/**
 * Tests for the synthetic catalogue and the price formatter.
 *
 * These guard the deterministic data the storefront renders: every product is well-formed, every
 * image is a LOCAL path (offline-capable, no external network), lookups behave, and price
 * formatting is exact to the penny across boundary values (zero pence, sub-£1, large amounts).
 */

import { describe, it, expect } from 'vitest';
import { PRODUCTS, getProductById, formatPrice } from './products';

describe('PRODUCTS catalogue', () => {
  it('contains 5–6 products with unique ids', () => {
    expect(PRODUCTS.length).toBeGreaterThanOrEqual(5);
    expect(PRODUCTS.length).toBeLessThanOrEqual(6);
    const ids = PRODUCTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every product is fully populated and well-shaped', () => {
    for (const product of PRODUCTS) {
      expect(product.id).toMatch(/^[a-z0-9-]+$/);
      expect(product.name.length).toBeGreaterThan(0);
      expect(product.category.length).toBeGreaterThan(0);
      expect(product.pricePence).toBeGreaterThan(0);
      expect(Number.isInteger(product.pricePence)).toBe(true);
      expect(product.description.length).toBeGreaterThan(20);
      expect(product.sizes.length).toBeGreaterThan(0);
      expect(product.colour.length).toBeGreaterThan(0);
    }
  });

  it('uses only local, offline-capable image assets (never an external URL)', () => {
    for (const product of PRODUCTS) {
      expect(product.image.startsWith('/products/')).toBe(true);
      expect(product.image.endsWith('.svg')).toBe(true);
      expect(product.image).not.toMatch(/^https?:/);
    }
  });
});

describe('getProductById', () => {
  it('returns the matching product', () => {
    const first = PRODUCTS[0];
    expect(getProductById(first.id)).toEqual(first);
  });

  it('returns undefined for an unknown id (fail closed, no fallback product)', () => {
    expect(getProductById('does-not-exist')).toBeUndefined();
    expect(getProductById('')).toBeUndefined();
  });
});

describe('formatPrice', () => {
  it('formats whole and fractional pounds exactly to the penny', () => {
    expect(formatPrice(18500)).toBe('£185.00');
    expect(formatPrice(9200)).toBe('£92.00');
    expect(formatPrice(4801)).toBe('£48.01');
    expect(formatPrice(4)).toBe('£0.04');
    expect(formatPrice(40)).toBe('£0.40');
    expect(formatPrice(0)).toBe('£0.00');
  });

  it('pads the pence to two digits at the boundary', () => {
    expect(formatPrice(105)).toBe('£1.05');
    expect(formatPrice(110)).toBe('£1.10');
    expect(formatPrice(199)).toBe('£1.99');
  });
});
