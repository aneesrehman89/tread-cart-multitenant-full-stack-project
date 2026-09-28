import { Router } from 'express';
import { z } from 'zod';
import { controlDb } from '../../db/control.js';
import { asyncHandler } from '../../middleware/error.js';
import { notFound } from '../../lib/errors.js';

export const supportRouter: Router = Router();

const listQuery = z.object({
  status: z.enum(['OPEN', 'PENDING', 'ESCALATED', 'RESOLVED', 'CLOSED']).optional(),
  tenantSlug: z.string().optional(),
  q: z.string().optional(),
});

supportRouter.get(
  '/tickets',
  asyncHandler(async (req, res) => {
    const q = listQuery.parse(req.query);

    const tickets = await controlDb.supportTicket.findMany({
      where: {
        ...(q.status ? { status: q.status } : { status: { notIn: ['CLOSED'] } }),
        ...(q.tenantSlug ? { tenant: { slug: q.tenantSlug } } : {}),
        ...(q.q
          ? {
              OR: [
                { subject: { contains: q.q, mode: 'insensitive' as const } },
                { requesterName: { contains: q.q, mode: 'insensitive' as const } },
                { number: { contains: q.q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      include: {
        tenant: { select: { slug: true, name: true, brandPrimary: true } },
        assignee: { select: { id: true, name: true } },
        _count: { select: { messages: true } },
      },
      // Urgent first, then oldest, matching how a support queue is worked.
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: 100,
    });

    // Counts cover the whole queue, not the filtered view.
    const [queueCount, unassignedCount] = await Promise.all([
      controlDb.supportTicket.count({ where: { status: { notIn: ['CLOSED', 'RESOLVED'] } } }),
      controlDb.supportTicket.count({
        where: { status: { notIn: ['CLOSED', 'RESOLVED'] }, assigneeId: null },
      }),
    ]);

    res.json({ tickets, matchCount: tickets.length, queueCount, unassignedCount });
  }),
);

/** Assignee options for the ticket header: platform staff only. */
supportRouter.get(
  '/assignees',
  asyncHandler(async (_req, res) => {
    const staff = await controlDb.staffUser.findMany({
      where: { role: 'PLATFORM_ADMIN', isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
    res.json({ assignees: staff });
  }),
);

const createSchema = z.object({
  subject: z.string().min(1).max(200),
  tenantSlug: z.string().min(1),
  requesterName: z.string().min(1).max(120),
  requesterEmail: z.string().email(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  slaHours: z.coerce.number().int().min(1).max(720).default(24),
  body: z.string().min(1).max(5000),
});

supportRouter.post(
  '/tickets',
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);

    const tenant = await controlDb.tenant.findUnique({ where: { slug: body.tenantSlug } });
    if (!tenant) throw notFound(`No store with slug "${body.tenantSlug}"`);

    // Continue numbering from the highest existing ticket.
    const latest = await controlDb.supportTicket.findFirst({
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const highest = Number.parseInt(latest?.number.replace(/\D/g, '') ?? '', 10);
    const number = `TC-${(Number.isFinite(highest) ? highest : 10_000) + 1}`;

    const ticket = await controlDb.supportTicket.create({
      data: {
        number,
        subject: body.subject,
        tenantId: tenant.id,
        requesterName: body.requesterName,
        requesterEmail: body.requesterEmail,
        priority: body.priority,
        status: 'OPEN',
        slaDueAt: new Date(Date.now() + body.slaHours * 3_600_000),
        messages: {
          create: { fromStaff: false, authorName: body.requesterName, body: body.body },
        },
      },
    });

    res.status(201).json(ticket);
  }),
);

supportRouter.get(
  '/tickets/:id',
  asyncHandler(async (req, res) => {
    const ticket = await controlDb.supportTicket.findUnique({
      where: { id: req.params.id! },
      include: {
        tenant: { select: { slug: true, name: true, brandPrimary: true } },
        assignee: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!ticket) throw notFound('Ticket not found');
    res.json(ticket);
  }),
);

const replySchema = z.object({ body: z.string().min(1).max(5000) });

supportRouter.post(
  '/tickets/:id/messages',
  asyncHandler(async (req, res) => {
    const { body } = replySchema.parse(req.body);
    const ticketId = req.params.id!;

    const ticket = await controlDb.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw notFound('Ticket not found');

    const staff = await controlDb.staffUser.findUniqueOrThrow({
      where: { id: req.actor!.staffUserId },
      select: { name: true },
    });

    const message = await controlDb.ticketMessage.create({
      data: { ticketId, fromStaff: true, authorName: staff.name, body },
    });

    // Replying takes ownership and moves an untouched ticket out of the queue.
    await controlDb.supportTicket.update({
      where: { id: ticketId },
      data: {
        assigneeId: ticket.assigneeId ?? req.actor!.staffUserId,
        status: ticket.status === 'OPEN' ? 'PENDING' : ticket.status,
      },
    });

    res.status(201).json(message);
  }),
);

const patchSchema = z.object({
  status: z.enum(['OPEN', 'PENDING', 'ESCALATED', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assigneeId: z.string().nullable().optional(),
});

supportRouter.patch(
  '/tickets/:id',
  asyncHandler(async (req, res) => {
    const body = patchSchema.parse(req.body);

    // Only platform staff can own tickets.
    if (body.assigneeId) {
      const assignee = await controlDb.staffUser.findFirst({
        where: { id: body.assigneeId, role: 'PLATFORM_ADMIN', isActive: true },
      });
      if (!assignee) throw notFound('That assignee is not an active platform admin');
    }

    const ticket = await controlDb.supportTicket.update({
      where: { id: req.params.id! },
      data: body,
      include: {
        tenant: { select: { slug: true, name: true, brandPrimary: true } },
        assignee: { select: { id: true, name: true } },
      },
    });
    res.json(ticket);
  }),
);
