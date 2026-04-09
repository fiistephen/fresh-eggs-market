import { forwardRef } from 'react';

const Input = forwardRef(({
  label,
  error,
  hint,
  required,
  size = 'md',
  className = '',
  containerClassName = '',
  ...props
}, ref) => {
  const heights = { sm: 'h-8', md: 'h-9' };

  return (
    <div className={containerClassName}>
      {label && (
        <label className="block text-body-medium text-surface-700 mb-1">
          {label}
          {required && <span className="text-error-500 ml-0.5">*</span>}
        </label>
      )}
      <input
        ref={ref}
        className={`
          w-full ${heights[size] || heights.md} px-3
          bg-surface-0 border rounded-md text-body text-surface-800
          placeholder:text-surface-400
          transition-all duration-fast
          ${error
            ? 'border-error-500 focus:ring-2 focus:ring-red-500/15 focus:border-error-500'
            : 'border-surface-200 hover:border-surface-300 focus:ring-2 focus:ring-brand-500/15 focus:border-brand-500'
          }
          focus:outline-none
          disabled:bg-surface-50 disabled:text-surface-400 disabled:cursor-not-allowed
          ${className}
        `.trim()}
        {...props}
      />
      {(error || hint) && (
        <p className={`mt-1 text-caption ${error ? 'text-error-500' : 'text-surface-500'}`}>
          {error || hint}
        </p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

const Select = forwardRef(({
  label,
  error,
  hint,
  required,
  size = 'md',
  children,
  className = '',
  containerClassName = '',
  ...props
}, ref) => {
  const heights = { sm: 'h-8', md: 'h-9' };

  return (
    <div className={containerClassName}>
      {label && (
        <label className="block text-body-medium text-surface-700 mb-1">
          {label}
          {required && <span className="text-error-500 ml-0.5">*</span>}
        </label>
      )}
      <select
        ref={ref}
        className={`
          w-full ${heights[size] || heights.md} px-3
          bg-surface-0 border rounded-md text-body text-surface-800
          transition-all duration-fast appearance-none
          bg-[url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='16'%20height='16'%20viewBox='0%200%2024%2024'%20fill='none'%20stroke='%23737370'%20stroke-width='2'%20stroke-linecap='round'%20stroke-linejoin='round'%3E%3Cpolyline%20points='6%209%2012%2015%2018%209'%3E%3C/polyline%3E%3C/svg%3E")]
          bg-[length:16px] bg-[position:right_8px_center] bg-no-repeat pr-8
          ${error
            ? 'border-error-500 focus:ring-2 focus:ring-red-500/15 focus:border-error-500'
            : 'border-surface-200 hover:border-surface-300 focus:ring-2 focus:ring-brand-500/15 focus:border-brand-500'
          }
          focus:outline-none
          disabled:bg-surface-50 disabled:text-surface-400 disabled:cursor-not-allowed
          ${className}
        `.trim()}
        {...props}
      >
        {children}
      </select>
      {(error || hint) && (
        <p className={`mt-1 text-caption ${error ? 'text-error-500' : 'text-surface-500'}`}>
          {error || hint}
        </p>
      )}
    </div>
  );
});

Select.displayName = 'Select';

const Textarea = forwardRef(({
  label,
  error,
  hint,
  required,
  className = '',
  containerClassName = '',
  ...props
}, ref) => {
  return (
    <div className={containerClassName}>
      {label && (
        <label className="block text-body-medium text-surface-700 mb-1">
          {label}
          {required && <span className="text-error-500 ml-0.5">*</span>}
        </label>
      )}
      <textarea
        ref={ref}
        className={`
          w-full px-3 py-2 min-h-[80px]
          bg-surface-0 border rounded-md text-body text-surface-800
          placeholder:text-surface-400
          transition-all duration-fast resize-y
          ${error
            ? 'border-error-500 focus:ring-2 focus:ring-red-500/15 focus:border-error-500'
            : 'border-surface-200 hover:border-surface-300 focus:ring-2 focus:ring-brand-500/15 focus:border-brand-500'
          }
          focus:outline-none
          disabled:bg-surface-50 disabled:text-surface-400 disabled:cursor-not-allowed
          ${className}
        `.trim()}
        {...props}
      />
      {(error || hint) && (
        <p className={`mt-1 text-caption ${error ? 'text-error-500' : 'text-surface-500'}`}>
          {error || hint}
        </p>
      )}
    </div>
  );
});

Textarea.displayName = 'Textarea';

export { Input as default, Select, Textarea };
