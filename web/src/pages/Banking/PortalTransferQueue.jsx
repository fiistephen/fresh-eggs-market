import { useState } from 'react';
import { api } from '../../lib/api';
import { fmtMoney, fmtDate } from './shared/constants';
import { PanelLoading, EmptyPanel, SummaryBanner, StatPill, StatusChip } from './shared/ui';

export default function PortalTransferQueue({ loading, queue, onRefresh }) {
  const [workingId, setWorkingId] = useState('');
  const [error, setError] = useState('');

  async function approve(checkoutId) {
    setWorkingId(checkoutId); setError('');
    try { await api.post(`/portal/admin/transfer-checkouts/${checkoutId}/approve`, {}); onRefresh(); }
    catch (err) { setError(err.error || 'Failed to approve transfer'); }
    finally { setWorkingId(''); }
  }

  async function reject(checkoutId) {
    setWorkingId(checkoutId); setError('');
    try { await api.post(`/portal/admin/transfer-checkouts/${checkoutId}/reject`, {}); onRefresh(); }
    catch (err) { setError(err.error || 'Failed to reject transfer'); }
    finally { setWorkingId(''); }
  }

  if (loading) return <PanelLoading label="Loading portal transfer approvals…" />;
  if (!queue || queue.length === 0) {
    return <EmptyPanel title="No portal transfers waiting" body="Transfer payments from the customer portal will show here until someone approves or rejects them." />;
  }

  return (
    <div className="space-y-4">
      <SummaryBanner
        tone="warning"
        title={`${queue.length} portal transfer${queue.length === 1 ? '' : 's'} waiting for confirmation`}
        body="These portal orders hold crates. Approve the transfer to keep the hold, or reject it to release crates."
      />

      {error && <div className="rounded-lg border border-error-100 bg-error-50 px-4 py-3 text-body text-error-700">{error}</div>}

      <div className="space-y-3">
        {queue.map((checkout) => (
          <div key={checkout.id} className="rounded-xl border border-surface-200 bg-surface-0 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-title text-surface-900">{checkout.customer?.name || 'Customer'}</p>
                  <StatusChip label={checkout.checkoutType === 'BOOK_UPCOMING' ? 'Book upcoming' : 'Buy now'} tone="warning" />
                  <StatusChip label="Transfer waiting" tone="default" />
                </div>
                <p className="mt-1 text-body text-surface-500">
                  {checkout.customer?.phone || 'No phone'} · {checkout.batch?.name} · {checkout.batch?.eggTypeLabel}
                </p>
                <p className="mt-1 text-body text-surface-500">
                  Held on {fmtDate(checkout.createdAt, true)}
                  {checkout.paymentWindowEndsAt ? ` · window ends ${fmtDate(checkout.paymentWindowEndsAt, true)}` : ''}
                </p>
                <p className="mt-2 text-body text-surface-600">
                  {checkout.checkoutType === 'BOOK_UPCOMING'
                    ? 'Approve this transfer to confirm the booking. Reject it to return crates to available stock.'
                    : 'Approve this transfer to make the order ready for pickup. Reject it to release crates.'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-body lg:min-w-[360px]">
                <StatPill label="Crates held" value={checkout.quantity} />
                <StatPill label="Amount to confirm" value={fmtMoney(checkout.amountToPay)} />
                <StatPill label="Order value" value={fmtMoney(checkout.orderValue)} />
                <StatPill label="Balance after" value={fmtMoney(checkout.balanceAfterPayment)} danger={Number(checkout.balanceAfterPayment) > 0.009} />
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => reject(checkout.id)} disabled={workingId === checkout.id} className="rounded-md border border-error-100 px-4 py-2 text-body-medium font-medium text-error-700 transition-colors duration-fast hover:bg-error-50 disabled:opacity-50">
                {workingId === checkout.id ? 'Working…' : 'Reject transfer'}
              </button>
              <button type="button" onClick={() => approve(checkout.id)} disabled={workingId === checkout.id} className="rounded-md bg-brand-600 px-4 py-2 text-body-medium font-medium text-surface-0 transition-colors duration-fast hover:bg-brand-700 disabled:opacity-50">
                {workingId === checkout.id ? 'Working…' : 'Approve transfer'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}