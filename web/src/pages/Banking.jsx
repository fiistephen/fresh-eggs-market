import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

const DIRECTION_COLORS = { INFLOW: 'text-green-600', OUTFLOW: 'text-red-600' };
const ACCOUNT_COLORS = {
  CUSTOMER_DEPOSIT: 'bg-blue-50 border-blue-200',
  SALES: 'bg-green-50 border-green-200',
  PROFIT: 'bg-purple-50 border-purple-200',
};

const CATEGORY_LABELS = {
  CUSTOMER_DEPOSIT: 'Customer Deposit', CUSTOMER_BOOKING: 'Customer Booking',
  SALES_TRANSFER_IN: 'Sales Transfer In', PROFIT_TRANSFER_IN: 'Profit Transfer In',
  POS_SETTLEMENT: 'POS Settlement',
  REFUND: 'Refund', BANK_CHARGES: 'Bank Charges',
  SALES_TRANSFER_OUT: 'Sales Transfer Out', PROFIT_TRANSFER_OUT: 'Profit Transfer Out',
  FARMER_PAYMENT: 'Farmer Payment', SALARY: 'Salary', DIESEL_FUEL: 'Diesel/Fuel',
  INTERNET: 'Internet', MARKETING: 'Marketing', OTHER_EXPENSE: 'Other Expense',
};

const INFLOW_CATS = ['CUSTOMER_DEPOSIT', 'CUSTOMER_BOOKING', 'SALES_TRANSFER_IN', 'PROFIT_TRANSFER_IN', 'POS_SETTLEMENT'];
const OUTFLOW_CATS = ['REFUND', 'BANK_CHARGES', 'SALES_TRANSFER_OUT', 'PROFIT_TRANSFER_OUT', 'FARMER_PAYMENT', 'SALARY', 'DIESEL_FUEL', 'INTERNET', 'MARKETING', 'OTHER_EXPENSE'];

function formatCurrency(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(n);
}
function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}
function todayStr() { return new Date().toISOString().slice(0, 10); }

export default function Banking() {
  const { user } = useAuth();
  const [activeView, setActiveView] = useState('transactions'); // transactions, reconciliation, unbooked, liability, expenses
  const [accounts, setAccounts] = useState([]);
  const [reconciliation, setReconciliation] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [accountFilter, setAccountFilter] = useState('');
  const [directionFilter, setDirectionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [showRecord, setShowRecord] = useState(false);

  const canRecord = ['ADMIN', 'MANAGER', 'RECORD_KEEPER'].includes(user?.role);
  const canViewReports = ['ADMIN', 'MANAGER'].includes(user?.role);

  useEffect(() => { loadAccounts(); }, []);
  useEffect(() => { if (canViewReports) loadReconciliation(); }, []);
  useEffect(() => { loadTransactions(); }, [accountFilter, directionFilter, dateFrom, dateTo]);

  async function loadAccounts() {
    try {
      const data = await api.get('/banking/accounts');
      setAccounts(data.accounts);
    } catch {}
  }

  async function loadReconciliation() {
    try {
      const data = await api.get('/banking/reconciliation');
      setReconciliation(data.reconciliation);
    } catch {}
  }

  async function loadTransactions() {
    setLoading(true);
    try {
      let params = '?limit=100';
      if (accountFilter) params += `&bankAccountId=${accountFilter}`;
      if (directionFilter) params += `&direction=${directionFilter}`;
      if (dateFrom) params += `&dateFrom=${dateFrom}`;
      if (dateTo) params += `&dateTo=${dateTo}`;
      const data = await api.get(`/banking/transactions${params}`);
      setTransactions(data.transactions);
      setTotal(data.total);
    } catch {
      setError('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }

  function refresh() {
    loadTransactions();
    if (canViewReports) loadReconciliation();
  }

  const views = [
    { key: 'transactions', label: 'Transactions' },
    ...(canViewReports ? [
      { key: 'reconciliation', label: 'Reconciliation' },
      { key: 'unbooked', label: 'Unbooked Deposits' },
      { key: 'liability', label: 'Customer Liability' },
      { key: 'expenses', label: 'Expenses' },
    ] : []),
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Banking</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">Track transactions across all 3 Providus accounts.</p>
        </div>
        {canRecord && (
          <button
            onClick={() => setShowRecord(true)}
            className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <span className="text-lg leading-none">+</span> Record Transaction
          </button>
        )}
      </div>

      {/* Account balance cards */}
      {canViewReports && reconciliation.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {reconciliation.map(acc => (
            <div key={acc.id} className={`rounded-xl border p-4 ${ACCOUNT_COLORS[acc.accountType] || 'bg-white border-gray-200'}`}>
              <p className="text-xs text-gray-500 uppercase tracking-wider">{acc.account}</p>
              <p className="text-xs text-gray-400">...{acc.lastFour}</p>
              <p className="text-xl font-bold text-gray-900 mt-2">{formatCurrency(acc.systemBalance)}</p>
              <div className="flex gap-4 mt-1 text-xs">
                <span className="text-green-600">In: {formatCurrency(acc.totalInflows)}</span>
                <span className="text-red-500">Out: {formatCurrency(acc.totalOutflows)}</span>
                <span className="text-gray-400">{acc.transactionCount} txns</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit overflow-x-auto">
        {views.map(v => (
          <button
            key={v.key}
            onClick={() => setActiveView(v.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeView === v.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}

      {/* Views */}
      {activeView === 'transactions' && (
        <TransactionsView
          transactions={transactions}
          total={total}
          loading={loading}
          accounts={accounts}
          accountFilter={accountFilter}
          setAccountFilter={setAccountFilter}
          directionFilter={directionFilter}
          setDirectionFilter={setDirectionFilter}
          dateFrom={dateFrom}
          setDateFrom={setDateFrom}
          dateTo={dateTo}
          setDateTo={setDateTo}
        />
      )}
      {activeView === 'reconciliation' && <ReconciliationView reconciliation={reconciliation} />}
      {activeView === 'unbooked' && <UnbookedDepositsView />}
      {activeView === 'liability' && <CustomerLiabilityView />}
      {activeView === 'expenses' && <ExpensesView />}

      {/* Record modal */}
      {showRecord && (
        <RecordTransactionModal
          accounts={accounts}
          onClose={() => setShowRecord(false)}
          onRecorded={() => { setShowRecord(false); refresh(); }}
        />
      )}
    </div>
  );
}

// ─── TRANSACTIONS VIEW ────────────────────────────────────────

function TransactionsView({ transactions, total, loading, accounts, accountFilter, setAccountFilter, directionFilter, setDirectionFilter, dateFrom, setDateFrom, dateTo, setDateTo }) {
  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-2 sm:gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Account</label>
          <select value={accountFilter} onChange={e => setAccountFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none">
            <option value="">All accounts</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Direction</label>
          <select value={directionFilter} onChange={e => setDirectionFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none">
            <option value="">All</option>
            <option value="INFLOW">Inflows</option>
            <option value="OUTFLOW">Outflows</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
        </div>
        {(accountFilter || directionFilter || dateFrom || dateTo) && (
          <button onClick={() => { setAccountFilter(''); setDirectionFilter(''); setDateFrom(''); setDateTo(''); }}
            className="text-sm text-gray-400 hover:text-gray-600 pb-1">Clear filters</button>
        )}
      </div>

      <p className="text-xs text-gray-400 mb-2">{total} transaction{total !== 1 ? 's' : ''}</p>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading transactions...</div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🏦</div>
          <p className="text-gray-500">No transactions found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full min-w-max">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Account</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">By</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => (
                <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="py-3 px-4 text-sm text-gray-600">{formatDate(t.transactionDate)}</td>
                  <td className="py-3 px-4 text-sm">
                    <span className="font-medium text-gray-700">{t.bankAccount?.name?.replace(' Account', '')}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {CATEGORY_LABELS[t.category] || t.category}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500 max-w-48 truncate">{t.description || t.reference || '—'}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{t.customer?.name || '—'}</td>
                  <td className={`py-3 px-4 text-sm text-right font-semibold ${DIRECTION_COLORS[t.direction]}`}>
                    {t.direction === 'INFLOW' ? '+' : '-'}{formatCurrency(t.amount)}
                  </td>
                  <td className="py-3 px-4 text-xs text-gray-400">
                    {t.enteredBy ? `${t.enteredBy.firstName}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── RECONCILIATION VIEW ──────────────────────────────────────

function ReconciliationView({ reconciliation }) {
  const totalBalance = reconciliation.reduce((s, a) => s + a.systemBalance, 0);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">Account Balances (System)</h3>
        <div className="overflow-x-auto">
        <table className="w-full min-w-max">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-2 text-xs text-gray-500">Account</th>
              <th className="text-right py-2 text-xs text-gray-500">Total Inflows</th>
              <th className="text-right py-2 text-xs text-gray-500">Total Outflows</th>
              <th className="text-right py-2 text-xs text-gray-500">System Balance</th>
              <th className="text-right py-2 text-xs text-gray-500">Transactions</th>
            </tr>
          </thead>
          <tbody>
            {reconciliation.map(acc => (
              <tr key={acc.id} className="border-b border-gray-50">
                <td className="py-3">
                  <span className="font-medium text-gray-900">{acc.account}</span>
                  <span className="text-xs text-gray-400 ml-2">...{acc.lastFour}</span>
                </td>
                <td className="py-3 text-sm text-right text-green-600">{formatCurrency(acc.totalInflows)}</td>
                <td className="py-3 text-sm text-right text-red-500">{formatCurrency(acc.totalOutflows)}</td>
                <td className="py-3 text-sm text-right font-bold text-gray-900">{formatCurrency(acc.systemBalance)}</td>
                <td className="py-3 text-sm text-right text-gray-500">{acc.transactionCount}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 font-bold">
              <td className="py-3 text-sm">Total across all accounts</td>
              <td className="py-3 text-sm text-right text-green-600">{formatCurrency(reconciliation.reduce((s, a) => s + a.totalInflows, 0))}</td>
              <td className="py-3 text-sm text-right text-red-500">{formatCurrency(reconciliation.reduce((s, a) => s + a.totalOutflows, 0))}</td>
              <td className="py-3 text-sm text-right">{formatCurrency(totalBalance)}</td>
              <td className="py-3 text-sm text-right text-gray-500">{reconciliation.reduce((s, a) => s + a.transactionCount, 0)}</td>
            </tr>
          </tfoot>
        </table>
        </div>
      </div>

      <p className="text-sm text-gray-400">Compare these system balances against your actual bank statement balances to identify discrepancies.</p>
    </div>
  );
}

// ─── UNBOOKED DEPOSITS VIEW ───────────────────────────────────

function UnbookedDepositsView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/banking/unbooked-deposits').then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>;
  if (!data || data.count === 0) return <div className="text-center py-16"><div className="text-4xl mb-3">✅</div><p className="text-gray-500">No unbooked deposits</p></div>;

  return (
    <div className="space-y-4">
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
        <p className="text-sm text-yellow-800">
          <span className="font-bold">{data.count}</span> customer deposit{data.count !== 1 ? 's' : ''} totalling <span className="font-bold">{formatCurrency(data.total)}</span> — money received but customer hasn't communicated what they want.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-max">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Account</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Entered By</th>
            </tr>
          </thead>
          <tbody>
            {data.deposits.map(d => (
              <tr key={d.id} className="border-b border-gray-50">
                <td className="py-3 px-4 text-sm text-gray-600">{formatDate(d.transactionDate)}</td>
                <td className="py-3 px-4">
                  <span className="font-medium text-gray-900 text-sm">{d.customer?.name || '—'}</span>
                  {d.customer?.phone && <span className="text-xs text-gray-400 ml-2">{d.customer.phone}</span>}
                </td>
                <td className="py-3 px-4 text-sm text-gray-500">{d.bankAccount?.name || '—'}</td>
                <td className="py-3 px-4 text-sm text-right font-semibold text-green-600">{formatCurrency(d.amount)}</td>
                <td className="py-3 px-4 text-xs text-gray-400">{d.enteredBy ? `${d.enteredBy.firstName} ${d.enteredBy.lastName}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

// ─── CUSTOMER LIABILITY VIEW ──────────────────────────────────

function CustomerLiabilityView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/banking/customer-liability').then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>;
  if (!data || data.count === 0) return <div className="text-center py-16"><div className="text-4xl mb-3">✅</div><p className="text-gray-500">No outstanding customer liabilities</p></div>;

  return (
    <div className="space-y-4">
      <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
        <p className="text-sm text-orange-800">
          <span className="font-bold">{data.count}</span> confirmed booking{data.count !== 1 ? 's' : ''} totalling <span className="font-bold">{formatCurrency(data.totalLiability)}</span> — customer money held for eggs not yet delivered.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-max">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Batch</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Qty</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Amount Paid</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Booked On</th>
            </tr>
          </thead>
          <tbody>
            {data.bookings.map((b, i) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="py-3 px-4">
                  <span className="font-medium text-gray-900 text-sm">{b.customer}</span>
                  <span className="text-xs text-gray-400 ml-2">{b.phone}</span>
                </td>
                <td className="py-3 px-4 text-sm font-medium text-gray-700">{b.batch}</td>
                <td className="py-3 px-4 text-sm text-right">{b.quantity}</td>
                <td className="py-3 px-4 text-sm text-right font-semibold text-orange-600">{formatCurrency(b.amountPaid)}</td>
                <td className="py-3 px-4 text-sm text-gray-500">{formatDate(b.bookedOn)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

// ─── EXPENSES VIEW ────────────────────────────────────────────

function ExpensesView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => { loadExpenses(); }, [dateFrom, dateTo]);

  async function loadExpenses() {
    setLoading(true);
    try {
      let params = '';
      if (dateFrom) params += `${params ? '&' : '?'}dateFrom=${dateFrom}`;
      if (dateTo) params += `${params ? '&' : '?'}dateTo=${dateTo}`;
      const result = await api.get(`/banking/expenses${params}`);
      setData(result);
    } catch {}
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 sm:gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : !data || data.count === 0 ? (
        <div className="text-center py-16"><div className="text-4xl mb-3">💸</div><p className="text-gray-500">No expenses found</p></div>
      ) : (
        <>
          {/* Category breakdown cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(data.byCategory).map(([cat, info]) => (
              <div key={cat} className="bg-white rounded-lg border border-gray-200 p-3">
                <p className="text-xs text-gray-400">{CATEGORY_LABELS[cat] || cat}</p>
                <p className="text-lg font-bold text-red-600 mt-1">{formatCurrency(info.total)}</p>
                <p className="text-xs text-gray-400">{info.count} txn{info.count !== 1 ? 's' : ''}</p>
              </div>
            ))}
          </div>

          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm text-red-800">
              Total expenses: <span className="font-bold">{formatCurrency(data.total)}</span> across <span className="font-bold">{data.count}</span> transactions
            </p>
          </div>

          {/* Expense list */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Account</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.expenses.map(e => (
                  <tr key={e.id} className="border-b border-gray-50">
                    <td className="py-3 px-4 text-sm text-gray-600">{formatDate(e.transactionDate)}</td>
                    <td className="py-3 px-4">
                      <span className="text-xs font-medium bg-red-50 text-red-600 px-2 py-0.5 rounded">{CATEGORY_LABELS[e.category]}</span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500">{e.description || e.reference || '—'}</td>
                    <td className="py-3 px-4 text-sm text-gray-500">{e.bankAccount?.name || '—'}</td>
                    <td className="py-3 px-4 text-sm text-right font-semibold text-red-600">{formatCurrency(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── RECORD TRANSACTION MODAL ─────────────────────────────────

function RecordTransactionModal({ accounts, onClose, onRecorded }) {
  const [form, setForm] = useState({
    bankAccountId: accounts[0]?.id || '',
    direction: 'INFLOW',
    category: 'CUSTOMER_DEPOSIT',
    amount: '',
    description: '',
    reference: '',
    transactionDate: todayStr(),
    customerId: '',
  });
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const categories = form.direction === 'INFLOW' ? INFLOW_CATS : OUTFLOW_CATS;

  // Reset category when direction changes
  function setDirection(dir) {
    const cats = dir === 'INFLOW' ? INFLOW_CATS : OUTFLOW_CATS;
    setForm(f => ({ ...f, direction: dir, category: cats[0] }));
  }

  // Customer search
  useEffect(() => {
    if (!customerSearch.trim()) { setCustomers([]); return; }
    const timer = setTimeout(async () => {
      try {
        const data = await api.get(`/customers?search=${encodeURIComponent(customerSearch)}`);
        setCustomers(data.customers);
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  const needsCustomer = ['CUSTOMER_DEPOSIT', 'CUSTOMER_BOOKING', 'REFUND'].includes(form.category);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post('/banking/transactions', {
        bankAccountId: form.bankAccountId,
        direction: form.direction,
        category: form.category,
        amount: Number(form.amount),
        description: form.description.trim() || undefined,
        reference: form.reference.trim() || undefined,
        transactionDate: form.transactionDate,
        customerId: selectedCustomer?.id || undefined,
      });
      onRecorded();
    } catch (err) {
      setError(err.error || 'Failed to record transaction');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900">Record Bank Transaction</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 flex-1 overflow-y-auto">
          {error && <div className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm">{error}</div>}

          {/* Direction toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Direction</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setDirection('INFLOW')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  form.direction === 'INFLOW' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>Money In</button>
              <button type="button" onClick={() => setDirection('OUTFLOW')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  form.direction === 'OUTFLOW' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>Money Out</button>
            </div>
          </div>

          {/* Account + Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bank Account</label>
              <select value={form.bankAccountId} onChange={e => setForm(f => ({ ...f, bankAccountId: e.target.value }))} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none">
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input type="date" required value={form.transactionDate}
                onChange={e => setForm(f => ({ ...f, transactionDate: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
            </div>
          </div>

          {/* Category + Amount */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none">
                {categories.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₦)</label>
              <input type="number" required min="1" placeholder="0" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
            </div>
          </div>

          {/* Customer (for deposit/booking/refund) */}
          {needsCustomer && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
              {selectedCustomer ? (
                <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-sm font-medium">{selectedCustomer.name}</span>
                  <span className="text-xs text-gray-400">{selectedCustomer.phone}</span>
                  <button type="button" onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); }}
                    className="ml-auto text-xs text-gray-400 hover:text-gray-600">Change</button>
                </div>
              ) : (
                <>
                  <input type="text" placeholder="Search customer..." value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
                  {customers.length > 0 && (
                    <div className="border border-gray-200 rounded-lg mt-1 max-h-40 overflow-y-auto">
                      {customers.map(c => (
                        <button key={c.id} type="button" onClick={() => { setSelectedCustomer(c); setCustomers([]); }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0">
                          <span className="font-medium">{c.name}</span>
                          <span className="text-gray-400 ml-2">{c.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Description + Reference */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input type="text" placeholder="Optional" value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bank Reference</label>
              <input type="text" placeholder="Optional" value={form.reference}
                onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-4 mt-4 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg">Cancel</button>
            <button type="submit" disabled={submitting}
              className={`px-4 sm:px-6 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 ${
                form.direction === 'INFLOW' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
              }`}>
              {submitting ? 'Recording...' : `Record ${form.direction === 'INFLOW' ? 'Inflow' : 'Outflow'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
