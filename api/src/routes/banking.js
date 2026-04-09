import crypto from 'node:crypto';
import prisma from '../plugins/prisma.js';
import { authenticate } from '../plugins/auth.js';
import { authorize } from '../middleware/authorize.js';
import {
  VALID_DIRECTIONS,
  VALID_CATEGORIES,
  INFLOW_CATEGORIES,
  OUTFLOW_CATEGORIES,
  getCategoryDirection,
  normalizeCategoryKey,
} from '../utils/banking.js';
import {
  getCustomerEggTypeConfig,
  getCustomerEggTypeLabel,
  getOperationsPolicy,
  getTransactionCategoryConfig,
  saveTransactionCategoryConfig,
} from '../utils/appSettings.js';
import { getCustomerTrackedOrderCount, getPerOrderCrateLimit } from '../utils/customerOrderPolicy.js';
import { buildCleanDescription, parseProvidusStatement } from '../utils/providusStatement.js';

function toNumber(value) {
  return value == null ? null : Number(value);
}

function enrichTransaction(t) {
  return {
    ...t,
    amount: Number(t.amount),
  };
}

function enrichStatementLine(line) {
  return {
    ...line,
    debitAmount: toNumber(line.debitAmount),
    creditAmount: toNumber(line.creditAmount),
    runningBalance: toNumber(line.runningBalance),
  };
}

function enrichImportRecord(record) {
  return {
    ...record,
    openingBalance: toNumber(record.openingBalance),
    closingBalance: toNumber(record.closingBalance),
  };
}

function enrichReconciliation(rec) {
  return {
    ...rec,
    openingBalance: toNumber(rec.openingBalance),
    closingBalance: Number(rec.closingBalance),
    systemBalance: Number(rec.systemBalance),
    variance: Number(rec.variance),
  };
}

function buildImportCounts(lines = []) {
  return {
    total: lines.length,
    ready: lines.filter((line) => line.reviewStatus === 'READY_TO_POST').length,
    pending: lines.filter((line) => line.reviewStatus === 'PENDING_REVIEW').length,
    duplicate: lines.filter((line) => line.reviewStatus === 'DUPLICATE').length,
    skipped: lines.filter((line) => line.reviewStatus === 'SKIPPED').length,
    posted: lines.filter((line) => line.reviewStatus === 'POSTED').length,
  };
}

function endOfDay(dateInput) {
  const date = new Date(dateInput);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

function buildCategoryConfigMap(categories = []) {
  return categories.reduce((acc, entry) => {
    acc[entry.category] = entry;
    return acc;
  }, {});
}

async function getAccountSummary(accountId) {
  const [inflows, outflows, txnCount, latestReconciliation] = await Promise.all([
    prisma.bankTransaction.aggregate({
      where: { bankAccountId: accountId, direction: 'INFLOW' },
      _sum: { amount: true },
    }),
    prisma.bankTransaction.aggregate({
      where: { bankAccountId: accountId, direction: 'OUTFLOW' },
      _sum: { amount: true },
    }),
    prisma.bankTransaction.count({ where: { bankAccountId: accountId } }),
    prisma.bankReconciliation.findFirst({
      where: { bankAccountId: accountId },
      orderBy: { createdAt: 'desc' },
      include: {
        reconciledBy: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  return {
    totalInflows: Number(inflows._sum.amount || 0),
    totalOutflows: Number(outflows._sum.amount || 0),
    systemBalance: Number(inflows._sum.amount || 0) - Number(outflows._sum.amount || 0),
    transactionCount: txnCount,
    latestReconciliation: latestReconciliation ? enrichReconciliation(latestReconciliation) : null,
  };
}

function validateDirectionAndCategory(direction, category, categoryConfig = []) {
  const categoryMap = buildCategoryConfigMap(categoryConfig);
  if (!direction || !VALID_DIRECTIONS.includes(direction)) {
    return 'Direction must be INFLOW or OUTFLOW';
  }
  const categoryEntry = categoryMap[category];
  if (!category || !categoryEntry) {
    return 'Invalid category.';
  }
  if (direction === 'INFLOW' && categoryEntry.direction !== 'INFLOW') {
    return `Category ${category} cannot be an inflow`;
  }
  if (direction === 'OUTFLOW' && categoryEntry.direction !== 'OUTFLOW') {
    return `Category ${category} cannot be an outflow`;
  }
  return null;
}

async function recalculateImportStatus(importId) {
  const lines = await prisma.bankStatementLine.findMany({
    where: { importId },
    select: { reviewStatus: true },
  });

  const postedRowCount = lines.filter((line) => line.reviewStatus === 'POSTED').length;
  let status = 'REVIEWING';
  if (lines.length > 0 && postedRowCount === lines.length) status = 'POSTED';
  else if (postedRowCount > 0) status = 'PARTIALLY_POSTED';

  return prisma.bankStatementImport.update({
    where: { id: importId },
    data: {
      postedRowCount,
      status,
    },
  });
}

async function getTransactionAllocatedAmount(bankTransactionId) {
  const allocationAgg = await prisma.bookingPaymentAllocation.aggregate({
    where: { bankTransactionId },
    _sum: { amount: true },
  });

  return Number(allocationAgg._sum.amount || 0);
}

async function validateCustomer(customerId) {
  if (!customerId) return null;
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  return customer || false;
}

function createBankTransaction({
  bankAccountId,
  direction,
  category,
  amount,
  description,
  reference,
  transactionDate,
  customerId,
  bookingId,
  enteredById,
  sourceType = 'MANUAL',
  sourceFingerprint = null,
  internalTransferGroupId = null,
}) {
  return prisma.bankTransaction.create({
    data: {
      bankAccountId,
      direction,
      category,
      amount: Number(amount),
      description: description || null,
      reference: reference || null,
      transactionDate: new Date(transactionDate),
      customerId: customerId || null,
      bookingId: bookingId || null,
      enteredById,
      sourceType,
      sourceFingerprint,
      internalTransferGroupId,
      postedAt: new Date(),
    },
    include: {
      bankAccount: { select: { id: true, name: true, accountType: true, isVirtual: true, supportsStatementImport: true } },
      customer: { select: { id: true, name: true, phone: true } },
      enteredBy: { select: { firstName: true, lastName: true } },
    },
  });
}

async function getCashSaleAllocationMap(transactionIds = []) {
  if (transactionIds.length === 0) return new Map();

  const allocations = await prisma.cashDepositBatchTransaction.groupBy({
    by: ['bankTransactionId'],
    where: { bankTransactionId: { in: transactionIds } },
    _sum: { amountIncluded: true },
  });

  return new Map(
    allocations.map((entry) => [entry.bankTransactionId, Number(entry._sum.amountIncluded || 0)]),
  );
}

async function getAvailableCashSaleTransactions({ upToDate } = {}) {
  const where = {
    direction: 'INFLOW',
    category: 'CASH_SALE',
    bankAccount: { accountType: 'CASH_ON_HAND' },
  };

  if (upToDate) {
    where.transactionDate = { lte: upToDate };
  }

  const transactions = await prisma.bankTransaction.findMany({
    where,
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      sale: { select: { id: true, receiptNumber: true, saleDate: true } },
      bankAccount: { select: { id: true, name: true, accountType: true, lastFour: true, isVirtual: true, supportsStatementImport: true } },
    },
    orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }],
  });

  const allocationMap = await getCashSaleAllocationMap(transactions.map((transaction) => transaction.id));

  return transactions
    .map((transaction) => {
      const allocatedAmount = allocationMap.get(transaction.id) || 0;
      const availableAmount = Math.max(0, Number(transaction.amount) - allocatedAmount);
      return {
        ...enrichTransaction(transaction),
        allocatedAmount,
        availableAmount,
      };
    })
    .filter((transaction) => transaction.availableAmount > 0.009);
}

function hoursBetween(fromDate, toDate = new Date()) {
  return (new Date(toDate).getTime() - new Date(fromDate).getTime()) / (1000 * 60 * 60);
}

async function getCashDepositWorkspace(policyInput) {
  const policy = policyInput || await getOperationsPolicy();
  const undepositedThresholdHours = Number(policy.undepositedCashAlertHours || 24);
  const pendingThresholdHours = Number(policy.pendingCashDepositConfirmationHours || 24);

  const [availableCashTransactions, pendingBatches, confirmedRecently] = await Promise.all([
    getAvailableCashSaleTransactions(),
    prisma.cashDepositBatch.findMany({
      where: { status: { in: ['PENDING_CONFIRMATION', 'OVERDUE'] } },
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        fromBankAccount: { select: { id: true, name: true, accountType: true, lastFour: true, isVirtual: true, supportsStatementImport: true } },
        toBankAccount: { select: { id: true, name: true, accountType: true, lastFour: true, isVirtual: true, supportsStatementImport: true } },
        outflowTransaction: {
          include: {
            enteredBy: { select: { firstName: true, lastName: true } },
          },
        },
        transactions: {
          include: {
            bankTransaction: {
              include: {
                customer: { select: { id: true, name: true, phone: true } },
                sale: { select: { id: true, receiptNumber: true, saleDate: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ depositDate: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.cashDepositBatch.findMany({
      where: { status: 'CONFIRMED' },
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        confirmedBy: { select: { firstName: true, lastName: true } },
        fromBankAccount: { select: { id: true, name: true, accountType: true, lastFour: true, isVirtual: true, supportsStatementImport: true } },
        toBankAccount: { select: { id: true, name: true, accountType: true, lastFour: true, isVirtual: true, supportsStatementImport: true } },
        confirmationStatementLine: {
          select: {
            id: true,
            lineNumber: true,
            description: true,
            transactionDate: true,
            actualTransactionDate: true,
            valueDate: true,
            notes: true,
          },
        },
      },
      orderBy: [{ confirmedAt: 'desc' }, { createdAt: 'desc' }],
      take: 10,
    }),
  ]);

  const undepositedTransactions = availableCashTransactions.filter((transaction) => hoursBetween(transaction.transactionDate) >= undepositedThresholdHours);
  const undepositedTotal = undepositedTransactions.reduce((sum, transaction) => sum + Number(transaction.availableAmount), 0);
  const pendingNormalized = pendingBatches.map((batch) => {
    const ageHours = hoursBetween(batch.depositDate);
    return {
      ...batch,
      amount: Number(batch.amount),
      ageHours,
      isOverdue: ageHours >= pendingThresholdHours,
      status: batch.status === 'PENDING_CONFIRMATION' && ageHours >= pendingThresholdHours ? 'OVERDUE' : batch.status,
      transactions: batch.transactions.map((entry) => ({
        ...entry,
        amountIncluded: Number(entry.amountIncluded),
        bankTransaction: entry.bankTransaction ? {
          ...enrichTransaction(entry.bankTransaction),
        } : null,
      })),
    };
  });

  return {
    undepositedCash: {
      count: undepositedTransactions.length,
      total: undepositedTotal,
      thresholdHours: undepositedThresholdHours,
      transactions: undepositedTransactions,
    },
    pendingDeposits: {
      count: pendingNormalized.length,
      total: pendingNormalized.reduce((sum, batch) => sum + Number(batch.amount || 0), 0),
      thresholdHours: pendingThresholdHours,
      batches: pendingNormalized,
    },
    confirmedRecently: confirmedRecently.map((batch) => ({
      ...batch,
      amount: Number(batch.amount),
    })),
  };
}

async function getCashDepositMatchCandidates({ amount, transactionDate, bankAccountId, policyInput }) {
  const policy = policyInput || await getOperationsPolicy(transactionDate || new Date());
  const matchWindowDays = Number(policy.cashDepositMatchWindowDays || 2);
  const targetDate = transactionDate ? new Date(transactionDate) : new Date();
  const minDate = new Date(targetDate);
  minDate.setDate(minDate.getDate() - matchWindowDays);
  const maxDate = new Date(targetDate);
  maxDate.setDate(maxDate.getDate() + matchWindowDays);

  const candidates = await prisma.cashDepositBatch.findMany({
    where: {
      toBankAccountId: bankAccountId,
      status: { in: ['PENDING_CONFIRMATION', 'OVERDUE'] },
      depositDate: { gte: minDate, lte: maxDate },
    },
    include: {
      createdBy: { select: { firstName: true, lastName: true } },
      transactions: {
        include: {
          bankTransaction: {
            include: {
              customer: { select: { id: true, name: true, phone: true } },
              sale: { select: { id: true, receiptNumber: true } },
            },
          },
        },
      },
    },
  });

  return candidates
    .map((batch) => {
      const batchAmount = Number(batch.amount);
      const amountDifference = Math.abs(batchAmount - Number(amount || 0));
      const dateDifferenceDays = Math.abs(
        Math.round((new Date(batch.depositDate).setHours(0, 0, 0, 0) - new Date(targetDate).setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24)),
      );

      let confidence = 'possible';
      if (amountDifference <= 0.009 && dateDifferenceDays === 0) confidence = 'exact';
      else if (amountDifference <= 0.009 && dateDifferenceDays <= 1) confidence = 'strong';
      else if (amountDifference <= 0.009 && dateDifferenceDays <= matchWindowDays) confidence = 'likely';

      return {
        ...batch,
        amount: batchAmount,
        amountDifference,
        dateDifferenceDays,
        confidence,
        transactions: batch.transactions.map((entry) => ({
          ...entry,
          amountIncluded: Number(entry.amountIncluded),
          bankTransaction: entry.bankTransaction ? enrichTransaction(entry.bankTransaction) : null,
        })),
      };
    })
    .sort((a, b) => {
      const confidenceOrder = { exact: 0, strong: 1, likely: 2, possible: 3 };
      return confidenceOrder[a.confidence] - confidenceOrder[b.confidence]
        || a.amountDifference - b.amountDifference
        || a.dateDifferenceDays - b.dateDifferenceDays;
    });
}

export default async function bankingRoutes(fastify) {
  fastify.get('/banking/meta', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async () => {
      const transactionCategories = await getTransactionCategoryConfig();
      return { transactionCategories };
    },
  });

  fastify.post('/banking/categories', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const categoryConfig = await getTransactionCategoryConfig();
      const { label, direction, description = '' } = request.body;

      if (!label?.trim()) {
        return reply.code(400).send({ error: 'Category label is required.' });
      }
      if (!VALID_DIRECTIONS.includes(direction)) {
        return reply.code(400).send({ error: 'Direction must be INFLOW or OUTFLOW.' });
      }

      const category = normalizeCategoryKey(label);
      if (!category) {
        return reply.code(400).send({ error: 'Category label must contain letters or numbers.' });
      }

      if (categoryConfig.some((entry) => entry.category === category)) {
        return reply.code(409).send({ error: 'A category with this name already exists.' });
      }

      const transactionCategories = await saveTransactionCategoryConfig([
        ...categoryConfig,
        {
          category,
          label: label.trim(),
          description: String(description || '').trim(),
          direction,
          isActive: true,
        },
      ], request.user.sub);

      return reply.code(201).send({
        category: transactionCategories.find((entry) => entry.category === category),
        transactionCategories,
      });
    },
  });

  fastify.get('/banking/accounts', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const accounts = await prisma.bankAccount.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });

      const enriched = [];
      for (const account of accounts) {
        const summary = await getAccountSummary(account.id);
        enriched.push({ ...account, ...summary });
      }

      return reply.send({ accounts: enriched });
    },
  });

  fastify.get('/banking/accounts/:id/reconciliation-status', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const account = await prisma.bankAccount.findUnique({
        where: { id: request.params.id },
      });

      if (!account) return reply.code(404).send({ error: 'Bank account not found' });

      const summary = await getAccountSummary(account.id);
      return reply.send({ account: { ...account, ...summary } });
    },
  });

  fastify.get('/banking/transactions', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const { bankAccountId, category, direction, dateFrom, dateTo, customerId, sourceType, q, limit = 50, offset = 0 } = request.query;

      const where = {};
      if (bankAccountId) where.bankAccountId = bankAccountId;
      if (category) where.category = category;
      if (direction) where.direction = direction;
      if (customerId) where.customerId = customerId;
      if (sourceType) where.sourceType = sourceType;
      const searchTerm = String(q || '').trim();
      if (searchTerm) {
        const searchClauses = [
          { description: { contains: searchTerm, mode: 'insensitive' } },
          { reference: { contains: searchTerm, mode: 'insensitive' } },
          { category: { contains: searchTerm, mode: 'insensitive' } },
          {
            customer: {
              is: {
                OR: [
                  { name: { contains: searchTerm, mode: 'insensitive' } },
                  { phone: { contains: searchTerm, mode: 'insensitive' } },
                  { email: { contains: searchTerm, mode: 'insensitive' } },
                ],
              },
            },
          },
        ];
        const parsedAmount = Number(searchTerm.replace(/,/g, ''));
        if (!Number.isNaN(parsedAmount) && searchTerm !== '') {
          searchClauses.push({ amount: parsedAmount });
        }
        where.OR = searchClauses;
      }
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
            bankAccount: { select: { id: true, name: true, accountType: true, lastFour: true, isVirtual: true, supportsStatementImport: true } },
            customer: { select: { id: true, name: true, phone: true } },
            enteredBy: { select: { firstName: true, lastName: true } },
          },
          orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
          take: parseInt(limit, 10),
          skip: parseInt(offset, 10),
        }),
        prisma.bankTransaction.count({ where }),
      ]);

      return reply.send({ transactions: transactions.map(enrichTransaction), total });
    },
  });

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

  fastify.post('/banking/transactions', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const { bankAccountId, direction, category, amount, description, reference, transactionDate, customerId, sourceType } = request.body;
      const categoryConfig = await getTransactionCategoryConfig();

      if (!bankAccountId) return reply.code(400).send({ error: 'Bank account is required' });
      const categoryError = validateDirectionAndCategory(direction, category, categoryConfig);
      if (categoryError) return reply.code(400).send({ error: categoryError });
      if (!amount || Number(amount) <= 0) return reply.code(400).send({ error: 'Amount must be positive' });
      if (!transactionDate) return reply.code(400).send({ error: 'Transaction date is required' });

      const account = await prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
      if (!account) return reply.code(404).send({ error: 'Bank account not found' });

      const customer = await validateCustomer(customerId);
      if (customer === false) return reply.code(404).send({ error: 'Customer not found' });

      const transaction = await createBankTransaction({
        bankAccountId,
        direction,
        category,
        amount,
        description,
        reference,
        transactionDate,
        customerId,
        enteredById: request.user.sub,
        sourceType: sourceType || 'MANUAL',
      });

      return reply.code(201).send({ transaction: enrichTransaction(transaction) });
    },
  });

  fastify.post('/banking/transactions/bulk', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const { rows } = request.body;
      const categoryConfig = await getTransactionCategoryConfig();
      if (!Array.isArray(rows) || rows.length === 0) {
        return reply.code(400).send({ error: 'rows must be a non-empty array' });
      }

      const validationErrors = [];

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const categoryError = validateDirectionAndCategory(row.direction, row.category, categoryConfig);
        if (!row.bankAccountId) validationErrors.push({ index, error: 'Bank account is required' });
        if (categoryError) validationErrors.push({ index, error: categoryError });
        if (!row.amount || Number(row.amount) <= 0) validationErrors.push({ index, error: 'Amount must be positive' });
        if (!row.transactionDate) validationErrors.push({ index, error: 'Transaction date is required' });
      }

      if (validationErrors.length > 0) {
        return reply.code(400).send({ error: 'Validation failed', rows: validationErrors });
      }

      const accountIds = [...new Set(rows.map((row) => row.bankAccountId))];
      const customerIds = [...new Set(rows.map((row) => row.customerId).filter(Boolean))];

      const [accounts, customers] = await Promise.all([
        prisma.bankAccount.findMany({ where: { id: { in: accountIds } } }),
        customerIds.length > 0 ? prisma.customer.findMany({ where: { id: { in: customerIds } } }) : [],
      ]);

      const accountSet = new Set(accounts.map((account) => account.id));
      const customerSet = new Set(customers.map((customer) => customer.id));

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        if (!accountSet.has(row.bankAccountId)) validationErrors.push({ index, error: 'Bank account not found' });
        if (row.customerId && !customerSet.has(row.customerId)) validationErrors.push({ index, error: 'Customer not found' });
      }

      if (validationErrors.length > 0) {
        return reply.code(400).send({ error: 'Validation failed', rows: validationErrors });
      }

      const created = await prisma.$transaction(
        rows.map((row) =>
          createBankTransaction({
            bankAccountId: row.bankAccountId,
            direction: row.direction,
            category: row.category,
            amount: row.amount,
            description: row.description,
            reference: row.reference,
            transactionDate: row.transactionDate,
            customerId: row.customerId,
            enteredById: request.user.sub,
            sourceType: 'MANUAL',
          })
        )
      );

      return reply.code(201).send({ transactions: created.map(enrichTransaction), count: created.length });
    },
  });

  fastify.post('/banking/transfers/internal', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const { fromAccountId, toAccountId, amount, description, transactionDate } = request.body;

      if (!fromAccountId || !toAccountId) {
        return reply.code(400).send({ error: 'fromAccountId and toAccountId are required' });
      }
      if (fromAccountId === toAccountId) {
        return reply.code(400).send({ error: 'Transfer accounts must be different' });
      }
      if (!amount || Number(amount) <= 0) {
        return reply.code(400).send({ error: 'Amount must be positive' });
      }
      if (!transactionDate) {
        return reply.code(400).send({ error: 'Transaction date is required' });
      }

      const [fromAccount, toAccount] = await Promise.all([
        prisma.bankAccount.findUnique({ where: { id: fromAccountId } }),
        prisma.bankAccount.findUnique({ where: { id: toAccountId } }),
      ]);

      if (!fromAccount || !toAccount) {
        return reply.code(404).send({ error: 'One or both bank accounts were not found' });
      }

      const isCashDepositWorkflow = fromAccount.accountType === 'CASH_ON_HAND' && toAccount.accountType === 'CUSTOMER_DEPOSIT';

      if (isCashDepositWorkflow) {
        const effectiveDate = endOfDay(transactionDate);
        const availableCashTransactions = await getAvailableCashSaleTransactions({ upToDate: effectiveDate });
        const availableTotal = availableCashTransactions.reduce((sum, transaction) => sum + Number(transaction.availableAmount), 0);
        const requestedAmount = Number(amount);

        if (requestedAmount > availableTotal + 0.009) {
          return reply.code(400).send({
            error: `Only ${availableTotal.toLocaleString('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 })} is available to deposit from Cash Account for that date.`,
          });
        }

        let remainingAmount = requestedAmount;
        const allocations = [];
        for (const transaction of availableCashTransactions) {
          if (remainingAmount <= 0.009) break;
          const amountIncluded = Math.min(remainingAmount, Number(transaction.availableAmount));
          if (amountIncluded <= 0) continue;
          allocations.push({ bankTransactionId: transaction.id, amountIncluded });
          remainingAmount -= amountIncluded;
        }

        if (remainingAmount > 0.009) {
          return reply.code(400).send({ error: 'Could not allocate enough cash-sale transactions to cover this deposit.' });
        }

        const transferDescription = description?.trim() || `Cash deposit awaiting bank confirmation: ${fromAccount.name} -> ${toAccount.name}`;
        const outflow = await prisma.$transaction(async (tx) => {
          const outflowTransaction = await tx.bankTransaction.create({
            data: {
              bankAccountId: fromAccount.id,
              direction: 'OUTFLOW',
              category: 'INTERNAL_TRANSFER_OUT',
              amount: requestedAmount,
              description: transferDescription,
              reference: crypto.randomUUID(),
              transactionDate: new Date(transactionDate),
              enteredById: request.user.sub,
              sourceType: 'CASH_DEPOSIT',
              postedAt: new Date(),
            },
            include: {
              bankAccount: { select: { id: true, name: true, accountType: true, isVirtual: true, supportsStatementImport: true } },
              customer: { select: { id: true, name: true, phone: true } },
              enteredBy: { select: { firstName: true, lastName: true } },
            },
          });

          const batch = await tx.cashDepositBatch.create({
            data: {
              fromBankAccountId: fromAccount.id,
              toBankAccountId: toAccount.id,
              outflowTransactionId: outflowTransaction.id,
              amount: requestedAmount,
              depositDate: new Date(transactionDate),
              createdById: request.user.sub,
              notes: transferDescription,
              transactions: {
                create: allocations.map((entry) => ({
                  bankTransactionId: entry.bankTransactionId,
                  amountIncluded: entry.amountIncluded,
                })),
              },
            },
            include: {
              createdBy: { select: { firstName: true, lastName: true } },
              fromBankAccount: { select: { id: true, name: true, accountType: true, lastFour: true, isVirtual: true, supportsStatementImport: true } },
              toBankAccount: { select: { id: true, name: true, accountType: true, lastFour: true, isVirtual: true, supportsStatementImport: true } },
              transactions: {
                include: {
                  bankTransaction: {
                    include: {
                      customer: { select: { id: true, name: true, phone: true } },
                      sale: { select: { id: true, receiptNumber: true, saleDate: true } },
                    },
                  },
                },
              },
            },
          });

          return { outflowTransaction, batch };
        });

        return reply.code(201).send({
          transferGroupId: outflow.batch.id,
          outflow: enrichTransaction(outflow.outflowTransaction),
          cashDepositBatch: {
            ...outflow.batch,
            amount: Number(outflow.batch.amount),
            transactions: outflow.batch.transactions.map((entry) => ({
              ...entry,
              amountIncluded: Number(entry.amountIncluded),
              bankTransaction: entry.bankTransaction ? enrichTransaction(entry.bankTransaction) : null,
            })),
          },
        });
      }

      const transferGroupId = crypto.randomUUID();
      const transferDescription = description?.trim() || `Internal transfer: ${fromAccount.name} -> ${toAccount.name}`;

      const [outflow, inflow] = await prisma.$transaction([
        createBankTransaction({
          bankAccountId: fromAccount.id,
          direction: 'OUTFLOW',
          category: 'INTERNAL_TRANSFER_OUT',
          amount,
          description: transferDescription,
          reference: transferGroupId,
          transactionDate,
          enteredById: request.user.sub,
          sourceType: 'INTERNAL_TRANSFER',
          internalTransferGroupId: transferGroupId,
        }),
        createBankTransaction({
          bankAccountId: toAccount.id,
          direction: 'INFLOW',
          category: 'INTERNAL_TRANSFER_IN',
          amount,
          description: transferDescription,
          reference: transferGroupId,
          transactionDate,
          enteredById: request.user.sub,
          sourceType: 'INTERNAL_TRANSFER',
          internalTransferGroupId: transferGroupId,
        }),
      ]);

      return reply.code(201).send({
        transferGroupId,
        outflow: enrichTransaction(outflow),
        inflow: enrichTransaction(inflow),
      });
    },
  });

  fastify.get('/banking/cash-deposits', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async () => {
      const policy = await getOperationsPolicy();
      const workspace = await getCashDepositWorkspace(policy);
      return {
        policy,
        ...workspace,
      };
    },
  });

  fastify.get('/banking/cash-deposits/match-candidates', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const { amount, transactionDate, bankAccountId } = request.query;
      const numericAmount = Number(amount);
      if (!bankAccountId) {
        return reply.code(400).send({ error: 'bankAccountId is required.' });
      }
      if (!numericAmount || numericAmount <= 0) {
        return reply.code(400).send({ error: 'amount must be greater than zero.' });
      }

      const policy = await getOperationsPolicy(transactionDate || new Date());
      const candidates = await getCashDepositMatchCandidates({
        amount: numericAmount,
        transactionDate,
        bankAccountId,
        policyInput: policy,
      });

      return reply.send({
        candidates,
        policy: {
          cashDepositMatchWindowDays: Number(policy.cashDepositMatchWindowDays || 2),
        },
      });
    },
  });

  fastify.post('/banking/imports/providus/preview', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const { bankAccountId, csvText, filename } = request.body;
      if (!bankAccountId) return reply.code(400).send({ error: 'bankAccountId is required' });
      if (!csvText || !csvText.trim()) return reply.code(400).send({ error: 'csvText is required' });

      const account = await prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
      if (!account) return reply.code(404).send({ error: 'Bank account not found' });
      if (!account.supportsStatementImport) {
        return reply.code(400).send({ error: 'This account does not support statement imports' });
      }

      let parsed;
      try {
        parsed = parseProvidusStatement(csvText, { bankAccountId });
      } catch (error) {
        return reply.code(400).send({ error: error.message });
      }

      const fingerprints = parsed.lines.map((line) => line.fingerprint);
      const [existingTransactions, existingLines] = await Promise.all([
        prisma.bankTransaction.findMany({
          where: { sourceFingerprint: { in: fingerprints } },
          select: { sourceFingerprint: true },
        }),
        prisma.bankStatementLine.findMany({
          where: { fingerprint: { in: fingerprints } },
          select: { fingerprint: true, id: true, reviewStatus: true, importId: true },
        }),
      ]);

      const existingTransactionSet = new Set(existingTransactions.map((txn) => txn.sourceFingerprint));
      const existingLineSet = new Set(existingLines.map((line) => line.fingerprint));

      if (existingLines.length > 0) {
        const existingImportIds = [...new Set(existingLines.map((line) => line.importId))];
        const matchedFingerprintCount = new Set(existingLines.map((line) => line.fingerprint)).size;

        if (matchedFingerprintCount === fingerprints.length && existingImportIds.length === 1) {
          const existingImport = await prisma.bankStatementImport.findUnique({
            where: { id: existingImportIds[0] },
            include: {
              bankAccount: { select: { id: true, name: true, accountType: true } },
              importedBy: { select: { firstName: true, lastName: true } },
              lines: {
                orderBy: { lineNumber: 'asc' },
              },
            },
          });

          if (existingImport) {
            const hasPostedLines = existingImport.lines.some((line) => line.reviewStatus === 'POSTED');
            const canReuseQueueItem = !hasPostedLines && ['REVIEWING', 'DRAFT', 'CANCELLED'].includes(existingImport.status);

            if (canReuseQueueItem) {
              const importRecord = existingImport.status === 'CANCELLED'
                ? await prisma.bankStatementImport.update({
                    where: { id: existingImport.id },
                    data: { status: 'REVIEWING' },
                    include: {
                      bankAccount: { select: { id: true, name: true, accountType: true } },
                      importedBy: { select: { firstName: true, lastName: true } },
                      lines: {
                        orderBy: { lineNumber: 'asc' },
                      },
                    },
                  })
                : existingImport;

              return reply.send({
                import: enrichImportRecord(importRecord),
                counts: buildImportCounts(importRecord.lines),
                preview: importRecord.lines.map(enrichStatementLine),
                reusedExistingImport: true,
              });
            }

            return reply.code(409).send({
              error: 'This statement has already been imported. Open the existing import from the queue instead of uploading it again.',
              importId: existingImport.id,
            });
          }
        }

        return reply.code(409).send({
          error: 'This statement overlaps with transactions that are already in the import history. Open the existing import instead of uploading it again.',
        });
      }

      const importRecord = await prisma.bankStatementImport.create({
        data: {
          bankAccountId,
          provider: 'PROVIDUS',
          originalFilename: filename || 'providus-import.csv',
          statementDateFrom: parsed.metadata.statementDateFrom,
          statementDateTo: parsed.metadata.statementDateTo,
          openingBalance: parsed.metadata.openingBalance,
          closingBalance: parsed.metadata.closingBalance,
          rawRowCount: parsed.summary.rawRowCount,
          parsedRowCount: parsed.summary.parsedRowCount,
          importedById: request.user.sub,
          status: 'REVIEWING',
          lines: {
            create: parsed.lines.map((line) => {
              const isDuplicate = existingTransactionSet.has(line.fingerprint) || existingLineSet.has(line.fingerprint);
              return {
                lineNumber: line.lineNumber,
                transactionDate: line.transactionDate,
                actualTransactionDate: line.actualTransactionDate,
                valueDate: line.valueDate,
                description: line.description,
                docNum: line.docNum,
                debitAmount: line.debitAmount,
                creditAmount: line.creditAmount,
                runningBalance: line.runningBalance,
                direction: line.direction,
                suggestedCategory: line.suggestedCategory,
                selectedCategory: line.selectedCategory,
                notes: line.notes || null,
                reviewStatus: isDuplicate ? 'DUPLICATE' : line.reviewStatus,
                fingerprint: line.fingerprint,
                rawPayload: line.rawPayload,
              };
            }),
          },
        },
        include: {
          bankAccount: { select: { id: true, name: true, accountType: true } },
          importedBy: { select: { firstName: true, lastName: true } },
          lines: {
            orderBy: { lineNumber: 'asc' },
          },
        },
      });

      return reply.code(201).send({
        import: enrichImportRecord(importRecord),
        counts: buildImportCounts(importRecord.lines),
        preview: importRecord.lines.map(enrichStatementLine),
      });
    },
  });

  fastify.get('/banking/imports', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const { bankAccountId, status, includeCancelled, search, limit = 20, offset = 0 } = request.query;
      const where = {};
      if (bankAccountId) where.bankAccountId = bankAccountId;
      if (status) where.status = status;
      else if (!['1', 'true', true].includes(includeCancelled)) where.status = { not: 'CANCELLED' };
      const searchTerm = String(search || '').trim();
      if (searchTerm) {
        where.OR = [
          { originalFilename: { contains: searchTerm, mode: 'insensitive' } },
          {
            bankAccount: {
              is: {
                name: { contains: searchTerm, mode: 'insensitive' },
              },
            },
          },
        ];
      }

      const [imports, total] = await Promise.all([
        prisma.bankStatementImport.findMany({
          where,
          include: {
            bankAccount: { select: { id: true, name: true, accountType: true, lastFour: true } },
            importedBy: { select: { firstName: true, lastName: true } },
            _count: { select: { lines: true, reconciliations: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: parseInt(limit, 10),
          skip: parseInt(offset, 10),
        }),
        prisma.bankStatementImport.count({ where }),
      ]);

      return reply.send({
        imports: imports.map((record) => enrichImportRecord(record)),
        total,
      });
    },
  });

  fastify.delete('/banking/imports/:id', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const record = await prisma.bankStatementImport.findUnique({
        where: { id: request.params.id },
        include: {
          _count: {
            select: {
              lines: { where: { reviewStatus: 'POSTED' } },
            },
          },
        },
      });

      if (!record) return reply.code(404).send({ error: 'Import not found' });
      if (record._count.lines > 0 || ['POSTED', 'PARTIALLY_POSTED'].includes(record.status)) {
        return reply.code(400).send({ error: 'Imports with posted lines cannot be removed from the queue.' });
      }

      const updated = await prisma.bankStatementImport.update({
        where: { id: record.id },
        data: { status: 'CANCELLED' },
        include: {
          bankAccount: { select: { id: true, name: true, accountType: true, lastFour: true } },
          importedBy: { select: { firstName: true, lastName: true } },
          _count: { select: { lines: true, reconciliations: true } },
        },
      });

      return reply.send({ import: enrichImportRecord(updated) });
    },
  });

  fastify.post('/banking/imports/remove', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const importIds = Array.isArray(request.body?.importIds) ? request.body.importIds : [];
      if (importIds.length === 0) {
        return reply.code(400).send({ error: 'Select at least one import to remove from the queue.' });
      }

      const records = await prisma.bankStatementImport.findMany({
        where: { id: { in: importIds } },
        include: {
          _count: {
            select: {
              lines: { where: { reviewStatus: 'POSTED' } },
            },
          },
        },
      });

      if (records.length === 0) {
        return reply.code(404).send({ error: 'No matching imports were found.' });
      }
      if (records.some((record) => record._count.lines > 0 || ['POSTED', 'PARTIALLY_POSTED'].includes(record.status))) {
        return reply.code(400).send({ error: 'One or more selected imports already has posted lines and cannot be removed from the queue.' });
      }

      await prisma.bankStatementImport.updateMany({
        where: { id: { in: records.map((record) => record.id) } },
        data: { status: 'CANCELLED' },
      });

      return reply.send({
        removedImportIds: records.map((record) => record.id),
        removedCount: records.length,
      });
    },
  });

  fastify.get('/banking/imports/:id', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const record = await prisma.bankStatementImport.findUnique({
        where: { id: request.params.id },
        include: {
          bankAccount: { select: { id: true, name: true, accountType: true, lastFour: true } },
          importedBy: { select: { firstName: true, lastName: true } },
          _count: { select: { lines: true } },
          lines: {
            select: { reviewStatus: true },
          },
        },
      });

      if (!record) return reply.code(404).send({ error: 'Import not found' });

      const counts = record.lines.reduce((acc, line) => {
        acc[line.reviewStatus] = (acc[line.reviewStatus] || 0) + 1;
        return acc;
      }, {});

      return reply.send({
        import: enrichImportRecord({
          ...record,
          lines: undefined,
          counts,
        }),
      });
    },
  });

  fastify.get('/banking/imports/:id/lines', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const { reviewStatus } = request.query;
      const importRecord = await prisma.bankStatementImport.findUnique({
        where: { id: request.params.id },
        select: { id: true },
      });
      if (!importRecord) return reply.code(404).send({ error: 'Import not found' });

      const where = { importId: request.params.id };
      if (reviewStatus) where.reviewStatus = reviewStatus;

      const lines = await prisma.bankStatementLine.findMany({
        where,
        include: {
          selectedCustomer: { select: { id: true, name: true, phone: true } },
          postedTransaction: { select: { id: true, amount: true, category: true, transactionDate: true } },
          matchedCashDepositBatch: {
            select: {
              id: true,
              amount: true,
              depositDate: true,
              status: true,
            },
          },
        },
        orderBy: { lineNumber: 'asc' },
      });

      return reply.send({ lines: lines.map(enrichStatementLine) });
    },
  });

  fastify.patch('/banking/imports/:id/lines/:lineId', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const existing = await prisma.bankStatementLine.findFirst({
        where: { id: request.params.lineId, importId: request.params.id },
      });
      if (!existing) return reply.code(404).send({ error: 'Import line not found' });
      if (existing.reviewStatus === 'POSTED') {
        return reply.code(400).send({ error: 'Posted lines cannot be edited' });
      }

      const { selectedCategory, selectedCustomerId, matchedCashDepositBatchId, notes, reviewStatus, description } = request.body;
      const updates = {};
      const categoryConfig = await getTransactionCategoryConfig();

      if (selectedCategory !== undefined) {
        if (!categoryConfig.some((entry) => entry.category === selectedCategory)) {
          return reply.code(400).send({ error: 'Invalid category' });
        }
        const requiredDirection = categoryConfig.find((entry) => entry.category === selectedCategory)?.direction || getCategoryDirection(selectedCategory);
        if (existing.direction && requiredDirection && existing.direction !== requiredDirection) {
          return reply.code(400).send({ error: `Category ${selectedCategory} does not match line direction ${existing.direction}` });
        }
        updates.selectedCategory = selectedCategory;
        if (selectedCategory !== 'CASH_DEPOSIT_CONFIRMATION' && matchedCashDepositBatchId === undefined) {
          updates.matchedCashDepositBatchId = null;
        }
      }

      if (description !== undefined) {
        const normalizedDescription = String(description || '').trim();
        if (!normalizedDescription) {
          return reply.code(400).send({ error: 'Bank narration cannot be empty.' });
        }
        updates.description = normalizedDescription;
      }

      if (selectedCustomerId !== undefined) {
        if (selectedCustomerId) {
          const customer = await prisma.customer.findUnique({ where: { id: selectedCustomerId } });
          if (!customer) return reply.code(404).send({ error: 'Customer not found' });
          updates.selectedCustomerId = selectedCustomerId;
        } else {
          updates.selectedCustomerId = null;
        }
      }

      if (matchedCashDepositBatchId !== undefined) {
        if (matchedCashDepositBatchId) {
          const matchedBatch = await prisma.cashDepositBatch.findUnique({
            where: { id: matchedCashDepositBatchId },
          });
          if (!matchedBatch) {
            return reply.code(404).send({ error: 'Pending cash deposit batch not found.' });
          }
          if (!['PENDING_CONFIRMATION', 'OVERDUE'].includes(matchedBatch.status)) {
            return reply.code(400).send({ error: 'That cash deposit batch can no longer be matched.' });
          }
          if (selectedCategory === 'CASH_DEPOSIT_CONFIRMATION' || existing.selectedCategory === 'CASH_DEPOSIT_CONFIRMATION') {
            const lineAmount = existing.direction === 'OUTFLOW' ? Number(existing.debitAmount || 0) : Number(existing.creditAmount || 0);
            if (Math.abs(Number(matchedBatch.amount) - lineAmount) > 0.009) {
              return reply.code(400).send({ error: 'The selected cash deposit batch amount does not match this statement line.' });
            }
          }
          updates.matchedCashDepositBatchId = matchedCashDepositBatchId;
        } else {
          updates.matchedCashDepositBatchId = null;
        }
      }

      if (notes !== undefined) updates.notes = notes || null;
      else if (updates.description) updates.notes = buildCleanDescription(updates.description) || null;

      if (reviewStatus !== undefined) {
        const validStatuses = ['PENDING_REVIEW', 'READY_TO_POST', 'SKIPPED', 'DUPLICATE'];
        if (!validStatuses.includes(reviewStatus)) {
          return reply.code(400).send({ error: `reviewStatus must be one of ${validStatuses.join(', ')}` });
        }
        updates.reviewStatus = reviewStatus;
      } else if (updates.selectedCategory) {
        updates.reviewStatus = 'READY_TO_POST';
      }

      const line = await prisma.bankStatementLine.update({
        where: { id: existing.id },
        data: updates,
        include: {
          selectedCustomer: { select: { id: true, name: true, phone: true } },
          matchedCashDepositBatch: {
            select: {
              id: true,
              amount: true,
              depositDate: true,
              status: true,
            },
          },
        },
      });

      return reply.send({ line: enrichStatementLine(line) });
    },
  });

  fastify.post('/banking/imports/:id/lines/bulk-update', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const lineIds = Array.isArray(request.body?.lineIds) ? [...new Set(request.body.lineIds.filter(Boolean))] : [];
      const { selectedCategory, reviewStatus, notes } = request.body || {};

      if (lineIds.length === 0) {
        return reply.code(400).send({ error: 'Select at least one line.' });
      }
      if (selectedCategory === undefined && reviewStatus === undefined && notes === undefined) {
        return reply.code(400).send({ error: 'Choose at least one bulk change to apply.' });
      }

      const lines = await prisma.bankStatementLine.findMany({
        where: { importId: request.params.id, id: { in: lineIds } },
        select: {
          id: true,
          direction: true,
          reviewStatus: true,
        },
      });

      if (lines.length === 0) {
        return reply.code(404).send({ error: 'No matching import lines were found.' });
      }
      if (lines.some((line) => line.reviewStatus === 'POSTED')) {
        return reply.code(400).send({ error: 'Posted lines cannot be changed in bulk.' });
      }

      const updates = {};
      const categoryConfig = await getTransactionCategoryConfig();

      if (selectedCategory !== undefined) {
        const categoryEntry = categoryConfig.find((entry) => entry.category === selectedCategory);
        if (!categoryEntry) {
          return reply.code(400).send({ error: 'Invalid category.' });
        }
        const invalidDirectionLine = lines.find((line) => line.direction && line.direction !== categoryEntry.direction);
        if (invalidDirectionLine) {
          return reply.code(400).send({ error: 'Selected category does not match the direction of every chosen line.' });
        }
        updates.selectedCategory = selectedCategory;
      }

      if (reviewStatus !== undefined) {
        const validStatuses = ['PENDING_REVIEW', 'READY_TO_POST', 'SKIPPED', 'DUPLICATE'];
        if (!validStatuses.includes(reviewStatus)) {
          return reply.code(400).send({ error: `reviewStatus must be one of ${validStatuses.join(', ')}` });
        }
        updates.reviewStatus = reviewStatus;
      } else if (updates.selectedCategory) {
        updates.reviewStatus = 'READY_TO_POST';
      }

      if (notes !== undefined) {
        updates.notes = notes || null;
      }

      await prisma.bankStatementLine.updateMany({
        where: { importId: request.params.id, id: { in: lines.map((line) => line.id) } },
        data: updates,
      });

      return reply.send({
        updatedCount: lines.length,
        lineIds: lines.map((line) => line.id),
      });
    },
  });

  fastify.delete('/banking/imports/:id/lines/:lineId', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      return reply.code(400).send({
        error: 'Transaction lines from a bank statement cannot be removed. Remove the whole import from the queue if the wrong statement was uploaded.',
      });
    },
  });

  fastify.post('/banking/imports/:id/lines/remove', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      return reply.code(400).send({
        error: 'Transaction lines from a bank statement cannot be removed. Remove the whole import from the queue if the wrong statement was uploaded.',
      });
    },
  });

  fastify.post('/banking/imports/:id/post', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const importRecord = await prisma.bankStatementImport.findUnique({
        where: { id: request.params.id },
        include: {
          bankAccount: true,
          lines: {
            where: { reviewStatus: 'READY_TO_POST', postedTransactionId: null },
            orderBy: { lineNumber: 'asc' },
            include: {
              matchedCashDepositBatch: true,
            },
          },
        },
      });

      if (!importRecord) return reply.code(404).send({ error: 'Import not found' });
      if (importRecord.lines.length === 0) {
        return reply.code(400).send({ error: 'No READY_TO_POST lines found' });
      }

      const posted = [];
      const skipped = [];

      for (const line of importRecord.lines) {
        const duplicate = await prisma.bankTransaction.findFirst({
          where: { sourceFingerprint: line.fingerprint },
          select: { id: true },
        });

        if (duplicate) {
          await prisma.bankStatementLine.update({
            where: { id: line.id },
            data: { reviewStatus: 'DUPLICATE' },
          });
          skipped.push({ lineId: line.id, reason: 'Duplicate fingerprint already posted' });
          continue;
        }

        const amount = line.direction === 'INFLOW' ? Number(line.creditAmount || 0) : Number(line.debitAmount || 0);
        if (amount <= 0) {
          await prisma.bankStatementLine.update({
            where: { id: line.id },
            data: { reviewStatus: 'SKIPPED', notes: line.notes || 'Skipped because amount was zero' },
          });
          skipped.push({ lineId: line.id, reason: 'Amount was zero' });
          continue;
        }

        if (line.selectedCategory === 'CASH_DEPOSIT_CONFIRMATION') {
          if (!line.matchedCashDepositBatchId || !line.matchedCashDepositBatch) {
            skipped.push({ lineId: line.id, reason: 'Cash deposit confirmation line still needs a matched pending deposit.' });
            continue;
          }
          if (!['PENDING_CONFIRMATION', 'OVERDUE'].includes(line.matchedCashDepositBatch.status)) {
            skipped.push({ lineId: line.id, reason: 'Matched cash deposit batch is no longer awaiting confirmation.' });
            continue;
          }
          if (Math.abs(Number(line.matchedCashDepositBatch.amount) - amount) > 0.009) {
            skipped.push({ lineId: line.id, reason: 'Matched cash deposit batch amount does not equal the statement inflow.' });
            continue;
          }
          if (line.matchedCashDepositBatch.toBankAccountId !== importRecord.bankAccountId) {
            skipped.push({ lineId: line.id, reason: 'Matched cash deposit batch belongs to a different bank account.' });
            continue;
          }
        }

        const transaction = await createBankTransaction({
          bankAccountId: line.selectedCategory === 'CASH_DEPOSIT_CONFIRMATION'
            ? line.matchedCashDepositBatch.toBankAccountId
            : importRecord.bankAccountId,
          direction: line.direction,
          category: line.selectedCategory || line.suggestedCategory || (line.direction === 'INFLOW' ? 'UNALLOCATED_INCOME' : 'UNALLOCATED_EXPENSE'),
          amount,
          description: line.selectedCategory === 'CASH_DEPOSIT_CONFIRMATION'
            ? (line.notes || line.description)
            : line.description,
          reference: line.docNum,
          transactionDate: line.transactionDate || new Date(),
          customerId: line.selectedCustomerId,
          enteredById: request.user.sub,
          sourceType: 'STATEMENT_IMPORT',
          sourceFingerprint: line.fingerprint,
        });

        await prisma.bankStatementLine.update({
          where: { id: line.id },
          data: {
            postedTransactionId: transaction.id,
            reviewStatus: 'POSTED',
          },
        });

        if (line.selectedCategory === 'CASH_DEPOSIT_CONFIRMATION') {
          await prisma.cashDepositBatch.update({
            where: { id: line.matchedCashDepositBatchId },
            data: {
              status: 'CONFIRMED',
              confirmedById: request.user.sub,
              confirmedAt: new Date(),
              confirmationStatementLineId: line.id,
            },
          });
        }

        posted.push(transaction);
      }

      const postedRowCount = await prisma.bankStatementLine.count({
        where: { importId: importRecord.id, reviewStatus: 'POSTED' },
      });
      const remainingReady = await prisma.bankStatementLine.count({
        where: { importId: importRecord.id, reviewStatus: 'READY_TO_POST' },
      });

      const nextStatus = remainingReady === 0 ? 'POSTED' : 'PARTIALLY_POSTED';
      await prisma.bankStatementImport.update({
        where: { id: importRecord.id },
        data: {
          postedRowCount,
          status: nextStatus,
        },
      });

      return reply.send({
        posted: posted.map(enrichTransaction),
        postedCount: posted.length,
        skipped,
        importStatus: nextStatus,
      });
    },
  });

  fastify.get('/banking/customer-bookings', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const [customerEggTypes, policy, transactions, openBatches] = await Promise.all([
        getCustomerEggTypeConfig(),
        getOperationsPolicy(),
        prisma.bankTransaction.findMany({
          where: {
            category: 'CUSTOMER_BOOKING',
            direction: 'INFLOW',
          },
          include: {
            bankAccount: { select: { id: true, name: true, accountType: true, lastFour: true, isVirtual: true } },
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
        }),
        prisma.batch.findMany({
          where: { status: 'OPEN' },
          orderBy: { expectedDate: 'asc' },
        }),
      ]);

      const queue = transactions.map((transaction) => {
        const allocatedAmount = transaction.allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0);
        const availableAmount = Math.max(0, Number(transaction.amount) - allocatedAmount);
        return {
          ...enrichTransaction(transaction),
          allocatedAmount,
          availableAmount,
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
                eggTypeLabel: getCustomerEggTypeLabel(customerEggTypes, allocation.booking.batch.eggTypeKey || 'REGULAR'),
              } : null,
            } : null,
          })),
        };
      }).filter((transaction) => transaction.availableAmount > 0.009 || !transaction.customerId);

      const openBatchRows = await Promise.all(openBatches.map(async (batch) => {
        const bookedAgg = await prisma.booking.aggregate({
          where: { batchId: batch.id, status: { not: 'CANCELLED' } },
          _sum: { quantity: true },
        });
        const totalBooked = bookedAgg._sum.quantity || 0;
        return {
          id: batch.id,
          name: batch.name,
          expectedDate: batch.expectedDate,
          eggTypeKey: batch.eggTypeKey,
          eggTypeLabel: getCustomerEggTypeLabel(customerEggTypes, batch.eggTypeKey || 'REGULAR'),
          wholesalePrice: Number(batch.wholesalePrice),
          availableForBooking: batch.availableForBooking,
          remainingAvailable: Math.max(0, batch.availableForBooking - totalBooked),
        };
      }));

      return reply.send({
        queue,
        openBatches: openBatchRows.filter((batch) => batch.remainingAvailable > 0),
        policy,
      });
    },
  });

  fastify.patch('/banking/customer-bookings/:transactionId/customer', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const transaction = await prisma.bankTransaction.findUnique({
        where: { id: request.params.transactionId },
      });

      if (!transaction || transaction.category !== 'CUSTOMER_BOOKING') {
        return reply.code(404).send({ error: 'Customer booking transaction not found.' });
      }

      const customer = await prisma.customer.findUnique({
        where: { id: request.body?.customerId },
      });
      if (!customer) {
        return reply.code(404).send({ error: 'Customer not found.' });
      }

      const updated = await prisma.bankTransaction.update({
        where: { id: transaction.id },
        data: { customerId: customer.id },
        include: {
          customer: { select: { id: true, name: true, phone: true, email: true, isFirstTime: true } },
        },
      });

      return reply.send({ transaction: enrichTransaction(updated) });
    },
  });

  fastify.post('/banking/customer-bookings/:transactionId/customer', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const transaction = await prisma.bankTransaction.findUnique({
        where: { id: request.params.transactionId },
      });

      if (!transaction || transaction.category !== 'CUSTOMER_BOOKING') {
        return reply.code(404).send({ error: 'Customer booking transaction not found.' });
      }

      const { name, phone, email, notes } = request.body;
      if (!name?.trim() || !phone?.trim()) {
        return reply.code(400).send({ error: 'Name and phone are required.' });
      }

      const existingByPhone = await prisma.customer.findFirst({
        where: { phone: phone.trim() },
      });
      if (existingByPhone) {
        return reply.code(409).send({ error: `Customer with phone ${phone.trim()} already exists.` });
      }

      const customer = await prisma.customer.create({
        data: {
          name: name.trim(),
          phone: phone.trim(),
          email: email?.trim() || null,
          notes: notes?.trim() || null,
        },
      });

      const updated = await prisma.bankTransaction.update({
        where: { id: transaction.id },
        data: { customerId: customer.id },
      });

      return reply.code(201).send({
        customer,
        transaction: enrichTransaction(updated),
      });
    },
  });

  fastify.post('/banking/customer-bookings/:transactionId/bookings', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const transaction = await prisma.bankTransaction.findUnique({
        where: { id: request.params.transactionId },
        include: {
          customer: true,
          allocations: true,
        },
      });

      if (!transaction || transaction.category !== 'CUSTOMER_BOOKING') {
        return reply.code(404).send({ error: 'Customer booking transaction not found.' });
      }
      if (!transaction.customerId) {
        return reply.code(400).send({ error: 'Link a customer before creating bookings from this money.' });
      }
      const policy = await getOperationsPolicy();

      const bookingsInput = Array.isArray(request.body?.bookings) ? request.body.bookings : [];
      if (bookingsInput.length === 0) {
        return reply.code(400).send({ error: 'Add at least one batch allocation.' });
      }

      const alreadyAllocated = transaction.allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0);
      const availableAmount = Number(transaction.amount) - alreadyAllocated;
      const requestedAmount = bookingsInput.reduce((sum, entry) => sum + Number(entry.allocatedAmount || 0), 0);

      if (requestedAmount > availableAmount + 0.009) {
        return reply.code(400).send({ error: 'Allocated amount is more than the money still available on this transaction.' });
      }

      const batchIds = [...new Set(bookingsInput.map((entry) => entry.batchId).filter(Boolean))];
      const batches = await prisma.batch.findMany({
        where: {
          id: { in: batchIds },
          status: 'OPEN',
        },
      });
      const batchMap = new Map(batches.map((batch) => [batch.id, batch]));
      const batchUsage = new Map();
      const existingOrderCount = await getCustomerTrackedOrderCount(transaction.customerId);

      for (const [index, entry] of bookingsInput.entries()) {
        const batch = batchMap.get(entry.batchId);
        if (!batch) {
          return reply.code(400).send({ error: 'One of the selected batches is no longer open.' });
        }
        const quantity = Number(entry.quantity);
        const allocatedAmount = Number(entry.allocatedAmount);
        if (!Number.isInteger(quantity) || quantity <= 0) {
          return reply.code(400).send({ error: `Enter a whole crate quantity for ${batch.name}.` });
        }
        if (!allocatedAmount || allocatedAmount <= 0) {
          return reply.code(400).send({ error: `Enter the amount to allocate for ${batch.name}.` });
        }

        const orderValue = quantity * Number(batch.wholesalePrice);
        const minimumPayment = orderValue * (Number(policy.bookingMinimumPaymentPercent || 80) / 100);
        if (allocatedAmount > orderValue + 0.009) {
          return reply.code(400).send({ error: `Allocated amount for ${batch.name} is more than the booking value.` });
        }
        if (allocatedAmount + 0.009 < minimumPayment) {
          return reply.code(400).send({ error: `${batch.name} has not reached the ${Number(policy.bookingMinimumPaymentPercent || 80)}% minimum payment yet.` });
        }

        const perOrderLimit = getPerOrderCrateLimit(policy, existingOrderCount + index);
        if (quantity > perOrderLimit) {
          return reply.code(400).send({
            error: existingOrderCount + index < Number(policy.firstCustomerOrderLimitCount || 3)
              ? `${batch.name} is above the early-customer limit of ${Number(perOrderLimit).toLocaleString()} crates for this order.`
              : `${batch.name} is above the order limit of ${Number(perOrderLimit).toLocaleString()} crates.`,
          });
        }

        batchUsage.set(batch.id, (batchUsage.get(batch.id) || 0) + quantity);
      }

      for (const [batchId, requestedQty] of batchUsage.entries()) {
        const bookedAgg = await prisma.booking.aggregate({
          where: { batchId, status: { not: 'CANCELLED' } },
          _sum: { quantity: true },
        });
        const alreadyBooked = bookedAgg._sum.quantity || 0;
        const batch = batchMap.get(batchId);
        const remainingAvailable = batch.availableForBooking - alreadyBooked;
        if (requestedQty > remainingAvailable) {
          return reply.code(400).send({ error: `${batch.name} only has ${remainingAvailable} crates left for booking.` });
        }
      }

      const createdBookings = await prisma.$transaction(async (tx) => {
        const created = [];
        for (const entry of bookingsInput) {
          const batch = batchMap.get(entry.batchId);
          const quantity = Number(entry.quantity);
          const allocatedAmount = Number(entry.allocatedAmount);
          const orderValue = quantity * Number(batch.wholesalePrice);

          const booking = await tx.booking.create({
            data: {
              customerId: transaction.customerId,
              batchId: batch.id,
              quantity,
              amountPaid: allocatedAmount,
              orderValue,
              status: 'CONFIRMED',
              channel: 'backend',
              notes: entry.notes?.trim() || `Created from banking customer booking transaction ${transaction.reference || transaction.id}`,
            },
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
          });

          await tx.bookingPaymentAllocation.create({
            data: {
              bookingId: booking.id,
              bankTransactionId: transaction.id,
              amount: allocatedAmount,
              allocatedById: request.user.sub,
            },
          });

          created.push(booking);
        }
        return created;
      });

      const nextAllocatedAmount = await getTransactionAllocatedAmount(transaction.id);

      return reply.code(201).send({
        bookings: createdBookings.map((booking) => ({
          ...booking,
          amountPaid: Number(booking.amountPaid),
          orderValue: Number(booking.orderValue),
          batch: booking.batch ? {
            ...booking.batch,
            wholesalePrice: Number(booking.batch.wholesalePrice),
            eggTypeLabel: getCustomerEggTypeLabel(customerEggTypes, booking.batch.eggTypeKey || 'REGULAR'),
          } : null,
        })),
        allocatedAmount: nextAllocatedAmount,
        availableAmount: Math.max(0, Number(transaction.amount) - nextAllocatedAmount),
      });
    },
  });

  fastify.get('/banking/reconciliations', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const { bankAccountId, status, dateFrom, dateTo } = request.query;
      const where = {};
      if (bankAccountId) where.bankAccountId = bankAccountId;
      if (status) where.status = status;
      if (dateFrom || dateTo) {
        where.statementDate = {};
        if (dateFrom) where.statementDate.gte = new Date(dateFrom);
        if (dateTo) {
          const end = new Date(dateTo);
          end.setDate(end.getDate() + 1);
          where.statementDate.lt = end;
        }
      }

      const reconciliations = await prisma.bankReconciliation.findMany({
        where,
        include: {
          bankAccount: { select: { id: true, name: true, accountType: true, lastFour: true } },
          reconciledBy: { select: { firstName: true, lastName: true } },
          statementImport: { select: { id: true, originalFilename: true, statementDateFrom: true, statementDateTo: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({ reconciliations: reconciliations.map(enrichReconciliation) });
    },
  });

  fastify.post('/banking/reconciliations', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const { bankAccountId, statementImportId, statementDate, openingBalance, closingBalance, notes } = request.body;
      if (!bankAccountId) return reply.code(400).send({ error: 'bankAccountId is required' });
      if (!statementDate && !statementImportId) return reply.code(400).send({ error: 'statementDate or statementImportId is required' });
      if (closingBalance == null && !statementImportId) return reply.code(400).send({ error: 'closingBalance is required when no statement import is supplied' });

      const account = await prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
      if (!account) return reply.code(404).send({ error: 'Bank account not found' });

      let importRecord = null;
      if (statementImportId) {
        importRecord = await prisma.bankStatementImport.findUnique({ where: { id: statementImportId } });
        if (!importRecord) return reply.code(404).send({ error: 'Statement import not found' });
        if (importRecord.bankAccountId !== bankAccountId) {
          return reply.code(400).send({ error: 'Statement import does not belong to this bank account' });
        }
      }

      const effectiveStatementDate = importRecord?.statementDateTo || statementDate;
      const cutOff = endOfDay(effectiveStatementDate);

      const [inflows, outflows] = await Promise.all([
        prisma.bankTransaction.aggregate({
          where: { bankAccountId, direction: 'INFLOW', transactionDate: { lte: cutOff } },
          _sum: { amount: true },
        }),
        prisma.bankTransaction.aggregate({
          where: { bankAccountId, direction: 'OUTFLOW', transactionDate: { lte: cutOff } },
          _sum: { amount: true },
        }),
      ]);

      const systemBalance = Number(inflows._sum.amount || 0) - Number(outflows._sum.amount || 0);
      const finalClosingBalance = Number(importRecord?.closingBalance ?? closingBalance);
      const finalOpeningBalance = importRecord?.openingBalance ?? openingBalance ?? null;
      const variance = finalClosingBalance - systemBalance;
      const status = Math.abs(variance) < 0.01 ? 'BALANCED' : 'VARIANCE';

      const reconciliation = await prisma.bankReconciliation.create({
        data: {
          bankAccountId,
          statementImportId: importRecord?.id || null,
          statementDate: new Date(effectiveStatementDate),
          openingBalance: finalOpeningBalance == null ? null : Number(finalOpeningBalance),
          closingBalance: finalClosingBalance,
          systemBalance,
          variance,
          status,
          notes: notes || null,
          reconciledById: request.user.sub,
        },
        include: {
          bankAccount: { select: { id: true, name: true, accountType: true, lastFour: true } },
          reconciledBy: { select: { firstName: true, lastName: true } },
          statementImport: { select: { id: true, originalFilename: true } },
        },
      });

      return reply.code(201).send({ reconciliation: enrichReconciliation(reconciliation) });
    },
  });

  fastify.get('/banking/reconciliation', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const accounts = await prisma.bankAccount.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });

      const reconciliation = [];
      for (const account of accounts) {
        const summary = await getAccountSummary(account.id);
        reconciliation.push({
          id: account.id,
          account: account.name,
          accountType: account.accountType,
          lastFour: account.lastFour,
          isVirtual: account.isVirtual,
          supportsStatementImport: account.supportsStatementImport,
          ...summary,
        });
      }

      return reply.send({ reconciliation });
    },
  });

  fastify.get('/banking/unbooked-deposits', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const deposits = await prisma.bankTransaction.findMany({
        where: {
          direction: 'INFLOW',
          category: 'CUSTOMER_DEPOSIT',
        },
        include: {
          customer: { select: { name: true, phone: true } },
          bankAccount: { select: { name: true } },
          enteredBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { transactionDate: 'desc' },
      });

      const allocations = deposits.length > 0
        ? await prisma.bookingPaymentAllocation.groupBy({
            by: ['bankTransactionId'],
            where: {
              bankTransactionId: { in: deposits.map((deposit) => deposit.id) },
            },
            _sum: { amount: true },
          })
        : [];

      const allocationMap = new Map(
        allocations.map((allocation) => [allocation.bankTransactionId, Number(allocation._sum.amount || 0)])
      );

      const unbookedDeposits = deposits
        .map((deposit) => {
          const allocatedAmount = allocationMap.get(deposit.id) || 0;
          const availableAmount = Math.max(0, Number(deposit.amount) - allocatedAmount);
          return {
            ...enrichTransaction(deposit),
            allocatedAmount,
            availableAmount,
          };
        })
        .filter((deposit) => deposit.availableAmount > 0.009);

      const total = unbookedDeposits.reduce((sum, deposit) => sum + deposit.availableAmount, 0);
      return reply.send({
        deposits: unbookedDeposits,
        total,
        count: unbookedDeposits.length,
      });
    },
  });

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

      const totalLiability = bookings.reduce((sum, booking) => sum + Number(booking.amountPaid), 0);

      return reply.send({
        bookings: bookings.map((booking) => ({
          id: booking.id,
          customer: booking.customer.name,
          phone: booking.customer.phone,
          batch: booking.batch.name,
          batchDate: booking.batch.expectedDate,
          quantity: booking.quantity,
          amountPaid: Number(booking.amountPaid),
          orderValue: Number(booking.orderValue),
          bookedOn: booking.createdAt,
        })),
        totalLiability,
        count: bookings.length,
      });
    },
  });

  fastify.get('/banking/expenses', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const { dateFrom, dateTo, category } = request.query;

      const expenseCategories = [
        'REFUND',
        'BANK_CHARGES',
        'FARMER_PAYMENT',
        'SALARY',
        'DIESEL_FUEL',
        'INTERNET',
        'MARKETING',
        'OTHER_EXPENSE',
        'UNALLOCATED_EXPENSE',
        'INTERNAL_TRANSFER_OUT',
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
      for (const expense of expenses) {
        if (!byCategory[expense.category]) byCategory[expense.category] = { count: 0, total: 0 };
        byCategory[expense.category].count += 1;
        byCategory[expense.category].total += Number(expense.amount);
      }

      const total = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);

      return reply.send({
        expenses: expenses.map(enrichTransaction),
        byCategory,
        total,
        count: expenses.length,
      });
    },
  });

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
          bankAccount: { select: { name: true, accountType: true, isVirtual: true } },
          customer: { select: { name: true } },
        },
        orderBy: { transactionDate: 'desc' },
      });

      const totalInflows = transactions.filter((transaction) => transaction.direction === 'INFLOW').reduce((sum, transaction) => sum + Number(transaction.amount), 0);
      const totalOutflows = transactions.filter((transaction) => transaction.direction === 'OUTFLOW').reduce((sum, transaction) => sum + Number(transaction.amount), 0);

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
