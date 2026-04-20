/**
 * Shared helper utilities used across multiple pages.
 */

/**
 * Returns a waiting time label and urgency level for portal transfers.
 * Per Meeting 3: pending transfers must be confirmed within 1 hour during business hours.
 */
export function waitingTimeInfo(createdAt) {
  if (!createdAt) return { label: '', isOverdue: false, minutes: 0 };
  const minutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  const isOverdue = minutes >= 60;
  let label;
  if (minutes < 1) label = 'Just now';
  else if (minutes < 60) label = `Waiting ${minutes}m`;
  else {
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    label = `Waiting ${hours}h${rem > 0 ? ` ${rem}m` : ''}`;
  }
  return { label, isOverdue, minutes };
}
