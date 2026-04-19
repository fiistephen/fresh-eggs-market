// Account gradient styles using design system tokens
export const ACCOUNT_STYLES = {
  CUSTOMER_DEPOSIT: 'from-info-50 to-surface-0 border-info-100',
  SALES: 'from-success-50 to-surface-0 border-success-100',
  PROFIT: 'from-brand-50 to-surface-0 border-brand-100',
  CASH_ON_HAND: 'from-warning-50 to-surface-0 border-warning-100',
};

// Direction text colors using design system tokens
export const DIRECTION_COLORS = {
  INFLOW: 'text-success-700',
  OUTFLOW: 'text-error-700',
};

// Data source labels
export const SOURCE_LABELS = {
  MANUAL: 'Manual',
  STATEMENT_IMPORT: 'Statement import',
  INTERNAL_TRANSFER: 'Internal transfer',
  CASH_DEPOSIT: 'Cash deposit',
  SYSTEM: 'System',
};

// Reconciliation status styles using design system tokens
export const RECONCILIATION_STYLES = {
  BALANCED: 'bg-success-100 text-success-700',
  VARIANCE: 'bg-error-100 text-error-700',
  OPEN: 'bg-warning-100 text-warning-700',
};

// Category filter presets (for TransactionsView)
export const CATEGORY_FILTER_PRESETS = {
  unallocated: {
    label: 'Unallocated',
    value: 'UNALLOCATED_INCOME,UNALLOCATED_EXPENSE',
  },
};

// Transaction category display labels
export const CATEGORY_LABELS = {
  CUSTOMER_DEPOSIT: 'Customer deposit',
  CUSTOMER_BOOKING: 'Customer booking',
  DIRECT_SALE_TRANSFER: 'Direct sale transfer',
  SALES_TRANSFER_IN: 'Sales transfer in',
  PROFIT_TRANSFER_IN: 'Profit transfer in',
  POS_SETTLEMENT: 'POS settlement',
  UNALLOCATED_INCOME: 'Unallocated income',
  CASH_SALE: 'Cash sale',
  CASH_DEPOSIT_CONFIRMATION: 'Cash deposit confirmation',
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

// Valid inflow categories
export const INFLOW_CATEGORIES = [
  'CUSTOMER_DEPOSIT',
  'CUSTOMER_BOOKING',
  'DIRECT_SALE_TRANSFER',
  'SALES_TRANSFER_IN',
  'PROFIT_TRANSFER_IN',
  'POS_SETTLEMENT',
  'UNALLOCATED_INCOME',
  'CASH_SALE',
  'CASH_DEPOSIT_CONFIRMATION',
  'INTERNAL_TRANSFER_IN',
];

// Valid outflow categories
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

/**
 * Build a category lookup map from an array of transaction categories.
 * @param {Array} transactionCategories - Array of category configuration objects
 * @returns {Object} Map of category -> config
 */
export function buildCategoryMap(transactionCategories = []) {
  return transactionCategories.reduce((acc, entry) => {
    acc[entry.category] = entry;
    return acc;
  }, {});
}

/**
 * Get display label for a category from the map or fallback to CATEGORY_LABELS.
 * @param {string} category - Category key
 * @param {Object} categoryMap - Category configuration map
 * @returns {string} Display label
 */
export function categoryLabel(category, categoryMap = {}) {
  return categoryMap[category]?.label || CATEGORY_LABELS[category] || category;
}

/**
 * Get description for a category from the map.
 * @param {string} category - Category key
 * @param {Object} categoryMap - Category configuration map
 * @returns {string} Description or empty string
 */
export function categoryDescription(category, categoryMap = {}) {
  return categoryMap[category]?.description || '';
}

/**
 * Get valid category options for a given direction (INFLOW or OUTFLOW).
 * Filters by direction and active status, with fallback to default lists.
 * @param {string} direction - 'INFLOW' or 'OUTFLOW'
 * @param {Object} categoryMap - Category configuration map
 * @param {string} currentCategory - Current category to always include
 * @returns {Array} Array of valid category keys
 */
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

/**
 * Format a number as Nigerian Naira currency.
 * @param {number} n - Amount to format
 * @returns {string} Formatted currency string
 */
export function fmtMoney(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(Number(n));
}

/**
 * Format a date in Nigerian locale.
 * @param {Date|string} value - Date value to format
 * @param {boolean} withTime - Include time in output
 * @returns {string} Formatted date string
 */
export function fmtDate(value, withTime = false) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-NG', withTime
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Get today's date as an ISO 8601 date string (YYYY-MM-DD).
 * @returns {string} ISO date string
 */
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Get display label for a bank account, including last 4 digits if applicable.
 * @param {Object} account - Account object
 * @returns {string} Display label
 */
export function accountLabel(account) {
  if (!account) return '—';
  const displayName = displayAccountName(account);
  return account.lastFour === 'CASH'
    ? displayName
    : `${displayName} • ••••${account.lastFour}`;
}

/**
 * Get display name for a bank account.
 * @param {Object} account - Account object
 * @returns {string} Display name
 */
export function displayAccountName(account) {
  if (!account) return '—';
  if (account.accountType === 'CASH_ON_HAND') return 'Cash Account';
  return account.name;
}

/**
 * Get the purpose description for an account type.
 * @param {string} accountType - Account type key
 * @returns {string} Purpose description
 */
export function accountPurpose(accountType) {
  const purposes = {
    CUSTOMER_DEPOSIT: 'Money paid into the bank should land here first.',
    SALES: 'Move money here when you are ready to separate sales funds.',
    PROFIT: 'Move profit here before paying expenses.',
    CASH_ON_HAND: 'Record cash received here first, then move it to Customer Deposit after banking it.',
  };
  return purposes[accountType] || 'Use this account for banking entries and transfers.';
}

/**
 * Get count value from an import record, with case-insensitive fallback.
 * @param {Object} importRecord - Import record object
 * @param {string} key - Count key to retrieve
 * @returns {number} Count value or 0
 */
export function importCount(importRecord, key) {
  return importRecord?.counts?.[key] || importRecord?.counts?.[key?.toUpperCase?.()] || 0;
}
