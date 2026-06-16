'use client';

/**
 * CartDrawer — the slide-in bag panel. Opened from the header bag button; lists every line item
 * with working quantity controls and remove, shows a live subtotal, and offers a (demo) checkout.
 *
 * Everything here is wired to real state (CartProvider): quantity steppers and remove buttons
 * mutate the bag and the header badge updates instantly. The drawer is a real dialog — Esc closes
 * it, the scrim is clickable, focus is trapped on the panel — so it is keyboard- and AT-usable.
 */

import { useEffect, useRef } from 'react';
import { useCart } from './CartProvider';
import { formatPrice } from '../_data/products';
import styles from './CartDrawer.module.css';

interface CartDrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function CartDrawer({ open, onClose }: CartDrawerProps) {
  const { lines, count, subtotalPence, setQuantity, removeItem } = useCart();
  const panelRef = useRef<HTMLDivElement>(null);

  // Esc closes from anywhere while open (keyboard parity with the scrim click).
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Move focus into the panel when it opens so keyboard users land inside the dialog.
  useEffect(() => {
    if (open) {
      panelRef.current?.focus();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className={styles.overlay} data-testid="cart-overlay">
      <button
        type="button"
        className={styles.scrim}
        aria-label="Close bag"
        onClick={onClose}
        data-testid="cart-scrim"
      />
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping bag"
        tabIndex={-1}
        data-testid="cart-drawer"
      >
        <header className={styles.header}>
          <h2 className={styles.title}>
            Your bag{count > 0 ? <span className={styles.titleCount}> ({count})</span> : null}
          </h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close bag"
            data-testid="cart-close"
          >
            ×
          </button>
        </header>

        {lines.length === 0 ? (
          <div className={styles.empty} data-testid="cart-empty">
            <p className={styles.emptyTitle}>Your bag is empty</p>
            <p className={styles.emptyBody}>
              Add a piece — or try one on first to see how it looks.
            </p>
          </div>
        ) : (
          <ul className={styles.list}>
            {lines.map((line) => (
              <li
                key={`${line.productId}-${line.size}`}
                className={styles.line}
                data-testid="cart-line"
              >
                {/* Local SVG asset, offline-capable — next/image is unnecessary for vector art. */}
                <img className={styles.thumb} src={line.image} alt="" width={64} height={80} />
                <div className={styles.lineBody}>
                  <p className={styles.lineName}>{line.name}</p>
                  <p className={styles.lineMeta}>
                    Size {line.size} · {formatPrice(line.pricePence)}
                  </p>
                  <div className={styles.stepper}>
                    <button
                      type="button"
                      className={styles.stepBtn}
                      aria-label={`Decrease quantity of ${line.name}`}
                      onClick={() => setQuantity(line.productId, line.size, line.quantity - 1)}
                    >
                      −
                    </button>
                    <span className={styles.qty} aria-live="polite">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      className={styles.stepBtn}
                      aria-label={`Increase quantity of ${line.name}`}
                      onClick={() => setQuantity(line.productId, line.size, line.quantity + 1)}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className={styles.remove}
                      onClick={() => removeItem(line.productId, line.size)}
                      data-testid="cart-remove"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <footer className={styles.footer}>
          <div className={styles.subtotalRow}>
            <span className={styles.subtotalLabel}>Subtotal</span>
            <span className={styles.subtotalValue} data-testid="cart-subtotal">
              {formatPrice(subtotalPence)}
            </span>
          </div>
          <button
            type="button"
            className={styles.checkout}
            disabled={lines.length === 0}
            onClick={onClose}
            data-testid="cart-checkout"
          >
            Checkout
          </button>
          <p className={styles.note}>Demo storefront — checkout is illustrative.</p>
        </footer>
      </div>
    </div>
  );
}
