import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../lib/api';
import { buildCategoryMap } from './shared/constants';
import { ActionButton } from './shared/ui';

// Views
import TodayView from './TodayView';
import TransactionsView from './TransactionsView';
import ImportsView from './StatementImport/ImportQueue';
import QueueList from './BookingQueue/QueueList';
import PortalTransferQueue from './PortalTransferQueue';
import AccountBalances from './Reports/AccountBalances';
import UnbookedDeposits from './Reports/UnbookedDeposits';
import CustomerLiability from './Reports/CustomerLiability';
import Expenses from './Reports/Expenses';

// Modals
import RecordTransactionModal from './RecordTransactionModal';
import BulkTransactionModal from './BulkTransactionModal';
import InternalTransferModal from './InternalTransferModal';
import StatementImportModal from './StatementImportModal';
import ReconciliationModal from './ReconciliationModal';

/* ── Navigation config ─────────────────────────────────── */

const NAV_SECTIONS = [
  {
    label: 'Daily',
    items: [
      { key: 'today', label: 'Overview', icon: 'home' },
      { key: 'transactions', label: 'Transactions', icon: 'list' },
      { key: 'imports', label: 'Bank Statements', icon: 'file' },
      { key: 'customer-bookings', label: 'Bookings Queue', icon: 'users', badge: true },
      { key: 'portal-transfers', label: 'Portal Transfers', icon: 'globe' },
    ],
  },
  {
    label: 'Reports',
    adminOnly: true,
    items: [
      { key: 'balances', label: 'Account Balances', icon: 'bar-chart' },
      { key: 'unbooked', label: 'Unbooked Deposits', icon: 'alert-circle' },
      { key: 'liability', label: 'Customer Liability', icon: 'shield' },
      { key: 'expenses', label: 'Expenses', icon: 'credit-card' },
    ],
  },
];

/* ── Minimal icon set (inline SVG paths) ───────────────── */

const ICONS = {
  home: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4',
  list: 'M4 6h16M4 10h16M4 14h16M4 18h16',
  file: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  users: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  globe: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9',
  'bar-chart': 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6m6 0H3m6 0h6m0 0v-4a2 2 0 012-2h2a2 2 0 012 2v4m-6 0h6',
  'alert-circle': 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  shield: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  'credit-card': 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
};

function NavIcon({ name, className = 'w-5 h-5' }) {
  const d = ICONS[name];
  if (!d) return null;
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

/* ── Main Banking page component ───────────────────────── */

export default function Banking() {
  const { user } = useAuth();

  /* ── View state ──────────────────────────────────────── */
  const [activeView, setActiveView] = useState('today');

  /* ── Data state ──────────────────────────────────────── */
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [transactionsTotal, setTransactionsTotal] = useState(0);
  const [imports, setImports] = useState([]);
  const [reconciliations, setReconciliations] = useState([]);
  const [transactionCategories, setTransactionCategories] = useState([]);
  const [selectedImportId, setSelectedImportId] = useState('');
  const [selectedImport, setSelectedImport] = useState(null);
  const [selectedImportLines, setSelectedImportLines] = useState([]);
  const [customerBookingQueue, setCustomerBookingQueue] = useState([]);
  const [customerBookingBatches, setCustomerBookingBatches] = useState([]);
  const [portalTransferQueue, setPortalTransferQueue] = useState([]);
  const [bankingPolicy, setBankingPolicy] = useState({ bookingMinimumPaymentPercent: 80 });

  /* ── Loading / error state ───────────────────────────── */
  const [loading, setLoading] = useState(true);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [importsLoading, setImportsLoading] = useState(false);
  const [selectedImportLoading, setSelectedImportLoading] = useState(false);
  const [reconciliationsLoading, setReconciliationsLoading] = useState(false);
  const [customerBookingLoading, setCustomerBookingLoading] = useState(false);
  const [portalTransferLoading, setPortalTransferLoading] = useState(false);
  const [error, setError] = useState('');

  /* ── Transaction filters ─────────────────────────────── */
  const [filters, setFilters] = useState({
    bankAccountId: '',
    direction: '',
    sourceType: '',
    dateFrom: '',
    dateTo: '',
  });

  /* ── Modal visibility ────────────────────────────────── */
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [postingImport, setPostingImport] = useState(false);

  /* ── Derived ─────────────────────────────────────────── */
  const canRecord = ['ADMIN', 'MANAGER', 'RECORD_KEEPER'].includes(user?.role);
  const canViewReports = ['ADMIN', 'MANAGER'].includes(user?.role);
  const categoryMap = buildCategoryMap(transactionCategories);

  /* ── Effects ─────────────────────────────────────────── */

  useEffect(() => { loadWorkspace(); }, []);

  useEffect(() => {
    if (activeView === 'transactions') loadTransactions();
  }, [activeView, filters.bankAccountId, filters.direction, filters.sourceType, filters.dateFrom, filters.dateTo]);

  useEffect(() => {
    if (activeView === 'imports') loadImports();
  }, [activeView]);

  useEffect(() => {
    if (activeView === 'balances') loadReconciliations();
  }, [activeView]);

  useEffect(() => {
    if (selectedImportId) {
      loadImportDetail(selectedImportId);
    } else {
      setSelectedImport(null);
      setSelectedImportLines([]);
    }
  }, [selectedImportId]);

  /* ── Data loaders ────────────────────────────────────── */

  async function loadWorkspace() {
    setLoading(true);
    setError('');
    try {
      await Promise.all([
        loadMeta(),
        loadAccounts(),
        loadImports(),
        loadCustomerBookings(),
        loadPortalTransferQueue(),
        canViewReports ? loadReconciliations() : Promise.resolve(),
        loadTransactions(true),
      ]);
    } catch {
      setError('Failed to load banking workspace');
    } finally {
      setLoading(false);
    }
  }

  async function loadAccounts() {
    const data = await api.get('/banking/accounts');
    setAccounts(data.accounts || []);
  }

  async function loadMeta() {
    const data = await api.get('/banking/meta');
    setTransactionCategories(data.transactionCategories || []);
  }

  async function loadTransactions(skipLoader = false) {
    if (!skipLoader) setTransactionsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (filters.bankAccountId) params.set('bankAccountId', filters.bankAccountId);
      if (filters.direction) params.set('direction', filters.direction);
      if (filters.sourceType) params.set('sourceType', filters.sourceType);
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      const data = await api.get(`/banking/transactions?${params.toString()}`);
      setTransactions(data.transactions || []);
      setTransactionsTotal(data.total || 0);
    } catch {
      setError('Failed to load transactions');
    } finally {
      setTransactionsLoading(false);
    }
  }

  async function loadImports() {
    setImportsLoading(true);
    try {
      const data = await api.get('/banking/imports?limit=20');
      const nextImports = data.imports || [];
      setImports(nextImports);
      setSelectedImportId((current) => {
        if (current && nextImports.some((r) => r.id === current)) return current;
        return nextImports[0]?.id || '';
      });
    } catch {
      setError('Failed to load statement imports');
    } finally {
      setImportsLoading(false);
    }
  }

  async function loadImportDetail(importId) {
    setSelectedImportLoading(true);
    try {
      const [detail, lines] = await Promise.all([
        api.get(`/banking/imports/${importId}`),
        api.get(`/banking/imports/${importId}/lines`),
      ]);
      setSelectedImport(detail.import);
      setSelectedImportLines(lines.lines || []);
    } catch {
      setError('Failed to load import details');
    } finally {
      setSelectedImportLoading(false);
    }
  }

  async function loadReconciliations() {
    setReconciliationsLoading(true);
    try {
      const data = await api.get('/banking/reconciliations');
      setReconciliations(data.reconciliations || []);
    } catch {
      setError('Failed to load reconciliations');
    } finally {
      setReconciliationsLoading(false);
    }
  }

  async function loadCustomerBookings() {
    setCustomerBookingLoading(true);
    try {
      const data = await api.get('/banking/customer-bookings');
      setCustomerBookingQueue(data.queue || []);
      setCustomerBookingBatches(data.openBatches || []);
      setBankingPolicy((prev) => ({ ...prev, ...(data.policy || {}) }));
    } catch {
      setError('Failed to load customer booking links');
    } finally {
      setCustomerBookingLoading(false);
    }
  }

  async function loadPortalTransferQueue() {
    setPortalTransferLoading(true);
    try {
      const data = await api.get('/portal/admin/transfer-checkouts');
      setPortalTransferQueue(data.queue || []);
    } catch {
      setError('Failed to load portal transfer approvals');
    } finally {
      setPortalTransferLoading(false);
    }
  }

  /* ── Mutation helpers ────────────────────────────────── */

  async function handleImportPosted() {
    if (!selectedImportId) return;
    setPostingImport(true);
    setError('');
    try {
      await api.post(`/banking/imports/${selectedImportId}/post`, {});
      await Promise.all([loadAccounts(), loadImports(), loadImportDetail(selectedImportId), loadTransactions()]);
      if (canViewReports) await loadReconciliations();
    } catch (err) {
      setError(err.error || 'Failed to post import');
    } finally {
      setPostingImport(false);
    }
  }

  function refreshAfterMutation() {
    loadWorkspace();
  }

  /* ── Render ──────────────────────────────────────────── */

  return (
    <div className="flex min-h-[calc(100vh-8rem)] gap-0 lg:gap-6">
      {/* ── Sidebar navigation ─────────────────────────── */}
      <aside className="hidden w-56 shrink-0 lg:block">
        <div className="sticky top-24 space-y-5">
          {NAV_SECTIONS.map((section) => {
            if (section.adminOnly && !canViewReports) return null;
            return (
              <div key={section.label}>
                <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  {section.label}
                </p>
                <nav className="space-y-0.5">
                  {section.items.map((item) => {
                    const isActive = activeView === item.key;
                    const badgeCount = item.badge ? customerBookingQueue.length : 0;
                    return (
                      <button
                        key={item.key}
                        onClick={() => setActiveView(item.key)}
                        className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-brand-50 text-brand-700'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        }`}
                      >
                        <NavIcon name={item.icon} className={`h-[18px] w-[18px] ${isActive ? 'text-brand-600' : 'text-gray-400'}`} />
                        <span className="flex-1 text-left">{item.label}</span>
                        {item.badge && badgeCount > 0 && (
                          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">
                            {badgeCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ── Main content area ──────────────────────────── */}
      <div className="min-w-0 flex-1 space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Banking</h1>
            <p className="mt-1 max-w-xl text-sm text-gray-500">
              Record transactions, import bank statements, process customer bookings, and check balances.
            </p>
          </div>
          {canRecord && (
            <div className="flex flex-wrap gap-2">
              <ActionButton label="Record one" variant="primary" onClick={() => setShowRecordModal(true)} />
              <ActionButton label="Enter many" variant="primary" onClick={() => setShowBulkModal(true)} />
              <ActionButton label="Move money" onClick={() => setShowTransferModal(true)} />
              <ActionButton label="Import statement" onClick={() => setShowImportModal(true)} />
              {canViewReports && <ActionButton label="Reconcile" onClick={() => setShowReconcileModal(true)} />}
            </div>
          )}
        </div>

        {/* Mobile view switcher (replaces sidebar on small screens) */}
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1 lg:hidden">
          {NAV_SECTIONS.flatMap((s) => (s.adminOnly && !canViewReports ? [] : s.items)).map((item) => {
            const badgeCount = item.badge ? customerBookingQueue.length : 0;
            return (
              <button
                key={item.key}
                onClick={() => setActiveView(item.key)}
                className={`relative whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  activeView === item.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {item.label}
                {item.badge && badgeCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Error banner */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            <button onClick={() => setError('')} className="ml-2 font-medium underline">Dismiss</button>
          </div>
        )}

        {/* ── Active view ────────────────────────────────── */}

        {activeView === 'today' && (
          <TodayView
            loading={loading}
            accounts={accounts}
            imports={imports}
            reconciliations={reconciliations}
            transactions={transactions.slice(0, 8)}
            categoryMap={categoryMap}
            canViewReports={canViewReports}
            bookingQueueCount={customerBookingQueue.length}
            onOpenImport={(importId) => {
              setSelectedImportId(importId);
              setActiveView('imports');
            }}
            onNavigate={setActiveView}
          />
        )}

        {activeView === 'transactions' && (
          <TransactionsView
            accounts={accounts}
            transactions={transactions}
            total={transactionsTotal}
            loading={transactionsLoading}
            filters={filters}
            categoryMap={categoryMap}
            onFilterChange={(next) => setFilters((prev) => ({ ...prev, ...next }))}
          />
        )}

        {activeView === 'imports' && (
          <ImportsView
            accounts={accounts}
            categoryMap={categoryMap}
            imports={imports}
            importsLoading={importsLoading}
            selectedImportId={selectedImportId}
            onSelectImport={setSelectedImportId}
            selectedImport={selectedImport}
            selectedImportLines={selectedImportLines}
            selectedImportLoading={selectedImportLoading}
            postingImport={postingImport}
            onPostImport={handleImportPosted}
            onLineUpdated={() => {
              if (selectedImportId) loadImportDetail(selectedImportId);
              loadImports();
            }}
            onImportQueueUpdated={() => loadImports()}
          />
        )}

        {activeView === 'customer-bookings' && (
          <QueueList
            loading={customerBookingLoading}
            queue={customerBookingQueue}
            openBatches={customerBookingBatches}
            policy={bankingPolicy}
            onRefresh={() => {
              loadCustomerBookings();
              loadTransactions();
            }}
          />
        )}

        {activeView === 'portal-transfers' && (
          <PortalTransferQueue
            loading={portalTransferLoading}
            queue={portalTransferQueue}
            onRefresh={() => {
              loadPortalTransferQueue();
              loadAccounts();
              loadTransactions();
              loadCustomerBookings();
            }}
          />
        )}

        {activeView === 'balances' && (
          <AccountBalances
            accounts={accounts}
            reconciliations={reconciliations}
            loading={reconciliationsLoading}
          />
        )}

        {activeView === 'unbooked' && <UnbookedDeposits />}
        {activeView === 'liability' && <CustomerLiability />}
        {activeView === 'expenses' && <Expenses categoryMap={categoryMap} />}
      </div>

      {/* ── Modals ─────────────────────────────────────── */}

      {showRecordModal && (
        <RecordTransactionModal
          accounts={accounts}
          transactionCategories={transactionCategories}
          categoryMap={categoryMap}
          onCategoriesChanged={loadMeta}
          onClose={() => setShowRecordModal(false)}
          onRecorded={(shouldClose) => {
            if (shouldClose) {
              setShowRecordModal(false);
              refreshAfterMutation();
            } else {
              // Stay open — just reload accounts for updated balances
              loadAccounts();
              loadTransactions(true);
            }
          }}
        />
      )}

      {showBulkModal && (
        <BulkTransactionModal
          accounts={accounts}
          transactionCategories={transactionCategories}
          categoryMap={categoryMap}
          onCategoriesChanged={loadMeta}
          onClose={() => setShowBulkModal(false)}
          onRecorded={() => {
            setShowBulkModal(false);
            refreshAfterMutation();
          }}
        />
      )}

      {showTransferModal && (
        <InternalTransferModal
          accounts={accounts}
          onClose={() => setShowTransferModal(false)}
          onRecorded={() => {
            setShowTransferModal(false);
            refreshAfterMutation();
          }}
        />
      )}

      {showImportModal && (
        <StatementImportModal
          accounts={accounts.filter((a) => a.supportsStatementImport)}
          onClose={() => setShowImportModal(false)}
          onImported={(importId) => {
            setShowImportModal(false);
            loadImports();
            setSelectedImportId(importId);
            setActiveView('imports');
            loadAccounts();
          }}
        />
      )}

      {showReconcileModal && (
        <ReconciliationModal
          accounts={accounts}
          imports={imports}
          onClose={() => setShowReconcileModal(false)}
          onSaved={() => {
            setShowReconcileModal(false);
            refreshAfterMutation();
          }}
        />
      )}
    </div>
  );
}
