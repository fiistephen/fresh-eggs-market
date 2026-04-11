import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Button, Card, Badge, Modal, Input, EmptyState, useToast } from '../components/ui';
import { Select } from '../components/ui/Input';

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

function SummaryCard({ label, value, subtext, tone = 'neutral' }) {
  const tones = {
    neutral: 'bg-surface-0 border-surface-200 text-surface-900',
    brand: 'bg-brand-50 border-brand-200 text-brand-900',
    success: 'bg-success-50 border-success-100 text-success-700',
    warning: 'bg-warning-50 border-warning-100 text-warning-700',
    error: 'bg-error-50 border-error-100 text-error-700',
  };

  return (
    <div className={`rounded-lg border p-4 ${tones[tone]}`}>
      <p className="text-overline text-surface-500">{label}</p>
      <p className="mt-2 text-metric">{value}</p>
      {subtext && <p className="mt-1 text-caption text-surface-600">{subtext}</p>}
    </div>
  );
}

function MetricPill({ label, value, tone = 'neutral' }) {
  const tones = {
    neutral: 'bg-surface-50 text-surface-700 border-surface-200',
    brand: 'bg-brand-50 text-brand-700 border-brand-200',
    success: 'bg-success-50 text-success-700 border-success-100',
    warning: 'bg-warning-50 text-warning-700 border-warning-100',
    error: 'bg-error-50 text-error-700 border-error-100',
  };

  return (
    <div className={`rounded-lg border px-3 py-2 ${tones[tone]}`}>
      <p className="text-overline text-current opacity-70">{label}</p>
      <p className="mt-1 text-body-medium font-semibold">{value}</p>
    </div>
  );
}

function BatchCard({ batch, onOpen }) {
  const attentionItems = getAttentionItems(batch);
  const hasAttention = attentionItems.length > 0;
  const isOpen = batch.status === 'OPEN';
  const isReceived = batch.status === 'RECEIVED';
  const statusTone = hasAttention ? 'error' : isReceived ? 'success' : isOpen ? 'brand' : 'neutral';

  return (
    <Card variant="interactive" padding="comfortable" onClick={onOpen}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-heading text-surface-800">{batch.name}</h2>
            <Badge status={batch.status} />
            {hasAttention && (
              <Badge color="error">Needs attention</Badge>
            )}
          </div>
          <p className="mt-1 text-caption text-surface-600">
            Expected {formatDate(batch.expectedDate)}
            {batch.receivedDate && <> · Received {formatDate(batch.receivedDate)}</>}
            {batch.closedDate && <> · Closed {formatDate(batch.closedDate)}</>}
          </p>
          <p className="mt-2 text-body-medium text-surface-700">
            {batch.eggTypeLabel || 'Regular Size Eggs'}
          </p>
          {batch.farmer?.name ? (
            <p className="mt-2 text-caption text-surface-600">
              Farmer: <span className="font-medium text-surface-900">{batch.farmer.name}</span>
              {batch.farmer.phone ? <> · {batch.farmer.phone}</> : null}
            </p>
          ) : batch.status === 'OPEN' ? (
            <p className="mt-2 text-caption text-surface-500">Farmer will be selected when the batch is received</p>
          ) : null}
          {batch.eggCodes?.length > 0 ? (
            <p className="mt-2 text-caption text-surface-600">
              FE mix: <span className="font-medium">{batch.eggCodes.map((eggCode) => eggCode.code).join(', ')}</span>
            </p>
          ) : (
            <p className="mt-2 text-caption text-surface-500">FE mix will be added at receipt</p>
          )}
        </div>

        <div className="sm:text-right">
          <p className="text-overline text-surface-400">Quick view</p>
          <p className="mt-1 text-body-medium text-brand-600">Open workspace</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricPill
          label={isOpen ? 'Booked so far' : 'Confirmed bookings'}
          value={`${formatNumber(batch.overview?.totalBooked)} crates`}
          tone="warning"
        />
        <MetricPill
          label={isOpen ? 'Still to receive' : 'Sale-ready stock'}
          value={`${formatNumber(isOpen ? batch.overview?.remainingToReceive : batch.overview?.availableForSale)} crates`}
          tone={isOpen ? 'brand' : 'success'}
        />
        <MetricPill
          label={isOpen ? 'Booking space used' : 'On hand now'}
          value={isOpen ? formatPercent(batch.overview?.bookingUtilizationPercent) : `${formatNumber(batch.overview?.onHand)} crates`}
          tone="neutral"
        />
        <MetricPill
          label={isOpen ? 'Expected quantity' : 'Profit vs target'}
          value={isOpen
            ? `${formatNumber(batch.expectedQuantity)} crates`
            : `${(batch.overview?.varianceToPolicy || 0) >= 0 ? '+' : '-'}${formatCurrency(Math.abs(batch.overview?.varianceToPolicy || 0))}`}
          tone={isOpen ? statusTone : (batch.overview?.varianceToPolicy || 0) >= 0 ? 'success' : 'error'}
        />
      </div>

      {isReceived && (
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricPill label="Received" value={`${formatNumber(batch.overview?.totalReceived)} crates`} tone="neutral" />
          <MetricPill label="Sold" value={`${formatNumber(batch.overview?.totalSold)} crates`} tone="brand" />
          <MetricPill label="Write-off" value={`${formatNumber(batch.overview?.totalWrittenOff)} crates`} tone="error" />
          <MetricPill
            label="Crack rate"
            value={formatPercent(batch.overview?.crackRatePercent)}
            tone={batch.overview?.crackAlert?.level === 'ALERT' ? 'error' : batch.overview?.crackAlert?.level === 'WATCH' ? 'warning' : 'success'}
          />
        </div>
      )}

      {attentionItems.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {attentionItems.map((item) => (
            <Badge key={item} color="error">{item}</Badge>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function Batches() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

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
    } catch (err) {
      toast.error('Failed to load batches');
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

  const PlusIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );

  const PackageIcon = (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-display text-surface-900">Batches</h1>
          <p className="text-caption text-surface-600 mt-2">
            Track incoming batches, bookings, receipt, stock levels, crack losses, and profit in one place.
          </p>
        </div>
        {canCreate && (
          <Button
            onClick={() => setShowCreate(true)}
            variant="primary"
            size="md"
            icon={PlusIcon}
          >
            Create Batch
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        <SummaryCard
          label="Open for booking"
          value={`${formatNumber(summary.openForBooking)} crates`}
          subtext={`${openBatches.length} batch${openBatches.length === 1 ? '' : 'es'} not yet received`}
          tone="brand"
        />
        <SummaryCard
          label="Ready to sell"
          value={`${formatNumber(summary.saleReady)} crates`}
          subtext={`${receivedBatches.length} received batch${receivedBatches.length === 1 ? '' : 'es'}`}
          tone="success"
        />
        <SummaryCard
          label="Confirmed bookings"
          value={`${formatNumber(summary.confirmedBookings)} crates`}
          subtext="Still waiting to be picked up"
          tone="warning"
        />
        <SummaryCard
          label="Needs attention"
          value={formatNumber(summary.attentionCount)}
          subtext="Overdue, crack loss, or below target"
          tone={summary.attentionCount > 0 ? 'error' : 'neutral'}
        />
      </div>

      <Card padding="comfortable" className="mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="w-full lg:max-w-md">
            <Input
              type="text"
              label="Find a batch"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by batch name, e.g. 8APR2026"
              hint="Type to search"
            />
          </div>

          <div className="overflow-x-auto">
            <label className="block text-body-medium text-surface-700 mb-2">Filter</label>
            <div className="flex gap-0.5 bg-surface-100 rounded-md p-1 w-fit">
              {[
                { value: '', label: 'All' },
                { value: 'OPEN', label: 'Open' },
                { value: 'RECEIVED', label: 'Received' },
                { value: 'CLOSED', label: 'Closed' },
              ].map(tab => (
                <button
                  key={tab.value}
                  onClick={() => setFilter(tab.value)}
                  className={`px-4 py-2 rounded-md text-body-medium transition-all duration-fast ${
                    filter === tab.value
                      ? 'bg-surface-0 text-surface-900 shadow-xs'
                      : 'text-surface-600 hover:text-surface-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="text-center py-12 text-surface-500">Loading batches...</div>
      ) : batches.length === 0 ? (
        <EmptyState
          icon={PackageIcon}
          title="No batches found"
          description="Create your first batch to get started."
          action={canCreate ? () => setShowCreate(true) : undefined}
          actionLabel={canCreate ? 'Create Batch' : undefined}
        />
      ) : (
        <div className="space-y-3">
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
  const toast = useToast();
  const [form, setForm] = useState({
    expectedDate: '',
    expectedQuantity: 1800,
    availableForBooking: 1800,
    eggTypeKey: 'REGULAR',
    wholesalePrice: '',
    retailPrice: '',
  });
  const [eggTypes, setEggTypes] = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadCreateBatchMeta() {
      setLoadingMeta(true);
      try {
        const metaResponse = await api.get('/batches/meta');
        if (cancelled) return;
        const activeEggTypes = metaResponse.activeCustomerEggTypes || [];
        setEggTypes(activeEggTypes);
        setForm((current) => ({
          ...current,
          eggTypeKey: activeEggTypes.find((entry) => entry.key === 'REGULAR')?.key
            || activeEggTypes[0]?.key
            || 'REGULAR',
        }));
      } catch {
        if (!cancelled) setEggTypes([]);
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    }

    loadCreateBatchMeta();
    return () => { cancelled = true; };
  }, []);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      await api.post('/batches', {
        expectedDate: form.expectedDate,
        expectedQuantity: Number(form.expectedQuantity),
        availableForBooking: Number(form.availableForBooking),
        eggTypeKey: form.eggTypeKey,
        wholesalePrice: Number(form.wholesalePrice),
        retailPrice: Number(form.retailPrice),
      });
      toast.success('Batch created successfully');
      onCreated();
    } catch (err) {
      setError(err.error || 'Failed to create batch');
      toast.error(err.error || 'Failed to create batch');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Create New Batch"
      size="lg"
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            loading={submitting}
            onClick={handleSubmit}
          >
            Create Batch
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-caption text-surface-600">
          Batch name will be auto-generated from the expected date. Use this step to open the batch for bookings first, then enter FE mix and real cost prices when the eggs arrive.
        </p>

        {error && (
          <div className="bg-error-50 text-error-700 px-3 py-2 rounded-md text-caption border border-error-100">
            {error}
          </div>
        )}

        <Input
          type="date"
          label="Expected Arrival Date"
          required
          value={form.expectedDate}
          onChange={(e) => update('expectedDate', e.target.value)}
          containerClassName="w-full"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            type="number"
            label="Expected Quantity (crates)"
            required
            min="1"
            value={form.expectedQuantity}
            onChange={(e) => update('expectedQuantity', e.target.value)}
            containerClassName="w-full"
          />
          <Input
            type="number"
            label="Available for Booking"
            required
            min="0"
            value={form.availableForBooking}
            onChange={(e) => update('availableForBooking', e.target.value)}
            containerClassName="w-full"
          />
        </div>

        <Select
          label="Customer-facing egg type"
          required
          value={form.eggTypeKey}
          onChange={(e) => update('eggTypeKey', e.target.value)}
          hint="Only active egg types appear here"
          containerClassName="w-full"
        >
          {eggTypes.length === 0 ? (
            <option value="REGULAR">{loadingMeta ? 'Loading...' : 'Regular Size Eggs'}</option>
          ) : (
            eggTypes.map((eggType) => (
              <option key={eggType.key} value={eggType.key}>{eggType.label}</option>
            ))
          )}
        </Select>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            type="number"
            label="Wholesale price (₦)"
            required
            min="1"
            placeholder="5400"
            value={form.wholesalePrice}
            onChange={(e) => update('wholesalePrice', e.target.value)}
            containerClassName="w-full"
          />
          <Input
            type="number"
            label="Retail price (₦)"
            required
            min="1"
            placeholder="5500"
            value={form.retailPrice}
            onChange={(e) => update('retailPrice', e.target.value)}
            containerClassName="w-full"
          />
        </div>

        <div className="rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-caption text-brand-700">
          FE item codes, cost prices, and actual received quantities are no longer needed here. Capture them at <span className="font-medium">Receive Batch</span>, when the farm delivery is physically in hand.
        </div>
      </form>
    </Modal>
  );
}

