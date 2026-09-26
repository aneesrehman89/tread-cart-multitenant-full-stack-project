'use client';

import { useState } from 'react';
import { api, money, number, useApi } from '@/lib/api';
import { Shell, useRequireSeller } from '@/components/shell';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Loading,
  PageHeader,
  Pill,
  Table,
  Td,
  Th,
  inputClass,
  titleCase,
} from '@/components/ui';

interface Sku {
  id: string;
  sku: string;
  basePriceCents: number;
  sectionWidthMm: number | null;
  aspectRatio: number | null;
  rimDiameterIn: number | null;
  wheelWidthIn: number | null;
  boltPattern: string | null;
  offsetMm: number | null;
  inventory: { onHand: number; reorderAt: number } | null;
}

interface Product {
  id: string;
  name: string;
  slug: string;
  type: string;
  isActive: boolean;
  brand: { name: string };
  skus: Sku[];
  onHand: number;
  stockState: 'IN' | 'LOW' | 'OUT';
}

const TYPES = ['All', 'TIRE', 'WHEEL', 'ACCESSORY'] as const;
const STOCK = ['All', 'IN', 'LOW', 'OUT'] as const;

export default function ProductsPage() {
  const ready = useRequireSeller();
  const [type, setType] = useState<(typeof TYPES)[number]>('All');
  const [stock, setStock] = useState<(typeof STOCK)[number]>('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const query = new URLSearchParams();
  if (type !== 'All') query.set('type', type);
  if (stock !== 'All') query.set('stock', stock);
  if (search.trim()) query.set('q', search.trim());

  const { data, error, loading, reload } = useApi<{ products: Product[]; total: number }>(
    ready ? `products?${query.toString()}` : null,
  );

  const products = data?.products ?? [];

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulk(action: 'PUBLISH' | 'HIDE') {
    setBusy(true);
    try {
      await api('products/bulk', {
        method: 'POST',
        body: JSON.stringify({ productIds: [...selected], action }),
      });
      setSelected(new Set());
      reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell breadcrumb={['Products']}>
      <PageHeader
        title="Products"
        subtitle={`${number(data?.total ?? 0)} products in your catalog`}
        action={<Button onClick={() => setCreating(true)}>+ Add product</Button>}
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
                {t === 'All' ? 'All types' : titleCase(t)}
              </button>
            ))}
          </div>
          <select
            value={stock}
            onChange={(e) => setStock(e.target.value as (typeof STOCK)[number])}
            className="rounded-lg border border-ink-300 bg-surface px-2 py-1.5 text-xs text-ink-700 focus:border-brand-500 focus:outline-none"
          >
            <option value="All">All stock</option>
            <option value="IN">In stock</option>
            <option value="LOW">Low stock</option>
            <option value="OUT">Out of stock</option>
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products, brands or SKUs…"
            className={`${inputClass} ml-auto max-w-xs`}
          />
        </div>

        {loading && !data ? (
          <Loading />
        ) : products.length === 0 ? (
          <EmptyState title="No products match" body="Add your first product to get started." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-10" />
                <Th>Product</Th>
                <Th>SKU / spec</Th>
                <Th>Brand</Th>
                <Th>Price</Th>
                <Th>Stock</Th>
                <Th>Visibility</Th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-ink-50">
                  <Td>
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                      className="h-3.5 w-3.5 rounded border-ink-300 text-brand-600 focus:ring-brand-400"
                      aria-label={`Select ${p.name}`}
                    />
                  </Td>
                  <Td>
                    <p className="font-medium text-ink-900">{p.name}</p>
                    <p className="text-2xs text-ink-500">{titleCase(p.type)}</p>
                  </Td>
                  <Td>
                    {p.skus.map((s) => (
                      <div key={s.id} className="text-2xs">
                        <code className="font-mono text-ink-700">{s.sku}</code>
                        <span className="ml-1.5 text-ink-500">{spec(p.type, s)}</span>
                      </div>
                    ))}
                  </Td>
                  <Td>{p.brand.name}</Td>
                  <Td>
                    {p.skus.map((s) => (
                      <PriceCell key={s.id} sku={s} onSaved={reload} />
                    ))}
                  </Td>
                  <Td>
                    {p.skus.map((s) => (
                      <StockCell key={s.id} sku={s} onSaved={reload} />
                    ))}
                  </Td>
                  <Td>
                    <Pill tone={p.isActive ? 'success' : 'neutral'}>
                      {p.isActive ? 'Published' : 'Hidden'}
                    </Pill>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Selection bar, as in the mockup. */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full bg-ink-900 px-5 py-3 text-xs text-white shadow-pop">
          <span>{selected.size} selected</span>
          <span className="h-4 w-px bg-ink-600" />
          <button onClick={() => bulk('PUBLISH')} disabled={busy} className="hover:underline">
            Publish
          </button>
          <button onClick={() => bulk('HIDE')} disabled={busy} className="hover:underline">
            Hide
          </button>
          <button onClick={() => setSelected(new Set())} className="text-ink-400 hover:text-white">
            Clear
          </button>
        </div>
      )}

      {creating && (
        <NewProductDialog
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
    </Shell>
  );
}

function spec(type: string, s: Sku): string {
  if (type === 'TIRE' && s.sectionWidthMm) {
    return `${s.sectionWidthMm}/${s.aspectRatio}R${s.rimDiameterIn}`;
  }
  if (type === 'WHEEL' && s.wheelWidthIn) {
    return `${s.rimDiameterIn}x${s.wheelWidthIn} ${s.boltPattern ?? ''} ET${s.offsetMm ?? '—'}`;
  }
  return '';
}

/** Click a price to edit it in place; Enter or blur saves. */
function PriceCell({ sku, onSaved }: { sku: Sku; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState((sku.basePriceCents / 100).toFixed(2));
  const [busy, setBusy] = useState(false);

  async function save() {
    const cents = Math.round(Number.parseFloat(value) * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      setValue((sku.basePriceCents / 100).toFixed(2));
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await api(`products/skus/${sku.id}/price`, {
        method: 'PUT',
        body: JSON.stringify({ basePriceCents: cents }),
      });
      onSaved();
    } finally {
      setBusy(false);
      setEditing(false);
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="block rounded px-1 text-left text-xs text-ink-800 hover:bg-brand-50 hover:text-brand-700"
      >
        {money(sku.basePriceCents)}
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={value}
      disabled={busy}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') void save();
        if (e.key === 'Escape') setEditing(false);
      }}
      className="w-20 rounded border border-brand-400 px-1 py-0.5 text-xs focus:outline-none"
    />
  );
}

function StockCell({ sku, onSaved }: { sku: Sku; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const onHand = sku.inventory?.onHand ?? 0;
  const reorderAt = sku.inventory?.reorderAt ?? 0;
  const [value, setValue] = useState(String(onHand));
  const [busy, setBusy] = useState(false);

  async function save() {
    const next = Number.parseInt(value, 10);
    if (!Number.isFinite(next) || next < 0) {
      setValue(String(onHand));
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await api(`products/skus/${sku.id}/stock`, {
        method: 'PUT',
        body: JSON.stringify({ onHand: next }),
      });
      onSaved();
    } finally {
      setBusy(false);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save();
          if (e.key === 'Escape') setEditing(false);
        }}
        className="w-16 rounded border border-brand-400 px-1 py-0.5 text-xs focus:outline-none"
      />
    );
  }

  const tone = onHand === 0 ? 'danger' : onHand <= reorderAt ? 'warning' : 'success';
  const label = onHand === 0 ? 'Out of stock' : onHand <= reorderAt ? `${onHand} · low` : `${onHand}`;

  return (
    <button onClick={() => setEditing(true)} className="block text-left">
      <Pill tone={tone}>{label}</Pill>
    </button>
  );
}

function NewProductDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    name: '',
    brandName: '',
    type: 'TIRE',
    description: '',
    sku: '',
    price: '',
    onHand: '0',
    reorderAt: '4',
    // Tire
    sectionWidthMm: '',
    aspectRatio: '',
    rimDiameterIn: '',
    // Wheel
    wheelWidthIn: '',
    boltPattern: '',
    offsetMm: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const isTire = form.type === 'TIRE';
  const slug = form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const num = (v: string) => (v.trim() === '' ? null : Number(v));
      await api('products', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          slug,
          type: form.type,
          brandName: form.brandName,
          description: form.description || null,
          isActive: true,
          skus: [
            {
              sku: form.sku,
              basePriceCents: Math.round(Number.parseFloat(form.price) * 100),
              onHand: Number.parseInt(form.onHand, 10) || 0,
              reorderAt: Number.parseInt(form.reorderAt, 10) || 0,
              ...(isTire
                ? {
                    sectionWidthMm: num(form.sectionWidthMm),
                    aspectRatio: num(form.aspectRatio),
                    rimDiameterIn: num(form.rimDiameterIn),
                  }
                : {
                    wheelWidthIn: num(form.wheelWidthIn),
                    rimDiameterIn: num(form.rimDiameterIn),
                    boltPattern: form.boltPattern || null,
                    offsetMm: num(form.offsetMm),
                  }),
            },
          ],
        }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the product');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4">
      <form
        onSubmit={submit}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card bg-surface p-6 shadow-pop"
      >
        <h2 className="text-lg font-semibold text-ink-900">Add product</h2>
        <p className="mt-1 text-xs text-ink-500">Creates the product and its first SKU.</p>

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <div className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Product name">
              <input
                required
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                className={inputClass}
                placeholder="Meridian GT Sport 225/45R17"
              />
            </Field>
            <Field label="Brand" hint="Created if it does not exist">
              <input
                required
                value={form.brandName}
                onChange={(e) => set('brandName', e.target.value)}
                className={inputClass}
                placeholder="Meridian"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Type">
              <select
                value={form.type}
                onChange={(e) => set('type', e.target.value)}
                className={inputClass}
              >
                <option value="TIRE">Tire</option>
                <option value="WHEEL">Wheel</option>
                <option value="ACCESSORY">Accessory</option>
              </select>
            </Field>
            <Field label="SKU code">
              <input
                required
                value={form.sku}
                onChange={(e) => set('sku', e.target.value.toUpperCase())}
                className={inputClass}
                placeholder="MER-22545R17"
              />
            </Field>
            <Field label="Price (USD)">
              <input
                required
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={(e) => set('price', e.target.value)}
                className={inputClass}
                placeholder="189.00"
              />
            </Field>
          </div>

          {isTire ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Section width (mm)">
                <input
                  type="number"
                  value={form.sectionWidthMm}
                  onChange={(e) => set('sectionWidthMm', e.target.value)}
                  className={inputClass}
                  placeholder="225"
                />
              </Field>
              <Field label="Aspect ratio">
                <input
                  type="number"
                  value={form.aspectRatio}
                  onChange={(e) => set('aspectRatio', e.target.value)}
                  className={inputClass}
                  placeholder="45"
                />
              </Field>
              <Field label="Rim (in)">
                <input
                  type="number"
                  value={form.rimDiameterIn}
                  onChange={(e) => set('rimDiameterIn', e.target.value)}
                  className={inputClass}
                  placeholder="17"
                />
              </Field>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="Rim (in)">
                <input
                  type="number"
                  value={form.rimDiameterIn}
                  onChange={(e) => set('rimDiameterIn', e.target.value)}
                  className={inputClass}
                  placeholder="18"
                />
              </Field>
              <Field label="Width (in)">
                <input
                  type="number"
                  step="0.5"
                  value={form.wheelWidthIn}
                  onChange={(e) => set('wheelWidthIn', e.target.value)}
                  className={inputClass}
                  placeholder="8.5"
                />
              </Field>
              <Field label="Bolt pattern">
                <input
                  value={form.boltPattern}
                  onChange={(e) => set('boltPattern', e.target.value)}
                  className={inputClass}
                  placeholder="5x114.3"
                />
              </Field>
              <Field label="Offset (mm)">
                <input
                  type="number"
                  value={form.offsetMm}
                  onChange={(e) => set('offsetMm', e.target.value)}
                  className={inputClass}
                  placeholder="35"
                />
              </Field>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Stock on hand">
              <input
                type="number"
                min="0"
                value={form.onHand}
                onChange={(e) => set('onHand', e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Reorder at">
              <input
                type="number"
                min="0"
                value={form.reorderAt}
                onChange={(e) => set('reorderAt', e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Add product'}
          </Button>
        </div>
      </form>
    </div>
  );
}
