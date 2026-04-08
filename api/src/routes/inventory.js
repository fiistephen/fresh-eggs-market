import prisma from '../plugins/prisma.js';
import { authenticate } from '../plugins/auth.js';
import { authorize } from '../middleware/authorize.js';
import {
  buildCrackAlert,
  roundTo2,
  safeDivide,
} from '../utils/operationsPolicy.js';
import { getOperationsPolicyHistory, resolveOperationsPolicyAt } from '../utils/appSettings.js';

// Helper: compute system count for a batch (received - sold - written off)
async function computeSystemCount(batchId) {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: { eggCodes: true },
  });
  if (!batch) return null;

  const totalReceived = batch.eggCodes.reduce((s, ec) => s + ec.quantity + ec.freeQty, 0);

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

  return { totalReceived, totalSold, totalWrittenOff, systemCount: totalReceived - totalSold - totalWrittenOff };
}

export default async function inventoryRoutes(fastify) {
  // ────────────────────────────────────────────────────────────
  // GET /inventory — dashboard with per-batch stock levels
  // ────────────────────────────────────────────────────────────
  fastify.get('/inventory', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const policyHistory = await getOperationsPolicyHistory();
      // Get all received (not closed) batches — these are the ones with active stock
      const batches = await prisma.batch.findMany({
        where: { status: 'RECEIVED' },
        include: {
          eggCodes: true,
          _count: { select: { bookings: { where: { status: 'CONFIRMED' } }, sales: true, inventory: true } },
        },
        orderBy: { receivedDate: 'desc' },
      });

      const inventory = [];
      for (const batch of batches) {
        const policy = resolveOperationsPolicyAt(policyHistory, batch.createdAt || batch.expectedDate);
        const totalReceived = batch.eggCodes.reduce((s, ec) => s + ec.quantity + ec.freeQty, 0);

        const soldAgg = await prisma.saleLineItem.aggregate({
          where: { batchEggCode: { batchId: batch.id } },
          _sum: { quantity: true },
        });
        const totalSold = soldAgg._sum.quantity || 0;

        const writeOffAgg = await prisma.inventoryCount.aggregate({
          where: { batchId: batch.id },
          _sum: { crackedWriteOff: true },
        });
        const totalWrittenOff = writeOffAgg._sum.crackedWriteOff || 0;

        const crackedSoldAgg = await prisma.saleLineItem.aggregate({
          where: {
            batchEggCode: { batchId: batch.id },
            saleType: 'CRACKED',
          },
          _sum: { quantity: true },
        });
        const crackedSoldQuantity = crackedSoldAgg._sum.quantity || 0;

        const bookedAgg = await prisma.booking.aggregate({
          where: { batchId: batch.id, status: 'CONFIRMED' },
          _sum: { quantity: true },
        });
        const totalBooked = bookedAgg._sum.quantity || 0;

        const onHand = totalReceived - totalSold - totalWrittenOff;
        const available = onHand - totalBooked;

        // Latest count for this batch
        const latestCount = await prisma.inventoryCount.findFirst({
          where: { batchId: batch.id },
          orderBy: { countDate: 'desc' },
          include: { enteredBy: { select: { firstName: true, lastName: true } } },
        });

        const crackRatePercent = roundTo2(safeDivide((totalWrittenOff + crackedSoldQuantity) * 100, totalReceived));
        const crackAlert = buildCrackAlert({
          ratePercent: crackRatePercent,
          crackQuantity: totalWrittenOff + crackedSoldQuantity,
          writeOffQuantity: totalWrittenOff,
          thresholdPercent: policy.crackAllowancePercent,
          crackedCratesAllowance: policy.crackedCratesAllowance,
          writeOffCratesAllowance: policy.writeOffCratesAllowance,
        });

        inventory.push({
          batch: {
            id: batch.id,
            name: batch.name,
            receivedDate: batch.receivedDate,
            eggCodes: batch.eggCodes.map(ec => ({
              id: ec.id,
              code: ec.code,
              costPrice: Number(ec.costPrice),
              quantity: ec.quantity,
              freeQty: ec.freeQty,
            })),
          },
          totalReceived,
          totalSold,
          totalWrittenOff,
          crackedSoldQuantity,
          crackRatePercent,
          crackAlert,
          policy,
          onHand,
          booked: totalBooked,
          available: Math.max(0, available),
          salesCount: batch._count.sales,
          countsRecorded: batch._count.inventory,
          latestCount: latestCount ? {
            id: latestCount.id,
            countDate: latestCount.countDate,
            physicalCount: latestCount.physicalCount,
            systemCount: latestCount.systemCount,
            discrepancy: latestCount.discrepancy,
            crackedWriteOff: latestCount.crackedWriteOff,
            enteredBy: `${latestCount.enteredBy.firstName} ${latestCount.enteredBy.lastName}`,
          } : null,
        });
      }

      // Also include CLOSED batches with remaining write-off history if desired
      const totals = inventory.reduce(
        (acc, i) => ({
          totalReceived: acc.totalReceived + i.totalReceived,
          totalSold: acc.totalSold + i.totalSold,
          totalWrittenOff: acc.totalWrittenOff + i.totalWrittenOff,
          crackedSoldQuantity: acc.crackedSoldQuantity + i.crackedSoldQuantity,
          onHand: acc.onHand + i.onHand,
          booked: acc.booked + i.booked,
          available: acc.available + i.available,
          alertCount: acc.alertCount + (i.crackAlert.level === 'ALERT' ? 1 : 0),
        }),
        { totalReceived: 0, totalSold: 0, totalWrittenOff: 0, crackedSoldQuantity: 0, onHand: 0, booked: 0, available: 0, alertCount: 0 }
      );

      return reply.send({
        inventory,
        totals,
        policy: {
          crackAllowancePercent: inventory[0]?.policy?.crackAllowancePercent ?? null,
        },
      });
    },
  });

  // ────────────────────────────────────────────────────────────
  // POST /inventory/count — record a daily physical count
  // ────────────────────────────────────────────────────────────
  fastify.post('/inventory/count', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'SHOP_FLOOR')],
    handler: async (request, reply) => {
      const { batchId, physicalCount, crackedWriteOff, notes, countDate } = request.body;

      // Validation
      if (!batchId) return reply.code(400).send({ error: 'batchId is required' });
      if (physicalCount === undefined || physicalCount === null) return reply.code(400).send({ error: 'physicalCount is required' });
      if (!Number.isInteger(physicalCount) || physicalCount < 0) return reply.code(400).send({ error: 'physicalCount must be a non-negative integer' });
      if (crackedWriteOff !== undefined && crackedWriteOff !== null) {
        if (!Number.isInteger(crackedWriteOff) || crackedWriteOff < 0) return reply.code(400).send({ error: 'crackedWriteOff must be a non-negative integer' });
      }

      // Verify batch exists and is RECEIVED
      const batch = await prisma.batch.findUnique({ where: { id: batchId } });
      if (!batch) return reply.code(404).send({ error: 'Batch not found' });
      if (batch.status !== 'RECEIVED') return reply.code(400).send({ error: 'Can only count inventory for RECEIVED batches' });

      // Compute system count automatically
      const computed = await computeSystemCount(batchId);
      const systemCount = computed.systemCount;
      const discrepancy = physicalCount - systemCount;

      const usedDate = countDate ? new Date(countDate) : new Date();

      const count = await prisma.inventoryCount.create({
        data: {
          batchId,
          countDate: usedDate,
          physicalCount,
          systemCount,
          discrepancy,
          crackedWriteOff: crackedWriteOff || 0,
          notes: notes || null,
          enteredById: request.user.sub,
        },
        include: {
          batch: { select: { name: true } },
          enteredBy: { select: { firstName: true, lastName: true } },
        },
      });

      return reply.code(201).send({
        count: {
          ...count,
          batch: count.batch,
          enteredBy: `${count.enteredBy.firstName} ${count.enteredBy.lastName}`,
        },
        computed: {
          totalReceived: computed.totalReceived,
          totalSold: computed.totalSold,
          totalWrittenOff: computed.totalWrittenOff,
          systemCount,
        },
      });
    },
  });

  // ────────────────────────────────────────────────────────────
  // GET /inventory/counts — count history with filters
  // ────────────────────────────────────────────────────────────
  fastify.get('/inventory/counts', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { batchId, dateFrom, dateTo, discrepanciesOnly } = request.query;

      const where = {};
      if (batchId) where.batchId = batchId;
      if (dateFrom || dateTo) {
        where.countDate = {};
        if (dateFrom) where.countDate.gte = new Date(dateFrom);
        if (dateTo) {
          const endDate = new Date(dateTo);
          endDate.setHours(23, 59, 59, 999);
          where.countDate.lte = endDate;
        }
      }
      if (discrepanciesOnly === 'true') {
        where.discrepancy = { not: 0 };
      }

      const counts = await prisma.inventoryCount.findMany({
        where,
        include: {
          batch: { select: { id: true, name: true } },
          enteredBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { countDate: 'desc' },
      });

      const enriched = counts.map(c => ({
        id: c.id,
        batchId: c.batchId,
        batchName: c.batch.name,
        countDate: c.countDate,
        physicalCount: c.physicalCount,
        systemCount: c.systemCount,
        discrepancy: c.discrepancy,
        crackedWriteOff: c.crackedWriteOff,
        notes: c.notes,
        enteredBy: `${c.enteredBy.firstName} ${c.enteredBy.lastName}`,
        createdAt: c.createdAt,
      }));

      // Summary
      const totalDiscrepancies = enriched.filter(c => c.discrepancy !== 0).length;
      const totalWriteOffs = enriched.reduce((s, c) => s + c.crackedWriteOff, 0);

      return reply.send({ counts: enriched, total: enriched.length, totalDiscrepancies, totalWriteOffs });
    },
  });

  // ────────────────────────────────────────────────────────────
  // GET /inventory/counts/:id — single count detail
  // ────────────────────────────────────────────────────────────
  fastify.get('/inventory/counts/:id', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const count = await prisma.inventoryCount.findUnique({
        where: { id: request.params.id },
        include: {
          batch: { select: { id: true, name: true, status: true } },
          enteredBy: { select: { firstName: true, lastName: true } },
        },
      });

      if (!count) return reply.code(404).send({ error: 'Inventory count not found' });

      return reply.send({
        count: {
          ...count,
          batchName: count.batch.name,
          enteredByName: `${count.enteredBy.firstName} ${count.enteredBy.lastName}`,
        },
      });
    },
  });

  // ────────────────────────────────────────────────────────────
  // GET /inventory/discrepancies — counts where physical ≠ system
  // ────────────────────────────────────────────────────────────
  fastify.get('/inventory/discrepancies', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { dateFrom, dateTo } = request.query;

      const where = { discrepancy: { not: 0 } };
      if (dateFrom || dateTo) {
        where.countDate = {};
        if (dateFrom) where.countDate.gte = new Date(dateFrom);
        if (dateTo) {
          const endDate = new Date(dateTo);
          endDate.setHours(23, 59, 59, 999);
          where.countDate.lte = endDate;
        }
      }

      const counts = await prisma.inventoryCount.findMany({
        where,
        include: {
          batch: { select: { id: true, name: true } },
          enteredBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { countDate: 'desc' },
      });

      const enriched = counts.map(c => ({
        id: c.id,
        batchId: c.batchId,
        batchName: c.batch.name,
        countDate: c.countDate,
        physicalCount: c.physicalCount,
        systemCount: c.systemCount,
        discrepancy: c.discrepancy,
        crackedWriteOff: c.crackedWriteOff,
        notes: c.notes,
        enteredBy: `${c.enteredBy.firstName} ${c.enteredBy.lastName}`,
      }));

      return reply.send({ discrepancies: enriched, count: enriched.length });
    },
  });

  // ────────────────────────────────────────────────────────────
  // GET /inventory/write-offs — all write-off records
  // ────────────────────────────────────────────────────────────
  fastify.get('/inventory/write-offs', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { dateFrom, dateTo } = request.query;

      const where = { crackedWriteOff: { gt: 0 } };
      if (dateFrom || dateTo) {
        where.countDate = {};
        if (dateFrom) where.countDate.gte = new Date(dateFrom);
        if (dateTo) {
          const endDate = new Date(dateTo);
          endDate.setHours(23, 59, 59, 999);
          where.countDate.lte = endDate;
        }
      }

      const counts = await prisma.inventoryCount.findMany({
        where,
        include: {
          batch: { select: { id: true, name: true, costPrice: true } },
          enteredBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { countDate: 'desc' },
      });

      const enriched = counts.map(c => ({
        id: c.id,
        batchId: c.batchId,
        batchName: c.batch.name,
        countDate: c.countDate,
        crackedWriteOff: c.crackedWriteOff,
        estimatedLoss: c.crackedWriteOff * Number(c.batch.costPrice),
        notes: c.notes,
        enteredBy: `${c.enteredBy.firstName} ${c.enteredBy.lastName}`,
      }));

      const totalWriteOffs = enriched.reduce((s, c) => s + c.crackedWriteOff, 0);
      const totalEstimatedLoss = enriched.reduce((s, c) => s + c.estimatedLoss, 0);

      return reply.send({
        writeOffs: enriched,
        count: enriched.length,
        totalWriteOffs,
        totalEstimatedLoss,
      });
    },
  });

  // ────────────────────────────────────────────────────────────
  // GET /inventory/batch/:batchId — detailed stock for one batch
  // ────────────────────────────────────────────────────────────
  fastify.get('/inventory/batch/:batchId', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { batchId } = request.params;

      const batch = await prisma.batch.findUnique({
        where: { id: batchId },
        include: { eggCodes: true },
      });
      if (!batch) return reply.code(404).send({ error: 'Batch not found' });

      const computed = await computeSystemCount(batchId);

      const bookedAgg = await prisma.booking.aggregate({
        where: { batchId, status: 'CONFIRMED' },
        _sum: { quantity: true },
      });
      const totalBooked = bookedAgg._sum.quantity || 0;

      // Per-egg-code breakdown
      const eggCodeBreakdown = [];
      for (const ec of batch.eggCodes) {
        const ecSold = await prisma.saleLineItem.aggregate({
          where: { batchEggCodeId: ec.id },
          _sum: { quantity: true },
        });
        eggCodeBreakdown.push({
          id: ec.id,
          code: ec.code,
          costPrice: Number(ec.costPrice),
          received: ec.quantity + ec.freeQty,
          sold: ecSold._sum.quantity || 0,
          remaining: (ec.quantity + ec.freeQty) - (ecSold._sum.quantity || 0),
        });
      }

      // Recent counts
      const recentCounts = await prisma.inventoryCount.findMany({
        where: { batchId },
        include: { enteredBy: { select: { firstName: true, lastName: true } } },
        orderBy: { countDate: 'desc' },
        take: 10,
      });

      return reply.send({
        batch: {
          id: batch.id,
          name: batch.name,
          status: batch.status,
          receivedDate: batch.receivedDate,
        },
        stock: {
          totalReceived: computed.totalReceived,
          totalSold: computed.totalSold,
          totalWrittenOff: computed.totalWrittenOff,
          onHand: computed.systemCount,
          booked: totalBooked,
          available: Math.max(0, computed.systemCount - totalBooked),
        },
        eggCodeBreakdown,
        recentCounts: recentCounts.map(c => ({
          id: c.id,
          countDate: c.countDate,
          physicalCount: c.physicalCount,
          systemCount: c.systemCount,
          discrepancy: c.discrepancy,
          crackedWriteOff: c.crackedWriteOff,
          notes: c.notes,
          enteredBy: `${c.enteredBy.firstName} ${c.enteredBy.lastName}`,
        })),
      });
    },
  });
}
