import { useState } from 'react';
import { fmtDate, fmtMoney } from './shared/constants';
import { EmptyState } from './shared/ui';

function staffName(user) {
  if (!user) return '—';
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || '—';
}

function ageLabel(hours) {
  const rounded = Math.max(1, Math.floor(Number(hours || 0)));
  if (rounded < 24) return `${rounded}h old`;
  const days = Math.floor(rounded / 24);
  return `${days} day${days === 1 ? '' : 's'} old`;
}

/* ── Deposit batch card (expandable) ─────────────────── */

function DepositCard({ batch, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const lineCount = batch.transactions?.length || 0;

  return (
    <div className="rounded-lg border border-surface-200 bg-surface-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-fast hover:bg-surface-50"
      >
        <div className="min-w-0">
          <p className="text-body-medium font-semibold text-surface-900">{fmtMoney(batch.amount)}</p>
          <p className="mt-0.5 text-caption text-surface-500">
            {fmtDate(batch.depositDate, true)} · {staffName(batch.createdBy)} · {lineCount} sale{lineCount === 1 ? '' : 's'}
          </p>
        </div>
        <svg className={`h-4 w-4 shrink-0 text-surface-400 transition-transform duration-fast ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && lineCount > 0 && (
        <div className="border-t border-surface-100">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-surface-500">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-surface-500">Receipt</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-surface-500">Customer</th>
                  <th className="px-4 py-2 text-right text-xs font-medium uppercase text-surface-500">Amount</th>
                </tr>
              </thead>
              <tbody>
                {batch.transactions.map((entry) => {
                  const t = entry.bankTransaction || entry;
                  const amt = entry.amountIncluded ?? t.availableAmount ?? t.amount;
                  return (
                    <tr key={entry.id} className="border-b border-surface-50">
                      <td className="px-4 py-2.5 text-body text-surface-600">{fmtDate(t.transactionDate, true)}</td>
                      <td className="px-4 py-2.5 text-body text-surface-700">{t.sale?.receiptNumber || '—'}</td>
                      <td className="px-4 py-2.5 text-body text-surface-700">{t.customer?.name || 'Walk-in'}</td>
                      <td className="px-4 py-2.5 text-right text-body-medium font-semibold text-surface-900">{fmtMoney(amt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main view ───────────────────────────────────────── */

export default function CashDepositsView({ loading, data, onRefresh, onMatchFromBank }) {
  const undepositedCash = data?.undepositedCash || { count: 0, total: 0, transactions: [] };
  const deposited = data?.deposited || { count: 0, total: 0, batches: [] };

  const [activeTab, setActiveTab] = useState(
    undepositedCash.transactions.length > 0 ? 'undeposited' : 'deposited',
  );

  if (loading) {
    return <div className="rounded-lg border border-surface-200 bg-surface-0 px-6 py-20 text-center text-sm text-surface-500">Loading…</div>;
  }

  const tabs = [
    {
      key: 'undeposited',
      label: 'Undeposited',
      amount: undepositedCash.total,
      count: undepositedCash.transactions.length,
      accent: 'warning',
    },
    {
      key: 'deposited',
      label: 'Deposited',
      amount: deposited.total,
      count: deposited.batches.length,
      accent: 'success',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-heading text-surface-900">Cash Sales</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onMatchFromBank}
            className="rounded-lg bg-brand-500 px-4 py-2 text-body font-medium text-surface-900 transition-colors duration-fast hover:bg-brand-400"
          >
            Match deposit
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

      {/* Two stat-card tabs */}
      <div className="grid gap-3 sm:grid-cols-2">
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          const accentBorder = active ? `border-${tab.accent}-500` : 'border-surface-200';
          const accentBg = active ? `bg-${tab.accent}-50` : 'bg-surface-0';
          const accentText = active ? `text-${tab.accent}-700` : 'text-surface-500';
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-lg border-2 p-4 text-left transition-all duration-fast ${accentBorder} ${accentBg} ${active ? 'shadow-sm' : 'hover:border-surface-300'}`}
            >
              <p className={`text-caption font-semibold uppercase tracking-wide ${accentText}`}>
                {tab.label}
                {tab.count > 0 && (
                  <span className="ml-1.5 inline-flex min-w-[20px] items-center justify-center rounded-full bg-surface-200 px-1.5 py-0.5 text-xs font-semibold leading-none text-surface-700">
                    {tab.count}
                  </span>
                )}
              </p>
              <p className="mt-2 text-2xl font-bold text-surface-900">{fmtMoney(tab.amount)}</p>
            </button>
          );
        })}
      </div>

      {/* Undeposited tab */}
      {activeTab === 'undeposited' && (
        <section>
          {undepositedCash.transactions.length === 0 ? (
            <div className="rounded-lg border border-surface-200 bg-surface-0 px-6 py-12">
              <EmptyState title="All clear" body="Every cash sale has been matched to a bank deposit." />
            </div>
          ) : (
            <div className="space-y-2">
              {undepositedCash.transactions.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-3 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-body-medium font-semibold text-surface-900 truncate">
                      {entry.sale?.receiptNumber || 'Cash sale'}{entry.customer?.name ? ` — ${entry.customer.name}` : ''}
                    </p>
                    <p className="mt-0.5 text-caption text-surface-500">
                      {fmtDate(entry.transactionDate, true)} · {ageLabel(entry.ageHours || ((Date.now() - new Date(entry.transactionDate).getTime()) / 36e5))}
                    </p>
                  </div>
                  <p className="text-body-medium font-semibold text-warning-700 whitespace-nowrap">{fmtMoney(entry.availableAmount)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Deposited tab */}
      {activeTab === 'deposited' && (
        <section>
          {deposited.batches.length === 0 ? (
            <div className="rounded-lg border border-surface-200 bg-surface-0 px-6 py-12">
              <EmptyState title="No deposits yet" body="Match cash sales to bank deposits and they will appear here." />
            </div>
          ) : (
            <div className="space-y-2">
              {deposited.batches.map((batch, i) => (
                <DepositCard key={batch.id} batch={batch} defaultOpen={i === 0} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
