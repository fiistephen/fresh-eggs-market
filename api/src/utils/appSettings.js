import prisma from '../plugins/prisma.js';
import {
  DEFAULT_CRACK_ALLOWANCE_PERCENT,
  DEFAULT_TARGET_PROFIT_PER_CRATE,
} from './operationsPolicy.js';
import { defaultTransactionCategories, VALID_CATEGORIES, getCategoryDirection } from './banking.js';

export const OPERATIONS_POLICY_KEY = 'OPERATIONS_POLICY';
export const TRANSACTION_CATEGORIES_KEY = 'TRANSACTION_CATEGORIES';

export const DEFAULT_OPERATIONS_POLICY = {
  targetProfitPerCrate: DEFAULT_TARGET_PROFIT_PER_CRATE,
  crackAllowancePercent: DEFAULT_CRACK_ALLOWANCE_PERCENT,
};

export const DEFAULT_TRANSACTION_CATEGORIES = defaultTransactionCategories();

function normalizePolicy(value) {
  const raw = value && typeof value === 'object' ? value : {};

  const targetProfitPerCrate = Number(raw.targetProfitPerCrate);
  const crackAllowancePercent = Number(raw.crackAllowancePercent);

  return {
    targetProfitPerCrate: Number.isFinite(targetProfitPerCrate) && targetProfitPerCrate > 0
      ? targetProfitPerCrate
      : DEFAULT_OPERATIONS_POLICY.targetProfitPerCrate,
    crackAllowancePercent: Number.isFinite(crackAllowancePercent) && crackAllowancePercent >= 0
      ? crackAllowancePercent
      : DEFAULT_OPERATIONS_POLICY.crackAllowancePercent,
  };
}

function normalizeTransactionCategories(value) {
  const rawList = Array.isArray(value) ? value : [];
  const rawByCategory = new Map(
    rawList
      .filter((entry) => entry?.category && VALID_CATEGORIES.includes(entry.category))
      .map((entry) => [entry.category, entry]),
  );

  return DEFAULT_TRANSACTION_CATEGORIES.map((entry) => {
    const raw = rawByCategory.get(entry.category) || {};
    return {
      category: entry.category,
      label: String(raw.label || entry.label).trim() || entry.label,
      description: String(raw.description || entry.description || '').trim(),
      direction: raw.direction === 'OUTFLOW' ? 'OUTFLOW' : raw.direction === 'INFLOW' ? 'INFLOW' : getCategoryDirection(entry.category),
      isActive: raw.isActive !== undefined ? Boolean(raw.isActive) : true,
    };
  });
}

export async function getOperationsPolicy() {
  const setting = await prisma.appSetting.upsert({
    where: { key: OPERATIONS_POLICY_KEY },
    update: {},
    create: {
      key: OPERATIONS_POLICY_KEY,
      value: DEFAULT_OPERATIONS_POLICY,
      description: 'Company-wide policy settings for batch profitability and crack monitoring.',
    },
  });

  return normalizePolicy(setting.value);
}

export async function saveOperationsPolicy(policy, updatedById) {
  const normalized = normalizePolicy(policy);

  const setting = await prisma.appSetting.upsert({
    where: { key: OPERATIONS_POLICY_KEY },
    update: {
      value: normalized,
      updatedById,
      description: 'Company-wide policy settings for batch profitability and crack monitoring.',
    },
    create: {
      key: OPERATIONS_POLICY_KEY,
      value: normalized,
      updatedById,
      description: 'Company-wide policy settings for batch profitability and crack monitoring.',
    },
  });

  return normalizePolicy(setting.value);
}

export async function getTransactionCategoryConfig() {
  const setting = await prisma.appSetting.upsert({
    where: { key: TRANSACTION_CATEGORIES_KEY },
    update: {},
    create: {
      key: TRANSACTION_CATEGORIES_KEY,
      value: DEFAULT_TRANSACTION_CATEGORIES,
      description: 'User-facing banking transaction category labels, descriptions, and active states.',
    },
  });

  return normalizeTransactionCategories(setting.value);
}

export async function saveTransactionCategoryConfig(categories, updatedById) {
  const normalized = normalizeTransactionCategories(categories);

  const setting = await prisma.appSetting.upsert({
    where: { key: TRANSACTION_CATEGORIES_KEY },
    update: {
      value: normalized,
      updatedById,
      description: 'User-facing banking transaction category labels, descriptions, and active states.',
    },
    create: {
      key: TRANSACTION_CATEGORIES_KEY,
      value: normalized,
      updatedById,
      description: 'User-facing banking transaction category labels, descriptions, and active states.',
    },
  });

  return normalizeTransactionCategories(setting.value);
}
