import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';

const fmt = (n) => Number(n || 0).toLocaleString('en-NG');
const fmtMoney = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 0 });
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

const TRANSFER_DETAILS = {
  bankName: 'Providus Bank',
  accountNumber: '5401952310',
  accountName: 'Fresh Egg Wholesales Market',
};

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

function StatusPill({ tone = 'gray', children }) {
  const classes = {
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
    red: 'bg-red-100 text-red-700',
    gray: 'bg-gray-100 text-gray-700',
  };
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${classes[tone] || classes.gray}`}>
      {children}
    </span>
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

function Metric({ label, value }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.14em] text-gray-500">{label}</p>
      <p className="mt-1 font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function BatchCard({ batch, actionLabel, helperText, priceLabel, onAction, disabled, mode }) {
  const primaryPrice = mode === 'buy-now' ? Number(batch.retailPrice) : Number(batch.wholesalePrice);
  const primaryPriceLabel = mode === 'buy-now' ? 'Retail' : 'Wholesale';
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
          <p className="mt-2 text-2xl font-bold text-gray-900">{fmtMoney(primaryPrice)}</p>
          <p className="text-xs text-gray-500">{primaryPriceLabel}</p>
          {mode === 'book-upcoming' && (
            <p className="mt-1 text-sm font-semibold text-amber-700">{fmtMoney(batch.retailPrice)} retail now</p>
          )}
        </div>
      </div>

      {mode === 'buy-now' ? (
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-gray-50 p-3 text-sm">
          <Metric label="Available to buy" value={`${fmt(batch.availableForSale)} crates`} />
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

function PaymentMethodSelector({ paymentMethod, setPaymentMethod }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <button
        type="button"
        onClick={() => setPaymentMethod('CARD')}
        className={`rounded-2xl border p-4 text-left transition ${paymentMethod === 'CARD' ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white hover:border-green-200'}`}
      >
        <p className="text-sm font-semibold text-gray-900">Pay online with card</p>
        <p className="mt-1 text-sm text-gray-500">Pay now and get an immediate payment result.</p>
      </button>
      <button
        type="button"
        onClick={() => setPaymentMethod('TRANSFER')}
        className={`rounded-2xl border p-4 text-left transition ${paymentMethod === 'TRANSFER' ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white hover:border-green-200'}`}
      >
        <p className="text-sm font-semibold text-gray-900">Pay by transfer</p>
        <p className="mt-1 text-sm text-gray-500">Your crates stay held while admin confirms the transfer.</p>
      </button>
    </div>
  );
}

function TransferInstructions({ amount, title = 'Transfer details' }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-gray-600">Bank name</span>
          <span className="font-semibold text-gray-900">{TRANSFER_DETAILS.bankName}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-gray-600">Account number</span>
          <span className="font-semibold text-gray-900">{TRANSFER_DETAILS.accountNumber}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-gray-600">Account name</span>
          <span className="font-semibold text-gray-900">{TRANSFER_DETAILS.accountName}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-gray-600">Amount to transfer</span>
          <span className="font-semibold text-gray-900">{fmtMoney(amount)}</span>
        </div>
      </div>
    </div>
  );
}

function BookingCheckoutModal({ batch, profile, policy, onClose, onFinished }) {
  const [quantity, setQuantity] = useState('');
  const [amountToPay, setAmountToPay] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CARD');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  const minPaymentPercent = Number(policy?.bookingMinimumPaymentPercent || 80);
  const orderLimitProfile = profile?.orderLimitProfile || null;
  const maxQty = Math.min(
    batch.remainingAvailable,
    Number(orderLimitProfile?.currentPerOrderLimit || policy?.maxBookingCratesPerOrder || 100),
  );
  const quantityValue = parseInt(quantity, 10) || 0;
  const orderValue = quantityValue * Number(batch.wholesalePrice);
  const minPayment = orderValue * (minPaymentPercent / 100);
  const payNow = Number(amountToPay || 0);
  const balanceLeft = Math.max(0, orderValue - payNow);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await api.post('/portal/checkouts', {
        checkoutType: 'BOOK_UPCOMING',
        batchId: batch.id,
        quantity: quantityValue,
        amountToPay: payNow,
        paymentMethod,
      });

      if (paymentMethod === 'CARD' && response.authorizationUrl) {
        window.location.assign(response.authorizationUrl);
        return;
      }

      setSuccess(response);
    } catch (err) {
      setError(err.error || 'Could not start this booking payment.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <ModalShell title="Booking hold created" onClose={onClose}>
        <div className="space-y-4">
          <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-4 text-sm text-green-800">
            {success.message}
          </div>
          <div className="rounded-2xl bg-gray-50 p-4 text-sm">
            <div className="flex items-center justify-between py-1"><span className="text-gray-500">Batch</span><span className="font-semibold text-gray-900">{success.checkout.batch.name}</span></div>
            <div className="flex items-center justify-between py-1"><span className="text-gray-500">Egg type</span><span className="font-semibold text-gray-900">{success.checkout.batch.eggTypeLabel}</span></div>
            <div className="flex items-center justify-between py-1"><span className="text-gray-500">Crates held</span><span className="font-semibold text-gray-900">{success.checkout.quantity}</span></div>
            <div className="flex items-center justify-between py-1"><span className="text-gray-500">Booking value</span><span className="font-semibold text-gray-900">{fmtMoney(success.checkout.orderValue)}</span></div>
            <div className="flex items-center justify-between py-1"><span className="text-gray-500">Paying now</span><span className="font-semibold text-green-700">{fmtMoney(success.checkout.amountToPay)}</span></div>
            <div className="flex items-center justify-between py-1"><span className="text-gray-500">Balance left</span><span className="font-semibold text-gray-900">{fmtMoney(success.checkout.balanceAfterPayment)}</span></div>
          </div>
          <TransferInstructions amount={success.checkout.amountToPay} />
          <button
            type="button"
            onClick={() => { onFinished(); onClose(); }}
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
          Your crates will be held as soon as you continue. Card payment confirms the payment immediately. Transfer keeps the hold while admin confirms the transfer.
        </div>

        <div className="rounded-2xl bg-gray-50 p-4 text-sm">
          <div className="flex items-center justify-between py-1"><span className="text-gray-500">Batch</span><span className="font-semibold text-gray-900">{batch.name}</span></div>
          <div className="flex items-center justify-between py-1"><span className="text-gray-500">Egg type</span><span className="font-semibold text-gray-900">{batch.eggTypeLabel}</span></div>
          <div className="flex items-center justify-between py-1"><span className="text-gray-500">Expected date</span><span className="font-semibold text-gray-900">{fmtDate(batch.expectedDate)}</span></div>
          <div className="flex items-center justify-between py-1"><span className="text-gray-500">Available to book</span><span className="font-semibold text-gray-900">{fmt(batch.remainingAvailable)} crates</span></div>
          {orderLimitProfile?.isUsingEarlyOrderLimit && (
            <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Your first {Number(orderLimitProfile.earlyOrderLimitCount || 0)} orders can be up to {Number(orderLimitProfile.currentPerOrderLimit || 0)} crates each. You have {Number(orderLimitProfile.earlyOrdersRemaining || 0)} order{Number(orderLimitProfile.earlyOrdersRemaining || 0) === 1 ? '' : 's'} left at this limit.
            </div>
          )}
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <Field label="How many crates do you want?" help={`You can book up to ${maxQty} crates in this step.`}>
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
            <div className="flex items-center justify-between py-1"><span className="text-gray-600">Booking value</span><span className="font-semibold text-gray-900">{fmtMoney(orderValue)}</span></div>
            <div className="flex items-center justify-between py-1"><span className="text-gray-600">Minimum payment now</span><span className="font-semibold text-gray-900">{fmtMoney(minPayment)}</span></div>
          </div>
        )}

        <Field label="How much do you want to pay now?" help={`Minimum is ${minPaymentPercent}% of the booking value.`}>
          <input
            type="number"
            min={minPayment || 0}
            max={orderValue || undefined}
            step="0.01"
            required
            value={amountToPay}
            onChange={(event) => setAmountToPay(event.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </Field>

        {payNow > 0 && (
          <div className="rounded-2xl bg-white p-4 ring-1 ring-gray-200">
            <div className="flex items-center justify-between py-1"><span className="text-gray-600">Paying now</span><span className="font-semibold text-gray-900">{fmtMoney(payNow)}</span></div>
            <div className="flex items-center justify-between py-1"><span className="text-gray-600">Balance left after this payment</span><span className="font-semibold text-gray-900">{fmtMoney(balanceLeft)}</span></div>
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Choose payment method</p>
          <PaymentMethodSelector paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} />
        </div>

        {paymentMethod === 'TRANSFER' && payNow > 0 && (
          <TransferInstructions amount={payNow} title="Transfer to this account after you continue" />
        )}

        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={loading || quantityValue < 1 || payNow <= 0} className="rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
            {loading ? 'Please wait…' : paymentMethod === 'CARD' ? 'Continue to card payment' : 'Hold crates and pay by transfer'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function BuyNowCheckoutModal({ batch, profile, policy, onClose, onFinished }) {
  const [quantity, setQuantity] = useState('1');
  const [paymentMethod, setPaymentMethod] = useState('CARD');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  const quantityValue = parseInt(quantity, 10) || 0;
  const unitPrice = Number(batch.retailPrice);
  const orderLimitProfile = profile?.orderLimitProfile || null;
  const maxQty = Math.min(
    batch.availableForSale,
    Number(orderLimitProfile?.currentPerOrderLimit || policy?.maxBookingCratesPerOrder || 100),
  );
  const orderValue = quantityValue * unitPrice;

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await api.post('/portal/checkouts', {
        checkoutType: 'BUY_NOW',
        batchId: batch.id,
        quantity: quantityValue,
        paymentMethod,
      });

      if (paymentMethod === 'CARD' && response.authorizationUrl) {
        window.location.assign(response.authorizationUrl);
        return;
      }

      setSuccess(response);
    } catch (err) {
      setError(err.error || 'Could not start this buy-now payment.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <ModalShell title="Crates held for transfer" onClose={onClose}>
        <div className="space-y-4">
          <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-4 text-sm text-green-800">
            {success.message}
          </div>
          <div className="rounded-2xl bg-gray-50 p-4 text-sm">
            <div className="flex items-center justify-between py-1"><span className="text-gray-500">Batch</span><span className="font-semibold text-gray-900">{success.checkout.batch.name}</span></div>
            <div className="flex items-center justify-between py-1"><span className="text-gray-500">Egg type</span><span className="font-semibold text-gray-900">{success.checkout.batch.eggTypeLabel}</span></div>
            <div className="flex items-center justify-between py-1"><span className="text-gray-500">Crates held</span><span className="font-semibold text-gray-900">{success.checkout.quantity}</span></div>
            <div className="flex items-center justify-between py-1"><span className="text-gray-500">Total to pay</span><span className="font-semibold text-green-700">{fmtMoney(success.checkout.amountToPay)}</span></div>
          </div>
          <TransferInstructions amount={success.checkout.amountToPay} />
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            Once the transfer is confirmed, your eggs will be approved for pickup from today until the next 3 days.
          </div>
          <button
            type="button"
            onClick={() => { onFinished(); onClose(); }}
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
          Your crates will be held as soon as you continue. Card payment approves the order for pickup immediately. Transfer keeps the crates held while admin confirms the transfer.
        </div>

        <div className="rounded-2xl bg-gray-50 p-4 text-sm">
          <div className="flex items-center justify-between py-1"><span className="text-gray-500">Batch</span><span className="font-semibold text-gray-900">{batch.name}</span></div>
          <div className="flex items-center justify-between py-1"><span className="text-gray-500">Egg type</span><span className="font-semibold text-gray-900">{batch.eggTypeLabel}</span></div>
          <div className="flex items-center justify-between py-1"><span className="text-gray-500">Available to buy</span><span className="font-semibold text-gray-900">{fmt(batch.availableForSale)} crates</span></div>
          <div className="flex items-center justify-between py-1"><span className="text-gray-500">Received</span><span className="font-semibold text-gray-900">{fmtDate(batch.receivedDate || batch.expectedDate)}</span></div>
        </div>

        {orderLimitProfile?.isUsingEarlyOrderLimit && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Your first {Number(orderLimitProfile.earlyOrderLimitCount || 0)} orders can be up to {Number(orderLimitProfile.currentPerOrderLimit || 0)} crates each. You have {Number(orderLimitProfile.earlyOrdersRemaining || 0)} order{Number(orderLimitProfile.earlyOrdersRemaining || 0) === 1 ? '' : 's'} left at this limit.
          </div>
        )}

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <Field label="How many crates do you want to buy?" help={`You can buy up to ${fmt(maxQty)} crates right now.`}>
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

        <div className="rounded-2xl bg-green-50 p-4 text-sm">
          <div className="flex items-center justify-between py-1"><span className="text-gray-600">Price per crate</span><span className="font-semibold text-gray-900">{fmtMoney(unitPrice)}</span></div>
          <div className="flex items-center justify-between py-1"><span className="text-gray-600">Price used</span><span className="font-semibold text-gray-900">Retail price</span></div>
          <div className="flex items-center justify-between py-1"><span className="text-gray-600">Total to pay</span><span className="font-semibold text-gray-900">{fmtMoney(orderValue)}</span></div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Choose payment method</p>
          <PaymentMethodSelector paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} />
        </div>

        {paymentMethod === 'TRANSFER' && orderValue > 0 && (
          <TransferInstructions amount={orderValue} title="Transfer to this account after you continue" />
        )}

        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={loading || quantityValue < 1} className="rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
            {loading ? 'Please wait…' : paymentMethod === 'CARD' ? 'Continue to card payment' : 'Hold crates and pay by transfer'}
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

function getOrderStatus(order) {
  if (order.kind === 'BOOKING') {
    if (order.source === 'BOOKING_CHECKOUT') {
      if (order.status === 'AWAITING_PAYMENT') return { label: 'Waiting for card payment', tone: 'amber' };
      if (order.status === 'AWAITING_TRANSFER') return { label: 'Transfer under review', tone: 'amber' };
      if (order.status === 'FAILED') return { label: 'Card payment failed', tone: 'red' };
      if (order.status === 'CANCELLED') return { label: 'Booking hold cancelled', tone: 'red' };
    }
    if (order.status === 'PICKED_UP') return { label: 'Picked up', tone: 'green' };
    if (order.status === 'CANCELLED') return { label: 'Cancelled', tone: 'red' };
    if (order.batchArrived && order.balance <= 0) return { label: 'Approved for pickup', tone: 'green' };
    if (order.batchArrived && order.balance > 0) return { label: 'Batch arrived - pay balance', tone: 'amber' };
    if (order.balance <= 0) return { label: 'Booked and fully paid', tone: 'green' };
    return { label: 'Booked and held', tone: 'blue' };
  }

  if (order.source === 'BUY_NOW_CHECKOUT') {
    if (order.status === 'AWAITING_PAYMENT') return { label: 'Waiting for card payment', tone: 'amber' };
    if (order.status === 'AWAITING_TRANSFER') return { label: 'Transfer under review', tone: 'amber' };
    if (order.status === 'FAILED') return { label: 'Card payment failed', tone: 'red' };
    if (order.status === 'CANCELLED') return { label: 'Hold cancelled', tone: 'red' };
  }
  if (order.status === 'APPROVED_FOR_PICKUP') return { label: 'Approved for pickup', tone: 'green' };
  if (order.status === 'FULFILLED') return { label: 'Picked up', tone: 'green' };
  if (order.status === 'REJECTED') return { label: 'Rejected', tone: 'red' };
  if (order.status === 'CANCELLED') return { label: 'Cancelled', tone: 'red' };
  return { label: 'Open', tone: 'gray' };
}

function getOrderPaymentText(order) {
  if (order.source === 'BOOKING_CHECKOUT' || order.source === 'BUY_NOW_CHECKOUT') {
    return order.paymentMethod === 'CARD'
      ? 'Card payment not completed yet'
      : 'Waiting for transfer confirmation';
  }
  if (order.balance > 0) {
    return `${fmtMoney(order.amountPaid)} paid · ${fmtMoney(order.balance)} left`;
  }
  return 'Fully paid';
}

function getOrderNextStep(order) {
  if (order.kind === 'BOOKING') {
    if (order.source === 'BOOKING_CHECKOUT') {
      if (order.paymentMethod === 'CARD') {
        return 'Complete the card payment to keep these crates reserved for you.';
      }
      return 'Make the transfer, then wait for admin to confirm it. If the transfer is rejected, the held crates will return to available stock.';
    }
    if (order.status === 'PICKED_UP') return 'This booking has already been collected.';
    if (order.status === 'CANCELLED') return 'This booking is no longer active.';
    if (order.batchArrived && order.balance > 0) return 'Your batch has arrived. Pay the remaining balance so pickup can be completed.';
    if (order.batchArrived) return 'Your batch has arrived and is ready for pickup.';
    return 'Your crates are reserved. We will let you know once the batch arrives.';
  }

  if (order.source === 'BUY_NOW_CHECKOUT') {
    return order.paymentMethod === 'CARD'
      ? 'Complete the card payment to keep this hold.'
      : 'Make the transfer, then wait for admin confirmation. Once approved, pickup is allowed from today until the next 3 days.';
  }
  if (order.status === 'APPROVED_FOR_PICKUP') {
    return 'Your eggs are approved for pickup. Please come between today and the next 3 days.';
  }
  if (order.status === 'FULFILLED') return 'This order has already been picked up.';
  if (order.status === 'REJECTED') return 'This payment was rejected, so the held crates have gone back into available stock.';
  return 'The team will update this order after reviewing it.';
}

function MyActivity({ orders, loading }) {
  const [selectedOrder, setSelectedOrder] = useState(null);

  if (loading) {
    return <div className="rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500">Loading your orders…</div>;
  }

  if (!orders.length) {
    return <EmptyState title="No orders yet" body="Your portal orders will appear here once you start booking or buying." />;
  }

  return (
    <>
      <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-[0.16em] text-gray-500">
              <tr>
                <th className="px-5 py-4 font-medium">Order</th>
                <th className="px-5 py-4 font-medium">Type</th>
                <th className="px-5 py-4 font-medium">Ordered</th>
                <th className="px-5 py-4 font-medium">Status</th>
                <th className="px-5 py-4 font-medium">Payment</th>
                <th className="px-5 py-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((order) => {
                const status = getOrderStatus(order);
                return (
                  <tr key={`${order.source}-${order.id}`} className="hover:bg-gray-50">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-gray-900">{order.batch}</div>
                      <div className="mt-1 text-xs text-gray-500">{order.eggTypeLabel}</div>
                      <div className="mt-1 text-xs text-gray-400">{order.quantity} crates</div>
                    </td>
                    <td className="px-5 py-4 text-gray-600">{order.kind === 'BOOKING' ? 'Upcoming booking' : 'Buy now'}</td>
                    <td className="px-5 py-4 text-gray-600">{fmtDate(order.createdAt)}</td>
                    <td className="px-5 py-4">
                      <StatusPill tone={status.tone}>{status.label}</StatusPill>
                    </td>
                    <td className="px-5 py-4 text-gray-600">{getOrderPaymentText(order)}</td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedOrder(order)}
                        className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        View details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedOrder && (
        <ModalShell title="Order details" onClose={() => setSelectedOrder(null)}>
          <div className="space-y-4 text-sm">
            <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-4 text-green-900">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-green-700">
                    {selectedOrder.kind === 'BOOKING' ? 'Upcoming booking' : 'Buy now'}
                  </p>
                  <h4 className="mt-1 text-lg font-semibold text-gray-900">{selectedOrder.batch}</h4>
                  <p className="text-sm text-gray-600">{selectedOrder.eggTypeLabel}</p>
                </div>
                <StatusPill tone={getOrderStatus(selectedOrder).tone}>{getOrderStatus(selectedOrder).label}</StatusPill>
              </div>
            </div>

            <div className="grid gap-3 rounded-2xl bg-gray-50 p-4 md:grid-cols-2">
              <Metric label="Quantity" value={`${selectedOrder.quantity} crates`} />
              <Metric label="Order created" value={fmtDateTime(selectedOrder.createdAt)} />
              <Metric label="Last updated" value={fmtDateTime(selectedOrder.updatedAt || selectedOrder.createdAt)} />
              <Metric label="Expected batch date" value={fmtDate(selectedOrder.expectedDate)} />
            </div>

            <div className="grid gap-3 rounded-2xl bg-white p-4 md:grid-cols-2">
              <Metric label="Order value" value={fmtMoney(selectedOrder.orderValue)} />
              <Metric label="Payment made" value={fmtMoney(selectedOrder.amountPaid || 0)} />
              <Metric label="Payment remaining" value={fmtMoney(selectedOrder.balance || 0)} />
              <Metric label="Payment method" value={selectedOrder.paymentMethod ? String(selectedOrder.paymentMethod).toLowerCase() : '—'} />
              <Metric label="Payment status" value={getOrderPaymentText(selectedOrder)} />
              <Metric label="Batch arrival" value={selectedOrder.batchArrived ? `Arrived${selectedOrder.batchArrivalDate ? ` on ${fmtDate(selectedOrder.batchArrivalDate)}` : ''}` : 'Not yet arrived'} />
            </div>

            {selectedOrder.pickupWindowStart && (
              <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-green-700">Pickup window</p>
                <p className="mt-2 text-sm text-gray-800">
                  You can pick up this order from <span className="font-semibold">{fmtDate(selectedOrder.pickupWindowStart)}</span> to{' '}
                  <span className="font-semibold">{fmtDate(selectedOrder.pickupWindowEnd)}</span>.
                </p>
              </div>
            )}

            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">What happens next</p>
              <p className="mt-2 text-sm leading-6 text-gray-700">{getOrderNextStep(selectedOrder)}</p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Dates and notes</p>
              <div className="mt-3 space-y-2 text-sm text-gray-700">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-gray-500">Reference</span>
                  <span className="text-right font-medium">{selectedOrder.reference || '—'}</span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-gray-500">Order created</span>
                  <span className="text-right font-medium">{fmtDateTime(selectedOrder.createdAt)}</span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-gray-500">Last updated</span>
                  <span className="text-right font-medium">{fmtDateTime(selectedOrder.updatedAt || selectedOrder.createdAt)}</span>
                </div>
                {selectedOrder.paymentWindowEndsAt && (
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-gray-500">Payment window ends</span>
                    <span className="text-right font-medium">{fmtDateTime(selectedOrder.paymentWindowEndsAt)}</span>
                  </div>
                )}
                <div className="flex items-start justify-between gap-4">
                  <span className="text-gray-500">Expected batch date</span>
                  <span className="text-right font-medium">{fmtDate(selectedOrder.expectedDate)}</span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-gray-500">Batch arrived</span>
                  <span className="text-right font-medium">
                    {selectedOrder.batchArrived
                      ? selectedOrder.batchArrivalDate
                        ? fmtDateTime(selectedOrder.batchArrivalDate)
                        : 'Yes'
                      : 'Not yet'}
                  </span>
                </div>
                {selectedOrder.pickupWindowStart && (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-gray-500">Pickup starts</span>
                      <span className="text-right font-medium">{fmtDateTime(selectedOrder.pickupWindowStart)}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-gray-500">Pickup ends</span>
                      <span className="text-right font-medium">{fmtDateTime(selectedOrder.pickupWindowEnd)}</span>
                    </div>
                  </>
                )}
                <div className="pt-2">
                  <p className="text-gray-500">Note</p>
                  <p className="mt-1 leading-6 text-gray-700">{selectedOrder.notes || 'No extra note was added to this order.'}</p>
                </div>
              </div>
            </div>
          </div>
        </ModalShell>
      )}
    </>
  );
}

export default function Portal() {
  const { user, logout } = useAuth();
  const [customerUser, setCustomerUser] = useState(null);
  const [view, setView] = useState('home');
  const [upcomingBatches, setUpcomingBatches] = useState([]);
  const [availableNowBatches, setAvailableNowBatches] = useState([]);
  const [orders, setOrders] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [bookingBatch, setBookingBatch] = useState(null);
  const [buyNowBatch, setBuyNowBatch] = useState(null);
  const [portalPolicy, setPortalPolicy] = useState(null);
  const [paymentMessage, setPaymentMessage] = useState(null);
  const paymentVerificationRef = useRef('');

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
      setPortalPolicy(upcoming.policy || available.policy || null);

      if (isCustomerRole) {
        const [profileData, ordersData] = await Promise.all([
          api.get('/portal/profile'),
          api.get('/portal/orders'),
        ]);
        setProfile(profileData);
        setOrders(ordersData.orders || []);
      } else {
        setProfile(null);
        setOrders([]);
      }
    } finally {
      setLoading(false);
    }
  }, [isCustomerRole]);

  useEffect(() => {
    loadPortal();
  }, [loadPortal]);

  useEffect(() => {
    if (!isCustomerRole) return;
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference');
    if (!reference || paymentVerificationRef.current === reference) return;

    paymentVerificationRef.current = reference;
    api.post('/portal/checkouts/verify-card', { reference })
      .then((result) => {
        setPaymentMessage({
          tone: 'green',
          title: 'Payment confirmed',
          body: result.message,
        });
        loadPortal();
      })
      .catch((err) => {
        setPaymentMessage({
          tone: 'red',
          title: 'Payment not confirmed',
          body: err.error || 'We could not confirm that payment yet.',
        });
      })
      .finally(() => {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('reference');
        window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.search);
      });
  }, [isCustomerRole, loadPortal]);

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

  const orderCounts = useMemo(() => ({
    bookings: orders.filter((order) => order.kind === 'BOOKING').length,
    buyNow: orders.filter((order) => order.kind === 'BUY_NOW').length,
  }), [orders]);

  const homeStats = [
    { label: 'Available now', value: `${availableNowBatches.length} batch${availableNowBatches.length === 1 ? '' : 'es'}` },
    { label: 'Upcoming batches', value: `${upcomingBatches.length} open` },
    { label: 'My bookings', value: `${orderCounts.bookings}` },
    { label: 'My buy now', value: `${orderCounts.buyNow}` },
  ];

  return (
    <div className="min-h-screen bg-[#f7f5ef] text-gray-900">
      <header className="border-b border-black/5 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <Link to="/portal" className="flex items-center gap-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500">
            <img src="/logo.webp" alt="Fresh Eggs" className="h-10 w-10 object-contain" />
            <div>
              <h1 className="text-xl font-semibold">Fresh Eggs Market</h1>
              <p className="text-sm text-gray-500">Choose what you need, hold it, then pay the right way.</p>
            </div>
          </Link>
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
            {paymentMessage && (
              <div className={`rounded-2xl border px-4 py-4 text-sm ${
                paymentMessage.tone === 'green'
                  ? 'border-green-200 bg-green-50 text-green-800'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}>
                <p className="font-semibold">{paymentMessage.title}</p>
                <p className="mt-1">{paymentMessage.body}</p>
              </div>
            )}

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
                    Sign in to pay, hold crates, and track your orders in one place.
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
                body="See batches that are already received, hold the crates you want, and pay right away."
                action="Pay now"
                active={view === 'buy-now'}
                onClick={() => setView('buy-now')}
                accent="amber"
              />
              <SectionCard
                title="Book upcoming batch"
                body="Reserve crates from an open batch, choose how much to pay now, and keep the rest for later."
                action="Book and pay"
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
                      <h3 className="text-2xl font-semibold text-gray-900">Available to buy</h3>
                      <p className="text-sm text-gray-500">Choose from received batches with stock ready right now.</p>
                    </div>
                    <button type="button" onClick={() => setView('buy-now')} className="text-sm font-semibold text-green-700 hover:text-green-800">See all</button>
                  </div>
                  {loading ? (
                    <div className="rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500">Loading batches…</div>
                  ) : availableNowBatches.length === 0 ? (
                    <EmptyState title="Nothing is ready right now" body="Check back soon or book an upcoming batch instead." />
                  ) : (
                    availableNowBatches.slice(0, 2).map((batch) => (
                      <BatchCard
                        key={batch.id}
                        batch={batch}
                        mode="buy-now"
                        helperText="Pay now and hold your crates immediately."
                        priceLabel="Buy now"
                        actionLabel={isCustomerRole ? 'Buy now' : 'Sign in to buy'}
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
                        mode="book-upcoming"
                        helperText="Choose your crates, pay now, and keep them reserved."
                        priceLabel="Upcoming batch"
                        actionLabel={isCustomerRole ? 'Book and pay' : 'Sign in to book'}
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
                  <p className="mt-1 text-sm text-gray-500">Choose a ready batch, hold the crates, and pay right away.</p>
                </div>
                {loading ? (
                  <div className="rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500">Loading available stock…</div>
                ) : availableNowBatches.length === 0 ? (
                  <EmptyState title="No eggs ready to buy" body="There is no sale-ready stock in the portal right now." />
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {availableNowBatches.map((batch) => (
                      <BatchCard
                        key={batch.id}
                        batch={batch}
                        mode="buy-now"
                        helperText="Card payment approves pickup immediately. Transfer keeps the hold until admin confirms."
                        priceLabel="Available now"
                        actionLabel={isCustomerRole ? 'Buy now' : 'Sign in to buy'}
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
                  <p className="mt-1 text-sm text-gray-500">Choose crates, decide how much to pay now, and keep the rest for later.</p>
                </div>
                {loading ? (
                  <div className="rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500">Loading open batches…</div>
                ) : upcomingBatches.length === 0 ? (
                  <EmptyState title="No open batches right now" body="When the next batch opens, you will see it here." />
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {upcomingBatches.map((batch) => (
                      <BatchCard
                        key={batch.id}
                        batch={batch}
                        mode="book-upcoming"
                        helperText="Pay at least the booking minimum to reserve your crates."
                        priceLabel="Book upcoming"
                        actionLabel={isCustomerRole ? 'Book and pay' : 'Sign in to book'}
                        disabled={!isCustomerRole}
                        onAction={(selectedBatch) => isCustomerRole ? setBookingBatch(selectedBatch) : setShowAuth(true)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {view === 'activity' && (
              <section className="space-y-4">
                <div>
                  <h3 className="text-2xl font-semibold text-gray-900">Order status and history</h3>
                  <p className="mt-1 text-sm text-gray-500">Track bookings, buy-now payments, approvals, pickup windows, and batch arrival updates in one place.</p>
                </div>
                <MyActivity orders={orders} loading={loading} />
              </section>
            )}
          </div>
        )}
      </main>

      {bookingBatch && (
        <BookingCheckoutModal
          batch={bookingBatch}
          profile={profile}
          policy={portalPolicy}
          onClose={() => setBookingBatch(null)}
          onFinished={loadPortal}
        />
      )}

      {buyNowBatch && (
        <BuyNowCheckoutModal
          batch={buyNowBatch}
          profile={profile}
          policy={portalPolicy}
          onClose={() => setBuyNowBatch(null)}
          onFinished={loadPortal}
        />
      )}
    </div>
  );
}
