import { useEffect, useMemo, useState } from 'react';
import { ModalShell, ModalActions, Field } from './shared/ui';
import { api } from '../../lib/api';
import { fmtDate, fmtMoney, displayAccountName } from './shared/constants';

/**
 * V3 Phase 2 — "Match a bank deposit" flow (multi-inflow edition).
 *
 * Use case (from Meeting 3): the record keeper has already entered bank
 * inflows manually (e.g. two deposits of ₦47,200 each arriving in the
 * Customer Deposit Account), and those inflows represent pooled cash that
 * was physically taken to the bank. Staff opens this modal, ticks which
 * bank inflows to include, ticks which individual cash sales were in the
 * deposit, and submits. The system records a confirmed CashDepositBatch
 * and the matching outflow from Cash on Hand.
 *
 * Multiple inflows can be selected simultaneously — useful when cash was
 * deposited twice on the same day.
 */
export default function MatchCashDepositModal({ onClose, onMatched }) {
  const [inflows, setInflows] = useState([]);
  const [inflowsLoading, setInflowsLoading] = useState(true);
  const [availableCash, setAvailableCash] = useState([]);
  const [cashLoading, setCashLoading] = useState(true);

  const [selectedInflowIds, setSelectedInflowIds] = useState([]);
  const [selectedCashIds, setSelectedCashIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [matchedCount, setMatchedCount] = useState(0);
  const [lastMatchMessage, setLastMatchMessage] = useState('');

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

  const selectedInflowTotal = useMemo(() => {
    return inflows
      .filter((inflow) => selectedInflowIds.includes(inflow.id))
      .reduce((sum, inflow) => sum + Number(inflow.amount || 0), 0);
  }, [inflows, selectedInflowIds]);

  const selectedCashTotal = useMemo(() => {
    return availableCash
      .filter((cash) => selectedCashIds.includes(cash.id))
      .reduce((sum, cash) => sum + Number(cash.availableAmount || 0), 0);
  }, [availableCash, selectedCashIds]);

  const difference = selectedInflowTotal - selectedCashTotal;
  const amountsMatch = selectedInflowIds.length > 0 && selectedCashIds.length > 0 && Math.abs(difference) <= 0.01;

  // Check that all selected inflows are on the same bank account
  const selectedInflowAccounts = useMemo(() => {
    const accounts = new Set();
    inflows
      .filter((inflow) => selectedInflowIds.includes(inflow.id))
      .forEach((inflow) => accounts.add(inflow.bankAccountId || inflow.bankAccount?.id));
    return accounts;
  }, [inflows, selectedInflowIds]);
  const sameAccount = selectedInflowAccounts.size <= 1;

  function toggleInflow(id) {
    setSelectedInflowIds((current) =>
      current.includes(id) ? current.filter((v) => v !== id) : [...current, id],
    );
    setError('');
  }

  function toggleCashSale(id) {
    setSelectedCashIds((current) =>
      current.includes(id) ? current.filter((v) => v !== id) : [...current, id],
    );
  }

  function selectAllInflows() {
    if (selectedInflowIds.length === inflows.length) {
      setSelectedInflowIds([]);
    } else {
      setSelectedInflowIds(inflows.map((i) => i.id));
    }
    setError('');
  }

  function selectAllCash() {
    if (selectedCashIds.length === availableCash.length) {
      setSelectedCashIds([]);
    } else {
      setSelectedCashIds(availableCash.map((c) => c.id));
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (selectedInflowIds.length === 0) {
      setError('Tick at least one bank inflow that represents this deposit.');
      return;
    }
    if (selectedCashIds.length === 0) {
      setError('Tick at least one cash sale that was in the deposit.');
      return;
    }
    if (!sameAccount) {
      setError('All selected inflows must be on the same bank account.');
      return;
    }
    if (!amountsMatch) {
      setError(`Selected cash sales total ${fmtMoney(selectedCashTotal)} but the bank inflow${selectedInflowIds.length > 1 ? 's total' : ' is'} ${fmtMoney(selectedInflowTotal)}. They must match.`);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.post('/banking/cash-deposits/confirm-from-bank', {
        bankTransactionIds: selectedInflowIds,
        cashSaleIds: selectedCashIds,
      });
      const inflowLabel = selectedInflowIds.length > 1
        ? `${selectedInflowIds.length} inflows totalling ${fmtMoney(selectedInflowTotal)}`
        : fmtMoney(selectedInflowTotal);
      setMatchedCount((count) => count + 1);
      setLastMatchMessage(`Matched ${inflowLabel} to ${selectedCashIds.length} cash sale${selectedCashIds.length === 1 ? '' : 's'}`);
      setSelectedInflowIds([]);
      setSelectedCashIds([]);
      await loadData();
      onMatched?.();
    } catch (err) {
      setError(err.error || 'Failed to record this deposit match.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleDone() {
    onClose?.();
  }

  return (
    <ModalShell title="Match a bank deposit" onClose={onClose} maxWidth="max-w-4xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-lg border border-info-200 bg-info-50 px-4 py-3 text-sm text-info-800">
          Select the bank deposit(s), then select the cash sales that were included. Totals must match.
        </div>

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

        {/* Step 1: tick the bank inflows */}
        <div>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-body-medium font-semibold text-surface-900">Bank inflows</p>
              <p className="text-caption text-surface-500">
                Tick the bank deposit(s) that represent cash taken to the bank.
              </p>
            </div>
            {selectedInflowIds.length > 0 && (
              <div className="text-right">
                <p className="text-caption text-surface-500">Selected inflow total</p>
                <p className="text-body-medium font-semibold text-surface-900">
                  {fmtMoney(selectedInflowTotal)}
                </p>
                {selectedInflowIds.length > 1 && (
                  <p className="text-caption text-surface-500">
                    {selectedInflowIds.length} inflow{selectedInflowIds.length === 1 ? '' : 's'}
                  </p>
                )}
                {!sameAccount && (
                  <p className="text-caption text-error-600">
                    Must be same account
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="mt-3 overflow-hidden rounded-lg border border-surface-200 bg-surface-0">
            {inflowsLoading ? (
              <p className="px-4 py-4 text-body text-surface-500">Loading eligible inflows…</p>
            ) : inflows.length === 0 ? (
              <div className="px-4 py-4">
                <p className="text-body text-surface-500">
                  No eligible bank inflows. Record the bank deposit first (from the Transactions tab) with
                  category <span className="font-medium">Cash deposit confirmation</span> or{' '}
                  <span className="font-medium">Unallocated income</span>, then come back here to match it.
                </p>
              </div>
            ) : (
              <>
                {inflows.length > 1 && (
                  <div className="border-b border-surface-100 px-4 py-2 bg-surface-50">
                    <label className="flex cursor-pointer items-center gap-2 text-caption font-medium text-surface-600">
                      <input
                        type="checkbox"
                        checked={selectedInflowIds.length === inflows.length}
                        onChange={selectAllInflows}
                        className="h-3.5 w-3.5 rounded border-surface-300 text-brand-500 focus:ring-brand-500"
                      />
                      {selectedInflowIds.length === inflows.length ? 'Deselect all' : 'Select all'}
                    </label>
                  </div>
                )}
                <ul className="divide-y divide-surface-100 max-h-52 overflow-y-auto">
                  {inflows.map((inflow) => {
                    const checked = selectedInflowIds.includes(inflow.id);
                    return (
                      <li key={inflow.id}>
                        <label className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors duration-fast hover:bg-surface-50 ${checked ? 'bg-brand-50' : ''}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleInflow(inflow.id)}
                            className="h-4 w-4 rounded border-surface-300 text-brand-500 focus:ring-brand-500"
                          />
                          <div className="flex flex-1 items-center justify-between gap-3">
                            <div>
                              <p className="text-body-medium text-surface-900">
                                {displayAccountName(inflow.bankAccount)}
                              </p>
                              <p className="text-caption text-surface-500">
                                {fmtDate(inflow.transactionDate, true)}
                                {inflow.description ? ` · ${inflow.description}` : ''}
                                {inflow.reference ? ` · Ref: ${inflow.reference}` : ''}
                              </p>
                            </div>
                            <p className="text-body-medium font-semibold text-success-700 whitespace-nowrap">
                              {fmtMoney(inflow.amount)}
                            </p>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </div>

        {/* Step 2: tick the cash sales */}
        <div>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-body-medium font-semibold text-surface-900">Cash sales in this deposit</p>
              <p className="text-caption text-surface-500">
                Tick the individual cash sales that were pooled into the bank deposit above.
              </p>
            </div>
            {(selectedInflowIds.length > 0 || selectedCashIds.length > 0) && (
              <div className="text-right">
                <p className="text-caption text-surface-500">Selected cash total</p>
                <p className={`text-body-medium font-semibold ${amountsMatch ? 'text-success-700' : 'text-surface-900'}`}>
                  {fmtMoney(selectedCashTotal)}
                </p>
                {selectedCashIds.length > 0 && !amountsMatch && selectedInflowIds.length > 0 && (
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
              <>
                {availableCash.length > 1 && (
                  <div className="border-b border-surface-100 px-4 py-2 bg-surface-50">
                    <label className="flex cursor-pointer items-center gap-2 text-caption font-medium text-surface-600">
                      <input
                        type="checkbox"
                        checked={selectedCashIds.length === availableCash.length}
                        onChange={selectAllCash}
                        className="h-3.5 w-3.5 rounded border-surface-300 text-brand-500 focus:ring-brand-500"
                      />
                      {selectedCashIds.length === availableCash.length ? 'Deselect all' : 'Select all'}
                    </label>
                  </div>
                )}
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
                            <p className="text-body-medium font-semibold text-surface-900 whitespace-nowrap">
                              {fmtMoney(cash.availableAmount)}
                            </p>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </div>

        {/* Amount comparison summary — shown when both sides have selections */}
        {selectedInflowIds.length > 0 && selectedCashIds.length > 0 && (
          <div className={`rounded-lg border px-4 py-3 ${amountsMatch ? 'border-success-200 bg-success-50' : 'border-warning-200 bg-warning-50'}`}>
            <div className="flex items-center justify-between gap-4 text-sm">
              <div>
                <span className="font-medium">{selectedInflowIds.length} inflow{selectedInflowIds.length === 1 ? '' : 's'}</span>
                <span className="mx-1.5 text-surface-400">→</span>
                <span className="font-semibold">{fmtMoney(selectedInflowTotal)}</span>
              </div>
              <div className={`text-lg font-bold ${amountsMatch ? 'text-success-700' : 'text-warning-700'}`}>
                {amountsMatch ? '=' : '≠'}
              </div>
              <div className="text-right">
                <span className="font-medium">{selectedCashIds.length} cash sale{selectedCashIds.length === 1 ? '' : 's'}</span>
                <span className="mx-1.5 text-surface-400">→</span>
                <span className="font-semibold">{fmtMoney(selectedCashTotal)}</span>
              </div>
            </div>
            {!amountsMatch && (
              <p className="mt-1 text-center text-caption text-warning-700">
                {difference > 0 ? `Cash sales are short by ${fmtMoney(Math.abs(difference))}` : `Cash sales exceed inflows by ${fmtMoney(Math.abs(difference))}`}
              </p>
            )}
          </div>
        )}

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
            disabled={submitting || !amountsMatch || !sameAccount || inflows.length === 0}
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
