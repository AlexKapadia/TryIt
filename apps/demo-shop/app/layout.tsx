/**
 * Root layout for the ATELIER reference storefront.
 *
 * Loads the design-token stylesheet, wraps the tree in the client cart state, and renders the
 * shared header (with its live bag badge + drawer) above every page. The shop is server-rendered;
 * only the genuinely-interactive islands (cart, try-on launcher) are client components.
 */

import type { ReactNode } from 'react';
import './globals.css';
import { CartProvider } from './_components/CartProvider';
import { Header } from './_components/Header';

export const metadata = {
  title: 'ATELIER — Considered menswear',
  description:
    'A reference storefront for the TryIt virtual try-on widget: browse, try a piece on with a photo, and add it to your bag.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <CartProvider>
          <Header />
          {children}
        </CartProvider>
      </body>
    </html>
  );
}
