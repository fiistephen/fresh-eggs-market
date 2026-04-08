export const ACCOUNT_STYLES = {
  CUSTOMER_DEPOSIT: 'from-blue-50 to-white border-blue-200',
  SALES: 'from-green-50 to-white border-green-200',
  PROFIT: 'from-purple-50 to-white border-purple-200',
  CASH_ON_HAND: 'from-amber-50 to-white border-amber-200',
};

export const DIRECTION_COLORS = {
  INFLOW: 'text-green-600',
  OUTFLOW: 'text-red-600',
};

export const SOURCE_LABELS = {
  MANUAL: 'Manual',
  STATEMENT_IMPORT: 'Statement import',
  INTERNAL_TRANSFER: 'Internal transfer',
  SYSTEM: 'System',
};

export const RECONCILIATION_STYLES = {
  BALANCED: 'bg-green-100 text-green-700',
  VARIANCE: 'bg-red-100 text-red-700',
  OPEN: 'bg-amber-100 text-amber-700',
};

export const CATEGORY_LABELS = {
  CUSTOMER_DEPOSIT: 'Customer deposit',
  CUSTOMER_BOOKING: 'Customer booking',
  DIRECT_SALE_TRANSFER: 'Direct sale transfer',
  SALES_TRANSFER_IN: 'Sales transfer in',
  PROFIT_TRANSFER_IN: 'Profit transfer in',
  POS_SETTLEMENT: 'POS settlement',
  UNALLOCATED_INCOME: 'Unallocated income',
  CASH_SALE: 'Cash sale',
  INTERNAL_TRANSFER_IN: 'Internal transfer in',
  REFUND: 'Refund',
  BANK_CHARGES: 'Bank charges',
  SALES_TRANSFER_OUT: 'Sales transfer out',
  PROFIT_TRANSFER_OUT: 'Profit transfer out',
  FARMER_PAYMENT: 'Farmer payment',
  SALARY: 'Salary',
  DIESEL_FUEL: 'Diesel / fuel',
  INTERNET: 'Internet',
  MARKETING: 'Marketing',
  OTHER_EXPENSE: 'Other expense',
  UNALLOCATED_EXPENSE: 'Unallocated expense',
  INTERNAL_TRANSFER_OUT: 'Internal transfer out',
};

export const INFLOW_CATEGORIES = [
  'CUSTOMER_DEPOSIT',
  'CUSTOMER_BOOKING',
  'DIRECT_SALE_TRANSFER',
  'SALES_TRANSFER_IN',
  'PROFIT_TRANSFER_IN',
  'POS_SETTLEMENT',
  'UNALLOCATED_INCOME',
  'CASH_SALE',
  'INTERNAL_TRANSFER_IN',
];

export const OUTFLOW_CATEGORIES = [
  'REFUND',
  'BANK_CHARGES',
  'SALES_TRANSFER_OUT',
  'PROFIT_TRANSFER_OUT',
  'FARMER_PAYMENT',
  'SALARY',
  'DIESEL_FUEL',
  'INTERNET',
  'MARKETING',
  'OTHER_EXPENSE',
  'UNALLOCATED_EXPENSE',
  'INTERNAL_TRANSFER_OUT',
];

// --- Utility functions ---

export function buildCategoryMap(transactionCategories = []) {
  return transactionCategories.reduce((acc, entry) => {
    acc[entry.category] = entry;
    return acc;
  }, {});
}

export function categoryLabel(category, categoryMap = {}) {
  return categoryMap[category]?.label || CATEGORY_LABELS[category] || category;
}

export function categoryDescription(category, categoryMap = {}) {
  return categoryMap[category]?.description || '';
}

export function categoryOptionsForDirection(direction, categoryMap = {}, currentCategory = '') {
  const configured = Object.values(categoryMap)
    .filter((entry) => entry.direction === direction)
    .filter((entry) => entry.isActive !== false || entry.category === currentCategory)
    .sort((a, b) => (a.label || a.category).localeCompare(b.label || b.category))
    .map((entry) => entry.category);

  if (configured.length > 0) return configured;

  const source = direction === 'OUTFLOW' ? OUTFLOW_CATEGORIES : INFLOW_CATEGORIES;
  return source.filter((category) => categoryMap[category]?.isActive !== false || category === currentCategory);
}

export function fmtMoney(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(Number(n));
}

export function fmtDate(value, withTime = false) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-NG', withTime
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function accountLabel(account) {
  if (!account) return '—';
  const displayName = displayAccountName(account);
  return account.lastFour === 'CASH'
    ? displayName
    : `${displayName} • ••••${account.lastFour}`;
}

export function displayAccountName(account) {
  if (!account) return '—';
  if (account.accountType === 'CASH_ON_HAND') return 'Cash Account';
  return account.name;
}

export function accountPurpose(accountType) {
  const purposes = {
    CUSTOMER_DEPOSIT: 'Money paid into the bank should land here first.',
    SALES: 'Move money here when you are ready to separate sales funds.',
    PROFIT: 'Move profit here before paying expenses.',
    CASH_ON_HAND: 'Record cash received here first, then move it to Customer Deposit after banking it.',
  };
  return purposes[accountType] || 'Use this account for banking entries and transfers.';
}

export function importCount(importRecord, key) {
  return importRecord?.counts?.[key] || importRecord?.counts?.[key?.toUpperCase?.()] || 0;
}
