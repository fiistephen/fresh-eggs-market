import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';

const fmt = (n) => Number(n || 0).toLocaleString('en-NG');
const fmtMoney = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 0 });
const fmtDate = (d) => new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });

// ─── SEVERITY CONFIG ─────────────────────────────────────────────
const SEVERITY = {
  high: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', badge: 'bg-red-100 text-red-700', icon: '🔴', label: 'High' },
  medium: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', badge: 'bg-amber-100 text-amber-700', icon: '🟡', label: 'Medium' },
  low: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', badge: 'bg-blue-100 text-blue-700', icon: '🔵', label: 'Low' },
  info: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', badge: 'bg-gray-100 text-gray-600', icon: 'ℹ️', label: 'Info' },
};

const ALERT_TYPE_ICONS = {
  CASH_NOT_BANKED: '💵',
  LARGE_POS_PAYMENT: '💳',
  UNBOOKED_DEPOSIT: '📨',
  INVENTORY_DISCREPANCY: '📦',
  BATCH_OVERDUE: '🚛',
  BATCH_ARRIVING: '📅',
};

// ─── METRIC CARD ─────────────────────────────────────────────────
function MetricCard({ icon, label, value, sub, color, onClick }) {
  const colors = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    amber: 'from-amber-500 to-amber-600',
    purple: 'from-purple-500 to-purple-600',
    red: 'from-red-500 to-red-600',
    gray: 'from-gray-500 to-gray-600',
  };
  return (
    <div onClick={onClick} className={`bg-gradient-to-br ${colors[color]} rounded-xl p-4 text-white shadow-sm ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{icon}</span>
        {sub && <span className="text-xs bg-white/20 rounded-full px-2 py-0.5">{sub}</span>}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm opacity-80 mt-1">{label}</div>
    </div>
  );
}

// ─── BANK BALANCE CARD ───────────────────────────────────────────
function BankCard({ name, type, balance }) {
  const typeColors = {
    CUSTOMER_DEPOSIT: 'border-l-blue-500',
    SALES: 'border-l-green-500',
    PROFIT: 'border-l-purple-500',
  };
  const shortName = name.replace(' Account', '');
  return (
    <div className={`bg-white rounded-lg border border-l-4 ${typeColors[type] || 'border-l-gray-400'} p-3`}>
      <div className="text-xs text-gray-500 mb-1">{shortName}</div>
      <div className={`text-lg font-bold ${balance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{fmtMoney(balance)}</div>
    </div>
  );
}

// ─── ALERT CARD ──────────────────────────────────────────────────
function AlertCard({ alert }) {
  const sev = SEVERITY[alert.severity] || SEVERITY.info;
  const typeIcon = ALERT_TYPE_ICONS[alert.type] || '⚠️';
  return (
    <div className={`${sev.bg} ${sev.border} border rounded-lg p-3`}>
      <div className="flex items-start gap-2">
        <span className="text-lg mt-0.5">{typeIcon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sev.badge}`}>{sev.label}</span>
            <span className="text-xs text-gray-400">{alert.date ? fmtDate(alert.date) : ''}</span>
          </div>
          <h4 className={`text-sm font-semibold ${sev.text}`}>{alert.title}</h4>
          <p className="text-xs text-gray-600 mt-0.5">{alert.message}</p>
        </div>
      </div>
    </div>
  );
}

// ─── RECENT ACTIVITY ─────────────────────────────────────────────
function RecentSalesTable({ sales }) {
  if (!sales || sales.length === 0) return <p className="text-gray-400 text-sm text-center py-4">No recent sales</p>;
  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full text-sm min-w-[480px]">
        <thead><tr className="text-xs text-gray-400"><th className="text-left pb-2">Customer</th><th className="text-left pb-2">Batch</th><th className="text-right pb-2">Qty</th><th className="text-right pb-2">Amount</th><th className="text-right pb-2">Payment</th></tr></thead>
        <tbody>
          {sales.map(s => (
            <tr key={s.id} className="border-t border-gray-100">
              <td className="py-2 font-medium">{s.customer}</td>
              <td className="py-2 text-gray-500">{s.batch}</td>
              <td className="py-2 text-right">{s.quantity}</td>
              <td className="py-2 text-right text-green-700 font-medium">{fmtMoney(s.amount)}</td>
              <td className="py-2 text-right"><span className="text-xs bg-gray-100 rounded px-1.5 py-0.5">{s.paymentMethod.replace('_', ' ')}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecentBookingsTable({ bookings }) {
  if (!bookings || bookings.length === 0) return <p className="text-gray-400 text-sm text-center py-4">No recent bookings</p>;
  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full text-sm min-w-[480px]">
        <thead><tr className="text-xs text-gray-400"><th className="text-left pb-2">Customer</th><th className="text-left pb-2">Batch</th><th className="text-right pb-2">Qty</th><th className="text-right pb-2">Paid</th><th className="text-right pb-2">Status</th></tr></thead>
        <tbody>
          {bookings.map(b => (
            <tr key={b.id} className="border-t border-gray-100">
              <td className="py-2 font-medium">{b.customer}</td>
              <td className="py-2 text-gray-500">{b.batch}</td>
              <td className="py-2 text-right">{b.quantity}</td>
              <td className="py-2 text-right">{fmtMoney(b.amountPaid)}</td>
              <td className="py-2 text-right">
                <span className={`text-xs rounded px-1.5 py-0.5 ${b.status === 'CONFIRMED' ? 'bg-green-100 text-green-700' : b.status === 'PICKED_UP' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                  {b.status.replace('_', ' ')}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── MAIN DASHBOARD ──────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [alertSummary, setAlertSummary] = useState({ total: 0, high: 0, medium: 0, low: 0, info: 0 });
  const [loading, setLoading] = useState(true);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const loadDashboard = useCallback(async () => {
    try {
      const res = await api.get('/dashboard');
      setDashboard(res);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    if (!isAdmin) { setAlertsLoading(false); return; }
    try {
      const res = await api.get('/alerts');
      setAlerts(res.alerts || []);
      setAlertSummary(res.summary || alertSummary);
    } catch (err) {
      console.error('Alerts load error:', err);
    } finally {
      setAlertsLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { loadDashboard(); loadAlerts(); }, [loadDashboard, loadAlerts]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full" />
    </div>
  );

  const d = dashboard || {};

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">{greeting()}, {user?.firstName}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Alerts banner (if any high/medium) */}
      {isAdmin && alertSummary.high > 0 && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
          <span className="text-2xl">🚨</span>
          <div>
            <span className="text-sm font-semibold text-red-800">{alertSummary.high} urgent alert{alertSummary.high !== 1 ? 's' : ''} need attention</span>
            {alertSummary.medium > 0 && <span className="text-sm text-red-600 ml-2">+ {alertSummary.medium} warnings</span>}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetricCard icon="💰" label="Today's Sales" value={fmtMoney(d.todaySales?.revenue)} sub={`${d.todaySales?.count || 0} sales`} color="green" onClick={() => navigate('/sales')} />
        <MetricCard icon="📦" label="Inventory On Hand" value={`${fmt(d.inventory?.onHand)} crates`} sub={`${fmt(d.inventory?.available)} avail`} color="blue" onClick={() => navigate('/inventory')} />
        <MetricCard icon="📋" label="Pending Bookings" value={d.bookings?.pending || 0} sub={fmtMoney(d.bookings?.pendingValue)} color="amber" onClick={() => navigate('/bookings')} />
        <MetricCard icon="🚛" label="Active Batches" value={(d.batches?.open || 0) + (d.batches?.received || 0)} sub={`${d.batches?.open || 0} open · ${d.batches?.received || 0} received`} color="purple" onClick={() => navigate('/batches')} />
      </div>

      {/* Today's P&L + Bank */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Today's P&L */}
        <div className="bg-white rounded-xl border p-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Today's P&L</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm"><span className="text-gray-500">Revenue</span><span className="font-medium text-green-700">{fmtMoney(d.todaySales?.revenue)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Cost</span><span className="font-medium text-red-600">{fmtMoney(d.todaySales?.cost)}</span></div>
            <hr />
            <div className="flex justify-between text-sm font-bold"><span>Gross Profit</span><span className={d.todaySales?.profit >= 0 ? 'text-green-700' : 'text-red-600'}>{fmtMoney(d.todaySales?.profit)}</span></div>
            {d.todaySales?.revenue > 0 && (
              <div className="text-xs text-gray-400 text-right">Margin: {((d.todaySales?.profit / d.todaySales?.revenue) * 100).toFixed(1)}%</div>
            )}
            <div className="flex justify-between text-sm text-gray-500 pt-1"><span>Crates sold</span><span className="font-medium">{fmt(d.todaySales?.crates)}</span></div>
          </div>
        </div>

        {/* Bank balances */}
        <div className="bg-white rounded-xl border p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Bank Balances</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(d.bank || []).map(b => <BankCard key={b.name} {...b} />)}
          </div>
          {d.bank && d.bank.length > 0 && (
            <div className="mt-3 pt-3 border-t flex justify-between text-sm">
              <span className="text-gray-500">Total across all accounts</span>
              <span className="font-bold">{fmtMoney(d.bank.reduce((s, b) => s + b.balance, 0))}</span>
            </div>
          )}
        </div>
      </div>

      {/* Alerts + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Alerts panel */}
        {isAdmin && (
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Alerts & Flags</h3>
              {alertSummary.total > 0 && (
                <div className="flex gap-2 text-xs">
                  {alertSummary.high > 0 && <span className="bg-red-100 text-red-700 rounded-full px-2 py-0.5">{alertSummary.high} high</span>}
                  {alertSummary.medium > 0 && <span className="bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">{alertSummary.medium} med</span>}
                  {alertSummary.low > 0 && <span className="bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">{alertSummary.low} low</span>}
                </div>
              )}
            </div>

            {alertsLoading ? (
              <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-3 border-green-500 border-t-transparent rounded-full" /></div>
            ) : alerts.length === 0 ? (
              <div className="text-center py-8">
                <span className="text-4xl">✅</span>
                <p className="text-gray-400 text-sm mt-2">All clear — no alerts at this time</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {alerts.map(alert => <AlertCard key={alert.id} alert={alert} />)}
              </div>
            )}
          </div>
        )}

        {/* Recent activity */}
        <div className={`space-y-4 ${!isAdmin ? 'lg:col-span-2' : ''}`}>
          <div className="bg-white rounded-xl border p-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Recent Sales</h3>
            <RecentSalesTable sales={d.recentSales} />
          </div>
          <div className="bg-white rounded-xl border p-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Recent Bookings</h3>
            <RecentBookingsTable bookings={d.recentBookings} />
          </div>
        </div>
      </div>

      {/* Quick stats footer */}
      <div className="mt-6 text-center text-xs text-gray-400">
        {fmt(d.totalCustomers || 0)} total customers · System running normally
      </div>
    </div>
  );
}
