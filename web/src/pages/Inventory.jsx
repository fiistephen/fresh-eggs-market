import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { Button, Input, Select, Textarea, Modal, Card, Badge, EmptyState, useToast, Pagination } from '../components/ui';

// ─── SVG ICONS ───────────────────────────────────────────────────
const PackageIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const CheckCircleIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const TrashIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const ShoppingCartIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  </svg>
);

const ClipboardIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /><path d="M9 14h6" /><path d="M9 10h6" />
  </svg>
);

const StoreIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 4h12v7H6z" /><rect x="2" y="7" width="20" height="3" /><path d="M4 10v11h16V10" /><line x1="9" y1="14" x2="9" y2="20" /><line x1="15" y1="14" x2="15" y2="20" />
  </svg>
);

const AlertIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3.05h16.94a2 2 0 0 0 1.71-3.05l-8.47-14.14a2 2 0 0 0-3.41 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const PencilIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

// ─── FORMAT HELPERS ──────────────────────────────────────────────
const fmt = (n) => Number(n).toLocaleString('en-NG');
const fmtMoney = (n) => '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 0 });
const fmtDate = (d) => new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
const today = () => new Date().toISOString().slice(0, 10);

const crackStatusMap = {
  OK: { label: 'Within allowance', color: 'success' },
  WATCH: { label: 'Watch closely', color: 'warning' },
  ALERT: { label: 'Above allowance', color: 'error' },
};

// ─── STAT CARD ───────────────────────────────────────────────────
function StatCard({ label, value, sub, icon, color = 'neutral' }) {
  const colorMap = {
    success: 'bg-success-50 border-success-200 text-success-700',
    warning: 'bg-warning-50 border-warning-200 text-warning-700',
    error: 'bg-error-50 border-error-200 text-error-700',
    info: 'bg-info-50 border-info-200 text-info-700',
    brand: 'bg-brand-50 border-brand-200 text-brand-700',
    neutral: 'bg-surface-50 border-surface-200 text-surface-700',
  };

  return (
    <Card variant="outlined" className={`${colorMap[color]}`}>
      <div className="flex items-center gap-2 text-caption text-surface-600 mb-2">
        {icon && <span className="text-current">{icon}</span>}
        {label}
      </div>
      <div className="text-metric text-current font-bold">{value}</div>
      {sub && <div className="text-caption text-surface-500 mt-1">{sub}</div>}
    </Card>
  );
}

// ─── STOCK BAR ───────────────────────────────────────────────────
function StockBar({ sold, writeOff, booked, heldForCheckout = 0, available, total }) {
  if (total <= 0) return null;
  const pctSold = (sold / total) * 100;
  const pctWO = (writeOff / total) * 100;
  const pctBooked = (booked / total) * 100;
  const pctHeld = (heldForCheckout / total) * 100;
  const pctAvail = (available / total) * 100;

  return (
    <div className="space-y-2">
      <div className="w-full h-2.5 rounded-full overflow-hidden flex bg-surface-100" title={`Sold: ${sold}, Written-off: ${writeOff}, Booked: ${booked}, Held: ${heldForCheckout}, Available: ${available}`}>
        {pctSold > 0 && <div className="bg-success-500 h-full" style={{ width: `${pctSold}%` }} />}
        {pctWO > 0 && <div className="bg-error-400 h-full" style={{ width: `${pctWO}%` }} />}
        {pctBooked > 0 && <div className="bg-warning-400 h-full" style={{ width: `${pctBooked}%` }} />}
        {pctHeld > 0 && <div className="bg-brand-400 h-full" style={{ width: `${pctHeld}%` }} />}
        {pctAvail > 0 && <div className="bg-info-400 h-full" style={{ width: `${pctAvail}%` }} />}
      </div>
      <div className="flex flex-wrap gap-3 text-caption text-surface-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-success-500" />
          Sold ({fmt(sold)})
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-error-400" />
          Write-off ({fmt(writeOff)})
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-warning-400" />
          Booked ({fmt(booked)})
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-brand-400" />
          Held ({fmt(heldForCheckout)})
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-info-400" />
          Available ({fmt(available)})
        </span>
      </div>
    </div>
  );
}

// ─── RECORD COUNT MODAL ──────────────────────────────────────────
function RecordCountModal({ batches, initialBatchId = '', onClose, onSaved }) {
  const [batchId, setBatchId] = useState(initialBatchId);
  const [physicalCount, setPhysicalCount] = useState('');
  const [crackedWriteOff, setCrackedWriteOff] = useState('0');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const { toast } = useToast();

  const selectedBatch = batches.find(b => b.batch.id === batchId);
  const differenceBeforeWriteOff = selectedBatch ? (Number(physicalCount || 0) - Number(selectedBatch.onHand || 0)) : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await api.post('/inventory/count', {
        batchId,
        physicalCount: parseInt(physicalCount, 10),
        crackedWriteOff: parseInt(crackedWriteOff, 10) || 0,
        notes: notes.trim() || undefined,
        countDate: today(),
      });
      setResult(res);
    } catch (err) {
      setError(err.error || 'Failed to save count');
    } finally {
      setSaving(false);
    }
  };

  if (result) {
    const c = result.count;
    return (
      <Modal open={true} onClose={onClose} title="Count Saved" size="sm">
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-12 h-12 bg-success-100 rounded-full flex items-center justify-center">
              <CheckCircleIcon className="text-success-600" />
            </div>
            <div className="text-center">
              <h3 className="text-heading text-surface-800">{c.batch?.name || 'Batch'}</h3>
            </div>
          </div>

          <div className="space-y-2 bg-surface-50 rounded-lg p-4">
            <div className="flex justify-between text-body">
              <span className="text-surface-600">System Count</span>
              <span className="font-medium text-surface-800">{fmt(c.systemCount)} crates</span>
            </div>
            <div className="flex justify-between text-body">
              <span className="text-surface-600">Physical Count</span>
              <span className="font-medium text-surface-800">{fmt(c.physicalCount)} crates</span>
            </div>
            <div className={`flex justify-between text-body font-medium ${c.discrepancy !== 0 ? 'text-error-600' : 'text-success-600'}`}>
              <span>Discrepancy</span>
              <span>{c.discrepancy > 0 ? '+' : ''}{c.discrepancy}</span>
            </div>
            {c.crackedWriteOff > 0 && (
              <div className="flex justify-between text-body text-warning-600 font-medium">
                <span>Write-off</span>
                <span>{c.crackedWriteOff} crates</span>
              </div>
            )}
          </div>

          {c.crackedWriteOff > 0 && (
            <Card variant="tinted" tint="bg-warning-50" className="border border-warning-200">
              <p className="text-body text-warning-800">These crates have been recorded as badly damaged and removed from this batch's usable stock.</p>
            </Card>
          )}

          <div className="grid grid-cols-3 gap-2 text-caption bg-surface-50 rounded-lg p-3">
            <div><div className="text-surface-500">Total Received</div><div className="font-medium text-surface-800">{fmt(result.computed.totalReceived)}</div></div>
            <div><div className="text-surface-500">Total Sold</div><div className="font-medium text-surface-800">{fmt(result.computed.totalSold)}</div></div>
            <div><div className="text-surface-500">Written Off</div><div className="font-medium text-surface-800">{fmt(result.computed.totalWrittenOff)}</div></div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => { onSaved(); onClose(); }}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={true} onClose={onClose} title="Record Count and Damaged Crates" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Card variant="tinted" tint="bg-error-50" className="border border-error-200">
            <p className="text-body text-error-700">{error}</p>
          </Card>
        )}

        <Card variant="tinted" tint="bg-info-50" className="border border-info-200">
          <p className="text-body-medium text-info-900 font-medium mb-2">What this form does</p>
          <ul className="text-body text-info-800 space-y-1.5">
            <li>1. Enter the full-crate count the team can still see on the floor.</li>
            <li>2. Add any badly damaged crates that should be written off now.</li>
            <li>3. Mildly cracked crates that can still be sold later should not go into write-off.</li>
          </ul>
        </Card>

        <Select
          label="Batch"
          value={batchId}
          onChange={e => setBatchId(e.target.value)}
          required
          containerClassName="w-full"
        >
          <option value="">Select batch...</option>
          {batches.map(b => (
            <option key={b.batch.id} value={b.batch.id}>
              {b.batch.name} — {fmt(b.onHand)} on hand
            </option>
          ))}
        </Select>

        {selectedBatch && (
          <div className="grid grid-cols-2 gap-3">
            <Card variant="tinted" tint="bg-info-50" className="border border-info-200">
              <div className="flex justify-between mb-2">
                <span className="text-caption text-info-700">System count</span>
                <span className="font-bold text-info-900">{fmt(selectedBatch.onHand)} crates</span>
              </div>
              <div className="flex justify-between text-caption text-info-600">
                <span>Booked</span>
                <span>{fmt(selectedBatch.booked)}</span>
              </div>
              <div className="flex justify-between text-caption text-info-600 mt-1">
                <span>Available</span>
                <span>{fmt(selectedBatch.available)}</span>
              </div>
            </Card>

            <Card
              variant="tinted"
              tint={
                physicalCount === ''
                  ? 'bg-surface-50'
                  : differenceBeforeWriteOff === 0
                    ? 'bg-success-50 border border-success-200'
                    : 'bg-warning-50 border border-warning-200'
              }
              className={physicalCount === '' ? 'border border-surface-200' : ''}
            >
              <div className="flex justify-between mb-2">
                <span className="text-caption">Before write-off</span>
                <span className="font-bold text-metric">
                  {physicalCount === '' ? '—' : `${differenceBeforeWriteOff > 0 ? '+' : ''}${fmt(differenceBeforeWriteOff)}`}
                </span>
              </div>
              <p className="text-caption text-surface-600">
                {physicalCount === ''
                  ? 'Enter the physical count to compare it with the system.'
                  : differenceBeforeWriteOff === 0
                    ? 'The floor count matches the system before write-off.'
                    : 'This shows the difference between the floor count and the current system count.'}
              </p>
            </Card>
          </div>
        )}

        <Input
          label="Physical Count (crates)"
          type="number"
          min="0"
          value={physicalCount}
          onChange={e => setPhysicalCount(e.target.value)}
          required
          placeholder="Enter the count from floor"
          hint="Count only full crates that are still physically present."
          containerClassName="w-full"
        />

        <Input
          label="Badly Damaged Crates to Write Off"
          type="number"
          min="0"
          value={crackedWriteOff}
          onChange={e => setCrackedWriteOff(e.target.value)}
          hint="Use this only for crates that can no longer be sold at all."
          containerClassName="w-full"
        />

        <Textarea
          label="Notes"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Optional note, for example where the loss happened or what the team observed..."
          containerClassName="w-full"
        />

        <div className="flex gap-3 pt-4">
          <Button variant="secondary" type="button" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={saving || !batchId || !physicalCount}
            loading={saving}
            className="flex-1"
          >
            Save Count
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── BATCH DETAIL MODAL ──────────────────────────────────────────
function BatchDetailModal({ batchId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/inventory/batch/${batchId}`).then(setData).finally(() => setLoading(false));
  }, [batchId]);

  if (!data && loading) {
    return (
      <Modal open={true} onClose={onClose} size="lg">
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
        </div>
      </Modal>
    );
  }

  if (!data) return null;

  const { batch, stock, eggCodeBreakdown, recentCounts } = data;

  return (
    <Modal open={true} onClose={onClose} title={batch.name} size="lg">
      <div className="space-y-5">
        <div className="text-caption text-surface-500">Received {fmtDate(batch.receivedDate)}</div>

        {/* Stock summary */}
        <div className="grid grid-cols-3 gap-3">
          <Card variant="outlined">
            <div className="text-center">
              <div className="text-metric font-bold text-surface-800">{fmt(stock.onHand)}</div>
              <div className="text-caption text-surface-500 mt-1">On Hand</div>
            </div>
          </Card>
          <Card variant="outlined" tint="bg-warning-50 border border-warning-200">
            <div className="text-center">
              <div className="text-metric font-bold text-warning-700">{fmt(stock.booked)}</div>
              <div className="text-caption text-warning-600 mt-1">Booked</div>
            </div>
          </Card>
          <Card variant="outlined" tint="bg-brand-50 border border-brand-200">
            <div className="text-center">
              <div className="text-metric font-bold text-brand-700">{fmt(stock.heldForCheckout)}</div>
              <div className="text-caption text-brand-600 mt-1">Held in portal</div>
            </div>
          </Card>
          <Card variant="outlined" tint="bg-info-50 border border-info-200">
            <div className="text-center">
              <div className="text-metric font-bold text-info-700">{fmt(stock.available)}</div>
              <div className="text-caption text-info-600 mt-1">Available</div>
            </div>
          </Card>
        </div>

        <StockBar sold={stock.totalSold} writeOff={stock.totalWrittenOff} booked={stock.booked} heldForCheckout={stock.heldForCheckout} available={stock.available} total={stock.totalReceived} />

        {/* Egg code breakdown */}
        <div>
          <h4 className="text-heading text-surface-800 mb-3">Stock by Egg Code</h4>
          <div className="border border-surface-200 rounded-lg overflow-x-auto custom-scrollbar">
            <table className="w-full text-body">
              <thead>
                <tr className="bg-surface-50 border-b border-surface-200">
                  <th className="px-4 py-3 text-left text-overline text-surface-500">Code</th>
                  <th className="px-4 py-3 text-right text-overline text-surface-500">Cost</th>
                  <th className="px-4 py-3 text-right text-overline text-surface-500">Received</th>
                  <th className="px-4 py-3 text-right text-overline text-surface-500">Sold</th>
                  <th className="px-4 py-3 text-right text-overline text-surface-500">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {eggCodeBreakdown.map(ec => (
                  <tr key={ec.id} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium">{ec.code}</td>
                    <td className="px-4 py-3 text-right">{fmtMoney(ec.costPrice)}</td>
                    <td className="px-4 py-3 text-right">{fmt(ec.received)}</td>
                    <td className="px-4 py-3 text-right">{fmt(ec.sold)}</td>
                    <td className="px-4 py-3 text-right font-medium text-surface-800">{fmt(ec.remaining)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent counts */}
        <div>
          <h4 className="text-heading text-surface-800 mb-3">Recent Counts</h4>
          {recentCounts.length === 0 ? (
            <EmptyState
              title="No counts recorded"
              description="Physical counts will appear here once recorded."
            />
          ) : (
            <div className="border border-surface-200 rounded-lg overflow-x-auto custom-scrollbar">
              <table className="w-full text-body">
                <thead>
                  <tr className="bg-surface-50 border-b border-surface-200">
                    <th className="px-4 py-3 text-left text-overline text-surface-500">Date</th>
                    <th className="px-4 py-3 text-right text-overline text-surface-500">Physical</th>
                    <th className="px-4 py-3 text-right text-overline text-surface-500">System</th>
                    <th className="px-4 py-3 text-right text-overline text-surface-500">Disc.</th>
                    <th className="px-4 py-3 text-right text-overline text-surface-500">Write-off</th>
                    <th className="px-4 py-3 text-left text-overline text-surface-500">By</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCounts.map(c => (
                    <tr key={c.id} className={`border-b border-surface-100 ${c.discrepancy !== 0 ? 'bg-error-50' : 'hover:bg-surface-50'} transition-colors`}>
                      <td className="px-4 py-3">{fmtDate(c.countDate)}</td>
                      <td className="px-4 py-3 text-right">{fmt(c.physicalCount)}</td>
                      <td className="px-4 py-3 text-right">{fmt(c.systemCount)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${c.discrepancy !== 0 ? 'text-error-600' : 'text-success-600'}`}>
                        {c.discrepancy > 0 ? '+' : ''}{c.discrepancy}
                      </td>
                      <td className="px-4 py-3 text-right">{c.crackedWriteOff > 0 ? <span className="text-warning-600 font-medium">{c.crackedWriteOff}</span> : '—'}</td>
                      <td className="px-4 py-3 text-caption text-surface-500">{c.enteredBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ─── INVENTORY OVERVIEW TAB ──────────────────────────────────────
function OverviewTab({ inventory, totals, policy, loading, onRefresh }) {
  const [countBatchId, setCountBatchId] = useState(null);
  const [detailBatchId, setDetailBatchId] = useState(null);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card variant="outlined" className="border-info-200 bg-info-50">
        <div className="flex gap-3">
          <AlertIcon className="text-info-600 flex-shrink-0" />
          <div>
            <p className="text-body-medium font-medium text-info-900">Inventory control focus</p>
            <p className="text-body text-info-800 mt-1">
              Any batch above the current {policy?.crackAllowancePercent || 0}% crack allowance should be investigated.
            </p>
          </div>
        </div>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard label="Total Received" value={fmt(totals.totalReceived)} sub="crates" icon={<PackageIcon />} color="neutral" />
        <StatCard label="Total Sold" value={fmt(totals.totalSold)} sub="crates" icon={<CheckCircleIcon />} color="success" />
        <StatCard label="Written Off" value={fmt(totals.totalWrittenOff)} sub="crates" icon={<TrashIcon />} color="error" />
        <StatCard label="On Hand" value={fmt(totals.onHand)} sub="at depot" icon={<StoreIcon />} color="info" />
        <StatCard label="Booked" value={fmt(totals.booked)} sub="awaiting pickup" icon={<ClipboardIcon />} color="warning" />
        <StatCard label="Held" value={fmt(totals.heldForCheckout)} sub="portal checkouts" icon={<PackageIcon />} color="brand" />
        <StatCard label="Available" value={fmt(totals.available)} sub="for walk-ins" icon={<ShoppingCartIcon />} color="brand" />
        {(totals.crackedSoldQuantity || 0) > 0 && (
          <StatCard label="Cracked Sold" value={fmt(totals.crackedSoldQuantity)} sub="discounted" icon={<AlertIcon />} color="warning" />
        )}
      </div>

      {(totals.alertCount || 0) > 0 && (
        <Card variant="outlined" className="border-error-200 bg-error-50">
          <div className="flex gap-3">
            <AlertIcon className="text-error-600 flex-shrink-0" />
            <p className="text-body text-error-700">
              <span className="font-medium">{totals.alertCount} batch{totals.alertCount === 1 ? '' : 'es'}</span> {totals.alertCount === 1 ? 'is' : 'are'} above the current crack allowance. Open those batches and review counts or handling quickly.
            </p>
          </div>
        </Card>
      )}

      {/* Action button & heading */}
      <div className="flex justify-between items-center">
        <h2 className="text-title text-surface-800">Active Batches</h2>
        <Button variant="primary" size="md" icon={<ClipboardIcon />} onClick={() => setCountBatchId('')}>
          Record Count
        </Button>
      </div>

      {/* Batch inventory cards */}
      {inventory.length === 0 ? (
        <EmptyState
          icon={<PackageIcon className="text-surface-300 w-12 h-12" />}
          title="No active inventory"
          description="Receive a batch to see inventory here"
        />
      ) : (
        <div className="space-y-3">
          {inventory.map(item => (
            <Card
              key={item.batch.id}
              variant="outlined"
              className="hover:shadow-md transition-all cursor-pointer"
              onClick={() => setDetailBatchId(item.batch.id)}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="text-heading text-surface-800">{item.batch.name}</h3>
                      <Badge status={crackStatusMap[item.crackAlert?.level]?.color || 'neutral'}>
                        {crackStatusMap[item.crackAlert?.level]?.label || 'Within allowance'}
                      </Badge>
                    </div>
                    <p className="text-caption text-surface-500">
                      Received {fmtDate(item.batch.receivedDate)} · {item.batch.eggCodes.map(ec => ec.code).join(', ')}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-metric font-bold text-info-700">{fmt(item.onHand)}</div>
                    <div className="text-caption text-surface-500">on hand</div>
                  </div>
                </div>

                <StockBar sold={item.totalSold} writeOff={item.totalWrittenOff} booked={item.booked} heldForCheckout={item.heldForCheckout} available={item.available} total={item.totalReceived} />

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-caption">
                  <div>
                    <div className="text-surface-500">Received</div>
                    <div className="font-medium text-surface-800">{fmt(item.totalReceived)}</div>
                  </div>
                  <div>
                    <div className="text-surface-500">Sold</div>
                    <div className="font-medium text-success-700">{fmt(item.totalSold)}</div>
                  </div>
                  <div>
                    <div className="text-surface-500">Booked</div>
                    <div className="font-medium text-warning-700">{fmt(item.booked)}</div>
                  </div>
                  <div>
                    <div className="text-surface-500">Available</div>
                    <div className="font-medium text-info-700">{fmt(item.available)}</div>
                  </div>
                  <div>
                    <div className="text-surface-500">Held in portal</div>
                    <div className="font-medium text-brand-700">{fmt(item.heldForCheckout)}</div>
                  </div>
                  <div>
                    <div className="text-surface-500">Crack Rate</div>
                    <div className={`font-medium ${item.crackAlert?.level === 'ALERT' ? 'text-error-600' : item.crackAlert?.level === 'WATCH' ? 'text-warning-600' : 'text-success-600'}`}>
                      {Number(item.crackRatePercent || 0).toFixed(2)}%
                    </div>
                  </div>
                  {item.totalWrittenOff > 0 && (
                    <div>
                      <div className="text-surface-500">Write-off</div>
                      <div className="font-medium text-error-600">{fmt(item.totalWrittenOff)}</div>
                    </div>
                  )}
                </div>

                {item.latestCount && (
                  <Card variant="tinted" tint={item.latestCount.discrepancy !== 0 ? 'bg-error-50 border border-error-200' : 'bg-success-50 border border-success-200'} className="text-caption">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-surface-700 font-medium">
                          Last count: {fmtDate(item.latestCount.countDate)}
                        </p>
                        <p className="text-surface-600 mt-1">
                          Physical: <span className="font-medium">{fmt(item.latestCount.physicalCount)}</span> · System: <span className="font-medium">{fmt(item.latestCount.systemCount)}</span>
                          {item.latestCount.discrepancy !== 0 && (
                            <span className={`ml-2 font-bold ${item.latestCount.discrepancy > 0 ? 'text-error-600' : 'text-error-600'}`}>
                              (Disc: {item.latestCount.discrepancy > 0 ? '+' : ''}{item.latestCount.discrepancy})
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="text-surface-500">by {item.latestCount.enteredBy}</span>
                    </div>
                  </Card>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<PencilIcon />}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCountBatchId(item.batch.id);
                    }}
                    className="flex-1"
                  >
                    Record Count
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<ChevronRightIcon />}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailBatchId(item.batch.id);
                    }}
                  >
                    Details
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {countBatchId !== null && (
        <RecordCountModal
          batches={inventory}
          initialBatchId={countBatchId}
          onClose={() => setCountBatchId(null)}
          onSaved={onRefresh}
        />
      )}
      {detailBatchId && <BatchDetailModal batchId={detailBatchId} onClose={() => setDetailBatchId(null)} />}
    </div>
  );
}

// ─── COUNT HISTORY TAB ───────────────────────────────────────────
function CountHistoryTab() {
  const [counts, setCounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [discrepanciesOnly, setDiscrepanciesOnly] = useState(false);
  const [summary, setSummary] = useState({});
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (discrepanciesOnly) params.set('discrepanciesOnly', 'true');
      params.set('limit', String(pageSize));
      params.set('offset', String((page - 1) * pageSize));
      const res = await api.get(`/inventory/counts?${params}`);
      setCounts(res.counts || []);
      setSummary({ total: res.total, totalDiscrepancies: res.totalDiscrepancies, totalWriteOffs: res.totalWriteOffs });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, discrepanciesOnly, page]);

  useEffect(() => { setPage(1); }, [dateFrom, dateTo, discrepanciesOnly]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <Input
          label="From"
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          containerClassName="w-fit"
        />
        <Input
          label="To"
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          containerClassName="w-fit"
        />
        <label className="flex items-center gap-2 cursor-pointer py-1">
          <input
            type="checkbox"
            checked={discrepanciesOnly}
            onChange={e => setDiscrepanciesOnly(e.target.checked)}
            className="w-4 h-4 rounded border border-surface-300 cursor-pointer"
          />
          <span className="text-body text-error-600 font-medium">Discrepancies only</span>
        </label>
      </div>

      {/* Summary */}
      <div className="flex flex-wrap gap-4 text-body">
        <div>
          <span className="text-surface-500">Total counts: </span>
          <span className="font-medium text-surface-800">{summary.total || 0}</span>
        </div>
        <div>
          <span className="text-error-500">Discrepancies: </span>
          <span className="font-medium">{summary.totalDiscrepancies || 0}</span>
        </div>
        <div>
          <span className="text-warning-500">Write-offs: </span>
          <span className="font-medium">{summary.totalWriteOffs || 0} crates</span>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
        </div>
      ) : counts.length === 0 ? (
        <EmptyState
          icon={<ClipboardIcon className="text-surface-300 w-12 h-12" />}
          title="No counts found"
          description="Count records will appear here once recorded."
        />
      ) : (
        <div className="border border-surface-200 rounded-lg overflow-x-auto custom-scrollbar">
          <table className="w-full text-body">
            <thead>
              <tr className="bg-surface-50 border-b border-surface-200">
                <th className="px-4 py-3 text-left text-overline text-surface-500">Date</th>
                <th className="px-4 py-3 text-left text-overline text-surface-500">Batch</th>
                <th className="px-4 py-3 text-right text-overline text-surface-500">Physical</th>
                <th className="px-4 py-3 text-right text-overline text-surface-500">System</th>
                <th className="px-4 py-3 text-right text-overline text-surface-500">Discrepancy</th>
                <th className="px-4 py-3 text-right text-overline text-surface-500">Write-off</th>
                <th className="px-4 py-3 text-left text-overline text-surface-500">By</th>
                <th className="px-4 py-3 text-left text-overline text-surface-500">Notes</th>
              </tr>
            </thead>
            <tbody>
              {counts.map(c => (
                <tr key={c.id} className={`border-b border-surface-100 ${c.discrepancy !== 0 ? 'bg-error-50' : 'hover:bg-surface-50'} transition-colors`}>
                  <td className="px-4 py-3">{fmtDate(c.countDate)}</td>
                  <td className="px-4 py-3 font-medium text-surface-800">{c.batchName}</td>
                  <td className="px-4 py-3 text-right">{fmt(c.physicalCount)}</td>
                  <td className="px-4 py-3 text-right">{fmt(c.systemCount)}</td>
                  <td className={`px-4 py-3 text-right font-bold ${c.discrepancy !== 0 ? 'text-error-600' : 'text-success-600'}`}>
                    {c.discrepancy === 0 ? '✓' : (c.discrepancy > 0 ? '+' : '') + c.discrepancy}
                  </td>
                  <td className="px-4 py-3 text-right">{c.crackedWriteOff > 0 ? <span className="text-warning-600 font-medium">{c.crackedWriteOff}</span> : '—'}</td>
                  <td className="px-4 py-3 text-caption text-surface-500">{c.enteredBy}</td>
                  <td className="px-4 py-3 text-caption text-surface-400 max-w-xs truncate">{c.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pageSize={pageSize} total={summary.total || 0} onChange={setPage} noun="counts" />
    </div>
  );
}

// ─── WRITE-OFFS TAB ──────────────────────────────────────────────
function WriteOffsTab() {
  const [writeOffs, setWriteOffs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({});
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const res = await api.get(`/inventory/write-offs?${params}`);
      setWriteOffs(res.writeOffs || []);
      setSummary({ count: res.count, totalWriteOffs: res.totalWriteOffs, totalEstimatedLoss: res.totalEstimatedLoss });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Input
          label="From"
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          containerClassName="w-fit"
        />
        <Input
          label="To"
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          containerClassName="w-fit"
        />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Total Write-offs" value={fmt(summary.totalWriteOffs || 0)} sub="crates" icon={<TrashIcon />} color="error" />
        <StatCard label="Estimated Loss" value={fmtMoney(summary.totalEstimatedLoss || 0)} sub="at cost price" icon={<AlertIcon />} color="warning" />
        <StatCard label="Write-off Events" value={summary.count || 0} sub="records" icon={<ClipboardIcon />} color="neutral" />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
        </div>
      ) : writeOffs.length === 0 ? (
        <EmptyState
          icon={<TrashIcon className="text-surface-300 w-12 h-12" />}
          title="No write-offs recorded"
          description="Write-off records will appear here once recorded."
        />
      ) : (
        <div className="border border-surface-200 rounded-lg overflow-x-auto custom-scrollbar">
          <table className="w-full text-body">
            <thead>
              <tr className="bg-surface-50 border-b border-surface-200">
                <th className="px-4 py-3 text-left text-overline text-surface-500">Date</th>
                <th className="px-4 py-3 text-left text-overline text-surface-500">Batch</th>
                <th className="px-4 py-3 text-right text-overline text-surface-500">Crates</th>
                <th className="px-4 py-3 text-right text-overline text-surface-500">Est. Loss</th>
                <th className="px-4 py-3 text-left text-overline text-surface-500">By</th>
                <th className="px-4 py-3 text-left text-overline text-surface-500">Notes</th>
              </tr>
            </thead>
            <tbody>
              {writeOffs.map(w => (
                <tr key={w.id} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                  <td className="px-4 py-3">{fmtDate(w.countDate)}</td>
                  <td className="px-4 py-3 font-medium text-surface-800">{w.batchName}</td>
                  <td className="px-4 py-3 text-right font-bold text-error-600">{w.crackedWriteOff}</td>
                  <td className="px-4 py-3 text-right text-warning-600">{fmtMoney(w.estimatedLoss)}</td>
                  <td className="px-4 py-3 text-caption text-surface-500">{w.enteredBy}</td>
                  <td className="px-4 py-3 text-caption text-surface-400 max-w-xs truncate">{w.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── MAIN INVENTORY PAGE ─────────────────────────────────────────
export default function Inventory() {
  const [tab, setTab] = useState('overview');
  const [inventory, setInventory] = useState([]);
  const [totals, setTotals] = useState({ totalReceived: 0, totalSold: 0, totalWrittenOff: 0, crackedSoldQuantity: 0, onHand: 0, booked: 0, available: 0, alertCount: 0 });
  const [policy, setPolicy] = useState({ crackAllowancePercent: 0 });
  const [loading, setLoading] = useState(true);

  const loadInventory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/inventory');
      setInventory(res.inventory || []);
      setTotals(res.totals || totals);
      setPolicy(res.policy || { crackAllowancePercent: 0 });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadInventory(); }, [loadInventory]);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: <PackageIcon className="w-4 h-4" /> },
    { id: 'counts', label: 'Count History', icon: <ClipboardIcon className="w-4 h-4" /> },
    { id: 'writeoffs', label: 'Write-offs', icon: <TrashIcon className="w-4 h-4" /> },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-display text-surface-900">Inventory</h1>
        <p className="text-body text-surface-500 mt-1">Depot stock levels, physical counts, and write-offs</p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 bg-surface-100 rounded-lg p-1 mb-6 w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-body-medium font-medium transition-all duration-fast whitespace-nowrap ${
              tab === t.id
                ? 'bg-surface-0 text-surface-900 shadow-xs'
                : 'text-surface-600 hover:text-surface-800 hover:bg-surface-50'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab inventory={inventory} totals={totals} policy={policy} loading={loading} onRefresh={loadInventory} />}
      {tab === 'counts' && <CountHistoryTab />}
      {tab === 'writeoffs' && <WriteOffsTab />}
    </div>
  );
}
