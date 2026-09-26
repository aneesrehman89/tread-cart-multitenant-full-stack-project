import { Router } from 'express';
import { controlDb } from '../../db/control.js';
import { redis } from '../../cache/redis.js';
import { registryStats } from '../../db/tenant-registry.js';
import { asyncHandler } from '../../middleware/error.js';

export const healthRouter: Router = Router();

/** Liveness: is the process up. Never touches a dependency. */
healthRouter.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
});

/** Readiness: can we actually serve traffic. */
healthRouter.get(
  '/readyz',
  asyncHandler(async (_req, res) => {
    const checks: Record<string, 'ok' | string> = {};

    try {
      await controlDb.$queryRaw`SELECT 1`;
      checks.controlDb = 'ok';
    } catch (err) {
      checks.controlDb = String(err);
    }

    try {
      await redis.ping();
      checks.redis = 'ok';
    } catch (err) {
      checks.redis = String(err);
    }

    const healthy = Object.values(checks).every((v) => v === 'ok');
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ready' : 'degraded',
      checks,
      tenantPool: registryStats(),
    });
  }),
);
