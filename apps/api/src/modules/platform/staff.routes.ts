import { Router } from 'express';
import { z } from 'zod';
import { hash as hashPassword } from '@node-rs/argon2';
import { controlDb } from '../../db/control.js';
import { asyncHandler } from '../../middleware/error.js';
import { conflict, notFound, badRequest } from '../../lib/errors.js';
import { PERMISSIONS, permissionsFor } from '../../middleware/rbac.js';
import type { StaffRole } from '../../generated/control/index.js';

export const staffRouter: Router = Router();

const ROLES: StaffRole[] = [
  'PLATFORM_ADMIN',
  'TENANT_OWNER',
  'TENANT_ADMIN',
  'CATALOG_MANAGER',
  'ORDER_MANAGER',
  'SUPPORT',
  'READ_ONLY',
];

/** Drives the permission matrix on the Users & permissions screen. */
staffRouter.get('/permissions', (_req, res) => {
  res.json({
    permissions: PERMISSIONS,
    roles: ROLES.map((role) => ({ role, permissions: permissionsFor(role) })),
  });
});

staffRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = z
      .object({ tenantSlug: z.string().optional(), role: z.enum(ROLES as [StaffRole, ...StaffRole[]]).optional() })
      .parse(req.query);

    const users = await controlDb.staffUser.findMany({
      where: {
        ...(q.tenantSlug ? { tenant: { slug: q.tenantSlug } } : {}),
        ...(q.role ? { role: q.role } : {}),
      },
      include: { tenant: { select: { slug: true, name: true, brandPrimary: true } } },
      orderBy: [{ tenantId: 'asc' }, { createdAt: 'asc' }],
    });

    res.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        isActive: u.isActive,
        createdAt: u.createdAt,
        tenant: u.tenant,
        permissionCount: permissionsFor(u.role).length,
      })),
    });
  }),
);

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  password: z.string().min(10),
  role: z.enum(ROLES as [StaffRole, ...StaffRole[]]),
  tenantSlug: z.string().nullable().optional(),
});

staffRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);

    // The two are mutually exclusive by definition: a platform admin is not
    // scoped to a store, and every other role must be.
    if (body.role === 'PLATFORM_ADMIN' && body.tenantSlug) {
      throw badRequest('A platform admin cannot be scoped to a store');
    }
    if (body.role !== 'PLATFORM_ADMIN' && !body.tenantSlug) {
      throw badRequest(`Role ${body.role} must be assigned to a store`);
    }

    let tenantId: string | null = null;
    if (body.tenantSlug) {
      const tenant = await controlDb.tenant.findUnique({ where: { slug: body.tenantSlug } });
      if (!tenant) throw notFound(`No store with slug "${body.tenantSlug}"`);
      tenantId = tenant.id;
    }

    const existing = await controlDb.staffUser.findFirst({
      where: { email: body.email.toLowerCase(), tenantId },
    });
    if (existing) throw conflict('That email already exists for this store');

    const user = await controlDb.staffUser.create({
      data: {
        email: body.email.toLowerCase(),
        name: body.name,
        passwordHash: await hashPassword(body.password),
        role: body.role,
        tenantId,
      },
      select: { id: true, email: true, name: true, role: true, isActive: true, tenantId: true },
    });

    res.status(201).json(user);
  }),
);

const patchSchema = z.object({
  role: z.enum(ROLES as [StaffRole, ...StaffRole[]]).optional(),
  isActive: z.boolean().optional(),
  name: z.string().min(1).max(120).optional(),
});

staffRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const body = patchSchema.parse(req.body);
    const target = await controlDb.staffUser.findUnique({ where: { id: req.params.id! } });
    if (!target) throw notFound('User not found');

    // Guard against an admin locking themselves out of the console.
    if (target.id === req.actor!.staffUserId && body.isActive === false) {
      throw badRequest('You cannot deactivate your own account');
    }
    if (target.id === req.actor!.staffUserId && body.role && body.role !== 'PLATFORM_ADMIN') {
      throw badRequest('You cannot remove your own platform admin role');
    }

    const user = await controlDb.staffUser.update({
      where: { id: target.id },
      data: body,
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    res.json(user);
  }),
);
