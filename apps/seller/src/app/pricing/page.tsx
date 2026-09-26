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
  SectionHeader,
  Table,
  Td,
  Th,
  inputClass,
} from '@/components/ui';

interface Group {
  id: string;
  name: string;
  code: string;
  defaultDiscountBps: number;
  priority: number;
  _count: { customers: number; prices: number };
}

interface PriceRow {
  id: string;
  minQuantity: number;
  priceCents: number | null;
  discountBps: number | null;
  sku: { id: string; sku: string; basePriceCents: number; product: { name: string } };
}

interface ProductRow {
  id: string;
  name: string;
  skus: { id: string; sku: string; basePriceCents: number }[];
}

export default function PricingPage() {
  const ready = useRequireSeller();
  const groups = useApi<{ groups: Group[] }>(ready ? 'customers/groups' : null);
  const [selected, setSelected] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const activeId = selected ?? groups.data?.groups[0]?.id ?? null;

  return (
    <Shell breadcrumb={['Pricing groups']}>
      <PageHeader
        title="Pricing groups"
        subtitle="Trade and fleet pricing — a group discount, with per-SKU overrides on top"
        action={<Button onClick={() => setCreatingGroup(true)}>+ New group</Button>}
      />

      {groups.error && <ErrorNote message={groups.error} onRetry={groups.reload} />}

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <Card padded={false}>
          <SectionHeader title="Groups" />
          {groups.loading && !groups.data ? (
            <Loading />
          ) : (
            <ul>
              {(groups.data?.groups ?? []).map((g) => (
                <li key={g.id}>
                  <button
                    onClick={() => setSelected(g.id)}
                    className={`block w-full border-b border-ink-100 px-5 py-3 text-left transition-colors ${
                      activeId === g.id ? 'bg-brand-50' : 'hover:bg-ink-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink-900">{g.name}</span>
                      <code className="font-mono text-2xs text-ink-500">{g.code}</code>
                    </div>
                    <p className="mt-1 text-2xs text-ink-500">
                      {(g.defaultDiscountBps / 100).toFixed(2)}% default ·{' '}
                      {number(g._count.prices)} overrides · {number(g._count.customers)} customers
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {activeId ? (
          <GroupDetail groupId={activeId} onChanged={groups.reload} />
        ) : (
          <Card>
            <EmptyState title="No pricing groups yet" body="Create one to offer trade pricing." />
          </Card>
        )}
      </div>

      {creatingGroup && (
        <NewGroupDialog
          onClose={() => setCreatingGroup(false)}
          onDone={() => {
            setCreatingGroup(false);
            groups.reload();
          }}
        />
      )}
    </Shell>
  );
}

function GroupDetail({ groupId, onChanged }: { groupId: string; onChanged: () => void }) {
  const detail = useApi<{ group: Group; prices: PriceRow[] }>(`customers/groups/${groupId}/prices`);
  const products = useApi<{ products: ProductRow[] }>('products');
  const [adding, setAdding] = useState(false);

  async function remove(priceId: string) {
    await api(`customers/groups/${groupId}/prices/${priceId}`, { method: 'DELETE' });
    detail.reload();
    onChanged();
  }

  if (detail.error) return <ErrorNote message={detail.error} onRetry={detail.reload} />;
  if (detail.loading && !detail.data) return <Card><Loading /></Card>;
  if (!detail.data) return null;

  const { group, prices } = detail.data;

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink-900">{group.name}</h2>
            <p className="mt-0.5 text-xs text-ink-500">
              Every SKU gets {(group.defaultDiscountBps / 100).toFixed(2)}% off unless it has an
              override below.
            </p>
          </div>
          <Button size="sm" onClick={() => setAdding(true)}>
            + SKU override
          </Button>
        </div>
      </Card>

      <Card padded={false}>
        <SectionHeader
          title="SKU-level overrides"
          subtitle="A fixed price wins outright; otherwise the discount applies to the base price."
        />
        {prices.length === 0 ? (
          <EmptyState
            title="No overrides"
            body={`Every SKU falls back to the group's ${(group.defaultDiscountBps / 100).toFixed(2)}% discount.`}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>SKU</Th>
                <Th>Base price</Th>
                <Th>Min qty</Th>
                <Th>Override</Th>
                <Th>They pay</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {prices.map((p) => {
                const effective =
                  p.priceCents ??
                  Math.round(p.sku.basePriceCents * (1 - (p.discountBps ?? 0) / 10_000));
                return (
                  <tr key={p.id} className="hover:bg-ink-50">
                    <Td className="font-medium text-ink-900">{p.sku.product.name}</Td>
                    <Td>
                      <code className="font-mono text-2xs text-ink-600">{p.sku.sku}</code>
                    </Td>
                    <Td className="text-ink-500">{money(p.sku.basePriceCents)}</Td>
                    <Td>{p.minQuantity}+</Td>
                    <Td>
                      {p.priceCents != null ? (
                        <Pill tone="info">Fixed</Pill>
                      ) : (
                        <Pill tone="neutral">{((p.discountBps ?? 0) / 100).toFixed(2)}% off</Pill>
                      )}
                    </Td>
                    <Td className="font-medium text-brand-700">{money(effective)}</Td>
                    <Td className="text-right">
                      <button
                        onClick={() => remove(p.id)}
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {adding && (
        <AddOverrideDialog
          groupId={groupId}
          products={products.data?.products ?? []}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            detail.reload();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function AddOverrideDialog({
  groupId,
  products,
  onClose,
  onDone,
}: {
  groupId: string;
  products: ProductRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [skuId, setSkuId] = useState('');
  const [mode, setMode] = useState<'FIXED' | 'DISCOUNT'>('DISCOUNT');
  const [amount, setAmount] = useState('');
  const [minQuantity, setMinQuantity] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allSkus = products.flatMap((p) => p.skus.map((s) => ({ ...s, productName: p.name })));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`customers/groups/${groupId}/prices`, {
        method: 'POST',
        body: JSON.stringify({
          skuId,
          minQuantity: Number.parseInt(minQuantity, 10) || 1,
          ...(mode === 'FIXED'
            ? { priceCents: Math.round(Number.parseFloat(amount) * 100) }
            : { discountBps: Math.round(Number.parseFloat(amount) * 100) }),
        }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the override');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-card bg-surface p-6 shadow-pop">
        <h2 className="text-lg font-semibold text-ink-900">SKU price override</h2>

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <div className="mt-5 space-y-4">
          <Field label="SKU">
            <select
              required
              value={skuId}
              onChange={(e) => setSkuId(e.target.value)}
              className={inputClass}
            >
              <option value="">Choose a SKU…</option>
              {allSkus.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.sku} — {s.productName} ({money(s.basePriceCents)})
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Override type">
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as 'FIXED' | 'DISCOUNT')}
                className={inputClass}
              >
                <option value="DISCOUNT">Percentage off</option>
                <option value="FIXED">Fixed price</option>
              </select>
            </Field>
            <Field
              label={mode === 'FIXED' ? 'Price (USD)' : 'Discount (%)'}
              hint={mode === 'FIXED' ? 'What this group pays' : 'e.g. 12.5 for 12.5% off'}
            >
              <input
                required
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Minimum quantity" hint="Creates a volume break, e.g. 4+ tires">
            <input
              type="number"
              min="1"
              value={minQuantity}
              onChange={(e) => setMinQuantity(e.target.value)}
              className={`${inputClass} max-w-[120px]`}
            />
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save override'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function NewGroupDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: '', code: '', discount: '0', priority: '0' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('customers/groups', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          code: form.code.toUpperCase(),
          defaultDiscountBps: Math.round(Number.parseFloat(form.discount) * 100),
          priority: Number.parseInt(form.priority, 10) || 0,
        }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the group');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-card bg-surface p-6 shadow-pop">
        <h2 className="text-lg font-semibold text-ink-900">New pricing group</h2>

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <div className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputClass}
                placeholder="Workshop"
              />
            </Field>
            <Field label="Code" hint="Uppercase, no spaces">
              <input
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className={inputClass}
                placeholder="WORKSHOP"
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Default discount (%)">
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.discount}
                onChange={(e) => setForm({ ...form, discount: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Priority" hint="Higher wins when groups overlap">
              <input
                type="number"
                min="0"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
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
            {busy ? 'Creating…' : 'Create group'}
          </Button>
        </div>
      </form>
    </div>
  );
}
