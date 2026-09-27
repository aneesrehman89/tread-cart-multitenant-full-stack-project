'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { money, useApi } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { ShopLayout } from '@/components/shop-chrome';
import { ProductGlyph, specLabel, type Product } from '@/components/product';
import {
  Button,
  Card,
  ErrorNote,
  Loading,
  Pill,
  Table,
  Td,
  Th,
  titleCase,
} from '@/components/ui';

interface Detail {
  product: Product & {
    description: string | null;
    skus: (Product['skus'][number] & {
      loadIndex: number | null;
      speedRating: string | null;
      season: string | null;
      treadwear: number | null;
      finish: string | null;
      centerBoreMm: number | null;
      weightGrams: number | null;
      currency: string;
      inventory: { onHand: number; reorderAt: number } | null;
      fitments: { position: string; isOem: boolean; vehicle: { year: number; make: string; model: string; trim: string | null } }[];
    })[];
  };
  related: { id: string; slug: string; name: string; brand: { name: string }; skus: { basePriceCents: number }[] }[];
}

export default function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const cart = useCart();
  const { data, error, loading, reload } = useApi<Detail>(`products/${slug}`);

  const [skuIndex, setSkuIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const product = data?.product;
  const sku = product?.skus[skuIndex];
  const stock = sku?.inventory?.onHand ?? 0;

  function add() {
    if (!sku) return;
    cart.add(sku.id, quantity);
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  }

  return (
    <ShopLayout>
      <div className="mx-auto max-w-7xl px-4 py-6">
        {error && <ErrorNote message={error} onRetry={reload} />}
        {loading && !data && <Loading />}

        {product && sku && (
          <>
            <nav className="mb-4 flex items-center gap-1.5 text-xs text-ink-500">
              <Link href="/" className="hover:text-ink-800">
                Home
              </Link>
              <span>/</span>
              <Link href={`/products?type=${product.type}`} className="hover:text-ink-800">
                {titleCase(product.type)}s
              </Link>
              <span>/</span>
              <span className="text-ink-800">{product.name}</span>
            </nav>

            <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
              {/* Gallery */}
              <div>
                <Card padded={false} className="overflow-hidden">
                  <div className="grid h-80 place-items-center bg-gradient-to-br from-ink-100 to-ink-200">
                    <div className="scale-[2.2]">
                      <ProductGlyph type={product.type} />
                    </div>
                  </div>
                </Card>
                <p className="mt-2 text-2xs text-ink-400">
                  Product photography is not wired up yet — S3 uploads are implemented on the API
                  but no images have been attached to this catalog.
                </p>
              </div>

              {/* Buy box */}
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-ink-500">{product.brand.name}</p>
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900">
                    {product.name}
                  </h1>
                  <p className="mt-1 font-mono text-2xs text-ink-500">{sku.sku}</p>
                </div>

                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-semibold text-ink-900">
                    {money(sku.basePriceCents)}
                  </span>
                  {sku.compareAtCents && sku.compareAtCents > sku.basePriceCents && (
                    <>
                      <span className="text-sm text-ink-400 line-through">
                        {money(sku.compareAtCents)}
                      </span>
                      <Pill tone="success">
                        Save {money(sku.compareAtCents - sku.basePriceCents)}
                      </Pill>
                    </>
                  )}
                </div>

                {product.skus.length > 1 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-ink-700">Size</p>
                    <div className="flex flex-wrap gap-2">
                      {product.skus.map((s, i) => (
                        <button
                          key={s.id}
                          onClick={() => setSkuIndex(i)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                            i === skuIndex
                              ? 'border-brand-500 bg-brand-50 text-brand-700'
                              : 'border-ink-300 text-ink-700 hover:border-ink-400'
                          }`}
                        >
                          {specLabel(product.type, s)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  {stock === 0 ? (
                    <Pill tone="danger">Out of stock</Pill>
                  ) : stock <= 5 ? (
                    <Pill tone="warning">Only {stock} left</Pill>
                  ) : (
                    <Pill tone="success">{stock} in stock</Pill>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center rounded-lg border border-ink-300">
                    <button
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="px-3 py-2 text-ink-600 hover:text-ink-900"
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <span className="w-9 text-center text-sm font-medium">{quantity}</span>
                    <button
                      onClick={() => setQuantity((q) => Math.min(stock || 99, q + 1))}
                      className="px-3 py-2 text-ink-600 hover:text-ink-900"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                  <Button
                    className="flex-1"
                    disabled={stock === 0}
                    onClick={add}
                    variant={added ? 'secondary' : 'primary'}
                  >
                    {added ? 'Added to cart ✓' : 'Add to cart'}
                  </Button>
                </div>

                <p className="text-2xs text-ink-500">
                  Trade and fleet customers see their own pricing in the cart once signed in.
                </p>

                {/* Specification */}
                <Card padded={false}>
                  <div className="border-b border-ink-200 px-5 py-3">
                    <h2 className="text-sm font-semibold text-ink-900">Specification</h2>
                  </div>
                  <dl className="divide-y divide-ink-100 px-5">
                    {product.type === 'TIRE' ? (
                      <>
                        <Spec label="Size" value={specLabel(product.type, sku)} />
                        <Spec label="Load index" value={sku.loadIndex ?? '—'} />
                        <Spec label="Speed rating" value={sku.speedRating ?? '—'} />
                        <Spec label="Season" value={sku.season ? titleCase(sku.season) : '—'} />
                        <Spec label="Treadwear" value={sku.treadwear ?? '—'} />
                      </>
                    ) : (
                      <>
                        <Spec label="Size" value={specLabel(product.type, sku)} />
                        <Spec label="Bolt pattern" value={sku.boltPattern ?? '—'} />
                        <Spec label="Offset" value={sku.offsetMm != null ? `ET${sku.offsetMm}` : '—'} />
                        <Spec label="Centre bore" value={sku.centerBoreMm ? `${sku.centerBoreMm} mm` : '—'} />
                        <Spec label="Finish" value={sku.finish ?? '—'} />
                      </>
                    )}
                    {sku.weightGrams && (
                      <Spec label="Weight" value={`${(sku.weightGrams / 1000).toFixed(1)} kg`} />
                    )}
                  </dl>
                </Card>
              </div>
            </div>

            {product.description && (
              <Card className="mt-8">
                <h2 className="text-sm font-semibold text-ink-900">Description</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-700">{product.description}</p>
              </Card>
            )}

            {sku.fitments.length > 0 && (
              <Card padded={false} className="mt-6">
                <div className="border-b border-ink-200 px-5 py-4">
                  <h2 className="text-sm font-semibold text-ink-900">Confirmed fitment</h2>
                  <p className="mt-0.5 text-xs text-ink-500">
                    Vehicles this SKU is confirmed to fit.
                  </p>
                </div>
                <Table>
                  <thead>
                    <tr>
                      <Th>Vehicle</Th>
                      <Th>Position</Th>
                      <Th>OEM</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {sku.fitments.map((f, i) => (
                      <tr key={i}>
                        <Td className="font-medium text-ink-900">
                          {f.vehicle.year} {f.vehicle.make} {f.vehicle.model}
                          {f.vehicle.trim ? ` ${f.vehicle.trim}` : ''}
                        </Td>
                        <Td>{titleCase(f.position)}</Td>
                        <Td>{f.isOem ? <Pill tone="success">OEM</Pill> : '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card>
            )}

            {data.related.length > 0 && (
              <section className="mt-10">
                <h2 className="mb-3 text-sm font-semibold text-ink-900">You may also like</h2>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {data.related.map((r) => (
                    <Link key={r.id} href={`/products/${r.slug}`}>
                      <Card className="h-full transition-shadow hover:shadow-pop">
                        <p className="text-2xs text-ink-500">{r.brand.name}</p>
                        <p className="mt-0.5 line-clamp-2 text-sm font-medium text-ink-900">
                          {r.name}
                        </p>
                        <p className="mt-1.5 text-sm font-semibold text-ink-900">
                          {r.skus[0] ? money(r.skus[0].basePriceCents) : '—'}
                        </p>
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </ShopLayout>
  );
}

function Spec({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between py-2.5 text-xs">
      <dt className="text-ink-500">{label}</dt>
      <dd className="font-medium text-ink-900">{value}</dd>
    </div>
  );
}
