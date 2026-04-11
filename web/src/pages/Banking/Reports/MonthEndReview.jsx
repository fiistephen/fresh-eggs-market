import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { fmtMoney, fmtDate, displayAccountName, RECONCILIATION_STYLES } from '../shared/constants';
import { EmptyPanel, PanelLoading, SummaryBanner, StatusChip } from '../shared/ui';

function toneForCount(count, amount = 0) {
  return count > 0 || amount > 0 ? 'warning' : 'default';
}

function StatCard({ label, value, subtext, tone = 'default' }) {
  const tones = {
    default: 'border-surface-200 bg-surface-0',
    warning: 'border-warning-200 bg-warning-50',
    error: 'border-error-200 bg-error-50',
    brand: 'border-brand-200 bg-brand-50',
  };

  return (
    <div className={`rounded-xl border p-4 ${tones[tone] || tones.default}`}>
      <p className="text-overline text-surface-500">{label}</p>
      <p className="mt-2 text-title font-semibold text-surface-900">{value}</p>
      {subtext ? <p className="mt-1 text-body text-surface-500">{subtext}</p> : null}
    </div>
  );
}

function SectionCard({ title, subtitle, children }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-surface-0">
      <div className="border-b border-surface-100 px-5 py-4">
        <h3 className="text-title text-surface-900">{title}</h3>
        {subtitle ? <p className="mt-1 text-body text-surface-500">{subtitle}</p> : null}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function EmptyMini({ title }) {
  return <div className="rounded-lg bg-surface-50 px-4 py-8 text-center text-body text-surface-500">{title}</div>;
}

export default function MonthEndReview() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get(`/banking/month-end-review?month=${month}`)
      .then((response) => {
        if (alive) setData(response);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [month]);

  const summary = useMemo(() => {
    if (!data) {
      return {
        unresolvedCount: 0,
        unresolvedAmount: 0,
      };
    }

    const unresolvedCount =
      Number(data.unresolved?.hangingDeposits?.count || 0)
      + Number(data.unresolved?.pendingTransferConfirmations?.count || 0)
      + Number(data.unresolved?.undepositedCash?.count || 0)
      + Number(data.unresolved?.pendingCashDeposits?.count || 0)
      + Number(data.unresolved?.pendingApprovals?.count || 0)
      + Number(data.accountsMissingMonthEndBalance || 0);

    const unresolvedAmount =
      Number(data.unresolved?.hangingDeposits?.total || 0)
      + Number(data.unresolved?.pendingTransferConfirmations?.total || 0)
      + Number(data.unresolved?.undepositedCash?.total || 0)
      + Number(data.unresolved?.pendingCashDeposits?.total || 0);

    return { unresolvedCount, unresolvedAmount };
  }, [data]);

  if (loading) return <PanelLoading label="Loading month-end review…" />;
  if (!data) return <EmptyPanel title="Month-end review unavailable" body="We could not load the month-end review right now." />;

  const accounts = data.accounts || [];
  const unresolved = data.unresolved || {};

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-title text-surface-900">Month-end review</h2>
          <p className="mt-1 text-body text-surface-500">
            Review balances and unresolved items before the manager closes {data.label}. Long-hanging customer deposits can stay open; the goal here is visibility.
          </p>
        </div>
        <div>
          <label className="mb-2 block text-overline text-surface-500">Review month</label>
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="rounded-lg border border-surface-300 bg-surface-0 px-3 py-2 text-body text-surface-800"
          />
        </div>
      </div>

      <SummaryBanner
        tone={summary.unresolvedCount > 0 ? 'warning' : 'brand'}
        title={summary.unresolvedCount > 0
          ? `${summary.unresolvedCount} review item${summary.unresolvedCount !== 1 ? 's' : ''} still need attention for ${data.label}`
          : `${data.label} looks ready for manager close review`}
        body={summary.unresolvedCount > 0
          ? `${fmtMoney(summary.unresolvedAmount)} is tied up across unresolved deposits, transfer confirmations, or undeposited cash.`
          : 'Balances and operational exceptions for this month are clear from the current data.'}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Accounts reviewed" value={String(accounts.length)} subtext={`${data.accountsMissingMonthEndBalance || 0} still missing a month-end balance entry`} tone={data.accountsMissingMonthEndBalance > 0 ? 'warning' : 'brand'} />
        <StatCard label="Hanging customer deposits" value={fmtMoney(unresolved.hangingDeposits?.total || 0)} subtext={`${unresolved.hangingDeposits?.count || 0} deposit${Number(unresolved.hangingDeposits?.count || 0) !== 1 ? 's' : ''} still not fully matched`} tone={toneForCount(unresolved.hangingDeposits?.count, unresolved.hangingDeposits?.total)} />
        <StatCard label="Transfer payments awaiting final truth" value={fmtMoney(unresolved.pendingTransferConfirmations?.total || 0)} subtext={`${unresolved.pendingTransferConfirmations?.count || 0} portal transfer${Number(unresolved.pendingTransferConfirmations?.count || 0) !== 1 ? 's' : ''} still need statement-backed confirmation`} tone={toneForCount(unresolved.pendingTransferConfirmations?.count, unresolved.pendingTransferConfirmations?.total)} />
        <StatCard label="Cash not yet banked" value={fmtMoney(unresolved.undepositedCash?.total || 0)} subtext={`${unresolved.undepositedCash?.count || 0} cash sale line${Number(unresolved.undepositedCash?.count || 0) !== 1 ? 's' : ''} still sit outside the bank`} tone={toneForCount(unresolved.undepositedCash?.count, unresolved.undepositedCash?.total)} />
        <StatCard label="Cash deposits awaiting statement confirmation" value={fmtMoney(unresolved.pendingCashDeposits?.total || 0)} subtext={`${unresolved.pendingCashDeposits?.count || 0} pending deposit batch${Number(unresolved.pendingCashDeposits?.count || 0) !== 1 ? 'es' : ''}`} tone={toneForCount(unresolved.pendingCashDeposits?.count, unresolved.pendingCashDeposits?.total)} />
        <StatCard label="Pending approval requests" value={String(unresolved.pendingApprovals?.count || 0)} subtext="Banking edit/delete requests still waiting for decision" tone={unresolved.pendingApprovals?.count > 0 ? 'warning' : 'default'} />
      </div>

      <SectionCard title="Account snapshot" subtitle="System balances are calculated up to the end of the selected month. The month-end balance status shows whether someone recorded a statement balance for that month.">
        {accounts.length === 0 ? (
          <EmptyMini title="No bank accounts found." />
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[980px]">
              <thead>
                <tr className="border-b border-surface-100">
                  <th className="px-4 py-3 text-left text-overline text-surface-500">Account</th>
                  <th className="px-4 py-3 text-right text-overline text-surface-500">System balance</th>
                  <th className="px-4 py-3 text-right text-overline text-surface-500">Transactions</th>
                  <th className="px-4 py-3 text-left text-overline text-surface-500">Month-end balance</th>
                  <th className="px-4 py-3 text-right text-overline text-surface-500">Variance</th>
                  <th className="px-4 py-3 text-left text-overline text-surface-500">Latest statement</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => {
                  const latest = account.latestReconciliation;
                  return (
                    <tr key={account.id} className="border-b border-surface-50 align-top">
                      <td className="px-4 py-3">
                        <p className="text-body-medium font-semibold text-surface-900">{displayAccountName(account)}</p>
                        <p className="mt-1 text-caption text-surface-500">{account.accountType.replaceAll('_', ' ')}</p>
                      </td>
                      <td className="px-4 py-3 text-right text-body-medium font-semibold text-surface-900">{fmtMoney(account.systemBalance)}</td>
                      <td className="px-4 py-3 text-right text-body text-surface-700">{account.transactionCount}</td>
                      <td className="px-4 py-3 text-body">
                        {account.monthEndReconciliation ? (
                          <span className={`rounded-full px-2 py-1 text-caption-medium font-medium ${RECONCILIATION_STYLES[account.monthEndReconciliation.status] || 'bg-surface-100 text-surface-700'}`}>
                            {account.monthEndReconciliation.status.toLowerCase()}
                          </span>
                        ) : (
                          <StatusChip label="Missing" tone="warning" />
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right text-body-medium font-semibold ${latest && Math.abs(Number(latest.variance || 0)) > 0.009 ? 'text-error-600' : 'text-surface-800'}`}>
                        {latest ? fmtMoney(latest.variance) : '—'}
                      </td>
                      <td className="px-4 py-3 text-body text-surface-500">
                        {latest ? `${fmtDate(latest.statementDate)} • ${fmtMoney(latest.closingBalance)}` : 'No reconciliation yet'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="Hanging customer deposits" subtitle="Customer money that had reached Banking by month end but was still not fully matched to bookings.">
          {(unresolved.hangingDeposits?.items || []).length === 0 ? (
            <EmptyMini title="No hanging customer deposits for this month." />
          ) : (
            <div className="space-y-3">
              {unresolved.hangingDeposits.items.slice(0, 8).map((item) => (
                <div key={item.id} className="rounded-lg border border-surface-100 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-body-medium font-semibold text-surface-900">{item.customer?.name || 'Unknown customer'}</p>
                      <p className="mt-1 text-caption text-surface-500">{fmtDate(item.transactionDate)} • {displayAccountName(item.bankAccount)}</p>
                    </div>
                    <p className="text-body-medium font-semibold text-warning-700">{fmtMoney(item.availableAmount)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Transfer payments awaiting final confirmation" subtitle="Portal transfer orders where admin may have seen the money, but the bank statement had not yet become the final source of truth by this month end.">
          {(unresolved.pendingTransferConfirmations?.items || []).length === 0 ? (
            <EmptyMini title="No portal transfers were waiting for final confirmation." />
          ) : (
            <div className="space-y-3">
              {unresolved.pendingTransferConfirmations.items.slice(0, 8).map((item) => (
                <div key={item.id} className="rounded-lg border border-surface-100 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-body-medium font-semibold text-surface-900">{item.customer?.name || 'Unknown customer'} • {item.reference}</p>
                      <p className="mt-1 text-caption text-surface-500">{item.batch?.name || 'Unknown batch'} • {fmtDate(item.createdAt, true)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-body-medium font-semibold text-warning-700">{fmtMoney(item.amountToPay)}</p>
                      <p className="mt-1 text-caption text-surface-500">{item.status.replaceAll('_', ' ').toLowerCase()}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Cash not yet banked" subtitle="Cash sale lines dated on or before this month end that were still not selected into a bank deposit batch.">
          {(unresolved.undepositedCash?.items || []).length === 0 ? (
            <EmptyMini title="No undeposited cash remained for this month." />
          ) : (
            <div className="space-y-3">
              {unresolved.undepositedCash.items.slice(0, 8).map((item) => (
                <div key={item.id} className="rounded-lg border border-surface-100 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-body-medium font-semibold text-surface-900">{item.customer?.name || item.sale?.receiptNumber || 'Cash sale'}</p>
                      <p className="mt-1 text-caption text-surface-500">{fmtDate(item.transactionDate)} • {item.sale?.receiptNumber || item.description || 'Cash sale line'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-body-medium font-semibold text-warning-700">{fmtMoney(item.availableAmount)}</p>
                      <p className="mt-1 text-caption text-surface-500">{Math.max(0, Math.round(item.ageHours))}h old</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Cash deposits awaiting statement confirmation" subtitle="Money already moved from cash to the bank account, but still waiting for the matching bank inflow line.">
          {(unresolved.pendingCashDeposits?.items || []).length === 0 ? (
            <EmptyMini title="No pending cash deposit confirmations for this month." />
          ) : (
            <div className="space-y-3">
              {unresolved.pendingCashDeposits.items.slice(0, 8).map((item) => (
                <div key={item.id} className="rounded-lg border border-surface-100 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-body-medium font-semibold text-surface-900">{fmtDate(item.depositDate)} • {item.createdBy?.firstName || 'Unknown staff'}</p>
                      <p className="mt-1 text-caption text-surface-500">{item.status.replaceAll('_', ' ').toLowerCase()} • {item.transactions?.length || 0} cash line{Number(item.transactions?.length || 0) !== 1 ? 's' : ''}</p>
                    </div>
                    <p className="text-body-medium font-semibold text-warning-700">{fmtMoney(item.amount)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Pending approval requests" subtitle="Banking edits and deletes that still need a manager decision before the month can be treated as tidy.">
        {(unresolved.pendingApprovals?.items || []).length === 0 ? (
          <EmptyMini title="No pending Banking approval requests for this month." />
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-surface-100">
                  <th className="px-4 py-3 text-left text-overline text-surface-500">Requested</th>
                  <th className="px-4 py-3 text-left text-overline text-surface-500">Type</th>
                  <th className="px-4 py-3 text-left text-overline text-surface-500">By</th>
                  <th className="px-4 py-3 text-left text-overline text-surface-500">Reason</th>
                </tr>
              </thead>
              <tbody>
                {unresolved.pendingApprovals.items.slice(0, 10).map((item) => (
                  <tr key={item.id} className="border-b border-surface-50">
                    <td className="px-4 py-3 text-body text-surface-600">{fmtDate(item.createdAt, true)}</td>
                    <td className="px-4 py-3 text-body-medium font-medium text-surface-800">{item.type.replaceAll('_', ' ').toLowerCase()}</td>
                    <td className="px-4 py-3 text-body text-surface-700">{item.requestedBy?.firstName || '—'} {item.requestedBy?.lastName || ''}</td>
                    <td className="px-4 py-3 text-body text-surface-500">{item.reason || 'No reason supplied'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
