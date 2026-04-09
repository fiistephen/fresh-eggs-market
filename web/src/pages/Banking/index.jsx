import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../lib/api';
import { buildCategoryMap } from './shared/constants';

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

/* ── Tab config ────────────────────────────────────────── */

const TABS = [
  { key: 'today', label: 'Overview' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'imports', label: 'Statements' },
  { key: 'customer-bookings', label: 'Bookings', badge: true },
  { key: 'portal-transfers', label: 'Transfers' },
  { key: 'reports', label: 'Reports' },
];

const REPORT_TABS = [
  { key: 'balances', label: 'Account Balances' },
  { key: 'unbooked', label: 'Unbooked Deposits' },
  { key: 'liability', label: 'Customer Liability' },
  { key: 'expenses', label: 'Expenses' },
];

/* ── Pagination config ─────────────────────────────────── */
const PAGE_SIZE = 25;
const IMPORTS_PAGE_SIZE = 12;

/* ── Main Banking page ─────────────────────────────────── */

export default function Banking() {
  const { user } = useAuth();

  /* ── View state ──────────────────────────────────────── */
  const [activeView, setActiveView] = useState('today');

  /* ── Data state ──────────────────────────────────────── */
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [transactionsTotal, setTransactionsTotal] = useState(0);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [imports, setImports] = useState([]);
  const [importsTotal, setImportsTotal] = useState(0);
  const [importsPage, setImportsPage] = useState(1);
  const [importsSearch, setImportsSearch] = useState('');
  const [importsSearchInput, setImportsSearchInput] = useState('');
  const [reconciliations, setReconciliations] = useState([]);
  const [transactionCategories, setTransactionCategories] = useState([]);
  const [selectedImportId, setSelectedImportId] = useState('');
  const [selectedImport, setSelectedImport] = useState(null);
  const [selectedImportLines, setSelectedImportLines] = useState([]);
  const [customerBookingQueue, setCustomerBookingQueue] = useState([]);
  const [customerBookingBatches, setCustomerBookingBatches] = useState([]);
  const [portalTransferQueue, setPortalTransferQueue] = useState([]);
  const [bankingPolicy, setBankingPolicy] = useState({ bookingMinimumPaymentPercent: 80 });
  const [activeReport, setActiveReport] = useState('balances');

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
    query: '',
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

  /* ── Action menu state ───────────────────────────────── */
  const [showEntryMenu, setShowEntryMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const entryRef = useRef(null);
  const moreRef = useRef(null);

  /* ── Derived ─────────────────────────────────────────── */
  const canRecord = ['ADMIN', 'MANAGER', 'RECORD_KEEPER'].includes(user?.role);
  const canViewReports = ['ADMIN', 'MANAGER'].includes(user?.role);
  const categoryMap = buildCategoryMap(transactionCategories);

  /* ── Close menus on outside click ────────────────────── */
  useEffect(() => {
    function handleClick(e) {
      if (entryRef.current && !entryRef.current.contains(e.target)) setShowEntryMenu(false);
      if (moreRef.current && !moreRef.current.contains(e.target)) setShowMoreMenu(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  /* ── Effects ─────────────────────────────────────────── */

  useEffect(() => { loadWorkspace(); }, []);

  useEffect(() => {
    if (activeView === 'transactions') loadTransactions();
  }, [activeView, transactionsPage, filters.query, filters.bankAccountId, filters.direction, filters.sourceType, filters.dateFrom, filters.dateTo]);

  useEffect(() => {
    if (activeView === 'imports') loadImports();
  }, [activeView, importsPage, importsSearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setImportsSearch(importsSearchInput);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [importsSearchInput]);

  useEffect(() => {
    if (activeView === 'reports' && activeReport === 'balances') loadReconciliations();
  }, [activeView, activeReport]);

  useEffect(() => {
    if (selectedImportId) {
      loadImportDetail(selectedImportId);
    } else {
      setSelectedImport(null);
      setSelectedImportLines([]);
    }
  }, [selectedImportId]);

  // Reset page when filters change
  useEffect(() => {
    setTransactionsPage(1);
  }, [filters.query, filters.bankAccountId, filters.direction, filters.sourceType, filters.dateFrom, filters.dateTo]);

  useEffect(() => {
    setImportsPage(1);
  }, [importsSearch]);

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
      const offset = (transactionsPage - 1) * PAGE_SIZE;
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (filters.query) params.set('q', filters.query);
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
      const offset = (importsPage - 1) * IMPORTS_PAGE_SIZE;
      const params = new URLSearchParams({ limit: String(IMPORTS_PAGE_SIZE), offset: String(offset) });
      if (importsSearch.trim()) params.set('search', importsSearch.trim());
      const data = await api.get(`/banking/imports?${params.toString()}`);
      const nextImports = data.imports || [];
      setImports(nextImports);
      setImportsTotal(data.total || nextImports.length);
      setSelectedImportId((current) => current || nextImports[0]?.id || '');
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

  function handleFilterChange(next) {
    setFilters((prev) => ({ ...prev, ...next }));
  }

  function openReport(reportKey = 'balances') {
    setActiveReport(reportKey);
    setActiveView('reports');
  }

  /* ── Pagination helpers ──────────────────────────────── */
  const totalPages = Math.max(1, Math.ceil(transactionsTotal / PAGE_SIZE));
  const importTotalPages = Math.max(1, Math.ceil(importsTotal / IMPORTS_PAGE_SIZE));
  const isReportView = activeView === 'reports';

  /* ── Render ──────────────────────────────────────────── */

  return (
    <div className="space-y-4">
      {/* ── Header row ────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Banking</h1>

        {canRecord && (
          <div className="flex items-center gap-2">
            {/* Primary: Record entry + dropdown */}
            <div className="relative" ref={entryRef}>
              <div className="flex">
                <button
                  onClick={() => setShowRecordModal(true)}
                  className="rounded-l-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
                >
                  + Record entry
                </button>
                <button
                  onClick={() => setShowEntryMenu((v) => !v)}
                  className="rounded-r-lg border-l border-brand-500 bg-brand-600 px-2 py-2 text-white hover:bg-brand-700 transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </button>
              </div>
              {showEntryMenu && (
                <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  <button onClick={() => { setShowBulkModal(true); setShowEntryMenu(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" /></svg>
                    Enter many at once
                  </button>
                </div>
              )}
            </div>

            {/* More actions */}
            <div className="relative" ref={moreRef}>
              <button
                onClick={() => setShowMoreMenu((v) => !v)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                More <span className="text-gray-400">&#9662;</span>
              </button>
              {showMoreMenu && (
                <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  <button onClick={() => { setShowTransferModal(true); setShowMoreMenu(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">Move money</button>
                  <button onClick={() => { setShowImportModal(true); setShowMoreMenu(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">Import statement</button>
                  {canViewReports && <button onClick={() => { setShowReconcileModal(true); setShowMoreMenu(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">Reconcile balance</button>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Horizontal tab strip ──────────────────────────── */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.filter((tab) => canViewReports || tab.key !== 'reports').map((tab) => {
          const isActive = activeView === tab.key;
          const badgeCount = tab.badge ? customerBookingQueue.length : 0;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveView(tab.key)}
              className={`relative whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-b-2 border-brand-600 text-brand-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.badge && badgeCount > 0 && (
                <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">
                  {badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {canViewReports && isReportView && (
        <div className="flex flex-wrap items-center gap-2">
          {REPORT_TABS.map((reportTab) => {
            const isActive = activeReport === reportTab.key;
            return (
              <button
                key={reportTab.key}
                type="button"
                onClick={() => setActiveReport(reportTab.key)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-100 text-brand-700'
                    : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                {reportTab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError('')} className="ml-2 font-medium underline">Dismiss</button>
        </div>
      )}

      {/* ── Active view ────────────────────────────────────── */}

      {activeView === 'today' && (
        <TodayView
          loading={loading}
          accounts={accounts}
          imports={imports}
          transactions={transactions}
          categoryMap={categoryMap}
          customerBookingQueue={customerBookingQueue}
          portalTransferQueue={portalTransferQueue}
          canViewReports={canViewReports}
          onNavigate={setActiveView}
          onOpenReport={openReport}
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
          page={transactionsPage}
          pageSize={PAGE_SIZE}
          totalPages={totalPages}
          onPageChange={setTransactionsPage}
          onFilterChange={handleFilterChange}
        />
      )}

      {activeView === 'imports' && (
        <ImportsView
          accounts={accounts}
          categoryMap={categoryMap}
          imports={imports}
          importsTotal={importsTotal}
          importsPage={importsPage}
          importsPageSize={IMPORTS_PAGE_SIZE}
          importsSearch={importsSearch}
          importsSearchInput={importsSearchInput}
          importsLoading={importsLoading}
          selectedImportId={selectedImportId}
          onSelectImport={setSelectedImportId}
          onSearchChange={setImportsSearchInput}
          onPageChange={setImportsPage}
          importTotalPages={importTotalPages}
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

      {activeView === 'reports' && activeReport === 'balances' && (
        <AccountBalances
          accounts={accounts}
          reconciliations={reconciliations}
          loading={reconciliationsLoading}
        />
      )}

      {activeView === 'reports' && activeReport === 'unbooked' && <UnbookedDeposits />}
      {activeView === 'reports' && activeReport === 'liability' && <CustomerLiability />}
      {activeView === 'reports' && activeReport === 'expenses' && <Expenses categoryMap={categoryMap} />}

      {/* ── Modals ─────────────────────────────────────────── */}

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
