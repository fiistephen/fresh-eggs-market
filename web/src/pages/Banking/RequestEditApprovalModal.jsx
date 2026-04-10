import { useMemo, useState } from 'react';
import { ModalShell, ModalActions, Field } from './shared/ui';
import { api } from '../../lib/api';
import { categoryLabel, categoryOptionsForDirection, displayAccountName, fmtDate, fmtMoney } from './shared/constants';

function toDateInput(value) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

export default function RequestEditApprovalModal({
  transaction,
  accounts,
  categoryMap,
  onClose,
  onRequested,
}) {
  const [form, setForm] = useState({
    bankAccountId: transaction.bankAccountId,
    direction: transaction.direction,
    category: transaction.category,
    amount: String(Number(transaction.amount || 0)),
    description: transaction.description || '',
    reference: transaction.reference || '',
    transactionDate: toDateInput(transaction.transactionDate),
    reason: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const categoryOptions = useMemo(
    () => categoryOptionsForDirection(form.direction, categoryMap, form.category),
    [form.direction, form.category, categoryMap],
  );

  function updateField(key, value) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === 'direction') {
        const nextOptions = categoryOptionsForDirection(value, categoryMap, current.category);
        if (!nextOptions.includes(next.category)) {
          next.category = nextOptions[0] || '';
        }
      }
      return next;
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/banking/transactions/${transaction.id}/request-edit`, {
        bankAccountId: form.bankAccountId,
        direction: form.direction,
        category: form.category,
        amount: form.amount,
        description: form.description,
        reference: form.reference,
        transactionDate: form.transactionDate,
        reason: form.reason.trim() || undefined,
      });
      onRequested();
    } catch (err) {
      setError(err.error || 'Failed to request edit approval.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title="Request edit approval" onClose={onClose} maxWidth="max-w-3xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg border border-surface-200 bg-surface-50 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="text-overline text-surface-500">Current date</p>
              <p className="mt-1 text-body text-surface-900">{fmtDate(transaction.transactionDate)}</p>
            </div>
            <div>
              <p className="text-overline text-surface-500">Current amount</p>
              <p className="mt-1 text-body text-surface-900">{fmtMoney(transaction.amount)}</p>
            </div>
            <div>
              <p className="text-overline text-surface-500">Current account</p>
              <p className="mt-1 text-body text-surface-900">{displayAccountName(transaction.bankAccount)}</p>
            </div>
            <div>
              <p className="text-overline text-surface-500">Current category</p>
              <p className="mt-1 text-body text-surface-900">{categoryLabel(transaction.category, categoryMap)}</p>
            </div>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Transaction date">
            <input
              type="date"
              value={form.transactionDate}
              onChange={(event) => updateField('transactionDate', event.target.value)}
              className="w-full rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-sm text-surface-900 outline-none transition-colors duration-fast focus:border-brand-500 focus:ring-2 focus:ring-brand-500"
            />
          </Field>

          <Field label="Amount">
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(event) => updateField('amount', event.target.value)}
              className="w-full rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-sm text-surface-900 outline-none transition-colors duration-fast focus:border-brand-500 focus:ring-2 focus:ring-brand-500"
            />
          </Field>

          <Field label="Account">
            <select
              value={form.bankAccountId}
              onChange={(event) => updateField('bankAccountId', event.target.value)}
              className="w-full rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-sm text-surface-900 outline-none transition-colors duration-fast focus:border-brand-500 focus:ring-2 focus:ring-brand-500"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{displayAccountName(account)}</option>
              ))}
            </select>
          </Field>

          <Field label="Direction">
            <select
              value={form.direction}
              onChange={(event) => updateField('direction', event.target.value)}
              className="w-full rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-sm text-surface-900 outline-none transition-colors duration-fast focus:border-brand-500 focus:ring-2 focus:ring-brand-500"
            >
              <option value="INFLOW">Inflow</option>
              <option value="OUTFLOW">Outflow</option>
            </select>
          </Field>

          <Field label="Category">
            <select
              value={form.category}
              onChange={(event) => updateField('category', event.target.value)}
              className="w-full rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-sm text-surface-900 outline-none transition-colors duration-fast focus:border-brand-500 focus:ring-2 focus:ring-brand-500"
            >
              {categoryOptions.map((category) => (
                <option key={category} value={category}>{categoryLabel(category, categoryMap)}</option>
              ))}
            </select>
          </Field>

          <Field label="Reference">
            <input
              type="text"
              value={form.reference}
              onChange={(event) => updateField('reference', event.target.value)}
              placeholder="Optional reference"
              className="w-full rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-sm text-surface-900 outline-none transition-colors duration-fast placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500"
            />
          </Field>
        </div>

        <Field label="Description">
          <textarea
            value={form.description}
            onChange={(event) => updateField('description', event.target.value)}
            rows={3}
            placeholder="Describe what this Banking entry is for."
            className="w-full rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-sm text-surface-900 outline-none transition-colors duration-fast placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500"
          />
        </Field>

        <Field label="Why does this entry need to be corrected?">
          <textarea
            value={form.reason}
            onChange={(event) => updateField('reason', event.target.value)}
            rows={4}
            placeholder="Explain the correction you are asking for."
            className="w-full rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-sm text-surface-900 outline-none transition-colors duration-fast placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500"
          />
        </Field>

        <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
          This sends the corrected values to the approval queue. The live Banking transaction will stay unchanged until an admin approves the request.
        </div>

        <ModalActions onClose={onClose} submitting={submitting} submitLabel={submitting ? 'Sending…' : 'Send edit request'} />
      </form>
    </ModalShell>
  );
}
