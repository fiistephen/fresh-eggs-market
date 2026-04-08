import { useState } from 'react';
import { api } from '../../lib/api';
import { displayAccountName } from './shared/constants';
import { ModalShell, ModalActions, Field } from './shared/ui';

export default function StatementImportModal({ accounts, onClose, onImported }) {
  const [form, setForm] = useState({
    bankAccountId: accounts[0]?.id || '',
    filename: 'providus-import.csv',
    csvText: '',
  });
  const [readingFile, setReadingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setReadingFile(true);
    try {
      const csvText = await file.text();
      setForm((c) => ({ ...c, filename: file.name, csvText }));
    } finally {
      setReadingFile(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const result = await api.post('/banking/imports/providus/preview', form);
      onImported(result.import.id);
    } catch (err) {
      setError(err.error || 'Failed to import statement');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title="Import bank statement" onClose={onClose} maxWidth="max-w-4xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Upload the Providus CSV or paste the statement text. The app will read each line, flag duplicates, and let you review it before anything is posted.
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Bank account">
            <select value={form.bankAccountId} onChange={(e) => setForm((c) => ({ ...c, bankAccountId: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
              {accounts.map((a) => <option key={a.id} value={a.id}>{displayAccountName(a)}</option>)}
            </select>
          </Field>
          <Field label="Filename">
            <input type="text" value={form.filename} onChange={(e) => setForm((c) => ({ ...c, filename: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
          </Field>
        </div>

        <Field label="CSV file">
          <input type="file" accept=".csv,text/csv" onChange={handleFileChange} className="block w-full text-sm text-gray-600" />
          {readingFile && <p className="mt-2 text-xs text-gray-500">Reading file…</p>}
        </Field>

        <Field label="Or paste CSV text">
          <textarea value={form.csvText} onChange={(e) => setForm((c) => ({ ...c, csvText: e.target.value }))} rows={12} className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-brand-500" placeholder="Paste raw Providus statement CSV here" />
        </Field>

        <ModalActions onClose={onClose} submitting={submitting} submitLabel={submitting ? 'Importing…' : 'Preview import'} />
      </form>
    </ModalShell>
  );
}
