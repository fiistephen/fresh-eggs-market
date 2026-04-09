export default function FilterChip({ label, value, onRemove, className = '' }) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5
        bg-surface-100 text-surface-700
        pl-2.5 pr-1.5 py-1 rounded-full
        text-caption-medium
        ${className}
      `.trim()}
    >
      {label && <span className="text-surface-500">{label}:</span>}
      <span>{value}</span>
      {onRemove && (
        <button
          onClick={onRemove}
          className="p-0.5 rounded-full hover:bg-surface-200 text-surface-400 hover:text-surface-600 transition-colors duration-fast"
          aria-label={`Remove ${label || value} filter`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </span>
  );
}
