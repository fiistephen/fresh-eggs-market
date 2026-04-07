import prisma from '../plugins/prisma.js';
import {
  DEFAULT_CRACK_ALLOWANCE_PERCENT,
  DEFAULT_TARGET_PROFIT_PER_CRATE,
} from './operationsPolicy.js';

export const OPERATIONS_POLICY_KEY = 'OPERATIONS_POLICY';

export const DEFAULT_OPERATIONS_POLICY = {
  targetProfitPerCrate: DEFAULT_TARGET_PROFIT_PER_CRATE,
  crackAllowancePercent: DEFAULT_CRACK_ALLOWANCE_PERCENT,
};

function normalizePolicy(value) {
  const raw = value && typeof value === 'object' ? value : {};

  const targetProfitPerCrate = Number(raw.targetProfitPerCrate);
  const crackAllowancePercent = Number(raw.crackAllowancePercent);

  return {
    targetProfitPerCrate: Number.isFinite(targetProfitPerCrate) && targetProfitPerCrate > 0
      ? targetProfitPerCrate
      : DEFAULT_OPERATIONS_POLICY.targetProfitPerCrate,
    crackAllowancePercent: Number.isFinite(crackAllowancePercent) && crackAllowancePercent >= 0
      ? crackAllowancePercent
      : DEFAULT_OPERATIONS_POLICY.crackAllowancePercent,
  };
}

export async function getOperationsPolicy() {
  const setting = await prisma.appSetting.upsert({
    where: { key: OPERATIONS_POLICY_KEY },
    update: {},
    create: {
      key: OPERATIONS_POLICY_KEY,
      value: DEFAULT_OPERATIONS_POLICY,
      description: 'Company-wide policy settings for batch profitability and crack monitoring.',
    },
  });

  return normalizePolicy(setting.value);
}

export async function saveOperationsPolicy(policy, updatedById) {
  const normalized = normalizePolicy(policy);

  const setting = await prisma.appSetting.upsert({
    where: { key: OPERATIONS_POLICY_KEY },
    update: {
      value: normalized,
      updatedById,
      description: 'Company-wide policy settings for batch profitability and crack monitoring.',
    },
    create: {
      key: OPERATIONS_POLICY_KEY,
      value: normalized,
      updatedById,
      description: 'Company-wide policy settings for batch profitability and crack monitoring.',
    },
  });

  return normalizePolicy(setting.value);
}
