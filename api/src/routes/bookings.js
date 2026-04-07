import prisma from '../plugins/prisma.js';
import { authenticate } from '../plugins/auth.js';
import { authorize } from '../middleware/authorize.js';

// Convert Prisma Decimals to Numbers for JSON
function enrichBooking(b) {
  return {
    ...b,
    amountPaid: Number(b.amountPaid),
    orderValue: Number(b.orderValue),
    ...(b.batch && {
      batch: {
        ...b.batch,
        ...(b.batch.wholesalePrice !== undefined && { wholesalePrice: Number(b.batch.wholesalePrice) }),
        ...(b.batch.retailPrice !== undefined && { retailPrice: Number(b.batch.retailPrice) }),
        ...(b.batch.costPrice !== undefined && { costPrice: Number(b.batch.costPrice) }),
      },
    }),
  };
}

export default async function bookingRoutes(fastify) {

  // ─── LIST BOOKINGS ────────────────────────────────────────────
  fastify.get('/bookings', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { batchId, customerId, status } = request.query;
      const where = {};
      if (batchId) where.batchId = batchId;
      if (customerId) where.customerId = customerId;
      if (status) where.status = status;

      const bookings = await prisma.booking.findMany({
        where,
        include: {
          customer: true,
          batch: { select: { id: true, name: true, expectedDate: true, status: true, wholesalePrice: true, retailPrice: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({ bookings: bookings.map(enrichBooking) });
    },
  });

  // ─── GET SINGLE BOOKING ───────────────────────────────────────
  fastify.get('/bookings/:id', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const booking = await prisma.booking.findUnique({
        where: { id: request.params.id },
        include: {
          customer: true,
          batch: { select: { id: true, name: true, expectedDate: true, status: true, wholesalePrice: true, retailPrice: true, costPrice: true } },
          sale: true,
        },
      });

      if (!booking) return reply.code(404).send({ error: 'Booking not found' });
      return reply.send({ booking: enrichBooking(booking) });
    },
  });

  // ─── CREATE BOOKING ───────────────────────────────────────────
  fastify.post('/bookings', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'CUSTOMER')],
    handler: async (request, reply) => {
      const { customerId, batchId, quantity, amountPaid, channel, notes } = request.body;

      // Validate required fields
      if (!customerId || !batchId || !quantity || amountPaid == null) {
        return reply.code(400).send({ error: 'Missing required fields: customerId, batchId, quantity, amountPaid' });
      }

      if (quantity <= 0 || !Number.isInteger(quantity)) {
        return reply.code(400).send({ error: 'Quantity must be a positive integer' });
      }

      // 1. Batch must be open
      const batch = await prisma.batch.findUnique({ where: { id: batchId } });
      if (!batch) return reply.code(404).send({ error: 'Batch not found' });
      if (batch.status !== 'OPEN') {
        return reply.code(400).send({ error: 'Batch is not open for booking' });
      }

      // 2. Check available quantity
      const totalBooked = await prisma.booking.aggregate({
        where: { batchId, status: { not: 'CANCELLED' } },
        _sum: { quantity: true },
      });
      const currentlyBooked = totalBooked._sum.quantity || 0;
      const remaining = batch.availableForBooking - currentlyBooked;

      if (quantity > remaining) {
        return reply.code(400).send({
          error: `Only ${remaining} crates available for booking in this batch`,
          remaining,
        });
      }

      // 3. Max 100 crates per booking
      if (quantity > 100) {
        return reply.code(400).send({ error: 'Maximum booking is 100 crates per order' });
      }

      // 4. First-time customer max 20 crates
      const customer = await prisma.customer.findUnique({ where: { id: customerId } });
      if (!customer) {
        return reply.code(404).send({ error: 'Customer not found' });
      }
      if (customer.isFirstTime && quantity > 20) {
        return reply.code(400).send({ error: 'First-time customers can book a maximum of 20 crates' });
      }

      // 5. Minimum 80% payment
      const orderValue = quantity * Number(batch.wholesalePrice);
      const minPayment = orderValue * 0.8;
      if (Number(amountPaid) < minPayment) {
        return reply.code(400).send({
          error: `Minimum payment is 80% of order value (₦${minPayment.toLocaleString()})`,
          orderValue,
          minimumPayment: minPayment,
          amountPaid: Number(amountPaid),
        });
      }

      const booking = await prisma.booking.create({
        data: {
          customerId,
          batchId,
          quantity,
          amountPaid,
          orderValue,
          channel: channel || 'backend',
          notes: notes || null,
        },
        include: {
          customer: true,
          batch: { select: { id: true, name: true, wholesalePrice: true } },
        },
      });

      // If customer was first-time, mark as repeat for next time
      if (customer.isFirstTime) {
        await prisma.customer.update({
          where: { id: customerId },
          data: { isFirstTime: false },
        });
      }

      return reply.code(201).send({ booking: enrichBooking(booking) });
    },
  });

  // ─── UPDATE BOOKING (only CONFIRMED bookings) ────────────────
  fastify.patch('/bookings/:id', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const existing = await prisma.booking.findUnique({
        where: { id: request.params.id },
        include: { batch: true },
      });

      if (!existing) return reply.code(404).send({ error: 'Booking not found' });
      if (existing.status !== 'CONFIRMED') {
        return reply.code(400).send({ error: 'Can only edit confirmed bookings' });
      }

      const { quantity, amountPaid, notes } = request.body;
      const updates = {};

      if (quantity !== undefined) {
        if (quantity <= 0 || !Number.isInteger(quantity)) {
          return reply.code(400).send({ error: 'Quantity must be a positive integer' });
        }

        // Check available quantity (excluding current booking)
        const totalBooked = await prisma.booking.aggregate({
          where: { batchId: existing.batchId, status: { not: 'CANCELLED' }, id: { not: existing.id } },
          _sum: { quantity: true },
        });
        const othersBooked = totalBooked._sum.quantity || 0;
        const remaining = existing.batch.availableForBooking - othersBooked;

        if (quantity > remaining) {
          return reply.code(400).send({ error: `Only ${remaining} crates available` });
        }
        if (quantity > 100) {
          return reply.code(400).send({ error: 'Maximum booking is 100 crates' });
        }

        updates.quantity = quantity;
        updates.orderValue = quantity * Number(existing.batch.wholesalePrice);
      }

      if (amountPaid !== undefined) {
        const orderVal = updates.orderValue || Number(existing.orderValue);
        const minPayment = orderVal * 0.8;
        if (Number(amountPaid) < minPayment) {
          return reply.code(400).send({ error: `Minimum payment is 80% (₦${minPayment.toLocaleString()})` });
        }
        updates.amountPaid = amountPaid;
      }

      if (notes !== undefined) updates.notes = notes;

      const booking = await prisma.booking.update({
        where: { id: request.params.id },
        data: updates,
        include: {
          customer: true,
          batch: { select: { id: true, name: true, wholesalePrice: true } },
        },
      });

      return reply.send({ booking: enrichBooking(booking) });
    },
  });

  // ─── BATCH BOOKING STATUS OVERVIEW ────────────────────────────
  fastify.get('/bookings/batch-status/:batchId', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const batch = await prisma.batch.findUnique({
        where: { id: request.params.batchId },
      });

      if (!batch) return reply.code(404).send({ error: 'Batch not found' });

      const bookings = await prisma.booking.findMany({
        where: { batchId: batch.id, status: { not: 'CANCELLED' } },
        include: { customer: { select: { name: true, phone: true } } },
      });

      const totalBooked = bookings.reduce((s, b) => s + b.quantity, 0);

      return reply.send({
        batch: { id: batch.id, name: batch.name, status: batch.status },
        expectedQuantity: batch.expectedQuantity,
        availableForBooking: batch.availableForBooking,
        totalBooked,
        remainingAvailable: batch.availableForBooking - totalBooked,
        bookers: bookings.map(b => ({
          id: b.id,
          customer: b.customer.name,
          phone: b.customer.phone,
          quantity: b.quantity,
          amountPaid: Number(b.amountPaid),
          orderValue: Number(b.orderValue),
          status: b.status,
          date: b.createdAt,
        })),
      });
    },
  });

  // ─── CANCEL BOOKING ───────────────────────────────────────────
  fastify.patch('/bookings/:id/cancel', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const existing = await prisma.booking.findUnique({ where: { id: request.params.id } });
      if (!existing) return reply.code(404).send({ error: 'Booking not found' });
      if (existing.status !== 'CONFIRMED') {
        return reply.code(400).send({ error: `Cannot cancel a booking with status: ${existing.status}` });
      }

      const booking = await prisma.booking.update({
        where: { id: request.params.id },
        data: { status: 'CANCELLED' },
        include: { customer: true, batch: { select: { name: true } } },
      });

      return reply.send({ booking: enrichBooking(booking) });
    },
  });

  // ─── OPEN BATCHES FOR BOOKING (customer-facing) ───────────────
  fastify.get('/bookings/open-batches', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const openBatches = await prisma.batch.findMany({
        where: { status: 'OPEN' },
        orderBy: { expectedDate: 'asc' },
      });

      // Calculate remaining availability for each
      const result = await Promise.all(openBatches.map(async (batch) => {
        const totalBooked = await prisma.booking.aggregate({
          where: { batchId: batch.id, status: { not: 'CANCELLED' } },
          _sum: { quantity: true },
        });
        const booked = totalBooked._sum.quantity || 0;
        const remaining = batch.availableForBooking - booked;

        return {
          id: batch.id,
          name: batch.name,
          expectedDate: batch.expectedDate,
          wholesalePrice: Number(batch.wholesalePrice),
          retailPrice: Number(batch.retailPrice),
          availableForBooking: batch.availableForBooking,
          totalBooked: booked,
          remainingAvailable: remaining,
        };
      }));

      return reply.send({ batches: result.filter(b => b.remainingAvailable > 0) });
    },
  });
}
