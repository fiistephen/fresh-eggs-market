import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

const BOOKING_STATUS_COLORS = {
  CONFIRMED: 'bg-green-100 text-green-700',
  PICKED_UP: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-red-100 text-red-700',
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

export default function Bookings() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showCancel, setShowCancel] = useState(null);
  const [error, setError] = useState('');

  const canCreate = ['ADMIN', 'MANAGER'].includes(user?.role);
  const canCancel = ['ADMIN', 'MANAGER'].includes(user?.role);

  useEffect(() => {
    loadBookings();
  }, [filter]);

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
          <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            Book from money already received. Choose the customer, choose the batch, then apply the customer&apos;s available payments.
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="w-fit rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            New booking
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <h2 className="text-sm font-semibold text-blue-900">Booking rule</h2>
        <p className="mt-1 text-sm text-blue-900">
          Do not type payment manually here. First record the customer&apos;s payment in Banking. Then come here and apply that money to the booking.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Bookings in view" value={summary.count} />
        <SummaryCard label="Confirmed bookings" value={summary.confirmedCount} />
        <SummaryCard label="Booked crates" value={summary.bookedCrates} />
        <SummaryCard label="Money applied" value={formatCurrency(summary.amountApplied)} />
      </div>

      <div className="overflow-x-auto">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
          {[
            { value: '', label: 'All' },
            { value: 'CONFIRMED', label: 'Confirmed' },
            { value: 'PICKED_UP', label: 'Picked up' },
            { value: 'CANCELLED', label: 'Cancelled' },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`whitespace-nowrap rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                filter === tab.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white px-6 py-24 text-center text-sm text-gray-500">Loading bookings…</div>
      ) : bookings.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white px-6 py-24">
          <EmptyState
            title={filter ? 'No bookings in this group' : 'No bookings yet'}
            body={filter ? 'Try another filter.' : 'When a customer has paid in Banking, you can create a booking from that money here.'}
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white overflow-x-auto">
          <table className="w-full min-w-[1040px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Batch</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Qty</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Booking value</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Applied</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Balance</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Payments used</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Date</th>
                {canCancel && <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Action</th>}
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id} className="border-b border-gray-50 align-top hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">{booking.customer?.name || '—'}</div>
                    {booking.customer?.phone && <div className="text-xs text-gray-400">{booking.customer.phone}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-700">{booking.batch?.name || '—'}</div>
                    {booking.batchEggCode?.code && <div className="text-xs text-gray-400">{booking.batchEggCode.code}</div>}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">{booking.quantity.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-600">{formatCurrency(booking.orderValue)}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">{formatCurrency(booking.amountPaid)}</td>
                  <td className={`px-4 py-3 text-right text-sm font-medium ${booking.balance > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                    {formatCurrency(booking.balance)}
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-gray-500">{booking.allocations?.length || 0}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${BOOKING_STATUS_COLORS[booking.status]}`}>
                      {booking.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(booking.createdAt)}</td>
                  {canCancel && (
                    <td className="px-4 py-3 text-center">
                      {booking.status === 'CONFIRMED' && (
                        <button
                          onClick={() => setShowCancel(booking)}
                          className="text-xs font-medium text-red-500 hover:text-red-700"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateBookingModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadBookings();
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
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function CreateBookingModal({ onClose, onCreated }) {
  const [step, setStep] = useState(1);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
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
    maxBookingCratesPerOrder: 100,
  });
  const [allocationDrafts, setAllocationDrafts] = useState({});

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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
      setFunds(data.payments || []);
      setAllocationDrafts({});
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
  const maxQty = selectedCustomer?.isFirstTime
    ? Number(bookingPolicy.firstTimeBookingLimitCrates || 20)
    : Number(bookingPolicy.maxBookingCratesPerOrder || 100);
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
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">New booking</h2>
              <p className="mt-1 text-sm text-gray-500">Choose customer, choose batch, then apply money already received.</p>
            </div>
            <button onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700">Close</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <StepPill active={step === 1} complete={step > 1} label="1. Customer" />
            <StepPill active={step === 2} complete={step > 2} label="2. Batch" />
            <StepPill active={step === 3} complete={false} label="3. Apply payments" />
          </div>
        </div>

        <div className="p-6">
          {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          {step === 1 && !showNewCustomer && (
            <div className="space-y-4">
              <Field label="Find customer">
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  placeholder="Type customer name or phone"
                  autoFocus
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                />
              </Field>

              {searchingCustomers && <p className="text-sm text-gray-500">Searching…</p>}

              {customers.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-gray-200">
                  {customers.map((customer) => (
                    <button
                      key={customer.id}
                      onClick={() => {
                        setSelectedCustomer(customer);
                        setStep(2);
                      }}
                      className="block w-full border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-50 last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{customer.name}</span>
                        <span className="text-sm text-gray-400">{customer.phone}</span>
                        {customer.isFirstTime && (
                          <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-700">New customer</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {customerSearch && !searchingCustomers && customers.length === 0 && (
                <p className="text-sm text-gray-500">No customer found.</p>
              )}

              <button
                onClick={() => setShowNewCustomer(true)}
                className="text-sm font-medium text-brand-600 hover:text-brand-700"
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
                <h3 className="text-sm font-semibold text-gray-900">Choose batch</h3>
                <p className="mt-1 text-sm text-gray-500">Pick an open batch with enough space for this customer.</p>
              </div>

              {loadingBatches ? (
                <p className="text-sm text-gray-500">Loading open batches…</p>
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
                      className={`block w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                        selectedBatch?.id === batch.id
                          ? 'border-brand-300 bg-brand-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-semibold text-gray-900">{batch.name}</p>
                          <p className="mt-1 text-sm text-gray-500">Expected {formatDate(batch.expectedDate)}</p>
                          <p className="mt-1 text-sm font-medium text-gray-700">
                            {batch.eggTypeLabel || 'Regular Size Eggs'}
                          </p>
                          <p className="mt-1 text-xs text-gray-400">
                            FE sources: {(batch.eggCodes || []).map((eggCode) => eggCode.code).join(', ') || '—'}
                          </p>
                        </div>
                        <div className="text-right text-sm">
                          <p className="font-medium text-gray-900">{formatCurrency(batch.wholesalePrice)} / crate</p>
                          <p className="text-green-600">{batch.remainingAvailable} crates free</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {selectedBatch && (
                <>
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                    The customer is booking {selectedBatch.eggTypeLabel || 'this egg type'} at one batch price. FE codes stay in the background for internal cost tracking.
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label={`Quantity (max ${effectiveMax})`}>
                      <input
                        type="number"
                        min="1"
                        max={effectiveMax}
                        value={quantity}
                        onChange={(event) => setQuantity(event.target.value)}
                        placeholder="How many crates?"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </Field>
                    <Field label="Notes">
                      <input
                        type="text"
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        placeholder="Optional note"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </Field>
                  </div>

                  {quantity && Number(quantity) > 0 && (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <BookingStat label="Booking value" value={formatCurrency(orderValue)} />
                        <BookingStat label="Minimum to book" value={formatCurrency(minimumPayment)} />
                        <BookingStat label="Remaining after minimum" value={formatCurrency(Math.max(0, orderValue - minimumPayment))} />
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="flex justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setSelectedBatch(null);
                    setQuantity('');
                  }}
                  className="text-sm font-medium text-gray-600 hover:text-gray-800"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  disabled={!canContinueToFunds}
                  className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <SelectedCustomerCard customer={selectedCustomer} policy={bookingPolicy} onChange={() => setStep(1)} />

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <BookingStat label="Batch" value={selectedBatch?.name || '—'} />
                  <BookingStat label="Quantity" value={`${quantity || 0} crates`} />
                  <BookingStat label="Booking value" value={formatCurrency(orderValue)} />
                  <BookingStat label="Minimum to book" value={formatCurrency(minimumPayment)} />
                </div>
              </div>

              <div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Apply customer payments</h3>
                    <p className="mt-1 text-sm text-gray-500">Choose how much of the customer&apos;s available money should fund this booking.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => fillToTarget(minimumPayment)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                      Fill minimum
                    </button>
                    <button type="button" onClick={() => fillToTarget(orderValue)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                      Fill full booking
                    </button>
                  </div>
                </div>
              </div>

              {loadingFunds ? (
                <p className="text-sm text-gray-500">Loading customer payments…</p>
              ) : funds.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  No available customer payments found. First record the customer&apos;s payment in Banking, then come back here to create the booking.
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-gray-200">
                  <table className="w-full min-w-[760px]">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Source</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Account</th>
                        <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Available</th>
                        <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Use for this booking</th>
                      </tr>
                    </thead>
                    <tbody>
                      {funds.map((payment) => (
                        <tr key={payment.id} className="border-b border-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-600">{formatDate(payment.transactionDate)}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{payment.description || payment.reference || 'Payment received'}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{payment.bankAccount?.name || '—'}</td>
                          <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">{formatCurrency(payment.availableAmount)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                max={payment.availableAmount}
                                step="0.01"
                                value={allocationDrafts[payment.id] || ''}
                                onChange={(event) => updateAllocation(payment.id, event.target.value)}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-right text-sm outline-none focus:ring-2 focus:ring-brand-500"
                              />
                              <button
                                type="button"
                                onClick={() => updateAllocation(payment.id, payment.availableAmount.toFixed(2))}
                                className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                              >
                                Use all
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <BookingStat label="Applied now" value={formatCurrency(totalAllocated)} />
                  <BookingStat label="Still to pay" value={formatCurrency(balance)} tone={balance > 0 ? 'orange' : 'green'} />
                  <BookingStat label="Minimum met?" value={totalAllocated >= minimumPayment ? 'Yes' : 'No'} tone={totalAllocated >= minimumPayment ? 'green' : 'orange'} />
                </div>
              </div>

              <div className="flex justify-between gap-3 pt-2">
                <button type="button" onClick={() => setStep(2)} className="text-sm font-medium text-gray-600 hover:text-gray-800">
                  Back
                </button>
                <div className="flex gap-3">
                  <button type="button" onClick={onClose} className="text-sm font-medium text-gray-600 hover:text-gray-800">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="rounded-lg bg-brand-500 px-6 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    {submitting ? 'Creating…' : 'Create booking'}
                  </button>
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
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${
      active || complete ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'
    }`}>
      {label}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}

function BookingStat({ label, value, tone = 'gray' }) {
  const colors = {
    gray: 'text-gray-900',
    green: 'text-green-700',
    orange: 'text-orange-600',
  };
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${colors[tone] || colors.gray}`}>{value}</p>
    </div>
  );
}

function SelectedCustomerCard({ customer, policy, onChange }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Customer</p>
        <p className="text-sm font-semibold text-gray-900">{customer?.name}</p>
        <p className="text-xs text-gray-500">{customer?.phone}</p>
      </div>
      {customer?.isFirstTime && (
        <span className="rounded bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700">New customer: max {Number(policy?.firstTimeBookingLimitCrates || 20)} crates</span>
      )}
      <button onClick={onChange} type="button" className="ml-auto text-sm font-medium text-gray-500 hover:text-gray-700">
        Change
      </button>
    </div>
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
      <h3 className="text-sm font-semibold text-gray-900">New customer</h3>
      <p className="text-sm text-gray-500">Create the customer first. After that, record their payment in Banking before making the booking.</p>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <Field label="Customer name">
        <input
          type="text"
          required
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
          autoFocus
        />
      </Field>

      <Field label="Phone number">
        <input
          type="tel"
          required
          value={form.phone}
          onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
        />
      </Field>

      <Field label="Email (optional)">
        <input
          type="email"
          value={form.email}
          onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
        />
      </Field>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="text-sm font-medium text-gray-600 hover:text-gray-800">Cancel</button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {submitting ? 'Creating…' : 'Create customer'}
        </button>
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
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-red-600">Cancel booking</h2>
        </div>
        <div className="space-y-4 p-6">
          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
            <p><span className="text-gray-500">Customer:</span> <span className="font-medium text-gray-900">{booking.customer?.name}</span></p>
            <p><span className="text-gray-500">Batch:</span> <span className="font-medium text-gray-900">{booking.batch?.name}</span></p>
            <p><span className="text-gray-500">Quantity:</span> <span className="font-medium text-gray-900">{booking.quantity} crates</span></p>
            <p><span className="text-gray-500">Applied:</span> <span className="font-medium text-gray-900">{formatCurrency(booking.amountPaid)}</span></p>
          </div>

          <p className="text-sm text-gray-600">
            This will cancel the booking only. Any refund still needs to be recorded from Banking.
          </p>

          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="text-sm font-medium text-gray-600 hover:text-gray-800">Keep booking</button>
            <button
              onClick={handleCancel}
              disabled={submitting}
              className="rounded-lg bg-red-600 px-5 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {submitting ? 'Cancelling…' : 'Cancel booking'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, body, compact = false }) {
  return (
    <div className={`text-center ${compact ? 'py-6' : 'py-12'}`}>
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-xl">📋</div>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">{body}</p>
    </div>
  );
}
