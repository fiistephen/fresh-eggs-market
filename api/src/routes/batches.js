import prisma from '../plugins/prisma.js';
import { authenticate } from '../plugins/auth.js';
import { authorize } from '../middleware/authorize.js';
import {
  buildCrackAlert,
  roundTo2,
  safeDivide,
} from '../utils/operationsPolicy.js';
import { getOperationsPolicy } from '../utils/appSettings.js';
import { ensureItemForEggCode, normalizeItemCode } from '../utils/items.js';

async function findSalesForBatch(batchId) {
  return prisma.sale.findMany({
    where: {
      lineItems: {
        some: {
          batchEggCode: { batchId },
        },
      },
    },
    include: {
      customer: true,
      lineItems: {
        where: {
          batchEggCode: { batchId },
        },
        include: {
          batchEggCode: true,
        },
      },
    },
    orderBy: { saleDate: 'desc' },
  });
}

export default async function batchRoutes(fastify) {

  // ─── LIST BATCHES ─────────────────────────────────────────────
  fastify.get('/batches', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { status, search } = request.query;
      const where = {};
      if (status) where.status = status;
      if (search) where.name = { contains: search, mode: 'insensitive' };

      const batches = await prisma.batch.findMany({
        where,
        include: {
          eggCodes: true,
          _count: { select: { bookings: true, sales: true } },
        },
        orderBy: { expectedDate: 'desc' },
      });

      // Enrich with computed fields
      const enriched = batches.map(b => {
        const totalBooked = 0; // Will be computed from bookings in Phase 2
        return {
          ...b,
          wholesalePrice: Number(b.wholesalePrice),
          retailPrice: Number(b.retailPrice),
          costPrice: Number(b.costPrice),
          eggCodes: b.eggCodes.map(ec => ({
            ...ec,
            costPrice: Number(ec.costPrice),
          })),
        };
      });

      return reply.send({ batches: enriched });
    },
  });

  // ─── GET SINGLE BATCH ─────────────────────────────────────────
  fastify.get('/batches/:id', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const batch = await prisma.batch.findUnique({
        where: { id: request.params.id },
        include: {
          eggCodes: true,
          bookings: { include: { customer: true } },
          _count: { select: { bookings: true, sales: true } },
        },
      });

      if (!batch) return reply.code(404).send({ error: 'Batch not found' });
      const batchSales = await findSalesForBatch(batch.id);

      // Convert Decimals to numbers for JSON
      const result = {
        ...batch,
        wholesalePrice: Number(batch.wholesalePrice),
        retailPrice: Number(batch.retailPrice),
        costPrice: Number(batch.costPrice),
        eggCodes: batch.eggCodes.map(ec => ({
          ...ec,
          costPrice: Number(ec.costPrice),
        })),
        bookings: batch.bookings.map(bk => ({
          ...bk,
          amountPaid: Number(bk.amountPaid),
          orderValue: Number(bk.orderValue),
        })),
        sales: batchSales.map(s => ({
          ...s,
          totalAmount: Number(s.totalAmount),
          totalCost: Number(s.totalCost),
          lineItems: s.lineItems.map(li => ({
            ...li,
            unitPrice: Number(li.unitPrice),
            costPrice: Number(li.costPrice),
            lineTotal: Number(li.lineTotal),
          })),
        })),
        _count: {
          ...batch._count,
          sales: batchSales.length,
        },
      };

      return reply.send({ batch: result });
    },
  });

  // ─── CREATE BATCH ─────────────────────────────────────────────
  fastify.post('/batches', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const { expectedDate, expectedQuantity, availableForBooking, wholesalePrice, retailPrice, costPrice } = request.body;

      // Validation
      if (!expectedDate) return reply.code(400).send({ error: 'Expected date is required' });
      if (!expectedQuantity || expectedQuantity <= 0) return reply.code(400).send({ error: 'Expected quantity must be positive' });
      if (!wholesalePrice || wholesalePrice <= 0) return reply.code(400).send({ error: 'Wholesale price is required' });
      if (!retailPrice || retailPrice <= 0) return reply.code(400).send({ error: 'Retail price is required' });
      if (!costPrice || costPrice <= 0) return reply.code(400).send({ error: 'Cost price is required' });

      const bookingQty = availableForBooking ?? expectedQuantity;
      if (bookingQty > expectedQuantity) {
        return reply.code(400).send({ error: 'Available for booking cannot exceed expected quantity' });
      }

      // Auto-generate batch name from date
      const date = new Date(expectedDate);
      const day = date.getUTCDate();
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      const month = months[date.getUTCMonth()];
      const year = date.getUTCFullYear();
      const baseName = `${day}${month}${year}`;

      // Check for existing batches on same date to determine suffix
      const existing = await prisma.batch.findMany({
        where: { name: { startsWith: baseName } },
      });

      let name;
      if (existing.length === 0) {
        name = baseName;
      } else {
        // If there's one existing without a letter, rename it to A, then this one is B
        if (existing.length === 1 && existing[0].name === baseName) {
          await prisma.batch.update({
            where: { id: existing[0].id },
            data: { name: `${baseName}A` },
          });
          name = `${baseName}B`;
        } else {
          // Find next letter
          const letters = existing.map(b => b.name.replace(baseName, '')).filter(Boolean).sort();
          const nextLetter = String.fromCharCode(
            (letters.length > 0 ? letters[letters.length - 1].charCodeAt(0) : 64) + 1
          );
          name = `${baseName}${nextLetter}`;
        }
      }

      const batch = await prisma.batch.create({
        data: {
          name,
          expectedDate: new Date(expectedDate),
          expectedQuantity,
          availableForBooking: bookingQty,
          wholesalePrice,
          retailPrice,
          costPrice,
        },
      });

      return reply.code(201).send({
        batch: {
          ...batch,
          wholesalePrice: Number(batch.wholesalePrice),
          retailPrice: Number(batch.retailPrice),
          costPrice: Number(batch.costPrice),
        },
      });
    },
  });

  // ─── UPDATE BATCH (only OPEN batches) ──────────────────────────
  fastify.patch('/batches/:id', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const existing = await prisma.batch.findUnique({ where: { id: request.params.id } });
      if (!existing) return reply.code(404).send({ error: 'Batch not found' });
      if (existing.status !== 'OPEN') {
        return reply.code(400).send({ error: 'Can only edit batches that are OPEN' });
      }

      const { expectedDate, expectedQuantity, availableForBooking, wholesalePrice, retailPrice, costPrice } = request.body;
      const data = {};
      if (expectedDate !== undefined) data.expectedDate = new Date(expectedDate);
      if (expectedQuantity !== undefined) data.expectedQuantity = expectedQuantity;
      if (availableForBooking !== undefined) data.availableForBooking = availableForBooking;
      if (wholesalePrice !== undefined) data.wholesalePrice = wholesalePrice;
      if (retailPrice !== undefined) data.retailPrice = retailPrice;
      if (costPrice !== undefined) data.costPrice = costPrice;

      const batch = await prisma.batch.update({
        where: { id: request.params.id },
        data,
      });

      return reply.send({
        batch: {
          ...batch,
          wholesalePrice: Number(batch.wholesalePrice),
          retailPrice: Number(batch.retailPrice),
          costPrice: Number(batch.costPrice),
        },
      });
    },
  });

  // ─── DELETE BATCH (only OPEN with no bookings) ────────────────
  fastify.delete('/batches/:id', {
    preHandler: [authenticate, authorize('ADMIN')],
    handler: async (request, reply) => {
      const existing = await prisma.batch.findUnique({
        where: { id: request.params.id },
        include: { _count: { select: { bookings: true, sales: true } } },
      });
      if (!existing) return reply.code(404).send({ error: 'Batch not found' });
      if (existing.status !== 'OPEN') {
        return reply.code(400).send({ error: 'Can only delete OPEN batches' });
      }
      if (existing._count.bookings > 0) {
        return reply.code(400).send({ error: 'Cannot delete batch with existing bookings' });
      }

      await prisma.batch.delete({ where: { id: request.params.id } });
      return reply.send({ message: 'Batch deleted' });
    },
  });

  // ─── RECEIVE BATCH ────────────────────────────────────────────
  fastify.patch('/batches/:id/receive', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const { actualQuantity, freeCrates, eggCodes } = request.body;

      const existing = await prisma.batch.findUnique({ where: { id: request.params.id } });
      if (!existing) return reply.code(404).send({ error: 'Batch not found' });
      if (existing.status !== 'OPEN') {
        return reply.code(400).send({ error: 'Batch must be OPEN to receive' });
      }

      // Validation
      if (!actualQuantity || actualQuantity <= 0) {
        return reply.code(400).send({ error: 'Actual quantity must be positive' });
      }
      if (!eggCodes || !Array.isArray(eggCodes) || eggCodes.length === 0) {
        return reply.code(400).send({ error: 'At least one egg code is required' });
      }

      // Validate egg codes
      for (const ec of eggCodes) {
        if (!ec.code || !ec.costPrice || !ec.quantity) {
          return reply.code(400).send({ error: 'Each egg code needs code, costPrice, and quantity' });
        }
        if (!/^FE\d+$/.test(ec.code)) {
          return reply.code(400).send({ error: `Invalid egg code format: ${ec.code}. Must be FE followed by numbers (e.g. FE4600)` });
        }
      }

      // Verify total quantities add up
      const totalPaid = eggCodes.reduce((sum, ec) => sum + ec.quantity, 0);
      const totalFree = eggCodes.reduce((sum, ec) => sum + (ec.freeQty || 0), 0);
      const computedTotal = totalPaid + totalFree;

      if (computedTotal !== actualQuantity) {
        return reply.code(400).send({
          error: `Egg code quantities (${totalPaid} paid + ${totalFree} free = ${computedTotal}) don't match actual quantity (${actualQuantity})`,
        });
      }

      const itemByCode = new Map();
      for (const eggCode of eggCodes) {
        const normalizedCode = normalizeItemCode(eggCode.code);
        if (!itemByCode.has(normalizedCode)) {
          const item = await ensureItemForEggCode({
            code: normalizedCode,
            wholesalePrice: existing.wholesalePrice,
            retailPrice: existing.retailPrice,
          });
          itemByCode.set(normalizedCode, item);
        }
      }

      const batch = await prisma.batch.update({
        where: { id: request.params.id },
        data: {
          status: 'RECEIVED',
          receivedDate: new Date(),
          actualQuantity,
          freeCrates: freeCrates ?? totalFree,
          eggCodes: {
            deleteMany: {}, // Clear any existing (shouldn't be any)
            createMany: {
              data: eggCodes.map(ec => ({
                itemId: itemByCode.get(normalizeItemCode(ec.code))?.id || null,
                code: normalizeItemCode(ec.code),
                costPrice: ec.costPrice,
                quantity: ec.quantity,
                freeQty: ec.freeQty || 0,
              })),
            },
          },
        },
        include: { eggCodes: true },
      });

      return reply.send({
        batch: {
          ...batch,
          wholesalePrice: Number(batch.wholesalePrice),
          retailPrice: Number(batch.retailPrice),
          costPrice: Number(batch.costPrice),
          eggCodes: batch.eggCodes.map(ec => ({
            ...ec,
            costPrice: Number(ec.costPrice),
          })),
        },
      });
    },
  });

  // ─── CLOSE BATCH ──────────────────────────────────────────────
  fastify.patch('/batches/:id/close', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const existing = await prisma.batch.findUnique({
        where: { id: request.params.id },
        include: { bookings: { where: { status: 'CONFIRMED' } } },
      });
      if (!existing) return reply.code(404).send({ error: 'Batch not found' });
      if (existing.status === 'CLOSED') {
        return reply.code(400).send({ error: 'Batch is already closed' });
      }

      // Warn about unfulfilled bookings (but allow close)
      const unfulfilledBookings = existing.bookings.length;

      const batch = await prisma.batch.update({
        where: { id: request.params.id },
        data: {
          status: 'CLOSED',
          closedDate: new Date(),
        },
      });

      return reply.send({
        batch: {
          ...batch,
          wholesalePrice: Number(batch.wholesalePrice),
          retailPrice: Number(batch.retailPrice),
          costPrice: Number(batch.costPrice),
        },
        warnings: unfulfilledBookings > 0
          ? [`${unfulfilledBookings} confirmed booking(s) are still unfulfilled`]
          : [],
      });
    },
  });

  // ─── BATCH ANALYSIS REPORT ────────────────────────────────────
  fastify.get('/batches/:id/analysis', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const policy = await getOperationsPolicy();
      const batch = await prisma.batch.findUnique({
        where: { id: request.params.id },
        include: {
          eggCodes: true,
          bookings: true,
        },
      });

      if (!batch) return reply.code(404).send({ error: 'Batch not found' });
      const batchSales = await findSalesForBatch(batch.id);

      // Calculate costs
      const totalCost = batch.eggCodes.reduce(
        (sum, ec) => sum + Number(ec.costPrice) * ec.quantity, 0
      );

      // Calculate sales by type
      const salesBreakdown = { WHOLESALE: 0, RETAIL: 0, CRACKED: 0, WRITE_OFF: 0 };
      const salesQuantity = { WHOLESALE: 0, RETAIL: 0, CRACKED: 0, WRITE_OFF: 0 };
      let totalRevenue = 0;
      let totalSaleCost = 0;
      let totalSold = 0;

      for (const sale of batchSales) {
        for (const item of sale.lineItems) {
          salesBreakdown[item.saleType] += Number(item.lineTotal);
          salesQuantity[item.saleType] += item.quantity;
          totalRevenue += Number(item.lineTotal);
          totalSaleCost += Number(item.costPrice) * item.quantity;
          totalSold += item.quantity;
        }
      }

      // Booking summary
      const totalBooked = batch.bookings
        .filter(b => b.status === 'CONFIRMED')
        .reduce((sum, b) => sum + b.quantity, 0);
      const totalBookingRevenue = batch.bookings
        .reduce((sum, b) => sum + Number(b.amountPaid), 0);

      // Inventory
      const totalReceived = batch.actualQuantity || 0;
      const remaining = totalReceived - totalSold;
      const totalWriteOffs = await prisma.inventoryCount.aggregate({
        where: { batchId: batch.id },
        _sum: { crackedWriteOff: true },
      });
      const totalDamagedWriteOff = totalWriteOffs._sum.crackedWriteOff || 0;
      const crackedSoldQuantity = salesQuantity.CRACKED || 0;
      const crackedSoldValue = salesBreakdown.CRACKED || 0;
      const totalCrackImpact = crackedSoldQuantity + totalDamagedWriteOff;
      const crackRatePercent = roundTo2(safeDivide(totalCrackImpact * 100, totalReceived));
      const crackAlert = buildCrackAlert(crackRatePercent, policy.crackAllowancePercent);
      const grossProfit = totalRevenue - totalSaleCost;
      const expectedPolicyProfit = totalReceived * policy.targetProfitPerCrate;
      const varianceToPolicy = grossProfit - expectedPolicyProfit;
      const profitPerCrate = roundTo2(safeDivide(grossProfit, totalReceived));

      return reply.send({
        batch: {
          id: batch.id,
          name: batch.name,
          status: batch.status,
          expectedDate: batch.expectedDate,
          receivedDate: batch.receivedDate,
          closedDate: batch.closedDate,
          expectedQuantity: batch.expectedQuantity,
          actualQuantity: batch.actualQuantity,
          freeCrates: batch.freeCrates,
        },
        costs: {
          eggCodes: batch.eggCodes.map(ec => ({
            code: ec.code,
            quantity: ec.quantity,
            freeQty: ec.freeQty,
            costPrice: Number(ec.costPrice),
            subtotal: Number(ec.costPrice) * ec.quantity,
          })),
          totalCost,
        },
        sales: {
          breakdown: salesBreakdown,
          quantities: salesQuantity,
          totalRevenue,
          totalCost: totalSaleCost,
          totalSold,
        },
        bookings: {
          totalBooked,
          totalBookingRevenue,
          count: batch.bookings.length,
        },
        inventory: {
          totalReceived,
          totalSold,
          remaining,
          bookedPortion: totalBooked,
          availableForSale: remaining - totalBooked,
        },
        cracks: {
          crackedSoldQuantity,
          crackedSoldValue,
          totalDamagedWriteOff,
          totalCrackImpact,
          crackRatePercent,
          crackAlert,
        },
        profit: {
          grossProfit,
          margin: totalRevenue > 0 ? Number((safeDivide(grossProfit * 100, totalRevenue)).toFixed(2)) : 0,
          profitPerCrate,
          expectedPolicyProfit,
          varianceToPolicy,
        },
        prices: {
          wholesalePrice: Number(batch.wholesalePrice),
          retailPrice: Number(batch.retailPrice),
          costPrice: Number(batch.costPrice),
        },
        policy: {
          targetProfitPerCrate: policy.targetProfitPerCrate,
          crackAllowancePercent: policy.crackAllowancePercent,
        },
      });
    },
  });
}
