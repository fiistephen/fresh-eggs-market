import prisma from '../plugins/prisma.js';
import { authenticate } from '../plugins/auth.js';
import { authorize } from '../middleware/authorize.js';
import { getCustomerEggTypeConfig, getCustomerEggTypeLabel, getOperationsPolicy } from '../utils/appSettings.js';
import { getCustomerOrderLimitProfile } from '../utils/customerOrderPolicy.js';
import { getActivePortalBookingHoldQuantity } from '../utils/portalCheckout.js';

const ELIGIBLE_BOOKING_PAYMENT_CATEGORIES = [
  'CUSTOMER_DEPOSIT',
  'CUSTOMER_BOOKING',
  'UNALLOCATED_INCOME',
];

function toNumber(value) {
  return value == null ? null : Number(value);
}

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

function enrichBooking(booking, eggTypes = [], policy = { bookingMinimumPaymentPercent: 80 }) {
  const amountPaid = Number(booking.amountPaid);
  const orderValue = Number(booking.orderValue);
  const minimumPayment = orderValue * (Number(policy.bookingMinimumPaymentPercent || 80) / 100);
  const balance = Math.max(0, orderValue - amountPaid);

  return {
    ...booking,
    amountPaid,
    orderValue,
    minimumPayment,
    balance,
    isMinimumMet: amountPaid >= minimumPayment,
    allocations: (booking.allocations || []).map((allocation) => ({
      ...allocation,
      amount: Number(allocation.amount),
      bankTransaction: allocation.bankTransaction ? {
        ...allocation.bankTransaction,
        amount: Number(allocation.bankTransaction.amount),
      } : undefined,
    })),
    ...(booking.batch && {
      batch: {
        ...booking.batch,
        ...(booking.batch.wholesalePrice !== undefined && { wholesalePrice: Number(booking.batch.wholesalePrice) }),
        ...(booking.batch.retailPrice !== undefined && { retailPrice: Number(booking.batch.retailPrice) }),
        ...(booking.batch.costPrice !== undefined && { costPrice: Number(booking.batch.costPrice) }),
        eggTypeKey: booking.batch.eggTypeKey || 'REGULAR',
        eggTypeLabel: getCustomerEggTypeLabel(eggTypes, booking.batch.eggTypeKey || 'REGULAR'),
        ...(booking.batch.eggCodes && {
          eggCodes: booking.batch.eggCodes.map((eggCode) => mapBatchEggCode(eggCode, booking.batch)),
        }),
      },
    }),
    batchEggCode: booking.batchEggCode ? mapBatchEggCode(booking.batchEggCode, booking.batch) : null,
  };
}

function buildBookingInclude() {
  return {
    customer: true,
    batch: {
      select: {
        id: true,
        name: true,
        expectedDate: true,
        status: true,
        eggTypeKey: true,
        wholesalePrice: true,
        retailPrice: true,
        costPrice: true,
        eggCodes: {
          select: {
            id: true,
            code: true,
            costPrice: true,
            wholesalePrice: true,
            retailPrice: true,
            quantity: true,
            freeQty: true,
          },
        },
      },
    },
    batchEggCode: {
      select: {
        id: true,
        code: true,
        costPrice: true,
        wholesalePrice: true,
        retailPrice: true,
      },
    },
    sale: true,
    portalCheckout: {
      select: {
        id: true,
        reference: true,
        checkoutType: true,
        paymentMethod: true,
        status: true,
        createdAt: true,
      },
    },
    allocations: {
      include: {
        bankTransaction: {
          select: {
            id: true,
            amount: true,
            transactionDate: true,
            category: true,
            reference: true,
            description: true,
            bankAccount: {
              select: { id: true, name: true, accountType: true, lastFour: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    },
  };
}

async function getBookedQuantityForBatch(batchId, excludeBookingId = null) {
  const [totalBooked, heldForPortal] = await Promise.all([
    prisma.booking.aggregate({
      where: {
        batchId,
        status: { not: 'CANCELLED' },
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      },
      _sum: { quantity: true },
    }),
    getActivePortalBookingHoldQuantity(batchId),
  ]);

  return (totalBooked._sum.quantity || 0) + heldForPortal;
}

async function getAvailableCustomerPayments(customerId, options = {}) {
  const { excludeBookingId = null } = options;

  const transactions = await prisma.bankTransaction.findMany({
    where: {
      customerId,
      direction: 'INFLOW',
      category: { in: ELIGIBLE_BOOKING_PAYMENT_CATEGORIES },
    },
    include: {
      bankAccount: { select: { id: true, name: true, accountType: true, lastFour: true } },
      enteredBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }],
  });

  if (transactions.length === 0) {
    return [];
  }

  const allocationGroups = await prisma.bookingPaymentAllocation.groupBy({
    by: ['bankTransactionId'],
    where: {
      bankTransactionId: { in: transactions.map((transaction) => transaction.id) },
      ...(excludeBookingId ? { bookingId: { not: excludeBookingId } } : {}),
    },
    _sum: { amount: true },
  });

  const allocationMap = new Map(
    allocationGroups.map((group) => [group.bankTransactionId, Number(group._sum.amount || 0)])
  );

  return transactions
    .map((transaction) => {
      const allocatedAmount = allocationMap.get(transaction.id) || 0;
      const availableAmount = Math.max(0, Number(transaction.amount) - allocatedAmount);

      return {
        ...transaction,
        amount: Number(transaction.amount),
        allocatedAmount,
        availableAmount,
      };
    })
    .filter((transaction) => transaction.availableAmount > 0.009);
}

async function getHangingCustomerDeposits(options = {}) {
  const { customerId = null } = options;

  const where = customerId
    ? {
        direction: 'INFLOW',
        customerId,
        category: { in: ELIGIBLE_BOOKING_PAYMENT_CATEGORIES },
      }
    : {
        direction: 'INFLOW',
        OR: [
          { category: { in: ['CUSTOMER_DEPOSIT', 'CUSTOMER_BOOKING'] } },
          { category: 'UNALLOCATED_INCOME', customerId: { not: null } },
        ],
      };

  const transactions = await prisma.bankTransaction.findMany({
    where,
    include: {
      bankAccount: { select: { id: true, name: true, accountType: true, lastFour: true } },
      customer: { select: { id: true, name: true, phone: true, email: true, isFirstTime: true } },
      enteredBy: { select: { firstName: true, lastName: true } },
      allocations: {
        include: {
          booking: {
            include: {
              batch: {
                select: {
                  id: true,
                  name: true,
                  expectedDate: true,
                  eggTypeKey: true,
                  wholesalePrice: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
  });

  return transactions
    .map((transaction) => {
      const allocatedAmount = transaction.allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0);
      const availableAmount = Math.max(0, Number(transaction.amount) - allocatedAmount);
      const ageInDays = Math.max(
        0,
        Math.floor((Date.now() - new Date(transaction.transactionDate).getTime()) / (1000 * 60 * 60 * 24)),
      );

      return {
        ...enrichTransaction(transaction),
        allocatedAmount,
        availableAmount,
        ageInDays,
        allocations: transaction.allocations.map((allocation) => ({
          id: allocation.id,
          amount: Number(allocation.amount),
          booking: allocation.booking ? {
            id: allocation.booking.id,
            quantity: allocation.booking.quantity,
            orderValue: Number(allocation.booking.orderValue),
            amountPaid: Number(allocation.booking.amountPaid),
            batch: allocation.booking.batch ? {
              ...allocation.booking.batch,
              wholesalePrice: Number(allocation.booking.batch.wholesalePrice),
            } : null,
          } : null,
        })),
      };
    })
    .filter((transaction) => transaction.availableAmount > 0.009);
}

async function normalizePaymentAllocations({
  customerId,
  paymentAllocations,
  orderValue,
  excludeBookingId = null,
}) {
  if (!Array.isArray(paymentAllocations) || paymentAllocations.length === 0) {
    throw new Error('Select at least one payment to fund this booking');
  }

  const normalized = paymentAllocations
    .map((allocation) => ({
      bankTransactionId: allocation.bankTransactionId,
      amount: Number(allocation.amount),
    }))
    .filter((allocation) => allocation.bankTransactionId && allocation.amount > 0);

  if (normalized.length === 0) {
    throw new Error('Select at least one payment to fund this booking');
  }

  const uniqueIds = new Set();
  for (const allocation of normalized) {
    if (uniqueIds.has(allocation.bankTransactionId)) {
      throw new Error('Each payment can only be used once in a booking');
    }
    uniqueIds.add(allocation.bankTransactionId);
  }

  const availablePayments = await getAvailableCustomerPayments(customerId, { excludeBookingId });
  const paymentMap = new Map(availablePayments.map((payment) => [payment.id, payment]));

  let totalAllocated = 0;

  for (const allocation of normalized) {
    const payment = paymentMap.get(allocation.bankTransactionId);
    if (!payment) {
      throw new Error('One or more selected payments are no longer available');
    }
    if (payment.customerId !== customerId) {
      throw new Error('Selected payments must belong to the same customer');
    }
    if (allocation.amount > payment.availableAmount + 0.009) {
      throw new Error(`You can only use up to ₦${payment.availableAmount.toLocaleString()} from one of the selected payments`);
    }
    totalAllocated += allocation.amount;
  }

  if (totalAllocated > orderValue + 0.009) {
    throw new Error('Allocated amount cannot be more than the booking value');
  }

  return {
    allocations: normalized,
    totalAllocated,
  };
}

function validateBookingQuantity(quantity) {
  if (!quantity || quantity <= 0 || !Number.isInteger(quantity)) {
    return 'Quantity must be a positive integer';
  }
  return null;
}

async function validateBookingBasics({ customerId, batchId, quantity, policy, excludeBookingId = null }) {
  const quantityError = validateBookingQuantity(quantity);
  if (quantityError) {
    return { error: quantityError };
  }

  const [batch, customer] = await Promise.all([
    prisma.batch.findUnique({
      where: { id: batchId },
      include: {
        eggCodes: {
          select: {
            id: true,
            code: true,
            costPrice: true,
            wholesalePrice: true,
            retailPrice: true,
            quantity: true,
            freeQty: true,
          },
        },
      },
    }),
    prisma.customer.findUnique({ where: { id: customerId } }),
  ]);

  if (!batch) return { error: 'Batch not found' };
  if (!customer) return { error: 'Customer not found' };
  if (batch.status !== 'OPEN') return { error: 'Batch is not open for booking' };

  const currentlyBooked = await getBookedQuantityForBatch(batchId, excludeBookingId);
  const remaining = batch.availableForBooking - currentlyBooked;
  if (quantity > remaining) {
    return {
      error: `Only ${remaining} crates available for booking in this batch`,
      remaining,
    };
  }

  if (quantity > Number(policy.maxBookingCratesPerOrder || 100)) {
    return { error: `Maximum booking is ${Number(policy.maxBookingCratesPerOrder || 100).toLocaleString()} crates per order` };
  }

  const orderLimitProfile = await getCustomerOrderLimitProfile(customerId, policy);
  if (quantity > Number(orderLimitProfile.currentPerOrderLimit || 100)) {
    return {
      error: orderLimitProfile.isUsingEarlyOrderLimit
        ? `This customer's first ${orderLimitProfile.earlyOrderLimitCount} orders can be up to ${Number(orderLimitProfile.currentPerOrderLimit || 0).toLocaleString()} crates each`
        : `Maximum booking is ${Number(orderLimitProfile.currentPerOrderLimit || 0).toLocaleString()} crates per order`,
      orderLimitProfile,
    };
  }

  return { batch, customer, orderLimitProfile };
}

export default async function bookingRoutes(fastify) {
  fastify.get('/bookings', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { batchId, customerId, status } = request.query;
      const where = {};
      if (batchId) where.batchId = batchId;
      if (customerId) where.customerId = customerId;
      if (status) where.status = status;

      const [bookings, eggTypes, policy] = await Promise.all([
        prisma.booking.findMany({
          where,
          include: buildBookingInclude(),
          orderBy: { createdAt: 'desc' },
        }),
        getCustomerEggTypeConfig(),
        getOperationsPolicy(),
      ]);
      return reply.send({ bookings: bookings.map((booking) => enrichBooking(booking, eggTypes, policy)) });
    },
  });

  fastify.get('/bookings/:id', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const [booking, eggTypes, policy] = await Promise.all([
        prisma.booking.findUnique({
          where: { id: request.params.id },
          include: buildBookingInclude(),
        }),
        getCustomerEggTypeConfig(),
        getOperationsPolicy(),
      ]);
      if (!booking) return reply.code(404).send({ error: 'Booking not found' });
      return reply.send({ booking: enrichBooking(booking, eggTypes, policy) });
    },
  });

  fastify.get('/bookings/customer-funds/:customerId', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const customer = await prisma.customer.findUnique({
        where: { id: request.params.customerId },
        select: { id: true, name: true, phone: true, isFirstTime: true },
      });

      if (!customer) return reply.code(404).send({ error: 'Customer not found' });

      const policy = await getOperationsPolicy();
      const orderLimitProfile = await getCustomerOrderLimitProfile(customer.id, policy);
      const payments = await getAvailableCustomerPayments(customer.id);
      const totalAvailable = payments.reduce((sum, payment) => sum + payment.availableAmount, 0);

      return reply.send({
        customer: {
          ...customer,
          orderLimitProfile,
        },
        totalAvailable,
        payments: payments.map((payment) => ({
          ...payment,
          bankAccount: payment.bankAccount ? {
            ...payment.bankAccount,
          } : null,
        })),
      });
    },
  });

  fastify.get('/bookings/customer-deposits-hanging', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const customerId = request.query?.customerId || null;
      const deposits = await getHangingCustomerDeposits({ customerId });

      return reply.send({
        deposits,
        summary: {
          count: deposits.length,
          totalAvailable: deposits.reduce((sum, deposit) => sum + Number(deposit.availableAmount || 0), 0),
          customersInView: new Set(deposits.map((deposit) => deposit.customerId).filter(Boolean)).size,
        },
      });
    },
  });

  fastify.post('/bookings', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'CUSTOMER')],
    handler: async (request, reply) => {
      const { customerId, batchId, quantity, paymentAllocations, amountPaid, channel, notes } = request.body;

      if (!customerId || !batchId || !quantity) {
        return reply.code(400).send({ error: 'Missing required fields: customerId, batchId, quantity' });
      }

      const policy = await getOperationsPolicy();
      const basics = await validateBookingBasics({
        customerId,
        batchId,
        quantity: Number(quantity),
        policy,
      });
      if (basics.error) {
        return reply.code(400).send(basics);
      }

      const { batch, customer } = basics;
      const orderValue = Number(quantity) * Number(batch.wholesalePrice);
      const minimumPayment = orderValue * (Number(policy.bookingMinimumPaymentPercent || 80) / 100);

      let finalAmountPaid = amountPaid == null ? null : Number(amountPaid);
      let normalizedAllocations = [];

      if (Array.isArray(paymentAllocations) && paymentAllocations.length > 0) {
        try {
          const result = await normalizePaymentAllocations({
            customerId,
            paymentAllocations,
            orderValue,
          });
          normalizedAllocations = result.allocations;
          finalAmountPaid = result.totalAllocated;
        } catch (error) {
          return reply.code(400).send({ error: error.message });
        }
      }

      if (finalAmountPaid == null) {
        return reply.code(400).send({ error: 'Select customer payments to fund this booking' });
      }

      if (finalAmountPaid < minimumPayment) {
        return reply.code(400).send({
          error: `Minimum payment is ${Number(policy.bookingMinimumPaymentPercent || 80)}% of order value (₦${minimumPayment.toLocaleString()})`,
          orderValue,
          minimumPayment,
          amountPaid: finalAmountPaid,
        });
      }

      if (finalAmountPaid > orderValue + 0.009) {
        return reply.code(400).send({ error: 'Allocated amount cannot be more than the booking value' });
      }

      const booking = await prisma.$transaction(async (tx) => {
        const created = await tx.booking.create({
          data: {
            customerId,
            batchId,
            quantity: Number(quantity),
            amountPaid: finalAmountPaid,
            orderValue,
            channel: channel || 'backend',
            notes: notes || null,
          },
          include: buildBookingInclude(),
        });

        if (normalizedAllocations.length > 0) {
          await tx.bookingPaymentAllocation.createMany({
            data: normalizedAllocations.map((allocation) => ({
              bookingId: created.id,
              bankTransactionId: allocation.bankTransactionId,
              amount: allocation.amount,
              allocatedById: request.user.sub,
            })),
          });
        }

        return tx.booking.findUnique({
          where: { id: created.id },
          include: buildBookingInclude(),
        });
      });

      const eggTypes = await getCustomerEggTypeConfig();
      return reply.code(201).send({ booking: enrichBooking(booking, eggTypes, policy) });
    },
  });

  fastify.patch('/bookings/:id', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const existing = await prisma.booking.findUnique({
        where: { id: request.params.id },
        include: { batch: { include: { eggCodes: true } }, allocations: true },
      });

      if (!existing) return reply.code(404).send({ error: 'Booking not found' });
      if (existing.status !== 'CONFIRMED') {
        return reply.code(400).send({ error: 'Can only edit confirmed bookings' });
      }

      const { quantity, amountPaid, notes, paymentAllocations } = request.body;
      const nextQuantity = quantity !== undefined ? Number(quantity) : existing.quantity;

      const policy = await getOperationsPolicy();
      const basics = await validateBookingBasics({
        customerId: existing.customerId,
        batchId: existing.batchId,
        quantity: nextQuantity,
        policy,
        excludeBookingId: existing.id,
      });
      if (basics.error) {
        return reply.code(400).send(basics);
      }

      const orderValue = nextQuantity * Number(existing.batch.wholesalePrice);
      const minimumPayment = orderValue * (Number(policy.bookingMinimumPaymentPercent || 80) / 100);

      let nextAmountPaid = Number(existing.amountPaid);
      let normalizedAllocations = null;

      if (Array.isArray(paymentAllocations)) {
        try {
          const result = await normalizePaymentAllocations({
            customerId: existing.customerId,
            paymentAllocations,
            orderValue,
            excludeBookingId: existing.id,
          });
          normalizedAllocations = result.allocations;
          nextAmountPaid = result.totalAllocated;
        } catch (error) {
          return reply.code(400).send({ error: error.message });
        }
      } else if (amountPaid !== undefined) {
        nextAmountPaid = Number(amountPaid);
      }

      if (nextAmountPaid < minimumPayment) {
        return reply.code(400).send({ error: `Minimum payment is ${Number(policy.bookingMinimumPaymentPercent || 80)}% (₦${minimumPayment.toLocaleString()})` });
      }

      if (nextAmountPaid > orderValue + 0.009) {
        return reply.code(400).send({ error: 'Allocated amount cannot be more than the booking value' });
      }

      const booking = await prisma.$transaction(async (tx) => {
        if (normalizedAllocations !== null) {
          await tx.bookingPaymentAllocation.deleteMany({
            where: { bookingId: existing.id },
          });

          if (normalizedAllocations.length > 0) {
            await tx.bookingPaymentAllocation.createMany({
              data: normalizedAllocations.map((allocation) => ({
                bookingId: existing.id,
                bankTransactionId: allocation.bankTransactionId,
                amount: allocation.amount,
                allocatedById: request.user.sub,
              })),
            });
          }
        }

        await tx.booking.update({
          where: { id: existing.id },
          data: {
            quantity: nextQuantity,
            orderValue,
            amountPaid: nextAmountPaid,
            ...(notes !== undefined ? { notes } : {}),
          },
        });

        return tx.booking.findUnique({
          where: { id: existing.id },
          include: buildBookingInclude(),
        });
      });

      const eggTypes = await getCustomerEggTypeConfig();
      return reply.send({ booking: enrichBooking(booking, eggTypes, policy) });
    },
  });

  fastify.get('/bookings/batch-status/:batchId', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const batch = await prisma.batch.findUnique({
        where: { id: request.params.batchId },
      });

      if (!batch) return reply.code(404).send({ error: 'Batch not found' });

      const bookings = await prisma.booking.findMany({
        where: { batchId: batch.id, status: { not: 'CANCELLED' } },
        include: {
          customer: { select: { name: true, phone: true } },
          allocations: true,
        },
      });

      const totalBooked = bookings.reduce((sum, booking) => sum + booking.quantity, 0);

      return reply.send({
        batch: { id: batch.id, name: batch.name, status: batch.status },
        expectedQuantity: batch.expectedQuantity,
        availableForBooking: batch.availableForBooking,
        totalBooked,
        remainingAvailable: batch.availableForBooking - totalBooked,
        bookers: bookings.map((booking) => ({
          id: booking.id,
          customer: booking.customer.name,
          phone: booking.customer.phone,
          quantity: booking.quantity,
          amountPaid: Number(booking.amountPaid),
          orderValue: Number(booking.orderValue),
          balance: Math.max(0, Number(booking.orderValue) - Number(booking.amountPaid)),
          status: booking.status,
          date: booking.createdAt,
        })),
      });
    },
  });

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
        include: buildBookingInclude(),
      });

      const eggTypes = await getCustomerEggTypeConfig();
      return reply.send({ booking: enrichBooking(booking, eggTypes) });
    },
  });

  fastify.get('/bookings/open-batches', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const [eggTypes, policy] = await Promise.all([
        getCustomerEggTypeConfig(),
        getOperationsPolicy(),
      ]);
      const openBatches = await prisma.batch.findMany({
        where: { status: 'OPEN' },
        include: {
          eggCodes: {
            select: {
              id: true,
              code: true,
              costPrice: true,
              wholesalePrice: true,
              retailPrice: true,
              quantity: true,
              freeQty: true,
            },
          },
        },
        orderBy: { expectedDate: 'asc' },
      });

      const result = await Promise.all(openBatches.map(async (batch) => {
        const booked = await getBookedQuantityForBatch(batch.id);
        const remaining = batch.availableForBooking - booked;

        return {
          id: batch.id,
          name: batch.name,
          eggTypeKey: batch.eggTypeKey || 'REGULAR',
          eggTypeLabel: getCustomerEggTypeLabel(eggTypes, batch.eggTypeKey || 'REGULAR'),
          expectedDate: batch.expectedDate,
          wholesalePrice: Number(batch.wholesalePrice),
          retailPrice: Number(batch.retailPrice),
          eggCodes: batch.eggCodes.map((eggCode) => mapBatchEggCode(eggCode, batch)),
          availableForBooking: batch.availableForBooking,
          totalBooked: booked,
          remainingAvailable: remaining,
        };
      }));

      return reply.send({ batches: result.filter((batch) => batch.remainingAvailable > 0), policy });
    },
  });
}
