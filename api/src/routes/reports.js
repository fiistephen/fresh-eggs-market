import prisma from '../plugins/prisma.js';
import { authenticate } from '../plugins/auth.js';
import { authorize } from '../middleware/authorize.js';
import {
  POLICY_TARGET_PROFIT_PER_CRATE,
  DEFAULT_CRACK_ALLOWANCE_PERCENT,
  buildCrackAlert,
  roundTo2,
  safeDivide,
} from '../utils/operationsPolicy.js';

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
          recordedBy: { select: { id: true, firstName: true, lastName: true } },
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
      const byEmployeeMap = new Map();

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

        const employeeName = sale.recordedBy
          ? `${sale.recordedBy.firstName} ${sale.recordedBy.lastName}`.trim()
          : 'Unknown staff';
        const employeeKey = sale.recordedBy?.id || `unknown:${employeeName}`;
        const employeeEntry = byEmployeeMap.get(employeeKey) || {
          employeeId: sale.recordedBy?.id || null,
          employeeName,
          transactionCount: 0,
          totalQuantity: 0,
          totalAmount: 0,
          totalCost: 0,
          grossProfit: 0,
          bookingPickupCount: 0,
          directSaleCount: 0,
        };
        employeeEntry.transactionCount += 1;
        employeeEntry.totalQuantity += sale.totalQuantity;
        employeeEntry.totalAmount += totalAmount;
        employeeEntry.totalCost += totalCost;
        employeeEntry.grossProfit += grossProfit;
        if (sourceType === 'BOOKING') employeeEntry.bookingPickupCount += 1;
        else employeeEntry.directSaleCount += 1;
        byEmployeeMap.set(employeeKey, employeeEntry);

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

      const byEmployee = [...byEmployeeMap.values()]
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
        byEmployee,
        receipts,
      });
    },
  });

  fastify.get('/reports/operations', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const { dateFrom, dateTo } = request.query;

      const batches = await prisma.batch.findMany({
        where: {
          status: { in: ['RECEIVED', 'CLOSED'] },
        },
        include: {
          eggCodes: true,
          bookings: {
            where: { status: 'CONFIRMED' },
            select: { id: true, quantity: true },
          },
          inventory: {
            select: {
              id: true,
              countDate: true,
              physicalCount: true,
              systemCount: true,
              discrepancy: true,
              crackedWriteOff: true,
              notes: true,
            },
            orderBy: { countDate: 'desc' },
          },
          sales: {
            include: {
              lineItems: {
                include: {
                  batchEggCode: { select: { id: true, code: true } },
                },
              },
            },
          },
        },
        orderBy: [{ closedDate: 'desc' }, { receivedDate: 'desc' }, { expectedDate: 'desc' }],
      });

      const filteredBatches = batches.filter((batch) => {
        const batchDate = batch.closedDate || batch.receivedDate || batch.expectedDate;
        if (!batchDate) return !dateFrom && !dateTo;
        if (dateFrom && batchDate < startOfDay(dateFrom)) return false;
        if (dateTo && batchDate > endOfDay(dateTo)) return false;
        return true;
      });

      const batchSummary = filteredBatches.map((batch) => {
        const totalReceived = batch.eggCodes.reduce((sum, eggCode) => sum + eggCode.quantity + eggCode.freeQty, 0);
        const totalBookings = batch.bookings.reduce((sum, booking) => sum + booking.quantity, 0);
        const totalWriteOffs = batch.inventory.reduce((sum, count) => sum + count.crackedWriteOff, 0);
        const latestCount = batch.inventory[0] || null;

        let totalRevenue = 0;
        let totalSaleCost = 0;
        let totalSold = 0;
        let crackedSoldQuantity = 0;
        let crackedSoldValue = 0;

        for (const sale of batch.sales) {
          for (const item of sale.lineItems) {
            const lineValue = Number(item.lineTotal);
            const lineCost = Number(item.costPrice) * item.quantity;

            totalRevenue += lineValue;
            totalSaleCost += lineCost;
            totalSold += item.quantity;

            if (item.saleType === 'CRACKED') {
              crackedSoldQuantity += item.quantity;
              crackedSoldValue += lineValue;
            }
          }
        }

        const remaining = totalReceived - totalSold - totalWriteOffs;
        const grossProfit = totalRevenue - totalSaleCost;
        const expectedPolicyProfit = totalReceived * POLICY_TARGET_PROFIT_PER_CRATE;
        const varianceToPolicy = grossProfit - expectedPolicyProfit;
        const profitPerCrate = roundTo2(safeDivide(grossProfit, totalReceived));
        const totalCrackImpact = crackedSoldQuantity + totalWriteOffs;
        const crackRatePercent = roundTo2(safeDivide(totalCrackImpact * 100, totalReceived));
        const crackAlert = buildCrackAlert(crackRatePercent);

        return {
          batchId: batch.id,
          batchName: batch.name,
          status: batch.status,
          batchDate: batch.closedDate || batch.receivedDate || batch.expectedDate,
          totalReceived,
          totalSold,
          totalBookings,
          totalWriteOffs,
          remaining,
          totalRevenue,
          totalSaleCost,
          grossProfit,
          expectedPolicyProfit,
          varianceToPolicy,
          profitPerCrate,
          crackedSoldQuantity,
          crackedSoldValue,
          crackRatePercent,
          crackAlert,
          latestCount: latestCount ? {
            countDate: latestCount.countDate,
            discrepancy: latestCount.discrepancy,
            crackedWriteOff: latestCount.crackedWriteOff,
            notes: latestCount.notes,
          } : null,
        };
      }).sort((a, b) => new Date(b.batchDate || 0) - new Date(a.batchDate || 0));

      const monthlySummary = {
        totalBatches: batchSummary.length,
        aboveTargetCount: batchSummary.filter((row) => row.varianceToPolicy > 0).length,
        belowTargetCount: batchSummary.filter((row) => row.varianceToPolicy < 0).length,
        crackAlertCount: batchSummary.filter((row) => row.crackAlert.level === 'ALERT').length,
        totalReceived: batchSummary.reduce((sum, row) => sum + row.totalReceived, 0),
        totalActualProfit: batchSummary.reduce((sum, row) => sum + row.grossProfit, 0),
        totalExpectedProfit: batchSummary.reduce((sum, row) => sum + row.expectedPolicyProfit, 0),
        totalVarianceToPolicy: batchSummary.reduce((sum, row) => sum + row.varianceToPolicy, 0),
        averageProfitPerCrate: roundTo2(safeDivide(
          batchSummary.reduce((sum, row) => sum + row.grossProfit, 0),
          batchSummary.reduce((sum, row) => sum + row.totalReceived, 0),
        )),
        averageCrackRatePercent: roundTo2(safeDivide(
          batchSummary.reduce((sum, row) => sum + row.crackRatePercent, 0),
          batchSummary.length,
        )),
      };

      const activeInventory = batchSummary
        .filter((row) => row.status === 'RECEIVED')
        .map((row) => ({
          batchId: row.batchId,
          batchName: row.batchName,
          onHand: Math.max(0, row.remaining),
          booked: row.totalBookings,
          available: Math.max(0, row.remaining - row.totalBookings),
          totalWriteOffs: row.totalWriteOffs,
          crackedSoldQuantity: row.crackedSoldQuantity,
          crackRatePercent: row.crackRatePercent,
          crackAlert: row.crackAlert,
          latestCount: row.latestCount,
        }))
        .sort((a, b) => b.onHand - a.onHand);

      const inventoryControl = {
        activeBatchCount: activeInventory.length,
        totalOnHand: activeInventory.reduce((sum, row) => sum + row.onHand, 0),
        totalBooked: activeInventory.reduce((sum, row) => sum + row.booked, 0),
        totalAvailable: activeInventory.reduce((sum, row) => sum + row.available, 0),
        totalWriteOffs: activeInventory.reduce((sum, row) => sum + row.totalWriteOffs, 0),
        totalCrackedSold: activeInventory.reduce((sum, row) => sum + row.crackedSoldQuantity, 0),
        flaggedBatches: activeInventory.filter((row) => row.crackAlert.level !== 'OK' || (row.latestCount && row.latestCount.discrepancy !== 0)),
        activeInventory,
      };

      return reply.send({
        filters: {
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
        },
        policy: {
          targetProfitPerCrate: POLICY_TARGET_PROFIT_PER_CRATE,
          crackAllowancePercent: DEFAULT_CRACK_ALLOWANCE_PERCENT,
        },
        batchSummary,
        monthlySummary,
        inventoryControl,
      });
    },
  });
}
