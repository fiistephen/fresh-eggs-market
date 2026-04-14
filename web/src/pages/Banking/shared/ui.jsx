export function FilterField({ label, children }) {
  return (
    <div>
      <label className="text-overline mb-2 block text-surface-500">{label}</label>
      {children}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <div>
      <label className="text-body-medium mb-2 block text-surface-700">{label}</label>
      {children}
    </div>
  );
}

export function ModalShell({ title, onClose, children, maxWidth = 'max-w-3xl' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className={`max-h-[92vh] w-full ${maxWidth} overflow-y-auto rounded-xl bg-surface-0 shadow-xl`} onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-surface-200 bg-surface-0 px-6 py-4">
          <h2 className="text-heading text-surface-900">{title}</h2>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-body text-surface-500 transition-colors duration-fast hover:bg-surface-100 hover:text-surface-700">Close</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function ModalActions({ onClose, submitting, submitLabel, submitDisabled = false }) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-surface-200 pt-4 sm:flex-row sm:justify-end">
      <button type="button" onClick={onClose} className="text-body-medium rounded-md px-4 py-2 text-surface-600 transition-colors duration-fast hover:bg-surface-100">
        Cancel
      </button>
      <button type="submit" disabled={submitting || submitDisabled} className="text-body-medium rounded-md bg-brand-600 px-4 py-2 text-surface-0 transition-colors duration-fast hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-surface-300">
        {submitLabel}
      </button>
    </div>
  );
}

export function EmptyState({ title, body, compact = false }) {
  return (
    <div className={`text-center ${compact ? 'py-6' : 'py-10'}`}>
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-100">
        <svg className="h-6 w-6 text-surface-500" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm6 2a1 1 0 100-2 1 1 0 000 2z" />
        </svg>
      </div>
      <h3 className="text-heading text-surface-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-body text-surface-500">{body}</p>
    </div>
  );
}

export function EmptyPanel({ title, body }) {
  return (
    <div className="rounded-lg border border-surface-200 bg-surface-0 px-6 py-24">
      <EmptyState title={title} body={body} />
    </div>
  );
}

export function PanelLoading({ label }) {
  return <div className="rounded-lg border border-surface-200 bg-surface-0 px-6 py-24 text-center text-body text-surface-500">{label}</div>;
}

export function SummaryBanner({ tone, title, body }) {
  const tones = {
    warning: 'border-warning-100 bg-warning-50 text-warning-700',
    brand: 'border-brand-200 bg-brand-50 text-brand-700',
    error: 'border-error-100 bg-error-50 text-error-700',
  };
  return (
    <div className={`rounded-lg border px-4 py-4 ${tones[tone] || 'border-surface-200 bg-surface-50 text-surface-700'}`}>
      <p className="text-body-medium font-semibold">{title}</p>
      <p className="mt-1 text-body opacity-80">{body}</p>
    </div>
  );
}

export function StatPill({ label, value, danger = false }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${danger ? 'bg-error-50' : 'bg-surface-50'}`}>
      <p className="text-overline text-surface-500">{label}</p>
      <p className={`mt-1 text-body-medium font-semibold ${danger ? 'text-error-700' : 'text-surface-900'}`}>{value}</p>
    </div>
  );
}

export function StatusChip({ label, tone = 'default' }) {
  const tones = {
    default: 'bg-surface-100 text-surface-700',
    success: 'bg-success-100 text-success-700',
    warning: 'bg-warning-100 text-warning-700',
  };
  return <span className={`rounded-full px-2 py-1 text-caption-medium ${tones[tone] || tones.default}`}>{label}</span>;
}

export function ImportCountCard({ label, value, tone }) {
  const tones = {
    success: 'bg-success-50 text-success-700',
    warning: 'bg-warning-50 text-warning-700',
    error: 'bg-error-50 text-error-700',
    default: 'bg-surface-50 text-surface-700',
  };
  return (
    <div className={`rounded-lg px-4 py-3 ${tones[tone] || tones.default}`}>
      <p className="text-overline">{label}</p>
      <p className="mt-2 text-metric font-bold">{value}</p>
    </div>
  );
}

export function ActionButton({ label, onClick, variant = 'secondary' }) {
  const variants = {
    secondary: 'border border-brand-200 bg-brand-50 text-brand-700 transition-colors duration-fast hover:bg-brand-100',
    primary: 'border border-brand-600 bg-brand-600 text-surface-0 transition-colors duration-fast hover:bg-brand-700',
  };
  return (
    <button
      onClick={onClick}
      className={`text-body-medium rounded-md px-3 py-2 ${variants[variant] || variants.secondary}`}
    >
      {label}
    </button>
  );
}
