import prisma from '../plugins/prisma.js';
import { authenticate } from '../plugins/auth.js';
import { authorize } from '../middleware/authorize.js';

function toNumber(value) {
  return value == null ? 0 : Number(value);
}

function buildBalanceMap(grouped = []) {
  return new Map(grouped.map((entry) => [entry.farmerId, Number(entry._sum.balanceEffect || 0)]));
}

function enrichLedgerEntry(entry) {
  if (!entry) return null;
  return {
    ...entry,
    amount: Number(entry.amount),
    balanceEffect: Number(entry.balanceEffect),
  };
}

function buildFarmerSummary(farmer, currentBalance = 0) {
  return {
    ...farmer,
    currentBalance: Number(currentBalance || 0),
  };
}

export default async function farmerRoutes(fastify) {
  fastify.get('/farmers', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const { search, limit = 50, offset = 0 } = request.query;
      const where = search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
            ],
          }
        : {};

      const parsedLimit = Math.min(200, Math.max(1, Number(limit) || 50));
      const parsedOffset = Math.max(0, Number(offset) || 0);

      const [farmers, total, balances] = await Promise.all([
        prisma.farmer.findMany({
          where,
          include: {
            _count: { select: { batches: true, ledgerEntries: true } },
          },
          orderBy: [{ name: 'asc' }],
          take: parsedLimit,
          skip: parsedOffset,
        }),
        prisma.farmer.count({ where }),
        prisma.farmerLedgerEntry.groupBy({
          by: ['farmerId'],
          where: where,
          _sum: { balanceEffect: true },
        }),
      ]);

      const balanceMap = buildBalanceMap(balances);
      return reply.send({
        farmers: farmers.map((farmer) => buildFarmerSummary(farmer, balanceMap.get(farmer.id) || 0)),
        total,
      });
    },
  });

  fastify.get('/farmers/:id', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const farmer = await prisma.farmer.findUnique({
        where: { id: request.params.id },
        include: {
          batches: {
            orderBy: [{ expectedDate: 'desc' }],
            take: 20,
            select: {
              id: true,
              name: true,
              status: true,
              expectedDate: true,
              receivedDate: true,
              closedDate: true,
              expectedQuantity: true,
              actualQuantity: true,
              wholesalePrice: true,
              retailPrice: true,
              costPrice: true,
              eggTypeKey: true,
            },
          },
          ledgerEntries: {
            include: {
              batch: { select: { id: true, name: true, status: true } },
              bankTransaction: {
                select: {
                  id: true,
                  category: true,
                  description: true,
                  reference: true,
                  transactionDate: true,
                  amount: true,
                  bankAccount: { select: { id: true, name: true, accountType: true, lastFour: true } },
                },
              },
              createdBy: { select: { firstName: true, lastName: true } },
            },
            orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
            take: 50,
          },
          _count: { select: { batches: true, ledgerEntries: true } },
        },
      });

      if (!farmer) return reply.code(404).send({ error: 'Farmer not found' });

      const [balanceAggregate, positiveAggregate, drawdownAggregate] = await Promise.all([
        prisma.farmerLedgerEntry.aggregate({
          where: { farmerId: farmer.id },
          _sum: { balanceEffect: true },
        }),
        prisma.farmerLedgerEntry.aggregate({
          where: { farmerId: farmer.id, balanceEffect: { gt: 0 } },
          _sum: { balanceEffect: true },
        }),
        prisma.farmerLedgerEntry.aggregate({
          where: { farmerId: farmer.id, balanceEffect: { lt: 0 } },
          _sum: { balanceEffect: true },
        }),
      ]);

      return reply.send({
        farmer: buildFarmerSummary(farmer, balanceAggregate._sum.balanceEffect || 0),
        summary: {
          currentBalance: toNumber(balanceAggregate._sum.balanceEffect),
          totalPrepayments: toNumber(positiveAggregate._sum.balanceEffect),
          totalDrawdowns: Math.abs(toNumber(drawdownAggregate._sum.balanceEffect)),
        },
        ledgerEntries: farmer.ledgerEntries.map(enrichLedgerEntry),
      });
    },
  });

  fastify.post('/farmers', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const { name, phone, notes } = request.body;
      if (!name || !String(name).trim()) {
        return reply.code(400).send({ error: 'Farmer name is required' });
      }

      const farmer = await prisma.farmer.create({
        data: {
          name: String(name).trim(),
          phone: String(phone || '').trim() || null,
          notes: String(notes || '').trim() || null,
        },
      });

      return reply.code(201).send({ farmer: buildFarmerSummary(farmer, 0) });
    },
  });

  fastify.post('/farmers/:id/ledger-entries', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const farmer = await prisma.farmer.findUnique({ where: { id: request.params.id } });
      if (!farmer) return reply.code(404).send({ error: 'Farmer not found' });

      const entryType = String(request.body.entryType || '').trim().toUpperCase();
      const amount = Number(request.body.amount);
      const entryDate = request.body.entryDate ? new Date(request.body.entryDate) : new Date();
      const notes = String(request.body.notes || '').trim() || null;
      const adjustmentDirection = String(request.body.adjustmentDirection || '').trim().toUpperCase();

      if (entryType !== 'ADJUSTMENT') {
        return reply.code(400).send({ error: 'Farmer payments should be recorded from Banking. Only adjustments can be entered manually here.' });
      }
      if (!amount || amount <= 0) {
        return reply.code(400).send({ error: 'Amount must be positive' });
      }
      if (Number.isNaN(entryDate.getTime())) {
        return reply.code(400).send({ error: 'Entry date is invalid' });
      }

      let balanceEffect = amount;
      if (!['INCREASE', 'DECREASE'].includes(adjustmentDirection)) {
        return reply.code(400).send({ error: 'Choose whether the adjustment increases or decreases the farmer balance.' });
      }
      balanceEffect = adjustmentDirection === 'DECREASE' ? -amount : amount;

      const entry = await prisma.farmerLedgerEntry.create({
        data: {
          farmerId: farmer.id,
          createdById: request.user.sub,
          entryType,
          amount,
          balanceEffect,
          entryDate,
          notes,
        },
        include: {
          batch: { select: { id: true, name: true, status: true } },
          createdBy: { select: { firstName: true, lastName: true } },
        },
      });

      return reply.code(201).send({ entry: enrichLedgerEntry(entry) });
    },
  });
}
