import prisma from '../plugins/prisma.js';
import { authenticate } from '../plugins/auth.js';
import { authorize } from '../middleware/authorize.js';
import { getCustomerEggTypeConfig, getCustomerEggTypeLabel } from '../utils/appSettings.js';

const CUSTOMER_DEPOSIT_CATEGORIES = ['CUSTOMER_DEPOSIT', 'CUSTOMER_BOOKING', 'UNALLOCATED_INCOME'];

function toNumber(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapBatchSummary(batch, eggTypes) {
  if (!batch) return null;
  return {
    ...batch,
    wholesalePrice: batch.wholesalePrice != null ? toNumber(batch.wholesalePrice) : null,
    retailPrice: batch.retailPrice != null ? toNumber(batch.retailPrice) : null,
    eggTypeLabel: getCustomerEggTypeLabel(eggTypes, batch.eggTypeKey),
  };
}

function mapPortalCheckoutSummary(checkout, eggTypes) {
  if (!checkout) return null;

  const decisions = checkout.decisions?.map((decision) => ({
    ...decision,
    actorName: [decision.actor?.firstName, decision.actor?.lastName].filter(Boolean).join(' ').trim() || 'Staff',
  })) || [];

  return {
    ...checkout,
    unitPrice: checkout.unitPrice != null ? toNumber(checkout.unitPrice) : null,
    orderValue: toNumber(checkout.orderValue),
    amountToPay: toNumber(checkout.amountToPay),
    balanceAfterPayment: toNumber(checkout.balanceAfterPayment),
    batch: mapBatchSummary(checkout.batch, eggTypes),
    decisions,
    latestDecision: decisions[0] || null,
  };
}

function enrichCustomer(customer, eggTypes) {
  return {
    ...customer,
    ...(customer.bookings && {
      bookings: customer.bookings.map((booking) => ({
        ...booking,
        amountPaid: toNumber(booking.amountPaid),
        orderValue: toNumber(booking.orderValue),
        batch: mapBatchSummary(booking.batch, eggTypes),
        sale: booking.sale
          ? {
              ...booking.sale,
              totalAmount: toNumber(booking.sale.totalAmount),
            }
          : null,
        portalCheckout: mapPortalCheckoutSummary(booking.portalCheckout, eggTypes),
        allocations: booking.allocations?.map((allocation) => ({
          ...allocation,
          amount: toNumber(allocation.amount),
          bankTransaction: allocation.bankTransaction
            ? {
                ...allocation.bankTransaction,
                amount: toNumber(allocation.bankTransaction.amount),
              }
            : null,
        })) || [],
      })),
    }),
    ...(customer.sales && {
      sales: customer.sales.map((sale) => ({
        ...sale,
        totalAmount: toNumber(sale.totalAmount),
        totalCost: toNumber(sale.totalCost),
        batch: mapBatchSummary(sale.batch, eggTypes),
        booking: sale.booking
          ? {
              ...sale.booking,
              amountPaid: toNumber(sale.booking.amountPaid),
              orderValue: toNumber(sale.booking.orderValue),
              portalCheckout: mapPortalCheckoutSummary(sale.booking.portalCheckout, eggTypes),
            }
          : null,
      })),
    }),
    ...(customer.portalCheckouts && {
      portalCheckouts: customer.portalCheckouts.map((checkout) => ({
        ...mapPortalCheckoutSummary(checkout, eggTypes),
        booking: checkout.booking
          ? {
              ...checkout.booking,
              amountPaid: toNumber(checkout.booking.amountPaid),
              orderValue: toNumber(checkout.booking.orderValue),
              sale: checkout.booking.sale
                ? {
                    ...checkout.booking.sale,
                    totalAmount: toNumber(checkout.booking.sale.totalAmount),
                  }
                : null,
            }
          : null,
      })),
    }),
  };
}

export default async function customerRoutes(fastify) {
  fastify.get('/customers', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { search, limit = 50, offset = 0 } = request.query;

      const where = search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              ...(search.includes('@') ? [{ email: { contains: search, mode: 'insensitive' } }] : []),
            ],
          }
        : {};

      const [customers, total] = await Promise.all([
        prisma.customer.findMany({
          where,
          include: {
            _count: { select: { bookings: true, sales: true } },
          },
          orderBy: { name: 'asc' },
          take: parseInt(limit),
          skip: parseInt(offset),
        }),
        prisma.customer.count({ where }),
      ]);

      return reply.send({ customers, total });
    },
  });

  fastify.get('/customers/:id', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const eggTypes = await getCustomerEggTypeConfig();
      const customer = await prisma.customer.findUnique({
        where: { id: request.params.id },
        include: {
          bookings: {
            include: {
              batch: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                  expectedDate: true,
                  receivedDate: true,
                  eggTypeKey: true,
                  wholesalePrice: true,
                  retailPrice: true,
                },
              },
              sale: {
                select: {
                  id: true,
                  receiptNumber: true,
                  saleDate: true,
                  totalAmount: true,
                  paymentMethod: true,
                },
              },
              portalCheckout: {
                include: {
                  batch: {
                    select: {
                      id: true,
                      name: true,
                      status: true,
                      expectedDate: true,
                      receivedDate: true,
                      eggTypeKey: true,
                    },
                  },
                  decisions: {
                    include: {
                      actor: { select: { firstName: true, lastName: true } },
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                  },
                },
              },
              allocations: {
                include: {
                  bankTransaction: {
                    select: {
                      id: true,
                      amount: true,
                      category: true,
                      description: true,
                      reference: true,
                      transactionDate: true,
                      bankAccount: { select: { name: true, lastFour: true } },
                    },
                  },
                },
                orderBy: { createdAt: 'desc' },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
          },
          sales: {
            include: {
              batch: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                  expectedDate: true,
                  receivedDate: true,
                  eggTypeKey: true,
                },
              },
              booking: {
                include: {
                  portalCheckout: {
                    include: {
                      batch: {
                        select: {
                          id: true,
                          name: true,
                          status: true,
                          expectedDate: true,
                          receivedDate: true,
                          eggTypeKey: true,
                        },
                      },
                      decisions: {
                        include: {
                          actor: { select: { firstName: true, lastName: true } },
                        },
                        orderBy: { createdAt: 'desc' },
                        take: 5,
                      },
                    },
                  },
                },
              },
            },
            orderBy: { saleDate: 'desc' },
            take: 20,
          },
          portalCheckouts: {
            include: {
              batch: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                  expectedDate: true,
                  receivedDate: true,
                  eggTypeKey: true,
                },
              },
              booking: {
                include: {
                  sale: {
                    select: {
                      id: true,
                      receiptNumber: true,
                      saleDate: true,
                      totalAmount: true,
                      paymentMethod: true,
                    },
                  },
                },
              },
              portalOrderRequest: {
                select: {
                  id: true,
                  status: true,
                  paymentStatus: true,
                  paymentReference: true,
                  createdAt: true,
                },
              },
              decisions: {
                include: {
                  actor: { select: { firstName: true, lastName: true } },
                },
                orderBy: { createdAt: 'desc' },
                take: 5,
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
          },
          _count: { select: { bookings: true, sales: true } },
        },
      });

      if (!customer) return reply.code(404).send({ error: 'Customer not found' });

      const [allBookings, allSales, deposits] = await Promise.all([
        prisma.booking.findMany({
          where: { customerId: customer.id, status: { not: 'CANCELLED' } },
          select: { id: true, amountPaid: true, orderValue: true, quantity: true, status: true, createdAt: true, updatedAt: true },
        }),
        prisma.sale.findMany({
          where: { customerId: customer.id },
          select: { id: true, totalAmount: true, totalQuantity: true, saleDate: true, createdAt: true, updatedAt: true },
        }),
        prisma.bankTransaction.findMany({
          where: {
            customerId: customer.id,
            direction: 'INFLOW',
            category: { in: CUSTOMER_DEPOSIT_CATEGORIES },
          },
          include: {
            bankAccount: { select: { name: true, lastFour: true } },
            enteredBy: { select: { firstName: true, lastName: true } },
            allocations: {
              include: {
                booking: {
                  select: {
                    id: true,
                    quantity: true,
                    status: true,
                    createdAt: true,
                    batch: {
                      select: {
                        id: true,
                        name: true,
                        status: true,
                        expectedDate: true,
                        receivedDate: true,
                        eggTypeKey: true,
                      },
                    },
                  },
                },
              },
              orderBy: { createdAt: 'desc' },
            },
          },
          orderBy: { transactionDate: 'desc' },
          take: 40,
        }),
      ]);

      const mappedDeposits = deposits.map((deposit) => {
        const allocatedAmount = deposit.allocations.reduce((sum, allocation) => sum + toNumber(allocation.amount), 0);
        return {
          ...deposit,
          amount: toNumber(deposit.amount),
          allocatedAmount,
          availableAmount: Math.max(0, toNumber(deposit.amount) - allocatedAmount),
          staffName: [deposit.enteredBy?.firstName, deposit.enteredBy?.lastName].filter(Boolean).join(' ').trim() || 'Staff',
          allocations: deposit.allocations.map((allocation) => ({
            ...allocation,
            amount: toNumber(allocation.amount),
            booking: allocation.booking
              ? {
                  ...allocation.booking,
                  batch: mapBatchSummary(allocation.booking.batch, eggTypes),
                }
              : null,
          })),
        };
      });

      const totalDeposited = mappedDeposits.reduce((sum, deposit) => sum + deposit.amount, 0);
      const totalAllocated = mappedDeposits.reduce((sum, deposit) => sum + deposit.allocatedAmount, 0);
      const pendingPortalTransfers = customer.portalCheckouts.filter((checkout) =>
        checkout.paymentMethod === 'TRANSFER' && ['AWAITING_TRANSFER', 'ADMIN_CONFIRMED'].includes(checkout.status),
      ).length;
      const activityDates = [
        customer.updatedAt,
        ...allBookings.flatMap((booking) => [booking.createdAt, booking.updatedAt]),
        ...allSales.flatMap((sale) => [sale.saleDate, sale.createdAt, sale.updatedAt]),
        ...mappedDeposits.map((deposit) => deposit.transactionDate),
        ...customer.portalCheckouts.flatMap((checkout) => [checkout.createdAt, checkout.updatedAt, checkout.verifiedAt, checkout.adminConfirmedAt]),
      ].filter(Boolean);
      const lastActivityAt = activityDates.length
        ? new Date(Math.max(...activityDates.map((value) => new Date(value).getTime()))).toISOString()
        : customer.createdAt;

      // CRM fields — first visit, last visit, total visits (pickup sales), lifetime spend
      const saleDates = allSales.map((sale) => new Date(sale.saleDate).getTime()).sort((a, b) => a - b);
      const firstVisitDate = saleDates.length > 0 ? new Date(saleDates[0]).toISOString() : null;
      const lastVisitDate = saleDates.length > 0 ? new Date(saleDates[saleDates.length - 1]).toISOString() : null;

      const stats = {
        totalBookings: allBookings.length,
        totalBookedCrates: allBookings.reduce((sum, booking) => sum + booking.quantity, 0),
        totalBookingValue: allBookings.reduce((sum, booking) => sum + toNumber(booking.orderValue), 0),
        totalSales: allSales.length,
        totalPurchasedCrates: allSales.reduce((sum, sale) => sum + sale.totalQuantity, 0),
        totalSpent: allSales.reduce((sum, sale) => sum + toNumber(sale.totalAmount), 0),
        activeBookings: allBookings.filter((booking) => booking.status === 'CONFIRMED').length,
        pendingPortalTransfers,
        lastActivityAt,
        // CRM
        firstVisitDate,
        lastVisitDate,
        totalVisits: allSales.length,
        lifetimeSpend: allSales.reduce((sum, sale) => sum + toNumber(sale.totalAmount), 0),
        lifetimeCrates: allSales.reduce((sum, sale) => sum + sale.totalQuantity, 0),
        memberSince: customer.createdAt,
      };

      const depositSummary = {
        totalDeposited,
        totalAllocated,
        availableAmount: Math.max(0, totalDeposited - totalAllocated),
        hangingDepositCount: mappedDeposits.filter((deposit) => deposit.availableAmount > 0.009).length,
      };

      return reply.send({
        customer: enrichCustomer(customer, eggTypes),
        stats,
        depositSummary,
        deposits: mappedDeposits,
      });
    },
  });

  fastify.post('/customers', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER', 'SHOP_FLOOR')],
    handler: async (request, reply) => {
      const { name, phone, email, notes } = request.body;

      if (!name || !phone) {
        return reply.code(400).send({ error: 'Name and phone are required' });
      }

      const existing = await prisma.customer.findFirst({ where: { phone } });
      if (existing) {
        return reply.code(409).send({ error: `Customer with phone ${phone} already exists`, existingCustomer: existing });
      }

      const customer = await prisma.customer.create({
        data: { name, phone, email: email || null, notes: notes || null },
      });

      return reply.code(201).send({ customer });
    },
  });

  fastify.patch('/customers/:id', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const existing = await prisma.customer.findUnique({ where: { id: request.params.id } });
      if (!existing) return reply.code(404).send({ error: 'Customer not found' });

      const { name, phone, email, notes, isFirstTime } = request.body;

      if (phone && phone !== existing.phone) {
        const phoneExists = await prisma.customer.findFirst({ where: { phone, id: { not: existing.id } } });
        if (phoneExists) {
          return reply.code(409).send({ error: `Phone ${phone} already belongs to another customer` });
        }
      }

      const customer = await prisma.customer.update({
        where: { id: request.params.id },
        data: {
          ...(name !== undefined && { name }),
          ...(phone !== undefined && { phone }),
          ...(email !== undefined && { email }),
          ...(notes !== undefined && { notes }),
          ...(isFirstTime !== undefined && { isFirstTime }),
        },
      });

      return reply.send({ customer });
    },
  });

  fastify.delete('/customers/:id', {
    preHandler: [authenticate, authorize('ADMIN')],
    handler: async (request, reply) => {
      const customer = await prisma.customer.findUnique({
        where: { id: request.params.id },
        include: { _count: { select: { bookings: true, sales: true, bankTransactions: true } } },
      });

      if (!customer) return reply.code(404).send({ error: 'Customer not found' });

      if (customer._count.bookings > 0 || customer._count.sales > 0 || customer._count.bankTransactions > 0) {
        return reply.code(400).send({
          error: 'Cannot delete customer with existing bookings, sales, or transactions',
          counts: customer._count,
        });
      }

      await prisma.customer.delete({ where: { id: request.params.id } });
      return reply.send({ message: 'Customer deleted' });
    },
  });
}
