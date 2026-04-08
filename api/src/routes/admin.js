import prisma from '../plugins/prisma.js';
import { authenticate } from '../plugins/auth.js';
import { authorize } from '../middleware/authorize.js';
import {
  getCustomerEggTypeConfig,
  getOperationsPolicy,
  getOperationsPolicyHistory,
  getTransactionCategoryConfig,
  saveCustomerEggTypeConfig,
  saveOperationsPolicy,
  saveTransactionCategoryConfig,
} from '../utils/appSettings.js';

function serializeBankAccount(account) {
  return {
    id: account.id,
    name: account.name,
    accountType: account.accountType,
    lastFour: account.lastFour,
    bankName: account.bankName,
    isActive: account.isActive,
    isVirtual: account.isVirtual,
    supportsStatementImport: account.supportsStatementImport,
    sortOrder: account.sortOrder,
    createdAt: account.createdAt,
  };
}

async function loadBankAccounts() {
  const accounts = await prisma.bankAccount.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  return accounts.map(serializeBankAccount);
}

export default async function adminRoutes(fastify) {
  fastify.get('/admin/config', {
    preHandler: [authenticate, authorize('ADMIN')],
    handler: async () => {
      const [policy, policyHistory, bankAccounts, transactionCategories, customerEggTypes] = await Promise.all([
        getOperationsPolicy(),
        getOperationsPolicyHistory(),
        loadBankAccounts(),
        getTransactionCategoryConfig(),
        getCustomerEggTypeConfig(),
      ]);

      return {
        policy,
        policyHistory: [...policyHistory].sort((a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom)),
        bankAccounts,
        transactionCategories,
        customerEggTypes,
      };
    },
  });

  fastify.patch('/admin/config/policy', {
    preHandler: [authenticate, authorize('ADMIN')],
    handler: async (request, reply) => {
      const {
        targetProfitPerCrate,
        crackAllowancePercent,
        crackedCratesAllowance,
        writeOffCratesAllowance,
        bookingMinimumPaymentPercent,
        firstTimeBookingLimitCrates,
        maxBookingCratesPerOrder,
        largePosPaymentThreshold,
      } = request.body;

      if (targetProfitPerCrate == null || Number(targetProfitPerCrate) <= 0) {
        return reply.code(400).send({ error: 'Target profit per crate must be greater than zero.' });
      }

      if (crackAllowancePercent == null || Number(crackAllowancePercent) < 0) {
        return reply.code(400).send({ error: 'Crack allowance must be zero or higher.' });
      }

      if (crackedCratesAllowance !== null && crackedCratesAllowance !== undefined && (!Number.isInteger(Number(crackedCratesAllowance)) || Number(crackedCratesAllowance) < 0)) {
        return reply.code(400).send({ error: 'Allowable cracked crates must be a whole number or left blank.' });
      }

      if (writeOffCratesAllowance !== null && writeOffCratesAllowance !== undefined && (!Number.isInteger(Number(writeOffCratesAllowance)) || Number(writeOffCratesAllowance) < 0)) {
        return reply.code(400).send({ error: 'Allowable written-off crates must be a whole number or left blank.' });
      }

      if (bookingMinimumPaymentPercent == null || Number(bookingMinimumPaymentPercent) <= 0 || Number(bookingMinimumPaymentPercent) > 100) {
        return reply.code(400).send({ error: 'Minimum booking payment must be above zero and not more than 100%.' });
      }

      if (firstTimeBookingLimitCrates == null || Number(firstTimeBookingLimitCrates) <= 0) {
        return reply.code(400).send({ error: 'First-time customer booking limit must be greater than zero.' });
      }

      if (maxBookingCratesPerOrder == null || Number(maxBookingCratesPerOrder) <= 0) {
        return reply.code(400).send({ error: 'Maximum booking per order must be greater than zero.' });
      }

      if (Number(firstTimeBookingLimitCrates) > Number(maxBookingCratesPerOrder)) {
        return reply.code(400).send({ error: 'First-time customer booking limit cannot be more than the maximum booking per order.' });
      }

      if (largePosPaymentThreshold == null || Number(largePosPaymentThreshold) < 0) {
        return reply.code(400).send({ error: 'Large POS alert threshold must be zero or higher.' });
      }

      const { policy, history } = await saveOperationsPolicy({
        targetProfitPerCrate: Number(targetProfitPerCrate),
        crackAllowancePercent: Number(crackAllowancePercent),
        crackedCratesAllowance: crackedCratesAllowance === '' ? null : crackedCratesAllowance,
        writeOffCratesAllowance: writeOffCratesAllowance === '' ? null : writeOffCratesAllowance,
        bookingMinimumPaymentPercent: Number(bookingMinimumPaymentPercent),
        firstTimeBookingLimitCrates: Number(firstTimeBookingLimitCrates),
        maxBookingCratesPerOrder: Number(maxBookingCratesPerOrder),
        largePosPaymentThreshold: Number(largePosPaymentThreshold),
      }, request.user.sub);

      return {
        policy,
        policyHistory: [...history].sort((a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom)),
      };
    },
  });

  fastify.patch('/admin/config/transaction-categories', {
    preHandler: [authenticate, authorize('ADMIN')],
    handler: async (request, reply) => {
      const categories = Array.isArray(request.body?.categories) ? request.body.categories : null;
      if (!categories) {
        return reply.code(400).send({ error: 'categories must be an array.' });
      }

      const transactionCategories = await saveTransactionCategoryConfig(categories, request.user.sub);
      return { transactionCategories };
    },
  });

  fastify.patch('/admin/config/customer-egg-types', {
    preHandler: [authenticate, authorize('ADMIN')],
    handler: async (request, reply) => {
      const customerEggTypes = Array.isArray(request.body?.customerEggTypes) ? request.body.customerEggTypes : null;
      if (!customerEggTypes) {
        return reply.code(400).send({ error: 'customerEggTypes must be an array.' });
      }
      if (!customerEggTypes.some((entry) => entry?.isActive)) {
        return reply.code(400).send({ error: 'Keep at least one customer-facing egg type turned on.' });
      }

      const saved = await saveCustomerEggTypeConfig(customerEggTypes, request.user.sub);
      return { customerEggTypes: saved };
    },
  });

  fastify.post('/admin/bank-accounts', {
    preHandler: [authenticate, authorize('ADMIN')],
    handler: async (request, reply) => {
      const {
        name,
        accountType,
        lastFour,
        bankName,
        isActive = true,
        isVirtual = false,
        supportsStatementImport = true,
        sortOrder = 0,
      } = request.body;

      if (!name?.trim()) {
        return reply.code(400).send({ error: 'Account name is required.' });
      }

      if (!accountType) {
        return reply.code(400).send({ error: 'Account type is required.' });
      }

      if (!lastFour?.trim()) {
        return reply.code(400).send({ error: 'Last four is required.' });
      }

      const account = await prisma.bankAccount.create({
        data: {
          name: name.trim(),
          accountType,
          lastFour: lastFour.trim(),
          bankName: bankName?.trim() || 'Providus Bank',
          isActive: Boolean(isActive),
          isVirtual: Boolean(isVirtual),
          supportsStatementImport: Boolean(supportsStatementImport),
          sortOrder: Number(sortOrder) || 0,
        },
      });

      return reply.code(201).send({ bankAccount: serializeBankAccount(account) });
    },
  });

  fastify.patch('/admin/bank-accounts/:id', {
    preHandler: [authenticate, authorize('ADMIN')],
    handler: async (request, reply) => {
      const existing = await prisma.bankAccount.findUnique({
        where: { id: request.params.id },
      });

      if (!existing) {
        return reply.code(404).send({ error: 'Bank account not found.' });
      }

      const {
        name,
        lastFour,
        bankName,
        isActive,
        supportsStatementImport,
        sortOrder,
      } = request.body;

      const account = await prisma.bankAccount.update({
        where: { id: request.params.id },
        data: {
          ...(name !== undefined ? { name: String(name).trim() } : {}),
          ...(lastFour !== undefined ? { lastFour: String(lastFour).trim() } : {}),
          ...(bankName !== undefined ? { bankName: String(bankName).trim() } : {}),
          ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
          ...(supportsStatementImport !== undefined ? { supportsStatementImport: Boolean(supportsStatementImport) } : {}),
          ...(sortOrder !== undefined ? { sortOrder: Number(sortOrder) || 0 } : {}),
        },
      });

      return { bankAccount: serializeBankAccount(account) };
    },
  });
}
