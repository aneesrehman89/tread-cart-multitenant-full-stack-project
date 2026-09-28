import type { NextFunction, Request, Response } from 'express';
import type { StaffRole } from '../generated/control/index.js';
import { forbidden, unauthorized } from '../lib/errors.js';

// Routes check permissions; roles are just bundles of them.
export const PERMISSIONS = [
  'catalog:read',
  'catalog:write',
  'inventory:read',
  'inventory:write',
  'pricing:read',
  'pricing:write',
  'order:read',
  'order:write',
  'customer:read',
  'customer:write',
  'staff:manage',
  'tenant:manage',
  'platform:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  PLATFORM_ADMIN: PERMISSIONS,
  TENANT_OWNER: [
    'catalog:read', 'catalog:write',
    'inventory:read', 'inventory:write',
    'pricing:read', 'pricing:write',
    'order:read', 'order:write',
    'customer:read', 'customer:write',
    'staff:manage', 'tenant:manage',
  ],
  TENANT_ADMIN: [
    'catalog:read', 'catalog:write',
    'inventory:read', 'inventory:write',
    'pricing:read', 'pricing:write',
    'order:read', 'order:write',
    'customer:read', 'customer:write',
    'staff:manage',
  ],
  CATALOG_MANAGER: [
    'catalog:read', 'catalog:write',
    'inventory:read', 'inventory:write',
    'pricing:read', 'pricing:write',
  ],
  ORDER_MANAGER: [
    'catalog:read',
    'inventory:read',
    'order:read', 'order:write',
    'customer:read',
  ],
  SUPPORT: ['catalog:read', 'order:read', 'customer:read'],
  READ_ONLY: [
    'catalog:read', 'inventory:read', 'pricing:read',
    'order:read', 'customer:read',
  ],
};

export function roleHas(role: StaffRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsFor(role: StaffRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

/** Route guard: every listed permission must be held. */
export function requirePermission(...required: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const actor = req.actor;
    if (!actor) return next(unauthorized());

    const missing = required.filter((p) => !roleHas(actor.role, p));
    if (missing.length > 0) {
      return next(
        forbidden(`Role ${actor.role} is missing permission(s): ${missing.join(', ')}`),
      );
    }
    next();
  };
}

/** Restricts a route to cross-tenant platform staff. */
export function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.actor) return next(unauthorized());
  if (req.actor.role !== 'PLATFORM_ADMIN') {
    return next(forbidden('Platform administrator access required'));
  }
  next();
}
