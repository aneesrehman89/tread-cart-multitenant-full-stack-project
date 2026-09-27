'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { api, initials } from '@/lib/api';
import { useSession, type SellerMe } from './session';
import { Avatar, Pill, titleCase } from './ui';

export type { SellerMe };

/**
 * Nav entries carry the permission that gates their screen, so a catalog
 * editor never sees an Orders link that would 403 when clicked.
 */
const NAV = [
  { href: '/', label: 'Dashboard', icon: IconGrid, permission: 'order:read' },
  { href: '/products', label: 'Products', icon: IconTag, permission: 'catalog:read' },
  { href: '/orders', label: 'Orders', icon: IconBag, permission: 'order:read' },
  { href: '/customers', label: 'Customers', icon: IconUser, permission: 'customer:read' },
  { href: '/pricing', label: 'Pricing groups', icon: IconPrice, permission: 'pricing:read' },
  { href: '/reports', label: 'Reports', icon: IconChart, permission: 'order:read' },
  { href: '/settings', label: 'Storefront settings', icon: IconCog, permission: 'catalog:read' },
  { href: '/staff', label: 'Staff & roles', icon: IconShield, permission: 'staff:manage' },
] as const;

export function Shell({ children, breadcrumb }: { children: ReactNode; breadcrumb?: string[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me } = useSession();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await api('auth/logout', { method: 'POST' });
    } finally {
      router.push('/login');
    }
  }

  const allowed = NAV.filter((n) => !me || me.permissions.includes(n.permission));

  return (
    <div className="flex min-h-screen bg-canvas">
      <aside
        className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col lg:flex"
        style={{
          background:
            'linear-gradient(to bottom, var(--store-brand, #0F4230), var(--store-brand-deep, #072219))',
        }}
      >
        <div className="flex items-center gap-2.5 px-5 py-5">
          {/* The store's own brand colour, not the platform's. */}
          <span
            className="grid h-7 w-7 place-items-center rounded-lg text-xs font-bold text-white"
            style={{ backgroundColor: me?.store.brandAccent ?? '#84CC16' }}
          >
            {me ? initials(me.store.name) : 'TC'}
          </span>
          <span className="truncate text-sm font-semibold text-white">
            {me?.store.name ?? 'TreadCart'}
          </span>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-2">
          {allowed.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors ${
                  active ? 'font-medium text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
                style={{
                  borderRadius: 'var(--btn-radius, 0.5rem)',
                  backgroundColor: active ? 'rgba(255,255,255,0.16)' : undefined,
                }}
              >
                <Icon />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3">
          <div className="flex items-center gap-2.5 rounded-lg bg-black/25 px-3 py-2.5">
            <Avatar label={me ? initials(me.name) : '··'} color="#84CC16" size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-white">{me?.name ?? 'Loading'}</p>
              <p className="truncate text-2xs text-white/60">
                {me ? titleCase(me.role) : ''}
              </p>
            </div>
            <button
              onClick={signOut}
              disabled={signingOut}
              title="Sign out"
              className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white"
            >
              <IconExit />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-ink-200 bg-surface/95 px-6 py-3 backdrop-blur">
          <nav className="flex items-center gap-1.5 text-xs text-ink-500">
            <span>{me?.store.name ?? 'Store'}</span>
            {(breadcrumb ?? []).map((crumb) => (
              <span key={crumb} className="flex items-center gap-1.5">
                <IconChevron />
                <span className="font-medium text-ink-800">{crumb}</span>
              </span>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {me && <Pill tone={me.store.status === 'ACTIVE' ? 'success' : 'danger'}>{titleCase(me.store.status)}</Pill>}
            <Avatar label={me ? initials(me.name) : '··'} size="sm" color={me?.store.brandPrimary} />
          </div>
        </header>

        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}

/**
 * Bounces to /login when there is no live session.
 *
 * Reads the shared session rather than issuing its own auth/me — that extra
 * request was serialised in front of every screen's own data fetch.
 */
export function useRequireSeller(): boolean {
  const router = useRouter();
  const { me, loading, isPublic } = useSession();

  useEffect(() => {
    // Only once the shared session has actually resolved, and never on a
    // public route — redirecting mid-load caused a reload loop.
    if (!isPublic && !loading && !me) router.replace('/login');
  }, [loading, me, isPublic, router]);

  return !!me;
}

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
function IconTag() {
  return (
    <svg className={ICON} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 3h6l8 8-6 6-8-8V3Z" />
      <circle cx="6.5" cy="6.5" r="1.2" />
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
function IconUser() {
  return (
    <svg className={ICON} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="6.5" r="3" />
      <path d="M4 17c0-3.3 2.7-5 6-5s6 1.7 6 5" />
    </svg>
  );
}
function IconPrice() {
  return (
    <svg className={ICON} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 3v14M13.5 6.5c0-1.4-1.6-2.2-3.5-2.2s-3.5.8-3.5 2.4S8 9 10 9.4s3.6 1 3.6 2.6-1.7 2.4-3.6 2.4-3.6-.8-3.6-2.3" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg className={ICON} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 17h14M6 14V8M10 14V4M14 14v-4" />
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
