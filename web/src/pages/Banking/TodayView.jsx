import { ACCOUNT_STYLES, DIRECTION_COLORS, SOURCE_LABELS, fmtMoney, fmtDate, displayAccountName, accountLabel, categoryLabel } from './shared/constants';

export default function TodayView({ loading, accounts, imports, transactions, categoryMap, customerBookingQueue, portalTransferQueue, canViewReports, onNavigate }) {
  if (loading) {
    return <div className="rounded-2xl border border-gray-200 bg-white px-6 py-20 text-center text-sm text-gray-500">Loading…</div>;
  }

  /* ── Compute attention items ─────────────────────────── */
  const attentionItems = [];

  if (customerBookingQueue?.length > 0) {
    const total = customerBookingQueue.reduce((s, t) => s + Number(t.amount || 0), 0);
    attentionItems.push({
      key: 'bookings',
      color: 'amber',
      count: customerBookingQueue.length,
      title: `${customerBookingQueue.length} customer payment${customerBookingQueue.length === 1 ? '' : 's'} to allocate`,
      subtitle: total > 0 ? fmtMoney(total) + ' waiting' : 'Needs attention',
      action: () => onNavigate('customer-bookings'),
    });
  }

  if (portalTransferQueue?.length > 0) {
    attentionItems.push({
      key: 'transfers',
      color: 'blue',
      count: portalTransferQueue.length,
      title: `${portalTransferQueue.length} portal transfer${portalTransferQueue.length === 1 ? '' : 's'} to review`,
      subtitle: 'Approve or reject',
      action: () => onNavigate('portal-transfers'),
    });
  }

  const pendingImports = imports?.filter((i) => i.status !== 'POSTED') || [];
  if (pendingImports.length > 0) {
    attentionItems.push({
      key: 'imports',
      color: 'purple',
      count: pendingImports.length,
      title: `${pendingImports.length} statement${pendingImports.length === 1 ? '' : 's'} to review`,
      subtitle: 'Categorize and post',
      action: () => onNavigate('imports'),
    });
  }

  const unreconciledAccounts = accounts.filter((a) => !a.isVirtual && !a.latestReconciliation);
  if (canViewReports && unreconciledAccounts.length > 0) {
    attentionItems.push({
      key: 'reconcile',
      color: 'gray',
      count: unreconciledAccounts.length,
      title: `${unreconciledAccounts.length} account${unreconciledAccounts.length === 1 ? '' : 's'} never reconciled`,
      subtitle: 'Check your balances',
      action: () => onNavigate('balances'),
    });
  }

  const colorMap = {
    amber: 'border-amber-200 bg-amber-50 hover:bg-amber-100',
    blue: 'border-blue-200 bg-blue-50 hover:bg-blue-100',
    purple: 'border-purple-200 bg-purple-50 hover:bg-purple-100',
    gray: 'border-gray-200 bg-gray-50 hover:bg-gray-100',
  };
  const dotMap = {
    amber: 'bg-amber-500',
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    gray: 'bg-gray-400',
  };

  return (
    <div className="space-y-5">
      {/* ── Account balance cards ─────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {accounts.map((account) => {
          const recon = account.latestReconciliation;
          const acctNum = account.isVirtual ? null : account.lastFour;
          return (
            <div
              key={account.id}
              className={`group relative rounded-xl border p-4 transition-shadow hover:shadow-md ${ACCOUNT_STYLES[account.accountType] || 'border-gray-200 bg-white'}`}
            >
              {/* Status dot */}
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500 truncate">{displayAccountName(account)}</p>
                <span
                  className={`h-2 w-2 rounded-full ${recon ? 'bg-green-500' : 'bg-gray-300'}`}
                  title={recon ? `Reconciled ${fmtDate(recon.statementDate)}` : 'Not reconciled'}
                />
              </div>
              <p className="mt-2 text-2xl font-bold text-gray-900">{fmtMoney(account.systemBalance)}</p>
              <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-500">
                {acctNum && <span>····{acctNum}</span>}
                {recon ? (
                  <span>Reconciled {fmtDate(recon.statementDate)}</span>
                ) : (
                  <span className="text-gray-400">{account.isVirtual ? 'Virtual ledger' : 'Not reconciled'}</span>
                )}
              </div>
              <div className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-green-600">In {fmtMoney(account.totalInflows)}</span>
                  <span className="text-red-500">Out {fmtMoney(account.totalOutflows)}</span>
                </div>
                <p className="text-gray-500">{account.transactionCount} transactions</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Needs attention ───────────────────────────────── */}
      {attentionItems.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">Needs attention</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {attentionItems.map((item) => (
              <button
                key={item.key}
                onClick={item.action}
                className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-colors ${colorMap[item.color]}`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${dotMap[item.color]}`}>
                  {item.count}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                  <p className="text-xs text-gray-500">{item.subtitle}</p>
                </div>
                <svg className="ml-auto h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-6 text-center">
          <p className="text-sm font-medium text-green-800">All clear — nothing needs attention right now.</p>
        </div>
      )}

      {/* ── Recent activity ─────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Recent activity</h2>
            <p className="text-xs text-gray-500">Latest banking entries across all accounts.</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('transactions')}
            className="text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            Open transactions
          </button>
        </div>
        {!transactions || transactions.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">No recent banking activity yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">Account</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">Category</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">Source</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">Description</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-gray-500">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 8).map((transaction) => (
                  <tr key={transaction.id} className="border-b border-gray-50">
                    <td className="px-4 py-2.5 text-sm text-gray-600">{fmtDate(transaction.transactionDate)}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-800">{accountLabel(transaction.bankAccount)}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-600">{categoryLabel(transaction.category, categoryMap)}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-500">{SOURCE_LABELS[transaction.sourceType] || transaction.sourceType}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-500">{transaction.description || transaction.reference || '—'}</td>
                    <td className={`px-4 py-2.5 text-right text-sm font-semibold ${DIRECTION_COLORS[transaction.direction]}`}>
                      {transaction.direction === 'INFLOW' ? '+' : '−'}{fmtMoney(transaction.amount)}
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
