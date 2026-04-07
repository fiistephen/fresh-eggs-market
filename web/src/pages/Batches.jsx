import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

const STATUS_COLORS = {
  OPEN: 'bg-blue-100 text-blue-700',
  RECEIVED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-gray-100 text-gray-500',
};

const STATUS_LABELS = {
  OPEN: 'Open',
  RECEIVED: 'Received',
  CLOSED: 'Closed',
};

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatCurrency(n) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(n);
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString('en-NG');
}

function formatPercent(n) {
  return `${Number(n || 0).toFixed(1)}%`;
}

function isBatchOverdue(batch) {
  if (batch.status !== 'OPEN' || !batch.expectedDate) return false;
  const today = new Date();
  const expected = new Date(batch.expectedDate);
  today.setHours(0, 0, 0, 0);
  expected.setHours(0, 0, 0, 0);
  return expected < today;
}

function getAttentionItems(batch) {
  const items = [];
  if (isBatchOverdue(batch)) items.push('Awaiting receipt');
  if (batch.overview?.crackAlert?.level === 'ALERT') items.push('High crack loss');
  if (batch.status !== 'OPEN' && (batch.overview?.varianceToPolicy || 0) < 0) items.push('Below profit target');
  if (batch.status === 'RECEIVED' && (batch.overview?.availableForSale || 0) <= 0) items.push('No sale-ready stock');
  return items;
}

function SummaryCard({ label, value, subtext, tone = 'gray' }) {
  const tones = {
    gray: 'bg-white border-gray-200 text-gray-900',
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    green: 'bg-green-50 border-green-200 text-green-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    red: 'bg-red-50 border-red-200 text-red-900',
  };

  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <p className="text-xs font-medium uppercase tracking-wider opacity-65">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {subtext && <p className="mt-1 text-sm opacity-70">{subtext}</p>}
    </div>
  );
}

function MetricPill({ label, value, tone = 'gray' }) {
  const tones = {
    gray: 'bg-gray-50 text-gray-700 border-gray-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <div className={`rounded-xl border px-3 py-2 ${tones[tone]}`}>
      <p className="text-[11px] uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function BatchCard({ batch, onOpen }) {
  const attentionItems = getAttentionItems(batch);
  const hasAttention = attentionItems.length > 0;
  const isOpen = batch.status === 'OPEN';
  const isReceived = batch.status === 'RECEIVED';
  const statusTone = hasAttention ? 'red' : isReceived ? 'green' : isOpen ? 'blue' : 'gray';

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">{batch.name}</h2>
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[batch.status]}`}>
              {STATUS_LABELS[batch.status]}
            </span>
            {hasAttention && (
              <span className="inline-flex rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                Needs attention
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Expected {formatDate(batch.expectedDate)}
            {batch.receivedDate && <> · Received {formatDate(batch.receivedDate)}</>}
            {batch.closedDate && <> · Closed {formatDate(batch.closedDate)}</>}
          </p>
          {batch.eggCodes?.length > 0 ? (
            <p className="mt-2 text-sm text-gray-600">
              FE mix: <span className="font-medium">{batch.eggCodes.map((eggCode) => eggCode.code).join(', ')}</span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-gray-500">No FE mix has been entered yet. Receive this batch to add the actual egg codes.</p>
          )}
        </div>

        <div className="sm:text-right">
          <p className="text-xs uppercase tracking-wider text-gray-400">Quick view</p>
          <p className="mt-1 text-sm font-medium text-brand-600">Open batch workspace</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricPill
          label={isOpen ? 'Booked so far' : 'Confirmed bookings'}
          value={`${formatNumber(batch.overview?.totalBooked)} crates`}
          tone="amber"
        />
        <MetricPill
          label={isOpen ? 'Still to receive' : 'Sale-ready stock'}
          value={`${formatNumber(isOpen ? batch.overview?.remainingToReceive : batch.overview?.availableForSale)} crates`}
          tone={isOpen ? 'blue' : 'green'}
        />
        <MetricPill
          label={isOpen ? 'Booking space used' : 'On hand now'}
          value={isOpen ? formatPercent(batch.overview?.bookingUtilizationPercent) : `${formatNumber(batch.overview?.onHand)} crates`}
          tone="gray"
        />
        <MetricPill
          label={isOpen ? 'Expected quantity' : 'Profit vs target'}
          value={isOpen
            ? `${formatNumber(batch.expectedQuantity)} crates`
            : `${(batch.overview?.varianceToPolicy || 0) >= 0 ? '+' : '-'}${formatCurrency(Math.abs(batch.overview?.varianceToPolicy || 0))}`}
          tone={isOpen ? statusTone : (batch.overview?.varianceToPolicy || 0) >= 0 ? 'green' : 'red'}
        />
      </div>

      {isReceived && (
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricPill label="Received" value={`${formatNumber(batch.overview?.totalReceived)} crates`} tone="gray" />
          <MetricPill label="Sold" value={`${formatNumber(batch.overview?.totalSold)} crates`} tone="blue" />
          <MetricPill label="Write-off" value={`${formatNumber(batch.overview?.totalWrittenOff)} crates`} tone="red" />
          <MetricPill
            label="Crack rate"
            value={formatPercent(batch.overview?.crackRatePercent)}
            tone={batch.overview?.crackAlert?.level === 'ALERT' ? 'red' : batch.overview?.crackAlert?.level === 'WATCH' ? 'amber' : 'green'}
          />
        </div>
      )}

      {attentionItems.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {attentionItems.map((item) => (
            <span key={item} className="inline-flex rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
              {item}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

export default function Batches() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');

  const canCreate = ['ADMIN', 'MANAGER'].includes(user?.role);

  useEffect(() => { loadBatches(); }, [filter, search]);

  async function loadBatches() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set('status', filter);
      if (search.trim()) params.set('search', search.trim());
      const query = params.toString();
      const data = await api.get(`/batches${query ? `?${query}` : ''}`);
      setBatches(data.batches);
      setError('');
    } catch (err) {
      setError('Failed to load batches');
    } finally {
      setLoading(false);
    }
  }

  const openBatches = batches.filter((batch) => batch.status === 'OPEN');
  const receivedBatches = batches.filter((batch) => batch.status === 'RECEIVED');
  const summary = {
    openForBooking: openBatches.reduce((sum, batch) => sum + (batch.availableForBooking || 0), 0),
    saleReady: receivedBatches.reduce((sum, batch) => sum + (batch.overview?.availableForSale || 0), 0),
    confirmedBookings: batches.reduce((sum, batch) => sum + (batch.overview?.totalBooked || 0), 0),
    attentionCount: batches.filter((batch) => getAttentionItems(batch).length > 0).length,
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Batches</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Start from the incoming batch, then track bookings, receipt, stock, cracks, and profit in one place.
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <span className="text-lg leading-none">+</span> Create Batch
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        <SummaryCard
          label="Open for booking"
          value={`${formatNumber(summary.openForBooking)} crates`}
          subtext={`${openBatches.length} batch${openBatches.length === 1 ? '' : 'es'} not yet received`}
          tone="blue"
        />
        <SummaryCard
          label="Ready to sell"
          value={`${formatNumber(summary.saleReady)} crates`}
          subtext={`${receivedBatches.length} received batch${receivedBatches.length === 1 ? '' : 'es'}`}
          tone="green"
        />
        <SummaryCard
          label="Confirmed bookings"
          value={`${formatNumber(summary.confirmedBookings)} crates`}
          subtext="Still waiting to be picked up"
          tone="amber"
        />
        <SummaryCard
          label="Needs attention"
          value={formatNumber(summary.attentionCount)}
          subtext="Overdue, high crack loss, or below target"
          tone={summary.attentionCount > 0 ? 'red' : 'gray'}
        />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="w-full lg:max-w-md">
            <label className="block text-sm font-medium text-gray-700 mb-1">Find a batch</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by batch name"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500"
            />
            <p className="mt-1 text-xs text-gray-500">Search by batch name, for example `8APR2026`.</p>
          </div>

          <div className="overflow-x-auto">
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter</label>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
              {[
                { value: '', label: 'All' },
                { value: 'OPEN', label: 'Open' },
                { value: 'RECEIVED', label: 'Received' },
                { value: 'CLOSED', label: 'Closed' },
              ].map(tab => (
                <button
                  key={tab.value}
                  onClick={() => setFilter(tab.value)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    filter === tab.value
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading batches...</div>
      ) : batches.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📦</div>
          <p className="text-gray-500">No batches found</p>
          {canCreate && (
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 text-brand-500 hover:text-brand-600 text-sm font-medium"
            >
              Create your first batch
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {batches.map((batch) => (
            <BatchCard
              key={batch.id}
              batch={batch}
              onOpen={() => navigate(`/batches/${batch.id}`)}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateBatchModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadBatches(); }}
        />
      )}
    </div>
  );
}

function CreateBatchModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    expectedDate: '',
    expectedQuantity: 1800,
    availableForBooking: 1800,
    wholesalePrice: '',
    retailPrice: '',
    costPrice: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post('/batches', {
        ...form,
        expectedQuantity: Number(form.expectedQuantity),
        availableForBooking: Number(form.availableForBooking),
        wholesalePrice: Number(form.wholesalePrice),
        retailPrice: Number(form.retailPrice),
        costPrice: Number(form.costPrice),
      });
      onCreated();
    } catch (err) {
      setError(err.error || 'Failed to create batch');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900">Create New Batch</h2>
          <p className="text-xs sm:text-sm text-gray-500">A batch will be auto-named from the expected date.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expected Arrival Date</label>
            <input
              type="date"
              required
              value={form.expectedDate}
              onChange={e => update('expectedDate', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expected Quantity (crates)</label>
              <input
                type="number"
                required min="1"
                value={form.expectedQuantity}
                onChange={e => update('expectedQuantity', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Available for Booking</label>
              <input
                type="number"
                required min="0"
                value={form.availableForBooking}
                onChange={e => update('availableForBooking', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cost Price (₦)</label>
              <input
                type="number"
                required min="1"
                placeholder="4600"
                value={form.costPrice}
                onChange={e => update('costPrice', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Wholesale (₦)</label>
              <input
                type="number"
                required min="1"
                placeholder="5000"
                value={form.wholesalePrice}
                onChange={e => update('wholesalePrice', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Retail (₦)</label>
              <input
                type="number"
                required min="1"
                placeholder="5400"
                value={form.retailPrice}
                onChange={e => update('retailPrice', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors w-full sm:w-auto"
            >
              {submitting ? 'Creating...' : 'Create Batch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
