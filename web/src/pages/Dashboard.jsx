import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { Card, Badge, SkeletonMetric, SkeletonCard } from '../components/ui';

const fmt = (n) => Number(n || 0).toLocaleString('en-NG');
const fmtMoney = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 0 });
const fmtDate = (d) => new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });

/* ─── Severity badge styling ─── */
const SEVERITY_COLOR = { high: 'error', medium: 'warning', low: 'info', info: 'neutral' };

/* ─── Alert type icons (clean SVG) ─── */
const AlertIcons = {
  CASH_NOT_BANKED: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  ),
  LARGE_POS_PAYMENT: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  ),
  UNBOOKED_DEPOSIT: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  INVENTORY_DISCREPANCY: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
    </svg>
  ),
  BATCH_OVERDUE: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  BATCH_ARRIVING: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
};

/* ─── Metric Card ─── */
function MetricCard({ label, value, sub, icon, onClick }) {
  return (
    <Card
      variant={onClick ? 'interactive' : 'default'}
      padding="comfortable"
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-surface-400">{icon}</span>
        {sub && (
          <span className="text-caption text-surface-500 bg-surface-50 px-2 py-0.5 rounded-full">{sub}</span>
        )}
      </div>
      <div className="text-metric text-surface-800">{value}</div>
      <div className="text-caption text-surface-500 mt-1">{label}</div>
    </Card>
  );
}

/* ─── Bank Balance Card ─── */
function BankCard({ name, type, balance }) {
  const accents = {
    CUSTOMER_DEPOSIT: 'border-l-account-deposit',
    SALES: 'border-l-account-sales',
    PROFIT: 'border-l-account-profit',
    CASH_ON_HAND: 'border-l-warning-500',
  };
  return (
    <div className={`bg-surface-0 rounded-lg border border-surface-200 border-l-[3px] ${accents[type] || 'border-l-surface-300'} p-3`}>
      <div className="text-caption text-surface-500 mb-1">{name.replace(' Account', '')}</div>
      <div className={`text-heading ${balance >= 0 ? 'text-surface-800' : 'text-error-500'}`}>
        {fmtMoney(balance)}
      </div>
    </div>
  );
}

/* ─── Alert Card ─── */
function AlertCard({ alert }) {
  const sevColor = SEVERITY_COLOR[alert.severity] || 'neutral';
  const bgMap = { error: 'bg-error-50', warning: 'bg-warning-50', info: 'bg-info-50', neutral: 'bg-surface-50' };
  const borderMap = { error: 'border-error-100', warning: 'border-warning-100', info: 'border-info-100', neutral: 'border-surface-200' };
  const textMap = { error: 'text-error-700', warning: 'text-warning-700', info: 'text-info-700', neutral: 'text-surface-600' };
  const iconColor = { error: 'text-error-500', warning: 'text-warning-500', info: 'text-info-500', neutral: 'text-surface-400' };

  return (
    <div className={`${bgMap[sevColor]} ${borderMap[sevColor]} border rounded-lg p-3`}>
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 shrink-0 ${iconColor[sevColor]}`}>
          {AlertIcons[alert.type] || AlertIcons.BATCH_ARRIVING}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <Badge color={sevColor}>{alert.severity}</Badge>
            {alert.date && <span className="text-caption text-surface-400">{fmtDate(alert.date)}</span>}
          </div>
          <h4 className={`text-body-medium ${textMap[sevColor]}`}>{alert.title}</h4>
          <p className="text-caption text-surface-500 mt-0.5">{alert.message}</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Mini Table ─── */
function MiniTable({ columns, data, emptyText }) {
  if (!data || data.length === 0) {
    return <p className="text-body text-surface-400 text-center py-6">{emptyText}</p>;
  }
  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full min-w-[480px]">
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} className={`text-overline text-surface-500 uppercase pb-2 text-${col.align || 'left'}`}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={row.id || i} className="border-t border-surface-100">
              {columns.map(col => (
                <td key={col.key} className={`py-2.5 text-body text-${col.align || 'left'}`}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── MAIN DASHBOARD ─── */
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
    <div className="space-y-6">
      <div><div className="h-7 w-64 bg-surface-100 rounded-md animate-skeleton" /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <SkeletonMetric key={i} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SkeletonCard lines={4} />
        <div className="lg:col-span-2"><SkeletonCard lines={3} /></div>
      </div>
    </div>
  );

  const d = dashboard || {};

  const salesColumns = [
    { key: 'customer', label: 'Customer', render: (r) => <span className="text-body-medium text-surface-800">{r.customer}</span> },
    { key: 'batch', label: 'Batch', render: (r) => <span className="text-surface-500">{r.batch}</span> },
    { key: 'quantity', label: 'Qty', align: 'right' },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => <span className="text-body-medium text-success-700">{fmtMoney(r.amount)}</span> },
    { key: 'paymentMethod', label: 'Payment', align: 'right', render: (r) => <Badge status={r.paymentMethod}>{r.paymentMethod.replace('_', ' ')}</Badge> },
  ];

  const bookingColumns = [
    { key: 'customer', label: 'Customer', render: (r) => <span className="text-body-medium text-surface-800">{r.customer}</span> },
    { key: 'batch', label: 'Batch', render: (r) => <span className="text-surface-500">{r.batch}</span> },
    { key: 'quantity', label: 'Qty', align: 'right' },
    { key: 'amountPaid', label: 'Paid', align: 'right', render: (r) => fmtMoney(r.amountPaid) },
    { key: 'status', label: 'Status', align: 'right', render: (r) => <Badge status={r.status}>{r.status.replace('_', ' ')}</Badge> },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-display text-surface-800">{greeting()}, {user?.firstName}</h1>
        <p className="text-body text-surface-500 mt-1">
          {new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Urgent alerts banner */}
      {isAdmin && alertSummary.high > 0 && (
        <div className="mb-5 flex items-center gap-3 bg-error-50 border border-error-100 rounded-lg p-3">
          <svg className="w-5 h-5 text-error-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className="text-body-medium text-error-700">
            {alertSummary.high} urgent alert{alertSummary.high !== 1 ? 's' : ''} need attention
            {alertSummary.medium > 0 && <span className="text-error-500 font-normal ml-1">+ {alertSummary.medium} warnings</span>}
          </span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetricCard
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>}
          label="Today's Sales"
          value={fmtMoney(d.todaySales?.revenue)}
          sub={`${d.todaySales?.count || 0} sales`}
          onClick={() => navigate('/sales')}
        />
        <MetricCard
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
          label="Inventory"
          value={`${fmt(d.inventory?.onHand)} crates`}
          sub={`${fmt(d.inventory?.available)} available`}
          onClick={() => navigate('/inventory')}
        />
        <MetricCard
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /></svg>}
          label="Pending Bookings"
          value={d.bookings?.pending || 0}
          sub={fmtMoney(d.bookings?.pendingValue)}
          onClick={() => navigate('/bookings')}
        />
        <MetricCard
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /></svg>}
          label="Active Batches"
          value={(d.batches?.open || 0) + (d.batches?.received || 0)}
          sub={`${d.batches?.open || 0} open · ${d.batches?.received || 0} received`}
          onClick={() => navigate('/batches')}
        />
      </div>

      {/* P&L + Bank Balances */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Today's P&L */}
        <Card>
          <h3 className="text-overline text-surface-500 uppercase mb-4">Today's P&L</h3>
          <div className="space-y-2.5">
            <div className="flex justify-between text-body">
              <span className="text-surface-500">Revenue</span>
              <span className="text-body-medium text-success-700">{fmtMoney(d.todaySales?.revenue)}</span>
            </div>
            <div className="flex justify-between text-body">
              <span className="text-surface-500">Cost</span>
              <span className="text-body-medium text-error-500">{fmtMoney(d.todaySales?.cost)}</span>
            </div>
            <div className="border-t border-surface-100 pt-2 flex justify-between text-body">
              <span className="text-body-medium text-surface-800">Gross Profit</span>
              <span className={`text-body-medium ${(d.todaySales?.profit || 0) >= 0 ? 'text-success-700' : 'text-error-500'}`}>
                {fmtMoney(d.todaySales?.profit)}
              </span>
            </div>
            {d.todaySales?.revenue > 0 && (
              <div className="text-caption text-surface-400 text-right">
                Margin: {((d.todaySales?.profit / d.todaySales?.revenue) * 100).toFixed(1)}%
              </div>
            )}
            <div className="flex justify-between text-body text-surface-500 pt-1">
              <span>Crates sold</span>
              <span className="text-body-medium text-surface-700">{fmt(d.todaySales?.crates)}</span>
            </div>
          </div>
        </Card>

        {/* Bank balances */}
        <Card className="lg:col-span-2">
          <h3 className="text-overline text-surface-500 uppercase mb-4">Bank Balances</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {(d.bank || []).map(b => <BankCard key={b.name} {...b} />)}
          </div>
          {d.bank && d.bank.length > 0 && (
            <div className="mt-3 pt-3 border-t border-surface-100 flex justify-between text-body">
              <span className="text-surface-500">Total across all accounts</span>
              <span className="text-body-medium text-surface-800">{fmtMoney(d.bank.reduce((s, b) => s + b.balance, 0))}</span>
            </div>
          )}
        </Card>
      </div>

      {/* Alerts + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Alerts */}
        {isAdmin && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-overline text-surface-500 uppercase">Alerts & Flags</h3>
              {alertSummary.total > 0 && (
                <div className="flex gap-1.5">
                  {alertSummary.high > 0 && <Badge color="error">{alertSummary.high} high</Badge>}
                  {alertSummary.medium > 0 && <Badge color="warning">{alertSummary.medium} med</Badge>}
                  {alertSummary.low > 0 && <Badge color="info">{alertSummary.low} low</Badge>}
                </div>
              )}
            </div>

            {alertsLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" />
              </div>
            ) : alerts.length === 0 ? (
              <div className="text-center py-8">
                <svg className="w-10 h-10 text-success-500 mx-auto mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <p className="text-body text-surface-500">All clear — no alerts right now</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                {alerts.map(alert => <AlertCard key={alert.id} alert={alert} />)}
              </div>
            )}
          </Card>
        )}

        {/* Recent activity */}
        <div className={`space-y-4 ${!isAdmin ? 'lg:col-span-2' : ''}`}>
          <Card>
            <h3 className="text-overline text-surface-500 uppercase mb-3">Recent Sales</h3>
            <MiniTable columns={salesColumns} data={d.recentSales} emptyText="No recent sales" />
          </Card>
          <Card>
            <h3 className="text-overline text-surface-500 uppercase mb-3">Recent Bookings</h3>
            <MiniTable columns={bookingColumns} data={d.recentBookings} emptyText="No recent bookings" />
          </Card>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-caption text-surface-400">
        {fmt(d.totalCustomers || 0)} total customers
      </div>
    </div>
  );
}
