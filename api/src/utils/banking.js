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
  const text = description.toLowerCase();

  if (direction === 'INFLOW') {
    if (text.includes('pospayment') || text.includes('medusa') || text.includes('settlement')) {
      return 'POS_SETTLEMENT';
    }
    if (text.includes('cash')) {
      return 'CASH_SALE';
    }
    return 'UNALLOCATED_INCOME';
  }

  if (direction === 'OUTFLOW') {
    if (text.includes('charge')) return 'BANK_CHARGES';
    return 'UNALLOCATED_EXPENSE';
  }

  return null;
}
