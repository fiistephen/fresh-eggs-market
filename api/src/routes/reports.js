import prisma from '../plugins/prisma.js';
import { authenticate } from '../plugins/auth.js';
import { authorize } from '../middleware/authorize.js';
import {
  buildCrackAlert,
  roundTo2,
  safeDivide,
} from '../utils/operationsPolicy.js';
import {
  getCustomerEggTypeConfig,
  getCustomerEggTypeLabel,
  getOperationsPolicy,
} from '../utils/appSettings.js';

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

function monthBucketLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown month';
  return date.toLocaleDateString('en-NG', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function monthBucketKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default async function reportsRoutes(fastify) {
  fastify.get('/reports/sales', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const { dateFrom, dateTo } = request.query;
      const where = buildDateRangeWhere({ dateFrom, dateTo });
      const eggTypes = await getCustomerEggTypeConfig();

      const sales = await prisma.sale.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          batch: { select: { id: true, name: true } },
          booking: { select: { id: true } },
          recordedBy: { select: { id: true, firstName: true, lastName: true } },
          lineItems: {
            include: {
              batchEggCode: {
                select: {
                  id: true,
                  code: true,
                  batch: {
                    select: {
                      id: true,
                      eggTypeKey: true,
                    },
                  },
                  item: {
                    select: {
                      id: true,
                      code: true,
                      name: true,
                      category: true,
                    },
                  },
                },
              },
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
          const item = lineItem.batchEggCode?.item;
          const eggTypeKey = lineItem.batchEggCode?.batch?.eggTypeKey || 'REGULAR';
          const eggTypeLabel = getCustomerEggTypeLabel(eggTypes, eggTypeKey);
          const category = item?.category || 'UNCATEGORIZED';
          const isEggItem = category === 'FE_EGGS' || Boolean(lineItem.batchEggCode?.batch);
          const itemLabel = isEggItem
            ? eggTypeLabel
            : item?.code && item?.name && item.name !== item.code
              ? `${item.name} (${item.code})`
              : item?.name || item?.code || lineItem.batchEggCode?.code || 'Unknown item';

          const itemKey = `${isEggItem ? `egg-type:${eggTypeKey}` : item?.id || lineItem.batchEggCode?.code || 'unknown'}:${lineItem.saleType}`;
          const itemEntry = byItemMap.get(itemKey) || {
            itemCode: isEggItem ? eggTypeKey : item?.code || lineItem.batchEggCode?.code || 'Unknown item',
            itemName: isEggItem ? eggTypeLabel : item?.name || lineItem.batchEggCode?.code || 'Unknown item',
            itemLabel,
            saleType: lineItem.saleType,
            category,
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

          const categoryEntry = byCategoryMap.get(category) || {
            category,
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
          byCategoryMap.set(category, categoryEntry);
        }

        return {
          id: sale.id,
          receiptNumber: sale.receiptNumber,
          saleDate: sale.saleDate,
          customer: sale.customer,
          batch: sale.batch,
          recordedBy: sale.recordedBy
            ? {
                id: sale.recordedBy.id,
                name: `${sale.recordedBy.firstName} ${sale.recordedBy.lastName}`.trim(),
              }
            : null,
          paymentMethod: sale.paymentMethod,
          totalQuantity: sale.totalQuantity,
          totalAmount,
          totalCost,
          grossProfit,
          sourceType,
          lineItems: sale.lineItems.map((lineItem) => {
            const quantity = lineItem.quantity;
            const lineTotal = Number(lineItem.lineTotal);
            const totalCost = quantity * Number(lineItem.costPrice);
            const eggTypeKey = lineItem.batchEggCode?.batch?.eggTypeKey || 'REGULAR';
            const eggTypeLabel = getCustomerEggTypeLabel(eggTypes, eggTypeKey);
            const item = lineItem.batchEggCode?.item;
            const itemLabel = item?.category === 'FE_EGGS' || lineItem.batchEggCode?.batch
              ? eggTypeLabel
              : item?.name || item?.code || lineItem.batchEggCode?.code || 'Unknown item';

            return {
              id: lineItem.id,
              itemCode: item?.code || lineItem.batchEggCode?.code || eggTypeKey,
              itemLabel,
              saleType: lineItem.saleType,
              quantity,
              unitPrice: Number(lineItem.unitPrice),
              costPrice: Number(lineItem.costPrice),
              lineTotal,
              totalCost,
              grossProfit: lineTotal - totalCost,
            };
          }),
          paymentTransaction: sale.paymentTransaction ? {
            id: sale.paymentTransaction.id,
            amount: Number(sale.paymentTransaction.amount),
            category: sale.paymentTransaction.category,
            reference: sale.paymentTransaction.reference,
            transactionDate: sale.paymentTransaction.transactionDate,
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
      const [policy, eggTypes] = await Promise.all([
        getOperationsPolicy(),
        getCustomerEggTypeConfig(),
      ]);

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

      const batchSummary = (await Promise.all(filteredBatches.map(async (batch) => {
        const totalReceived = batch.eggCodes.reduce((sum, eggCode) => sum + eggCode.quantity + eggCode.freeQty, 0);
        const totalBookings = batch.bookings.reduce((sum, booking) => sum + booking.quantity, 0);
        const totalWriteOffs = batch.inventory.reduce((sum, count) => sum + count.crackedWriteOff, 0);
        const latestCount = batch.inventory[0] || null;
        const soldItems = await prisma.saleLineItem.findMany({
          where: {
            batchEggCode: { batchId: batch.id },
          },
          select: {
            saleType: true,
            quantity: true,
            lineTotal: true,
            costPrice: true,
          },
        });

        let totalRevenue = 0;
        let totalSaleCost = 0;
        let totalSold = 0;
        let crackedSoldQuantity = 0;
        let crackedSoldValue = 0;
        const salesByType = {
          WHOLESALE: { quantity: 0, amount: 0 },
          RETAIL: { quantity: 0, amount: 0 },
          CRACKED: { quantity: 0, amount: 0 },
          WRITE_OFF: { quantity: 0, amount: 0 },
        };

        for (const item of soldItems) {
          const lineValue = Number(item.lineTotal);
          const lineCost = Number(item.costPrice) * item.quantity;

          totalRevenue += lineValue;
          totalSaleCost += lineCost;
          totalSold += item.quantity;
          if (salesByType[item.saleType]) {
            salesByType[item.saleType].quantity += item.quantity;
            salesByType[item.saleType].amount += lineValue;
          }

          if (item.saleType === 'CRACKED') {
            crackedSoldQuantity += item.quantity;
            crackedSoldValue += lineValue;
          }
        }

        const remaining = totalReceived - totalSold - totalWriteOffs;
        const grossProfit = totalRevenue - totalSaleCost;
        const expectedPolicyProfit = totalReceived * policy.targetProfitPerCrate;
        const varianceToPolicy = grossProfit - expectedPolicyProfit;
        const profitPerCrate = roundTo2(safeDivide(grossProfit, totalReceived));
        const totalCrackImpact = crackedSoldQuantity + totalWriteOffs;
        const crackRatePercent = roundTo2(safeDivide(totalCrackImpact * 100, totalReceived));
        const crackAlert = buildCrackAlert(crackRatePercent, policy.crackAllowancePercent);
        const batchDate = batch.closedDate || batch.receivedDate || batch.expectedDate;

        return {
          batchId: batch.id,
          batchName: batch.name,
          eggTypeKey: batch.eggTypeKey || 'REGULAR',
          eggTypeLabel: getCustomerEggTypeLabel(eggTypes, batch.eggTypeKey || 'REGULAR'),
          status: batch.status,
          batchDate,
          monthKey: monthBucketKey(batchDate),
          monthLabel: monthBucketLabel(batchDate),
          totalReceived,
          totalSold,
          totalBookings,
          totalWriteOffs,
          remaining,
          availableForSale: Math.max(0, remaining - totalBookings),
          totalRevenue,
          totalSaleCost,
          grossProfit,
          expectedPolicyProfit,
          varianceToPolicy,
          profitPerCrate,
          crackedSoldQuantity,
          crackedSoldValue,
          totalCrackImpact,
          crackRatePercent,
          crackAlert,
          eggCodeMix: batch.eggCodes.map((eggCode) => ({
            code: eggCode.code,
            quantity: eggCode.quantity,
            freeQty: eggCode.freeQty,
            costPrice: Number(eggCode.costPrice),
            subtotal: Number(eggCode.costPrice) * eggCode.quantity,
          })),
          salesByType,
          latestCount: latestCount ? {
            countDate: latestCount.countDate,
            discrepancy: latestCount.discrepancy,
            crackedWriteOff: latestCount.crackedWriteOff,
            notes: latestCount.notes,
          } : null,
        };
      }))).sort((a, b) => new Date(b.batchDate || 0) - new Date(a.batchDate || 0));

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

      const monthlyTrendMap = new Map();
      for (const row of batchSummary) {
        const key = row.monthKey;
        const bucket = monthlyTrendMap.get(key) || {
          monthKey: key,
          monthLabel: key,
          totalBatches: 0,
          totalReceived: 0,
          totalActualProfit: 0,
          totalExpectedProfit: 0,
          totalVarianceToPolicy: 0,
          totalCrackRatePercent: 0,
          aboveTargetCount: 0,
          belowTargetCount: 0,
          crackAlertCount: 0,
        };

        bucket.totalBatches += 1;
        bucket.totalReceived += row.totalReceived;
        bucket.totalActualProfit += row.grossProfit;
        bucket.totalExpectedProfit += row.expectedPolicyProfit;
        bucket.totalVarianceToPolicy += row.varianceToPolicy;
        bucket.totalCrackRatePercent += row.crackRatePercent;
        if (row.varianceToPolicy > 0) bucket.aboveTargetCount += 1;
        if (row.varianceToPolicy < 0) bucket.belowTargetCount += 1;
        if (row.crackAlert.level === 'ALERT') bucket.crackAlertCount += 1;

        bucket.monthLabel = row.monthLabel;
        monthlyTrendMap.set(key, bucket);
      }

      const monthlyTrend = [...monthlyTrendMap.values()].map((bucket) => ({
        ...bucket,
        averageCrackRatePercent: roundTo2(safeDivide(bucket.totalCrackRatePercent, bucket.totalBatches)),
        averageProfitPerCrate: roundTo2(safeDivide(bucket.totalActualProfit, bucket.totalReceived)),
      })).sort((a, b) => a.monthKey.localeCompare(b.monthKey));

      const highlights = {
        strongestBatch: batchSummary.length
          ? [...batchSummary].sort((a, b) => b.varianceToPolicy - a.varianceToPolicy)[0]
          : null,
        weakestBatch: batchSummary.length
          ? [...batchSummary].sort((a, b) => a.varianceToPolicy - b.varianceToPolicy)[0]
          : null,
        highestCrackBatch: batchSummary.length
          ? [...batchSummary].sort((a, b) => b.crackRatePercent - a.crackRatePercent)[0]
          : null,
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
          targetProfitPerCrate: policy.targetProfitPerCrate,
          crackAllowancePercent: policy.crackAllowancePercent,
        },
        batchSummary,
        monthlySummary,
        monthlyTrend,
        highlights,
        inventoryControl,
      });
    },
  });
}
