import type { PrismaClient as TenantPrismaClient } from '../generated/tenant/index.js';
import type { StaffRole } from '../generated/control/index.js';

export interface ResolvedTenant {
  id: string;
  slug: string;
  name: string;
  brandPrimary: string;
  brandAccent: string;
  logoUrl: string | null;
}

export interface AuthenticatedActor {
  sessionId: string;
  staffUserId: string;
  email: string;
  role: StaffRole;
  /** Null for PLATFORM_ADMIN, who is not bound to one tenant. */
  tenantId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      tenant?: ResolvedTenant;
      /** Prisma client bound to the resolved tenant's own database. */
      db?: TenantPrismaClient;
      actor?: AuthenticatedActor;
      requestId?: string;
    }
  }
}

export {};
