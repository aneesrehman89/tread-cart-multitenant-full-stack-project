import type { Metadata } from 'next';
import { CartProvider } from '@/lib/cart';
import './globals.css';

export const metadata: Metadata = {
  title: 'TreadCart — Tires & Wheels',
  description: 'Tires, wheels and fitment, delivered.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans">
        {/* The cart must survive navigation, so it lives above the router. */}
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
