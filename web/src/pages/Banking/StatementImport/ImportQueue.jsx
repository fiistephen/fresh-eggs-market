import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { categoryOptionsForDirection, categoryLabel, displayAccountName, fmtMoney, fmtDate, importCount } from '../shared/constants';
import { RECONCILIATION_STYLES } from '../shared/constants';
import { EmptyState, StatusChip, ImportCountCard } from '../shared/ui';
import ImportLineRow from './ImportLineRow';

export default function ImportsView({
  categoryMap,
  imports,
  importsTotal,
  importsPage,
  importsPageSize,
  importsSearch,
  importsSearchInput,
  importsLoading,
  selectedImportId,
  onSelectImport,
  onSearchChange,
  onPageChange,
  importTotalPages,
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
  const [farmers, setFarmers] = useState([]);

  useEffect(() => {
    let active = true;
    async function loadFarmers() {
      try {
        const data = await api.get('/farmers?limit=200');
        if (active) setFarmers(data.farmers || []);
      } catch {
        if (active) setFarmers([]);
      }
    }
    loadFarmers();
    return () => {
      active = false;
    };
  }, []);

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
  const importRangeStart = importsTotal === 0 ? 0 : (importsPage - 1) * importsPageSize + 1;
  const importRangeEnd = Math.min(importsPage * importsPageSize, importsTotal);
  const suggestionMatches = importsSearchInput.trim() ? imports.slice(0, 6) : [];

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
  if (importsLoading && imports.length === 0) {
    return <div className="rounded-lg border border-surface-200 bg-surface-0 px-6 py-16 text-center text-body text-surface-500">Loading statements…</div>;
  }
  if (imports.length === 0) {
    return (
      <div className="rounded-lg border border-surface-200 bg-surface-0 px-6 py-16">
        <EmptyState
          title={importsSearch.trim() ? 'No statements match that search' : 'No bank statements imported yet'}
          body={importsSearch.trim() ? 'Try a different file name or clear the search to see all statement imports.' : 'Use the “Import statement” button to upload a Providus CSV.'}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Statement queue ──────────────────────────────── */}
      <div className="rounded-lg border border-surface-200 bg-surface-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-surface-100 px-5 py-4">
          <div>
            <h2 className="text-body-medium font-semibold text-surface-900">Import queue</h2>
            <p className="text-caption text-surface-500">Search and open the statement you want to review.</p>
          </div>
          <div className="relative min-w-[240px] flex-1">
            <input
              type="text"
              value={importsSearchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search file name, date, or account..."
              className="w-full rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500"
            />
            {importsLoading && importsSearchInput.trim() && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-caption text-surface-400">Searching...</span>
            )}
            {suggestionMatches.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-surface-200 bg-surface-0 shadow-lg">
                {suggestionMatches.map((rec) => (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => onSelectImport(rec.id)}
                    className="flex w-full items-start justify-between gap-3 border-b border-surface-100 px-3 py-2 text-left last:border-b-0 hover:bg-surface-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-body-medium font-medium text-surface-900">{rec.originalFilename}</p>
                      <p className="mt-0.5 text-caption text-surface-500">{displayAccountName(rec.bankAccount)}</p>
                    </div>
                    <span className="shrink-0 text-caption text-surface-400">{rec.parsedRowCount} lines</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="text-caption text-surface-500">
            {importsTotal > 0 ? `${importRangeStart}–${importRangeEnd} of ${importsTotal}` : 'No imports'}
          </span>
        </div>

        <div className="grid gap-3 px-5 py-4 md:grid-cols-2 xl:grid-cols-3">
          {imports.map((rec) => {
            const selected = rec.id === selectedImportId;
            const pendingCount = Math.max(0, Number(rec.parsedRowCount || 0) - Number(rec.postedRowCount || 0));
            return (
              <button
                key={rec.id}
                type="button"
                onClick={() => onSelectImport(rec.id)}
                className={`rounded-lg border p-4 text-left transition-colors duration-fast ${
                  selected
                    ? 'border-brand-300 bg-brand-50'
                    : 'border-surface-200 bg-surface-0 hover:border-surface-300 hover:bg-surface-50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-body-medium font-semibold text-surface-900">{rec.originalFilename}</p>
                    <p className="mt-1 text-caption text-surface-500">{displayAccountName(rec.bankAccount)}</p>
                  </div>
                  <StatusChip label={rec.status.toLowerCase().replace(/_/g, ' ')} tone={rec.status === 'POSTED' ? 'success' : rec.status === 'PARTIALLY_POSTED' ? 'warning' : 'default'} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-caption text-surface-500">
                  <span>{fmtDate(rec.statementDateFrom)} – {fmtDate(rec.statementDateTo)}</span>
                  <span>·</span>
                  <span>{rec.parsedRowCount} lines</span>
                  <span>·</span>
                  <span>{pendingCount} not yet posted</span>
                </div>
              </button>
            );
          })}
        </div>

        {importsTotal > importsPageSize && (
          <div className="flex items-center justify-between border-t border-surface-100 px-5 py-3">
            <p className="text-caption text-surface-500">
              Showing {importRangeStart}–{importRangeEnd} of {importsTotal}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onPageChange(importsPage - 1)}
                disabled={importsPage <= 1}
                className="rounded-md border border-surface-200 px-3 py-1.5 text-caption-medium font-medium text-surface-700 transition-colors duration-fast hover:bg-surface-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-caption text-surface-500">Page {importsPage} of {importTotalPages}</span>
              <button
                type="button"
                onClick={() => onPageChange(importsPage + 1)}
                disabled={importsPage >= importTotalPages}
                className="rounded-md border border-surface-200 px-3 py-1.5 text-caption-medium font-medium text-surface-700 transition-colors duration-fast hover:bg-surface-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Selected import detail ─────────────────────────── */}
      <div className="rounded-lg border border-surface-200 bg-surface-0">
        {!selectedImportId ? (
          <div className="px-6 py-16"><EmptyState title="Choose an import" body="Select a statement from the dropdown above." /></div>
        ) : selectedImportLoading ? (
          <div className="px-6 py-16 text-center text-body text-surface-500">Loading…</div>
        ) : !selectedImport ? (
          <div className="px-6 py-16"><EmptyState title="Import not found" body="Reload and try again." /></div>
        ) : (
          <>
            {/* Stats + Post button */}
            <div className="space-y-3 border-b border-surface-100 px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-body-medium font-semibold text-surface-900">{selectedImport.originalFilename}</h2>
                  <p className="text-caption text-surface-500">
                    Review the lines, fix categories, then post only the lines that are ready.
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-caption text-surface-500">
                    <span>{displayAccountName(selectedImport.bankAccount)}</span>
                    <span>·</span>
                    <span>{fmtDate(selectedImport.statementDateFrom)} – {fmtDate(selectedImport.statementDateTo)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!['POSTED', 'PARTIALLY_POSTED'].includes(selectedImport.status) && (
                    <button
                      type="button"
                      onClick={removeImportFromQueue}
                      disabled={removingImport}
                      className="rounded-md border border-error-100 bg-error-50 px-3 py-2 text-caption-medium font-medium text-error-700 transition-colors duration-fast hover:bg-error-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {removingImport ? 'Removing…' : 'Remove from queue'}
                    </button>
                  )}
                  <button onClick={onPostImport} disabled={postingImport || selectedImport.status === 'POSTED'} className="rounded-md bg-brand-600 px-4 py-2 text-body-medium font-medium text-surface-0 transition-colors duration-fast hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-surface-300">
                    {postingImport ? 'Posting…' : selectedImport.status === 'POSTED' ? 'Posted' : 'Post ready lines'}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <ImportCountCard label="Ready" value={importCount(selectedImport, 'READY_TO_POST') || importCount(selectedImport, 'ready')} tone="success" />
                <ImportCountCard label="Pending" value={importCount(selectedImport, 'PENDING_REVIEW') || importCount(selectedImport, 'pending')} tone="warning" />
                <ImportCountCard label="Duplicates" value={importCount(selectedImport, 'DUPLICATE') || importCount(selectedImport, 'duplicate')} tone="error" />
                <ImportCountCard label="Skipped" value={importCount(selectedImport, 'SKIPPED') || importCount(selectedImport, 'skipped')} tone="default" />
              </div>
            </div>

            {/* Filters + bulk actions */}
            <div className="space-y-3 border-b border-surface-100 px-5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search narration, reference, amount…" className="w-full max-w-xs rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500" />
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="">All statuses</option>
                  <option value="PENDING_REVIEW">Pending</option>
                  <option value="READY_TO_POST">Ready</option>
                  <option value="DUPLICATE">Duplicate</option>
                  <option value="SKIPPED">Skipped</option>
                  <option value="POSTED">Posted</option>
                </select>
                <span className="text-caption text-surface-500">{filteredImportLines.length} of {selectedImportLines.length} lines</span>
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-surface-200 bg-surface-50 px-3 py-3">
                <label className="flex items-center gap-1.5 text-caption text-surface-600">
                  <input type="checkbox" checked={editableVisibleLines.length > 0 && selectedLineIds.length === editableVisibleLines.length} onChange={(e) => setSelectedLineIds(e.target.checked ? editableVisibleLines.map((l) => l.id) : [])} />
                  Select visible editable
                </label>
                <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} className="rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="">Bulk category</option>
                  {categoryOptions.map((cat) => <option key={cat} value={cat}>{categoryLabel(cat, categoryMap)}</option>)}
                </select>
                <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className="rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="">Bulk status</option>
                  <option value="PENDING_REVIEW">Move to pending</option>
                  <option value="READY_TO_POST">Mark ready</option>
                  <option value="SKIPPED">Mark skipped</option>
                </select>
                <button onClick={applyBulkUpdate} disabled={selectedLineIds.length === 0 || bulkSaving} className="rounded-md bg-brand-600 px-4 py-2 text-body-medium font-medium text-surface-0 transition-colors duration-fast hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-surface-300">
                  {bulkSaving ? 'Applying…' : `Apply to ${selectedLineIds.length}`}
                </button>
              </div>
              {bulkError && <p className="w-full text-caption text-error-600">{bulkError}</p>}
            </div>

            {/* Line table */}
            {filteredImportLines.length === 0 ? (
              <div className="px-6 py-16"><EmptyState title="No matching lines" body="Clear the search or change the status filter." /></div>
            ) : (
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full min-w-[1180px]">
                  <thead>
                    <tr className="border-b border-surface-100 bg-surface-50/50">
                      <th className="w-8 px-3 py-2.5"></th>
                      <th className="px-3 py-2.5 text-left text-overline text-surface-500">Line</th>
                      <th className="px-3 py-2.5 text-left text-overline text-surface-500">Date</th>
                      <th className="px-3 py-2.5 text-left text-overline text-surface-500">Bank narration</th>
                      <th className="px-3 py-2.5 text-left text-overline text-surface-500">Direction</th>
                      <th className="px-3 py-2.5 text-right text-overline text-surface-500">Amount</th>
                      <th className="px-3 py-2.5 text-left text-overline text-surface-500">Category</th>
                      <th className="px-3 py-2.5 text-left text-overline text-surface-500">Status</th>
                      <th className="px-3 py-2.5 text-left text-overline text-surface-500">Clean description</th>
                      <th className="px-3 py-2.5 text-left text-overline text-surface-500">Link</th>
                      <th className="w-20 px-3 py-2.5 text-left text-overline text-surface-500">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredImportLines.map((line) => (
                      <ImportLineRow
                        key={line.id}
                        line={line}
                        bankAccountId={selectedImport?.bankAccount?.id || ''}
                        categoryMap={categoryMap}
                        farmers={farmers}
                        selected={selectedLineIds.includes(line.id)}
                        onToggleSelected={(id, checked) => setSelectedLineIds((c) => checked ? [...new Set([...c, id])] : c.filter((x) => x !== id))}
                        onSaved={onLineUpdated}
                      />
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
