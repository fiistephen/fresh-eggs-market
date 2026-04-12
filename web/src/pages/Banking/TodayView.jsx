import { ACCOUNT_STYLES, DIRECTION_COLORS, SOURCE_LABELS, fmtMoney, fmtDate, displayAccountName, accountLabel, categoryLabel } from './shared/constants';

export default function TodayView({ loading, accounts, imports, transactions, categoryMap, customerBookingQueue, portalTransferQueue, cashDeposits, approvalRequests, canViewReports, onNavigate, onOpenBookings, onOpenReport }) {
  if (loading) {
    return <div className="rounded-lg border border-surface-200 bg-surface-0 px-6 py-20 text-center text-sm text-surface-500">Loading…</div>;
  }

  const attentionItems = [];

  if (customerBookingQueue?.length > 0) {
    const total = customerBookingQueue.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
    attentionItems.push({
      key: 'bookings',
      color: 'warning',
      count: customerBookingQueue.length,
      title: `${customerBookingQueue.length} customer deposit${customerBookingQueue.length === 1 ? '' : 's'} waiting in bookings`,
      subtitle: total > 0 ? `${fmtMoney(total)} waiting to match` : 'Open Bookings to allocate',
      action: () => onOpenBookings?.(),
    });
  }

  if (portalTransferQueue?.length > 0) {
    attentionItems.push({
      key: 'transfers',
      color: 'info',
      count: portalTransferQueue.length,
      title: `${portalTransferQueue.length} portal transfer${portalTransferQueue.length === 1 ? '' : 's'} waiting in bookings`,
      subtitle: 'Open Bookings to confirm or decline',
      action: () => onOpenBookings?.(),
    });
  }

  const undepositedCashCount = Number(cashDeposits?.undepositedCash?.count || 0);
  const undepositedCashTotal = Number(cashDeposits?.undepositedCash?.total || 0);
  if (undepositedCashCount > 0) {
    attentionItems.push({
      key: 'undeposited-cash',
      color: 'warning',
      count: undepositedCashCount,
      title: `${undepositedCashCount} cash sale${undepositedCashCount === 1 ? '' : 's'} not yet deposited`,
      subtitle: `${fmtMoney(undepositedCashTotal)} still in Cash Account`,
      action: () => onNavigate('cash-deposits'),
    });
  }

  const pendingCashDepositCount = Number(cashDeposits?.pendingDeposits?.count || 0);
  const pendingCashDepositTotal = Number(cashDeposits?.pendingDeposits?.total || 0);
  if (pendingCashDepositCount > 0) {
    attentionItems.push({
      key: 'pending-cash-confirmation',
      color: 'brand',
      count: pendingCashDepositCount,
      title: `${pendingCashDepositCount} cash deposit${pendingCashDepositCount === 1 ? '' : 's'} waiting for bank confirmation`,
      subtitle: `${fmtMoney(pendingCashDepositTotal)} still needs a matching bank line`,
      action: () => onNavigate('cash-deposits'),
    });
  }

  const pendingApprovalCount = (approvalRequests || []).filter((request) => request.status === 'PENDING').length;
  if (pendingApprovalCount > 0) {
    attentionItems.push({
      key: 'approvals',
      color: 'warning',
      count: pendingApprovalCount,
      title: `${pendingApprovalCount} approval request${pendingApprovalCount === 1 ? '' : 's'} waiting`,
      subtitle: 'Review Banking edits and deletes',
      action: () => onNavigate('approvals'),
    });
  }

  const pendingImports = imports?.filter((entry) => entry.status !== 'POSTED') || [];
  if (pendingImports.length > 0) {
    attentionItems.push({
      key: 'imports',
      color: 'brand',
      count: pendingImports.length,
      title: `${pendingImports.length} statement${pendingImports.length === 1 ? '' : 's'} to review`,
      subtitle: 'Categorize and post',
      action: () => onNavigate('imports'),
    });
  }

  const unreconciledAccounts = accounts.filter((account) => !account.isVirtual && !account.latestReconciliation);
  if (canViewReports && unreconciledAccounts.length > 0) {
    attentionItems.push({
      key: 'reconcile',
      color: 'surface',
      count: unreconciledAccounts.length,
      title: `${unreconciledAccounts.length} account${unreconciledAccounts.length === 1 ? '' : 's'} never reconciled`,
      subtitle: 'Check your balances',
      action: () => onOpenReport?.('balances'),
    });
  }

  const colorMap = {
    warning: 'border-warning-200 bg-warning-50 hover:bg-warning-100',
    info: 'border-info-200 bg-info-50 hover:bg-info-100',
    brand: 'border-brand-200 bg-brand-50 hover:bg-brand-100',
    surface: 'border-surface-200 bg-surface-50 hover:bg-surface-100',
  };
  const dotMap = {
    warning: 'bg-warning-500',
    info: 'bg-info-500',
    brand: 'bg-brand-500',
    surface: 'bg-surface-400',
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {accounts.map((account) => {
          const recon = account.latestReconciliation;
          const acctNum = account.isVirtual ? null : account.lastFour;
          return (
            <div
              key={account.id}
              className={`group relative rounded-lg border p-4 transition-shadow duration-fast hover:shadow-md ${ACCOUNT_STYLES[account.accountType] || 'border-surface-200 bg-surface-0'}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-surface-500 truncate">{displayAccountName(account)}</p>
                <span
                  className={`h-2 w-2 rounded-full ${recon ? 'bg-success-500' : 'bg-surface-300'}`}
                  title={recon ? `Reconciled ${fmtDate(recon.statementDate)}` : 'Not reconciled'}
                />
              </div>
              <p className="mt-2 text-2xl font-bold text-surface-900">{fmtMoney(account.systemBalance)}</p>
              <div className="mt-2 flex items-center gap-3 text-[11px] text-surface-500">
                {acctNum && <span>····{acctNum}</span>}
                {recon ? (
                  <span>Reconciled {fmtDate(recon.statementDate)}</span>
                ) : (
                  <span className="text-surface-400">{account.isVirtual ? 'Virtual ledger' : 'Not reconciled'}</span>
                )}
              </div>
              <div className="mt-3 space-y-1 border-t border-surface-100 pt-3 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-success-600">In {fmtMoney(account.totalInflows)}</span>
                  <span className="text-error-500">Out {fmtMoney(account.totalOutflows)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {attentionItems.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-heading text-surface-700">Needs attention</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {attentionItems.map((item) => (
              <button
                key={item.key}
                onClick={item.action}
                className={`flex items-center gap-3 rounded-lg border p-3.5 text-left transition-colors duration-fast ${colorMap[item.color]}`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${dotMap[item.color]}`}>
                  {item.count}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-surface-900 truncate">{item.title}</p>
                  <p className="text-xs text-surface-500">{item.subtitle}</p>
                </div>
                <svg className="ml-auto h-4 w-4 shrink-0 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-success-200 bg-success-50 px-4 py-6 text-center shadow-xs">
          <p className="text-sm font-medium text-success-800">All clear — nothing needs attention right now.</p>
        </div>
      )}

      <div className="rounded-lg border border-surface-200 bg-surface-0 shadow-sm">
        <div className="flex items-center justify-between border-b border-surface-100 px-4 py-3">
          <div>
            <h2 className="text-heading text-surface-900">Recent activity</h2>
            <p className="text-xs text-surface-500">Latest banking entries across all accounts.</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('transactions')}
            className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors duration-fast"
          >
            Open transactions
          </button>
        </div>
        {!transactions || transactions.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-surface-500">No recent banking activity yet.</div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-surface-500">Date</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-surface-500">Account</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-surface-500">Category</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-surface-500">Source</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-surface-500">Description</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-surface-500">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 8).map((transaction) => (
                  <tr key={transaction.id} className="border-b border-surface-50 hover:bg-surface-50 transition-colors duration-fast">
                    <td className="px-4 py-2.5 text-sm text-surface-600">{fmtDate(transaction.transactionDate)}</td>
                    <td className="px-4 py-2.5 text-sm text-surface-800">{accountLabel(transaction.bankAccount)}</td>
                    <td className="px-4 py-2.5 text-sm text-surface-600">{categoryLabel(transaction.category, categoryMap)}</td>
                    <td className="px-4 py-2.5 text-sm text-surface-500">{SOURCE_LABELS[transaction.sourceType] || transaction.sourceType}</td>
                    <td className="px-4 py-2.5 text-sm text-surface-500">{transaction.description || transaction.reference || '—'}</td>
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
