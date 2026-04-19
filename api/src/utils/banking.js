export const VALID_DIRECTIONS = ['INFLOW', 'OUTFLOW'];

export const VALID_CATEGORIES = [
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

// Categories available for staff to select when manually recording inflows.
// Note: CUSTOMER_BOOKING is intentionally excluded — per Meeting 3, all customer
// money enters as CUSTOMER_DEPOSIT; routing to a booking happens in the Bookings module.
// CUSTOMER_BOOKING remains in VALID_CATEGORIES for existing data and system use.
export const INFLOW_CATEGORIES = [
  'CUSTOMER_DEPOSIT',
  'DIRECT_SALE_TRANSFER',
  'SALES_TRANSFER_IN',
  'PROFIT_TRANSFER_IN',
  'POS_SETTLEMENT',
  'UNALLOCATED_INCOME',
  'CASH_SALE',
  'CASH_DEPOSIT_CONFIRMATION',
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

export const TRANSACTION_CATEGORY_METADATA = {
  CUSTOMER_DEPOSIT: {
    label: 'Customer deposit',
    description: 'Money received from a customer before it is allocated to a booking.',
    direction: 'INFLOW',
  },
  CUSTOMER_BOOKING: {
    label: 'Customer booking',
    description: 'Money received and used immediately for a booking.',
    direction: 'INFLOW',
  },
  DIRECT_SALE_TRANSFER: {
    label: 'Direct sale transfer',
    description: 'A direct sale paid by transfer into the bank.',
    direction: 'INFLOW',
  },
  SALES_TRANSFER_IN: {
    label: 'Sales transfer in',
    description: 'Money moved into the Sales Account from another internal account.',
    direction: 'INFLOW',
  },
  PROFIT_TRANSFER_IN: {
    label: 'Profit transfer in',
    description: 'Money moved into the Profit Account from another internal account.',
    direction: 'INFLOW',
  },
  POS_SETTLEMENT: {
    label: 'POS settlement',
    description: 'Card payments settled into the bank account.',
    direction: 'INFLOW',
  },
  UNALLOCATED_INCOME: {
    label: 'Unallocated income',
    description: 'Money in that still needs a final category or customer decision.',
    direction: 'INFLOW',
  },
  CASH_SALE: {
    label: 'Cash sale',
    description: 'Cash received from a direct sale before it is moved into the bank.',
    direction: 'INFLOW',
  },
  CASH_DEPOSIT_CONFIRMATION: {
    label: 'Cash deposit confirmation',
    description: 'Bank statement inflow confirming cash that was already moved from Cash Account to the bank.',
    direction: 'INFLOW',
  },
  INTERNAL_TRANSFER_IN: {
    label: 'Internal transfer in',
    description: 'Money moved in from another company account.',
    direction: 'INFLOW',
  },
  REFUND: {
    label: 'Refund',
    description: 'Money returned to a customer.',
    direction: 'OUTFLOW',
  },
  BANK_CHARGES: {
    label: 'Bank charges',
    description: 'Bank fees and deductions.',
    direction: 'OUTFLOW',
  },
  SALES_TRANSFER_OUT: {
    label: 'Sales transfer out',
    description: 'Money moved out to the Sales Account.',
    direction: 'OUTFLOW',
  },
  PROFIT_TRANSFER_OUT: {
    label: 'Profit transfer out',
    description: 'Money moved out to the Profit Account.',
    direction: 'OUTFLOW',
  },
  FARMER_PAYMENT: {
    label: 'Farmer payment',
    description: 'Payment made to the farm or supplier.',
    direction: 'OUTFLOW',
  },
  SALARY: {
    label: 'Salary',
    description: 'Salary or staff pay.',
    direction: 'OUTFLOW',
  },
  DIESEL_FUEL: {
    label: 'Diesel / fuel',
    description: 'Diesel, fuel, or generator running cost.',
    direction: 'OUTFLOW',
  },
  INTERNET: {
    label: 'Internet',
    description: 'Internet, data, or communication bills.',
    direction: 'OUTFLOW',
  },
  MARKETING: {
    label: 'Marketing',
    description: 'Marketing and promotion spending.',
    direction: 'OUTFLOW',
  },
  OTHER_EXPENSE: {
    label: 'Other expense',
    description: 'Any expense that does not fit the main categories.',
    direction: 'OUTFLOW',
  },
  UNALLOCATED_EXPENSE: {
    label: 'Unallocated expense',
    description: 'Money out that still needs a final category decision.',
    direction: 'OUTFLOW',
  },
  INTERNAL_TRANSFER_OUT: {
    label: 'Internal transfer out',
    description: 'Money moved out to another company account.',
    direction: 'OUTFLOW',
  },
};

export function normalizeCategoryKey(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function defaultTransactionCategories() {
  return VALID_CATEGORIES.map((category) => ({
    category,
    label: TRANSACTION_CATEGORY_METADATA[category]?.label || category,
    description: TRANSACTION_CATEGORY_METADATA[category]?.description || '',
    direction: TRANSACTION_CATEGORY_METADATA[category]?.direction || getCategoryDirection(category),
    isActive: true,
  }));
}

export function normalizeAmount(value) {
  if (value == null || value === '') return 0;
  return Number(value);
}

export function getCategoryDirection(category) {
  if (INFLOW_CATEGORIES.includes(category)) return 'INFLOW';
  if (OUTFLOW_CATEGORIES.includes(category)) return 'OUTFLOW';
  return null;
}

export function inferStatementCategory({ direction, description = '' }) {
  if (direction === 'INFLOW') {
    return 'UNALLOCATED_INCOME';
  }

  if (direction === 'OUTFLOW') {
    return 'UNALLOCATED_EXPENSE';
  }

  return null;
}
