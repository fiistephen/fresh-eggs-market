import prisma from '../plugins/prisma.js';
import { authenticate } from '../plugins/auth.js';
import { authorize } from '../middleware/authorize.js';
import { getCustomerEggTypeConfig, getCustomerEggTypeLabel, getOperationsPolicy } from '../utils/appSettings.js';
import { buildCustomerOrderLimitProfile, getCustomerTrackedOrderCount } from '../utils/customerOrderPolicy.js';
import { getActivePortalBuyNowHoldQuantity } from '../utils/portalCheckout.js';

const VALID_SALE_TYPES = ['WHOLESALE', 'RETAIL', 'CRACKED', 'WRITE_OFF'];
const VALID_PAYMENT_METHODS = ['CASH', 'TRANSFER', 'POS_CARD', 'PRE_ORDER'];
const DIRECT_SALE_PAYMENT_METHODS = ['CASH', 'TRANSFER', 'POS_CARD'];
const DIRECT_SALE_PAYMENT_CONFIG = {
  CASH: {
    accountType: 'CASH_ON_HAND',
    category: 'CASH_SALE',
  },
  TRANSFER: {
    accountType: 'CUSTOMER_DEPOSIT',
    category: 'DIRECT_SALE_TRANSFER',
  },
  POS_CARD: {
    accountType: 'CUSTOMER_DEPOSIT',
    category: 'POS_SETTLEMENT',
  },
};

// Auto-generate receipt number: FE-YYYYMMDD-XXXX
function generateReceiptNumber() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `FE-${date}-${rand}`;
}

function mapBatchForSale(batch, eggTypes = []) {
  return {
    id: batch.id,
    name: batch.name,
    eggTypeKey: batch.eggTypeKey || 'REGULAR',
    eggTypeLabel: getCustomerEggTypeLabel(eggTypes, batch.eggTypeKey || 'REGULAR'),
    receivedDate: batch.receivedDate,
    actualQuantity: batch.actualQuantity,
    wholesalePrice: Number(batch.wholesalePrice),
    retailPrice: Number(batch.retailPrice),
    eggCodes: batch.eggCodes.map((eggCode) => ({
      id: eggCode.id,
      code: eggCode.code,
      costPrice: Number(eggCode.costPrice),
      wholesalePrice: eggCode.wholesalePrice != null ? Number(eggCode.wholesalePrice) : Number(batch.wholesalePrice),
      retailPrice: eggCode.retailPrice != null ? Number(eggCode.retailPrice) : Number(batch.retailPrice),
      quantity: eggCode.quantity,
      freeQty: eggCode.freeQty,
    })),
  };
}

async function getBatchStockSnapshot(batchId, eggTypes = []) {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: { eggCodes: true },
  });

  if (!batch) return null;

  const soldByEggCodeRows = await prisma.saleLineItem.groupBy({
    by: ['batchEggCodeId'],
    where: {
      batchEggCode: { batchId },
    },
    _sum: { quantity: true },
  });

  const soldByEggCode = new Map(
    soldByEggCodeRows.map((row) => [row.batchEggCodeId, row._sum.quantity || 0]),
  );

  const soldAgg = await prisma.saleLineItem.aggregate({
    where: { batchEggCode: { batchId } },
    _sum: { quantity: true },
  });
  const totalSold = soldAgg._sum.quantity || 0;

  const writeOffAgg = await prisma.inventoryCount.aggregate({
    where: { batchId },
    _sum: { crackedWriteOff: true },
  });
  const totalWrittenOff = writeOffAgg._sum.crackedWriteOff || 0;

  const [bookedAgg, heldForPortal] = await Promise.all([
    prisma.booking.aggregate({
      where: { batchId, status: 'CONFIRMED' },
      _sum: { quantity: true },
    }),
    getActivePortalBuyNowHoldQuantity(batchId),
  ]);
  const totalBooked = bookedAgg._sum.quantity || 0;

  const eggCodes = batch.eggCodes.map((eggCode) => {
    const receivedQuantity = eggCode.quantity + eggCode.freeQty;
    const soldQuantity = soldByEggCode.get(eggCode.id) || 0;
    return {
      id: eggCode.id,
      batchId: batch.id,
      batchName: batch.name,
      code: eggCode.code,
      costPrice: Number(eggCode.costPrice),
      receivedQuantity,
      soldQuantity,
      remainingQuantity: Math.max(0, receivedQuantity - soldQuantity),
      wholesalePrice: eggCode.wholesalePrice != null ? Number(eggCode.wholesalePrice) : Number(batch.wholesalePrice),
      retailPrice: eggCode.retailPrice != null ? Number(eggCode.retailPrice) : Number(batch.retailPrice),
    };
  });

  const totalReceived = eggCodes.reduce((sum, eggCode) => sum + eggCode.receivedQuantity, 0);

  return {
    batch: mapBatchForSale(batch, eggTypes),
    totalReceived,
    totalSold,
    totalWrittenOff,
    totalBooked,
    onHand: Math.max(0, totalReceived - totalSold - totalWrittenOff),
    availableForSale: Math.max(0, totalReceived - totalSold - totalWrittenOff - totalBooked - heldForPortal),
    eggCodes,
  };
}

function deriveSaleBatchSummary(sale) {
  const batchNames = new Set();
  if (sale.batch?.name) batchNames.add(sale.batch.name);

  for (const lineItem of sale.lineItems || []) {
    const name = lineItem.batchEggCode?.batch?.name;
    if (name) batchNames.add(name);
  }

  const names = [...batchNames];
  if (names.length === 0) return '—';
  if (names.length === 1) return names[0];
  return `${names.length} batches`;
}

function formatOrderLimitMessage(orderLimitProfile) {
  if (!orderLimitProfile) return null;
  if (orderLimitProfile.isUsingEarlyOrderLimit) {
    return `This customer is still under the early-order limit of ${Number(orderLimitProfile.currentPerOrderLimit || 0).toLocaleString()} crates for order ${orderLimitProfile.nextOrderNumber}.`;
  }
  return `This customer can buy up to ${Number(orderLimitProfile.currentPerOrderLimit || 0).toLocaleString()} crates in one order.`;
}

function mapBookingForWorkspace(booking, eggTypes = []) {
  const amountPaid = Number(booking.amountPaid);
  const orderValue = Number(booking.orderValue);
  const balance = Math.max(0, orderValue - amountPaid);

  return {
    id: booking.id,
    customerId: booking.customerId,
    batchId: booking.batchId,
    quantity: booking.quantity,
    amountPaid,
    orderValue,
    balance,
    isFullyPaid: balance <= 0.009,
    createdAt: booking.createdAt,
    notes: booking.notes,
    batch: booking.batch ? mapBatchForSale(booking.batch, eggTypes) : null,
    batchEggCodeId: booking.batchEggCodeId || null,
    batchEggCode: booking.batchEggCode
      ? {
          id: booking.batchEggCode.id,
          code: booking.batchEggCode.code,
          wholesalePrice: booking.batchEggCode.wholesalePrice != null ? Number(booking.batchEggCode.wholesalePrice) : null,
          retailPrice: booking.batchEggCode.retailPrice != null ? Number(booking.batchEggCode.retailPrice) : null,
        }
      : null,
  };
}

function enrichSale(sale, eggTypes = []) {
  return {
    ...sale,
    totalAmount: Number(sale.totalAmount),
    totalCost: Number(sale.totalCost),
    sourceType: sale.bookingId ? 'BOOKING' : 'DIRECT',
    paymentTransaction: sale.paymentTransaction ? {
      ...sale.paymentTransaction,
      amount: Number(sale.paymentTransaction.amount),
    } : undefined,
    limitOverride: sale.limitOverrideNote
      ? {
          note: sale.limitOverrideNote,
          at: sale.limitOverrideAt,
          by: sale.limitOverrideBy
            ? `${sale.limitOverrideBy.firstName} ${sale.limitOverrideBy.lastName}`.trim()
            : null,
        }
      : null,
    booking: sale.booking ? {
      ...sale.booking,
      amountPaid: Number(sale.booking.amountPaid),
      orderValue: Number(sale.booking.orderValue),
    } : undefined,
    ...(sale.lineItems && {
      lineItems: sale.lineItems.map((lineItem) => ({
        ...lineItem,
        unitPrice: Number(lineItem.unitPrice),
        costPrice: Number(lineItem.costPrice),
        lineTotal: Number(lineItem.lineTotal),
        ...(lineItem.batchEggCode && {
          batchEggCode: {
            ...lineItem.batchEggCode,
            costPrice: Number(lineItem.batchEggCode.costPrice),
          },
        }),
      })),
    }),
    ...(sale.batch && {
      batch: {
        ...sale.batch,
        eggTypeKey: sale.batch.eggTypeKey || 'REGULAR',
        eggTypeLabel: getCustomerEggTypeLabel(eggTypes, sale.batch.eggTypeKey || 'REGULAR'),
        ...(sale.batch.wholesalePrice !== undefined && { wholesalePrice: Number(sale.batch.wholesalePrice) }),
        ...(sale.batch.retailPrice !== undefined && { retailPrice: Number(sale.batch.retailPrice) }),
        ...(sale.batch.costPrice !== undefined && { costPrice: Number(sale.batch.costPrice) }),
      },
    }),
    batchSummary: deriveSaleBatchSummary(sale),
  };
}

function buildSaleInclude() {
  return {
    customer: { select: { id: true, name: true, phone: true } },
    batch: { select: { id: true, name: true, eggTypeKey: true } },
    booking: {
      select: {
        id: true,
        batchEggCodeId: true,
        quantity: true,
        amountPaid: true,
        orderValue: true,
        status: true,
      },
    },
    lineItems: {
      include: {
        batchEggCode: {
          select: {
            code: true,
            costPrice: true,
            batch: { select: { id: true, name: true, eggTypeKey: true } },
          },
        },
      },
    },
    paymentTransaction: {
      include: {
        bankAccount: { select: { id: true, name: true, accountType: true, lastFour: true, isVirtual: true } },
      },
    },
    recordedBy: { select: { firstName: true, lastName: true } },
    limitOverrideBy: { select: { firstName: true, lastName: true } },
  };
}

async function resolveDirectSalePaymentDestination(paymentMethod) {
  const config = DIRECT_SALE_PAYMENT_CONFIG[paymentMethod];
  if (!config) {
    throw new Error('Unsupported direct sale payment method');
  }

  const account = await prisma.bankAccount.findFirst({
    where: {
      accountType: config.accountType,
      isActive: true,
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  if (!account) {
    throw new Error(`No active ${config.accountType} account is available for direct sales`);
  }

  return {
    account,
    category: config.category,
  };
}

function directSalePaymentDescription({ paymentMethod, customer, batch, receiptNumber }) {
  const paymentLabels = {
    CASH: 'Cash sale',
    TRANSFER: 'Transfer sale',
    POS_CARD: 'POS/Card sale',
  };

  const parts = [
    paymentLabels[paymentMethod] || 'Direct sale',
    receiptNumber,
    customer?.name,
    batch?.name || batch?.label,
  ].filter(Boolean);

  return parts.join(' · ');
}

export default async function salesRoutes(fastify) {
  // ─── LIST SALES ───────────────────────────────────────────────
  fastify.get('/sales', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { date, dateFrom, dateTo, batchId, paymentMethod, customerId, limit = 50, offset = 0 } = request.query;

      const where = {};
      if (date) {
        const start = new Date(date);
        const end = new Date(date);
        end.setDate(end.getDate() + 1);
        where.saleDate = { gte: start, lt: end };
      } else if (dateFrom || dateTo) {
        where.saleDate = {};
        if (dateFrom) where.saleDate.gte = new Date(dateFrom);
      if (dateTo) {
          const end = new Date(dateTo);
          end.setDate(end.getDate() + 1);
          where.saleDate.lt = end;
        }
      }
      if (batchId) {
        where.OR = [
          { batchId },
          { lineItems: { some: { batchEggCode: { batchId } } } },
        ];
      }
      if (paymentMethod) where.paymentMethod = paymentMethod;
      if (customerId) where.customerId = customerId;

      const [sales, total] = await Promise.all([
        prisma.sale.findMany({
          where,
          include: buildSaleInclude(),
          orderBy: { saleDate: 'desc' },
          take: parseInt(limit, 10),
          skip: parseInt(offset, 10),
        }),
        prisma.sale.count({ where }),
      ]);
      const eggTypes = await getCustomerEggTypeConfig();

      return reply.send({ sales: sales.map((sale) => enrichSale(sale, eggTypes)), total });
    },
  });

  // ─── GET SINGLE SALE ──────────────────────────────────────────
  fastify.get('/sales/:id', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const sale = await prisma.sale.findUnique({
        where: { id: request.params.id },
        include: buildSaleInclude(),
      });

      if (!sale) return reply.code(404).send({ error: 'Sale not found' });
      const eggTypes = await getCustomerEggTypeConfig();
      return reply.send({ sale: enrichSale(sale, eggTypes) });
    },
  });

  // ─── CUSTOMER SALES WORKSPACE ─────────────────────────────────
  fastify.get('/sales/customer-workspace/:customerId', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'SHOP_FLOOR')],
    handler: async (request, reply) => {
      const { customerId } = request.params;
      const [eggTypes, policy] = await Promise.all([
        getCustomerEggTypeConfig(),
        getOperationsPolicy(),
      ]);

      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { id: true, name: true, phone: true, isFirstTime: true },
      });

      if (!customer) {
        return reply.code(404).send({ error: 'Customer not found' });
      }

      const [bookings, batches] = await Promise.all([
        prisma.booking.findMany({
          where: { customerId, status: 'CONFIRMED' },
          include: {
            batch: {
              include: {
                eggCodes: true,
              },
            },
            batchEggCode: {
              select: {
                id: true,
                code: true,
                wholesalePrice: true,
                retailPrice: true,
              },
            },
          },
          orderBy: [{ createdAt: 'asc' }],
        }),
        prisma.batch.findMany({
          where: { status: 'RECEIVED' },
          include: {
            eggCodes: true,
            _count: { select: { sales: true } },
          },
          orderBy: { receivedDate: 'desc' },
        }),
      ]);

      const batchSnapshots = await Promise.all(batches.map((batch) => getBatchStockSnapshot(batch.id, eggTypes)));
      const trackedOrderCount = await getCustomerTrackedOrderCount(customerId);
      const orderLimitProfile = buildCustomerOrderLimitProfile(policy, trackedOrderCount);
      const saleReadyBatches = batchSnapshots
        .filter(Boolean)
        .filter((snapshot) => snapshot.availableForSale > 0);

      const mixedDirectSaleStock = saleReadyBatches.flatMap((snapshot) => (
        snapshot.eggCodes
          .filter((eggCode) => eggCode.remainingQuantity > 0)
          .map((eggCode) => ({
            ...eggCode,
            batchReceivedDate: snapshot.batch.receivedDate,
            batchAvailableForSale: snapshot.availableForSale,
          }))
      ));

      return reply.send({
        customer: {
          ...customer,
          orderLimitProfile,
          orderLimitMessage: formatOrderLimitMessage(orderLimitProfile),
        },
        bookings: bookings.map((booking) => mapBookingForWorkspace(booking, eggTypes)),
        directSaleBatches: saleReadyBatches.map((snapshot) => ({
          ...snapshot.batch,
          salesCount: batches.find((batch) => batch.id === snapshot.batch.id)?._count.sales || 0,
          availableForSale: snapshot.availableForSale,
          eggCodes: snapshot.eggCodes,
        })),
        mixedDirectSaleStock,
      });
    },
  });

  // ─── RECORD A SALE ────────────────────────────────────────────
  fastify.post('/sales', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'SHOP_FLOOR')],
    handler: async (request, reply) => {
      const {
        customerId,
        newCustomer,
        batchId,
        bookingId,
        paymentMethod,
        lineItems,
        saleDate,
        limitOverrideNote,
      } = request.body;
      const trimmedLimitOverrideNote = String(limitOverrideNote || '').trim();

      if (!customerId && !newCustomer) return reply.code(400).send({ error: 'Customer is required' });
      if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
        return reply.code(400).send({ error: 'At least one line item is required' });
      }

      let customer = null;
      let trackedOrderCount = 0;
      let createCustomerInput = null;

      if (customerId) {
        customer = await prisma.customer.findUnique({ where: { id: customerId } });
        if (!customer) return reply.code(404).send({ error: 'Customer not found' });
        trackedOrderCount = await getCustomerTrackedOrderCount(customerId);
      } else {
        const name = String(newCustomer?.name || '').trim();
        const phone = String(newCustomer?.phone || '').trim();
        const email = String(newCustomer?.email || '').trim();
        const notes = String(newCustomer?.notes || '').trim();

        if (!name || !phone) {
          return reply.code(400).send({ error: 'New customer name and phone are required' });
        }

        const existingByPhone = await prisma.customer.findUnique({ where: { phone } });
        if (existingByPhone) {
          return reply.code(409).send({
            error: `Customer with phone ${phone} already exists`,
            existingCustomer: {
              id: existingByPhone.id,
              name: existingByPhone.name,
              phone: existingByPhone.phone,
              email: existingByPhone.email,
            },
          });
        }

        createCustomerInput = {
          name,
          phone,
          email: email || null,
          notes: notes || null,
        };
      }

      let booking = null;
      if (bookingId) {
        booking = await prisma.booking.findUnique({
          where: { id: bookingId },
          include: {
            batch: {
              include: { eggCodes: true },
            },
          },
        });

        if (!booking) return reply.code(404).send({ error: 'Booking not found' });
        if (booking.status !== 'CONFIRMED') {
          return reply.code(400).send({ error: 'This booking is no longer open for pickup' });
        }
        if (booking.customerId !== customerId) {
          return reply.code(400).send({ error: 'Booking does not belong to this customer' });
        }
        if (batchId && booking.batchId !== batchId) {
          return reply.code(400).send({ error: 'Booking is linked to a different batch' });
        }

        const bookingBalance = Number(booking.orderValue) - Number(booking.amountPaid);
        if (bookingBalance > 0.009) {
          return reply.code(400).send({
            error: 'This booking still has a balance. Record the remaining payment in Banking and update the booking before pickup.',
          });
        }
      }

      const resolvedBatchId = booking ? booking.batchId : batchId || null;

      let batch = null;
      if (resolvedBatchId) {
        batch = booking?.batch || await prisma.batch.findUnique({
          where: { id: resolvedBatchId },
          include: { eggCodes: true },
        });

        if (!batch) return reply.code(404).send({ error: 'Batch not found' });
        if (batch.status !== 'RECEIVED') {
          return reply.code(400).send({ error: 'Can only record sales against received batches' });
        }
      }

      let resolvedPaymentMethod = paymentMethod;
      if (booking) {
        resolvedPaymentMethod = 'PRE_ORDER';
      } else if (!resolvedPaymentMethod || !DIRECT_SALE_PAYMENT_METHODS.includes(resolvedPaymentMethod)) {
        return reply.code(400).send({
          error: `Payment method must be one of: ${DIRECT_SALE_PAYMENT_METHODS.join(', ')}`,
        });
      }

      if (!VALID_PAYMENT_METHODS.includes(resolvedPaymentMethod)) {
        return reply.code(400).send({ error: `Payment method must be one of: ${VALID_PAYMENT_METHODS.join(', ')}` });
      }

      let totalQuantity = 0;
      let totalAmount = 0;
      let totalCost = 0;
      const enrichedItems = [];
      const quantityByEggCode = new Map();
      const quantityByBatch = new Map();
      const eggCodeMap = new Map();

      for (const item of lineItems) {
        if (!item.batchEggCodeId) {
          return reply.code(400).send({ error: 'Each line item must have a batch egg code' });
        }
        if (!item.saleType || !VALID_SALE_TYPES.includes(item.saleType)) {
          return reply.code(400).send({ error: `Sale type must be one of: ${VALID_SALE_TYPES.join(', ')}` });
        }
        if (!item.quantity || item.quantity <= 0) {
          return reply.code(400).send({ error: 'Quantity must be positive' });
        }
        if (item.unitPrice == null || item.unitPrice < 0) {
          return reply.code(400).send({ error: 'Unit price must be zero or positive' });
        }

        const eggCode = await prisma.batchEggCode.findUnique({
          where: { id: item.batchEggCodeId },
        });

        if (!eggCode) {
          return reply.code(400).send({ error: `Egg code not found: ${item.batchEggCodeId}` });
        }
        if (booking && eggCode.batchId !== resolvedBatchId) {
          return reply.code(400).send({ error: 'Booking pickup can only use egg codes from the booked batch' });
        }
        if (!booking && resolvedBatchId && eggCode.batchId !== resolvedBatchId) {
          return reply.code(400).send({ error: 'This direct sale is limited to the batch you selected' });
        }

        const quantity = Number(item.quantity);
        const unitPriceNumber = Number(item.unitPrice);
        const lineTotal = quantity * unitPriceNumber;

        totalQuantity += quantity;
        totalAmount += lineTotal;
        totalCost += quantity * Number(eggCode.costPrice);

        enrichedItems.push({
          batchEggCodeId: item.batchEggCodeId,
          saleType: item.saleType,
          quantity,
          unitPrice: unitPriceNumber,
          costPrice: eggCode.costPrice,
          lineTotal,
        });

        quantityByEggCode.set(
          item.batchEggCodeId,
          (quantityByEggCode.get(item.batchEggCodeId) || 0) + quantity,
        );
        quantityByBatch.set(
          eggCode.batchId,
          (quantityByBatch.get(eggCode.batchId) || 0) + quantity,
        );
        eggCodeMap.set(eggCode.id, eggCode);
      }

      const policy = await getOperationsPolicy();
      const orderLimitProfile = buildCustomerOrderLimitProfile(policy, trackedOrderCount);

      if (!booking && totalQuantity > Number(orderLimitProfile.currentPerOrderLimit || 0) && !trimmedLimitOverrideNote) {
        return reply.code(400).send({
          error: `This order is above the limit of ${Number(orderLimitProfile.currentPerOrderLimit || 0).toLocaleString()} crates. Add a note before overriding this limit.`,
        });
      }

      if (booking && totalQuantity !== booking.quantity) {
        return reply.code(400).send({
          error: `This booking is for ${booking.quantity} crates. Enter exactly that quantity or update the booking first.`,
        });
      }

      const effectiveSaleDate = saleDate ? new Date(saleDate) : new Date();
      const receiptNumber = generateReceiptNumber();
      const involvedBatchIds = [...quantityByBatch.keys()];
      if (!booking && involvedBatchIds.length === 0) {
        return reply.code(400).send({ error: 'Choose at least one batch for this sale' });
      }

      const stockSnapshots = await Promise.all(involvedBatchIds.map((id) => getBatchStockSnapshot(id)));
      const stockByBatch = new Map(stockSnapshots.filter(Boolean).map((snapshot) => [snapshot.batch.id, snapshot]));

      for (const [eggCodeId, quantity] of quantityByEggCode.entries()) {
        const eggCode = eggCodeMap.get(eggCodeId);
        const snapshot = stockByBatch.get(eggCode.batchId);
        const stockRow = snapshot?.eggCodes.find((row) => row.id === eggCodeId);
        if (!snapshot || !stockRow) {
          return reply.code(400).send({ error: 'One of the selected egg codes is no longer available' });
        }
        if (quantity > stockRow.remainingQuantity) {
          return reply.code(400).send({
            error: `${stockRow.code} in ${snapshot.batch.name} only has ${stockRow.remainingQuantity} crates remaining`,
          });
        }
      }

      for (const [batchIdUsed, quantity] of quantityByBatch.entries()) {
        const snapshot = stockByBatch.get(batchIdUsed);
        if (!snapshot) {
          return reply.code(400).send({ error: 'One of the selected batches is no longer available' });
        }

        const allowedQuantity = booking && batchIdUsed === booking.batchId
          ? snapshot.availableForSale + booking.quantity
          : snapshot.availableForSale;

        if (quantity > allowedQuantity) {
          return reply.code(400).send({
            error: `${snapshot.batch.name} only has ${allowedQuantity} crates available for this sale`,
          });
        }
      }

      const headerBatchId = booking
        ? booking.batchId
        : involvedBatchIds.length === 1
          ? involvedBatchIds[0]
          : null;
      const batchLabel = booking
        ? { name: booking.batch?.name }
        : involvedBatchIds.length === 1
          ? { name: stockByBatch.get(involvedBatchIds[0])?.batch.name }
          : { label: `${involvedBatchIds.length} batches` };
      const directSaleDestination = !bookingId
        ? await resolveDirectSalePaymentDestination(resolvedPaymentMethod)
        : null;

      const sale = await prisma.$transaction(async (tx) => {
        let persistedCustomer = customer;
        if (!persistedCustomer && createCustomerInput) {
          persistedCustomer = await tx.customer.create({ data: createCustomerInput });
        }

        const createdSale = await tx.sale.create({
          data: {
            receiptNumber,
            customerId: persistedCustomer.id,
            batchId: headerBatchId,
            bookingId: bookingId || null,
            recordedById: request.user.sub,
            limitOverrideNote: !bookingId && totalQuantity > Number(orderLimitProfile.currentPerOrderLimit || 0)
              ? trimmedLimitOverrideNote
              : null,
            limitOverrideById: !bookingId && totalQuantity > Number(orderLimitProfile.currentPerOrderLimit || 0)
              ? request.user.sub
              : null,
            limitOverrideAt: !bookingId && totalQuantity > Number(orderLimitProfile.currentPerOrderLimit || 0)
              ? new Date()
              : null,
            totalQuantity,
            totalAmount,
            totalCost,
            paymentMethod: resolvedPaymentMethod,
            saleDate: effectiveSaleDate,
            lineItems: {
              createMany: { data: enrichedItems },
            },
          },
        });

        if (!bookingId) {
          const { account, category } = directSaleDestination;
          await tx.bankTransaction.create({
            data: {
              bankAccountId: account.id,
              direction: 'INFLOW',
              category,
              amount: totalAmount,
              description: directSalePaymentDescription({
                paymentMethod: resolvedPaymentMethod,
                customer: persistedCustomer,
                batch: batchLabel,
                receiptNumber,
              }),
              reference: receiptNumber,
              transactionDate: effectiveSaleDate,
              sourceType: 'SYSTEM',
              sourceFingerprint: `sale:${createdSale.id}:payment`,
              saleId: createdSale.id,
              customerId: persistedCustomer.id,
              enteredById: request.user.sub,
              postedAt: new Date(),
            },
          });
        }

        if (bookingId) {
          await tx.booking.update({
            where: { id: bookingId },
            data: { status: 'PICKED_UP' },
          });
        }

        return tx.sale.findUnique({
          where: { id: createdSale.id },
          include: buildSaleInclude(),
        });
      });

      const eggTypes = await getCustomerEggTypeConfig();
      return reply.code(201).send({ sale: enrichSale(sale, eggTypes) });
    },
  });

  // ─── DAILY SALES SUMMARY ─────────────────────────────────────
  fastify.get('/sales/daily-summary', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const { date } = request.query;
      const targetDate = date ? new Date(date) : new Date();
      const start = new Date(targetDate.toISOString().slice(0, 10));
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      const sales = await prisma.sale.findMany({
        where: { saleDate: { gte: start, lt: end } },
        include: {
          customer: { select: { name: true, phone: true } },
          lineItems: {
            include: {
              batchEggCode: {
                select: {
                  code: true,
                  batch: { select: { name: true } },
                },
              },
            },
          },
          batch: { select: { name: true } },
        },
      });

      const totalSales = sales.reduce((sum, sale) => sum + Number(sale.totalAmount), 0);
      const totalCost = sales.reduce((sum, sale) => sum + Number(sale.totalCost), 0);
      const grossProfit = totalSales - totalCost;

      const byPaymentMethod = {};
      for (const sale of sales) {
        const key = sale.paymentMethod;
        if (!byPaymentMethod[key]) byPaymentMethod[key] = { count: 0, total: 0 };
        byPaymentMethod[key].count += 1;
        byPaymentMethod[key].total += Number(sale.totalAmount);
      }

      const bySaleType = {};
      for (const sale of sales) {
        for (const lineItem of sale.lineItems) {
          if (!bySaleType[lineItem.saleType]) bySaleType[lineItem.saleType] = { count: 0, quantity: 0, total: 0 };
          bySaleType[lineItem.saleType].count += 1;
          bySaleType[lineItem.saleType].quantity += lineItem.quantity;
          bySaleType[lineItem.saleType].total += Number(lineItem.lineTotal);
        }
      }

      return reply.send({
        date: start.toISOString().slice(0, 10),
        summary: {
          totalSales,
          totalCost,
          grossProfit,
          margin: totalSales > 0 ? Math.round((grossProfit / totalSales) * 100 * 100) / 100 : 0,
          transactionCount: sales.length,
          totalQuantity: sales.reduce((sum, sale) => sum + sale.totalQuantity, 0),
        },
        byPaymentMethod,
        bySaleType,
        detail: sales.map((sale) => ({
          id: sale.id,
          receiptNumber: sale.receiptNumber,
          customer: sale.customer.name,
          customerPhone: sale.customer.phone,
          batch: sale.batch?.name || deriveSaleBatchSummary(sale),
          totalQuantity: sale.totalQuantity,
          totalAmount: Number(sale.totalAmount),
          totalCost: Number(sale.totalCost),
          grossProfit: Number(sale.totalAmount) - Number(sale.totalCost),
          paymentMethod: sale.paymentMethod,
          saleDate: sale.saleDate,
        })),
      });
    },
  });

  // ─── SALES BY PAYMENT METHOD REPORT ───────────────────────────
  fastify.get('/sales/by-payment-method', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const { dateFrom, dateTo } = request.query;
      const where = {};

      if (dateFrom || dateTo) {
        where.saleDate = {};
        if (dateFrom) where.saleDate.gte = new Date(dateFrom);
        if (dateTo) {
          const end = new Date(dateTo);
          end.setDate(end.getDate() + 1);
          where.saleDate.lt = end;
        }
      }

      const sales = await prisma.sale.findMany({
        where,
        select: { paymentMethod: true, totalAmount: true, totalQuantity: true },
      });

      const report = {};
      for (const sale of sales) {
        const key = sale.paymentMethod;
        if (!report[key]) report[key] = { count: 0, totalAmount: 0, totalQuantity: 0 };
        report[key].count += 1;
        report[key].totalAmount += Number(sale.totalAmount);
        report[key].totalQuantity += sale.totalQuantity;
      }

      return reply.send({ report, totalTransactions: sales.length });
    },
  });

  // ─── RECEIVABLE BATCHES FOR DIRECT SALE ──────────────────────
  fastify.get('/sales/available-batches', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const batches = await prisma.batch.findMany({
        where: { status: 'RECEIVED' },
        include: {
          eggCodes: true,
          _count: { select: { sales: true, bookings: true } },
        },
        orderBy: { receivedDate: 'desc' },
      });

      return reply.send({
        batches: batches.map((batch) => ({
          ...mapBatchForSale(batch),
          salesCount: batch._count.sales,
        })),
      });
    },
  });
}
