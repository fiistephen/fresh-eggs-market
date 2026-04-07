import prisma from '../plugins/prisma.js';
import { authenticate } from '../plugins/auth.js';
import { authorize } from '../middleware/authorize.js';

// Auto-generate receipt number: FE-YYYYMMDD-XXXX
function generateReceiptNumber() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `FE-${date}-${rand}`;
}

// Convert Prisma Decimals to Numbers
function enrichSale(s) {
  return {
    ...s,
    totalAmount: Number(s.totalAmount),
    totalCost: Number(s.totalCost),
    ...(s.lineItems && {
      lineItems: s.lineItems.map(li => ({
        ...li,
        unitPrice: Number(li.unitPrice),
        costPrice: Number(li.costPrice),
        lineTotal: Number(li.lineTotal),
        ...(li.batchEggCode && {
          batchEggCode: {
            ...li.batchEggCode,
            costPrice: Number(li.batchEggCode.costPrice),
          },
        }),
      })),
    }),
    ...(s.batch && {
      batch: {
        ...s.batch,
        ...(s.batch.wholesalePrice !== undefined && { wholesalePrice: Number(s.batch.wholesalePrice) }),
        ...(s.batch.retailPrice !== undefined && { retailPrice: Number(s.batch.retailPrice) }),
        ...(s.batch.costPrice !== undefined && { costPrice: Number(s.batch.costPrice) }),
      },
    }),
  };
}

const VALID_SALE_TYPES = ['WHOLESALE', 'RETAIL', 'CRACKED', 'WRITE_OFF'];
const VALID_PAYMENT_METHODS = ['CASH', 'TRANSFER', 'POS_CARD', 'PRE_ORDER'];

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
      if (batchId) where.batchId = batchId;
      if (paymentMethod) where.paymentMethod = paymentMethod;
      if (customerId) where.customerId = customerId;

      const [sales, total] = await Promise.all([
        prisma.sale.findMany({
          where,
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            batch: { select: { id: true, name: true } },
            lineItems: { include: { batchEggCode: { select: { code: true, costPrice: true } } } },
            recordedBy: { select: { firstName: true, lastName: true } },
          },
          orderBy: { saleDate: 'desc' },
          take: parseInt(limit),
          skip: parseInt(offset),
        }),
        prisma.sale.count({ where }),
      ]);

      return reply.send({ sales: sales.map(enrichSale), total });
    },
  });

  // ─── GET SINGLE SALE ──────────────────────────────────────────
  fastify.get('/sales/:id', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const sale = await prisma.sale.findUnique({
        where: { id: request.params.id },
        include: {
          customer: true,
          batch: { select: { id: true, name: true, wholesalePrice: true, retailPrice: true } },
          booking: true,
          lineItems: { include: { batchEggCode: true } },
          recordedBy: { select: { firstName: true, lastName: true } },
        },
      });

      if (!sale) return reply.code(404).send({ error: 'Sale not found' });
      return reply.send({ sale: enrichSale(sale) });
    },
  });

  // ─── RECORD A SALE ────────────────────────────────────────────
  fastify.post('/sales', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'SHOP_FLOOR')],
    handler: async (request, reply) => {
      const { customerId, batchId, bookingId, paymentMethod, lineItems, saleDate } = request.body;

      // ── Validation ────────────────────────────────────────────
      if (!customerId) return reply.code(400).send({ error: 'Customer is required' });
      if (!batchId) return reply.code(400).send({ error: 'Batch is required' });
      if (!paymentMethod || !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
        return reply.code(400).send({ error: `Payment method must be one of: ${VALID_PAYMENT_METHODS.join(', ')}` });
      }
      if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
        return reply.code(400).send({ error: 'At least one line item is required' });
      }

      // Validate customer exists
      const customer = await prisma.customer.findUnique({ where: { id: customerId } });
      if (!customer) return reply.code(404).send({ error: 'Customer not found' });

      // Validate batch exists and is RECEIVED (can sell from received batches)
      const batch = await prisma.batch.findUnique({
        where: { id: batchId },
        include: { eggCodes: true },
      });
      if (!batch) return reply.code(404).send({ error: 'Batch not found' });
      if (batch.status !== 'RECEIVED') {
        return reply.code(400).send({ error: 'Can only record sales against received batches' });
      }

      // Validate booking if provided
      if (bookingId) {
        const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
        if (!booking) return reply.code(404).send({ error: 'Booking not found' });
        if (booking.status !== 'CONFIRMED') {
          return reply.code(400).send({ error: 'Booking is not in CONFIRMED status' });
        }
        if (booking.customerId !== customerId) {
          return reply.code(400).send({ error: 'Booking does not belong to this customer' });
        }
        if (booking.batchId !== batchId) {
          return reply.code(400).send({ error: 'Booking is for a different batch' });
        }
      }

      // Validate line items and calculate totals
      let totalQuantity = 0;
      let totalAmount = 0;
      let totalCost = 0;

      const enrichedItems = [];
      for (const item of lineItems) {
        if (!item.batchEggCodeId) {
          return reply.code(400).send({ error: 'Each line item must have a batchEggCodeId' });
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
        if (eggCode.batchId !== batchId) {
          return reply.code(400).send({ error: `Egg code does not belong to this batch` });
        }

        const lineTotal = item.quantity * item.unitPrice;
        totalQuantity += item.quantity;
        totalAmount += lineTotal;
        totalCost += item.quantity * Number(eggCode.costPrice);

        enrichedItems.push({
          batchEggCodeId: item.batchEggCodeId,
          saleType: item.saleType,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          costPrice: eggCode.costPrice,
          lineTotal,
        });
      }

      // Create the sale
      const sale = await prisma.sale.create({
        data: {
          receiptNumber: generateReceiptNumber(),
          customerId,
          batchId,
          bookingId: bookingId || null,
          recordedById: request.user.sub,
          totalQuantity,
          totalAmount,
          totalCost,
          paymentMethod,
          saleDate: saleDate ? new Date(saleDate) : new Date(),
          lineItems: {
            createMany: { data: enrichedItems },
          },
        },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          lineItems: { include: { batchEggCode: { select: { code: true, costPrice: true } } } },
          batch: { select: { id: true, name: true } },
          recordedBy: { select: { firstName: true, lastName: true } },
        },
      });

      // If fulfilling a booking, mark it picked up
      if (bookingId) {
        await prisma.booking.update({
          where: { id: bookingId },
          data: { status: 'PICKED_UP' },
        });
      }

      return reply.code(201).send({ sale: enrichSale(sale) });
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
          lineItems: { include: { batchEggCode: { select: { code: true } } } },
          batch: { select: { name: true } },
        },
      });

      const totalSales = sales.reduce((s, sale) => s + Number(sale.totalAmount), 0);
      const totalCost = sales.reduce((s, sale) => s + Number(sale.totalCost), 0);
      const grossProfit = totalSales - totalCost;

      // By payment method
      const byPaymentMethod = {};
      for (const sale of sales) {
        const key = sale.paymentMethod;
        if (!byPaymentMethod[key]) byPaymentMethod[key] = { count: 0, total: 0 };
        byPaymentMethod[key].count += 1;
        byPaymentMethod[key].total += Number(sale.totalAmount);
      }

      // By sale type
      const bySaleType = {};
      for (const sale of sales) {
        for (const li of sale.lineItems) {
          if (!bySaleType[li.saleType]) bySaleType[li.saleType] = { count: 0, quantity: 0, total: 0 };
          bySaleType[li.saleType].count += 1;
          bySaleType[li.saleType].quantity += li.quantity;
          bySaleType[li.saleType].total += Number(li.lineTotal);
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
          totalQuantity: sales.reduce((s, sale) => s + sale.totalQuantity, 0),
        },
        byPaymentMethod,
        bySaleType,
        detail: sales.map(s => ({
          id: s.id,
          receiptNumber: s.receiptNumber,
          customer: s.customer.name,
          customerPhone: s.customer.phone,
          batch: s.batch.name,
          totalQuantity: s.totalQuantity,
          totalAmount: Number(s.totalAmount),
          totalCost: Number(s.totalCost),
          grossProfit: Number(s.totalAmount) - Number(s.totalCost),
          paymentMethod: s.paymentMethod,
          saleDate: s.saleDate,
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
      for (const s of sales) {
        const key = s.paymentMethod;
        if (!report[key]) report[key] = { count: 0, totalAmount: 0, totalQuantity: 0 };
        report[key].count += 1;
        report[key].totalAmount += Number(s.totalAmount);
        report[key].totalQuantity += s.totalQuantity;
      }

      return reply.send({ report, totalTransactions: sales.length });
    },
  });

  // ─── RECEIVABLE BATCHES FOR SALE (batches with egg codes) ─────
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

      const result = batches.map(b => ({
        id: b.id,
        name: b.name,
        receivedDate: b.receivedDate,
        actualQuantity: b.actualQuantity,
        wholesalePrice: Number(b.wholesalePrice),
        retailPrice: Number(b.retailPrice),
        eggCodes: b.eggCodes.map(ec => ({
          id: ec.id,
          code: ec.code,
          costPrice: Number(ec.costPrice),
          quantity: ec.quantity,
          freeQty: ec.freeQty,
        })),
        salesCount: b._count.sales,
      }));

      return reply.send({ batches: result });
    },
  });
}
