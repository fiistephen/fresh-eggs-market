import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Button, Input, Select, Modal, Card, Badge, EmptyState, useToast } from '../components/ui';

const BOOKING_STATUS_BADGES = {
  CONFIRMED: 'success',
  PICKED_UP: 'info',
  CANCELLED: 'error',
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

function hangingAgeLabel(ageInDays) {
  if (ageInDays >= 90) return '90+ days hanging';
  if (ageInDays >= 30) return '30+ days hanging';
  if (ageInDays >= 8) return '8-30 days hanging';
  if (ageInDays >= 1) return '1-7 days hanging';
  return 'Today';
}

export default function Bookings() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [hangingDeposits, setHangingDeposits] = useState([]);
  const [hangingDepositsLoading, setHangingDepositsLoading] = useState(true);
  const [hangingDepositsError, setHangingDepositsError] = useState('');
  const [portalTransferBookings, setPortalTransferBookings] = useState([]);
  const [portalCardBookings, setPortalCardBookings] = useState([]);
  const [portalQueueLoading, setPortalQueueLoading] = useState(true);
  const [portalQueueError, setPortalQueueError] = useState('');
  const [workingPortalCheckoutId, setWorkingPortalCheckoutId] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showCreate, setShowCreate] = useState(null);
  const [managePaymentsBooking, setManagePaymentsBooking] = useState(null);
  const [showCancel, setShowCancel] = useState(null);
  const [error, setError] = useState('');

  const canCreate = ['ADMIN', 'MANAGER'].includes(user?.role);
  const canCancel = ['ADMIN', 'MANAGER'].includes(user?.role);

  useEffect(() => {
    loadBookings();
  }, [filter]);

  useEffect(() => {
    loadPortalBookingQueue();
  }, []);

  useEffect(() => {
    loadHangingDeposits();
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
      const params = filter ? `?status=${filter}` : '';
      const data = await api.get(`/bookings${params}`);
      setBookings(data.bookings || []);
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
    } catch {
      setPortalQueueError('Failed to load portal booking confirmations');
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

  async function confirmPortalTransfer(checkoutId) {
    setWorkingPortalCheckoutId(checkoutId);
    setPortalQueueError('');
    try {
      await api.post(`/portal/admin/booking-checkouts/${checkoutId}/admin-confirm`, {});
      await loadPortalBookingQueue();
    } catch (err) {
      setPortalQueueError(err.error || 'Failed to confirm this portal booking transfer');
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

  const summary = useMemo(() => {
    const confirmed = bookings.filter((booking) => booking.status === 'CONFIRMED');
    return {
      count: bookings.length,
      confirmedCount: confirmed.length,
      bookedCrates: confirmed.reduce((sum, booking) => sum + booking.quantity, 0),
      amountApplied: confirmed.reduce((sum, booking) => sum + Number(booking.amountPaid || 0), 0),
    };
  }, [bookings]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-display">Bookings</h1>
          <p className="mt-2 max-w-3xl text-body text-surface-600">
            Book from money already received. Choose the customer, choose the batch, then apply the customer&apos;s available payments.
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

      <Card variant="info" className="p-4">
        <h2 className="text-overline uppercase text-info-900">Booking rule</h2>
        <p className="mt-2 text-body text-info-900">
          Do not decide bookings during Banking entry. First record customer money in Banking as a customer deposit. Then come here to match that hanging deposit to a portal booking or create a manual booking.
        </p>
      </Card>

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

      <PortalBookingReviewSection
        loading={portalQueueLoading}
        error={portalQueueError}
        transferQueue={portalTransferBookings}
        recentCardBookings={portalCardBookings}
        workingId={workingPortalCheckoutId}
        onConfirm={confirmPortalTransfer}
        onReject={rejectPortalTransfer}
        onRefresh={loadPortalBookingQueue}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Bookings in view" value={summary.count} />
        <SummaryCard label="Confirmed bookings" value={summary.confirmedCount} />
        <SummaryCard label="Booked crates" value={summary.bookedCrates} />
        <SummaryCard label="Money applied" value={formatCurrency(summary.amountApplied)} />
      </div>

      <div className="overflow-x-auto custom-scrollbar">
        <div className="flex gap-1 rounded-md bg-surface-100 p-1 w-fit">
          {[
            { value: '', label: 'All' },
            { value: 'CONFIRMED', label: 'Confirmed' },
            { value: 'PICKED_UP', label: 'Picked up' },
            { value: 'CANCELLED', label: 'Cancelled' },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
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

      {error && (
        <Card variant="error" className="p-4">
          <p className="text-body text-error-900">{error}</p>
        </Card>
      )}

      {loading ? (
        <Card className="px-6 py-24 text-center">
          <p className="text-body text-surface-500">Loading bookings…</p>
        </Card>
      ) : bookings.length === 0 ? (
        <Card className="px-6 py-24">
          <EmptyState
            title={filter ? 'No bookings in this group' : 'No bookings yet'}
            body={filter ? 'Try another filter.' : 'When a customer has paid in Banking, you can create a booking from that money here.'}
          />
        </Card>
      ) : (
        <Card className="overflow-x-auto custom-scrollbar">
          <table className="w-full min-w-[1040px]">
            <thead>
              <tr className="border-b border-surface-200">
                <th className="px-4 py-3 text-left text-overline text-surface-600">Customer</th>
                <th className="px-4 py-3 text-left text-overline text-surface-600">Source</th>
                <th className="px-4 py-3 text-left text-overline text-surface-600">Batch</th>
                <th className="px-4 py-3 text-right text-overline text-surface-600">Qty</th>
                <th className="px-4 py-3 text-right text-overline text-surface-600">Booking value</th>
                <th className="px-4 py-3 text-right text-overline text-surface-600">Applied</th>
                <th className="px-4 py-3 text-right text-overline text-surface-600">Balance</th>
                <th className="px-4 py-3 text-center text-overline text-surface-600">Payments used</th>
                <th className="px-4 py-3 text-center text-overline text-surface-600">Status</th>
                <th className="px-4 py-3 text-left text-overline text-surface-600">Date</th>
                {(canCreate || canCancel) && <th className="px-4 py-3 text-center text-overline text-surface-600">Action</th>}
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
                    <Badge color={bookingSourceMeta(booking).tone}>
                      {bookingSourceMeta(booking).label}
                    </Badge>
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
                  <td className="px-4 py-3 text-center text-body text-surface-500">{booking.allocations?.length || 0}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge color={BOOKING_STATUS_BADGES[booking.status] || 'neutral'}>
                      {booking.status.replace('_', ' ')}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-body text-surface-500">{formatDate(booking.createdAt)}</td>
                  {(canCreate || canCancel) && (
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-2">
                        {canCreate && booking.status === 'CONFIRMED' && booking.portalCheckout?.paymentMethod !== 'CARD' && (
                          <button
                            onClick={() => setManagePaymentsBooking(booking)}
                            className="text-caption font-medium text-brand-700 hover:text-brand-800 transition-colors duration-fast"
                          >
                            Manage payments
                          </button>
                        )}
                        {canCancel && booking.status === 'CONFIRMED' && (
                          <button
                            onClick={() => setShowCancel(booking)}
                            className="text-caption font-medium text-error-500 hover:text-error-700 transition-colors duration-fast"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
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
    </div>
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
    return (
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-heading font-semibold text-surface-900">Customer deposits hanging</h2>
            <p className="mt-2 text-body text-surface-500">Any customer money recorded in Banking but not yet matched to a booking will show up here.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={onRefresh}>
            Refresh
          </Button>
        </div>
        <div className="mt-6">
          <EmptyState
            title="No customer deposits hanging"
            body="Customer deposits that still need booking action will show here."
            compact
          />
        </div>
      </Card>
    );
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
  workingId,
  onConfirm,
  onReject,
  onRefresh,
}) {
  if (loading) {
    return (
      <Card className="p-4">
        <p className="text-body text-surface-500">Loading portal booking payments…</p>
      </Card>
    );
  }

  if ((!transferQueue || transferQueue.length === 0) && (!recentCardBookings || recentCardBookings.length === 0)) {
    return null;
  }

  return (
    <div className="space-y-4">
      <Card variant="warning" className="p-4">
        <h2 className="text-overline uppercase text-warning-900">Portal booking payments</h2>
        <p className="mt-2 text-body text-warning-900">
          Transfer bookings have two checkpoints: first a staff admin confirmation when the money is seen, then a full confirmation when the matching bank statement line is linked in Banking. The statement is the final source of financial truth.
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
            <h3 className="text-heading font-semibold text-surface-900">Portal transfer bookings waiting for action</h3>
            <p className="mt-2 text-body text-surface-500">Use this to mark “money seen” first. The final financial confirmation still happens when the statement line is linked in Banking.</p>
            </div>
            <Button variant="secondary" size="sm" onClick={onRefresh}>
              Refresh
            </Button>
          </div>

          {transferQueue.map((checkout) => {
            const isAdminConfirmed = checkout.status === 'ADMIN_CONFIRMED';
            return (
              <div key={checkout.id} className="rounded-lg border border-surface-200 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-body-medium font-semibold text-surface-900">{checkout.customer?.name || 'Customer'}</p>
                      <Badge color={isAdminConfirmed ? 'warning' : 'neutral'}>
                        {isAdminConfirmed ? 'Admin confirmed, waiting for statement' : 'Waiting for admin confirmation'}
                      </Badge>
                    </div>
                    <p className="text-body text-surface-500">
                      {checkout.batch?.name} · {checkout.batch?.eggTypeLabel || 'Regular Size Eggs'} · {checkout.quantity} crates
                    </p>
                    <p className="text-caption text-surface-500">
                      Ref {checkout.reference} · Created {formatDate(checkout.createdAt)}
                      {checkout.adminConfirmedAt ? ` · Admin confirmed ${formatDate(checkout.adminConfirmedAt)}` : ''}
                    </p>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-body-medium font-semibold text-surface-900">{formatCurrency(checkout.amountToPay)}</p>
                    <p className="text-caption text-surface-500">Booking payment now</p>
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
            <h3 className="text-heading font-semibold text-surface-900">Recent portal card bookings</h3>
            <p className="mt-2 text-body text-surface-500">These are portal bookings that already passed card verification and were created immediately.</p>
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
    if (step === 2) {
      loadOpenBatches();
    }
  }, [step]);

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

              {loadingFunds ? (
                <p className="text-body text-surface-500">Loading customer payments…</p>
              ) : funds.length === 0 ? (
                <Card variant="warning" className="p-4">
                  <p className="text-body text-warning-900">
                    No available customer payments found. First record the customer&apos;s payment in Banking, then come back here to create the booking.
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
        availableAmount: Number(
          funds.find((payment) => payment.id === allocation.bankTransaction?.id)?.availableAmount ?? allocation.amount
        ),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-md rounded-xl shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="border-b border-surface-200 px-6 py-4">
          <h2 className="text-title font-semibold text-error-600">Cancel booking</h2>
        </div>
        <div className="space-y-4 p-6">
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
              <span className="text-surface-500">Applied:</span>
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
      </Card>
    </div>
  );
}
