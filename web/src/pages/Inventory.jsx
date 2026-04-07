import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

// ─── FORMAT HELPERS ──────────────────────────────────────────────
const fmt = (n) => Number(n).toLocaleString('en-NG');
const fmtMoney = (n) => '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 0 });
const fmtDate = (d) => new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
const today = () => new Date().toISOString().slice(0, 10);
const crackTone = {
  OK: 'bg-green-50 text-green-700 border-green-200',
  WATCH: 'bg-amber-50 text-amber-700 border-amber-200',
  ALERT: 'bg-red-50 text-red-700 border-red-200',
};

// ─── STAT CARD ───────────────────────────────────────────────────
function StatCard({ label, value, sub, color = 'gray', icon }) {
  const colors = {
    green: 'bg-green-50 border-green-200 text-green-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    red: 'bg-red-50 border-red-200 text-red-800',
    purple: 'bg-purple-50 border-purple-200 text-purple-800',
    gray: 'bg-gray-50 border-gray-200 text-gray-800',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="flex items-center gap-2 text-sm font-medium opacity-70 mb-1">{icon}{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs mt-1 opacity-60">{sub}</div>}
    </div>
  );
}

// ─── STOCK BAR ───────────────────────────────────────────────────
function StockBar({ sold, writeOff, booked, available, total }) {
  if (total <= 0) return null;
  const pctSold = (sold / total) * 100;
  const pctWO = (writeOff / total) * 100;
  const pctBooked = (booked / total) * 100;
  const pctAvail = (available / total) * 100;
  return (
    <div className="w-full h-3 rounded-full overflow-hidden flex bg-gray-100" title={`Sold: ${sold}, Written-off: ${writeOff}, Booked: ${booked}, Available: ${available}`}>
      {pctSold > 0 && <div className="bg-green-500 h-full" style={{ width: `${pctSold}%` }} />}
      {pctWO > 0 && <div className="bg-red-400 h-full" style={{ width: `${pctWO}%` }} />}
      {pctBooked > 0 && <div className="bg-amber-400 h-full" style={{ width: `${pctBooked}%` }} />}
      {pctAvail > 0 && <div className="bg-blue-400 h-full" style={{ width: `${pctAvail}%` }} />}
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
    const comp = result.computed;
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
          <div className="text-center mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <span className="text-green-600 text-xl">✓</span>
            </div>
            <h3 className="text-lg font-bold">Count Saved</h3>
            <p className="text-sm text-gray-500">{c.batch?.name || 'Batch'}</p>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">System Count</span><span className="font-medium">{fmt(c.systemCount)} crates</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Physical Count</span><span className="font-medium">{fmt(c.physicalCount)} crates</span></div>
            <div className={`flex justify-between ${c.discrepancy !== 0 ? 'text-red-600 font-bold' : 'text-green-600'}`}>
              <span>Discrepancy</span><span>{c.discrepancy > 0 ? '+' : ''}{c.discrepancy}</span>
            </div>
            {c.crackedWriteOff > 0 && (
              <div className="flex justify-between text-amber-600"><span>Write-off</span><span>{c.crackedWriteOff} crates</span></div>
            )}
          </div>
          {c.crackedWriteOff > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
              These crates have been recorded as badly damaged and removed from this batch's usable stock.
            </div>
          )}
          <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-1">
            <div className="flex justify-between"><span>Total Received</span><span>{fmt(comp.totalReceived)}</span></div>
            <div className="flex justify-between"><span>Total Sold</span><span>{fmt(comp.totalSold)}</span></div>
            <div className="flex justify-between"><span>Total Written Off</span><span>{fmt(comp.totalWrittenOff)}</span></div>
          </div>
          <button onClick={() => { onSaved(); onClose(); }} className="mt-4 w-full py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-4">Record Count and Damaged Crates</h3>
        {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            <p className="font-semibold text-blue-900">What this form does</p>
            <div className="mt-2 space-y-2">
              <p>1. Enter the full-crate count the team can still see on the floor.</p>
              <p>2. Add any badly damaged crates that should be written off now.</p>
              <p>3. Mildly cracked crates that can still be sold later should not go into write-off.</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Batch *</label>
            <select value={batchId} onChange={e => setBatchId(e.target.value)} required className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Select batch...</option>
              {batches.map(b => (
                <option key={b.batch.id} value={b.batch.id}>
                  {b.batch.name} — {fmt(b.onHand)} on hand
                </option>
              ))}
            </select>
          </div>

          {selectedBatch && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm">
                <div className="flex justify-between"><span className="text-blue-700">System count</span><span className="font-bold text-blue-900">{fmt(selectedBatch.onHand)} crates</span></div>
                <div className="flex justify-between text-blue-600 text-xs mt-1"><span>Booked</span><span>{fmt(selectedBatch.booked)}</span></div>
                <div className="flex justify-between text-blue-600 text-xs mt-1"><span>Available</span><span>{fmt(selectedBatch.available)}</span></div>
              </div>
              <div className={`rounded-xl border p-3 text-sm ${
                physicalCount === ''
                  ? 'border-gray-200 bg-gray-50 text-gray-600'
                  : differenceBeforeWriteOff === 0
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : 'border-amber-200 bg-amber-50 text-amber-700'
              }`}>
                <div className="flex justify-between"><span>Before write-off</span><span className="font-bold">
                  {physicalCount === '' ? '—' : `${differenceBeforeWriteOff > 0 ? '+' : ''}${fmt(differenceBeforeWriteOff)}`}
                </span></div>
                <p className="mt-2 text-xs">
                  {physicalCount === ''
                    ? 'Enter the physical count to compare it with the system.'
                    : differenceBeforeWriteOff === 0
                      ? 'The floor count matches the system before write-off.'
                      : 'This shows the difference between the floor count and the current system count.'}
                </p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Physical Count (crates) *</label>
            <input type="number" min="0" value={physicalCount} onChange={e => setPhysicalCount(e.target.value)} required placeholder="Enter the count from floor" className="w-full border rounded-lg px-3 py-2 text-sm" />
            <p className="text-xs text-gray-400 mt-1">Count only full crates that are still physically present.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Badly Damaged Crates to Write Off</label>
            <input type="number" min="0" value={crackedWriteOff} onChange={e => setCrackedWriteOff(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
            <p className="text-xs text-gray-400 mt-1">Use this only for crates that can no longer be sold at all.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional note, for example where the loss happened or what the team observed..." className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 border rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving || !batchId || !physicalCount} className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Count'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── BATCH DETAIL MODAL ──────────────────────────────────────────
function BatchDetailModal({ batchId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/inventory/batch/${batchId}`).then(setData).finally(() => setLoading(false));
  }, [batchId]);

  if (loading) return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-8" onClick={e => e.stopPropagation()}>
        <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full mx-auto" />
      </div>
    </div>
  );

  if (!data) return null;

  const { batch, stock, eggCodeBreakdown, recentCounts } = data;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold">{batch.name}</h3>
            <p className="text-sm text-gray-500">Received {fmtDate(batch.receivedDate)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        {/* Stock summary */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
          <div className="p-2 sm:p-3 bg-gray-50 rounded-lg text-center">
            <div className="text-lg sm:text-xl font-bold">{fmt(stock.onHand)}</div>
            <div className="text-[10px] sm:text-xs text-gray-500">On Hand</div>
          </div>
          <div className="p-2 sm:p-3 bg-amber-50 rounded-lg text-center">
            <div className="text-lg sm:text-xl font-bold text-amber-700">{fmt(stock.booked)}</div>
            <div className="text-[10px] sm:text-xs text-amber-600">Booked</div>
          </div>
          <div className="p-2 sm:p-3 bg-blue-50 rounded-lg text-center">
            <div className="text-lg sm:text-xl font-bold text-blue-700">{fmt(stock.available)}</div>
            <div className="text-[10px] sm:text-xs text-blue-600">Available</div>
          </div>
        </div>

        <StockBar sold={stock.totalSold} writeOff={stock.totalWrittenOff} booked={stock.booked} available={stock.available} total={stock.totalReceived} />
        <div className="flex gap-4 mt-2 text-xs text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded-full" />Sold ({fmt(stock.totalSold)})</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-400 rounded-full" />Write-off ({fmt(stock.totalWrittenOff)})</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-400 rounded-full" />Booked ({fmt(stock.booked)})</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-400 rounded-full" />Available ({fmt(stock.available)})</span>
        </div>

        {/* Egg code breakdown */}
        <h4 className="text-sm font-semibold mt-5 mb-2">Stock by Egg Code</h4>
        <div className="bg-gray-50 rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[400px]">
            <thead><tr className="text-xs text-gray-500 border-b"><th className="px-3 py-2 text-left">Code</th><th className="px-3 py-2 text-right">Cost</th><th className="px-3 py-2 text-right">Received</th><th className="px-3 py-2 text-right">Sold</th><th className="px-3 py-2 text-right">Remaining</th></tr></thead>
            <tbody>
              {eggCodeBreakdown.map(ec => (
                <tr key={ec.id} className="border-b border-gray-100">
                  <td className="px-3 py-2 font-mono font-medium">{ec.code}</td>
                  <td className="px-3 py-2 text-right">{fmtMoney(ec.costPrice)}</td>
                  <td className="px-3 py-2 text-right">{fmt(ec.received)}</td>
                  <td className="px-3 py-2 text-right">{fmt(ec.sold)}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmt(ec.remaining)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Recent counts */}
        <h4 className="text-sm font-semibold mt-5 mb-2">Recent Counts</h4>
        {recentCounts.length === 0 ? (
          <p className="text-sm text-gray-400 bg-gray-50 rounded-lg p-4 text-center">No counts recorded yet</p>
        ) : (
          <div className="bg-gray-50 rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead><tr className="text-xs text-gray-500 border-b"><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-right">Physical</th><th className="px-3 py-2 text-right">System</th><th className="px-3 py-2 text-right">Disc.</th><th className="px-3 py-2 text-right">Write-off</th><th className="px-3 py-2 text-left">By</th></tr></thead>
              <tbody>
                {recentCounts.map(c => (
                  <tr key={c.id} className={`border-b border-gray-100 ${c.discrepancy !== 0 ? 'bg-red-50' : ''}`}>
                    <td className="px-3 py-2">{fmtDate(c.countDate)}</td>
                    <td className="px-3 py-2 text-right">{fmt(c.physicalCount)}</td>
                    <td className="px-3 py-2 text-right">{fmt(c.systemCount)}</td>
                    <td className={`px-3 py-2 text-right font-medium ${c.discrepancy !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {c.discrepancy > 0 ? '+' : ''}{c.discrepancy}
                    </td>
                    <td className="px-3 py-2 text-right">{c.crackedWriteOff > 0 ? c.crackedWriteOff : '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{c.enteredBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── INVENTORY OVERVIEW TAB ──────────────────────────────────────
function OverviewTab({ inventory, totals, policy, loading, onRefresh }) {
  const [countBatchId, setCountBatchId] = useState(null);
  const [detailBatchId, setDetailBatchId] = useState(null);

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full" /></div>;

  return (
    <div>
      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm font-medium text-gray-900">Inventory control focus</p>
        <p className="text-sm text-gray-600 mt-1">
          This page now helps the team watch crack losses more closely. Any batch above the current {policy?.crackAllowancePercent || 0}% crack allowance should be investigated.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
        <StatCard label="Total Received" value={fmt(totals.totalReceived)} sub="crates" color="gray" icon="📦" />
        <StatCard label="Total Sold" value={fmt(totals.totalSold)} sub="crates" color="green" icon="✅" />
        <StatCard label="Written Off" value={fmt(totals.totalWrittenOff)} sub="crates" color="red" icon="🗑" />
        <StatCard label="Cracked Sold" value={fmt(totals.crackedSoldQuantity || 0)} sub="discounted crates" color="amber" icon="🥚" />
        <StatCard label="On Hand" value={fmt(totals.onHand)} sub="crates in depot" color="blue" icon="🏪" />
        <StatCard label="Booked" value={fmt(totals.booked)} sub="awaiting pickup" color="amber" icon="📋" />
        <StatCard label="Available" value={fmt(totals.available)} sub="for walk-ins" color="purple" icon="🛒" />
      </div>

      {(totals.alertCount || 0) > 0 && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {totals.alertCount} batch{totals.alertCount === 1 ? '' : 'es'} {totals.alertCount === 1 ? 'is' : 'are'} above the current crack allowance. Open those batches and review counts or handling quickly.
        </div>
      )}

      {/* Action button */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Active Batches</h3>
        <button onClick={() => setCountBatchId('')} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-2">
          <span>📝</span> Record Count
        </button>
      </div>

      {/* Batch inventory cards */}
      {inventory.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-400 text-lg mb-1">No active inventory</p>
          <p className="text-gray-300 text-sm">Receive a batch to see inventory here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {inventory.map(item => (
            <div key={item.batch.id} className="bg-white border rounded-xl p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="cursor-pointer" onClick={() => setDetailBatchId(item.batch.id)}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-bold text-lg">{item.batch.name}</h4>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${crackTone[item.crackAlert?.level] || crackTone.OK}`}>
                      {item.crackAlert?.label || 'Within crack allowance'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">Received {fmtDate(item.batch.receivedDate)} · {item.batch.eggCodes.map(ec => ec.code).join(', ')}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-blue-700">{fmt(item.onHand)}</div>
                  <div className="text-xs text-gray-400">on hand</div>
                </div>
              </div>

              <div className="cursor-pointer" onClick={() => setDetailBatchId(item.batch.id)}>
                <StockBar sold={item.totalSold} writeOff={item.totalWrittenOff} booked={item.booked} available={item.available} total={item.totalReceived} />
              </div>

              <div className="flex gap-6 mt-3 text-xs text-gray-500 cursor-pointer" onClick={() => setDetailBatchId(item.batch.id)}>
                <span>Received: <b>{fmt(item.totalReceived)}</b></span>
                <span>Sold: <b className="text-green-600">{fmt(item.totalSold)}</b></span>
                <span>Booked: <b className="text-amber-600">{fmt(item.booked)}</b></span>
                <span>Available: <b className="text-blue-600">{fmt(item.available)}</b></span>
                <span>Crack rate: <b className={item.crackAlert?.level === 'ALERT' ? 'text-red-600' : item.crackAlert?.level === 'WATCH' ? 'text-amber-600' : 'text-green-600'}>{Number(item.crackRatePercent || 0).toFixed(2)}%</b></span>
                {item.totalWrittenOff > 0 && <span>Write-off: <b className="text-red-500">{fmt(item.totalWrittenOff)}</b></span>}
              </div>

              {item.latestCount && (
                <div className={`mt-3 p-2 rounded-lg text-xs cursor-pointer ${item.latestCount.discrepancy !== 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`} onClick={() => setDetailBatchId(item.batch.id)}>
                  Last count: {fmtDate(item.latestCount.countDate)} — Physical: {fmt(item.latestCount.physicalCount)}, System: {fmt(item.latestCount.systemCount)}
                  {item.latestCount.discrepancy !== 0 && <span className="font-bold"> (discrepancy: {item.latestCount.discrepancy > 0 ? '+' : ''}{item.latestCount.discrepancy})</span>}
                  <span className="text-gray-400 ml-2">by {item.latestCount.enteredBy}</span>
                </div>
              )}

              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => setCountBatchId(item.batch.id)}
                  className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-100"
                >
                  Record count for this batch
                </button>
              </div>
            </div>
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (discrepanciesOnly) params.set('discrepanciesOnly', 'true');
      const res = await api.get(`/inventory/counts?${params}`);
      setCounts(res.counts || []);
      setSummary({ total: res.total, totalDiscrepancies: res.totalDiscrepancies, totalWriteOffs: res.totalWriteOffs });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, discrepanciesOnly]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm py-1.5 cursor-pointer">
          <input type="checkbox" checked={discrepanciesOnly} onChange={e => setDiscrepanciesOnly(e.target.checked)} className="rounded" />
          <span className="text-red-600 font-medium">Discrepancies only</span>
        </label>
      </div>

      {/* Summary */}
      <div className="flex gap-4 mb-4 text-sm">
        <span className="text-gray-500">Total counts: <b>{summary.total || 0}</b></span>
        <span className="text-red-500">Discrepancies: <b>{summary.totalDiscrepancies || 0}</b></span>
        <span className="text-amber-600">Write-offs: <b>{summary.totalWriteOffs || 0} crates</b></span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full" /></div>
      ) : counts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-400">No counts found</p>
        </div>
      ) : (
        <div className="bg-white border rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Batch</th>
                <th className="px-4 py-3 text-right">Physical</th>
                <th className="px-4 py-3 text-right">System</th>
                <th className="px-4 py-3 text-right">Discrepancy</th>
                <th className="px-4 py-3 text-right">Write-off</th>
                <th className="px-4 py-3 text-left">By</th>
                <th className="px-4 py-3 text-left">Notes</th>
              </tr>
            </thead>
            <tbody>
              {counts.map(c => (
                <tr key={c.id} className={`border-t ${c.discrepancy !== 0 ? 'bg-red-50' : ''}`}>
                  <td className="px-4 py-3">{fmtDate(c.countDate)}</td>
                  <td className="px-4 py-3 font-medium">{c.batchName}</td>
                  <td className="px-4 py-3 text-right">{fmt(c.physicalCount)}</td>
                  <td className="px-4 py-3 text-right">{fmt(c.systemCount)}</td>
                  <td className={`px-4 py-3 text-right font-bold ${c.discrepancy !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {c.discrepancy === 0 ? '✓' : (c.discrepancy > 0 ? '+' : '') + c.discrepancy}
                  </td>
                  <td className="px-4 py-3 text-right">{c.crackedWriteOff > 0 ? <span className="text-amber-600 font-medium">{c.crackedWriteOff}</span> : '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{c.enteredBy}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 max-w-[200px] truncate">{c.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <StatCard label="Total Write-offs" value={fmt(summary.totalWriteOffs || 0)} sub="crates" color="red" icon="🗑" />
        <StatCard label="Estimated Loss" value={fmtMoney(summary.totalEstimatedLoss || 0)} sub="at cost price" color="amber" icon="💰" />
        <StatCard label="Write-off Events" value={summary.count || 0} sub="records" color="gray" icon="📝" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full" /></div>
      ) : writeOffs.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-400">No write-offs recorded</p>
        </div>
      ) : (
        <div className="bg-white border rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Batch</th>
                <th className="px-4 py-3 text-right">Crates</th>
                <th className="px-4 py-3 text-right">Est. Loss</th>
                <th className="px-4 py-3 text-left">By</th>
                <th className="px-4 py-3 text-left">Notes</th>
              </tr>
            </thead>
            <tbody>
              {writeOffs.map(w => (
                <tr key={w.id} className="border-t">
                  <td className="px-4 py-3">{fmtDate(w.countDate)}</td>
                  <td className="px-4 py-3 font-medium">{w.batchName}</td>
                  <td className="px-4 py-3 text-right font-bold text-red-600">{w.crackedWriteOff}</td>
                  <td className="px-4 py-3 text-right text-amber-600">{fmtMoney(w.estimatedLoss)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{w.enteredBy}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 max-w-[200px] truncate">{w.notes || '—'}</td>
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
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'counts', label: 'Count History', icon: '📝' },
    { id: 'writeoffs', label: 'Write-offs', icon: '🗑' },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Inventory</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">Depot stock levels, physical counts, and write-offs</p>
      </div>

      {/* Tab nav */}
      <div className="overflow-x-auto mb-6">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${tab === t.id ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              <span className="mr-1">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && <OverviewTab inventory={inventory} totals={totals} policy={policy} loading={loading} onRefresh={loadInventory} />}
      {tab === 'counts' && <CountHistoryTab />}
      {tab === 'writeoffs' && <WriteOffsTab />}
    </div>
  );
}
