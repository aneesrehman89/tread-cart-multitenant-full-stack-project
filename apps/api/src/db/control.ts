import { PrismaClient } from '../generated/control/index.js';
import { env } from '../config/env.js';

/**
 * The single control-plane client. One connection pool for the whole process,
 * because every request needs it to resolve its tenant.
 */
export const controlDb = new PrismaClient({
  datasources: { db: { url: env.CONTROL_DATABASE_URL } },
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export async function closeControlDb(): Promise<void> {
  await controlDb.$disconnect();
}
