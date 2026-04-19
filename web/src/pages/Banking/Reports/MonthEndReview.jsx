import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { fmtMoney, fmtDate, displayAccountName } from '../shared/constants';
import { ModalShell, ModalActions, PanelLoading, EmptyPanel } from '../shared/ui';

/* ── helpers ──────────────────────────────────────── */

function lastDayOf(monthKey) {
  const [y, m] = String(monthKey || '').split('-').map(Number);
  if (!y || !m) return new Date().toISOString().slice(0, 10);
  return new Date(Date.UTC(y, m, 0, 12)).toISOString().slice(0, 10);
}

function staffLabel(user) {
  if (!user) return '—';
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || '—';
}

/* ── Close-month confirmation modal (lightweight) ─── */

function CloseMonthModal({ month, label, onClose, onClosed }) {
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post('/banking/month-closes', { month, notes: notes.trim() || undefined });
      onClosed();
    } catch (err) {
      setError(err.error || 'Failed to close month');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title={`Close ${label}?`} onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-lg border border-error-100 bg-error-50 px-3 py-2 text-body text-error-700">{error}</div>}
        <p className="text-body text-surface-600">
          This stores the current balances as the formal month-end record. Any unresolved items are captured in the snapshot.
        </p>
        <div>
          <label className="mb-1 block text-caption font-medium text-surface-600">Note (optional)</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Optional closing note"
          />
        </div>
        <ModalActions onClose={onClose} submitting={submitting} submitLabel={submitting ? 'Closing…' : 'Close month'} />
      </form>
    </ModalShell>
  );
}

/* ── Inline balance entry card per account ────────── */

function AccountCard({ account, month, onSaved, onGoToTransactions }) {
  const monthEnd = account.monthEndReconciliation;
  const hasBal = monthEnd != null;
  const variance = hasBal ? Number(monthEnd.variance || 0) : 0;
  const absVariance = Math.abs(variance);
  const isBalanced = hasBal && absVariance <= 0.009;

  const [editing, setEditing] = useState(false);
  const [balance, setBalance] = useState(hasBal ? String(monthEnd.closingBalance) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Reset when month/account changes
  useEffect(() => {
    const me = account.monthEndReconciliation;
    setBalance(me ? String(me.closingBalance) : '');
    setEditing(false);
    setError('');
  }, [month, account.id, account.monthEndReconciliation?.closingBalance]);

  async function save() {
    if (!balance || isNaN(Number(balance))) { setError('Enter a valid number'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post('/banking/reconciliations', {
        bankAccountId: account.id,
        statementDate: lastDayOf(month),
        closingBalance: Number(balance),
      });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  // Status badge
  let statusBadge;
  if (hasBal && isBalanced) {
    statusBadge = <span className="rounded-full bg-success-100 px-2.5 py-1 text-xs font-semibold text-success-700">Balanced</span>;
  } else if (hasBal && !isBalanced) {
    statusBadge = <span className="rounded-full bg-error-100 px-2.5 py-1 text-xs font-semibold text-error-700">Variance</span>;
  } else {
    statusBadge = <span className="rounded-full bg-warning-100 px-2.5 py-1 text-xs font-semibold text-warning-700">Missing</span>;
  }

  // Variance direction: positive = bank has more (we're missing an inflow),
  // negative = bank has less (we're missing an outflow or entered extra)
  const varianceDirection = variance > 0
    ? 'Bank has more — a transaction may be missing from the system'
    : 'System has more — an entry may be incorrect or duplicated';

  return (
    <div className={`rounded-lg border-2 p-4 transition-colors ${hasBal && isBalanced ? 'border-success-200 bg-success-50/30' : hasBal && !isBalanced ? 'border-error-200 bg-error-50/30' : 'border-surface-200 bg-surface-0'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-body-medium font-semibold text-surface-900">{displayAccountName(account)}</p>
          <p className="mt-0.5 text-caption text-surface-500">{account.accountType.replaceAll('_', ' ')}</p>
        </div>
        {statusBadge}
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-4">
        <div>
          <p className="text-caption text-surface-500">System balance</p>
          <p className="text-lg font-bold text-surface-900">{fmtMoney(account.systemBalance)}</p>
        </div>
        {hasBal && !editing && (
          <div className="text-right">
            <p className="text-caption text-surface-500">Bank statement</p>
            <p className="text-lg font-bold text-surface-900">{fmtMoney(monthEnd.closingBalance)}</p>
          </div>
        )}
      </div>

      {/* Variance explanation + action */}
      {hasBal && !isBalanced && !editing && (
        <div className="mt-3 rounded-md border border-error-200 bg-error-50 px-3 py-2.5">
          <p className="text-body font-semibold text-error-700">
            Off by {fmtMoney(absVariance)}
          </p>
          <p className="mt-0.5 text-caption text-error-600">{varianceDirection}.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onGoToTransactions?.()}
              className="rounded-md border border-error-300 px-3 py-1.5 text-caption font-medium text-error-700 transition-colors hover:bg-error-100"
            >
              Check transactions
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md px-3 py-1.5 text-caption font-medium text-error-600 transition-colors hover:bg-error-100"
            >
              Re-enter balance
            </button>
          </div>
        </div>
      )}

      {/* Inline edit */}
      {editing ? (
        <div className="mt-3">
          {error && <p className="mb-2 text-caption text-error-600">{error}</p>}
          <div className="flex gap-2">
            <input
              type="number"
              step="0.01"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder="Closing balance from bank statement"
              className="flex-1 rounded-md border border-surface-300 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500"
              autoFocus
            />
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-md bg-brand-600 px-4 py-2 text-body font-medium text-white transition-colors hover:bg-brand-700 disabled:bg-surface-300"
            >
              {saving ? '…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setError(''); }}
              className="rounded-md px-3 py-2 text-body text-surface-500 hover:bg-surface-100"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : !hasBal || isBalanced ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-3 w-full rounded-md border border-dashed border-surface-300 px-3 py-2 text-center text-body font-medium text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50"
        >
          {hasBal ? 'Update balance' : 'Enter bank balance'}
        </button>
      ) : null}
    </div>
  );
}

/* ── Main view ───────────────────────────────────── */

export default function MonthEndReview({ onNavigate }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    let alive = true;
    setLoading(true);
    api.get(`/banking/month-end-review?month=${month}`)
      .then((res) => { if (alive) setData(res); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [month]);

  useEffect(() => load(), [load]);

  if (loading) return <PanelLoading label="Loading…" />;
  if (!data) return <EmptyPanel title="Could not load reconciliation data." />;

  const accounts = data.accounts || [];
  const monthClose = data.monthClose;
  const unresolved = data.unresolved || {};
  const missingCount = Number(data.accountsMissingMonthEndBalance || 0);
  const varianceCount = accounts.filter((a) => {
    const me = a.monthEndReconciliation;
    return me != null && Math.abs(Number(me.variance || 0)) > 0.009;
  }).length;
  const canClose = !monthClose && missingCount === 0 && varianceCount === 0;
  const unallocatedCount = Number(unresolved.unallocatedTransactions?.count || 0);
  const unbankedCount = Number(unresolved.undepositedCash?.count || 0);
  const recentCloses = data.recentMonthCloses || [];

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-heading text-surface-900">Reconciliation</h2>
            <p className="mt-0.5 text-body text-surface-500">
              Enter each bank's closing balance, then close the month.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="month"
              value={month}
              onChange={(e) => { setMonth(e.target.value); setNotice(''); }}
              className="rounded-lg border border-surface-300 bg-surface-0 px-3 py-2 text-body text-surface-800"
            />
            <button
              type="button"
              onClick={() => setShowCloseModal(true)}
              disabled={!canClose}
              className="rounded-lg bg-brand-500 px-4 py-2 text-body font-medium text-surface-900 transition-colors hover:bg-brand-400 disabled:cursor-not-allowed disabled:bg-surface-200 disabled:text-surface-500"
            >
              {monthClose ? 'Closed' : 'Close month'}
            </button>
          </div>
        </div>

        {/* Success notice */}
        {notice && (
          <div className="rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-body text-success-700">{notice}</div>
        )}

        {/* Month closed banner */}
        {monthClose && (
          <div className="rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-body text-success-700">
            <span className="font-semibold">{data.label} closed</span> on {fmtDate(monthClose.closedAt, true)} by {staffLabel(monthClose.closedBy)}.
            {monthClose.notes ? ` — ${monthClose.notes}` : ''}
          </div>
        )}

        {/* Blockers warning */}
        {!monthClose && (missingCount > 0 || varianceCount > 0) && (
          <div className="rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-body text-warning-700">
            {missingCount > 0 && `Enter bank balances for ${missingCount} account${missingCount !== 1 ? 's' : ''}.`}
            {missingCount > 0 && varianceCount > 0 && ' '}
            {varianceCount > 0 && `${varianceCount} account${varianceCount !== 1 ? 's have' : ' has'} a variance — resolve before closing.`}
          </div>
        )}

        {/* Account cards — inline balance entry */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              month={month}
              onSaved={() => {
                setNotice('Balance saved.');
                load();
              }}
              onGoToTransactions={() => onNavigate?.('transactions')}
            />
          ))}
        </div>

        {/* Awareness counters — only show if there are items */}
        {(unallocatedCount > 0 || unbankedCount > 0) && (
          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-surface-200 bg-surface-50 px-4 py-3 text-body text-surface-600">
            {unallocatedCount > 0 && (
              <button type="button" onClick={() => onNavigate?.('transactions')} className="hover:text-brand-700 hover:underline">
                {unallocatedCount} unallocated transaction{unallocatedCount !== 1 ? 's' : ''}
              </button>
            )}
            {unallocatedCount > 0 && unbankedCount > 0 && <span className="text-surface-300">·</span>}
            {unbankedCount > 0 && (
              <button type="button" onClick={() => onNavigate?.('cash-deposits')} className="hover:text-brand-700 hover:underline">
                {unbankedCount} unbanked cash sale{unbankedCount !== 1 ? 's' : ''}
              </button>
            )}
          </div>
        )}

        {/* Close history (compact) */}
        {recentCloses.length > 0 && (
          <details className="rounded-lg border border-surface-200 bg-surface-0">
            <summary className="cursor-pointer px-4 py-3 text-body-medium font-medium text-surface-700 hover:text-surface-900">
              Close history ({recentCloses.length})
            </summary>
            <div className="border-t border-surface-100 overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="border-b border-surface-100 bg-surface-50">
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-surface-500">Month</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-surface-500">Closed by</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-surface-500">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-surface-500">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCloses.map((c) => (
                    <tr key={c.id} className="border-b border-surface-50">
                      <td className="px-4 py-2.5 text-body font-medium text-surface-900">{c.monthKey}</td>
                      <td className="px-4 py-2.5 text-body text-surface-700">{staffLabel(c.closedBy)}</td>
                      <td className="px-4 py-2.5 text-body text-surface-500">{fmtDate(c.closedAt, true)}</td>
                      <td className="px-4 py-2.5 text-body text-surface-500">{c.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}

        {/* Report links */}
        <div className="flex flex-wrap gap-2">
          <span className="py-1.5 text-caption text-surface-400">Reports:</span>
          {[
            { label: 'Expenses', key: 'expenses' },
            { label: 'Unbooked Deposits', key: 'unbooked' },
            { label: 'Customer Liability', key: 'liability' },
            { label: 'Account Balances', key: 'balances' },
          ].map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => onNavigate?.('reports', { reportKey: r.key })}
              className="rounded-full border border-surface-200 px-3 py-1.5 text-caption font-medium text-surface-600 transition-colors hover:bg-surface-100 hover:text-surface-800"
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {showCloseModal && (
        <CloseMonthModal
          month={month}
          label={data.label}
          onClose={() => setShowCloseModal(false)}
          onClosed={() => {
            setShowCloseModal(false);
            setNotice(`${data.label} has been closed.`);
            load();
          }}
        />
      )}
    </>
  );
}
