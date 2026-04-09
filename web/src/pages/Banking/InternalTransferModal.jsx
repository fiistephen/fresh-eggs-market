import { useState } from 'react';
import { api } from '../../lib/api';
import { displayAccountName, todayStr } from './shared/constants';
import { ModalShell, ModalActions, Field } from './shared/ui';

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isCashDepositFlow = form.fromAccountId === cashAccount?.id && form.toAccountId === customerDepositAccount?.id;

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post('/banking/transfers/internal', { ...form, amount: Number(form.amount) });
      onRecorded();
    } catch (err) {
      setError(err.error || 'Failed to save transfer');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title="Move money between accounts" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-lg border border-error-100 bg-error-50 px-3 py-2 text-body text-error-700">{error}</div>}

        <div className="rounded-lg border border-warning-100 bg-warning-50 px-4 py-3 text-body text-warning-700">
          {isCashDepositFlow ? (
            <>
              Use this to record cash taken to the bank. The move will stay <span className="font-semibold">pending</span> until a matching inflow is confirmed from a bank statement.
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
            <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((c) => ({ ...c, amount: e.target.value }))} className="w-full rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500" required />
          </Field>
          <Field label="Transfer date">
            <input type="date" value={form.transactionDate} onChange={(e) => setForm((c) => ({ ...c, transactionDate: e.target.value }))} className="w-full rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500" required />
          </Field>
        </div>

        <Field label="Description (optional)">
          <input type="text" value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} placeholder="e.g. Cash deposit at Providus" className="w-full rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500" />
        </Field>

        <ModalActions onClose={onClose} submitting={submitting} submitLabel={submitting ? 'Saving…' : isCashDepositFlow ? 'Record pending deposit' : 'Move money'} />
      </form>
    </ModalShell>
  );
}
