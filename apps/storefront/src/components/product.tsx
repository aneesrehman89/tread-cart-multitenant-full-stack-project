'use client';

import Link from 'next/link';
import { useState } from 'react';
import { money } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { Button, Card, Pill } from './ui';

export interface Product {
  id: string;
  slug: string;
  name: string;
  type: string;
  brand: { name: string };
  skus: {
    id: string;
    sku: string;
    basePriceCents: number;
    compareAtCents: number | null;
    sectionWidthMm: number | null;
    aspectRatio: number | null;
    rimDiameterIn: number | null;
    wheelWidthIn: number | null;
    boltPattern: string | null;
    offsetMm: number | null;
    inventory: { onHand: number } | null;
  }[];
}

export function ProductGrid({ products }: { products: Product[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}

export function ProductCard({ product }: { product: Product }) {
  const cart = useCart();
  const sku = product.skus[0];
  const [added, setAdded] = useState(false);

  const stock = sku?.inventory?.onHand ?? 0;
  const onSale = sku?.compareAtCents != null && sku.compareAtCents > sku.basePriceCents;

  function add() {
    if (!sku) return;
    cart.add(sku.id, 1);
    setAdded(true);
    setTimeout(() => setAdded(false), 1400);
  }

  return (
    <Card padded={false} className="flex flex-col overflow-hidden">
      <Link href={`/products/${product.slug}`} className="block">
        <div className="grid h-36 place-items-center bg-gradient-to-br from-ink-100 to-ink-200">
          <ProductGlyph type={product.type} />
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-3.5">
        <p className="text-2xs text-ink-500">{product.brand.name}</p>
        <Link href={`/products/${product.slug}`}>
          <h3 className="mt-0.5 line-clamp-2 text-sm font-medium text-ink-900 hover:text-brand-700">
            {product.name}
          </h3>
        </Link>
        {sku && <p className="mt-1 text-2xs text-ink-500">{specLabel(product.type, sku)}</p>}

        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-base font-semibold text-ink-900">
            {sku ? money(sku.basePriceCents) : '—'}
          </span>
          {onSale && (
            <span className="text-2xs text-ink-400 line-through">
              {money(sku!.compareAtCents!)}
            </span>
          )}
        </div>

        <div className="mt-2">
          {stock === 0 ? (
            <Pill tone="danger">Out of stock</Pill>
          ) : stock <= 5 ? (
            <Pill tone="warning">Only {stock} left</Pill>
          ) : (
            <Pill tone="success">In stock</Pill>
          )}
        </div>

        <Button
          size="sm"
          className="mt-3 w-full"
          disabled={!sku || stock === 0}
          onClick={add}
          variant={added ? 'secondary' : 'primary'}
        >
          {added ? 'Added ✓' : 'Add to cart'}
        </Button>
      </div>
    </Card>
  );
}

export function specLabel(type: string, s: Product['skus'][number]): string {
  if (type === 'TIRE' && s.sectionWidthMm) {
    return `${s.sectionWidthMm}/${s.aspectRatio}R${s.rimDiameterIn}`;
  }
  if (type === 'WHEEL' && s.wheelWidthIn) {
    return `${s.rimDiameterIn}×${s.wheelWidthIn} ${s.boltPattern ?? ''} ET${s.offsetMm ?? '—'}`;
  }
  return s.sku;
}

export function ProductGlyph({ type }: { type: string }) {
  if (type === 'WHEEL') {
    return (
      <svg viewBox="0 0 100 100" className="h-20 w-20 text-ink-400" aria-hidden>
        <circle cx="50" cy="50" r="42" stroke="currentColor" strokeWidth="5" fill="none" />
        {Array.from({ length: 5 }, (_, i) => {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          return (
            <path
              key={i}
              d={`M50 50 L${50 + Math.cos(a - 0.22) * 34} ${50 + Math.sin(a - 0.22) * 34} L${50 + Math.cos(a + 0.22) * 34} ${50 + Math.sin(a + 0.22) * 34} Z`}
              fill="currentColor"
              opacity="0.55"
            />
          );
        })}
        <circle cx="50" cy="50" r="9" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 100 100" className="h-20 w-20 text-ink-400" aria-hidden>
      <circle cx="50" cy="50" r="42" stroke="currentColor" strokeWidth="11" fill="none" />
      <circle cx="50" cy="50" r="23" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.6" />
    </svg>
  );
}
