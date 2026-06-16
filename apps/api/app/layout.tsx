import type { ReactNode } from 'react';

export const metadata = {
  title: 'TryIt API',
  description: 'Open-Source Virtual Try-On for Retail — API service.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
