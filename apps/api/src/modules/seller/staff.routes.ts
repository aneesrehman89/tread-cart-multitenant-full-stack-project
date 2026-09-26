import { Router } from 'express';
import { z } from 'zod';
import { hash as hashPassword } from '@node-rs/argon2';
import { controlDb } from '../../db/control.js';
import { sellerContext } from '../../middleware/seller-tenant.js';
import { asyncHandler } from '../../middleware/error.js';
import { PERMISSIONS, permissionsFor, requirePermission } from '../../middleware/rbac.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { revokeSessionCache } from '../../middleware/auth.js';
import type { StaffRole } from '../../generated/control/index.js';

export const sellerStaffRouter: Router = Router();

/**
 * Roles a store may assign. PLATFORM_ADMIN is deliberately absent: a store
 * must not be able to mint an account with cross-tenant access.
 */
const STORE_ROLES = [
  'TENANT_OWNER',
  'TENANT_ADMIN',
  'CATALOG_MANAGER',
  'ORDER_MANAGER',
  'SUPPORT',
  'READ_ONLY',
] as const satisfies readonly StaffRole[];

const roleEnum = z.enum(STORE_ROLES);

/** Roles tab: what each role can see or change, scoped to this store. */
sellerStaffRouter.get(
  '/roles',
  requirePermission('staff:manage'),
  asyncHandler(async (req, res) => {
    const { tenant, db } = sellerContext(req);
    void db;

    const counts = await controlDb.staffUser.groupBy({
      by: ['role'],
      _count: { _all: true },
      where: { tenantId: tenant.id },
    });
    const byRole = new Map(counts.map((c) => [c.role, c._count._all]));

    res.json({
      permissions: PERMISSIONS,
      roles: STORE_ROLES.map((role) => ({
        role,
        permissions: permissionsFor(role),
        staffAssigned: byRole.get(role) ?? 0,
        // The owner role is structural: it cannot be emptied or removed.
        isSystem: role === 'TENANT_OWNER',
      })),
    });
  }),
);

sellerStaffRouter.get(
  '/',
  requirePermission('staff:manage'),
  asyncHandler(async (req, res) => {
    const { tenant } = sellerContext(req);

    const users = await controlDb.staffUser.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        sessions: {
          where: { revokedAt: null, expiresAt: { gt: new Date() } },
          select: { lastSeenAt: true },
          orderBy: { lastSeenAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        createdAt: u.createdAt,
        permissionCount: permissionsFor(u.role).length,
        lastSeenAt: u.sessions[0]?.lastSeenAt ?? null,
      })),
    });
  }),
);

const createSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(10, 'Use at least 10 characters'),
  role: roleEnum,
});

sellerStaffRouter.post(
  '/',
  requirePermission('staff:manage'),
  asyncHandler(async (req, res) => {
    const { tenant } = sellerContext(req);
    const body = createSchema.parse(req.body);
    const email = body.email.toLowerCase();

    if (await controlDb.staffUser.findFirst({ where: { tenantId: tenant.id, email } })) {
      throw conflict('That email is already staff at this store');
    }

    const user = await controlDb.staffUser.create({
      data: {
        name: body.name,
        email,
        passwordHash: await hashPassword(body.password),
        role: body.role,
        tenantId: tenant.id,
      },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    res.status(201).json(user);
  }),
);

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  role: roleEnum.optional(),
  isActive: z.boolean().optional(),
});

sellerStaffRouter.patch(
  '/:id',
  requirePermission('staff:manage'),
  asyncHandler(async (req, res) => {
    const { tenant, actor } = sellerContext(req);
    const body = patchSchema.parse(req.body);

    const target = await controlDb.staffUser.findFirst({
      where: { id: req.params.id!, tenantId: tenant.id },
    });
    // Scoped by tenantId, so one store cannot touch another store's staff.
    if (!target) throw notFound('Staff member not found at this store');

    if (target.id === actor.staffUserId && body.isActive === false) {
      throw badRequest('You cannot deactivate your own account');
    }

    // A store must always keep at least one active owner, or nobody can
    // manage staff or billing again without platform intervention.
    const losingOwner =
      target.role === 'TENANT_OWNER' &&
      ((body.role && body.role !== 'TENANT_OWNER') || body.isActive === false);

    if (losingOwner) {
      const otherOwners = await controlDb.staffUser.count({
        where: {
          tenantId: tenant.id,
          role: 'TENANT_OWNER',
          isActive: true,
          id: { not: target.id },
        },
      });
      if (otherOwners === 0) {
        throw forbidden('This store must keep at least one active owner');
      }
    }

    const user = await controlDb.staffUser.update({
      where: { id: target.id },
      data: body,
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    // Deactivating or demoting must take effect now, not when the cached
    // session entry happens to expire.
    if (body.isActive === false || body.role) {
      const sessions = await controlDb.session.findMany({
        where: { staffUserId: target.id, revokedAt: null },
      });
      if (body.isActive === false) {
        await controlDb.session.updateMany({
          where: { id: { in: sessions.map((s) => s.id) } },
          data: { revokedAt: new Date() },
        });
      }
      await Promise.all(sessions.map((s) => revokeSessionCache(s.tokenHash)));
    }

    res.json(user);
  }),
);
