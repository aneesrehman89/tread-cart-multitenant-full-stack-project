'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback } from 'react';
import { number, useApi } from '@/lib/api';
import { ShopLayout } from '@/components/shop-chrome';
import { ProductGrid, type Product } from '@/components/product';
import { Card, EmptyState, ErrorNote, Loading, titleCase } from '@/components/ui';

interface Listing {
  products: Product[];
  total: number;
  facets: {
    brands: { name: string; slug: string }[];
    rimDiameters: number[];
    widths: number[];
    boltPatterns: string[];
  };
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Listing />
    </Suspense>
  );
}

const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'name', label: 'Name' },
] as const;

function Listing() {
  const router = useRouter();
  const params = useSearchParams();

  // Filters live in the URL, so a filtered view is shareable and the back
  // button behaves the way people expect.
  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
      router.replace(`/products?${next.toString()}`);
    },
    [params, router],
  );

  const query = params.toString();
  const { data, error, loading, reload } = useApi<Listing>(`products?${query}`, [query]);

  const activeType = params.get('type') ?? '';
  const activeBrand = params.get('brand') ?? '';
  const activeRim = params.get('rim') ?? '';
  const activeWidth = params.get('width') ?? '';
  const activeBolt = params.get('bolt') ?? '';
  const search = params.get('q') ?? '';
  const sort = params.get('sort') ?? 'newest';

  const hasFilters = Boolean(activeType || activeBrand || activeRim || activeWidth || activeBolt || search);

  return (
    <ShopLayout>
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
              {search ? `Results for “${search}”` : activeType ? `${titleCase(activeType)}s` : 'All products'}
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              {loading && !data ? 'Searching…' : `${number(data?.total ?? 0)} products`}
            </p>
          </div>

          <label className="flex items-center gap-2 text-xs text-ink-500">
            Sort
            <select
              value={sort}
              onChange={(e) => setParam('sort', e.target.value)}
              className="rounded-lg border border-ink-300 bg-surface px-2.5 py-1.5 text-xs text-ink-700 focus:border-brand-500 focus:outline-none"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <ErrorNote message={error} onRetry={reload} />}

        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          {/* Filters */}
          <aside className="space-y-5">
            {hasFilters && (
              <button
                onClick={() => router.replace('/products')}
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                Clear all filters
              </button>
            )}

            <FilterGroup title="Type">
              {['TIRE', 'WHEEL', 'ACCESSORY'].map((t) => (
                <Radio
                  key={t}
                  label={`${titleCase(t)}s`}
                  checked={activeType === t}
                  onChange={() => setParam('type', activeType === t ? null : t)}
                />
              ))}
            </FilterGroup>

            {data && data.facets.brands.length > 0 && (
              <FilterGroup title="Brand">
                {data.facets.brands.map((b) => (
                  <Radio
                    key={b.slug}
                    label={b.name}
                    checked={activeBrand === b.slug}
                    onChange={() => setParam('brand', activeBrand === b.slug ? null : b.slug)}
                  />
                ))}
              </FilterGroup>
            )}

            {data && data.facets.rimDiameters.length > 0 && (
              <FilterGroup title="Rim diameter">
                <div className="flex flex-wrap gap-1.5">
                  {data.facets.rimDiameters.map((r) => (
                    <Chip
                      key={r}
                      label={`${r}"`}
                      active={activeRim === String(r)}
                      onClick={() => setParam('rim', activeRim === String(r) ? null : String(r))}
                    />
                  ))}
                </div>
              </FilterGroup>
            )}

            {data && data.facets.widths.length > 0 && (
              <FilterGroup title="Section width">
                <div className="flex flex-wrap gap-1.5">
                  {data.facets.widths.map((w) => (
                    <Chip
                      key={w}
                      label={String(w)}
                      active={activeWidth === String(w)}
                      onClick={() => setParam('width', activeWidth === String(w) ? null : String(w))}
                    />
                  ))}
                </div>
              </FilterGroup>
            )}

            {data && data.facets.boltPatterns.length > 0 && (
              <FilterGroup title="Bolt pattern">
                <div className="flex flex-wrap gap-1.5">
                  {data.facets.boltPatterns.map((b) => (
                    <Chip
                      key={b}
                      label={b!}
                      active={activeBolt === b}
                      onClick={() => setParam('bolt', activeBolt === b ? null : b!)}
                    />
                  ))}
                </div>
              </FilterGroup>
            )}
          </aside>

          <div>
            {loading && !data ? (
              <Loading />
            ) : data && data.products.length > 0 ? (
              <ProductGrid products={data.products} />
            ) : (
              <Card>
                <EmptyState
                  title="Nothing matches those filters"
                  body="Try widening your search or clearing a filter."
                />
              </Card>
            )}
          </div>
        </div>
      </div>
    </ShopLayout>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-500">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Radio({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 rounded border-ink-300 text-brand-600 focus:ring-brand-400"
      />
      {label}
    </label>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-2 py-1 text-2xs font-medium transition-colors ${
        active
          ? 'border-brand-500 bg-brand-50 text-brand-700'
          : 'border-ink-300 text-ink-600 hover:border-ink-400'
      }`}
    >
      {label}
    </button>
  );
}
