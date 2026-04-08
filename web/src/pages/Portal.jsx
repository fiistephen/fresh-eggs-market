import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';

const fmt = (n) => Number(n || 0).toLocaleString('en-NG');
const fmtMoney = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 0 });
const fmtDate = (d) => new Date(d).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

// ─── CUSTOMER REGISTER / LOGIN ───────────────────────────────────
function AuthPanel({ onAuth }) {
  const [mode, setMode] = useState('login'); // login or register
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      let res;
      if (mode === 'register') {
        res = await api.post('/portal/register', form);
      } else {
        res = await api.post('/auth/login', { email: form.email, password: form.password });
      }
      api.setTokens(res.accessToken, res.refreshToken);
      localStorage.setItem('user', JSON.stringify(res.user));
      onAuth(res.user);
    } catch (err) {
      setError(err.error || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-2xl shadow-lg border p-6">
        {/* Tab switcher */}
        <div className="flex mb-6 bg-gray-100 rounded-xl p-1">
          <button onClick={() => { setMode('login'); setError(null); }} className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${mode === 'login' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
            Sign In
          </button>
          <button onClick={() => { setMode('register'); setError(null); }} className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${mode === 'register' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
            Create Account
          </button>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Adunni Okafor" className="w-full border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input type="tel" required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="e.g. 08012345678" className="w-full border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" className="w-full border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="password" required minLength={8} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder={mode === 'register' ? 'Min 8 characters' : 'Your password'} className="w-full border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
          </div>
          <button type="submit" disabled={loading} className="w-full py-3 bg-green-600 text-white rounded-lg font-semibold text-sm hover:bg-green-700 disabled:opacity-50 transition">
            {loading ? 'Please wait...' : mode === 'register' ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        {mode === 'register' && (
          <p className="text-xs text-gray-400 text-center mt-4">By creating an account, you agree to our terms of service.</p>
        )}
      </div>
    </div>
  );
}

// ─── OPEN BATCHES VIEW ───────────────────────────────────────────
function OpenBatchesView({ batches, loading, onBook, isLoggedIn }) {
  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full" /></div>;

  if (batches.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border">
        <span className="text-6xl block mb-4">🥚</span>
        <h3 className="text-xl font-bold text-gray-700 mb-2">No open batches right now</h3>
        <p className="text-gray-400 max-w-md mx-auto">New batches are opened regularly. Create an account to be notified when the next batch is available for booking.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {batches.map(batch => (
        <div key={batch.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow">
          <div className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{batch.name}</h3>
                <p className="text-sm text-gray-500 mt-0.5">Expected: {fmtDate(batch.expectedDate)}</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-green-700">
                  {batch.eggCodes.length > 1
                    ? `${fmtMoney(Math.min(...batch.eggCodes.map((item) => Number(item.wholesalePrice || 0))))}+`
                    : fmtMoney(batch.wholesalePrice)}
                </div>
                <div className="text-xs text-gray-400">{batch.eggCodes.length > 1 ? 'from per crate' : 'per crate'}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 mb-4 sm:grid-cols-2">
              {batch.eggCodes.map((eggCode) => (
                <div key={eggCode.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono font-semibold text-gray-900">{eggCode.code}</span>
                    <span className="text-green-700 font-medium">{fmtMoney(eggCode.wholesalePrice)}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">Retail {fmtMoney(eggCode.retailPrice)}</p>
                </div>
              ))}
            </div>

            {/* Availability bar */}
            <div className="mb-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">Booking availability</span>
                <span className={batch.remainingAvailable > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                  {batch.remainingAvailable > 0 ? `${fmt(batch.remainingAvailable)} crates available` : 'Fully booked'}
                </span>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${Math.max(0, (batch.remainingAvailable / batch.availableForBooking) * 100)}%` }} />
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>{fmt(batch.totalBooked)} booked</span>
                <span>{fmt(batch.availableForBooking)} total slots</span>
              </div>
            </div>

            {batch.remainingAvailable > 0 ? (
              <button onClick={() => onBook(batch)} disabled={!isLoggedIn} className={`w-full py-3 rounded-xl font-semibold text-sm transition ${isLoggedIn ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-100 text-gray-500 cursor-not-allowed'}`}>
                {isLoggedIn ? 'Book Now' : 'Sign in to book'}
              </button>
            ) : (
              <div className="w-full py-3 text-center bg-gray-100 rounded-xl text-sm text-gray-500 font-medium">
                Sold Out
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── BOOKING MODAL ───────────────────────────────────────────────
function BookingModal({ batch, profile, onClose, onBooked }) {
  const [selectedEggCode, setSelectedEggCode] = useState(batch.eggCodes?.length === 1 ? batch.eggCodes[0] : null);
  const [quantity, setQuantity] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const maxQty = Math.min(
    batch.remainingAvailable,
    100,
    profile?.isFirstTime ? 20 : 100
  );
  const price = selectedEggCode?.wholesalePrice ?? batch.wholesalePrice;
  const qty = parseInt(quantity, 10) || 0;
  const orderValue = qty * price;
  const minPayment = orderValue * 0.8;

  useEffect(() => {
    if (qty > 0) setAmountPaid(String(orderValue));
  }, [qty, orderValue]);

  const handleBook = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/portal/book', {
        batchId: batch.id,
        batchEggCodeId: selectedEggCode?.id,
        quantity: qty,
        amountPaid: parseFloat(amountPaid),
      });
      setSuccess(res);
    } catch (err) {
      setError(err.error || 'Booking failed');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    const b = success.booking;
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
          <div className="text-center mb-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-3xl">✅</span>
            </div>
            <h3 className="text-xl font-bold text-gray-900">Booking Confirmed!</h3>
            <p className="text-sm text-gray-500 mt-1">{success.message}</p>
          </div>
          <div className="bg-green-50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-600">Batch</span><span className="font-bold">{b.batch}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Expected Date</span><span>{fmtDate(b.expectedDate)}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Quantity</span><span className="font-bold">{b.quantity} crates</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Order Value</span><span>{fmtMoney(b.orderValue)}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Amount Paid</span><span className="text-green-700 font-bold">{fmtMoney(b.amountPaid)}</span></div>
            {b.balance > 0 && <div className="flex justify-between text-amber-600"><span>Balance Due</span><span className="font-bold">{fmtMoney(b.balance)}</span></div>}
          </div>
          <p className="text-xs text-gray-400 text-center mt-3">Please complete your payment via bank transfer. Your eggs will be ready for pickup when the batch arrives.</p>
          <button onClick={() => { onBooked(); onClose(); }} className="w-full mt-4 py-3 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">Book from {batch.name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="bg-gray-50 rounded-xl p-3 mb-4 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Egg item</span><span className="font-bold">{selectedEggCode?.code || 'Choose one below'}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Price per crate</span><span className="font-bold text-green-700">{fmtMoney(price)}</span></div>
          <div className="flex justify-between mt-1"><span className="text-gray-500">Available</span><span>{fmt(batch.remainingAvailable)} crates</span></div>
          <div className="flex justify-between mt-1"><span className="text-gray-500">Max per booking</span><span>{maxQty} crates</span></div>
          {profile?.isFirstTime && <div className="mt-2 text-xs text-amber-600 bg-amber-50 rounded p-2">First-time customers: max 20 crates per batch</div>}
        </div>

        {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

        <form onSubmit={handleBook} className="space-y-4">
          {(batch.eggCodes?.length || 0) > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Choose egg item</label>
              <div className="space-y-2">
                {batch.eggCodes.map((eggCode) => (
                  <button
                    key={eggCode.id}
                    type="button"
                    onClick={() => setSelectedEggCode(eggCode)}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                      selectedEggCode?.id === eggCode.id
                        ? 'border-green-300 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono font-semibold text-gray-900">{eggCode.code}</span>
                      <span className="font-medium text-green-700">{fmtMoney(eggCode.wholesalePrice)}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">Retail {fmtMoney(eggCode.retailPrice)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantity (crates) *</label>
            <input type="number" min="1" max={maxQty} required value={quantity} onChange={e => setQuantity(e.target.value)} placeholder={`1 - ${maxQty}`} className="w-full border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500" />
          </div>

          {qty > 0 && (
            <div className="bg-green-50 rounded-xl p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-600">Order Value</span><span className="font-bold">{fmtMoney(orderValue)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-gray-400">Min payment (80%)</span><span>{fmtMoney(minPayment)}</span></div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount You're Paying (₦) *</label>
            <input type="number" min={minPayment} max={orderValue * 2} step="0.01" required value={amountPaid} onChange={e => setAmountPaid(e.target.value)} className="w-full border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500" />
            <p className="text-xs text-gray-400 mt-1">Minimum 80% of order value. Pay the full amount to secure your booking.</p>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 border rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading || qty < 1 || !selectedEggCode} className="flex-1 py-3 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
              {loading ? 'Booking...' : 'Confirm Booking'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── MY BOOKINGS VIEW ────────────────────────────────────────────
function MyBookingsView() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/portal/my-bookings').then(res => setBookings(res.bookings || [])).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full" /></div>;

  if (bookings.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border">
        <span className="text-5xl block mb-3">📋</span>
        <h3 className="text-lg font-bold text-gray-700 mb-1">No bookings yet</h3>
        <p className="text-gray-400 text-sm">Browse open batches and place your first order!</p>
      </div>
    );
  }

  const statusColors = {
    CONFIRMED: 'bg-green-100 text-green-700',
    PICKED_UP: 'bg-blue-100 text-blue-700',
    CANCELLED: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-3">
      {bookings.map(b => (
        <div key={b.id} className="bg-white rounded-xl border p-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h4 className="font-bold text-lg">{b.batch}</h4>
              {b.itemCode && <p className="text-xs text-gray-500 mt-1">Item: {b.itemCode}</p>}
              <p className="text-xs text-gray-400">Booked {fmtDate(b.createdAt)} · via {b.channel}</p>
            </div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColors[b.status] || 'bg-gray-100'}`}>
              {b.status.replace('_', ' ')}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-gray-400 text-xs">Quantity</span>
              <div className="font-bold">{b.quantity} crates</div>
            </div>
            <div>
              <span className="text-gray-400 text-xs">Order Value</span>
              <div className="font-bold">{fmtMoney(b.orderValue)}</div>
            </div>
            <div>
              <span className="text-gray-400 text-xs">Paid</span>
              <div className="font-bold text-green-700">{fmtMoney(b.amountPaid)}</div>
            </div>
            <div>
              <span className="text-gray-400 text-xs">{b.balance > 0 ? 'Balance Due' : 'Status'}</span>
              <div className={`font-bold ${b.balance > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {b.balance > 0 ? fmtMoney(b.balance) : 'Fully Paid'}
              </div>
            </div>
          </div>
          {b.batchStatus === 'OPEN' && (
            <div className="mt-2 text-xs text-gray-400 bg-gray-50 rounded-lg p-2">
              Batch expected: {fmtDate(b.expectedDate)}. You'll be contacted when it arrives for pickup.
            </div>
          )}
          {b.batchStatus === 'RECEIVED' && b.status === 'CONFIRMED' && (
            <div className="mt-2 text-xs text-green-700 bg-green-50 rounded-lg p-2 font-medium">
              Batch has arrived! Please come to the depot to pick up your eggs.
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── MAIN PORTAL PAGE ────────────────────────────────────────────
export default function Portal() {
  const { user, logout } = useAuth();
  const [customerUser, setCustomerUser] = useState(null);
  const [tab, setTab] = useState('batches');
  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [bookingBatch, setBookingBatch] = useState(null);
  const [profile, setProfile] = useState(null);

  const isLoggedIn = !!(user || customerUser);
  const isCustomerRole = (user?.role === 'CUSTOMER') || (customerUser?.role === 'CUSTOMER');
  const activeUser = user || customerUser;

  const loadBatches = useCallback(async () => {
    setBatchesLoading(true);
    try {
      const res = await api.get('/portal/batches');
      setBatches(res.batches || []);
    } catch (err) {
      console.error(err);
    } finally {
      setBatchesLoading(false);
    }
  }, []);

  const loadProfile = useCallback(async () => {
    if (!isCustomerRole) return;
    try {
      const res = await api.get('/portal/profile');
      setProfile(res);
    } catch (err) {
      console.error(err);
    }
  }, [isCustomerRole]);

  useEffect(() => { loadBatches(); }, [loadBatches]);
  useEffect(() => { if (isLoggedIn) loadProfile(); }, [isLoggedIn, loadProfile]);

  const handleAuth = (u) => {
    setCustomerUser(u);
    setTab('batches');
  };

  const handleLogout = () => {
    if (logout) logout();
    setCustomerUser(null);
    api.clearTokens();
    localStorage.removeItem('user');
  };

  const handleBook = (batch) => {
    setBookingBatch(batch);
  };

  const handleBooked = () => {
    loadBatches();
    setTab('bookings');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.webp" alt="Fresh Eggs" className="w-9 h-9 object-contain" />
            <div>
              <h1 className="text-lg font-bold text-gray-900">Fresh Eggs Market</h1>
              <p className="text-xs text-gray-400 hidden sm:block">Order fresh eggs directly</p>
            </div>
          </div>
          {isLoggedIn && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600 hidden md:block">Hi, {activeUser?.firstName}</span>
              <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-red-500 transition">Sign out</button>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* If not logged in and on auth tab, show auth */}
        {!isLoggedIn && tab === 'auth' ? (
          <>
            <button onClick={() => setTab('batches')} className="text-sm text-green-600 hover:text-green-700 mb-4 flex items-center gap-1">
              ← Back to batches
            </button>
            <AuthPanel onAuth={handleAuth} />
          </>
        ) : (
          <>
            {/* Tab navigation (only if logged in as customer) */}
            {isCustomerRole && (
              <div className="flex gap-1 mb-6 bg-white rounded-xl p-1 border w-fit">
                <button onClick={() => setTab('batches')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === 'batches' ? 'bg-green-50 text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  🥚 Open Batches
                </button>
                <button onClick={() => setTab('bookings')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === 'bookings' ? 'bg-green-50 text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  📋 My Bookings
                </button>
              </div>
            )}

            {/* Not logged in banner */}
            {!isLoggedIn && (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-green-800">Want to book eggs?</h3>
                  <p className="text-sm text-green-600">Create an account or sign in to place a booking.</p>
                </div>
                <button onClick={() => setTab('auth')} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                  Sign In / Register
                </button>
              </div>
            )}

            {tab === 'batches' && (
              <OpenBatchesView batches={batches} loading={batchesLoading} onBook={handleBook} isLoggedIn={isLoggedIn && isCustomerRole} />
            )}
            {tab === 'bookings' && isCustomerRole && <MyBookingsView />}
          </>
        )}
      </div>

      {/* Booking modal */}
      {bookingBatch && (
        <BookingModal batch={bookingBatch} profile={profile} onClose={() => setBookingBatch(null)} onBooked={handleBooked} />
      )}

      {/* Footer */}
      <footer className="mt-12 py-6 border-t bg-white text-center text-xs text-gray-400">
        <p>Fresh Eggs Market · Premium farm-fresh eggs delivered to your table</p>
        <p className="mt-1">Questions? WhatsApp us at +234 XXX XXX XXXX</p>
      </footer>
    </div>
  );
}
