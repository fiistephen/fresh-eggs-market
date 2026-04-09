import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { fmtMoney, fmtDate, displayAccountName } from '../shared/constants';
import { PanelLoading, EmptyPanel, SummaryBanner } from '../shared/ui';

export default function UnbookedDeposits() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/banking/unbooked-deposits').then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <PanelLoading label="Loading unbooked deposits…" />;
  if (!data || data.count === 0) {
    return <EmptyPanel title="No unbooked deposits" body="Every customer deposit is either booked already or there are no deposit transactions yet." />;
  }

  return (
    <div className="space-y-4">
      <SummaryBanner tone="warning" title={`${data.count} customer deposit${data.count !== 1 ? 's' : ''} still need booking action`} body={`${fmtMoney(data.total)} is sitting in deposits without a linked booking.`} />
      <div className="rounded-xl border border-surface-200 bg-surface-0 overflow-x-auto custom-scrollbar">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-surface-100">
              <th className="px-4 py-3 text-left text-overline text-surface-500">Date</th>
              <th className="px-4 py-3 text-left text-overline text-surface-500">Customer</th>
              <th className="px-4 py-3 text-left text-overline text-surface-500">Account</th>
              <th className="px-4 py-3 text-right text-overline text-surface-500">Amount</th>
              <th className="px-4 py-3 text-left text-overline text-surface-500">Entered by</th>
            </tr>
          </thead>
          <tbody>
            {data.deposits.map((d) => (
              <tr key={d.id} className="border-b border-surface-50">
                <td className="px-4 py-3 text-body text-surface-600">{fmtDate(d.transactionDate)}</td>
                <td className="px-4 py-3 text-body text-surface-800">{d.customer?.name || '—'}</td>
                <td className="px-4 py-3 text-body text-surface-500">{displayAccountName(d.bankAccount)}</td>
                <td className="px-4 py-3 text-right text-body-medium font-semibold text-success-600">{fmtMoney(d.amount)}</td>
                <td className="px-4 py-3 text-body text-surface-500">{d.enteredBy?.firstName || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
