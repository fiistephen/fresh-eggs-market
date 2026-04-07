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
} from '../utils/banking.js';
import { getTransactionCategoryConfig } from '../utils/appSettings.js';
import { parseProvidusStatement } from '../utils/providusStatement.js';

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

function endOfDay(dateInput) {
  const date = new Date(dateInput);
  date.setUTCHours(23, 59, 59, 999);
  return date;
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

function validateDirectionAndCategory(direction, category) {
  if (!direction || !VALID_DIRECTIONS.includes(direction)) {
    return 'Direction must be INFLOW or OUTFLOW';
  }
  if (!category || !VALID_CATEGORIES.includes(category)) {
    return `Invalid category. Valid: ${VALID_CATEGORIES.join(', ')}`;
  }
  if (direction === 'INFLOW' && !INFLOW_CATEGORIES.includes(category)) {
    return `Category ${category} cannot be an inflow`;
  }
  if (direction === 'OUTFLOW' && !OUTFLOW_CATEGORIES.includes(category)) {
    return `Category ${category} cannot be an outflow`;
  }
  return null;
}

async function validateCustomer(customerId) {
  if (!customerId) return null;
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  return customer || false;
}

async function createBankTransaction({
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

export default async function bankingRoutes(fastify) {
  fastify.get('/banking/meta', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async () => {
      const transactionCategories = await getTransactionCategoryConfig();
      return { transactionCategories };
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
      const { bankAccountId, category, direction, dateFrom, dateTo, customerId, sourceType, limit = 50, offset = 0 } = request.query;

      const where = {};
      if (bankAccountId) where.bankAccountId = bankAccountId;
      if (category) where.category = category;
      if (direction) where.direction = direction;
      if (customerId) where.customerId = customerId;
      if (sourceType) where.sourceType = sourceType;
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

      if (!bankAccountId) return reply.code(400).send({ error: 'Bank account is required' });
      const categoryError = validateDirectionAndCategory(direction, category);
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
      if (!Array.isArray(rows) || rows.length === 0) {
        return reply.code(400).send({ error: 'rows must be a non-empty array' });
      }

      const validationErrors = [];

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const categoryError = validateDirectionAndCategory(row.direction, row.category);
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
          select: { fingerprint: true, id: true, reviewStatus: true },
        }),
      ]);

      const existingTransactionSet = new Set(existingTransactions.map((txn) => txn.sourceFingerprint));
      const existingLineSet = new Set(existingLines.map((line) => line.fingerprint));

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

      const counts = {
        total: importRecord.lines.length,
        ready: importRecord.lines.filter((line) => line.reviewStatus === 'READY_TO_POST').length,
        pending: importRecord.lines.filter((line) => line.reviewStatus === 'PENDING_REVIEW').length,
        duplicate: importRecord.lines.filter((line) => line.reviewStatus === 'DUPLICATE').length,
      };

      return reply.code(201).send({
        import: enrichImportRecord(importRecord),
        counts,
        preview: importRecord.lines.map(enrichStatementLine),
      });
    },
  });

  fastify.get('/banking/imports', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const { bankAccountId, status, limit = 20 } = request.query;
      const where = {};
      if (bankAccountId) where.bankAccountId = bankAccountId;
      if (status) where.status = status;

      const imports = await prisma.bankStatementImport.findMany({
        where,
        include: {
          bankAccount: { select: { id: true, name: true, accountType: true, lastFour: true } },
          importedBy: { select: { firstName: true, lastName: true } },
          _count: { select: { lines: true, reconciliations: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit, 10),
      });

      return reply.send({
        imports: imports.map((record) => enrichImportRecord(record)),
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

      const { selectedCategory, selectedCustomerId, notes, reviewStatus } = request.body;
      const updates = {};

      if (selectedCategory !== undefined) {
        if (!VALID_CATEGORIES.includes(selectedCategory)) {
          return reply.code(400).send({ error: 'Invalid category' });
        }
        const requiredDirection = getCategoryDirection(selectedCategory);
        if (existing.direction && requiredDirection && existing.direction !== requiredDirection) {
          return reply.code(400).send({ error: `Category ${selectedCategory} does not match line direction ${existing.direction}` });
        }
        updates.selectedCategory = selectedCategory;
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

      if (notes !== undefined) updates.notes = notes || null;

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
        },
      });

      return reply.send({ line: enrichStatementLine(line) });
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

        const transaction = await createBankTransaction({
          bankAccountId: importRecord.bankAccountId,
          direction: line.direction,
          category: line.selectedCategory || line.suggestedCategory || (line.direction === 'INFLOW' ? 'UNALLOCATED_INCOME' : 'UNALLOCATED_EXPENSE'),
          amount,
          description: line.description,
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
