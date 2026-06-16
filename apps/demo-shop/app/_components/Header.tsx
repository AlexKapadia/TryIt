'use client';

/**
 * Header — the ATELIER storefront masthead: wordmark (links home), a slim nav, and the bag
 * button whose badge reflects live cart count. The bag button opens the CartDrawer it owns.
 *
 * Note the brand is "ATELIER" — a fictional reference retailer — NOT "TryIt". TryIt is the
 * embedded try-on capability, not the shop.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useCart } from './CartProvider';
import { CartDrawer } from './CartDrawer';
import styles from './Header.module.css';

export function Header() {
  const { count } = useCart();
  const [bagOpen, setBagOpen] = useState(false);

  return (
    <>
      <header className={styles.header}>
        <div className={styles.inner}>
          <Link href="/" className={styles.brand} aria-label="ATELIER — home" data-testid="brand">
            <span className={styles.wordmark}>ATELIER</span>
            <span className={styles.tagline}>Considered menswear</span>
          </Link>

          <nav className={styles.nav} aria-label="Primary">
            <Link href="/" className={styles.navLink}>
              Shop
            </Link>
            <span className={styles.navLink} aria-disabled="true" data-testid="nav-lookbook">
              Lookbook
            </span>
          </nav>

          <button
            type="button"
            className={styles.bag}
            onClick={() => setBagOpen(true)}
            aria-label={`Open bag, ${count} item${count === 1 ? '' : 's'}`}
            aria-haspopup="dialog"
            data-testid="cart-button"
          >
            <BagIcon />
            <span className={styles.bagLabel}>Bag</span>
            {count > 0 ? (
              <span className={styles.badge} data-testid="cart-badge" aria-hidden="true">
                {count}
              </span>
            ) : null}
          </button>
        </div>
      </header>
      <CartDrawer open={bagOpen} onClose={() => setBagOpen(false)} />
    </>
  );
}

/** A minimal, custom line-icon for the bag (no emoji, no stock icon — anti-slop §4). */
function BagIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M4 5.5h10l-.8 9.2a1 1 0 0 1-1 .8H5.8a1 1 0 0 1-1-.8L4 5.5Z" />
      <path d="M6.5 5.5V4.8a2.5 2.5 0 0 1 5 0v.7" />
    </svg>
  );
}
