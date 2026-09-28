'use client';

import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useApi } from '@/lib/api';
import { applyStoreTheme, type StoreTheme } from '@/lib/theme';

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

export interface Store extends StoreTheme {
  name: string;
  slug: string;
  logoUrl: string | null;
}

interface StoreContextValue {
  store: Store | null;
  shopper: Shopper | null;
  loadingShopper: boolean;
  reloadShopper: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

// Loads the store and session once and applies the store theme.
export function StoreProvider({ children }: { children: ReactNode }) {
  const home = useApi<{ store: Store }>('home');
  const me = useApi<Shopper>('auth/me');

  useEffect(() => {
    if (home.data?.store) applyStoreTheme(home.data.store);
  }, [home.data]);

  const value = useMemo<StoreContextValue>(
    () => ({
      store: home.data?.store ?? null,
      // A 401 here is the ordinary guest state, not an error.
      shopper: me.data?.id ? me.data : null,
      loadingShopper: me.loading,
      reloadShopper: me.reload,
    }),
    [home.data, me.data, me.loading, me.reload],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
