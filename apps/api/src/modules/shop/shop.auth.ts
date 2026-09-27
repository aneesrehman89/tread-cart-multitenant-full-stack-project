import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { hash as hashPassword, verify as verifyPassword } from '@node-rs/argon2';
import { env, isProduction } from '../../config/env.js';
import { generateOpaqueToken, hashToken } from '../../lib/tokens.js';
import { asyncHandler } from '../../middleware/error.js';
import { requireTenantContext } from '../../middleware/tenant.js';
import { conflict, notFound, unauthorized } from '../../lib/errors.js';

/**
 * Storefront customer accounts.
 *
 * Customers belong to one store and live in that store's own database, so
 * their sessions do too. The same address can be a customer of two different
 * stores without those accounts being related in any way.
 */
export const shopAuthRouter: Router = Router();

const COOKIE = 'tc_shopper_session';

function readToken(req: Request): string | null {
  const header = req.header('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.[COOKIE] ?? null;
}

/** Attaches req.customer when a valid storefront session is presented. */
export async function optionalCustomer(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { db } = requireTenantContext(req);
    const token = readToken(req);
    if (!token) return next();

    const session = await db.customerSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { customer: { include: { group: true } } },
    });

    if (session && !session.revokedAt && session.expiresAt > new Date()) {
      req.customer = {
        id: session.customer.id,
        email: session.customer.email,
        firstName: session.customer.firstName,
        lastName: session.customer.lastName,
        groupId: session.customer.groupId,
        groupName: session.customer.group?.name ?? null,
        sessionId: session.id,
      };
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireCustomer(req: Request, _res: Response, next: NextFunction): void {
  if (!req.customer) return next(unauthorized('Please sign in to continue'));
  next();
}

async function issueSession(
  req: Request,
  res: Response,
  customerId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const { db } = requireTenantContext(req);
  const token = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_SECONDS * 1000);

  await db.customerSession.create({
    data: {
      tokenHash: hashToken(token),
      customerId,
      userAgent: req.header('user-agent') ?? null,
      ip: req.ip ?? null,
      expiresAt,
    },
  });

  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    expires: expiresAt,
  });

  return { token, expiresAt };
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Use at least 8 characters'),
  firstName: z.string().min(1).max(80),
  lastName: z.string().max(80).optional(),
  phone: z.string().max(40).optional(),
});

shopAuthRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { db } = requireTenantContext(req);
    const body = registerSchema.parse(req.body);
    const email = body.email.toLowerCase();

    const existing = await db.customer.findUnique({ where: { email } });
    if (existing?.passwordHash) {
      throw conflict('An account already exists for that email. Sign in instead.');
    }

    // A customer row may already exist from a guest order; this claims it
    // rather than failing, so their order history carries over.
    const customer = existing
      ? await db.customer.update({
          where: { id: existing.id },
          data: {
            passwordHash: await hashPassword(body.password),
            firstName: body.firstName,
            lastName: body.lastName ?? existing.lastName,
            phone: body.phone ?? existing.phone,
          },
        })
      : await db.customer.create({
          data: {
            email,
            passwordHash: await hashPassword(body.password),
            firstName: body.firstName,
            lastName: body.lastName ?? null,
            phone: body.phone ?? null,
          },
        });

    const { token, expiresAt } = await issueSession(req, res, customer.id);
    res.status(201).json({ token, expiresAt, customer: publicCustomer(customer) });
  }),
);

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

shopAuthRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { db } = requireTenantContext(req);
    const body = loginSchema.parse(req.body);

    const customer = await db.customer.findUnique({
      where: { email: body.email.toLowerCase() },
      include: { group: true },
    });

    const ok = customer?.passwordHash
      ? await verifyPassword(customer.passwordHash, body.password)
      : false;
    if (!customer || !ok) throw unauthorized('Invalid email or password');

    const { token, expiresAt } = await issueSession(req, res, customer.id);
    res.json({ token, expiresAt, customer: publicCustomer(customer) });
  }),
);

shopAuthRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    if (!req.customer) throw unauthorized();
    const { db } = requireTenantContext(req);

    const customer = await db.customer.findUniqueOrThrow({
      where: { id: req.customer.id },
      include: { group: true, addresses: { orderBy: { isDefault: 'desc' } } },
    });

    res.json({ ...publicCustomer(customer), addresses: customer.addresses });
  }),
);

shopAuthRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const { db } = requireTenantContext(req);
    if (req.customer) {
      await db.customerSession.update({
        where: { id: req.customer.sessionId },
        data: { revokedAt: new Date() },
      });
    }
    res.clearCookie(COOKIE);
    res.status(204).end();
  }),
);

// --- addresses ------------------------------------------------------------

const addressSchema = z.object({
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).nullable().optional(),
  city: z.string().min(1).max(100),
  region: z.string().min(1).max(100),
  postalCode: z.string().min(1).max(20),
  country: z.string().min(2).max(2).default('PK'),
  isDefault: z.boolean().default(false),
});

shopAuthRouter.post(
  '/addresses',
  requireCustomer,
  asyncHandler(async (req, res) => {
    const { db } = requireTenantContext(req);
    const body = addressSchema.parse(req.body);

    // Exactly one address is the default, so setting a new one clears the rest.
    if (body.isDefault) {
      await db.address.updateMany({
        where: { customerId: req.customer!.id },
        data: { isDefault: false },
      });
    }

    const address = await db.address.create({
      data: { ...body, customerId: req.customer!.id },
    });
    res.status(201).json(address);
  }),
);

shopAuthRouter.delete(
  '/addresses/:id',
  requireCustomer,
  asyncHandler(async (req, res) => {
    const { db } = requireTenantContext(req);
    const address = await db.address.findFirst({
      where: { id: req.params.id!, customerId: req.customer!.id },
    });
    if (!address) throw notFound('Address not found');

    await db.address.delete({ where: { id: address.id } });
    res.status(204).end();
  }),
);

function publicCustomer(c: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  groupId: string | null;
}) {
  return {
    id: c.id,
    email: c.email,
    firstName: c.firstName,
    lastName: c.lastName,
    phone: c.phone,
    groupId: c.groupId,
  };
}
