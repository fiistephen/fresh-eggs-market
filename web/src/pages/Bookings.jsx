import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { waitingTimeInfo } from '../lib/helpers';
import { useAuth } from '../contexts/AuthContext';
import { Button, Input, Select, Modal, Card, Badge, EmptyState, useToast } from '../components/ui';

const BOOKING_STATUS_BADGES = {
  CONFIRMED: 'success',
  READY_FOR_PICKUP: 'warning',
  READY_FOR_DELIVERY: 'warning',
  OUT_FOR_DELIVERY: 'info',
  PICKED_UP: 'neutral',
  DELIVERED: 'neutral',
  CANCELLED: 'error',
};

const BOOKING_STATUS_LABELS = {
  CONFIRMED: 'Confirmed',
  READY_FOR_PICKUP: 'Ready for pickup',
  READY_FOR_DELIVERY: 'Ready for delivery',
  OUT_FOR_DELIVERY: 'Out for delivery',
  PICKED_UP: 'Picked up',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

function formatCurrency(value) {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(Number(value));
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function bookingSourceMeta(booking) {
  if (booking.portalCheckout?.checkoutType === 'BUY_NOW') {
    return { label: 'Portal · Buy now', tone: 'info' };
  }
  if (booking.portalCheckout?.checkoutType === 'BOOK_UPCOMING') {
    return { label: 'Portal · Book now', tone: 'brand' };
  }
  if (booking.channel === 'website') {
    return { label: 'Portal booking', tone: 'info' };
  }
  return { label: 'Manual booking', tone: 'default' };
}

function bookingPaymentTruthMeta(booking) {
  const checkout = booking.portalCheckout;
  if (checkout?.paymentMethod === 'TRANSFER') {
    if (checkout.status === 'ADMIN_CONFIRMED') return { label: 'Waiting for statement', tone: 'warning' };
    if (checkout.status === 'AWAITING_TRANSFER') return { label: 'Waiting for admin', tone: 'default' };
    if (checkout.status === 'PAID' && checkout.confirmationStatementLineId) return { label: 'Statement confirmed', tone: 'success' };
    if (checkout.status === 'PAID') return { label: 'Transfer confirmed', tone: 'success' };
    if (checkout.status === 'CANCELLED') return { label: 'Transfer declined', tone: 'error' };
  }
  if (checkout?.paymentMethod === 'CARD' && checkout.status === 'PAID') {
    return { label: 'Card verified', tone: 'success' };
  }
  if ((booking.allocations?.length || 0) > 0) {
    return { label: 'Deposit linked', tone: 'info' };
  }
  return { label: 'No deposit linked', tone: 'default' };
}

function bookingLifecycleEvents(booking) {
  const events = [
    {
      label: 'Booking created',
      value: formatDate(booking.createdAt),
      tone: 'neutral',
    },
  ];

  if (booking.portalCheckout?.createdAt) {
    events.push({
      label: 'Portal checkout started',
      value: formatDate(booking.portalCheckout.createdAt),
      tone: 'neutral',
    });
  }
  if (booking.portalCheckout?.adminConfirmedAt) {
    events.push({
      label: 'Staff saw transfer',
      value: formatDate(booking.portalCheckout.adminConfirmedAt),
      tone: 'warning',
    });
  }
  if (booking.portalCheckout?.verifiedAt) {
    events.push({
      label: booking.portalCheckout.confirmationStatementLineId ? 'Statement confirmed' : 'Payment confirmed',
      value: formatDate(booking.portalCheckout.verifiedAt),
      tone: 'success',
    });
  }
  if (booking.batchArrived) {
    events.push({
      label: 'Batch arrived',
      value: formatDate(booking.batchArrivalDate || booking.batch?.receivedDate),
      tone: 'success',
    });
  }
  if (booking.readyAt) {
    events.push({
      label: booking.fulfilmentType === 'DELIVERY' ? 'Ready for delivery' : 'Ready for pickup',
      value: formatDate(booking.readyAt),
      tone: 'warning',
    });
  }
  if (booking.dispatchedAt) {
    events.push({
      label: `Dispatched${booking.driverName ? ` (${booking.driverName})` : ''}`,
      value: formatDate(booking.dispatchedAt),
      tone: 'info',
    });
  }
  if (booking.completedAt) {
    events.push({
      label: booking.fulfilmentType === 'DELIVERY' ? 'Delivered' : 'Picked up',
      value: formatDate(booking.completedAt),
      tone: 'success',
    });
  }
  if (booking.sale?.saleDate && !booking.completedAt) {
    events.push({
      label: 'Pickup completed',
      value: formatDate(booking.sale.saleDate),
      tone: 'success',
    });
  }

  return events;
}

function hangingAgeLabel(ageInDays) {
  if (ageInDays >= 90) return '90+ days hanging';
  if (ageInDays >= 30) return '30+ days hanging';
  if (ageInDays >= 8) return '8-30 days hanging';
  if (ageInDays >= 1) return '1-7 days hanging';
  return 'Today';
}

function paymentDateScore(payment) {
  if (!payment?.transactionDate) return 9999;
  return Math.max(0, Math.floor((Date.now() - new Date(payment.transactionDate).getTime()) / (1000 * 60 * 60 * 24)));
}

function buildBestAllocationSuggestion(payments, targetAmount) {
  const target = Number(targetAmount || 0);
  if (target <= 0) return null;

  const usable = [...payments]
    .filter((payment) => Number(payment.availableAmount || 0) > 0.009)
    .sort((a, b) => new Date(b.transactionDate || 0).getTime() - new Date(a.transactionDate || 0).getTime())
    .slice(0, 16);

  if (usable.length === 0) return null;

  const candidates = [];

  usable.forEach((payment, index) => {
    const total = Number(payment.availableAmount || 0);
    const difference = total - target;
    const statusRank = difference === 0 ? 0 : difference > 0 ? 1 : 2;
    const score = statusRank * 1000000 + Math.abs(difference) * 100 + paymentDateScore(payment) + index / 100;
    candidates.push({
      ids: [payment.id],
      total,
      difference,
      score,
      payments: [payment],
    });
  });

  for (let i = 0; i < usable.length; i += 1) {
    for (let j = i + 1; j < usable.length; j += 1) {
      const first = usable[i];
      const second = usable[j];
      const total = Number(first.availableAmount || 0) + Number(second.availableAmount || 0);
      const difference = total - target;
      const statusRank = difference === 0 ? 0 : difference > 0 ? 1 : 2;
      const score = statusRank * 1000000
        + Math.abs(difference) * 100
        + ((paymentDateScore(first) + paymentDateScore(second)) / 2)
        + (i + j) / 100;
      candidates.push({
        ids: [first.id, second.id],
        total,
        difference,
        score,
        payments: [first, second],
      });
    }
  }

  const best = candidates.sort((a, b) => a.score - b.score)[0];
  if (!best) return null;

  let label = 'Suggested match';
  if (best.difference === 0) {
    label = best.ids.length === 1 ? 'Exact single-deposit match' : 'Exact combined match';
  } else if (best.difference > 0) {
    label = 'Best full-cover match';
  } else {
    label = 'Closest available match';
  }

  return {
    label,
    ids: best.ids,
    paymentCount: best.ids.length,
    totalAvailable: best.total,
    difference: best.difference,
    payments: best.payments,
  };
}

function applyAllocationSuggestionToDrafts(payments, suggestion, targetAmount, setAllocationDrafts) {
  if (!suggestion) return;
  let remaining = Number(targetAmount || 0);
  const next = {};

  for (const paymentId of suggestion.ids) {
    if (remaining <= 0) break;
    const payment = payments.find((entry) => entry.id === paymentId);
    if (!payment) continue;
    const amount = Math.min(Number(payment.availableAmount || 0), remaining);
    if (amount > 0) {
      next[payment.id] = amount.toFixed(2);
      remaining -= amount;
    }
  }

  setAllocationDrafts(next);
}

function SuggestionCard({ title, suggestion, targetAmount, onApply }) {
  if (!suggestion) return null;

  return (
    <Card variant="outlined" className="p-4 bg-brand-50/50 border-brand-200">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-overline text-brand-700">{title}</p>
          <p className="mt-2 text-body-medium font-semibold text-surface-900">{suggestion.label}</p>
          <p className="mt-2 text-body text-surface-600">
            {suggestion.paymentCount === 1 ? 'Uses 1 deposit' : `Uses ${suggestion.paymentCount} deposits`} ·
            {' '}up to {formatCurrency(suggestion.totalAvailable)}
          </p>
          <p className="mt-2 text-caption text-surface-600">
            {suggestion.difference === 0
              ? `This matches ${formatCurrency(targetAmount)} exactly.`
              : suggestion.difference > 0
                ? `This covers ${formatCurrency(targetAmount)} with ${formatCurrency(suggestion.difference)} left unused.`
                : `This gets you to ${formatCurrency(suggestion.totalAvailable)}, leaving ${formatCurrency(Math.abs(suggestion.difference))} still unpaid.`}
          </p>
        </div>
        <div className="sm:text-right">
          <Button type="button" variant="secondary" size="sm" onClick={onApply}>
            Use suggestion
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function Bookings() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [bookingsPagination, setBookingsPagination] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  const [hangingDeposits, setHangingDeposits] = useState([]);
  const [hangingDepositsLoading, setHangingDepositsLoading] = useState(true);
  const [hangingDepositsError, setHangingDepositsError] = useState('');
  const [portalTransferBookings, setPortalTransferBookings] = useState([]);
  const [portalCardBookings, setPortalCardBookings] = useState([]);
  const [recentTransferDecisions, setRecentTransferDecisions] = useState([]);
  const [portalQueueLoading, setPortalQueueLoading] = useState(true);
  const [portalQueueError, setPortalQueueError] = useState('');
  const [workingPortalCheckoutId, setWorkingPortalCheckoutId] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [serverSummary, setServerSummary] = useState(null);
  const [batchFilter, setBatchFilter] = useState('');
  const [batchOptions, setBatchOptions] = useState([]);
  const [fulfilmentQueue, setFulfilmentQueue] = useState([]);
  const [fulfilmentSummary, setFulfilmentSummary] = useState({ total: 0, readyForPickup: 0, readyForDelivery: 0, outForDelivery: 0 });
  const [fulfilmentLoading, setFulfilmentLoading] = useState(true);
  const [fulfilmentWorkingId, setFulfilmentWorkingId] = useState('');
  const [showCreate, setShowCreate] = useState(null);
  const [managePaymentsBooking, setManagePaymentsBooking] = useState(null);
  const [showCancel, setShowCancel] = useState(null);
  const [detailBooking, setDetailBooking] = useState(null);
  const [error, setError] = useState('');

  const canCreate = ['ADMIN', 'MANAGER'].includes(user?.role);
  const canCancel = ['ADMIN', 'MANAGER'].includes(user?.role);

  useEffect(() => {
    api.get('/batches?pageSize=100').then((data) => {
      setBatchOptions((data.batches || []).map((b) => ({ id: b.id, name: b.name, status: b.status })));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    loadBookings();
  }, [filter, search, dateFrom, dateTo, batchFilter, page, pageSize]);

  useEffect(() => {
    loadPortalBookingQueue();
  }, []);

  useEffect(() => {
    loadHangingDeposits();
  }, []);

  useEffect(() => {
    loadFulfilmentQueue();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      loadPortalBookingQueue();
    }, 30000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleFocus() {
      loadPortalBookingQueue();
    }
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  async function loadBookings() {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams();
      if (filter) query.set('status', filter);
      if (search) query.set('search', search);
      if (dateFrom) query.set('dateFrom', dateFrom);
      if (dateTo) query.set('dateTo', dateTo);
      if (batchFilter) query.set('batchId', batchFilter);
      query.set('page', String(page));
      query.set('pageSize', String(pageSize));
      const params = query.toString() ? `?${query.toString()}` : '';
      const data = await api.get(`/bookings${params}`);
      setBookings(data.bookings || []);
      setBookingsPagination(data.pagination || { page: 1, pageSize, total: data.bookings?.length || 0, totalPages: 1 });
      setServerSummary(data.summary || null);
    } catch {
      setError('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }

  async function loadPortalBookingQueue() {
    setPortalQueueLoading(true);
    setPortalQueueError('');
    try {
      const data = await api.get('/portal/admin/booking-checkouts');
      setPortalTransferBookings(data.transferQueue || []);
      setPortalCardBookings(data.recentCardBookings || []);
      setRecentTransferDecisions(data.recentTransferDecisions || []);
    } catch {
      setPortalQueueError('Failed to load portal transfer confirmations');
    } finally {
      setPortalQueueLoading(false);
    }
  }

  async function loadHangingDeposits() {
    setHangingDepositsLoading(true);
    setHangingDepositsError('');
    try {
      const data = await api.get('/bookings/customer-deposits-hanging');
      setHangingDeposits(data.deposits || []);
    } catch {
      setHangingDepositsError('Failed to load customer deposits waiting for booking');
    } finally {
      setHangingDepositsLoading(false);
    }
  }

  async function loadFulfilmentQueue() {
    setFulfilmentLoading(true);
    try {
      const data = await api.get('/bookings/fulfilment-queue');
      setFulfilmentQueue(data.queue || []);
      setFulfilmentSummary(data.summary || { total: 0, readyForPickup: 0, readyForDelivery: 0, outForDelivery: 0 });
    } catch {
      // silently fail — non-critical
    } finally {
      setFulfilmentLoading(false);
    }
  }

  async function completePickup(bookingId) {
    setFulfilmentWorkingId(bookingId);
    try {
      await api.post(`/bookings/${bookingId}/complete-pickup`, {});
      await Promise.all([loadFulfilmentQueue(), loadBookings()]);
    } catch (err) {
      setError(err.error || 'Failed to mark pickup');
    } finally {
      setFulfilmentWorkingId('');
    }
  }

  async function dispatchDelivery(bookingId, driverName) {
    setFulfilmentWorkingId(bookingId);
    try {
      await api.post(`/bookings/${bookingId}/dispatch`, { driverName });
      await Promise.all([loadFulfilmentQueue(), loadBookings()]);
    } catch (err) {
      setError(err.error || 'Failed to dispatch delivery');
    } finally {
      setFulfilmentWorkingId('');
    }
  }

  async function confirmDelivery(bookingId) {
    setFulfilmentWorkingId(bookingId);
    try {
      await api.post(`/bookings/${bookingId}/confirm-delivery`, {});
      await Promise.all([loadFulfilmentQueue(), loadBookings()]);
    } catch (err) {
      setError(err.error || 'Failed to confirm delivery');
    } finally {
      setFulfilmentWorkingId('');
    }
  }

  async function confirmPortalTransfer(checkoutId) {
    setWorkingPortalCheckoutId(checkoutId);
    setPortalQueueError('');
    try {
      await api.post(`/portal/admin/booking-checkouts/${checkoutId}/admin-confirm`, {});
      await loadPortalBookingQueue();
    } catch (err) {
      setPortalQueueError(err.error || 'Failed to confirm this portal transfer');
    } finally {
      setWorkingPortalCheckoutId('');
    }
  }

  async function rejectPortalTransfer(checkoutId) {
    setWorkingPortalCheckoutId(checkoutId);
    setPortalQueueError('');
    try {
      await api.post(`/portal/admin/booking-checkouts/${checkoutId}/reject`, {});
      await loadPortalBookingQueue();
    } catch (err) {
      setPortalQueueError(err.error || 'Failed to reject this portal booking transfer');
    } finally {
      setWorkingPortalCheckoutId('');
    }
  }

  const summary = serverSummary || {
    totalBookings: bookings.length,
    confirmedCount: bookings.filter((b) => b.status === 'CONFIRMED').length,
    bookedCrates: bookings.filter((b) => b.status === 'CONFIRMED').reduce((s, b) => s + b.quantity, 0),
    amountApplied: bookings.filter((b) => b.status === 'CONFIRMED').reduce((s, b) => s + Number(b.amountPaid || 0), 0),
  };

  const hangingCount = hangingDeposits.length;
  const hangingTotal = hangingDeposits.reduce((sum, d) => sum + Number(d.availableAmount || 0), 0);
  const transferCount = portalTransferBookings.length;
  const overdueTransferCount = portalTransferBookings.filter((c) => {
    const mins = Math.floor((Date.now() - new Date(c.createdAt).getTime()) / 60000);
    return mins >= 60 && c.status !== 'ADMIN_CONFIRMED';
  }).length;
  const fulfilmentCount = fulfilmentSummary.total;

  const [expandedSection, setExpandedSection] = useState('');

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-display">Bookings</h1>
          <p className="mt-2 max-w-3xl text-body text-surface-600">
            Record customer money in Banking first, then match it to a booking here.
          </p>
        </div>
        {canCreate && (
          <Button
            onClick={() => setShowCreate({})}
            variant="primary"
            size="md"
          >
            New booking
          </Button>
        )}
      </div>

      {/* Compact attention banners — expand on click */}
      {(hangingCount > 0 || transferCount > 0 || fulfilmentCount > 0) && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {hangingCount > 0 && (
            <button
              type="button"
              onClick={() => setExpandedSection(expandedSection === 'hanging' ? '' : 'hanging')}
              className="flex items-center gap-3 rounded-lg border border-warning-200 bg-warning-50 p-3 text-left transition-colors duration-fast hover:bg-warning-100"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning-500 text-sm font-bold text-white">
                {hangingCount}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-surface-900 truncate">
                  {hangingCount} deposit{hangingCount === 1 ? '' : 's'} hanging
                </p>
                <p className="text-xs text-surface-500">{formatCurrency(hangingTotal)} waiting to be matched</p>
              </div>
              <svg className={`ml-auto h-4 w-4 shrink-0 text-surface-400 transition-transform duration-fast ${expandedSection === 'hanging' ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          )}
          {transferCount > 0 && (
            <button
              type="button"
              onClick={() => setExpandedSection(expandedSection === 'transfers' ? '' : 'transfers')}
              className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors duration-fast ${
                overdueTransferCount > 0
                  ? 'border-error-200 bg-error-50 hover:bg-error-100'
                  : 'border-warning-200 bg-warning-50 hover:bg-warning-100'
              }`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
                overdueTransferCount > 0 ? 'bg-error-500' : 'bg-warning-500'
              }`}>
                {transferCount}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-surface-900 truncate">
                  {transferCount} portal transfer{transferCount === 1 ? '' : 's'} waiting
                </p>
                <p className="text-xs text-surface-500">
                  {overdueTransferCount > 0 ? `${overdueTransferCount} overdue — SOP: confirm within 1 hr` : 'Tap to review and confirm'}
                </p>
              </div>
              <svg className={`ml-auto h-4 w-4 shrink-0 text-surface-400 transition-transform duration-fast ${expandedSection === 'transfers' ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          )}
          {fulfilmentCount > 0 && (
            <button
              type="button"
              onClick={() => setExpandedSection(expandedSection === 'fulfilment' ? '' : 'fulfilment')}
              className="flex items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 p-3 text-left transition-colors duration-fast hover:bg-brand-100"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                {fulfilmentCount}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-surface-900 truncate">
                  {fulfilmentCount} booking{fulfilmentCount === 1 ? '' : 's'} ready for fulfilment
                </p>
                <p className="text-xs text-surface-500">
                  {fulfilmentSummary.readyForPickup > 0 ? `${fulfilmentSummary.readyForPickup} pickup` : ''}
                  {fulfilmentSummary.readyForPickup > 0 && (fulfilmentSummary.readyForDelivery + fulfilmentSummary.outForDelivery) > 0 ? ' · ' : ''}
                  {(fulfilmentSummary.readyForDelivery + fulfilmentSummary.outForDelivery) > 0 ? `${fulfilmentSummary.readyForDelivery + fulfilmentSummary.outForDelivery} delivery` : ''}
                </p>
              </div>
              <svg className={`ml-auto h-4 w-4 shrink-0 text-surface-400 transition-transform duration-fast ${expandedSection === 'fulfilment' ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          )}
        </div>
      )}

      {expandedSection === 'hanging' && (
        <HangingDepositsSection
          loading={hangingDepositsLoading}
          error={hangingDepositsError}
          deposits={hangingDeposits}
          canCreate={canCreate}
          onRefresh={loadHangingDeposits}
          onUseDeposit={(deposit) => setShowCreate({
            customer: deposit.customer || null,
            depositId: deposit.id,
          })}
        />
      )}

      {expandedSection === 'transfers' && (
        <PortalBookingReviewSection
          loading={portalQueueLoading}
          error={portalQueueError}
          transferQueue={portalTransferBookings}
          recentCardBookings={portalCardBookings}
          workingId={workingPortalCheckoutId}
          onConfirm={confirmPortalTransfer}
          onReject={rejectPortalTransfer}
          onRefresh={loadPortalBookingQueue}
          recentTransferDecisions={recentTransferDecisions}
        />
      )}

      {expandedSection === 'fulfilment' && (
        <FulfilmentQueuePanel
          loading={fulfilmentLoading}
          queue={fulfilmentQueue}
          summary={fulfilmentSummary}
          workingId={fulfilmentWorkingId}
          onPickup={completePickup}
          onDispatch={dispatchDelivery}
          onConfirmDelivery={confirmDelivery}
        />
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SummaryCard label="Total bookings" value={summary.totalBookings} />
        <SummaryCard label="Confirmed" value={summary.confirmedCount} />
        <SummaryCard label="Booked crates" value={summary.bookedCrates} />
        <SummaryCard label="Paid toward bookings" value={formatCurrency(summary.amountApplied)} />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="overflow-x-auto custom-scrollbar">
          <div className="flex gap-1 rounded-md bg-surface-100 p-1 w-fit">
            {[
              { value: '', label: 'All' },
              { value: 'CONFIRMED', label: 'Confirmed' },
              { value: 'READY_FOR_PICKUP', label: 'Ready (pickup)' },
              { value: 'READY_FOR_DELIVERY', label: 'Ready (delivery)' },
              { value: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
              { value: 'PICKED_UP', label: 'Picked up' },
              { value: 'DELIVERED', label: 'Delivered' },
              { value: 'CANCELLED', label: 'Cancelled' },
            ].map((tab) => (
              <button
                key={tab.value}
                onClick={() => {
                  setFilter(tab.value);
                  setPage(1);
                }}
                className={`whitespace-nowrap rounded-sm px-4 py-1.5 text-body font-medium transition-all duration-normal ${
                  filter === tab.value
                    ? 'bg-white text-surface-900 shadow-sm'
                    : 'text-surface-500 hover:text-surface-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="min-w-[240px]">
            <Input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search customer, phone, batch, or ref"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => { setDateFrom(event.target.value); setPage(1); }}
              className="w-[140px]"
            />
            <span className="text-caption text-surface-400">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(event) => { setDateTo(event.target.value); setPage(1); }}
              className="w-[140px]"
            />
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}
                className="rounded-md p-1 text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors duration-fast"
                title="Clear dates"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
          <div className="w-[160px]">
            <Select
              value={batchFilter}
              onChange={(event) => { setBatchFilter(event.target.value); setPage(1); }}
            >
              <option value="">All batches</option>
              {batchOptions.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {error && (
        <Card variant="error" className="p-4">
          <p className="text-body text-error-900">{error}</p>
        </Card>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-14 bg-surface-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <Card className="px-6 py-24">
          <EmptyState
            title={filter ? 'No bookings in this group' : 'No bookings yet'}
            body={filter ? 'Try another filter.' : 'When a customer has paid in Banking, you can create a booking from that money here.'}
          />
        </Card>
      ) : (
        <Card className="overflow-x-auto custom-scrollbar">
          <table className="w-full min-w-[780px]">
            <thead>
              <tr className="border-b border-surface-200">
                <th className="px-4 py-3 text-left text-overline text-surface-600">Customer</th>
                <th className="px-4 py-3 text-left text-overline text-surface-600">Source / Payment</th>
                <th className="px-4 py-3 text-left text-overline text-surface-600">Batch</th>
                <th className="px-4 py-3 text-right text-overline text-surface-600">Qty</th>
                <th className="px-4 py-3 text-right text-overline text-surface-600">Value</th>
                <th className="px-4 py-3 text-right text-overline text-surface-600">Paid</th>
                <th className="px-4 py-3 text-right text-overline text-surface-600">Balance</th>
                <th className="px-4 py-3 text-center text-overline text-surface-600">Status</th>
                <th className="px-4 py-3 text-left text-overline text-surface-600">Date</th>
                {(canCreate || canCancel) && <th className="px-4 py-3 text-right text-overline text-surface-600" />}
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id} className="border-b border-surface-100 align-top hover:bg-surface-50 transition-colors duration-fast">
                  <td className="px-4 py-3">
                    <div className="text-body font-medium text-surface-900">{booking.customer?.name || '—'}</div>
                    {booking.customer?.phone && <div className="text-caption text-surface-500">{booking.customer.phone}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <Badge color={bookingSourceMeta(booking).tone} size="sm">
                        {bookingSourceMeta(booking).label}
                      </Badge>
                      <span className="text-caption text-surface-500">{bookingPaymentTruthMeta(booking).label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-body font-medium text-surface-700">{booking.batch?.name || '—'}</div>
                    {booking.batchEggCode?.code && <div className="text-caption text-surface-500">{booking.batchEggCode.code}</div>}
                  </td>
                  <td className="px-4 py-3 text-right text-body">{booking.quantity.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-body text-surface-600">{formatCurrency(booking.orderValue)}</td>
                  <td className="px-4 py-3 text-right text-body font-medium text-surface-900">{formatCurrency(booking.amountPaid)}</td>
                  <td className={`px-4 py-3 text-right text-body font-medium ${booking.balance > 0 ? 'text-warning-600' : 'text-success-600'}`}>
                    {formatCurrency(booking.balance)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge color={BOOKING_STATUS_BADGES[booking.status] || 'neutral'}>
                      {BOOKING_STATUS_LABELS[booking.status] || booking.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-body text-surface-500">{formatDate(booking.createdAt)}</td>
                  {(canCreate || canCancel) && (
                    <td className="px-4 py-3 text-right">
                      <RowActionMenu
                        onView={() => setDetailBooking(booking)}
                        onManagePayments={
                          canCreate && booking.status === 'CONFIRMED' && booking.portalCheckout?.paymentMethod !== 'CARD'
                            ? () => setManagePaymentsBooking(booking)
                            : null
                        }
                        onCancel={
                          canCancel && booking.status === 'CONFIRMED'
                            ? () => setShowCancel(booking)
                            : null
                        }
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {bookings.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <p className="text-body text-surface-500">
              Showing {bookings.length.toLocaleString()} of {bookingsPagination.total.toLocaleString()}
            </p>
            <div className="w-[120px]">
              <Select
                value={String(pageSize)}
                onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}
              >
                {[25, 50, 100, 200, 250].map((option) => (
                  <option key={option} value={option}>{option} / page</option>
                ))}
              </Select>
            </div>
          </div>
          {bookingsPagination.totalPages > 1 && (
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <p className="text-body text-surface-600">
                Page {bookingsPagination.page} of {bookingsPagination.totalPages}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((current) => Math.min(bookingsPagination.totalPages, current + 1))}
                disabled={page >= bookingsPagination.totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <CreateBookingModal
          initialCustomer={showCreate.customer || null}
          initialDepositId={showCreate.depositId || ''}
          onClose={() => setShowCreate(null)}
          onCreated={() => {
            setShowCreate(null);
            loadBookings();
            loadHangingDeposits();
          }}
        />
      )}

      {managePaymentsBooking && (
        <ManageBookingPaymentsModal
          booking={managePaymentsBooking}
          onClose={() => setManagePaymentsBooking(null)}
          onSaved={() => {
            setManagePaymentsBooking(null);
            loadBookings();
            loadHangingDeposits();
          }}
        />
      )}

      {showCancel && (
        <CancelBookingModal
          booking={showCancel}
          onClose={() => setShowCancel(null)}
          onCancelled={() => {
            setShowCancel(null);
            loadBookings();
          }}
        />
      )}

      {detailBooking && (
        <BookingDetailModal
          booking={detailBooking}
          onClose={() => setDetailBooking(null)}
          onManagePayments={
            canCreate && detailBooking.status === 'CONFIRMED' && detailBooking.portalCheckout?.paymentMethod !== 'CARD'
              ? () => {
                  setDetailBooking(null);
                  setManagePaymentsBooking(detailBooking);
                }
              : null
          }
        />
      )}
    </div>
  );
}

function RowActionMenu({ onView, onManagePayments, onCancel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function close(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="rounded-md p-1.5 text-surface-400 hover:bg-surface-100 hover:text-surface-600 transition-colors duration-fast"
        aria-label="Actions"
      >
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><circle cx="10" cy="4" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="10" cy="16" r="1.5" /></svg>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-surface-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={() => { setOpen(false); onView(); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-body text-surface-700 hover:bg-surface-50 transition-colors duration-fast"
          >
            View details
          </button>
          {onManagePayments && (
            <button
              type="button"
              onClick={() => { setOpen(false); onManagePayments(); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-body text-brand-700 hover:bg-surface-50 transition-colors duration-fast"
            >
              Manage payments
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={() => { setOpen(false); onCancel(); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-body text-error-600 hover:bg-error-50 transition-colors duration-fast"
            >
              Cancel booking
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FulfilmentQueuePanel({ loading, queue, summary, workingId, onPickup, onDispatch, onConfirmDelivery }) {
  const [driverInputs, setDriverInputs] = useState({});

  if (loading) {
    return (
      <Card className="p-6">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg bg-surface-100 animate-pulse" />)}
        </div>
      </Card>
    );
  }

  if (queue.length === 0) {
    return (
      <Card className="px-6 py-12">
        <EmptyState
          title="No bookings awaiting fulfilment"
          body="When a batch is received, its confirmed bookings will automatically appear here."
        />
      </Card>
    );
  }

  const pickups = queue.filter((b) => b.status === 'READY_FOR_PICKUP');
  const deliveries = queue.filter((b) => ['READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY'].includes(b.status));

  return (
    <Card className="divide-y divide-surface-100">
      <div className="px-5 py-4">
        <h3 className="text-title text-surface-900">Fulfilment queue</h3>
        <p className="mt-1 text-body text-surface-500">
          {summary.readyForPickup > 0 && `${summary.readyForPickup} ready for pickup`}
          {summary.readyForPickup > 0 && (summary.readyForDelivery + summary.outForDelivery) > 0 && ' · '}
          {summary.readyForDelivery > 0 && `${summary.readyForDelivery} ready for delivery`}
          {summary.readyForDelivery > 0 && summary.outForDelivery > 0 && ' · '}
          {summary.outForDelivery > 0 && `${summary.outForDelivery} out for delivery`}
        </p>
      </div>

      {pickups.length > 0 && (
        <div className="px-5 py-4">
          <h4 className="mb-3 text-overline text-surface-600">Pickups</h4>
          <div className="space-y-2">
            {pickups.map((b) => (
              <div key={b.id} className="flex flex-col gap-3 rounded-lg border border-surface-200 bg-surface-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-body font-medium text-surface-900">{b.customer?.name || 'Customer'}</p>
                  <p className="text-caption text-surface-500">
                    {b.customer?.phone || ''} · {b.batch?.name || 'Batch'} · {b.quantity} crate{b.quantity !== 1 ? 's' : ''} · {formatCurrency(b.orderValue)}
                  </p>
                  {b.readyAt && <p className="text-caption text-surface-400">Ready since {formatDate(b.readyAt)}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => onPickup(b.id)}
                  disabled={workingId === b.id}
                  className="shrink-0 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                >
                  {workingId === b.id ? 'Working...' : 'Mark picked up'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {deliveries.length > 0 && (
        <div className="px-5 py-4">
          <h4 className="mb-3 text-overline text-surface-600">Deliveries</h4>
          <div className="space-y-2">
            {deliveries.map((b) => (
              <div key={b.id} className="rounded-lg border border-surface-200 bg-surface-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-body font-medium text-surface-900">{b.customer?.name || 'Customer'}</p>
                      <Badge color={b.status === 'OUT_FOR_DELIVERY' ? 'info' : 'warning'}>
                        {BOOKING_STATUS_LABELS[b.status]}
                      </Badge>
                    </div>
                    <p className="text-caption text-surface-500">
                      {b.customer?.phone || ''} · {b.batch?.name || 'Batch'} · {b.quantity} crate{b.quantity !== 1 ? 's' : ''} · {formatCurrency(b.orderValue)}
                    </p>
                    {b.deliveryAddress && <p className="mt-1 text-caption text-surface-600">Deliver to: {b.deliveryAddress}</p>}
                    {b.driverName && <p className="text-caption text-surface-500">Driver: {b.driverName}</p>}
                    {b.readyAt && <p className="text-caption text-surface-400">Ready since {formatDate(b.readyAt)}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                    {b.status === 'READY_FOR_DELIVERY' && (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Driver name"
                          value={driverInputs[b.id] || ''}
                          onChange={(e) => setDriverInputs({ ...driverInputs, [b.id]: e.target.value })}
                          className="w-[140px] rounded-md border border-surface-200 bg-white px-3 py-1.5 text-sm text-surface-900 placeholder:text-surface-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        <button
                          type="button"
                          onClick={() => onDispatch(b.id, driverInputs[b.id] || '')}
                          disabled={workingId === b.id}
                          className="shrink-0 rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                        >
                          {workingId === b.id ? 'Working...' : 'Dispatch'}
                        </button>
                      </div>
                    )}
                    {b.status === 'OUT_FOR_DELIVERY' && (
                      <button
                        type="button"
                        onClick={() => onConfirmDelivery(b.id)}
                        disabled={workingId === b.id}
                        className="shrink-0 rounded-md bg-success-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-success-700 disabled:opacity-50"
                      >
                        {workingId === b.id ? 'Working...' : 'Confirm delivered'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function SummaryCard({ label, value }) {
  return (
    <Card>
      <p className="text-overline text-surface-600">{label}</p>
      <p className="mt-3 text-metric font-bold text-surface-900">{value}</p>
    </Card>
  );
}

function HangingDepositsSection({ loading, error, deposits, canCreate, onRefresh, onUseDeposit }) {
  if (loading) {
    return (
      <Card className="p-4">
        <p className="text-body text-surface-500">Loading customer deposits hanging for booking…</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card variant="error" className="p-4">
        <p className="text-body text-error-900">{error}</p>
      </Card>
    );
  }

  if (!deposits?.length) {
    return null;
  }

  const totalAvailable = deposits.reduce((sum, deposit) => sum + Number(deposit.availableAmount || 0), 0);

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-heading font-semibold text-surface-900">Customer deposits hanging</h2>
          <p className="mt-2 text-body text-surface-500">
            These are customer-related inflows already entered in Banking but not yet fully matched to bookings.
          </p>
        </div>
        <div className="text-right">
          <p className="text-overline text-surface-500">Still hanging</p>
          <p className="mt-2 text-title font-semibold text-surface-900">{formatCurrency(totalAvailable)}</p>
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={onRefresh}>
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {deposits.map((deposit) => (
          <div key={deposit.id} className="rounded-lg border border-surface-200 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-body-medium font-semibold text-surface-900">
                    {deposit.customer?.name || 'Customer not linked yet'}
                  </p>
                  <Badge color={deposit.customer ? 'info' : 'warning'}>
                    {deposit.customer ? 'Customer linked' : 'Needs customer'}
                  </Badge>
                  <Badge color="neutral">
                    {deposit.category === 'CUSTOMER_DEPOSIT' ? 'Customer deposit' : deposit.category === 'UNALLOCATED_INCOME' ? 'Unallocated income' : 'Legacy customer booking'}
                  </Badge>
                  <Badge color={deposit.ageInDays >= 30 ? 'warning' : 'neutral'}>
                    {hangingAgeLabel(deposit.ageInDays)}
                  </Badge>
                </div>
                <p className="text-body text-surface-500">
                  {formatDate(deposit.transactionDate)} · {deposit.bankAccount?.name || 'Bank account'}
                </p>
                <p className="text-body text-surface-600">
                  {deposit.description || deposit.reference || 'Customer deposit entered from Banking'}
                </p>
                {deposit.reference ? (
                  <p className="text-caption text-surface-500">Ref {deposit.reference}</p>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3 lg:min-w-[320px]">
                <SummaryCard label="Money in" value={formatCurrency(deposit.amount)} />
                <SummaryCard label="Still hanging" value={formatCurrency(deposit.availableAmount)} />
              </div>
            </div>

            {deposit.allocations?.length ? (
              <div className="mt-4 rounded-lg border border-surface-200 bg-surface-50 p-4">
                <p className="text-body-medium font-semibold text-surface-900">Already matched from this deposit</p>
                <div className="mt-3 space-y-2">
                  {deposit.allocations.map((allocation) => (
                    <div key={allocation.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-body">
                      <div>
                        <span className="font-medium text-surface-900">{allocation.booking?.batch?.name || 'Batch'}</span>
                        {allocation.booking?.batch?.expectedDate ? (
                          <span className="ml-2 text-surface-500">Expected {formatDate(allocation.booking.batch.expectedDate)}</span>
                        ) : null}
                      </div>
                      <div className="text-surface-600">
                        {allocation.booking?.quantity || 0} crates · {formatCurrency(allocation.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {canCreate ? (
              <div className="mt-4 flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onUseDeposit(deposit)}
                >
                  {deposit.customer ? 'Create or match booking' : 'Link customer and create booking'}
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

function PortalBookingReviewSection({
  loading,
  error,
  transferQueue,
  recentCardBookings,
  recentTransferDecisions,
  workingId,
  onConfirm,
  onReject,
  onRefresh,
}) {
  if (loading) {
    return (
      <Card className="p-4">
        <p className="text-body text-surface-500">Loading portal transfer payments…</p>
      </Card>
    );
  }

  if ((!transferQueue || transferQueue.length === 0) && (!recentCardBookings || recentCardBookings.length === 0) && (!recentTransferDecisions || recentTransferDecisions.length === 0)) {
    return null;
  }

  return (
    <div className="space-y-4">
      <Card variant="warning" className="p-4">
        <h2 className="text-overline uppercase text-warning-900">Portal transfer payments</h2>
        <p className="mt-2 text-body text-warning-900">
          Portal transfer orders have two checkpoints: first a staff admin confirmation when the money is seen, then a full confirmation when the matching bank statement line is linked in Banking. The statement is the final source of financial truth.
        </p>
      </Card>

      {error ? (
        <Card variant="error" className="p-4">
          <p className="text-body text-error-900">{error}</p>
        </Card>
      ) : null}

      {transferQueue?.length ? (
        <Card className="p-4 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
            <h3 className="text-heading font-semibold text-surface-900">Portal transfers waiting for action</h3>
            <p className="mt-2 text-body text-surface-500">Use this to mark “money seen” first. The final financial confirmation still happens when the statement line is linked in Banking.</p>
            </div>
            <Button variant="secondary" size="sm" onClick={onRefresh}>
              Refresh
            </Button>
          </div>

          {transferQueue.map((checkout) => {
            const isAdminConfirmed = checkout.status === 'ADMIN_CONFIRMED';
            return (
              <div key={checkout.id} className={`rounded-lg border p-4 ${!isAdminConfirmed && waitingTimeInfo(checkout.createdAt).isOverdue ? 'border-error-200 bg-error-50' : 'border-surface-200'}`}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-body-medium font-semibold text-surface-900">{checkout.customer?.name || 'Customer'}</p>
                      <Badge color={isAdminConfirmed ? 'warning' : 'neutral'}>
                        {isAdminConfirmed ? 'Admin confirmed, waiting for statement' : 'Waiting for admin confirmation'}
                      </Badge>
                      {(() => {
                        const wt = waitingTimeInfo(isAdminConfirmed ? checkout.adminConfirmedAt : checkout.createdAt);
                        return (
                          <Badge color={wt.isOverdue ? 'error' : 'warning'}>
                            {wt.label}{wt.isOverdue && !isAdminConfirmed ? ' — OVERDUE' : ''}
                          </Badge>
                        );
                      })()}
                    </div>
                    <p className="text-body text-surface-500">
                      {checkout.batch?.name} · {checkout.batch?.eggTypeLabel || 'Regular Size Eggs'} · {checkout.quantity} crates
                    </p>
                    <p className="text-caption text-surface-500">
                      Ref {checkout.reference} · Created {formatDate(checkout.createdAt)}
                      {checkout.adminConfirmedAt ? ` · Admin confirmed ${formatDate(checkout.adminConfirmedAt)}` : ''}
                    </p>
                    {!isAdminConfirmed && waitingTimeInfo(checkout.createdAt).isOverdue && (
                      <p className="text-caption font-semibold text-error-700">
                        SOP: transfers should be confirmed within 1 hour during business hours
                      </p>
                    )}
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-body-medium font-semibold text-surface-900">{formatCurrency(checkout.amountToPay)}</p>
                    <p className="text-caption text-surface-500">Order payment now</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap justify-end gap-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onReject(checkout.id)}
                    disabled={workingId === checkout.id}
                  >
                    {workingId === checkout.id ? 'Working…' : 'Reject'}
                  </Button>
                  {!isAdminConfirmed ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onConfirm(checkout.id)}
                      disabled={workingId === checkout.id}
                    >
                      {workingId === checkout.id ? 'Working…' : 'Confirm money seen'}
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </Card>
      ) : null}

      {recentCardBookings?.length ? (
        <Card className="p-4 space-y-3">
          <div>
            <h3 className="text-heading font-semibold text-surface-900">Recent portal card orders</h3>
            <p className="mt-2 text-body text-surface-500">These are recent portal orders that already passed card verification and were created immediately.</p>
          </div>

          <div className="space-y-3">
            {recentCardBookings.map((checkout) => (
              <div key={checkout.id} className="rounded-lg border border-surface-200 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-body-medium font-semibold text-surface-900">{checkout.customer?.name || 'Customer'}</p>
                      <Badge color="success">Card booking confirmed</Badge>
                    </div>
                    <p className="text-body text-surface-500">
                      {checkout.batch?.name} · {checkout.batch?.eggTypeLabel || 'Regular Size Eggs'} · {checkout.quantity} crates
                    </p>
                    <p className="text-caption text-surface-500">
                      Ref {checkout.reference} · Confirmed {formatDate(checkout.updatedAt)}
                    </p>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-body-medium font-semibold text-surface-900">{formatCurrency(checkout.amountToPay)}</p>
                    <p className="text-caption text-surface-500">Paid by card</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {recentTransferDecisions?.length ? (
        <Card className="p-4 space-y-3">
          <div>
            <h3 className="text-heading font-semibold text-surface-900">Recent transfer decisions</h3>
            <p className="mt-2 text-body text-surface-500">Keep track of who marked money seen, who rejected a transfer, and which bookings have now been fully confirmed from the bank statement.</p>
          </div>

          <div className="space-y-3">
            {recentTransferDecisions.map((decision) => (
              <div key={decision.id} className="rounded-lg border border-surface-200 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-body-medium font-semibold text-surface-900">{decision.checkout?.customer?.name || 'Customer'}</p>
                      <Badge color={decision.decisionType === 'REJECTED' ? 'error' : decision.decisionType === 'STATEMENT_CONFIRMED' ? 'success' : 'warning'}>
                        {decision.decisionType === 'MONEY_SEEN' ? 'Money seen' : decision.decisionType === 'STATEMENT_CONFIRMED' ? 'Statement confirmed' : 'Transfer declined'}
                      </Badge>
                    </div>
                    <p className="text-body text-surface-500">
                      {decision.checkout?.batch?.name || 'Batch'} · {decision.checkout?.batch?.eggTypeLabel || 'Regular Size Eggs'} · {decision.checkout?.quantity || 0} crates
                    </p>
                    <p className="text-caption text-surface-500">
                      {decision.actor?.label || 'Unknown staff'} · {formatDate(decision.createdAt)}
                    </p>
                    {decision.notes ? (
                      <p className="text-body text-surface-600">{decision.notes}</p>
                    ) : null}
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-body-medium font-semibold text-surface-900">{formatCurrency(decision.checkout?.amountToPay || 0)}</p>
                    <p className="text-caption text-surface-500">{decision.checkout?.reference || 'No reference'}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function CreateBookingModal({ initialCustomer = null, initialDepositId = '', onClose, onCreated }) {
  const [step, setStep] = useState(initialCustomer ? 2 : 1);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(initialCustomer);
  const [showNewCustomer, setShowNewCustomer] = useState(false);

  const [openBatches, setOpenBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');

  const [funds, setFunds] = useState([]);
  const [loadingFunds, setLoadingFunds] = useState(false);
  const [bookingPolicy, setBookingPolicy] = useState({
    bookingMinimumPaymentPercent: 80,
    firstTimeBookingLimitCrates: 20,
    firstCustomerOrderLimitCount: 3,
    maxBookingCratesPerOrder: 100,
  });
  const [allocationDrafts, setAllocationDrafts] = useState({});

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSelectedCustomer(initialCustomer);
    setStep(initialCustomer ? 2 : 1);
  }, [initialCustomer]);

  useEffect(() => {
    if (!customerSearch.trim()) {
      setCustomers([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingCustomers(true);
      try {
        const data = await api.get(`/customers?search=${encodeURIComponent(customerSearch)}`);
        setCustomers(data.customers || []);
      } catch {
        setCustomers([]);
      } finally {
        setSearchingCustomers(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [customerSearch]);

  useEffect(() => {
    if (step === 2 && openBatches.length === 0) {
      loadOpenBatches();
    }
  }, [step]);

  // Preload customer funds as soon as a customer is selected (step 1→2),
  // so data is ready by the time the user reaches step 3.
  useEffect(() => {
    if (selectedCustomer) {
      loadCustomerFunds(selectedCustomer.id);
    } else {
      setFunds([]);
      setAllocationDrafts({});
    }
  }, [selectedCustomer]);

  async function loadOpenBatches() {
    setLoadingBatches(true);
    try {
      const data = await api.get('/bookings/open-batches');
      setOpenBatches(data.batches || []);
      setBookingPolicy((current) => ({
        ...current,
        ...(data.policy || {}),
      }));
    } catch {
      setOpenBatches([]);
    } finally {
      setLoadingBatches(false);
    }
  }

  async function loadCustomerFunds(customerId) {
    setLoadingFunds(true);
    try {
      const data = await api.get(`/bookings/customer-funds/${customerId}`);
      const payments = data.payments || [];
      setFunds(payments);
      setAllocationDrafts((current) => {
        if (!initialDepositId) return {};
        const highlightedPayment = payments.find((payment) => payment.id === initialDepositId);
        if (!highlightedPayment) return {};
        return {
          [highlightedPayment.id]: Number(highlightedPayment.availableAmount).toFixed(2),
        };
      });
      if (data.customer) {
        setSelectedCustomer((current) => (
          current?.id === customerId
            ? { ...current, ...data.customer }
            : current
        ));
      }
    } catch {
      setFunds([]);
    } finally {
      setLoadingFunds(false);
    }
  }

  async function handleNewCustomer(customerData) {
    const data = await api.post('/customers', customerData);
    setSelectedCustomer(data.customer);
    setShowNewCustomer(false);
    setStep(2);
  }

  const orderValue = selectedBatch && quantity ? Number(quantity) * Number(selectedBatch.wholesalePrice) : 0;
  const minimumPayment = orderValue * (Number(bookingPolicy.bookingMinimumPaymentPercent || 80) / 100);
  const customerOrderLimit = Number(
    selectedCustomer?.orderLimitProfile?.currentPerOrderLimit
      || bookingPolicy.maxBookingCratesPerOrder
      || 100,
  );
  const maxQty = customerOrderLimit;
  const batchRemaining = selectedBatch?.remainingAvailable || 0;
  const effectiveMax = Math.min(maxQty, batchRemaining);

  const totalAllocated = Object.values(allocationDrafts).reduce((sum, value) => sum + Number(value || 0), 0);
  const balance = Math.max(0, orderValue - totalAllocated);
  const canContinueToFunds = selectedBatch && quantity && Number(quantity) > 0;
  const canSubmit = totalAllocated >= minimumPayment && totalAllocated <= orderValue && !submitting;
  const minimumSuggestion = useMemo(
    () => buildBestAllocationSuggestion(funds, minimumPayment),
    [funds, minimumPayment],
  );
  const fullBookingSuggestion = useMemo(
    () => buildBestAllocationSuggestion(funds, orderValue),
    [funds, orderValue],
  );

  function updateAllocation(paymentId, value) {
    setAllocationDrafts((current) => ({
      ...current,
      [paymentId]: value,
    }));
  }

  function fillToTarget(targetAmount) {
    let remaining = targetAmount;
    const next = {};

    for (const payment of funds) {
      if (remaining <= 0) break;
      const amount = Math.min(payment.availableAmount, remaining);
      if (amount > 0) {
        next[payment.id] = amount.toFixed(2);
        remaining -= amount;
      }
    }

    setAllocationDrafts(next);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!selectedCustomer || !selectedBatch) {
      setError('Choose a customer and a batch first');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await api.post('/bookings', {
        customerId: selectedCustomer.id,
        batchId: selectedBatch.id,
        quantity: Number(quantity),
        paymentAllocations: Object.entries(allocationDrafts)
          .map(([bankTransactionId, amount]) => ({
            bankTransactionId,
            amount: Number(amount),
          }))
          .filter((allocation) => allocation.amount > 0),
        channel: 'backend',
        notes: notes.trim() || undefined,
      });
      onCreated();
    } catch (err) {
      setError(err.error || 'Failed to create booking');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 border-b border-surface-200 bg-white px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-title font-semibold text-surface-900">New booking</h2>
              <p className="mt-2 text-body text-surface-500">Choose customer, choose batch, then apply money already received.</p>
            </div>
            <button onClick={onClose} className="rounded-md px-2 py-1 text-body text-surface-500 hover:bg-surface-100 hover:text-surface-700 transition-colors duration-fast">Close</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <StepPill active={step === 1} complete={step > 1} label="1. Customer" />
            <StepPill active={step === 2} complete={step > 2} label="2. Batch" />
            <StepPill active={step === 3} complete={false} label="3. Apply payments" />
          </div>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <Card variant="error" className="p-4">
              <p className="text-body text-error-900">{error}</p>
            </Card>
          )}

          {step === 1 && !showNewCustomer && (
            <div className="space-y-4">
              <Field label="Find customer">
                <Input
                  type="text"
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  placeholder="Type customer name or phone"
                  autoFocus
                />
              </Field>

              {searchingCustomers && <p className="text-body text-surface-500">Searching…</p>}

              {customers.length > 0 && (
                <Card className="p-0 divide-y divide-surface-100">
                  {customers.map((customer) => (
                    <button
                      key={customer.id}
                      onClick={() => {
                        setSelectedCustomer(customer);
                        setStep(2);
                      }}
                      className="block w-full px-4 py-3 text-left transition-colors duration-fast hover:bg-surface-50"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-surface-900">{customer.name}</span>
                        <span className="text-body text-surface-500">{customer.phone}</span>
                        {customer.orderLimitProfile?.isUsingEarlyOrderLimit && (
                          <Badge color="warning" size="sm">
                            Early-order limit active
                          </Badge>
                        )}
                      </div>
                    </button>
                  ))}
                </Card>
              )}

              {customerSearch && !searchingCustomers && customers.length === 0 && (
                <p className="text-body text-surface-500">No customer found.</p>
              )}

              <button
                onClick={() => setShowNewCustomer(true)}
                className="text-body font-medium text-brand-600 hover:text-brand-700 transition-colors duration-fast"
              >
                + Create new customer
              </button>
            </div>
          )}

          {step === 1 && showNewCustomer && (
            <InlineNewCustomerForm
              onCancel={() => setShowNewCustomer(false)}
              onCreated={handleNewCustomer}
            />
          )}

          {step === 2 && (
            <div className="space-y-5">
              <SelectedCustomerCard
                customer={selectedCustomer}
                policy={bookingPolicy}
                onChange={() => {
                  setStep(1);
                  setSelectedBatch(null);
                  setQuantity('');
                }}
              />

              <div>
                <h3 className="text-heading font-semibold text-surface-900">Choose batch</h3>
                <p className="mt-2 text-body text-surface-500">Pick an open batch with enough space for this customer.</p>
              </div>

              {loadingBatches ? (
                <p className="text-body text-surface-500">Loading open batches…</p>
              ) : openBatches.length === 0 ? (
                <EmptyState title="No open batches" body="There are no open batches available for booking right now." compact />
              ) : (
                <div className="space-y-2">
                  {openBatches.map((batch) => (
                    <button
                      key={batch.id}
                      type="button"
                      onClick={() => {
                        setSelectedBatch(batch);
                      }}
                      className={`block w-full rounded-lg border px-4 py-3 text-left transition-all duration-fast ${
                        selectedBatch?.id === batch.id
                          ? 'border-brand-300 bg-brand-50'
                          : 'border-surface-200 hover:border-surface-300 hover:bg-surface-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold text-surface-900">{batch.name}</p>
                          <p className="mt-2 text-body text-surface-500">Expected {formatDate(batch.expectedDate)}</p>
                          <p className="mt-2 text-body font-medium text-surface-700">
                            {batch.eggTypeLabel || 'Regular Size Eggs'}
                          </p>
                          <p className="mt-2 text-caption text-surface-500">
                            FE sources: {(batch.eggCodes || []).map((eggCode) => eggCode.code).join(', ') || '—'}
                          </p>
                        </div>
                        <div className="text-right text-body flex-shrink-0">
                          <p className="font-medium text-surface-900">{formatCurrency(batch.wholesalePrice)} / crate</p>
                          <p className="text-success-600 mt-2">{batch.remainingAvailable} crates free</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {selectedBatch && (
                <>
                  <Card variant="info" className="p-4">
                    <p className="text-body text-info-900">
                      The customer is booking {selectedBatch.eggTypeLabel || 'this egg type'} at one batch price. FE codes stay in the background for internal cost tracking.
                    </p>
                  </Card>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label={`Quantity (max ${effectiveMax})`}>
                      <Input
                        type="number"
                        min="1"
                        max={effectiveMax}
                        value={quantity}
                        onChange={(event) => setQuantity(event.target.value)}
                        placeholder="How many crates?"
                      />
                    </Field>
                    <Field label="Notes">
                      <Input
                        type="text"
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        placeholder="Optional note"
                      />
                    </Field>
                  </div>

                  {quantity && Number(quantity) > 0 && (
                    <Card className="bg-surface-50 p-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <BookingStat label="Booking value" value={formatCurrency(orderValue)} />
                        <BookingStat label="Minimum to book" value={formatCurrency(minimumPayment)} />
                        <BookingStat label="Remaining after minimum" value={formatCurrency(Math.max(0, orderValue - minimumPayment))} />
                      </div>
                    </Card>
                  )}
                </>
              )}

              <div className="flex justify-between gap-3 pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setStep(1);
                    setSelectedBatch(null);
                    setQuantity('');
                  }}
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setStep(3)}
                  disabled={!canContinueToFunds}
                >
                  Continue
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <SelectedCustomerCard customer={selectedCustomer} policy={bookingPolicy} onChange={() => setStep(1)} />

              <Card className="bg-surface-50 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <BookingStat label="Batch" value={selectedBatch?.name || '—'} />
                  <BookingStat label="Quantity" value={`${quantity || 0} crates`} />
                  <BookingStat label="Booking value" value={formatCurrency(orderValue)} />
                  <BookingStat label="Minimum to book" value={formatCurrency(minimumPayment)} />
                </div>
              </Card>

              <div>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-heading font-semibold text-surface-900">Apply customer payments</h3>
                    <p className="mt-2 text-body text-surface-500">Choose how much of the customer&apos;s available money should fund this booking.</p>
                    {initialDepositId ? (
                      <p className="mt-2 text-caption text-brand-700">The deposit you selected from the hanging list is already filled in below. You can still adjust or combine it with other customer deposits.</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 flex-shrink-0">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => fillToTarget(minimumPayment)}
                    >
                      Fill minimum
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => fillToTarget(orderValue)}
                    >
                      Fill full booking
                    </Button>
                  </div>
                </div>
              </div>

              {(minimumSuggestion || fullBookingSuggestion) && (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <SuggestionCard
                    title="Suggested for minimum"
                    suggestion={minimumSuggestion}
                    targetAmount={minimumPayment}
                    onApply={() => applyAllocationSuggestionToDrafts(funds, minimumSuggestion, minimumPayment, setAllocationDrafts)}
                  />
                  <SuggestionCard
                    title="Suggested for full booking"
                    suggestion={fullBookingSuggestion}
                    targetAmount={orderValue}
                    onApply={() => applyAllocationSuggestionToDrafts(funds, fullBookingSuggestion, orderValue, setAllocationDrafts)}
                  />
                </div>
              )}

              <p className="text-caption text-surface-500">
                Showing customer deposits and unallocated income entered in Banking that haven&apos;t been fully used by other bookings.
              </p>

              {loadingFunds ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 bg-surface-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : funds.length === 0 ? (
                <Card variant="warning" className="p-4">
                  <p className="text-body text-warning-900">
                    No available money found for this customer. Go to <strong>Banking</strong> and record the customer&apos;s transfer or deposit first, categorized as &quot;Customer deposit&quot;. Then come back here to create the booking.
                  </p>
                </Card>
              ) : (
                <Card className="overflow-x-auto custom-scrollbar">
                  <table className="w-full min-w-[760px]">
                    <thead>
                      <tr className="border-b border-surface-200 bg-surface-50">
                        <th className="px-4 py-3 text-left text-overline text-surface-600">Date</th>
                        <th className="px-4 py-3 text-left text-overline text-surface-600">Source</th>
                        <th className="px-4 py-3 text-left text-overline text-surface-600">Account</th>
                        <th className="px-4 py-3 text-right text-overline text-surface-600">Available</th>
                        <th className="px-4 py-3 text-right text-overline text-surface-600">Use for this booking</th>
                      </tr>
                    </thead>
                    <tbody>
                      {funds.map((payment) => (
                        <tr key={payment.id} className="border-b border-surface-100 hover:bg-surface-50 transition-colors duration-fast">
                          <td className="px-4 py-3 text-body text-surface-600">{formatDate(payment.transactionDate)}</td>
                          <td className="px-4 py-3 text-body text-surface-700">
                            <div className="flex flex-wrap items-center gap-2">
                              <span>{payment.description || payment.reference || 'Payment received'}</span>
                              {payment.id === initialDepositId ? (
                                <Badge color="brand" size="sm">Selected deposit</Badge>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-body text-surface-500">{payment.bankAccount?.name || '—'}</td>
                          <td className="px-4 py-3 text-right text-body font-medium text-surface-900">{formatCurrency(payment.availableAmount)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min="0"
                                max={payment.availableAmount}
                                step="0.01"
                                value={allocationDrafts[payment.id] || ''}
                                onChange={(event) => updateAllocation(payment.id, event.target.value)}
                                className="text-right"
                              />
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => updateAllocation(payment.id, payment.availableAmount.toFixed(2))}
                              >
                                Use all
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}

              <Card className="bg-surface-50 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <BookingStat label="Applied now" value={formatCurrency(totalAllocated)} />
                  <BookingStat label="Still to pay" value={formatCurrency(balance)} tone={balance > 0 ? 'warning' : 'success'} />
                  <BookingStat label="Minimum met?" value={totalAllocated >= minimumPayment ? 'Yes' : 'No'} tone={totalAllocated >= minimumPayment ? 'success' : 'warning'} />
                </div>
              </Card>

              <div className="flex justify-between gap-3 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setStep(2)}
                >
                  Back
                </Button>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={onClose}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={!canSubmit}
                  >
                    {submitting ? 'Creating…' : 'Create booking'}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function StepPill({ active, complete, label }) {
  return (
    <Badge
      color={active || complete ? 'brand' : 'neutral'}
      size="sm"
    >
      {label}
    </Badge>
  );
}

function BookingDetailModal({ booking, onClose, onManagePayments }) {
  const lifecycle = bookingLifecycleEvents(booking);
  const sourceMeta = bookingSourceMeta(booking);
  const paymentMeta = bookingPaymentTruthMeta(booking);

  return (
    <Modal open={true} onClose={onClose} title="Booking details" size="lg" footer={false}>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-caption text-surface-500">Booking</p>
            <h3 className="text-title font-semibold text-surface-900">{booking.batch?.name || 'Batch'}</h3>
            <p className="text-body text-surface-600 mt-1">{booking.customer?.name || 'Customer'}{booking.customer?.phone ? ` · ${booking.customer.phone}` : ''}</p>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <Badge color={sourceMeta.tone}>{sourceMeta.label}</Badge>
            <Badge color={paymentMeta.tone}>{paymentMeta.label}</Badge>
            <Badge color={BOOKING_STATUS_BADGES[booking.status] || 'neutral'}>{BOOKING_STATUS_LABELS[booking.status] || booking.status}</Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Quantity" value={`${booking.quantity} crates`} />
          <MetricCard label="Booking value" value={formatCurrency(booking.orderValue)} />
          <MetricCard label="Paid" value={formatCurrency(booking.amountPaid)} />
          <MetricCard label="Balance" value={formatCurrency(booking.balance)} tone={booking.balance > 0 ? 'warning' : 'success'} />
        </div>

        {/* Fulfilment info */}
        {booking.fulfilmentType && (
          <Card className="p-4 bg-surface-50">
            <p className="text-overline text-surface-600 mb-2">Fulfilment</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-caption text-surface-500">Type</p>
                <p className="text-body font-medium text-surface-900">{booking.fulfilmentType === 'DELIVERY' ? 'Delivery' : 'Pickup'}</p>
              </div>
              {booking.readyAt && (
                <div>
                  <p className="text-caption text-surface-500">Ready at</p>
                  <p className="text-body text-surface-900">{formatDate(booking.readyAt)}</p>
                </div>
              )}
              {booking.driverName && (
                <div>
                  <p className="text-caption text-surface-500">Driver</p>
                  <p className="text-body text-surface-900">{booking.driverName}</p>
                </div>
              )}
              {booking.completedAt && (
                <div>
                  <p className="text-caption text-surface-500">{booking.fulfilmentType === 'DELIVERY' ? 'Delivered' : 'Picked up'}</p>
                  <p className="text-body text-surface-900">{formatDate(booking.completedAt)}</p>
                </div>
              )}
              {booking.deliveryAddress && (
                <div className="col-span-2">
                  <p className="text-caption text-surface-500">Delivery address</p>
                  <p className="text-body text-surface-900">{booking.deliveryAddress}</p>
                </div>
              )}
            </div>
          </Card>
        )}

        <Card className="p-4 bg-surface-50">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="text-overline text-surface-600">Batch</p>
              <p className="mt-2 text-body-medium font-semibold text-surface-900">{booking.batch?.name || '—'}</p>
              <p className="mt-1 text-body text-surface-600">{booking.batch?.eggTypeLabel || 'Regular Size Eggs'}</p>
              <p className="mt-1 text-caption text-surface-500">
                Expected {formatDate(booking.batch?.expectedDate)}{booking.batchEggCode?.code ? ` · ${booking.batchEggCode.code}` : ''}
              </p>
            </div>
            <div>
              <p className="text-overline text-surface-600">Payment truth</p>
              <p className="mt-2 text-body-medium font-semibold text-surface-900">{paymentMeta.label}</p>
              <p className="mt-1 text-caption text-surface-500">{booking.portalCheckout?.reference || booking.id}</p>
              {booking.portalCheckout?.paymentMethod ? (
                <p className="mt-1 text-caption text-surface-500">Paid by {booking.portalCheckout.paymentMethod === 'CARD' ? 'Card' : 'Transfer'}</p>
              ) : null}
            </div>
          </div>
        </Card>

        {lifecycle.length > 0 && (
          <Card className="p-4">
            <p className="text-overline text-surface-600 mb-3">Lifecycle</p>
            <div className="space-y-3">
              {lifecycle.map((event) => {
                const dotColor = event.tone === 'success' ? 'bg-success-500' : event.tone === 'warning' ? 'bg-warning-500' : 'bg-surface-300';
                return (
                  <div key={`${event.label}-${event.value}`} className="flex items-start gap-3 border-b border-surface-100 pb-3 last:border-b-0 last:pb-0">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
                    <div>
                      <p className="text-body-medium font-semibold text-surface-900">{event.label}</p>
                      <p className="text-caption text-surface-500 mt-1">{event.value}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {booking.allocations?.length > 0 && (
          <Card className="p-4">
            <p className="text-overline text-surface-600 mb-3">Payments applied</p>
            <div className="space-y-3">
              {booking.allocations.map((allocation) => (
                <div key={allocation.id} className="flex flex-col gap-2 border-b border-surface-100 pb-3 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-body-medium font-semibold text-surface-900">
                      {allocation.bankTransaction?.description || allocation.bankTransaction?.reference || 'Customer deposit'}
                    </p>
                    <p className="text-caption text-surface-500 mt-1">
                      {formatDate(allocation.bankTransaction?.transactionDate)} · {allocation.bankTransaction?.bankAccount?.name || 'Account'}
                    </p>
                  </div>
                  <p className="text-body-medium font-semibold text-surface-900">{formatCurrency(allocation.amount)}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {booking.sale && (
          <Card className="p-4 bg-success-50 border border-success-200">
            <p className="text-overline text-success-800">Fulfilment result</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <MetricCard label="Receipt" value={booking.sale.receiptNumber || '—'} />
              <MetricCard label="Picked up on" value={formatDate(booking.sale.saleDate)} />
              <MetricCard label="Sale total" value={formatCurrency(booking.sale.totalAmount)} />
              <MetricCard label="Payment method" value={booking.sale.paymentMethod ? booking.sale.paymentMethod.replace('_', ' ') : '—'} />
            </div>
          </Card>
        )}

        {booking.notes && (
          <Card className="p-4 bg-surface-50">
            <p className="text-overline text-surface-600">Notes</p>
            <p className="mt-2 text-body text-surface-700 whitespace-pre-wrap">{booking.notes}</p>
          </Card>
        )}

        <div className="flex justify-end gap-3">
          {onManagePayments && (
            <Button variant="secondary" size="md" onClick={onManagePayments}>
              Manage payments
            </Button>
          )}
          <Button variant="primary" size="md" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function MetricCard({ label, value, tone = 'default' }) {
  return (
    <div className="rounded-lg border border-surface-200 bg-white p-3">
      <p className="text-overline text-surface-500">{label}</p>
      <p className={`mt-2 text-body-medium font-semibold ${tone === 'warning' ? 'text-warning-700' : tone === 'success' ? 'text-success-700' : 'text-surface-900'}`}>{value}</p>
    </div>
  );
}

function ManageBookingPaymentsModal({ booking, onClose, onSaved }) {
  const [funds, setFunds] = useState([]);
  const [allocationDrafts, setAllocationDrafts] = useState({});
  const [loadingFunds, setLoadingFunds] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoadingFunds(true);
    setError('');
    api
      .get(`/bookings/customer-funds/${booking.customerId}?excludeBookingId=${encodeURIComponent(booking.id)}`)
      .then((data) => {
        if (cancelled) return;
        const payments = data.payments || [];
        setFunds(payments);
        const currentAllocations = (booking.allocations || []).reduce((acc, allocation) => {
          if (allocation.bankTransaction?.id) {
            acc[allocation.bankTransaction.id] = Number(allocation.amount).toFixed(2);
          }
          return acc;
        }, {});
        setAllocationDrafts(currentAllocations);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.error || 'Failed to load booking payments');
      })
      .finally(() => {
        if (!cancelled) setLoadingFunds(false);
      });

    return () => {
      cancelled = true;
    };
  }, [booking.customerId, booking.id, booking.allocations]);

  const paymentRows = useMemo(() => {
    const currentAllocationRows = (booking.allocations || [])
      .filter((allocation) => allocation.bankTransaction?.id)
      .map((allocation) => ({
        ...allocation.bankTransaction,
        availableAmount: Number(funds.find((payment) => payment.id === allocation.bankTransaction?.id)?.availableAmount || 0)
          + Number(allocation.amount),
        allocatedAmount: Number(allocation.amount),
        currentAllocation: Number(allocation.amount),
        isExistingAllocation: true,
      }));

    const existingIds = new Set(currentAllocationRows.map((row) => row.id));
    const newRows = funds.filter((payment) => !existingIds.has(payment.id));

    return [...currentAllocationRows, ...newRows];
  }, [booking.allocations, funds]);

  const totalAllocated = Object.values(allocationDrafts).reduce((sum, value) => sum + Number(value || 0), 0);
  const remaining = Math.max(0, Number(booking.orderValue) - totalAllocated);
  const minimumPayment = Number(booking.minimumPayment || 0);
  const minimumSuggestion = useMemo(
    () => buildBestAllocationSuggestion(paymentRows, minimumPayment),
    [paymentRows, minimumPayment],
  );
  const fullBookingSuggestion = useMemo(
    () => buildBestAllocationSuggestion(paymentRows, Number(booking.orderValue)),
    [paymentRows, booking.orderValue],
  );

  function updateAllocation(paymentId, value) {
    setAllocationDrafts((current) => ({
      ...current,
      [paymentId]: value,
    }));
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.patch(`/bookings/${booking.id}`, {
        paymentAllocations: Object.entries(allocationDrafts)
          .map(([bankTransactionId, amount]) => ({
            bankTransactionId,
            amount: Number(amount),
          }))
          .filter((allocation) => allocation.amount > 0),
      });
      onSaved();
    } catch (err) {
      setError(err.error || 'Failed to update booking payments');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Manage booking payments" open={true} onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        {error ? (
          <Card variant="error" className="p-4">
            <p className="text-body text-error-900">{error}</p>
          </Card>
        ) : null}

        <Card className="bg-surface-50 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <BookingStat label="Customer" value={booking.customer?.name || '—'} />
            <BookingStat label="Batch" value={booking.batch?.name || '—'} />
            <BookingStat label="Booking value" value={formatCurrency(booking.orderValue)} />
            <BookingStat label="Minimum payment" value={formatCurrency(minimumPayment)} />
          </div>
        </Card>

        {(minimumSuggestion || fullBookingSuggestion) && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <SuggestionCard
              title="Suggested for minimum"
              suggestion={minimumSuggestion}
              targetAmount={minimumPayment}
              onApply={() => applyAllocationSuggestionToDrafts(paymentRows, minimumSuggestion, minimumPayment, setAllocationDrafts)}
            />
            <SuggestionCard
              title="Suggested for full booking"
              suggestion={fullBookingSuggestion}
              targetAmount={Number(booking.orderValue)}
              onApply={() => applyAllocationSuggestionToDrafts(paymentRows, fullBookingSuggestion, Number(booking.orderValue), setAllocationDrafts)}
            />
          </div>
        )}

        {loadingFunds ? (
          <p className="text-body text-surface-500">Loading available deposits…</p>
        ) : paymentRows.length === 0 ? (
          <Card variant="warning" className="p-4">
            <p className="text-body text-warning-900">
              No customer deposits are available to link right now.
            </p>
          </Card>
        ) : (
          <Card className="overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  <th className="px-4 py-3 text-left text-overline text-surface-600">Date</th>
                  <th className="px-4 py-3 text-left text-overline text-surface-600">Deposit</th>
                  <th className="px-4 py-3 text-right text-overline text-surface-600">Available</th>
                  <th className="px-4 py-3 text-right text-overline text-surface-600">Use for booking</th>
                </tr>
              </thead>
              <tbody>
                {paymentRows.map((payment) => (
                  <tr key={payment.id} className="border-b border-surface-100 hover:bg-surface-50 transition-colors duration-fast">
                    <td className="px-4 py-3 text-body text-surface-600">{formatDate(payment.transactionDate)}</td>
                    <td className="px-4 py-3 text-body text-surface-700">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{payment.description || payment.reference || 'Customer deposit'}</span>
                        {payment.isExistingAllocation ? <Badge color="brand" size="sm">Already linked</Badge> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-body font-medium text-surface-900">
                      {formatCurrency(payment.availableAmount)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={allocationDrafts[payment.id] || ''}
                          onChange={(event) => updateAllocation(payment.id, event.target.value)}
                          className="text-right"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => updateAllocation(payment.id, Number(payment.availableAmount).toFixed(2))}
                        >
                          Use all
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        <Card className="bg-surface-50 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <BookingStat label="Allocated now" value={formatCurrency(totalAllocated)} />
            <BookingStat label="Still to pay" value={formatCurrency(remaining)} tone={remaining > 0 ? 'warning' : 'success'} />
            <BookingStat label="Minimum met?" value={totalAllocated >= minimumPayment ? 'Yes' : 'No'} tone={totalAllocated >= minimumPayment ? 'success' : 'warning'} />
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={saving}>
            {saving ? 'Saving…' : 'Save payment links'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-2 block text-body font-medium text-surface-700">{label}</label>
      {children}
    </div>
  );
}

function BookingStat({ label, value, tone = 'default' }) {
  const toneMap = {
    default: 'text-surface-900',
    success: 'text-success-700',
    warning: 'text-warning-600',
  };
  return (
    <div>
      <p className="text-overline text-surface-600">{label}</p>
      <p className={`mt-2 text-metric font-semibold ${toneMap[tone] || toneMap.default}`}>{value}</p>
    </div>
  );
}

function SelectedCustomerCard({ customer, policy, onChange }) {
  const orderLimitProfile = customer?.orderLimitProfile;
  return (
    <Card className="bg-surface-50 p-4 flex items-center gap-3">
      <div>
        <p className="text-overline text-surface-600">Customer</p>
        <p className="text-body font-semibold text-surface-900">{customer?.name}</p>
        <p className="text-caption text-surface-500">{customer?.phone}</p>
      </div>
      {orderLimitProfile?.isUsingEarlyOrderLimit && (
        <Badge variant="warning" size="sm">
          First {Number(orderLimitProfile.earlyOrderLimitCount || policy?.firstCustomerOrderLimitCount || 3)} orders: max {Number(orderLimitProfile.currentPerOrderLimit || policy?.firstTimeBookingLimitCrates || 20)} crates
        </Badge>
      )}
      <button onClick={onChange} type="button" className="ml-auto text-body font-medium text-surface-500 hover:text-surface-700 transition-colors duration-fast">
        Change
      </button>
    </Card>
  );
}

function InlineNewCustomerForm({ onCancel, onCreated }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await onCreated({
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
      });
    } catch (err) {
      setError(err.error || 'Failed to create customer');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-heading font-semibold text-surface-900">New customer</h3>
      <p className="text-body text-surface-500">Create the customer first. After that, record their payment in Banking before making the booking.</p>
      {error && (
        <Card variant="error" className="p-4">
          <p className="text-body text-error-900">{error}</p>
        </Card>
      )}

      <Field label="Customer name">
        <Input
          type="text"
          required
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          autoFocus
        />
      </Field>

      <Field label="Phone number">
        <Input
          type="tel"
          required
          value={form.phone}
          onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
        />
      </Field>

      <Field label="Email (optional)">
        <Input
          type="email"
          value={form.email}
          onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
        />
      </Field>

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={submitting}
        >
          {submitting ? 'Creating…' : 'Create customer'}
        </Button>
      </div>
    </form>
  );
}

function CancelBookingModal({ booking, onClose, onCancelled }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleCancel() {
    setSubmitting(true);
    setError('');
    try {
      await api.patch(`/bookings/${booking.id}/cancel`, {});
      onCancelled();
    } catch (err) {
      setError(err.error || 'Failed to cancel booking');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} title="Cancel booking" size="sm" footer={false}>
      <div className="space-y-4">
        {error && (
          <Card variant="error" className="p-4">
            <p className="text-body text-error-900">{error}</p>
          </Card>
        )}

        <Card className="bg-surface-50 p-4 space-y-2">
          <p>
            <span className="text-surface-500">Customer:</span>
            {' '}
            <span className="font-medium text-surface-900">{booking.customer?.name}</span>
          </p>
          <p>
            <span className="text-surface-500">Batch:</span>
            {' '}
            <span className="font-medium text-surface-900">{booking.batch?.name}</span>
          </p>
          <p>
            <span className="text-surface-500">Quantity:</span>
            {' '}
            <span className="font-medium text-surface-900">{booking.quantity} crates</span>
          </p>
          <p>
            <span className="text-surface-500">Paid:</span>
            {' '}
            <span className="font-medium text-surface-900">{formatCurrency(booking.amountPaid)}</span>
          </p>
        </Card>

        <p className="text-body text-surface-600">
          This will cancel the booking only. Any refund still needs to be recorded from Banking.
        </p>

        <div className="flex justify-end gap-3 pt-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
          >
            Keep booking
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleCancel}
            disabled={submitting}
          >
            {submitting ? 'Cancelling…' : 'Cancel booking'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
