/**
 * app/_data/products.ts — the synthetic apparel catalogue for the ATELIER reference storefront.
 *
 * This is fictional sample data for a reference retailer that embeds the TryIt try-on widget.
 * It is intentionally self-contained and offline-capable: every image is a LOCAL asset under
 * `public/products/` (tasteful flat apparel silhouettes), so the storefront never depends on an
 * external image network. The catalogue is typed so pages and components can never reference a
 * field that does not exist, and so the e2e suite can rely on a stable shape.
 */

/** A single sellable apparel product in the reference catalogue. */
export interface Product {
  /** Stable slug used in the URL (`/product/[id]`) and as the try-on `productId`. */
  readonly id: string;
  /** Shopper-facing product name. */
  readonly name: string;
  /** Short merchandising category label (e.g. "Outerwear"). */
  readonly category: string;
  /** Price in whole GBP pence to avoid float rounding on a deterministic path. */
  readonly pricePence: number;
  /** One-paragraph product description shown on the detail page. */
  readonly description: string;
  /** Local SVG image path under `public/` — never a remote URL (offline-capable). */
  readonly image: string;
  /** A short list of selectable sizes; the first is the default. */
  readonly sizes: readonly string[];
  /** A short, human colour name shown as supporting metadata. */
  readonly colour: string;
}

/**
 * The catalogue. Six products spanning a few categories so the grid reads as a real shop, not a
 * uniform template. Prices are deliberate (not round) so the price formatter is genuinely exercised.
 */
export const PRODUCTS: readonly Product[] = [
  {
    id: 'merino-overshirt',
    name: 'Merino Overshirt',
    category: 'Outerwear',
    pricePence: 18500,
    description:
      'A mid-weight merino overshirt cut for layering. Soft brushed face, a clean placket, and a relaxed-but-deliberate shoulder. Wears open over a tee or buttoned as a light jacket.',
    image: '/products/merino-overshirt.svg',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    colour: 'Slate',
  },
  {
    id: 'oxford-shirt',
    name: 'Garment-Dyed Oxford',
    category: 'Shirts',
    pricePence: 9200,
    description:
      'A garment-dyed oxford with a lived-in hand from the first wear. Button-down collar, single chest pocket, and a tailored-not-tight body that tucks or untucks cleanly.',
    image: '/products/oxford-shirt.svg',
    sizes: ['S', 'M', 'L', 'XL'],
    colour: 'Ecru',
  },
  {
    id: 'pleated-trouser',
    name: 'Single-Pleat Trouser',
    category: 'Trousers',
    pricePence: 12800,
    description:
      'A single-pleat trouser in a dry, structured twill. A touch of taper through the leg with enough room to move. Sits at the natural waist with a clean, finished hem.',
    image: '/products/pleated-trouser.svg',
    sizes: ['28', '30', '32', '34', '36'],
    colour: 'Olive',
  },
  {
    id: 'crew-knit',
    name: 'Lambswool Crew',
    category: 'Knitwear',
    pricePence: 11500,
    description:
      'A fine-gauge lambswool crew with ribbed cuffs and hem. Light enough for indoors, warm enough to layer. A quiet staple that holds its shape wash after wash.',
    image: '/products/crew-knit.svg',
    sizes: ['XS', 'S', 'M', 'L'],
    colour: 'Oat',
  },
  {
    id: 'field-jacket',
    name: 'Waxed Field Jacket',
    category: 'Outerwear',
    pricePence: 24500,
    description:
      'A waxed-cotton field jacket with a four-pocket front and a corduroy collar. Weatherproof and hard-wearing, it earns a patina over years rather than wearing out.',
    image: '/products/field-jacket.svg',
    sizes: ['S', 'M', 'L', 'XL'],
    colour: 'Moss',
  },
  {
    id: 'tapered-tee',
    name: 'Heavyweight Tee',
    category: 'Essentials',
    pricePence: 4800,
    description:
      'A heavyweight cotton tee with a substantial, structured hand. A clean crew neck and a body cut to skim, not cling. The foundation layer for everything above.',
    image: '/products/tapered-tee.svg',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    colour: 'Black',
  },
];

/** Look up a single product by id, or `undefined` if no such product exists. */
export function getProductById(id: string): Product | undefined {
  return PRODUCTS.find((product) => product.id === id);
}

/**
 * Format a price (in pence) as a GBP string. Deterministic and exact to the penny — no float
 * arithmetic on the path that produces a displayed price.
 */
export function formatPrice(pence: number): string {
  const pounds = Math.floor(pence / 100);
  const remainder = (pence % 100).toString().padStart(2, '0');
  return `£${pounds.toString()}.${remainder}`;
}
