import { useState, useEffect } from 'react';
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

function ageLabel(hours) {
  const rounded = Math.max(1, Math.floor(Number(hours || 0)));
  if (rounded < 24) return `${rounded}h old`;
  const days = Math.floor(rounded / 24);
  return `${days} day${days === 1 ? '' : 's'} old`;
}

function CashLineList({ entries, title }) {
  return (
    <div className="rounded-lg border border-surface-200 bg-surface-0">
      <div className="border-b border-surface-100 px-4 py-3">
        <p className="text-caption font-semibold uppercase tracking-wide text-surface-500">{title}</p>
      </div>
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="border-b border-surface-100 bg-surface-50">
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-surface-500">Sale date</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-surface-500">Receipt</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-surface-500">Customer</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-surface-500">Description</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-surface-500">Amount</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const transaction = entry.bankTransaction || entry;
              const amount = entry.amountIncluded ?? transaction.availableAmount ?? transaction.amount;
              return (
                <tr key={entry.id} className="border-b border-surface-50">
                  <td className="px-4 py-3 text-body text-surface-600">{fmtDate(transaction.transactionDate, true)}</td>
                  <td className="px-4 py-3 text-body text-surface-700">{transaction.sale?.receiptNumber || '—'}</td>
                  <td className="px-4 py-3 text-body text-surface-700">{transaction.customer?.name || 'Walk-in customer'}</td>
                  <td className="px-4 py-3 text-body text-surface-500">{transaction.description || transaction.reference || 'Cash sale'}</td>
                  <td className="px-4 py-3 text-right text-body-medium font-semibold text-surface-900">{fmtMoney(amount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BatchCard({ batch, title, subtitle, statusLabel, statusTone, entriesTitle, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-surface-200 bg-surface-0 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
        <div className="space-y-1">
          <p className="text-body-medium font-semibold text-surface-900">{title}</p>
          <p className="text-body text-surface-600">{subtitle}</p>
          {batch.notes ? <p className="text-body text-surface-500">{batch.notes}</p> : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`rounded-full border px-3 py-1 text-caption-medium font-medium ${statusTone}`}>
            {statusLabel}
          </span>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="text-sm font-medium text-brand-700 transition-colors duration-fast hover:text-brand-900"
          >
            {open ? 'Hide included cash sales' : 'View included cash sales'}
          </button>
        </div>
      </div>

      <div className="grid gap-3 border-t border-surface-100 bg-surface-50 px-4 py-3 md:grid-cols-4">
        <div>
          <p className="text-overline text-surface-500">Amount</p>
          <p className="mt-1 text-body-medium font-semibold text-surface-900">{fmtMoney(batch.amount)}</p>
        </div>
        <div>
          <p className="text-overline text-surface-500">{batch.confirmedAt ? 'Confirmed' : 'Deposit date'}</p>
          <p className="mt-1 text-body text-surface-700">{fmtDate(batch.confirmedAt || batch.depositDate, true)}</p>
        </div>
        <div>
          <p className="text-overline text-surface-500">{batch.confirmedAt ? 'Confirmed by' : 'Recorded by'}</p>
          <p className="mt-1 text-body text-surface-700">{staffName(batch.confirmedBy || batch.createdBy)}</p>
        </div>
        <div>
          <p className="text-overline text-surface-500">Cash sales included</p>
          <p className="mt-1 text-body text-surface-700">{batch.transactions.length} line{batch.transactions.length === 1 ? '' : 's'}</p>
        </div>
      </div>

      {batch.confirmationStatementLine ? (
        <div className="border-t border-surface-100 px-4 py-3 text-sm text-surface-600">
          Statement confirmation: {batch.confirmationStatementLine.notes || batch.confirmationStatementLine.description || 'Bank statement line'}
        </div>
      ) : null}

      {open ? (
        <div className="border-t border-surface-100 p-4">
          <CashLineList entries={batch.transactions} title={entriesTitle} />
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab definitions                                                    */
/* ------------------------------------------------------------------ */
const TABS = [
  {
    key: 'undeposited',
    label: 'Undeposited',
    icon: '💵',
    borderActive: 'border-warning-500',
    bgActive: 'bg-warning-50',
    textActive: 'text-warning-700',
    bgIdle: 'bg-surface-0',
    borderIdle: 'border-surface-200',
  },
  {
    key: 'pending',
    label: 'Pending',
    icon: '⏳',
    borderActive: 'border-brand-500',
    bgActive: 'bg-brand-50',
    textActive: 'text-brand-700',
    bgIdle: 'bg-surface-0',
    borderIdle: 'border-surface-200',
  },
  {
    key: 'confirmed',
    label: 'Confirmed',
    icon: '✅',
    borderActive: 'border-success-500',
    bgActive: 'bg-success-50',
    textActive: 'text-success-700',
    bgIdle: 'bg-surface-0',
    borderIdle: 'border-surface-200',
  },
];

function tabBadge(count) {
  if (!count) return null;
  return (
    <span className="ml-1.5 inline-flex min-w-[20px] items-center justify-center rounded-full bg-surface-200 px-1.5 py-0.5 text-xs font-semibold leading-none text-surface-700">
      {count}
    </span>
  );
}

export default function CashDepositsView({ loading, data, onMoveMoney, onOpenStatements, onRefresh, onMatchFromBank }) {
  const undepositedCash = data?.undepositedCash || { count: 0, total: 0, thresholdHours: 24, transactions: [] };
  const pendingDeposits = data?.pendingDeposits || { count: 0, total: 0, thresholdHours: 24, batches: [] };
  const confirmedRecently = data?.confirmedRecently || [];

  // Smart default: show undeposited if any exist, else pending, else confirmed
  const smartDefault = undepositedCash.transactions.length > 0
    ? 'undeposited'
    : pendingDeposits.batches.length > 0
      ? 'pending'
      : 'confirmed';

  const [activeTab, setActiveTab] = useState(smartDefault);

  // Update default when data changes (e.g. after a match clears undeposited)
  useEffect(() => {
    if (activeTab === 'undeposited' && undepositedCash.transactions.length === 0 && pendingDeposits.batches.length > 0) {
      setActiveTab('pending');
    }
  }, [undepositedCash.transactions.length, pendingDeposits.batches.length]);

  if (loading) {
    return <div className="rounded-lg border border-surface-200 bg-surface-0 px-6 py-20 text-center text-sm text-surface-500">Loading cash deposits…</div>;
  }

  // Counts for each tab badge
  const counts = {
    undeposited: undepositedCash.transactions.length,
    pending: pendingDeposits.batches.length,
    confirmed: confirmedRecently.length,
  };

  // Totals for the stat line under each tab card
  const totals = {
    undeposited: undepositedCash.total,
    pending: pendingDeposits.total,
    confirmed: confirmedRecently.reduce((sum, b) => sum + Number(b.amount || 0), 0),
  };

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-heading text-surface-900">Cash Sales</h2>
          <p className="mt-0.5 text-body text-surface-500">
            Track cash from sale to bank deposit.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onMatchFromBank}
            className="rounded-lg bg-brand-500 px-4 py-2 text-body font-medium text-surface-900 transition-colors duration-fast hover:bg-brand-400"
          >
            Match a bank deposit
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

      {/* Stat-card tabs */}
      <div className="grid gap-3 sm:grid-cols-3">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`relative rounded-lg border-2 p-4 text-left transition-all duration-fast ${
                isActive
                  ? `${tab.borderActive} ${tab.bgActive} shadow-sm`
                  : `${tab.borderIdle} ${tab.bgIdle} hover:border-surface-300 hover:shadow-sm`
              }`}
            >
              {/* Active indicator dot */}
              {isActive && (
                <span className={`absolute right-3 top-3 h-2.5 w-2.5 rounded-full ${tab.borderActive.replace('border-', 'bg-')}`} />
              )}
              <p className={`text-caption font-semibold uppercase tracking-wide ${isActive ? tab.textActive : 'text-surface-500'}`}>
                {tab.icon} {tab.label}{tabBadge(counts[tab.key])}
              </p>
              <p className="mt-2 text-2xl font-bold text-surface-900">{fmtMoney(totals[tab.key])}</p>
              <p className="mt-1 text-body text-surface-600">
                {tab.key === 'undeposited' && `${counts.undeposited} cash sale${counts.undeposited === 1 ? '' : 's'} not yet banked`}
                {tab.key === 'pending' && `${counts.pending} deposit${counts.pending === 1 ? '' : 's'} awaiting bank confirmation`}
                {tab.key === 'confirmed' && `${counts.confirmed} deposit${counts.confirmed === 1 ? '' : 's'} confirmed by bank`}
              </p>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'undeposited' && (
        <section className="rounded-lg border border-surface-200 bg-surface-0">
          <div className="border-b border-surface-100 px-5 py-4">
            <h3 className="text-body-medium font-semibold text-surface-900">Undeposited cash</h3>
            <p className="mt-1 text-body text-surface-500">
              Cash sale amounts sitting in the Cash Account, not yet grouped into a bank deposit.
            </p>
          </div>
          {undepositedCash.transactions.length === 0 ? (
            <div className="px-6 py-12">
              <EmptyState title="All clear" body="Every cash sale has been included in a pending or confirmed deposit." />
            </div>
          ) : (
            <div className="space-y-3 px-5 py-4">
              {undepositedCash.transactions.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-warning-200 bg-warning-50 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-body-medium font-semibold text-surface-900">{entry.sale?.receiptNumber || 'Cash sale awaiting deposit'}</p>
                      <p className="mt-1 text-body text-surface-600">{entry.customer?.name || 'Walk-in customer'} · {fmtDate(entry.transactionDate, true)}</p>
                      <p className="mt-1 text-body text-surface-500">{entry.description || entry.reference || 'Cash sale'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-body-medium font-semibold text-warning-700">{fmtMoney(entry.availableAmount)}</p>
                      <p className="mt-1 text-caption text-surface-500">{ageLabel(entry.ageHours || ((Date.now() - new Date(entry.transactionDate).getTime()) / 36e5))}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'pending' && (
        <section className="rounded-lg border border-surface-200 bg-surface-0">
          <div className="border-b border-surface-100 px-5 py-4">
            <h3 className="text-body-medium font-semibold text-surface-900">Pending confirmation</h3>
            <p className="mt-1 text-body text-surface-500">
              Deposits matched to cash sales but not yet confirmed on the bank statement.
            </p>
          </div>
          {pendingDeposits.batches.length === 0 ? (
            <div className="px-6 py-12">
              <EmptyState title="No pending deposits" body="All matched deposits have been confirmed, or there are none yet." />
            </div>
          ) : (
            <div className="space-y-4 px-5 py-4">
              {pendingDeposits.batches.map((batch) => (
                <BatchCard
                  key={batch.id}
                  batch={batch}
                  title={`${fmtMoney(batch.amount)} pending bank confirmation`}
                  subtitle={`Deposited on ${fmtDate(batch.depositDate, true)} by ${staffName(batch.createdBy)} · ${ageLabel(batch.ageHours)}`}
                  statusLabel={batch.isOverdue ? 'Overdue' : 'Waiting for confirmation'}
                  statusTone={severityTone(batch.isOverdue)}
                  entriesTitle="Cash sales included in this pending deposit"
                />
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'confirmed' && (
        <section className="rounded-lg border border-surface-200 bg-surface-0">
          <div className="border-b border-surface-100 px-5 py-4">
            <h3 className="text-body-medium font-semibold text-surface-900">Confirmed deposits</h3>
            <p className="mt-1 text-body text-surface-500">
              Bank-confirmed deposits showing exactly which cash sales were included.
            </p>
          </div>
          {confirmedRecently.length === 0 ? (
            <div className="px-6 py-12">
              <EmptyState title="No confirmed deposits yet" body="Once a bank statement confirms a matched deposit, it will appear here." />
            </div>
          ) : (
            <div className="space-y-4 px-5 py-4">
              {confirmedRecently.map((batch, index) => (
                <BatchCard
                  key={batch.id}
                  batch={batch}
                  title={`${fmtMoney(batch.amount)} confirmed in bank`}
                  subtitle={`Deposited on ${fmtDate(batch.depositDate, true)} · confirmed ${fmtDate(batch.confirmedAt, true)}`}
                  statusLabel="Confirmed"
                  statusTone="border-success-200 bg-success-50 text-success-700"
                  entriesTitle="Cash sales included in this confirmed deposit"
                  defaultOpen={index === 0}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
