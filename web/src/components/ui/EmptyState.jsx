import Button from './Button';

export default function EmptyState({
  icon,
  title,
  description,
  action,
  actionLabel,
  className = '',
}) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
      {icon && (
        <div className="text-surface-300 mb-3">
          {typeof icon === 'string' ? (
            <span className="text-[48px]">{icon}</span>
          ) : (
            icon
          )}
        </div>
      )}
      {title && (
        <h3 className="text-heading text-surface-700 mb-1">{title}</h3>
      )}
      {description && (
        <p className="text-body text-surface-500 max-w-sm">{description}</p>
      )}
      {action && actionLabel && (
        <Button variant="primary" size="md" onClick={action} className="mt-4">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
