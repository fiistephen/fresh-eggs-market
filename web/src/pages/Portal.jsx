import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { Button, Input, Modal, Card, Badge, EmptyState } from '../components/ui';

const fmt = (n) => Number(n || 0).toLocaleString('en-NG');
const fmtMoney = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 0 });
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

const TRANSFER_DETAILS = {
  bankName: 'Providus Bank',
  accountNumber: '5401952310',
  accountName: 'Fresh Egg Wholesales Market',
};

const PICKUP_DETAILS = {
  lineOne: 'Spring Valley Estate, Alasia Bus Stop, Lekki-Epe ExpressWay, Lagos, Nigeria',
  lineTwo: 'Immediately after Sunbeth Energies Filling Station, Before Dominion City Church, Before Lagos Business School, Lekki-Epe ExpressWay',
};

function profileDisplayName(profile, user) {
  if (profile?.customer?.name) return profile.customer.name;
  const fullName = [profile?.user?.firstName, profile?.user?.lastName].filter(Boolean).join(' ').trim();
  if (fullName) return fullName;
  const fallbackUser = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  return fallbackUser || user?.phone || user?.email || 'Customer';
}

// SVG Icons
const IconChevronRight = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const IconCheck = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconAlertCircle = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const IconInfo = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

const IconCreditCard = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
    <line x1="1" y1="10" x2="23" y2="10" />
  </svg>
);

const IconBank = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="2" y1="8" x2="22" y2="8" />
    <path d="M4 20h16a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2z" />
    <line x1="12" y1="12" x2="12" y2="16" />
  </svg>
);

const IconBox = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
  </svg>
);

const IconCalendar = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const IconMapPin = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const IconClock = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

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
    <div className="mx-auto max-w-md">
      <Card variant="default" className="border border-surface-200">
        {/* Tab toggle */}
        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(''); }}
            className={`flex-1 py-2.5 px-4 rounded-md text-body-medium font-medium transition-all duration-fast ${
              mode === 'login'
                ? 'bg-brand-500 text-surface-900 shadow-xs'
                : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(''); }}
            className={`flex-1 py-2.5 px-4 rounded-md text-body-medium font-medium transition-all duration-fast ${
              mode === 'register'
                ? 'bg-brand-500 text-surface-900 shadow-xs'
                : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
            }`}
          >
            Create account
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-md bg-error-50 border border-error-200 text-body text-error-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <>
              <Input
                label="Full name"
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
                placeholder="e.g. Adunni Okafor"
              />
              <Input
                label="Phone number"
                type="tel"
                required
                value={form.phone}
                onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))}
                placeholder="e.g. 08012345678"
              />
            </>
          )}

          {mode === 'register' ? (
            <Input
              label="Email (optional)"
              type="email"
              value={form.email}
              onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
              placeholder="you@example.com"
            />
          ) : (
            <Input
              label="Phone number or email"
              type="text"
              required
              value={form.identifier}
              onChange={(e) => setForm((current) => ({ ...current, identifier: e.target.value }))}
              placeholder="e.g. 08012345678 or you@example.com"
            />
          )}

          <Input
            label="Password"
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => setForm((current) => ({ ...current, password: e.target.value }))}
            hint={mode === 'register' ? 'Use at least 8 characters.' : null}
          />

          <Button
            variant="primary"
            size="lg"
            loading={loading}
            className="w-full"
          >
            {mode === 'register' ? 'Create account' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <p className="text-caption text-surface-500 font-medium">{label}</p>
      <p className="mt-1 text-body-medium font-semibold text-surface-800">{value}</p>
    </div>
  );
}

function PickupAddressCard({ title = 'Pickup address' }) {
  return (
    <Card variant="outlined" className="border border-surface-200 p-4 text-body">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-brand-700">
          <IconMapPin />
        </div>
        <div className="space-y-2">
          <p className="text-body-medium font-semibold text-surface-900">{title}</p>
          <p className="text-body text-surface-700">{PICKUP_DETAILS.lineOne}</p>
          <p className="text-caption text-surface-500">{PICKUP_DETAILS.lineTwo}</p>
        </div>
      </div>
    </Card>
  );
}

function PortalActionCard({ mode, title, subtitle, priceText, note, signedIn, active, onOpen, onSignIn }) {
  const isBuyNow = mode === 'buy-now';
  return (
    <Card
      variant="outlined"
      className={`border transition-all duration-fast ${
        active ? 'border-brand-300 bg-brand-50/60 shadow-sm' : 'border-surface-200 bg-surface-0'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className={`flex h-11 w-11 items-center justify-center rounded-full ${
          isBuyNow ? 'bg-success-50 text-success-700' : 'bg-brand-100 text-brand-800'
        }`}>
          {isBuyNow ? <IconBox /> : <IconCalendar />}
        </div>
        <Badge status={isBuyNow ? 'success' : 'warning'}>{isBuyNow ? 'Ready now' : 'Plan ahead'}</Badge>
      </div>
      <h3 className="mt-4 text-title font-semibold text-surface-900">{title}</h3>
      <p className="mt-2 text-body text-surface-600">{subtitle}</p>
      <div className="mt-4 rounded-md bg-surface-50 p-3">
        <p className="text-caption font-medium text-surface-500">Price</p>
        <p className="mt-1 text-body-medium font-semibold text-surface-900">{priceText}</p>
        <p className="mt-1 text-caption text-surface-500">{note}</p>
      </div>
      <div className="mt-5 flex gap-3">
        <Button variant="secondary" size="md" className="flex-1" onClick={onOpen}>
          {isBuyNow ? 'See what is ready now' : 'See upcoming batches'}
        </Button>
        <Button variant="primary" size="md" className="flex-1" onClick={onSignIn}>
          {signedIn ? (isBuyNow ? 'Buy now' : 'Book now') : (isBuyNow ? 'Sign in to buy' : 'Sign in to book')}
        </Button>
      </div>
    </Card>
  );
}

function PortalLanding({ activeTab, signedIn, onPickMode, onSignIn }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card variant="default" className="border border-surface-200 bg-gradient-to-br from-surface-0 via-brand-50 to-surface-50">
          <Badge status="warning">Fresh eggs, simple ordering</Badge>
          <h2 className="mt-4 text-display font-bold text-surface-900 max-w-2xl">
            Buy what is ready now, or lock in your upcoming batch before it arrives.
          </h2>
          <p className="mt-4 max-w-2xl text-body text-surface-600">
            Choose the path that fits your need today. Buy-now orders use retail price and are approved for pickup after successful card payment. Upcoming batch bookings use wholesale price and hold your crates once payment starts.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-surface-200 bg-surface-0 p-4">
              <div className="mb-2 text-brand-700"><IconBox /></div>
              <p className="text-body-medium font-semibold text-surface-900">Buy now</p>
              <p className="mt-1 text-caption text-surface-500">See only batches that are already received and ready to pickup.</p>
            </div>
            <div className="rounded-md border border-surface-200 bg-surface-0 p-4">
              <div className="mb-2 text-brand-700"><IconCalendar /></div>
              <p className="text-body-medium font-semibold text-surface-900">Book upcoming</p>
              <p className="mt-1 text-caption text-surface-500">Reserve crates early at wholesale price before the batch lands.</p>
            </div>
            <div className="rounded-md border border-surface-200 bg-surface-0 p-4">
              <div className="mb-2 text-brand-700"><IconClock /></div>
              <p className="text-body-medium font-semibold text-surface-900">Quick next steps</p>
              <p className="mt-1 text-caption text-surface-500">Pay by card or transfer. Card gives immediate payment result.</p>
            </div>
          </div>
        </Card>

        <div className="grid gap-4">
          <PortalActionCard
            mode="buy-now"
            title="Buy eggs now"
            subtitle="For eggs that are already available and can be picked up as soon as payment is approved."
            priceText="Retail price"
            note="Best for same-day or urgent pickup."
            signedIn={signedIn}
            active={activeTab === 'buy-now'}
            onOpen={() => onPickMode('buy-now')}
            onSignIn={() => onSignIn('buy-now')}
          />
          <PortalActionCard
            mode="book-upcoming"
            title="Book upcoming batch"
            subtitle="For eggs that are still on the way. Reserve your crates early and pay the booking amount now."
            priceText="Wholesale price"
            note="Best for planned restock and larger orders."
            signedIn={signedIn}
            active={activeTab === 'book-upcoming'}
            onOpen={() => onPickMode('book-upcoming')}
            onSignIn={() => onSignIn('book-upcoming')}
          />
        </div>
      </div>
    </div>
  );
}

function PaymentSuccessModal({ result, onClose }) {
  if (!result?.order) return null;
  const { order, message } = result;
  const isBuyNow = order.kind === 'BUY_NOW';
  const title = isBuyNow ? 'Payment confirmed' : 'Booking confirmed';
  const referenceLabel = isBuyNow ? 'Order number' : 'Booking number';

  return (
    <Modal title={title} open={true} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-md border border-success-200 bg-success-50 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 text-success-700"><IconCheck /></div>
            <div>
              <p className="text-body-medium font-semibold text-success-800">{message}</p>
              <p className="mt-1 text-caption text-success-700">
                Keep the {referenceLabel.toLowerCase()} below. You may need it when you come for pickup or when you contact the team.
              </p>
            </div>
          </div>
        </div>

        <Card variant="outlined" className="border-2 border-brand-300 bg-brand-50 p-4">
          <p className="text-caption font-medium uppercase tracking-wide text-brand-800">{referenceLabel}</p>
          <p className="mt-2 text-display font-bold text-surface-900">{order.reference || '—'}</p>
        </Card>

        <Card variant="outlined" className="border border-surface-200 p-4 text-body">
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric label="Batch" value={order.batch?.name || '—'} />
            <Metric label="Egg type" value={order.eggTypeLabel || order.batch?.eggTypeLabel || '—'} />
            <Metric label="Crates" value={`${fmt(order.quantity)} crates`} />
            <Metric label="Amount paid" value={fmtMoney(order.amountPaid)} />
            <Metric label="Payment remaining" value={fmtMoney(order.balance)} />
            <Metric label="Expected batch date" value={fmtDate(order.expectedDate)} />
            <Metric label="Pickup window start" value={fmtDateTime(order.pickupWindowStart)} />
            <Metric label="Pickup window end" value={fmtDateTime(order.pickupWindowEnd)} />
          </div>
        </Card>

        <Card variant="outlined" className="border border-info-200 bg-info-50 p-4">
          <p className="text-body-medium font-semibold text-info-900">What to do next</p>
          <div className="mt-3 space-y-2 text-body text-info-800">
            {isBuyNow ? (
              <>
                <p>1. Your eggs are approved for pickup from today until the next 3 days.</p>
                <p>2. Bring your order number when coming for pickup.</p>
                <p>3. If someone else is picking up for you, share the order number with them.</p>
              </>
            ) : (
              <>
                <p>1. Your booking has been saved and your crates are held for you.</p>
                <p>2. Keep your booking number safe for future reference.</p>
                <p>3. When the batch arrives, you can use this booking number for pickup and support.</p>
              </>
            )}
          </div>
        </Card>

        <PickupAddressCard title="Pickup address" />

        <Button variant="primary" size="lg" onClick={onClose} className="w-full">
          Done
        </Button>
      </div>
    </Modal>
  );
}

function BatchCard({ batch, actionLabel, helperText, priceLabel, onAction, disabled, batchMode }) {
  const primaryPrice = batchMode === 'buy-now' ? Number(batch.retailPrice) : Number(batch.wholesalePrice);
  const primaryPriceLabel = batchMode === 'buy-now' ? 'Retail' : 'Wholesale';

  return (
    <Card variant="outlined" className="border border-surface-200">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-overline text-brand-600">{batch.eggTypeLabel || 'Regular Size Eggs'}</p>
          <h3 className="mt-2 text-title text-surface-800">{batch.name}</h3>
          <p className="mt-1 text-body text-surface-500">{helperText}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-caption text-surface-500">{priceLabel}</p>
          <p className="mt-2 text-display text-surface-900">{fmtMoney(primaryPrice)}</p>
          <p className="text-caption text-surface-600">{primaryPriceLabel}</p>
          {batchMode === 'book-upcoming' && (
            <p className="mt-1 text-body-medium font-semibold text-warning-700">{fmtMoney(batch.retailPrice)} retail now</p>
          )}
        </div>
      </div>

      <div className={`rounded-md ${batchMode === 'buy-now' ? 'grid grid-cols-2' : 'grid grid-cols-3'} gap-3 bg-surface-50 p-3 mb-4`}>
        {batchMode === 'buy-now' ? (
          <>
            <Metric label="Available to buy" value={`${fmt(batch.availableForSale)} crates`} />
            <Metric label="Received" value={fmtDate(batch.receivedDate || batch.expectedDate)} />
          </>
        ) : (
          <>
            <Metric label="Available to book" value={`${fmt(batch.remainingAvailable)} crates`} />
            <Metric label="Already booked" value={`${fmt(batch.totalBooked)} crates`} />
            <Metric label="Expected date" value={fmtDate(batch.expectedDate)} />
          </>
        )}
      </div>

      <Button
        variant={disabled ? 'secondary' : 'primary'}
        size="lg"
        onClick={() => onAction(batch)}
        disabled={disabled}
        className="w-full"
      >
        {actionLabel}
      </Button>
    </Card>
  );
}

function PaymentMethodSelector({ paymentMethod, setPaymentMethod }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <button
        type="button"
        onClick={() => setPaymentMethod('CARD')}
        className={`p-4 rounded-md border transition-all duration-fast ${
          paymentMethod === 'CARD'
            ? 'border-brand-300 bg-brand-50'
            : 'border-surface-200 bg-surface-0 hover:border-brand-200'
        }`}
      >
        <div className="flex items-start gap-3">
          <IconCreditCard />
          <div className="text-left">
            <p className="text-body-medium font-semibold text-surface-800">Pay online with card</p>
            <p className="mt-1 text-caption text-surface-500">Pay now and get an immediate payment result.</p>
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={() => setPaymentMethod('TRANSFER')}
        className={`p-4 rounded-md border transition-all duration-fast ${
          paymentMethod === 'TRANSFER'
            ? 'border-brand-300 bg-brand-50'
            : 'border-surface-200 bg-surface-0 hover:border-brand-200'
        }`}
      >
        <div className="flex items-start gap-3">
          <IconBank />
          <div className="text-left">
            <p className="text-body-medium font-semibold text-surface-800">Pay by transfer</p>
            <p className="mt-1 text-caption text-surface-500">Your crates stay held while admin confirms the transfer.</p>
          </div>
        </div>
      </button>
    </div>
  );
}

function TransferInstructions({ amount, title = 'Transfer details' }) {
  return (
    <div className="rounded-md border border-warning-200 bg-warning-50 p-4">
      <p className="text-body-medium font-semibold text-surface-800">{title}</p>
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-body text-surface-600">Bank name</span>
          <span className="text-body-medium font-semibold text-surface-800">{TRANSFER_DETAILS.bankName}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-body text-surface-600">Account number</span>
          <span className="text-body-medium font-semibold text-surface-800">{TRANSFER_DETAILS.accountNumber}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-body text-surface-600">Account name</span>
          <span className="text-body-medium font-semibold text-surface-800">{TRANSFER_DETAILS.accountName}</span>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-warning-200">
          <span className="text-body font-semibold text-surface-700">Amount to transfer</span>
          <span className="text-title font-semibold text-success-700">{fmtMoney(amount)}</span>
        </div>
      </div>
    </div>
  );
}

function BookingCheckoutModal({ batch, profile, policy, onClose, onFinished }) {
  const [quantity, setQuantity] = useState('');
  const [amountToPay, setAmountToPay] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CARD');
  const [checkoutEmail, setCheckoutEmail] = useState(profile?.user?.email || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  const minPaymentPercent = Number(policy?.bookingMinimumPaymentPercent || 80);
  const orderLimitProfile = profile?.orderLimitProfile || null;
  const availableToBook = Number(batch.remainingAvailable || 0);
  const currentPerOrderLimit = Number(orderLimitProfile?.currentPerOrderLimit || policy?.maxBookingCratesPerOrder || 100);
  const maxQty = Math.min(availableToBook, currentPerOrderLimit);
  const quantityValue = parseInt(quantity, 10) || 0;
  const orderValue = quantityValue * Number(batch.wholesalePrice);
  const minPayment = orderValue * (minPaymentPercent / 100);
  const payNow = Number(amountToPay || 0);
  const balanceLeft = Math.max(0, orderValue - payNow);
  const quantityError = useMemo(() => {
    if (!quantity) return '';
    if (!Number.isInteger(quantityValue) || quantityValue < 1) {
      return 'Enter at least 1 crate.';
    }
    if (quantityValue > availableToBook) {
      return `Only ${fmt(availableToBook)} crates are still available to book.`;
    }
    if (quantityValue > currentPerOrderLimit) {
      return orderLimitProfile?.isUsingEarlyOrderLimit
        ? `Your first ${Number(orderLimitProfile.earlyOrderLimitCount || 0)} orders can be up to ${fmt(currentPerOrderLimit)} crates each.`
        : `You can book up to ${fmt(currentPerOrderLimit)} crates in one order.`;
    }
    return '';
  }, [quantity, quantityValue, availableToBook, currentPerOrderLimit, orderLimitProfile]);

  const paymentError = useMemo(() => {
    if (!amountToPay || quantityError) return '';
    if (payNow < minPayment) {
      return `You need to pay at least ${fmtMoney(minPayment)} now to continue.`;
    }
    if (payNow > orderValue) {
      return 'Amount to pay now cannot be more than the full booking value.';
    }
    return '';
  }, [amountToPay, payNow, minPayment, orderValue, quantityError]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (quantityError || paymentError) {
      setError(quantityError || paymentError);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await api.post('/portal/checkouts', {
        checkoutType: 'BOOK_UPCOMING',
        batchId: batch.id,
        quantity: quantityValue,
        amountToPay: payNow,
        paymentMethod,
        checkoutEmail: paymentMethod === 'CARD' ? checkoutEmail.trim() : undefined,
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
      <Modal title="Booking hold created" open={true} onClose={onClose}>
        <div className="space-y-4">
          <div className="rounded-md border border-success-200 bg-success-50 p-3 text-body text-success-700">
            {success.message}
          </div>
          <Card variant="outlined" className="border border-surface-200 p-4 text-body">
            <div className="space-y-2">
              <div className="flex items-center justify-between"><span className="text-surface-600">Batch</span><span className="font-semibold text-surface-900">{success.checkout.batch.name}</span></div>
              <div className="flex items-center justify-between"><span className="text-surface-600">Egg type</span><span className="font-semibold text-surface-900">{success.checkout.batch.eggTypeLabel}</span></div>
              <div className="flex items-center justify-between"><span className="text-surface-600">Crates held</span><span className="font-semibold text-surface-900">{success.checkout.quantity}</span></div>
              <div className="flex items-center justify-between"><span className="text-surface-600">Booking value</span><span className="font-semibold text-surface-900">{fmtMoney(success.checkout.orderValue)}</span></div>
              <div className="flex items-center justify-between"><span className="text-surface-600">Paying now</span><span className="font-semibold text-success-700">{fmtMoney(success.checkout.amountToPay)}</span></div>
              <div className="flex items-center justify-between"><span className="text-surface-600">Balance left</span><span className="font-semibold text-surface-900">{fmtMoney(success.checkout.balanceAfterPayment)}</span></div>
            </div>
          </Card>
          <TransferInstructions amount={success.checkout.amountToPay} />
          <Button variant="primary" size="lg" onClick={() => { onFinished(); onClose(); }} className="w-full">
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Book upcoming batch" open={true} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-md border border-info-200 bg-info-50 p-3 text-body text-info-700">
          Your crates will be held as soon as you continue. Card payment confirms the payment immediately. Transfer keeps the hold while admin confirms the transfer.
        </div>

        <Card variant="outlined" className="border border-surface-200 p-4 text-body">
          <div className="space-y-2">
            <div className="flex items-center justify-between"><span className="text-surface-600">Batch</span><span className="font-semibold text-surface-900">{batch.name}</span></div>
            <div className="flex items-center justify-between"><span className="text-surface-600">Egg type</span><span className="font-semibold text-surface-900">{batch.eggTypeLabel}</span></div>
            <div className="flex items-center justify-between"><span className="text-surface-600">Expected date</span><span className="font-semibold text-surface-900">{fmtDate(batch.expectedDate)}</span></div>
            <div className="flex items-center justify-between"><span className="text-surface-600">Available to book</span><span className="font-semibold text-surface-900">{fmt(batch.remainingAvailable)} crates</span></div>
            {orderLimitProfile?.isUsingEarlyOrderLimit && (
              <div className="mt-2 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-caption text-warning-800">
                Your first {Number(orderLimitProfile.earlyOrderLimitCount || 0)} orders can be up to {Number(orderLimitProfile.currentPerOrderLimit || 0)} crates each. You have {Number(orderLimitProfile.earlyOrdersRemaining || 0)} order{Number(orderLimitProfile.earlyOrdersRemaining || 0) === 1 ? '' : 's'} left at this limit.
              </div>
            )}
          </div>
        </Card>

        {error && (
          <div className="rounded-md border border-error-200 bg-error-50 p-3 text-body text-error-700">
            {error}
          </div>
        )}

        <Input
          label="How many crates do you want?"
          type="number"
          min="1"
          max={maxQty}
          required
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          hint={`You can book up to ${maxQty} crates in this step.`}
        />

        {quantityError ? (
          <div className="rounded-md border border-warning-200 bg-warning-50 p-3 text-body text-warning-800">
            {quantityError}
          </div>
        ) : quantityValue > 0 ? (
          <div className="rounded-md border border-success-200 bg-success-50 p-3 text-body text-success-800">
            {fmt(quantityValue)} crates are available for this booking.
          </div>
        ) : null}

        {quantityValue > 0 && (
          <Card variant="tinted" tint="bg-success-50" className="p-4 text-body">
            <div className="space-y-2">
              <div className="flex items-center justify-between"><span className="text-surface-600">Booking value</span><span className="font-semibold text-surface-900">{fmtMoney(orderValue)}</span></div>
              <div className="flex items-center justify-between"><span className="text-surface-600">Minimum payment now</span><span className="font-semibold text-surface-900">{fmtMoney(minPayment)}</span></div>
            </div>
          </Card>
        )}

        <Input
          label="How much do you want to pay now?"
          type="number"
          min={minPayment || 0}
          max={orderValue || undefined}
          step="0.01"
          required
          value={amountToPay}
          onChange={(e) => setAmountToPay(e.target.value)}
          hint={`Minimum is ${minPaymentPercent}% of the booking value.`}
        />

        {paymentError ? (
          <div className="rounded-md border border-warning-200 bg-warning-50 p-3 text-body text-warning-800">
            {paymentError}
          </div>
        ) : null}

        {payNow > 0 && (
          <Card variant="outlined" className="border border-surface-200 p-4 text-body">
            <div className="space-y-2">
              <div className="flex items-center justify-between"><span className="text-surface-600">Paying now</span><span className="font-semibold text-surface-900">{fmtMoney(payNow)}</span></div>
              <div className="flex items-center justify-between"><span className="text-surface-600">Balance left after this payment</span><span className="font-semibold text-surface-900">{fmtMoney(balanceLeft)}</span></div>
            </div>
          </Card>
        )}

        <div>
          <p className="text-body-medium font-semibold text-surface-700 mb-3">Choose payment method</p>
          <PaymentMethodSelector paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} />
        </div>

        {paymentMethod === 'TRANSFER' && payNow > 0 && (
          <TransferInstructions amount={payNow} title="Transfer to this account after you continue" />
        )}

        {paymentMethod === 'CARD' && (
          <Input
            label="Email for card payment"
            type="email"
            required
            value={checkoutEmail}
            onChange={(e) => setCheckoutEmail(e.target.value)}
            placeholder="you@example.com"
            hint="Paystack needs a real email address for card checkout. You can type one here even if your portal account was created without email."
          />
        )}

        <div className="flex gap-3 pt-4">
          <Button variant="secondary" size="lg" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            loading={loading}
            disabled={quantityValue < 1 || payNow <= 0 || Boolean(quantityError) || Boolean(paymentError)}
            className="flex-1"
          >
            {paymentMethod === 'CARD' ? 'Continue to card payment' : 'Hold crates and pay by transfer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function BuyNowCheckoutModal({ batch, profile, policy, onClose, onFinished }) {
  const [quantity, setQuantity] = useState('1');
  const [paymentMethod, setPaymentMethod] = useState('CARD');
  const [checkoutEmail, setCheckoutEmail] = useState(profile?.user?.email || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  const quantityValue = parseInt(quantity, 10) || 0;
  const unitPrice = Number(batch.retailPrice);
  const orderLimitProfile = profile?.orderLimitProfile || null;
  const availableToBuy = Number(batch.availableForSale || 0);
  const currentPerOrderLimit = Number(orderLimitProfile?.currentPerOrderLimit || policy?.maxBookingCratesPerOrder || 100);
  const maxQty = Math.min(availableToBuy, currentPerOrderLimit);
  const orderValue = quantityValue * unitPrice;
  const quantityError = useMemo(() => {
    if (!quantity) return '';
    if (!Number.isInteger(quantityValue) || quantityValue < 1) {
      return 'Enter at least 1 crate.';
    }
    if (quantityValue > availableToBuy) {
      return `Only ${fmt(availableToBuy)} crates are still available to buy.`;
    }
    if (quantityValue > currentPerOrderLimit) {
      return orderLimitProfile?.isUsingEarlyOrderLimit
        ? `Your first ${Number(orderLimitProfile.earlyOrderLimitCount || 0)} orders can be up to ${fmt(currentPerOrderLimit)} crates each.`
        : `You can buy up to ${fmt(currentPerOrderLimit)} crates in one order.`;
    }
    return '';
  }, [quantity, quantityValue, availableToBuy, currentPerOrderLimit, orderLimitProfile]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (quantityError) {
      setError(quantityError);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await api.post('/portal/checkouts', {
        checkoutType: 'BUY_NOW',
        batchId: batch.id,
        quantity: quantityValue,
        paymentMethod,
        checkoutEmail: paymentMethod === 'CARD' ? checkoutEmail.trim() : undefined,
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
      <Modal title="Crates held for transfer" open={true} onClose={onClose}>
        <div className="space-y-4">
          <div className="rounded-md border border-success-200 bg-success-50 p-3 text-body text-success-700">
            {success.message}
          </div>
          <Card variant="outlined" className="border border-surface-200 p-4 text-body">
            <div className="space-y-2">
              <div className="flex items-center justify-between"><span className="text-surface-600">Batch</span><span className="font-semibold text-surface-900">{success.checkout.batch.name}</span></div>
              <div className="flex items-center justify-between"><span className="text-surface-600">Egg type</span><span className="font-semibold text-surface-900">{success.checkout.batch.eggTypeLabel}</span></div>
              <div className="flex items-center justify-between"><span className="text-surface-600">Crates held</span><span className="font-semibold text-surface-900">{success.checkout.quantity}</span></div>
              <div className="flex items-center justify-between"><span className="text-surface-600">Total to pay</span><span className="font-semibold text-success-700">{fmtMoney(success.checkout.amountToPay)}</span></div>
            </div>
          </Card>
          <TransferInstructions amount={success.checkout.amountToPay} />
          <div className="rounded-md border border-info-200 bg-info-50 p-3 text-body text-info-700">
            Once the transfer is confirmed, your eggs will be approved for pickup from today until the next 3 days.
          </div>
          <Button variant="primary" size="lg" onClick={() => { onFinished(); onClose(); }} className="w-full">
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Buy eggs now" open={true} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-md border border-warning-200 bg-warning-50 p-3 text-body text-warning-800">
          Your crates will be held as soon as you continue. Card payment approves the order for pickup immediately. Transfer keeps the crates held while admin confirms the transfer.
        </div>

        <Card variant="outlined" className="border border-surface-200 p-4 text-body">
          <div className="space-y-2">
            <div className="flex items-center justify-between"><span className="text-surface-600">Batch</span><span className="font-semibold text-surface-900">{batch.name}</span></div>
            <div className="flex items-center justify-between"><span className="text-surface-600">Egg type</span><span className="font-semibold text-surface-900">{batch.eggTypeLabel}</span></div>
            <div className="flex items-center justify-between"><span className="text-surface-600">Available to buy</span><span className="font-semibold text-surface-900">{fmt(batch.availableForSale)} crates</span></div>
            <div className="flex items-center justify-between"><span className="text-surface-600">Received</span><span className="font-semibold text-surface-900">{fmtDate(batch.receivedDate || batch.expectedDate)}</span></div>
          </div>
        </Card>

        {orderLimitProfile?.isUsingEarlyOrderLimit && (
          <div className="rounded-md border border-warning-200 bg-warning-50 p-3 text-body text-warning-800">
            Your first {Number(orderLimitProfile.earlyOrderLimitCount || 0)} orders can be up to {Number(orderLimitProfile.currentPerOrderLimit || 0)} crates each. You have {Number(orderLimitProfile.earlyOrdersRemaining || 0)} order{Number(orderLimitProfile.earlyOrdersRemaining || 0) === 1 ? '' : 's'} left at this limit.
          </div>
        )}

        {error && (
          <div className="rounded-md border border-error-200 bg-error-50 p-3 text-body text-error-700">
            {error}
          </div>
        )}

        <Input
          label="How many crates do you want to buy?"
          type="number"
          min="1"
          max={maxQty}
          required
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          hint={`You can buy up to ${fmt(maxQty)} crates right now.`}
        />

        {quantityError ? (
          <div className="rounded-md border border-warning-200 bg-warning-50 p-3 text-body text-warning-800">
            {quantityError}
          </div>
        ) : quantityValue > 0 ? (
          <div className="rounded-md border border-success-200 bg-success-50 p-3 text-body text-success-800">
            {fmt(quantityValue)} crates are available to buy right now.
          </div>
        ) : null}

        <Card variant="tinted" tint="bg-success-50" className="p-4 text-body">
          <div className="space-y-2">
            <div className="flex items-center justify-between"><span className="text-surface-600">Price per crate</span><span className="font-semibold text-surface-900">{fmtMoney(unitPrice)}</span></div>
            <div className="flex items-center justify-between"><span className="text-surface-600">Price used</span><span className="font-semibold text-surface-900">Retail price</span></div>
            <div className="flex items-center justify-between pt-2 border-t border-success-200"><span className="text-surface-700 font-semibold">Total to pay</span><span className="text-title font-semibold text-surface-900">{fmtMoney(orderValue)}</span></div>
          </div>
        </Card>

        <div>
          <p className="text-body-medium font-semibold text-surface-700 mb-3">Choose payment method</p>
          <PaymentMethodSelector paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} />
        </div>

        {paymentMethod === 'TRANSFER' && orderValue > 0 && (
          <TransferInstructions amount={orderValue} title="Transfer to this account after you continue" />
        )}

        {paymentMethod === 'CARD' && (
          <Input
            label="Email for card payment"
            type="email"
            required
            value={checkoutEmail}
            onChange={(e) => setCheckoutEmail(e.target.value)}
            placeholder="you@example.com"
            hint="Paystack needs a real email address for card checkout. You can type one here even if your portal account was created without email."
          />
        )}

        <div className="flex gap-3 pt-4">
          <Button variant="secondary" size="lg" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            loading={loading}
            disabled={quantityValue < 1 || Boolean(quantityError)}
            className="flex-1"
          >
            {paymentMethod === 'CARD' ? 'Continue to card payment' : 'Hold crates and pay by transfer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function getOrderStatus(order) {
  if (order.kind === 'BOOKING') {
    if (order.source === 'BOOKING_CHECKOUT') {
      if (order.status === 'AWAITING_PAYMENT') return { label: 'Waiting for card payment', tone: 'warning' };
      if (order.status === 'AWAITING_TRANSFER') return { label: 'Waiting for transfer confirmation', tone: 'info' };
      if (order.status === 'FAILED') return { label: 'Payment failed', tone: 'error' };
      if (order.status === 'PAID') return { label: 'Booking confirmed', tone: 'success' };
      if (order.status === 'PICKED_UP') return { label: 'Completed', tone: 'success' };
      if (order.status === 'CANCELLED') return { label: 'Cancelled', tone: 'error' };
    } else {
      if (order.status === 'CONFIRMED' && order.batchArrived) return { label: 'Batch has arrived', tone: 'success' };
      if (order.status === 'CONFIRMED') return { label: 'Booking confirmed', tone: 'success' };
      if (order.status === 'PICKED_UP') return { label: 'Picked up', tone: 'neutral' };
      if (order.status === 'CANCELLED') return { label: 'Cancelled', tone: 'error' };
    }
  }
  if (order.kind === 'BUY_NOW') {
    if (order.source === 'BUY_NOW_CHECKOUT') {
      if (order.status === 'AWAITING_PAYMENT') return { label: 'Waiting for card payment', tone: 'warning' };
      if (order.status === 'AWAITING_TRANSFER') return { label: 'Waiting for transfer confirmation', tone: 'info' };
      if (order.status === 'FAILED') return { label: 'Payment failed', tone: 'error' };
      if (order.status === 'CANCELLED') return { label: 'Cancelled', tone: 'error' };
    }
    if (order.status === 'APPROVED_FOR_PICKUP') return { label: 'Approved for pickup', tone: 'success' };
    if (order.status === 'AWAITING_TRANSFER') return { label: 'Waiting for transfer', tone: 'warning' };
    if (order.status === 'PICKED_UP') return { label: 'Picked up', tone: 'neutral' };
    if (order.status === 'CANCELLED') return { label: 'Cancelled', tone: 'error' };
  }
  return { label: 'Pending', tone: 'warning' };
}

function getOrderPaymentText(order) {
  if (order.paymentMethod === 'CARD') return 'Card payment';
  if (order.paymentMethod === 'TRANSFER') return 'Bank transfer';
  if (order.paymentMethod === 'CASH') return 'Cash payment';
  return 'Payment method unknown';
}

function getOrderNextStep(order) {
  if (order.kind === 'BOOKING') {
    if (order.source === 'BOOKING_CHECKOUT') {
      if (order.status === 'AWAITING_PAYMENT') return 'Complete your card payment to confirm the hold.';
      if (order.status === 'AWAITING_TRANSFER') return `Transfer ${fmtMoney(order.amountToPay || order.orderValue)} and wait for admin confirmation.`;
      if (order.status === 'FAILED') return 'This payment was not completed. You can try again.';
      if (order.status === 'PICKED_UP') return 'Your eggs have been picked up.';
    } else {
      if (order.status === 'CONFIRMED' && order.batchArrived) return 'Your batch has arrived. Please come for pickup.';
      if (order.status === 'CONFIRMED') return `Your booking is confirmed. Expected on ${fmtDate(order.batch.expectedDate)}.`;
      if (order.status === 'PICKED_UP') return 'Your eggs have been picked up.';
    }
  }
  if (order.kind === 'BUY_NOW') {
    if (order.source === 'BUY_NOW_CHECKOUT') {
      if (order.status === 'AWAITING_PAYMENT') return 'Complete your card payment to hold and approve this order.';
      if (order.status === 'AWAITING_TRANSFER') return `Transfer ${fmtMoney(order.amountToPay || order.orderValue)} and wait for admin confirmation.`;
      if (order.status === 'FAILED') return 'This payment was not completed. You can try again.';
    }
    if (order.status === 'APPROVED_FOR_PICKUP') return 'Your eggs are ready for pickup from today until the next 3 days.';
    if (order.status === 'PICKED_UP') return 'Your eggs have been picked up.';
  }
  return 'Your order is being processed.';
}

function OrderDetailModal({ order, onClose }) {
  if (!order) return null;
  const status = getOrderStatus(order);
  const paymentText = getOrderPaymentText(order);
  const nextStep = getOrderNextStep(order);

  return (
    <Modal title="Order details" open={true} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-caption text-surface-500">{order.kind === 'BOOKING' ? 'Upcoming booking' : 'Buy now order'}</p>
            <h3 className="mt-1 text-title font-semibold text-surface-900">{order.batch?.name || 'Order'}</h3>
          </div>
          <Badge status={status.tone}>{status.label}</Badge>
        </div>

        <Card variant="outlined" className="border border-surface-200 p-4 text-body">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Metric label="Egg type" value={order.eggTypeLabel || order.batch?.eggTypeLabel || '—'} />
            <Metric label="Quantity" value={`${fmt(order.quantity)} crates`} />
            <Metric label="Order value" value={fmtMoney(order.orderValue)} />
            <Metric label="Payment made" value={fmtMoney(order.amountPaid)} />
            <Metric label="Payment remaining" value={fmtMoney(order.balance)} />
            <Metric label="Payment progress" value={`${Number(order.paymentPercent || 0)}%`} />
            <Metric label="Payment method" value={paymentText} />
            <Metric label="Price used" value={order.priceType === 'WHOLESALE' ? 'Wholesale' : order.priceType === 'RETAIL' ? 'Retail' : '—'} />
          </div>
        </Card>

        <Card variant="outlined" className="border border-surface-200 p-4 text-body">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Metric label="Order date" value={fmtDateTime(order.createdAt)} />
            <Metric label="Last updated" value={fmtDateTime(order.updatedAt)} />
            <Metric label="Expected batch date" value={fmtDate(order.expectedDate)} />
            <Metric label="Batch arrival" value={order.batchArrived ? fmtDate(order.batchArrivalDate || order.batch?.receivedDate) : 'Not arrived yet'} />
            <Metric label="Pickup window start" value={fmtDateTime(order.pickupWindowStart)} />
            <Metric label="Pickup window end" value={fmtDateTime(order.pickupWindowEnd)} />
            <Metric label="Payment window ends" value={fmtDateTime(order.paymentWindowEndsAt)} />
            <Metric label="Reference" value={order.reference || '—'} />
          </div>
        </Card>

        <div className="rounded-md border border-info-200 bg-info-50 p-3 text-body text-info-700">
          {nextStep}
        </div>

        {order.notes ? (
          <Card variant="outlined" className="border border-surface-200 p-4 text-body">
            <p className="text-caption text-surface-500 mb-1">Notes</p>
            <p className="text-body text-surface-800">{order.notes}</p>
          </Card>
        ) : null}

        <Button variant="primary" size="lg" onClick={onClose} className="w-full">
          Close
        </Button>
      </div>
    </Modal>
  );
}

function MyActivity({ orders, loading, onOpenOrder }) {
  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-body text-surface-500">Loading your activity...</p>
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <EmptyState
        icon={<IconBox className="w-12 h-12" />}
        title="No previous orders yet"
        description="You have not placed any bookings or purchases yet. Browse available batches to get started."
      />
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => {
        const status = getOrderStatus(order);
        const paymentText = getOrderPaymentText(order);
        const nextStep = getOrderNextStep(order);
        const batchDate = order.batch?.expectedDate || order.batch?.receivedDate;

        return (
          <Card
            key={order.id}
            variant="outlined"
            className="border border-surface-200 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => onOpenOrder?.(order)}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h4 className="text-body-medium font-semibold text-surface-800">{order.batch?.name || 'Order'}</h4>
                  <Badge status={status.tone}>{status.label}</Badge>
                </div>
                <p className="text-caption text-surface-600 mb-2">{order.kind === 'BOOKING' ? `Booking for ${order.quantity} crates` : `Purchase of ${order.quantity} crates`}</p>
                <p className="text-caption text-surface-500">{nextStep}</p>
                <div className="mt-2 flex items-center gap-4 text-caption text-surface-500">
                  <span>{paymentText}</span>
                  <span>{fmtDate(order.createdAt)}</span>
                  {order.batchArrived ? <span>Batch arrived</span> : null}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-title font-semibold text-surface-900">{fmtMoney(order.orderValue || 0)}</p>
                <p className="mt-1 text-caption text-brand-700">Open details</p>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function OpenBatchesView({ batches, loading, browseMode, signedIn, onRequireAuth, onBooking, onBuyNow }) {
  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-body text-surface-500">Loading available batches...</p>
      </div>
    );
  }

  if (!batches || batches.length === 0) {
    return (
      <EmptyState
        icon={<IconBox className="w-12 h-12" />}
        title="No batches available"
        description="Check back soon for fresh batches of eggs. We'll notify you when new batches arrive."
      />
    );
  }

  const upcomingBatches = batches.filter((b) => b.status === 'OPEN');
  const buyNowBatches = batches.filter((b) => b.status === 'RECEIVED');

  function handleAction(mode, batch) {
    if (!signedIn) {
      onRequireAuth?.(mode);
      return;
    }

    if (mode === 'buy-now') onBuyNow(batch);
    else onBooking(batch);
  }

  return (
    <div className="space-y-8">
      {browseMode === 'book-upcoming' && (
        <div>
          <h3 className="text-heading text-surface-800 mb-4">Book upcoming batch</h3>
          {upcomingBatches.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {upcomingBatches.map((batch) => (
                <BatchCard
                  key={batch.id}
                  batch={batch}
                  actionLabel={signedIn ? 'Book now' : 'Sign in to book'}
                  helperText="Expected soon"
                  priceLabel="Wholesale"
                  onAction={() => handleAction('book-upcoming', batch)}
                  disabled={false}
                  batchMode="book-upcoming"
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<IconBox className="w-12 h-12" />}
              title="No open batches for booking"
              description="There are no upcoming batches open for booking right now. Please check back later."
            />
          )}
        </div>
      )}

      {browseMode === 'buy-now' && (
        <div>
          <h3 className="text-heading text-surface-800 mb-4">Buy eggs now</h3>
          {buyNowBatches.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {buyNowBatches.map((batch) => (
                <BatchCard
                  key={batch.id}
                  batch={batch}
                  actionLabel={signedIn ? 'Buy now' : 'Sign in to buy'}
                  helperText="Ready to pickup"
                  priceLabel="Retail"
                  onAction={() => handleAction('buy-now', batch)}
                  disabled={batch.availableForSale <= 0}
                  batchMode="buy-now"
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<IconBox className="w-12 h-12" />}
              title="No eggs ready right now"
              description="There are no currently available batches to buy right now. You can check the upcoming batches instead."
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function Portal() {
  const { user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [orders, setOrders] = useState([]);
  const [profile, setProfile] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem('portalBrowseMode') || 'buy-now');
  const [showAuthPage, setShowAuthPage] = useState(false);
  const [authIntent, setAuthIntent] = useState(() => sessionStorage.getItem('portalBrowseMode') || 'buy-now');
  const [selectedBatchForBooking, setSelectedBatchForBooking] = useState(null);
  const [selectedBatchForBuyNow, setSelectedBatchForBuyNow] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [paymentResult, setPaymentResult] = useState(null);
  const [paymentVerification, setPaymentVerification] = useState({ loading: false, error: '' });
  const handledReferenceRef = useRef(null);

  function openAuth(mode) {
    sessionStorage.setItem('portalBrowseMode', mode);
    setActiveTab(mode);
    setAuthIntent(mode);
    setShowAuthPage(true);
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [upcomingRes, availableNowRes, ordersRes, profileRes] = await Promise.all([
        api.get('/portal/batches'),
        api.get('/portal/available-now'),
        user ? api.get('/portal/orders') : Promise.resolve({ orders: [] }),
        user ? api.get('/portal/profile') : Promise.resolve(null),
      ]);
      setBatches([...(upcomingRes.batches || []), ...(availableNowRes.batches || [])]);
      setOrders(ordersRes.orders || []);
      setProfile(profileRes);
      setPolicy(upcomingRes.policy || availableNowRes.policy || null);
    } catch (err) {
      console.error('Failed to load portal data:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    sessionStorage.setItem('portalBrowseMode', activeTab === 'orders' ? authIntent : activeTab);
  }, [activeTab, authIntent]);

  useEffect(() => {
    if (!user) return;

    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference') || params.get('trxref');
    if (!reference || handledReferenceRef.current === reference) return;

    handledReferenceRef.current = reference;
    setPaymentVerification({ loading: true, error: '' });

    api.post('/portal/checkouts/verify-card', { reference })
      .then((response) => {
        setPaymentResult(response);
        setPaymentVerification({ loading: false, error: '' });
        setActiveTab(response.order?.kind === 'BOOKING' ? 'book-upcoming' : 'buy-now');
        loadData();
      })
      .catch((err) => {
        setPaymentVerification({
          loading: false,
          error: err.error || 'Could not confirm this card payment yet. Please refresh and try again.',
        });
      })
      .finally(() => {
        window.history.replaceState({}, document.title, window.location.pathname);
      });
  }, [user, loadData]);

  if (!user && showAuthPage) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-surface-50 via-surface-0 to-brand-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <h1 className="text-display font-bold text-surface-900 mb-2">Fresh Eggs Market</h1>
            <p className="text-body text-surface-600">
              {authIntent === 'book-upcoming'
                ? 'Sign in to book an upcoming batch at wholesale price.'
                : 'Sign in to buy eggs that are ready now at retail price.'}
            </p>
          </div>
          <AuthPanel
            onAuth={(userData) => {
              localStorage.setItem('user', JSON.stringify(userData));
              window.location.reload();
            }}
          />
          <div className="text-center">
            <button
              type="button"
              onClick={() => setShowAuthPage(false)}
              className="text-body-medium font-medium text-brand-700 hover:text-brand-800"
            >
              Back to home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isPublic = !user;
  const browseMode = activeTab === 'orders' ? authIntent : activeTab;

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface-50 via-surface-0 to-brand-50">
      <div className="border-b border-surface-200 bg-surface-0 sticky top-0 z-40 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-title font-bold text-surface-900">Fresh Eggs Market</h1>
              <p className="text-caption text-surface-600">
                {user
                  ? `Welcome back, ${profileDisplayName(profile, user)}`
                  : 'See what is available first. Sign in only when you are ready to buy or book.'}
              </p>
            </div>
            {user ? (
              <Button
                variant="ghost"
                size="md"
                onClick={() => {
                  localStorage.removeItem('user');
                  api.setTokens(null, null);
                  window.location.reload();
                }}
              >
                Sign out
              </Button>
            ) : (
              <Button variant="primary" size="md" onClick={() => openAuth(browseMode)}>
                {browseMode === 'book-upcoming' ? 'Sign in to book' : 'Sign in to buy'}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        {paymentVerification.loading ? (
          <div className="rounded-md border border-info-200 bg-info-50 p-3 text-body text-info-700">
            Confirming your card payment...
          </div>
        ) : null}

        {paymentVerification.error ? (
          <div className="rounded-md border border-error-200 bg-error-50 p-3 text-body text-error-700">
            {paymentVerification.error}
          </div>
        ) : null}

        {isPublic ? (
          <>
            <PortalLanding
              activeTab={browseMode}
              signedIn={false}
              onPickMode={setActiveTab}
              onSignIn={openAuth}
            />

            <section className="space-y-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-heading text-surface-900">
                    {browseMode === 'book-upcoming' ? 'Upcoming batches open for booking' : 'Batches available to buy now'}
                  </h2>
                  <p className="mt-1 text-body text-surface-600">
                    {browseMode === 'book-upcoming'
                      ? 'Wholesale price applies here. Sign in when you are ready to pay and hold your crates.'
                      : 'Retail price applies here. Sign in when you are ready to pay and approve pickup.'}
                  </p>
                </div>
              </div>

              <OpenBatchesView
                batches={batches}
                loading={loading}
                browseMode={browseMode}
                signedIn={false}
                onRequireAuth={openAuth}
                onBooking={(batch) => setSelectedBatchForBooking(batch)}
                onBuyNow={(batch) => setSelectedBatchForBuyNow(batch)}
              />
            </section>
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveTab('buy-now')}
                className={`px-4 py-2.5 rounded-md text-body-medium font-medium transition-all duration-fast ${
                  activeTab === 'buy-now'
                    ? 'bg-brand-500 text-surface-900 shadow-xs'
                    : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                }`}
              >
                Buy now
              </button>
              <button
                onClick={() => setActiveTab('book-upcoming')}
                className={`px-4 py-2.5 rounded-md text-body-medium font-medium transition-all duration-fast ${
                  activeTab === 'book-upcoming'
                    ? 'bg-brand-500 text-surface-900 shadow-xs'
                    : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                }`}
              >
                Book upcoming
              </button>
              <button
                onClick={() => setActiveTab('orders')}
                className={`px-4 py-2.5 rounded-md text-body-medium font-medium transition-all duration-fast ${
                  activeTab === 'orders'
                    ? 'bg-brand-500 text-surface-900 shadow-xs'
                    : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                }`}
              >
                My Orders
              </button>
            </div>

            {activeTab === 'orders' ? (
              <div>
                <h2 className="text-heading text-surface-800 mb-4">Your orders</h2>
                <MyActivity orders={orders} loading={loading} onOpenOrder={setSelectedOrder} />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h2 className="text-heading text-surface-900">
                    {activeTab === 'book-upcoming' ? 'Book upcoming batch' : 'Buy eggs now'}
                  </h2>
                  <p className="mt-1 text-body text-surface-600">
                    {activeTab === 'book-upcoming'
                      ? 'Choose an open batch, enter how many crates you want, and pay the booking amount now.'
                      : 'Choose a ready batch, pay the retail price, and get approved for pickup after payment confirmation.'}
                  </p>
                </div>
                <OpenBatchesView
                  batches={batches}
                  loading={loading}
                  browseMode={activeTab}
                  signedIn={true}
                  onRequireAuth={openAuth}
                  onBooking={(batch) => setSelectedBatchForBooking(batch)}
                  onBuyNow={(batch) => setSelectedBatchForBuyNow(batch)}
                />
              </div>
            )}
          </>
        )}
      </div>

      {selectedBatchForBooking && (
        <BookingCheckoutModal
          batch={selectedBatchForBooking}
          profile={profile}
          policy={policy}
          onClose={() => setSelectedBatchForBooking(null)}
          onFinished={() => loadData()}
        />
      )}

      {selectedBatchForBuyNow && (
        <BuyNowCheckoutModal
          batch={selectedBatchForBuyNow}
          profile={profile}
          policy={policy}
          onClose={() => setSelectedBatchForBuyNow(null)}
          onFinished={() => loadData()}
        />
      )}

      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}

      {paymentResult && (
        <PaymentSuccessModal
          result={paymentResult}
          onClose={() => setPaymentResult(null)}
        />
      )}
    </div>
  );
}
