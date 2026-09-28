# TreadCart

Multi-tenant eCommerce platform for tires and wheels. Every store runs on its own PostgreSQL database; one Express API serves three Next.js apps.

**Stack:** Node.js 20 · TypeScript · Express · Prisma · PostgreSQL 16 · Redis 7 · Next.js 15 / React 19 · Tailwind · Stripe · Resend/SMTP · Twilio · Google OAuth · S3 · Docker · pnpm workspaces

| App | Path | Port |
| --- | --- | --- |
| API | `apps/api` | 4000 |
| Customer storefront | `apps/storefront` | 3000 |
| Seller dashboard | `apps/seller` | 3001 |
| Platform admin | `apps/admin` | 3002 |

## Setup

Requires Node 20+, pnpm and Docker.

```bash
pnpm install
cp .env.example .env
pnpm infra:up          # Postgres on 5433, Redis on 6380
pnpm db:generate
pnpm db:migrate
pnpm seed              # demo stores, catalog, customers and 60 days of orders
pnpm dev               # all four apps
```

## Scripts

| Command | Does |
| --- | --- |
| `pnpm dev` | Runs API + all three frontends in parallel |
| `pnpm dev:api` / `dev:shop` / `dev:seller` / `dev:admin` | Runs one app |
| `pnpm build` | Builds every workspace package |
| `pnpm infra:up` / `infra:down` | `docker compose up -d` / `docker compose down` |
| `pnpm infra:nuke` | `docker compose down -v` — also deletes DB and Redis data |
| `pnpm db:generate` | Generates both Prisma clients (control + tenant) |
| `pnpm db:migrate` | Runs control-plane migrations |
| `pnpm seed` | Seeds control DB and provisions demo tenants |
| `pnpm --filter @treadcart/api tenant:provision -- --slug <slug> --name "<Name>" --host <host>` | Creates a new tenant DB and registers it |
| `pnpm --filter @treadcart/api db:studio` | Prisma Studio on the control DB |

## Seeded accounts

Password for all: `Treadcart!2345`

| Who | Email | App |
| --- | --- | --- |
| Anees Ur Rehman — platform admin | `admin@treadcart.test` | Admin `:3002` |
| Imran Qureshi — Apex Auto owner | `owner@apexauto.test` | Seller `:3001` |
| Sadia Nawaz — Apex Auto catalog manager | `catalog@apexauto.test` | Seller `:3001` |
| Tariq Mehmood — WheelWorks owner | `owner@wheelworks.test` | Seller `:3001` |
| Mariam Aslam — WheelWorks catalog manager | `catalog@wheelworks.test` | Seller `:3001` |
| Owais Farooq — Torque Lab owner | `owner@torquelab.test` | Seeded as suspended |

Customers register at checkout on `:3000`. The storefront serves the store in `TREADCART_STORE` (default `apexauto`).

## Configuration

All settings live in the root `.env` (see `.env.example`), validated at boot by `apps/api/src/config/env.ts`.

| Area | Variables | Without it |
| --- | --- | --- |
| Databases | `CONTROL_DATABASE_URL`, `TENANT_DB_*`, `TENANT_POOL_*` | Required |
| Redis | `REDIS_URL`, `CACHE_TTL_SECONDS` | Required |
| Auth | `AUTH_TOKEN_PEPPER`, `SESSION_TTL_SECONDS`, `CHECKOUT_SIGNING_SECRET` | Required — use real random values outside dev |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Orders are created; a dev-only "Simulate payment" button is shown |
| Email | `RESEND_API_KEY` or `SMTP_*`, `MAIL_FROM` | Codes are shown on screen, receipts are not sent |
| SMS | `TWILIO_*` | Codes are shown on screen |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_CUSTOMER_REDIRECT_URI` | "Continue with Google" is hidden |

Google redirect URIs: `http://localhost:4000/v1/seller/auth/google/callback` and `http://localhost:4000/v1/customer/auth/google/callback`.

Local Stripe webhooks:

```bash
stripe listen --forward-to localhost:4000/v1/webhooks/stripe
```

## Architecture

- **Control DB** (`prisma/control`) — tenants, staff, sessions, seller applications, support, banners.
- **Tenant DB** (`prisma/tenant`) — catalog, inventory, pricing, customers, orders. One physical database per store (`treadcart_t_<slug>`), no `tenantId` columns.
- **Request path:** `resolveTenant` (header/host → tenant, 60s Redis cache) → `requireAuth` (opaque token, Redis-cached session) → `requirePermission` (RBAC) → handler using `req.db`.
- **Seller routes** resolve the tenant from the session, never a header.
- **Tenant clients** are held in an LRU (`TENANT_POOL_MAX_CLIENTS`, 3 connections each, idle sweeper).
- **Admin views** fan out across every tenant DB and are cached briefly.
- **Checkout:** server re-prices the cart → order `AWAITING_PAYMENT` + stock reserved in one transaction → Stripe Checkout → signed, idempotent webhook decrements stock and marks `PAID`.

API route groups: `/v1/platform` (admin), `/v1/seller`, `/v1/shop` + `/v1/catalog` + `/v1/auth` (tenant-scoped), `/v1/customer` (customer OAuth), `/v1/webhooks/stripe`.

## Quick API checks

```bash
curl http://localhost:4000/readyz
curl -H "X-Tenant-Slug: apexauto"  http://localhost:4000/v1/catalog/products
curl -H "X-Tenant-Slug: wheelworks" http://localhost:4000/v1/catalog/products   # different DB, different catalog
curl -H "X-Tenant-Slug: torquelab" http://localhost:4000/v1/catalog/products    # 403: suspended
```

Database access: `localhost:5433`, user/password `treadcart`.

```bash
docker exec -it treadcart-postgres psql -U treadcart -d treadcart_t_apexauto -c "\dt"
```

## Deployment

- **Frontends → Vercel.** Three Vercel projects on this one repo, Root Directory `apps/admin`, `apps/seller`, `apps/storefront`. Each app's `vercel.json` pins pnpm, installs only that app's dependencies, and skips the build when the push didn't touch the app or the shared lockfile/workspace files.
- **API → a long-running host** (e.g. Railway) with Postgres and Redis. It can't run on Vercel: it keeps per-tenant connection pools and creates databases at runtime.
  - Build: `NODE_ENV=development pnpm install --frozen-lockfile --filter @treadcart/api... && pnpm --filter @treadcart/api db:generate && pnpm --filter @treadcart/api build`
  - Start: `pnpm --filter @treadcart/api db:deploy && pnpm --filter @treadcart/api start`
- **Frontend env:** `TREADCART_API_URL` (all three), `TREADCART_STORE` (storefront). Both are read at build time, so redeploy after changing them. Unset locally, they default to `http://localhost:4000` and `apexauto`.

## Known gaps

- `provision-tenant.ts` uses `prisma db push`; switch to `migrate deploy` for production.
- `X-Tenant-Slug` is accepted in every environment; production should trust only the `Host` header.
- `Tenant.databaseUrl` is stored in plaintext.
- S3 helpers exist but no upload UI uses them; product images are URLs.
- Twilio SMS is implemented but not configured.
- MinIO is behind an optional compose profile: `docker compose --profile storage up -d`.
