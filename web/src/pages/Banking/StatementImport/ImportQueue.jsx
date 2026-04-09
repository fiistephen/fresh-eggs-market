import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { categoryOptionsForDirection, categoryLabel, displayAccountName, fmtMoney, fmtDate, importCount } from '../shared/constants';
import { RECONCILIATION_STYLES } from '../shared/constants';
import { EmptyState, StatusChip, ImportCountCard } from '../shared/ui';
import ImportLineRow from './ImportLineRow';

export default function ImportsView({
  accounts,
  categoryMap,
  imports,
  importsLoading,
  selectedImportId,
  onSelectImport,
  selectedImport,
  selectedImportLines,
  selectedImportLoading,
  postingImport,
  onPostImport,
  onLineUpdated,
  onImportQueueUpdated,
}) {
  const [removingImport, setRemovingImport] = useState(false);
  const [selectedLineIds, setSelectedLineIds] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState('');

  useEffect(() => {
    setSelectedLineIds([]);
    setStatusFilter('');
    setSearchTerm('');
    setBulkCategory('');
    setBulkStatus('');
    setBulkError('');
  }, [selectedImportId]);

  const filteredImportLines = selectedImportLines.filter((line) => {
    if (statusFilter && line.reviewStatus !== statusFilter) return false;
    if (!searchTerm.trim()) return true;
    const amount = line.direction === 'OUTFLOW' ? line.debitAmount : line.creditAmount;
    const haystack = [line.lineNumber, line.description, line.docNum, line.notes, line.direction, line.selectedCategory, line.suggestedCategory, amount]
      .filter((v) => v != null).join(' ').toLowerCase();
    return haystack.includes(searchTerm.trim().toLowerCase());
  });

  const editableVisibleLines = filteredImportLines.filter((line) => line.reviewStatus !== 'POSTED');
  const categoryOptions = [...new Set(editableVisibleLines.flatMap((line) => categoryOptionsForDirection(line.direction, categoryMap, line.selectedCategory || line.suggestedCategory || '')))];

  useEffect(() => {
    const visibleEditableIds = new Set(editableVisibleLines.map((l) => l.id));
    setSelectedLineIds((c) => c.filter((id) => visibleEditableIds.has(id)));
  }, [statusFilter, searchTerm, selectedImportLines]);

  async function removeImportFromQueue() {
    if (!selectedImportId || !selectedImport || removingImport) return;
    if (selectedImport.status === 'POSTED' || selectedImport.status === 'PARTIALLY_POSTED') return;
    if (!window.confirm(`Remove "${selectedImport.originalFilename}" from the import queue? The statement lines will stay documented, but this import will leave the active queue.`)) {
      return;
    }
    setRemovingImport(true);
    try {
      await api.post('/banking/imports/remove', { importIds: [selectedImportId] });
      onSelectImport('');
      onImportQueueUpdated();
    } catch (err) {
      setBulkError(err.error || 'Could not remove this import from the queue');
    } finally {
      setRemovingImport(false);
    }
  }

  async function applyBulkUpdate() {
    if (!selectedImportId || selectedLineIds.length === 0) return;
    if (!bulkCategory && !bulkStatus) { setBulkError('Choose a category or status first.'); return; }
    setBulkSaving(true);
    setBulkError('');
    try {
      await api.post(`/banking/imports/${selectedImportId}/lines/bulk-update`, {
        lineIds: selectedLineIds,
        ...(bulkCategory ? { selectedCategory: bulkCategory } : {}),
        ...(bulkStatus ? { reviewStatus: bulkStatus } : {}),
      });
      setSelectedLineIds([]);
      setBulkCategory('');
      setBulkStatus('');
      onLineUpdated();
    } catch (err) {
      setBulkError(err.error || 'Bulk update failed');
    } finally {
      setBulkSaving(false);
    }
  }

  /* ── No imports at all ───────────────────────────────── */
  if (importsLoading) {
    return <div className="rounded-xl border border-gray-200 bg-white px-6 py-16 text-center text-sm text-gray-500">Loading statements…</div>;
  }
  if (imports.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-6 py-16">
        <EmptyState title="No bank statements imported yet" body="Use the 'Import statement' button to upload a Providus CSV." />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Statement selector (replaces old sidebar) ────── */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedImportId}
          onChange={(e) => onSelectImport(e.target.value)}
          className="min-w-[280px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 outline-none focus:ring-2 focus:ring-brand-500"
        >
          {imports.map((rec) => (
            <option key={rec.id} value={rec.id}>
              {rec.originalFilename} — {rec.status.toLowerCase().replace(/_/g, ' ')} ({rec.parsedRowCount} lines)
            </option>
          ))}
        </select>

        {selectedImport && (
          <>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>{displayAccountName(selectedImport.bankAccount)}</span>
              <span>·</span>
              <span>{fmtDate(selectedImport.statementDateFrom)} – {fmtDate(selectedImport.statementDateTo)}</span>
            </div>
            {!['POSTED', 'PARTIALLY_POSTED'].includes(selectedImport.status) && (
              <button
                type="button"
                onClick={removeImportFromQueue}
                disabled={removingImport}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {removingImport ? 'Removing…' : 'Remove from queue'}
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Selected import detail ─────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white">
        {!selectedImportId ? (
          <div className="px-6 py-16"><EmptyState title="Choose an import" body="Select a statement from the dropdown above." /></div>
        ) : selectedImportLoading ? (
          <div className="px-6 py-16 text-center text-sm text-gray-500">Loading…</div>
        ) : !selectedImport ? (
          <div className="px-6 py-16"><EmptyState title="Import not found" body="Reload and try again." /></div>
        ) : (
          <>
            {/* Stats + Post button */}
            <div className="space-y-3 border-b border-gray-100 px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">{selectedImport.originalFilename}</h2>
                  <p className="text-xs text-gray-500">
                    Review the lines, fix categories, then post only the lines that are ready.
                  </p>
                </div>
                <button onClick={onPostImport} disabled={postingImport || selectedImport.status === 'POSTED'} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-gray-300">
                  {postingImport ? 'Posting…' : selectedImport.status === 'POSTED' ? 'Posted' : 'Post ready lines'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <ImportCountCard label="Ready" value={importCount(selectedImport, 'READY_TO_POST') || importCount(selectedImport, 'ready')} tone="green" />
                <ImportCountCard label="Pending" value={importCount(selectedImport, 'PENDING_REVIEW') || importCount(selectedImport, 'pending')} tone="amber" />
                <ImportCountCard label="Duplicates" value={importCount(selectedImport, 'DUPLICATE') || importCount(selectedImport, 'duplicate')} tone="red" />
                <ImportCountCard label="Skipped" value={importCount(selectedImport, 'SKIPPED') || importCount(selectedImport, 'skipped')} tone="gray" />
              </div>
            </div>

            {/* Filters + bulk actions */}
            <div className="space-y-3 border-b border-gray-100 px-5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search narration, reference, amount…" className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="">All statuses</option>
                  <option value="PENDING_REVIEW">Pending</option>
                  <option value="READY_TO_POST">Ready</option>
                  <option value="DUPLICATE">Duplicate</option>
                  <option value="SKIPPED">Skipped</option>
                  <option value="POSTED">Posted</option>
                </select>
                <span className="text-xs text-gray-500">{filteredImportLines.length} of {selectedImportLines.length} lines</span>
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                <label className="flex items-center gap-1.5 text-xs text-gray-600">
                  <input type="checkbox" checked={editableVisibleLines.length > 0 && selectedLineIds.length === editableVisibleLines.length} onChange={(e) => setSelectedLineIds(e.target.checked ? editableVisibleLines.map((l) => l.id) : [])} />
                  Select visible editable
                </label>
                <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="">Bulk category</option>
                  {categoryOptions.map((cat) => <option key={cat} value={cat}>{categoryLabel(cat, categoryMap)}</option>)}
                </select>
                <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="">Bulk status</option>
                  <option value="PENDING_REVIEW">Move to pending</option>
                  <option value="READY_TO_POST">Mark ready</option>
                  <option value="SKIPPED">Mark skipped</option>
                </select>
                <button onClick={applyBulkUpdate} disabled={selectedLineIds.length === 0 || bulkSaving} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-gray-300">
                  {bulkSaving ? 'Applying…' : `Apply to ${selectedLineIds.length}`}
                </button>
              </div>
              {bulkError && <p className="w-full text-xs text-red-600">{bulkError}</p>}
            </div>

            {/* Line table */}
            {filteredImportLines.length === 0 ? (
              <div className="px-6 py-16"><EmptyState title="No matching lines" body="Clear the search or change the status filter." /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="w-8 px-3 py-2.5"></th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase text-gray-500">Bank narration</th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium uppercase text-gray-500">Amount</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase text-gray-500">Category</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase text-gray-500">Clean description</th>
                      <th className="w-16 px-3 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredImportLines.map((line) => (
                      <ImportLineRow key={line.id} line={line} categoryMap={categoryMap} selected={selectedLineIds.includes(line.id)} onToggleSelected={(id, checked) => setSelectedLineIds((c) => checked ? [...new Set([...c, id])] : c.filter((x) => x !== id))} onSaved={onLineUpdated} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
