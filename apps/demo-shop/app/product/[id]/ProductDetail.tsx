'use client';

/**
 * ProductDetail — the interactive product page body: gallery, size selector, add-to-bag, and the
 * embedded try-on. Client component because size selection, add-to-bag, and the success toast are
 * stateful and wired to the cart. Nothing here is static — every control fires a real action.
 */

import { useState } from 'react';
import Link from 'next/link';
import { type Product, formatPrice } from '../../_data/products';
import { useCart } from '../../_components/CartProvider';
import { TryOnLauncher } from '../../_components/TryOnLauncher';
import styles from './ProductDetail.module.css';

export function ProductDetail({ product }: { product: Product }) {
  const { addItem } = useCart();
  const [size, setSize] = useState<string>(product.sizes[0]);
  const [added, setAdded] = useState(false);

  const onAddToBag = (): void => {
    addItem(product, size);
    setAdded(true);
    // Clear the confirmation after a moment so repeated adds re-announce.
    window.setTimeout(() => setAdded(false), 2400);
  };

  return (
    <main className={styles.main}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <Link href="/" className={styles.crumbLink}>
          Shop
        </Link>
        <span aria-hidden="true" className={styles.crumbSep}>
          /
        </span>
        <span className={styles.crumbCurrent}>{product.name}</span>
      </nav>

      <div className={styles.layout}>
        <div className={styles.gallery}>
          <div className={styles.mainImage}>
            {/* Local SVG asset, offline-capable — next/image is unnecessary for inline vector art. */}
            <img
              src={product.image}
              alt={`${product.name} in ${product.colour}`}
              width={480}
              height={600}
              data-testid="product-hero-image"
            />
          </div>
        </div>

        <div className={styles.info}>
          <p className={styles.category}>{product.category}</p>
          <h1 className={styles.name}>{product.name}</h1>
          <p className={styles.price} data-testid="detail-price">
            {formatPrice(product.pricePence)}
          </p>
          <p className={styles.description}>{product.description}</p>

          <div className={styles.sizeBlock}>
            <span className={styles.sizeLabel}>Size · {size}</span>
            <div className={styles.sizeOptions} role="radiogroup" aria-label="Select a size">
              {product.sizes.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={option === size}
                  className={`${styles.sizeOption} ${option === size ? styles.sizeOptionActive : ''}`}
                  onClick={() => setSize(option)}
                  data-testid="size-option"
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.addToBag}
              onClick={onAddToBag}
              data-testid="add-to-bag"
            >
              Add to bag — {formatPrice(product.pricePence)}
            </button>
            <TryOnLauncher product={product} />
          </div>

          <p className={styles.confirm} role="status" aria-live="polite" data-testid="add-confirm">
            {added ? `Added ${product.name} (size ${size}) to your bag.` : ' '}
          </p>

          <ul className={styles.trust}>
            <li>Free returns within 30 days</li>
            <li>Try it on with a photo before you buy</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
