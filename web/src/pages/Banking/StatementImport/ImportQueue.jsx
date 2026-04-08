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
  const [selectedImportIds, setSelectedImportIds] = useState([]);
  const [selectedLineIds, setSelectedLineIds] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState('');

  useEffect(() => {
    setSelectedImportIds((c) => c.filter((id) => imports.some((i) => i.id === id)));
  }, [imports]);

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

  async function removeSelectedImports() {
    if (selectedImportIds.length === 0) return;
    if (!window.confirm(`Remove ${selectedImportIds.length} selected import${selectedImportIds.length === 1 ? '' : 's'}?`)) return;
    await api.post('/banking/imports/remove', { importIds: selectedImportIds });
    if (selectedImportIds.includes(selectedImportId)) onSelectImport('');
    setSelectedImportIds([]);
    onImportQueueUpdated();
  }

  function toggleImport(importId, checked) {
    setSelectedImportIds((c) => checked ? [...new Set([...c, importId])] : c.filter((id) => id !== importId));
  }

  function toggleLine(lineId, checked) {
    setSelectedLineIds((c) => checked ? [...new Set([...c, lineId])] : c.filter((id) => id !== lineId));
  }

  async function applyBulkUpdate() {
    if (!selectedImportId || selectedLineIds.length === 0) return;
    if (!bulkCategory && !bulkStatus) { setBulkError('Choose a category or a status before applying.'); return; }
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
      setBulkError(err.error || 'Failed to apply the bulk update');
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_1fr]">
      {/* Left: import queue */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-gray-900">Import queue</h2>
        <p className="mt-1 text-sm text-gray-500">Open an import to review lines before posting.</p>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-600">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={imports.length > 0 && selectedImportIds.length === imports.length} onChange={(e) => setSelectedImportIds(e.target.checked ? imports.map((i) => i.id) : [])} />
            Select all
          </label>
          <button type="button" onClick={removeSelectedImports} disabled={selectedImportIds.length === 0} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50">
            Remove
          </button>
        </div>

        {importsLoading ? (
          <div className="py-12 text-center text-sm text-gray-500">Loading…</div>
        ) : imports.length === 0 ? (
          <div className="py-12"><EmptyState title="No imports yet" body="Import a Providus statement to begin." compact /></div>
        ) : (
          <div className="mt-4 space-y-2">
            {imports.map((rec) => (
              <div key={rec.id} className={`w-full rounded-xl border p-3 transition-colors ${selectedImportId === rec.id ? 'border-brand-300 bg-brand-50' : 'border-gray-200 hover:border-brand-200 hover:bg-gray-50'}`}>
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={selectedImportIds.includes(rec.id)} onChange={(e) => toggleImport(rec.id, e.target.checked)} className="mt-1" />
                  <button type="button" onClick={() => onSelectImport(rec.id)} className="flex-1 text-left">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{rec.originalFilename}</p>
                        <p className="mt-1 text-xs text-gray-500">{displayAccountName(rec.bankAccount) || 'Unknown'}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${RECONCILIATION_STYLES[rec.status === 'POSTED' ? 'BALANCED' : rec.status === 'PARTIALLY_POSTED' ? 'OPEN' : 'VARIANCE']}`}>
                        {rec.status.toLowerCase()}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                      <span>{rec.parsedRowCount} lines</span>
                      <span>{rec.postedRowCount} posted</span>
                    </div>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: selected import detail */}
      <div className="rounded-2xl border border-gray-200 bg-white">
        {!selectedImportId ? (
          <div className="px-6 py-24"><EmptyState title="Choose an import" body="Pick one from the queue to review categories and posting readiness." /></div>
        ) : selectedImportLoading ? (
          <div className="px-6 py-24 text-center text-sm text-gray-500">Loading import details…</div>
        ) : !selectedImport ? (
          <div className="px-6 py-24"><EmptyState title="Import not found" body="Reload the page and try again." /></div>
        ) : (
          <>
            <div className="flex flex-col gap-4 border-b border-gray-100 px-6 py-5 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{selectedImport.originalFilename}</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {displayAccountName(selectedImport.bankAccount)} · {fmtDate(selectedImport.statementDateFrom)} to {fmtDate(selectedImport.statementDateTo)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <StatusChip label={`${selectedImport.parsedRowCount} parsed`} />
                  <StatusChip label={`${selectedImport.postedRowCount} posted`} tone="green" />
                  <StatusChip label={`${fmtMoney(selectedImport.openingBalance)} opening`} />
                  <StatusChip label={`${fmtMoney(selectedImport.closingBalance)} closing`} />
                </div>
              </div>
              <button onClick={onPostImport} disabled={postingImport || selectedImport.status === 'POSTED'} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-gray-300">
                {postingImport ? 'Posting…' : selectedImport.status === 'POSTED' ? 'Already posted' : 'Post ready lines'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 border-b border-gray-100 px-6 py-4 lg:grid-cols-4">
              <ImportCountCard label="Ready" value={importCount(selectedImport, 'READY_TO_POST') || importCount(selectedImport, 'ready')} tone="green" />
              <ImportCountCard label="Pending" value={importCount(selectedImport, 'PENDING_REVIEW') || importCount(selectedImport, 'pending')} tone="amber" />
              <ImportCountCard label="Duplicates" value={importCount(selectedImport, 'DUPLICATE') || importCount(selectedImport, 'duplicate')} tone="red" />
              <ImportCountCard label="Skipped" value={importCount(selectedImport, 'SKIPPED') || importCount(selectedImport, 'skipped')} tone="gray" />
            </div>

            <div className="space-y-4 border-b border-gray-100 px-6 py-4">
              <p className="text-sm text-gray-600">Review, search, filter, and update lines in bulk, then post the ready ones. Use the <strong>Notes</strong> column to add a clean description (bank name and depositor name).</p>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_220px_220px]">
                <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search narration, reference, amount…" className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="">All statuses</option>
                  <option value="PENDING_REVIEW">Pending</option>
                  <option value="READY_TO_POST">Ready</option>
                  <option value="DUPLICATE">Duplicate</option>
                  <option value="SKIPPED">Skipped</option>
                  <option value="POSTED">Posted</option>
                </select>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                  Showing {filteredImportLines.length} of {selectedImportLines.length}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-[220px_220px_auto]">
                  <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="">Bulk category</option>
                    {categoryOptions.map((cat) => <option key={cat} value={cat}>{categoryLabel(cat, categoryMap)}</option>)}
                  </select>
                  <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="">Bulk status</option>
                    <option value="PENDING_REVIEW">Move to pending</option>
                    <option value="READY_TO_POST">Mark ready</option>
                    <option value="SKIPPED">Mark skipped</option>
                    <option value="DUPLICATE">Mark duplicate</option>
                  </select>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                      <input type="checkbox" checked={editableVisibleLines.length > 0 && selectedLineIds.length === editableVisibleLines.length} onChange={(e) => setSelectedLineIds(e.target.checked ? editableVisibleLines.map((l) => l.id) : [])} />
                      Select visible editable
                    </label>
                    <button type="button" onClick={applyBulkUpdate} disabled={selectedLineIds.length === 0 || bulkSaving} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-gray-300">
                      {bulkSaving ? 'Applying…' : `Apply to ${selectedLineIds.length} line${selectedLineIds.length === 1 ? '' : 's'}`}
                    </button>
                  </div>
                </div>
                {bulkError && <p className="mt-3 text-sm text-red-600">{bulkError}</p>}
              </div>
            </div>

            {filteredImportLines.length === 0 ? (
              <div className="px-6 py-24"><EmptyState title="No matching lines" body="Clear the search or change the status filter." /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px]">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Sel</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Line</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Bank narration</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Dir</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Category</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Clean description</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredImportLines.map((line) => (
                      <ImportLineRow key={line.id} line={line} categoryMap={categoryMap} selected={selectedLineIds.includes(line.id)} onToggleSelected={toggleLine} onSaved={onLineUpdated} />
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
