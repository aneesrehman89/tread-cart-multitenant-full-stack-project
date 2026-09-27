'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { api, initials, useApi } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { Avatar, Pill } from './ui';

export interface Shopper {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  groupId: string | null;
  addresses: {
    id: string;
    line1: string;
    line2: string | null;
    city: string;
    region: string;
    postalCode: string;
    country: string;
    isDefault: boolean;
  }[];
}

/** Shared header and footer for every storefront page. */
export function ShopLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const cart = useCart();
  const me = useApi<Shopper>('auth/me');
  const store = useApi<{ store: { name: string; brandPrimary: string; brandAccent: string } }>('home');
  const [search, setSearch] = useState('');

  const brand = store.data?.store.brandPrimary ?? '#0F5132';
  const signedIn = !!me.data?.id;

  async function signOut() {
    await api('auth/logout', { method: 'POST' }).catch(() => undefined);
    window.location.href = '/';
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/products?q=${encodeURIComponent(search.trim())}`);
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <span
              className="grid h-8 w-8 place-items-center rounded-lg text-xs font-bold text-white"
              style={{ backgroundColor: brand }}
            >
              {store.data ? initials(store.data.store.name) : 'TC'}
            </span>
            <span className="hidden text-sm font-semibold text-ink-900 sm:block">
              {store.data?.store.name ?? 'TreadCart'}
            </span>
          </Link>

          <form onSubmit={submitSearch} className="flex-1">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">
                <SearchIcon />
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tires, wheels, brands or sizes…"
                className="w-full rounded-full border border-ink-300 bg-canvas py-2 pl-9 pr-4 text-sm placeholder:text-ink-400 focus:border-brand-500 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </form>

          <nav className="flex shrink-0 items-center gap-1.5">
            <Link
              href="/cart"
              className="relative rounded-lg p-2 text-ink-600 hover:bg-ink-100 hover:text-ink-900"
              aria-label={`Cart, ${cart.count} items`}
            >
              <CartIcon />
              {cart.count > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold text-white"
                  style={{ backgroundColor: brand }}
                >
                  {cart.count}
                </span>
              )}
            </Link>

            {signedIn ? (
              <div className="flex items-center gap-1.5">
                <Link
                  href="/orders"
                  className="hidden rounded-lg px-2.5 py-2 text-xs font-medium text-ink-600 hover:bg-ink-100 sm:block"
                >
                  Orders
                </Link>
                <button onClick={signOut} title="Sign out" className="rounded-lg">
                  <Avatar
                    label={initials(`${me.data!.firstName ?? ''} ${me.data!.lastName ?? ''}`.trim() || me.data!.email)}
                    size="sm"
                    color={brand}
                  />
                </button>
              </div>
            ) : (
              <Link
                href="/account"
                className="rounded-lg px-3 py-2 text-xs font-medium text-ink-700 hover:bg-ink-100"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-12 border-t border-ink-200 bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-2xs text-ink-500">
          <span>
            © {new Date().getFullYear()} {store.data?.store.name ?? 'TreadCart'} · powered by
            TreadCart
          </span>
          <span className="flex gap-4">
            <Link href="/products" className="hover:text-ink-800">
              All products
            </Link>
            <Link href="/orders" className="hover:text-ink-800">
              My orders
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

/** Shows which pricing group a signed-in trade customer is getting. */
export function GroupBadge({ groupName }: { groupName?: string | null }) {
  if (!groupName) return null;
  return <Pill tone="info">{groupName} pricing</Pill>;
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="9" r="5.5" />
      <path d="m13.5 13.5 3 3" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 4h2l1.6 9.3a1 1 0 0 0 1 .7h7.2a1 1 0 0 0 1-.8L17 7H6" />
      <circle cx="8.5" cy="17" r="1.2" />
      <circle cx="15" cy="17" r="1.2" />
    </svg>
  );
}
