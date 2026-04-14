import { useEffect, useMemo, useState } from 'react';
import { ModalShell, ModalActions, Field } from './shared/ui';
import { api } from '../../lib/api';
import { fmtDate, fmtMoney, displayAccountName } from './shared/constants';

/**
 * V3 Phase 2 — "Match a bank deposit" flow.
 *
 * Use case (from Meeting 3): the record keeper has already entered a bank
 * inflow manually (e.g. ₦94,400 arriving in the Customer Deposit Account),
 * and that inflow represents pooled cash that was physically taken to the bank.
 * Staff opens this modal, picks the bank inflow from a dropdown, ticks which
 * individual cash sales were in that deposit, and submits. The system records
 * a confirmed CashDepositBatch and the matching outflow from Cash on Hand.
 */
export default function MatchCashDepositModal({ onClose, onMatched }) {
  const [inflows, setInflows] = useState([]);
  const [inflowsLoading, setInflowsLoading] = useState(true);
  const [availableCash, setAvailableCash] = useState([]);
  const [cashLoading, setCashLoading] = useState(true);

  const [selectedInflowId, setSelectedInflowId] = useState('');
  const [selectedCashIds, setSelectedCashIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // V3 Phase 2 Fix 3: track how many matches were completed in this modal
  // session so the success banner reflects multi-inflow matching. The modal
  // stays open after each successful match so the user can keep matching
  // the next inflow without reopening.
  const [matchedCount, setMatchedCount] = useState(0);
  const [lastMatchMessage, setLastMatchMessage] = useState('');

  // Extract the loader so we can call it again after each successful match
  // to refresh the eligible inflows and unbanked cash sales lists.
  async function loadData() {
    setInflowsLoading(true);
    setCashLoading(true);
    try {
      const [inflowsRes, cashRes] = await Promise.all([
        api.get('/banking/cash-deposits/eligible-inflows'),
        api.get('/banking/cash-deposits/available'),
      ]);
      setInflows(inflowsRes.inflows || []);
      setAvailableCash(cashRes.transactions || []);
    } catch (err) {
      setError(err.error || 'Failed to load data.');
    } finally {
      setInflowsLoading(false);
      setCashLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedInflow = useMemo(
    () => inflows.find((inflow) => inflow.id === selectedInflowId) || null,
    [inflows, selectedInflowId],
  );

  const selectedCashTotal = useMemo(() => {
    return availableCash
      .filter((cash) => selectedCashIds.includes(cash.id))
      .reduce((sum, cash) => sum + Number(cash.availableAmount || 0), 0);
  }, [availableCash, selectedCashIds]);

  const bankAmount = selectedInflow ? Number(selectedInflow.amount) : 0;
  const difference = bankAmount - selectedCashTotal;
  const amountsMatch = selectedInflow && selectedCashIds.length > 0 && Math.abs(difference) <= 0.01;

  function toggleCashSale(id) {
    setSelectedCashIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!selectedInflow) {
      setError('Pick the bank inflow that represents this deposit.');
      return;
    }
    if (selectedCashIds.length === 0) {
      setError('Tick at least one cash sale that was in the deposit.');
      return;
    }
    if (!amountsMatch) {
      setError(`Selected cash sales total ${fmtMoney(selectedCashTotal)} but the bank inflow is ${fmtMoney(bankAmount)}. They must match.`);
      return;
    }
    const inflowDescription = selectedInflow.description || fmtMoney(bankAmount);
    setSubmitting(true);
    setError('');
    try {
      await api.post('/banking/cash-deposits/confirm-from-bank', {
        bankTransactionId: selectedInflow.id,
        cashSaleIds: selectedCashIds,
      });
      // V3 Fix 3: stay open for more matches. Reset the selection, bump the
      // counter, reload the lists so matched items disappear, and notify the
      // parent to refresh the Cash Sales workspace + transactions list.
      setMatchedCount((count) => count + 1);
      setLastMatchMessage(`Matched ${fmtMoney(bankAmount)} — ${inflowDescription}`);
      setSelectedInflowId('');
      setSelectedCashIds([]);
      await loadData();
      onMatched?.();
    } catch (err) {
      setError(err.error || 'Failed to record this deposit match.');
    } finally {
      setSubmitting(false);
    }
  }

  // V3 Fix 3: separate close action so we can distinguish "done matching, keep
  // working" (onMatched was already called during each match) from explicit dismiss.
  function handleDone() {
    onClose?.();
  }

  return (
    <ModalShell title="Match a bank deposit" onClose={onClose} maxWidth="max-w-4xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-lg border border-info-200 bg-info-50 px-4 py-3 text-sm text-info-800">
          Pick the bank inflow you already recorded for a cash deposit, then tick the cash
          sales that made it up. The amounts must match exactly. The form stays open after
          each match so you can process several deposits in one session.
        </div>

        {/* V3 Fix 3: running success banner — shows after each match so the user
            can see progress while continuing to match more inflows. */}
        {matchedCount > 0 && (
          <div className="rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800">
            <p className="font-semibold">
              {matchedCount} deposit{matchedCount === 1 ? '' : 's'} matched this session.
            </p>
            {lastMatchMessage ? <p className="mt-1 text-caption">{lastMatchMessage}</p> : null}
            {inflows.length === 0 && (
              <p className="mt-1 text-caption">No more eligible inflows to match. You can close this window.</p>
            )}
          </div>
        )}

        {error ? (
          <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">
            {error}
          </div>
        ) : null}

        {/* Step 1: pick the bank inflow */}
        <Field label="Bank inflow">
          {inflowsLoading ? (
            <p className="text-body text-surface-500">Loading eligible inflows…</p>
          ) : inflows.length === 0 ? (
            <p className="text-body text-surface-500">
              No eligible bank inflows. Record the bank deposit first (from the Transactions tab) with
              category <span className="font-medium">Cash deposit confirmation</span> or{' '}
              <span className="font-medium">Unallocated income</span>, then come back here to match it.
            </p>
          ) : (
            <select
              value={selectedInflowId}
              onChange={(event) => {
                setSelectedInflowId(event.target.value);
                setSelectedCashIds([]);
                setError('');
              }}
              className="w-full rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-sm text-surface-900 outline-none transition-colors duration-fast focus:border-brand-500 focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Select an inflow…</option>
              {inflows.map((inflow) => (
                <option key={inflow.id} value={inflow.id}>
                  {fmtDate(inflow.transactionDate)} — {displayAccountName(inflow.bankAccount)} — {fmtMoney(inflow.amount)} {inflow.description ? `— ${inflow.description}` : ''}
                </option>
              ))}
            </select>
          )}
        </Field>

        {selectedInflow && (
          <div className="rounded-lg border border-surface-200 bg-surface-50 px-4 py-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <p className="text-caption text-surface-500">Date</p>
                <p className="text-body-medium text-surface-900">{fmtDate(selectedInflow.transactionDate)}</p>
              </div>
              <div>
                <p className="text-caption text-surface-500">Account</p>
                <p className="text-body-medium text-surface-900">{displayAccountName(selectedInflow.bankAccount)}</p>
              </div>
              <div>
                <p className="text-caption text-surface-500">Amount</p>
                <p className="text-heading font-bold text-surface-900">{fmtMoney(selectedInflow.amount)}</p>
              </div>
            </div>
            {selectedInflow.description ? (
              <p className="mt-2 text-caption text-surface-500">{selectedInflow.description}</p>
            ) : null}
          </div>
        )}

        {/* Step 2: tick the cash sales */}
        <div>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-body-medium font-semibold text-surface-900">Cash sales in this deposit</p>
              <p className="text-caption text-surface-500">
                Tick the individual cash sales that were pooled into the bank inflow above.
              </p>
            </div>
            {selectedInflow && (
              <div className="text-right">
                <p className="text-caption text-surface-500">Selected cash total</p>
                <p className={`text-body-medium font-semibold ${amountsMatch ? 'text-success-700' : 'text-surface-900'}`}>
                  {fmtMoney(selectedCashTotal)}
                </p>
                {selectedCashIds.length > 0 && !amountsMatch && (
                  <p className="text-caption text-error-600">
                    {difference > 0 ? 'Short by ' : 'Over by '}{fmtMoney(Math.abs(difference))}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="mt-3 overflow-hidden rounded-lg border border-surface-200 bg-surface-0">
            {cashLoading ? (
              <p className="px-4 py-4 text-body text-surface-500">Loading cash sales…</p>
            ) : availableCash.length === 0 ? (
              <p className="px-4 py-4 text-body text-surface-500">No unbanked cash sales.</p>
            ) : (
              <ul className="divide-y divide-surface-100 max-h-80 overflow-y-auto">
                {availableCash.map((cash) => {
                  const checked = selectedCashIds.includes(cash.id);
                  return (
                    <li key={cash.id}>
                      <label className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors duration-fast hover:bg-surface-50 ${checked ? 'bg-brand-50' : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCashSale(cash.id)}
                          className="h-4 w-4 rounded border-surface-300 text-brand-500 focus:ring-brand-500"
                        />
                        <div className="flex flex-1 items-center justify-between gap-3">
                          <div>
                            <p className="text-body-medium text-surface-900">
                              {cash.sale?.receiptNumber || 'Cash sale'}
                              {cash.customer?.name ? ` — ${cash.customer.name}` : ' — Walk-in'}
                            </p>
                            <p className="text-caption text-surface-500">
                              {fmtDate(cash.transactionDate, true)}
                              {cash.description ? ` · ${cash.description}` : ''}
                            </p>
                          </div>
                          <p className="text-body-medium font-semibold text-surface-900">
                            {fmtMoney(cash.availableAmount)}
                          </p>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* V3 Fix 3: "Close" replaces "Cancel" once the user has matched at least
            one deposit, since the work is already saved. Submit button is
            disabled while amounts don't match. */}
        <div className="flex flex-col-reverse gap-3 border-t border-surface-200 pt-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={handleDone}
            className="text-body-medium rounded-md px-4 py-2 text-surface-600 transition-colors duration-fast hover:bg-surface-100"
          >
            {matchedCount > 0 ? 'Close' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={submitting || !amountsMatch || inflows.length === 0}
            className="text-body-medium rounded-md bg-brand-600 px-4 py-2 text-surface-0 transition-colors duration-fast hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-surface-300"
          >
            {submitting
              ? 'Saving…'
              : matchedCount > 0
                ? 'Match the next one'
                : 'Confirm deposit match'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
