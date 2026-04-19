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
import { getOpenBatchBookingAvailability } from '../utils/batchAvailability.js';

const CUSTOMER_DEPOSIT_QUEUE_CATEGORIES = ['CUSTOMER_DEPOSIT', 'CUSTOMER_BOOKING', 'UNALLOCATED_INCOME'];

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

function enrichMonthClose(close) {
  if (!close) return null;
  return {
    ...close,
    unresolvedSnapshot: close.unresolvedSnapshot || {},
    accountSnapshot: close.accountSnapshot || [],
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

function getMonthWindow(monthKey) {
  const [yearString, monthString] = String(monthKey || '').split('-');
  const year = Number(yearString);
  const monthIndex = Number(monthString) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    throw new Error('Invalid month');
  }

  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const nextStart = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0));
  const end = new Date(nextStart.getTime() - 1);
  const label = start.toLocaleDateString('en-NG', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return { start, nextStart, end, label };
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

function serializeApprovalTransaction(transaction) {
  if (!transaction) return null;
  return {
    id: transaction.id,
    bankAccountId: transaction.bankAccountId,
    bankAccountName: transaction.bankAccount?.name || null,
    direction: transaction.direction,
    category: transaction.category,
    amount: Number(transaction.amount),
    description: transaction.description || null,
    reference: transaction.reference || null,
    transactionDate: transaction.transactionDate,
    sourceType: transaction.sourceType,
    customerId: transaction.customerId || null,
    customerName: transaction.customer?.name || null,
    farmerId: transaction.farmerId || null,
    farmerName: transaction.farmer?.name || null,
    enteredById: transaction.enteredById,
    enteredByName: transaction.enteredBy
      ? `${transaction.enteredBy.firstName || ''} ${transaction.enteredBy.lastName || ''}`.trim() || null
      : null,
    internalTransferGroupId: transaction.internalTransferGroupId || null,
    createdAt: transaction.createdAt,
  };
}

function enrichTransactionForUser(transaction, user) {
  const permission = canManageManualBankTransaction(transaction, user);
  return {
    ...enrichTransaction(transaction),
    approvalEligible: permission.allowed,
    approvalProtectionReason: permission.allowed ? null : permission.error,
  };
}

function canManageManualBankTransaction(transaction, user) {
  if (!transaction) return { allowed: false, error: 'Transaction not found.' };
  if (transaction.sourceType !== 'MANUAL') {
    return { allowed: false, error: 'Only manual Banking entries can be sent for approval here.' };
  }
  if (user.role === 'RECORD_KEEPER' && transaction.enteredById !== user.sub) {
    return { allowed: false, error: 'You can only request changes for entries you recorded yourself.' };
  }
  if (transaction.saleId || transaction.bookingId || transaction.statementLine || transaction.internalTransferGroupId) {
    return { allowed: false, error: 'This transaction is already tied to another workflow and cannot be changed here.' };
  }
  if ((transaction.allocations?.length || 0) > 0) {
    return { allowed: false, error: 'This transaction is already linked to bookings and cannot be changed here.' };
  }
  if ((transaction.cashDepositBatchLinks?.length || 0) > 0 || transaction.cashDepositOutflow) {
    return { allowed: false, error: 'This transaction is already linked to a cash deposit flow and cannot be changed here.' };
  }
  if ((transaction.farmerLedgerEntries?.length || 0) > 0) {
    return { allowed: false, error: 'This transaction is already linked to a farmer ledger flow and cannot be changed here.' };
  }
  return { allowed: true };
}

function normalizeApprovalEditPayload(payload = {}) {
  return {
    bankAccountId: payload.bankAccountId || null,
    direction: payload.direction || null,
    category: payload.category || null,
    amount: payload.amount == null || payload.amount === '' ? null : Number(payload.amount),
    description: String(payload.description || '').trim() || null,
    reference: String(payload.reference || '').trim() || null,
    transactionDate: payload.transactionDate || null,
  };
}

function diffApprovalTransaction(beforeData = {}, afterData = {}) {
  const changed = {};
  for (const key of ['bankAccountId', 'direction', 'category', 'amount', 'description', 'reference', 'transactionDate']) {
    const beforeValue = beforeData[key] == null ? null : beforeData[key];
    const afterValue = afterData[key] == null ? null : afterData[key];
    if (String(beforeValue) !== String(afterValue)) {
      changed[key] = afterValue;
    }
  }
  return changed;
}

async function validateManualBankTransactionEdit({
  transaction,
  proposed,
  categoryConfig,
}) {
  if (!proposed.bankAccountId) return 'Bank account is required.';
  const categoryError = validateDirectionAndCategory(proposed.direction, proposed.category, categoryConfig);
  if (categoryError) return categoryError;
  if (!proposed.amount || Number(proposed.amount) <= 0) return 'Amount must be positive.';
  if (!proposed.transactionDate) return 'Transaction date is required.';

  const account = await prisma.bankAccount.findUnique({ where: { id: proposed.bankAccountId } });
  if (!account) return 'Bank account not found.';

  const currentFingerprint = {
    bankAccountId: transaction.bankAccountId,
    direction: transaction.direction,
    category: transaction.category,
    amount: Number(transaction.amount),
    description: transaction.description || null,
    reference: transaction.reference || null,
    transactionDate: new Date(transaction.transactionDate).toISOString().slice(0, 10),
  };

  const proposedFingerprint = {
    ...proposed,
    amount: Number(proposed.amount),
    description: proposed.description || null,
    reference: proposed.reference || null,
    transactionDate: proposed.transactionDate,
  };

  const changedFields = diffApprovalTransaction(currentFingerprint, proposedFingerprint);
  if (Object.keys(changedFields).length === 0) {
    return 'No changes were detected in this request.';
  }

  return null;
}

async function getApprovalRequestOrReply(request, reply) {
  const approvalRequest = await prisma.approvalRequest.findUnique({
    where: { id: request.params.id },
    include: {
      requestedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
      approvedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
    },
  });

  if (!approvalRequest) {
    reply.code(404).send({ error: 'Approval request not found.' });
    return null;
  }
  if (approvalRequest.entityType !== 'BANK_TRANSACTION') {
    reply.code(400).send({ error: 'This approval request is not a bank transaction request.' });
    return null;
  }
  return approvalRequest;
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

async function validateFarmer(farmerId) {
  if (!farmerId) return null;
  const farmer = await prisma.farmer.findUnique({ where: { id: farmerId } });
  if (!farmer || farmer.isActive === false) return false;
  return farmer;
}

async function finalizePortalTransferBookingFromStatement({
  portalCheckoutId,
  bankTransactionId,
  statementLineId,
  enteredById,
}) {
  const checkout = await prisma.portalCheckout.findUnique({
    where: { id: portalCheckoutId },
    include: {
      batch: {
        select: {
          id: true,
          name: true,
          expectedDate: true,
        },
      },
    },
  });

  if (!checkout || checkout.checkoutType !== 'BOOK_UPCOMING' || checkout.paymentMethod !== 'TRANSFER') {
    throw new Error('Portal booking transfer was not found.');
  }
  if (checkout.status !== 'ADMIN_CONFIRMED') {
    throw new Error('Portal booking transfer is not waiting for statement confirmation.');
  }

  return prisma.$transaction(async (tx) => {
    const booking = checkout.bookingId
      ? await tx.booking.update({
          where: { id: checkout.bookingId },
          data: { status: 'CONFIRMED' },
        })
      : await tx.booking.create({
          data: {
            customerId: checkout.customerId,
            batchId: checkout.batchId,
            quantity: checkout.quantity,
            amountPaid: checkout.amountToPay,
            orderValue: checkout.orderValue,
            status: 'CONFIRMED',
            channel: 'website',
            notes: checkout.notes?.trim() || `Confirmed from statement line for portal booking ${checkout.reference}`,
          },
        });

    await tx.bankTransaction.update({
      where: { id: bankTransactionId },
      data: {
        customerId: checkout.customerId,
        bookingId: booking.id,
      },
    });

    await tx.bookingPaymentAllocation.upsert({
      where: {
        bookingId_bankTransactionId: {
          bookingId: booking.id,
          bankTransactionId,
        },
      },
      update: {
        amount: checkout.amountToPay,
        allocatedById: enteredById,
      },
      create: {
        bookingId: booking.id,
        bankTransactionId,
        amount: checkout.amountToPay,
        allocatedById: enteredById,
      },
    });

    await tx.portalCheckout.update({
      where: { id: checkout.id },
      data: {
        status: 'PAID',
        bookingId: booking.id,
        verifiedAt: new Date(),
        confirmationStatementLineId: statementLineId,
      },
    });

    await tx.portalCheckoutDecision.create({
      data: {
        portalCheckoutId: checkout.id,
        actorId: enteredById,
        decisionType: 'STATEMENT_CONFIRMED',
        statusBefore: 'ADMIN_CONFIRMED',
        statusAfter: 'PAID',
        notes: 'Matched to bank statement line and fully confirmed.',
      },
    });

    return booking;
  });
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
  farmerId,
  bookingId,
  enteredById,
  sourceType = 'MANUAL',
  sourceFingerprint = null,
  internalTransferGroupId = null,
  client = prisma,
}) {
  return client.bankTransaction.create({
    data: {
      bankAccountId,
      direction,
      category,
      amount: Number(amount),
      description: description || null,
      reference: reference || null,
      transactionDate: new Date(transactionDate),
      customerId: customerId || null,
      farmerId: farmerId || null,
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
      farmer: { select: { id: true, name: true, phone: true } },
      enteredBy: { select: { firstName: true, lastName: true } },
    },
  });
}

function buildFarmerPaymentNotes(transaction) {
  return [transaction.description, transaction.reference].filter(Boolean).join(' · ') || null;
}

async function createFarmerLedgerEntryFromBankTransaction({
  transaction,
  enteredById,
  client = prisma,
}) {
  if (!transaction?.farmerId || transaction.category !== 'FARMER_PAYMENT') return null;

  return client.farmerLedgerEntry.create({
    data: {
      farmerId: transaction.farmerId,
      bankTransactionId: transaction.id,
      createdById: enteredById,
      entryType: 'PREPAYMENT',
      amount: Number(transaction.amount),
      balanceEffect: Number(transaction.amount),
      entryDate: new Date(transaction.transactionDate),
      notes: buildFarmerPaymentNotes(transaction),
    },
  });
}

async function getCashSaleAllocationMap(transactionIds = [], { upToDate } = {}) {
  if (transactionIds.length === 0) return new Map();

  const where = { bankTransactionId: { in: transactionIds } };
  if (upToDate) {
    where.cashDepositBatch = {
      depositDate: { lte: upToDate },
    };
  }

  const allocations = await prisma.cashDepositBatchTransaction.groupBy({
    by: ['bankTransactionId'],
    where,
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

  const allocationMap = await getCashSaleAllocationMap(transactions.map((transaction) => transaction.id), { upToDate });

  return transactions
    .map((transaction) => {
      const allocatedAmount = allocationMap.get(transaction.id) || 0;
      const availableAmount = Math.max(0, Number(transaction.amount) - allocatedAmount);
      const ageHours = hoursBetween(transaction.transactionDate);
      return {
        ...enrichTransaction(transaction),
        allocatedAmount,
        availableAmount,
        ageHours,
      };
    })
    .filter((transaction) => transaction.availableAmount > 0.009);
}

function hoursBetween(fromDate, toDate = new Date()) {
  return (new Date(toDate).getTime() - new Date(fromDate).getTime()) / (1000 * 60 * 60);
}

async function getCashDepositWorkspace(policyInput, { dateFrom, dateTo, undepositedLimit, undepositedOffset, depositedLimit, depositedOffset } = {}) {
  const policy = policyInput || await getOperationsPolicy();
  const undepositedThresholdHours = Number(policy.undepositedCashAlertHours || 24);

  // Date filter for deposited batches
  const depositedWhere = { status: { in: ['CONFIRMED', 'PENDING_CONFIRMATION', 'OVERDUE'] } };
  if (dateFrom || dateTo) {
    depositedWhere.depositDate = {};
    if (dateFrom) depositedWhere.depositDate.gte = new Date(dateFrom);
    if (dateTo) { const end = new Date(dateTo); end.setDate(end.getDate() + 1); depositedWhere.depositDate.lt = end; }
  }

  const depositedInclude = {
    createdBy: { select: { firstName: true, lastName: true } },
    confirmedBy: { select: { firstName: true, lastName: true } },
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
      orderBy: { createdAt: 'asc' },
    },
  };

  const [availableCashTransactions, depositedBatches, depositedTotal] = await Promise.all([
    getAvailableCashSaleTransactions(),
    prisma.cashDepositBatch.findMany({
      where: depositedWhere,
      include: depositedInclude,
      orderBy: [{ depositDate: 'desc' }, { createdAt: 'desc' }],
      take: depositedLimit || 20,
      skip: depositedOffset || 0,
    }),
    prisma.cashDepositBatch.count({ where: depositedWhere }),
  ]);

  // Apply date filter to undeposited cash too
  let undepositedTransactions = availableCashTransactions;
  if (dateFrom) {
    const from = new Date(dateFrom);
    undepositedTransactions = undepositedTransactions.filter((t) => new Date(t.transactionDate) >= from);
  }
  if (dateTo) {
    const to = new Date(dateTo); to.setDate(to.getDate() + 1);
    undepositedTransactions = undepositedTransactions.filter((t) => new Date(t.transactionDate) < to);
  }

  const undepositedTotalCount = undepositedTransactions.length;
  const undepositedTotalAmount = undepositedTransactions.reduce((sum, t) => sum + Number(t.availableAmount), 0);

  // Apply pagination to undeposited
  if (undepositedOffset) undepositedTransactions = undepositedTransactions.slice(undepositedOffset);
  if (undepositedLimit) undepositedTransactions = undepositedTransactions.slice(0, undepositedLimit);

  const depositedNormalized = depositedBatches.map((batch) => ({
    ...batch,
    amount: Number(batch.amount),
    transactions: batch.transactions.map((entry) => ({
      ...entry,
      amountIncluded: Number(entry.amountIncluded),
      bankTransaction: entry.bankTransaction ? enrichTransaction(entry.bankTransaction) : null,
    })),
  }));

  return {
    undepositedCash: {
      count: undepositedTotalCount,
      total: undepositedTotalAmount,
      thresholdHours: undepositedThresholdHours,
      transactions: undepositedTransactions,
    },
    // Backward compat
    pendingDeposits: { count: 0, total: 0, thresholdHours: 24, batches: [] },
    confirmedRecently: [],
    deposited: {
      count: depositedTotal,
      total: depositedNormalized.reduce((sum, batch) => sum + Number(batch.amount || 0), 0),
      batches: depositedNormalized,
    },
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


async function buildMonthEndReviewData(monthKey) {
  const { start, nextStart, end, label } = getMonthWindow(monthKey);

  const [accountsRaw, hangingDepositTransactions, pendingPortalTransfers, pendingCashDeposits, pendingApprovals, undepositedCash, unallocatedTransactions] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.bankTransaction.findMany({
      where: {
        direction: 'INFLOW',
        category: { in: CUSTOMER_DEPOSIT_QUEUE_CATEGORIES },
        customerId: { not: null },
        transactionDate: { lt: nextStart },
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        bankAccount: { select: { id: true, name: true, accountType: true, lastFour: true, isVirtual: true, supportsStatementImport: true } },
        enteredBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.portalCheckout.findMany({
      where: {
        paymentMethod: 'TRANSFER',
        status: { in: ['AWAITING_TRANSFER', 'ADMIN_CONFIRMED'] },
        confirmationStatementLineId: null,
        createdAt: { lt: nextStart },
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        batch: { select: { id: true, name: true, eggTypeKey: true } },
        adminConfirmedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    }),
    prisma.cashDepositBatch.findMany({
      where: {
        depositDate: { lt: nextStart },
        status: { in: ['PENDING_CONFIRMATION', 'OVERDUE'] },
      },
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        transactions: { select: { id: true } },
      },
      orderBy: [{ depositDate: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.approvalRequest.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: nextStart },
      },
      include: {
        requestedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    }),
    getAvailableCashSaleTransactions({ upToDate: end }),
    // V3 Phase 3: count transactions still categorized as UNALLOCATED_INCOME or
    // UNALLOCATED_EXPENSE for the month — these must be re-categorized before closing.
    prisma.bankTransaction.findMany({
      where: {
        category: { in: ['UNALLOCATED_INCOME', 'UNALLOCATED_EXPENSE'] },
        transactionDate: { gte: start, lt: nextStart },
      },
      include: {
        bankAccount: { select: { id: true, name: true, accountType: true, lastFour: true } },
        customer: { select: { id: true, name: true } },
        enteredBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
    }),
  ]);

  const hangingAllocationMap = hangingDepositTransactions.length > 0
    ? new Map(
        (await prisma.bookingPaymentAllocation.groupBy({
          by: ['bankTransactionId'],
          where: {
            bankTransactionId: { in: hangingDepositTransactions.map((transaction) => transaction.id) },
            createdAt: { lt: nextStart },
          },
          _sum: { amount: true },
        })).map((entry) => [entry.bankTransactionId, Number(entry._sum.amount || 0)]),
      )
    : new Map();

  const hangingDeposits = hangingDepositTransactions
    .map((transaction) => {
      const allocatedAmount = hangingAllocationMap.get(transaction.id) || 0;
      const availableAmount = Math.max(0, Number(transaction.amount) - allocatedAmount);
      return {
        ...enrichTransaction(transaction),
        allocatedAmount,
        availableAmount,
      };
    })
    .filter((transaction) => transaction.availableAmount > 0.009);

  const accounts = await Promise.all(accountsRaw.map(async (account) => {
    const [inflows, outflows, transactionCount, latestReconciliation, monthEndReconciliation] = await Promise.all([
      prisma.bankTransaction.aggregate({
        where: { bankAccountId: account.id, direction: 'INFLOW', transactionDate: { lt: nextStart } },
        _sum: { amount: true },
      }),
      prisma.bankTransaction.aggregate({
        where: { bankAccountId: account.id, direction: 'OUTFLOW', transactionDate: { lt: nextStart } },
        _sum: { amount: true },
      }),
      prisma.bankTransaction.count({
        where: { bankAccountId: account.id, transactionDate: { lt: nextStart } },
      }),
      prisma.bankReconciliation.findFirst({
        where: { bankAccountId: account.id, statementDate: { lt: nextStart } },
        orderBy: [{ statementDate: 'desc' }, { createdAt: 'desc' }],
        include: {
          reconciledBy: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.bankReconciliation.findFirst({
        where: { bankAccountId: account.id, statementDate: { gte: start, lt: nextStart } },
        orderBy: [{ statementDate: 'desc' }, { createdAt: 'desc' }],
        include: {
          reconciledBy: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);

    return {
      ...account,
      totalInflows: Number(inflows._sum.amount || 0),
      totalOutflows: Number(outflows._sum.amount || 0),
      systemBalance: Number(inflows._sum.amount || 0) - Number(outflows._sum.amount || 0),
      transactionCount,
      latestReconciliation: latestReconciliation ? enrichReconciliation(latestReconciliation) : null,
      monthEndReconciliation: monthEndReconciliation ? enrichReconciliation(monthEndReconciliation) : null,
    };
  }));

  const pendingTransferItems = pendingPortalTransfers.map((checkout) => ({
    ...checkout,
    unitPrice: Number(checkout.unitPrice || 0),
    orderValue: Number(checkout.orderValue || 0),
    amountToPay: Number(checkout.amountToPay || 0),
    balanceAfterPayment: Number(checkout.balanceAfterPayment || 0),
  }));

  const pendingCashDepositItems = pendingCashDeposits.map((batch) => ({
    ...batch,
    amount: Number(batch.amount),
  }));

  return {
    month: monthKey,
    label,
    window: { start, end },
    accounts,
    accountsMissingMonthEndBalance: accounts.filter((account) => !account.monthEndReconciliation).length,
    unresolved: {
      hangingDeposits: {
        count: hangingDeposits.length,
        total: hangingDeposits.reduce((sum, transaction) => sum + Number(transaction.availableAmount || 0), 0),
        items: hangingDeposits,
      },
      pendingTransferConfirmations: {
        count: pendingTransferItems.length,
        total: pendingTransferItems.reduce((sum, checkout) => sum + Number(checkout.amountToPay || 0), 0),
        items: pendingTransferItems,
      },
      undepositedCash: {
        count: undepositedCash.length,
        total: undepositedCash.reduce((sum, transaction) => sum + Number(transaction.availableAmount || 0), 0),
        items: undepositedCash,
      },
      pendingCashDeposits: {
        count: pendingCashDepositItems.length,
        total: pendingCashDepositItems.reduce((sum, batch) => sum + Number(batch.amount || 0), 0),
        items: pendingCashDepositItems,
      },
      pendingApprovals: {
        count: pendingApprovals.length,
        items: pendingApprovals,
      },
      unallocatedTransactions: {
        count: unallocatedTransactions.length,
        total: unallocatedTransactions.reduce((sum, t) => sum + Number(t.amount || 0), 0),
        items: unallocatedTransactions.map(enrichTransaction),
      },
    },
  };
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
      if (category) {
        const cats = String(category).split(',').map((c) => c.trim()).filter(Boolean);
        where.category = cats.length === 1 ? cats[0] : { in: cats };
      }
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
          {
            farmer: {
              is: {
                OR: [
                  { name: { contains: searchTerm, mode: 'insensitive' } },
                  { phone: { contains: searchTerm, mode: 'insensitive' } },
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
            farmer: { select: { id: true, name: true, phone: true } },
            enteredBy: { select: { firstName: true, lastName: true } },
            statementLine: { select: { id: true } },
            allocations: { select: { id: true } },
            cashDepositBatchLinks: { select: { id: true } },
            cashDepositOutflow: { select: { id: true } },
            farmerLedgerEntries: { select: { id: true } },
          },
          orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
          take: parseInt(limit, 10),
          skip: parseInt(offset, 10),
        }),
        prisma.bankTransaction.count({ where }),
      ]);

      return reply.send({ transactions: transactions.map((transaction) => enrichTransactionForUser(transaction, request.user)), total });
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
          farmer: true,
          enteredBy: { select: { firstName: true, lastName: true } },
          statementLine: { select: { id: true } },
          allocations: { select: { id: true } },
          cashDepositBatchLinks: { select: { id: true } },
          cashDepositOutflow: { select: { id: true } },
          farmerLedgerEntries: { select: { id: true } },
        },
      });
      if (!txn) return reply.code(404).send({ error: 'Transaction not found' });
      return reply.send({ transaction: enrichTransactionForUser(txn, request.user) });
    },
  });

  fastify.get('/banking/approval-requests', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const { status, type } = request.query;
      const where = {};
      if (status) where.status = status;
      if (type) where.type = type;
      if (request.user.role !== 'ADMIN') {
        where.requestedById = request.user.sub;
      }

      const approvalRequests = await prisma.approvalRequest.findMany({
        where,
        include: {
          requestedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
          approvedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      });

      const entityIds = approvalRequests
        .filter((entry) => entry.entityType === 'BANK_TRANSACTION')
        .map((entry) => entry.entityId);

      const transactions = entityIds.length > 0
        ? await prisma.bankTransaction.findMany({
            where: { id: { in: entityIds } },
            include: {
              bankAccount: { select: { id: true, name: true, accountType: true, lastFour: true } },
              customer: { select: { id: true, name: true, phone: true } },
              farmer: { select: { id: true, name: true, phone: true } },
              enteredBy: { select: { firstName: true, lastName: true } },
            },
          })
        : [];

      const transactionMap = new Map(transactions.map((transaction) => [transaction.id, transaction]));

      return reply.send({
        approvalRequests: approvalRequests.map((entry) => ({
          ...entry,
          entity: transactionMap.get(entry.entityId)
            ? serializeApprovalTransaction(transactionMap.get(entry.entityId))
            : null,
        })),
      });
    },
  });

  fastify.post('/banking/transactions/:id/request-delete', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const transaction = await prisma.bankTransaction.findUnique({
        where: { id: request.params.id },
        include: {
          bankAccount: { select: { id: true, name: true, accountType: true, lastFour: true } },
          customer: { select: { id: true, name: true, phone: true } },
          farmer: { select: { id: true, name: true, phone: true } },
          enteredBy: { select: { firstName: true, lastName: true } },
          statementLine: { select: { id: true } },
          allocations: { select: { id: true } },
          cashDepositBatchLinks: { select: { id: true } },
          cashDepositOutflow: { select: { id: true } },
          farmerLedgerEntries: { select: { id: true } },
        },
      });

      if (!transaction) return reply.code(404).send({ error: 'Transaction not found.' });

      const permission = canManageManualBankTransaction(transaction, request.user);
      if (!permission.allowed) {
        return reply.code(400).send({ error: permission.error });
      }

      const existingPending = await prisma.approvalRequest.findFirst({
        where: {
          type: 'BANK_TRANSACTION_DELETE',
          entityType: 'BANK_TRANSACTION',
          entityId: transaction.id,
          status: 'PENDING',
        },
      });

      if (existingPending) {
        return reply.code(409).send({ error: 'A delete approval request is already waiting for this transaction.' });
      }

      const approvalRequest = await prisma.approvalRequest.create({
        data: {
          type: 'BANK_TRANSACTION_DELETE',
          entityType: 'BANK_TRANSACTION',
          entityId: transaction.id,
          requestedById: request.user.sub,
          reason: String(request.body?.reason || '').trim() || null,
          beforeData: serializeApprovalTransaction(transaction),
        },
        include: {
          requestedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
          approvedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
        },
      });

      return reply.code(201).send({ approvalRequest });
    },
  });

  fastify.post('/banking/transactions/:id/request-edit', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const transaction = await prisma.bankTransaction.findUnique({
        where: { id: request.params.id },
        include: {
          bankAccount: { select: { id: true, name: true, accountType: true, lastFour: true } },
          customer: { select: { id: true, name: true, phone: true } },
          farmer: { select: { id: true, name: true, phone: true } },
          enteredBy: { select: { firstName: true, lastName: true } },
          statementLine: { select: { id: true } },
          allocations: { select: { id: true } },
          cashDepositBatchLinks: { select: { id: true } },
          cashDepositOutflow: { select: { id: true } },
          farmerLedgerEntries: { select: { id: true } },
        },
      });

      if (!transaction) return reply.code(404).send({ error: 'Transaction not found.' });

      const permission = canManageManualBankTransaction(transaction, request.user);
      if (!permission.allowed) {
        return reply.code(400).send({ error: permission.error });
      }

      const existingPending = await prisma.approvalRequest.findFirst({
        where: {
          type: 'BANK_TRANSACTION_EDIT',
          entityType: 'BANK_TRANSACTION',
          entityId: transaction.id,
          status: 'PENDING',
        },
      });

      if (existingPending) {
        return reply.code(409).send({ error: 'An edit approval request is already waiting for this transaction.' });
      }

      const categoryConfig = await getTransactionCategoryConfig();
      const proposed = normalizeApprovalEditPayload(request.body);
      const validationError = await validateManualBankTransactionEdit({
        transaction,
        proposed,
        categoryConfig,
      });

      if (validationError) {
        return reply.code(400).send({ error: validationError });
      }

      const currentSnapshot = serializeApprovalTransaction(transaction);
      const proposedSnapshot = {
        ...currentSnapshot,
        bankAccountId: proposed.bankAccountId,
        bankAccountName: transaction.bankAccountId === proposed.bankAccountId
          ? currentSnapshot.bankAccountName
          : (await prisma.bankAccount.findUnique({ where: { id: proposed.bankAccountId }, select: { name: true } }))?.name || null,
        direction: proposed.direction,
        category: proposed.category,
        amount: Number(proposed.amount),
        description: proposed.description,
        reference: proposed.reference,
        transactionDate: new Date(proposed.transactionDate).toISOString(),
      };

      const approvalRequest = await prisma.approvalRequest.create({
        data: {
          type: 'BANK_TRANSACTION_EDIT',
          entityType: 'BANK_TRANSACTION',
          entityId: transaction.id,
          requestedById: request.user.sub,
          reason: String(request.body?.reason || '').trim() || null,
          beforeData: currentSnapshot,
          afterData: {
            proposedTransaction: proposedSnapshot,
            proposedChanges: diffApprovalTransaction(
              {
                ...currentSnapshot,
                transactionDate: new Date(currentSnapshot.transactionDate).toISOString().slice(0, 10),
              },
              {
                bankAccountId: proposed.bankAccountId,
                direction: proposed.direction,
                category: proposed.category,
                amount: Number(proposed.amount),
                description: proposed.description,
                reference: proposed.reference,
                transactionDate: proposed.transactionDate,
              },
            ),
          },
        },
        include: {
          requestedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
          approvedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
        },
      });

      return reply.code(201).send({ approvalRequest });
    },
  });

  // Direct edit — ADMIN only, bypasses approval flow. Any pending approval request
  // for this transaction is auto-cancelled with a resolution note.
  fastify.patch('/banking/transactions/:id', {
    preHandler: [authenticate, authorize('ADMIN')],
    handler: async (request, reply) => {
      const transaction = await prisma.bankTransaction.findUnique({
        where: { id: request.params.id },
        include: {
          bankAccount: { select: { id: true, name: true, accountType: true, lastFour: true } },
          customer: { select: { id: true, name: true, phone: true } },
          farmer: { select: { id: true, name: true, phone: true } },
          enteredBy: { select: { firstName: true, lastName: true } },
          statementLine: { select: { id: true } },
          allocations: { select: { id: true } },
          cashDepositBatchLinks: { select: { id: true } },
          cashDepositOutflow: { select: { id: true } },
          farmerLedgerEntries: { select: { id: true } },
        },
      });

      if (!transaction) return reply.code(404).send({ error: 'Transaction not found.' });

      const permission = canManageManualBankTransaction(transaction, request.user);
      if (!permission.allowed) {
        return reply.code(400).send({ error: permission.error });
      }

      const categoryConfig = await getTransactionCategoryConfig();
      const proposed = normalizeApprovalEditPayload(request.body);
      const validationError = await validateManualBankTransactionEdit({
        transaction,
        proposed,
        categoryConfig,
      });
      if (validationError) {
        return reply.code(400).send({ error: validationError });
      }

      const beforeSnapshot = serializeApprovalTransaction(transaction);

      // Auto-cancel any pending edit requests for this transaction (since admin is doing it directly)
      const pendingEditRequests = await prisma.approvalRequest.findMany({
        where: {
          type: 'BANK_TRANSACTION_EDIT',
          entityType: 'BANK_TRANSACTION',
          entityId: transaction.id,
          status: 'PENDING',
        },
      });

      await prisma.$transaction([
        prisma.bankTransaction.update({
          where: { id: transaction.id },
          data: {
            bankAccountId: proposed.bankAccountId,
            direction: proposed.direction,
            category: proposed.category,
            amount: Number(proposed.amount),
            description: proposed.description,
            reference: proposed.reference,
            transactionDate: new Date(proposed.transactionDate),
          },
        }),
        ...pendingEditRequests.map((pending) =>
          prisma.approvalRequest.update({
            where: { id: pending.id },
            data: {
              status: 'APPROVED',
              approvedById: request.user.sub,
              resolvedAt: new Date(),
              afterData: {
                ...(pending.afterData || {}),
                resolution: 'EDITED_DIRECTLY',
                note: 'Admin applied the edit directly, superseding this request.',
                resolvedAt: new Date().toISOString(),
              },
            },
          }),
        ),
      ]);

      const updated = await prisma.bankTransaction.findUnique({
        where: { id: transaction.id },
        include: {
          bankAccount: { select: { id: true, name: true, accountType: true, lastFour: true, isVirtual: true, supportsStatementImport: true } },
          customer: { select: { id: true, name: true, phone: true } },
          farmer: { select: { id: true, name: true, phone: true } },
          enteredBy: { select: { firstName: true, lastName: true } },
          statementLine: { select: { id: true } },
          allocations: { select: { id: true } },
          cashDepositBatchLinks: { select: { id: true } },
          cashDepositOutflow: { select: { id: true } },
          farmerLedgerEntries: { select: { id: true } },
        },
      });

      // Audit log
      const afterSnapshot = serializeApprovalTransaction(updated);
      const changes = {};
      for (const key of Object.keys(proposed)) {
        const before = String(beforeSnapshot[key] ?? '');
        const after = String(afterSnapshot[key] ?? '');
        if (before !== after) changes[key] = { from: beforeSnapshot[key], to: afterSnapshot[key] };
      }
      await prisma.auditLog.create({
        data: {
          entityType: 'BANK_TRANSACTION',
          entityId: transaction.id,
          action: 'UPDATE',
          changes,
          performedById: request.user.sub,
        },
      }).catch(() => {}); // best-effort

      return reply.send({
        transaction: enrichTransactionForUser(updated, request.user),
        before: beforeSnapshot,
        pendingRequestsResolved: pendingEditRequests.length,
      });
    },
  });

  // Direct delete — ADMIN only, bypasses approval flow. Any pending approval request
  // for this transaction is auto-cancelled.
  fastify.delete('/banking/transactions/:id', {
    preHandler: [authenticate, authorize('ADMIN')],
    handler: async (request, reply) => {
      const transaction = await prisma.bankTransaction.findUnique({
        where: { id: request.params.id },
        include: {
          bankAccount: { select: { id: true, name: true, accountType: true, lastFour: true } },
          customer: { select: { id: true, name: true, phone: true } },
          farmer: { select: { id: true, name: true, phone: true } },
          enteredBy: { select: { firstName: true, lastName: true } },
          statementLine: { select: { id: true } },
          allocations: { select: { id: true } },
          cashDepositBatchLinks: { select: { id: true } },
          cashDepositOutflow: { select: { id: true } },
          farmerLedgerEntries: { select: { id: true } },
        },
      });

      if (!transaction) return reply.code(404).send({ error: 'Transaction not found.' });

      const permission = canManageManualBankTransaction(transaction, request.user);
      if (!permission.allowed) {
        return reply.code(400).send({ error: permission.error });
      }

      const beforeSnapshot = serializeApprovalTransaction(transaction);

      const pendingRequests = await prisma.approvalRequest.findMany({
        where: {
          entityType: 'BANK_TRANSACTION',
          entityId: transaction.id,
          status: 'PENDING',
        },
      });

      await prisma.$transaction([
        prisma.bankTransaction.delete({ where: { id: transaction.id } }),
        ...pendingRequests.map((pending) =>
          prisma.approvalRequest.update({
            where: { id: pending.id },
            data: {
              status: 'APPROVED',
              approvedById: request.user.sub,
              resolvedAt: new Date(),
              afterData: {
                ...(pending.afterData || {}),
                resolution: 'DELETED_DIRECTLY',
                note: 'Admin deleted the transaction directly, superseding this request.',
                resolvedAt: new Date().toISOString(),
              },
            },
          }),
        ),
      ]);

      // Audit log
      await prisma.auditLog.create({
        data: {
          entityType: 'BANK_TRANSACTION',
          entityId: transaction.id,
          action: 'DELETE',
          changes: beforeSnapshot,
          performedById: request.user.sub,
        },
      }).catch(() => {});

      return reply.send({
        deleted: true,
        before: beforeSnapshot,
        pendingRequestsResolved: pendingRequests.length,
      });
    },
  });

  fastify.post('/banking/approval-requests/:id/approve', {
    preHandler: [authenticate, authorize('ADMIN')],
    handler: async (request, reply) => {
      const approvalRequest = await getApprovalRequestOrReply(request, reply);
      if (!approvalRequest) return;
      if (approvalRequest.status !== 'PENDING') {
        return reply.code(400).send({ error: 'This approval request has already been resolved.' });
      }

      const transaction = await prisma.bankTransaction.findUnique({
        where: { id: approvalRequest.entityId },
        include: {
          bankAccount: { select: { id: true, name: true, accountType: true, lastFour: true } },
          customer: { select: { id: true, name: true, phone: true } },
          farmer: { select: { id: true, name: true, phone: true } },
          enteredBy: { select: { firstName: true, lastName: true } },
          statementLine: { select: { id: true } },
          allocations: { select: { id: true } },
          cashDepositBatchLinks: { select: { id: true } },
          cashDepositOutflow: { select: { id: true } },
          farmerLedgerEntries: { select: { id: true } },
        },
      });

      if (!transaction) {
        await prisma.approvalRequest.update({
          where: { id: approvalRequest.id },
          data: {
            status: 'REJECTED',
            approvedById: request.user.sub,
            resolvedAt: new Date(),
            afterData: {
              resolution: 'AUTO_REJECTED',
              note: 'The transaction no longer exists.',
            },
          },
        });
        return reply.code(400).send({ error: 'The transaction no longer exists, so this request was closed automatically.' });
      }

      const permission = canManageManualBankTransaction(transaction, {
        sub: approvalRequest.requestedById,
        role: approvalRequest.requestedBy.role,
      });
      if (!permission.allowed) {
        return reply.code(400).send({ error: permission.error });
      }

      if (approvalRequest.type === 'BANK_TRANSACTION_DELETE') {
        await prisma.$transaction([
          prisma.bankTransaction.delete({ where: { id: transaction.id } }),
          prisma.approvalRequest.update({
            where: { id: approvalRequest.id },
            data: {
              status: 'APPROVED',
              approvedById: request.user.sub,
              resolvedAt: new Date(),
              afterData: {
                resolution: 'DELETED',
                deletedAt: new Date().toISOString(),
              },
            },
          }),
        ]);

        return reply.send({ approved: true });
      }

      if (approvalRequest.type === 'BANK_TRANSACTION_EDIT') {
        const proposedTransaction = approvalRequest.afterData?.proposedTransaction;
        if (!proposedTransaction) {
          return reply.code(400).send({ error: 'This edit request no longer has a valid proposed change.' });
        }

        const categoryConfig = await getTransactionCategoryConfig();
        const proposed = normalizeApprovalEditPayload({
          bankAccountId: proposedTransaction.bankAccountId,
          direction: proposedTransaction.direction,
          category: proposedTransaction.category,
          amount: proposedTransaction.amount,
          description: proposedTransaction.description,
          reference: proposedTransaction.reference,
          transactionDate: new Date(proposedTransaction.transactionDate).toISOString().slice(0, 10),
        });

        const validationError = await validateManualBankTransactionEdit({
          transaction,
          proposed,
          categoryConfig,
        });
        if (validationError) {
          return reply.code(400).send({ error: validationError });
        }

        await prisma.$transaction([
          prisma.bankTransaction.update({
            where: { id: transaction.id },
            data: {
              bankAccountId: proposed.bankAccountId,
              direction: proposed.direction,
              category: proposed.category,
              amount: Number(proposed.amount),
              description: proposed.description,
              reference: proposed.reference,
              transactionDate: new Date(proposed.transactionDate),
            },
          }),
          prisma.approvalRequest.update({
            where: { id: approvalRequest.id },
            data: {
              status: 'APPROVED',
              approvedById: request.user.sub,
              resolvedAt: new Date(),
              afterData: {
                ...(approvalRequest.afterData || {}),
                resolution: 'EDITED',
                approvedAt: new Date().toISOString(),
              },
            },
          }),
        ]);

        return reply.send({ approved: true });
      }

      return reply.code(400).send({ error: 'Unsupported approval request type.' });
    },
  });

  fastify.post('/banking/approval-requests/:id/reject', {
    preHandler: [authenticate, authorize('ADMIN')],
    handler: async (request, reply) => {
      const approvalRequest = await getApprovalRequestOrReply(request, reply);
      if (!approvalRequest) return;
      if (approvalRequest.status !== 'PENDING') {
        return reply.code(400).send({ error: 'This approval request has already been resolved.' });
      }

      const rejectionReason = String(request.body?.reason || '').trim();

      const updated = await prisma.approvalRequest.update({
        where: { id: approvalRequest.id },
        data: {
          status: 'REJECTED',
          approvedById: request.user.sub,
          resolvedAt: new Date(),
          afterData: rejectionReason
            ? { resolution: 'REJECTED', reason: rejectionReason }
            : { resolution: 'REJECTED' },
        },
        include: {
          requestedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
          approvedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
        },
      });

      return reply.send({ approvalRequest: updated });
    },
  });

  fastify.post('/banking/transactions', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const { bankAccountId, direction, category, amount, description, reference, transactionDate, customerId, farmerId, sourceType } = request.body;
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
      const farmer = await validateFarmer(farmerId);
      if (farmer === false) return reply.code(404).send({ error: 'Farmer not found' });
      if (category === 'FARMER_PAYMENT' && !farmerId) {
        return reply.code(400).send({ error: 'Choose the farmer this payment is for.' });
      }

      const transaction = await prisma.$transaction(async (tx) => {
        const created = await createBankTransaction({
          bankAccountId,
          direction,
          category,
          amount,
          description,
          reference,
          transactionDate,
          customerId,
          farmerId,
          enteredById: request.user.sub,
          sourceType: sourceType || 'MANUAL',
          client: tx,
        });
        await createFarmerLedgerEntryFromBankTransaction({
          transaction: created,
          enteredById: request.user.sub,
          client: tx,
        });
        return created;
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          entityType: 'BANK_TRANSACTION',
          entityId: transaction.id,
          action: 'CREATE',
          changes: { amount: Number(amount), direction, category, bankAccountId, description: description || null },
          performedById: request.user.sub,
        },
      }).catch(() => {});

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
      const farmerIds = [...new Set(rows.map((row) => row.farmerId).filter(Boolean))];

      const [accounts, customers, farmers] = await Promise.all([
        prisma.bankAccount.findMany({ where: { id: { in: accountIds } } }),
        customerIds.length > 0 ? prisma.customer.findMany({ where: { id: { in: customerIds } } }) : [],
        farmerIds.length > 0 ? prisma.farmer.findMany({ where: { id: { in: farmerIds }, isActive: true } }) : [],
      ]);

      const accountSet = new Set(accounts.map((account) => account.id));
      const customerSet = new Set(customers.map((customer) => customer.id));
      const farmerSet = new Set(farmers.map((farmer) => farmer.id));

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        if (!accountSet.has(row.bankAccountId)) validationErrors.push({ index, error: 'Bank account not found' });
        if (row.customerId && !customerSet.has(row.customerId)) validationErrors.push({ index, error: 'Customer not found' });
        if (row.farmerId && !farmerSet.has(row.farmerId)) validationErrors.push({ index, error: 'Farmer not found' });
        if (row.category === 'FARMER_PAYMENT' && !row.farmerId) validationErrors.push({ index, error: 'Choose the farmer this payment is for' });
      }

      if (validationErrors.length > 0) {
        return reply.code(400).send({ error: 'Validation failed', rows: validationErrors });
      }

      const created = await prisma.$transaction(async (tx) => {
        const createdRows = [];
        for (const row of rows) {
          const createdTransaction = await createBankTransaction({
            bankAccountId: row.bankAccountId,
            direction: row.direction,
            category: row.category,
            amount: row.amount,
            description: row.description,
            reference: row.reference,
            transactionDate: row.transactionDate,
            customerId: row.customerId,
            farmerId: row.farmerId,
            enteredById: request.user.sub,
            sourceType: 'MANUAL',
            client: tx,
          });
          await createFarmerLedgerEntryFromBankTransaction({
            transaction: createdTransaction,
            enteredById: request.user.sub,
            client: tx,
          });
          createdRows.push(createdTransaction);
        }
        return createdRows;
      });

      return reply.code(201).send({ transactions: created.map(enrichTransaction), count: created.length });
    },
  });

  fastify.post('/banking/transfers/internal', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const { fromAccountId, toAccountId, amount, description, transactionDate, selectedCashTransactionIds = [] } = request.body;

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
        const availableMap = new Map(availableCashTransactions.map((transaction) => [transaction.id, transaction]));
        const availableTotal = availableCashTransactions.reduce((sum, transaction) => sum + Number(transaction.availableAmount), 0);

        let requestedAmount = Number(amount);
        let allocations = [];

        if (Array.isArray(selectedCashTransactionIds) && selectedCashTransactionIds.length > 0) {
          const uniqueIds = [...new Set(selectedCashTransactionIds.filter(Boolean))];
          const selectedTransactions = uniqueIds.map((id) => availableMap.get(id)).filter(Boolean);

          if (selectedTransactions.length !== uniqueIds.length) {
            return reply.code(400).send({ error: 'One or more selected cash sales are no longer available to deposit.' });
          }

          allocations = selectedTransactions.map((transaction) => ({
            bankTransactionId: transaction.id,
            amountIncluded: Number(transaction.availableAmount),
          }));
          requestedAmount = allocations.reduce((sum, entry) => sum + Number(entry.amountIncluded), 0);
        } else {
          if (requestedAmount > availableTotal + 0.009) {
            return reply.code(400).send({
              error: `Only ${availableTotal.toLocaleString('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 })} is available to deposit from Cash Account for that date.`,
            });
          }

          let remainingAmount = requestedAmount;
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
        }

        if (!allocations.length || requestedAmount <= 0) {
          return reply.code(400).send({ error: 'Select at least one cash sale to move into this deposit.' });
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
    handler: async (request) => {
      const { dateFrom, dateTo, undepositedLimit, undepositedOffset, depositedLimit, depositedOffset } = request.query;
      const policy = await getOperationsPolicy();
      const workspace = await getCashDepositWorkspace(policy, {
        dateFrom, dateTo,
        undepositedLimit: undepositedLimit ? Number(undepositedLimit) : undefined,
        undepositedOffset: undepositedOffset ? Number(undepositedOffset) : undefined,
        depositedLimit: depositedLimit ? Number(depositedLimit) : undefined,
        depositedOffset: depositedOffset ? Number(depositedOffset) : undefined,
      });
      return {
        policy,
        ...workspace,
      };
    },
  });

  // V3 Phase 2: List manually-entered bank inflows that could represent a pooled
  // cash deposit. Used by the Cash Sales tab to let staff pick one and link it
  // to the actual cash sales that made it up. Eligibility rules:
  //   - sourceType MANUAL (user typed it from the bank statement)
  //   - direction INFLOW
  //   - NOT on a CASH_ON_HAND account (that's the cash side, not the bank side)
  //   - category CASH_DEPOSIT_CONFIRMATION or UNALLOCATED_INCOME (most likely
  //     categories for a freshly-entered cash banking)
  //   - not already linked to a CashDepositBatch (cashDepositOutflow is null
  //     and no cashDepositBatchLinks)
  //   - not already part of an internalTransferGroup
  //   - not already tied to another workflow (no allocations, no sale, etc.)
  fastify.get('/banking/cash-deposits/eligible-inflows', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async () => {
      const inflows = await prisma.bankTransaction.findMany({
        where: {
          sourceType: 'MANUAL',
          direction: 'INFLOW',
          category: { in: ['CASH_DEPOSIT_CONFIRMATION', 'UNALLOCATED_INCOME'] },
          internalTransferGroupId: null,
          cashDepositOutflow: null,
          cashDepositBatchLinks: { none: {} },
          bankAccount: { accountType: { not: 'CASH_ON_HAND' } },
        },
        include: {
          bankAccount: {
            select: { id: true, name: true, accountType: true, lastFour: true, isVirtual: true, supportsStatementImport: true },
          },
          enteredBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
        take: 100,
      });
      return { inflows: inflows.map((transaction) => enrichTransaction(transaction)) };
    },
  });

  // V3 Phase 2: Confirm a cash deposit by linking a manually-entered bank
  // inflow to the specific cash sale transactions that made it up.
  // Creates:
  //   - A matching outflow from CASH_ON_HAND (category INTERNAL_TRANSFER_OUT)
  //   - A CashDepositBatch in CONFIRMED status linking to the outflow and the cash sales
  //   - An internalTransferGroupId shared between the manual inflow and the new outflow
  // Validates that the sum of the selected cash sales equals the bank inflow amount.
  fastify.post('/banking/cash-deposits/confirm-from-bank', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const { bankTransactionId, bankTransactionIds, cashSaleIds, notes } = request.body || {};

      // Support both single (bankTransactionId) and multi (bankTransactionIds[])
      // for backward compatibility. If both supplied, bankTransactionIds wins.
      const rawInflowIds = Array.isArray(bankTransactionIds) && bankTransactionIds.length > 0
        ? bankTransactionIds
        : bankTransactionId
          ? [bankTransactionId]
          : [];
      const uniqueInflowIds = [...new Set(rawInflowIds.filter(Boolean))];

      if (uniqueInflowIds.length === 0) {
        return reply.code(400).send({ error: 'Select at least one bank inflow to match.' });
      }
      if (!Array.isArray(cashSaleIds) || cashSaleIds.length === 0) {
        return reply.code(400).send({ error: 'Select at least one cash sale to link.' });
      }

      const uniqueCashIds = [...new Set(cashSaleIds.filter(Boolean))];

      // Fetch and validate all selected inflows
      const bankTransactions = await Promise.all(
        uniqueInflowIds.map((id) =>
          prisma.bankTransaction.findUnique({
            where: { id },
            include: {
              bankAccount: true,
              cashDepositOutflow: { select: { id: true } },
              cashDepositBatchLinks: { select: { id: true } },
            },
          }),
        ),
      );

      // Validate each inflow
      let targetBankAccountId = null;
      for (const bt of bankTransactions) {
        if (!bt) {
          return reply.code(404).send({ error: 'One or more bank transactions not found.' });
        }
        if (bt.direction !== 'INFLOW' || bt.sourceType !== 'MANUAL') {
          return reply.code(400).send({ error: `Transaction ${bt.reference || bt.id} is not a manually-entered inflow.` });
        }
        if (bt.internalTransferGroupId) {
          return reply.code(400).send({ error: `Transaction ${bt.reference || bt.id} is already part of an internal transfer.` });
        }
        if (bt.cashDepositOutflow || (bt.cashDepositBatchLinks?.length || 0) > 0) {
          return reply.code(400).send({ error: `Transaction ${bt.reference || bt.id} is already linked to a cash deposit.` });
        }
        if (bt.bankAccount.accountType === 'CASH_ON_HAND') {
          return reply.code(400).send({ error: 'Inflows must be on a real bank account, not Cash on Hand.' });
        }
        // All inflows must be on the same destination bank account
        if (!targetBankAccountId) {
          targetBankAccountId = bt.bankAccountId;
        } else if (bt.bankAccountId !== targetBankAccountId) {
          return reply.code(400).send({ error: 'All selected inflows must be on the same bank account.' });
        }
      }

      const availableCashTransactions = await getAvailableCashSaleTransactions();
      const availableMap = new Map(availableCashTransactions.map((transaction) => [transaction.id, transaction]));
      const selected = uniqueCashIds.map((id) => availableMap.get(id)).filter(Boolean);

      if (selected.length !== uniqueCashIds.length) {
        return reply.code(400).send({ error: 'One or more selected cash sales are no longer available.' });
      }

      const cashTotal = selected.reduce((sum, transaction) => sum + Number(transaction.availableAmount), 0);
      const bankAmount = bankTransactions.reduce((sum, bt) => sum + Number(bt.amount), 0);
      // Allow a 1-kobo rounding tolerance.
      if (Math.abs(cashTotal - bankAmount) > 0.01) {
        return reply.code(400).send({
          error: `Selected cash sales total ${cashTotal.toFixed(2)} but the selected bank inflow${bankTransactions.length > 1 ? 's total' : ' is'} ${bankAmount.toFixed(2)}. They must match.`,
        });
      }

      const cashAccount = await prisma.bankAccount.findFirst({
        where: { accountType: 'CASH_ON_HAND', isActive: true },
      });
      if (!cashAccount) {
        return reply.code(500).send({ error: 'Cash on Hand account is not configured.' });
      }

      const transferGroupId = crypto.randomUUID();
      // Use the earliest inflow date as the effective date for the outflow and batch.
      const effectiveDate = bankTransactions
        .map((bt) => new Date(bt.transactionDate))
        .sort((a, b) => a - b)[0];
      const allocations = selected.map((transaction) => ({
        bankTransactionId: transaction.id,
        amountIncluded: Number(transaction.availableAmount),
      }));
      const targetAccountName = bankTransactions[0].bankAccount.name;
      const description = String(notes || '').trim() || `Cash deposit confirmed from ${cashAccount.name} to ${targetAccountName}`;

      const result = await prisma.$transaction(async (tx) => {
        // 1. Create the balancing outflow from Cash on Hand.
        const outflowTransaction = await tx.bankTransaction.create({
          data: {
            bankAccountId: cashAccount.id,
            direction: 'OUTFLOW',
            category: 'INTERNAL_TRANSFER_OUT',
            amount: bankAmount,
            description,
            reference: transferGroupId,
            transactionDate: effectiveDate,
            enteredById: request.user.sub,
            sourceType: 'CASH_DEPOSIT',
            internalTransferGroupId: transferGroupId,
            postedAt: new Date(),
          },
        });

        // 2. Stamp all selected manual inflows with the same group id and promote
        //    their category to CASH_DEPOSIT_CONFIRMATION.
        await Promise.all(
          bankTransactions.map((bt) =>
            tx.bankTransaction.update({
              where: { id: bt.id },
              data: {
                internalTransferGroupId: transferGroupId,
                category: 'CASH_DEPOSIT_CONFIRMATION',
              },
            }),
          ),
        );

        // 3. Create the CashDepositBatch in CONFIRMED state, linking everything.
        const batch = await tx.cashDepositBatch.create({
          data: {
            fromBankAccountId: cashAccount.id,
            toBankAccountId: targetBankAccountId,
            outflowTransactionId: outflowTransaction.id,
            amount: bankAmount,
            depositDate: effectiveDate,
            status: 'CONFIRMED',
            createdById: request.user.sub,
            confirmedById: request.user.sub,
            confirmedAt: new Date(),
            notes: description,
            transactions: {
              create: allocations.map((entry) => ({
                bankTransactionId: entry.bankTransactionId,
                amountIncluded: entry.amountIncluded,
              })),
            },
          },
          include: {
            fromBankAccount: { select: { id: true, name: true, accountType: true, lastFour: true } },
            toBankAccount: { select: { id: true, name: true, accountType: true, lastFour: true } },
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
        confirmed: true,
        transferGroupId,
        inflowCount: bankTransactions.length,
        outflow: enrichTransaction(result.outflowTransaction),
        cashDepositBatch: {
          ...result.batch,
          amount: Number(result.batch.amount),
          transactions: result.batch.transactions.map((entry) => ({
            ...entry,
            amountIncluded: Number(entry.amountIncluded),
            bankTransaction: entry.bankTransaction ? enrichTransaction(entry.bankTransaction) : null,
          })),
        },
      });
    },
  });

  fastify.get('/banking/cash-deposits/available', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const { upToDate } = request.query;
      const effectiveDate = upToDate ? endOfDay(upToDate) : undefined;
      const transactions = await getAvailableCashSaleTransactions({ upToDate: effectiveDate });
      const total = transactions.reduce((sum, transaction) => sum + Number(transaction.availableAmount || 0), 0);
      return reply.send({ transactions, total });
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
          selectedFarmer: { select: { id: true, name: true, phone: true } },
          postedTransaction: { select: { id: true, amount: true, category: true, transactionDate: true } },
          matchedCashDepositBatch: {
            select: {
              id: true,
              amount: true,
              depositDate: true,
              status: true,
            },
          },
          selectedPortalCheckout: {
            select: {
              id: true,
              reference: true,
              amountToPay: true,
              status: true,
              createdAt: true,
              adminConfirmedAt: true,
              customer: { select: { id: true, name: true, phone: true } },
              batch: { select: { id: true, name: true, eggTypeKey: true, expectedDate: true } },
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

      const { selectedCategory, selectedCustomerId, selectedFarmerId, matchedCashDepositBatchId, selectedPortalCheckoutId, notes, reviewStatus, description } = request.body;
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
        if (selectedCategory !== 'CUSTOMER_BOOKING' && selectedPortalCheckoutId === undefined) {
          updates.selectedPortalCheckoutId = null;
        }
        if (selectedCategory !== 'FARMER_PAYMENT' && selectedFarmerId === undefined) {
          updates.selectedFarmerId = null;
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

      if (selectedFarmerId !== undefined) {
        if (selectedFarmerId) {
          const farmer = await prisma.farmer.findUnique({ where: { id: selectedFarmerId } });
          if (!farmer || farmer.isActive === false) return reply.code(404).send({ error: 'Farmer not found' });
          updates.selectedFarmerId = selectedFarmerId;
        } else {
          updates.selectedFarmerId = null;
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

      if (selectedPortalCheckoutId !== undefined) {
        if (selectedPortalCheckoutId) {
          const portalCheckout = await prisma.portalCheckout.findUnique({
            where: { id: selectedPortalCheckoutId },
          });
          if (!portalCheckout || portalCheckout.checkoutType !== 'BOOK_UPCOMING' || portalCheckout.paymentMethod !== 'TRANSFER') {
            return reply.code(404).send({ error: 'Portal booking transfer not found.' });
          }
          if (portalCheckout.status !== 'ADMIN_CONFIRMED') {
            return reply.code(400).send({ error: 'Portal booking transfer is not waiting for statement confirmation.' });
          }
          const lineAmount = existing.direction === 'OUTFLOW' ? Number(existing.debitAmount || 0) : Number(existing.creditAmount || 0);
          if (Math.abs(Number(portalCheckout.amountToPay) - lineAmount) > 0.009) {
            return reply.code(400).send({ error: 'The selected portal booking amount does not match this statement line.' });
          }
          if ((selectedCategory || existing.selectedCategory) !== 'CUSTOMER_BOOKING') {
            return reply.code(400).send({ error: 'Portal booking matching is only available for Customer booking statement lines.' });
          }
          updates.selectedPortalCheckoutId = selectedPortalCheckoutId;
          updates.selectedCustomerId = portalCheckout.customerId;
        } else {
          updates.selectedPortalCheckoutId = null;
        }
      }

      if ((selectedCategory || existing.selectedCategory) === 'FARMER_PAYMENT'
        && !(updates.selectedFarmerId || selectedFarmerId || existing.selectedFarmerId)) {
        return reply.code(400).send({ error: 'Choose the farmer this payment is for.' });
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
          selectedFarmer: { select: { id: true, name: true, phone: true } },
          matchedCashDepositBatch: {
            select: {
              id: true,
              amount: true,
              depositDate: true,
              status: true,
            },
          },
          selectedPortalCheckout: {
            select: {
              id: true,
              reference: true,
              amountToPay: true,
              status: true,
              createdAt: true,
              adminConfirmedAt: true,
              customer: { select: { id: true, name: true, phone: true } },
              batch: { select: { id: true, name: true, eggTypeKey: true, expectedDate: true } },
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

  fastify.get('/banking/portal-booking-match-candidates', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'RECORD_KEEPER')],
    handler: async (request, reply) => {
      const { amount, transactionDate, customerId } = request.query;
      const amountNumber = Number(amount || 0);
      const targetDate = transactionDate ? new Date(transactionDate) : new Date();
      const minDate = new Date(targetDate);
      minDate.setDate(minDate.getDate() - 3);
      const maxDate = new Date(targetDate);
      maxDate.setDate(maxDate.getDate() + 3);
      const eggTypes = await getCustomerEggTypeConfig();

      const candidates = await prisma.portalCheckout.findMany({
        where: {
          checkoutType: 'BOOK_UPCOMING',
          paymentMethod: 'TRANSFER',
          status: 'ADMIN_CONFIRMED',
          amountToPay: amountNumber ? amountNumber : undefined,
          confirmationStatementLineId: null,
          createdAt: { gte: minDate, lte: maxDate },
          ...(customerId ? { customerId } : {}),
        },
        include: {
          customer: { select: { id: true, name: true, phone: true, email: true } },
          batch: { select: { id: true, name: true, expectedDate: true, receivedDate: true, eggTypeKey: true, status: true } },
          adminConfirmedBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: [{ adminConfirmedAt: 'desc' }, { createdAt: 'desc' }],
      });

      return reply.send({
        candidates: candidates.map((checkout) => ({
          id: checkout.id,
          reference: checkout.reference,
          status: checkout.status,
          customer: checkout.customer,
          batch: {
            ...checkout.batch,
            eggTypeLabel: getCustomerEggTypeLabel(eggTypes, checkout.batch.eggTypeKey || 'REGULAR'),
          },
          amountToPay: Number(checkout.amountToPay),
          quantity: checkout.quantity,
          adminConfirmedAt: checkout.adminConfirmedAt,
          createdAt: checkout.createdAt,
          adminConfirmedBy: checkout.adminConfirmedBy,
        })),
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
              selectedPortalCheckout: true,
              selectedFarmer: true,
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

        if (line.selectedPortalCheckoutId) {
          if (line.selectedCategory !== 'CUSTOMER_BOOKING') {
            skipped.push({ lineId: line.id, reason: 'Portal booking link can only be used with Customer booking category.' });
            continue;
          }
          if (line.direction !== 'INFLOW') {
            skipped.push({ lineId: line.id, reason: 'Portal booking link only works with inflow statement lines.' });
            continue;
          }
          if (!line.selectedPortalCheckout || line.selectedPortalCheckout.status !== 'ADMIN_CONFIRMED') {
            skipped.push({ lineId: line.id, reason: 'Linked portal booking is no longer waiting for statement confirmation.' });
            continue;
          }
          if (Math.abs(Number(line.selectedPortalCheckout.amountToPay || 0) - amount) > 0.009) {
            skipped.push({ lineId: line.id, reason: 'Linked portal booking amount does not match the statement inflow.' });
            continue;
          }
        }

        if (line.selectedCategory === 'FARMER_PAYMENT' && !line.selectedFarmerId) {
          skipped.push({ lineId: line.id, reason: 'Farmer payment line still needs the farmer to be selected.' });
          continue;
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
          customerId: line.selectedPortalCheckout?.customerId || line.selectedCustomerId,
          farmerId: line.selectedFarmerId,
          enteredById: request.user.sub,
          sourceType: 'STATEMENT_IMPORT',
          sourceFingerprint: line.fingerprint,
        });

        await createFarmerLedgerEntryFromBankTransaction({
          transaction,
          enteredById: request.user.sub,
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

        if (line.selectedPortalCheckoutId) {
          await finalizePortalTransferBookingFromStatement({
            portalCheckoutId: line.selectedPortalCheckoutId,
            bankTransactionId: transaction.id,
            statementLineId: line.id,
            enteredById: request.user.sub,
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
            direction: 'INFLOW',
            OR: [
              { category: { in: ['CUSTOMER_DEPOSIT', 'CUSTOMER_BOOKING'] } },
              { category: 'UNALLOCATED_INCOME', customerId: { not: null } },
            ],
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
        const availability = await getOpenBatchBookingAvailability(batch.id, { batch });
        return {
          id: batch.id,
          name: batch.name,
          expectedDate: batch.expectedDate,
          eggTypeKey: batch.eggTypeKey,
          eggTypeLabel: getCustomerEggTypeLabel(customerEggTypes, batch.eggTypeKey || 'REGULAR'),
          wholesalePrice: Number(batch.wholesalePrice),
          availableForBooking: batch.availableForBooking,
          totalBooked: availability?.confirmedBooked || 0,
          heldForCheckout: availability?.heldForCheckout || 0,
          totalCommitted: availability?.totalCommitted || 0,
          remainingAvailable: availability?.remainingAvailable ?? 0,
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

      if (!transaction || !CUSTOMER_DEPOSIT_QUEUE_CATEGORIES.includes(transaction.category)) {
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

      if (!transaction || !CUSTOMER_DEPOSIT_QUEUE_CATEGORIES.includes(transaction.category)) {
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

      if (!transaction || !CUSTOMER_DEPOSIT_QUEUE_CATEGORIES.includes(transaction.category)) {
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
        const batch = batchMap.get(batchId);
        const availability = await getOpenBatchBookingAvailability(batchId, { batch });
        const remainingAvailable = availability?.remainingAvailable ?? 0;
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

  fastify.get('/banking/month-end-review', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const queryMonth = typeof request.query.month === 'string' ? request.query.month : '';
      const fallbackMonth = new Date().toISOString().slice(0, 7);
      const monthKey = /^\d{4}-\d{2}$/.test(queryMonth) ? queryMonth : fallbackMonth;

      try {
        const [review, monthClose, recentMonthCloses] = await Promise.all([
          buildMonthEndReviewData(monthKey),
          prisma.monthClose.findUnique({
            where: { monthKey },
            include: { closedBy: { select: { firstName: true, lastName: true } } },
          }),
          prisma.monthClose.findMany({
            take: 12,
            orderBy: [{ monthStart: 'desc' }, { closedAt: 'desc' }],
            include: { closedBy: { select: { firstName: true, lastName: true } } },
          }),
        ]);

        return reply.send({
          ...review,
          monthClose: enrichMonthClose(monthClose),
          recentMonthCloses: recentMonthCloses.map(enrichMonthClose),
        });
      } catch {
        return reply.code(400).send({ error: 'Month must be in YYYY-MM format.' });
      }
    },
  });

  fastify.get('/banking/month-closes', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const limit = Math.min(60, Math.max(1, Number(request.query.limit || 12)));
      const monthCloses = await prisma.monthClose.findMany({
        take: limit,
        orderBy: [{ monthStart: 'desc' }, { closedAt: 'desc' }],
        include: { closedBy: { select: { firstName: true, lastName: true } } },
      });
      return reply.send({ monthCloses: monthCloses.map(enrichMonthClose) });
    },
  });

  fastify.post('/banking/month-closes', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const queryMonth = typeof request.body.month === 'string' ? request.body.month : '';
      const fallbackMonth = new Date().toISOString().slice(0, 7);
      const monthKey = /^\d{4}-\d{2}$/.test(queryMonth) ? queryMonth : fallbackMonth;
      const notes = typeof request.body.notes === 'string' ? request.body.notes.trim() : '';

      try {
        const existing = await prisma.monthClose.findUnique({ where: { monthKey } });
        if (existing) {
          return reply.code(409).send({ error: 'This month has already been closed.' });
        }

        const review = await buildMonthEndReviewData(monthKey);
        if (review.accountsMissingMonthEndBalance > 0) {
          return reply.code(400).send({ error: 'Enter a month-end balance for every active account before closing the month.' });
        }

        // All accounts must be balanced (bank statement = system balance)
        const accountsWithVariance = review.accounts.filter((a) => {
          const me = a.monthEndReconciliation;
          return me && Math.abs(Number(me.variance || 0)) > 0.009;
        });
        if (accountsWithVariance.length > 0) {
          const names = accountsWithVariance.map((a) => a.name || a.accountType).join(', ');
          return reply.code(400).send({ error: `Resolve variances on: ${names}. Bank balances must match system balances before closing.` });
        }

        // Unallocated transactions and unbanked cash are captured in the
        // snapshot for visibility but do NOT block the close.

        const unresolvedSnapshot = {
          hangingDeposits: { count: review.unresolved.hangingDeposits.count, total: review.unresolved.hangingDeposits.total },
          pendingTransferConfirmations: { count: review.unresolved.pendingTransferConfirmations.count, total: review.unresolved.pendingTransferConfirmations.total },
          undepositedCash: { count: review.unresolved.undepositedCash.count, total: review.unresolved.undepositedCash.total },
          pendingCashDeposits: { count: review.unresolved.pendingCashDeposits.count, total: review.unresolved.pendingCashDeposits.total },
          pendingApprovals: { count: review.unresolved.pendingApprovals.count },
          unallocatedTransactions: { count: review.unresolved.unallocatedTransactions.count, total: review.unresolved.unallocatedTransactions.total },
          accountsMissingMonthEndBalance: review.accountsMissingMonthEndBalance,
        };

        const accountSnapshot = review.accounts.map((account) => ({
          bankAccountId: account.id,
          accountName: account.name,
          accountType: account.accountType,
          systemBalance: Number(account.systemBalance || 0),
          transactionCount: Number(account.transactionCount || 0),
          monthEndBalance: account.monthEndReconciliation ? Number(account.monthEndReconciliation.closingBalance || 0) : null,
          variance: account.monthEndReconciliation ? Number(account.monthEndReconciliation.variance || 0) : null,
          statementDate: account.monthEndReconciliation?.statementDate || null,
          reconciliationStatus: account.monthEndReconciliation?.status || 'MISSING',
        }));

        const monthClose = await prisma.monthClose.create({
          data: {
            monthKey,
            monthStart: review.window.start,
            monthEnd: review.window.end,
            status: 'CLOSED',
            notes: notes || null,
            unresolvedSnapshot,
            accountSnapshot,
            closedById: request.user.sub,
          },
          include: { closedBy: { select: { firstName: true, lastName: true } } },
        });

        return reply.code(201).send({ monthClose: enrichMonthClose(monthClose) });
      } catch {
        return reply.code(400).send({ error: 'Month must be in YYYY-MM format.' });
      }
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

  // ────────────────────────────────────────────────────────────
  // GET /banking/audit-log — audit trail for banking transactions
  // ────────────────────────────────────────────────────────────
  fastify.get('/banking/audit-log', {
    preHandler: [authenticate, authorize('ADMIN')],
    handler: async (request, reply) => {
      const { entityId, limit = 50, offset = 0 } = request.query;
      const where = { entityType: 'BANK_TRANSACTION' };
      if (entityId) where.entityId = entityId;

      const [entries, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          include: {
            performedBy: { select: { firstName: true, lastName: true, role: true } },
          },
          orderBy: { performedAt: 'desc' },
          take: parseInt(limit),
          skip: parseInt(offset),
        }),
        prisma.auditLog.count({ where }),
      ]);

      return reply.send({
        entries: entries.map((e) => ({
          ...e,
          performedByName: e.performedBy
            ? `${e.performedBy.firstName} ${e.performedBy.lastName}`.trim()
            : 'System',
          performedByRole: e.performedBy?.role || null,
        })),
        total,
      });
    },
  });
}
