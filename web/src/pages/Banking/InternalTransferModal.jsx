import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { displayAccountName, fmtDate, fmtMoney, todayStr } from './shared/constants';
import { ModalShell, ModalActions, Field } from './shared/ui';

function ageLabel(hours) {
  if (hours == null) return '—';
  if (hours < 24) return `${Math.max(1, Math.floor(hours))}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function InternalTransferModal({ accounts, onClose, onRecorded }) {
  const cashAccount = accounts.find((a) => a.accountType === 'CASH_ON_HAND');
  const customerDepositAccount = accounts.find((a) => a.accountType === 'CUSTOMER_DEPOSIT');
  const [form, setForm] = useState({
    fromAccountId: cashAccount?.id || accounts[0]?.id || '',
    toAccountId: customerDepositAccount?.id || accounts[1]?.id || accounts[0]?.id || '',
    amount: '',
    description: '',
    transactionDate: todayStr(),
  });
  const [availableCashSales, setAvailableCashSales] = useState([]);
  const [cashSalesLoading, setCashSalesLoading] = useState(false);
  const [selectedCashTransactionIds, setSelectedCashTransactionIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isCashDepositFlow = form.fromAccountId === cashAccount?.id && form.toAccountId === customerDepositAccount?.id;

  useEffect(() => {
    if (!isCashDepositFlow || !form.transactionDate) {
      setAvailableCashSales([]);
      setSelectedCashTransactionIds([]);
      return;
    }

    let cancelled = false;

    async function loadAvailableCashSales() {
      setCashSalesLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ upToDate: form.transactionDate });
        const data = await api.get(`/banking/cash-deposits/available?${params.toString()}`);
        if (cancelled) return;
        const nextTransactions = data.transactions || [];
        setAvailableCashSales(nextTransactions);
        setSelectedCashTransactionIds((current) => current.filter((id) => nextTransactions.some((entry) => entry.id === id)));
      } catch (err) {
        if (!cancelled) {
          setError(err.error || 'Failed to load available cash sales.');
        }
      } finally {
        if (!cancelled) setCashSalesLoading(false);
      }
    }

    loadAvailableCashSales();
    return () => {
      cancelled = true;
    };
  }, [isCashDepositFlow, form.transactionDate]);

  const selectedCashSales = useMemo(
    () => availableCashSales.filter((entry) => selectedCashTransactionIds.includes(entry.id)),
    [availableCashSales, selectedCashTransactionIds],
  );
  const selectedTotal = useMemo(
    () => selectedCashSales.reduce((sum, entry) => sum + Number(entry.availableAmount || 0), 0),
    [selectedCashSales],
  );
  const totalAvailableCash = useMemo(
    () => availableCashSales.reduce((sum, entry) => sum + Number(entry.availableAmount || 0), 0),
    [availableCashSales],
  );

  useEffect(() => {
    if (isCashDepositFlow) {
      setForm((current) => ({ ...current, amount: selectedTotal ? String(selectedTotal) : '' }));
    }
  }, [isCashDepositFlow, selectedTotal]);

  function toggleCashSale(id) {
    setSelectedCashTransactionIds((current) => (
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    ));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post('/banking/transfers/internal', {
        ...form,
        amount: Number(form.amount),
        selectedCashTransactionIds: isCashDepositFlow ? selectedCashTransactionIds : undefined,
      });
      onRecorded();
    } catch (err) {
      setError(err.error || 'Failed to save transfer');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title="Move money between accounts" onClose={onClose} maxWidth="max-w-5xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error ? <div className="rounded-lg border border-error-100 bg-error-50 px-3 py-2 text-body text-error-700">{error}</div> : null}

        <div className="rounded-lg border border-warning-100 bg-warning-50 px-4 py-3 text-body text-warning-700">
          {isCashDepositFlow ? (
            <>
              Select the exact cash sales you are taking to the bank. This move will stay <span className="font-semibold">pending</span> until a matching inflow is confirmed from a bank statement.
            </>
          ) : (
            <>
              Use this when money moves from one account to another inside the business.
            </>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="From account">
            <select value={form.fromAccountId} onChange={(e) => setForm((c) => ({ ...c, fromAccountId: e.target.value }))} className="w-full rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500">
              {accounts.map((a) => <option key={a.id} value={a.id}>{displayAccountName(a)}</option>)}
            </select>
          </Field>
          <Field label="To account">
            <select value={form.toAccountId} onChange={(e) => setForm((c) => ({ ...c, toAccountId: e.target.value }))} className="w-full rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500">
              {accounts.map((a) => <option key={a.id} value={a.id}>{displayAccountName(a)}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Amount (₦)">
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((c) => ({ ...c, amount: e.target.value }))}
              readOnly={isCashDepositFlow}
              className="w-full rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500 read-only:bg-surface-50 read-only:text-surface-600"
              required
            />
          </Field>
          <Field label="Transfer date">
            <input type="date" value={form.transactionDate} onChange={(e) => setForm((c) => ({ ...c, transactionDate: e.target.value }))} className="w-full rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500" required />
          </Field>
        </div>

        <Field label="Description (optional)">
          <input type="text" value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} placeholder="e.g. Cash deposit at Providus" className="w-full rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500" />
        </Field>

        {isCashDepositFlow ? (
          <div className="space-y-3 rounded-lg border border-surface-200 bg-surface-0 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-body-medium font-semibold text-surface-900">Cash sales to include in this deposit</p>
                <p className="mt-1 text-body text-surface-500">Choose the exact cash sales you are banking together for {form.transactionDate} and earlier.</p>
              </div>
              <div className="text-right">
                <p className="text-caption text-surface-500">Selected total</p>
                <p className="text-body-medium font-semibold text-surface-900">{fmtMoney(selectedTotal)}</p>
                <p className="text-caption text-surface-500">Available {fmtMoney(totalAvailableCash)}</p>
              </div>
            </div>

            {cashSalesLoading ? (
              <div className="rounded-lg border border-surface-200 bg-surface-50 px-4 py-6 text-center text-sm text-surface-500">Loading available cash sales…</div>
            ) : availableCashSales.length === 0 ? (
              <div className="rounded-lg border border-surface-200 bg-surface-50 px-4 py-6 text-center text-sm text-surface-500">No cash sales are available to deposit for this date yet.</div>
            ) : (
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full min-w-[820px]">
                  <thead>
                    <tr className="border-b border-surface-100 bg-surface-50">
                      <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-surface-500">Select</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-surface-500">Sale date</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-surface-500">Receipt</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-surface-500">Customer</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-surface-500">Description</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-surface-500">Age</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-surface-500">Available</th>
                    </tr>
                  </thead>
                  <tbody>
                    {availableCashSales.map((entry) => {
                      const checked = selectedCashTransactionIds.includes(entry.id);
                      return (
                        <tr key={entry.id} className={`border-b border-surface-50 ${checked ? 'bg-brand-50/40' : ''}`}>
                          <td className="px-4 py-3">
                            <input type="checkbox" checked={checked} onChange={() => toggleCashSale(entry.id)} className="h-4 w-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500" />
                          </td>
                          <td className="px-4 py-3 text-body text-surface-600">{fmtDate(entry.transactionDate, true)}</td>
                          <td className="px-4 py-3 text-body text-surface-700">{entry.sale?.receiptNumber || '—'}</td>
                          <td className="px-4 py-3 text-body text-surface-700">{entry.customer?.name || 'Walk-in customer'}</td>
                          <td className="px-4 py-3 text-body text-surface-500">{entry.description || entry.reference || 'Cash sale'}</td>
                          <td className="px-4 py-3 text-body text-surface-500">{ageLabel(entry.ageHours)}</td>
                          <td className="px-4 py-3 text-right text-body-medium font-semibold text-surface-900">{fmtMoney(entry.availableAmount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}

        <ModalActions onClose={onClose} submitting={submitting} submitLabel={submitting ? 'Saving…' : isCashDepositFlow ? 'Record pending deposit' : 'Move money'} />
      </form>
    </ModalShell>
  );
}
