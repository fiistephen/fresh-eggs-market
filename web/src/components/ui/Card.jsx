const variants = {
  default: 'bg-surface-0 shadow-sm rounded-lg',
  outlined: 'bg-surface-0 border border-surface-200 rounded-lg',
  tinted: 'rounded-lg',
  interactive: 'bg-surface-0 shadow-sm rounded-lg cursor-pointer hover:shadow-md hover:-translate-y-px transition-all duration-normal',
};

export default function Card({
  variant = 'default',
  padding = 'comfortable',
  tint,
  className = '',
  onClick,
  children,
  ...props
}) {
  const paddings = { comfortable: 'p-5', compact: 'p-3', none: '' };
  const v = onClick ? 'interactive' : (variant || 'default');

  return (
    <div
      onClick={onClick}
      className={`
        ${variants[v]}
        ${paddings[padding] || paddings.comfortable}
        ${tint || ''}
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, className = '' }) {
  return (
    <div className={`flex items-start justify-between mb-3 ${className}`}>
      <div>
        <h3 className="text-heading text-surface-800">{title}</h3>
        {subtitle && <p className="text-caption text-surface-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
