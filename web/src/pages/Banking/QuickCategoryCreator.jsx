import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

export default function QuickCategoryCreator({ direction = 'INFLOW', onCreated }) {
  const [form, setForm] = useState({
    label: '',
    direction,
    description: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm((current) => ({ ...current, direction }));
  }, [direction]);

  async function handleCreate() {
    setSaving(true);
    setError('');
    try {
      const result = await api.post('/banking/categories', form);
      await onCreated(result.category);
      setForm({ label: '', direction, description: '' });
    } catch (err) {
      setError(err.error || 'Failed to add category');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <input
          type="text"
          value={form.label}
          onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
          placeholder="New category name"
          className="rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500"
        />
        <select
          value={form.direction}
          onChange={(event) => setForm((current) => ({ ...current, direction: event.target.value }))}
          className="rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="INFLOW">Money in</option>
          <option value="OUTFLOW">Money out</option>
        </select>
        <input
          type="text"
          value={form.description}
          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
          placeholder="Short help text"
          className="rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      {error && <p className="mt-2 text-body text-error-600">{error}</p>}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={handleCreate}
          disabled={saving}
          className="rounded-md bg-brand-600 px-4 py-2 text-body-medium font-medium text-surface-0 transition-colors duration-fast hover:bg-brand-700 disabled:bg-surface-300"
        >
          {saving ? 'Adding…' : 'Add category globally'}
        </button>
      </div>
    </div>
  );
}
