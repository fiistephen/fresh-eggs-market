import { useState } from 'react';
import { DIRECTION_COLORS, SOURCE_LABELS, fmtMoney, fmtDate, accountLabel, displayAccountName, categoryLabel } from './shared/constants';
import { EmptyState } from './shared/ui';

export default function TransactionsView({ accounts, transactions, total, loading, filters, categoryMap, page, pageSize, totalPages, onPageChange, onFilterChange }) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const hasActiveFilters = filters.bankAccountId || filters.direction || filters.sourceType || filters.dateFrom || filters.dateTo;
  const rangeStart = Math.min((page - 1) * pageSize + 1, total);
  const rangeEnd = Math.min(page * pageSize, total);

  /* ── Build active filter chips ───────────────────────── */
  const chips = [];
  if (filters.bankAccountId) {
    const acct = accounts.find((a) => a.id === filters.bankAccountId);
    chips.push({ key: 'bankAccountId', label: acct ? displayAccountName(acct) : 'Account' });
  }
  if (filters.direction) chips.push({ key: 'direction', label: filters.direction === 'INFLOW' ? 'Inflows' : 'Outflows' });
  if (filters.sourceType) chips.push({ key: 'sourceType', label: SOURCE_LABELS[filters.sourceType] || filters.sourceType });
  if (filters.dateFrom) chips.push({ key: 'dateFrom', label: `From ${filters.dateFrom}` });
  if (filters.dateTo) chips.push({ key: 'dateTo', label: `To ${filters.dateTo}` });

  function removeChip(key) {
    onFilterChange({ [key]: '' });
  }

  return (
    <div className="space-y-3">
      {/* ── Filter bar ─────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-2 px-4 py-2.5">
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
              filtersOpen || hasActiveFilters ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" /></svg>
            Filter
          </button>

          {/* Active filter chips */}
          {chips.map((chip) => (
            <span key={chip.key} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
              {chip.label}
              <button onClick={() => removeChip(chip.key)} className="ml-0.5 text-gray-400 hover:text-gray-600">&times;</button>
            </span>
          ))}

          {hasActiveFilters && (
            <button
              onClick={() => onFilterChange({ bankAccountId: '', direction: '', sourceType: '', dateFrom: '', dateTo: '' })}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Clear all
            </button>
          )}

          <button
            onClick={() => setDetailsOpen((value) => !value)}
            className={`rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
              detailsOpen ? 'bg-gray-100 text-gray-800' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {detailsOpen ? 'Hide extra details' : 'Show extra details'}
          </button>

          {/* Right side: count */}
          <span className="ml-auto text-xs text-gray-500">
            {total > 0 ? `${rangeStart}–${rangeEnd} of ${total}` : 'No results'}
          </span>
        </div>

        {/* Expanded filters */}
        {filtersOpen && (
          <div className="flex flex-wrap items-end gap-3 border-t border-gray-100 px-4 py-3">
            <label className="text-xs text-gray-500">
              Account
              <select
                value={filters.bankAccountId}
                onChange={(e) => onFilterChange({ bankAccountId: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="">All</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{displayAccountName(a)}</option>)}
              </select>
            </label>

            <label className="text-xs text-gray-500">
              Direction
              <select
                value={filters.direction}
                onChange={(e) => onFilterChange({ direction: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="">All</option>
                <option value="INFLOW">Inflows</option>
                <option value="OUTFLOW">Outflows</option>
              </select>
            </label>

            <label className="text-xs text-gray-500">
              Source
              <select
                value={filters.sourceType}
                onChange={(e) => onFilterChange({ sourceType: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="">All</option>
                {Object.entries(SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>

            <label className="text-xs text-gray-500">
              From
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => onFilterChange({ dateFrom: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              />
            </label>

            <label className="text-xs text-gray-500">
              To
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => onFilterChange({ dateTo: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              />
            </label>
          </div>
        )}
      </div>

      {/* ── Transaction table ──────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="px-6 py-16 text-center text-sm text-gray-500">Loading transactions…</div>
        ) : transactions.length === 0 ? (
          <div className="px-6 py-16">
            <EmptyState title="No transactions found" body="Try widening the date range or clearing filters." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className={`w-full ${detailsOpen ? 'min-w-[1080px]' : 'min-w-[800px]'}`}>
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">Account</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">Category</th>
                  {detailsOpen && <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">Source</th>}
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">Description</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">Customer</th>
                  {detailsOpen && <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">Recorded by</th>}
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-gray-500">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 text-sm text-gray-600">{fmtDate(t.transactionDate)}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-800">{accountLabel(t.bankAccount)}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-600">{categoryLabel(t.category, categoryMap)}</td>
                    {detailsOpen && <td className="px-4 py-2.5 text-sm text-gray-500">{SOURCE_LABELS[t.sourceType] || t.sourceType}</td>}
                    <td className="px-4 py-2.5 text-sm text-gray-500 max-w-[240px] truncate" title={[t.description, t.reference].filter(Boolean).join(' · ') || '—'}>
                      {t.description || t.reference || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-500">{t.customer?.name || '—'}</td>
                    {detailsOpen && <td className="px-4 py-2.5 text-sm text-gray-500">{t.enteredBy?.firstName || '—'}</td>}
                    <td className={`px-4 py-2.5 text-right text-sm font-semibold ${DIRECTION_COLORS[t.direction]}`}>
                      {t.direction === 'INFLOW' ? '+' : '−'}{fmtMoney(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Pagination ──────────────────────────────────── */}
        {total > pageSize && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
            <p className="text-xs text-gray-500">
              Showing {rangeStart}–{rangeEnd} of {total}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="px-2 text-xs text-gray-500">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
