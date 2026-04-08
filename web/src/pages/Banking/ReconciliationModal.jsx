import { useState } from 'react';
import { api } from '../../lib/api';
import { displayAccountName, fmtDate, todayStr } from './shared/constants';
import { ModalShell, ModalActions, Field } from './shared/ui';

export default function ReconciliationModal({ accounts, imports, onClose, onSaved }) {
  const [form, setForm] = useState({
    bankAccountId: accounts[0]?.id || '',
    statementImportId: '',
    statementDate: todayStr(),
    openingBalance: '',
    closingBalance: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const availableImports = imports.filter((i) => i.bankAccountId === form.bankAccountId || i.bankAccount?.id === form.bankAccountId);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post('/banking/reconciliations', {
        bankAccountId: form.bankAccountId,
        statementImportId: form.statementImportId || undefined,
        statementDate: form.statementImportId ? undefined : form.statementDate,
        openingBalance: form.statementImportId || form.openingBalance === '' ? undefined : Number(form.openingBalance),
        closingBalance: form.statementImportId ? undefined : Number(form.closingBalance),
        notes: form.notes || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err.error || 'Failed to create reconciliation');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title="Reconcile balance" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Account">
            <select value={form.bankAccountId} onChange={(e) => setForm((c) => ({ ...c, bankAccountId: e.target.value, statementImportId: '' }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
              {accounts.map((a) => <option key={a.id} value={a.id}>{displayAccountName(a)}</option>)}
            </select>
          </Field>
          <Field label="Use statement import">
            <select value={form.statementImportId} onChange={(e) => setForm((c) => ({ ...c, statementImportId: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">Manual statement balance</option>
              {availableImports.map((i) => <option key={i.id} value={i.id}>{i.originalFilename} ({fmtDate(i.statementDateTo)})</option>)}
            </select>
          </Field>
        </div>

        {!form.statementImportId && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Statement date">
              <input type="date" value={form.statementDate} onChange={(e) => setForm((c) => ({ ...c, statementDate: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" required />
            </Field>
            <Field label="Opening balance">
              <input type="number" step="0.01" value={form.openingBalance} onChange={(e) => setForm((c) => ({ ...c, openingBalance: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
            </Field>
            <Field label="Closing balance">
              <input type="number" step="0.01" value={form.closingBalance} onChange={(e) => setForm((c) => ({ ...c, closingBalance: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" required />
            </Field>
          </div>
        )}

        <Field label="Notes (optional)">
          <textarea value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" placeholder="Optional reconciliation notes" />
        </Field>

        <ModalActions onClose={onClose} submitting={submitting} submitLabel={submitting ? 'Saving…' : 'Save reconciliation'} />
      </form>
    </ModalShell>
  );
}
