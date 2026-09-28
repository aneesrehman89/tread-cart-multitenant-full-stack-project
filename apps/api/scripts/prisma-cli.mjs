import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Run Prisma's JS entrypoint directly; Windows can't spawn .cmd shims without a shell.
export function resolvePrismaCli(fromDir) {
  const require = createRequire(resolve(fromDir, 'package.json'));

  try {
    return require.resolve('prisma/build/index.js');
  } catch {
    // pnpm hoists differently across versions; fall back to the known paths.
    const candidates = [
      resolve(fromDir, 'node_modules/prisma/build/index.js'),
      resolve(fromDir, '../../node_modules/prisma/build/index.js'),
    ];
    const found = candidates.find((p) => existsSync(p));
    if (found) return found;
    throw new Error('Could not locate the Prisma CLI. Run `pnpm install` first.');
  }
}
