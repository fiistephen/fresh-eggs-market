const colorMap = {
  brand:   'bg-brand-50 text-brand-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  error:   'bg-error-50 text-error-700',
  info:    'bg-info-50 text-info-700',
  neutral: 'bg-surface-100 text-surface-600',
};

// Map common statuses to colors
const statusColorMap = {
  // Batch statuses
  OPEN: 'brand',
  RECEIVED: 'success',
  CLOSED: 'neutral',
  // Booking statuses
  CONFIRMED: 'success',
  CANCELLED: 'error',
  PICKED_UP: 'neutral',
  // Sale types
  WHOLESALE: 'info',
  RETAIL: 'brand',
  CRACKED: 'warning',
  WRITE_OFF: 'error',
  // Payment
  CASH: 'success',
  TRANSFER: 'info',
  POS_CARD: 'brand',
  PRE_ORDER: 'warning',
  // Banking
  INFLOW: 'success',
  OUTFLOW: 'error',
  // Generic
  ACTIVE: 'success',
  PENDING: 'warning',
  COMPLETED: 'neutral',
  DEFAULT: 'neutral',
};

export default function Badge({
  children,
  color,
  status,
  dot = false,
  className = '',
}) {
  const resolvedColor = color || statusColorMap[status] || 'neutral';
  const colorClasses = colorMap[resolvedColor] || colorMap.neutral;

  return (
    <span
      className={`
        inline-flex items-center gap-1.5
        px-2 py-0.5 rounded-full
        text-caption-medium whitespace-nowrap
        ${colorClasses}
        ${className}
      `.trim()}
    >
      {dot && (
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      )}
      {children}
    </span>
  );
}
