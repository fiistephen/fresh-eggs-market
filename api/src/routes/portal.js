import bcrypt from 'bcrypt';
import prisma from '../plugins/prisma.js';
import { config } from '../config/env.js';
import {
  generateAccessToken,
  generateRefreshToken,
  authenticate,
} from '../plugins/auth.js';
import { authorize } from '../middleware/authorize.js';
import {
  getCustomerEggTypeConfig,
  getCustomerEggTypeLabel,
  getOperationsPolicy,
} from '../utils/appSettings.js';
import {
  addDays,
  addMinutes,
  buildPickupWindow,
  buildPortalReference,
  getActivePortalBookingHoldQuantity,
  getActivePortalBuyNowHoldQuantity,
  getCustomerDepositAccount,
} from '../utils/portalCheckout.js';

const SALT_ROUNDS = 12;
const TRANSFER_PAYMENT_DETAILS = {
  bankName: 'Providus Bank',
  accountNumber: '5401952310',
  accountName: 'Fresh Egg Wholesales Market',
};

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email || null;
}

function normalizePhone(value) {
  return String(value || '').replace(/\s+/g, '').trim();
}

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

function mapPortalBatch(batch, eggTypes, extra = {}) {
  return {
    id: batch.id,
    name: batch.name,
    eggTypeKey: batch.eggTypeKey || 'REGULAR',
    eggTypeLabel: getCustomerEggTypeLabel(eggTypes, batch.eggTypeKey || 'REGULAR'),
    expectedDate: batch.expectedDate,
    receivedDate: batch.receivedDate,
    wholesalePrice: Number(batch.wholesalePrice),
    retailPrice: Number(batch.retailPrice),
    expectedQuantity: batch.expectedQuantity,
    availableForBooking: batch.availableForBooking,
    eggCodes: (batch.eggCodes || []).map((eggCode) => mapBatchEggCode(eggCode, batch)),
    ...extra,
  };
}

function buildPortalCustomerEmail(user, customer) {
  const email = normalizeEmail(user?.email || customer?.email);
  if (email) return email;
  const phoneDigits = String(customer?.phone || user?.phone || 'portalcustomer').replace(/\D+/g, '');
  return `${phoneDigits || 'portalcustomer'}@portal.fresheggs.local`;
}

function getRequestOrigin(request) {
  return request.headers.origin || config.corsOrigin || 'http://localhost:5173';
}

function getPortalCheckoutSummary(checkout, eggTypes = []) {
  return {
    id: checkout.id,
    reference: checkout.reference,
    checkoutType: checkout.checkoutType,
    paymentMethod: checkout.paymentMethod,
    status: checkout.status,
    quantity: checkout.quantity,
    priceType: checkout.priceType,
    unitPrice: Number(checkout.unitPrice || 0),
    orderValue: Number(checkout.orderValue),
    amountToPay: Number(checkout.amountToPay),
    balanceAfterPayment: Number(checkout.balanceAfterPayment),
    paymentWindowEndsAt: checkout.paymentWindowEndsAt,
    pickupWindowStart: checkout.pickupWindowStart,
    pickupWindowEnd: checkout.pickupWindowEnd,
    createdAt: checkout.createdAt,
    updatedAt: checkout.updatedAt,
    batch: checkout.batch ? {
      id: checkout.batch.id,
      name: checkout.batch.name,
      eggTypeLabel: getCustomerEggTypeLabel(eggTypes, checkout.batch.eggTypeKey || 'REGULAR'),
      expectedDate: checkout.batch.expectedDate,
      receivedDate: checkout.batch.receivedDate,
      status: checkout.batch.status,
      wholesalePrice: Number(checkout.batch.wholesalePrice),
      retailPrice: Number(checkout.batch.retailPrice),
    } : null,
  };
}

async function getCustomerFromUser(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { user: null, customer: null };

  const customer = await prisma.customer.findFirst({
    where: {
      OR: [
        ...(user.phone ? [{ phone: user.phone }] : []),
        ...(user.email ? [{ email: user.email }] : []),
      ],
    },
  });
  return { user, customer };
}

async function buildReceivedBatchAvailability(batchId) {
  const [batch, writeOffAgg, sales] = await Promise.all([
    prisma.batch.findUnique({
      where: { id: batchId },
      include: {
        eggCodes: {
          select: {
            id: true,
            code: true,
            quantity: true,
            freeQty: true,
            costPrice: true,
            wholesalePrice: true,
            retailPrice: true,
          },
        },
      },
    }),
    prisma.inventoryCount.aggregate({
      where: { batchId },
      _sum: { crackedWriteOff: true },
    }),
    prisma.sale.findMany({
      where: {
        lineItems: {
          some: {
            batchEggCode: { batchId },
          },
        },
      },
      select: {
        lineItems: {
          where: { batchEggCode: { batchId } },
          select: { quantity: true },
        },
      },
    }),
  ]);

  if (!batch) return null;

  const [bookedAgg, heldForBuyNow] = await Promise.all([
    prisma.booking.aggregate({
      where: { batchId, status: { not: 'CANCELLED' } },
      _sum: { quantity: true },
    }),
    getActivePortalBuyNowHoldQuantity(batchId),
  ]);

  const totalReceived = batch.actualQuantity ?? batch.eggCodes.reduce(
    (sum, eggCode) => sum + eggCode.quantity + (eggCode.freeQty || 0),
    0,
  );
  const totalBooked = bookedAgg._sum.quantity || 0;
  const totalWrittenOff = writeOffAgg._sum.crackedWriteOff || 0;
  const totalSold = sales.reduce(
    (sum, sale) => sum + sale.lineItems.reduce((lineSum, line) => lineSum + line.quantity, 0),
    0,
  );
  const onHand = Math.max(0, totalReceived - totalSold - totalWrittenOff);
  const availableForSale = Math.max(0, onHand - totalBooked - heldForBuyNow);

  return {
    batch,
    totalBooked,
    totalSold,
    totalWrittenOff,
    heldForBuyNow,
    onHand,
    availableForSale,
  };
}

async function initializePaystackTransaction({ email, amountKobo, reference, callbackUrl, metadata }) {
  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.paystackSecretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      amount: String(amountKobo),
      reference,
      callback_url: callbackUrl,
      metadata,
    }),
  });

  const payload = await response.json();
  if (!response.ok || !payload?.status) {
    throw new Error(payload?.message || 'Could not start card payment right now.');
  }
  return payload.data;
}

async function verifyPaystackTransaction(reference) {
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: {
      Authorization: `Bearer ${config.paystackSecretKey}`,
    },
  });

  const payload = await response.json();
  if (!response.ok || !payload?.status) {
    throw new Error(payload?.message || 'Could not verify the card payment.');
  }
  return payload.data;
}

async function createPortalBankTransaction({
  enteredById,
  customerId,
  bookingId = null,
  amount,
  category,
  description,
  reference,
}) {
  const depositAccount = await getCustomerDepositAccount();
  if (!depositAccount) {
    throw new Error('Customer Deposit Account is missing. Please set it up in Admin before using portal payments.');
  }

  return prisma.bankTransaction.create({
    data: {
      bankAccountId: depositAccount.id,
      direction: 'INFLOW',
      category,
      amount: Number(amount),
      description,
      reference,
      transactionDate: new Date(),
      sourceType: 'SYSTEM',
      customerId,
      bookingId,
      enteredById,
      postedAt: new Date(),
    },
  });
}

async function finalizeUpcomingBookingCheckout(checkout, enteredById) {
  if (checkout.bookingId) {
    return prisma.booking.findUnique({
      where: { id: checkout.bookingId },
      include: {
        batch: { select: { id: true, name: true, expectedDate: true, eggTypeKey: true, status: true } },
      },
    });
  }

  const depositAccount = await getCustomerDepositAccount();
  if (!depositAccount) {
    throw new Error('Customer Deposit Account is missing. Please set it up in Admin before using portal payments.');
  }

  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.create({
      data: {
        customerId: checkout.customerId,
        batchId: checkout.batchId,
        quantity: checkout.quantity,
        amountPaid: checkout.amountToPay,
        orderValue: checkout.orderValue,
        status: 'CONFIRMED',
        channel: 'website',
        notes: checkout.notes || `Portal booking payment confirmed (${checkout.paymentMethod.toLowerCase()})`,
      },
      include: {
        batch: { select: { id: true, name: true, expectedDate: true, eggTypeKey: true, status: true } },
      },
    });

    const bankTransaction = await tx.bankTransaction.create({
      data: {
        bankAccountId: depositAccount.id,
        direction: 'INFLOW',
        category: 'CUSTOMER_BOOKING',
        amount: checkout.amountToPay,
        description: `Portal booking payment for ${booking.batch.name}`,
        reference: checkout.reference,
        transactionDate: new Date(),
        sourceType: 'SYSTEM',
        customerId: checkout.customerId,
        bookingId: booking.id,
        enteredById,
        postedAt: new Date(),
      },
    });

    await tx.bookingPaymentAllocation.create({
      data: {
        bookingId: booking.id,
        bankTransactionId: bankTransaction.id,
        amount: checkout.amountToPay,
        createdById: enteredById,
      },
    });

    await tx.portalCheckout.update({
      where: { id: checkout.id },
      data: {
        status: 'PAID',
        bookingId: booking.id,
        verifiedAt: new Date(),
      },
    });

    await tx.customer.update({
      where: { id: checkout.customerId },
      data: { isFirstTime: false },
    });

    return booking;
  });
}

async function finalizeBuyNowCheckout(checkout, enteredById) {
  if (checkout.portalOrderRequestId) {
    return prisma.portalOrderRequest.findUnique({
      where: { id: checkout.portalOrderRequestId },
      include: {
        batch: { select: { id: true, name: true, expectedDate: true, receivedDate: true, eggTypeKey: true, status: true } },
      },
    });
  }

  const depositAccount = await getCustomerDepositAccount();
  if (!depositAccount) {
    throw new Error('Customer Deposit Account is missing. Please set it up in Admin before using portal payments.');
  }

  const pickupWindow = buildPickupWindow(new Date());
  return prisma.$transaction(async (tx) => {
    const order = await tx.portalOrderRequest.create({
      data: {
        customerId: checkout.customerId,
        batchId: checkout.batchId,
        status: 'APPROVED_FOR_PICKUP',
        paymentMethod: checkout.paymentMethod,
        paymentStatus: 'PAID',
        quantity: checkout.quantity,
        priceType: checkout.priceType || 'RETAIL',
        unitPrice: checkout.unitPrice || 0,
        estimatedTotal: checkout.orderValue,
        amountPaid: checkout.amountToPay,
        paymentReference: checkout.reference,
        pickupWindowStart: pickupWindow.start,
        pickupWindowEnd: pickupWindow.end,
        notes: checkout.notes || 'Portal buy-now payment confirmed.',
      },
      include: {
        batch: { select: { id: true, name: true, expectedDate: true, receivedDate: true, eggTypeKey: true, status: true } },
      },
    });

    await tx.bankTransaction.create({
      data: {
        bankAccountId: depositAccount.id,
        direction: 'INFLOW',
        category: 'DIRECT_SALE_TRANSFER',
        amount: checkout.amountToPay,
        description: `Portal buy-now payment for ${order.batch.name}`,
        reference: checkout.reference,
        transactionDate: new Date(),
        sourceType: 'SYSTEM',
        customerId: checkout.customerId,
        enteredById,
        postedAt: new Date(),
      },
    });

    await tx.portalCheckout.update({
      where: { id: checkout.id },
      data: {
        status: 'PAID',
        portalOrderRequestId: order.id,
        verifiedAt: new Date(),
        pickupWindowStart: pickupWindow.start,
        pickupWindowEnd: pickupWindow.end,
      },
    });

    return order;
  });
}

async function getPortalOrdersForCustomer(customerId) {
  const eggTypes = await getCustomerEggTypeConfig();
  const [bookings, requests, checkouts] = await Promise.all([
    prisma.booking.findMany({
      where: { customerId },
      include: {
        batch: { select: { id: true, name: true, expectedDate: true, receivedDate: true, eggTypeKey: true, status: true } },
        portalCheckout: {
          select: {
            id: true,
            reference: true,
            paymentMethod: true,
            status: true,
            verifiedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.portalOrderRequest.findMany({
      where: { customerId },
      include: {
        batch: { select: { id: true, name: true, expectedDate: true, receivedDate: true, eggTypeKey: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.portalCheckout.findMany({
      where: {
        customerId,
        bookingId: null,
        portalOrderRequestId: null,
      },
      include: {
        batch: { select: { id: true, name: true, expectedDate: true, receivedDate: true, eggTypeKey: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const bookingItems = bookings.map((booking) => ({
    id: booking.id,
    kind: 'BOOKING',
    source: 'BOOKING',
    reference: booking.portalCheckout?.reference || booking.id,
    batchId: booking.batchId,
    batch: booking.batch.name,
    eggTypeLabel: getCustomerEggTypeLabel(eggTypes, booking.batch.eggTypeKey || 'REGULAR'),
    batchStatus: booking.batch.status,
    batchArrived: booking.batch.status !== 'OPEN',
    batchArrivalDate: booking.batch.receivedDate,
    expectedDate: booking.batch.expectedDate,
    quantity: booking.quantity,
    orderValue: Number(booking.orderValue),
    amountPaid: Number(booking.amountPaid),
    balance: Math.max(0, Number(booking.orderValue) - Number(booking.amountPaid)),
    paymentPercent: Number(booking.orderValue) > 0
      ? Math.round((Number(booking.amountPaid) / Number(booking.orderValue)) * 100)
      : 0,
    status: booking.status,
    paymentMethod: booking.portalCheckout?.paymentMethod || null,
    paymentStatus: 'PAID',
    pickupWindowStart: null,
    pickupWindowEnd: null,
    notes: booking.notes,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  }));

  const requestItems = requests.map((request) => ({
    id: request.id,
    kind: 'BUY_NOW',
    source: 'BUY_NOW_ORDER',
    reference: request.paymentReference || request.id,
    batchId: request.batchId,
    batch: request.batch.name,
    eggTypeLabel: getCustomerEggTypeLabel(eggTypes, request.batch.eggTypeKey || 'REGULAR'),
    batchStatus: request.batch.status,
    batchArrived: Boolean(request.batch.receivedDate),
    batchArrivalDate: request.batch.receivedDate,
    expectedDate: request.batch.expectedDate,
    quantity: request.quantity,
    orderValue: Number(request.estimatedTotal),
    amountPaid: Number(request.amountPaid),
    balance: Math.max(0, Number(request.estimatedTotal) - Number(request.amountPaid)),
    paymentPercent: Number(request.estimatedTotal) > 0
      ? Math.round((Number(request.amountPaid) / Number(request.estimatedTotal)) * 100)
      : 0,
    status: request.status,
    paymentMethod: request.paymentMethod,
    paymentStatus: request.paymentStatus,
    priceType: request.priceType,
    unitPrice: Number(request.unitPrice),
    pickupWindowStart: request.pickupWindowStart,
    pickupWindowEnd: request.pickupWindowEnd,
    notes: request.notes,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  }));

  const pendingCheckoutItems = checkouts.map((checkout) => ({
    id: checkout.id,
    kind: checkout.checkoutType === 'BOOK_UPCOMING' ? 'BOOKING' : 'BUY_NOW',
    source: checkout.checkoutType === 'BOOK_UPCOMING' ? 'BOOKING_CHECKOUT' : 'BUY_NOW_CHECKOUT',
    reference: checkout.reference,
    batchId: checkout.batchId,
    batch: checkout.batch.name,
    eggTypeLabel: getCustomerEggTypeLabel(eggTypes, checkout.batch.eggTypeKey || 'REGULAR'),
    batchStatus: checkout.batch.status,
    batchArrived: Boolean(checkout.batch.receivedDate) || checkout.batch.status !== 'OPEN',
    batchArrivalDate: checkout.batch.receivedDate,
    expectedDate: checkout.batch.expectedDate,
    quantity: checkout.quantity,
    orderValue: Number(checkout.orderValue),
    amountPaid: checkout.status === 'PAID' ? Number(checkout.amountToPay) : 0,
    balance: Math.max(0, Number(checkout.orderValue) - Number(checkout.amountToPay)),
    paymentPercent: Number(checkout.orderValue) > 0
      ? Math.round((Number(checkout.amountToPay) / Number(checkout.orderValue)) * 100)
      : 0,
    status: checkout.status,
    paymentMethod: checkout.paymentMethod,
    paymentStatus: checkout.status,
    priceType: checkout.priceType,
    unitPrice: Number(checkout.unitPrice || 0),
    pickupWindowStart: checkout.pickupWindowStart,
    pickupWindowEnd: checkout.pickupWindowEnd,
    paymentWindowEndsAt: checkout.paymentWindowEndsAt,
    notes: checkout.notes,
    createdAt: checkout.createdAt,
    updatedAt: checkout.updatedAt,
  }));

  return [...bookingItems, ...requestItems, ...pendingCheckoutItems]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export default async function portalRoutes(fastify) {
  fastify.get('/portal/batches', {
    handler: async (request, reply) => {
      const [eggTypes, policy, batches] = await Promise.all([
        getCustomerEggTypeConfig(),
        getOperationsPolicy(),
        prisma.batch.findMany({
          where: { status: 'OPEN' },
          include: {
            eggCodes: {
              select: {
                id: true,
                code: true,
                quantity: true,
                freeQty: true,
                costPrice: true,
                wholesalePrice: true,
                retailPrice: true,
              },
            },
          },
          orderBy: { expectedDate: 'asc' },
        }),
      ]);

      const result = [];
      for (const batch of batches) {
        const [bookedAgg, heldQty] = await Promise.all([
          prisma.booking.aggregate({
            where: { batchId: batch.id, status: { not: 'CANCELLED' } },
            _sum: { quantity: true },
          }),
          getActivePortalBookingHoldQuantity(batch.id),
        ]);
        const totalBooked = bookedAgg._sum.quantity || 0;
        const remainingAvailable = Math.max(0, batch.availableForBooking - totalBooked - heldQty);

        result.push(mapPortalBatch(batch, eggTypes, {
          totalBooked,
          heldForCheckout: heldQty,
          remainingAvailable,
        }));
      }

      return reply.send({ batches: result, policy });
    },
  });

  fastify.get('/portal/available-now', {
    handler: async (request, reply) => {
      const [eggTypes, policy, receivedBatches] = await Promise.all([
        getCustomerEggTypeConfig(),
        getOperationsPolicy(),
        prisma.batch.findMany({
          where: { status: 'RECEIVED' },
          include: {
            eggCodes: {
              select: {
                id: true,
                code: true,
                quantity: true,
                freeQty: true,
                costPrice: true,
                wholesalePrice: true,
                retailPrice: true,
              },
            },
          },
          orderBy: [{ receivedDate: 'desc' }, { expectedDate: 'asc' }],
        }),
      ]);

      const result = [];
      for (const batch of receivedBatches) {
        const availability = await buildReceivedBatchAvailability(batch.id);
        if (!availability || availability.availableForSale <= 0) continue;

        result.push(mapPortalBatch(batch, eggTypes, {
          totalBooked: availability.totalBooked,
          totalSold: availability.totalSold,
          totalWrittenOff: availability.totalWrittenOff,
          heldForCheckout: availability.heldForBuyNow,
          onHand: availability.onHand,
          availableForSale: availability.availableForSale,
        }));
      }

      return reply.send({ batches: result, policy });
    },
  });

  fastify.post('/portal/register', {
    handler: async (request, reply) => {
      const { name, email, phone, password } = request.body;
      const normalizedEmail = normalizeEmail(email);
      const normalizedPhone = normalizePhone(phone);

      if (!name || !name.trim()) return reply.code(400).send({ error: 'Name is required' });
      if (!normalizedPhone) return reply.code(400).send({ error: 'Phone number is required' });
      if (!password || password.length < 8) return reply.code(400).send({ error: 'Password must be at least 8 characters' });

      const [existingUserByEmail, existingUserByPhone, existingCustomerByPhone] = await Promise.all([
        normalizedEmail ? prisma.user.findUnique({ where: { email: normalizedEmail } }) : Promise.resolve(null),
        prisma.user.findUnique({ where: { phone: normalizedPhone } }),
        prisma.customer.findUnique({ where: { phone: normalizedPhone } }).catch(() => prisma.customer.findFirst({ where: { phone: normalizedPhone } })),
      ]);

      if (existingUserByEmail) return reply.code(409).send({ error: 'Email already registered. Please sign in instead.' });
      if (existingUserByPhone) return reply.code(409).send({ error: 'Phone number already registered. Please sign in instead.' });

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const nameParts = name.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || firstName;

      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: normalizedEmail,
            passwordHash,
            firstName,
            lastName,
            phone: normalizedPhone,
            role: 'CUSTOMER',
          },
        });

        let customer;
        if (existingCustomerByPhone) {
          customer = await tx.customer.update({
            where: { id: existingCustomerByPhone.id },
            data: { ...(normalizedEmail ? { email: normalizedEmail } : {}) },
          });
        } else {
          customer = await tx.customer.create({
            data: {
              name: name.trim(),
              phone: normalizedPhone,
              email: normalizedEmail,
              isFirstTime: true,
            },
          });
        }

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);
        const refreshExpiry = addDays(new Date(), 7);

        await tx.refreshToken.create({
          data: {
            token: refreshToken,
            userId: user.id,
            expiresAt: refreshExpiry,
          },
        });

        return { user, customer, accessToken, refreshToken };
      });

      return reply.code(201).send({
        user: {
          id: result.user.id,
          email: result.user.email,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          phone: result.user.phone,
          role: result.user.role,
        },
        customer: {
          id: result.customer.id,
          name: result.customer.name,
          phone: result.customer.phone,
          email: result.customer.email,
          isFirstTime: result.customer.isFirstTime,
        },
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        message: 'Account created successfully',
      });
    },
  });

  fastify.get('/portal/profile', {
    preHandler: [authenticate, authorize('CUSTOMER')],
    handler: async (request, reply) => {
      const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
      if (!user) return reply.code(404).send({ error: 'User not found' });

      const customer = await prisma.customer.findFirst({
        where: {
          OR: [
            ...(user.phone ? [{ phone: user.phone }] : []),
            ...(user.email ? [{ email: user.email }] : []),
          ],
        },
        include: {
          _count: { select: { bookings: true, sales: true, portalOrderRequests: true, portalCheckouts: true } },
        },
      });

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
        stats: customer ? {
          totalBookings: customer._count.bookings,
          totalPurchases: customer._count.sales,
          totalOrders: customer._count.portalOrderRequests + customer._count.portalCheckouts,
        } : {
          totalBookings: 0,
          totalPurchases: 0,
          totalOrders: 0,
        },
      });
    },
  });

  fastify.get('/portal/orders', {
    preHandler: [authenticate, authorize('CUSTOMER')],
    handler: async (request, reply) => {
      const { customer } = await getCustomerFromUser(request.user.sub);
      if (!customer) return reply.send({ customerId: null, orders: [] });
      const orders = await getPortalOrdersForCustomer(customer.id);
      return reply.send({ customerId: customer.id, orders });
    },
  });

  fastify.post('/portal/checkouts', {
    preHandler: [authenticate, authorize('CUSTOMER')],
    handler: async (request, reply) => {
      const {
        checkoutType,
        batchId,
        quantity,
        paymentMethod,
        amountToPay,
        priceType = 'RETAIL',
        notes,
      } = request.body;

      if (!['BOOK_UPCOMING', 'BUY_NOW'].includes(checkoutType)) {
        return reply.code(400).send({ error: 'checkoutType must be BOOK_UPCOMING or BUY_NOW.' });
      }
      if (!['CARD', 'TRANSFER'].includes(paymentMethod)) {
        return reply.code(400).send({ error: 'Choose card payment or bank transfer.' });
      }
      if (!batchId) return reply.code(400).send({ error: 'Choose a batch first.' });
      if (!Number.isInteger(quantity) || quantity < 1) {
        return reply.code(400).send({ error: 'Quantity must be a whole number of crates.' });
      }

      const [{ user, customer }, policy, eggTypes] = await Promise.all([
        getCustomerFromUser(request.user.sub),
        getOperationsPolicy(),
        getCustomerEggTypeConfig(),
      ]);
      if (!customer) return reply.code(400).send({ error: 'No customer profile was found for this account.' });

      const batch = await prisma.batch.findUnique({
        where: { id: batchId },
        include: {
          eggCodes: {
            select: {
              id: true,
              code: true,
              quantity: true,
              freeQty: true,
              costPrice: true,
              wholesalePrice: true,
              retailPrice: true,
            },
          },
        },
      });
      if (!batch) return reply.code(404).send({ error: 'Batch not found.' });

      let orderValue = 0;
      let unitPrice = 0;
      let paymentDue = 0;
      let paymentWindowEndsAt = null;

      if (checkoutType === 'BOOK_UPCOMING') {
        if (batch.status !== 'OPEN') {
          return reply.code(400).send({ error: 'This batch is not open for booking anymore.' });
        }

        const [confirmedBookedAgg, heldForCheckout, customerBookedAgg, customerHeldAgg] = await Promise.all([
          prisma.booking.aggregate({
            where: { batchId, status: { not: 'CANCELLED' } },
            _sum: { quantity: true },
          }),
          getActivePortalBookingHoldQuantity(batchId),
          prisma.booking.aggregate({
            where: { customerId: customer.id, batchId, status: { not: 'CANCELLED' } },
            _sum: { quantity: true },
          }),
          prisma.portalCheckout.aggregate({
            where: {
              customerId: customer.id,
              batchId,
              checkoutType: 'BOOK_UPCOMING',
              bookingId: null,
              status: { in: ['AWAITING_PAYMENT', 'AWAITING_TRANSFER'] },
            },
            _sum: { quantity: true },
          }),
        ]);

        const remainingAvailable = Math.max(
          0,
          batch.availableForBooking - (confirmedBookedAgg._sum.quantity || 0) - heldForCheckout,
        );
        if (quantity > remainingAvailable) {
          return reply.code(400).send({ error: `Only ${remainingAvailable} crates are still available to book.` });
        }

        const maxBooking = Number(policy.maxBookingCratesPerOrder || 100);
        const firstTimeLimit = Number(policy.firstTimeBookingLimitCrates || 20);
        const customerReserved = (customerBookedAgg._sum.quantity || 0) + (customerHeldAgg._sum.quantity || 0);
        const customerRemaining = Math.max(0, maxBooking - customerReserved);
        if (quantity > customerRemaining) {
          return reply.code(400).send({ error: `You can only hold ${customerRemaining} more crates from this batch.` });
        }
        if (customer.isFirstTime && quantity > firstTimeLimit) {
          return reply.code(400).send({ error: `First-time customers can book up to ${firstTimeLimit} crates.` });
        }

        unitPrice = Number(batch.wholesalePrice);
        orderValue = quantity * unitPrice;
        paymentDue = Number(amountToPay);
        if (!paymentDue || paymentDue <= 0) {
          return reply.code(400).send({ error: 'Enter how much you want to pay now.' });
        }
        const minimumPayment = orderValue * (Number(policy.bookingMinimumPaymentPercent || 80) / 100);
        if (paymentDue < minimumPayment) {
          return reply.code(400).send({ error: `Minimum payment is ${Number(policy.bookingMinimumPaymentPercent || 80)}% of the booking value.` });
        }
        if (paymentDue > orderValue) {
          return reply.code(400).send({ error: 'Payment now cannot be more than the full booking value.' });
        }
        paymentWindowEndsAt = paymentMethod === 'CARD'
          ? addMinutes(new Date(), 30)
          : addDays(new Date(), 1);
      } else {
        if (batch.status !== 'RECEIVED') {
          return reply.code(400).send({ error: 'This batch is not ready for immediate buying yet.' });
        }
        if (!['WHOLESALE', 'RETAIL'].includes(priceType)) {
          return reply.code(400).send({ error: 'Price type must be wholesale or retail.' });
        }
        const availability = await buildReceivedBatchAvailability(batchId);
        if (!availability) {
          return reply.code(404).send({ error: 'Batch not found.' });
        }
        if (quantity > availability.availableForSale) {
          return reply.code(400).send({ error: `Only ${availability.availableForSale} crates are still available to buy.` });
        }
        unitPrice = priceType === 'WHOLESALE'
          ? Number(batch.wholesalePrice)
          : Number(batch.retailPrice);
        orderValue = quantity * unitPrice;
        paymentDue = orderValue;
        paymentWindowEndsAt = paymentMethod === 'CARD'
          ? addMinutes(new Date(), 30)
          : addDays(new Date(), 1);
      }

      const checkout = await prisma.portalCheckout.create({
        data: {
          customerId: customer.id,
          batchId,
          checkoutType,
          paymentMethod,
          status: paymentMethod === 'CARD' ? 'AWAITING_PAYMENT' : 'AWAITING_TRANSFER',
          quantity,
          priceType: checkoutType === 'BUY_NOW' ? priceType : 'WHOLESALE',
          unitPrice,
          orderValue,
          amountToPay: paymentDue,
          balanceAfterPayment: Math.max(0, orderValue - paymentDue),
          reference: buildPortalReference(checkoutType === 'BOOK_UPCOMING' ? 'BOOK' : 'BUY'),
          paymentWindowEndsAt,
          notes: notes?.trim() || null,
        },
        include: {
          batch: { select: { id: true, name: true, expectedDate: true, receivedDate: true, eggTypeKey: true, status: true, wholesalePrice: true, retailPrice: true } },
        },
      });

      if (paymentMethod === 'TRANSFER') {
        return reply.code(201).send({
          checkout: getPortalCheckoutSummary(checkout, eggTypes),
          transferDetails: TRANSFER_PAYMENT_DETAILS,
          message: checkoutType === 'BUY_NOW'
            ? 'Your crates are now held while the team confirms your transfer. Once approved, they will be ready for pickup.'
            : 'Your crates are now held while the team confirms your transfer. Your booking will be confirmed after approval.',
        });
      }

      try {
        const callbackUrl = `${getRequestOrigin(request)}/portal`;
        const paystack = await initializePaystackTransaction({
          email: buildPortalCustomerEmail(user, customer),
          amountKobo: Math.round(paymentDue * 100),
          reference: checkout.reference,
          callbackUrl,
          metadata: {
            checkoutType,
            portalCheckoutId: checkout.id,
            customerId: customer.id,
            batchId,
            batchName: batch.name,
            quantity,
            eggTypeLabel: getCustomerEggTypeLabel(eggTypes, batch.eggTypeKey || 'REGULAR'),
          },
        });

        const updatedCheckout = await prisma.portalCheckout.update({
          where: { id: checkout.id },
          data: {
            paystackReference: paystack.reference,
            paystackAccessCode: paystack.access_code,
            paystackAuthorizationUrl: paystack.authorization_url,
          },
          include: {
            batch: { select: { id: true, name: true, expectedDate: true, receivedDate: true, eggTypeKey: true, status: true, wholesalePrice: true, retailPrice: true } },
          },
        });

        return reply.code(201).send({
          checkout: getPortalCheckoutSummary(updatedCheckout, eggTypes),
          authorizationUrl: paystack.authorization_url,
          accessCode: paystack.access_code,
          message: 'Your crates are held for this payment window. Finish card payment to complete the order.',
        });
      } catch (error) {
        await prisma.portalCheckout.update({
          where: { id: checkout.id },
          data: { status: 'FAILED', notes: error.message },
        });
        return reply.code(502).send({ error: error.message });
      }
    },
  });

  fastify.post('/portal/checkouts/verify-card', {
    preHandler: [authenticate, authorize('CUSTOMER')],
    handler: async (request, reply) => {
      const { reference } = request.body;
      if (!reference) return reply.code(400).send({ error: 'reference is required.' });

      const { customer } = await getCustomerFromUser(request.user.sub);
      if (!customer) return reply.code(400).send({ error: 'No customer profile was found for this account.' });

      const checkout = await prisma.portalCheckout.findFirst({
        where: {
          reference,
          customerId: customer.id,
          paymentMethod: 'CARD',
        },
        include: {
          batch: { select: { id: true, name: true, expectedDate: true, receivedDate: true, eggTypeKey: true, status: true, wholesalePrice: true, retailPrice: true } },
        },
      });
      if (!checkout) return reply.code(404).send({ error: 'Portal payment hold not found.' });

      if (checkout.status === 'PAID') {
        const orders = await getPortalOrdersForCustomer(customer.id);
        const order = orders.find((entry) => entry.reference === reference);
        return reply.send({
          alreadyVerified: true,
          order,
          checkout: getPortalCheckoutSummary(checkout),
          message: 'This payment has already been confirmed.',
        });
      }

      const verified = await verifyPaystackTransaction(reference);
      if (verified.status !== 'success') {
        await prisma.portalCheckout.update({
          where: { id: checkout.id },
          data: { status: 'FAILED' },
        });
        return reply.code(400).send({ error: 'Card payment was not successful yet.' });
      }

      const expectedAmountKobo = Math.round(Number(checkout.amountToPay) * 100);
      if (Number(verified.amount) !== expectedAmountKobo) {
        await prisma.portalCheckout.update({
          where: { id: checkout.id },
          data: { status: 'FAILED', notes: 'Paystack amount mismatch during verification.' },
        });
        return reply.code(400).send({ error: 'The paid amount did not match this order.' });
      }

      if (checkout.checkoutType === 'BOOK_UPCOMING') {
        await finalizeUpcomingBookingCheckout(checkout, request.user.sub);
      } else {
        await finalizeBuyNowCheckout(checkout, request.user.sub);
      }

      const orders = await getPortalOrdersForCustomer(customer.id);
      const order = orders.find((entry) => entry.reference === reference);
      return reply.send({
        order,
        message: checkout.checkoutType === 'BUY_NOW'
          ? 'Card payment confirmed. Your eggs are approved for pickup from today until the next 3 days.'
          : 'Card payment confirmed. Your booking is now saved and the crates remain held for you.',
      });
    },
  });

  fastify.get('/portal/admin/transfer-checkouts', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const eggTypes = await getCustomerEggTypeConfig();
      const queue = await prisma.portalCheckout.findMany({
        where: {
          paymentMethod: 'TRANSFER',
          status: 'AWAITING_TRANSFER',
        },
        include: {
          customer: { select: { id: true, name: true, phone: true, email: true } },
          batch: { select: { id: true, name: true, expectedDate: true, receivedDate: true, eggTypeKey: true, status: true } },
        },
        orderBy: { createdAt: 'asc' },
      });

      return reply.send({
        queue: queue.map((checkout) => ({
          id: checkout.id,
          reference: checkout.reference,
          checkoutType: checkout.checkoutType,
          paymentMethod: checkout.paymentMethod,
          status: checkout.status,
          customer: checkout.customer,
          batch: {
            id: checkout.batch.id,
            name: checkout.batch.name,
            eggTypeLabel: getCustomerEggTypeLabel(eggTypes, checkout.batch.eggTypeKey || 'REGULAR'),
            expectedDate: checkout.batch.expectedDate,
            receivedDate: checkout.batch.receivedDate,
            status: checkout.batch.status,
          },
          quantity: checkout.quantity,
          priceType: checkout.priceType,
          unitPrice: Number(checkout.unitPrice || 0),
          orderValue: Number(checkout.orderValue),
          amountToPay: Number(checkout.amountToPay),
          balanceAfterPayment: Number(checkout.balanceAfterPayment),
          paymentWindowEndsAt: checkout.paymentWindowEndsAt,
          createdAt: checkout.createdAt,
          updatedAt: checkout.updatedAt,
          notes: checkout.notes,
        })),
      });
    },
  });

  fastify.post('/portal/admin/transfer-checkouts/:id/approve', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const checkout = await prisma.portalCheckout.findUnique({
        where: { id: request.params.id },
      });
      if (!checkout || checkout.paymentMethod !== 'TRANSFER') {
        return reply.code(404).send({ error: 'Transfer hold not found.' });
      }
      if (checkout.status !== 'AWAITING_TRANSFER') {
        return reply.code(400).send({ error: 'This transfer hold is no longer waiting for confirmation.' });
      }

      if (checkout.checkoutType === 'BOOK_UPCOMING') {
        await finalizeUpcomingBookingCheckout(checkout, request.user.sub);
      } else {
        await finalizeBuyNowCheckout(checkout, request.user.sub);
      }

      return reply.send({
        approved: true,
        message: checkout.checkoutType === 'BUY_NOW'
          ? 'Transfer confirmed. The order is now approved for pickup.'
          : 'Transfer confirmed. The booking is now approved and still held for this customer.',
      });
    },
  });

  fastify.post('/portal/admin/transfer-checkouts/:id/reject', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const { reason = '' } = request.body || {};
      const checkout = await prisma.portalCheckout.findUnique({
        where: { id: request.params.id },
      });
      if (!checkout || checkout.paymentMethod !== 'TRANSFER') {
        return reply.code(404).send({ error: 'Transfer hold not found.' });
      }
      if (checkout.status !== 'AWAITING_TRANSFER') {
        return reply.code(400).send({ error: 'This transfer hold is no longer waiting for confirmation.' });
      }

      await prisma.portalCheckout.update({
        where: { id: checkout.id },
        data: {
          status: 'CANCELLED',
          notes: reason?.trim()
            ? `${checkout.notes ? `${checkout.notes}\n` : ''}Rejected: ${reason.trim()}`
            : checkout.notes,
        },
      });

      return reply.send({
        rejected: true,
        message: 'Transfer rejected. The held crates are now available again.',
      });
    },
  });
}
