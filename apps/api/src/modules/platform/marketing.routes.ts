import { Router } from 'express';
import { z } from 'zod';
import { controlDb } from '../../db/control.js';
import { asyncHandler } from '../../middleware/error.js';
import { notFound } from '../../lib/errors.js';

export const marketingRouter: Router = Router();

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

marketingRouter.get(
  '/banners',
  asyncHandler(async (req, res) => {
    const q = z.object({ q: z.string().optional() }).parse(req.query);

    const banners = await controlDb.platformBanner.findMany({
      where: q.q ? { title: { contains: q.q, mode: 'insensitive' } } : {},
      include: { tenant: { select: { slug: true, name: true } } },
      orderBy: [{ status: 'asc' }, { startsAt: 'desc' }],
    });

    res.json({ banners });
  }),
);

const bannerSchema = z.object({
  title: z.string().min(1).max(160),
  placement: z.enum(['HOME_HERO', 'CATEGORY_PAGE', 'CHECKOUT']).default('HOME_HERO'),
  status: z.enum(['DRAFT', 'SCHEDULED', 'LIVE', 'ENDED']).default('DRAFT'),
  gradientFrom: hex.default('#0F5132'),
  gradientTo: hex.default('#166534'),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  tenantId: z.string().nullable().optional(),
});

marketingRouter.post(
  '/banners',
  asyncHandler(async (req, res) => {
    const body = bannerSchema.parse(req.body);
    const banner = await controlDb.platformBanner.create({ data: body });
    res.status(201).json(banner);
  }),
);

marketingRouter.patch(
  '/banners/:id',
  asyncHandler(async (req, res) => {
    const body = bannerSchema.partial().parse(req.body);
    const existing = await controlDb.platformBanner.findUnique({ where: { id: req.params.id! } });
    if (!existing) throw notFound('Banner not found');

    const banner = await controlDb.platformBanner.update({
      where: { id: req.params.id! },
      data: body,
    });
    res.json(banner);
  }),
);

marketingRouter.delete(
  '/banners/:id',
  asyncHandler(async (req, res) => {
    const existing = await controlDb.platformBanner.findUnique({ where: { id: req.params.id! } });
    if (!existing) throw notFound('Banner not found');
    await controlDb.platformBanner.delete({ where: { id: req.params.id! } });
    res.status(204).end();
  }),
);
