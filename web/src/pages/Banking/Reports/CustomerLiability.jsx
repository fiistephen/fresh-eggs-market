import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { fmtMoney, fmtDate } from '../shared/constants';
import { PanelLoading, EmptyPanel, SummaryBanner } from '../shared/ui';

export default function CustomerLiability() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/banking/customer-liability').then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <PanelLoading label="Loading customer liability…" />;
  if (!data || data.count === 0) {
    return <EmptyPanel title="No outstanding customer liability" body="There are no confirmed bookings holding customer money at the moment." />;
  }

  return (
    <div className="space-y-4">
      <SummaryBanner tone="orange" title={`${data.count} confirmed booking${data.count !== 1 ? 's' : ''} still carry liability`} body={`${fmtMoney(data.totalLiability)} is owed in goods to booked customers.`} />
      <div className="rounded-2xl border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Customer</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Batch</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Qty</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Amount paid</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Booked on</th>
            </tr>
          </thead>
          <tbody>
            {data.bookings.map((b) => (
              <tr key={b.id} className="border-b border-gray-50">
                <td className="px-4 py-3 text-sm text-gray-800">{b.customer}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{b.batch}</td>
                <td className="px-4 py-3 text-right text-sm">{b.quantity}</td>
                <td className="px-4 py-3 text-right text-sm font-semibold text-orange-600">{fmtMoney(b.amountPaid)}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(b.bookedOn)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
