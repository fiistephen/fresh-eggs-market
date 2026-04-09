import { fmtDate, fmtMoney } from './shared/constants';
import { EmptyState } from './shared/ui';

function staffName(user) {
  if (!user) return '—';
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || '—';
}

function severityTone(isOverdue) {
  return isOverdue
    ? 'border-error-200 bg-error-50 text-error-700'
    : 'border-warning-200 bg-warning-50 text-warning-700';
}

export default function CashDepositsView({ loading, data, onMoveMoney, onOpenStatements, onRefresh }) {
  const undepositedCash = data?.undepositedCash || { count: 0, total: 0, thresholdHours: 24, transactions: [] };
  const pendingDeposits = data?.pendingDeposits || { count: 0, total: 0, thresholdHours: 24, batches: [] };
  const confirmedRecently = data?.confirmedRecently || [];

  if (loading) {
    return <div className="rounded-lg border border-surface-200 bg-surface-0 px-6 py-20 text-center text-sm text-surface-500">Loading cash deposits…</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-surface-200 bg-surface-0 px-5 py-4">
        <div>
          <h2 className="text-heading text-surface-900">Cash deposits</h2>
          <p className="mt-1 text-body text-surface-500">
            Track cash already collected in store, money moved to the bank, and statement confirmation of each deposit.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onMoveMoney}
            className="rounded-lg bg-brand-500 px-4 py-2 text-body font-medium text-surface-900 transition-colors duration-fast hover:bg-brand-400"
          >
            Create deposit from cash
          </button>
          <button
            type="button"
            onClick={onOpenStatements}
            className="rounded-lg border border-surface-300 px-4 py-2 text-body font-medium text-surface-700 transition-colors duration-fast hover:bg-surface-50"
          >
            Open statements
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg border border-surface-300 px-4 py-2 text-body font-medium text-surface-700 transition-colors duration-fast hover:bg-surface-50"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-warning-200 bg-warning-50 p-4">
          <p className="text-caption uppercase tracking-wide text-warning-700">Undeposited cash</p>
          <p className="mt-2 text-2xl font-bold text-surface-900">{fmtMoney(undepositedCash.total)}</p>
          <p className="mt-1 text-body text-surface-600">{undepositedCash.count} cash sale{undepositedCash.count === 1 ? '' : 's'} older than {undepositedCash.thresholdHours} hours</p>
        </div>
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-4">
          <p className="text-caption uppercase tracking-wide text-brand-700">Pending confirmation</p>
          <p className="mt-2 text-2xl font-bold text-surface-900">{fmtMoney(pendingDeposits.total)}</p>
          <p className="mt-1 text-body text-surface-600">{pendingDeposits.count} deposit batch{pendingDeposits.count === 1 ? '' : 'es'} waiting for bank statement confirmation</p>
        </div>
        <div className="rounded-lg border border-success-200 bg-success-50 p-4">
          <p className="text-caption uppercase tracking-wide text-success-700">Confirmed recently</p>
          <p className="mt-2 text-2xl font-bold text-surface-900">{confirmedRecently.length}</p>
          <p className="mt-1 text-body text-surface-600">Recently matched cash deposits with completed bank confirmation</p>
        </div>
      </div>

      <section className="rounded-lg border border-surface-200 bg-surface-0">
        <div className="border-b border-surface-100 px-5 py-4">
          <h3 className="text-body-medium font-semibold text-surface-900">Undeposited cash</h3>
          <p className="mt-1 text-body text-surface-500">
            These cash sale amounts are still sitting in Cash Account and have not yet been moved into a pending bank deposit batch.
          </p>
        </div>
        {undepositedCash.transactions.length === 0 ? (
          <div className="px-6 py-12">
            <EmptyState title="No overdue undeposited cash" body="All older cash sales are already included in a pending or confirmed bank deposit flow." />
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-surface-500">Date</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-surface-500">Receipt</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-surface-500">Customer</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-surface-500">Description</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-surface-500">Still in cash</th>
                </tr>
              </thead>
              <tbody>
                {undepositedCash.transactions.map((entry) => (
                  <tr key={entry.id} className="border-b border-surface-50">
                    <td className="px-4 py-3 text-body text-surface-600">{fmtDate(entry.transactionDate, true)}</td>
                    <td className="px-4 py-3 text-body text-surface-700">{entry.sale?.receiptNumber || '—'}</td>
                    <td className="px-4 py-3 text-body text-surface-700">{entry.customer?.name || 'Walk-in customer'}</td>
                    <td className="px-4 py-3 text-body text-surface-500">{entry.description || entry.reference || 'Cash sale'}</td>
                    <td className="px-4 py-3 text-right text-body-medium font-semibold text-warning-700">{fmtMoney(entry.availableAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-surface-200 bg-surface-0">
        <div className="border-b border-surface-100 px-5 py-4">
          <h3 className="text-body-medium font-semibold text-surface-900">Pending confirmation</h3>
          <p className="mt-1 text-body text-surface-500">
            These deposits were recorded from Cash Account into the bank flow, but the bank statement has not confirmed them yet.
          </p>
        </div>
        {pendingDeposits.batches.length === 0 ? (
          <div className="px-6 py-12">
            <EmptyState title="No pending cash deposits" body="Any cash already sent to the bank has either been confirmed or there are no cash deposit batches yet." />
          </div>
        ) : (
          <div className="space-y-3 px-5 py-4">
            {pendingDeposits.batches.map((batch) => (
              <div key={batch.id} className={`rounded-lg border p-4 ${severityTone(batch.isOverdue)}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-body-medium font-semibold text-surface-900">{fmtMoney(batch.amount)}</p>
                    <p className="mt-1 text-body text-surface-600">
                      Deposited on {fmtDate(batch.depositDate, true)} by {staffName(batch.createdBy)}
                    </p>
                    <p className="mt-1 text-caption text-surface-500">
                      {batch.transactions.length} cash sale transaction{batch.transactions.length === 1 ? '' : 's'} included
                    </p>
                  </div>
                  <div className={`rounded-full border px-3 py-1 text-caption-medium font-medium ${severityTone(batch.isOverdue)}`}>
                    {batch.isOverdue ? 'Overdue' : 'Waiting for confirmation'}
                  </div>
                </div>
                {batch.notes && <p className="mt-3 text-body text-surface-600">{batch.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-surface-200 bg-surface-0">
        <div className="border-b border-surface-100 px-5 py-4">
          <h3 className="text-body-medium font-semibold text-surface-900">Confirmed recently</h3>
          <p className="mt-1 text-body text-surface-500">
            Recently matched bank statement confirmations for cash deposits moved out of Cash Account.
          </p>
        </div>
        {confirmedRecently.length === 0 ? (
          <div className="px-6 py-12">
            <EmptyState title="No confirmed cash deposits yet" body="Once a bank statement inflow confirms a pending cash deposit, it will appear here." />
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-surface-500">Confirmed at</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-surface-500">Deposit date</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-surface-500">Staff</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-surface-500">Statement line</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-surface-500">Amount</th>
                </tr>
              </thead>
              <tbody>
                {confirmedRecently.map((batch) => (
                  <tr key={batch.id} className="border-b border-surface-50">
                    <td className="px-4 py-3 text-body text-surface-600">{fmtDate(batch.confirmedAt, true)}</td>
                    <td className="px-4 py-3 text-body text-surface-600">{fmtDate(batch.depositDate, true)}</td>
                    <td className="px-4 py-3 text-body text-surface-700">{staffName(batch.confirmedBy || batch.createdBy)}</td>
                    <td className="px-4 py-3 text-body text-surface-500">{batch.confirmationStatementLine?.notes || batch.confirmationStatementLine?.description || 'Statement confirmation'}</td>
                    <td className="px-4 py-3 text-right text-body-medium font-semibold text-success-700">{fmtMoney(batch.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
