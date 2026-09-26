# TreadCart

Multi-tenant eCommerce platform for tires and wheels.

**Stack:** Node.js · Express · TypeScript · PostgreSQL · Prisma · Redis · Docker · Amazon S3 · Stripe

## What is here today

A runnable API plus the **platform admin console**. The multi-tenancy, auth,
RBAC, pricing and caching foundations are real and exercised end to end; the
commerce features on top of them are scaffolded but not finished (see
[Not built yet](#not-built-yet)).

```
TreadCart/
├─ docker-compose.yml        Postgres, Redis, (optional) MinIO
├─ .env.example              every setting, documented
├─ apps/api/
│  ├─ prisma/control/        control-plane schema: tenants, staff, sessions
│  ├─ prisma/tenant/         per-tenant schema: catalog, pricing, orders
│  └─ src/
│     ├─ db/control.ts         single control-plane client
│     ├─ db/tenant-registry.ts LRU of one PrismaClient per tenant database
│     ├─ middleware/tenant.ts  host/header -> tenant -> its own database
│     ├─ middleware/auth.ts    opaque bearer tokens
│     ├─ middleware/rbac.ts    permissions, bundled into roles
│     ├─ cache/cache.ts        read-through + write-through Redis helpers
│     ├─ modules/pricing/      customer groups, SKU-level prices, qty breaks
│     ├─ modules/platform/     cross-tenant control plane (the admin API)
│     ├─ db/fanout.ts          query every tenant database at once
│     └─ scripts/              tenant provisioner and seed
├─ apps/admin/               platform admin console (Next.js App Router)
│  └─ src/
│     ├─ app/api/tc/           server-side proxy; holds the token in a cookie
│     ├─ components/           design-system primitives and the app shell
│     └─ app/…                 one folder per screen
└─ UI's/                     design mockups (see the note at the bottom)
```

## Running it

Prerequisites: Node 20+, pnpm, Docker Desktop running.

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm --filter @treadcart/api db:generate
pnpm --filter @treadcart/api db:migrate
pnpm seed
pnpm dev
```

`pnpm dev` runs both apps: the API on <http://localhost:4000> and the admin
console on <http://localhost:3002>. Sign in with `admin@treadcart.test` /
`Treadcart!2345`. (`pnpm dev:api` and `pnpm dev:admin` run them separately.)

Postgres is published on **5433** and Redis on **6380** so they cannot collide
with anything already installed locally.

### Try it

Every `/v1` route runs inside one tenant. Pick the tenant with an
`X-Tenant-Slug` header (or a hostname, in production).

```bash
curl http://localhost:4000/readyz

# two tenants, two separate databases, different inventory
curl -H "X-Tenant-Slug: apexauto"   http://localhost:4000/v1/catalog/products
curl -H "X-Tenant-Slug: wheelworks" http://localhost:4000/v1/catalog/products
```

Log in and use the token:

```bash
curl -X POST http://localhost:4000/v1/auth/login \
  -H "X-Tenant-Slug: apexauto" -H "Content-Type: application/json" \
  -d '{"email":"owner@apexauto.test","password":"Treadcart!2345"}'
```

Seeded logins, password `Treadcart!2345`:

| Tenant | Owner | Catalog manager |
| --- | --- | --- |
| _platform console_ | `admin@treadcart.test` | — |
| `apexauto` (tires) | `owner@apexauto.test` | `catalog@apexauto.test` |
| `wheelworks` (wheels) | `owner@wheelworks.test` | `catalog@wheelworks.test` |
| `torquelab` (suspended) | `owner@torquelab.test` | `catalog@torquelab.test` |

Group pricing, on the same catalog call:

```bash
# resolves to group-sku-fixed / group-default-discount instead of base
curl -H "X-Tenant-Slug: apexauto" \
  "http://localhost:4000/v1/catalog/products?groupId=<TRADE group id>"
```

### Adding a tenant

```bash
pnpm --filter @treadcart/api tenant:provision -- \
  --slug rimcity --name "Rim City" --host rimcity.localhost
```

That creates `treadcart_t_rimcity`, pushes the tenant schema into it, and
registers it in the control plane. No restart needed.

## How multi-tenancy works

Each tenant gets **its own Postgres database**. Isolation is the database
boundary, so no query can reach another tenant's rows even if a `WHERE` clause
is forgotten. The tenant schema deliberately has no `tenant_id` column anywhere.

A request flows through:

1. `resolveTenant` reads `X-Tenant-Slug` or the `Host` header, looks the tenant
   up in the control database (cached in Redis for 60s), and rejects anything
   that is not `ACTIVE`.
2. `tenant-registry` hands back a `PrismaClient` bound to that tenant's
   connection string, kept warm across requests. The registry is an LRU capped
   at `TENANT_POOL_MAX_CLIENTS`, with an idle sweeper that disconnects quiet
   tenants, so socket use stays bounded as tenants are added.
3. Handlers use `req.db`, which can only see one tenant's data.

The cost of this model is that cross-tenant reporting needs a fan-out across
databases, and migrations must be applied to every tenant database rather than
once. `provision-tenant.ts` currently uses `prisma db push`; **switch it to
`prisma migrate deploy` before production** so every tenant advances through
the same reviewed migration history.

### Auth

Bearer tokens are **opaque**: 32 random bytes, no claims, meaningless if
decoded. Only a peppered SHA-256 of the token is stored, so a control-database
leak yields nothing replayable. Revocation is one row update plus a Redis
delete. Live sessions are cached in Redis, so the hot path is a `GET`, not a
database round trip. A tenant-scoped session presented against a different
tenant is rejected outright.

### Caching

`cached()` is read-through; `writeThrough()` persists to Postgres first and then
refreshes the same key, so no window exists where the cache serves the pre-write
value. Every key is prefixed `t:<tenant-slug>:` because Redis is shared even
though the databases are not.

## The admin console

`apps/admin` implements the six screens in `UI's/Admin/`, rebuilt for
TreadCart. Every screen reads live data; none of the numbers are hard-coded.

| Screen | Route | What is real |
| --- | --- | --- |
| Sign in | `/login` | Platform-only login; store credentials are rejected |
| Dashboard | `/` | GMV, orders, trend and status donut, fanned out across tenant DBs |
| Stores | `/stores` | Live tenant list; **Onboard store** provisions a real database |
| Store detail | `/stores/[slug]` | Overview, catalog, orders, customers, staff, settings; suspend/reactivate works |
| Support | `/support` | Ticket queue with SLA pills; replies and status changes persist |
| Marketing | `/marketing` | Banner CRUD with live gradient preview |
| Users & permissions | `/users` | Staff CRUD, role changes, and the RBAC matrix the server enforces |
| My account | `/account` | Profile, password change, and real session revocation |

Three sidebar entries (Global catalog, Customers, Orders) are cross-store
views that did not appear in the mockups but are needed for the nav to work;
each is a fan-out over every tenant database.

### How the console authenticates

The browser never holds the API token. `/login` posts to a Next.js route
handler, which forwards to the API, captures the opaque token from the
response, strips it from the body and stores it in an httpOnly cookie on the
console's own origin. Every later call goes through the same proxy, which
replays the token as a bearer header and forwards the caller's user-agent and
IP so session rows record the real device.

### Design tokens

`tailwind.config.ts` carries the ramp from the design system in
`UI's/1- user-customized-theaming.png`: a forest-green brand scale, a lime
accent, green-tinted neutrals, and semantic status colours kept separate from
the brand so order status stays readable. Each store's own
`brandPrimary`/`brandAccent` are editable on the store Settings tab, with a
live storefront preview.

## Not built yet

The scope these foundations were built for, in the order I would tackle it:

- **Signed checkout → Stripe.** `lib/tokens.ts` has the HMAC intent
  sign/verify; the order-creation and Stripe session routes are not written.
- **Stripe webhooks.** `ProcessedWebhook` exists for idempotency, and `app.ts`
  marks where the raw-body route must mount (before `express.json()`).
- **S3 uploads.** `lib/s3.ts` is complete (signed PUT/GET, tenant-namespaced
  keys) but no route calls it yet.
- **Customer storefront.** The admin console is built; the storefront is not.
- **Campaigns and performance** tabs on Marketing need an events pipeline;
  only the banners tab is wired up.
- Inventory reservation between checkout and payment (`reserved` is modelled,
  not yet decremented).

## Known gaps to close before production

- `Tenant.databaseUrl` is stored in plaintext. Encrypt it with KMS.
- Secrets in `.env.example` are dev placeholders. `AUTH_TOKEN_PEPPER` and
  `CHECKOUT_SIGNING_SECRET` must be rotated to real random values; rotating the
  pepper invalidates every live session.
- The `X-Tenant-Slug` override should be restricted to non-production or
  platform admins; production should trust the `Host` header only.
- MinIO is behind an optional compose profile (`--profile storage`) because its
  image could not be pulled on the machine this was set up on. Either start it
  that way or point `S3_*` at real AWS S3.

## A note on `UI's/`

Those mockups are from a different product: they show **"Green Grocer"**, a
grocery delivery marketplace with seller KYC and delivery agents, and the
architecture diagram in them specifies NestJS, Vite/React, React Native, Neon,
Resend and Ola Maps, plus *"one shared schema, not a database per seller"* —
the opposite of the model built here.

The one piece that does transfer is `1- user-customized-theaming.png`, a
white-label design-token system. `Tenant.brandPrimary` / `brandAccent` map onto
its `tenant-brand` token and are returned by `GET /v1/context` so a storefront
can theme itself per tenant.
