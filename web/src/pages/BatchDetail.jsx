import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Button, Input, Select, Modal, Card, Badge, EmptyState, useToast } from '../components/ui';

// SVG Icons (20x20, strokeWidth 1.75)
const IconArrowLeft = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
    <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconPlus = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
    <path d="M12 5v14m7-7H5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconCheck = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconX = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
    <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconTrash = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
    <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 5a1 1 0 011-1h4a1 1 0 011 1v2H9V5z"
          strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const STATUS_TOKENS = {
  OPEN: { bg: 'bg-info-50', border: 'border-info-200', text: 'text-info-700' },
  RECEIVED: { bg: 'bg-success-50', border: 'border-success-200', text: 'text-success-700' },
  CLOSED: { bg: 'bg-surface-100', border: 'border-surface-200', text: 'text-surface-600' },
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
  if (n == null) return '—';
  return Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(n);
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString('en-NG');
}

function formatPercent(n) {
  return `${Number(n || 0).toFixed(1)}%`;
}

function normalizeEggCode(code) {
  return String(code || '').trim().toUpperCase();
}

function OverviewCard({ label, value, subtext, tone = 'neutral' }) {
  const tones = {
    neutral: 'bg-surface-50 border-surface-200',
    warning: 'bg-warning-50 border-warning-200',
    success: 'bg-success-50 border-success-200',
    info: 'bg-info-50 border-info-200',
    error: 'bg-error-50 border-error-200',
  };

  return (
    <div className={`rounded-lg border p-4 ${tones[tone]} shadow-xs`}>
      <p className="text-overline text-surface-600">{label}</p>
      <p className="mt-2 text-metric text-surface-900">{value}</p>
      {subtext && <p className="mt-1 text-caption text-surface-600">{subtext}</p>}
    </div>
  );
}

export default function BatchDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [batch, setBatch] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('details');

  // Modal states
  const [showReceive, setShowReceive] = useState(false);
  const [showCount, setShowCount] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const canManage = ['ADMIN', 'MANAGER'].includes(user?.role);
  const canCount = ['ADMIN', 'MANAGER', 'SHOP_FLOOR'].includes(user?.role);
  const canDelete = user?.role === 'ADMIN';

  useEffect(() => { loadBatch(); }, [id]);

  async function loadBatch() {
    setLoading(true);
    setError('');
    try {
      const data = await api.get(`/batches/${id}`);
      setBatch(data.batch);

      if (['RECEIVED', 'CLOSED'].includes(data.batch.status) && canManage) {
        try {
          const analysisData = await api.get(`/batches/${id}/analysis`);
          setAnalysis(analysisData);
        } catch {
          // Analysis may fail if no sales yet
        }
      }
    } catch (err) {
      setError('Failed to load batch details');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="text-body text-surface-400">Loading batch details...</div>
      </div>
    );
  }

  if (error || !batch) {
    return (
      <div className="text-center py-16">
        <div className="text-error-600 mb-4 text-body">{error || 'Batch not found'}</div>
        <Button variant="tertiary" size="sm" onClick={() => navigate('/batches')}>
          Back to Batches
        </Button>
      </div>
    );
  }

  const overview = batch.overview || {};
  const hasCrackWatch = ['WATCH', 'ALERT'].includes(overview.crackAlert?.level);
  const isBelowPolicy = batch.status !== 'OPEN' && (overview.varianceToPolicy || 0) < 0;
  const showPolicyBanner = batch.status !== 'OPEN' && overview.totalReceived > 0;

  const tabs = [
    { key: 'details', label: 'Details' },
    ...(batch.eggCodes?.length > 0 ? [{ key: 'eggcodes', label: `Egg Codes (${batch.eggCodes.length})` }] : []),
    ...(batch.bookings?.length > 0 ? [{ key: 'bookings', label: `Bookings (${batch._count?.bookings || batch.bookings.length})` }] : []),
    ...(batch.sales?.length > 0 ? [{ key: 'sales', label: `Sales (${batch._count?.sales || batch.sales.length})` }] : []),
    ...((analysis && canManage) ? [{ key: 'analysis', label: 'Analysis' }] : []),
  ];

  const statusToken = STATUS_TOKENS[batch.status];

  return (
    <div>
      {/* Back nav */}
      <button
        onClick={() => navigate('/batches')}
        className="flex items-center gap-1.5 text-body-medium text-surface-600 hover:text-surface-900 mb-6 transition-colors duration-fast"
      >
        <IconArrowLeft /> Back to Batches
      </button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-0 mb-8">
        <div className="flex-1">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
            <h1 className="text-display text-surface-900">{batch.name}</h1>
            <Badge
              variant={batch.status === 'OPEN' ? 'info' : batch.status === 'RECEIVED' ? 'success' : 'neutral'}
              size="md"
            >
              {STATUS_LABELS[batch.status]}
            </Badge>
          </div>
          <p className="text-caption text-surface-600 mb-3">
            Expected {formatDate(batch.expectedDate)}
            {batch.receivedDate && <> · Received {formatDate(batch.receivedDate)}</>}
            {batch.closedDate && <> · Closed {formatDate(batch.closedDate)}</>}
          </p>
          <p className="text-body-medium text-surface-700">
            Customer-facing type: {batch.eggTypeLabel || 'Regular Size Eggs'}
          </p>
          {batch.farmer?.name ? (
            <p className="mt-2 text-caption text-surface-600">
              Farmer: <span className="font-medium text-surface-900">{batch.farmer.name}</span>
              {batch.farmer.phone ? <> · {batch.farmer.phone}</> : null}
            </p>
          ) : batch.status === 'OPEN' ? (
            <p className="mt-2 text-caption text-surface-500">Farmer will be selected when this batch is received.</p>
          ) : null}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {canManage && batch.status === 'OPEN' && (
            <>
              <Button variant="secondary" size="md" onClick={() => setShowEdit(true)}>
                Edit
              </Button>
              <Button variant="primary" size="md" onClick={() => setShowReceive(true)}>
                Receive Batch
              </Button>
            </>
          )}
          {canCount && batch.status === 'RECEIVED' && (
            <Button variant="secondary" size="md" onClick={() => setShowCount(true)}>
              Record Count
            </Button>
          )}
          {canManage && batch.status === 'RECEIVED' && (
            <Button variant="secondary" size="md" onClick={() => setShowClose(true)}>
              Close Batch
            </Button>
          )}
          {canDelete && batch.status === 'OPEN' && (batch._count?.bookings || 0) === 0 && (
            <Button variant="destructive" size="md" onClick={() => setShowDelete(true)}>
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Status banners */}
      {batch.status === 'OPEN' && (
        <div className="mb-4 rounded-lg border border-info-200 bg-info-50 p-4 shadow-xs">
          <p className="text-body-medium font-medium text-info-900">This batch is still waiting to be received.</p>
          <p className="mt-1 text-body text-info-700">
            Keep taking bookings here, then use <span className="font-medium">Receive Batch</span> when the eggs arrive so you can choose the farmer, enter the FE mix, actual quantities, and real cost prices.
          </p>
        </div>
      )}

      {hasCrackWatch && (
        <div className={`mb-4 rounded-lg border p-4 shadow-xs ${
          overview.crackAlert?.level === 'ALERT'
            ? 'border-error-200 bg-error-50'
            : 'border-warning-200 bg-warning-50'
        }`}>
          <p className={`text-body-medium font-medium ${
            overview.crackAlert?.level === 'ALERT' ? 'text-error-900' : 'text-warning-900'
          }`}>
            {overview.crackAlert?.label}
          </p>
          <p className={`mt-1 text-body ${
            overview.crackAlert?.level === 'ALERT' ? 'text-error-700' : 'text-warning-700'
          }`}>
            Crack impact is {formatPercent(overview.crackRatePercent)} for this batch. Review damaged write-off and discounted cracked sales.
          </p>
        </div>
      )}

      {showPolicyBanner && (
        <div className={`mb-6 rounded-lg border p-4 shadow-xs ${
          isBelowPolicy ? 'border-error-200 bg-error-50' : 'border-success-200 bg-success-50'
        }`}>
          <p className={`text-body-medium font-medium ${isBelowPolicy ? 'text-error-900' : 'text-success-900'}`}>
            {isBelowPolicy ? 'This batch is below the company profit target.' : 'This batch is above the company profit target.'}
          </p>
          <p className={`mt-1 text-body ${isBelowPolicy ? 'text-error-700' : 'text-success-700'}`}>
            Profit per crate is {formatCurrency(overview.profitPerCrate)}. Variance to target is{' '}
            <span className="font-medium">
              {(overview.varianceToPolicy || 0) >= 0 ? '+' : '-'}{formatCurrency(Math.abs(overview.varianceToPolicy || 0))}
            </span>.
          </p>
        </div>
      )}

      {/* Overview cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-8">
        <OverviewCard
          label="Confirmed bookings"
          value={`${formatNumber(overview.totalBooked)} crates`}
          subtext={`${overview.confirmedBookingCount || 0} active booking${overview.confirmedBookingCount === 1 ? '' : 's'}`}
          tone="warning"
        />
        <OverviewCard
          label="Held in portal"
          value={`${formatNumber(overview.heldForCheckout)} crates`}
          subtext={batch.status === 'OPEN' ? 'Unfinished checkouts already reduce booking space' : 'Buy-now holds waiting to complete payment'}
          tone="info"
        />
        <OverviewCard
          label={batch.status === 'OPEN' ? 'Still open for booking' : 'Sale-ready stock'}
          value={batch.status === 'OPEN' ? `${formatNumber(overview.remainingAvailableForBooking)} crates` : `${formatNumber(overview.availableForSale)} crates`}
          subtext={batch.status === 'OPEN'
            ? `${formatNumber(overview.totalCommitted)} already committed from this batch`
            : 'On hand minus confirmed bookings and portal holds'}
          tone={batch.status === 'OPEN' ? 'success' : 'success'}
        />
        <OverviewCard
          label={batch.status === 'OPEN' ? 'Booking space used' : 'On hand now'}
          value={batch.status === 'OPEN' ? formatPercent(overview.bookingUtilizationPercent) : `${formatNumber(overview.onHand)} crates`}
          subtext={batch.status === 'OPEN'
            ? `${formatNumber(batch.availableForBooking)} crates total booking capacity`
            : `${formatNumber(overview.totalSold)} sold · ${formatNumber(overview.totalWrittenOff)} written off`}
          tone="neutral"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-8">
        <OverviewCard
          label={batch.status === 'OPEN' ? 'Still to receive' : 'Received'}
          value={`${formatNumber(batch.status === 'OPEN' ? overview.remainingToReceive : overview.totalReceived)} crates`}
          subtext={batch.status === 'OPEN' ? 'Expected quantity not yet received' : `${formatNumber(overview.totalPaidQuantity)} paid · ${formatNumber(overview.totalFreeQuantity)} free`}
          tone={batch.status === 'OPEN' ? 'info' : 'neutral'}
        />
        <OverviewCard
          label={batch.status === 'OPEN' ? 'Arrival status' : 'Sold so far'}
          value={batch.status === 'OPEN'
            ? (new Date(batch.expectedDate) < new Date(new Date().setHours(0, 0, 0, 0)) ? 'Awaiting receipt' : 'On schedule')
            : `${formatNumber(overview.totalSold)} crates`}
          subtext={batch.status === 'OPEN'
            ? 'Receive this batch once eggs arrive at the depot'
            : `${formatNumber(overview.totalWrittenOff)} written off`}
          tone={batch.status === 'OPEN'
            ? (new Date(batch.expectedDate) < new Date(new Date().setHours(0, 0, 0, 0)) ? 'warning' : 'success')
            : 'brand'}
        />
        <OverviewCard
          label={batch.status === 'OPEN' ? 'Expected quantity' : 'Profit vs target'}
          value={batch.status === 'OPEN'
            ? `${formatNumber(batch.expectedQuantity)} crates`
            : `${(overview.varianceToPolicy || 0) >= 0 ? '+' : '-'}${formatCurrency(Math.abs(overview.varianceToPolicy || 0))}`}
          subtext={batch.status === 'OPEN'
            ? 'FE mix and cost prices will be captured when the batch is received'
            : `${formatCurrency(overview.profitPerCrate)} per crate`}
          tone={batch.status === 'OPEN' ? 'neutral' : (overview.varianceToPolicy || 0) >= 0 ? 'success' : 'error'}
        />
        <OverviewCard
          label={batch.status === 'OPEN' ? 'Portal holds included' : 'Crack rate'}
          value={batch.status === 'OPEN'
            ? `${formatNumber(overview.totalCommitted)} crates`
            : formatPercent(overview.crackRatePercent)}
          subtext={batch.status === 'OPEN'
            ? 'Confirmed bookings plus unfinished portal checkouts'
            : overview.crackAlert?.message || 'Within current allowance'}
          tone={batch.status === 'OPEN'
            ? 'warning'
            : (overview.crackAlert?.level === 'ALERT' ? 'error' : overview.crackAlert?.level === 'WATCH' ? 'warning' : 'success')}
        />
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 mb-8 bg-surface-50 rounded-lg p-1 overflow-x-auto custom-scrollbar">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 sm:px-4 py-2 rounded-md text-caption-medium font-medium transition-all duration-fast whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-surface-0 text-surface-900 shadow-xs'
                : 'text-surface-600 hover:text-surface-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'details' && <DetailsTab batch={batch} analysis={analysis} />}
      {activeTab === 'eggcodes' && <EggCodesTab batch={batch} />}
      {activeTab === 'bookings' && <BookingsTab batch={batch} />}
      {activeTab === 'sales' && <SalesTab batch={batch} />}
      {activeTab === 'analysis' && analysis && <AnalysisTab analysis={analysis} />}

      {/* Modals */}
      {showReceive && (
        <ReceiveBatchModal
          batch={batch}
          onClose={() => setShowReceive(false)}
          onReceived={() => { setShowReceive(false); loadBatch(); }}
        />
      )}
      {showCount && (
        <BatchCountModal
          batch={batch}
          onClose={() => setShowCount(false)}
          onSaved={() => { setShowCount(false); loadBatch(); }}
        />
      )}
      {showClose && (
        <CloseBatchModal
          batch={batch}
          onClose={() => setShowClose(false)}
          onClosed={() => { setShowClose(false); loadBatch(); }}
        />
      )}
      {showEdit && (
        <EditBatchModal
          batch={batch}
          onClose={() => setShowEdit(false)}
          onUpdated={() => { setShowEdit(false); loadBatch(); }}
        />
      )}
      {showDelete && (
        <DeleteBatchModal
          batch={batch}
          onClose={() => setShowDelete(false)}
          onDeleted={() => navigate('/batches')}
        />
      )}
    </div>
  );
}

// ─── DETAILS TAB ──────────────────────────────────────────────

function DetailsTab({ batch, analysis }) {
  const overview = batch.overview || {};
  const bookings = batch.bookings || [];
  const confirmedBookings = bookings.filter((booking) => booking.status === 'CONFIRMED');
  const pickedUpBookings = bookings.filter((booking) => booking.status === 'PICKED_UP');
  const cancelledBookings = bookings.filter((booking) => booking.status === 'CANCELLED');
  const bookingRevenue = bookings.reduce((sum, booking) => sum + Number(booking.amountPaid || 0), 0);
  const feMix = batch.eggCodes || [];
  const costPrices = feMix.map((item) => Number(item.costPrice || 0)).filter((value) => value > 0);

  function priceRangeLabel(values) {
    if (!values.length) return '—';
    const min = Math.min(...values);
    const max = Math.max(...values);
    return min === max ? formatCurrency(min) : `${formatCurrency(min)} to ${formatCurrency(max)}`;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <div className="border-b border-surface-200 pb-4 mb-4">
            <h3 className="text-overline text-surface-600">Batch Snapshot</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-caption text-surface-500">Expected quantity</p>
              <p className="mt-1 text-metric text-surface-900">{formatNumber(batch.expectedQuantity)} crates</p>
            </div>
            <div>
              <p className="text-caption text-surface-500">Available for booking</p>
              <p className="mt-1 text-metric text-surface-900">{formatNumber(batch.availableForBooking)} crates</p>
            </div>
            <div>
              <p className="text-caption text-surface-500">Actual received</p>
              <p className="mt-1 text-metric text-surface-900">
                {batch.actualQuantity != null ? `${formatNumber(batch.actualQuantity)} crates` : '—'}
              </p>
            </div>
            <div>
              <p className="text-caption text-surface-500">Paid crates</p>
              <p className="mt-1 text-metric text-surface-900">{formatNumber(overview.totalPaidQuantity)} crates</p>
            </div>
            <div>
              <p className="text-caption text-surface-500">Free crates</p>
              <p className="mt-1 text-metric text-success-700">{formatNumber(overview.totalFreeQuantity || batch.freeCrates)} crates</p>
            </div>
            <div>
              <p className="text-caption text-surface-500">FE codes in batch</p>
              <p className="mt-1 text-metric text-surface-900">{feMix.length}</p>
            </div>
            <div>
              <p className="text-caption text-surface-500">Customer-facing type</p>
              <p className="mt-1 text-metric text-surface-900">{batch.eggTypeLabel || 'Regular Size Eggs'}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="border-b border-surface-200 pb-4 mb-4">
            <h3 className="text-overline text-surface-600">Batch Selling Price</h3>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-caption text-surface-500">Cost price range</p>
              <p className="mt-1 text-2xl font-bold text-surface-900">{priceRangeLabel(costPrices)}</p>
            </div>
            <div>
              <p className="text-caption text-surface-500">Wholesale price</p>
              <p className="mt-1 text-2xl font-bold text-info-600">{formatCurrency(batch.wholesalePrice)}</p>
            </div>
            <div>
              <p className="text-caption text-surface-500">Retail price</p>
              <p className="mt-1 text-2xl font-bold text-success-600">{formatCurrency(batch.retailPrice)}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-overline text-surface-600">Booking Pressure</h3>
              <p className="mt-1 text-body text-surface-600">See how much of this batch is already promised to customers.</p>
            </div>
            <Badge variant="warning" size="sm">
              {formatPercent(overview.bookingUtilizationPercent)} of booking space used
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-caption text-surface-500">Confirmed</p>
              <p className="mt-1 text-metric text-surface-900">{confirmedBookings.length}</p>
            </div>
            <div>
              <p className="text-caption text-surface-500">Picked up</p>
              <p className="mt-1 text-metric text-info-700">{pickedUpBookings.length}</p>
            </div>
            <div>
              <p className="text-caption text-surface-500">Cancelled</p>
              <p className="mt-1 text-metric text-surface-700">{cancelledBookings.length}</p>
            </div>
            <div>
              <p className="text-caption text-surface-500">Booking value received</p>
              <p className="mt-1 text-metric text-success-700">{formatCurrency(bookingRevenue)}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-overline text-surface-600">Latest Count Check</h3>
              <p className="mt-1 text-body text-surface-600">Use this to compare what the system expects with what the floor team counted.</p>
            </div>
          </div>

          {overview.latestCount ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-caption text-surface-500">Count date</p>
                  <p className="mt-1 text-body font-medium text-surface-900">{formatDate(overview.latestCount.countDate)}</p>
                </div>
                <div>
                  <p className="text-caption text-surface-500">Entered by</p>
                  <p className="mt-1 text-body font-medium text-surface-900">{overview.latestCount.enteredBy}</p>
                </div>
                <div>
                  <p className="text-caption text-surface-500">System count</p>
                  <p className="mt-1 text-body font-medium text-surface-900">{formatNumber(overview.latestCount.systemCount)} crates</p>
                </div>
                <div>
                  <p className="text-caption text-surface-500">Physical count</p>
                  <p className="mt-1 text-body font-medium text-surface-900">{formatNumber(overview.latestCount.physicalCount)} crates</p>
                </div>
              </div>
              <div className={`rounded-md border px-3 py-3 text-body ${
                overview.latestCount.discrepancy === 0
                  ? 'border-success-200 bg-success-50 text-success-800'
                  : 'border-error-200 bg-error-50 text-error-800'
              }`}>
                {overview.latestCount.discrepancy === 0
                  ? 'The last physical count matched the system count.'
                  : `The last count had a discrepancy of ${formatNumber(overview.latestCount.discrepancy)} crates.`}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-surface-300 bg-surface-50 px-4 py-5 text-body text-surface-500">
              No physical count has been recorded for this batch yet.
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <div className="border-b border-surface-200 pb-4 mb-4">
            <h3 className="text-overline text-surface-600">FE Mix</h3>
          </div>
          {feMix.length === 0 ? (
            <p className="text-body text-surface-600">The final FE codes will appear here after this batch is received.</p>
          ) : (
            <div className="space-y-3">
              {feMix.map((eggCode) => (
                <div key={eggCode.id} className="rounded-md border border-surface-200 p-3 shadow-xs">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-body-medium font-semibold text-brand-600">{eggCode.code}</p>
                      <p className="mt-1 text-caption text-surface-600">{eggCode.item?.name || 'Catalog item linked'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-body-medium font-semibold text-surface-900">{formatNumber(eggCode.quantity + (eggCode.freeQty || 0))} crates</p>
                      <p className="text-caption text-surface-600">{formatCurrency(eggCode.costPrice)} cost price</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="border-b border-surface-200 pb-4 mb-4">
            <h3 className="text-overline text-surface-600">Operational Notes</h3>
          </div>
          <div className="space-y-3 text-body text-surface-600">
            <div className="rounded-md bg-surface-50 px-4 py-3">
              <span className="font-medium text-surface-900">Bookings do not reduce batch stock.</span> Stock reduces only when a sale happens or when damaged crates are written off.
            </div>
            <div className="rounded-md bg-surface-50 px-4 py-3">
              <span className="font-medium text-surface-900">Crack impact is tracked in crates.</span> Mildly cracked crates sold at discount and badly damaged write-offs are shown separately in analysis.
            </div>
            <div className="rounded-md bg-surface-50 px-4 py-3">
              <span className="font-medium text-surface-900">Company target for this batch:</span> about {formatCurrency(analysis?.policy?.targetProfitPerCrate || 500)} profit per crate.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── EGG CODES TAB ────────────────────────────────────────────

function EggCodesTab({ batch }) {
  return (
    <Card className="overflow-hidden overflow-x-auto">
      <table className="w-full min-w-max">
        <thead>
          <tr className="border-b border-surface-200">
            <th className="text-left py-3 px-4 text-overline text-surface-600">Code</th>
            <th className="text-right py-3 px-4 text-overline text-surface-600">Cost Price</th>
            <th className="text-right py-3 px-4 text-overline text-surface-600">Paid Qty</th>
            <th className="text-right py-3 px-4 text-overline text-surface-600">Free Qty</th>
            <th className="text-right py-3 px-4 text-overline text-surface-600">Total Qty</th>
            <th className="text-right py-3 px-4 text-overline text-surface-600">Subtotal (Cost)</th>
          </tr>
        </thead>
        <tbody>
          {batch.eggCodes.map(ec => (
            <tr key={ec.id} className="border-b border-surface-100">
              <td className="py-3 px-4">
                <span className="font-mono font-semibold text-brand-600">{ec.code}</span>
              </td>
              <td className="py-3 px-4 text-body text-right">{formatCurrency(ec.costPrice)}</td>
              <td className="py-3 px-4 text-body text-right">{ec.quantity.toLocaleString()}</td>
              <td className="py-3 px-4 text-body text-right text-success-600">{ec.freeQty || 0}</td>
              <td className="py-3 px-4 text-body text-right font-medium">{(ec.quantity + (ec.freeQty || 0)).toLocaleString()}</td>
              <td className="py-3 px-4 text-body text-right font-medium">{formatCurrency(ec.costPrice * ec.quantity)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-surface-50 font-medium">
            <td className="py-3 px-4 text-body">Total</td>
            <td className="py-3 px-4"></td>
            <td className="py-3 px-4 text-body text-right">
              {batch.eggCodes.reduce((s, ec) => s + ec.quantity, 0).toLocaleString()}
            </td>
            <td className="py-3 px-4 text-body text-right text-success-600">
              {batch.eggCodes.reduce((s, ec) => s + (ec.freeQty || 0), 0)}
            </td>
            <td className="py-3 px-4 text-body text-right">
              {batch.eggCodes.reduce((s, ec) => s + ec.quantity + (ec.freeQty || 0), 0).toLocaleString()}
            </td>
            <td className="py-3 px-4 text-body text-right">
              {formatCurrency(batch.eggCodes.reduce((s, ec) => s + ec.costPrice * ec.quantity, 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}

// ─── BOOKINGS TAB ─────────────────────────────────────────────

function BookingsTab({ batch }) {
  const BOOKING_STATUS = {
    CONFIRMED: { bg: 'bg-success-100', text: 'text-success-700' },
    PICKED_UP: { bg: 'bg-info-100', text: 'text-info-700' },
    CANCELLED: { bg: 'bg-error-100', text: 'text-error-700' },
  };

  return (
    <Card className="overflow-hidden overflow-x-auto">
      <table className="w-full min-w-max">
        <thead>
          <tr className="border-b border-surface-200">
            <th className="text-left py-3 px-4 text-overline text-surface-600">Customer</th>
            <th className="text-right py-3 px-4 text-overline text-surface-600">Quantity</th>
            <th className="text-right py-3 px-4 text-overline text-surface-600">Order Value</th>
            <th className="text-right py-3 px-4 text-overline text-surface-600">Amount Paid</th>
            <th className="text-center py-3 px-4 text-overline text-surface-600">Channel</th>
            <th className="text-center py-3 px-4 text-overline text-surface-600">Status</th>
            <th className="text-left py-3 px-4 text-overline text-surface-600">Date</th>
          </tr>
        </thead>
        <tbody>
          {batch.bookings.map(bk => {
            const statusStyle = BOOKING_STATUS[bk.status];
            return (
              <tr key={bk.id} className="border-b border-surface-100">
                <td className="py-3 px-4">
                  <span className="font-medium text-surface-900">{bk.customer?.name || '—'}</span>
                  {bk.customer?.phone && (
                    <span className="text-caption text-surface-500 ml-2">{bk.customer.phone}</span>
                  )}
                </td>
                <td className="py-3 px-4 text-body text-right">{bk.quantity.toLocaleString()}</td>
                <td className="py-3 px-4 text-body text-right">{formatCurrency(bk.orderValue)}</td>
                <td className="py-3 px-4 text-body text-right font-medium">{formatCurrency(bk.amountPaid)}</td>
                <td className="py-3 px-4 text-body text-center capitalize">{bk.channel}</td>
                <td className="py-3 px-4 text-center">
                  <Badge variant="neutral" size="sm">
                    {bk.status.replace('_', ' ')}
                  </Badge>
                </td>
                <td className="py-3 px-4 text-body text-surface-600">{formatDate(bk.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

// ─── SALES TAB ────────────────────────────────────────────────

function SalesTab({ batch }) {
  const PAYMENT_LABELS = {
    CASH: 'Cash',
    TRANSFER: 'Transfer',
    POS_CARD: 'POS/Card',
    PRE_ORDER: 'Pre-order',
  };

  return (
    <Card className="overflow-hidden overflow-x-auto">
      <table className="w-full min-w-max">
        <thead>
          <tr className="border-b border-surface-200">
            <th className="text-left py-3 px-4 text-overline text-surface-600">Receipt #</th>
            <th className="text-left py-3 px-4 text-overline text-surface-600">Customer</th>
            <th className="text-right py-3 px-4 text-overline text-surface-600">Qty</th>
            <th className="text-right py-3 px-4 text-overline text-surface-600">Amount</th>
            <th className="text-right py-3 px-4 text-overline text-surface-600">Cost</th>
            <th className="text-right py-3 px-4 text-overline text-surface-600">Profit</th>
            <th className="text-center py-3 px-4 text-overline text-surface-600">Payment</th>
            <th className="text-left py-3 px-4 text-overline text-surface-600">Date</th>
          </tr>
        </thead>
        <tbody>
          {batch.sales.map(sale => (
            <tr key={sale.id} className="border-b border-surface-100">
              <td className="py-3 px-4 font-mono text-body text-surface-600">{sale.receiptNumber}</td>
              <td className="py-3 px-4 text-body font-medium text-surface-900">{sale.customer?.name || '—'}</td>
              <td className="py-3 px-4 text-body text-right">{sale.totalQuantity.toLocaleString()}</td>
              <td className="py-3 px-4 text-body text-right">{formatCurrency(sale.totalAmount)}</td>
              <td className="py-3 px-4 text-body text-right text-surface-600">{formatCurrency(sale.totalCost)}</td>
              <td className="py-3 px-4 text-body text-right font-medium text-success-600">
                {formatCurrency(sale.totalAmount - sale.totalCost)}
              </td>
              <td className="py-3 px-4 text-body text-center">{PAYMENT_LABELS[sale.paymentMethod] || sale.paymentMethod}</td>
              <td className="py-3 px-4 text-body text-surface-600">{formatDate(sale.saleDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ─── ANALYSIS TAB ─────────────────────────────────────────────

function AnalysisTab({ analysis }) {
  const { batch, costs, sales, bookings, inventory, profit, prices, cracks, policy } = analysis;

  return (
    <div className="space-y-6">
      {/* Profit headline */}
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 sm:gap-6">
          <div>
            <p className="text-overline text-surface-600">Total Revenue</p>
            <p className="text-metric text-surface-900 mt-1">{formatCurrency(sales.totalRevenue)}</p>
          </div>
          <div>
            <p className="text-overline text-surface-600">Total Cost</p>
            <p className="text-metric text-surface-900 mt-1">{formatCurrency(sales.totalCost)}</p>
          </div>
          <div>
            <p className="text-overline text-surface-600">Gross Profit</p>
            <p className={`text-metric mt-1 font-bold ${profit.grossProfit >= 0 ? 'text-success-600' : 'text-error-600'}`}>
              {formatCurrency(profit.grossProfit)}
            </p>
            <p className="text-caption text-surface-600 mt-0.5">{profit.margin}% margin</p>
          </div>
          <div>
            <p className="text-overline text-surface-600">Policy Target</p>
            <p className="text-metric text-surface-900 mt-1">{formatCurrency(profit.expectedPolicyProfit)}</p>
            <p className="text-caption text-surface-600 mt-0.5">{formatCurrency(policy.targetProfitPerCrate)} per crate</p>
          </div>
          <div>
            <p className="text-overline text-surface-600">Variance To Policy</p>
            <p className={`text-metric mt-1 font-bold ${profit.varianceToPolicy >= 0 ? 'text-success-600' : 'text-error-600'}`}>
              {profit.varianceToPolicy >= 0 ? '+' : ''}{formatCurrency(Math.abs(profit.varianceToPolicy))}
            </p>
            <p className="text-caption text-surface-600 mt-0.5">{formatCurrency(profit.profitPerCrate)} per crate</p>
          </div>
        </div>
      </Card>

      {/* Cost breakdown by egg code */}
      <Card>
        <div className="border-b border-surface-200 pb-4 mb-4">
          <h3 className="text-overline text-surface-600">Cost Breakdown by Egg Code</h3>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full min-w-max">
            <thead>
              <tr className="border-b border-surface-200">
                <th className="text-left py-2 text-caption text-surface-600">Code</th>
                <th className="text-right py-2 text-caption text-surface-600">Qty (Paid)</th>
                <th className="text-right py-2 text-caption text-surface-600">Free</th>
                <th className="text-right py-2 text-caption text-surface-600">Cost/Crate</th>
                <th className="text-right py-2 text-caption text-surface-600">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {costs.eggCodes.map(ec => (
                <tr key={ec.code} className="border-b border-surface-100">
                  <td className="py-2 font-mono font-semibold text-brand-600">{ec.code}</td>
                  <td className="py-2 text-body text-right">{ec.quantity.toLocaleString()}</td>
                  <td className="py-2 text-body text-right text-success-600">{ec.freeQty}</td>
                  <td className="py-2 text-body text-right">{formatCurrency(ec.costPrice)}</td>
                  <td className="py-2 text-body text-right font-medium">{formatCurrency(ec.subtotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-medium">
                <td className="py-2 text-body">Total Cost</td>
                <td colSpan={3}></td>
                <td className="py-2 text-body text-right">{formatCurrency(costs.totalCost)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* Sales breakdown */}
      <Card>
        <div className="border-b border-surface-200 pb-4 mb-4">
          <h3 className="text-overline text-surface-600">Sales Breakdown</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {Object.entries(sales.breakdown).map(([type, amount]) => (
            <div key={type} className="border border-surface-200 rounded-md p-3 shadow-xs">
              <p className="text-caption text-surface-600 capitalize">{type.replace('_', ' ').toLowerCase()}</p>
              <p className="text-metric text-surface-900 mt-1 font-bold">{formatCurrency(amount)}</p>
              <p className="text-caption text-surface-600">{(sales.quantities[type] || 0).toLocaleString()} crates</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Inventory status */}
      <Card>
        <div className="border-b border-surface-200 pb-4 mb-4">
          <h3 className="text-overline text-surface-600">Inventory Status</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 sm:gap-4">
          <div>
            <p className="text-caption text-surface-600">Total Received</p>
            <p className="text-metric text-surface-900 font-medium">{inventory.totalReceived.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-caption text-surface-600">Total Sold</p>
            <p className="text-metric text-surface-900 font-medium">{inventory.totalSold.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-caption text-surface-600">Remaining</p>
            <p className="text-metric text-info-600 font-medium">{inventory.remaining.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-caption text-surface-600">Booked Portion</p>
            <p className="text-metric text-brand-600 font-medium">{inventory.bookedPortion.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-caption text-surface-600">Held in Portal</p>
            <p className="text-metric text-warning-600 font-medium">{(inventory.heldForCheckout || 0).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-caption text-surface-600">Available for Sale</p>
            <p className="text-metric text-success-600 font-medium">{inventory.availableForSale.toLocaleString()}</p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-overline text-surface-600">Crack Control</h3>
            <p className="text-body text-surface-600 mt-1">Track mildly cracked crates sold at discount separately from totally damaged write-offs.</p>
          </div>
          <Badge
            variant={
              cracks.crackAlert.level === 'ALERT'
                ? 'error'
                : cracks.crackAlert.level === 'WATCH'
                  ? 'warning'
                  : 'success'
            }
            size="sm"
          >
            {cracks.crackAlert.label}
          </Badge>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div>
            <p className="text-caption text-surface-600">Cracked Sold</p>
            <p className="text-metric text-surface-900 font-medium">{cracks.crackedSoldQuantity.toLocaleString()} crates</p>
            <p className="text-caption text-surface-600 mt-0.5">{formatCurrency(cracks.crackedSoldValue)}</p>
          </div>
          <div>
            <p className="text-caption text-surface-600">Damaged Write-off</p>
            <p className="text-metric text-error-600 font-medium">{cracks.totalDamagedWriteOff.toLocaleString()} crates</p>
          </div>
          <div>
            <p className="text-caption text-surface-600">Total Crack Impact</p>
            <p className="text-metric text-surface-900 font-medium">{cracks.totalCrackImpact.toLocaleString()} crates</p>
          </div>
          <div>
            <p className="text-caption text-surface-600">Crack Rate</p>
            <p className={`text-metric font-medium ${
              cracks.crackAlert.level === 'ALERT'
                ? 'text-error-600'
                : cracks.crackAlert.level === 'WATCH'
                  ? 'text-warning-600'
                  : 'text-success-600'
            }`}>
              {cracks.crackRatePercent.toFixed(2)}%
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── RECEIVE BATCH MODAL ──────────────────────────────────────

function ReceiveBatchModal({ batch, onClose, onReceived }) {
  const initialEggCodes = batch.eggCodes?.length
    ? batch.eggCodes.map((eggCode, index) => ({
        code: eggCode.code,
        costPrice: eggCode.costPrice || '',
        quantity: index === 0 ? batch.expectedQuantity : '',
        freeQty: index === 0 ? 3 : 0,
      }))
    : [
        { code: 'FE', costPrice: '', quantity: batch.expectedQuantity, freeQty: 3 },
      ];
  const [eggCodes, setEggCodes] = useState(initialEggCodes);
  const [wholesalePrice, setWholesalePrice] = useState(batch.wholesalePrice || '');
  const [retailPrice, setRetailPrice] = useState(batch.retailPrice || '');
  const [catalogItems, setCatalogItems] = useState([]);
  const [farmers, setFarmers] = useState([]);
  const [farmerId, setFarmerId] = useState(batch.farmer?.id || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const totalPaid = eggCodes.reduce((sum, ec) => sum + (Number(ec.quantity) || 0), 0);
  const totalFree = eggCodes.reduce((sum, ec) => sum + (Number(ec.freeQty) || 0), 0);
  const actualQuantity = totalPaid + totalFree;
  const expectedGap = actualQuantity - Number(batch.expectedQuantity || 0);
  const projectedFarmerDrawdown = eggCodes.reduce(
    (sum, ec) => sum + ((Number(ec.costPrice) || 0) * (Number(ec.quantity) || 0)),
    0,
  );
  const knownItemsByCode = new Map(
    catalogItems
      .filter((item) => item.code)
      .map((item) => [normalizeEggCode(item.code), item]),
  );
  const selectedFarmer = farmers.find((farmer) => farmer.id === farmerId) || null;
  const projectedFarmerBalance = selectedFarmer
    ? Number(selectedFarmer.currentBalance || 0) - projectedFarmerDrawdown
    : null;

  useEffect(() => {
    let cancelled = false;

    async function loadMetadata() {
      try {
        const [itemsData, farmersData] = await Promise.all([
          api.get('/items?category=FE_EGGS'),
          api.get('/farmers?limit=200'),
        ]);
        if (cancelled) return;
        setCatalogItems(itemsData.items || []);
        setFarmers(farmersData.farmers || []);
      } catch {
        if (cancelled) return;
        setCatalogItems([]);
        setFarmers([]);
      }
    }

    loadMetadata();
    return () => { cancelled = true; };
  }, []);

  function addEggCode() {
    const fallbackCode = catalogItems.find((item) => item.code)?.code || 'FE';
    setEggCodes([...eggCodes, { code: fallbackCode, costPrice: '', quantity: '', freeQty: 0 }]);
  }

  function removeEggCode(index) {
    if (eggCodes.length <= 1) return;
    setEggCodes(eggCodes.filter((_, i) => i !== index));
  }

  function updateEggCode(index, field, value) {
    const updated = [...eggCodes];
    const nextValue = field === 'code' ? normalizeEggCode(value) : value;
    updated[index] = { ...updated[index], [field]: nextValue };

    if (field === 'code') {
      const matchedItem = knownItemsByCode.get(normalizeEggCode(nextValue));
      if (matchedItem) {
        updated[index] = {
          ...updated[index],
          costPrice: updated[index].costPrice || matchedItem.defaultWholesalePrice || batch.costPrice,
        };
      }
    }

    setEggCodes(updated);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    const seenCodes = new Set();
    for (const ec of eggCodes) {
      const normalizedCode = normalizeEggCode(ec.code);
      if (!normalizedCode || !/^FE\d+$/.test(normalizedCode)) {
        setError('Invalid egg code: "' + ec.code + '". Must be FE followed by numbers (e.g. FE4600)');
        setSubmitting(false);
        return;
      }
      if (seenCodes.has(normalizedCode)) {
        setError('You entered ' + normalizedCode + ' more than once. Use one row per FE code.');
        setSubmitting(false);
        return;
      }
      seenCodes.add(normalizedCode);
      if (!ec.costPrice || Number(ec.costPrice) <= 0) {
        setError('Cost price for ' + normalizedCode + ' must be positive');
        setSubmitting(false);
        return;
      }
      if (!ec.quantity || Number(ec.quantity) <= 0) {
        setError('Quantity for ' + normalizedCode + ' must be positive');
        setSubmitting(false);
        return;
      }
    }

    if (!farmerId) {
      setError('Choose the farmer this batch came from before saving the receipt.');
      setSubmitting(false);
      return;
    }
    if (!wholesalePrice || Number(wholesalePrice) <= 0) {
      setError('Wholesale price for the batch must be positive');
      setSubmitting(false);
      return;
    }
    if (!retailPrice || Number(retailPrice) <= 0) {
      setError('Retail price for the batch must be positive');
      setSubmitting(false);
      return;
    }

    try {
      await api.patch('/batches/' + batch.id + '/receive', {
        actualQuantity,
        freeCrates: totalFree,
        farmerId,
        wholesalePrice: Number(wholesalePrice),
        retailPrice: Number(retailPrice),
        eggCodes: eggCodes.map((ec) => ({
          code: normalizeEggCode(ec.code),
          costPrice: Number(ec.costPrice),
          quantity: Number(ec.quantity),
          freeQty: Number(ec.freeQty) || 0,
        })),
      });
      onReceived();
    } catch (err) {
      setError(err.error || 'Failed to receive batch');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface-0 rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={(event) => event.stopPropagation()}>
        <div className="px-4 sm:px-6 py-4 border-b border-surface-200">
          <h2 className="text-title text-surface-900">Receive Batch: {batch.name}</h2>
          <p className="text-body text-surface-600 mt-1">Record what actually arrived from the farm, choose the farmer, then save the FE mix, paid crates, and any extra free crates.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5">
          {error ? (
            <div className="bg-error-50 text-error-700 px-3 py-2 rounded-md text-body">{error}</div>
          ) : null}

          <div className="rounded-md border border-info-200 bg-info-50 p-4">
            <p className="text-body-medium font-medium text-info-900">What to enter here</p>
            <div className="mt-2 space-y-2 text-body text-info-800">
              <p>1. Choose the farmer this batch came from.</p>
              <p>2. Add one row for each FE code that arrived in this batch.</p>
              <p>3. Enter the paid crates for each FE code and any extra free crates from the farm.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-md border border-surface-200 bg-surface-50 p-3 shadow-xs">
              <p className="text-overline text-surface-600">Expected</p>
              <p className="mt-1 text-metric text-surface-900">{formatNumber(batch.expectedQuantity)} crates</p>
            </div>
            <div className="rounded-md border border-surface-200 bg-surface-50 p-3 shadow-xs">
              <p className="text-overline text-surface-600">Paid</p>
              <p className="mt-1 text-metric text-surface-900">{formatNumber(totalPaid)} crates</p>
            </div>
            <div className="rounded-md border border-success-200 bg-success-50 p-3 shadow-xs">
              <p className="text-overline text-success-700">Free</p>
              <p className="mt-1 text-metric text-success-900">{formatNumber(totalFree)} crates</p>
            </div>
            <div className={
              'rounded-md border p-3 shadow-xs ' +
              (expectedGap >= 0 ? 'border-info-200 bg-info-50' : 'border-warning-200 bg-warning-50')
            }>
              <p className={'text-overline ' + (expectedGap >= 0 ? 'text-info-700' : 'text-warning-700')}>Total arrived</p>
              <p className={'mt-1 text-metric font-bold ' + (expectedGap >= 0 ? 'text-info-900' : 'text-warning-900')}>{formatNumber(actualQuantity)} crates</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Select label="Farmer this batch came from" required value={farmerId} onChange={(event) => setFarmerId(event.target.value)}>
              <option value="">Select farmer</option>
              {farmers.map((farmer) => (
                <option key={farmer.id} value={farmer.id}>
                  {farmer.name}{farmer.phone ? ' · ' + farmer.phone : ''}
                </option>
              ))}
            </Select>

            <div className="rounded-md border border-surface-200 bg-surface-50 p-4 shadow-xs">
              <p className="text-overline text-surface-600">Farmer ledger impact</p>
              {selectedFarmer ? (
                <div className="mt-2 space-y-2 text-body text-surface-700">
                  <p>
                    Current prepaid balance: <span className="font-medium text-surface-900">{formatCurrency(selectedFarmer.currentBalance)}</span>
                  </p>
                  <p>
                    This receipt drawdown: <span className="font-medium text-surface-900">{formatCurrency(projectedFarmerDrawdown)}</span>
                  </p>
                  <p>
                    Projected balance after receipt: <span className="font-medium text-surface-900">{formatCurrency(projectedFarmerBalance)}</span>
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-body text-surface-600">Choose the farmer first so you can see how this receipt will affect the farmer ledger.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Wholesale price for this batch"
              type="number"
              required
              min="1"
              value={wholesalePrice}
              onChange={(event) => setWholesalePrice(event.target.value)}
            />
            <Input
              label="Retail price for this batch"
              type="number"
              required
              min="1"
              value={retailPrice}
              onChange={(event) => setRetailPrice(event.target.value)}
            />
          </div>

          <div className={
            'rounded-md border px-3 py-3 text-body ' +
            (expectedGap === 0
              ? 'border-success-200 bg-success-50 text-success-800'
              : expectedGap > 0
                ? 'border-info-200 bg-info-50 text-info-800'
                : 'border-warning-200 bg-warning-50 text-warning-800')
          }>
            {expectedGap === 0 ? 'The total received matches the expected batch quantity exactly.' : null}
            {expectedGap > 0 ? 'This batch arrived with ' + formatNumber(expectedGap) + ' more crate' + (expectedGap === 1 ? '' : 's') + ' than expected.' : null}
            {expectedGap < 0 ? 'This batch is short by ' + formatNumber(Math.abs(expectedGap)) + ' crate' + (Math.abs(expectedGap) === 1 ? '' : 's') + ' compared with what was expected.' : null}
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <label className="text-body-medium font-medium text-surface-900">FE mix that arrived</label>
                <p className="mt-1 text-body text-surface-600">Known FE items will auto-fill their usual price when possible. New FE codes are allowed.</p>
              </div>
              <button
                type="button"
                onClick={addEggCode}
                className="flex items-center gap-1.5 text-brand-600 hover:text-brand-700 text-body-medium font-medium transition-colors"
              >
                <IconPlus /> Add Code
              </button>
            </div>

            <div className="space-y-3">
              {eggCodes.map((ec, index) => (
                <div key={index} className="rounded-md border border-surface-200 p-3 sm:p-4 shadow-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 sm:items-end">
                    <div className="sm:col-span-3">
                      {index === 0 ? <label className="block text-caption text-surface-600 mb-1">Code</label> : null}
                      <Input
                        list="batch-receive-fe-codes"
                        type="text"
                        required
                        placeholder="FE4600"
                        value={ec.code}
                        onChange={(event) => updateEggCode(index, 'code', event.target.value)}
                        size="sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      {index === 0 ? <label className="block text-caption text-surface-600 mb-1">Cost/Crate</label> : null}
                      <Input
                        type="number"
                        required
                        min="1"
                        placeholder="4600"
                        value={ec.costPrice}
                        onChange={(event) => updateEggCode(index, 'costPrice', event.target.value)}
                        size="sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      {index === 0 ? <label className="block text-caption text-surface-600 mb-1">Paid Qty</label> : null}
                      <Input
                        type="number"
                        required
                        min="1"
                        placeholder="1800"
                        value={ec.quantity}
                        onChange={(event) => updateEggCode(index, 'quantity', event.target.value)}
                        size="sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      {index === 0 ? <label className="block text-caption text-surface-600 mb-1">Free Qty</label> : null}
                      <Input
                        type="number"
                        min="0"
                        placeholder="3"
                        value={ec.freeQty}
                        onChange={(event) => updateEggCode(index, 'freeQty', event.target.value)}
                        size="sm"
                      />
                    </div>
                    <div className="sm:col-span-1 flex items-center justify-start sm:justify-end">
                      {eggCodes.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeEggCode(index)}
                          className="text-error-400 hover:text-error-600 text-body px-2 py-2 transition-colors"
                        >
                          <IconTrash />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-col gap-2 text-caption sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-surface-600">
                      {knownItemsByCode.get(normalizeEggCode(ec.code)) ? (
                        <>
                          Matched item: <span className="font-medium text-surface-900">{knownItemsByCode.get(normalizeEggCode(ec.code)).displayName || knownItemsByCode.get(normalizeEggCode(ec.code)).name}</span>
                        </>
                      ) : normalizeEggCode(ec.code) ? (
                        <>This FE code will be created as a new item if it does not already exist.</>
                      ) : (
                        <>Enter the FE code from the farm sheet.</>
                      )}
                    </div>
                    <div className="text-surface-600">
                      Row total: <span className="font-medium text-surface-900">{formatNumber((Number(ec.quantity) || 0) + (Number(ec.freeQty) || 0))} crates</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <datalist id="batch-receive-fe-codes">
              {catalogItems
                .filter((item) => item.code)
                .map((item) => (
                  <option key={item.id} value={item.code}>
                    {item.displayName || item.name}
                  </option>
                ))}
            </datalist>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-2 border-t border-surface-200">
            <Button variant="tertiary" size="md" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="md" disabled={submitting || farmers.length === 0} onClick={handleSubmit}>
              {submitting ? 'Receiving...' : 'Save Receipt Details'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}


function BatchCountModal({ batch, onClose, onSaved }) {
  const overview = batch.overview || {};
  const [physicalCount, setPhysicalCount] = useState(String(overview.onHand ?? ''));
  const [crackedWriteOff, setCrackedWriteOff] = useState('0');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const differenceBeforeWriteOff = Number(physicalCount || 0) - Number(overview.onHand || 0);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await api.post('/inventory/count', {
        batchId: batch.id,
        physicalCount: parseInt(physicalCount, 10),
        crackedWriteOff: parseInt(crackedWriteOff, 10) || 0,
        notes: notes.trim() || undefined,
      });
      setResult(response);
    } catch (err) {
      setError(err.error || 'Failed to save count');
    } finally {
      setSaving(false);
    }
  }

  if (result) {
    const count = result.count;
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div className="bg-surface-0 rounded-lg shadow-lg max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
          <div className="text-center mb-4">
            <div className="w-12 h-12 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <IconCheck className="text-success-600 w-6 h-6" />
            </div>
            <h3 className="text-heading text-surface-900">Count Saved</h3>
            <p className="text-body text-surface-600 mt-1">{batch.name}</p>
          </div>
          <div className="space-y-2 text-body">
            <div className="flex justify-between"><span className="text-surface-600">System count</span><span className="font-medium text-surface-900">{formatNumber(count.systemCount)} crates</span></div>
            <div className="flex justify-between"><span className="text-surface-600">Physical count</span><span className="font-medium text-surface-900">{formatNumber(count.physicalCount)} crates</span></div>
            <div className={`flex justify-between ${count.discrepancy === 0 ? 'text-success-600' : 'text-error-600 font-bold'}`}>
              <span>Discrepancy</span>
              <span>{count.discrepancy > 0 ? '+' : ''}{formatNumber(count.discrepancy)}</span>
            </div>
            {count.crackedWriteOff > 0 && (
              <div className="flex justify-between text-warning-600">
                <span>Damaged write-off</span>
                <span>{formatNumber(count.crackedWriteOff)} crates</span>
              </div>
            )}
          </div>
          <Button variant="primary" size="md" className="mt-4 w-full" onClick={() => { onSaved(); }}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface-0 rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 sm:px-6 py-4 border-b border-surface-200">
          <h2 className="text-title text-surface-900">Record Count: {batch.name}</h2>
          <p className="text-body text-surface-600 mt-1">Capture the floor count and any badly damaged crates for this batch.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          {error && (
            <div className="rounded-md bg-error-50 px-3 py-2 text-body text-error-700">{error}</div>
          )}

          <div className="rounded-md border border-info-200 bg-info-50 p-4 text-body text-info-800">
            <p className="font-medium text-info-900">How to use this</p>
            <div className="mt-2 space-y-2">
              <p>1. Enter the full crates still physically present.</p>
              <p>2. Add only the badly damaged crates that should be written off now.</p>
              <p>3. Mildly cracked crates that can still be sold later should not go into write-off.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-info-200 bg-info-50 p-3 shadow-xs">
              <p className="text-overline text-info-700">System count</p>
              <p className="mt-1 text-metric text-info-900 font-bold">{formatNumber(overview.onHand)} crates</p>
              <p className="mt-1 text-caption text-info-700">Booked: {formatNumber(overview.totalBooked)} · Sale-ready: {formatNumber(overview.availableForSale)}</p>
            </div>
            <div className={`rounded-md border p-3 shadow-xs ${
              differenceBeforeWriteOff === 0
                ? 'border-success-200 bg-success-50'
                : 'border-warning-200 bg-warning-50'
            }`}>
              <p className={`text-overline ${differenceBeforeWriteOff === 0 ? 'text-success-700' : 'text-warning-700'}`}>Before write-off</p>
              <p className={`mt-1 text-metric font-bold ${differenceBeforeWriteOff === 0 ? 'text-success-900' : 'text-warning-900'}`}>
                {physicalCount === '' ? '—' : `${differenceBeforeWriteOff > 0 ? '+' : ''}${formatNumber(differenceBeforeWriteOff)}`}
              </p>
              <p className={`mt-1 text-caption ${differenceBeforeWriteOff === 0 ? 'text-success-700' : 'text-warning-700'}`}>
                {physicalCount === '' ? 'Enter the physical count to compare it with the system.' : 'Difference between the floor count and the current system count.'}
              </p>
            </div>
          </div>

          <Input
            label="Physical Count (crates)"
            type="number"
            min="0"
            required
            value={physicalCount}
            onChange={(e) => setPhysicalCount(e.target.value)}
            helpText="Count only full crates that are still on the floor."
          />

          <Input
            label="Badly Damaged Crates to Write Off"
            type="number"
            min="0"
            value={crackedWriteOff}
            onChange={(e) => setCrackedWriteOff(e.target.value)}
            helpText="Use this only for crates that can no longer be sold at all."
          />

          <div>
            <label className="block text-body-medium font-medium text-surface-900 mb-1">Notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional note, for example where the loss happened or what the team observed..."
              className="w-full rounded-md border border-surface-300 px-3 py-2 text-body outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 transition-colors"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-2 border-t border-surface-200">
            <Button variant="tertiary" size="md" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="md" disabled={saving || physicalCount === ''} onClick={handleSubmit}>
              {saving ? 'Saving...' : 'Save Count'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── CLOSE BATCH MODAL ────────────────────────────────────────

function CloseBatchModal({ batch, onClose, onClosed }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleClose() {
    setSubmitting(true);
    setError('');
    try {
      const result = await api.patch(`/batches/${batch.id}/close`, {});
      if (result.warnings?.length > 0) {
        alert('Batch closed with warnings:\n' + result.warnings.join('\n'));
      }
      onClosed();
    } catch (err) {
      setError(err.error || 'Failed to close batch');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface-0 rounded-lg shadow-lg w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-4 sm:px-6 py-4 border-b border-surface-200">
          <h2 className="text-title text-surface-900">Close Batch: {batch.name}</h2>
        </div>
        <div className="p-4 sm:p-6 space-y-4">
          {error && (
            <div className="bg-error-50 text-error-700 px-3 py-2 rounded-md text-body">{error}</div>
          )}
          <p className="text-body text-surface-600">
            Are you sure you want to close this batch? This action indicates the batch is fully sold or no longer active.
          </p>
          <p className="text-body text-surface-500">
            Confirmed bookings that haven't been picked up will remain on record. You can still view the batch analysis report after closing.
          </p>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-2 border-t border-surface-200">
            <Button variant="tertiary" size="md" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="secondary" size="md" disabled={submitting} onClick={handleClose}>
              {submitting ? 'Closing...' : 'Close Batch'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── EDIT BATCH MODAL ─────────────────────────────────────────

function EditBatchModal({ batch, onClose, onUpdated }) {
  const [form, setForm] = useState({
    expectedDate: batch.expectedDate ? new Date(batch.expectedDate).toISOString().split('T')[0] : '',
    expectedQuantity: batch.expectedQuantity,
    availableForBooking: batch.availableForBooking,
    eggTypeKey: batch.eggTypeKey || 'REGULAR',
    wholesalePrice: batch.wholesalePrice,
    retailPrice: batch.retailPrice,
  });
  const [eggTypes, setEggTypes] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadEggTypes() {
      try {
        const response = await api.get('/batches/meta');
        if (!cancelled) {
          const options = response.activeCustomerEggTypes || [];
          const hasCurrent = options.some((entry) => entry.key === batch.eggTypeKey);
          setEggTypes(hasCurrent || !batch.eggTypeLabel ? options : [
            ...options,
            {
              key: batch.eggTypeKey,
              label: batch.eggTypeLabel || batch.eggTypeKey,
              shortLabel: batch.eggTypeShortLabel || batch.eggTypeKey,
              isActive: false,
            },
          ]);
        }
      } catch {
        if (!cancelled) setEggTypes([]);
      }
    }

    loadEggTypes();
    return () => { cancelled = true; };
  }, [batch.eggTypeKey, batch.eggTypeLabel, batch.eggTypeShortLabel]);

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.patch(`/batches/${batch.id}`, {
        expectedDate: form.expectedDate,
        expectedQuantity: Number(form.expectedQuantity),
        availableForBooking: Number(form.availableForBooking),
        eggTypeKey: form.eggTypeKey,
        wholesalePrice: Number(form.wholesalePrice),
        retailPrice: Number(form.retailPrice),
      });
      onUpdated();
    } catch (err) {
      setError(err.error || 'Failed to update batch');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface-0 rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
        <div className="px-4 sm:px-6 py-4 border-b border-surface-200">
          <h2 className="text-title text-surface-900">Edit Batch: {batch.name}</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          {error && (
            <div className="bg-error-50 text-error-700 px-3 py-2 rounded-md text-body">{error}</div>
          )}

          <Input
            label="Expected Arrival Date"
            type="date"
            required
            value={form.expectedDate}
            onChange={e => update('expectedDate', e.target.value)}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Expected Quantity (crates)"
              type="number"
              required
              min="1"
              value={form.expectedQuantity}
              onChange={e => update('expectedQuantity', e.target.value)}
            />
            <Input
              label="Available for Booking"
              type="number"
              required
              min="0"
              value={form.availableForBooking}
              onChange={e => update('availableForBooking', e.target.value)}
            />
          </div>

          <Select
            label="Customer-facing egg type"
            required
            value={form.eggTypeKey}
            onChange={e => update('eggTypeKey', e.target.value)}
            options={(eggTypes.length > 0 ? eggTypes : [{ key: 'REGULAR', label: 'Regular Size Eggs' }]).map((eggType) => ({
              value: eggType.key,
              label: eggType.label,
            }))}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Wholesale price"
              type="number"
              required
              min="1"
              value={form.wholesalePrice}
              onChange={e => update('wholesalePrice', e.target.value)}
            />
            <Input
              label="Retail price"
              type="number"
              required
              min="1"
              value={form.retailPrice}
              onChange={e => update('retailPrice', e.target.value)}
            />
          </div>

          <div className="rounded-md border border-info-200 bg-info-50 px-4 py-3 text-body text-info-900">
            FE rows inside the batch can have different cost prices, but the batch uses one selling price for wholesale and one for retail.
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-2 border-t border-surface-200">
            <Button variant="tertiary" size="md" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="md" disabled={submitting} onClick={handleSubmit}>
              {submitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── DELETE BATCH MODAL ───────────────────────────────────────

function DeleteBatchModal({ batch, onClose, onDeleted }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleDelete() {
    setSubmitting(true);
    setError('');
    try {
      await api.delete(`/batches/${batch.id}`);
      onDeleted();
    } catch (err) {
      setError(err.error || 'Failed to delete batch');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface-0 rounded-lg shadow-lg w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-4 sm:px-6 py-4 border-b border-surface-200">
          <h2 className="text-title text-error-600">Delete Batch: {batch.name}</h2>
        </div>
        <div className="p-4 sm:p-6 space-y-4">
          {error && (
            <div className="bg-error-50 text-error-700 px-3 py-2 rounded-md text-body">{error}</div>
          )}
          <p className="text-body text-surface-600">
            Are you sure you want to permanently delete this batch? This action cannot be undone.
          </p>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-2 border-t border-surface-200">
            <Button variant="tertiary" size="md" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="destructive" size="md" disabled={submitting} onClick={handleDelete}>
              {submitting ? 'Deleting...' : 'Delete Batch'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
