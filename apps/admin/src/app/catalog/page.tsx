'use client';

import { useMemo, useState } from 'react';
import { money, number, useApi } from '@/lib/api';
import { Shell, useRequireAuth } from '@/components/shell';
import {
  Card,
  EmptyState,
  ErrorNote,
  Loading,
  PageHeader,
  Pill,
  Table,
  Td,
  Th,
  inputClass,
  titleCase,
} from '@/components/ui';

interface GlobalSku {
  id: string;
  sku: string;
  name: string;
  brand: string;
  type: string;
  basePriceCents: number;
  onHand: number;
  reorderAt: number;
  sectionWidthMm: number | null;
  aspectRatio: number | null;
  rimDiameterIn: number | null;
  wheelWidthIn: number | null;
  boltPattern: string | null;
  offsetMm: number | null;
  store: { slug: string; name: string };
}

const TYPES = ['All', 'TIRE', 'WHEEL', 'ACCESSORY'] as const;

export default function GlobalCatalogPage() {
  const ready = useRequireAuth();
  const { data, error, loading, reload } = useApi<{ skus: GlobalSku[] }>(
    ready ? 'global/catalog' : null,
  );
  const [type, setType] = useState<(typeof TYPES)[number]>('All');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.skus ?? []).filter(
      (s) =>
        (type === 'All' || s.type === type) &&
        (!q ||
          s.sku.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.brand.toLowerCase().includes(q)),
    );
  }, [data, type, search]);

  return (
    <Shell breadcrumb={['Global catalog']}>
      <PageHeader
        title="Global catalog"
        subtitle="Every live SKU across every store, merged from each tenant database"
      />

      {error && <ErrorNote message={error} onRetry={reload} />}

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-200 px-5 py-3">
          <div className="flex gap-1">
            {TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  type === t ? 'bg-brand-100 text-brand-700' : 'text-ink-500 hover:bg-ink-100'
                }`}
              >
                {t === 'All' ? 'All' : titleCase(t)}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SKU, product or brand…"
            className={`${inputClass} ml-auto max-w-xs`}
          />
          <span className="text-2xs text-ink-500">{number(rows.length)} SKUs</span>
        </div>

        {loading && !data ? (
          <Loading label="Reading every tenant catalog" />
        ) : rows.length === 0 ? (
          <EmptyState title="No SKUs match" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Product</Th>
                <Th>Brand</Th>
                <Th>Spec</Th>
                <Th>Store</Th>
                <Th>Price</Th>
                <Th>Stock</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const low = s.onHand <= s.reorderAt;
                return (
                  <tr key={`${s.store.slug}-${s.id}`} className="hover:bg-ink-50">
                    <Td>
                      <code className="font-mono text-2xs text-ink-700">{s.sku}</code>
                    </Td>
                    <Td className="font-medium text-ink-900">{s.name}</Td>
                    <Td>{s.brand}</Td>
                    <Td>{spec(s)}</Td>
                    <Td>
                      <Pill tone="neutral">{s.store.name}</Pill>
                    </Td>
                    <Td>{money(s.basePriceCents)}</Td>
                    <Td className={low ? 'font-medium text-amber-700' : ''}>
                      {number(s.onHand)}
                      {low && ' · low'}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </Shell>
  );
}

function spec(s: GlobalSku): string {
  if (s.type === 'TIRE' && s.sectionWidthMm) {
    return `${s.sectionWidthMm}/${s.aspectRatio}R${s.rimDiameterIn}`;
  }
  if (s.type === 'WHEEL' && s.wheelWidthIn) {
    return `${s.rimDiameterIn}x${s.wheelWidthIn} ${s.boltPattern ?? ''} ET${s.offsetMm ?? '—'}`;
  }
  return '—';
}
