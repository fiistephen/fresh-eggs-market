import prisma from '../plugins/prisma.js';
import { authenticate } from '../plugins/auth.js';
import { authorize } from '../middleware/authorize.js';

// Convert Prisma Decimals to Numbers
function enrichCustomer(c) {
  return {
    ...c,
    ...(c.bookings && {
      bookings: c.bookings.map(b => ({
        ...b,
        amountPaid: Number(b.amountPaid),
        orderValue: Number(b.orderValue),
      })),
    }),
    ...(c.sales && {
      sales: c.sales.map(s => ({
        ...s,
        totalAmount: Number(s.totalAmount),
        totalCost: Number(s.totalCost),
      })),
    }),
  };
}

export default async function customerRoutes(fastify) {

  // ─── LIST CUSTOMERS ───────────────────────────────────────────
  fastify.get('/customers', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { search, limit = 50, offset = 0 } = request.query;

      const where = search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              ...(search.includes('@') ? [{ email: { contains: search, mode: 'insensitive' } }] : []),
            ],
          }
        : {};

      const [customers, total] = await Promise.all([
        prisma.customer.findMany({
          where,
          include: {
            _count: { select: { bookings: true, sales: true } },
          },
          orderBy: { name: 'asc' },
          take: parseInt(limit),
          skip: parseInt(offset),
        }),
        prisma.customer.count({ where }),
      ]);

      return reply.send({ customers, total });
    },
  });

  // ─── GET SINGLE CUSTOMER WITH HISTORY ─────────────────────────
  fastify.get('/customers/:id', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const customer = await prisma.customer.findUnique({
        where: { id: request.params.id },
        include: {
          bookings: {
            include: { batch: { select: { name: true, status: true } } },
            orderBy: { createdAt: 'desc' },
            take: 20,
          },
          sales: {
            include: { batch: { select: { name: true } } },
            orderBy: { saleDate: 'desc' },
            take: 20,
          },
          _count: { select: { bookings: true, sales: true } },
        },
      });

      if (!customer) return reply.code(404).send({ error: 'Customer not found' });

      // Calculate lifetime stats
      const allBookings = await prisma.booking.findMany({
        where: { customerId: customer.id, status: { not: 'CANCELLED' } },
        select: { amountPaid: true, quantity: true },
      });
      const allSales = await prisma.sale.findMany({
        where: { customerId: customer.id },
        select: { totalAmount: true, totalQuantity: true },
      });

      const stats = {
        totalBookings: allBookings.length,
        totalBookedCrates: allBookings.reduce((s, b) => s + b.quantity, 0),
        totalBookingValue: allBookings.reduce((s, b) => s + Number(b.amountPaid), 0),
        totalSales: allSales.length,
        totalPurchasedCrates: allSales.reduce((s, s2) => s + s2.totalQuantity, 0),
        totalSpent: allSales.reduce((s, s2) => s + Number(s2.totalAmount), 0),
      };

      return reply.send({ customer: enrichCustomer(customer), stats });
    },
  });

  // ─── CREATE CUSTOMER ──────────────────────────────────────────
  fastify.post('/customers', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'SHOP_FLOOR')],
    handler: async (request, reply) => {
      const { name, phone, email, notes } = request.body;

      if (!name || !phone) {
        return reply.code(400).send({ error: 'Name and phone are required' });
      }

      // Check for duplicate phone
      const existing = await prisma.customer.findFirst({ where: { phone } });
      if (existing) {
        return reply.code(409).send({ error: `Customer with phone ${phone} already exists`, existingCustomer: existing });
      }

      const customer = await prisma.customer.create({
        data: { name, phone, email: email || null, notes: notes || null },
      });

      return reply.code(201).send({ customer });
    },
  });

  // ─── UPDATE CUSTOMER ──────────────────────────────────────────
  fastify.patch('/customers/:id', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const existing = await prisma.customer.findUnique({ where: { id: request.params.id } });
      if (!existing) return reply.code(404).send({ error: 'Customer not found' });

      const { name, phone, email, notes, isFirstTime } = request.body;

      // Check phone uniqueness if changing
      if (phone && phone !== existing.phone) {
        const phoneExists = await prisma.customer.findFirst({ where: { phone, id: { not: existing.id } } });
        if (phoneExists) {
          return reply.code(409).send({ error: `Phone ${phone} already belongs to another customer` });
        }
      }

      const customer = await prisma.customer.update({
        where: { id: request.params.id },
        data: {
          ...(name !== undefined && { name }),
          ...(phone !== undefined && { phone }),
          ...(email !== undefined && { email }),
          ...(notes !== undefined && { notes }),
          ...(isFirstTime !== undefined && { isFirstTime }),
        },
      });

      return reply.send({ customer });
    },
  });

  // ─── DELETE CUSTOMER (admin only, no bookings/sales) ──────────
  fastify.delete('/customers/:id', {
    preHandler: [authenticate, authorize('ADMIN')],
    handler: async (request, reply) => {
      const customer = await prisma.customer.findUnique({
        where: { id: request.params.id },
        include: { _count: { select: { bookings: true, sales: true, bankTransactions: true } } },
      });

      if (!customer) return reply.code(404).send({ error: 'Customer not found' });

      if (customer._count.bookings > 0 || customer._count.sales > 0 || customer._count.bankTransactions > 0) {
        return reply.code(400).send({
          error: 'Cannot delete customer with existing bookings, sales, or transactions',
          counts: customer._count,
        });
      }

      await prisma.customer.delete({ where: { id: request.params.id } });
      return reply.send({ message: 'Customer deleted' });
    },
  });
}
