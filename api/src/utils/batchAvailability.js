import prisma from '../plugins/prisma.js';
import {
  getActivePortalBookingHoldQuantity,
  getActivePortalBuyNowHoldQuantity,
} from './portalCheckout.js';

function sumReceivedCrates(batch) {
  if (!batch) return 0;
  if (batch.actualQuantity != null) return Number(batch.actualQuantity || 0);
  return (batch.eggCodes || []).reduce(
    (sum, eggCode) => sum + Number(eggCode.quantity || 0) + Number(eggCode.freeQty || 0),
    0,
  );
}

export async function getOpenBatchBookingAvailability(batchId, options = {}) {
  const { batch = null, excludeBookingId = null, excludeCheckoutId = null } = options;

  const resolvedBatch = batch || await prisma.batch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      availableForBooking: true,
      expectedQuantity: true,
      expectedDate: true,
      status: true,
    },
  });

  if (!resolvedBatch) return null;

  const [bookedAgg, heldForCheckout] = await Promise.all([
    prisma.booking.aggregate({
      where: {
        batchId: resolvedBatch.id,
        status: { not: 'CANCELLED' },
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      },
      _sum: { quantity: true },
    }),
    getActivePortalBookingHoldQuantity(resolvedBatch.id, {
      ...(excludeCheckoutId ? { excludeCheckoutId } : {}),
    }),
  ]);

  const confirmedBooked = bookedAgg._sum.quantity || 0;
  const heldQty = heldForCheckout || 0;
  const capacity = Number(resolvedBatch.availableForBooking || 0);
  const totalCommitted = confirmedBooked + heldQty;
  const remainingAvailable = Math.max(0, capacity - totalCommitted);

  return {
    batch: resolvedBatch,
    confirmedBooked,
    heldForCheckout: heldQty,
    totalCommitted,
    totalBookingCapacity: capacity,
    remainingAvailable,
  };
}

export async function getReceivedBatchSaleAvailability(batchId, options = {}) {
  const { batch = null, excludeCheckoutId = null } = options;

  const resolvedBatch = batch || await prisma.batch.findUnique({
    where: { id: batchId },
    include: {
      eggCodes: {
        select: {
          id: true,
          code: true,
          quantity: true,
          freeQty: true,
          costPrice: true,
          wholesalePrice: true,
          retailPrice: true,
        },
      },
    },
  });

  if (!resolvedBatch) return null;

  const [soldAgg, writeOffAgg, bookedAgg, heldForBuyNow] = await Promise.all([
    prisma.saleLineItem.aggregate({
      where: {
        batchEggCode: { batchId: resolvedBatch.id },
      },
      _sum: { quantity: true },
    }),
    prisma.inventoryCount.aggregate({
      where: { batchId: resolvedBatch.id },
      _sum: { crackedWriteOff: true },
    }),
    prisma.booking.aggregate({
      where: { batchId: resolvedBatch.id, status: 'CONFIRMED' },
      _sum: { quantity: true },
    }),
    getActivePortalBuyNowHoldQuantity(resolvedBatch.id, {
      ...(excludeCheckoutId ? { excludeCheckoutId } : {}),
    }),
  ]);

  const totalReceived = sumReceivedCrates(resolvedBatch);
  const totalSold = soldAgg._sum.quantity || 0;
  const totalWrittenOff = writeOffAgg._sum.crackedWriteOff || 0;
  const confirmedBooked = bookedAgg._sum.quantity || 0;
  const heldQty = heldForBuyNow || 0;
  const onHand = Math.max(0, totalReceived - totalSold - totalWrittenOff);
  const totalCommitted = confirmedBooked + heldQty;
  const availableForSale = Math.max(0, onHand - totalCommitted);

  return {
    batch: resolvedBatch,
    totalReceived,
    totalSold,
    totalWrittenOff,
    confirmedBooked,
    heldForCheckout: heldQty,
    totalCommitted,
    onHand,
    availableForSale,
  };
}
