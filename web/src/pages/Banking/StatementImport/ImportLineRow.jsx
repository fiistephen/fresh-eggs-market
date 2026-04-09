import { useState } from 'react';
import { api } from '../../../lib/api';
import { DIRECTION_COLORS, categoryOptionsForDirection, categoryLabel, fmtMoney, fmtDate } from '../shared/constants';

export default function ImportLineRow({ line, categoryMap, selected, onToggleSelected, onSaved }) {
  const [draft, setDraft] = useState({
    selectedCategory: line.selectedCategory || line.suggestedCategory || '',
    reviewStatus: line.reviewStatus,
    notes: line.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const categories = categoryOptionsForDirection(line.direction, categoryMap, draft.selectedCategory);
  const amount = line.direction === 'OUTFLOW' ? line.debitAmount : line.creditAmount;
  const isPosted = line.reviewStatus === 'POSTED';

  async function saveLine() {
    setSaving(true);
    try {
      await api.patch(`/banking/imports/${line.importId}/lines/${line.id}`, draft);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-b border-surface-50 align-top">
      <td className="px-4 py-3">
        <input type="checkbox" checked={selected} disabled={isPosted} onChange={(e) => onToggleSelected(line.id, e.target.checked)} />
      </td>
      <td className="px-4 py-3 text-body text-surface-500">{line.lineNumber}</td>
      <td className="px-4 py-3 text-body text-surface-600">{fmtDate(line.transactionDate || line.actualTransactionDate || line.valueDate)}</td>
      <td className="px-4 py-3 text-body text-surface-700">
        <div className="max-w-sm truncate font-medium">{line.description}</div>
        {line.docNum && <div className="mt-1 text-caption text-surface-400">Ref {line.docNum}</div>}
      </td>
      <td className="px-4 py-3 text-body">
        <span className={`font-medium ${DIRECTION_COLORS[line.direction]}`}>{line.direction || '—'}</span>
      </td>
      <td className={`px-4 py-3 text-right text-body-medium font-semibold ${DIRECTION_COLORS[line.direction]}`}>
        {fmtMoney(amount)}
      </td>
      <td className="px-4 py-3">
        <select value={draft.selectedCategory} onChange={(e) => setDraft((c) => ({ ...c, selectedCategory: e.target.value }))} disabled={isPosted} className="w-full rounded-md border border-surface-200 px-2 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-surface-100">
          <option value="">Choose category</option>
          {categories.map((cat) => <option key={cat} value={cat}>{categoryLabel(cat, categoryMap)}</option>)}
        </select>
      </td>
      <td className="px-4 py-3">
        <select value={draft.reviewStatus} onChange={(e) => setDraft((c) => ({ ...c, reviewStatus: e.target.value }))} disabled={isPosted} className="w-full rounded-md border border-surface-200 px-2 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-surface-100">
          <option value="PENDING_REVIEW">Pending</option>
          <option value="READY_TO_POST">Ready</option>
          <option value="SKIPPED">Skipped</option>
          <option value="DUPLICATE">Duplicate</option>
          {isPosted && <option value="POSTED">Posted</option>}
        </select>
      </td>
      <td className="px-4 py-3">
        <textarea value={draft.notes} onChange={(e) => setDraft((c) => ({ ...c, notes: e.target.value }))} rows={2} disabled={isPosted} placeholder="Bank name – Depositor name" className="w-full rounded-md border border-surface-200 px-2 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-surface-100" />
      </td>
      <td className="px-4 py-3">
        {isPosted ? (
          <span className="text-caption-medium font-medium text-success-700">Posted</span>
        ) : (
          <button onClick={saveLine} disabled={saving} className="rounded-md border border-surface-200 px-3 py-2 text-body-medium font-medium text-surface-700 transition-colors duration-fast hover:bg-surface-50 disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? '…' : 'Save'}
          </button>
        )}
      </td>
    </tr>
  );
}
