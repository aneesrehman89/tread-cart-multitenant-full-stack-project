import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

redis.on('error', (err) => logger.error({ err }, 'redis error'));
redis.on('connect', () => logger.info('redis connected'));

export async function closeRedis(): Promise<void> {
  await redis.quit();
}
