export const DEFAULT_TARGET_PROFIT_PER_CRATE = 500;

// Temporary default until operations confirms the final allowance setting.
export const DEFAULT_CRACK_ALLOWANCE_PERCENT = 2;
export const DEFAULT_BOOKING_MIN_PAYMENT_PERCENT = 80;
export const DEFAULT_FIRST_TIME_BOOKING_LIMIT_CRATES = 20;
export const DEFAULT_MAX_BOOKING_CRATES_PER_ORDER = 100;
export const DEFAULT_LARGE_POS_PAYMENT_THRESHOLD = 500000;

export function safeDivide(numerator, denominator) {
  if (!denominator) return 0;
  return numerator / denominator;
}

export function roundTo2(value) {
  return Number(Number(value || 0).toFixed(2));
}

export function buildCrackAlert({
  ratePercent,
  crackQuantity = 0,
  writeOffQuantity = 0,
  thresholdPercent = DEFAULT_CRACK_ALLOWANCE_PERCENT,
  crackedCratesAllowance = null,
  writeOffCratesAllowance = null,
}) {
  const percentThreshold = Number.isFinite(Number(thresholdPercent))
    ? Number(thresholdPercent)
    : DEFAULT_CRACK_ALLOWANCE_PERCENT;
  const crackedThreshold = Number.isFinite(Number(crackedCratesAllowance))
    ? Number(crackedCratesAllowance)
    : null;
  const writeOffThreshold = Number.isFinite(Number(writeOffCratesAllowance))
    ? Number(writeOffCratesAllowance)
    : null;

  const crackExceeded = crackedThreshold != null && crackQuantity > crackedThreshold;
  const writeOffExceeded = writeOffThreshold != null && writeOffQuantity > writeOffThreshold;
  const percentExceeded = ratePercent > percentThreshold;

  if (writeOffExceeded) {
    return {
      level: 'ALERT',
      label: 'Above write-off allowance',
      exceeded: true,
      thresholdPercent: percentThreshold,
      crackedCratesAllowance: crackedThreshold,
      writeOffCratesAllowance: writeOffThreshold,
      reasons: ['WRITE_OFF_ALLOWANCE'],
    };
  }

  if (crackExceeded) {
    return {
      level: 'ALERT',
      label: 'Above cracked crate allowance',
      exceeded: true,
      thresholdPercent: percentThreshold,
      crackedCratesAllowance: crackedThreshold,
      writeOffCratesAllowance: writeOffThreshold,
      reasons: ['CRACKED_CRATES_ALLOWANCE'],
    };
  }

  if (percentExceeded) {
    return {
      level: 'ALERT',
      label: 'Above crack allowance',
      exceeded: true,
      thresholdPercent: percentThreshold,
      crackedCratesAllowance: crackedThreshold,
      writeOffCratesAllowance: writeOffThreshold,
      reasons: ['CRACK_PERCENT_ALLOWANCE'],
    };
  }

  const closeToPercent = percentThreshold > 0 && ratePercent >= percentThreshold * 0.7;
  const closeToCracked = crackedThreshold != null && crackedThreshold > 0 && crackQuantity >= crackedThreshold * 0.7;
  const closeToWriteOff = writeOffThreshold != null && writeOffThreshold > 0 && writeOffQuantity >= writeOffThreshold * 0.7;

  if (closeToWriteOff) {
    return {
      level: 'WATCH',
      label: 'Close to write-off allowance',
      exceeded: false,
      thresholdPercent: percentThreshold,
      crackedCratesAllowance: crackedThreshold,
      writeOffCratesAllowance: writeOffThreshold,
      reasons: ['WRITE_OFF_ALLOWANCE'],
    };
  }

  if (closeToCracked) {
    return {
      level: 'WATCH',
      label: 'Close to cracked crate allowance',
      exceeded: false,
      thresholdPercent: percentThreshold,
      crackedCratesAllowance: crackedThreshold,
      writeOffCratesAllowance: writeOffThreshold,
      reasons: ['CRACKED_CRATES_ALLOWANCE'],
    };
  }

  if (closeToPercent) {
    return {
      level: 'WATCH',
      label: 'Close to crack allowance',
      exceeded: false,
      thresholdPercent: percentThreshold,
      crackedCratesAllowance: crackedThreshold,
      writeOffCratesAllowance: writeOffThreshold,
      reasons: ['CRACK_PERCENT_ALLOWANCE'],
    };
  }

  return {
    level: 'OK',
    label: 'Within crack allowance',
    exceeded: false,
    thresholdPercent: percentThreshold,
    crackedCratesAllowance: crackedThreshold,
    writeOffCratesAllowance: writeOffThreshold,
    reasons: [],
  };
}
