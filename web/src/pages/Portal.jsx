import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { Button, Input, Modal, Card, Badge, EmptyState } from '../components/ui';

/* ─── Formatters ─── */
const fmt = (n) => Number(n || 0).toLocaleString('en-NG');
const fmtMoney = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 0 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

const isPaystackReadyEmail = (value) => {
  const email = String(value || '').trim().toLowerCase();
  if (!email) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  if (email.endsWith('.local')) return false;
  if (email.endsWith('@localhost')) return false;
  return true;
};

/* ─── Constants ─── */
const TRANSFER_DETAILS = {
  bankName: 'Providus Bank',
  accountNumber: '5401952310',
  accountName: 'Fresh Egg Wholesales Market',
};

const PICKUP_DETAILS = {
  lineOne: 'Spring Valley Estate, Alasia Bus Stop, Lekki-Epe ExpressWay, Lagos, Nigeria',
  lineTwo: 'Immediately after Sunbeth Energies Filling Station, Before Dominion City Church, Before Lagos Business School, Lekki-Epe ExpressWay',
};

const WHATSAPP_NUMBER = '2349160007184';
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Hello, I have a question about my egg order.')}`;

function profileDisplayName(profile, user) {
  if (profile?.customer?.name) return profile.customer.name;
  const fullName = [profile?.user?.firstName, profile?.user?.lastName].filter(Boolean).join(' ').trim();
  if (fullName) return fullName;
  const fallbackUser = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  return fallbackUser || user?.phone || user?.email || 'Customer';
}

/* ─── Icons (20×20 stroke) ─── */
const Icon = {
  whatsapp: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  ),
  egg: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22c4.418 0 8-4.03 8-9s-3.582-11-8-11S4 8.03 4 13s3.582 9 8 9z" />
    </svg>
  ),
  truck: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" rx="1" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  ),
  check: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  clock: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  mapPin: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  ),
  creditCard: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  ),
  bank: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18M3 10h18M5 6l7-3 7 3" /><path d="M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" />
    </svg>
  ),
  package: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  arrowRight: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  ),
  user: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  ),
  logout: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  chevronDown: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  filter: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  ),
  refresh: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
    </svg>
  ),
};

/* ─── Shared micro-components ─── */

function Metric({ label, value, className = '' }) {
  return (
    <div className={className}>
      <p className="text-caption text-surface-500">{label}</p>
      <p className="mt-0.5 text-body-medium text-surface-800">{value}</p>
    </div>
  );
}

function StatusDot({ tone }) {
  const colors = {
    success: 'bg-success-500',
    warning: 'bg-warning-500',
    error: 'bg-error-500',
    info: 'bg-info-500',
    neutral: 'bg-surface-400',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[tone] || colors.neutral}`} />;
}

function AvailabilityBar({ used, total, className = '' }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const remaining = total - used;
  const urgency = pct > 80 ? 'bg-error-500' : pct > 50 ? 'bg-warning-500' : 'bg-success-500';
  return (
    <div className={className}>
      <div className="flex items-center justify-between text-caption text-surface-600 mb-1">
        <span>{fmt(remaining)} available</span>
        <span>{Math.round(pct)}% taken</span>
      </div>
      <div className="h-1.5 bg-surface-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-normal ${urgency}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ─── WhatsApp FAB ─── */
function WhatsAppFAB() {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-[#25D366] text-white pl-4 pr-5 py-3 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-normal"
      aria-label="Chat on WhatsApp"
    >
      {Icon.whatsapp}
      <span className="text-body-medium font-medium hidden sm:inline">Need help?</span>
    </a>
  );
}

/* ═══════════════════════════════════════════════════════
   AUTH MODAL — stays overlaid, doesn't lose context
   ═══════════════════════════════════════════════════════ */
function AuthModal({ open, onClose, onAuth, intent }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', phone: '', identifier: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setError(''); }
  }, [open, mode]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = mode === 'register'
        ? await api.post('/portal/register', form)
        : await api.post('/auth/login', { identifier: form.identifier, password: form.password });
      api.setTokens(res.accessToken, res.refreshToken);
      localStorage.setItem('user', JSON.stringify(res.user));
      onAuth(res.user);
    } catch (err) {
      setError(err?.error || err?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <Modal title={mode === 'login' ? 'Sign in to continue' : 'Create your account'} open={open} onClose={onClose}>
      <div className="space-y-5">
        {intent && (
          <p className="text-body text-surface-600">
            {intent === 'book-upcoming'
              ? 'Sign in to book an upcoming batch at wholesale price.'
              : 'Sign in to buy eggs that are ready for pickup.'}
          </p>
        )}

        {/* Tab toggle */}
        <div className="flex gap-1 p-1 bg-surface-100 rounded-md">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(''); }}
            className={`flex-1 py-2 rounded-sm text-caption-medium font-medium transition-all duration-fast ${
              mode === 'login' ? 'bg-surface-0 text-surface-900 shadow-xs' : 'text-surface-500 hover:text-surface-700'
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(''); }}
            className={`flex-1 py-2 rounded-sm text-caption-medium font-medium transition-all duration-fast ${
              mode === 'register' ? 'bg-surface-0 text-surface-900 shadow-xs' : 'text-surface-500 hover:text-surface-700'
            }`}
          >
            New account
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-md bg-error-50 border border-error-100 text-body text-error-700">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'register' && (
            <>
              <Input label="Full name" required value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Adunni Okafor" />
              <Input label="Phone number" type="tel" required value={form.phone}
                onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="08012345678" />
              <Input label="Email (optional)" type="email" value={form.email}
                onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} placeholder="you@example.com" />
            </>
          )}
          {mode === 'login' && (
            <Input label="Phone or email" required value={form.identifier}
              onChange={(e) => setForm(f => ({ ...f, identifier: e.target.value }))} placeholder="08012345678 or email" />
          )}
          <Input label="Password" type="password" required minLength={8} value={form.password}
            onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
            hint={mode === 'register' ? 'At least 8 characters' : undefined} />
          <Button variant="primary" size="lg" loading={loading} className="w-full mt-2">
            {mode === 'register' ? 'Create account' : 'Sign in'}
          </Button>
        </form>
      </div>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════
   BATCH CARD — unified, shows relevant info per status
   ═══════════════════════════════════════════════════════ */
function BatchCard({ batch, signedIn, onAction, onRequireAuth }) {
  const isReady = batch.status === 'RECEIVED';
  const price = isReady ? Number(batch.retailPrice) : Number(batch.wholesalePrice);
  const priceLabel = isReady ? 'Retail' : 'Wholesale';
  const available = isReady ? Number(batch.availableForSale || 0) : Number(batch.remainingAvailable || 0);
  const used = isReady
    ? Number(batch.totalBooked || 0) + Number(batch.heldForCheckout || 0)
    : Number(batch.totalBooked || 0) + Number(batch.heldForCheckout || 0);
  const total = isReady
    ? Number(batch.onHand || 0)
    : Number(batch.totalBookingCapacity || batch.availableForBooking || 0);
  const soldOut = available <= 0;

  function handleClick() {
    if (!signedIn) { onRequireAuth(isReady ? 'buy-now' : 'book-upcoming'); return; }
    onAction(batch);
  }

  const ctaLabel = soldOut
    ? 'Sold out'
    : signedIn
      ? (isReady ? 'Buy now' : 'Book now')
      : (isReady ? 'Sign in to buy now' : 'Sign in to book now');

  return (
    <div className={`group relative bg-surface-0 border rounded-lg p-5 transition-all duration-fast hover:shadow-md ${
      soldOut ? 'border-surface-200 opacity-60' : 'border-surface-200 hover:border-brand-300'
    }`}>
      {/* Status chip */}
      <div className="flex items-center justify-between mb-3">
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-caption-medium ${
          isReady ? 'bg-success-50 text-success-700' : 'bg-brand-50 text-brand-700'
        }`}>
          <StatusDot tone={isReady ? 'success' : 'warning'} />
          {isReady ? 'Ready for pickup' : 'Arriving soon'}
        </div>
        {!isReady && batch.expectedDate && (
          <span className="flex items-center gap-1 text-caption text-surface-500">
            {Icon.clock} {fmtDate(batch.expectedDate)}
          </span>
        )}
      </div>

      {/* Batch name + egg type */}
      <h3 className="text-heading text-surface-900">{batch.name}</h3>
      <p className="text-caption text-surface-500 mt-0.5">{batch.eggTypeLabel || 'Eggs'}</p>

      {/* Price */}
      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-metric text-surface-900">{fmtMoney(price)}</p>
          <p className="text-caption text-surface-500">{priceLabel} per crate</p>
        </div>
        {!isReady && batch.retailPrice && Number(batch.retailPrice) !== price && (
          <div className="text-right">
            <p className="text-caption text-surface-400 line-through">{fmtMoney(batch.retailPrice)}</p>
            <p className="text-caption-medium text-success-700">
              Save {fmtMoney(Number(batch.retailPrice) - price)}
            </p>
          </div>
        )}
      </div>

      {/* Availability */}
      <AvailabilityBar used={used} total={Math.max(total, available, 1)} className="mt-4" />

      {/* CTA */}
      <button
        onClick={handleClick}
        disabled={soldOut}
        className={`mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-md text-body-medium font-medium transition-all duration-fast ${
          soldOut
            ? 'bg-surface-100 text-surface-400 cursor-not-allowed'
            : isReady
              ? 'bg-brand-500 text-surface-900 hover:bg-brand-400 active:bg-brand-600 shadow-xs'
              : 'bg-surface-900 text-surface-0 hover:bg-surface-800 active:bg-surface-700 shadow-xs'
        }`}
      >
        {ctaLabel}
        {!soldOut && <span className="opacity-70">{Icon.arrowRight}</span>}
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   CHECKOUT FLOW — unified, step-based
   ═══════════════════════════════════════════════════════ */
function CheckoutModal({ batch, profile, policy, onClose, onFinished }) {
  const isReady = batch.status === 'RECEIVED';
  const unitPrice = isReady ? Number(batch.retailPrice) : Number(batch.wholesalePrice);
  const minPaymentPercent = isReady ? 100 : Number(policy?.bookingMinimumPaymentPercent || 80);

  const orderLimitProfile = profile?.orderLimitProfile || null;
  const availableQty = isReady ? Number(batch.availableForSale || 0) : Number(batch.remainingAvailable || 0);
  const perOrderLimit = Number(orderLimitProfile?.currentPerOrderLimit || policy?.maxBookingCratesPerOrder || 100);
  const maxQty = Math.min(availableQty, perOrderLimit);

  const [step, setStep] = useState('quantity');
  const [quantity, setQuantity] = useState('');
  const [amountToPay, setAmountToPay] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CARD');
  const [checkoutEmail, setCheckoutEmail] = useState(() => {
    const candidate = profile?.user?.email || profile?.customer?.email || '';
    return isPaystackReadyEmail(candidate) ? candidate : '';
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    const candidate = profile?.user?.email || profile?.customer?.email || '';
    setCheckoutEmail(isPaystackReadyEmail(candidate) ? candidate : '');
  }, [profile?.user?.email, profile?.customer?.email]);

  const qtyVal = parseInt(quantity, 10) || 0;
  const orderValue = qtyVal * unitPrice;
  const minPayment = orderValue * (minPaymentPercent / 100);
  const payNow = isReady ? orderValue : (Number(amountToPay) || 0);
  const balance = Math.max(0, orderValue - payNow);

  const qtyError = useMemo(() => {
    if (!quantity) return '';
    if (!Number.isInteger(qtyVal) || qtyVal < 1) return 'Enter at least 1 crate.';
    if (qtyVal > availableQty) return `Only ${fmt(availableQty)} crates available.`;
    if (qtyVal > perOrderLimit) {
      return orderLimitProfile?.isUsingEarlyOrderLimit
        ? `Limit: ${fmt(perOrderLimit)} crates for your first ${orderLimitProfile.earlyOrderLimitCount} orders.`
        : `Maximum ${fmt(perOrderLimit)} crates per order.`;
    }
    return '';
  }, [quantity, qtyVal, availableQty, perOrderLimit, orderLimitProfile]);

  const payError = useMemo(() => {
    if (isReady || !amountToPay) return '';
    if (payNow < minPayment) return `Minimum payment is ${fmtMoney(minPayment)} (${minPaymentPercent}%).`;
    if (payNow > orderValue) return 'Cannot exceed the order value.';
    return '';
  }, [isReady, amountToPay, payNow, minPayment, orderValue, minPaymentPercent]);

  const cardEmailError = useMemo(() => {
    if (paymentMethod !== 'CARD') return '';
    if (!checkoutEmail.trim()) return 'Enter the email you want to use for card payment.';
    if (!isPaystackReadyEmail(checkoutEmail)) return 'Enter a real email address. Temporary or internal emails cannot be used for card payment.';
    return '';
  }, [paymentMethod, checkoutEmail]);

  function goToPayment() {
    if (qtyError || qtyVal < 1) return;
    if (isReady) { setAmountToPay(String(orderValue)); }
    setStep('payment');
  }

  async function handleSubmit() {
    if (qtyError || (!isReady && payError)) return;
    setLoading(true);
    setError('');
    try {
      const body = {
        checkoutType: isReady ? 'BUY_NOW' : 'BOOK_UPCOMING',
        batchId: batch.id,
        quantity: qtyVal,
        paymentMethod,
        ...(isReady ? {} : { amountToPay: payNow }),
        ...(paymentMethod === 'CARD' ? { checkoutEmail: checkoutEmail.trim() } : {}),
      };
      const res = await api.post('/portal/checkouts', body);

      if (paymentMethod === 'CARD' && res.authorizationUrl) {
        const normalizedEmail = checkoutEmail.trim().toLowerCase();
        if (normalizedEmail) {
          const storedUser = localStorage.getItem('user');
          if (storedUser) {
            try {
              const parsed = JSON.parse(storedUser);
              localStorage.setItem('user', JSON.stringify({ ...parsed, email: normalizedEmail }));
            } catch {
              // Ignore malformed local user state
            }
          }
        }
        window.location.assign(res.authorizationUrl);
        return;
      }
      setSuccess(res);
      setStep('success');
    } catch (err) {
      setError(err.error || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function continueFromPayment() {
    if (paymentMethod === 'TRANSFER') {
      setStep('transfer');
      return;
    }
    handleSubmit();
  }

  if (step === 'success' && success) {
    const co = success.checkout || success.order || {};
    const reference = co.reference || success.order?.reference;
    const nextSteps = paymentMethod === 'TRANSFER'
      ? [
          'We have reserved your crates and sent your order to the team for transfer review.',
          'The team will first confirm they have seen the transfer.',
          'Final confirmation happens when the matching bank statement line is linked.',
          'You can track the status in My Orders.',
        ]
      : isReady
        ? [
            'Your payment is confirmed.',
            'Come for pickup from today until the next 3 days.',
            'Show your order number when you arrive.',
          ]
        : [
            'Your payment is confirmed and your booking is saved.',
            'Your crates remain held for you.',
            'Watch My Orders for batch arrival and pickup updates.',
          ];

    return (
      <Modal title={paymentMethod === 'TRANSFER' ? 'Transfer submitted' : 'Payment confirmed'} open={true} onClose={() => { onFinished('orders'); onClose(); }}>
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-lg bg-success-50 border border-success-100">
            <div className="mt-0.5 text-success-700 shrink-0">{Icon.check}</div>
            <div>
              <p className="text-body-medium font-semibold text-success-800">{success.message || 'Order confirmed'}</p>
              <p className="text-caption text-success-700 mt-1">Your details are saved in My Orders so you can come back to this anytime.</p>
            </div>
          </div>

          {reference && (
            <div className="text-center py-4 px-4 rounded-lg border-2 border-brand-200 bg-brand-50">
              <p className="text-caption-medium text-brand-700 uppercase tracking-wider">{isReady ? 'Order number' : 'Booking number'}</p>
              <p className="text-metric-lg text-surface-900 mt-1 font-mono">{reference}</p>
              <p className="text-caption text-surface-500 mt-2">Keep this number for pickup and support.</p>
            </div>
          )}

          <div className="rounded-lg border border-surface-200 divide-y divide-surface-100">
            <div className="p-4 grid grid-cols-2 gap-3">
              <Metric label="Batch" value={co.batch?.name || batch.name} />
              <Metric label="Egg type" value={co.batch?.eggTypeLabel || batch.eggTypeLabel || '—'} />
              <Metric label="Crates" value={`${fmt(co.quantity || qtyVal)}`} />
              <Metric label={paymentMethod === 'TRANSFER' ? 'Amount to confirm' : 'Amount paid'} value={fmtMoney(co.amountToPay || co.orderValue || orderValue)} />
            </div>
            {!isReady && (
              <div className="p-4 grid grid-cols-2 gap-3">
                <Metric label="Balance remaining" value={fmtMoney(co.balanceAfterPayment ?? balance)} />
                <Metric label="Expected date" value={fmtDate(batch.expectedDate)} />
              </div>
            )}
          </div>

          <div className="rounded-lg border border-surface-200 bg-surface-50 p-4">
            <p className="text-body-medium font-semibold text-surface-800">What to do next</p>
            <div className="mt-3 space-y-2 text-body text-surface-700">
              {nextSteps.map((item) => (
                <div key={item} className="flex items-start gap-2">
                  <span className="mt-1 text-brand-700 shrink-0">{Icon.check}</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 rounded-lg border border-surface-200 bg-surface-50">
            <span className="text-brand-700 mt-0.5 shrink-0">{Icon.mapPin}</span>
            <div>
              <p className="text-body-medium font-semibold text-surface-800">Pickup location</p>
              <p className="text-caption text-surface-600 mt-1">{PICKUP_DETAILS.lineOne}</p>
              <p className="text-caption text-surface-500 mt-0.5">{PICKUP_DETAILS.lineTwo}</p>
            </div>
          </div>

          <Button variant="primary" size="lg" className="w-full" onClick={() => { onFinished('orders'); onClose(); }}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  if (step === 'transfer') {
    return (
      <Modal title={isReady ? 'Make your transfer' : 'Make this booking transfer'} open={true} onClose={onClose}>
        <div className="space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-error-50 border border-error-100 text-body text-error-700">{error}</div>
          )}

          <div className="rounded-lg border border-warning-200 bg-warning-50 p-4 space-y-3">
            <p className="text-body-medium font-semibold text-surface-800">Transfer to this account</p>
            <div className="space-y-2 text-body">
              {[
                ['Bank', TRANSFER_DETAILS.bankName],
                ['Account number', TRANSFER_DETAILS.accountNumber],
                ['Account name', TRANSFER_DETAILS.accountName],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <span className="text-surface-600">{k}</span>
                  <span className="font-semibold text-surface-800 text-right">{v}</span>
                </div>
              ))}
              <div className="flex justify-between pt-2 border-t border-warning-200">
                <span className="font-semibold text-surface-700">Amount</span>
                <span className="text-heading font-bold text-success-700">{fmtMoney(payNow)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-surface-200 bg-surface-50 p-4">
            <p className="text-body-medium font-semibold text-surface-800">Before you continue</p>
            <div className="mt-3 space-y-2 text-body text-surface-700">
              <div className="flex items-start gap-2">
                <span className="mt-1 text-brand-700 shrink-0">{Icon.check}</span>
                <span>Make the transfer from your bank app or bank branch first.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-1 text-brand-700 shrink-0">{Icon.check}</span>
                <span>When you click <span className="font-semibold">I have made the transfer</span>, we will reserve these crates for you and send the order to the team for review.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-1 text-brand-700 shrink-0">{Icon.check}</span>
                <span>The final financial confirmation still depends on the bank statement record.</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" size="lg" onClick={() => setStep('payment')} className="flex-1">Back</Button>
            <Button variant="primary" size="lg" loading={loading} className="flex-1" onClick={handleSubmit}>
              I have made the transfer
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  if (step === 'payment') {
    return (
      <Modal title={isReady ? 'Confirm payment' : 'Payment details'} open={true} onClose={onClose}>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-surface-50 border border-surface-100">
            <div>
              <p className="text-body-medium text-surface-800">{batch.name} · {qtyVal} crate{qtyVal !== 1 ? 's' : ''}</p>
              <p className="text-caption text-surface-500">{batch.eggTypeLabel || 'Eggs'}</p>
            </div>
            <p className="text-heading font-bold text-surface-900">{fmtMoney(orderValue)}</p>
          </div>

          {error && (
            <div className="p-3 rounded-md bg-error-50 border border-error-100 text-body text-error-700">{error}</div>
          )}

          {!isReady && (
            <>
              <Input
                label="How much are you paying now?"
                type="number"
                min={minPayment || 0}
                max={orderValue}
                step="0.01"
                required
                value={amountToPay}
                onChange={(e) => setAmountToPay(e.target.value)}
                hint={`Minimum ${minPaymentPercent}% = ${fmtMoney(minPayment)}`}
              />
              {payError && (
                <p className="text-caption text-error-600">{payError}</p>
              )}
              {payNow > 0 && !payError && (
                <div className="flex justify-between p-3 rounded-md bg-surface-50 text-body">
                  <span className="text-surface-600">Balance after this payment</span>
                  <span className="font-semibold text-surface-800">{fmtMoney(balance)}</span>
                </div>
              )}
            </>
          )}

          <div>
            <p className="text-body-medium font-medium text-surface-700 mb-2">Payment method</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { key: 'CARD', icon: Icon.creditCard, label: 'Pay with card', desc: 'Instant payment and confirmation' },
                { key: 'TRANSFER', icon: Icon.bank, label: 'Pay by transfer', desc: 'You will transfer first, then notify us here' },
              ].map(({ key, icon, label, desc }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPaymentMethod(key)}
                  className={`flex items-start gap-3 p-3 rounded-md border text-left transition-all duration-fast ${
                    paymentMethod === key
                      ? 'border-brand-300 bg-brand-50 ring-1 ring-brand-200'
                      : 'border-surface-200 hover:border-surface-300'
                  }`}
                >
                  <span className={paymentMethod === key ? 'text-brand-700' : 'text-surface-400'}>{icon}</span>
                  <div>
                    <p className="text-body-medium font-medium text-surface-800">{label}</p>
                    <p className="text-caption text-surface-500">{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {paymentMethod === 'CARD' && (
            <Input
              label="Email for payment receipt"
              type="email"
              required
              value={checkoutEmail}
              onChange={(e) => setCheckoutEmail(e.target.value)}
              placeholder="you@example.com"
              hint="Paystack sends the payment receipt to this email."
              error={cardEmailError || undefined}
            />
          )}

          {paymentMethod === 'TRANSFER' && (
            <div className="p-3 rounded-md bg-warning-50 border border-warning-100 text-caption text-warning-800">
              In the next step, we'll show the transfer details. Your crates are only held after you click <span className="font-semibold">I have made the transfer</span>.
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" size="lg" onClick={() => setStep('quantity')} className="flex-1">Back</Button>
            <Button
              variant="primary" size="lg" loading={loading} className="flex-1"
              disabled={(!isReady && (payNow <= 0 || Boolean(payError))) || (paymentMethod === 'CARD' && Boolean(cardEmailError))}
              onClick={continueFromPayment}
            >
              {paymentMethod === 'CARD' ? 'Continue to card payment' : 'Continue'}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={isReady ? 'How many crates?' : 'Book your crates'} open={true} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start justify-between p-4 rounded-lg bg-surface-50 border border-surface-100">
          <div>
            <p className="text-heading text-surface-900">{batch.name}</p>
            <p className="text-caption text-surface-500">{batch.eggTypeLabel || 'Eggs'}</p>
            {!isReady && batch.expectedDate && (
              <p className="flex items-center gap-1 text-caption text-surface-500 mt-1">
                {Icon.clock} Expected {fmtDate(batch.expectedDate)}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-metric text-surface-900">{fmtMoney(unitPrice)}</p>
            <p className="text-caption text-surface-500">{isReady ? 'Retail' : 'Wholesale'} / crate</p>
          </div>
        </div>

        {orderLimitProfile?.isUsingEarlyOrderLimit && (
          <div className="p-3 rounded-md bg-info-50 border border-info-100 text-caption text-info-700">
            Your first {orderLimitProfile.earlyOrderLimitCount} orders can be up to {fmt(perOrderLimit)} crates each.
            You have {orderLimitProfile.earlyOrdersRemaining} order{orderLimitProfile.earlyOrdersRemaining === 1 ? '' : 's'} left at this limit.
          </div>
        )}

        <Input
          label="Number of crates"
          type="number"
          min="1"
          max={maxQty}
          required
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          hint={`Up to ${fmt(maxQty)} crates`}
          error={qtyError || undefined}
        />

        {quantity && qtyError && (
          <div className="rounded-lg border border-error-200 bg-error-50 p-3 text-body text-error-700">
            {qtyError}
          </div>
        )}

        {qtyVal > 0 && !qtyError && (
          <div className="rounded-lg border border-surface-200 p-4">
            <div className="flex items-center justify-between">
              <span className="text-body text-surface-600">{fmt(qtyVal)} crate{qtyVal !== 1 ? 's' : ''} × {fmtMoney(unitPrice)}</span>
              <span className="text-title font-bold text-surface-900">{fmtMoney(orderValue)}</span>
            </div>
            {!isReady && (
              <p className="text-caption text-surface-500 mt-2">
                You'll pay at least {minPaymentPercent}% ({fmtMoney(orderValue * minPaymentPercent / 100)}) in the next step.
              </p>
            )}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" size="lg" onClick={onClose} className="flex-1">Cancel</Button>
          <Button variant="primary" size="lg" onClick={goToPayment} disabled={qtyVal < 1 || Boolean(qtyError)} className="flex-1">
            Continue
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════
   ORDER DETAIL MODAL
   ═══════════════════════════════════════════════════════ */
function getOrderStatus(order) {
  if (order.kind === 'BOOKING') {
    if (order.source === 'BOOKING_CHECKOUT') {
      if (order.status === 'AWAITING_PAYMENT') return { label: 'Awaiting card payment', tone: 'warning' };
      if (order.status === 'AWAITING_TRANSFER') return { label: 'Awaiting transfer', tone: 'info' };
      if (order.status === 'ADMIN_CONFIRMED') return { label: 'Transfer seen — confirming', tone: 'warning' };
      if (order.status === 'FAILED') return { label: 'Payment failed', tone: 'error' };
      if (order.status === 'PAID') return { label: 'Confirmed', tone: 'success' };
      if (order.status === 'PICKED_UP') return { label: 'Completed', tone: 'success' };
      if (order.status === 'CANCELLED') return { label: 'Cancelled', tone: 'error' };
    } else {
      if (order.status === 'CONFIRMED' && order.batchArrived) return { label: 'Ready for pickup', tone: 'success' };
      if (order.status === 'CONFIRMED') return { label: 'Booking confirmed', tone: 'success' };
      if (order.status === 'PICKED_UP') return { label: 'Picked up', tone: 'neutral' };
      if (order.status === 'CANCELLED') return { label: 'Cancelled', tone: 'error' };
    }
  }
  if (order.kind === 'BUY_NOW') {
    if (order.source === 'BUY_NOW_CHECKOUT') {
      if (order.status === 'AWAITING_PAYMENT') return { label: 'Awaiting card payment', tone: 'warning' };
      if (order.status === 'AWAITING_TRANSFER') return { label: 'Awaiting transfer', tone: 'info' };
      if (order.status === 'FAILED') return { label: 'Payment failed', tone: 'error' };
      if (order.status === 'CANCELLED') return { label: 'Cancelled', tone: 'error' };
    }
    if (order.status === 'APPROVED_FOR_PICKUP') return { label: 'Ready for pickup', tone: 'success' };
    if (order.status === 'AWAITING_TRANSFER') return { label: 'Awaiting transfer', tone: 'warning' };
    if (order.status === 'PICKED_UP') return { label: 'Picked up', tone: 'neutral' };
    if (order.status === 'CANCELLED') return { label: 'Cancelled', tone: 'error' };
  }
  return { label: 'Processing', tone: 'warning' };
}

function getNextStep(order) {
  if (order.kind === 'BOOKING') {
    if (order.source === 'BOOKING_CHECKOUT') {
      if (order.status === 'AWAITING_PAYMENT') return 'Complete your card payment to confirm the booking.';
      if (order.status === 'AWAITING_TRANSFER') return `Transfer ${fmtMoney(order.amountToPay || order.orderValue)} to complete your booking.`;
      if (order.status === 'ADMIN_CONFIRMED') return 'Your transfer has been seen. Full confirmation is in progress.';
      if (order.status === 'FAILED') return 'Payment was not completed. You can place a new order.';
      if (order.status === 'PICKED_UP') return 'Order complete.';
    } else {
      if (order.status === 'CONFIRMED' && order.batchArrived) return 'Your batch has arrived. Come for pickup!';
      if (order.status === 'CONFIRMED') return `Batch expected on ${fmtDate(order.batch?.expectedDate)}.`;
      if (order.status === 'PICKED_UP') return 'Order complete.';
    }
  }
  if (order.kind === 'BUY_NOW') {
    if (order.source === 'BUY_NOW_CHECKOUT') {
      if (order.status === 'AWAITING_PAYMENT') return 'Complete your card payment to confirm this order.';
      if (order.status === 'AWAITING_TRANSFER') return `Transfer ${fmtMoney(order.amountToPay || order.orderValue)} to confirm this order.`;
      if (order.status === 'FAILED') return 'Payment was not completed. You can place a new order.';
    }
    if (order.status === 'APPROVED_FOR_PICKUP') return 'Your eggs are ready! Pick up within 3 days.';
    if (order.status === 'PICKED_UP') return 'Order complete.';
  }
  return 'Your order is being processed.';
}

function OrderDetailModal({ order, onClose }) {
  if (!order) return null;
  const status = getOrderStatus(order);
  const nextStep = getNextStep(order);
  const needsTransfer = order.status === 'AWAITING_TRANSFER';

  return (
    <Modal title="Order details" open={true} onClose={onClose}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-caption text-surface-500">{order.kind === 'BOOKING' ? 'Booking' : 'Purchase'}</p>
            <h3 className="text-title font-semibold text-surface-900">{order.batch?.name || 'Order'}</h3>
          </div>
          <Badge status={status.tone}>{status.label}</Badge>
        </div>

        {/* Next step — prominent */}
        <div className={`p-3 rounded-lg text-body ${
          status.tone === 'success' ? 'bg-success-50 border border-success-100 text-success-800'
          : status.tone === 'error' ? 'bg-error-50 border border-error-100 text-error-700'
          : 'bg-info-50 border border-info-100 text-info-700'
        }`}>
          {nextStep}
        </div>

        {/* Transfer details if needed */}
        {needsTransfer && (
          <div className="rounded-lg border border-warning-200 bg-warning-50 p-4 space-y-2 text-body">
            <p className="font-semibold text-surface-800">Transfer to</p>
            {[
              ['Bank', TRANSFER_DETAILS.bankName],
              ['Account', TRANSFER_DETAILS.accountNumber],
              ['Name', TRANSFER_DETAILS.accountName],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-surface-600">{k}</span>
                <span className="font-semibold text-surface-800">{v}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2 border-t border-warning-200">
              <span className="font-semibold text-surface-700">Amount</span>
              <span className="font-bold text-success-700">{fmtMoney(order.amountToPay || order.orderValue)}</span>
            </div>
          </div>
        )}

        {/* Order info */}
        <div className="rounded-lg border border-surface-200 divide-y divide-surface-100">
          <div className="p-4 grid grid-cols-2 gap-3">
            <Metric label="Egg type" value={order.eggTypeLabel || order.batch?.eggTypeLabel || '—'} />
            <Metric label="Quantity" value={`${fmt(order.quantity)} crates`} />
            <Metric label="Order value" value={fmtMoney(order.orderValue)} />
            <Metric label="Paid" value={fmtMoney(order.amountPaid)} />
            {order.balance > 0 && <Metric label="Remaining" value={fmtMoney(order.balance)} />}
            <Metric label="Payment" value={order.paymentMethod === 'CARD' ? 'Card' : order.paymentMethod === 'TRANSFER' ? 'Transfer' : order.paymentMethod || '—'} />
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            <Metric label="Order date" value={fmtDateTime(order.createdAt)} />
            <Metric label="Reference" value={order.reference || '—'} />
            {order.pickupWindowStart && <Metric label="Pickup from" value={fmtDateTime(order.pickupWindowStart)} />}
            {order.pickupWindowEnd && <Metric label="Pickup until" value={fmtDateTime(order.pickupWindowEnd)} />}
          </div>
        </div>

        {order.notes && (
          <div className="p-3 rounded-md bg-surface-50 border border-surface-100">
            <p className="text-caption text-surface-500 mb-1">Notes</p>
            <p className="text-body text-surface-700">{order.notes}</p>
          </div>
        )}

        <Button variant="primary" size="lg" onClick={onClose} className="w-full">Close</Button>
      </div>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════
   MY ORDERS — with action-needed prioritization
   ═══════════════════════════════════════════════════════ */
function MyOrders({ orders, loading, onOpenOrder }) {
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const safeOrders = orders || [];
  const needsAction = (o) => ['AWAITING_PAYMENT', 'AWAITING_TRANSFER'].includes(o.status);
  const isActive = (o) => ['CONFIRMED', 'PAID', 'APPROVED_FOR_PICKUP', 'ADMIN_CONFIRMED'].includes(o.status) || (o.status === 'CONFIRMED' && o.batchArrived);
  const isComplete = (o) => ['PICKED_UP', 'CANCELLED', 'FAILED'].includes(o.status);
  const filtered = safeOrders.filter((o) => {
    if (filter === 'action') return needsAction(o);
    if (filter === 'active') return isActive(o);
    if (filter === 'complete') return isComplete(o);
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const actionCount = safeOrders.filter(needsAction).length;

  useEffect(() => {
    setPage(1);
  }, [filter]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin w-6 h-6 border-2 border-surface-300 border-t-brand-500 rounded-full mx-auto" />
        <p className="text-body text-surface-500 mt-3">Loading your orders...</p>
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-14 h-14 rounded-full bg-surface-100 flex items-center justify-center mx-auto mb-4 text-surface-400">
          {Icon.package}
        </div>
        <h3 className="text-heading text-surface-800">No orders yet</h3>
        <p className="text-body text-surface-500 mt-1 max-w-sm mx-auto">Choose a ready-now or upcoming batch above and place your first order.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { key: 'all', label: 'All' },
          { key: 'action', label: `Needs action${actionCount > 0 ? ` (${actionCount})` : ''}` },
          { key: 'active', label: 'Active' },
          { key: 'complete', label: 'Completed' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-caption-medium transition-all duration-fast ${
              filter === key
                ? 'bg-surface-900 text-surface-0'
                : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-center py-8 text-body text-surface-500">No orders in this category.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 text-caption text-surface-500">
            <span>
              Showing {Math.min((safePage - 1) * pageSize + 1, filtered.length)}–{Math.min(safePage * pageSize, filtered.length)} of {filtered.length}
            </span>
            {filtered.length > pageSize && (
              <span>Page {safePage} of {totalPages}</span>
            )}
          </div>

          <div className="space-y-2">
            {paginated.map((order) => {
            const status = getOrderStatus(order);
            const nextStep = getNextStep(order);
            const action = needsAction(order);

            return (
              <button
                key={order.id}
                onClick={() => onOpenOrder(order)}
                className={`w-full text-left p-4 rounded-lg border transition-all duration-fast hover:shadow-sm ${
                  action ? 'border-warning-200 bg-warning-50/40' : 'border-surface-200 bg-surface-0 hover:border-surface-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-body-medium font-semibold text-surface-800 truncate">{order.batch?.name || 'Order'}</span>
                      <Badge status={status.tone}>{status.label}</Badge>
                    </div>
                    <p className="text-caption text-surface-600 truncate">{nextStep}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-caption text-surface-400">
                      <span>{fmt(order.quantity)} crates</span>
                      <span>{fmtDate(order.createdAt)}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-body-medium font-semibold text-surface-900">{fmtMoney(order.orderValue || 0)}</p>
                  </div>
                </div>
              </button>
            );
            })}
          </div>

          {filtered.length > pageSize && (
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={safePage <= 1}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={safePage >= totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   PAYMENT VERIFICATION BANNER
   ═══════════════════════════════════════════════════════ */
function PaymentSuccessModal({ result, onClose }) {
  if (!result?.order) return null;
  const order = result.order;
  const isBooking = order.kind === 'BOOKING';
  const nextSteps = isBooking
    ? [
        'Your booking is now confirmed and the crates are held for you.',
        'We will update My Orders when the batch arrives.',
        'Bring your booking number when you come for pickup.',
      ]
    : [
        'Your payment is confirmed.',
        'Come for pickup from today until the next 3 days.',
        'Bring your order number when you arrive.',
      ];

  return (
    <Modal title="Payment confirmed" open={true} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 rounded-lg bg-success-50 border border-success-100">
          <span className="text-success-700 mt-0.5 shrink-0">{Icon.check}</span>
          <div>
            <p className="text-body-medium font-semibold text-success-800">{result.message}</p>
            <p className="text-caption text-success-700 mt-1">Keep your reference number for pickup.</p>
          </div>
        </div>

        {order.reference && (
          <div className="text-center py-4 px-4 rounded-lg border-2 border-brand-200 bg-brand-50">
            <p className="text-caption-medium text-brand-700 uppercase tracking-wider">{isBooking ? 'Booking' : 'Order'} reference</p>
            <p className="text-metric-lg text-surface-900 mt-1 font-mono">{order.reference}</p>
            <p className="text-caption text-surface-500 mt-2">Keep this number handy for pickup and support.</p>
          </div>
        )}

        <div className="rounded-lg border border-surface-200 p-4 grid grid-cols-2 gap-3">
          <Metric label="Batch" value={order.batch?.name || '—'} />
          <Metric label="Crates" value={`${fmt(order.quantity)}`} />
          <Metric label="Amount paid" value={fmtMoney(order.amountPaid)} />
          {order.balance > 0 && <Metric label="Balance" value={fmtMoney(order.balance)} />}
        </div>

        <div className="rounded-lg border border-surface-200 bg-surface-50 p-4">
          <p className="text-body-medium font-semibold text-surface-800">What to do next</p>
          <div className="mt-3 space-y-2 text-body text-surface-700">
            {nextSteps.map((item) => (
              <div key={item} className="flex items-start gap-2">
                <span className="mt-1 text-brand-700 shrink-0">{Icon.check}</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-start gap-3 p-4 rounded-lg border border-surface-200 bg-surface-50">
          <span className="text-brand-700 mt-0.5 shrink-0">{Icon.mapPin}</span>
          <div>
            <p className="text-body-medium font-semibold text-surface-800">Pickup location</p>
            <p className="text-caption text-surface-600 mt-1">{PICKUP_DETAILS.lineOne}</p>
            <p className="text-caption text-surface-500 mt-0.5">{PICKUP_DETAILS.lineTwo}</p>
          </div>
        </div>

        <Button variant="primary" size="lg" onClick={onClose} className="w-full">Done</Button>
      </div>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN PORTAL COMPONENT
   ═══════════════════════════════════════════════════════ */
export default function Portal() {
  const { user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [orders, setOrders] = useState([]);
  const [profile, setProfile] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('shop'); // 'shop' | 'orders'
  const [batchFilter, setBatchFilter] = useState('all'); // 'all' | 'ready' | 'upcoming'

  // Auth modal
  const [authOpen, setAuthOpen] = useState(false);
  const [authIntent, setAuthIntent] = useState(null);

  // Checkout
  const [checkoutBatch, setCheckoutBatch] = useState(null);

  // Order detail
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Payment verification (Paystack callback)
  const [paymentResult, setPaymentResult] = useState(null);
  const [paymentVerifying, setPaymentVerifying] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const handledRef = useRef(null);

  // Account dropdown
  const [accountOpen, setAccountOpen] = useState(false);

  function requireAuth(intent) {
    setAuthIntent(intent);
    setAuthOpen(true);
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [upRes, nowRes, ordRes, profRes] = await Promise.all([
        api.get('/portal/batches'),
        api.get('/portal/available-now'),
        user ? api.get('/portal/orders') : Promise.resolve({ orders: [] }),
        user ? api.get('/portal/profile') : Promise.resolve(null),
      ]);
      setBatches([...(upRes.batches || []), ...(nowRes.batches || [])]);
      setOrders(ordRes.orders || []);
      setProfile(profRes);
      setPolicy(upRes.policy || nowRes.policy || null);
    } catch (err) {
      console.error('Portal data load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  // Paystack callback
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('reference') || params.get('trxref');
    if (!ref || handledRef.current === ref) return;
    handledRef.current = ref;
    setPaymentVerifying(true);

    api.post('/portal/checkouts/verify-card', { reference: ref })
      .then((res) => {
        setPaymentResult(res);
        setView('orders');
        loadData();
      })
      .catch((err) => setPaymentError(err.error || 'Could not confirm payment. Please refresh.'))
      .finally(() => {
        setPaymentVerifying(false);
        window.history.replaceState({}, document.title, window.location.pathname);
      });
  }, [user, loadData]);

  // Filter batches
  const readyBatches = batches.filter(b => b.status === 'RECEIVED');
  const upcomingBatches = batches.filter(b => b.status === 'OPEN');
  const displayBatches = batchFilter === 'ready' ? readyBatches
    : batchFilter === 'upcoming' ? upcomingBatches
    : batches;

  const signedIn = Boolean(user);
  const displayName = profileDisplayName(profile, user);

  return (
    <div className="min-h-screen bg-surface-50">
      {/* ─── Header ─── */}
      <header className="sticky top-0 z-40 bg-surface-0 border-b border-surface-200 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          {/* Logo + name */}
          <div className="flex items-center gap-3">
            <img src="/logo.webp" alt="Fresh Eggs" className="w-8 h-8 object-contain" />
            <div className="hidden sm:block">
              <p className="text-body-medium font-semibold text-surface-900 leading-tight">Fresh Eggs Market</p>
              <p className="text-caption text-surface-500">Wholesale & Retail Eggs</p>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption-medium text-[#25D366] bg-[#25D366]/10 hover:bg-[#25D366]/20 transition-colors"
            >
              {Icon.whatsapp}
              <span className="hidden sm:inline">Help</span>
            </a>

            {signedIn ? (
              <div className="relative">
                <button
                  onClick={() => setAccountOpen(!accountOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-100 hover:bg-surface-200 transition-colors text-body-medium text-surface-700"
                >
                  {Icon.user}
                  <span className="hidden sm:inline max-w-[120px] truncate">{displayName}</span>
                  {Icon.chevronDown}
                </button>
                {accountOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setAccountOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-surface-0 border border-surface-200 rounded-lg shadow-lg py-1 animate-fade-in">
                      <div className="px-4 py-2 border-b border-surface-100">
                        <p className="text-body-medium text-surface-800 truncate">{displayName}</p>
                        <p className="text-caption text-surface-500 truncate">{user?.phone || user?.email}</p>
                      </div>
                      <button
                        onClick={() => {
                          setAccountOpen(false);
                          localStorage.removeItem('user');
                          api.setTokens(null, null);
                          window.location.reload();
                        }}
                        className="flex items-center gap-2 w-full px-4 py-2 text-body text-surface-600 hover:bg-surface-50 hover:text-error-600 transition-colors"
                      >
                        {Icon.logout} Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <Button variant="primary" size="sm" onClick={() => requireAuth('buy-now')}>Sign in</Button>
            )}
          </div>
        </div>
      </header>

      {/* ─── Main content ─── */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Payment verification banners */}
        {paymentVerifying && (
          <div className="p-3 rounded-lg bg-info-50 border border-info-100 text-body text-info-700 flex items-center gap-2">
            <div className="animate-spin w-4 h-4 border-2 border-info-300 border-t-info-600 rounded-full" />
            Verifying your card payment...
          </div>
        )}
        {paymentError && (
          <div className="p-3 rounded-lg bg-error-50 border border-error-100 text-body text-error-700">{paymentError}</div>
        )}

        {/* Navigation tabs (signed in) */}
        {signedIn && (
          <div className="flex gap-1 p-1 bg-surface-100 rounded-lg w-fit">
            <button
              onClick={() => setView('shop')}
              className={`px-4 py-2 rounded-md text-body-medium font-medium transition-all duration-fast ${
                view === 'shop' ? 'bg-surface-0 text-surface-900 shadow-xs' : 'text-surface-500 hover:text-surface-700'
              }`}
            >
              Shop
            </button>
            <button
              onClick={() => setView('orders')}
              className={`px-4 py-2 rounded-md text-body-medium font-medium transition-all duration-fast flex items-center gap-1.5 ${
                view === 'orders' ? 'bg-surface-0 text-surface-900 shadow-xs' : 'text-surface-500 hover:text-surface-700'
              }`}
            >
              My Orders
              {orders.filter(o => ['AWAITING_PAYMENT', 'AWAITING_TRANSFER'].includes(o.status)).length > 0 && (
                <span className="w-2 h-2 rounded-full bg-warning-500" />
              )}
            </button>
          </div>
        )}

        {/* ─── SHOP VIEW ─── */}
        {(view === 'shop' || !signedIn) && (
          <>
            {!signedIn && (
              <div className="space-y-4">
                <div className="rounded-xl bg-gradient-to-br from-surface-900 to-surface-800 text-surface-0 p-6 sm:p-8">
                  <div className="max-w-2xl">
                    <div className="inline-flex items-center gap-2 rounded-full bg-surface-0/10 px-3 py-1 text-caption text-surface-200">
                      <span className="text-brand-400">{Icon.egg}</span>
                      Fresh eggs for homes, stores, and resellers
                    </div>
                    <h2 className="mt-4 text-display font-bold">Buy eggs ready now or book an upcoming batch in minutes.</h2>
                    <p className="mt-3 text-body text-surface-300">
                      Use buy now for eggs that are already available for pickup. Use book upcoming when you want wholesale pricing on the next arriving batch.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-4 text-caption text-surface-300">
                      <span className="flex items-center gap-1.5">{Icon.check} Retail for ready-now batches</span>
                      <span className="flex items-center gap-1.5">{Icon.check} Wholesale for upcoming batches</span>
                      <span className="flex items-center gap-1.5">{Icon.check} Pay by card or transfer</span>
                    </div>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => setBatchFilter('ready')}
                        className="inline-flex items-center gap-2 rounded-md bg-brand-500 px-4 py-2.5 text-body-medium font-medium text-surface-900 hover:bg-brand-400"
                      >
                        Buy eggs now
                      </button>
                      <button
                        type="button"
                        onClick={() => setBatchFilter('upcoming')}
                        className="inline-flex items-center gap-2 rounded-md border border-surface-0/20 px-4 py-2.5 text-body-medium font-medium text-surface-0 hover:bg-surface-0/5"
                      >
                        Book upcoming batch
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-surface-200 bg-surface-0 p-5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-success-50 text-success-700">{Icon.package}</span>
                      <div>
                        <h3 className="text-heading text-surface-900">Buy eggs now</h3>
                        <p className="text-caption text-surface-500">For batches already available for pickup</p>
                      </div>
                    </div>
                    <p className="mt-4 text-body text-surface-700">See the current retail price, choose your crates, then sign in to buy now.</p>
                    <p className="mt-3 text-caption-medium text-success-700">{readyBatches.length} batch{readyBatches.length === 1 ? '' : 'es'} ready now</p>
                  </div>
                  <div className="rounded-xl border border-surface-200 bg-surface-0 p-5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-700">{Icon.truck}</span>
                      <div>
                        <h3 className="text-heading text-surface-900">Book upcoming batch</h3>
                        <p className="text-caption text-surface-500">For batches still on the way at wholesale price</p>
                      </div>
                    </div>
                    <p className="mt-4 text-body text-surface-700">Choose how many crates you want, pay now, and we will hold your booking for you.</p>
                    <p className="mt-3 text-caption-medium text-brand-700">{upcomingBatches.length} upcoming batch{upcomingBatches.length === 1 ? '' : 'es'}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-title font-semibold text-surface-900">{signedIn ? 'Choose your batch' : 'See what you can order today'}</h2>
                <p className="text-caption text-surface-500 mt-0.5">
                  {readyBatches.length} ready now · {upcomingBatches.length} upcoming
                </p>
              </div>
              <div className="flex gap-1 p-1 bg-surface-100 rounded-lg">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'ready', label: `Ready (${readyBatches.length})` },
                  { key: 'upcoming', label: `Upcoming (${upcomingBatches.length})` },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setBatchFilter(key)}
                    className={`px-3 py-1.5 rounded-md text-caption-medium transition-all duration-fast ${
                      batchFilter === key
                        ? 'bg-surface-0 text-surface-900 shadow-xs'
                        : 'text-surface-500 hover:text-surface-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Batch grid */}
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-64 rounded-lg bg-surface-100 animate-skeleton" />
                ))}
              </div>
            ) : displayBatches.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-14 h-14 rounded-full bg-surface-100 flex items-center justify-center mx-auto mb-4 text-surface-400">
                  {Icon.egg}
                </div>
                <h3 className="text-heading text-surface-800">No batches available</h3>
                <p className="text-body text-surface-500 mt-1">Check back soon — new batches are added regularly.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {/* Show ready batches first */}
                {displayBatches
                  .sort((a, b) => (a.status === 'RECEIVED' ? -1 : 1) - (b.status === 'RECEIVED' ? -1 : 1))
                  .map(batch => (
                    <BatchCard
                      key={batch.id}
                      batch={batch}
                      signedIn={signedIn}
                      onAction={(b) => setCheckoutBatch(b)}
                      onRequireAuth={requireAuth}
                    />
                  ))
                }
              </div>
            )}
          </>
        )}

        {/* ─── ORDERS VIEW ─── */}
        {view === 'orders' && signedIn && (
          <MyOrders orders={orders} loading={loading} onOpenOrder={setSelectedOrder} />
        )}
      </main>

      {/* ─── Footer ─── */}
      <footer className="border-t border-surface-200 bg-surface-0 mt-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src="/logo.webp" alt="Fresh Eggs" className="w-6 h-6 object-contain opacity-60" />
              <p className="text-caption text-surface-500">Fresh Eggs Wholesale Market</p>
            </div>
            <div className="flex items-center gap-4 text-caption text-surface-500">
              <span className="flex items-center gap-1">{Icon.mapPin} Lekki-Epe, Lagos</span>
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[#25D366] hover:underline">
                {Icon.whatsapp} WhatsApp
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* ─── WhatsApp FAB (mobile) ─── */}
      <WhatsAppFAB />

      {/* ─── Modals ─── */}
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuth={(userData) => {
          setAuthOpen(false);
          localStorage.setItem('user', JSON.stringify(userData));
          window.location.reload();
        }}
        intent={authIntent}
      />

      {checkoutBatch && (
        <CheckoutModal
          batch={checkoutBatch}
          profile={profile}
          policy={policy}
          onClose={() => setCheckoutBatch(null)}
          onFinished={(nextView) => {
            setCheckoutBatch(null);
            if (nextView === 'orders') setView('orders');
            loadData();
          }}
        />
      )}

      {selectedOrder && (
        <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
      )}

      {paymentResult && (
        <PaymentSuccessModal result={paymentResult} onClose={() => { setPaymentResult(null); setView('orders'); }} />
      )}
    </div>
  );
}
