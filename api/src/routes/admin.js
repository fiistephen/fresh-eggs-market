import prisma from '../plugins/prisma.js';
import { authenticate } from '../plugins/auth.js';
import { authorize } from '../middleware/authorize.js';
import {
  getCustomerEggTypeConfig,
  getOperationsPolicy,
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
      const [policy, bankAccounts, transactionCategories, customerEggTypes] = await Promise.all([
        getOperationsPolicy(),
        loadBankAccounts(),
        getTransactionCategoryConfig(),
        getCustomerEggTypeConfig(),
      ]);

      return {
        policy,
        bankAccounts,
        transactionCategories,
        customerEggTypes,
      };
    },
  });

  fastify.patch('/admin/config/policy', {
    preHandler: [authenticate, authorize('ADMIN')],
    handler: async (request, reply) => {
      const { targetProfitPerCrate, crackAllowancePercent } = request.body;

      if (targetProfitPerCrate == null || Number(targetProfitPerCrate) <= 0) {
        return reply.code(400).send({ error: 'Target profit per crate must be greater than zero.' });
      }

      if (crackAllowancePercent == null || Number(crackAllowancePercent) < 0) {
        return reply.code(400).send({ error: 'Crack allowance must be zero or higher.' });
      }

      const policy = await saveOperationsPolicy({
        targetProfitPerCrate: Number(targetProfitPerCrate),
        crackAllowancePercent: Number(crackAllowancePercent),
      }, request.user.sub);

      return { policy };
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
