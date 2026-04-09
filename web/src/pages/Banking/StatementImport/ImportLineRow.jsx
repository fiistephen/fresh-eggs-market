import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { DIRECTION_COLORS, categoryOptionsForDirection, categoryLabel, fmtMoney, fmtDate } from '../shared/constants';

function prettifyToken(value) {
  const token = String(value || '').trim();
  if (!token) return '';
  if (!/[a-z]/i.test(token)) return token;
  if (token.length <= 3) return token.toUpperCase();
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

function prettifyPhrase(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(prettifyToken)
    .join(' ');
}

function autoCleanDescription(description) {
  const normalized = String(description || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  const fromMatch = normalized.match(/FROM\s+(.+?)(?:\s*-\s*(?:IB|NIP|REF|REVERSAL|TRF|TRANSFER)\b|$)/i);
  const source = (fromMatch?.[1] || normalized).trim();
  const parts = source.split('/').map((part) => part.trim()).filter(Boolean);

  if (parts.length >= 2) {
    return [prettifyPhrase(parts[0]), prettifyPhrase(parts.slice(1).join(' / '))].filter(Boolean).join(' - ');
  }

  return prettifyPhrase(source);
}

function candidateSummary(candidate) {
  if (!candidate) return '';
  const parts = [];
  if (candidate.confidence === 'exact') parts.push('Exact match');
  else if (candidate.confidence === 'strong') parts.push('Same amount, close date');
  else if (candidate.confidence === 'likely') parts.push('Same amount');
  else if (candidate.confidence) parts.push('Possible match');
  if (candidate.depositDate) parts.push(fmtDate(candidate.depositDate));
  return parts.join(' · ');
}

export default function ImportLineRow({ line, bankAccountId, categoryMap, selected, onToggleSelected, onSaved }) {
  const [draft, setDraft] = useState({
    description: line.description || '',
    selectedCategory: line.selectedCategory || line.suggestedCategory || '',
    reviewStatus: line.reviewStatus,
    notes: line.notes || autoCleanDescription(line.description || ''),
    matchedCashDepositBatchId: line.matchedCashDepositBatch?.id || '',
  });
  const [saving, setSaving] = useState(false);
  const [matchCandidates, setMatchCandidates] = useState([]);
  const [matchingLoading, setMatchingLoading] = useState(false);
  const [matchingError, setMatchingError] = useState('');
  const categories = categoryOptionsForDirection(line.direction, categoryMap, draft.selectedCategory);
  const amount = line.direction === 'OUTFLOW' ? line.debitAmount : line.creditAmount;
  const isPosted = line.reviewStatus === 'POSTED';
  const needsCashDepositMatch = draft.selectedCategory === 'CASH_DEPOSIT_CONFIRMATION';

  useEffect(() => {
    let active = true;

    async function loadCandidates() {
      if (!needsCashDepositMatch || !bankAccountId || !amount || isPosted) {
        setMatchCandidates([]);
        setMatchingError('');
        return;
      }

      setMatchingLoading(true);
      setMatchingError('');
      try {
        const params = new URLSearchParams({
          bankAccountId,
          amount: String(amount),
          transactionDate: String(line.transactionDate || line.actualTransactionDate || line.valueDate || ''),
        });
        const response = await api.get(`/banking/cash-deposits/match-candidates?${params.toString()}`);
        if (!active) return;
        const candidates = response.candidates || [];
        setMatchCandidates(candidates);
        setDraft((current) => {
          if (current.matchedCashDepositBatchId || !candidates.length) return current;
          const exactCandidate = candidates.find((entry) => entry.confidence === 'exact');
          return exactCandidate
            ? { ...current, matchedCashDepositBatchId: exactCandidate.id }
            : current;
        });
      } catch (err) {
        if (!active) return;
        setMatchingError(err.error || 'Could not load pending cash deposits');
      } finally {
        if (active) setMatchingLoading(false);
      }
    }

    loadCandidates();
    return () => {
      active = false;
    };
  }, [amount, bankAccountId, isPosted, line.actualTransactionDate, line.transactionDate, line.valueDate, needsCashDepositMatch]);

  async function saveLine() {
    setSaving(true);
    try {
      await api.patch(`/banking/imports/${line.importId}/lines/${line.id}`, {
        ...draft,
        matchedCashDepositBatchId: draft.matchedCashDepositBatchId || null,
      });
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
        <div className="min-w-[320px] space-y-2">
          <div className="text-caption-medium uppercase tracking-wide text-surface-400">Original bank narration</div>
          <textarea
            value={draft.description}
            onChange={(e) => setDraft((c) => ({ ...c, description: e.target.value }))}
            rows={3}
            disabled={isPosted}
            className="w-full rounded-md border border-surface-200 px-2 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-surface-100"
          />
        </div>
      </td>
      <td className="px-4 py-3 text-body">
        <span className={`font-medium ${DIRECTION_COLORS[line.direction]}`}>{line.direction || '—'}</span>
      </td>
      <td className={`px-4 py-3 text-right text-body-medium font-semibold ${DIRECTION_COLORS[line.direction]}`}>
        {fmtMoney(amount)}
      </td>
      <td className="px-4 py-3">
        <select
          value={draft.selectedCategory}
          onChange={(e) => setDraft((c) => ({
            ...c,
            selectedCategory: e.target.value,
            matchedCashDepositBatchId: e.target.value === 'CASH_DEPOSIT_CONFIRMATION' ? c.matchedCashDepositBatchId : '',
          }))}
          disabled={isPosted}
          className="w-full rounded-md border border-surface-200 px-2 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-surface-100"
        >
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
        <div className="min-w-[260px] space-y-2">
          <div className="text-caption-medium uppercase tracking-wide text-surface-400">Clean description</div>
          <textarea
            value={draft.notes}
            onChange={(e) => setDraft((c) => ({ ...c, notes: e.target.value }))}
            rows={2}
            disabled={isPosted}
            placeholder="Bank name - Depositor name"
            className="w-full rounded-md border border-surface-200 px-2 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-surface-100"
          />
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="min-w-[260px] space-y-2">
          {needsCashDepositMatch ? (
            <>
              <select
                value={draft.matchedCashDepositBatchId}
                onChange={(e) => setDraft((c) => ({ ...c, matchedCashDepositBatchId: e.target.value }))}
                disabled={isPosted || matchingLoading}
                className="w-full rounded-md border border-surface-200 px-2 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-surface-100"
              >
                <option value="">Choose pending deposit</option>
                {matchCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {fmtMoney(candidate.amount)} · {candidateSummary(candidate)}
                  </option>
                ))}
              </select>
              {draft.matchedCashDepositBatchId ? (
                <p className="text-caption text-surface-500">
                  {candidateSummary(matchCandidates.find((candidate) => candidate.id === draft.matchedCashDepositBatchId) || line.matchedCashDepositBatch || {})}
                </p>
              ) : null}
              {!matchingLoading && !matchingError && matchCandidates.length === 0 ? (
                <p className="text-caption text-surface-400">No pending cash deposit found for this amount and date.</p>
              ) : null}
              {matchingLoading ? <p className="text-caption text-surface-400">Finding possible matches…</p> : null}
              {matchingError ? <p className="text-caption text-error-600">{matchingError}</p> : null}
            </>
          ) : line.matchedCashDepositBatch ? (
            <div className="rounded-md border border-surface-200 bg-surface-50 px-3 py-2 text-caption text-surface-600">
              {fmtMoney(line.matchedCashDepositBatch.amount)} · {fmtDate(line.matchedCashDepositBatch.depositDate)}
            </div>
          ) : (
            <span className="text-caption text-surface-400">—</span>
          )}
        </div>
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
