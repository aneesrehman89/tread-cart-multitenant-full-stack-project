'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from './api';

// Stores only SKU ids and quantities; all pricing comes from the server.

export interface CartLine {
  skuId: string;
  quantity: number;
}

export interface QuoteItem {
  skuId: string;
  sku: string;
  name: string;
  brand: string;
  type: string;
  quantity: number;
  unitPriceCents: number;
  listPriceCents: number;
  lineTotalCents: number;
  discountCents: number;
  reason: string;
}

export interface Quote {
  items: QuoteItem[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
  currency: string;
  freeShippingThresholdCents: number;
}

const STORAGE_KEY = 'treadcart.cart.v1';

interface CartContextValue {
  lines: CartLine[];
  quote: Quote | null;
  loading: boolean;
  error: string | null;
  count: number;
  add: (skuId: string, quantity?: number) => void;
  setQuantity: (skuId: string, quantity: number) => void;
  remove: (skuId: string) => void;
  clear: () => void;
  refresh: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function readStored(): CartLine[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartLine[];
    return Array.isArray(parsed) ? parsed.filter((l) => l.skuId && l.quantity > 0) : [];
  } catch {
    // Corrupt or blocked storage must not break the whole shop.
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  // Load from storage after mount, so server and client render the same HTML.
  useEffect(() => {
    setLines(readStored());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // Private mode or blocked storage: the cart just will not persist.
    }
  }, [lines, hydrated]);

  // Re-price when the cart or sign-in state changes.
  useEffect(() => {
    if (!hydrated) return;

    if (lines.length === 0) {
      setQuote(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    api<Quote>('checkout/quote', { method: 'POST', body: JSON.stringify({ lines }) })
      .then((q) => {
        if (cancelled) return;
        setQuote(q);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not price your cart');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lines, hydrated, nonce]);

  const add = useCallback((skuId: string, quantity = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.skuId === skuId);
      if (existing) {
        return prev.map((l) =>
          l.skuId === skuId ? { ...l, quantity: Math.min(99, l.quantity + quantity) } : l,
        );
      }
      return [...prev, { skuId, quantity }];
    });
  }, []);

  const setQuantity = useCallback((skuId: string, quantity: number) => {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.skuId !== skuId)
        : prev.map((l) => (l.skuId === skuId ? { ...l, quantity: Math.min(99, quantity) } : l)),
    );
  }, []);

  const remove = useCallback((skuId: string) => {
    setLines((prev) => prev.filter((l) => l.skuId !== skuId));
  }, []);

  const clear = useCallback(() => setLines([]), []);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      quote,
      loading,
      error,
      count: lines.reduce((a, l) => a + l.quantity, 0),
      add,
      setQuantity,
      remove,
      clear,
      refresh,
    }),
    [lines, quote, loading, error, add, setQuantity, remove, clear, refresh],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
