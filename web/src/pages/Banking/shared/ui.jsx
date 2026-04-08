export function FilterField({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-[0.14em] text-gray-500">{label}</label>
      {children}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}

export function ModalShell({ title, onClose, children, maxWidth = 'max-w-3xl' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className={`max-h-[92vh] w-full ${maxWidth} overflow-y-auto rounded-3xl bg-white shadow-2xl`} onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700">Close</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function ModalActions({ onClose, submitting, submitLabel }) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
      <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
        Cancel
      </button>
      <button type="submit" disabled={submitting} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-gray-300">
        {submitLabel}
      </button>
    </div>
  );
}

export function EmptyState({ title, body, compact = false }) {
  return (
    <div className={`text-center ${compact ? 'py-6' : 'py-10'}`}>
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-xl">🏦</div>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">{body}</p>
    </div>
  );
}

export function EmptyPanel({ title, body }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-6 py-24">
      <EmptyState title={title} body={body} />
    </div>
  );
}

export function PanelLoading({ label }) {
  return <div className="rounded-2xl border border-gray-200 bg-white px-6 py-24 text-center text-sm text-gray-500">{label}</div>;
}

export function SummaryBanner({ tone, title, body }) {
  const tones = {
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    orange: 'border-orange-200 bg-orange-50 text-orange-900',
    red: 'border-red-200 bg-red-50 text-red-900',
  };
  return (
    <div className={`rounded-2xl border px-4 py-4 ${tones[tone] || 'border-gray-200 bg-gray-50 text-gray-900'}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm opacity-80">{body}</p>
    </div>
  );
}

export function StatPill({ label, value, danger = false }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${danger ? 'bg-red-50' : 'bg-gray-50'}`}>
      <p className="text-[11px] uppercase tracking-[0.14em] text-gray-500">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${danger ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

export function StatusChip({ label, tone = 'gray' }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-700',
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
  };
  return <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${tones[tone] || tones.gray}`}>{label}</span>;
}

export function ImportCountCard({ label, value, tone }) {
  const tones = {
    green: 'bg-green-50 text-green-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    gray: 'bg-gray-50 text-gray-700',
  };
  return (
    <div className={`rounded-xl px-4 py-3 ${tones[tone] || tones.gray}`}>
      <p className="text-xs font-medium uppercase tracking-[0.16em]">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

export function ActionButton({ label, onClick, variant = 'default' }) {
  const variants = {
    default: 'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100',
    primary: 'border-brand-600 bg-brand-600 text-white hover:bg-brand-700',
  };
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${variants[variant] || variants.default}`}
    >
      {label}
    </button>
  );
}
