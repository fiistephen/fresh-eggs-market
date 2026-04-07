import prisma from '../plugins/prisma.js';
import { authenticate } from '../plugins/auth.js';
import { authorize } from '../middleware/authorize.js';

export default async function alertRoutes(fastify) {
  // ────────────────────────────────────────────────────────────
  // GET /alerts — all active exception flags
  // ────────────────────────────────────────────────────────────
  fastify.get('/alerts', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const alerts = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // ── 1. Cash sales not banked by end of day ──
      // Support both the old "cash deposit" workflow and the new Cash on Hand -> bank transfer workflow.
      // Check yesterday and today
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      for (const checkDate of [yesterday, today]) {
        const nextDay = new Date(checkDate);
        nextDay.setDate(nextDay.getDate() + 1);
        const dateLabel = checkDate.toISOString().slice(0, 10);

        const cashSales = await prisma.sale.findMany({
          where: {
            paymentMethod: 'CASH',
            saleDate: { gte: checkDate, lt: nextDay },
          },
          include: { customer: { select: { name: true } } },
        });

        if (cashSales.length > 0) {
          const totalCash = cashSales.reduce((s, sale) => s + Number(sale.totalAmount), 0);

          const bankedEntries = await prisma.bankTransaction.findMany({
            where: {
              transactionDate: { gte: checkDate, lt: nextDay },
              OR: [
                {
                  direction: 'INFLOW',
                  category: { in: ['CUSTOMER_DEPOSIT', 'CUSTOMER_BOOKING'] },
                  description: { contains: 'cash', mode: 'insensitive' },
                },
                {
                  direction: 'OUTFLOW',
                  category: 'INTERNAL_TRANSFER_OUT',
                  bankAccount: { accountType: 'CASH_ON_HAND' },
                },
              ],
            },
          });

          const bankedTotal = bankedEntries.reduce((s, t) => s + Number(t.amount), 0);

          // Only alert if cash hasn't been banked (or significantly less)
          if (bankedTotal < totalCash * 0.9) {
            alerts.push({
              id: `cash-not-banked-${dateLabel}`,
              type: 'CASH_NOT_BANKED',
              severity: checkDate < today ? 'high' : 'medium',
              title: 'Cash sales not banked',
              message: `₦${totalCash.toLocaleString()} in cash sales on ${dateLabel} — only ₦${bankedTotal.toLocaleString()} appears banked.`,
              date: dateLabel,
              data: { totalCash, bankedTotal, salesCount: cashSales.length },
            });
          }
        }
      }

      // ── 2. Large POS/card payments (should have been transfers) ──
      const recentPOSSales = await prisma.sale.findMany({
        where: {
          paymentMethod: 'POS_CARD',
          saleDate: { gte: yesterday },
        },
        include: { customer: { select: { name: true } } },
      });

      const POS_THRESHOLD = 500000; // ₦500k — large card payments flagged
      for (const sale of recentPOSSales) {
        const amount = Number(sale.totalAmount);
        if (amount >= POS_THRESHOLD) {
          alerts.push({
            id: `large-pos-${sale.id}`,
            type: 'LARGE_POS_PAYMENT',
            severity: 'medium',
            title: 'Large POS/card payment',
            message: `₦${amount.toLocaleString()} card payment by ${sale.customer.name} (${sale.receiptNumber}). Should this have been a transfer?`,
            date: sale.saleDate,
            data: { saleId: sale.id, receiptNumber: sale.receiptNumber, amount, customer: sale.customer.name },
          });
        }
      }

      // ── 3. Unbooked customer deposits ──
      const depositCandidates = await prisma.bankTransaction.findMany({
        where: {
          direction: 'INFLOW',
          category: 'CUSTOMER_DEPOSIT',
        },
        include: {
          customer: { select: { name: true, phone: true } },
          bankAccount: { select: { name: true } },
        },
        orderBy: { transactionDate: 'desc' },
        take: 20,
      });

      const allocationGroups = depositCandidates.length > 0
        ? await prisma.bookingPaymentAllocation.groupBy({
            by: ['bankTransactionId'],
            where: { bankTransactionId: { in: depositCandidates.map((deposit) => deposit.id) } },
            _sum: { amount: true },
          })
        : [];

      const allocationMap = new Map(
        allocationGroups.map((allocation) => [allocation.bankTransactionId, Number(allocation._sum.amount || 0)])
      );

      for (const dep of depositCandidates) {
        const amount = Math.max(0, Number(dep.amount) - (allocationMap.get(dep.id) || 0));
        if (amount <= 0.009) continue;
        const daysSince = Math.floor((Date.now() - new Date(dep.transactionDate).getTime()) / (1000 * 60 * 60 * 24));
        alerts.push({
          id: `unbooked-deposit-${dep.id}`,
          type: 'UNBOOKED_DEPOSIT',
          severity: daysSince > 3 ? 'high' : daysSince > 1 ? 'medium' : 'low',
          title: 'Unbooked customer deposit',
          message: `₦${amount.toLocaleString()} received${dep.customer ? ' from ' + dep.customer.name : ''} on ${new Date(dep.transactionDate).toISOString().slice(0, 10)} — no booking made yet.${daysSince > 1 ? ` (${daysSince} days ago)` : ''}`,
          date: dep.transactionDate,
          data: { transactionId: dep.id, amount, customer: dep.customer?.name, daysSince },
        });
      }

      // ── 4. Inventory discrepancies (recent) ──
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const discrepancies = await prisma.inventoryCount.findMany({
        where: {
          discrepancy: { not: 0 },
          countDate: { gte: sevenDaysAgo },
        },
        include: { batch: { select: { name: true } } },
        orderBy: { countDate: 'desc' },
      });

      for (const count of discrepancies) {
        const absDisc = Math.abs(count.discrepancy);
        alerts.push({
          id: `inventory-disc-${count.id}`,
          type: 'INVENTORY_DISCREPANCY',
          severity: absDisc > 10 ? 'high' : absDisc > 3 ? 'medium' : 'low',
          title: 'Inventory discrepancy',
          message: `${count.batch.name}: Physical count ${count.discrepancy > 0 ? 'over' : 'under'} by ${absDisc} crates (physical: ${count.physicalCount}, system: ${count.systemCount}).`,
          date: count.countDate,
          data: { countId: count.id, batch: count.batch.name, discrepancy: count.discrepancy, physicalCount: count.physicalCount, systemCount: count.systemCount },
        });
      }

      // ── 5. Batch not received on expected date ──
      const overdueBatches = await prisma.batch.findMany({
        where: {
          status: 'OPEN',
          expectedDate: { lt: today },
        },
        orderBy: { expectedDate: 'asc' },
      });

      for (const batch of overdueBatches) {
        const daysOverdue = Math.floor((Date.now() - new Date(batch.expectedDate).getTime()) / (1000 * 60 * 60 * 24));
        alerts.push({
          id: `batch-overdue-${batch.id}`,
          type: 'BATCH_OVERDUE',
          severity: daysOverdue > 3 ? 'high' : daysOverdue > 1 ? 'medium' : 'low',
          title: 'Batch not received',
          message: `${batch.name} was expected on ${new Date(batch.expectedDate).toISOString().slice(0, 10)} but hasn't been received yet (${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue).`,
          date: batch.expectedDate,
          data: { batchId: batch.id, batchName: batch.name, expectedDate: batch.expectedDate, daysOverdue },
        });
      }

      // ── 6. Batches arriving today (info alert) ──
      const arrivingToday = await prisma.batch.findMany({
        where: {
          status: 'OPEN',
          expectedDate: { gte: today, lt: tomorrow },
        },
      });

      for (const batch of arrivingToday) {
        const bookingCount = await prisma.booking.count({ where: { batchId: batch.id, status: 'CONFIRMED' } });
        alerts.push({
          id: `batch-arriving-${batch.id}`,
          type: 'BATCH_ARRIVING',
          severity: 'info',
          title: 'Batch expected today',
          message: `${batch.name} — ${batch.expectedQuantity} crates expected. ${bookingCount} booking${bookingCount !== 1 ? 's' : ''} waiting.`,
          date: today,
          data: { batchId: batch.id, batchName: batch.name, expectedQuantity: batch.expectedQuantity, bookings: bookingCount },
        });
      }

      // Sort: high severity first, then by date
      const severityOrder = { high: 0, medium: 1, low: 2, info: 3 };
      alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || new Date(b.date) - new Date(a.date));

      const summary = {
        total: alerts.length,
        high: alerts.filter(a => a.severity === 'high').length,
        medium: alerts.filter(a => a.severity === 'medium').length,
        low: alerts.filter(a => a.severity === 'low').length,
        info: alerts.filter(a => a.severity === 'info').length,
      };

      return reply.send({ alerts, summary });
    },
  });

  // ────────────────────────────────────────────────────────────
  // GET /dashboard — summary metrics for dashboard cards
  // ────────────────────────────────────────────────────────────
  fastify.get('/dashboard', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Open batches
      const openBatches = await prisma.batch.count({ where: { status: 'OPEN' } });
      const receivedBatches = await prisma.batch.count({ where: { status: 'RECEIVED' } });

      // Today's sales
      const todaySales = await prisma.sale.findMany({
        where: { saleDate: { gte: today, lt: tomorrow } },
      });
      const todayRevenue = todaySales.reduce((s, sale) => s + Number(sale.totalAmount), 0);
      const todayCost = todaySales.reduce((s, sale) => s + Number(sale.totalCost), 0);
      const todayProfit = todayRevenue - todayCost;
      const todayCrates = todaySales.reduce((s, sale) => s + sale.totalQuantity, 0);

      // Pending bookings
      const pendingBookings = await prisma.booking.count({ where: { status: 'CONFIRMED' } });
      const pendingBookingValue = await prisma.booking.aggregate({
        where: { status: 'CONFIRMED' },
        _sum: { orderValue: true },
      });

      // Inventory on hand
      const receivedBatchList = await prisma.batch.findMany({
        where: { status: 'RECEIVED' },
        include: { eggCodes: true },
      });

      let totalOnHand = 0;
      let totalBooked = 0;
      for (const batch of receivedBatchList) {
        const received = batch.eggCodes.reduce((s, ec) => s + ec.quantity + ec.freeQty, 0);
        const soldAgg = await prisma.saleLineItem.aggregate({
          where: { batchEggCode: { batchId: batch.id } },
          _sum: { quantity: true },
        });
        const writeOffAgg = await prisma.inventoryCount.aggregate({
          where: { batchId: batch.id },
          _sum: { crackedWriteOff: true },
        });
        const bookedAgg = await prisma.booking.aggregate({
          where: { batchId: batch.id, status: 'CONFIRMED' },
          _sum: { quantity: true },
        });
        totalOnHand += received - (soldAgg._sum.quantity || 0) - (writeOffAgg._sum.crackedWriteOff || 0);
        totalBooked += bookedAgg._sum.quantity || 0;
      }
      const totalAvailable = Math.max(0, totalOnHand - totalBooked);

      // Bank balances
      const bankAccounts = await prisma.bankAccount.findMany({ where: { isActive: true } });
      const bankSummary = [];
      for (const acct of bankAccounts) {
        const inflows = await prisma.bankTransaction.aggregate({
          where: { bankAccountId: acct.id, direction: 'INFLOW' },
          _sum: { amount: true },
        });
        const outflows = await prisma.bankTransaction.aggregate({
          where: { bankAccountId: acct.id, direction: 'OUTFLOW' },
          _sum: { amount: true },
        });
        bankSummary.push({
          name: acct.name,
          type: acct.accountType,
          balance: Number(inflows._sum.amount || 0) - Number(outflows._sum.amount || 0),
        });
      }

      // Recent activity
      const recentSales = await prisma.sale.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { customer: { select: { name: true } }, batch: { select: { name: true } } },
      });

      const recentBookings = await prisma.booking.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { customer: { select: { name: true } }, batch: { select: { name: true } } },
      });

      // Customer count
      const totalCustomers = await prisma.customer.count();

      return reply.send({
        batches: { open: openBatches, received: receivedBatches },
        todaySales: {
          count: todaySales.length,
          revenue: todayRevenue,
          cost: todayCost,
          profit: todayProfit,
          crates: todayCrates,
        },
        bookings: {
          pending: pendingBookings,
          pendingValue: Number(pendingBookingValue._sum.orderValue || 0),
        },
        inventory: {
          onHand: totalOnHand,
          booked: totalBooked,
          available: totalAvailable,
        },
        bank: bankSummary,
        totalCustomers,
        recentSales: recentSales.map(s => ({
          id: s.id,
          receiptNumber: s.receiptNumber,
          customer: s.customer.name,
          batch: s.batch.name,
          amount: Number(s.totalAmount),
          quantity: s.totalQuantity,
          paymentMethod: s.paymentMethod,
          date: s.saleDate,
        })),
        recentBookings: recentBookings.map(b => ({
          id: b.id,
          customer: b.customer.name,
          batch: b.batch.name,
          quantity: b.quantity,
          amountPaid: Number(b.amountPaid),
          status: b.status,
          date: b.createdAt,
        })),
      });
    },
  });
}
