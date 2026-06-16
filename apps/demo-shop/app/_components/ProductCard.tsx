/**
 * ProductCard — one product tile in the storefront grid. A server component (no interactivity of
 * its own beyond the link): the whole card is a link to the product detail page. Depth comes from
 * a single 1px hairline border and a restrained hover lift — NOT a uniform drop-shadow (anti-slop).
 */

import Link from 'next/link';
import { type Product, formatPrice } from '../_data/products';
import styles from './ProductCard.module.css';

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      href={`/product/${product.id}`}
      className={styles.card}
      data-testid="product-card"
      data-product-id={product.id}
    >
      <div className={styles.media}>
        {/* Local SVG asset, offline-capable — next/image is unnecessary for inline vector art. */}
        <img
          className={styles.image}
          src={product.image}
          alt={`${product.name} in ${product.colour}`}
          width={480}
          height={600}
          loading="lazy"
        />
        <span className={styles.category}>{product.category}</span>
      </div>
      <div className={styles.body}>
        <h3 className={styles.name}>{product.name}</h3>
        <div className={styles.meta}>
          <span className={styles.colour}>{product.colour}</span>
          <span className={styles.price} data-testid="product-price">
            {formatPrice(product.pricePence)}
          </span>
        </div>
      </div>
    </Link>
  );
}
