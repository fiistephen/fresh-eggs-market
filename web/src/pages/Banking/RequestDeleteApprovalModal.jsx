import { useState } from 'react';
import { ModalShell, ModalActions, Field } from './shared/ui';
import { categoryLabel, displayAccountName, fmtDate, fmtMoney } from './shared/constants';
import { api } from '../../lib/api';

export default function RequestDeleteApprovalModal({ transaction, categoryMap, onClose, onRequested }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/banking/transactions/${transaction.id}/request-delete`, {
        reason: reason.trim() || undefined,
      });
      onRequested();
    } catch (err) {
      setError(err.error || 'Failed to request delete approval.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title="Request delete approval" onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg border border-surface-200 bg-surface-50 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="text-overline text-surface-500">Date</p>
              <p className="mt-1 text-body text-surface-900">{fmtDate(transaction.transactionDate)}</p>
            </div>
            <div>
              <p className="text-overline text-surface-500">Amount</p>
              <p className="mt-1 text-body text-surface-900">{fmtMoney(transaction.amount)}</p>
            </div>
            <div>
              <p className="text-overline text-surface-500">Account</p>
              <p className="mt-1 text-body text-surface-900">{displayAccountName(transaction.bankAccount)}</p>
            </div>
            <div>
              <p className="text-overline text-surface-500">Category</p>
              <p className="mt-1 text-body text-surface-900">{categoryLabel(transaction.category, categoryMap)}</p>
            </div>
          </div>
          <p className="mt-3 text-body text-surface-700">{transaction.description || transaction.reference || 'Manual banking entry'}</p>
        </div>

        {error ? (
          <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">
            {error}
          </div>
        ) : null}

        <Field label="Why should this entry be deleted?">
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            placeholder="Explain why this entry should be removed from Banking."
            className="w-full rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-sm text-surface-900 outline-none transition-colors duration-fast placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500"
          />
        </Field>

        <div className="rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800">
          This sends the request to the approval queue. The transaction will stay in Banking until an admin approves the delete.
        </div>

        <ModalActions onClose={onClose} submitting={submitting} submitLabel={submitting ? 'Sending…' : 'Send delete request'} />
      </form>
    </ModalShell>
  );
}
