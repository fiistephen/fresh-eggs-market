import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { categoryLabel, fmtMoney, fmtDate, displayAccountName } from '../shared/constants';
import { FilterField, PanelLoading, EmptyPanel, SummaryBanner } from '../shared/ui';

export default function Expenses({ categoryMap }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    api.get(`/banking/expenses${suffix}`).then(setData).finally(() => setLoading(false));
  }, [dateFrom, dateTo]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-surface-200 bg-surface-0 p-5">
        <div className="flex flex-wrap gap-3">
          <FilterField label="From">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500" />
          </FilterField>
          <FilterField label="To">
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500" />
          </FilterField>
        </div>
      </div>

      {loading ? (
        <PanelLoading label="Loading expenses…" />
      ) : !data || data.count === 0 ? (
        <EmptyPanel title="No expenses found" body="Try widening the date range or record expense outflows first." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {Object.entries(data.byCategory || {}).map(([cat, info]) => (
              <div key={cat} className="rounded-xl border border-surface-200 bg-surface-0 p-4">
                <p className="text-overline text-surface-500">{categoryLabel(cat, categoryMap)}</p>
                <p className="mt-2 text-metric-lg font-bold text-error-600">{fmtMoney(info.total)}</p>
                <p className="mt-1 text-caption text-surface-500">{info.count} transaction{info.count !== 1 ? 's' : ''}</p>
              </div>
            ))}
          </div>
          <SummaryBanner tone="error" title="Expense total" body={`${fmtMoney(data.total)} across ${data.count} outflow transaction${data.count !== 1 ? 's' : ''}.`} />
          <div className="rounded-xl border border-surface-200 bg-surface-0 overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[780px]">
              <thead>
                <tr className="border-b border-surface-100">
                  <th className="px-4 py-3 text-left text-overline text-surface-500">Date</th>
                  <th className="px-4 py-3 text-left text-overline text-surface-500">Category</th>
                  <th className="px-4 py-3 text-left text-overline text-surface-500">Description</th>
                  <th className="px-4 py-3 text-left text-overline text-surface-500">Account</th>
                  <th className="px-4 py-3 text-right text-overline text-surface-500">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.expenses.map((e) => (
                  <tr key={e.id} className="border-b border-surface-50">
                    <td className="px-4 py-3 text-body text-surface-600">{fmtDate(e.transactionDate)}</td>
                    <td className="px-4 py-3 text-body text-surface-700">{categoryLabel(e.category, categoryMap)}</td>
                    <td className="px-4 py-3 text-body text-surface-500">{e.description || e.reference || '—'}</td>
                    <td className="px-4 py-3 text-body text-surface-500">{displayAccountName(e.bankAccount)}</td>
                    <td className="px-4 py-3 text-right text-body-medium font-semibold text-error-600">{fmtMoney(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
