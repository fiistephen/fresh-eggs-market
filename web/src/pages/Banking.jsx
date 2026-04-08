import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

const ACCOUNT_STYLES = {
  CUSTOMER_DEPOSIT: 'from-blue-50 to-white border-blue-200',
  SALES: 'from-green-50 to-white border-green-200',
  PROFIT: 'from-purple-50 to-white border-purple-200',
  CASH_ON_HAND: 'from-amber-50 to-white border-amber-200',
};

const DIRECTION_COLORS = {
  INFLOW: 'text-green-600',
  OUTFLOW: 'text-red-600',
};

const SOURCE_LABELS = {
  MANUAL: 'Manual',
  STATEMENT_IMPORT: 'Statement import',
  INTERNAL_TRANSFER: 'Internal transfer',
  SYSTEM: 'System',
};

const RECONCILIATION_STYLES = {
  BALANCED: 'bg-green-100 text-green-700',
  VARIANCE: 'bg-red-100 text-red-700',
  OPEN: 'bg-amber-100 text-amber-700',
};

const CATEGORY_LABELS = {
  CUSTOMER_DEPOSIT: 'Customer deposit',
  CUSTOMER_BOOKING: 'Customer booking',
  DIRECT_SALE_TRANSFER: 'Direct sale transfer',
  SALES_TRANSFER_IN: 'Sales transfer in',
  PROFIT_TRANSFER_IN: 'Profit transfer in',
  POS_SETTLEMENT: 'POS settlement',
  UNALLOCATED_INCOME: 'Unallocated income',
  CASH_SALE: 'Cash sale',
  INTERNAL_TRANSFER_IN: 'Internal transfer in',
  REFUND: 'Refund',
  BANK_CHARGES: 'Bank charges',
  SALES_TRANSFER_OUT: 'Sales transfer out',
  PROFIT_TRANSFER_OUT: 'Profit transfer out',
  FARMER_PAYMENT: 'Farmer payment',
  SALARY: 'Salary',
  DIESEL_FUEL: 'Diesel / fuel',
  INTERNET: 'Internet',
  MARKETING: 'Marketing',
  OTHER_EXPENSE: 'Other expense',
  UNALLOCATED_EXPENSE: 'Unallocated expense',
  INTERNAL_TRANSFER_OUT: 'Internal transfer out',
};

const INFLOW_CATEGORIES = [
  'CUSTOMER_DEPOSIT',
  'CUSTOMER_BOOKING',
  'DIRECT_SALE_TRANSFER',
  'SALES_TRANSFER_IN',
  'PROFIT_TRANSFER_IN',
  'POS_SETTLEMENT',
  'UNALLOCATED_INCOME',
  'CASH_SALE',
  'INTERNAL_TRANSFER_IN',
];

const OUTFLOW_CATEGORIES = [
  'REFUND',
  'BANK_CHARGES',
  'SALES_TRANSFER_OUT',
  'PROFIT_TRANSFER_OUT',
  'FARMER_PAYMENT',
  'SALARY',
  'DIESEL_FUEL',
  'INTERNET',
  'MARKETING',
  'OTHER_EXPENSE',
  'UNALLOCATED_EXPENSE',
  'INTERNAL_TRANSFER_OUT',
];

function buildCategoryMap(transactionCategories = []) {
  return transactionCategories.reduce((acc, entry) => {
    acc[entry.category] = entry;
    return acc;
  }, {});
}

function categoryLabel(category, categoryMap = {}) {
  return categoryMap[category]?.label || CATEGORY_LABELS[category] || category;
}

function categoryDescription(category, categoryMap = {}) {
  return categoryMap[category]?.description || '';
}

function categoryOptionsForDirection(direction, categoryMap = {}, currentCategory = '') {
  const configured = Object.values(categoryMap)
    .filter((entry) => entry.direction === direction)
    .filter((entry) => entry.isActive !== false || entry.category === currentCategory)
    .sort((a, b) => (a.label || a.category).localeCompare(b.label || b.category))
    .map((entry) => entry.category);

  if (configured.length > 0) return configured;

  const source = direction === 'OUTFLOW' ? OUTFLOW_CATEGORIES : INFLOW_CATEGORIES;
  return source.filter((category) => categoryMap[category]?.isActive !== false || category === currentCategory);
}

function fmtMoney(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(Number(n));
}

function fmtDate(value, withTime = false) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-NG', withTime
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function accountLabel(account) {
  if (!account) return '—';
  const displayName = displayAccountName(account);
  return account.lastFour === 'CASH'
    ? displayName
    : `${displayName} • ••••${account.lastFour}`;
}

function displayAccountName(account) {
  if (!account) return '—';
  if (account.accountType === 'CASH_ON_HAND') return 'Cash Account';
  return account.name;
}

function accountPurpose(accountType) {
  const purposes = {
    CUSTOMER_DEPOSIT: 'Money paid into the bank should land here first.',
    SALES: 'Move money here when you are ready to separate sales funds.',
    PROFIT: 'Move profit here before paying expenses.',
    CASH_ON_HAND: 'Record cash received here first, then move it to Customer Deposit after banking it.',
  };
  return purposes[accountType] || 'Use this account for banking entries and transfers.';
}

function importCount(importRecord, key) {
  return importRecord?.counts?.[key] || importRecord?.counts?.[key?.toUpperCase?.()] || 0;
}

export default function Banking() {
  const { user } = useAuth();
  const [activeView, setActiveView] = useState('workspace');
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
  const [bankingPolicy, setBankingPolicy] = useState({
    bookingMinimumPaymentPercent: 80,
  });
  const [loading, setLoading] = useState(true);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [importsLoading, setImportsLoading] = useState(false);
  const [selectedImportLoading, setSelectedImportLoading] = useState(false);
  const [reconciliationsLoading, setReconciliationsLoading] = useState(false);
  const [customerBookingLoading, setCustomerBookingLoading] = useState(false);
  const [portalTransferLoading, setPortalTransferLoading] = useState(false);
  const [error, setError] = useState('');

  const [filters, setFilters] = useState({
    bankAccountId: '',
    direction: '',
    sourceType: '',
    dateFrom: '',
    dateTo: '',
  });

  const [showRecordModal, setShowRecordModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [postingImport, setPostingImport] = useState(false);

  const canRecord = ['ADMIN', 'MANAGER', 'RECORD_KEEPER'].includes(user?.role);
  const canViewReports = ['ADMIN', 'MANAGER'].includes(user?.role);
  const categoryMap = buildCategoryMap(transactionCategories);

  useEffect(() => {
    loadWorkspace();
  }, []);

  useEffect(() => {
    if (activeView === 'transactions') {
      loadTransactions();
    }
  }, [activeView, filters.bankAccountId, filters.direction, filters.sourceType, filters.dateFrom, filters.dateTo]);

  useEffect(() => {
    if (activeView === 'imports') {
      loadImports();
    }
  }, [activeView]);

  useEffect(() => {
    if (activeView === 'reconciliation') {
      loadReconciliations();
    }
  }, [activeView]);

  useEffect(() => {
    if (selectedImportId) {
      loadImportDetail(selectedImportId);
    } else {
      setSelectedImport(null);
      setSelectedImportLines([]);
    }
  }, [selectedImportId]);

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
        if (current && nextImports.some((importRecord) => importRecord.id === current)) {
          return current;
        }
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
      setBankingPolicy((current) => ({
        ...current,
        ...(data.policy || {}),
      }));
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

  const views = [
    { key: 'workspace', label: 'Workspace' },
    { key: 'transactions', label: 'Transactions' },
    { key: 'imports', label: 'Bank statements' },
    { key: 'customer-bookings', label: 'Customer bookings' },
    { key: 'portal-transfers', label: 'Portal transfers' },
    { key: 'reconciliation', label: 'Reconciliation' },
    ...(canViewReports ? [
      { key: 'unbooked', label: 'Unbooked deposits' },
      { key: 'liability', label: 'Customer liability' },
      { key: 'expenses', label: 'Expenses' },
    ] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Banking</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            Record money received, move cash after bank deposit, import bank statements, and check balances here.
          </p>
        </div>

        {canRecord && (
          <div className="flex flex-wrap gap-2">
            <ActionButton label="Add one entry" onClick={() => setShowRecordModal(true)} />
            <ActionButton label="Add many entries" onClick={() => setShowBulkModal(true)} />
            <ActionButton label="Move money" onClick={() => setShowTransferModal(true)} />
            <ActionButton label="Import bank statement" onClick={() => setShowImportModal(true)} />
            {canViewReports && <ActionButton label="Reconcile balance" onClick={() => setShowReconcileModal(true)} />}
          </div>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1">
        {views.map((view) => (
          <button
            key={view.key}
            onClick={() => setActiveView(view.key)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeView === view.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {view.label}
          </button>
        ))}
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {activeView === 'workspace' && (
        <WorkspaceView
          loading={loading}
          accounts={accounts}
          imports={imports}
          reconciliations={reconciliations}
          transactions={transactions.slice(0, 8)}
          canViewReports={canViewReports}
          onOpenImport={(importId) => {
            setSelectedImportId(importId);
            setActiveView('imports');
          }}
        />
      )}

      {activeView === 'transactions' && (
        <TransactionsView
          accounts={accounts}
          transactions={transactions}
          total={transactionsTotal}
          loading={transactionsLoading}
          filters={filters}
          onFilterChange={(next) => setFilters((current) => ({ ...current, ...next }))}
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
          onImportQueueUpdated={() => {
            loadImports();
          }}
        />
      )}

      {activeView === 'customer-bookings' && (
        <CustomerBookingQueueView
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
        <PortalTransferQueueView
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

      {activeView === 'reconciliation' && (
        <ReconciliationView
          accounts={accounts}
          reconciliations={reconciliations}
          loading={reconciliationsLoading}
        />
      )}

      {activeView === 'unbooked' && <UnbookedDepositsView />}
      {activeView === 'liability' && <CustomerLiabilityView />}
      {activeView === 'expenses' && <ExpensesView categoryMap={categoryMap} />}

      {showRecordModal && (
        <RecordTransactionModal
          accounts={accounts}
          transactionCategories={transactionCategories}
          categoryMap={categoryMap}
          onCategoriesChanged={loadMeta}
          onClose={() => setShowRecordModal(false)}
          onRecorded={() => {
            setShowRecordModal(false);
            refreshAfterMutation();
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
          accounts={accounts.filter((account) => account.supportsStatementImport)}
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

function ActionButton({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-100"
    >
      {label}
    </button>
  );
}

function WorkspaceView({ loading, accounts, imports, reconciliations, transactions, canViewReports, onOpenImport }) {
  if (loading) {
    return <div className="rounded-2xl border border-gray-200 bg-white px-6 py-20 text-center text-sm text-gray-500">Loading banking workspace…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <h2 className="text-sm font-semibold text-blue-900">How to use this page</h2>
        <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-blue-900 lg:grid-cols-3">
          <p><span className="font-semibold">1.</span> Record money received. If it is cash, record it in <span className="font-semibold">Cash Account</span>.</p>
          <p><span className="font-semibold">2.</span> When cash is deposited in the bank, use <span className="font-semibold">Move money</span> from <span className="font-semibold">Cash Account</span> to <span className="font-semibold">Customer Deposit Account</span>.</p>
          <p><span className="font-semibold">3.</span> Import the bank statement and reconcile the balance to make sure the records match the bank.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {accounts.map((account) => {
          const latest = account.latestReconciliation;
          return (
            <div
              key={account.id}
              className={`rounded-2xl border bg-gradient-to-br p-4 ${ACCOUNT_STYLES[account.accountType] || 'from-gray-50 to-white border-gray-200'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">{account.accountType.replaceAll('_', ' ')}</p>
                  <h3 className="mt-1 text-lg font-semibold text-gray-900">{displayAccountName(account)}</h3>
                  <p className="mt-1 text-xs text-gray-500">
                    {account.isVirtual ? 'Virtual ledger' : `${account.bankName} • ••••${account.lastFour}`}
                  </p>
                  <p className="mt-2 max-w-xs text-xs text-gray-600">{accountPurpose(account.accountType)}</p>
                </div>
                <div className="flex flex-col gap-1 text-right">
                  {!account.supportsStatementImport && (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-700">No statement import</span>
                  )}
                  {latest && (
                    <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${RECONCILIATION_STYLES[latest.status] || 'bg-gray-100 text-gray-600'}`}>
                      {latest.status.toLowerCase()}
                    </span>
                  )}
                </div>
              </div>

              <p className="mt-6 text-3xl font-bold text-gray-900">{fmtMoney(account.systemBalance)}</p>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-green-700">In {fmtMoney(account.totalInflows)}</span>
                <span className="text-red-600">Out {fmtMoney(account.totalOutflows)}</span>
              </div>
              <div className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
                <div className="flex items-center justify-between">
                  <span>{account.transactionCount} transaction{account.transactionCount !== 1 ? 's' : ''}</span>
                  <span>{latest ? `Reconciled ${fmtDate(latest.statementDate)}` : 'Not reconciled yet'}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Recent entries</h2>
              <p className="text-sm text-gray-500">See the latest money recorded across the bank accounts and the cash account.</p>
            </div>
          </div>
          {transactions.length === 0 ? (
            <EmptyState title="No entries yet" body="When you add an entry, move money, or import a bank statement, it will show here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Account</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Category</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Source</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Description</th>
                    <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => (
                    <tr key={transaction.id} className="border-b border-gray-50">
                      <td className="px-3 py-3 text-sm text-gray-600">{fmtDate(transaction.transactionDate)}</td>
                      <td className="px-3 py-3 text-sm text-gray-800">{accountLabel(transaction.bankAccount)}</td>
                      <td className="px-3 py-3 text-sm text-gray-600">{categoryLabel(transaction.category, categoryMap)}</td>
                      <td className="px-3 py-3 text-sm text-gray-500">{SOURCE_LABELS[transaction.sourceType] || transaction.sourceType}</td>
                      <td className="px-3 py-3 text-sm text-gray-500">{transaction.description || transaction.reference || '—'}</td>
                      <td className={`px-3 py-3 text-right text-sm font-semibold ${DIRECTION_COLORS[transaction.direction]}`}>
                        {transaction.direction === 'INFLOW' ? '+' : '-'}{fmtMoney(transaction.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Bank statements</h2>
                <p className="text-sm text-gray-500">Import the bank statement, review each line, then post the correct ones.</p>
              </div>
            </div>
            {imports.length === 0 ? (
              <EmptyState title="No bank statements yet" body="Import a Providus statement to review each bank line before posting it." />
            ) : (
              <div className="space-y-3">
                {imports.slice(0, 4).map((importRecord) => (
                  <button
                    key={importRecord.id}
                    onClick={() => onOpenImport(importRecord.id)}
                    className="w-full rounded-xl border border-gray-200 p-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{importRecord.originalFilename}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {displayAccountName(importRecord.bankAccount)} • {fmtDate(importRecord.statementDateFrom)} to {fmtDate(importRecord.statementDateTo)}
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${RECONCILIATION_STYLES[importRecord.status === 'POSTED' ? 'BALANCED' : importRecord.status === 'PARTIALLY_POSTED' ? 'OPEN' : 'VARIANCE']}`}>
                        {importRecord.status.replaceAll('_', ' ').toLowerCase()}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                      <span>{importRecord.parsedRowCount} parsed</span>
                      <span>{importRecord.postedRowCount} posted</span>
                      <span>{importRecord._count?.reconciliations || 0} reconciliation{(importRecord._count?.reconciliations || 0) !== 1 ? 's' : ''}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {canViewReports && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <h2 className="text-lg font-semibold text-gray-900">Latest reconciliations</h2>
              <p className="mt-1 text-sm text-gray-500">Use this to check whether your records match the bank balance.</p>
              {reconciliations.length === 0 ? (
                <EmptyState title="No balance checks yet" body="Create one from a bank statement or type the bank balance manually." compact />
              ) : (
                <div className="mt-4 space-y-3">
                  {reconciliations.slice(0, 4).map((reconciliation) => (
                    <div key={reconciliation.id} className="rounded-xl border border-gray-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{displayAccountName(reconciliation.bankAccount)}</p>
                          <p className="mt-1 text-xs text-gray-500">Statement date {fmtDate(reconciliation.statementDate)}</p>
                        </div>
                        <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${RECONCILIATION_STYLES[reconciliation.status] || 'bg-gray-100 text-gray-600'}`}>
                          {reconciliation.status.toLowerCase()}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <StatPill label="Statement" value={fmtMoney(reconciliation.closingBalance)} />
                        <StatPill label="System" value={fmtMoney(reconciliation.systemBalance)} />
                        <StatPill label="Variance" value={fmtMoney(reconciliation.variance)} danger={Math.abs(reconciliation.variance) > 0.009} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TransactionsView({ accounts, transactions, total, loading, filters, onFilterChange }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label="Account">
            <select
              value={filters.bankAccountId}
              onChange={(event) => onFilterChange({ bankAccountId: event.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All accounts</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{displayAccountName(account)}</option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Direction">
            <select
              value={filters.direction}
              onChange={(event) => onFilterChange({ direction: event.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All directions</option>
              <option value="INFLOW">Inflows</option>
              <option value="OUTFLOW">Outflows</option>
            </select>
          </FilterField>

          <FilterField label="Source">
            <select
              value={filters.sourceType}
              onChange={(event) => onFilterChange({ sourceType: event.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All sources</option>
              {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </FilterField>

          <FilterField label="From">
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(event) => onFilterChange({ dateFrom: event.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            />
          </FilterField>

          <FilterField label="To">
            <input
              type="date"
              value={filters.dateTo}
              onChange={(event) => onFilterChange({ dateTo: event.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            />
          </FilterField>

          <button
            onClick={() => onFilterChange({ bankAccountId: '', direction: '', sourceType: '', dateFrom: '', dateTo: '' })}
            className="rounded-lg px-2 py-2 text-sm text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Transactions</h2>
            <p className="text-sm text-gray-500">{total} transaction{total !== 1 ? 's' : ''} in view</p>
          </div>
        </div>

        {loading ? (
          <div className="px-6 py-20 text-center text-sm text-gray-500">Loading transactions…</div>
        ) : transactions.length === 0 ? (
          <div className="px-6 py-20">
            <EmptyState title="No transactions match this filter" body="Try widening the date range or clearing the source and direction filters." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Account</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Customer</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">By</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <tr key={transaction.id} className="border-b border-gray-50 align-top">
                    <td className="px-4 py-3 text-sm text-gray-600">{fmtDate(transaction.transactionDate, true)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">{accountLabel(transaction.bankAccount)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{categoryLabel(transaction.category, categoryMap)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{SOURCE_LABELS[transaction.sourceType] || transaction.sourceType}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{transaction.description || transaction.reference || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{transaction.customer?.name || '—'}</td>
                    <td className={`px-4 py-3 text-right text-sm font-semibold ${DIRECTION_COLORS[transaction.direction]}`}>
                      {transaction.direction === 'INFLOW' ? '+' : '-'}{fmtMoney(transaction.amount)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{transaction.enteredBy?.firstName || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ImportsView({
  accounts,
  categoryMap,
  imports,
  importsLoading,
  selectedImportId,
  onSelectImport,
  selectedImport,
  selectedImportLines,
  selectedImportLoading,
  postingImport,
  onPostImport,
  onLineUpdated,
  onImportQueueUpdated,
}) {
  const [selectedImportIds, setSelectedImportIds] = useState([]);
  const [selectedLineIds, setSelectedLineIds] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState('');

  useEffect(() => {
    setSelectedImportIds((current) => current.filter((id) => imports.some((importRecord) => importRecord.id === id)));
  }, [imports]);

  useEffect(() => {
    setSelectedLineIds([]);
    setStatusFilter('');
    setSearchTerm('');
    setBulkCategory('');
    setBulkStatus('');
    setBulkError('');
  }, [selectedImportId]);

  const filteredImportLines = selectedImportLines.filter((line) => {
    if (statusFilter && line.reviewStatus !== statusFilter) return false;
    if (!searchTerm.trim()) return true;

    const amount = line.direction === 'OUTFLOW' ? line.debitAmount : line.creditAmount;
    const search = searchTerm.trim().toLowerCase();
    const haystack = [
      line.lineNumber,
      line.description,
      line.docNum,
      line.notes,
      line.direction,
      line.selectedCategory,
      line.suggestedCategory,
      amount,
    ]
      .filter((value) => value !== null && value !== undefined)
      .join(' ')
      .toLowerCase();

    return haystack.includes(search);
  });

  const editableVisibleLines = filteredImportLines.filter((line) => line.reviewStatus !== 'POSTED');
  const categoryOptions = [...new Set(editableVisibleLines.flatMap((line) => categoryOptionsForDirection(line.direction, categoryMap, line.selectedCategory || line.suggestedCategory || '')))];

  useEffect(() => {
    const visibleEditableIds = new Set(editableVisibleLines.map((line) => line.id));
    setSelectedLineIds((current) => current.filter((id) => visibleEditableIds.has(id)));
  }, [statusFilter, searchTerm, selectedImportLines]);

  async function removeSelectedImports() {
    if (selectedImportIds.length === 0) return;
    if (!window.confirm(`Remove ${selectedImportIds.length} selected import${selectedImportIds.length === 1 ? '' : 's'} from the active queue? The imported lines will stay documented, but the wrong statement file will leave the queue.`)) return;
    await api.post('/banking/imports/remove', { importIds: selectedImportIds });
    if (selectedImportIds.includes(selectedImportId)) {
      onSelectImport('');
    }
    setSelectedImportIds([]);
    onImportQueueUpdated();
  }

  function toggleImport(importId, checked) {
    setSelectedImportIds((current) => (
      checked ? [...new Set([...current, importId])] : current.filter((id) => id !== importId)
    ));
  }

  function toggleLine(lineId, checked) {
    setSelectedLineIds((current) => (
      checked ? [...new Set([...current, lineId])] : current.filter((id) => id !== lineId)
    ));
  }

  async function applyBulkUpdate() {
    if (!selectedImportId || selectedLineIds.length === 0) return;
    if (!bulkCategory && !bulkStatus) {
      setBulkError('Choose a category or a status before applying a bulk update.');
      return;
    }

    setBulkSaving(true);
    setBulkError('');
    try {
      await api.post(`/banking/imports/${selectedImportId}/lines/bulk-update`, {
        lineIds: selectedLineIds,
        ...(bulkCategory ? { selectedCategory: bulkCategory } : {}),
        ...(bulkStatus ? { reviewStatus: bulkStatus } : {}),
      });
      setSelectedLineIds([]);
      setBulkCategory('');
      setBulkStatus('');
      onLineUpdated();
    } catch (err) {
      setBulkError(err.error || 'Failed to apply the bulk update');
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_1fr]">
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-gray-900">Import queue</h2>
        <p className="mt-1 text-sm text-gray-500">Open an import to review line classifications before posting. If the wrong statement file was uploaded, remove that import from the queue here.</p>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-600">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={imports.length > 0 && selectedImportIds.length === imports.length}
              onChange={(event) => setSelectedImportIds(event.target.checked ? imports.map((importRecord) => importRecord.id) : [])}
            />
            Select imports
          </label>
          <button
            type="button"
            onClick={removeSelectedImports}
            disabled={selectedImportIds.length === 0}
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Remove selected imports
          </button>
        </div>

        {importsLoading ? (
          <div className="py-12 text-center text-sm text-gray-500">Loading imports…</div>
        ) : imports.length === 0 ? (
          <div className="py-12">
            <EmptyState title="No statement imports yet" body="Import a Providus statement from the Banking workspace to begin review." compact />
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {imports.map((importRecord) => (
              <div
                key={importRecord.id}
                className={`w-full rounded-xl border p-3 transition-colors ${
                  selectedImportId === importRecord.id
                    ? 'border-brand-300 bg-brand-50'
                    : 'border-gray-200 hover:border-brand-200 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedImportIds.includes(importRecord.id)}
                    onChange={(event) => toggleImport(importRecord.id, event.target.checked)}
                    className="mt-1"
                  />
                  <button
                    type="button"
                    onClick={() => onSelectImport(importRecord.id)}
                    className="flex-1 text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{importRecord.originalFilename}</p>
                        <p className="mt-1 text-xs text-gray-500">{displayAccountName(importRecord.bankAccount) || 'Unknown account'}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${RECONCILIATION_STYLES[importRecord.status === 'POSTED' ? 'BALANCED' : importRecord.status === 'PARTIALLY_POSTED' ? 'OPEN' : 'VARIANCE']}`}>
                        {importRecord.status.toLowerCase()}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                      <span>{importRecord.parsedRowCount} lines</span>
                      <span>{importRecord.postedRowCount} posted</span>
                    </div>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white">
        {!selectedImportId ? (
          <div className="px-6 py-24">
            <EmptyState title="Choose an import" body="Pick one from the queue to review categories, duplicates, and posting readiness." />
          </div>
        ) : selectedImportLoading ? (
          <div className="px-6 py-24 text-center text-sm text-gray-500">Loading import details…</div>
        ) : !selectedImport ? (
          <div className="px-6 py-24">
            <EmptyState title="Import not found" body="Reload the page and try again." />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4 border-b border-gray-100 px-6 py-5 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{selectedImport.originalFilename}</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {displayAccountName(selectedImport.bankAccount)} • {fmtDate(selectedImport.statementDateFrom)} to {fmtDate(selectedImport.statementDateTo)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <StatusChip label={`${selectedImport.parsedRowCount} parsed`} />
                  <StatusChip label={`${selectedImport.postedRowCount} posted`} tone="green" />
                  <StatusChip label={`${fmtMoney(selectedImport.openingBalance)} opening`} />
                  <StatusChip label={`${fmtMoney(selectedImport.closingBalance)} closing`} />
                  <StatusChip label={`${Object.values(selectedImport.counts || {}).reduce((sum, value) => sum + value, 0)} reviewed`} />
                </div>
              </div>

              <button
                onClick={onPostImport}
                disabled={postingImport || selectedImport.status === 'POSTED'}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {postingImport ? 'Posting…' : selectedImport.status === 'POSTED' ? 'Already posted' : 'Post ready lines'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 border-b border-gray-100 px-6 py-4 lg:grid-cols-4">
              <ImportCountCard label="Ready" value={importCount(selectedImport, 'READY_TO_POST') || importCount(selectedImport, 'ready')} tone="green" />
              <ImportCountCard label="Pending" value={importCount(selectedImport, 'PENDING_REVIEW') || importCount(selectedImport, 'pending')} tone="amber" />
              <ImportCountCard label="Duplicates" value={importCount(selectedImport, 'DUPLICATE') || importCount(selectedImport, 'duplicate')} tone="red" />
              <ImportCountCard label="Skipped" value={importCount(selectedImport, 'SKIPPED') || importCount(selectedImport, 'skipped')} tone="gray" />
            </div>

            <div className="space-y-4 border-b border-gray-100 px-6 py-4">
              <p className="text-sm text-gray-600">
                Every line in the statement stays documented here. Review, search, filter, and update the lines in bulk, then post the ready ones.
              </p>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_220px_220px]">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by narration, reference, amount, or line number"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">All statuses</option>
                  <option value="PENDING_REVIEW">Pending</option>
                  <option value="READY_TO_POST">Ready</option>
                  <option value="DUPLICATE">Duplicate</option>
                  <option value="SKIPPED">Skipped</option>
                  <option value="POSTED">Posted</option>
                </select>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                  Showing {filteredImportLines.length} of {selectedImportLines.length} lines
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-[220px_220px_auto]">
                  <select
                    value={bulkCategory}
                    onChange={(event) => setBulkCategory(event.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">Bulk category</option>
                    {categoryOptions.map((category) => (
                      <option key={category} value={category}>{categoryLabel(category, categoryMap)}</option>
                    ))}
                  </select>
                  <select
                    value={bulkStatus}
                    onChange={(event) => setBulkStatus(event.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">Bulk status</option>
                    <option value="PENDING_REVIEW">Move to pending</option>
                    <option value="READY_TO_POST">Mark ready</option>
                    <option value="SKIPPED">Mark skipped</option>
                    <option value="DUPLICATE">Mark duplicate</option>
                  </select>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={editableVisibleLines.length > 0 && selectedLineIds.length === editableVisibleLines.length}
                        onChange={(event) => setSelectedLineIds(event.target.checked ? editableVisibleLines.map((line) => line.id) : [])}
                      />
                      Select visible editable lines
                    </label>
                    <button
                      type="button"
                      onClick={applyBulkUpdate}
                      disabled={selectedLineIds.length === 0 || bulkSaving}
                      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      {bulkSaving ? 'Applying…' : `Apply to ${selectedLineIds.length || 0} line${selectedLineIds.length === 1 ? '' : 's'}`}
                    </button>
                  </div>
                </div>
                {bulkError && <p className="mt-3 text-sm text-red-600">{bulkError}</p>}
              </div>
            </div>

            {filteredImportLines.length === 0 ? (
              <div className="px-6 py-24">
                <EmptyState title="No matching lines" body="Try clearing the search or changing the status filter." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px]">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Select</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Line</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Description</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Direction</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Category</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Notes</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredImportLines.map((line) => (
                      <ImportLineRow
                        key={line.id}
                        line={line}
                        categoryMap={categoryMap}
                        selected={selectedLineIds.includes(line.id)}
                        onToggleSelected={toggleLine}
                        onSaved={onLineUpdated}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ReconciliationView({ accounts, reconciliations, loading }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {accounts.map((account) => (
          <div key={account.id} className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">{account.accountType.replaceAll('_', ' ')}</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{displayAccountName(account)}</p>
              </div>
              {account.latestReconciliation && (
                <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${RECONCILIATION_STYLES[account.latestReconciliation.status] || 'bg-gray-100 text-gray-600'}`}>
                  {account.latestReconciliation.status.toLowerCase()}
                </span>
              )}
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">System balance</span>
                <span className="font-semibold text-gray-900">{fmtMoney(account.systemBalance)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Latest statement</span>
                <span className="text-gray-700">{account.latestReconciliation ? fmtMoney(account.latestReconciliation.closingBalance) : '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Variance</span>
                <span className={`${account.latestReconciliation && Math.abs(account.latestReconciliation.variance) > 0.009 ? 'text-red-600' : 'text-gray-700'}`}>
                  {account.latestReconciliation ? fmtMoney(account.latestReconciliation.variance) : '—'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-6 py-5">
          <h2 className="text-lg font-semibold text-gray-900">Reconciliation history</h2>
          <p className="text-sm text-gray-500">Every reconciliation stores statement balance, system balance, and the remaining variance.</p>
        </div>
        {loading ? (
          <div className="px-6 py-24 text-center text-sm text-gray-500">Loading reconciliations…</div>
        ) : reconciliations.length === 0 ? (
          <div className="px-6 py-24">
            <EmptyState title="No reconciliations yet" body="Create one from a statement import or enter a statement balance manually." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Account</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Statement</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">System</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Variance</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">By</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {reconciliations.map((reconciliation) => (
                  <tr key={reconciliation.id} className="border-b border-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600">{fmtDate(reconciliation.statementDate)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">{displayAccountName(reconciliation.bankAccount)}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-800">{fmtMoney(reconciliation.closingBalance)}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-800">{fmtMoney(reconciliation.systemBalance)}</td>
                    <td className={`px-4 py-3 text-right text-sm font-semibold ${Math.abs(reconciliation.variance) > 0.009 ? 'text-red-600' : 'text-green-600'}`}>
                      {fmtMoney(reconciliation.variance)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {reconciliation.statementImport?.originalFilename || 'Manual statement'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{reconciliation.reconciledBy?.firstName || '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${RECONCILIATION_STYLES[reconciliation.status] || 'bg-gray-100 text-gray-600'}`}>
                        {reconciliation.status.toLowerCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function UnbookedDepositsView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/banking/unbooked-deposits').then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <PanelLoading label="Loading unbooked deposits…" />;
  if (!data || data.count === 0) {
    return <EmptyPanel title="No unbooked deposits" body="Every customer deposit is either booked already or there are no deposit transactions yet." />;
  }

  return (
    <div className="space-y-4">
      <SummaryBanner tone="amber" title={`${data.count} customer deposit${data.count !== 1 ? 's' : ''} still need booking action`} body={`${fmtMoney(data.total)} is sitting in deposits without a linked booking.`} />
      <div className="rounded-2xl border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Customer</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Account</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Entered by</th>
            </tr>
          </thead>
          <tbody>
            {data.deposits.map((deposit) => (
              <tr key={deposit.id} className="border-b border-gray-50">
                <td className="px-4 py-3 text-sm text-gray-600">{fmtDate(deposit.transactionDate)}</td>
                <td className="px-4 py-3 text-sm text-gray-800">{deposit.customer?.name || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{displayAccountName(deposit.bankAccount)}</td>
                <td className="px-4 py-3 text-right text-sm font-semibold text-green-600">{fmtMoney(deposit.amount)}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{deposit.enteredBy?.firstName || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CustomerLiabilityView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/banking/customer-liability').then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <PanelLoading label="Loading customer liability…" />;
  if (!data || data.count === 0) {
    return <EmptyPanel title="No outstanding customer liability" body="There are no confirmed bookings holding customer money at the moment." />;
  }

  return (
    <div className="space-y-4">
      <SummaryBanner tone="orange" title={`${data.count} confirmed booking${data.count !== 1 ? 's' : ''} still carry liability`} body={`${fmtMoney(data.totalLiability)} is owed in goods to booked customers.`} />
      <div className="rounded-2xl border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Customer</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Batch</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Qty</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Amount paid</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Booked on</th>
            </tr>
          </thead>
          <tbody>
            {data.bookings.map((booking) => (
              <tr key={booking.id} className="border-b border-gray-50">
                <td className="px-4 py-3 text-sm text-gray-800">{booking.customer}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{booking.batch}</td>
                <td className="px-4 py-3 text-right text-sm">{booking.quantity}</td>
                <td className="px-4 py-3 text-right text-sm font-semibold text-orange-600">{fmtMoney(booking.amountPaid)}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(booking.bookedOn)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExpensesView({ categoryMap }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    loadExpenses();
  }, [dateFrom, dateTo]);

  async function loadExpenses() {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    try {
      const result = await api.get(`/banking/expenses${suffix}`);
      setData(result);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap gap-3">
          <FilterField label="From">
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            />
          </FilterField>
          <FilterField label="To">
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            />
          </FilterField>
        </div>
      </div>

      {loading ? (
        <PanelLoading label="Loading expenses…" />
      ) : !data || data.count === 0 ? (
        <EmptyPanel title="No expenses found" body="Try widening the date range or record expense outflows first." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {Object.entries(data.byCategory || {}).map(([category, info]) => (
              <div key={category} className="rounded-2xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-500">{categoryLabel(category, categoryMap)}</p>
                <p className="mt-2 text-2xl font-bold text-red-600">{fmtMoney(info.total)}</p>
                <p className="mt-1 text-xs text-gray-500">{info.count} transaction{info.count !== 1 ? 's' : ''}</p>
              </div>
            ))}
          </div>

          <SummaryBanner tone="red" title="Expense total" body={`${fmtMoney(data.total)} across ${data.count} outflow transaction${data.count !== 1 ? 's' : ''}.`} />

          <div className="rounded-2xl border border-gray-200 bg-white overflow-x-auto">
            <table className="w-full min-w-[780px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Account</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.expenses.map((expense) => (
                  <tr key={expense.id} className="border-b border-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600">{fmtDate(expense.transactionDate)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{categoryLabel(expense.category, categoryMap)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{expense.description || expense.reference || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{displayAccountName(expense.bankAccount)}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-red-600">{fmtMoney(expense.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function RecordTransactionModal({ accounts, transactionCategories, categoryMap, onCategoriesChanged, onClose, onRecorded }) {
  const [form, setForm] = useState({
    bankAccountId: accounts[0]?.id || '',
    direction: 'INFLOW',
    category: categoryOptionsForDirection('INFLOW', categoryMap)[0] || INFLOW_CATEGORIES[0],
    amount: '',
    description: '',
    reference: '',
    transactionDate: todayStr(),
    customerId: '',
  });
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showCategoryCreator, setShowCategoryCreator] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!customerSearch.trim() || selectedCustomer) {
      setCustomers([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const data = await api.get(`/customers?search=${encodeURIComponent(customerSearch)}`);
        setCustomers(data.customers || []);
      } catch {
        setCustomers([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [customerSearch, selectedCustomer]);

  const categoryOptions = categoryOptionsForDirection(form.direction, categoryMap, form.category);
  const needsCustomer = ['CUSTOMER_DEPOSIT', 'REFUND'].includes(form.category);

  function setDirection(direction) {
    const nextCategories = categoryOptionsForDirection(direction, categoryMap);
    setForm((current) => ({
      ...current,
      direction,
      category: nextCategories[0] || (direction === 'INFLOW' ? INFLOW_CATEGORIES[0] : OUTFLOW_CATEGORIES[0]),
    }));
    setSelectedCustomer(null);
    setCustomerSearch('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post('/banking/transactions', {
        ...form,
        amount: Number(form.amount),
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
    <ModalShell title="Add one entry" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          Use this when you want to record one payment or one expense.
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Direction</label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setDirection('INFLOW')} className={`rounded-lg px-3 py-2 text-sm font-medium ${form.direction === 'INFLOW' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Money in</button>
            <button type="button" onClick={() => setDirection('OUTFLOW')} className={`rounded-lg px-3 py-2 text-sm font-medium ${form.direction === 'OUTFLOW' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Money out</button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Account">
            <select
              value={form.bankAccountId}
              onChange={(event) => setForm((current) => ({ ...current, bankAccountId: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              required
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{displayAccountName(account)}</option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input
              type="date"
              value={form.transactionDate}
              onChange={(event) => setForm((current) => ({ ...current, transactionDate: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              required
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Category">
            <select
              value={form.category}
              onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            >
              {categoryOptions.map((category) => (
                <option key={category} value={category}>{categoryLabel(category, categoryMap)}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">{categoryDescription(form.category, categoryMap) || 'Choose the clearest category for this entry.'}</p>
            <button
              type="button"
              onClick={() => setShowCategoryCreator((current) => !current)}
              className="mt-2 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              {showCategoryCreator ? 'Close new category' : 'Add new category'}
            </button>
          </Field>
          <Field label="Amount">
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              required
            />
          </Field>
        </div>

        {showCategoryCreator && (
          <QuickCategoryCreator
            direction={form.direction}
            transactionCategories={transactionCategories}
            onCreated={async (createdCategory) => {
              await onCategoriesChanged();
              setForm((current) => ({ ...current, category: createdCategory.category }));
              setShowCategoryCreator(false);
            }}
          />
        )}

        {form.category === 'CUSTOMER_BOOKING' && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            Save the money here first. After saving, go to <span className="font-semibold">Customer bookings</span> to link the customer, choose the batch or batches, and allocate the payment.
          </div>
        )}

        {needsCustomer && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Customer</label>
            {selectedCustomer ? (
              <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                <span className="font-medium text-gray-800">{selectedCustomer.name}</span>
                <button type="button" onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); }} className="text-gray-500 hover:text-gray-700">Change</button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  placeholder="Search customer"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                />
                {customers.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200">
                    {customers.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => { setSelectedCustomer(customer); setCustomers([]); }}
                        className="block w-full border-b border-gray-100 px-3 py-2 text-left text-sm hover:bg-gray-50 last:border-b-0"
                      >
                        <span className="font-medium text-gray-900">{customer.name}</span>
                        <span className="ml-2 text-gray-500">{customer.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Description">
            <input
              type="text"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            />
          </Field>
          <Field label="Reference">
            <input
              type="text"
              value={form.reference}
              onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            />
          </Field>
        </div>

        <ModalActions onClose={onClose} submitting={submitting} submitLabel={submitting ? 'Saving…' : 'Save entry'} />
      </form>
    </ModalShell>
  );
}

function BulkTransactionModal({ accounts, transactionCategories, categoryMap, onCategoriesChanged, onClose, onRecorded }) {
  const [rows, setRows] = useState([
    createBulkRow(accounts[0]?.id, categoryMap),
    createBulkRow(accounts[0]?.id, categoryMap),
    createBulkRow(accounts[0]?.id, categoryMap),
  ]);
  const [showCategoryCreator, setShowCategoryCreator] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function updateRow(index, patch) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index) {
    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  function addRow() {
    setRows((current) => [...current, createBulkRow(accounts[0]?.id, categoryMap)]);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post('/banking/transactions/bulk', {
        rows: rows
          .filter((row) => row.amount || row.description || row.reference)
          .map((row) => ({
            ...row,
            amount: Number(row.amount),
          })),
      });
      onRecorded();
    } catch (err) {
      setError(err.error || 'Failed to save bulk entries');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title="Add many entries" onClose={onClose} maxWidth="max-w-6xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          Use this when you want to enter many payments or expenses at once.
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
          <p className="text-sm text-gray-600">Need a new category for these rows?</p>
          <button
            type="button"
            onClick={() => setShowCategoryCreator((current) => !current)}
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            {showCategoryCreator ? 'Close new category' : 'Add new category'}
          </button>
        </div>

        {showCategoryCreator && (
          <QuickCategoryCreator
            transactionCategories={transactionCategories}
            onCreated={async () => {
              await onCategoriesChanged();
              setShowCategoryCreator(false);
            }}
          />
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Direction</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Account</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Category</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">Amount</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Description</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Reference</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const categories = categoryOptionsForDirection(row.direction, categoryMap, row.category);
                return (
                  <tr key={row.id} className="border-b border-gray-50">
                    <td className="px-3 py-3">
                      <select
                        value={row.direction}
                        onChange={(event) => updateRow(index, {
                          direction: event.target.value,
                          category: categoryOptionsForDirection(event.target.value, categoryMap)[0]
                            || (event.target.value === 'INFLOW' ? INFLOW_CATEGORIES[0] : OUTFLOW_CATEGORIES[0]),
                        })}
                        className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        <option value="INFLOW">In</option>
                        <option value="OUTFLOW">Out</option>
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={row.bankAccountId}
                        onChange={(event) => updateRow(index, { bankAccountId: event.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>{displayAccountName(account)}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={row.category}
                        onChange={(event) => updateRow(index, { category: event.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        {categories.map((category) => (
                          <option key={category} value={category}>{categoryLabel(category, categoryMap)}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="date"
                        value={row.transactionDate}
                        onChange={(event) => updateRow(index, { transactionDate: event.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.amount}
                        onChange={(event) => updateRow(index, { amount: event.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-2 py-2 text-right text-sm outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="text"
                        value={row.description}
                        onChange={(event) => updateRow(index, { description: event.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="text"
                        value={row.reference}
                        onChange={(event) => updateRow(index, { reference: event.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <button type="button" onClick={() => removeRow(index)} className="text-sm text-red-600 hover:text-red-700">Remove</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <button type="button" onClick={addRow} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Add row
        </button>

        <ModalActions onClose={onClose} submitting={submitting} submitLabel={submitting ? 'Saving…' : 'Save bulk entries'} />
      </form>
    </ModalShell>
  );
}

function InternalTransferModal({ accounts, onClose, onRecorded }) {
  const cashAccount = accounts.find((account) => account.accountType === 'CASH_ON_HAND');
  const customerDepositAccount = accounts.find((account) => account.accountType === 'CUSTOMER_DEPOSIT');
  const [form, setForm] = useState({
    fromAccountId: cashAccount?.id || accounts[0]?.id || '',
    toAccountId: customerDepositAccount?.id || accounts[1]?.id || accounts[0]?.id || '',
    amount: '',
    description: '',
    transactionDate: todayStr(),
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post('/banking/transfers/internal', {
        ...form,
        amount: Number(form.amount),
      });
      onRecorded();
    } catch (err) {
      setError(err.error || 'Failed to save transfer');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title="Move money" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Use this when money moves from one account to another. Example: after you deposit cash in the bank, move it from <span className="font-semibold">Cash Account</span> to <span className="font-semibold">Customer Deposit Account</span>.
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="From account">
            <select
              value={form.fromAccountId}
              onChange={(event) => setForm((current) => ({ ...current, fromAccountId: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{displayAccountName(account)}</option>
              ))}
            </select>
          </Field>
          <Field label="To account">
            <select
              value={form.toAccountId}
              onChange={(event) => setForm((current) => ({ ...current, toAccountId: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{displayAccountName(account)}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Amount">
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              required
            />
          </Field>
          <Field label="Transfer date">
            <input
              type="date"
              value={form.transactionDate}
              onChange={(event) => setForm((current) => ({ ...current, transactionDate: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              required
            />
          </Field>
        </div>

        <Field label="Description">
          <input
            type="text"
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            placeholder="Optional note"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
        </Field>

        <ModalActions onClose={onClose} submitting={submitting} submitLabel={submitting ? 'Saving…' : 'Save transfer'} />
      </form>
    </ModalShell>
  );
}

function StatementImportModal({ accounts, onClose, onImported }) {
  const [form, setForm] = useState({
    bankAccountId: accounts[0]?.id || '',
    filename: 'providus-import.csv',
    csvText: '',
  });
  const [readingFile, setReadingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setReadingFile(true);
    try {
      const csvText = await file.text();
      setForm((current) => ({
        ...current,
        filename: file.name,
        csvText,
      }));
    } finally {
      setReadingFile(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const result = await api.post('/banking/imports/providus/preview', form);
      onImported(result.import.id);
    } catch (err) {
      setError(err.error || 'Failed to import statement');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title="Import bank statement" onClose={onClose} maxWidth="max-w-4xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Upload the Providus CSV or paste the statement text. The app will read each line, flag duplicates, and let you review it before anything is posted.
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Bank account">
            <select
              value={form.bankAccountId}
              onChange={(event) => setForm((current) => ({ ...current, bankAccountId: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{displayAccountName(account)}</option>
              ))}
            </select>
          </Field>
          <Field label="Filename">
            <input
              type="text"
              value={form.filename}
              onChange={(event) => setForm((current) => ({ ...current, filename: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            />
          </Field>
        </div>

        <Field label="CSV file">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-600"
          />
          {readingFile && <p className="mt-2 text-xs text-gray-500">Reading file…</p>}
        </Field>

        <Field label="CSV text">
          <textarea
            value={form.csvText}
            onChange={(event) => setForm((current) => ({ ...current, csvText: event.target.value }))}
            rows={16}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Paste raw Providus statement CSV here"
          />
        </Field>

        <ModalActions onClose={onClose} submitting={submitting} submitLabel={submitting ? 'Importing…' : 'Preview import'} />
      </form>
    </ModalShell>
  );
}

function ReconciliationModal({ accounts, imports, onClose, onSaved }) {
  const [form, setForm] = useState({
    bankAccountId: accounts[0]?.id || '',
    statementImportId: '',
    statementDate: todayStr(),
    openingBalance: '',
    closingBalance: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const availableImports = imports.filter((importRecord) => importRecord.bankAccountId === form.bankAccountId || importRecord.bankAccount?.id === form.bankAccountId);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post('/banking/reconciliations', {
        bankAccountId: form.bankAccountId,
        statementImportId: form.statementImportId || undefined,
        statementDate: form.statementImportId ? undefined : form.statementDate,
        openingBalance: form.statementImportId || form.openingBalance === '' ? undefined : Number(form.openingBalance),
        closingBalance: form.statementImportId ? undefined : Number(form.closingBalance),
        notes: form.notes || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err.error || 'Failed to create reconciliation');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title="Create reconciliation" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Account">
            <select
              value={form.bankAccountId}
              onChange={(event) => setForm((current) => ({ ...current, bankAccountId: event.target.value, statementImportId: '' }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{displayAccountName(account)}</option>
              ))}
            </select>
          </Field>
          <Field label="Use statement import">
            <select
              value={form.statementImportId}
              onChange={(event) => setForm((current) => ({ ...current, statementImportId: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Manual statement balance</option>
              {availableImports.map((importRecord) => (
                <option key={importRecord.id} value={importRecord.id}>
                  {importRecord.originalFilename} ({fmtDate(importRecord.statementDateTo)})
                </option>
              ))}
            </select>
          </Field>
        </div>

        {!form.statementImportId && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Statement date">
                <input
                  type="date"
                  value={form.statementDate}
                  onChange={(event) => setForm((current) => ({ ...current, statementDate: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                  required
                />
              </Field>
              <Field label="Opening balance">
                <input
                  type="number"
                  step="0.01"
                  value={form.openingBalance}
                  onChange={(event) => setForm((current) => ({ ...current, openingBalance: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                />
              </Field>
              <Field label="Closing balance">
                <input
                  type="number"
                  step="0.01"
                  value={form.closingBalance}
                  onChange={(event) => setForm((current) => ({ ...current, closingBalance: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                  required
                />
              </Field>
            </div>
          </div>
        )}

        <Field label="Notes">
          <textarea
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            rows={4}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Optional reconciliation notes"
          />
        </Field>

        <ModalActions onClose={onClose} submitting={submitting} submitLabel={submitting ? 'Saving…' : 'Save reconciliation'} />
      </form>
    </ModalShell>
  );
}

function ImportLineRow({ line, categoryMap, selected, onToggleSelected, onSaved }) {
  const [draft, setDraft] = useState({
    selectedCategory: line.selectedCategory || line.suggestedCategory || '',
    reviewStatus: line.reviewStatus,
    notes: line.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const categories = categoryOptionsForDirection(line.direction, categoryMap, draft.selectedCategory);
  const amount = line.direction === 'OUTFLOW' ? line.debitAmount : line.creditAmount;

  async function saveLine() {
    setSaving(true);
    try {
      await api.patch(`/banking/imports/${line.importId}/lines/${line.id}`, draft);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-b border-gray-50 align-top">
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={selected}
          disabled={line.reviewStatus === 'POSTED'}
          onChange={(event) => onToggleSelected(line.id, event.target.checked)}
        />
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">{line.lineNumber}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{fmtDate(line.transactionDate || line.actualTransactionDate || line.valueDate)}</td>
      <td className="px-4 py-3 text-sm text-gray-700">
        <div className="max-w-sm truncate font-medium">{line.description}</div>
        {line.docNum && <div className="mt-1 text-xs text-gray-400">Ref {line.docNum}</div>}
      </td>
      <td className="px-4 py-3 text-sm">
        <span className={`font-medium ${DIRECTION_COLORS[line.direction]}`}>{line.direction || '—'}</span>
      </td>
      <td className={`px-4 py-3 text-right text-sm font-semibold ${DIRECTION_COLORS[line.direction]}`}>
        {fmtMoney(amount)}
      </td>
      <td className="px-4 py-3">
        <select
          value={draft.selectedCategory}
          onChange={(event) => setDraft((current) => ({ ...current, selectedCategory: event.target.value }))}
          disabled={line.reviewStatus === 'POSTED'}
          className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-100"
        >
          <option value="">Choose category</option>
          {categories.map((category) => (
            <option key={category} value={category}>{categoryLabel(category, categoryMap)}</option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <select
          value={draft.reviewStatus}
          onChange={(event) => setDraft((current) => ({ ...current, reviewStatus: event.target.value }))}
          disabled={line.reviewStatus === 'POSTED'}
          className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-100"
        >
          <option value="PENDING_REVIEW">Pending</option>
          <option value="READY_TO_POST">Ready</option>
          <option value="SKIPPED">Skipped</option>
          <option value="DUPLICATE">Duplicate</option>
          {line.reviewStatus === 'POSTED' && <option value="POSTED">Posted</option>}
        </select>
      </td>
      <td className="px-4 py-3">
        <textarea
          value={draft.notes}
          onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
          rows={2}
          disabled={line.reviewStatus === 'POSTED'}
          className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-100"
        />
      </td>
      <td className="px-4 py-3">
        {line.reviewStatus === 'POSTED' ? (
          <span className="text-xs font-medium text-green-700">Posted</span>
        ) : (
          <button
            onClick={saveLine}
            disabled={saving}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </td>
    </tr>
  );
}

function QuickCategoryCreator({ direction = 'INFLOW', onCreated }) {
  const [form, setForm] = useState({
    label: '',
    direction,
    description: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm((current) => ({ ...current, direction }));
  }, [direction]);

  async function handleCreate() {
    setSaving(true);
    setError('');
    try {
      const result = await api.post('/banking/categories', form);
      await onCreated(result.category);
      setForm({
        label: '',
        direction,
        description: '',
      });
    } catch (err) {
      setError(err.error || 'Failed to add category');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <input
          type="text"
          value={form.label}
          onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
          placeholder="New category name"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
        />
        <select
          value={form.direction}
          onChange={(event) => setForm((current) => ({ ...current, direction: event.target.value }))}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="INFLOW">Money in</option>
          <option value="OUTFLOW">Money out</option>
        </select>
        <input
          type="text"
          value={form.description}
          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
          placeholder="Short help text"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={handleCreate}
          disabled={saving}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:bg-gray-300"
        >
          {saving ? 'Adding…' : 'Add category globally'}
        </button>
      </div>
    </div>
  );
}

function CustomerBookingQueueView({ loading, queue, openBatches, policy, onRefresh }) {
  const [activeTransaction, setActiveTransaction] = useState(null);

  if (loading) return <PanelLoading label="Loading customer booking queue…" />;
  if (!queue || queue.length === 0) {
    return <EmptyPanel title="No customer booking money waiting" body="Any transaction saved as Customer booking will show here until the customer and batch allocations are sorted out." />;
  }

  return (
    <div className="space-y-4">
      <SummaryBanner
        tone="amber"
        title={`${queue.length} customer booking transaction${queue.length === 1 ? '' : 's'} waiting for action`}
        body="Use this queue to link the customer, split the money across one or more open batches, and create the actual bookings."
      />

      <div className="space-y-3">
        {queue.map((transaction) => (
          <div key={transaction.id} className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-semibold text-gray-900">{transaction.customer?.name || 'Customer not linked yet'}</p>
                  <StatusChip label={transaction.customer ? 'Customer linked' : 'Needs customer'} tone={transaction.customer ? 'green' : 'gray'} />
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  {fmtDate(transaction.transactionDate, true)} · {accountLabel(transaction.bankAccount)} · {transaction.reference || transaction.description || 'No reference'}
                </p>
                <p className="mt-2 text-sm text-gray-600">{transaction.description || 'No description entered.'}</p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm lg:min-w-[340px]">
                <StatPill label="Money received" value={fmtMoney(transaction.amount)} />
                <StatPill label="Already allocated" value={fmtMoney(transaction.allocatedAmount)} />
                <StatPill label="Still to assign" value={fmtMoney(transaction.availableAmount)} danger={transaction.availableAmount > 0.009} />
              </div>
            </div>

            {transaction.allocations?.length > 0 && (
              <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm font-semibold text-gray-900">Bookings already created from this money</p>
                <div className="mt-3 space-y-2">
                  {transaction.allocations.map((allocation) => (
                    <div key={allocation.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-sm">
                      <div>
                        <span className="font-medium text-gray-900">{allocation.booking?.batch?.name || 'Batch'}</span>
                        <span className="ml-2 text-gray-500">{allocation.booking?.batch?.eggTypeLabel || 'Regular Size Eggs'}</span>
                      </div>
                      <div className="text-gray-600">
                        {allocation.booking?.quantity || 0} crates · {fmtMoney(allocation.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveTransaction(transaction)}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                {transaction.customer ? 'Allocate to batch bookings' : 'Link customer and allocate'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {activeTransaction && (
        <CustomerBookingLinkModal
          transaction={activeTransaction}
          openBatches={openBatches}
          policy={policy}
          onClose={() => setActiveTransaction(null)}
          onSaved={() => {
            setActiveTransaction(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}

function createBookingAllocationRow(defaultBatchId = '') {
  return {
    id: globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2),
    batchId: defaultBatchId,
    quantity: '',
    allocatedAmount: '',
    notes: '',
  };
}

function CustomerBookingLinkModal({ transaction, openBatches, policy, onClose, onSaved }) {
  const [selectedCustomer, setSelectedCustomer] = useState(transaction.customer || null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [customerMode, setCustomerMode] = useState(transaction.customer ? 'linked' : 'existing');
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '', notes: '' });
  const [allocationRows, setAllocationRows] = useState([createBookingAllocationRow()]);
  const [existingBookings, setExistingBookings] = useState([]);
  const [loadingExistingBookings, setLoadingExistingBookings] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [savingBookings, setSavingBookings] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!customerSearch.trim() || selectedCustomer || customerMode !== 'existing') {
      setCustomers([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const result = await api.get(`/customers?search=${encodeURIComponent(customerSearch)}`);
        setCustomers(result.customers || []);
      } catch {
        setCustomers([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [customerSearch, selectedCustomer, customerMode]);

  useEffect(() => {
    if (!selectedCustomer?.id) {
      setExistingBookings([]);
      setLoadingExistingBookings(false);
      return;
    }

    let cancelled = false;
    setLoadingExistingBookings(true);
    api.get(`/bookings?customerId=${selectedCustomer.id}&status=CONFIRMED`)
      .then((result) => {
        if (!cancelled) {
          setExistingBookings(result.bookings || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setExistingBookings([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingExistingBookings(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCustomer?.id]);

  const activeRows = allocationRows.filter((row) => row.batchId || row.quantity || row.allocatedAmount || row.notes);
  const totalPlannedAllocation = activeRows.reduce((sum, row) => sum + Number(row.allocatedAmount || 0), 0);
  const remainingMoney = Math.max(0, Number(transaction.availableAmount) - totalPlannedAllocation);

  function updateRow(rowId, patch) {
    setAllocationRows((current) => current.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setAllocationRows((current) => [...current, createBookingAllocationRow()]);
  }

  function removeRow(rowId) {
    setAllocationRows((current) => current.filter((row) => row.id !== rowId));
  }

  async function linkExistingCustomer(customerId) {
    setSavingCustomer(true);
    setError('');
    try {
      const result = await api.patch(`/banking/customer-bookings/${transaction.id}/customer`, { customerId });
      setSelectedCustomer(result.transaction.customer);
      setCustomerMode('linked');
      setCustomerSearch('');
      setCustomers([]);
    } catch (err) {
      setError(err.error || 'Failed to link customer');
    } finally {
      setSavingCustomer(false);
    }
  }

  async function createCustomer() {
    setSavingCustomer(true);
    setError('');
    try {
      const result = await api.post(`/banking/customer-bookings/${transaction.id}/customer`, newCustomer);
      setSelectedCustomer(result.customer);
      setCustomerMode('linked');
      setNewCustomer({ name: '', phone: '', email: '', notes: '' });
    } catch (err) {
      setError(err.error || 'Failed to create customer');
    } finally {
      setSavingCustomer(false);
    }
  }

  async function saveBookings() {
    setSavingBookings(true);
    setError('');
    try {
      await api.post(`/banking/customer-bookings/${transaction.id}/bookings`, {
        bookings: activeRows.map((row) => ({
          batchId: row.batchId,
          quantity: Number(row.quantity),
          allocatedAmount: Number(row.allocatedAmount),
          notes: row.notes || undefined,
        })),
      });
      onSaved();
    } catch (err) {
      setError(err.error || 'Failed to create bookings from this money');
    } finally {
      setSavingBookings(false);
    }
  }

  return (
    <ModalShell title="Customer booking allocation" onClose={onClose} maxWidth="max-w-6xl">
      <div className="space-y-5">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <StatPill label="Money received" value={fmtMoney(transaction.amount)} />
          <StatPill label="Already allocated" value={fmtMoney(transaction.allocatedAmount)} />
          <StatPill label="Planned now" value={fmtMoney(totalPlannedAllocation)} />
          <StatPill label="Left after this" value={fmtMoney(remainingMoney)} danger={remainingMoney > 0.009} />
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Use this to turn one customer booking payment into one or more real batch bookings. Choose the batch, enter the number of crates, and enter how much of this money belongs to that batch.
        </div>

        {!selectedCustomer ? (
          <div className="rounded-2xl border border-gray-200 p-5 space-y-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCustomerMode('existing')}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${customerMode === 'existing' ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                Link existing customer
              </button>
              <button
                type="button"
                onClick={() => setCustomerMode('new')}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${customerMode === 'new' ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                Create new customer
              </button>
            </div>

            {customerMode === 'existing' ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  placeholder="Search customer by name or phone"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                />
                {customers.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-200">
                    {customers.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => linkExistingCustomer(customer.id)}
                        className="block w-full border-b border-gray-100 px-4 py-3 text-left text-sm hover:bg-gray-50 last:border-b-0"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-gray-900">{customer.name}</span>
                          {(customer._count?.bookings || 0) > 0 && (
                            <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-700">
                              {customer._count.bookings} existing booking{customer._count.bookings === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>
                        <div className="text-gray-500">{customer.phone}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input
                  type="text"
                  value={newCustomer.name}
                  onChange={(event) => setNewCustomer((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Full name"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                />
                <input
                  type="text"
                  value={newCustomer.phone}
                  onChange={(event) => setNewCustomer((current) => ({ ...current, phone: event.target.value }))}
                  placeholder="Phone number"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                />
                <input
                  type="email"
                  value={newCustomer.email}
                  onChange={(event) => setNewCustomer((current) => ({ ...current, email: event.target.value }))}
                  placeholder="Email (optional)"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                />
                <input
                  type="text"
                  value={newCustomer.notes}
                  onChange={(event) => setNewCustomer((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Notes (optional)"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                />
                <div className="md:col-span-2 flex justify-end">
                  <button
                    type="button"
                    onClick={createCustomer}
                    disabled={savingCustomer}
                    className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:bg-gray-300"
                  >
                    {savingCustomer ? 'Creating…' : 'Create and link customer'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
              Customer linked: <span className="font-semibold">{selectedCustomer.name}</span> {selectedCustomer.phone ? `· ${selectedCustomer.phone}` : ''}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Existing confirmed bookings for this customer</p>
                  <p className="mt-1 text-sm text-gray-500">
                    Use this to avoid creating a duplicate booking for a customer who already has crates reserved.
                  </p>
                </div>
                <StatusChip
                  label={loadingExistingBookings ? 'Checking...' : `${existingBookings.length} existing booking${existingBookings.length === 1 ? '' : 's'}`}
                  tone={existingBookings.length > 0 ? 'amber' : 'green'}
                />
              </div>

              {loadingExistingBookings ? (
                <p className="mt-3 text-sm text-gray-500">Loading existing bookings…</p>
              ) : existingBookings.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">This customer does not have any confirmed bookings yet.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {existingBookings.slice(0, 5).map((booking) => (
                    <div key={booking.id} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium text-gray-900">{booking.batch?.name || 'Batch'}</p>
                          <p className="text-gray-500">
                            {booking.batch?.eggTypeLabel || 'Egg type'}{booking.batch?.expectedDate ? ` · expected ${fmtDate(booking.batch.expectedDate)}` : ''}
                          </p>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs sm:min-w-[280px]">
                          <StatPill label="Crates" value={booking.quantity} />
                          <StatPill label="Paid" value={fmtMoney(booking.amountPaid)} />
                          <StatPill label="Paid %" value={`${booking.orderValue > 0 ? ((booking.amountPaid / booking.orderValue) * 100).toFixed(1) : '0.0'}%`} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {selectedCustomer && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Batch allocations</h3>
                <p className="text-sm text-gray-500">Split the money across one or more open batches. The app checks the {Number(policy?.bookingMinimumPaymentPercent || 80)}% minimum for each batch booking.</p>
              </div>
              <button
                type="button"
                onClick={addRow}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Add batch
              </button>
            </div>

            <div className="space-y-3">
              {allocationRows.map((row) => {
                const batch = openBatches.find((entry) => entry.id === row.batchId);
                const quantity = Number(row.quantity || 0);
                const allocatedAmount = Number(row.allocatedAmount || 0);
                const bookingValue = batch ? quantity * Number(batch.wholesalePrice) : 0;
                const minimumPayment = bookingValue * (Number(policy?.bookingMinimumPaymentPercent || 80) / 100);
                const paidPercent = bookingValue > 0 ? (allocatedAmount / bookingValue) * 100 : 0;

                return (
                  <div key={row.id} className="rounded-xl border border-gray-200 p-4">
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.3fr_0.7fr_0.8fr_auto]">
                      <select
                        value={row.batchId}
                        onChange={(event) => updateRow(row.id, { batchId: event.target.value })}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        <option value="">Choose open batch</option>
                        {openBatches.map((batchOption) => (
                          <option key={batchOption.id} value={batchOption.id}>
                            {batchOption.name} · {batchOption.eggTypeLabel} · {batchOption.remainingAvailable} crates left
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        value={row.quantity}
                        onChange={(event) => updateRow(row.id, { quantity: event.target.value })}
                        placeholder="Crates"
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.allocatedAmount}
                        onChange={(event) => updateRow(row.id, { allocatedAmount: event.target.value })}
                        placeholder="Amount for this batch"
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>
                    <input
                      type="text"
                      value={row.notes}
                      onChange={(event) => updateRow(row.id, { notes: event.target.value })}
                      placeholder="Optional note for this batch booking"
                      className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-6">
                      <StatPill label="Batch" value={batch?.name || 'Choose batch'} />
                      <StatPill label="Crates booked" value={quantity || 0} />
                      <StatPill label="Price / crate" value={batch ? fmtMoney(batch.wholesalePrice) : '—'} />
                      <StatPill label="Booking value" value={fmtMoney(bookingValue)} />
                      <StatPill label="Paid %" value={`${paidPercent.toFixed(1)}%`} danger={bookingValue > 0 && paidPercent < Number(policy?.bookingMinimumPaymentPercent || 80)} />
                      <StatPill label={`${Number(policy?.bookingMinimumPaymentPercent || 80)}% minimum`} value={fmtMoney(minimumPayment)} danger={bookingValue > 0 && allocatedAmount + 0.009 < minimumPayment} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
                Close
              </button>
              <button
                type="button"
                onClick={saveBookings}
                disabled={savingBookings || activeRows.length === 0}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:bg-gray-300"
              >
                {savingBookings ? 'Saving…' : 'Create batch bookings'}
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function PortalTransferQueueView({ loading, queue, onRefresh }) {
  const [workingId, setWorkingId] = useState('');
  const [error, setError] = useState('');

  async function approve(checkoutId) {
    setWorkingId(checkoutId);
    setError('');
    try {
      await api.post(`/portal/admin/transfer-checkouts/${checkoutId}/approve`, {});
      onRefresh();
    } catch (err) {
      setError(err.error || 'Failed to approve transfer');
    } finally {
      setWorkingId('');
    }
  }

  async function reject(checkoutId) {
    setWorkingId(checkoutId);
    setError('');
    try {
      await api.post(`/portal/admin/transfer-checkouts/${checkoutId}/reject`, {});
      onRefresh();
    } catch (err) {
      setError(err.error || 'Failed to reject transfer');
    } finally {
      setWorkingId('');
    }
  }

  if (loading) return <PanelLoading label="Loading portal transfer approvals…" />;
  if (!queue || queue.length === 0) {
    return <EmptyPanel title="No portal transfers waiting" body="Transfer payments from the customer portal will show here until someone approves or rejects them." />;
  }

  return (
    <div className="space-y-4">
      <SummaryBanner
        tone="amber"
        title={`${queue.length} portal transfer${queue.length === 1 ? '' : 's'} waiting for confirmation`}
        body="These portal orders already hold crates. Approve the transfer to keep the hold and complete the order, or reject it to release the crates."
      />

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="space-y-3">
        {queue.map((checkout) => (
          <div key={checkout.id} className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-semibold text-gray-900">{checkout.customer?.name || 'Customer'}</p>
                  <StatusChip label={checkout.checkoutType === 'BOOK_UPCOMING' ? 'Book upcoming' : 'Buy now'} tone="amber" />
                  <StatusChip label="Transfer waiting" tone="gray" />
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  {checkout.customer?.phone || 'No phone'} · {checkout.batch?.name} · {checkout.batch?.eggTypeLabel}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Held on {fmtDate(checkout.createdAt, true)}
                  {checkout.paymentWindowEndsAt ? ` · payment window ends ${fmtDate(checkout.paymentWindowEndsAt, true)}` : ''}
                </p>
                <p className="mt-2 text-sm text-gray-600">
                  {checkout.checkoutType === 'BOOK_UPCOMING'
                    ? 'Approve this transfer to confirm the booking. Reject it to return these crates to available upcoming stock.'
                    : 'Approve this transfer to make the order ready for pickup. Reject it to return these crates to available stock.'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm lg:min-w-[360px]">
                <StatPill label="Crates held" value={checkout.quantity} />
                <StatPill label="Amount to confirm" value={fmtMoney(checkout.amountToPay)} />
                <StatPill label="Order value" value={fmtMoney(checkout.orderValue)} />
                <StatPill label="Balance after this payment" value={fmtMoney(checkout.balanceAfterPayment)} danger={Number(checkout.balanceAfterPayment) > 0.009} />
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => reject(checkout.id)}
                disabled={workingId === checkout.id}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {workingId === checkout.id ? 'Working…' : 'Reject transfer'}
              </button>
              <button
                type="button"
                onClick={() => approve(checkout.id)}
                disabled={workingId === checkout.id}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {workingId === checkout.id ? 'Working…' : 'Approve transfer'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FilterField({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-[0.14em] text-gray-500">{label}</label>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}

function ModalShell({ title, onClose, children, maxWidth = 'max-w-3xl' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className={`max-h-[92vh] w-full ${maxWidth} overflow-y-auto rounded-3xl bg-white shadow-2xl`} onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700">Close</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function ModalActions({ onClose, submitting, submitLabel }) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
      <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
        Cancel
      </button>
      <button type="submit" disabled={submitting} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-gray-300">
        {submitLabel}
      </button>
    </div>
  );
}

function EmptyState({ title, body, compact = false }) {
  return (
    <div className={`text-center ${compact ? 'py-6' : 'py-10'}`}>
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-xl">🏦</div>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">{body}</p>
    </div>
  );
}

function EmptyPanel({ title, body }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-6 py-24">
      <EmptyState title={title} body={body} />
    </div>
  );
}

function PanelLoading({ label }) {
  return <div className="rounded-2xl border border-gray-200 bg-white px-6 py-24 text-center text-sm text-gray-500">{label}</div>;
}

function SummaryBanner({ tone, title, body }) {
  const tones = {
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    orange: 'border-orange-200 bg-orange-50 text-orange-900',
    red: 'border-red-200 bg-red-50 text-red-900',
  };
  return (
    <div className={`rounded-2xl border px-4 py-4 ${tones[tone] || 'border-gray-200 bg-gray-50 text-gray-900'}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm opacity-80">{body}</p>
    </div>
  );
}

function StatPill({ label, value, danger = false }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${danger ? 'bg-red-50' : 'bg-gray-50'}`}>
      <p className="text-[11px] uppercase tracking-[0.14em] text-gray-500">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${danger ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

function StatusChip({ label, tone = 'gray' }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-700',
    green: 'bg-green-100 text-green-700',
  };
  return <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${tones[tone] || tones.gray}`}>{label}</span>;
}

function ImportCountCard({ label, value, tone }) {
  const tones = {
    green: 'bg-green-50 text-green-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    gray: 'bg-gray-50 text-gray-700',
  };
  return (
    <div className={`rounded-xl px-4 py-3 ${tones[tone] || tones.gray}`}>
      <p className="text-xs font-medium uppercase tracking-[0.16em]">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function createBulkRow(defaultAccountId, categoryMap = {}) {
  return {
    id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
    bankAccountId: defaultAccountId || '',
    direction: 'INFLOW',
    category: categoryOptionsForDirection('INFLOW', categoryMap)[0] || INFLOW_CATEGORIES[0],
    transactionDate: todayStr(),
    amount: '',
    description: '',
    reference: '',
  };
}
