import prisma from '../plugins/prisma.js';
import {
  DEFAULT_FIRST_CUSTOMER_ORDER_LIMIT_COUNT,
  DEFAULT_FIRST_TIME_BOOKING_LIMIT_CRATES,
  DEFAULT_MAX_BOOKING_CRATES_PER_ORDER,
} from './operationsPolicy.js';

const ACTIVE_CHECKOUT_STATUSES = ['AWAITING_PAYMENT', 'AWAITING_TRANSFER', 'PAID'];
const ACTIVE_PORTAL_ORDER_STATUSES = ['OPEN', 'AWAITING_PAYMENT', 'PENDING_TRANSFER_CONFIRMATION', 'APPROVED_FOR_PICKUP', 'FULFILLED'];

function positiveWholeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

export function buildCustomerOrderLimitProfile(policy = {}, trackedOrderCount = 0) {
  const earlyOrderLimitCount = positiveWholeNumber(
    policy.firstCustomerOrderLimitCount,
    DEFAULT_FIRST_CUSTOMER_ORDER_LIMIT_COUNT,
  );
  const earlyOrderCrateLimit = positiveWholeNumber(
    policy.firstTimeBookingLimitCrates,
    DEFAULT_FIRST_TIME_BOOKING_LIMIT_CRATES,
  );
  const standardOrderCrateLimit = Math.max(
    earlyOrderCrateLimit,
    positiveWholeNumber(
      policy.maxBookingCratesPerOrder,
      DEFAULT_MAX_BOOKING_CRATES_PER_ORDER,
    ),
  );
  const safeTrackedOrderCount = Math.max(0, Number(trackedOrderCount) || 0);
  const isUsingEarlyOrderLimit = safeTrackedOrderCount < earlyOrderLimitCount;

  return {
    trackedOrderCount: safeTrackedOrderCount,
    earlyOrderLimitCount,
    earlyOrderCrateLimit,
    standardOrderCrateLimit,
    currentPerOrderLimit: isUsingEarlyOrderLimit ? earlyOrderCrateLimit : standardOrderCrateLimit,
    earlyOrdersRemaining: Math.max(0, earlyOrderLimitCount - safeTrackedOrderCount),
    isUsingEarlyOrderLimit,
    nextOrderNumber: safeTrackedOrderCount + 1,
  };
}

export function getPerOrderCrateLimit(policy = {}, trackedOrderCount = 0) {
  return buildCustomerOrderLimitProfile(policy, trackedOrderCount).currentPerOrderLimit;
}

export async function getCustomerTrackedOrderCount(customerId) {
  if (!customerId) return 0;

  const [bookingCount, portalOrderCount, checkoutHoldCount, directSaleCount] = await Promise.all([
    prisma.booking.count({
      where: {
        customerId,
        status: { not: 'CANCELLED' },
      },
    }),
    prisma.portalOrderRequest.count({
      where: {
        customerId,
        status: { in: ACTIVE_PORTAL_ORDER_STATUSES },
      },
    }),
    prisma.portalCheckout.count({
      where: {
        customerId,
        status: { in: ACTIVE_CHECKOUT_STATUSES },
        OR: [
          {
            checkoutType: 'BOOK_UPCOMING',
            bookingId: null,
          },
          {
            checkoutType: 'BUY_NOW',
            portalOrderRequestId: null,
          },
        ],
      },
    }),
    prisma.sale.count({
      where: {
        customerId,
        bookingId: null,
      },
    }),
  ]);

  return bookingCount + portalOrderCount + checkoutHoldCount + directSaleCount;
}

export async function getCustomerOrderLimitProfile(customerId, policy = {}) {
  const trackedOrderCount = await getCustomerTrackedOrderCount(customerId);
  return buildCustomerOrderLimitProfile(policy, trackedOrderCount);
}
