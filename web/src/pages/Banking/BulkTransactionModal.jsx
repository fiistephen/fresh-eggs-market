import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { categoryOptionsForDirection, categoryLabel, displayAccountName, fmtMoney, todayStr } from './shared/constants';
import { ModalShell, ModalActions } from './shared/ui';
import QuickCategoryCreator from './QuickCategoryCreator';

function createRow(defaults = {}) {
  return {
    id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
    bankAccountId: defaults.bankAccountId || '',
    direction: defaults.direction || 'INFLOW',
    category: defaults.category || '',
    transactionDate: defaults.transactionDate || todayStr(),
    amount: '',
    description: '',
    farmerId: defaults.farmerId || '',
  };
}

export default function BulkTransactionModal({ accounts, transactionCategories, categoryMap, onCategoriesChanged, onClose, onRecorded, embedded = false }) {
  const defaultAccountId = accounts.find((a) => a.accountType === 'CUSTOMER_DEPOSIT')?.id || accounts[0]?.id || '';
  // V3 Meeting 3: default category is always "Unallocated income" for inflows.
  // categoryOptionsForDirection returns alphabetically-sorted options, so we
  // can't rely on [0] — pick UNALLOCATED_INCOME explicitly when present.
  const inflowOptions = categoryOptionsForDirection('INFLOW', categoryMap, 'UNALLOCATED_INCOME');
  const defaultCategory = inflowOptions.includes('UNALLOCATED_INCOME')
    ? 'UNALLOCATED_INCOME'
    : inflowOptions[0] || 'UNALLOCATED_INCOME';
  const initialDefaults = { bankAccountId: defaultAccountId, direction: 'INFLOW', category: defaultCategory, transactionDate: todayStr() };

  const [rows, setRows] = useState([
    createRow(initialDefaults),
    createRow(initialDefaults),
    createRow(initialDefaults),
    createRow(initialDefaults),
    createRow(initialDefaults),
  ]);
  const [showCategoryCreator, setShowCategoryCreator] = useState(false);
  const [farmers, setFarmers] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function loadFarmers() {
      try {
        const data = await api.get('/farmers?limit=200');
        if (active) setFarmers(data.farmers || []);
      } catch {
        if (active) setFarmers([]);
      }
    }
    loadFarmers();
    return () => {
      active = false;
    };
  }, []);

  function updateRow(index, patch) {
    setRows((current) => current.map((row, i) => {
      if (i !== index) return row;
      const updated = { ...row, ...patch };
      // If direction changed, reset category to a sensible default
      if (patch.direction && patch.direction !== row.direction) {
        const preferred = patch.direction === 'INFLOW' ? 'UNALLOCATED_INCOME' : 'UNALLOCATED_EXPENSE';
        const opts = categoryOptionsForDirection(patch.direction, categoryMap, preferred);
        updated.category = opts.includes(preferred) ? preferred : opts[0] || preferred;
      }
      return updated;
    }));
  }

  function removeRow(index) {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  function addRow() {
    // Inherit from last row
    const lastRow = rows[rows.length - 1];
    setRows((current) => [...current, createRow(lastRow ? {
      bankAccountId: lastRow.bankAccountId,
      direction: lastRow.direction,
      category: lastRow.category,
      transactionDate: lastRow.transactionDate,
    } : initialDefaults)]);
  }

  function duplicateRow(index) {
    const source = rows[index];
    const dup = createRow({
      bankAccountId: source.bankAccountId,
      direction: source.direction,
      category: source.category,
      transactionDate: source.transactionDate,
    });
    setRows((current) => {
      const next = [...current];
      next.splice(index + 1, 0, dup);
      return next;
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const partiallyFilledRows = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.description?.trim() && Number(row.amount) <= 0);
    if (partiallyFilledRows.length > 0) {
      setError(`Enter an amount for row ${partiallyFilledRows[0].index + 1}, or clear the extra text in that row.`);
      return;
    }

    const filledRows = rows.filter((row) => Number(row.amount) > 0);
    if (filledRows.length === 0) {
      setError('Enter at least one row with an amount.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.post('/banking/transactions/bulk', {
        rows: filledRows.map((row) => ({
          bankAccountId: row.bankAccountId,
          direction: row.direction,
          category: row.category,
          transactionDate: row.transactionDate,
          amount: Number(row.amount),
          description: row.description,
          farmerId: row.farmerId,
        })),
      });
      onRecorded();
    } catch (err) {
      setError(err.error || 'Failed to save bulk entries');
    } finally {
      setSubmitting(false);
    }
  }

  const filledRows = rows.filter((row) => Number(row.amount) > 0);
  const totalIn = filledRows.filter((r) => r.direction === 'INFLOW').reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalOut = filledRows.filter((r) => r.direction === 'OUTFLOW').reduce((s, r) => s + Number(r.amount || 0), 0);

  const content = (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="rounded-lg border border-error-100 bg-error-50 px-3 py-2 text-body text-error-700">{error}</div>}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowCategoryCreator((c) => !c)}
          className="text-body-medium font-medium text-brand-600 hover:text-brand-700"
        >
          {showCategoryCreator ? 'Close new category' : 'Add new category'}
        </button>
      </div>

      {showCategoryCreator && (
        <QuickCategoryCreator
          transactionCategories={transactionCategories}
          onCreated={async () => {
            await onCategoriesChanged();
            setShowCategoryCreator(false);
          }}
        />
      )}

      <div className="overflow-x-auto custom-scrollbar rounded-lg border border-surface-200">
        <table className="w-full min-w-[880px]">
          <thead className="sticky top-0 z-10 bg-surface-50">
            {/* V3 Meeting 3 fix: Farmer column removed from bulk entry — it was
                empty for most rows (only filled when category is FARMER_PAYMENT)
                and cluttered the table. Farmer payments still work from the
                single-entry "Record one" mode where the field is conditional. */}
            <tr className="border-b border-surface-200">
              <th className="px-3 py-2.5 text-left text-overline text-surface-500 w-[80px]">In / Out</th>
              <th className="px-3 py-2.5 text-left text-overline text-surface-500">Account</th>
              <th className="px-3 py-2.5 text-left text-overline text-surface-500">Category</th>
              <th className="px-3 py-2.5 text-left text-overline text-surface-500 w-[120px]">Date</th>
              <th className="px-3 py-2.5 text-right text-overline text-surface-500 w-[120px]">Amount</th>
              <th className="px-3 py-2.5 text-left text-overline text-surface-500">Description</th>
              <th className="px-3 py-2.5 text-left text-overline text-surface-500 w-[90px]"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const categories = categoryOptionsForDirection(row.direction, categoryMap, row.category);
              return (
                <tr key={row.id} className="border-b border-surface-50">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => updateRow(index, { direction: row.direction === 'INFLOW' ? 'OUTFLOW' : 'INFLOW' })}
                      className={`w-full rounded-md px-2 py-1.5 text-caption-medium font-semibold ${row.direction === 'INFLOW' ? 'bg-success-100 text-success-700' : 'bg-error-100 text-error-700'}`}
                    >
                      {row.direction === 'INFLOW' ? 'In' : 'Out'}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={row.bankAccountId}
                      onChange={(e) => updateRow(index, { bankAccountId: e.target.value })}
                      className="w-full rounded-md border border-surface-200 px-2 py-1.5 text-body outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>{displayAccountName(account)}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={row.category}
                      onChange={(e) => updateRow(index, { category: e.target.value })}
                      className="w-full rounded-md border border-surface-200 px-2 py-1.5 text-body outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>{categoryLabel(cat, categoryMap)}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      value={row.transactionDate}
                      onChange={(e) => updateRow(index, { transactionDate: e.target.value })}
                      className="w-full rounded-md border border-surface-200 px-2 py-1.5 text-body outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.amount}
                      onChange={(e) => updateRow(index, { amount: e.target.value })}
                      className="w-full rounded-md border border-surface-200 px-2 py-1.5 text-right text-body outline-none focus:ring-2 focus:ring-brand-500"
                      placeholder="0"
                    />
                  </td>
                  {/* V3 Meeting 3 fix: Farmer cell removed — use single-entry mode for farmer payments. */}
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={row.description}
                      onChange={(e) => updateRow(index, { description: e.target.value })}
                      className="w-full rounded-md border border-surface-200 px-2 py-1.5 text-body outline-none focus:ring-2 focus:ring-brand-500"
                      placeholder="e.g. GTBank – Mrs Balogun"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button type="button" onClick={() => duplicateRow(index)} title="Copy row" className="rounded px-1.5 py-1 text-caption text-surface-500 hover:bg-surface-100 hover:text-surface-700">Copy</button>
                      {rows.length > 1 && (
                        <button type="button" onClick={() => removeRow(index)} title="Remove row" className="rounded px-1.5 py-1 text-caption text-error-500 hover:bg-error-50 hover:text-error-700">Del</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={addRow} className="rounded-md border border-surface-200 px-3 py-2 text-body-medium text-surface-700 transition-colors duration-fast hover:bg-surface-50">
          + Add row
        </button>
        <div className="flex flex-wrap gap-4 text-body-medium">
          <span className="text-success-700">In: {fmtMoney(totalIn)}</span>
          <span className="text-error-600">Out: {fmtMoney(totalOut)}</span>
          <span className="font-semibold text-surface-900">Net: {fmtMoney(totalIn - totalOut)}</span>
        </div>
      </div>

      <ModalActions onClose={onClose} submitting={submitting} submitLabel={submitting ? 'Saving...' : `Save ${filledRows.length} ${filledRows.length === 1 ? 'entry' : 'entries'}`} />
    </form>
  );

  if (embedded) return content;

  return (
    <ModalShell title="Enter many at once" onClose={onClose} maxWidth="max-w-6xl">
      {content}
    </ModalShell>
  );
}
