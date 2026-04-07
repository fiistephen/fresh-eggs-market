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
  return account.lastFour === 'CASH'
    ? account.name
    : `${account.name} • ••••${account.lastFour}`;
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
  const [selectedImportId, setSelectedImportId] = useState('');
  const [selectedImport, setSelectedImport] = useState(null);
  const [selectedImportLines, setSelectedImportLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [importsLoading, setImportsLoading] = useState(false);
  const [selectedImportLoading, setSelectedImportLoading] = useState(false);
  const [reconciliationsLoading, setReconciliationsLoading] = useState(false);
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
        loadAccounts(),
        loadImports(),
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
    { key: 'imports', label: 'Statement imports' },
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
            Run the money trail from one place: accounts, cash ledger, bulk entry, statement imports, and reconciliation.
          </p>
        </div>

        {canRecord && (
          <div className="flex flex-wrap gap-2">
            <ActionButton label="Manual entry" onClick={() => setShowRecordModal(true)} />
            <ActionButton label="Bulk entry" onClick={() => setShowBulkModal(true)} />
            <ActionButton label="Internal transfer" onClick={() => setShowTransferModal(true)} />
            <ActionButton label="Import statement" onClick={() => setShowImportModal(true)} />
            {canViewReports && <ActionButton label="New reconciliation" onClick={() => setShowReconcileModal(true)} />}
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
      {activeView === 'expenses' && <ExpensesView />}

      {showRecordModal && (
        <RecordTransactionModal
          accounts={accounts}
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
                  <h3 className="mt-1 text-lg font-semibold text-gray-900">{account.name}</h3>
                  <p className="mt-1 text-xs text-gray-500">
                    {account.isVirtual ? 'Virtual ledger' : `${account.bankName} • ••••${account.lastFour}`}
                  </p>
                </div>
                <div className="flex flex-col gap-1 text-right">
                  {!account.supportsStatementImport && (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-700">No import</span>
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
              <h2 className="text-lg font-semibold text-gray-900">Recent money movement</h2>
              <p className="text-sm text-gray-500">See what has hit the ledger most recently across bank and cash accounts.</p>
            </div>
          </div>
          {transactions.length === 0 ? (
            <EmptyState title="No transactions yet" body="Once you record entries, import statements, or transfer cash, they will appear here." />
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
                      <td className="px-3 py-3 text-sm text-gray-600">{CATEGORY_LABELS[transaction.category] || transaction.category}</td>
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
                <h2 className="text-lg font-semibold text-gray-900">Statement imports</h2>
                <p className="text-sm text-gray-500">Review what came in from real bank statements before posting.</p>
              </div>
            </div>
            {imports.length === 0 ? (
              <EmptyState title="No imports yet" body="Import a Providus statement to start reviewing bank lines." />
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
                          {importRecord.bankAccount?.name} • {fmtDate(importRecord.statementDateFrom)} to {fmtDate(importRecord.statementDateTo)}
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
              <p className="mt-1 text-sm text-gray-500">Variance should be obvious at a glance, especially before month-end reporting.</p>
              {reconciliations.length === 0 ? (
                <EmptyState title="No reconciliations yet" body="Create one from a statement import or a manual statement balance." compact />
              ) : (
                <div className="mt-4 space-y-3">
                  {reconciliations.slice(0, 4).map((reconciliation) => (
                    <div key={reconciliation.id} className="rounded-xl border border-gray-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{reconciliation.bankAccount?.name}</p>
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
                <option key={account.id} value={account.id}>{account.name}</option>
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
                    <td className="px-4 py-3 text-sm text-gray-600">{CATEGORY_LABELS[transaction.category] || transaction.category}</td>
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
}) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_1fr]">
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-gray-900">Import queue</h2>
        <p className="mt-1 text-sm text-gray-500">Open an import to review line classifications before posting.</p>

        {importsLoading ? (
          <div className="py-12 text-center text-sm text-gray-500">Loading imports…</div>
        ) : imports.length === 0 ? (
          <div className="py-12">
            <EmptyState title="No statement imports yet" body="Import a Providus statement from the Banking workspace to begin review." compact />
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {imports.map((importRecord) => (
              <button
                key={importRecord.id}
                onClick={() => onSelectImport(importRecord.id)}
                className={`w-full rounded-xl border p-3 text-left transition-colors ${
                  selectedImportId === importRecord.id
                    ? 'border-brand-300 bg-brand-50'
                    : 'border-gray-200 hover:border-brand-200 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{importRecord.originalFilename}</p>
                    <p className="mt-1 text-xs text-gray-500">{importRecord.bankAccount?.name || 'Unknown account'}</p>
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
                  {selectedImport.bankAccount?.name} • {fmtDate(selectedImport.statementDateFrom)} to {fmtDate(selectedImport.statementDateTo)}
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

            {selectedImportLines.length === 0 ? (
              <div className="px-6 py-24">
                <EmptyState title="No lines found" body="This import does not have any parsed statement lines." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px]">
                  <thead>
                    <tr className="border-b border-gray-100">
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
                    {selectedImportLines.map((line) => (
                      <ImportLineRow
                        key={line.id}
                        line={line}
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
                <p className="mt-1 text-sm font-semibold text-gray-900">{account.name}</p>
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
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">{reconciliation.bankAccount?.name || '—'}</td>
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
                <td className="px-4 py-3 text-sm text-gray-500">{deposit.bankAccount?.name || '—'}</td>
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

function ExpensesView() {
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
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-500">{CATEGORY_LABELS[category] || category}</p>
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
                    <td className="px-4 py-3 text-sm text-gray-700">{CATEGORY_LABELS[expense.category] || expense.category}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{expense.description || expense.reference || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{expense.bankAccount?.name || '—'}</td>
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

function RecordTransactionModal({ accounts, onClose, onRecorded }) {
  const [form, setForm] = useState({
    bankAccountId: accounts[0]?.id || '',
    direction: 'INFLOW',
    category: INFLOW_CATEGORIES[0],
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

  const categoryOptions = form.direction === 'INFLOW' ? INFLOW_CATEGORIES : OUTFLOW_CATEGORIES;
  const needsCustomer = ['CUSTOMER_DEPOSIT', 'CUSTOMER_BOOKING', 'REFUND'].includes(form.category);

  function setDirection(direction) {
    setForm((current) => ({
      ...current,
      direction,
      category: direction === 'INFLOW' ? INFLOW_CATEGORIES[0] : OUTFLOW_CATEGORIES[0],
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
    <ModalShell title="Manual banking entry" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

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
                <option key={account.id} value={account.id}>{account.name}</option>
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
                <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>
              ))}
            </select>
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

function BulkTransactionModal({ accounts, onClose, onRecorded }) {
  const [rows, setRows] = useState([
    createBulkRow(accounts[0]?.id),
    createBulkRow(accounts[0]?.id),
    createBulkRow(accounts[0]?.id),
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function updateRow(index, patch) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index) {
    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  function addRow() {
    setRows((current) => [...current, createBulkRow(accounts[0]?.id)]);
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
    <ModalShell title="Bulk banking entry" onClose={onClose} maxWidth="max-w-6xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          Use this for quick line-by-line entry when staff are transcribing several transactions at once.
        </div>

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
                const categories = row.direction === 'INFLOW' ? INFLOW_CATEGORIES : OUTFLOW_CATEGORIES;
                return (
                  <tr key={row.id} className="border-b border-gray-50">
                    <td className="px-3 py-3">
                      <select
                        value={row.direction}
                        onChange={(event) => updateRow(index, {
                          direction: event.target.value,
                          category: event.target.value === 'INFLOW' ? INFLOW_CATEGORIES[0] : OUTFLOW_CATEGORIES[0],
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
                          <option key={account.id} value={account.id}>{account.name}</option>
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
                          <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>
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
  const [form, setForm] = useState({
    fromAccountId: accounts[0]?.id || '',
    toAccountId: accounts[1]?.id || accounts[0]?.id || '',
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
    <ModalShell title="Internal transfer" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Use this for account-to-account movements such as Cash on Hand into a real bank account, or customer deposit into sales.
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="From account">
            <select
              value={form.fromAccountId}
              onChange={(event) => setForm((current) => ({ ...current, fromAccountId: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
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
                <option key={account.id} value={account.id}>{account.name}</option>
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
    <ModalShell title="Import Providus statement" onClose={onClose} maxWidth="max-w-4xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Upload the raw CSV or paste the statement text. The system will parse rows, detect duplicates, and create a review queue before anything posts to the ledger.
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Bank account">
            <select
              value={form.bankAccountId}
              onChange={(event) => setForm((current) => ({ ...current, bankAccountId: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
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
                <option key={account.id} value={account.id}>{account.name}</option>
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

function ImportLineRow({ line, onSaved }) {
  const [draft, setDraft] = useState({
    selectedCategory: line.selectedCategory || line.suggestedCategory || '',
    reviewStatus: line.reviewStatus,
    notes: line.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const categories = line.direction === 'OUTFLOW' ? OUTFLOW_CATEGORIES : INFLOW_CATEGORIES;
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
            <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>
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

function createBulkRow(defaultAccountId) {
  return {
    id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
    bankAccountId: defaultAccountId || '',
    direction: 'INFLOW',
    category: INFLOW_CATEGORIES[0],
    transactionDate: todayStr(),
    amount: '',
    description: '',
    reference: '',
  };
}
