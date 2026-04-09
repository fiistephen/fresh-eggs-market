import prisma from '../plugins/prisma.js';
import {
  DEFAULT_BOOKING_MIN_PAYMENT_PERCENT,
  DEFAULT_CRACK_ALLOWANCE_PERCENT,
  DEFAULT_FIRST_CUSTOMER_ORDER_LIMIT_COUNT,
  DEFAULT_FIRST_TIME_BOOKING_LIMIT_CRATES,
  DEFAULT_LARGE_POS_PAYMENT_THRESHOLD,
  DEFAULT_MAX_BOOKING_CRATES_PER_ORDER,
  DEFAULT_TARGET_PROFIT_PER_CRATE,
} from './operationsPolicy.js';
import {
  defaultTransactionCategories,
  VALID_CATEGORIES,
  getCategoryDirection,
  normalizeCategoryKey,
} from './banking.js';

export const OPERATIONS_POLICY_KEY = 'OPERATIONS_POLICY';
export const TRANSACTION_CATEGORIES_KEY = 'TRANSACTION_CATEGORIES';
export const CUSTOMER_EGG_TYPES_KEY = 'CUSTOMER_EGG_TYPES';

export const DEFAULT_OPERATIONS_POLICY = {
  targetProfitPerCrate: DEFAULT_TARGET_PROFIT_PER_CRATE,
  crackAllowancePercent: DEFAULT_CRACK_ALLOWANCE_PERCENT,
  crackedCratesAllowance: null,
  writeOffCratesAllowance: null,
  bookingMinimumPaymentPercent: DEFAULT_BOOKING_MIN_PAYMENT_PERCENT,
  firstTimeBookingLimitCrates: DEFAULT_FIRST_TIME_BOOKING_LIMIT_CRATES,
  firstCustomerOrderLimitCount: DEFAULT_FIRST_CUSTOMER_ORDER_LIMIT_COUNT,
  maxBookingCratesPerOrder: DEFAULT_MAX_BOOKING_CRATES_PER_ORDER,
  largePosPaymentThreshold: DEFAULT_LARGE_POS_PAYMENT_THRESHOLD,
  undepositedCashAlertHours: 24,
  pendingCashDepositConfirmationHours: 24,
  cashDepositMatchWindowDays: 2,
};
const DEFAULT_POLICY_EFFECTIVE_FROM = '1970-01-01T00:00:00.000Z';

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

function normalizeOptionalWholeNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

function normalizePolicy(value, fallback = DEFAULT_OPERATIONS_POLICY) {
  const raw = value && typeof value === 'object' ? value : {};

  const targetProfitPerCrate = Number(raw.targetProfitPerCrate);
  const crackAllowancePercent = Number(raw.crackAllowancePercent);
  const bookingMinimumPaymentPercent = Number(raw.bookingMinimumPaymentPercent);
  const firstTimeBookingLimitCrates = Number(raw.firstTimeBookingLimitCrates);
  const firstCustomerOrderLimitCount = Number(raw.firstCustomerOrderLimitCount);
  const maxBookingCratesPerOrder = Number(raw.maxBookingCratesPerOrder);
  const largePosPaymentThreshold = Number(raw.largePosPaymentThreshold);
  const undepositedCashAlertHours = Number(raw.undepositedCashAlertHours);
  const pendingCashDepositConfirmationHours = Number(raw.pendingCashDepositConfirmationHours);
  const cashDepositMatchWindowDays = Number(raw.cashDepositMatchWindowDays);

  return {
    targetProfitPerCrate: Number.isFinite(targetProfitPerCrate) && targetProfitPerCrate > 0
      ? targetProfitPerCrate
      : fallback.targetProfitPerCrate,
    crackAllowancePercent: Number.isFinite(crackAllowancePercent) && crackAllowancePercent >= 0
      ? crackAllowancePercent
      : fallback.crackAllowancePercent,
    crackedCratesAllowance: normalizeOptionalWholeNumber(raw.crackedCratesAllowance),
    writeOffCratesAllowance: normalizeOptionalWholeNumber(raw.writeOffCratesAllowance),
    bookingMinimumPaymentPercent: Number.isFinite(bookingMinimumPaymentPercent) && bookingMinimumPaymentPercent > 0 && bookingMinimumPaymentPercent <= 100
      ? bookingMinimumPaymentPercent
      : fallback.bookingMinimumPaymentPercent,
    firstTimeBookingLimitCrates: Number.isFinite(firstTimeBookingLimitCrates) && firstTimeBookingLimitCrates > 0
      ? Math.round(firstTimeBookingLimitCrates)
      : fallback.firstTimeBookingLimitCrates,
    firstCustomerOrderLimitCount: Number.isFinite(firstCustomerOrderLimitCount) && firstCustomerOrderLimitCount > 0
      ? Math.round(firstCustomerOrderLimitCount)
      : fallback.firstCustomerOrderLimitCount,
    maxBookingCratesPerOrder: Number.isFinite(maxBookingCratesPerOrder) && maxBookingCratesPerOrder > 0
      ? Math.round(maxBookingCratesPerOrder)
      : fallback.maxBookingCratesPerOrder,
    largePosPaymentThreshold: Number.isFinite(largePosPaymentThreshold) && largePosPaymentThreshold >= 0
      ? largePosPaymentThreshold
      : fallback.largePosPaymentThreshold,
    undepositedCashAlertHours: Number.isFinite(undepositedCashAlertHours) && undepositedCashAlertHours > 0
      ? Math.round(undepositedCashAlertHours)
      : fallback.undepositedCashAlertHours,
    pendingCashDepositConfirmationHours: Number.isFinite(pendingCashDepositConfirmationHours) && pendingCashDepositConfirmationHours > 0
      ? Math.round(pendingCashDepositConfirmationHours)
      : fallback.pendingCashDepositConfirmationHours,
    cashDepositMatchWindowDays: Number.isFinite(cashDepositMatchWindowDays) && cashDepositMatchWindowDays > 0
      ? Math.round(cashDepositMatchWindowDays)
      : fallback.cashDepositMatchWindowDays,
  };
}

function normalizePolicyVersion(value, fallbackPolicy = DEFAULT_OPERATIONS_POLICY) {
  const normalizedPolicy = normalizePolicy(value, fallbackPolicy);
  const effectiveDate = new Date(value?.effectiveFrom || DEFAULT_POLICY_EFFECTIVE_FROM);

  return {
    ...normalizedPolicy,
    effectiveFrom: Number.isNaN(effectiveDate.getTime())
      ? DEFAULT_POLICY_EFFECTIVE_FROM
      : effectiveDate.toISOString(),
  };
}

function normalizePolicyHistory(value) {
  const rawValue = value ?? null;

  if (Array.isArray(rawValue) && rawValue.length > 0) {
    const versions = [];
    let previousPolicy = DEFAULT_OPERATIONS_POLICY;

    for (const entry of rawValue) {
      const normalizedEntry = normalizePolicyVersion(entry, previousPolicy);
      previousPolicy = {
        targetProfitPerCrate: normalizedEntry.targetProfitPerCrate,
        crackAllowancePercent: normalizedEntry.crackAllowancePercent,
        crackedCratesAllowance: normalizedEntry.crackedCratesAllowance,
        writeOffCratesAllowance: normalizedEntry.writeOffCratesAllowance,
        bookingMinimumPaymentPercent: normalizedEntry.bookingMinimumPaymentPercent,
        firstTimeBookingLimitCrates: normalizedEntry.firstTimeBookingLimitCrates,
        firstCustomerOrderLimitCount: normalizedEntry.firstCustomerOrderLimitCount,
        maxBookingCratesPerOrder: normalizedEntry.maxBookingCratesPerOrder,
        largePosPaymentThreshold: normalizedEntry.largePosPaymentThreshold,
        undepositedCashAlertHours: normalizedEntry.undepositedCashAlertHours,
        pendingCashDepositConfirmationHours: normalizedEntry.pendingCashDepositConfirmationHours,
        cashDepositMatchWindowDays: normalizedEntry.cashDepositMatchWindowDays,
      };
      versions.push(normalizedEntry);
    }

    return versions
      .sort((a, b) => new Date(a.effectiveFrom) - new Date(b.effectiveFrom))
      .filter((entry, index, list) => index === list.findIndex((item) => item.effectiveFrom === entry.effectiveFrom));
  }

  if (rawValue && typeof rawValue === 'object') {
    return [{
      ...normalizePolicy(rawValue),
      effectiveFrom: DEFAULT_POLICY_EFFECTIVE_FROM,
    }];
  }

  return [{
    ...DEFAULT_OPERATIONS_POLICY,
    effectiveFrom: DEFAULT_POLICY_EFFECTIVE_FROM,
  }];
}

function normalizeTransactionCategories(value) {
  const rawList = Array.isArray(value) ? value : [];
  const rawByCategory = new Map(
    rawList
      .filter((entry) => normalizeCategoryKey(entry?.category))
      .map((entry) => [normalizeCategoryKey(entry.category), entry]),
  );

  const systemEntries = DEFAULT_TRANSACTION_CATEGORIES.map((entry) => {
    const raw = rawByCategory.get(entry.category) || {};
    return {
      category: entry.category,
      label: String(raw.label || entry.label).trim() || entry.label,
      description: String(raw.description || entry.description || '').trim(),
      direction: raw.direction === 'OUTFLOW' ? 'OUTFLOW' : raw.direction === 'INFLOW' ? 'INFLOW' : getCategoryDirection(entry.category),
      isActive: raw.isActive !== undefined ? Boolean(raw.isActive) : true,
    };
  });

  const systemCategorySet = new Set(systemEntries.map((entry) => entry.category));
  const customEntries = rawList
    .map((entry) => {
      const category = normalizeCategoryKey(entry?.category || entry?.label);
      if (!category || systemCategorySet.has(category)) return null;
      const label = String(entry?.label || '')
        .trim();
      const direction = entry?.direction === 'OUTFLOW' ? 'OUTFLOW' : entry?.direction === 'INFLOW' ? 'INFLOW' : null;
      if (!label || !direction) return null;

      return {
        category,
        label,
        description: String(entry?.description || '').trim(),
        direction,
        isActive: entry?.isActive !== undefined ? Boolean(entry.isActive) : true,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label));

  return [...systemEntries, ...customEntries];
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

export function resolveOperationsPolicyAt(history, atDate = new Date()) {
  const normalizedHistory = normalizePolicyHistory(history);
  const targetDate = atDate instanceof Date ? atDate : new Date(atDate);
  const safeTargetDate = Number.isNaN(targetDate.getTime()) ? new Date() : targetDate;

  let selected = normalizedHistory[0];
  for (const entry of normalizedHistory) {
    if (new Date(entry.effectiveFrom) <= safeTargetDate) {
      selected = entry;
    } else {
      break;
    }
  }

  return selected;
}

export async function getOperationsPolicyHistory() {
  const setting = await prisma.appSetting.upsert({
    where: { key: OPERATIONS_POLICY_KEY },
    update: {},
    create: {
      key: OPERATIONS_POLICY_KEY,
      value: [{
        ...DEFAULT_OPERATIONS_POLICY,
        effectiveFrom: DEFAULT_POLICY_EFFECTIVE_FROM,
      }],
      description: 'Company-wide policy settings with history so new policy changes apply only from their effective date onward.',
    },
  });

  const history = normalizePolicyHistory(setting.value);

  if (JSON.stringify(history) !== JSON.stringify(setting.value)) {
    await prisma.appSetting.update({
      where: { key: OPERATIONS_POLICY_KEY },
      data: {
        value: history,
        description: 'Company-wide policy settings with history so new policy changes apply only from their effective date onward.',
      },
    });
  }

  return history;
}

export async function getOperationsPolicy(atDate = new Date()) {
  const history = await getOperationsPolicyHistory();
  return resolveOperationsPolicyAt(history, atDate);
}

export async function saveOperationsPolicy(policy, updatedById, effectiveFrom = new Date()) {
  const history = await getOperationsPolicyHistory();
  const lastPolicy = history[history.length - 1] || {
    ...DEFAULT_OPERATIONS_POLICY,
    effectiveFrom: DEFAULT_POLICY_EFFECTIVE_FROM,
  };
  const normalized = normalizePolicyVersion({
    ...policy,
    effectiveFrom,
  }, lastPolicy);

  const nextHistory = [...history, normalized]
    .sort((a, b) => new Date(a.effectiveFrom) - new Date(b.effectiveFrom))
    .filter((entry, index, list) => index === list.findIndex((item) => item.effectiveFrom === entry.effectiveFrom));

  const setting = await prisma.appSetting.upsert({
    where: { key: OPERATIONS_POLICY_KEY },
    update: {
      value: nextHistory,
      updatedById,
      description: 'Company-wide policy settings with history so new policy changes apply only from their effective date onward.',
    },
    create: {
      key: OPERATIONS_POLICY_KEY,
      value: nextHistory,
      updatedById,
      description: 'Company-wide policy settings with history so new policy changes apply only from their effective date onward.',
    },
  });

  const savedHistory = normalizePolicyHistory(setting.value);
  return {
    policy: resolveOperationsPolicyAt(savedHistory, normalized.effectiveFrom),
    history: savedHistory,
  };
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
