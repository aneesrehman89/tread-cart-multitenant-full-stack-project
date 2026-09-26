// Loads the repo-root .env, then runs the Prisma CLI.
//
// The Prisma CLI only looks for .env next to the schema or in the cwd, but the
// workspace keeps a single .env at the repo root. Rather than duplicating
// connection strings into apps/api/.env, every Prisma script goes through here.
//
//   node scripts/with-env.mjs migrate dev --schema prisma/control/schema.prisma
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { resolvePrismaCli } from './prisma-cli.mjs';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

loadDotenv({ path: resolve(apiRoot, '../../.env') });
loadDotenv({ path: resolve(apiRoot, '.env'), override: true });

// Tenant-schema commands need a concrete database to act on. Default to the
// maintenance database so `generate` and `validate` work with no tenant
// selected; real per-tenant pushes set TENANT_DATABASE_URL explicitly.
if (!process.env.TENANT_DATABASE_URL) {
  process.env.TENANT_DATABASE_URL = process.env.TENANT_DB_ADMIN_URL ?? '';
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('usage: node scripts/with-env.mjs <prisma-args...>');
  process.exit(1);
}

// Spawn the CLI's JS entrypoint with the current Node binary. Node on Windows
// refuses to spawn .cmd shims without a shell, so npx/prisma.cmd are avoided.
const child = spawn(process.execPath, [resolvePrismaCli(apiRoot), ...args], {
  stdio: 'inherit',
  cwd: apiRoot,
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 1));
child.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
