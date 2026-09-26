'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { api, initials, useApi } from '@/lib/api';
import { Avatar } from './ui';

interface Me {
  id: string;
  name: string;
  email: string;
  role: string;
}

const NAV = [
  { href: '/', label: 'Dashboard', icon: IconGrid },
  { href: '/stores', label: 'Stores', icon: IconStore },
  { href: '/catalog', label: 'Global catalog', icon: IconTag },
  { href: '/customers', label: 'Customers', icon: IconUser },
  { href: '/orders', label: 'Orders', icon: IconBag },
  { href: '/support', label: 'Support', icon: IconChat },
  { href: '/marketing', label: 'Marketing', icon: IconSend },
  { href: '/users', label: 'Users & permissions', icon: IconShield },
  { href: '/account', label: 'My account', icon: IconCog },
];

export function Shell({ children, breadcrumb }: { children: ReactNode; breadcrumb?: string[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me } = useApi<Me>('auth/me');
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await api('auth/logout', { method: 'POST' });
    } finally {
      router.push('/login');
    }
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-gradient-to-b from-brand-800 to-brand-950 lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-500 text-xs font-bold text-brand-950">
            T
          </span>
          <span className="text-sm font-semibold text-white">TreadCart</span>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-2">
          {NAV.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors ${
                  active
                    ? 'bg-brand-700/70 font-medium text-white'
                    : 'text-brand-100/80 hover:bg-brand-800/60 hover:text-white'
                }`}
              >
                <Icon />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3">
          <div className="flex items-center gap-2.5 rounded-lg bg-brand-900/60 px-3 py-2.5">
            <Avatar label={me ? initials(me.name) : '··'} color="#84CC16" size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-white">{me?.name ?? 'Loading'}</p>
              <p className="truncate text-2xs text-brand-200">Platform admin</p>
            </div>
            <button
              onClick={signOut}
              disabled={signingOut}
              title="Sign out"
              className="rounded p-1 text-brand-200 hover:bg-brand-800 hover:text-white"
            >
              <IconExit />
            </button>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-ink-200 bg-surface/95 px-6 py-3 backdrop-blur">
          <nav className="flex items-center gap-1.5 text-xs text-ink-500">
            <span>TreadCart</span>
            {(breadcrumb ?? []).map((crumb) => (
              <span key={crumb} className="flex items-center gap-1.5">
                <IconChevron />
                <span className="font-medium text-ink-800">{crumb}</span>
              </span>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden rounded-lg bg-ink-100 px-2.5 py-1 text-2xs font-medium text-ink-600 sm:inline">
              Marketplace
            </span>
            <Avatar label={me ? initials(me.name) : '··'} size="sm" />
          </div>
        </header>

        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}

/** Bounces to /login when the session cookie is missing or has expired. */
export function useRequireAuth() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    api('auth/me')
      .then(() => setChecked(true))
      .catch(() => router.replace('/login'));
  }, [router]);

  return checked;
}

// --- icons (inline so the app pulls in no icon dependency) ----------------

const ICON = 'h-4 w-4 shrink-0';

function IconGrid() {
  return (
    <svg className={ICON} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="3" width="6" height="6" rx="1.5" />
      <rect x="11" y="3" width="6" height="6" rx="1.5" />
      <rect x="3" y="11" width="6" height="6" rx="1.5" />
      <rect x="11" y="11" width="6" height="6" rx="1.5" />
    </svg>
  );
}
function IconStore() {
  return (
    <svg className={ICON} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 7h14v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z" />
      <path d="M3 7l1.5-4h11L17 7" />
    </svg>
  );
}
function IconTag() {
  return (
    <svg className={ICON} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 3h6l8 8-6 6-8-8V3Z" />
      <circle cx="6.5" cy="6.5" r="1.2" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg className={ICON} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="6.5" r="3" />
      <path d="M4 17c0-3.3 2.7-5 6-5s6 1.7 6 5" />
    </svg>
  );
}
function IconBag() {
  return (
    <svg className={ICON} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 6h12l-1 11H5L4 6Z" />
      <path d="M7.5 6V4.5a2.5 2.5 0 0 1 5 0V6" />
    </svg>
  );
}
function IconChat() {
  return (
    <svg className={ICON} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h11A1.5 1.5 0 0 1 17 5.5v7a1.5 1.5 0 0 1-1.5 1.5H8l-4 3v-3H4.5A1.5 1.5 0 0 1 3 12.5v-7Z" />
    </svg>
  );
}
function IconSend() {
  return (
    <svg className={ICON} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M17 3 9 11M17 3l-5 14-3-6-6-3 14-5Z" />
    </svg>
  );
}
function IconShield() {
  return (
    <svg className={ICON} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 2.5 16 5v5c0 4-2.6 6.4-6 7.5C6.6 16.4 4 14 4 10V5l6-2.5Z" />
    </svg>
  );
}
function IconCog() {
  return (
    <svg className={ICON} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1 4.7 4.7" />
    </svg>
  );
}
function IconExit() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M8 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M13 13l3-3-3-3M16 10H8" />
    </svg>
  );
}
function IconChevron() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m8 5 5 5-5 5" />
    </svg>
  );
}
