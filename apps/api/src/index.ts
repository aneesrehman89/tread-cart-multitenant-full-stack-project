import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { closeControlDb } from './db/control.js';
import { closeAllTenantClients, startIdleSweeper } from './db/tenant-registry.js';
import { closeRedis } from './cache/redis.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info(`TreadCart API listening on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
});

startIdleSweeper();

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');

  // Stop accepting new connections, then close every tenant pool we hold.
  server.close(() => logger.info('http server closed'));

  const timeout = setTimeout(() => {
    logger.error('graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000);
  timeout.unref();

  try {
    await Promise.all([closeAllTenantClients(), closeControlDb(), closeRedis()]);
    logger.info('all connections closed');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandled promise rejection');
});
