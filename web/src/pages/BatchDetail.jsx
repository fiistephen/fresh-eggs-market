import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  if (n == null) return '—';
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(n);
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString('en-NG');
}

function formatPercent(n) {
  return `${Number(n || 0).toFixed(1)}%`;
}

function OverviewCard({ label, value, subtext, tone = 'gray' }) {
  const tones = {
    gray: 'bg-white border-gray-200 text-gray-900',
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    green: 'bg-green-50 border-green-200 text-green-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    red: 'bg-red-50 border-red-200 text-red-900',
  };

  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <p className="text-xs uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {subtext && <p className="mt-1 text-sm opacity-75">{subtext}</p>}
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
  const [showClose, setShowClose] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const canManage = ['ADMIN', 'MANAGER'].includes(user?.role);
  const canDelete = user?.role === 'ADMIN';

  useEffect(() => { loadBatch(); }, [id]);

  async function loadBatch() {
    setLoading(true);
    setError('');
    try {
      const data = await api.get(`/batches/${id}`);
      setBatch(data.batch);

      // Load analysis for received/closed batches
      if (['RECEIVED', 'CLOSED'].includes(data.batch.status) && canManage) {
        try {
          const analysisData = await api.get(`/batches/${id}/analysis`);
          setAnalysis(analysisData);
        } catch {
          // Analysis may fail if no sales yet, that's fine
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
      <div className="text-center py-16 text-gray-400">
        <div className="animate-pulse text-lg">Loading batch details...</div>
      </div>
    );
  }

  if (error || !batch) {
    return (
      <div className="text-center py-16">
        <div className="text-red-500 mb-4">{error || 'Batch not found'}</div>
        <button onClick={() => navigate('/batches')} className="text-brand-500 hover:text-brand-600 text-sm font-medium">
          Back to Batches
        </button>
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

  return (
    <div>
      {/* Back nav + header */}
      <button
        onClick={() => navigate('/batches')}
        className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4 transition-colors"
      >
        <span>&larr;</span> Back to Batches
      </button>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-0 mb-6">
        <div className="flex-1">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{batch.name}</h1>
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium w-fit ${STATUS_COLORS[batch.status]}`}>
              {STATUS_LABELS[batch.status]}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Expected {formatDate(batch.expectedDate)}
            {batch.receivedDate && <> · Received {formatDate(batch.receivedDate)}</>}
            {batch.closedDate && <> · Closed {formatDate(batch.closedDate)}</>}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {canManage && batch.status === 'OPEN' && (
            <>
              <button
                onClick={() => setShowEdit(true)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => setShowReceive(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
              >
                Receive Batch
              </button>
            </>
          )}
          {canManage && batch.status === 'RECEIVED' && (
            <button
              onClick={() => setShowClose(true)}
              className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors"
            >
              Close Batch
            </button>
          )}
          {canDelete && batch.status === 'OPEN' && (batch._count?.bookings || 0) === 0 && (
            <button
              onClick={() => setShowDelete(true)}
              className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {batch.status === 'OPEN' && (
        <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-semibold text-blue-900">This batch is still waiting to be received.</p>
          <p className="mt-1 text-sm text-blue-700">
            Keep taking bookings here, then use <span className="font-medium">Receive Batch</span> when the eggs arrive and the real FE mix is known.
          </p>
        </div>
      )}

      {hasCrackWatch && (
        <div className={`mb-4 rounded-2xl border p-4 ${
          overview.crackAlert?.level === 'ALERT'
            ? 'border-red-200 bg-red-50'
            : 'border-amber-200 bg-amber-50'
        }`}>
          <p className={`text-sm font-semibold ${
            overview.crackAlert?.level === 'ALERT' ? 'text-red-900' : 'text-amber-900'
          }`}>
            {overview.crackAlert?.label}
          </p>
          <p className={`mt-1 text-sm ${
            overview.crackAlert?.level === 'ALERT' ? 'text-red-700' : 'text-amber-700'
          }`}>
            Crack impact is {formatPercent(overview.crackRatePercent)} for this batch. Review damaged write-off and discounted cracked sales.
          </p>
        </div>
      )}

      {showPolicyBanner && (
        <div className={`mb-6 rounded-2xl border p-4 ${
          isBelowPolicy ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'
        }`}>
          <p className={`text-sm font-semibold ${isBelowPolicy ? 'text-red-900' : 'text-green-900'}`}>
            {isBelowPolicy ? 'This batch is below the company profit target.' : 'This batch is above the company profit target.'}
          </p>
          <p className={`mt-1 text-sm ${isBelowPolicy ? 'text-red-700' : 'text-green-700'}`}>
            Profit per crate is {formatCurrency(overview.profitPerCrate)}. Variance to target is{' '}
            <span className="font-medium">
              {(overview.varianceToPolicy || 0) >= 0 ? '+' : '-'}{formatCurrency(Math.abs(overview.varianceToPolicy || 0))}
            </span>.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        <OverviewCard
          label={batch.status === 'OPEN' ? 'Booked so far' : 'Confirmed bookings'}
          value={`${formatNumber(overview.totalBooked)} crates`}
          subtext={`${overview.confirmedBookingCount || 0} active booking${overview.confirmedBookingCount === 1 ? '' : 's'}`}
          tone="amber"
        />
        <OverviewCard
          label={batch.status === 'OPEN' ? 'Still to receive' : 'Sale-ready stock'}
          value={`${formatNumber(batch.status === 'OPEN' ? overview.remainingToReceive : overview.availableForSale)} crates`}
          subtext={batch.status === 'OPEN' ? 'Expected quantity not yet received' : 'On hand minus confirmed bookings'}
          tone={batch.status === 'OPEN' ? 'blue' : 'green'}
        />
        <OverviewCard
          label={batch.status === 'OPEN' ? 'Booking space used' : 'On hand now'}
          value={batch.status === 'OPEN' ? formatPercent(overview.bookingUtilizationPercent) : `${formatNumber(overview.onHand)} crates`}
          subtext={batch.status === 'OPEN' ? `${formatNumber(batch.availableForBooking)} crates open for booking` : `${formatNumber(overview.totalSold)} sold · ${formatNumber(overview.totalWrittenOff)} written off`}
          tone="gray"
        />
        <OverviewCard
          label={batch.status === 'OPEN' ? 'Expected quantity' : 'Profit vs target'}
          value={batch.status === 'OPEN'
            ? `${formatNumber(batch.expectedQuantity)} crates`
            : `${(overview.varianceToPolicy || 0) >= 0 ? '+' : '-'}${formatCurrency(Math.abs(overview.varianceToPolicy || 0))}`}
          subtext={batch.status === 'OPEN'
            ? `Wholesale ${formatCurrency(batch.wholesalePrice)} · Retail ${formatCurrency(batch.retailPrice)}`
            : `${formatCurrency(overview.profitPerCrate)} per crate`}
          tone={batch.status === 'OPEN' ? 'gray' : (overview.varianceToPolicy || 0) >= 0 ? 'green' : 'red'}
        />
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">Batch Snapshot</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-gray-400">Expected quantity</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{formatNumber(batch.expectedQuantity)} crates</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Available for booking</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{formatNumber(batch.availableForBooking)} crates</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Actual received</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">
                {batch.actualQuantity != null ? `${formatNumber(batch.actualQuantity)} crates` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Paid crates</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{formatNumber(overview.totalPaidQuantity)} crates</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Free crates</p>
              <p className="mt-1 text-lg font-semibold text-green-700">{formatNumber(overview.totalFreeQuantity || batch.freeCrates)} crates</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">FE codes in batch</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{feMix.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">Pricing Per Crate</h3>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-gray-400">Cost price</p>
              <p className="mt-1 text-xl font-bold text-gray-900">{formatCurrency(batch.costPrice)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Wholesale price</p>
              <p className="mt-1 text-xl font-bold text-blue-600">{formatCurrency(batch.wholesalePrice)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Retail price</p>
              <p className="mt-1 text-xl font-bold text-green-600">{formatCurrency(batch.retailPrice)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Booking Pressure</h3>
              <p className="mt-1 text-sm text-gray-500">See how much of this batch is already promised to customers.</p>
            </div>
            <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              {formatPercent(overview.bookingUtilizationPercent)} of booking space used
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-gray-400">Confirmed</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{confirmedBookings.length}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Picked up</p>
              <p className="mt-1 text-lg font-semibold text-blue-700">{pickedUpBookings.length}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Cancelled</p>
              <p className="mt-1 text-lg font-semibold text-gray-700">{cancelledBookings.length}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Booking value received</p>
              <p className="mt-1 text-lg font-semibold text-green-700">{formatCurrency(bookingRevenue)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Latest Count Check</h3>
              <p className="mt-1 text-sm text-gray-500">Use this to compare what the system expects with what the floor team counted.</p>
            </div>
          </div>

          {overview.latestCount ? (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-400">Count date</p>
                  <p className="mt-1 text-base font-semibold text-gray-900">{formatDate(overview.latestCount.countDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Entered by</p>
                  <p className="mt-1 text-base font-semibold text-gray-900">{overview.latestCount.enteredBy}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">System count</p>
                  <p className="mt-1 text-base font-semibold text-gray-900">{formatNumber(overview.latestCount.systemCount)} crates</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Physical count</p>
                  <p className="mt-1 text-base font-semibold text-gray-900">{formatNumber(overview.latestCount.physicalCount)} crates</p>
                </div>
              </div>
              <div className={`rounded-xl border px-3 py-3 text-sm ${
                overview.latestCount.discrepancy === 0
                  ? 'border-green-200 bg-green-50 text-green-800'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}>
                {overview.latestCount.discrepancy === 0
                  ? 'The last physical count matched the system count.'
                  : `The last count had a discrepancy of ${formatNumber(overview.latestCount.discrepancy)} crates.`}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-500">
              No physical count has been recorded for this batch yet.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">FE Mix</h3>
          {feMix.length === 0 ? (
            <p className="text-sm text-gray-500">The final FE codes will appear here after this batch is received.</p>
          ) : (
            <div className="space-y-3">
              {feMix.map((eggCode) => (
                <div key={eggCode.id} className="rounded-xl border border-gray-100 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm font-semibold text-brand-600">{eggCode.code}</p>
                      <p className="mt-1 text-xs text-gray-500">{eggCode.item?.name || 'Catalog item linked'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">{formatNumber(eggCode.quantity + (eggCode.freeQty || 0))} crates</p>
                      <p className="text-xs text-gray-500">{formatCurrency(eggCode.costPrice)} cost price</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">Operational Notes</h3>
          <div className="space-y-3 text-sm text-gray-600">
            <div className="rounded-xl bg-gray-50 px-4 py-3">
              <span className="font-medium text-gray-900">Bookings do not reduce batch stock.</span> Stock reduces only when a sale happens or when damaged crates are written off.
            </div>
            <div className="rounded-xl bg-gray-50 px-4 py-3">
              <span className="font-medium text-gray-900">Crack impact is tracked in crates.</span> Mildly cracked crates sold at discount and badly damaged write-offs are shown separately in analysis.
            </div>
            <div className="rounded-xl bg-gray-50 px-4 py-3">
              <span className="font-medium text-gray-900">Company target:</span> about {formatCurrency(analysis?.policy?.targetProfitPerCrate || 500)} profit per crate for each batch.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── EGG CODES TAB ────────────────────────────────────────────

function EggCodesTab({ batch }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
      <table className="w-full min-w-max">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Code</th>
            <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Cost Price</th>
            <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Paid Qty</th>
            <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Free Qty</th>
            <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Total Qty</th>
            <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Subtotal (Cost)</th>
          </tr>
        </thead>
        <tbody>
          {batch.eggCodes.map(ec => (
            <tr key={ec.id} className="border-b border-gray-50">
              <td className="py-3 px-4">
                <span className="font-mono font-semibold text-brand-600">{ec.code}</span>
              </td>
              <td className="py-3 px-4 text-sm text-right">{formatCurrency(ec.costPrice)}</td>
              <td className="py-3 px-4 text-sm text-right">{ec.quantity.toLocaleString()}</td>
              <td className="py-3 px-4 text-sm text-right text-green-600">{ec.freeQty || 0}</td>
              <td className="py-3 px-4 text-sm text-right font-medium">{(ec.quantity + (ec.freeQty || 0)).toLocaleString()}</td>
              <td className="py-3 px-4 text-sm text-right font-medium">{formatCurrency(ec.costPrice * ec.quantity)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 font-medium">
            <td className="py-3 px-4 text-sm">Total</td>
            <td className="py-3 px-4"></td>
            <td className="py-3 px-4 text-sm text-right">
              {batch.eggCodes.reduce((s, ec) => s + ec.quantity, 0).toLocaleString()}
            </td>
            <td className="py-3 px-4 text-sm text-right text-green-600">
              {batch.eggCodes.reduce((s, ec) => s + (ec.freeQty || 0), 0)}
            </td>
            <td className="py-3 px-4 text-sm text-right">
              {batch.eggCodes.reduce((s, ec) => s + ec.quantity + (ec.freeQty || 0), 0).toLocaleString()}
            </td>
            <td className="py-3 px-4 text-sm text-right">
              {formatCurrency(batch.eggCodes.reduce((s, ec) => s + ec.costPrice * ec.quantity, 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── BOOKINGS TAB ─────────────────────────────────────────────

function BookingsTab({ batch }) {
  const BOOKING_STATUS = {
    CONFIRMED: 'bg-green-100 text-green-700',
    PICKED_UP: 'bg-blue-100 text-blue-700',
    CANCELLED: 'bg-red-100 text-red-700',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
      <table className="w-full min-w-max">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Customer</th>
            <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Quantity</th>
            <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Order Value</th>
            <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Amount Paid</th>
            <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Channel</th>
            <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Date</th>
          </tr>
        </thead>
        <tbody>
          {batch.bookings.map(bk => (
            <tr key={bk.id} className="border-b border-gray-50">
              <td className="py-3 px-4">
                <span className="font-medium text-gray-900">{bk.customer?.name || '—'}</span>
                {bk.customer?.phone && (
                  <span className="text-xs text-gray-400 ml-2">{bk.customer.phone}</span>
                )}
              </td>
              <td className="py-3 px-4 text-sm text-right">{bk.quantity.toLocaleString()}</td>
              <td className="py-3 px-4 text-sm text-right">{formatCurrency(bk.orderValue)}</td>
              <td className="py-3 px-4 text-sm text-right font-medium">{formatCurrency(bk.amountPaid)}</td>
              <td className="py-3 px-4 text-sm text-center capitalize">{bk.channel}</td>
              <td className="py-3 px-4 text-center">
                <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${BOOKING_STATUS[bk.status]}`}>
                  {bk.status.replace('_', ' ')}
                </span>
              </td>
              <td className="py-3 px-4 text-sm text-gray-500">{formatDate(bk.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
      <table className="w-full min-w-max">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Receipt #</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Customer</th>
            <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Qty</th>
            <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Amount</th>
            <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Cost</th>
            <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Profit</th>
            <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Payment</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Date</th>
          </tr>
        </thead>
        <tbody>
          {batch.sales.map(sale => (
            <tr key={sale.id} className="border-b border-gray-50">
              <td className="py-3 px-4 font-mono text-sm text-gray-600">{sale.receiptNumber}</td>
              <td className="py-3 px-4 text-sm font-medium text-gray-900">{sale.customer?.name || '—'}</td>
              <td className="py-3 px-4 text-sm text-right">{sale.totalQuantity.toLocaleString()}</td>
              <td className="py-3 px-4 text-sm text-right">{formatCurrency(sale.totalAmount)}</td>
              <td className="py-3 px-4 text-sm text-right text-gray-500">{formatCurrency(sale.totalCost)}</td>
              <td className="py-3 px-4 text-sm text-right font-medium text-green-600">
                {formatCurrency(sale.totalAmount - sale.totalCost)}
              </td>
              <td className="py-3 px-4 text-sm text-center">{PAYMENT_LABELS[sale.paymentMethod] || sale.paymentMethod}</td>
              <td className="py-3 px-4 text-sm text-gray-500">{formatDate(sale.saleDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── ANALYSIS TAB ─────────────────────────────────────────────

function AnalysisTab({ analysis }) {
  const { batch, costs, sales, bookings, inventory, profit, prices, cracks, policy } = analysis;

  return (
    <div className="space-y-6">
      {/* Profit headline */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 sm:gap-6">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Total Revenue</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(sales.totalRevenue)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Total Cost</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(sales.totalCost)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Gross Profit</p>
            <p className={`text-2xl font-bold mt-1 ${profit.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(profit.grossProfit)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{profit.margin}% margin</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Policy Target</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(profit.expectedPolicyProfit)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{formatCurrency(policy.targetProfitPerCrate)} per crate</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Variance To Policy</p>
            <p className={`text-2xl font-bold mt-1 ${profit.varianceToPolicy >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {profit.varianceToPolicy >= 0 ? '+' : ''}{formatCurrency(Math.abs(profit.varianceToPolicy))}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{formatCurrency(profit.profitPerCrate)} per crate</p>
          </div>
        </div>
      </div>

      {/* Cost breakdown by egg code */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">Cost Breakdown by Egg Code</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-2 text-xs text-gray-500">Code</th>
              <th className="text-right py-2 text-xs text-gray-500">Qty (Paid)</th>
              <th className="text-right py-2 text-xs text-gray-500">Free</th>
              <th className="text-right py-2 text-xs text-gray-500">Cost/Crate</th>
              <th className="text-right py-2 text-xs text-gray-500">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {costs.eggCodes.map(ec => (
              <tr key={ec.code} className="border-b border-gray-50">
                <td className="py-2 font-mono font-semibold text-brand-600">{ec.code}</td>
                <td className="py-2 text-sm text-right">{ec.quantity.toLocaleString()}</td>
                <td className="py-2 text-sm text-right text-green-600">{ec.freeQty}</td>
                <td className="py-2 text-sm text-right">{formatCurrency(ec.costPrice)}</td>
                <td className="py-2 text-sm text-right font-medium">{formatCurrency(ec.subtotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-medium">
              <td className="py-2 text-sm">Total Cost</td>
              <td colSpan={3}></td>
              <td className="py-2 text-sm text-right">{formatCurrency(costs.totalCost)}</td>
            </tr>
          </tfoot>
          </table>
        </div>
      </div>

      {/* Sales breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">Sales Breakdown</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {Object.entries(sales.breakdown).map(([type, amount]) => (
            <div key={type} className="border border-gray-100 rounded-lg p-3">
              <p className="text-xs text-gray-400 capitalize">{type.replace('_', ' ').toLowerCase()}</p>
              <p className="text-lg font-bold text-gray-900 mt-1">{formatCurrency(amount)}</p>
              <p className="text-xs text-gray-400">{(sales.quantities[type] || 0).toLocaleString()} crates</p>
            </div>
          ))}
        </div>
      </div>

      {/* Inventory status */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">Inventory Status</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
          <div>
            <p className="text-xs text-gray-400">Total Received</p>
            <p className="text-lg font-semibold">{inventory.totalReceived.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Total Sold</p>
            <p className="text-lg font-semibold">{inventory.totalSold.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Remaining</p>
            <p className="text-lg font-semibold text-blue-600">{inventory.remaining.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Booked Portion</p>
            <p className="text-lg font-semibold text-orange-500">{inventory.bookedPortion.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Available for Sale</p>
            <p className="text-lg font-semibold text-green-600">{inventory.availableForSale.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Crack Control</h3>
            <p className="text-sm text-gray-500 mt-1">Track mildly cracked crates sold at discount separately from totally damaged write-offs.</p>
          </div>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
            cracks.crackAlert.level === 'ALERT'
              ? 'bg-red-50 text-red-700'
              : cracks.crackAlert.level === 'WATCH'
                ? 'bg-amber-50 text-amber-700'
                : 'bg-green-50 text-green-700'
          }`}>
            {cracks.crackAlert.label}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div>
            <p className="text-xs text-gray-400">Cracked Sold</p>
            <p className="text-lg font-semibold">{cracks.crackedSoldQuantity.toLocaleString()} crates</p>
            <p className="text-xs text-gray-400 mt-0.5">{formatCurrency(cracks.crackedSoldValue)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Damaged Write-off</p>
            <p className="text-lg font-semibold text-red-600">{cracks.totalDamagedWriteOff.toLocaleString()} crates</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Total Crack Impact</p>
            <p className="text-lg font-semibold">{cracks.totalCrackImpact.toLocaleString()} crates</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Crack Rate</p>
            <p className={`text-lg font-semibold ${
              cracks.crackAlert.level === 'ALERT'
                ? 'text-red-600'
                : cracks.crackAlert.level === 'WATCH'
                  ? 'text-amber-600'
                  : 'text-green-600'
            }`}>
              {cracks.crackRatePercent.toFixed(2)}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── RECEIVE BATCH MODAL ──────────────────────────────────────

function ReceiveBatchModal({ batch, onClose, onReceived }) {
  const [eggCodes, setEggCodes] = useState([
    { code: `FE${Math.round(batch.costPrice)}`, costPrice: batch.costPrice, quantity: batch.expectedQuantity, freeQty: 3 },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const totalPaid = eggCodes.reduce((s, ec) => s + (Number(ec.quantity) || 0), 0);
  const totalFree = eggCodes.reduce((s, ec) => s + (Number(ec.freeQty) || 0), 0);
  const actualQuantity = totalPaid + totalFree;

  function addEggCode() {
    setEggCodes([...eggCodes, { code: 'FE', costPrice: '', quantity: '', freeQty: 0 }]);
  }

  function removeEggCode(index) {
    if (eggCodes.length <= 1) return;
    setEggCodes(eggCodes.filter((_, i) => i !== index));
  }

  function updateEggCode(index, field, value) {
    const updated = [...eggCodes];
    updated[index] = { ...updated[index], [field]: value };
    setEggCodes(updated);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    // Validate egg codes
    for (const ec of eggCodes) {
      if (!ec.code || !/^FE\d+$/.test(ec.code)) {
        setError(`Invalid egg code: "${ec.code}". Must be FE followed by numbers (e.g. FE4600)`);
        setSubmitting(false);
        return;
      }
      if (!ec.costPrice || Number(ec.costPrice) <= 0) {
        setError(`Cost price for ${ec.code} must be positive`);
        setSubmitting(false);
        return;
      }
      if (!ec.quantity || Number(ec.quantity) <= 0) {
        setError(`Quantity for ${ec.code} must be positive`);
        setSubmitting(false);
        return;
      }
    }

    try {
      await api.patch(`/batches/${batch.id}/receive`, {
        actualQuantity,
        freeCrates: totalFree,
        eggCodes: eggCodes.map(ec => ({
          code: ec.code,
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Receive Batch: {batch.name}</h2>
          <p className="text-xs sm:text-sm text-gray-500">Enter the actual quantities and egg codes received from the farm.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5">
          {error && (
            <div className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm">{error}</div>
          )}

          {/* Summary bar */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-start sm:items-center bg-gray-50 rounded-lg p-3">
            <div className="text-xs sm:text-sm">
              <span className="text-gray-500">Paid:</span>{' '}
              <span className="font-semibold">{totalPaid.toLocaleString()}</span>
            </div>
            <div className="text-xs sm:text-sm">
              <span className="text-gray-500">Free:</span>{' '}
              <span className="font-semibold text-green-600">{totalFree.toLocaleString()}</span>
            </div>
            <div className="text-xs sm:text-sm">
              <span className="text-gray-500">Total:</span>{' '}
              <span className="font-bold text-gray-900">{actualQuantity.toLocaleString()} crates</span>
            </div>
          </div>

          {/* Egg codes entry */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700">Egg Codes</label>
              <button
                type="button"
                onClick={addEggCode}
                className="text-brand-500 hover:text-brand-600 text-sm font-medium"
              >
                + Add Egg Code
              </button>
            </div>

            <div className="space-y-3">
              {eggCodes.map((ec, i) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:items-end">
                  <div className="sm:col-span-3">
                    {i === 0 && <label className="block text-xs text-gray-500 mb-1">Code</label>}
                    <input
                      type="text"
                      required
                      placeholder="FE4600"
                      value={ec.code}
                      onChange={e => updateEggCode(i, 'code', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    {i === 0 && <label className="block text-xs text-gray-500 mb-1">Cost/Crate</label>}
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="4600"
                      value={ec.costPrice}
                      onChange={e => updateEggCode(i, 'costPrice', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    {i === 0 && <label className="block text-xs text-gray-500 mb-1">Paid Qty</label>}
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="1800"
                      value={ec.quantity}
                      onChange={e => updateEggCode(i, 'quantity', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    {i === 0 && <label className="block text-xs text-gray-500 mb-1">Free Qty</label>}
                    <input
                      type="number"
                      min="0"
                      placeholder="3"
                      value={ec.freeQty}
                      onChange={e => updateEggCode(i, 'freeQty', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2 flex items-center justify-start sm:justify-end">
                    {eggCodes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeEggCode(i)}
                        className="text-red-400 hover:text-red-600 text-sm px-2 py-2"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-2">
            <button type="button" onClick={onClose} className="w-full sm:w-auto px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {submitting ? 'Receiving...' : 'Confirm Receipt'}
            </button>
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
        // Show warnings but still close
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Close Batch: {batch.name}</h2>
        </div>
        <div className="p-4 sm:p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm">{error}</div>
          )}
          <p className="text-xs sm:text-sm text-gray-600">
            Are you sure you want to close this batch? This action indicates the batch is fully sold or no longer active.
          </p>
          <p className="text-xs sm:text-sm text-gray-500">
            Confirmed bookings that haven't been picked up will remain on record. You can still view the batch analysis report after closing.
          </p>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-2">
            <button type="button" onClick={onClose} className="w-full sm:w-auto px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleClose}
              disabled={submitting}
              className="w-full sm:w-auto bg-gray-700 hover:bg-gray-800 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {submitting ? 'Closing...' : 'Close Batch'}
            </button>
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
    wholesalePrice: batch.wholesalePrice,
    retailPrice: batch.retailPrice,
    costPrice: batch.costPrice,
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
      await api.patch(`/batches/${batch.id}`, {
        expectedDate: form.expectedDate,
        expectedQuantity: Number(form.expectedQuantity),
        availableForBooking: Number(form.availableForBooking),
        wholesalePrice: Number(form.wholesalePrice),
        retailPrice: Number(form.retailPrice),
        costPrice: Number(form.costPrice),
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Edit Batch: {batch.name}</h2>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Cost Price</label>
              <input
                type="number"
                required min="1"
                value={form.costPrice}
                onChange={e => update('costPrice', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Wholesale</label>
              <input
                type="number"
                required min="1"
                value={form.wholesalePrice}
                onChange={e => update('wholesalePrice', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Retail</label>
              <input
                type="number"
                required min="1"
                value={form.retailPrice}
                onChange={e => update('retailPrice', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-2">
            <button type="button" onClick={onClose} className="w-full sm:w-auto px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-red-600">Delete Batch: {batch.name}</h2>
        </div>
        <div className="p-4 sm:p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm">{error}</div>
          )}
          <p className="text-xs sm:text-sm text-gray-600">
            Are you sure you want to permanently delete this batch? This action cannot be undone.
          </p>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-2">
            <button type="button" onClick={onClose} className="w-full sm:w-auto px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={submitting}
              className="w-full sm:w-auto bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {submitting ? 'Deleting...' : 'Delete Batch'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
