import prisma from '../plugins/prisma.js';

export const ITEM_CATEGORY_LABELS = {
  FE_EGGS: 'FE Eggs',
  CRATES: 'Crates',
  DELIVERY: 'Delivery',
  LEGACY_MISC: 'Legacy / Misc',
};

export const ITEM_CATEGORIES = Object.keys(ITEM_CATEGORY_LABELS);

export function normalizeItemCode(code) {
  if (!code) return null;
  return String(code).trim().toUpperCase();
}

export function itemDisplayName(item) {
  if (!item) return 'Unknown item';
  if (item.code && item.name && item.name !== item.code) {
    return `${item.name} (${item.code})`;
  }
  return item.name || item.code || 'Unknown item';
}

function looksLikeFeCode(code) {
  return /^FE\d+$/.test(code);
}

export function validateItemPayload(payload, { requireName = true } = {}) {
  const code = normalizeItemCode(payload.code);
  const name = payload.name ? String(payload.name).trim() : '';
  const category = payload.category || 'FE_EGGS';
  const unitLabel = payload.unitLabel ? String(payload.unitLabel).trim() : '';

  if (requireName && !name) return 'Item name is required';
  if (!ITEM_CATEGORIES.includes(category)) return 'Invalid item category';
  if (!unitLabel) return 'Unit label is required';
  if (code && category === 'FE_EGGS' && !looksLikeFeCode(code)) {
    return 'FE egg items must use a code like FE4600';
  }
  if (!code && category === 'FE_EGGS') {
    return 'FE egg items need an FE code';
  }

  return null;
}

export async function ensureItemForEggCode({
  code,
  wholesalePrice = null,
  retailPrice = null,
}) {
  const normalizedCode = normalizeItemCode(code);
  if (!normalizedCode) return null;

  const existing = await prisma.item.findUnique({
    where: { code: normalizedCode },
  });

  if (existing) return existing;

  return prisma.item.create({
    data: {
      code: normalizedCode,
      name: normalizedCode,
      category: 'FE_EGGS',
      unitLabel: 'crate',
      defaultWholesalePrice: wholesalePrice,
      defaultRetailPrice: retailPrice,
      isActive: true,
    },
  });
}

export async function syncItemsFromBatchEggCodes() {
  const batchEggCodes = await prisma.batchEggCode.findMany({
    where: { itemId: null },
    select: {
      id: true,
      code: true,
      wholesalePrice: true,
      retailPrice: true,
      batch: {
        select: {
          wholesalePrice: true,
          retailPrice: true,
        },
      },
    },
    orderBy: { code: 'asc' },
  });

  if (!batchEggCodes.length) {
    return { createdCount: 0, linkedCount: 0 };
  }

  const codes = [...new Set(batchEggCodes.map((row) => normalizeItemCode(row.code)).filter(Boolean))];
  const existingItems = await prisma.item.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true },
  });
  const itemByCode = new Map(existingItems.map((item) => [item.code, item]));

  let createdCount = 0;
  let linkedCount = 0;

  for (const code of codes) {
    if (itemByCode.has(code)) continue;

    const firstMatch = batchEggCodes.find((row) => normalizeItemCode(row.code) === code);
    const created = await prisma.item.create({
      data: {
        code,
        name: code,
        category: 'FE_EGGS',
        unitLabel: 'crate',
        defaultWholesalePrice: firstMatch?.wholesalePrice ?? firstMatch?.batch?.wholesalePrice ?? null,
        defaultRetailPrice: firstMatch?.retailPrice ?? firstMatch?.batch?.retailPrice ?? null,
        isActive: true,
      },
      select: { id: true, code: true },
    });
    itemByCode.set(code, created);
    createdCount += 1;
  }

  for (const row of batchEggCodes) {
    const item = itemByCode.get(normalizeItemCode(row.code));
    if (!item) continue;
    await prisma.batchEggCode.update({
      where: { id: row.id },
      data: { itemId: item.id },
    });
    linkedCount += 1;
  }

  return { createdCount, linkedCount };
}
