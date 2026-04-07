import prisma from '../plugins/prisma.js';
import { authenticate } from '../plugins/auth.js';
import { authorize } from '../middleware/authorize.js';
import {
  ITEM_CATEGORY_LABELS,
  itemDisplayName,
  normalizeItemCode,
  syncItemsFromBatchEggCodes,
  validateItemPayload,
} from '../utils/items.js';

function mapItem(item) {
  return {
    ...item,
    defaultWholesalePrice: item.defaultWholesalePrice != null ? Number(item.defaultWholesalePrice) : null,
    defaultRetailPrice: item.defaultRetailPrice != null ? Number(item.defaultRetailPrice) : null,
    categoryLabel: ITEM_CATEGORY_LABELS[item.category] || item.category,
    displayName: itemDisplayName(item),
    batchUsageCount: item.batchEggCodes?.length || 0,
    totalReceivedQuantity: (item.batchEggCodes || []).reduce(
      (sum, row) => sum + row.quantity + row.freeQty,
      0,
    ),
    latestBatch: item.batchEggCodes?.[0]?.batch
      ? {
          id: item.batchEggCodes[0].batch.id,
          name: item.batchEggCodes[0].batch.name,
          receivedDate: item.batchEggCodes[0].batch.receivedDate,
          status: item.batchEggCodes[0].batch.status,
        }
      : null,
  };
}

function listQueryWhere({ search, category, includeInactive }) {
  const where = {};

  if (!includeInactive) {
    where.isActive = true;
  }

  if (category) {
    where.category = category;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { code: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  return where;
}

function buildSummary(items) {
  const byCategory = {};
  for (const category of Object.keys(ITEM_CATEGORY_LABELS)) {
    byCategory[category] = {
      category,
      label: ITEM_CATEGORY_LABELS[category],
      total: 0,
      active: 0,
    };
  }

  for (const item of items) {
    const bucket = byCategory[item.category];
    if (!bucket) continue;
    bucket.total += 1;
    if (item.isActive) bucket.active += 1;
  }

  return {
    totalItems: items.length,
    activeItems: items.filter((item) => item.isActive).length,
    inactiveItems: items.filter((item) => !item.isActive).length,
    byCategory: Object.values(byCategory),
  };
}

export default async function itemRoutes(fastify) {
  fastify.get('/items', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const {
        search = '',
        category = '',
        includeInactive = 'false',
      } = request.query;

      await syncItemsFromBatchEggCodes();

      const includeInactiveBool = String(includeInactive) === 'true';
      const where = listQueryWhere({
        search: String(search).trim(),
        category: category || undefined,
        includeInactive: includeInactiveBool,
      });

      const items = await prisma.item.findMany({
        where,
        include: {
          batchEggCodes: {
            include: {
              batch: {
                select: {
                  id: true,
                  name: true,
                  receivedDate: true,
                  status: true,
                },
              },
            },
            orderBy: {
              batch: { receivedDate: 'desc' },
            },
          },
        },
        orderBy: [{ isActive: 'desc' }, { category: 'asc' }, { code: 'asc' }, { name: 'asc' }],
      });

      const allItemsForSummary = await prisma.item.findMany({
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({
        items: items.map(mapItem),
        summary: buildSummary(allItemsForSummary),
        categories: Object.entries(ITEM_CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
      });
    },
  });

  fastify.post('/items', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const payload = request.body || {};
      const validationError = validateItemPayload(payload);
      if (validationError) {
        return reply.code(400).send({ error: validationError });
      }

      const code = normalizeItemCode(payload.code);
      if (code) {
        const existing = await prisma.item.findUnique({ where: { code } });
        if (existing) {
          return reply.code(409).send({ error: `An item with code ${code} already exists` });
        }
      }

      const item = await prisma.item.create({
        data: {
          code,
          name: String(payload.name).trim(),
          category: payload.category,
          unitLabel: String(payload.unitLabel).trim(),
          description: payload.description ? String(payload.description).trim() : null,
          defaultWholesalePrice: payload.defaultWholesalePrice != null && payload.defaultWholesalePrice !== ''
            ? Number(payload.defaultWholesalePrice)
            : null,
          defaultRetailPrice: payload.defaultRetailPrice != null && payload.defaultRetailPrice !== ''
            ? Number(payload.defaultRetailPrice)
            : null,
          isActive: payload.isActive !== false,
        },
        include: {
          batchEggCodes: {
            include: { batch: { select: { id: true, name: true, receivedDate: true, status: true } } },
          },
        },
      });

      return reply.code(201).send({ item: mapItem(item) });
    },
  });

  fastify.patch('/items/:id', {
    preHandler: [authenticate, authorize('ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const existing = await prisma.item.findUnique({
        where: { id: request.params.id },
      });
      if (!existing) {
        return reply.code(404).send({ error: 'Item not found' });
      }

      const payload = {
        ...existing,
        ...request.body,
      };
      const validationError = validateItemPayload(payload);
      if (validationError) {
        return reply.code(400).send({ error: validationError });
      }

      const code = normalizeItemCode(payload.code);
      if (code && code !== existing.code) {
        const duplicate = await prisma.item.findUnique({ where: { code } });
        if (duplicate) {
          return reply.code(409).send({ error: `An item with code ${code} already exists` });
        }
      }

      const item = await prisma.item.update({
        where: { id: request.params.id },
        data: {
          code,
          name: String(payload.name).trim(),
          category: payload.category,
          unitLabel: String(payload.unitLabel).trim(),
          description: payload.description ? String(payload.description).trim() : null,
          defaultWholesalePrice: payload.defaultWholesalePrice != null && payload.defaultWholesalePrice !== ''
            ? Number(payload.defaultWholesalePrice)
            : null,
          defaultRetailPrice: payload.defaultRetailPrice != null && payload.defaultRetailPrice !== ''
            ? Number(payload.defaultRetailPrice)
            : null,
          isActive: payload.isActive !== false,
        },
        include: {
          batchEggCodes: {
            include: { batch: { select: { id: true, name: true, receivedDate: true, status: true } } },
            orderBy: {
              batch: { receivedDate: 'desc' },
            },
          },
        },
      });

      if (existing.code && existing.code !== code && code) {
        await prisma.batchEggCode.updateMany({
          where: { itemId: item.id, code: existing.code },
          data: { code },
        });
      }

      return reply.send({ item: mapItem(item) });
    },
  });
}
