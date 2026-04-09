import { forwardRef } from 'react';

const variants = {
  primary:
    'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 shadow-xs hover:shadow-sm',
  secondary:
    'bg-surface-0 text-surface-700 border border-surface-200 hover:bg-surface-50 hover:border-surface-300 active:bg-surface-100',
  ghost:
    'text-surface-600 hover:bg-surface-100 active:bg-surface-200',
  danger:
    'bg-error-500 text-white hover:bg-error-700 active:bg-error-700',
  'danger-ghost':
    'text-error-500 hover:bg-error-50 active:bg-error-100',
};

const sizes = {
  sm: 'h-8 px-3 text-caption-medium gap-1.5',
  md: 'h-9 px-4 text-body-medium gap-2',
  lg: 'h-10 px-5 text-body-medium gap-2',
};

const Spinner = ({ className = 'w-4 h-4' }) => (
  <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

const Button = forwardRef(({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  children,
  className = '',
  icon,
  iconRight,
  ...props
}, ref) => {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center font-medium rounded-md
        transition-all duration-fast ease-smooth
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:ring-offset-1
        disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none
        ${variants[variant] || variants.primary}
        ${sizes[size] || sizes.md}
        ${className}
      `.trim()}
      {...props}
    >
      {loading ? (
        <>
          <Spinner className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
          <span>{children}</span>
        </>
      ) : (
        <>
          {icon && <span className="shrink-0">{icon}</span>}
          <span>{children}</span>
          {iconRight && <span className="shrink-0">{iconRight}</span>}
        </>
      )}
    </button>
  );
});

Button.displayName = 'Button';
export default Button;
