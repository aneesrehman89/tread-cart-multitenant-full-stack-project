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

    res.json({ tickets, openCount: tickets.length });
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
