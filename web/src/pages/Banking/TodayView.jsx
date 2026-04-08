import { ACCOUNT_STYLES, RECONCILIATION_STYLES, DIRECTION_COLORS, SOURCE_LABELS, fmtMoney, fmtDate, accountLabel, displayAccountName, accountPurpose, categoryLabel } from './shared/constants';
import { EmptyState, StatPill } from './shared/ui';

export default function TodayView({ loading, accounts, imports, reconciliations, transactions, categoryMap, canViewReports, bookingQueueCount, onOpenImport, onNavigate }) {
  if (loading) {
    return <div className="rounded-2xl border border-gray-200 bg-white px-6 py-20 text-center text-sm text-gray-500">Loading banking overview…</div>;
  }

  return (
    <div className="space-y-6">
      {/* Booking queue alert */}
      {bookingQueueCount > 0 && (
        <button
          type="button"
          onClick={() => onNavigate('customer-bookings')}
          className="w-full rounded-2xl border border-amber-300 bg-amber-50 p-4 text-left transition-colors hover:bg-amber-100"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-900">
                {bookingQueueCount} customer payment{bookingQueueCount === 1 ? '' : 's'} waiting to be linked to bookings
              </p>
              <p className="mt-1 text-sm text-amber-800/80">Click here to open the Bookings Queue and allocate the money.</p>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-200 text-sm font-bold text-amber-900">{bookingQueueCount}</span>
          </div>
        </button>
      )}

      {/* How to use */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <h2 className="text-sm font-semibold text-blue-900">How to use this page</h2>
        <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-blue-900 lg:grid-cols-3">
          <p><span className="font-semibold">1.</span> Record money received. If it is cash, record it in <span className="font-semibold">Cash Account</span>.</p>
          <p><span className="font-semibold">2.</span> When cash is deposited in the bank, use <span className="font-semibold">Move money</span> from Cash Account to Customer Deposit Account.</p>
          <p><span className="font-semibold">3.</span> Import the bank statement and reconcile the balance to make sure records match the bank.</p>
        </div>
      </div>

      {/* Account cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {accounts.map((account) => {
          const latest = account.latestReconciliation;
          return (
            <div key={account.id} className={`rounded-2xl border bg-gradient-to-br p-4 ${ACCOUNT_STYLES[account.accountType] || 'from-gray-50 to-white border-gray-200'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">{account.accountType.replaceAll('_', ' ')}</p>
                  <h3 className="mt-1 text-lg font-semibold text-gray-900">{displayAccountName(account)}</h3>
                  <p className="mt-1 text-xs text-gray-500">
                    {account.isVirtual ? 'Virtual ledger' : `${account.bankName} • ••••${account.lastFour}`}
                  </p>
                  <p className="mt-2 max-w-xs text-xs text-gray-600">{accountPurpose(account.accountType)}</p>
                </div>
                <div className="flex flex-col gap-1 text-right">
                  {!account.supportsStatementImport && (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-700">No statement import</span>
                  )}
                  {latest && (
                    <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${RECONCILIATION_STYLES[latest.status] || 'bg-gray-100 text-gray-600'}`}>
                      {latest.status.toLowerCase()}
                    </span>
                  )}
                </div>
              </div>

              <p className="mt-6 text-3xl font-bold text-gray-900">{fmtMoney(account.systemBalance)}</p>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-green-700">In {fmtMoney(account.totalInflows)}</span>
                <span className="text-red-600">Out {fmtMoney(account.totalOutflows)}</span>
              </div>
              <div className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
                <div className="flex items-center justify-between">
                  <span>{account.transactionCount} transaction{account.transactionCount !== 1 ? 's' : ''}</span>
                  <span>{latest ? `Reconciled ${fmtDate(latest.statementDate)}` : 'Not reconciled yet'}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent entries + sidebar */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent entries</h2>
            <p className="text-sm text-gray-500">Latest transactions across all accounts.</p>
          </div>
          {transactions.length === 0 ? (
            <EmptyState title="No entries yet" body="When you add an entry, move money, or import a statement, it will show here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Account</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Category</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Source</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Description</th>
                    <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={t.id} className="border-b border-gray-50">
                      <td className="px-3 py-3 text-sm text-gray-600">{fmtDate(t.transactionDate)}</td>
                      <td className="px-3 py-3 text-sm text-gray-800">{accountLabel(t.bankAccount)}</td>
                      <td className="px-3 py-3 text-sm text-gray-600">{categoryLabel(t.category, categoryMap)}</td>
                      <td className="px-3 py-3 text-sm text-gray-500">{SOURCE_LABELS[t.sourceType] || t.sourceType}</td>
                      <td className="px-3 py-3 text-sm text-gray-500">{t.description || t.reference || '—'}</td>
                      <td className={`px-3 py-3 text-right text-sm font-semibold ${DIRECTION_COLORS[t.direction]}`}>
                        {t.direction === 'INFLOW' ? '+' : '-'}{fmtMoney(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* Bank statements */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-gray-900">Bank statements</h2>
            <p className="mt-1 text-sm text-gray-500">Import, review, then post.</p>
            {imports.length === 0 ? (
              <EmptyState title="No bank statements yet" body="Import a Providus statement to review before posting." compact />
            ) : (
              <div className="mt-4 space-y-3">
                {imports.slice(0, 4).map((rec) => (
                  <button key={rec.id} onClick={() => onOpenImport(rec.id)} className="w-full rounded-xl border border-gray-200 p-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{rec.originalFilename}</p>
                        <p className="mt-1 text-xs text-gray-500">{displayAccountName(rec.bankAccount)} · {fmtDate(rec.statementDateFrom)} to {fmtDate(rec.statementDateTo)}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${RECONCILIATION_STYLES[rec.status === 'POSTED' ? 'BALANCED' : rec.status === 'PARTIALLY_POSTED' ? 'OPEN' : 'VARIANCE']}`}>
                        {rec.status.replaceAll('_', ' ').toLowerCase()}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                      <span>{rec.parsedRowCount} parsed</span>
                      <span>{rec.postedRowCount} posted</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Latest reconciliations */}
          {canViewReports && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <h2 className="text-lg font-semibold text-gray-900">Latest reconciliations</h2>
              <p className="mt-1 text-sm text-gray-500">Check whether records match the bank balance.</p>
              {reconciliations.length === 0 ? (
                <EmptyState title="No balance checks yet" body="Create one from a bank statement or type the balance manually." compact />
              ) : (
                <div className="mt-4 space-y-3">
                  {reconciliations.slice(0, 4).map((r) => (
                    <div key={r.id} className="rounded-xl border border-gray-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{displayAccountName(r.bankAccount)}</p>
                          <p className="mt-1 text-xs text-gray-500">Statement date {fmtDate(r.statementDate)}</p>
                        </div>
                        <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${RECONCILIATION_STYLES[r.status] || 'bg-gray-100 text-gray-600'}`}>
                          {r.status.toLowerCase()}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <StatPill label="Statement" value={fmtMoney(r.closingBalance)} />
                        <StatPill label="System" value={fmtMoney(r.systemBalance)} />
                        <StatPill label="Variance" value={fmtMoney(r.variance)} danger={Math.abs(r.variance) > 0.009} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
