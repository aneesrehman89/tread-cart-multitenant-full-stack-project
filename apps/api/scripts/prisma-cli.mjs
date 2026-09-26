import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Locates the Prisma CLI's JS entrypoint.
 *
 * Node on Windows refuses to spawn `.cmd` shims without a shell, so calling
 * `npx prisma` or `prisma.cmd` from a child process fails with EINVAL. Running
 * the entrypoint under `process.execPath` sidesteps the shims entirely and
 * behaves identically on every platform.
 */
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
