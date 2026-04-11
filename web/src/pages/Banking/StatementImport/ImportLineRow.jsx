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

function portalCandidateSummary(candidate) {
  if (!candidate) return '';
  const parts = [];
  if (candidate.reference) parts.push(candidate.reference);
  if (candidate.customer?.name) parts.push(candidate.customer.name);
  if (candidate.batch?.name) parts.push(candidate.batch.name);
  if (candidate.adminConfirmedAt) parts.push(fmtDate(candidate.adminConfirmedAt));
  return parts.join(' · ');
}

export default function ImportLineRow({ line, bankAccountId, categoryMap, farmers = [], selected, onToggleSelected, onSaved }) {
  const [draft, setDraft] = useState({
    description: line.description || '',
    selectedCategory: line.selectedCategory || line.suggestedCategory || '',
    reviewStatus: line.reviewStatus,
    notes: line.notes || autoCleanDescription(line.description || ''),
    selectedFarmerId: line.selectedFarmer?.id || '',
    matchedCashDepositBatchId: line.matchedCashDepositBatch?.id || '',
    selectedPortalCheckoutId: line.selectedPortalCheckout?.id || '',
  });
  const [saving, setSaving] = useState(false);
  const [matchCandidates, setMatchCandidates] = useState([]);
  const [matchingLoading, setMatchingLoading] = useState(false);
  const [matchingError, setMatchingError] = useState('');
  const [portalCandidates, setPortalCandidates] = useState([]);
  const [portalMatchingLoading, setPortalMatchingLoading] = useState(false);
  const [portalMatchingError, setPortalMatchingError] = useState('');
  const categories = categoryOptionsForDirection(line.direction, categoryMap, draft.selectedCategory);
  const amount = line.direction === 'OUTFLOW' ? line.debitAmount : line.creditAmount;
  const isPosted = line.reviewStatus === 'POSTED';
  const needsCashDepositMatch = draft.selectedCategory === 'CASH_DEPOSIT_CONFIRMATION';
  const needsPortalBookingMatch = draft.selectedCategory === 'CUSTOMER_BOOKING';
  const needsFarmer = draft.selectedCategory === 'FARMER_PAYMENT';

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

  useEffect(() => {
    let active = true;

    async function loadPortalCandidates() {
      if (!needsPortalBookingMatch || !amount || isPosted) {
        setPortalCandidates([]);
        setPortalMatchingError('');
        return;
      }

      setPortalMatchingLoading(true);
      setPortalMatchingError('');
      try {
        const params = new URLSearchParams({
          amount: String(amount),
          transactionDate: String(line.transactionDate || line.actualTransactionDate || line.valueDate || ''),
          ...(line.selectedCustomerId ? { customerId: line.selectedCustomerId } : {}),
        });
        const response = await api.get(`/banking/portal-booking-match-candidates?${params.toString()}`);
        if (!active) return;
        const candidates = response.candidates || [];
        setPortalCandidates(candidates);
        setDraft((current) => {
          if (current.selectedPortalCheckoutId || !candidates.length) return current;
          return candidates.length === 1
            ? { ...current, selectedPortalCheckoutId: candidates[0].id }
            : current;
        });
      } catch (err) {
        if (!active) return;
        setPortalMatchingError(err.error || 'Could not load portal booking matches');
      } finally {
        if (active) setPortalMatchingLoading(false);
      }
    }

    loadPortalCandidates();
    return () => {
      active = false;
    };
  }, [amount, isPosted, line.actualTransactionDate, line.selectedCustomerId, line.transactionDate, line.valueDate, needsPortalBookingMatch]);

  async function saveLine() {
    setSaving(true);
    try {
      await api.patch(`/banking/imports/${line.importId}/lines/${line.id}`, {
        ...draft,
        selectedFarmerId: draft.selectedFarmerId || null,
        matchedCashDepositBatchId: draft.matchedCashDepositBatchId || null,
        selectedPortalCheckoutId: draft.selectedPortalCheckoutId || null,
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
            selectedFarmerId: e.target.value === 'FARMER_PAYMENT' ? c.selectedFarmerId : '',
            matchedCashDepositBatchId: e.target.value === 'CASH_DEPOSIT_CONFIRMATION' ? c.matchedCashDepositBatchId : '',
            selectedPortalCheckoutId: e.target.value === 'CUSTOMER_BOOKING' ? c.selectedPortalCheckoutId : '',
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
          ) : needsPortalBookingMatch ? (
            <>
              <select
                value={draft.selectedPortalCheckoutId}
                onChange={(e) => setDraft((c) => ({ ...c, selectedPortalCheckoutId: e.target.value }))}
                disabled={isPosted || portalMatchingLoading}
                className="w-full rounded-md border border-surface-200 px-2 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-surface-100"
              >
                <option value="">Choose portal booking</option>
                {portalCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {fmtMoney(candidate.amountToPay)} · {portalCandidateSummary(candidate)}
                  </option>
                ))}
              </select>
              {draft.selectedPortalCheckoutId ? (
                <p className="text-caption text-surface-500">
                  {portalCandidateSummary(portalCandidates.find((candidate) => candidate.id === draft.selectedPortalCheckoutId) || line.selectedPortalCheckout || {})}
                </p>
              ) : null}
              {!portalMatchingLoading && !portalMatchingError && portalCandidates.length === 0 ? (
                <p className="text-caption text-surface-400">No admin-confirmed portal booking matches were found for this amount and date.</p>
              ) : null}
              {portalMatchingLoading ? <p className="text-caption text-surface-400">Finding portal booking matches…</p> : null}
              {portalMatchingError ? <p className="text-caption text-error-600">{portalMatchingError}</p> : null}
            </>
          ) : needsFarmer ? (
            <>
              <select
                value={draft.selectedFarmerId}
                onChange={(e) => setDraft((c) => ({ ...c, selectedFarmerId: e.target.value }))}
                disabled={isPosted}
                className="w-full rounded-md border border-surface-200 px-2 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-surface-100"
              >
                <option value="">Choose farmer</option>
                {farmers.map((farmer) => (
                  <option key={farmer.id} value={farmer.id}>
                    {farmer.name}
                  </option>
                ))}
              </select>
              <p className="text-caption text-surface-500">This payment will increase the farmer’s prepaid balance.</p>
            </>
          ) : line.matchedCashDepositBatch ? (
            <div className="rounded-md border border-surface-200 bg-surface-50 px-3 py-2 text-caption text-surface-600">
              {fmtMoney(line.matchedCashDepositBatch.amount)} · {fmtDate(line.matchedCashDepositBatch.depositDate)}
            </div>
          ) : line.selectedPortalCheckout ? (
            <div className="rounded-md border border-surface-200 bg-surface-50 px-3 py-2 text-caption text-surface-600">
              {portalCandidateSummary(line.selectedPortalCheckout)}
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
