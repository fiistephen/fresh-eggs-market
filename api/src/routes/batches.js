import prisma from '../plugins/prisma.js';
import { authenticate } from '../plugins/auth.js';
import { authorize } from '../middleware/authorize.js';
import {
  buildCrackAlert,
  roundTo2,
  safeDivide,
} from '../utils/operationsPolicy.js';
import {
  findCustomerEggTypeByKey,
  getCustomerEggTypeConfig,
  getOperationsPolicy,
  getOperationsPolicyHistory,
  resolveOperationsPolicyAt,
} from '../utils/appSettings.js';
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

function toNumber(value) {
  return value == null ? 0 : Number(value);
}

function mapEggTypeMeta(eggTypes, eggTypeKey) {
  const selected = findCustomerEggTypeByKey(eggTypes, eggTypeKey);
  const fallback = eggTypes.find((entry) => entry.key === 'REGULAR') || eggTypes[0] || null;
  const resolved = selected || fallback;

  return {
    eggTypeKey: resolved?.key || 'REGULAR',
    eggTypeLabel: resolved?.label || 'Regular Size Eggs',
    eggTypeShortLabel: resolved?.shortLabel || 'Regular',
  };
}

async function buildBatchOverview(batch, policy, options = {}) {
  const batchSales = options.batchSales || await findSalesForBatch(batch.id);
  const totalReceived = batch.actualQuantity ?? batch.eggCodes.reduce((sum, eggCode) => (
    sum + eggCode.quantity + (eggCode.freeQty || 0)
  ), 0);

  let totalRevenue = 0;
  let totalSaleCost = 0;
  let totalSold = 0;
  let crackedSoldQuantity = 0;

  for (const sale of batchSales) {
    for (const lineItem of sale.lineItems) {
      const quantity = lineItem.quantity || 0;
      const unitCost = toNumber(lineItem.costPrice);
      const lineRevenue = toNumber(lineItem.lineTotal);
      totalSold += quantity;
      totalRevenue += lineRevenue;
      totalSaleCost += unitCost * quantity;
      if (lineItem.saleType === 'CRACKED') {
        crackedSoldQuantity += quantity;
      }
    }
  }

  const totalWrittenOff = (await prisma.inventoryCount.aggregate({
    where: { batchId: batch.id },
    _sum: { crackedWriteOff: true },
  }))._sum.crackedWriteOff || 0;

  const latestCount = await prisma.inventoryCount.findFirst({
    where: { batchId: batch.id },
    orderBy: [{ countDate: 'desc' }, { createdAt: 'desc' }],
    include: {
      enteredBy: {
        select: { firstName: true, lastName: true },
      },
    },
  });

  const bookings = batch.bookings || [];
  const confirmedBookings = bookings.filter((booking) => booking.status === 'CONFIRMED');
  const pickedUpBookings = bookings.filter((booking) => booking.status === 'PICKED_UP');
  const totalBooked = confirmedBookings.reduce((sum, booking) => sum + booking.quantity, 0);
  const onHand = Math.max(0, totalReceived - totalSold - totalWrittenOff);
  const availableForSale = Math.max(0, onHand - totalBooked);
  const crackRatePercent = roundTo2(safeDivide((totalWrittenOff + crackedSoldQuantity) * 100, totalReceived));
  const crackAlert = buildCrackAlert({
    ratePercent: crackRatePercent,
    crackQuantity: totalWrittenOff + crackedSoldQuantity,
    writeOffQuantity: totalWrittenOff,
    thresholdPercent: policy.crackAllowancePercent,
    crackedCratesAllowance: policy.crackedCratesAllowance,
    writeOffCratesAllowance: policy.writeOffCratesAllowance,
  });
  const grossProfit = totalRevenue - totalSaleCost;
  const expectedPolicyProfit = totalReceived * policy.targetProfitPerCrate;
  const varianceToPolicy = grossProfit - expectedPolicyProfit;
  const profitPerCrate = roundTo2(safeDivide(grossProfit, totalReceived));
  const totalPaidQuantity = batch.eggCodes.reduce((sum, eggCode) => sum + eggCode.quantity, 0);
  const totalFreeQuantity = batch.eggCodes.reduce((sum, eggCode) => sum + (eggCode.freeQty || 0), 0);
  const remainingToReceive = Math.max(0, batch.expectedQuantity - totalReceived);
  const bookingUtilizationPercent = roundTo2(safeDivide(totalBooked * 100, Math.max(batch.availableForBooking || 0, 1)));
  const receivedVsExpectedPercent = roundTo2(safeDivide(totalReceived * 100, Math.max(batch.expectedQuantity || 0, 1)));

  return {
    totalReceived,
    totalPaidQuantity,
    totalFreeQuantity,
    totalSold,
    totalBooked,
    totalWrittenOff,
    crackedSoldQuantity,
    onHand,
    availableForSale,
    crackRatePercent,
    crackAlert,
    grossProfit,
    totalRevenue,
    totalSaleCost,
    expectedPolicyProfit,
    varianceToPolicy,
    profitPerCrate,
    confirmedBookingCount: confirmedBookings.length,
    pickedUpBookingCount: pickedUpBookings.length,
    bookingUtilizationPercent,
    receivedVsExpectedPercent,
    remainingToReceive,
    latestCount: latestCount ? {
      id: latestCount.id,
      countDate: latestCount.countDate,
      physicalCount: latestCount.physicalCount,
      systemCount: latestCount.systemCount,
      discrepancy: latestCount.discrepancy,
      crackedWriteOff: latestCount.crackedWriteOff,
      enteredBy: `${latestCount.enteredBy.firstName} ${latestCount.enteredBy.lastName}`,
    } : null,
    needsAttention: crackAlert.level === 'ALERT'
      || availableForSale < 0
      || (batch.status === 'OPEN' && remainingToReceive > 0)
      || (batch.status !== 'OPEN' && varianceToPolicy < 0),
  };
}

function mapBatchEggCodeForJson(eggCode, fallbackBatch = null) {
  return {
    ...eggCode,
    costPrice: Number(eggCode.costPrice),
    wholesalePrice: eggCode.wholesalePrice != null
      ? Number(eggCode.wholesalePrice)
      : fallbackBatch?.wholesalePrice != null
        ? Number(fallbackBatch.wholesalePrice)
        : null,
    retailPrice: eggCode.retailPrice != null
      ? Number(eggCode.retailPrice)
      : fallbackBatch?.retailPrice != null
        ? Number(fallbackBatch.retailPrice)
        : null,
  };
}

export default async function batchRoutes(fastify) {
  fastify.get('/batches/meta', {
    preHandler: [authenticate],
    handler: async () => {
      const eggTypes = await getCustomerEggTypeConfig();
      return {
        customerEggTypes: eggTypes,
        activeCustomerEggTypes: eggTypes.filter((entry) => entry.isActive),
      };
    },
  });

  // ─── LIST BATCHES ─────────────────────────────────────────────
  fastify.get('/batches', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { status, search } = request.query;
      const [policyHistory, eggTypes] = await Promise.all([
        getOperationsPolicyHistory(),
        getCustomerEggTypeConfig(),
      ]);
      const where = {};
      if (status) where.status = status;
      if (search) where.name = { contains: search, mode: 'insensitive' };

      const batches = await prisma.batch.findMany({
        where,
        include: {
          eggCodes: {
            include: {
              item: {
                select: {
                  id: true,
                  name: true,
                  category: true,
                },
              },
            },
          },
          bookings: {
            select: {
              id: true,
              quantity: true,
              status: true,
            },
          },
          _count: { select: { bookings: true, sales: true, inventory: true } },
        },
        orderBy: { expectedDate: 'desc' },
      });

      const enriched = await Promise.all(batches.map(async (batch) => {
        const batchPolicy = resolveOperationsPolicyAt(policyHistory, batch.createdAt || batch.expectedDate);
        const overview = await buildBatchOverview(batch, batchPolicy);
        const eggType = mapEggTypeMeta(eggTypes, batch.eggTypeKey);
        return {
          ...batch,
          overview,
          policy: batchPolicy,
          ...eggType,
          wholesalePrice: Number(batch.wholesalePrice),
          retailPrice: Number(batch.retailPrice),
          costPrice: Number(batch.costPrice),
          eggCodes: batch.eggCodes.map((ec) => mapBatchEggCodeForJson(ec, batch)),
          bookings: batch.bookings,
        };
      }));

      return reply.send({ batches: enriched });
    },
  });

  // ─── GET SINGLE BATCH ─────────────────────────────────────────
  fastify.get('/batches/:id', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const [policyHistory, eggTypes] = await Promise.all([
        getOperationsPolicyHistory(),
        getCustomerEggTypeConfig(),
      ]);
      const batch = await prisma.batch.findUnique({
        where: { id: request.params.id },
        include: {
          eggCodes: {
            include: {
              item: {
                select: {
                  id: true,
                  name: true,
                  category: true,
                },
              },
            },
          },
          bookings: { include: { customer: true } },
          _count: { select: { bookings: true, sales: true } },
        },
      });

      if (!batch) return reply.code(404).send({ error: 'Batch not found' });
      const policy = resolveOperationsPolicyAt(policyHistory, batch.createdAt || batch.expectedDate);
      const batchSales = await findSalesForBatch(batch.id);
      const overview = await buildBatchOverview(batch, policy, { batchSales });

      // Convert Decimals to numbers for JSON
      const result = {
        ...batch,
        overview,
        ...mapEggTypeMeta(eggTypes, batch.eggTypeKey),
        wholesalePrice: Number(batch.wholesalePrice),
        retailPrice: Number(batch.retailPrice),
        costPrice: Number(batch.costPrice),
        eggCodes: batch.eggCodes.map((ec) => mapBatchEggCodeForJson(ec, batch)),
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
      const {
        expectedDate,
        expectedQuantity,
        availableForBooking,
        eggTypeKey,
        wholesalePrice,
        retailPrice,
      } = request.body;
      const eggTypes = await getCustomerEggTypeConfig();
      const activeEggType = findCustomerEggTypeByKey(
        eggTypes.filter((entry) => entry.isActive),
        eggTypeKey || 'REGULAR',
      );

      if (!expectedDate) return reply.code(400).send({ error: 'Expected date is required' });
      if (!expectedQuantity || expectedQuantity <= 0) return reply.code(400).send({ error: 'Expected quantity must be positive' });
      if (!activeEggType) return reply.code(400).send({ error: 'Choose an active egg type for this batch' });
      if (!wholesalePrice || Number(wholesalePrice) <= 0) return reply.code(400).send({ error: 'Wholesale price is required' });
      if (!retailPrice || Number(retailPrice) <= 0) return reply.code(400).send({ error: 'Retail price is required' });

      const bookingQty = availableForBooking ?? expectedQuantity;
      if (bookingQty > expectedQuantity) {
        return reply.code(400).send({ error: 'Available for booking cannot exceed expected quantity' });
      }

      const date = new Date(expectedDate);
      const day = date.getUTCDate();
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      const month = months[date.getUTCMonth()];
      const year = date.getUTCFullYear();
      const baseName = `${day}${month}${year}`;

      const existing = await prisma.batch.findMany({
        where: { name: { startsWith: baseName } },
      });

      let name;
      if (existing.length === 0) {
        name = baseName;
      } else {
        if (existing.length === 1 && existing[0].name === baseName) {
          await prisma.batch.update({
            where: { id: existing[0].id },
            data: { name: `${baseName}A` },
          });
          name = `${baseName}B`;
        } else {
          const letters = existing.map((b) => b.name.replace(baseName, '')).filter(Boolean).sort();
          const nextLetter = String.fromCharCode(
            (letters.length > 0 ? letters[letters.length - 1].charCodeAt(0) : 64) + 1,
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
          eggTypeKey: activeEggType.key,
          wholesalePrice: Number(wholesalePrice),
          retailPrice: Number(retailPrice),
          costPrice: 0,
        },
      });

      return reply.code(201).send({
        batch: {
          ...batch,
          ...mapEggTypeMeta(eggTypes, batch.eggTypeKey),
          wholesalePrice: Number(batch.wholesalePrice),
          retailPrice: Number(batch.retailPrice),
          costPrice: Number(batch.costPrice),
          eggCodes: [],
        },
      });
    },
  });
  // ─── UPDATE BATCH (only OPEN batches) ──────────────────────────
  fastify.patch('/batches/:id', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const existing = await prisma.batch.findUnique({
        where: { id: request.params.id },
        include: { eggCodes: true },
      });
      if (!existing) return reply.code(404).send({ error: 'Batch not found' });
      if (existing.status !== 'OPEN') {
        return reply.code(400).send({ error: 'Can only edit batches that are OPEN' });
      }

      const { expectedDate, expectedQuantity, availableForBooking, eggTypeKey, wholesalePrice, retailPrice, costPrice } = request.body;
      const eggTypes = await getCustomerEggTypeConfig();
      const data = {};
      if (expectedDate !== undefined) data.expectedDate = new Date(expectedDate);
      if (expectedQuantity !== undefined) data.expectedQuantity = expectedQuantity;
      if (availableForBooking !== undefined) data.availableForBooking = availableForBooking;
      if (eggTypeKey !== undefined) {
        const allowedEggType = findCustomerEggTypeByKey(
          eggTypes.filter((entry) => entry.isActive || entry.key === existing.eggTypeKey),
          eggTypeKey,
        );
        if (!allowedEggType) {
          return reply.code(400).send({ error: 'Choose an active egg type for this batch' });
        }
        data.eggTypeKey = allowedEggType.key;
      }
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
          ...mapEggTypeMeta(eggTypes, batch.eggTypeKey),
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
      const { actualQuantity, freeCrates, wholesalePrice, retailPrice, eggCodes } = request.body;

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
      if (!wholesalePrice || Number(wholesalePrice) <= 0) {
        return reply.code(400).send({ error: 'Wholesale price for this batch is required' });
      }
      if (!retailPrice || Number(retailPrice) <= 0) {
        return reply.code(400).send({ error: 'Retail price for this batch is required' });
      }

      // Validate egg codes
      const seenCodes = new Set();
      for (const ec of eggCodes) {
        if (!ec.code || !ec.costPrice || !ec.quantity) {
          return reply.code(400).send({ error: 'Each egg code needs code, cost price, and quantity' });
        }
        const normalizedCode = normalizeItemCode(ec.code);
        if (!/^FE\d+$/.test(normalizedCode)) {
          return reply.code(400).send({ error: `Invalid egg code format: ${ec.code}. Use FE followed by numbers, for example FE4600.` });
        }
        if (seenCodes.has(normalizedCode)) {
          return reply.code(400).send({ error: `You entered ${normalizedCode} more than once. Use one row per FE code.` });
        }
        seenCodes.add(normalizedCode);
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
            wholesalePrice: Number(wholesalePrice),
            retailPrice: Number(retailPrice),
          });
          if (
            Number(item.defaultWholesalePrice ?? 0) !== Number(wholesalePrice)
            || Number(item.defaultRetailPrice ?? 0) !== Number(retailPrice)
          ) {
            itemByCode.set(normalizedCode, await prisma.item.update({
              where: { id: item.id },
              data: {
                defaultWholesalePrice: Number(wholesalePrice),
                defaultRetailPrice: Number(retailPrice),
              },
            }));
            continue;
          }
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
          wholesalePrice: Number(wholesalePrice),
          retailPrice: Number(retailPrice),
          costPrice: Number(eggCodes[0].costPrice),
          eggCodes: {
            deleteMany: {}, // Clear any existing (shouldn't be any)
            createMany: {
              data: eggCodes.map(ec => ({
                itemId: itemByCode.get(normalizeItemCode(ec.code))?.id || null,
                code: normalizeItemCode(ec.code),
                costPrice: ec.costPrice,
                wholesalePrice: Number(wholesalePrice),
                retailPrice: Number(retailPrice),
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
          eggCodes: batch.eggCodes.map((ec) => mapBatchEggCodeForJson(ec, batch)),
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
      const batch = await prisma.batch.findUnique({
        where: { id: request.params.id },
        include: {
          eggCodes: true,
          bookings: true,
        },
      });

      if (!batch) return reply.code(404).send({ error: 'Batch not found' });
      const policy = await getOperationsPolicy(batch.createdAt || batch.expectedDate);
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
      const crackAlert = buildCrackAlert({
        ratePercent: crackRatePercent,
        crackQuantity: totalCrackImpact,
        writeOffQuantity: totalDamagedWriteOff,
        thresholdPercent: policy.crackAllowancePercent,
        crackedCratesAllowance: policy.crackedCratesAllowance,
        writeOffCratesAllowance: policy.writeOffCratesAllowance,
      });
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
          crackedCratesAllowance: policy.crackedCratesAllowance,
          writeOffCratesAllowance: policy.writeOffCratesAllowance,
          effectiveFrom: policy.effectiveFrom,
        },
      });
    },
  });
}
