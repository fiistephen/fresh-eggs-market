import { RECONCILIATION_STYLES, fmtMoney, fmtDate, displayAccountName } from '../shared/constants';
import { EmptyState } from '../shared/ui';

export default function AccountBalances({ accounts, reconciliations, loading }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {accounts.map((account) => (
          <div key={account.id} className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">{account.accountType.replaceAll('_', ' ')}</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{displayAccountName(account)}</p>
              </div>
              {account.latestReconciliation && (
                <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${RECONCILIATION_STYLES[account.latestReconciliation.status] || 'bg-gray-100 text-gray-600'}`}>
                  {account.latestReconciliation.status.toLowerCase()}
                </span>
              )}
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">System balance</span>
                <span className="font-semibold text-gray-900">{fmtMoney(account.systemBalance)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Latest statement</span>
                <span className="text-gray-700">{account.latestReconciliation ? fmtMoney(account.latestReconciliation.closingBalance) : '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Variance</span>
                <span className={`${account.latestReconciliation && Math.abs(account.latestReconciliation.variance) > 0.009 ? 'text-red-600' : 'text-gray-700'}`}>
                  {account.latestReconciliation ? fmtMoney(account.latestReconciliation.variance) : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Transactions</span>
                <span className="text-gray-700">{account.transactionCount}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-6 py-5">
          <h2 className="text-lg font-semibold text-gray-900">Reconciliation history</h2>
          <p className="text-sm text-gray-500">Every reconciliation stores statement balance, system balance, and the remaining variance.</p>
        </div>
        {loading ? (
          <div className="px-6 py-24 text-center text-sm text-gray-500">Loading reconciliations…</div>
        ) : reconciliations.length === 0 ? (
          <div className="px-6 py-24">
            <EmptyState title="No reconciliations yet" body="Create one from a statement import or enter a statement balance manually." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Account</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Statement</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">System</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Variance</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">By</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {reconciliations.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600">{fmtDate(r.statementDate)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">{displayAccountName(r.bankAccount)}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-800">{fmtMoney(r.closingBalance)}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-800">{fmtMoney(r.systemBalance)}</td>
                    <td className={`px-4 py-3 text-right text-sm font-semibold ${Math.abs(r.variance) > 0.009 ? 'text-red-600' : 'text-green-600'}`}>
                      {fmtMoney(r.variance)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{r.statementImport?.originalFilename || 'Manual'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{r.reconciledBy?.firstName || '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${RECONCILIATION_STYLES[r.status] || 'bg-gray-100 text-gray-600'}`}>
                        {r.status.toLowerCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
