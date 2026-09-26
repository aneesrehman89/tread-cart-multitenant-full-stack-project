/**
 * Provisions a new tenant: creates its own Postgres database, pushes the
 * tenant schema into it, and registers it in the control plane.
 *
 *   pnpm --filter @treadcart/api tenant:provision -- \
 *     --slug wheelworks --name "WheelWorks" --host wheelworks.localhost
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error - plain .mjs helper shared with the Prisma npm scripts
import { resolvePrismaCli } from '../../scripts/prisma-cli.mjs';
import { PrismaClient as ControlPrismaClient } from '../generated/control/index.js';
import { env } from '../config/env.js';
import { controlDb } from '../db/control.js';
import { invalidateTenantLookup } from '../middleware/tenant.js';
import { logger } from '../lib/logger.js';

const execFileAsync = promisify(execFile);

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function tenantDatabaseUrl(databaseName: string): string {
  const user = encodeURIComponent(env.TENANT_DB_USER);
  const pass = encodeURIComponent(env.TENANT_DB_PASSWORD);
  return `postgresql://${user}:${pass}@${env.TENANT_DB_HOST}:${env.TENANT_DB_PORT}/${databaseName}?schema=public`;
}

export async function provisionTenant(opts: {
  slug: string;
  name: string;
  host?: string;
  brandPrimary?: string;
  brandAccent?: string;
}): Promise<{ id: string; databaseName: string; databaseUrl: string }> {
  const slug = opts.slug.toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) {
    throw new Error(`Invalid tenant slug "${slug}": use lowercase letters, digits and hyphens`);
  }

  // The slug is validated above, so this interpolation cannot inject SQL.
  const databaseName = `treadcart_t_${slug.replace(/-/g, '_')}`;
  const databaseUrl = tenantDatabaseUrl(databaseName);

  // CREATE DATABASE cannot run inside a transaction, so it goes through a
  // throwaway client pointed at the server's maintenance database.
  const admin = new ControlPrismaClient({
    datasources: { db: { url: env.TENANT_DB_ADMIN_URL } },
  });

  try {
    const exists = await admin.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*)::bigint AS count FROM pg_database WHERE datname = '${databaseName}'`,
    );
    if (Number(exists[0]?.count ?? 0) === 0) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
      logger.info({ databaseName }, 'created tenant database');
    } else {
      logger.info({ databaseName }, 'tenant database already exists, reusing');
    }
  } finally {
    await admin.$disconnect();
  }

  // Apply the tenant schema to the brand-new database.
  //
  // `db push` is right for a skeleton; before production switch this to
  // `prisma migrate deploy` so every tenant DB advances through the same
  // reviewed migration history and schemaVersion below means something.
  // Awaited, not execFileSync: this runs inside an HTTP request when a
  // platform admin approves a seller, and a synchronous spawn would block the
  // whole Node event loop for the ~10s the push takes, freezing every other
  // request the API is serving.
  await execFileAsync(
    process.execPath,
    [
      resolvePrismaCli(apiRoot),
      'db',
      'push',
      '--schema',
      'prisma/tenant/schema.prisma',
      '--skip-generate',
    ],
    {
      cwd: apiRoot,
      env: { ...process.env, TENANT_DATABASE_URL: databaseUrl },
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  const tenant = await controlDb.tenant.upsert({
    where: { slug },
    create: {
      slug,
      name: opts.name,
      status: 'ACTIVE',
      databaseName,
      databaseUrl,
      ...(opts.brandPrimary ? { brandPrimary: opts.brandPrimary } : {}),
      ...(opts.brandAccent ? { brandAccent: opts.brandAccent } : {}),
      ...(opts.host
        ? { domains: { create: { host: opts.host.toLowerCase(), isPrimary: true } } }
        : {}),
    },
    update: { name: opts.name, status: 'ACTIVE', databaseName, databaseUrl },
  });

  await invalidateTenantLookup(slug, opts.host ? [opts.host.toLowerCase()] : []);

  logger.info({ tenantId: tenant.id, slug, databaseName }, 'tenant provisioned');
  return { id: tenant.id, databaseName, databaseUrl };
}

// Only run when invoked directly, so seed.ts can import provisionTenant.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const slug = arg('slug');
  const name = arg('name');

  if (!slug || !name) {
    console.error('Usage: tenant:provision -- --slug <slug> --name <name> [--host <host>]');
    process.exit(1);
  }

  provisionTenant({ slug, name, host: arg('host') })
    .then(() => controlDb.$disconnect())
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ err }, 'provisioning failed');
      process.exit(1);
    });
}
