import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { fmtMoney, fmtDate, displayAccountName, RECONCILIATION_STYLES } from '../shared/constants';
import { EmptyPanel, Field, ModalActions, ModalShell, PanelLoading, SummaryBanner, StatusChip } from '../shared/ui';

function toneForCount(count, amount = 0) {
  return count > 0 || amount > 0 ? 'warning' : 'default';
}

function getMonthEndDateInput(monthKey) {
  const [yearString, monthString] = String(monthKey || '').split('-');
  const year = Number(yearString);
  const monthIndex = Number(monthString) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return new Date().toISOString().slice(0, 10);
  }
  const date = new Date(Date.UTC(year, monthIndex + 1, 0, 12, 0, 0, 0));
  return date.toISOString().slice(0, 10);
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

function ActionLink({ label, onClick, tone = 'brand' }) {
  const toneStyles = {
    brand: 'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100',
    warning: 'border-warning-200 bg-warning-50 text-warning-700 hover:bg-warning-100',
    surface: 'border-surface-200 bg-surface-50 text-surface-700 hover:bg-surface-100',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors duration-fast ${toneStyles[tone] || toneStyles.brand}`}
    >
      {label}
    </button>
  );
}

function SectionCard({ title, subtitle, children, action = null }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-surface-0">
      <div className="flex flex-col gap-3 border-b border-surface-100 px-5 py-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-title text-surface-900">{title}</h3>
          {subtitle ? <p className="mt-1 text-body text-surface-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function EmptyMini({ title }) {
  return <div className="rounded-lg bg-surface-50 px-4 py-8 text-center text-body text-surface-500">{title}</div>;
}

function MonthEndBalanceModal({ account, month, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    statementDate: getMonthEndDateInput(month),
    openingBalance: '',
    closingBalance: account?.monthEndReconciliation?.closingBalance != null
      ? String(account.monthEndReconciliation.closingBalance)
      : '',
    notes: account?.monthEndReconciliation?.notes || `Month-end balance recorded from ${displayAccountName(account)} statement for ${month}.`,
  }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post('/banking/reconciliations', {
        bankAccountId: account.id,
        statementDate: form.statementDate,
        openingBalance: form.openingBalance === '' ? undefined : Number(form.openingBalance),
        closingBalance: Number(form.closingBalance),
        notes: form.notes?.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err.error || 'Failed to save month-end balance');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title={`Enter month-end balance for ${displayAccountName(account)}`} onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error ? <div className="rounded-lg border border-error-100 bg-error-50 px-3 py-2 text-body text-error-700">{error}</div> : null}

        <div className="rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-body text-brand-700">
          This records the statement balance for {month}. You can enter a revised balance later if the manager needs to correct it.
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Account">
            <div className="rounded-md border border-surface-200 bg-surface-50 px-3 py-2 text-body text-surface-800">
              {displayAccountName(account)}
            </div>
          </Field>
          <Field label="Statement date">
            <input
              type="date"
              value={form.statementDate}
              onChange={(event) => setForm((current) => ({ ...current, statementDate: event.target.value }))}
              className="w-full rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500"
              required
            />
          </Field>
          <Field label="Closing balance">
            <input
              type="number"
              step="0.01"
              value={form.closingBalance}
              onChange={(event) => setForm((current) => ({ ...current, closingBalance: event.target.value }))}
              className="w-full rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500"
              required
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Opening balance (optional)">
            <input
              type="number"
              step="0.01"
              value={form.openingBalance}
              onChange={(event) => setForm((current) => ({ ...current, openingBalance: event.target.value }))}
              className="w-full rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500"
            />
          </Field>
          <Field label="System balance at month end">
            <div className="rounded-md border border-surface-200 bg-surface-50 px-3 py-2 text-body font-semibold text-surface-900">
              {fmtMoney(account.systemBalance)}
            </div>
          </Field>
        </div>

        <Field label="Notes (optional)">
          <textarea
            rows={3}
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            className="w-full rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Optional month-end notes"
          />
        </Field>

        <ModalActions onClose={onClose} submitting={submitting} submitLabel={submitting ? 'Saving…' : 'Save month-end balance'} />
      </form>
    </ModalShell>
  );
}

function CloseMonthModal({ month, review, onClose, onClosed }) {
  const [notes, setNotes] = useState(`Month reviewed and closed for ${review.label}.`);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post('/banking/month-closes', {
        month,
        notes: notes.trim() || undefined,
      });
      onClosed();
    } catch (err) {
      setError(err.error || 'Failed to close month');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title={`Close ${review.label}`} onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error ? <div className="rounded-lg border border-error-100 bg-error-50 px-3 py-2 text-body text-error-700">{error}</div> : null}

        <div className="rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-body text-brand-700">
          Closing this month stores the current balance picture and unresolved review counts as the formal month-end record. It does not erase hanging deposits or operational alerts.
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-surface-50 px-4 py-3">
            <p className="text-overline text-surface-500">Accounts missing balance</p>
            <p className="mt-1 text-body-medium font-semibold text-surface-900">{review.accountsMissingMonthEndBalance}</p>
          </div>
          <div className="rounded-lg bg-surface-50 px-4 py-3">
            <p className="text-overline text-surface-500">Unresolved review items</p>
            <p className="mt-1 text-body-medium font-semibold text-surface-900">
              {Number(review.unresolved?.hangingDeposits?.count || 0)
                + Number(review.unresolved?.pendingTransferConfirmations?.count || 0)
                + Number(review.unresolved?.undepositedCash?.count || 0)
                + Number(review.unresolved?.pendingCashDeposits?.count || 0)
                + Number(review.unresolved?.pendingApprovals?.count || 0)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-lg border border-surface-100 px-4 py-3">
            <p className="text-overline text-surface-500">Hanging deposits</p>
            <p className="mt-1 text-body-medium font-semibold text-warning-700">{fmtMoney(review.unresolved?.hangingDeposits?.total || 0)}</p>
          </div>
          <div className="rounded-lg border border-surface-100 px-4 py-3">
            <p className="text-overline text-surface-500">Pending transfer confirmations</p>
            <p className="mt-1 text-body-medium font-semibold text-warning-700">{fmtMoney(review.unresolved?.pendingTransferConfirmations?.total || 0)}</p>
          </div>
          <div className="rounded-lg border border-surface-100 px-4 py-3">
            <p className="text-overline text-surface-500">Cash not yet banked</p>
            <p className="mt-1 text-body-medium font-semibold text-warning-700">{fmtMoney(review.unresolved?.undepositedCash?.total || 0)}</p>
          </div>
        </div>

        <Field label="Manager close note (optional)">
          <textarea
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="What was reviewed before closing this month?"
          />
        </Field>

        <ModalActions onClose={onClose} submitting={submitting} submitLabel={submitting ? 'Closing…' : 'Close month'} />
      </form>
    </ModalShell>
  );
}

export default function MonthEndReview({ onNavigate }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [notice, setNotice] = useState('');

  const loadReview = useCallback(() => {
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

  useEffect(() => loadReview(), [loadReview]);

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
  const monthClose = data.monthClose;
  const recentMonthCloses = data.recentMonthCloses || [];
  const canCloseMonth = !monthClose && Number(data.accountsMissingMonthEndBalance || 0) === 0;
  const goToView = (view, options = {}) => onNavigate?.(view, options);

  return (
    <>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-title text-surface-900">Month-end review</h2>
            <p className="mt-1 text-body text-surface-500">
              Review balances and unresolved items before the manager closes {data.label}. Long-hanging customer deposits can stay open; the goal here is visibility.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div>
              <label className="mb-2 block text-overline text-surface-500">Review month</label>
              <input
                type="month"
                value={month}
                onChange={(event) => {
                  setMonth(event.target.value);
                  setNotice('');
                }}
                className="rounded-lg border border-surface-300 bg-surface-0 px-3 py-2 text-body text-surface-800"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowCloseModal(true)}
              disabled={!canCloseMonth}
              className="rounded-lg bg-brand-500 px-4 py-2.5 text-body-medium text-surface-900 transition-colors duration-fast hover:bg-brand-400 disabled:cursor-not-allowed disabled:bg-surface-200 disabled:text-surface-500"
            >
              {monthClose ? 'Month already closed' : 'Close month'}
            </button>
          </div>
        </div>

        {notice ? (
          <div className="rounded-lg border border-success-100 bg-success-50 px-4 py-3 text-body text-success-700">
            {notice}
          </div>
        ) : null}

        {monthClose ? (
          <div className="rounded-lg border border-brand-100 bg-brand-50 px-4 py-4 text-body text-brand-700">
            <p className="font-semibold">{data.label} was closed on {fmtDate(monthClose.closedAt, true)}.</p>
            <p className="mt-1 opacity-80">Closed by {monthClose.closedBy?.firstName || '—'} {monthClose.closedBy?.lastName || ''}.{monthClose.notes ? ` Note: ${monthClose.notes}` : ''}</p>
          </div>
        ) : Number(data.accountsMissingMonthEndBalance || 0) > 0 ? (
          <div className="rounded-lg border border-warning-100 bg-warning-50 px-4 py-4 text-body text-warning-700">
            Enter a month-end balance for all active accounts before you close {data.label}.
          </div>
        ) : null}

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
          <div className="space-y-2">
            <StatCard label="Accounts reviewed" value={String(accounts.length)} subtext={`${data.accountsMissingMonthEndBalance || 0} still missing a month-end balance entry`} tone={data.accountsMissingMonthEndBalance > 0 ? 'warning' : 'brand'} />
            <ActionLink label="Review account snapshot" onClick={() => goToView('reports', { reportKey: 'balances' })} tone="surface" />
          </div>
          <div className="space-y-2">
            <StatCard label="Hanging customer deposits" value={fmtMoney(unresolved.hangingDeposits?.total || 0)} subtext={`${unresolved.hangingDeposits?.count || 0} deposit${Number(unresolved.hangingDeposits?.count || 0) !== 1 ? 's' : ''} still not fully matched`} tone={toneForCount(unresolved.hangingDeposits?.count, unresolved.hangingDeposits?.total)} />
            <ActionLink label="Open bookings desk" onClick={() => goToView('customer-bookings')} tone="warning" />
          </div>
          <div className="space-y-2">
            <StatCard label="Transfer payments awaiting final truth" value={fmtMoney(unresolved.pendingTransferConfirmations?.total || 0)} subtext={`${unresolved.pendingTransferConfirmations?.count || 0} portal transfer${Number(unresolved.pendingTransferConfirmations?.count || 0) !== 1 ? 's' : ''} still need statement-backed confirmation`} tone={toneForCount(unresolved.pendingTransferConfirmations?.count, unresolved.pendingTransferConfirmations?.total)} />
            <ActionLink label="Open transfer queue" onClick={() => goToView('portal-transfers')} tone="warning" />
          </div>
          <div className="space-y-2">
            <StatCard label="Cash not yet banked" value={fmtMoney(unresolved.undepositedCash?.total || 0)} subtext={`${unresolved.undepositedCash?.count || 0} cash sale line${Number(unresolved.undepositedCash?.count || 0) !== 1 ? 's' : ''} still sit outside the bank`} tone={toneForCount(unresolved.undepositedCash?.count, unresolved.undepositedCash?.total)} />
            <ActionLink label="Open cash deposits" onClick={() => goToView('cash-deposits')} tone="warning" />
          </div>
          <div className="space-y-2">
            <StatCard label="Cash deposits awaiting statement confirmation" value={fmtMoney(unresolved.pendingCashDeposits?.total || 0)} subtext={`${unresolved.pendingCashDeposits?.count || 0} pending deposit batch${Number(unresolved.pendingCashDeposits?.count || 0) !== 1 ? 'es' : ''}`} tone={toneForCount(unresolved.pendingCashDeposits?.count, unresolved.pendingCashDeposits?.total)} />
            <ActionLink label="Open cash deposits" onClick={() => goToView('cash-deposits')} tone="warning" />
          </div>
          <div className="space-y-2">
            <StatCard label="Pending approval requests" value={String(unresolved.pendingApprovals?.count || 0)} subtext="Banking edit/delete requests still waiting for decision" tone={unresolved.pendingApprovals?.count > 0 ? 'warning' : 'default'} />
            <ActionLink label="Open approvals" onClick={() => goToView('approvals')} tone={Number(unresolved.pendingApprovals?.count || 0) > 0 ? 'warning' : 'surface'} />
          </div>
        </div>

        <SectionCard
          title="Account snapshot"
          subtitle="System balances are calculated up to the end of the selected month. The month-end balance status shows whether someone recorded a statement balance for that month."
          action={<ActionLink label="Open account balances report" onClick={() => goToView('reports', { reportKey: 'balances' })} tone="surface" />}
        >
          {accounts.length === 0 ? (
            <EmptyMini title="No bank accounts found." />
          ) : (
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full min-w-[1120px]">
                <thead>
                  <tr className="border-b border-surface-100">
                    <th className="px-4 py-3 text-left text-overline text-surface-500">Account</th>
                    <th className="px-4 py-3 text-right text-overline text-surface-500">System balance</th>
                    <th className="px-4 py-3 text-right text-overline text-surface-500">Transactions</th>
                    <th className="px-4 py-3 text-left text-overline text-surface-500">Month-end balance</th>
                    <th className="px-4 py-3 text-right text-overline text-surface-500">Variance</th>
                    <th className="px-4 py-3 text-left text-overline text-surface-500">Latest statement</th>
                    <th className="px-4 py-3 text-right text-overline text-surface-500">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => {
                    const latest = account.latestReconciliation;
                    const monthEnd = account.monthEndReconciliation;
                    return (
                      <tr key={account.id} className="border-b border-surface-50 align-top">
                        <td className="px-4 py-3">
                          <p className="text-body-medium font-semibold text-surface-900">{displayAccountName(account)}</p>
                          <p className="mt-1 text-caption text-surface-500">{account.accountType.replaceAll('_', ' ')}</p>
                        </td>
                        <td className="px-4 py-3 text-right text-body-medium font-semibold text-surface-900">{fmtMoney(account.systemBalance)}</td>
                        <td className="px-4 py-3 text-right text-body text-surface-700">{account.transactionCount}</td>
                        <td className="px-4 py-3 text-body">
                          {monthEnd ? (
                            <div className="space-y-1">
                              <span className={`rounded-full px-2 py-1 text-caption-medium font-medium ${RECONCILIATION_STYLES[monthEnd.status] || 'bg-surface-100 text-surface-700'}`}>
                                {monthEnd.status.toLowerCase()}
                              </span>
                              <p className="text-caption text-surface-500">{fmtDate(monthEnd.statementDate)} • {fmtMoney(monthEnd.closingBalance)}</p>
                            </div>
                          ) : (
                            <StatusChip label="Missing" tone="warning" />
                          )}
                        </td>
                        <td className={`px-4 py-3 text-right text-body-medium font-semibold ${monthEnd && Math.abs(Number(monthEnd.variance || 0)) > 0.009 ? 'text-error-600' : 'text-surface-800'}`}>
                          {monthEnd ? fmtMoney(monthEnd.variance) : '—'}
                        </td>
                        <td className="px-4 py-3 text-body text-surface-500">
                          {latest ? `${fmtDate(latest.statementDate)} • ${fmtMoney(latest.closingBalance)}` : 'No reconciliation yet'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedAccount(account)}
                            className="rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-body-medium text-brand-700 transition-colors duration-fast hover:bg-brand-100"
                          >
                            {monthEnd ? 'Record revised balance' : 'Enter balance'}
                          </button>
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
          <SectionCard
            title="Hanging customer deposits"
            subtitle="Customer money that had reached Banking by month end but was still not fully matched to bookings."
            action={<ActionLink label="Open bookings desk" onClick={() => goToView('customer-bookings')} tone="warning" />}
          >
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

          <SectionCard
            title="Transfer payments awaiting final confirmation"
            subtitle="Portal transfer orders where admin may have seen the money, but the bank statement had not yet become the final source of truth by this month end."
            action={<ActionLink label="Open transfer queue" onClick={() => goToView('portal-transfers')} tone="warning" />}
          >
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

          <SectionCard
            title="Cash not yet banked"
            subtitle="Cash sale lines dated on or before this month end that were still not selected into a bank deposit batch."
            action={<ActionLink label="Open cash deposits" onClick={() => goToView('cash-deposits')} tone="warning" />}
          >
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

          <SectionCard
            title="Cash deposits awaiting statement confirmation"
            subtitle="Money already moved from cash to the bank account, but still waiting for the matching bank inflow line."
            action={<ActionLink label="Open cash deposits" onClick={() => goToView('cash-deposits')} tone="warning" />}
          >
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

        <SectionCard
          title="Pending approval requests"
          subtitle="Banking edits and deletes that still need a manager decision before the month can be treated as tidy."
          action={<ActionLink label="Open approvals" onClick={() => goToView('approvals')} tone="warning" />}
        >
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

        <SectionCard title="Recent close history" subtitle="Each close stores the month-end note and unresolved snapshot that management reviewed at that time.">
          {recentMonthCloses.length === 0 ? (
            <EmptyMini title="No months have been formally closed yet." />
          ) : (
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-surface-100">
                    <th className="px-4 py-3 text-left text-overline text-surface-500">Month</th>
                    <th className="px-4 py-3 text-left text-overline text-surface-500">Closed by</th>
                    <th className="px-4 py-3 text-left text-overline text-surface-500">Closed on</th>
                    <th className="px-4 py-3 text-right text-overline text-surface-500">Hanging deposits</th>
                    <th className="px-4 py-3 text-right text-overline text-surface-500">Cash not banked</th>
                    <th className="px-4 py-3 text-left text-overline text-surface-500">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {recentMonthCloses.map((close) => (
                    <tr key={close.id} className="border-b border-surface-50">
                      <td className="px-4 py-3 text-body-medium font-medium text-surface-900">{close.monthKey}</td>
                      <td className="px-4 py-3 text-body text-surface-700">{close.closedBy?.firstName || '—'} {close.closedBy?.lastName || ''}</td>
                      <td className="px-4 py-3 text-body text-surface-500">{fmtDate(close.closedAt, true)}</td>
                      <td className="px-4 py-3 text-right text-body text-warning-700">{fmtMoney(close.unresolvedSnapshot?.hangingDeposits?.total || 0)}</td>
                      <td className="px-4 py-3 text-right text-body text-warning-700">{fmtMoney(close.unresolvedSnapshot?.undepositedCash?.total || 0)}</td>
                      <td className="px-4 py-3 text-body text-surface-500">{close.notes || 'No note supplied'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      {selectedAccount ? (
        <MonthEndBalanceModal
          account={selectedAccount}
          month={month}
          onClose={() => setSelectedAccount(null)}
          onSaved={() => {
            const accountName = displayAccountName(selectedAccount);
            setSelectedAccount(null);
            setNotice(`Month-end balance saved for ${accountName}.`);
            loadReview();
          }}
        />
      ) : null}

      {showCloseModal ? (
        <CloseMonthModal
          month={month}
          review={data}
          onClose={() => setShowCloseModal(false)}
          onClosed={() => {
            setShowCloseModal(false);
            setNotice(`${data.label} has been formally closed.`);
            loadReview();
          }}
        />
      ) : null}
    </>
  );
}
