import prisma from '../plugins/prisma.js';
import { authenticate } from '../plugins/auth.js';
import { authorize } from '../middleware/authorize.js';

// Convert Prisma Decimals to Numbers
function enrichTransaction(t) {
  return {
    ...t,
    amount: Number(t.amount),
  };
}

const VALID_DIRECTIONS = ['INFLOW', 'OUTFLOW'];
const VALID_CATEGORIES = [
  'CUSTOMER_DEPOSIT', 'CUSTOMER_BOOKING', 'SALES_TRANSFER_IN', 'PROFIT_TRANSFER_IN', 'POS_SETTLEMENT',
  'REFUND', 'BANK_CHARGES', 'SALES_TRANSFER_OUT', 'PROFIT_TRANSFER_OUT',
  'FARMER_PAYMENT', 'SALARY', 'DIESEL_FUEL', 'INTERNET', 'MARKETING', 'OTHER_EXPENSE',
];

const INFLOW_CATEGORIES = ['CUSTOMER_DEPOSIT', 'CUSTOMER_BOOKING', 'SALES_TRANSFER_IN', 'PROFIT_TRANSFER_IN', 'POS_SETTLEMENT'];
const OUTFLOW_CATEGORIES = ['REFUND', 'BANK_CHARGES', 'SALES_TRANSFER_OUT', 'PROFIT_TRANSFER_OUT', 'FARMER_PAYMENT', 'SALARY', 'DIESEL_FUEL', 'INTERNET', 'MARKETING', 'OTHER_EXPENSE'];

export default async function bankingRoutes(fastify) {

  // ─── LIST BANK ACCOUNTS ───────────────────────────────────────
  fastify.get('/banking/accounts', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const accounts = await prisma.bankAccount.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      });
      return reply.send({ accounts });
    },
  });

  // ─── LIST TRANSACTIONS ────────────────────────────────────────
  fastify.get('/banking/transactions', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const { bankAccountId, category, direction, dateFrom, dateTo, customerId, limit = 50, offset = 0 } = request.query;

      const where = {};
      if (bankAccountId) where.bankAccountId = bankAccountId;
      if (category) where.category = category;
      if (direction) where.direction = direction;
      if (customerId) where.customerId = customerId;
      if (dateFrom || dateTo) {
        where.transactionDate = {};
        if (dateFrom) where.transactionDate.gte = new Date(dateFrom);
        if (dateTo) {
          const end = new Date(dateTo);
          end.setDate(end.getDate() + 1);
          where.transactionDate.lt = end;
        }
      }

      const [transactions, total] = await Promise.all([
        prisma.bankTransaction.findMany({
          where,
          include: {
            bankAccount: { select: { id: true, name: true, accountType: true, lastFour: true } },
            customer: { select: { id: true, name: true, phone: true } },
            enteredBy: { select: { firstName: true, lastName: true } },
          },
          orderBy: { transactionDate: 'desc' },
          take: parseInt(limit),
          skip: parseInt(offset),
        }),
        prisma.bankTransaction.count({ where }),
      ]);

      return reply.send({ transactions: transactions.map(enrichTransaction), total });
    },
  });

  // ─── GET SINGLE TRANSACTION ───────────────────────────────────
  fastify.get('/banking/transactions/:id', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const txn = await prisma.bankTransaction.findUnique({
        where: { id: request.params.id },
        include: {
          bankAccount: true,
          customer: true,
          enteredBy: { select: { firstName: true, lastName: true } },
        },
      });
      if (!txn) return reply.code(404).send({ error: 'Transaction not found' });
      return reply.send({ transaction: enrichTransaction(txn) });
    },
  });

  // ─── RECORD TRANSACTION ───────────────────────────────────────
  fastify.post('/banking/transactions', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const { bankAccountId, direction, category, amount, description, reference, transactionDate, customerId } = request.body;

      // Validation
      if (!bankAccountId) return reply.code(400).send({ error: 'Bank account is required' });
      if (!direction || !VALID_DIRECTIONS.includes(direction)) {
        return reply.code(400).send({ error: `Direction must be INFLOW or OUTFLOW` });
      }
      if (!category || !VALID_CATEGORIES.includes(category)) {
        return reply.code(400).send({ error: `Invalid category. Valid: ${VALID_CATEGORIES.join(', ')}` });
      }
      if (!amount || Number(amount) <= 0) {
        return reply.code(400).send({ error: 'Amount must be positive' });
      }
      if (!transactionDate) {
        return reply.code(400).send({ error: 'Transaction date is required' });
      }

      // Validate direction matches category
      if (direction === 'INFLOW' && !INFLOW_CATEGORIES.includes(category)) {
        return reply.code(400).send({ error: `Category ${category} cannot be an inflow` });
      }
      if (direction === 'OUTFLOW' && !OUTFLOW_CATEGORIES.includes(category)) {
        return reply.code(400).send({ error: `Category ${category} cannot be an outflow` });
      }

      // Validate bank account exists
      const account = await prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
      if (!account) return reply.code(404).send({ error: 'Bank account not found' });

      // Validate customer if provided
      if (customerId) {
        const customer = await prisma.customer.findUnique({ where: { id: customerId } });
        if (!customer) return reply.code(404).send({ error: 'Customer not found' });
      }

      const transaction = await prisma.bankTransaction.create({
        data: {
          bankAccountId,
          direction,
          category,
          amount: Number(amount),
          description: description || null,
          reference: reference || null,
          transactionDate: new Date(transactionDate),
          customerId: customerId || null,
          enteredById: request.user.sub,
        },
        include: {
          bankAccount: { select: { id: true, name: true, accountType: true } },
          customer: { select: { id: true, name: true } },
          enteredBy: { select: { firstName: true, lastName: true } },
        },
      });

      return reply.code(201).send({ transaction: enrichTransaction(transaction) });
    },
  });

  // ─── BANK RECONCILIATION ──────────────────────────────────────
  fastify.get('/banking/reconciliation', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const accounts = await prisma.bankAccount.findMany({ where: { isActive: true } });

      const reconciliation = [];
      for (const account of accounts) {
        const [inflows, outflows, txnCount] = await Promise.all([
          prisma.bankTransaction.aggregate({
            where: { bankAccountId: account.id, direction: 'INFLOW' },
            _sum: { amount: true },
          }),
          prisma.bankTransaction.aggregate({
            where: { bankAccountId: account.id, direction: 'OUTFLOW' },
            _sum: { amount: true },
          }),
          prisma.bankTransaction.count({ where: { bankAccountId: account.id } }),
        ]);

        reconciliation.push({
          id: account.id,
          account: account.name,
          accountType: account.accountType,
          lastFour: account.lastFour,
          totalInflows: Number(inflows._sum.amount || 0),
          totalOutflows: Number(outflows._sum.amount || 0),
          systemBalance: Number(inflows._sum.amount || 0) - Number(outflows._sum.amount || 0),
          transactionCount: txnCount,
        });
      }

      return reply.send({ reconciliation });
    },
  });

  // ─── UNBOOKED DEPOSITS REPORT ─────────────────────────────────
  fastify.get('/banking/unbooked-deposits', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const deposits = await prisma.bankTransaction.findMany({
        where: { category: 'CUSTOMER_DEPOSIT' },
        include: {
          customer: { select: { name: true, phone: true } },
          bankAccount: { select: { name: true } },
          enteredBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { transactionDate: 'desc' },
      });

      const total = deposits.reduce((s, d) => s + Number(d.amount), 0);

      return reply.send({
        deposits: deposits.map(enrichTransaction),
        total,
        count: deposits.length,
      });
    },
  });

  // ─── CUSTOMER LIABILITY REPORT ────────────────────────────────
  fastify.get('/banking/customer-liability', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const bookings = await prisma.booking.findMany({
        where: { status: 'CONFIRMED' },
        include: {
          customer: { select: { name: true, phone: true } },
          batch: { select: { name: true, expectedDate: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      const totalLiability = bookings.reduce((s, b) => s + Number(b.amountPaid), 0);

      return reply.send({
        bookings: bookings.map(b => ({
          id: b.id,
          customer: b.customer.name,
          phone: b.customer.phone,
          batch: b.batch.name,
          batchDate: b.batch.expectedDate,
          quantity: b.quantity,
          amountPaid: Number(b.amountPaid),
          orderValue: Number(b.orderValue),
          bookedOn: b.createdAt,
        })),
        totalLiability,
        count: bookings.length,
      });
    },
  });

  // ─── EXPENSE REPORT ───────────────────────────────────────────
  fastify.get('/banking/expenses', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const { dateFrom, dateTo, category } = request.query;

      const expenseCategories = [
        'REFUND', 'BANK_CHARGES', 'FARMER_PAYMENT',
        'SALARY', 'DIESEL_FUEL', 'INTERNET', 'MARKETING', 'OTHER_EXPENSE',
      ];

      const where = {
        direction: 'OUTFLOW',
        category: category ? { equals: category } : { in: expenseCategories },
      };

      if (dateFrom || dateTo) {
        where.transactionDate = {};
        if (dateFrom) where.transactionDate.gte = new Date(dateFrom);
        if (dateTo) {
          const end = new Date(dateTo);
          end.setDate(end.getDate() + 1);
          where.transactionDate.lt = end;
        }
      }

      const expenses = await prisma.bankTransaction.findMany({
        where,
        include: {
          bankAccount: { select: { name: true } },
          customer: { select: { name: true } },
        },
        orderBy: { transactionDate: 'desc' },
      });

      const byCategory = {};
      for (const exp of expenses) {
        if (!byCategory[exp.category]) byCategory[exp.category] = { count: 0, total: 0 };
        byCategory[exp.category].count += 1;
        byCategory[exp.category].total += Number(exp.amount);
      }

      const total = expenses.reduce((s, e) => s + Number(e.amount), 0);

      return reply.send({
        expenses: expenses.map(enrichTransaction),
        byCategory,
        total,
        count: expenses.length,
      });
    },
  });

  // ─── DAILY SUMMARY PER ACCOUNT ────────────────────────────────
  fastify.get('/banking/daily-summary', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const { date } = request.query;
      const targetDate = date ? new Date(date) : new Date();
      const start = new Date(targetDate.toISOString().slice(0, 10));
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      const transactions = await prisma.bankTransaction.findMany({
        where: { transactionDate: { gte: start, lt: end } },
        include: {
          bankAccount: { select: { name: true, accountType: true } },
          customer: { select: { name: true } },
        },
        orderBy: { transactionDate: 'desc' },
      });

      const totalInflows = transactions.filter(t => t.direction === 'INFLOW').reduce((s, t) => s + Number(t.amount), 0);
      const totalOutflows = transactions.filter(t => t.direction === 'OUTFLOW').reduce((s, t) => s + Number(t.amount), 0);

      return reply.send({
        date: start.toISOString().slice(0, 10),
        totalInflows,
        totalOutflows,
        netFlow: totalInflows - totalOutflows,
        transactionCount: transactions.length,
        transactions: transactions.map(enrichTransaction),
      });
    },
  });
}
