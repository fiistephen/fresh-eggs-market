export const DEFAULT_TARGET_PROFIT_PER_CRATE = 500;

// Temporary default until operations confirms the final allowance setting.
export const DEFAULT_CRACK_ALLOWANCE_PERCENT = 2;

export function safeDivide(numerator, denominator) {
  if (!denominator) return 0;
  return numerator / denominator;
}

export function roundTo2(value) {
  return Number(Number(value || 0).toFixed(2));
}

export function buildCrackAlert(ratePercent, thresholdPercent = DEFAULT_CRACK_ALLOWANCE_PERCENT) {
  if (ratePercent > thresholdPercent) {
    return {
      level: 'ALERT',
      label: 'Above crack allowance',
      exceeded: true,
      thresholdPercent,
    };
  }

  if (ratePercent >= thresholdPercent * 0.7) {
    return {
      level: 'WATCH',
      label: 'Close to crack allowance',
      exceeded: false,
      thresholdPercent,
    };
  }

  return {
    level: 'OK',
    label: 'Within crack allowance',
    exceeded: false,
    thresholdPercent,
  };
}
