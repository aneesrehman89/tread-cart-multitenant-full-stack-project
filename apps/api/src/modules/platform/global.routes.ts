import { Router } from 'express';
import { z } from 'zod';
import { fanout } from '../../db/fanout.js';
import { asyncHandler } from '../../middleware/error.js';
import { cached } from '../../cache/cache.js';

// Cross-tenant fan-out views, cached briefly.
export const globalRouter: Router = Router();

const searchQuery = z.object({ q: z.string().optional() });

globalRouter.get(
  '/catalog',
  asyncHandler(async (req, res) => {
    const { q } = searchQuery.parse(req.query);

    const rows = await cached('platform:global:catalog', 30, async () => {
      const perTenant = await fanout((db) =>
        db.sku.findMany({
          where: { isActive: true },
          include: { product: { include: { brand: true } }, inventory: true },
          orderBy: { sku: 'asc' },
          take: 200,
        }),
      );

      return perTenant.flatMap((t) =>
        (t.value ?? []).map((s) => ({
          id: s.id,
          sku: s.sku,
          name: s.product.name,
          brand: s.product.brand.name,
          type: s.product.type,
          basePriceCents: s.basePriceCents,
          onHand: s.inventory?.onHand ?? 0,
          reorderAt: s.inventory?.reorderAt ?? 0,
          sectionWidthMm: s.sectionWidthMm,
          aspectRatio: s.aspectRatio,
          rimDiameterIn: s.rimDiameterIn,
          wheelWidthIn: s.wheelWidthIn,
          boltPattern: s.boltPattern,
          offsetMm: s.offsetMm,
          store: { slug: t.slug, name: t.name },
        })),
      );
    });

    const needle = q?.trim().toLowerCase();
    res.json({
      skus: needle
        ? rows.filter(
            (r) =>
              r.sku.toLowerCase().includes(needle) ||
              r.name.toLowerCase().includes(needle) ||
              r.brand.toLowerCase().includes(needle),
          )
        : rows,
    });
  }),
);

globalRouter.get(
  '/orders',
  asyncHandler(async (_req, res) => {
    const orders = await cached('platform:global:orders', 30, async () => {
      const perTenant = await fanout((db) =>
        db.order.findMany({
          include: { items: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
      );

      return perTenant
        .flatMap((t) =>
          (t.value ?? []).map((o) => ({
            id: o.id,
            number: o.number,
            status: o.status,
            email: o.email,
            totalCents: o.totalCents,
            itemCount: o.items.reduce((a, i) => a + i.quantity, 0),
            createdAt: o.createdAt,
            store: { slug: t.slug, name: t.name },
          })),
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 100);
    });

    res.json({ orders });
  }),
);

globalRouter.get(
  '/customers',
  asyncHandler(async (_req, res) => {
    const customers = await cached('platform:global:customers', 30, async () => {
      const perTenant = await fanout((db) =>
        db.customer.findMany({
          include: { group: true, _count: { select: { orders: true } } },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      );

      return perTenant.flatMap((t) =>
        (t.value ?? []).map((c) => ({
          id: c.id,
          email: c.email,
          name: [c.firstName, c.lastName].filter(Boolean).join(' ') || null,
          group: c.group ? { name: c.group.name, code: c.group.code } : null,
          orderCount: c._count.orders,
          createdAt: c.createdAt,
          store: { slug: t.slug, name: t.name },
        })),
      );
    });

    res.json({ customers });
  }),
);
