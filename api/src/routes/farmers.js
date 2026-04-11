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

function buildFarmerStatus(currentBalance) {
  const balance = Number(currentBalance || 0);
  if (balance < -0.009) return 'OVERDRAWN';
  if (balance > 0.009) return 'BALANCE_WITH_FARMER';
  return 'SETTLED';
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
            batches: {
              orderBy: [{ receivedDate: 'desc' }, { expectedDate: 'desc' }],
              take: 1,
              select: {
                id: true,
                name: true,
                status: true,
                expectedDate: true,
                receivedDate: true,
              },
            },
            ledgerEntries: {
              where: {
                bankTransactionId: { not: null },
                balanceEffect: { gt: 0 },
              },
              orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
              take: 1,
              select: {
                id: true,
                amount: true,
                entryDate: true,
                bankTransaction: {
                  select: {
                    id: true,
                    bankAccount: { select: { id: true, name: true, accountType: true, lastFour: true } },
                  },
                },
              },
            },
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
        farmers: farmers.map((farmer) => {
          const currentBalance = balanceMap.get(farmer.id) || 0;
          return {
            ...buildFarmerSummary(farmer, currentBalance),
            status: buildFarmerStatus(currentBalance),
            latestBatch: farmer.batches?.[0] || null,
            latestPayment: farmer.ledgerEntries?.[0]
              ? {
                  id: farmer.ledgerEntries[0].id,
                  amount: Number(farmer.ledgerEntries[0].amount),
                  entryDate: farmer.ledgerEntries[0].entryDate,
                  bankAccount: farmer.ledgerEntries[0].bankTransaction?.bankAccount || null,
                }
              : null,
          };
        }),
        total,
      });
    },
  });

  fastify.get('/farmers/:id', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
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

      const [balanceAggregate, positiveAggregate, drawdownAggregate, lastPaymentEntry, lastDrawdownEntry] = await Promise.all([
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
        prisma.farmerLedgerEntry.findFirst({
          where: {
            farmerId: farmer.id,
            bankTransactionId: { not: null },
            balanceEffect: { gt: 0 },
          },
          include: {
            bankTransaction: {
              select: {
                id: true,
                bankAccount: { select: { id: true, name: true, accountType: true, lastFour: true } },
                description: true,
                reference: true,
              },
            },
          },
          orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
        }),
        prisma.farmerLedgerEntry.findFirst({
          where: {
            farmerId: farmer.id,
            entryType: 'RECEIPT_DRAWDOWN',
          },
          include: {
            batch: { select: { id: true, name: true, status: true, receivedDate: true, expectedDate: true } },
          },
          orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
        }),
      ]);

      const currentBalance = toNumber(balanceAggregate._sum.balanceEffect);
      return reply.send({
        farmer: {
          ...buildFarmerSummary(farmer, currentBalance || 0),
          status: buildFarmerStatus(currentBalance),
        },
        summary: {
          currentBalance,
          totalPrepayments: toNumber(positiveAggregate._sum.balanceEffect),
          totalDrawdowns: Math.abs(toNumber(drawdownAggregate._sum.balanceEffect)),
          lastPayment: lastPaymentEntry
            ? {
                id: lastPaymentEntry.id,
                amount: Number(lastPaymentEntry.amount),
                entryDate: lastPaymentEntry.entryDate,
                bankAccount: lastPaymentEntry.bankTransaction?.bankAccount || null,
                description: lastPaymentEntry.bankTransaction?.description || null,
                reference: lastPaymentEntry.bankTransaction?.reference || null,
              }
            : null,
          lastDrawdown: lastDrawdownEntry
            ? {
                id: lastDrawdownEntry.id,
                amount: Number(lastDrawdownEntry.amount),
                entryDate: lastDrawdownEntry.entryDate,
                batch: lastDrawdownEntry.batch || null,
              }
            : null,
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
