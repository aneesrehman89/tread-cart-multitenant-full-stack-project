import type { Metadata } from 'next';
import { SellerSessionProvider } from '@/components/session';
import './globals.css';

export const metadata: Metadata = {
  title: 'TreadCart — Seller',
  description: 'Run your tire and wheel store on TreadCart.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans" suppressHydrationWarning>
        {/* One auth/me for the whole app; also applies the store's theme. */}
        <SellerSessionProvider>{children}</SellerSessionProvider>
      </body>
    </html>
  );
}
