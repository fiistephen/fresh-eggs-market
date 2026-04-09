import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { EmptyState, NoticeBanner, PageHeader } from '../components/ui';

const DEFAULT_ITEM_FORM = {
  code: '',
  name: '',
  category: 'FE_EGGS',
  unitLabel: 'crate',
  defaultWholesalePrice: '',
  defaultRetailPrice: '',
  description: '',
  isActive: true,
};

const CATEGORY_STYLES = {
  FE_EGGS: 'border-success-200 bg-success-50 text-success-700',
  CRATES: 'border-info-200 bg-info-50 text-info-700',
  DELIVERY: 'border-warning-200 bg-warning-50 text-warning-700',
  LEGACY_MISC: 'border-surface-200 bg-surface-100 text-surface-700',
};

// SVG Icons
const AlertIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const EditIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

function formatCurrency(value) {
  if (value == null || value === '') return '—';
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(Number(value));
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function categoryTone(category) {
  return CATEGORY_STYLES[category] || 'border-surface-200 bg-surface-100 text-surface-700';
}

export default function Items() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({
    search: '',
    category: '',
    includeInactive: false,
  });
  const [form, setForm] = useState(DEFAULT_ITEM_FORM);
  const [savingNew, setSavingNew] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState('');

  useEffect(() => {
    loadItems();
  }, [filters.search, filters.category, filters.includeInactive]);

  async function loadItems() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filters.search.trim()) params.set('search', filters.search.trim());
      if (filters.category) params.set('category', filters.category);
      params.set('includeInactive', String(filters.includeInactive));
      const response = await api.get(`/items?${params.toString()}`);
      setItems(response.items || []);
      setSummary(response.summary || null);
      setCategories(response.categories || []);
      setDrafts(buildDrafts(response.items || []));
    } catch {
      setError('Failed to load items');
    } finally {
      setLoading(false);
    }
  }

  function buildDrafts(nextItems) {
    return nextItems.reduce((acc, item) => {
      acc[item.id] = {
        code: item.code || '',
        name: item.name || '',
        category: item.category || 'FE_EGGS',
        unitLabel: item.unitLabel || 'crate',
        defaultWholesalePrice: item.defaultWholesalePrice ?? '',
        defaultRetailPrice: item.defaultRetailPrice ?? '',
        description: item.description || '',
        isActive: item.isActive !== false,
      };
      return acc;
    }, {});
  }

  const visibleCategoryCards = useMemo(
    () => (summary?.byCategory || []).filter((entry) => entry.total > 0),
    [summary],
  );

  function resetNotice() {
    setError('');
    setSuccess('');
  }

  async function createItem(e) {
    e.preventDefault();
    resetNotice();
    setSavingNew(true);
    try {
      await api.post('/items', form);
      setForm(DEFAULT_ITEM_FORM);
      setSuccess('Item added.');
      await loadItems();
    } catch (err) {
      setError(err.error || 'Failed to add item');
    } finally {
      setSavingNew(false);
    }
  }

  function updateDraft(itemId, field, value) {
    setDrafts((current) => ({
      ...current,
      [itemId]: {
        ...current[itemId],
        [field]: value,
      },
    }));
  }

  async function saveItem(itemId) {
    resetNotice();
    setSavingId(itemId);
    try {
      await api.patch(`/items/${itemId}`, drafts[itemId]);
      setEditingId('');
      setSuccess('Item updated.');
      await loadItems();
    } catch (err) {
      setError(err.error || 'Failed to update item');
    } finally {
      setSavingId('');
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-surface-200 bg-surface-0 p-12 text-center text-surface-600 shadow-xs">
        <div className="animate-pulse text-body">Loading items...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Items"
        description="Manage what the business sells. Keep FE codes and other sellable items clear here so batches and reports stay consistent."
      />

      {error ? (
        <NoticeBanner tone="error">{error}</NoticeBanner>
      ) : null}
      {success ? (
        <NoticeBanner tone="success">{success}</NoticeBanner>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <SummaryCard label="Total items" value={summary?.totalItems || 0} />
        <SummaryCard label="Active items" value={summary?.activeItems || 0} />
        <SummaryCard label="Inactive items" value={summary?.inactiveItems || 0} />
        {visibleCategoryCards.slice(0, 2).map((entry) => (
          <SummaryCard key={entry.category} label={entry.label} value={entry.total} />
        ))}
      </div>

      {visibleCategoryCards.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {visibleCategoryCards.map((entry) => (
            <div key={entry.category} className="rounded-lg border border-surface-200 bg-surface-0 p-4 shadow-xs">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-body-medium text-surface-900">{entry.label}</p>
                  <p className="text-caption text-surface-600 mt-1">Active {entry.active} of {entry.total}</p>
                </div>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-caption font-medium ${categoryTone(entry.category)}`}>
                  {entry.total}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <section className="rounded-lg border border-surface-200 bg-surface-0 p-5 shadow-xs">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-heading text-surface-900">Find items</h2>
            <p className="text-body text-surface-600 mt-1">
              Search by item name or code, then narrow the view by category or status.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full xl:max-w-4xl">
            <input
              type="text"
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Search by item name or FE code"
              className="w-full rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-body placeholder:text-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
            <select
              value={filters.category}
              onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}
              className="w-full rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-body focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.value} value={category.value}>{category.label}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 rounded-md border border-surface-200 bg-surface-50 px-3 py-2 text-body text-surface-700 cursor-pointer hover:bg-surface-100 transition-colors duration-fast">
              <input
                type="checkbox"
                checked={filters.includeInactive}
                onChange={(event) => setFilters((current) => ({ ...current, includeInactive: event.target.checked }))}
              />
              Show inactive items too
            </label>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.2fr,1.8fr] gap-6">
        <div className="rounded-lg border border-surface-200 bg-surface-0 p-5 shadow-xs">
          <h2 className="text-heading text-surface-900">Add item</h2>
          <p className="text-body text-surface-600 mt-1">
            Add FE codes here before they are used in batches, or keep other sellable items ready for future sales workflows.
          </p>

          <form onSubmit={createItem} className="space-y-4 mt-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Item code">
                <input
                  type="text"
                  value={form.code}
                  onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                  placeholder="FE4600"
                  className="w-full rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-body placeholder:text-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </Field>
              <Field label="Item name">
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="FE4600"
                  className="w-full rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-body placeholder:text-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </Field>
              <Field label="Category">
                <select
                  value={form.category}
                  onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                  className="w-full rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-body focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                >
                  {categories.map((category) => (
                    <option key={category.value} value={category.value}>{category.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Unit label">
                <input
                  type="text"
                  value={form.unitLabel}
                  onChange={(event) => setForm((current) => ({ ...current, unitLabel: event.target.value }))}
                  placeholder="crate"
                  className="w-full rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-body placeholder:text-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </Field>
              <Field label="Default wholesale price (NGN)">
                <input
                  type="number"
                  min="0"
                  value={form.defaultWholesalePrice}
                  onChange={(event) => setForm((current) => ({ ...current, defaultWholesalePrice: event.target.value }))}
                  className="w-full rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-body focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </Field>
              <Field label="Default retail price (NGN)">
                <input
                  type="number"
                  min="0"
                  value={form.defaultRetailPrice}
                  onChange={(event) => setForm((current) => ({ ...current, defaultRetailPrice: event.target.value }))}
                  className="w-full rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-body focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </Field>
            </div>

            <Field label="Short note">
              <textarea
                rows="3"
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Add any note that helps staff understand this item."
                className="w-full rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-body placeholder:text-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </Field>

            <label className="flex items-center gap-2 text-body text-surface-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                className="rounded-sm"
              />
              Make this item active now
            </label>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingNew}
                className="rounded-md bg-brand-600 px-4 py-2 text-body font-medium text-surface-0 hover:bg-brand-700 disabled:opacity-50 transition-colors duration-fast"
              >
                {savingNew ? 'Saving...' : 'Add item'}
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-lg border border-surface-200 bg-surface-0 p-5 shadow-xs">
          <h2 className="text-heading text-surface-900">Item list</h2>
          <p className="text-body text-surface-600 mt-1">
            Review the catalog, keep old items inactive instead of deleting them, and watch how often each item has been used in batches.
          </p>

          <div className="space-y-4 mt-5">
            {items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-surface-300 bg-surface-50 px-4 py-6">
                <EmptyState
                  icon="🥚"
                  title="No items match this view yet"
                  description="Try clearing a filter or add a new item to start building the catalog."
                  className="py-4"
                />
              </div>
            ) : items.map((item) => {
              const editing = editingId === item.id;
              const draft = drafts[item.id] || DEFAULT_ITEM_FORM;

              return (
                <div key={item.id} className="rounded-lg border border-surface-200 bg-surface-0 p-4 hover:border-surface-300 transition-colors duration-fast">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-body-medium text-surface-900">{item.displayName}</p>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-caption font-medium ${categoryTone(item.category)}`}>
                          {item.categoryLabel}
                        </span>
                        {!item.isActive ? (
                          <span className="inline-flex items-center rounded-full border border-surface-200 bg-surface-100 px-2.5 py-1 text-caption font-medium text-surface-600">
                            Inactive
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-body text-surface-600">
                        {item.description || 'No extra note yet.'}
                      </p>
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-caption text-surface-600">
                        <div>Used in batches: <span className="font-medium text-surface-900">{item.batchUsageCount}</span></div>
                        <div>Total received: <span className="font-medium text-surface-900">{item.totalReceivedQuantity.toLocaleString()} {item.unitLabel}</span></div>
                        <div>Default wholesale: <span className="font-medium text-surface-900">{formatCurrency(item.defaultWholesalePrice)}</span></div>
                        <div>Default retail: <span className="font-medium text-surface-900">{formatCurrency(item.defaultRetailPrice)}</span></div>
                        <div>Latest batch: <span className="font-medium text-surface-900">{item.latestBatch?.name || '—'}</span></div>
                        <div>Latest receipt date: <span className="font-medium text-surface-900">{formatDate(item.latestBatch?.receivedDate)}</span></div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setEditingId(editing ? '' : item.id)}
                      className="flex items-center gap-2 rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-body font-medium text-surface-700 hover:bg-surface-50 transition-colors duration-fast flex-shrink-0"
                    >
                      <EditIcon />
                      {editing ? 'Close edit' : 'Edit'}
                    </button>
                  </div>

                  {editing ? (
                    <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-t border-surface-200 pt-4">
                      <Field label="Item code">
                        <input
                          type="text"
                          value={draft.code}
                          onChange={(event) => updateDraft(item.id, 'code', event.target.value.toUpperCase())}
                          className="w-full rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-body placeholder:text-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                        />
                      </Field>
                      <Field label="Item name">
                        <input
                          type="text"
                          value={draft.name}
                          onChange={(event) => updateDraft(item.id, 'name', event.target.value)}
                          className="w-full rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-body placeholder:text-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                        />
                      </Field>
                      <Field label="Category">
                        <select
                          value={draft.category}
                          onChange={(event) => updateDraft(item.id, 'category', event.target.value)}
                          className="w-full rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-body focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                        >
                          {categories.map((category) => (
                            <option key={category.value} value={category.value}>{category.label}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Unit label">
                        <input
                          type="text"
                          value={draft.unitLabel}
                          onChange={(event) => updateDraft(item.id, 'unitLabel', event.target.value)}
                          className="w-full rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-body placeholder:text-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                        />
                      </Field>
                      <Field label="Default wholesale price (NGN)">
                        <input
                          type="number"
                          min="0"
                          value={draft.defaultWholesalePrice}
                          onChange={(event) => updateDraft(item.id, 'defaultWholesalePrice', event.target.value)}
                          className="w-full rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-body focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                        />
                      </Field>
                      <Field label="Default retail price (NGN)">
                        <input
                          type="number"
                          min="0"
                          value={draft.defaultRetailPrice}
                          onChange={(event) => updateDraft(item.id, 'defaultRetailPrice', event.target.value)}
                          className="w-full rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-body focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                        />
                      </Field>
                      <div className="md:col-span-2">
                        <Field label="Short note">
                          <textarea
                            rows="3"
                            value={draft.description}
                            onChange={(event) => updateDraft(item.id, 'description', event.target.value)}
                            className="w-full rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-body placeholder:text-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                          />
                        </Field>
                      </div>
                      <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <label className="flex items-center gap-2 text-body text-surface-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={draft.isActive}
                            onChange={(event) => updateDraft(item.id, 'isActive', event.target.checked)}
                            className="rounded-sm"
                          />
                          Keep this item active
                        </label>
                        <button
                          type="button"
                          onClick={() => saveItem(item.id)}
                          disabled={savingId === item.id}
                          className="rounded-md bg-brand-600 px-4 py-2 text-body font-medium text-surface-0 hover:bg-brand-700 disabled:opacity-50 transition-colors duration-fast"
                        >
                          {savingId === item.id ? 'Saving...' : 'Save item'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-body-medium text-surface-700">{label}</span>
      {children}
    </label>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-lg border border-surface-200 bg-surface-0 p-4 shadow-xs">
      <p className="text-overline text-surface-600">{label}</p>
      <p className="mt-3 text-metric text-surface-900">{Number(value || 0).toLocaleString()}</p>
    </div>
  );
}
