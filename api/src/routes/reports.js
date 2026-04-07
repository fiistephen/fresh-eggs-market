import prisma from '../plugins/prisma.js';
import { authenticate } from '../plugins/auth.js';
import { authorize } from '../middleware/authorize.js';

function startOfDay(value) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value) {
  const date = new Date(value);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

function buildDateRangeWhere({ dateFrom, dateTo }) {
  if (!dateFrom && !dateTo) return {};

  const saleDate = {};
  if (dateFrom) saleDate.gte = startOfDay(dateFrom);
  if (dateTo) saleDate.lte = endOfDay(dateTo);

  return { saleDate };
}

function safeDivide(numerator, denominator) {
  if (!denominator) return 0;
  return numerator / denominator;
}

export default async function reportsRoutes(fastify) {
  fastify.get('/reports/sales', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const { dateFrom, dateTo } = request.query;
      const where = buildDateRangeWhere({ dateFrom, dateTo });

      const sales = await prisma.sale.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          batch: { select: { id: true, name: true } },
          booking: { select: { id: true } },
          lineItems: {
            include: {
              batchEggCode: { select: { id: true, code: true } },
            },
          },
          paymentTransaction: {
            include: {
              bankAccount: { select: { id: true, name: true, accountType: true, lastFour: true } },
            },
          },
        },
        orderBy: [{ saleDate: 'desc' }, { createdAt: 'desc' }],
      });

      const summary = {
        totalSalesAmount: 0,
        totalCostAmount: 0,
        grossProfit: 0,
        totalQuantity: 0,
        transactionCount: sales.length,
        bookingPickupCount: 0,
        directSaleCount: 0,
      };

      const byDayMap = new Map();
      const byItemMap = new Map();
      const byCategoryMap = new Map();
      const byPaymentMethodMap = new Map();

      const receipts = sales.map((sale) => {
        const totalAmount = Number(sale.totalAmount);
        const totalCost = Number(sale.totalCost);
        const grossProfit = totalAmount - totalCost;
        const sourceType = sale.bookingId ? 'BOOKING' : 'DIRECT';
        const saleDay = sale.saleDate.toISOString().slice(0, 10);

        summary.totalSalesAmount += totalAmount;
        summary.totalCostAmount += totalCost;
        summary.grossProfit += grossProfit;
        summary.totalQuantity += sale.totalQuantity;
        if (sourceType === 'BOOKING') summary.bookingPickupCount += 1;
        else summary.directSaleCount += 1;

        const dayEntry = byDayMap.get(saleDay) || {
          date: saleDay,
          transactionCount: 0,
          totalQuantity: 0,
          totalAmount: 0,
          totalCost: 0,
        };
        dayEntry.transactionCount += 1;
        dayEntry.totalQuantity += sale.totalQuantity;
        dayEntry.totalAmount += totalAmount;
        dayEntry.totalCost += totalCost;
        byDayMap.set(saleDay, dayEntry);

        const paymentEntry = byPaymentMethodMap.get(sale.paymentMethod) || {
          paymentMethod: sale.paymentMethod,
          transactionCount: 0,
          totalQuantity: 0,
          totalAmount: 0,
          grossProfit: 0,
        };
        paymentEntry.transactionCount += 1;
        paymentEntry.totalQuantity += sale.totalQuantity;
        paymentEntry.totalAmount += totalAmount;
        paymentEntry.grossProfit += grossProfit;
        byPaymentMethodMap.set(sale.paymentMethod, paymentEntry);

        for (const lineItem of sale.lineItems) {
          const quantity = lineItem.quantity;
          const lineTotal = Number(lineItem.lineTotal);
          const lineCost = quantity * Number(lineItem.costPrice);
          const lineProfit = lineTotal - lineCost;

          const itemKey = `${lineItem.batchEggCode?.id || 'unknown'}:${lineItem.saleType}`;
          const itemEntry = byItemMap.get(itemKey) || {
            itemCode: lineItem.batchEggCode?.code || 'Unknown item',
            saleType: lineItem.saleType,
            quantity: 0,
            totalAmount: 0,
            totalCost: 0,
            grossProfit: 0,
          };
          itemEntry.quantity += quantity;
          itemEntry.totalAmount += lineTotal;
          itemEntry.totalCost += lineCost;
          itemEntry.grossProfit += lineProfit;
          byItemMap.set(itemKey, itemEntry);

          const categoryEntry = byCategoryMap.get(lineItem.saleType) || {
            saleType: lineItem.saleType,
            lineCount: 0,
            quantity: 0,
            totalAmount: 0,
            totalCost: 0,
            grossProfit: 0,
          };
          categoryEntry.lineCount += 1;
          categoryEntry.quantity += quantity;
          categoryEntry.totalAmount += lineTotal;
          categoryEntry.totalCost += lineCost;
          categoryEntry.grossProfit += lineProfit;
          byCategoryMap.set(lineItem.saleType, categoryEntry);
        }

        return {
          id: sale.id,
          receiptNumber: sale.receiptNumber,
          saleDate: sale.saleDate,
          customer: sale.customer,
          batch: sale.batch,
          paymentMethod: sale.paymentMethod,
          totalQuantity: sale.totalQuantity,
          totalAmount,
          totalCost,
          grossProfit,
          sourceType,
          paymentTransaction: sale.paymentTransaction ? {
            id: sale.paymentTransaction.id,
            amount: Number(sale.paymentTransaction.amount),
            bankAccount: sale.paymentTransaction.bankAccount,
          } : null,
        };
      });

      const byDay = [...byDayMap.values()]
        .map((entry) => ({
          ...entry,
          grossProfit: entry.totalAmount - entry.totalCost,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const byItem = [...byItemMap.values()]
        .map((entry) => ({
          ...entry,
          averagePrice: safeDivide(entry.totalAmount, entry.quantity),
        }))
        .sort((a, b) => b.totalAmount - a.totalAmount);

      const byCategory = [...byCategoryMap.values()]
        .map((entry) => ({
          ...entry,
          averagePrice: safeDivide(entry.totalAmount, entry.quantity),
        }))
        .sort((a, b) => b.totalAmount - a.totalAmount);

      const byPaymentMethod = [...byPaymentMethodMap.values()]
        .map((entry) => ({
          ...entry,
          averageTicket: safeDivide(entry.totalAmount, entry.transactionCount),
        }))
        .sort((a, b) => b.totalAmount - a.totalAmount);

      return reply.send({
        filters: {
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
        },
        summary: {
          ...summary,
          marginPercent: Number((safeDivide(summary.grossProfit * 100, summary.totalSalesAmount)).toFixed(2)),
        },
        byDay,
        byItem,
        byCategory,
        byPaymentMethod,
        receipts,
      });
    },
  });
}
