import { PrismaClient } from '../generated/control/index.js';
import { env } from '../config/env.js';

export const controlDb = new PrismaClient({
  datasources: { db: { url: env.CONTROL_DATABASE_URL } },
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export async function closeControlDb(): Promise<void> {
  await controlDb.$disconnect();
}
