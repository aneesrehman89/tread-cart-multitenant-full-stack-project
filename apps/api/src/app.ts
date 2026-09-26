import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { randomUUID } from 'node:crypto';

import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { resolveTenant } from './middleware/tenant.js';
import { healthRouter } from './modules/health/health.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { catalogRouter } from './modules/catalog/catalog.routes.js';
import { platformRouter } from './modules/platform/index.js';
import { sellerRouter } from './modules/seller/index.js';

export function createApp(): Express {
  const app = express();

  // Behind a load balancer this makes req.ip and secure cookies correct.
  app.set('trust proxy', 1);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req.headers['x-request-id'] as string) ?? randomUUID(),
      autoLogging: { ignore: (req) => req.url === '/healthz' },
    }),
  );

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : true,
      credentials: true,
      // The storefront sends this to say which tenant it is.
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Slug', 'X-Request-Id'],
    }),
  );
  app.use(cookieParser());

  // Health checks are deliberately outside tenant resolution and rate limiting.
  app.use(healthRouter);

  // Stripe signs the raw bytes, so the webhook route must not be JSON-parsed.
  // Mount it before express.json() once the billing module lands:
  //   app.post('/v1/webhooks/stripe', express.raw({ type: 'application/json' }), handler)

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      // Count per tenant + IP so one noisy tenant cannot exhaust another's budget.
      keyGenerator: (req) => `${req.header('x-tenant-slug') ?? req.hostname}:${req.ip}`,
    }),
  );

  // The platform console is cross-tenant, so it mounts BEFORE the tenant
  // middleware and never resolves a single tenant from the request.
  app.use('/v1/platform', platformRouter);

  // The seller dashboard takes its tenant from the session, not a header, so
  // it also mounts before the tenant middleware.
  app.use('/v1/seller', sellerRouter);

  // Everything below this line runs inside a resolved tenant's database.
  app.use('/v1', resolveTenant);
  app.use('/v1/auth', authRouter);
  app.use('/v1/catalog', catalogRouter);

  // Echoes the resolved tenant and its brand tokens; the storefront calls this
  // on boot to theme itself.
  app.get('/v1/context', (req, res) => {
    res.json({ tenant: req.tenant, actor: req.actor ?? null });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
