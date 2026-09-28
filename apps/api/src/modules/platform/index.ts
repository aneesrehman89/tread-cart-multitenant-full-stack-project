import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requirePlatformAdmin } from '../../middleware/rbac.js';
import { platformAuthRouter } from './platform.auth.js';
import { tenantsRouter } from './tenants.routes.js';
import { metricsRouter } from './metrics.routes.js';
import { supportRouter } from './support.routes.js';
import { marketingRouter } from './marketing.routes.js';
import { staffRouter } from './staff.routes.js';
import { globalRouter } from './global.routes.js';
import { applicationsRouter } from './applications.routes.js';

// Cross-tenant routes, all gated on PLATFORM_ADMIN.
export const platformRouter: Router = Router();

// Auth handles its own gating: /login must stay reachable while signed out.
platformRouter.use('/auth', platformAuthRouter);

platformRouter.use(requireAuth, requirePlatformAdmin);
platformRouter.use('/metrics', metricsRouter);
platformRouter.use('/tenants', tenantsRouter);
platformRouter.use('/staff', staffRouter);
platformRouter.use('/global', globalRouter);
platformRouter.use('/applications', applicationsRouter);
platformRouter.use('/support', supportRouter);
platformRouter.use('/marketing', marketingRouter);
