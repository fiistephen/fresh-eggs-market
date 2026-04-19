import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../lib/api';
import { buildCategoryMap } from './shared/constants';
import { useToast } from '../../components/ui';

// Views
import TodayView from './TodayView';
import TransactionsView from './TransactionsView';
import ImportsView from './StatementImport/ImportQueue';
import CashDepositsView from './CashDepositsView';
import ApprovalRequestsView from './ApprovalRequestsView';
import AccountBalances from './Reports/AccountBalances';
import UnbookedDeposits from './Reports/UnbookedDeposits';
import CustomerLiability from './Reports/CustomerLiability';
import Expenses from './Reports/Expenses';
import MonthEndReview from './Reports/MonthEndReview';

// Modals
import EntryModal from './EntryModal';
// InternalTransferModal removed — inter-account transfers are recorded as
// individual transactions on each account (one outflow, one inflow).
import MatchCashDepositModal from './MatchCashDepositModal';
import StatementImportModal from './StatementImportModal';
// ReconciliationModal removed — balance entry is inline on the Reconciliation page.
import RequestDeleteApprovalModal from './RequestDeleteApprovalModal';
import RequestEditApprovalModal from './RequestEditApprovalModal';

/* ── Tab config ────────────────────────────────────────── */

// V3: Simplified 4-tab layout (Meeting 3 decisions).
// - "Statements" workspace kept in code but hidden from the Banking UI for now, per Meeting 3.
//   No visible entry point is shown to staff at the moment. Code preserved for future use.
// - "Approvals" tab hidden. The activeView='approvals' view still works and is reached via the
//   pending-approvals alert in Overview. Admin can still manage approvals.
// - "Cash deposits" renamed to "Cash Sales" per Meeting 3.
// - "Reports" renamed to "Reconciliations" per Meeting 3.
const TABS = [
  { key: 'today', label: 'Overview' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'cash-deposits', label: 'Cash Sales', badge: true },
  { key: 'reports', label: 'Reconciliations' },
];

// Sub-reports accessible via links on the Reconciliation page.
// No sub-tab bar — the main reconciliation view handles navigation.
const REPORT_KEYS = ['month-end', 'balances', 'unbooked', 'liability', 'expenses'];

/* ── Pagination config ─────────────────────────────────── */
const DEFAULT_TRANSACTIONS_PAGE_SIZE = 25;
const TRANSACTIONS_PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 250];
const IMPORTS_PAGE_SIZE = 12;

/* ── Main Banking page ─────────────────────────────────── */

export default function Banking() {
  const navigate = useNavigate();
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
    deposited: { count: 0, total: 0, batches: [] },
  });
  const [approvalRequests, setApprovalRequests] = useState([]);
  const [unallocatedCount, setUnallocatedCount] = useState(0);
  const [bankingPolicy, setBankingPolicy] = useState({ bookingMinimumPaymentPercent: 80 });
  const [activeReport, setActiveReport] = useState('month-end');

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
    category: '',
    sourceType: '',
    dateFrom: '',
    dateTo: '',
  });

  /* ── Modal visibility ────────────────────────────────── */
  const [showEntryModal, setShowEntryModal] = useState(false);
  // showTransferModal removed — "Move money" feature retired.
  // V3 Phase 2: toggles the "Match a bank deposit" modal on the Cash Sales tab.
  const [showMatchDepositModal, setShowMatchDepositModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  // showReconcileModal removed — balance entry is inline on the Reconciliation page.
  const [postingImport, setPostingImport] = useState(false);
  const [requestEditTransaction, setRequestEditTransaction] = useState(null);
  const [requestDeleteTransaction, setRequestDeleteTransaction] = useState(null);
  const [workingApprovalId, setWorkingApprovalId] = useState('');

  /* ── (More menu removed — only "Record entry" button remains) ── */

  /* ── Derived ─────────────────────────────────────────── */
  const canRecord = ['ADMIN', 'MANAGER', 'RECORD_KEEPER'].includes(user?.role);
  const canViewReports = ['ADMIN', 'MANAGER'].includes(user?.role);
  // V3 Meeting 3 three-tier edit/delete access:
  //   ADMIN  → direct edit/delete (no approval needed)
  //   MANAGER → request edit/delete (ADMIN approves)
  //   RECORD_KEEPER / SHOP_FLOOR → no edit/delete at all (escalate verbally)
  const isAdmin = user?.role === 'ADMIN';
  const canEditDelete = ['ADMIN', 'MANAGER'].includes(user?.role);
  const categoryMap = buildCategoryMap(transactionCategories);

  /* ── (Outside-click handler for "More" menu removed) ── */

  /* ── Effects ─────────────────────────────────────────── */

  useEffect(() => { loadWorkspace(); }, []);

  useEffect(() => {
    if (activeView === 'transactions') loadTransactions();
  }, [activeView, transactionsPage, transactionsPageSize, filters.query, filters.bankAccountId, filters.direction, filters.category, filters.sourceType, filters.dateFrom, filters.dateTo]);

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
  }, [filters.query, filters.bankAccountId, filters.direction, filters.category, filters.sourceType, filters.dateFrom, filters.dateTo]);

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
    if (data.unallocatedCount != null) setUnallocatedCount(data.unallocatedCount);
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
      if (filters.category) params.set('category', filters.category);
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
        deposited: data.deposited || { count: 0, total: 0, batches: [] },
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
  const cashDepositBadgeCount = Number(cashDeposits.undepositedCash?.count || 0);
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

      {/* Sub-report navigation removed — reconciliation page handles this via report links */}

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
          unallocatedCount={unallocatedCount}
          canViewReports={canViewReports}
          onNavigate={(view, options = {}) => {
            if (view === 'portal-transfers') { navigate('/bookings'); return; }
            if (options.filterCategory) {
              setFilters((prev) => ({ ...prev, category: options.filterCategory }));
            }
            setActiveView(view);
          }}
          onOpenBookings={() => navigate('/bookings')}
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
          canRequestEdit={canEditDelete}
          onRequestEdit={setRequestEditTransaction}
          canRequestDelete={canEditDelete}
          onRequestDelete={setRequestDeleteTransaction}
          isAdmin={isAdmin}
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

      {activeView === 'cash-deposits' && (
        <CashDepositsView
          onMatchFromBank={() => setShowMatchDepositModal(true)}
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
            if (view === 'customer-bookings' || view === 'portal-transfers') {
              navigate('/bookings');
              return;
            }
            if (options.reportKey) setActiveReport(options.reportKey);
            if (options.filterCategory) {
              setFilters((prev) => ({ ...prev, category: options.filterCategory }));
            }
            setActiveView(view);
          }}
        />
      )}

      {activeView === 'reports' && activeReport !== 'month-end' && (
        <div className="mb-3">
          <button type="button" onClick={() => setActiveReport('month-end')} className="text-body font-medium text-brand-700 hover:text-brand-900 transition-colors">
            ← Back to reconciliation
          </button>
        </div>
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

      {showMatchDepositModal && (
        <MatchCashDepositModal
          onClose={() => setShowMatchDepositModal(false)}
          onMatched={() => {
            setShowMatchDepositModal(false);
            // Refresh the cash sales workspace + transactions list so the
            // matched cash sales disappear from "Undeposited" and the new
            // outflow + inflow pair shows up in the transaction list.
            loadCashDeposits();
            loadTransactions();
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

      {requestDeleteTransaction && (
        <RequestDeleteApprovalModal
          transaction={requestDeleteTransaction}
          categoryMap={categoryMap}
          directMode={isAdmin}
          onClose={() => setRequestDeleteTransaction(null)}
          onRequested={() => {
            setRequestDeleteTransaction(null);
            // Admin direct delete removes the row; reload the list + any pending approvals it resolved.
            loadTransactions();
            loadApprovalRequests();
          }}
        />
      )}

      {requestEditTransaction && (
        <RequestEditApprovalModal
          transaction={requestEditTransaction}
          accounts={accounts}
          categoryMap={categoryMap}
          directMode={isAdmin}
          onClose={() => setRequestEditTransaction(null)}
          onRequested={() => {
            setRequestEditTransaction(null);
            // Admin direct edit mutates the transaction; reload the list + any pending approvals.
            loadTransactions();
            loadApprovalRequests();
          }}
        />
      )}
    </div>
  );
}
