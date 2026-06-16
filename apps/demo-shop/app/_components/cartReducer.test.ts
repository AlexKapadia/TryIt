/**
 * Tests for the pure cart reducer that backs the shopping bag.
 *
 * The reducer is the deterministic heart of the bag: add (merging matching lines), set-quantity
 * (with zero-removes-line), and remove. We assert merge-by-product-and-size, that a different size
 * is a distinct line, and the quantity boundary at zero — the behaviours the header badge and
 * subtotal depend on.
 */

import { describe, it, expect } from 'vitest';
import { cartReducer, type CartLine } from './CartProvider';
import { PRODUCTS } from '../_data/products';

const product = PRODUCTS[0];

describe('cartReducer', () => {
  it('adds a new line for a fresh product+size', () => {
    const state = cartReducer([], { type: 'ADD', product, size: 'M' });
    expect(state).toHaveLength(1);
    expect(state[0]).toMatchObject({ productId: product.id, size: 'M', quantity: 1 });
  });

  it('merges quantity when the same product+size is added again', () => {
    let state: readonly CartLine[] = [];
    state = cartReducer(state, { type: 'ADD', product, size: 'M' });
    state = cartReducer(state, { type: 'ADD', product, size: 'M' });
    expect(state).toHaveLength(1);
    expect(state[0].quantity).toBe(2);
  });

  it('keeps different sizes of the same product as distinct lines', () => {
    let state: readonly CartLine[] = [];
    state = cartReducer(state, { type: 'ADD', product, size: 'M' });
    state = cartReducer(state, { type: 'ADD', product, size: 'L' });
    expect(state).toHaveLength(2);
  });

  it('sets a quantity and removes the line when set to zero or below', () => {
    let state = cartReducer([], { type: 'ADD', product, size: 'M' });
    state = cartReducer(state, { type: 'SET_QTY', productId: product.id, size: 'M', quantity: 5 });
    expect(state[0].quantity).toBe(5);
    state = cartReducer(state, { type: 'SET_QTY', productId: product.id, size: 'M', quantity: 0 });
    expect(state).toHaveLength(0);
  });

  it('removes a specific line, leaving others intact', () => {
    let state: readonly CartLine[] = [];
    state = cartReducer(state, { type: 'ADD', product, size: 'M' });
    state = cartReducer(state, { type: 'ADD', product, size: 'L' });
    state = cartReducer(state, { type: 'REMOVE', productId: product.id, size: 'M' });
    expect(state).toHaveLength(1);
    expect(state[0].size).toBe('L');
  });
});
