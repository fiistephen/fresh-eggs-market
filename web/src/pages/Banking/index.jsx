import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../lib/api';
import { buildCategoryMap } from './shared/constants';
import { useToast } from '../../components/ui';

// Views
import TodayView from './TodayView';
import TransactionsView from './TransactionsView';
import ImportsView from './StatementImport/ImportQueue';
import QueueList from './BookingQueue/QueueList';
import PortalTransferQueue from './PortalTransferQueue';
import CashDepositsView from './CashDepositsView';
import ApprovalRequestsView from './ApprovalRequestsView';
import AccountBalances from './Reports/AccountBalances';
import UnbookedDeposits from './Reports/UnbookedDeposits';
import CustomerLiability from './Reports/CustomerLiability';
import Expenses from './Reports/Expenses';
import MonthEndReview from './Reports/MonthEndReview';

// Modals
import EntryModal from './EntryModal';
import InternalTransferModal from './InternalTransferModal';
import StatementImportModal from './StatementImportModal';
import ReconciliationModal from './ReconciliationModal';
import RequestDeleteApprovalModal from './RequestDeleteApprovalModal';
import RequestEditApprovalModal from './RequestEditApprovalModal';

/* ── Tab config ────────────────────────────────────────── */

const TABS = [
  { key: 'today', label: 'Overview' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'imports', label: 'Statements' },
  { key: 'customer-bookings', label: 'Bookings', badge: true },
  { key: 'portal-transfers', label: 'Transfers' },
  { key: 'cash-deposits', label: 'Cash deposits', badge: true },
  { key: 'approvals', label: 'Approvals', badge: true },
  { key: 'reports', label: 'Reports' },
];

const REPORT_TABS = [
  { key: 'month-end', label: 'Month-end review' },
  { key: 'balances', label: 'Account Balances' },
  { key: 'unbooked', label: 'Unbooked Deposits' },
  { key: 'liability', label: 'Customer Liability' },
  { key: 'expenses', label: 'Expenses' },
];

/* ── Pagination config ─────────────────────────────────── */
const DEFAULT_TRANSACTIONS_PAGE_SIZE = 25;
const TRANSACTIONS_PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 250];
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
  const [transactionsPageSize, setTransactionsPageSize] = useState(DEFAULT_TRANSACTIONS_PAGE_SIZE);
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
  const [portalTransferHistory, setPortalTransferHistory] = useState([]);
  const [cashDeposits, setCashDeposits] = useState({
    undepositedCash: { count: 0, total: 0, thresholdHours: 24, transactions: [] },
    pendingDeposits: { count: 0, total: 0, thresholdHours: 24, batches: [] },
    confirmedRecently: [],
  });
  const [approvalRequests, setApprovalRequests] = useState([]);
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
  const [cashDepositsLoading, setCashDepositsLoading] = useState(false);
  const [approvalRequestsLoading, setApprovalRequestsLoading] = useState(false);
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
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [postingImport, setPostingImport] = useState(false);
  const [requestEditTransaction, setRequestEditTransaction] = useState(null);
  const [requestDeleteTransaction, setRequestDeleteTransaction] = useState(null);
  const [workingApprovalId, setWorkingApprovalId] = useState('');

  /* ── Action menu state ───────────────────────────────── */
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreRef = useRef(null);

  /* ── Derived ─────────────────────────────────────────── */
  const canRecord = ['ADMIN', 'MANAGER', 'RECORD_KEEPER'].includes(user?.role);
  const canViewReports = ['ADMIN', 'MANAGER'].includes(user?.role);
  const categoryMap = buildCategoryMap(transactionCategories);

  /* ── Close menus on outside click ────────────────────── */
  useEffect(() => {
    function handleClick(e) {
      if (moreRef.current && !moreRef.current.contains(e.target)) setShowMoreMenu(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  /* ── Effects ─────────────────────────────────────────── */

  useEffect(() => { loadWorkspace(); }, []);

  useEffect(() => {
    if (activeView === 'transactions') loadTransactions();
  }, [activeView, transactionsPage, transactionsPageSize, filters.query, filters.bankAccountId, filters.direction, filters.sourceType, filters.dateFrom, filters.dateTo]);

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
        loadCashDeposits(),
        loadApprovalRequests(),
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
      const offset = (transactionsPage - 1) * transactionsPageSize;
      const params = new URLSearchParams({ limit: String(transactionsPageSize), offset: String(offset) });
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
      setPortalTransferHistory(data.recentDecisions || []);
    } catch {
      setError('Failed to load portal transfer approvals');
    } finally {
      setPortalTransferLoading(false);
    }
  }

  async function loadCashDeposits() {
    setCashDepositsLoading(true);
    try {
      const data = await api.get('/banking/cash-deposits');
      setCashDeposits({
        undepositedCash: data.undepositedCash || { count: 0, total: 0, thresholdHours: 24, transactions: [] },
        pendingDeposits: data.pendingDeposits || { count: 0, total: 0, thresholdHours: 24, batches: [] },
        confirmedRecently: data.confirmedRecently || [],
      });
      setBankingPolicy((prev) => ({ ...prev, ...(data.policy || {}) }));
    } catch {
      setError('Failed to load cash deposits');
    } finally {
      setCashDepositsLoading(false);
    }
  }

  async function loadApprovalRequests() {
    setApprovalRequestsLoading(true);
    try {
      const data = await api.get('/banking/approval-requests');
      setApprovalRequests(data.approvalRequests || []);
    } catch {
      setError('Failed to load approval requests');
    } finally {
      setApprovalRequestsLoading(false);
    }
  }

  async function approveApprovalRequest(request) {
    const confirmed = window.confirm('Approve this delete request? The transaction will be removed from Banking.');
    if (!confirmed) return;
    setWorkingApprovalId(request.id);
    try {
      await api.post(`/banking/approval-requests/${request.id}/approve`, {});
      await Promise.all([loadApprovalRequests(), loadTransactions(), loadAccounts(), loadCustomerBookings(), loadCashDeposits()]);
    } catch (err) {
      setError(err.error || 'Failed to approve this request');
    } finally {
      setWorkingApprovalId('');
    }
  }

  async function rejectApprovalRequest(request) {
    const reason = window.prompt('Why are you rejecting this delete request?') || '';
    setWorkingApprovalId(request.id);
    try {
      await api.post(`/banking/approval-requests/${request.id}/reject`, {
        reason: reason.trim() || undefined,
      });
      await loadApprovalRequests();
    } catch (err) {
      setError(err.error || 'Failed to reject this request');
    } finally {
      setWorkingApprovalId('');
    }
  }

  /* ── Mutation helpers ────────────────────────────────── */

  async function handleImportPosted() {
    if (!selectedImportId) return;
    setPostingImport(true);
    setError('');
    try {
      await api.post(`/banking/imports/${selectedImportId}/post`, {});
      await Promise.all([loadAccounts(), loadImports(), loadImportDetail(selectedImportId), loadTransactions(), loadCashDeposits()]);
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
  const totalPages = Math.max(1, Math.ceil(transactionsTotal / transactionsPageSize));
  const importTotalPages = Math.max(1, Math.ceil(importsTotal / IMPORTS_PAGE_SIZE));
  const isReportView = activeView === 'reports';
  const cashDepositBadgeCount = Number(cashDeposits.undepositedCash?.count || 0) + Number(cashDeposits.pendingDeposits?.count || 0);
  const approvalBadgeCount = approvalRequests.filter((request) => request.status === 'PENDING').length;

  /* ── Render ──────────────────────────────────────────── */

  return (
    <div className="space-y-4">
      {/* ── Header row ────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-display text-surface-900">Banking</h1>

        {canRecord && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEntryModal(true)}
              className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-medium text-surface-900 hover:bg-brand-400 transition-colors duration-fast shadow-xs"
            >
              Record entry
            </button>

            {/* More actions */}
            <div className="relative" ref={moreRef}>
              <button
                onClick={() => setShowMoreMenu((v) => !v)}
                className="rounded-lg border border-surface-300 bg-surface-0 px-3 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors duration-fast"
              >
                More <span className="text-surface-400">▼</span>
              </button>
              {showMoreMenu && (
                <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-surface-200 bg-surface-0 py-1 shadow-md">
                  <button onClick={() => { setShowTransferModal(true); setShowMoreMenu(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 duration-fast">Move money</button>
                  <button onClick={() => { setShowImportModal(true); setShowMoreMenu(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 duration-fast">Import statement</button>
                  {canViewReports && <button onClick={() => { setShowReconcileModal(true); setShowMoreMenu(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 duration-fast">Reconcile balance</button>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Horizontal tab strip ──────────────────────────── */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-surface-200">
        {TABS.filter((tab) => canViewReports || tab.key !== 'reports').map((tab) => {
          const isActive = activeView === tab.key;
          const badgeCount = tab.key === 'customer-bookings'
            ? customerBookingQueue.length
            : tab.key === 'cash-deposits'
              ? cashDepositBadgeCount
              : tab.key === 'approvals'
                ? approvalBadgeCount
              : 0;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveView(tab.key)}
              className={`relative whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors duration-fast ${
                isActive
                  ? 'border-b-2 border-brand-600 text-brand-700'
                  : 'text-surface-500 hover:text-surface-700'
              }`}
            >
              {tab.label}
              {tab.badge && badgeCount > 0 && (
                <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-warning-500 px-1.5 text-[11px] font-bold text-white">
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
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-fast ${
                  isActive
                    ? 'bg-brand-100 text-brand-700'
                    : 'bg-surface-0 text-surface-600 hover:bg-surface-100'
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
        <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">
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
          cashDeposits={cashDeposits}
          approvalRequests={approvalRequests}
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
          pageSize={transactionsPageSize}
          pageSizeOptions={TRANSACTIONS_PAGE_SIZE_OPTIONS}
          totalPages={totalPages}
          onPageChange={setTransactionsPage}
          onPageSizeChange={(nextSize) => {
            setTransactionsPageSize(nextSize);
            setTransactionsPage(1);
          }}
          onFilterChange={handleFilterChange}
          canRequestEdit={canRecord}
          onRequestEdit={setRequestEditTransaction}
          canRequestDelete={canRecord}
          onRequestDelete={setRequestDeleteTransaction}
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
            loadCashDeposits();
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
          history={portalTransferHistory}
          onRefresh={() => {
            loadPortalTransferQueue();
            loadAccounts();
            loadTransactions();
            loadCustomerBookings();
            loadCashDeposits();
          }}
        />
      )}

      {activeView === 'cash-deposits' && (
        <CashDepositsView
          loading={cashDepositsLoading}
          data={cashDeposits}
          onMoveMoney={() => setShowTransferModal(true)}
          onOpenStatements={() => setActiveView('imports')}
          onRefresh={loadCashDeposits}
        />
      )}

      {activeView === 'approvals' && (
        <ApprovalRequestsView
          requests={approvalRequests}
          loading={approvalRequestsLoading}
          categoryMap={categoryMap}
          currentUserRole={user?.role}
          workingId={workingApprovalId}
          onApprove={approveApprovalRequest}
          onReject={rejectApprovalRequest}
          onRefresh={loadApprovalRequests}
        />
      )}

      {activeView === 'reports' && activeReport === 'month-end' && (
        <MonthEndReview
          onNavigate={(view, options = {}) => {
            if (options.reportKey) setActiveReport(options.reportKey);
            setActiveView(view);
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

      {showEntryModal && (
        <EntryModal
          accounts={accounts}
          transactionCategories={transactionCategories}
          categoryMap={categoryMap}
          onCategoriesChanged={loadMeta}
          onClose={() => setShowEntryModal(false)}
          onRecorded={(shouldClose) => {
            if (shouldClose) {
              setShowEntryModal(false);
              refreshAfterMutation();
            } else {
              loadAccounts();
              loadTransactions(true);
            }
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

      {requestDeleteTransaction && (
        <RequestDeleteApprovalModal
          transaction={requestDeleteTransaction}
          categoryMap={categoryMap}
          onClose={() => setRequestDeleteTransaction(null)}
          onRequested={() => {
            setRequestDeleteTransaction(null);
            loadApprovalRequests();
          }}
        />
      )}

      {requestEditTransaction && (
        <RequestEditApprovalModal
          transaction={requestEditTransaction}
          accounts={accounts}
          categoryMap={categoryMap}
          onClose={() => setRequestEditTransaction(null)}
          onRequested={() => {
            setRequestEditTransaction(null);
            loadApprovalRequests();
          }}
        />
      )}
    </div>
  );
}
