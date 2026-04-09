import prisma from '../plugins/prisma.js';

export const ACTIVE_CHECKOUT_HOLD_STATUSES = ['AWAITING_PAYMENT', 'AWAITING_TRANSFER', 'ADMIN_CONFIRMED'];
export const ACTIVE_BUY_NOW_ORDER_STATUSES = ['OPEN', 'AWAITING_PAYMENT', 'PENDING_TRANSFER_CONFIRMATION', 'APPROVED_FOR_PICKUP'];

export function addMinutes(dateInput, minutes) {
  const date = new Date(dateInput);
  date.setMinutes(date.getMinutes() + minutes);
  return date;
}

export function addDays(dateInput, days) {
  const date = new Date(dateInput);
  date.setDate(date.getDate() + days);
  return date;
}

export function buildPortalReference(prefix) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `FE-${prefix}-${stamp}-${random}`;
}

export function buildPickupWindow(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = addDays(start, 3);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export async function getCustomerDepositAccount() {
  return prisma.bankAccount.findFirst({
    where: {
      isActive: true,
      accountType: 'CUSTOMER_DEPOSIT',
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function getActivePortalBookingHoldQuantity(batchId, options = {}) {
  const now = new Date();
  const where = {
    batchId,
    checkoutType: 'BOOK_UPCOMING',
    bookingId: null,
    status: { in: ACTIVE_CHECKOUT_HOLD_STATUSES },
    OR: [
      { paymentWindowEndsAt: null },
      { paymentWindowEndsAt: { gt: now } },
    ],
  };

  if (options.excludeCheckoutId) {
    where.id = { not: options.excludeCheckoutId };
  }

  const aggregate = await prisma.portalCheckout.aggregate({
    where,
    _sum: { quantity: true },
  });

  return aggregate._sum.quantity || 0;
}

export async function getActivePortalBuyNowHoldQuantity(batchId, options = {}) {
  const now = new Date();

  const pendingCheckoutWhere = {
    batchId,
    checkoutType: 'BUY_NOW',
    portalOrderRequestId: null,
    status: { in: ACTIVE_CHECKOUT_HOLD_STATUSES },
    OR: [
      { paymentWindowEndsAt: null },
      { paymentWindowEndsAt: { gt: now } },
    ],
  };

  if (options.excludeCheckoutId) {
    pendingCheckoutWhere.id = { not: options.excludeCheckoutId };
  }

  const [checkoutAgg, orderAgg] = await Promise.all([
    prisma.portalCheckout.aggregate({
      where: pendingCheckoutWhere,
      _sum: { quantity: true },
    }),
    prisma.portalOrderRequest.aggregate({
      where: {
        batchId,
        status: { in: ACTIVE_BUY_NOW_ORDER_STATUSES },
      },
      _sum: { quantity: true },
    }),
  ]);

  return (checkoutAgg._sum.quantity || 0) + (orderAgg._sum.quantity || 0);
}
