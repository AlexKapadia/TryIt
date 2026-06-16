'use client';

/**
 * CartProvider — the client-side shopping bag state for the ATELIER storefront.
 *
 * A real (in-memory) cart so every "Add to bag" control actually mutates state and the header
 * badge reflects it — nothing static, no dead buttons (design-brief.md §3.8/§8). State is kept
 * deliberately small: a list of line items keyed by product + size, with quantities. There is no
 * persistence/network here on purpose — this is a reference storefront demonstrating the widget,
 * not a production checkout — but the surface is real-shaped so the e2e suite can assert on it.
 */

import { createContext, useCallback, useContext, useMemo, useReducer } from 'react';
import type { ReactNode } from 'react';
import { type Product } from '../_data/products';

/** A single line in the bag: a product, a chosen size, and a quantity. */
export interface CartLine {
  readonly productId: string;
  readonly name: string;
  readonly pricePence: number;
  readonly image: string;
  readonly size: string;
  readonly quantity: number;
}

/** The cart value exposed to consumers. */
interface CartContextValue {
  readonly lines: readonly CartLine[];
  /** Total number of items (sum of quantities) — drives the header badge. */
  readonly count: number;
  /** Sum of line prices × quantities, in pence. */
  readonly subtotalPence: number;
  /** Add a product (at a chosen size) to the bag, merging with an existing matching line. */
  readonly addItem: (product: Product, size: string) => void;
  /** Remove a line entirely. */
  readonly removeItem: (productId: string, size: string) => void;
  /** Set the quantity of a line; a quantity of 0 removes it. */
  readonly setQuantity: (productId: string, size: string, quantity: number) => void;
}

type CartAction =
  | { type: 'ADD'; product: Product; size: string }
  | { type: 'REMOVE'; productId: string; size: string }
  | { type: 'SET_QTY'; productId: string; size: string; quantity: number };

const lineKey = (productId: string, size: string): string => `${productId}::${size}`;

/** Pure reducer so cart transitions are deterministic and unit-testable without React. */
export function cartReducer(state: readonly CartLine[], action: CartAction): readonly CartLine[] {
  switch (action.type) {
    case 'ADD': {
      const key = lineKey(action.product.id, action.size);
      const existing = state.find((l) => lineKey(l.productId, l.size) === key);
      if (existing !== undefined) {
        return state.map((l) =>
          lineKey(l.productId, l.size) === key ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...state,
        {
          productId: action.product.id,
          name: action.product.name,
          pricePence: action.product.pricePence,
          image: action.product.image,
          size: action.size,
          quantity: 1,
        },
      ];
    }
    case 'REMOVE': {
      const key = lineKey(action.productId, action.size);
      return state.filter((l) => lineKey(l.productId, l.size) !== key);
    }
    case 'SET_QTY': {
      const key = lineKey(action.productId, action.size);
      if (action.quantity <= 0) {
        return state.filter((l) => lineKey(l.productId, l.size) !== key);
      }
      return state.map((l) =>
        lineKey(l.productId, l.size) === key ? { ...l, quantity: action.quantity } : l,
      );
    }
    default:
      return state;
  }
}

const CartContext = createContext<CartContextValue | null>(null);

/** Wrap the app so any component can read/mutate the bag. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, dispatch] = useReducer(cartReducer, []);

  const addItem = useCallback(
    (product: Product, size: string) => dispatch({ type: 'ADD', product, size }),
    [],
  );
  const removeItem = useCallback(
    (productId: string, size: string) => dispatch({ type: 'REMOVE', productId, size }),
    [],
  );
  const setQuantity = useCallback(
    (productId: string, size: string, quantity: number) =>
      dispatch({ type: 'SET_QTY', productId, size, quantity }),
    [],
  );

  const value = useMemo<CartContextValue>(() => {
    const count = lines.reduce((sum, l) => sum + l.quantity, 0);
    const subtotalPence = lines.reduce((sum, l) => sum + l.pricePence * l.quantity, 0);
    return { lines, count, subtotalPence, addItem, removeItem, setQuantity };
  }, [lines, addItem, removeItem, setQuantity]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/** Consume the cart. Throws if used outside a {@link CartProvider} (fail-fast, never silent). */
export function useCart(): CartContextValue {
  const value = useContext(CartContext);
  if (value === null) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return value;
}
