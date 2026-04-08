import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';

const fmt = (n) => Number(n || 0).toLocaleString('en-NG');
const fmtMoney = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 0 });
const fmtDate = (d) => new Date(d).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

function SectionCard({ title, body, action, active, onClick, accent = 'green' }) {
  const activeClasses = active
    ? 'border-green-300 bg-green-50 shadow-sm'
    : 'border-gray-200 bg-white hover:border-green-200 hover:shadow-sm';
  const actionClasses = accent === 'amber'
    ? 'bg-amber-600 hover:bg-amber-700'
    : 'bg-green-600 hover:bg-green-700';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-5 text-left transition ${activeClasses}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-gray-600">{body}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold text-white ${actionClasses}`}>
          {action}
        </span>
      </div>
    </button>
  );
}

function EmptyState({ title, body }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      <p className="mt-2 text-sm text-gray-500">{body}</p>
    </div>
  );
}

function Field({ label, children, help }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
      {help && <span className="mt-1 block text-xs text-gray-500">{help}</span>}
    </label>
  );
}

function AuthPanel({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', phone: '', identifier: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = mode === 'register'
        ? await api.post('/portal/register', form)
        : await api.post('/auth/login', { identifier: form.identifier, password: form.password });
      api.setTokens(response.accessToken, response.refreshToken);
      localStorage.setItem('user', JSON.stringify(response.user));
      onAuth(response.user);
    } catch (err) {
      setError(err.error || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-6 grid grid-cols-2 rounded-2xl bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => { setMode('login'); setError(''); }}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${mode === 'login' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => { setMode('register'); setError(''); }}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${mode === 'register' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
        >
          Create account
        </button>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'register' && (
          <>
            <Field label="Full name">
              <input
                type="text"
                required
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="e.g. Adunni Okafor"
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </Field>
            <Field label="Phone number">
              <input
                type="tel"
                required
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                placeholder="e.g. 08012345678"
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </Field>
          </>
        )}

        {mode === 'register' ? (
          <Field label="Email (optional)">
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </Field>
        ) : (
          <Field label="Phone number or email">
            <input
              type="text"
              required
              value={form.identifier}
              onChange={(event) => setForm((current) => ({ ...current, identifier: event.target.value }))}
              placeholder="e.g. 08012345678 or you@example.com"
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </Field>
        )}

        <Field label="Password" help={mode === 'register' ? 'Use at least 8 characters.' : null}>
          <input
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </Field>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
        >
        {loading ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

function BatchCard({ batch, actionLabel, helperText, priceLabel, onAction, disabled }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-green-700">{batch.eggTypeLabel || 'Regular Size Eggs'}</p>
          <h3 className="mt-2 text-xl font-semibold text-gray-900">{batch.name}</h3>
          <p className="mt-1 text-sm text-gray-500">{helperText}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">{priceLabel}</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{fmtMoney(batch.wholesalePrice)}</p>
          <p className="text-xs text-gray-500">Wholesale</p>
          <p className="mt-1 text-sm font-semibold text-amber-700">{fmtMoney(batch.retailPrice)} retail</p>
        </div>
      </div>

      {'availableForSale' in batch ? (
        <div className="mt-4 grid grid-cols-3 gap-3 rounded-2xl bg-gray-50 p-3 text-sm">
          <Metric label="Ready now" value={`${fmt(batch.availableForSale)} crates`} />
          <Metric label="Still on hand" value={`${fmt(batch.onHand)} crates`} />
          <Metric label="Received" value={fmtDate(batch.receivedDate || batch.expectedDate)} />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-3 rounded-2xl bg-gray-50 p-3 text-sm">
          <Metric label="Available to book" value={`${fmt(batch.remainingAvailable)} crates`} />
          <Metric label="Already booked" value={`${fmt(batch.totalBooked)} crates`} />
          <Metric label="Expected date" value={fmtDate(batch.expectedDate)} />
        </div>
      )}

      <button
        type="button"
        onClick={() => onAction(batch)}
        disabled={disabled}
        className={`mt-4 w-full rounded-xl px-4 py-3 text-sm font-semibold transition ${
          disabled ? 'cursor-not-allowed bg-gray-100 text-gray-400' : 'bg-green-600 text-white hover:bg-green-700'
        }`}
      >
        {actionLabel}
      </button>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.14em] text-gray-500">{label}</p>
      <p className="mt-1 font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function BookingModal({ batch, profile, onClose, onBooked }) {
  const [quantity, setQuantity] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  const maxQty = Math.min(batch.remainingAvailable, 100, profile?.isFirstTime ? 20 : 100);
  const quantityValue = parseInt(quantity, 10) || 0;
  const orderValue = quantityValue * Number(batch.wholesalePrice);
  const minPayment = orderValue * 0.8;

  useEffect(() => {
    if (quantityValue > 0) {
      setAmountPaid(String(orderValue));
    }
  }, [quantityValue, orderValue]);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await api.post('/portal/book', {
        batchId: batch.id,
        quantity: quantityValue,
        amountPaid: parseFloat(amountPaid),
      });
      setSuccess(response);
    } catch (err) {
      setError(err.error || 'Booking failed.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <ModalShell title="Booking saved" onClose={onClose}>
        <div className="space-y-4">
          <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-4 text-sm text-green-800">
            {success.message}
          </div>
          <div className="rounded-2xl bg-gray-50 p-4 text-sm">
            <div className="flex items-center justify-between py-1"><span className="text-gray-500">Batch</span><span className="font-semibold text-gray-900">{success.booking.batch}</span></div>
            <div className="flex items-center justify-between py-1"><span className="text-gray-500">Egg type</span><span className="font-semibold text-gray-900">{success.booking.eggTypeLabel}</span></div>
            <div className="flex items-center justify-between py-1"><span className="text-gray-500">Quantity</span><span className="font-semibold text-gray-900">{success.booking.quantity} crates</span></div>
            <div className="flex items-center justify-between py-1"><span className="text-gray-500">Order value</span><span className="font-semibold text-gray-900">{fmtMoney(success.booking.orderValue)}</span></div>
            <div className="flex items-center justify-between py-1"><span className="text-gray-500">Amount already paid</span><span className="font-semibold text-green-700">{fmtMoney(success.booking.amountPaid)}</span></div>
          </div>
          <button
            type="button"
            onClick={() => { onBooked(); onClose(); }}
            className="w-full rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700"
          >
            Done
          </button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="Book upcoming batch" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Bookings are for upcoming batches. Enter how many crates you want and how much you have already paid into the company bank account.
        </div>

        <div className="rounded-2xl bg-gray-50 p-4 text-sm">
          <div className="flex items-center justify-between py-1"><span className="text-gray-500">Batch</span><span className="font-semibold text-gray-900">{batch.name}</span></div>
          <div className="flex items-center justify-between py-1"><span className="text-gray-500">Egg type</span><span className="font-semibold text-gray-900">{batch.eggTypeLabel}</span></div>
          <div className="flex items-center justify-between py-1"><span className="text-gray-500">Expected date</span><span className="font-semibold text-gray-900">{fmtDate(batch.expectedDate)}</span></div>
          <div className="flex items-center justify-between py-1"><span className="text-gray-500">Available to book</span><span className="font-semibold text-gray-900">{fmt(batch.remainingAvailable)} crates</span></div>
          {profile?.isFirstTime && (
            <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              First-time customers can book up to 20 crates per batch.
            </div>
          )}
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <Field label="Quantity" help={`You can book up to ${maxQty} crates in this step.`}>
          <input
            type="number"
            min="1"
            max={maxQty}
            required
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </Field>

        {quantityValue > 0 && (
          <div className="rounded-2xl bg-green-50 p-4 text-sm">
            <div className="flex items-center justify-between py-1"><span className="text-gray-600">Order value</span><span className="font-semibold text-gray-900">{fmtMoney(orderValue)}</span></div>
            <div className="flex items-center justify-between py-1"><span className="text-gray-600">Minimum payment</span><span className="font-semibold text-gray-900">{fmtMoney(minPayment)}</span></div>
          </div>
        )}

        <Field label="Amount already paid into the bank" help="Use the amount you have already transferred. Minimum payment is 80% of the order value.">
          <input
            type="number"
            min={minPayment || 0}
            step="0.01"
            required
            value={amountPaid}
            onChange={(event) => setAmountPaid(event.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={loading || quantityValue < 1} className="rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
            {loading ? 'Saving…' : 'Save booking'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function BuyNowModal({ batch, onClose, onSubmitted }) {
  const [quantity, setQuantity] = useState('1');
  const [priceType, setPriceType] = useState('RETAIL');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  const quantityValue = parseInt(quantity, 10) || 0;
  const unitPrice = priceType === 'WHOLESALE' ? Number(batch.wholesalePrice) : Number(batch.retailPrice);
  const estimatedTotal = quantityValue * unitPrice;

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await api.post('/portal/buy-now-request', {
        batchId: batch.id,
        quantity: quantityValue,
        priceType,
        notes,
      });
      setSuccess(response);
    } catch (err) {
      setError(err.error || 'Could not save your request.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <ModalShell title="Buy-now request sent" onClose={onClose}>
        <div className="space-y-4">
          <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-4 text-sm text-green-800">
            {success.message}
          </div>
          <div className="rounded-2xl bg-gray-50 p-4 text-sm">
            <div className="flex items-center justify-between py-1"><span className="text-gray-500">Batch</span><span className="font-semibold text-gray-900">{success.request.batch}</span></div>
            <div className="flex items-center justify-between py-1"><span className="text-gray-500">Egg type</span><span className="font-semibold text-gray-900">{success.request.eggTypeLabel}</span></div>
            <div className="flex items-center justify-between py-1"><span className="text-gray-500">Quantity</span><span className="font-semibold text-gray-900">{success.request.quantity} crates</span></div>
            <div className="flex items-center justify-between py-1"><span className="text-gray-500">Price type</span><span className="font-semibold text-gray-900">{success.request.priceType.toLowerCase()}</span></div>
            <div className="flex items-center justify-between py-1"><span className="text-gray-500">Estimated total</span><span className="font-semibold text-gray-900">{fmtMoney(success.request.estimatedTotal)}</span></div>
          </div>
          <button
            type="button"
            onClick={() => { onSubmitted(); onClose(); }}
            className="w-full rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700"
          >
            Done
          </button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="Buy eggs now" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This sends a same-day purchase request to the team. It does not record payment yet.
        </div>

        <div className="rounded-2xl bg-gray-50 p-4 text-sm">
          <div className="flex items-center justify-between py-1"><span className="text-gray-500">Batch</span><span className="font-semibold text-gray-900">{batch.name}</span></div>
          <div className="flex items-center justify-between py-1"><span className="text-gray-500">Egg type</span><span className="font-semibold text-gray-900">{batch.eggTypeLabel}</span></div>
          <div className="flex items-center justify-between py-1"><span className="text-gray-500">Ready now</span><span className="font-semibold text-gray-900">{fmt(batch.availableForSale)} crates</span></div>
          <div className="flex items-center justify-between py-1"><span className="text-gray-500">Received</span><span className="font-semibold text-gray-900">{fmtDate(batch.receivedDate || batch.expectedDate)}</span></div>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <Field label="Price type" help="Use wholesale for larger crate orders and retail for standard spot buying.">
          <select
            value={priceType}
            onChange={(event) => setPriceType(event.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="RETAIL">Retail</option>
            <option value="WHOLESALE">Wholesale</option>
          </select>
        </Field>

        <Field label="Quantity" help={`You can request up to ${fmt(batch.availableForSale)} crates right now.`}>
          <input
            type="number"
            min="1"
            max={batch.availableForSale}
            required
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </Field>

        <div className="rounded-2xl bg-green-50 p-4 text-sm">
          <div className="flex items-center justify-between py-1"><span className="text-gray-600">Price per crate</span><span className="font-semibold text-gray-900">{fmtMoney(unitPrice)}</span></div>
          <div className="flex items-center justify-between py-1"><span className="text-gray-600">Estimated total</span><span className="font-semibold text-gray-900">{fmtMoney(estimatedTotal)}</span></div>
        </div>

        <Field label="Note for the team" help="Optional. Use this if you want pickup timing or anything else noted.">
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={loading || quantityValue < 1} className="rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
            {loading ? 'Sending…' : 'Send request'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ModalShell({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
          <button type="button" onClick={onClose} className="text-sm font-medium text-gray-500 hover:text-gray-700">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function MyActivity({ bookings, requests, loading }) {
  const items = useMemo(() => {
    const bookingItems = bookings.map((booking) => ({
      kind: 'BOOKING',
      id: booking.id,
      title: booking.batch,
      subtitle: booking.eggTypeLabel,
      date: booking.createdAt,
      status: booking.status,
      quantity: booking.quantity,
      meta: booking.balance > 0 ? `Balance: ${fmtMoney(booking.balance)}` : 'Fully paid',
    }));
    const requestItems = requests.map((request) => ({
      kind: 'BUY_NOW',
      id: request.id,
      title: request.batch,
      subtitle: request.eggTypeLabel,
      date: request.createdAt,
      status: request.status,
      quantity: request.quantity,
      meta: `${request.priceType.toLowerCase()} · ${fmtMoney(request.estimatedTotal)}`,
    }));
    return [...bookingItems, ...requestItems].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [bookings, requests]);

  if (loading) {
    return <div className="rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500">Loading your activity…</div>;
  }

  if (items.length === 0) {
    return <EmptyState title="No activity yet" body="Your bookings and same-day requests will appear here." />;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={`${item.kind}-${item.id}`} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.kind === 'BUY_NOW' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                  {item.kind === 'BUY_NOW' ? 'Buy now request' : 'Upcoming booking'}
                </span>
                <span className="text-xs text-gray-400">{fmtDate(item.date)}</span>
              </div>
              <h3 className="mt-2 text-lg font-semibold text-gray-900">{item.title}</h3>
              <p className="text-sm text-gray-500">{item.subtitle}</p>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">{String(item.status).replaceAll('_', ' ').toLowerCase()}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 rounded-2xl bg-gray-50 p-3 text-sm md:grid-cols-3">
            <Metric label="Quantity" value={`${item.quantity} crates`} />
            <Metric label="Status note" value={item.meta} />
            <Metric label="Next step" value={item.kind === 'BUY_NOW' ? 'Team will confirm pickup' : 'Watch for batch arrival'} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Portal() {
  const { user, logout } = useAuth();
  const [customerUser, setCustomerUser] = useState(null);
  const [view, setView] = useState('home');
  const [upcomingBatches, setUpcomingBatches] = useState([]);
  const [availableNowBatches, setAvailableNowBatches] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [buyNowRequests, setBuyNowRequests] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [bookingBatch, setBookingBatch] = useState(null);
  const [buyNowBatch, setBuyNowBatch] = useState(null);

  const activeUser = user || customerUser;
  const isLoggedIn = Boolean(activeUser);
  const isCustomerRole = activeUser?.role === 'CUSTOMER';

  const loadPortal = useCallback(async () => {
    setLoading(true);
    try {
      const [upcoming, available] = await Promise.all([
        api.get('/portal/batches'),
        api.get('/portal/available-now'),
      ]);
      setUpcomingBatches(upcoming.batches || []);
      setAvailableNowBatches(available.batches || []);

      if (isCustomerRole) {
        const [profileData, bookingData, requestData] = await Promise.all([
          api.get('/portal/profile'),
          api.get('/portal/my-bookings'),
          api.get('/portal/my-buy-now-requests'),
        ]);
        setProfile(profileData);
        setBookings(bookingData.bookings || []);
        setBuyNowRequests(requestData.requests || []);
      } else {
        setProfile(null);
        setBookings([]);
        setBuyNowRequests([]);
      }
    } finally {
      setLoading(false);
    }
  }, [isCustomerRole]);

  useEffect(() => {
    loadPortal();
  }, [loadPortal]);

  function handleAuth(nextUser) {
    setCustomerUser(nextUser);
    setShowAuth(false);
    setView('home');
  }

  function handleLogout() {
    if (logout) logout();
    setCustomerUser(null);
    api.clearTokens();
    localStorage.removeItem('user');
    setView('home');
  }

  const homeStats = [
    { label: 'Available now', value: `${availableNowBatches.length} batch${availableNowBatches.length === 1 ? '' : 'es'}` },
    { label: 'Upcoming batches', value: `${upcomingBatches.length} open` },
    { label: 'My bookings', value: `${bookings.length}` },
    { label: 'My buy-now requests', value: `${buyNowRequests.length}` },
  ];

  return (
    <div className="min-h-screen bg-[#f7f5ef] text-gray-900">
      <header className="border-b border-black/5 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <img src="/logo.webp" alt="Fresh Eggs" className="h-10 w-10 object-contain" />
            <div>
              <h1 className="text-xl font-semibold">Fresh Eggs Market</h1>
              <p className="text-sm text-gray-500">Choose what you need, then we guide you to the right next step.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isCustomerRole && <span className="hidden text-sm text-gray-600 md:block">Hi, {activeUser?.firstName}</span>}
            {isLoggedIn ? (
              <button type="button" onClick={handleLogout} className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                Sign out
              </button>
            ) : (
              <button type="button" onClick={() => setShowAuth(true)} className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {showAuth ? (
          <div className="space-y-4">
            <button type="button" onClick={() => setShowAuth(false)} className="text-sm font-medium text-green-700 hover:text-green-800">
              Back to portal
            </button>
            <AuthPanel onAuth={handleAuth} />
          </div>
        ) : (
          <div className="space-y-8">
            <section className="grid gap-6 rounded-[2rem] bg-white p-6 shadow-sm lg:grid-cols-[1.1fr_0.9fr]">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-green-700">Customer portal</p>
                <h2 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight text-gray-900">
                  Buy eggs that are ready now or book from the next incoming batch.
                </h2>
                <p className="mt-4 max-w-2xl text-base leading-7 text-gray-600">
                  Use <strong>Buy eggs now</strong> when you want stock that is already at the depot. Use <strong>Book upcoming batch</strong> when you want to reserve crates from the next batch before it arrives.
                </p>
                {!isLoggedIn && (
                  <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-4 text-sm text-green-800">
                    Sign in to save bookings and buy-now requests to your account.
                  </div>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {homeStats.map((stat) => (
                  <div key={stat.label} className="rounded-2xl bg-[#f7f5ef] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-gray-500">{stat.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-gray-900">{stat.value}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <SectionCard
                title="Buy eggs now"
                body="See batches that are already received and ask for immediate pickup. This is best when you need eggs right away."
                action="Ready now"
                active={view === 'buy-now'}
                onClick={() => setView('buy-now')}
                accent="amber"
              />
              <SectionCard
                title="Book upcoming batch"
                body="Reserve crates from an open batch before it arrives. This is best when you want to secure supply ahead of time."
                action="Reserve early"
                active={view === 'book-upcoming'}
                onClick={() => setView('book-upcoming')}
              />
            </section>

            {isCustomerRole && (
              <nav className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setView('home')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${view === 'home' ? 'bg-green-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}>
                  Overview
                </button>
                <button type="button" onClick={() => setView('buy-now')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${view === 'buy-now' ? 'bg-green-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}>
                  Buy now
                </button>
                <button type="button" onClick={() => setView('book-upcoming')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${view === 'book-upcoming' ? 'bg-green-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}>
                  Book upcoming
                </button>
                <button type="button" onClick={() => setView('activity')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${view === 'activity' ? 'bg-green-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}>
                  Order status
                </button>
              </nav>
            )}

            {view === 'home' && (
              <section className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-2xl font-semibold text-gray-900">Ready now</h3>
                      <p className="text-sm text-gray-500">Choose from received batches with stock still available.</p>
                    </div>
                    <button type="button" onClick={() => setView('buy-now')} className="text-sm font-semibold text-green-700 hover:text-green-800">See all</button>
                  </div>
                  {loading ? (
                    <div className="rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500">Loading batches…</div>
                  ) : availableNowBatches.length === 0 ? (
                    <EmptyState title="Nothing is ready right now" body="Check back soon or reserve an upcoming batch instead." />
                  ) : (
                    availableNowBatches.slice(0, 2).map((batch) => (
                      <BatchCard
                        key={batch.id}
                        batch={batch}
                        helperText="Available for same-day request."
                        priceLabel="Buy now"
                        actionLabel={isCustomerRole ? 'Request this batch' : 'Sign in to request'}
                        disabled={!isCustomerRole}
                        onAction={(selectedBatch) => isCustomerRole ? setBuyNowBatch(selectedBatch) : setShowAuth(true)}
                      />
                    ))
                  )}
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-2xl font-semibold text-gray-900">Upcoming batches</h3>
                      <p className="text-sm text-gray-500">Reserve crates before the next batch arrives.</p>
                    </div>
                    <button type="button" onClick={() => setView('book-upcoming')} className="text-sm font-semibold text-green-700 hover:text-green-800">See all</button>
                  </div>
                  {loading ? (
                    <div className="rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500">Loading batches…</div>
                  ) : upcomingBatches.length === 0 ? (
                    <EmptyState title="No open batches right now" body="When the next batch opens, it will show here." />
                  ) : (
                    upcomingBatches.slice(0, 2).map((batch) => (
                      <BatchCard
                        key={batch.id}
                        batch={batch}
                        helperText="Reserve before arrival."
                        priceLabel="Upcoming batch"
                        actionLabel={isCustomerRole ? 'Book this batch' : 'Sign in to book'}
                        disabled={!isCustomerRole}
                        onAction={(selectedBatch) => isCustomerRole ? setBookingBatch(selectedBatch) : setShowAuth(true)}
                      />
                    ))
                  )}
                </div>
              </section>
            )}

            {view === 'buy-now' && (
              <section className="space-y-4">
                <div>
                  <h3 className="text-2xl font-semibold text-gray-900">Buy eggs now</h3>
                  <p className="mt-1 text-sm text-gray-500">Send a request for eggs that are already received and available for pickup.</p>
                </div>
                {loading ? (
                  <div className="rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500">Loading ready-now batches…</div>
                ) : availableNowBatches.length === 0 ? (
                  <EmptyState title="No ready-now batches" body="There is no sale-ready stock in the portal right now." />
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {availableNowBatches.map((batch) => (
                      <BatchCard
                        key={batch.id}
                        batch={batch}
                        helperText="Available for same-day request."
                        priceLabel="Ready now"
                        actionLabel={isCustomerRole ? 'Request this batch' : 'Sign in to request'}
                        disabled={!isCustomerRole}
                        onAction={(selectedBatch) => isCustomerRole ? setBuyNowBatch(selectedBatch) : setShowAuth(true)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {view === 'book-upcoming' && (
              <section className="space-y-4">
                <div>
                  <h3 className="text-2xl font-semibold text-gray-900">Book upcoming batch</h3>
                  <p className="mt-1 text-sm text-gray-500">Reserve eggs from an open batch before it arrives.</p>
                </div>
                {loading ? (
                  <div className="rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500">Loading upcoming batches…</div>
                ) : upcomingBatches.length === 0 ? (
                  <EmptyState title="No open batches" body="There are no upcoming batches available for booking right now." />
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {upcomingBatches.map((batch) => (
                      <BatchCard
                        key={batch.id}
                        batch={batch}
                        helperText="Reserve before arrival."
                        priceLabel="Upcoming batch"
                        actionLabel={isCustomerRole ? 'Book this batch' : 'Sign in to book'}
                        disabled={!isCustomerRole}
                        onAction={(selectedBatch) => isCustomerRole ? setBookingBatch(selectedBatch) : setShowAuth(true)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {view === 'activity' && isCustomerRole && (
              <section className="space-y-4">
                <div>
                  <h3 className="text-2xl font-semibold text-gray-900">Order status and history</h3>
                  <p className="mt-1 text-sm text-gray-500">Track your upcoming bookings, buy-now requests, and past order activity in one place.</p>
                </div>
                <MyActivity bookings={bookings} requests={buyNowRequests} loading={loading} />
              </section>
            )}
          </div>
        )}
      </main>

      {bookingBatch && (
        <BookingModal
          batch={bookingBatch}
          profile={profile}
          onClose={() => setBookingBatch(null)}
          onBooked={() => {
            loadPortal();
            setView('activity');
          }}
        />
      )}

      {buyNowBatch && (
        <BuyNowModal
          batch={buyNowBatch}
          onClose={() => setBuyNowBatch(null)}
          onSubmitted={() => {
            loadPortal();
            setView('activity');
          }}
        />
      )}
    </div>
  );
}
