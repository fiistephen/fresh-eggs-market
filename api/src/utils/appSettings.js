import prisma from '../plugins/prisma.js';
import {
  DEFAULT_CRACK_ALLOWANCE_PERCENT,
  DEFAULT_TARGET_PROFIT_PER_CRATE,
} from './operationsPolicy.js';
import { defaultTransactionCategories, VALID_CATEGORIES, getCategoryDirection } from './banking.js';

export const OPERATIONS_POLICY_KEY = 'OPERATIONS_POLICY';
export const TRANSACTION_CATEGORIES_KEY = 'TRANSACTION_CATEGORIES';
export const CUSTOMER_EGG_TYPES_KEY = 'CUSTOMER_EGG_TYPES';

export const DEFAULT_OPERATIONS_POLICY = {
  targetProfitPerCrate: DEFAULT_TARGET_PROFIT_PER_CRATE,
  crackAllowancePercent: DEFAULT_CRACK_ALLOWANCE_PERCENT,
};

export const DEFAULT_TRANSACTION_CATEGORIES = defaultTransactionCategories();
export const DEFAULT_CUSTOMER_EGG_TYPES = [
  {
    key: 'REGULAR',
    label: 'Regular Size Eggs',
    shortLabel: 'Regular',
    isActive: true,
    sortOrder: 1,
  },
  {
    key: 'SMALL',
    label: 'Small Size Eggs',
    shortLabel: 'Small',
    isActive: true,
    sortOrder: 2,
  },
  {
    key: 'LARGE',
    label: 'Large Eggs',
    shortLabel: 'Large',
    isActive: false,
    sortOrder: 3,
  },
];

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

function normalizeEggTypeKey(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
}

function normalizeCustomerEggTypes(value) {
  const rawList = Array.isArray(value) ? value : [];
  const rawByKey = new Map(
    rawList
      .filter((entry) => normalizeEggTypeKey(entry?.key))
      .map((entry) => [normalizeEggTypeKey(entry.key), entry]),
  );

  return DEFAULT_CUSTOMER_EGG_TYPES.map((entry) => {
    const raw = rawByKey.get(entry.key) || {};
    const label = String(raw.label || entry.label).trim() || entry.label;
    const shortLabel = String(raw.shortLabel || raw.label || entry.shortLabel).trim() || entry.shortLabel;

    return {
      key: entry.key,
      label,
      shortLabel,
      isActive: raw.isActive !== undefined ? Boolean(raw.isActive) : entry.isActive,
      sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : entry.sortOrder,
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function findCustomerEggTypeByKey(types, key) {
  const normalizedKey = normalizeEggTypeKey(key);
  return (types || []).find((entry) => entry.key === normalizedKey) || null;
}

export function getCustomerEggTypeLabel(types, key) {
  return findCustomerEggTypeByKey(types, key)?.label || DEFAULT_CUSTOMER_EGG_TYPES[0].label;
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

export async function getCustomerEggTypeConfig() {
  const setting = await prisma.appSetting.upsert({
    where: { key: CUSTOMER_EGG_TYPES_KEY },
    update: {},
    create: {
      key: CUSTOMER_EGG_TYPES_KEY,
      value: DEFAULT_CUSTOMER_EGG_TYPES,
      description: 'Customer-facing egg type labels and active states used in batches, bookings, sales, portal, and reports.',
    },
  });

  return normalizeCustomerEggTypes(setting.value);
}

export async function saveCustomerEggTypeConfig(types, updatedById) {
  const normalized = normalizeCustomerEggTypes(types);

  const setting = await prisma.appSetting.upsert({
    where: { key: CUSTOMER_EGG_TYPES_KEY },
    update: {
      value: normalized,
      updatedById,
      description: 'Customer-facing egg type labels and active states used in batches, bookings, sales, portal, and reports.',
    },
    create: {
      key: CUSTOMER_EGG_TYPES_KEY,
      value: normalized,
      updatedById,
      description: 'Customer-facing egg type labels and active states used in batches, bookings, sales, portal, and reports.',
    },
  });

  return normalizeCustomerEggTypes(setting.value);
}
