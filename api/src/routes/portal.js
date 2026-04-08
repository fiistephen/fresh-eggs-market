import bcrypt from 'bcrypt';
import crypto from 'crypto';
import prisma from '../plugins/prisma.js';
import { config } from '../config/env.js';
import {
  generateAccessToken,
  generateRefreshToken,
  authenticate,
} from '../plugins/auth.js';
import { authorize } from '../middleware/authorize.js';

const SALT_ROUNDS = 12;

function mapBatchEggCode(eggCode, batch = null) {
  if (!eggCode) return null;
  return {
    ...eggCode,
    costPrice: eggCode.costPrice != null ? Number(eggCode.costPrice) : null,
    wholesalePrice: eggCode.wholesalePrice != null
      ? Number(eggCode.wholesalePrice)
      : batch?.wholesalePrice != null
        ? Number(batch.wholesalePrice)
        : null,
    retailPrice: eggCode.retailPrice != null
      ? Number(eggCode.retailPrice)
      : batch?.retailPrice != null
        ? Number(batch.retailPrice)
        : null,
  };
}

export default async function portalRoutes(fastify) {
  // ────────────────────────────────────────────────────────────
  // PUBLIC: GET /portal/batches — open batches for customer viewing
  // No auth required — customers can browse before signing up
  // ────────────────────────────────────────────────────────────
  fastify.get('/portal/batches', {
    handler: async (request, reply) => {
      const batches = await prisma.batch.findMany({
        where: { status: 'OPEN' },
        include: {
          eggCodes: { select: { id: true, code: true, quantity: true, freeQty: true, costPrice: true, wholesalePrice: true, retailPrice: true } },
          _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
        },
        orderBy: { expectedDate: 'asc' },
      });

      // Calculate availability for each batch
      const result = [];
      for (const batch of batches) {
        const bookedAgg = await prisma.booking.aggregate({
          where: { batchId: batch.id, status: 'CONFIRMED' },
          _sum: { quantity: true },
        });
        const totalBooked = bookedAgg._sum.quantity || 0;
        const remainingAvailable = Math.max(0, batch.availableForBooking - totalBooked);

        result.push({
          id: batch.id,
          name: batch.name,
          expectedDate: batch.expectedDate,
          wholesalePrice: Number(batch.wholesalePrice),
          retailPrice: Number(batch.retailPrice),
          expectedQuantity: batch.expectedQuantity,
          availableForBooking: batch.availableForBooking,
          totalBooked,
          remainingAvailable,
          eggCodes: batch.eggCodes.map((ec) => mapBatchEggCode(ec, batch)),
          bookingsCount: batch._count.bookings,
        });
      }

      return reply.send({ batches: result });
    },
  });

  // ────────────────────────────────────────────────────────────
  // PUBLIC: POST /portal/register — customer self-registration
  // Creates both a User (for auth) and a Customer record
  // ────────────────────────────────────────────────────────────
  fastify.post('/portal/register', {
    handler: async (request, reply) => {
      const { name, email, phone, password } = request.body;

      // Validation
      if (!name || !name.trim()) return reply.code(400).send({ error: 'Name is required' });
      if (!email || !email.trim()) return reply.code(400).send({ error: 'Email is required' });
      if (!phone || !phone.trim()) return reply.code(400).send({ error: 'Phone number is required' });
      if (!password || password.length < 8) return reply.code(400).send({ error: 'Password must be at least 8 characters' });

      // Check if email already registered
      const existingUser = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
      if (existingUser) return reply.code(409).send({ error: 'Email already registered. Please log in instead.' });

      // Check if phone already in customers table
      const existingCustomer = await prisma.customer.findFirst({ where: { phone: phone.trim() } });

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      // Split name into first/last
      const nameParts = name.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || firstName;

      // Create user + customer in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create User account
        const user = await tx.user.create({
          data: {
            email: email.trim().toLowerCase(),
            passwordHash,
            firstName,
            lastName,
            phone: phone.trim(),
            role: 'CUSTOMER',
          },
        });

        // Create or link Customer record
        let customer;
        if (existingCustomer) {
          // Link existing customer to this user by updating email
          customer = await tx.customer.update({
            where: { id: existingCustomer.id },
            data: { email: email.trim().toLowerCase() },
          });
        } else {
          customer = await tx.customer.create({
            data: {
              name: name.trim(),
              phone: phone.trim(),
              email: email.trim().toLowerCase(),
              isFirstTime: true,
            },
          });
        }

        return { user, customer };
      });

      // Generate tokens
      const accessToken = generateAccessToken(result.user);
      const refreshToken = generateRefreshToken(result.user);

      await prisma.refreshToken.create({
        data: {
          token: crypto.createHash('sha256').update(refreshToken).digest('hex'),
          userId: result.user.id,
          expiresAt: new Date(Date.now() + config.jwtRefreshExpiryMs),
        },
      });

      return reply.code(201).send({
        accessToken,
        refreshToken,
        user: {
          id: result.user.id,
          email: result.user.email,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          role: result.user.role,
        },
        customerId: result.customer.id,
      });
    },
  });

  // ────────────────────────────────────────────────────────────
  // AUTH: GET /portal/my-bookings — customer's own bookings
  // ────────────────────────────────────────────────────────────
  fastify.get('/portal/my-bookings', {
    preHandler: [authenticate, authorize('CUSTOMER')],
    handler: async (request, reply) => {
      // Find the customer record linked to this user's email
      const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
      if (!user) return reply.code(404).send({ error: 'User not found' });

      const customer = await prisma.customer.findFirst({ where: { email: user.email } });
      if (!customer) return reply.send({ bookings: [], customerId: null });

      const bookings = await prisma.booking.findMany({
        where: { customerId: customer.id },
        include: {
          batch: { select: { id: true, name: true, expectedDate: true, status: true, wholesalePrice: true } },
          batchEggCode: { select: { id: true, code: true, wholesalePrice: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({
        customerId: customer.id,
        bookings: bookings.map(b => ({
          id: b.id,
          batch: b.batch.name,
          batchStatus: b.batch.status,
          itemCode: b.batchEggCode?.code || null,
          expectedDate: b.batch.expectedDate,
          quantity: b.quantity,
          orderValue: Number(b.orderValue),
          amountPaid: Number(b.amountPaid),
          balance: Number(b.orderValue) - Number(b.amountPaid),
          status: b.status,
          channel: b.channel,
          createdAt: b.createdAt,
        })),
      });
    },
  });

  // ────────────────────────────────────────────────────────────
  // AUTH: POST /portal/book — customer places a booking
  // ────────────────────────────────────────────────────────────
  fastify.post('/portal/book', {
    preHandler: [authenticate, authorize('CUSTOMER')],
    handler: async (request, reply) => {
      const { batchId, quantity, amountPaid } = request.body;

      // Validation
      if (!batchId) return reply.code(400).send({ error: 'batchId is required' });
      if (!quantity || !Number.isInteger(quantity) || quantity < 1) return reply.code(400).send({ error: 'quantity must be a positive integer' });
      if (!amountPaid || amountPaid <= 0) return reply.code(400).send({ error: 'amountPaid must be positive' });

      // Get user + customer
      const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
      if (!user) return reply.code(404).send({ error: 'User not found' });

      const customer = await prisma.customer.findFirst({ where: { email: user.email } });
      if (!customer) return reply.code(400).send({ error: 'No customer record found. Please contact support.' });

      // Get batch
      const batch = await prisma.batch.findUnique({
        where: { id: batchId },
        include: { eggCodes: true },
      });
      if (!batch) return reply.code(404).send({ error: 'Batch not found' });
      if (batch.status !== 'OPEN') return reply.code(400).send({ error: 'Batch is not open for booking' });

      // Check availability
      const bookedAgg = await prisma.booking.aggregate({
        where: { batchId, status: 'CONFIRMED' },
        _sum: { quantity: true },
      });
      const totalBooked = bookedAgg._sum.quantity || 0;
      const remainingAvailable = batch.availableForBooking - totalBooked;

      if (quantity > remainingAvailable) {
        return reply.code(400).send({ error: `Only ${remainingAvailable} crates available for booking` });
      }

      // Max 100 per batch per customer
      const maxQty = 100;
      const customerBookedAgg = await prisma.booking.aggregate({
        where: { customerId: customer.id, batchId, status: 'CONFIRMED' },
        _sum: { quantity: true },
      });
      const customerAlreadyBooked = customerBookedAgg._sum.quantity || 0;
      const customerRemaining = maxQty - customerAlreadyBooked;

      if (quantity > customerRemaining) {
        return reply.code(400).send({ error: `You can only book ${customerRemaining} more crates from this batch (max ${maxQty} per batch)` });
      }

      // First-time customer max 20
      if (customer.isFirstTime && quantity > 20) {
        return reply.code(400).send({ error: 'First-time customers can book a maximum of 20 crates' });
      }

      // Calculate order value
      const orderValue = quantity * Number(batch.wholesalePrice);

      // Min 80% payment
      const minPayment = orderValue * 0.8;
      if (amountPaid < minPayment) {
        return reply.code(400).send({ error: `Minimum payment is 80% of order value (₦${minPayment.toLocaleString()})` });
      }

      // Create booking
      const booking = await prisma.booking.create({
        data: {
          customerId: customer.id,
          batchId,
          quantity,
          amountPaid,
          orderValue,
          status: 'CONFIRMED',
          channel: 'website',
          notes: `Self-service booking by ${customer.name}`,
        },
        include: { batch: { select: { name: true, expectedDate: true } } },
      });

      // Update isFirstTime if applicable
      if (customer.isFirstTime) {
        await prisma.customer.update({
          where: { id: customer.id },
          data: { isFirstTime: false },
        });
      }

      return reply.code(201).send({
        booking: {
          id: booking.id,
          batch: booking.batch.name,
          expectedDate: booking.batch.expectedDate,
          quantity: booking.quantity,
          orderValue: Number(booking.orderValue),
          amountPaid: Number(booking.amountPaid),
          balance: Number(booking.orderValue) - Number(booking.amountPaid),
          status: booking.status,
          channel: booking.channel,
          createdAt: booking.createdAt,
        },
        message: `Successfully booked ${quantity} crate${quantity !== 1 ? 's' : ''} from batch ${booking.batch.name}!`,
      });
    },
  });

  // ────────────────────────────────────────────────────────────
  // AUTH: GET /portal/profile — customer profile
  // ────────────────────────────────────────────────────────────
  fastify.get('/portal/profile', {
    preHandler: [authenticate, authorize('CUSTOMER')],
    handler: async (request, reply) => {
      const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
      if (!user) return reply.code(404).send({ error: 'User not found' });

      const customer = await prisma.customer.findFirst({
        where: { email: user.email },
        include: {
          _count: { select: { bookings: true, sales: true } },
        },
      });

      const stats = customer ? {
        totalBookings: customer._count.bookings,
        totalPurchases: customer._count.sales,
      } : { totalBookings: 0, totalPurchases: 0 };

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
        },
        customerId: customer?.id || null,
        isFirstTime: customer?.isFirstTime ?? true,
        stats,
      });
    },
  });
}
