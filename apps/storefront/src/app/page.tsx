'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { money, useApi } from '@/lib/api';
import { ShopLayout } from '@/components/shop-chrome';
import { SplashSlider, type Slide } from '@/components/splash';
import { Card, EmptyState, ErrorNote, Loading, titleCase } from '@/components/ui';
import { ProductGrid, type Product } from '@/components/product';

const SPLASH_SEEN_KEY = 'treadcart.splashSeen.v1';

const SLIDES: Slide[] = [
  {
    title: 'The right tires, first time',
    body: 'Search by size or by your vehicle. Every listing shows the exact fitment, load index and speed rating — no guesswork at the counter.',
    from: '#0B3325',
    to: '#1F6B46',
    art: 'tire',
  },
  {
    title: 'Wheels that actually fit',
    body: 'Bolt pattern, offset and centre bore on every wheel, checked against your car before you add it to the cart.',
    from: '#12324F',
    to: '#1D6FA5',
    art: 'wheel',
  },
  {
    title: 'Trade pricing, built in',
    body: 'Workshops and fleets get their own pricing automatically at checkout. Volume breaks apply themselves.',
    from: '#3B2410',
    to: '#A3611A',
    art: 'fitment',
  },
];

interface HomeData {
  store: { name: string; brandPrimary: string; brandAccent: string };
  categories: { type: string; count: number }[];
  brands: { name: string; slug: string; products: number }[];
  featured: Product[];
  deals: Product[];
}


export default function HomePage() {
  // Splash shows once per browser; after that the store is the landing page.
  const [showSplash, setShowSplash] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setShowSplash(window.localStorage.getItem(SPLASH_SEEN_KEY) !== '1');
    } catch {
      setShowSplash(false);
    }
  }, []);

  function dismissSplash() {
    try {
      window.localStorage.setItem(SPLASH_SEEN_KEY, '1');
    } catch {
      // Blocked storage just means it shows again next visit.
    }
    setShowSplash(false);
  }

  // Render nothing until we know, to avoid a flash of the wrong screen.
  if (showSplash === null) return <div className="min-h-screen bg-canvas" />;
  if (showSplash) return <SplashSlider slides={SLIDES} onDone={dismissSplash} />;

  return <Storefront />;
}

function Storefront() {
  const { data, error, loading, reload } = useApi<HomeData>('home');

  return (
    <ShopLayout>
      {error && (
        <div className="mx-auto max-w-7xl px-4 py-6">
          <ErrorNote message={error} onRetry={reload} />
        </div>
      )}
      {loading && !data && <Loading label="Loading the store" />}

      {data && (
        <div className="mx-auto max-w-7xl space-y-10 px-4 py-6">
          {/* Hero */}
          <section
            className="relative overflow-hidden rounded-card px-8 py-12"
            style={{
              background: `linear-gradient(135deg, ${data.store.brandPrimary}, ${shade(data.store.brandPrimary)})`,
            }}
          >
            <div className="relative z-10 max-w-lg">
              <p className="text-2xs font-medium uppercase tracking-widest text-white/60">
                {data.store.name}
              </p>
              <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-white">
                Tires and wheels, fitted to your car.
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-white/75">
                Search by size or browse by brand. Trade and fleet pricing applies automatically
                once you sign in.
              </p>
              <Link href="/products">
                <span
                  className="mt-6 inline-block rounded-full px-5 py-2.5 text-sm font-semibold"
                  style={{ backgroundColor: data.store.brandAccent, color: '#0B3325' }}
                >
                  Shop all products
                </span>
              </Link>
            </div>
            <div className="pointer-events-none absolute -right-10 -top-10 h-64 w-64 rounded-full bg-white/5" />
            <div className="pointer-events-none absolute -bottom-20 right-24 h-56 w-56 rounded-full bg-white/5" />
          </section>

          {/* Categories */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Shop by category</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {data.categories.map((c) => (
                <Link key={c.type} href={`/products?type=${c.type}`}>
                  <Card className="transition-shadow hover:shadow-pop">
                    <p className="text-sm font-medium text-ink-900">{titleCase(c.type)}s</p>
                    <p className="mt-0.5 text-2xs text-ink-500">{c.count} products</p>
                  </Card>
                </Link>
              ))}
              {data.brands.slice(0, 4).map((b) => (
                <Link key={b.slug} href={`/products?brand=${b.slug}`}>
                  <Card className="transition-shadow hover:shadow-pop">
                    <p className="text-sm font-medium text-ink-900">{b.name}</p>
                    <p className="mt-0.5 text-2xs text-ink-500">{b.products} products</p>
                  </Card>
                </Link>
              ))}
            </div>
          </section>

          {data.deals.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-ink-900">Deals</h2>
              <ProductGrid products={data.deals} />
            </section>
          )}

          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-ink-900">Featured</h2>
              <Link href="/products" className="text-xs font-medium text-brand-600 hover:underline">
                View all
              </Link>
            </div>
            {data.featured.length === 0 ? (
              <Card>
                <EmptyState title="This store has no products yet" />
              </Card>
            ) : (
              <ProductGrid products={data.featured} />
            )}
          </section>
        </div>
      )}
    </ShopLayout>
  );
}

/** Darkens a hex colour for the hero gradient's second stop. */
function shade(hex: string, amount = 0.35): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.round((n & 255) * (1 - amount)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
