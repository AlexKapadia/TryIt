/**
 * Product detail route (`/product/[id]`).
 *
 * Server component: resolves the product from the synthetic catalogue and 404s on an unknown id
 * (never renders a broken page). The interactive body — gallery, size, add-to-bag, embedded
 * try-on — lives in the `ProductDetail` client island. `generateStaticParams` pre-renders every
 * catalogue page at build time.
 */

import { notFound } from 'next/navigation';
import { PRODUCTS, getProductById } from '../../_data/products';
import { ProductDetail } from './ProductDetail';

/** Pre-render a static page for every product in the catalogue. */
export function generateStaticParams(): Array<{ id: string }> {
  return PRODUCTS.map((product) => ({ id: product.id }));
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = getProductById(id);
  if (product === undefined) {
    notFound();
  }
  return <ProductDetail product={product} />;
}
