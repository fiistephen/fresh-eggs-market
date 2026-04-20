import { useState } from 'react';
import { api } from '../../lib/api';
import { waitingTimeInfo } from '../../lib/helpers';
import { fmtMoney, fmtDate } from './shared/constants';
import { PanelLoading, EmptyPanel, SummaryBanner, StatPill, StatusChip } from './shared/ui';

function decisionLabel(type) {
  if (type === 'APPROVED') return 'Approved';
  if (type === 'REJECTED') return 'Declined';
  if (type === 'MONEY_SEEN') return 'Money seen';
  return type;
}

export default function PortalTransferQueue({ loading, queue, history = [], onRefresh }) {
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
  if ((!queue || queue.length === 0) && history.length === 0) {
    return <EmptyPanel title="No portal transfers waiting" body="Transfer payments from the customer portal will show here until someone approves or rejects them." />;
  }

  return (
    <div className="space-y-4">
      {queue.length > 0 && (
        <SummaryBanner
          tone="warning"
          title={`${queue.length} portal transfer${queue.length === 1 ? '' : 's'} waiting for confirmation`}
          body="These portal orders hold crates. Approve the transfer to keep the hold, or reject it to release crates."
        />
      )}

      {error && <div className="rounded-lg border border-error-100 bg-error-50 px-4 py-3 text-body text-error-700">{error}</div>}

      {queue.length > 0 && (
        <div className="space-y-3">
          {queue.map((checkout) => {
            const wt = waitingTimeInfo(checkout.createdAt);
            return (
            <div key={checkout.id} className={`rounded-xl border bg-surface-0 p-5 ${wt.isOverdue ? 'border-error-200' : 'border-surface-200'}`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-title text-surface-900">{checkout.customer?.name || 'Customer'}</p>
                    <StatusChip label={checkout.checkoutType === 'BOOK_UPCOMING' ? 'Book upcoming' : 'Buy now'} tone="warning" />
                    <StatusChip label={wt.label + (wt.isOverdue ? ' — OVERDUE' : '')} tone={wt.isOverdue ? 'error' : 'default'} />
                  </div>
                  <p className="mt-1 text-body text-surface-500">
                    {checkout.customer?.phone || 'No phone'} · {checkout.batch?.name} · {checkout.batch?.eggTypeLabel}
                  </p>
                  <p className="mt-1 text-body text-surface-500">
                    Held on {fmtDate(checkout.createdAt, true)}
                    {checkout.paymentWindowEndsAt ? ` · window ends ${fmtDate(checkout.paymentWindowEndsAt, true)}` : ''}
                  </p>
                  {wt.isOverdue && (
                    <p className="mt-1 text-caption font-semibold text-error-700">
                      SOP: transfers should be confirmed within 1 hour during business hours
                    </p>
                  )}
                  <p className="mt-2 text-body text-surface-600">
                    {checkout.checkoutType === 'BOOK_UPCOMING'
                      ? 'Mark this as money seen to keep the booking hold. Final confirmation still happens when the bank statement line is linked. Reject it to return crates to available stock.'
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
                  {workingId === checkout.id ? 'Working…' : checkout.checkoutType === 'BOOK_UPCOMING' ? 'Confirm money seen' : 'Approve transfer'}
                </button>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {history.length > 0 && (
        <div className="rounded-xl border border-surface-200 bg-surface-0 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-title text-surface-900">Recent transfer decisions</h3>
              <p className="mt-1 text-body text-surface-500">These records stay after approval or decline, including which staff member took the action.</p>
            </div>
            <StatusChip label={`${history.length} recent`} tone="default" />
          </div>
          <div className="mt-4 space-y-3">
            {history.map((decision) => (
              <div key={decision.id} className="rounded-lg border border-surface-100 bg-surface-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-body-medium font-semibold text-surface-900">{decision.checkout?.customer?.name || 'Customer'}</p>
                      <StatusChip label={decisionLabel(decision.decisionType)} tone={decision.decisionType === 'REJECTED' ? 'error' : 'success'} />
                    </div>
                    <p className="mt-1 text-body text-surface-500">
                      {decision.checkout?.batch?.name} · {decision.checkout?.batch?.eggTypeLabel} · {fmtMoney(decision.checkout?.amountToPay || 0)}
                    </p>
                    <p className="mt-1 text-caption text-surface-500">
                      {decision.actor?.label || 'Unknown staff'} · {fmtDate(decision.createdAt, true)}
                    </p>
                    {decision.notes && (
                      <p className="mt-2 text-body text-surface-600">{decision.notes}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-caption text-surface-400">Reference</p>
                    <p className="text-body-medium text-surface-700">{decision.checkout?.reference || '—'}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
