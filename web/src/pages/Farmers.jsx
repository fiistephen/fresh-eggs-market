import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Button, Card, Input, Modal, EmptyState, Select, Textarea, Pagination } from '../components/ui';

function formatCurrency(value) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusTone(status) {
  if (status === 'OVERDRAWN') return 'bg-error-50 text-error-700 border-error-100';
  if (status === 'BALANCE_WITH_FARMER') return 'bg-warning-50 text-warning-700 border-warning-100';
  return 'bg-success-50 text-success-700 border-success-100';
}

function statusLabel(status) {
  if (status === 'OVERDRAWN') return 'Overdrawn';
  if (status === 'BALANCE_WITH_FARMER') return 'Balance with farmer';
  return 'Settled';
}

function MetricCard({ label, value, subtext }) {
  return (
    <div className="rounded-lg border border-surface-200 bg-surface-0 p-4">
      <p className="text-overline text-surface-500">{label}</p>
      <p className="mt-2 text-metric text-surface-900">{value}</p>
      {subtext ? <p className="mt-1 text-caption text-surface-600">{subtext}</p> : null}
    </div>
  );
}

function FarmersEmptyIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 18.5V10a2 2 0 0 1 .88-1.66l5.5-3.67a3 3 0 0 1 3.24 0l5.5 3.67A2 2 0 0 1 20 10v8.5" />
      <path d="M8 18h8" />
      <path d="M9 14c1.5-1 4.5-1 6 0" />
      <path d="M12 10v.01" />
    </svg>
  );
}

export default function Farmers() {
  const [farmers, setFarmers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedFarmerId, setSelectedFarmerId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadFarmers();
    }, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [search, page]);

  async function loadFarmers() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      params.set('limit', String(pageSize));
      params.set('offset', String((page - 1) * pageSize));
      const data = await api.get(`/farmers?${params.toString()}`);
      setFarmers(data.farmers || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.error || 'Failed to load farmers');
    } finally {
      setLoading(false);
    }
  }

  const totals = useMemo(() => ({
    currentBalance: farmers.reduce((sum, farmer) => sum + Number(farmer.currentBalance || 0), 0),
    activeCount: farmers.filter((farmer) => farmer.isActive !== false).length,
    withBalanceCount: farmers.filter((farmer) => Number(farmer.currentBalance || 0) > 0.009).length,
    overdrawnCount: farmers.filter((farmer) => Number(farmer.currentBalance || 0) < -0.009).length,
  }), [farmers]);

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-display text-surface-900">Farmers</h1>
          <p className="text-body text-surface-500 mt-1">Track batch suppliers, Banking-linked farmer payments, and the running balance still sitting with each farmer.</p>
        </div>
        <Button variant="primary" size="md" onClick={() => setShowCreate(true)}>New Farmer</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 mb-6">
        <MetricCard label="Farmers" value={total.toLocaleString()} subtext={`${totals.activeCount.toLocaleString()} active`} />
        <MetricCard label="Current prepaid balance" value={formatCurrency(totals.currentBalance)} subtext={`${totals.withBalanceCount.toLocaleString()} farmers still have balance sitting with them`} />
        <MetricCard label="Needs attention" value={totals.overdrawnCount.toLocaleString()} subtext="Farmers whose drawdowns are ahead of recorded balance" />
      </div>

      <div className="mb-6 max-w-md">
        <Input
          type="text"
          placeholder="Search by farmer name or phone"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {error ? (
        <div className="mb-6 rounded-lg border border-error-100 bg-error-50 px-4 py-3 text-body text-error-700">{error}</div>
      ) : null}

      {loading ? (
        <Card className="text-center py-12"><p className="text-body text-surface-500">Loading farmers...</p></Card>
      ) : farmers.length === 0 ? (
        <EmptyState
          icon={<FarmersEmptyIcon />}
          title={search ? 'No farmers found' : 'No farmers yet'}
          description={search ? 'Try a different search.' : 'Create your first farmer so batches can draw down the farmer ledger when they are received.'}
          action={!search ? () => setShowCreate(true) : undefined}
          actionLabel={!search ? 'Add first farmer' : undefined}
        />
      ) : (
        <Card variant="outlined" padding="none">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[980px]">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  <th className="px-4 py-3 text-left text-overline text-surface-500">Farmer</th>
                  <th className="px-4 py-3 text-left text-overline text-surface-500">Phone</th>
                  <th className="px-4 py-3 text-right text-overline text-surface-500">Current balance</th>
                  <th className="px-4 py-3 text-left text-overline text-surface-500">Last payment</th>
                  <th className="px-4 py-3 text-left text-overline text-surface-500">Last batch</th>
                  <th className="px-4 py-3 text-center text-overline text-surface-500">Batches</th>
                  <th className="px-4 py-3 text-center text-overline text-surface-500">Ledger lines</th>
                  <th className="px-4 py-3 text-left text-overline text-surface-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {farmers.map((farmer) => (
                  <tr
                    key={farmer.id}
                    className="cursor-pointer border-b border-surface-100 hover:bg-surface-50 transition-colors duration-fast"
                    onClick={() => setSelectedFarmerId(farmer.id)}
                  >
                    <td className="px-4 py-3">
                      <p className="text-body-medium font-semibold text-surface-900">{farmer.name}</p>
                      <p className="mt-1 text-caption text-surface-500">{farmer.notes || 'No notes yet'}</p>
                    </td>
                    <td className="px-4 py-3 text-body text-surface-600">{farmer.phone || '—'}</td>
                    <td className={`px-4 py-3 text-right text-body-medium font-semibold ${Number(farmer.currentBalance || 0) < 0 ? 'text-error-700' : 'text-surface-900'}`}>
                      {formatCurrency(farmer.currentBalance)}
                    </td>
                    <td className="px-4 py-3 text-body text-surface-600">
                      {farmer.latestPayment ? (
                        <>
                          <p className="font-medium text-surface-800">{formatCurrency(farmer.latestPayment.amount)}</p>
                          <p className="mt-1 text-caption text-surface-500">{formatDate(farmer.latestPayment.entryDate)}</p>
                        </>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-body text-surface-600">
                      {farmer.latestBatch ? (
                        <>
                          <p className="font-medium text-surface-800">{farmer.latestBatch.name}</p>
                          <p className="mt-1 text-caption text-surface-500">{formatDate(farmer.latestBatch.receivedDate || farmer.latestBatch.expectedDate)}</p>
                        </>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-body text-surface-600">{farmer._count?.batches || 0}</td>
                    <td className="px-4 py-3 text-center text-body text-surface-600">{farmer._count?.ledgerEntries || 0}</td>
                    <td className="px-4 py-3 text-body text-surface-600">
                      {farmer.isActive === false ? (
                        <span className="inline-flex rounded-full border border-surface-200 bg-surface-100 px-2.5 py-1 text-caption-medium text-surface-600">Inactive</span>
                      ) : (
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-caption-medium ${statusTone(farmer.status)}`}>{statusLabel(farmer.status)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} noun="farmers" />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Farmer" size="md">
        <CreateFarmerModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadFarmers();
          }}
        />
      </Modal>

      <Modal open={!!selectedFarmerId} onClose={() => setSelectedFarmerId(null)} size="lg">
        {selectedFarmerId ? (
          <FarmerDetailModal
            farmerId={selectedFarmerId}
            onClose={() => setSelectedFarmerId(null)}
            onUpdated={loadFarmers}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function CreateFarmerModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', phone: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post('/farmers', {
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      onCreated();
    } catch (err) {
      setError(err.error || 'Failed to create farmer');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error ? <div className="rounded-lg border border-error-100 bg-error-50 px-3 py-2 text-body text-error-700">{error}</div> : null}
      <Input label="Farmer name" required value={form.name} onChange={(event) => update('name', event.target.value)} />
      <Input label="Phone" value={form.phone} onChange={(event) => update('phone', event.target.value)} />
      <Textarea label="Notes" rows={3} value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Optional background or payment note" />
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" size="md" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" size="md" loading={submitting}>Create Farmer</Button>
      </div>
    </form>
  );
}

function FarmerDetailModal({ farmerId, onClose, onUpdated }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showLedgerEntry, setShowLedgerEntry] = useState(false);

  useEffect(() => {
    loadFarmer();
  }, [farmerId]);

  async function loadFarmer() {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/farmers/${farmerId}`);
      setData(response);
    } catch (err) {
      setError(err.error || 'Failed to load farmer');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="p-6 text-body text-surface-500">Loading farmer...</div>;
  if (error || !data?.farmer) return <div className="p-6 text-body text-error-700">{error || 'Farmer not found'}</div>;

  const { farmer, summary, ledgerEntries } = data;
  const batches = farmer.batches || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-title text-surface-900">{farmer.name}</h2>
          <p className="mt-1 text-body text-surface-500">{farmer.phone || 'No phone'} {farmer.notes ? `· ${farmer.notes}` : ''}</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowLedgerEntry(true)}>Record adjustment</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard label="Current balance" value={formatCurrency(summary.currentBalance)} subtext="What is still sitting with this farmer" />
        <MetricCard label="Total prepayments" value={formatCurrency(summary.totalPrepayments)} subtext="All increases to the farmer balance" />
        <MetricCard label="Total drawdowns" value={formatCurrency(summary.totalDrawdowns)} subtext="Batches already received from this farmer" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card padding="comfortable">
          <p className="text-overline text-surface-500">Last Banking payment</p>
          {summary.lastPayment ? (
            <>
              <p className="mt-2 text-title text-surface-900">{formatCurrency(summary.lastPayment.amount)}</p>
              <p className="mt-1 text-body text-surface-600">{formatDate(summary.lastPayment.entryDate)} · {summary.lastPayment.bankAccount?.name || 'Banking'}</p>
              <p className="mt-2 text-caption text-surface-500">{summary.lastPayment.reference || summary.lastPayment.description || 'No extra note'}</p>
            </>
          ) : (
            <p className="mt-2 text-body text-surface-500">No Banking-linked farmer payment yet.</p>
          )}
        </Card>

        <Card padding="comfortable">
          <p className="text-overline text-surface-500">Latest batch drawdown</p>
          {summary.lastDrawdown ? (
            <>
              <p className="mt-2 text-title text-surface-900">{formatCurrency(summary.lastDrawdown.amount)}</p>
              <p className="mt-1 text-body text-surface-600">{formatDate(summary.lastDrawdown.entryDate)} · {summary.lastDrawdown.batch?.name || 'Batch receipt'}</p>
              <p className="mt-2 text-caption text-surface-500">{summary.lastDrawdown.batch?.status || 'Receipt drawdown'}</p>
            </>
          ) : (
            <p className="mt-2 text-body text-surface-500">No receipt drawdown yet.</p>
          )}
        </Card>
      </div>

      <Card padding="comfortable">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-heading text-surface-900">Farmer ledger</h3>
            <p className="text-caption text-surface-500 mt-1">Newest first. Banking farmer payments increase the balance, receipt drawdowns reduce it.</p>
          </div>
        </div>
        {ledgerEntries.length === 0 ? (
          <p className="text-body text-surface-500">No farmer ledger lines yet.</p>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-surface-100">
                  <th className="px-3 py-3 text-left text-overline text-surface-500">Date</th>
                  <th className="px-3 py-3 text-left text-overline text-surface-500">Type</th>
                  <th className="px-3 py-3 text-right text-overline text-surface-500">Amount</th>
                  <th className="px-3 py-3 text-right text-overline text-surface-500">Effect</th>
                  <th className="px-3 py-3 text-left text-overline text-surface-500">Source</th>
                  <th className="px-3 py-3 text-left text-overline text-surface-500">Batch</th>
                  <th className="px-3 py-3 text-left text-overline text-surface-500">Staff</th>
                  <th className="px-3 py-3 text-left text-overline text-surface-500">Notes</th>
                </tr>
              </thead>
              <tbody>
                {ledgerEntries.map((entry) => (
                  <tr key={entry.id} className="border-b border-surface-50 align-top">
                    <td className="px-3 py-3 text-body text-surface-600">{formatDate(entry.entryDate)}</td>
                    <td className="px-3 py-3 text-body-medium text-surface-900">{entry.entryType.replaceAll('_', ' ').toLowerCase()}</td>
                    <td className="px-3 py-3 text-right text-body text-surface-700">{formatCurrency(entry.amount)}</td>
                    <td className={`px-3 py-3 text-right text-body-medium font-semibold ${Number(entry.balanceEffect) >= 0 ? 'text-success-700' : 'text-error-700'}`}>
                      {Number(entry.balanceEffect) >= 0 ? '+' : '-'}{formatCurrency(Math.abs(Number(entry.balanceEffect)))}
                    </td>
                    <td className="px-3 py-3 text-body text-surface-600">
                      {entry.bankTransaction
                        ? `Banking · ${entry.bankTransaction.bankAccount?.name || 'Account'}`
                        : entry.entryType === 'ADJUSTMENT'
                          ? 'Manual adjustment'
                          : 'Batch receipt'}
                    </td>
                    <td className="px-3 py-3 text-body text-surface-600">{entry.batch?.name || '—'}</td>
                    <td className="px-3 py-3 text-body text-surface-600">{entry.createdBy?.firstName || '—'} {entry.createdBy?.lastName || ''}</td>
                    <td className="px-3 py-3 text-body text-surface-500">{entry.notes || entry.bankTransaction?.reference || entry.bankTransaction?.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card padding="comfortable">
        <h3 className="text-heading text-surface-900 mb-4">Batches from this farmer</h3>
        {batches.length === 0 ? (
          <p className="text-body text-surface-500">No received or planned batches are linked to this farmer yet.</p>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[680px]">
              <thead>
                <tr className="border-b border-surface-100">
                  <th className="px-3 py-3 text-left text-overline text-surface-500">Batch</th>
                  <th className="px-3 py-3 text-left text-overline text-surface-500">Status</th>
                  <th className="px-3 py-3 text-left text-overline text-surface-500">Expected</th>
                  <th className="px-3 py-3 text-left text-overline text-surface-500">Received</th>
                  <th className="px-3 py-3 text-right text-overline text-surface-500">Cost marker</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id} className="border-b border-surface-50">
                    <td className="px-3 py-3 text-body-medium font-semibold text-surface-900">{batch.name}</td>
                    <td className="px-3 py-3 text-body text-surface-600">{batch.status}</td>
                    <td className="px-3 py-3 text-body text-surface-600">{formatDate(batch.expectedDate)}</td>
                    <td className="px-3 py-3 text-body text-surface-600">{batch.receivedDate ? formatDate(batch.receivedDate) : '—'}</td>
                    <td className="px-3 py-3 text-right text-body text-surface-700">{Number(batch.costPrice || 0) > 0 ? formatCurrency(batch.costPrice) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={showLedgerEntry} onClose={() => setShowLedgerEntry(false)} title={`Record farmer adjustment: ${farmer.name}`} size="md">
        <FarmerLedgerEntryModal
          farmerId={farmer.id}
          onClose={() => setShowLedgerEntry(false)}
          onSaved={() => {
            setShowLedgerEntry(false);
            loadFarmer();
            onUpdated();
          }}
        />
      </Modal>

      <div className="flex justify-end">
        <Button variant="secondary" size="md" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}

function FarmerLedgerEntryModal({ farmerId, onClose, onSaved }) {
  const [form, setForm] = useState({
    adjustmentDirection: 'INCREASE',
    amount: '',
    entryDate: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/farmers/${farmerId}/ledger-entries`, {
        entryType: 'ADJUSTMENT',
        adjustmentDirection: form.adjustmentDirection,
        amount: Number(form.amount),
        entryDate: form.entryDate,
        notes: form.notes.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err.error || 'Failed to save farmer ledger entry');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error ? <div className="rounded-lg border border-error-100 bg-error-50 px-3 py-2 text-body text-error-700">{error}</div> : null}

      <div className="rounded-lg border border-info-100 bg-info-50 px-3 py-3 text-body text-info-700">
        Real farmer payments should be recorded from Banking. Use this form only for manual corrections or balance adjustments.
      </div>

      <Select label="Adjustment effect" value={form.adjustmentDirection} onChange={(event) => update('adjustmentDirection', event.target.value)}>
        <option value="INCREASE">Increase farmer balance</option>
        <option value="DECREASE">Decrease farmer balance</option>
      </Select>

      <Input label="Amount" type="number" min="1" required value={form.amount} onChange={(event) => update('amount', event.target.value)} />
      <Input label="Entry date" type="date" required value={form.entryDate} onChange={(event) => update('entryDate', event.target.value)} />
      <Textarea label="Notes" rows={3} value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Why was this adjustment recorded?" />

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" size="md" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" size="md" loading={submitting}>Save Adjustment</Button>
      </div>
    </form>
  );
}
