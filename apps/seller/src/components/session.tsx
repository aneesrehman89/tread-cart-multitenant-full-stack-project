'use client';

import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useApi } from '@/lib/api';
import { applyStoreTheme, type StoreTheme } from '@/lib/theme';

export interface SellerMe {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  store: StoreTheme & {
    slug: string;
    name: string;
    status: string;
    logoUrl: string | null;
  };
}

interface SessionValue {
  me: SellerMe | null;
  loading: boolean;
  error: string | null;
  /** True on routes that do not need a session, so guards stay quiet. */
  isPublic: boolean;
  reload: () => void;
  can: (permission: string) => boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

// Fetches the session (and store theme) once for the whole app.
/** Routes reachable without a session. The provider stays quiet on these. */
const PUBLIC_ROUTES = ['/login', '/signup', '/auth'];

export function SellerSessionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_ROUTES.some((p) => pathname === p || pathname.startsWith(p + '/'));

  // Skip on auth pages, where a 401 is expected.
  const { data, error, loading, reload } = useApi<SellerMe>(isPublic ? null : 'auth/me');

  // Paint the store's own brand onto the dashboard chrome.
  useEffect(() => {
    if (data?.store) applyStoreTheme(data.store);
  }, [data]);

  const value = useMemo<SessionValue>(
    () => ({
      me: data,
      // On a public route nothing is loading and nothing is missing.
      loading: isPublic ? false : loading,
      error,
      isPublic,
      reload,
      can: (permission: string) => data?.permissions.includes(permission) ?? false,
    }),
    [data, loading, error, reload, isPublic],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SellerSessionProvider>');
  return ctx;
}
