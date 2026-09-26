'use client';

import { use, useState } from 'react';
import { api, initials, money, number, relativeTime, useApi } from '@/lib/api';
import { Shell, useRequireAuth } from '@/components/shell';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Loading,
  Pill,
  StatCard,
  StatusPill,
  Table,
  Td,
  Th,
  titleCase,
} from '@/components/ui';

interface Detail {
  tenant: {
    id: string;
    slug: string;
    name: string;
    status: string;
    brandPrimary: string;
    brandAccent: string;
    databaseName: string;
    createdAt: string;
    domains: { host: string; isPrimary: boolean }[];
  };
  stats: {
    orders30d: number;
    revenueCents: number;
    skuCount: number;
    productCount: number;
    customerCount: number;
    groupCount: number;
  } | null;
  staff: { id: string; email: string; name: string; role: string; isActive: boolean }[];
}

const TABS = ['Overview', 'Catalog', 'Orders', 'Customers', 'Staff', 'Settings'] as const;
type Tab = (typeof TABS)[number];

export default function StoreDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const ready = useRequireAuth();
  const [tab, setTab] = useState<Tab>('Overview');

  const { data, error, loading, reload } = useApi<Detail>(ready ? `tenants/${slug}` : null);
  const [busy, setBusy] = useState(false);

  async function setStatus(status: string) {
    setBusy(true);
    try {
      await api(`tenants/${slug}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      reload();
    } finally {
      setBusy(false);
    }
  }

  const t = data?.tenant;

  return (
    <Shell breadcrumb={['Stores', t?.name ?? slug]}>
      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !data && <Loading />}

      {data && t && (
        <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <Avatar label={initials(t.name)} color={t.brandPrimary} size="lg" />
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t.name}</h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                  <StatusPill status={t.status} />
                  <span>joined {relativeTime(t.createdAt)}</span>
                  <span>·</span>
                  <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-2xs">
                    {t.databaseName}
                  </code>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              {t.status === 'ACTIVE' ? (
                <Button variant="danger" disabled={busy} onClick={() => setStatus('SUSPENDED')}>
                  Suspend store
                </Button>
              ) : (
                <Button disabled={busy} onClick={() => setStatus('ACTIVE')}>
                  Reactivate store
                </Button>
              )}
            </div>
          </div>

          <div className="mb-6 flex gap-1 border-b border-ink-200">
            {TABS.map((x) => (
              <button
                key={x}
                onClick={() => setTab(x)}
                className={`-mb-px border-b-2 px-3 py-2.5 text-sm transition-colors ${
                  tab === x
                    ? 'border-brand-600 font-medium text-brand-700'
                    : 'border-transparent text-ink-500 hover:text-ink-800'
                }`}
              >
                {x}
              </button>
            ))}
          </div>

          {tab === 'Overview' && <OverviewTab data={data} />}
          {tab === 'Catalog' && <CatalogTab slug={slug} />}
          {tab === 'Orders' && <OrdersTab slug={slug} />}
          {tab === 'Customers' && <CustomersTab slug={slug} />}
          {tab === 'Staff' && <StaffTab staff={data.staff} />}
          {tab === 'Settings' && <SettingsTab slug={slug} tenant={t} onSaved={reload} />}
        </>
      )}
    </Shell>
  );
}

function OverviewTab({ data }: { data: Detail }) {
  const s = data.stats;
  if (!s) return <ErrorNote message="This store's database could not be reached." />;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue (all time)" value={money(s.revenueCents)} />
        <StatCard label="Orders (30d)" value={number(s.orders30d)} />
        <StatCard label="Catalog size" value={`${number(s.skuCount)} SKUs`} hint={`${s.productCount} products`} />
        <StatCard label="Customers" value={number(s.customerCount)} hint={`${s.groupCount} pricing groups`} />
      </div>

      <Card>
        <h3 className="text-sm font-semibold text-ink-900">Store details</h3>
        <dl className="mt-4 grid gap-5 sm:grid-cols-2">
          <Detail label="Storefront host" value={data.tenant.domains.find((d) => d.isPrimary)?.host ?? '—'} />
          <Detail label="Tenant slug" value={data.tenant.slug} mono />
          <Detail label="Isolated database" value={data.tenant.databaseName} mono />
          <Detail label="Staff members" value={String(data.staff.length)} />
          <div>
            <dt className="text-xs text-ink-500">Brand tokens</dt>
            <dd className="mt-1.5 flex items-center gap-2">
              <span className="h-5 w-5 rounded" style={{ backgroundColor: data.tenant.brandPrimary }} />
              <code className="font-mono text-xs text-ink-700">{data.tenant.brandPrimary}</code>
              <span className="h-5 w-5 rounded" style={{ backgroundColor: data.tenant.brandAccent }} />
              <code className="font-mono text-xs text-ink-700">{data.tenant.brandAccent}</code>
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className={`mt-1 text-sm text-ink-900 ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}

interface CatalogProduct {
  id: string;
  name: string;
  type: string;
  brand: { name: string };
  skus: {
    id: string;
    sku: string;
    basePriceCents: number;
    sectionWidthMm: number | null;
    aspectRatio: number | null;
    rimDiameterIn: number | null;
    boltPattern: string | null;
    offsetMm: number | null;
    wheelWidthIn: number | null;
    inventory: { onHand: number; reorderAt: number } | null;
  }[];
}

/** Renders the tire/wheel spec that matters for the product's type. */
function specOf(type: string, s: CatalogProduct['skus'][number]): string {
  if (type === 'TIRE' && s.sectionWidthMm) {
    return `${s.sectionWidthMm}/${s.aspectRatio}R${s.rimDiameterIn}`;
  }
  if (type === 'WHEEL' && s.wheelWidthIn) {
    return `${s.rimDiameterIn}x${s.wheelWidthIn} ${s.boltPattern ?? ''} ET${s.offsetMm ?? '—'}`;
  }
  return '—';
}

function CatalogTab({ slug }: { slug: string }) {
  const { data, error, loading, reload } = useApi<{ products: CatalogProduct[] }>(
    `tenants/${slug}/catalog`,
  );

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (loading) return <Loading />;

  const rows = (data?.products ?? []).flatMap((p) => p.skus.map((s) => ({ p, s })));
  if (rows.length === 0) return <Card><EmptyState title="No products in this store yet" /></Card>;

  return (
    <Card padded={false}>
      <Table>
        <thead>
          <tr>
            <Th>Product</Th>
            <Th>SKU</Th>
            <Th>Spec</Th>
            <Th>Type</Th>
            <Th>Price</Th>
            <Th>Stock</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, s }) => {
            const stock = s.inventory?.onHand ?? 0;
            const low = stock <= (s.inventory?.reorderAt ?? 0);
            return (
              <tr key={s.id} className="hover:bg-ink-50">
                <Td className="font-medium text-ink-900">{p.name}</Td>
                <Td>
                  <code className="font-mono text-2xs text-ink-600">{s.sku}</code>
                </Td>
                <Td>{specOf(p.type, s)}</Td>
                <Td>
                  <Pill tone={p.type === 'TIRE' ? 'info' : 'neutral'}>{titleCase(p.type)}</Pill>
                </Td>
                <Td>{money(s.basePriceCents)}</Td>
                <Td>
                  <span className={low ? 'font-medium text-amber-700' : ''}>
                    {number(stock)}
                    {low && ' · low'}
                  </span>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}

interface OrderRow {
  id: string;
  number: string;
  status: string;
  email: string;
  totalCents: number;
  createdAt: string;
  items: { quantity: number }[];
}

function OrdersTab({ slug }: { slug: string }) {
  const { data, error, loading, reload } = useApi<{ orders: OrderRow[] }>(`tenants/${slug}/orders`);

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (loading) return <Loading />;

  const orders = data?.orders ?? [];
  if (orders.length === 0) return <Card><EmptyState title="No orders yet" /></Card>;

  return (
    <Card padded={false}>
      <Table>
        <thead>
          <tr>
            <Th>Order</Th>
            <Th>Customer</Th>
            <Th>Items</Th>
            <Th>Total</Th>
            <Th>Placed</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {orders.slice(0, 40).map((o) => (
            <tr key={o.id} className="hover:bg-ink-50">
              <Td>
                <code className="font-mono text-2xs text-ink-700">{o.number}</code>
              </Td>
              <Td>{o.email}</Td>
              <Td>{o.items.reduce((a, i) => a + i.quantity, 0)}</Td>
              <Td className="font-medium text-ink-900">{money(o.totalCents)}</Td>
              <Td className="text-ink-500">{relativeTime(o.createdAt)}</Td>
              <Td>
                <StatusPill status={o.status} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

interface CustomersPayload {
  customers: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    group: { name: string; code: string } | null;
  }[];
  groups: {
    id: string;
    name: string;
    code: string;
    defaultDiscountBps: number;
    priority: number;
    _count: { customers: number; prices: number };
  }[];
}

function CustomersTab({ slug }: { slug: string }) {
  const { data, error, loading, reload } = useApi<CustomersPayload>(`tenants/${slug}/customers`);

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (loading) return <Loading />;

  return (
    <div className="space-y-5">
      <Card padded={false}>
        <div className="border-b border-ink-200 px-5 py-4">
          <h3 className="text-sm font-semibold text-ink-900">Pricing groups</h3>
          <p className="mt-0.5 text-xs text-ink-500">
            Group discount applies unless a SKU-level override exists.
          </p>
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Group</Th>
              <Th>Code</Th>
              <Th>Default discount</Th>
              <Th>SKU overrides</Th>
              <Th>Customers</Th>
              <Th>Priority</Th>
            </tr>
          </thead>
          <tbody>
            {(data?.groups ?? []).map((g) => (
              <tr key={g.id} className="hover:bg-ink-50">
                <Td className="font-medium text-ink-900">{g.name}</Td>
                <Td>
                  <code className="font-mono text-2xs text-ink-600">{g.code}</code>
                </Td>
                <Td>{(g.defaultDiscountBps / 100).toFixed(2)}%</Td>
                <Td>{number(g._count.prices)}</Td>
                <Td>{number(g._count.customers)}</Td>
                <Td>{g.priority}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card padded={false}>
        <div className="border-b border-ink-200 px-5 py-4">
          <h3 className="text-sm font-semibold text-ink-900">Customers</h3>
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Group</Th>
            </tr>
          </thead>
          <tbody>
            {(data?.customers ?? []).map((c) => (
              <tr key={c.id} className="hover:bg-ink-50">
                <Td className="font-medium text-ink-900">
                  {[c.firstName, c.lastName].filter(Boolean).join(' ') || '—'}
                </Td>
                <Td>{c.email}</Td>
                <Td>{c.group ? <Pill tone="info">{c.group.name}</Pill> : <span className="text-ink-400">—</span>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

function StaffTab({ staff }: { staff: Detail['staff'] }) {
  return (
    <Card padded={false}>
      <Table>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Email</Th>
            <Th>Role</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {staff.map((u) => (
            <tr key={u.id} className="hover:bg-ink-50">
              <Td className="font-medium text-ink-900">{u.name}</Td>
              <Td>{u.email}</Td>
              <Td>
                <Pill tone="neutral">{titleCase(u.role)}</Pill>
              </Td>
              <Td>
                <Pill tone={u.isActive ? 'success' : 'danger'}>
                  {u.isActive ? 'Active' : 'Disabled'}
                </Pill>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function SettingsTab({
  slug,
  tenant,
  onSaved,
}: {
  slug: string;
  tenant: Detail['tenant'];
  onSaved: () => void;
}) {
  const [name, setName] = useState(tenant.name);
  const [primary, setPrimary] = useState(tenant.brandPrimary);
  const [accent, setAccent] = useState(tenant.brandAccent);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`tenants/${slug}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, brandPrimary: primary, brandAccent: accent }),
      });
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={save} className="max-w-lg">
        <h3 className="text-sm font-semibold text-ink-900">Store settings</h3>
        <p className="mt-0.5 text-xs text-ink-500">
          Brand tokens drive this store&apos;s white-label storefront theme.
        </p>

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-700">Store name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink-700">Brand primary</span>
              <input
                type="color"
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
                className="h-[38px] w-full rounded-lg border border-ink-300 px-1"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink-700">Brand accent</span>
              <input
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="h-[38px] w-full rounded-lg border border-ink-300 px-1"
              />
            </label>
          </div>

          {/* Live preview of the storefront header this store would render. */}
          <div className="rounded-lg border border-ink-200 p-3">
            <p className="mb-2 text-2xs font-medium text-ink-500">Storefront preview</p>
            <div
              className="flex items-center justify-between rounded-md px-4 py-3"
              style={{ backgroundColor: primary }}
            >
              <span className="text-sm font-semibold text-white">{name || tenant.name}</span>
              <span
                className="rounded px-2 py-1 text-2xs font-semibold"
                style={{ backgroundColor: accent, color: '#0B3325' }}
              >
                Shop tires
              </span>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
          {saved && <span className="text-xs text-brand-600">Saved</span>}
        </div>
      </form>
    </Card>
  );
}
