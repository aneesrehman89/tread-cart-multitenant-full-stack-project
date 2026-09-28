// Loads the root .env before running the Prisma CLI.
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { resolvePrismaCli } from './prisma-cli.mjs';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

loadDotenv({ path: resolve(apiRoot, '../../.env') });
loadDotenv({ path: resolve(apiRoot, '.env'), override: true });

// Default to the maintenance DB so generate/validate work without a tenant.
if (!process.env.TENANT_DATABASE_URL) {
  process.env.TENANT_DATABASE_URL = process.env.TENANT_DB_ADMIN_URL ?? '';
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('usage: node scripts/with-env.mjs <prisma-args...>');
  process.exit(1);
}

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
