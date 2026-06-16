/**
 * Storefront home — a restrained editorial hero over a real product grid.
 *
 * Server-rendered. The grid is the one strong layout primitive repeated (a flow of considered
 * pieces), not a template dashboard of feature cards. Each tile links to a real product page that
 * carries the embedded try-on. The hero states the proposition (try before you buy) without stock
 * art — restraint over fireworks (design-brief.md §3/§4).
 */

import { PRODUCTS } from './_data/products';
import { ProductCard } from './_components/ProductCard';
import styles from './page.module.css';

export default function StorefrontPage() {
  return (
    <main className={styles.main}>
      <section className={styles.hero} aria-labelledby="hero-title">
        <p className={styles.eyebrow}>Autumn / Winter</p>
        <h1 id="hero-title" className={styles.heroTitle}>
          Considered pieces,
          <br />
          tried on before you commit.
        </h1>
        <p className={styles.heroBody}>
          A small, deliberate collection. Drop in a photo on any piece to see how it sits — then add
          it to your bag with confidence.
        </p>
      </section>

      <section className={styles.gridSection} aria-labelledby="collection-title">
        <div className={styles.gridHeader}>
          <h2 id="collection-title" className={styles.gridTitle}>
            The collection
          </h2>
          <span className={styles.gridCount}>{PRODUCTS.length} pieces</span>
        </div>
        <div className={styles.grid} data-testid="product-grid">
          {PRODUCTS.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <p>
          ATELIER is a fictional reference storefront demonstrating the{' '}
          <strong>TryIt</strong> virtual try-on widget.
        </p>
      </footer>
    </main>
  );
}
