import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const ACCOUNT_TYPE_LABELS = {
  CUSTOMER_DEPOSIT: 'Customer Deposit Account',
  SALES: 'Sales Account',
  PROFIT: 'Profit Account',
  CASH_ON_HAND: 'Cash Account',
};

const DEFAULT_NEW_ACCOUNT = {
  name: '',
  accountType: 'CUSTOMER_DEPOSIT',
  lastFour: '',
  bankName: 'Providus Bank',
  isActive: true,
  isVirtual: false,
  supportsStatementImport: true,
  sortOrder: 0,
};

function bankPurpose(accountType) {
  const messages = {
    CUSTOMER_DEPOSIT: 'Use this for customer money that comes in first before allocation or transfer.',
    SALES: 'Use this for separated sales funds after transfer from customer deposits.',
    PROFIT: 'Use this for profit and expense spending after month-end transfer.',
    CASH_ON_HAND: 'Use this virtual account for cash received before it is taken to the bank.',
  };

  return messages[accountType] || 'Use this account for daily banking work.';
}

function accountBadgeTone(accountType) {
  const tones = {
    CUSTOMER_DEPOSIT: 'bg-blue-50 text-blue-700 border-blue-200',
    SALES: 'bg-green-50 text-green-700 border-green-200',
    PROFIT: 'bg-purple-50 text-purple-700 border-purple-200',
    CASH_ON_HAND: 'bg-amber-50 text-amber-700 border-amber-200',
  };

  return tones[accountType] || 'bg-gray-50 text-gray-700 border-gray-200';
}

export default function AdminConfig() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [policy, setPolicy] = useState({
    targetProfitPerCrate: '',
    crackAllowancePercent: '',
  });
  const [policySaving, setPolicySaving] = useState(false);
  const [transactionCategories, setTransactionCategories] = useState([]);
  const [transactionCategorySaving, setTransactionCategorySaving] = useState(false);

  const [accounts, setAccounts] = useState([]);
  const [newAccount, setNewAccount] = useState(DEFAULT_NEW_ACCOUNT);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState('');
  const [accountDrafts, setAccountDrafts] = useState({});
  const [savingAccountId, setSavingAccountId] = useState('');

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/admin/config');
      setPolicy({
        targetProfitPerCrate: String(response.policy?.targetProfitPerCrate ?? ''),
        crackAllowancePercent: String(response.policy?.crackAllowancePercent ?? ''),
      });
      setTransactionCategories(response.transactionCategories || []);
      setAccounts(response.bankAccounts || []);
      setAccountDrafts(buildDrafts(response.bankAccounts || []));
    } catch {
      setError('Failed to load admin settings');
    } finally {
      setLoading(false);
    }
  }

  function buildDrafts(bankAccounts) {
    return bankAccounts.reduce((acc, account) => {
      acc[account.id] = {
        name: account.name,
        lastFour: account.lastFour,
        bankName: account.bankName,
        isActive: account.isActive,
        supportsStatementImport: account.supportsStatementImport,
        sortOrder: account.sortOrder,
      };
      return acc;
    }, {});
  }

  function resetNotice() {
    setError('');
    setSuccess('');
  }

  function updateTransactionCategory(category, field, value) {
    setTransactionCategories((current) => current.map((entry) => (
      entry.category === category ? { ...entry, [field]: value } : entry
    )));
  }

  async function savePolicy(e) {
    e.preventDefault();
    resetNotice();
    setPolicySaving(true);
    try {
      const response = await api.patch('/admin/config/policy', {
        targetProfitPerCrate: Number(policy.targetProfitPerCrate),
        crackAllowancePercent: Number(policy.crackAllowancePercent),
      });
      setPolicy({
        targetProfitPerCrate: String(response.policy.targetProfitPerCrate),
        crackAllowancePercent: String(response.policy.crackAllowancePercent),
      });
      setSuccess('Policy settings updated.');
    } catch (err) {
      setError(err.error || 'Failed to save policy settings');
    } finally {
      setPolicySaving(false);
    }
  }

  async function createBankAccount(e) {
    e.preventDefault();
    resetNotice();
    setCreatingAccount(true);
    try {
      const response = await api.post('/admin/bank-accounts', {
        ...newAccount,
        sortOrder: Number(newAccount.sortOrder),
      });
      const nextAccounts = [...accounts, response.bankAccount].sort((a, b) => a.sortOrder - b.sortOrder);
      setAccounts(nextAccounts);
      setAccountDrafts(buildDrafts(nextAccounts));
      setNewAccount(DEFAULT_NEW_ACCOUNT);
      setSuccess('Bank account added.');
    } catch (err) {
      setError(err.error || 'Failed to create bank account');
    } finally {
      setCreatingAccount(false);
    }
  }

  async function saveTransactionCategories() {
    resetNotice();
    setTransactionCategorySaving(true);
    try {
      const response = await api.patch('/admin/config/transaction-categories', {
        categories: transactionCategories,
      });
      setTransactionCategories(response.transactionCategories || []);
      setSuccess('Transaction categories updated.');
    } catch (err) {
      setError(err.error || 'Failed to update transaction categories');
    } finally {
      setTransactionCategorySaving(false);
    }
  }

  async function saveAccount(accountId) {
    resetNotice();
    setSavingAccountId(accountId);
    try {
      const draft = accountDrafts[accountId];
      const response = await api.patch(`/admin/bank-accounts/${accountId}`, {
        ...draft,
        sortOrder: Number(draft.sortOrder),
      });
      const nextAccounts = accounts.map((account) => (
        account.id === accountId ? response.bankAccount : account
      )).sort((a, b) => a.sortOrder - b.sortOrder);
      setAccounts(nextAccounts);
      setAccountDrafts(buildDrafts(nextAccounts));
      setEditingAccountId('');
      setSuccess('Bank account updated.');
    } catch (err) {
      setError(err.error || 'Failed to update bank account');
    } finally {
      setSavingAccountId('');
    }
  }

  function updateDraft(accountId, field, value) {
    setAccountDrafts((current) => ({
      ...current,
      [accountId]: {
        ...current[accountId],
        [field]: value,
      },
    }));
  }

  if (loading) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="animate-pulse text-lg">Loading admin settings...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Admin</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage the company rules and account setup that the rest of the app depends on.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {success ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>
      ) : null}

      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-lg font-semibold text-gray-900">Policy Settings</h2>
        <p className="text-sm text-gray-500 mt-1">
          These numbers control how batch reports and inventory alerts behave across the app.
        </p>

        <form onSubmit={savePolicy} className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">Target profit per crate (NGN)</span>
            <input
              type="number"
              min="1"
              value={policy.targetProfitPerCrate}
              onChange={(e) => setPolicy((current) => ({ ...current, targetProfitPerCrate: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <span className="block text-xs text-gray-500 mt-1">Batch Summary compares actual profit against this target.</span>
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">Crack allowance (%)</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={policy.crackAllowancePercent}
              onChange={(e) => setPolicy((current) => ({ ...current, crackAllowancePercent: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <span className="block text-xs text-gray-500 mt-1">Inventory and batch pages flag batches above this level.</span>
          </label>

          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={policySaving}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {policySaving ? 'Saving...' : 'Save policy settings'}
            </button>
          </div>
        </form>
      </section>

      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Bank Accounts</h2>
            <p className="text-sm text-gray-500 mt-1">
              Keep the core banking structure clear here. This is where you control active accounts and how they behave.
            </p>
          </div>
        </div>

        <div className="space-y-4 mt-5">
          {accounts.map((account) => {
            const draft = accountDrafts[account.id] || {};
            const editing = editingAccountId === account.id;

            return (
              <div key={account.id} className="rounded-xl border border-gray-200 p-4">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900">{account.name}</p>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${accountBadgeTone(account.accountType)}`}>
                        {ACCOUNT_TYPE_LABELS[account.accountType] || account.accountType}
                      </span>
                      {!account.isActive ? (
                        <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-500">
                          Inactive
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{bankPurpose(account.accountType)}</p>
                    <p className="text-xs text-gray-400 mt-2">
                      {account.lastFour === 'CASH' ? 'Virtual cash ledger' : `${account.bankName} • ••••${account.lastFour}`}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    {!editing ? (
                      <button
                        type="button"
                        onClick={() => setEditingAccountId(account.id)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Edit
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingAccountId('')}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Close
                      </button>
                    )}
                  </div>
                </div>

                {editing ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 mt-4">
                    <input
                      type="text"
                      value={draft.name || ''}
                      onChange={(e) => updateDraft(account.id, 'name', e.target.value)}
                      placeholder="Account name"
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      value={draft.bankName || ''}
                      onChange={(e) => updateDraft(account.id, 'bankName', e.target.value)}
                      placeholder="Bank name"
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      value={draft.lastFour || ''}
                      onChange={(e) => updateDraft(account.id, 'lastFour', e.target.value)}
                      placeholder="Last four"
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      type="number"
                      value={draft.sortOrder ?? 0}
                      onChange={(e) => updateDraft(account.id, 'sortOrder', e.target.value)}
                      placeholder="Sort order"
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                    <div className="flex items-center gap-4 rounded-lg border border-gray-200 px-3 py-2">
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={Boolean(draft.isActive)}
                          onChange={(e) => updateDraft(account.id, 'isActive', e.target.checked)}
                        />
                        Active
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={Boolean(draft.supportsStatementImport)}
                          onChange={(e) => updateDraft(account.id, 'supportsStatementImport', e.target.checked)}
                        />
                        Import
                      </label>
                    </div>

                    <div className="md:col-span-2 xl:col-span-5 flex justify-end">
                      <button
                        type="button"
                        onClick={() => saveAccount(account.id)}
                        disabled={savingAccountId === account.id}
                        className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                      >
                        {savingAccountId === account.id ? 'Saving...' : 'Save bank account'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mt-6 rounded-xl border border-dashed border-gray-300 p-4">
          <h3 className="text-sm font-semibold text-gray-900">Add another bank account</h3>
          <p className="text-sm text-gray-500 mt-1">
            Use this when the business adds a new operating account or a new internal ledger account.
          </p>

          <form onSubmit={createBankAccount} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
            <input
              type="text"
              value={newAccount.name}
              onChange={(e) => setNewAccount((current) => ({ ...current, name: e.target.value }))}
              placeholder="Account name"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <select
              value={newAccount.accountType}
              onChange={(e) => setNewAccount((current) => ({
                ...current,
                accountType: e.target.value,
                isVirtual: e.target.value === 'CASH_ON_HAND',
                supportsStatementImport: e.target.value === 'CASH_ON_HAND' ? false : current.supportsStatementImport,
                lastFour: e.target.value === 'CASH_ON_HAND' ? 'CASH' : current.lastFour,
              }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <input
              type="text"
              value={newAccount.bankName}
              onChange={(e) => setNewAccount((current) => ({ ...current, bankName: e.target.value }))}
              placeholder="Bank name"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="text"
              value={newAccount.lastFour}
              onChange={(e) => setNewAccount((current) => ({ ...current, lastFour: e.target.value }))}
              placeholder="Last four"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="number"
              value={newAccount.sortOrder}
              onChange={(e) => setNewAccount((current) => ({ ...current, sortOrder: e.target.value }))}
              placeholder="Sort order"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <div className="rounded-lg border border-gray-200 px-3 py-2 flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={newAccount.isActive}
                  onChange={(e) => setNewAccount((current) => ({ ...current, isActive: e.target.checked }))}
                />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={newAccount.supportsStatementImport}
                  disabled={newAccount.accountType === 'CASH_ON_HAND'}
                  onChange={(e) => setNewAccount((current) => ({ ...current, supportsStatementImport: e.target.checked }))}
                />
                Import
              </label>
            </div>
            <div className="rounded-lg border border-gray-200 px-3 py-2 flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={newAccount.isVirtual} readOnly />
                Virtual
              </label>
            </div>
            <div className="xl:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={creatingAccount}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {creatingAccount ? 'Adding...' : 'Add bank account'}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Transaction Categories</h2>
            <p className="text-sm text-gray-500 mt-1">
              Keep the banking category names clear for staff. Inactive categories stop showing in banking forms, but old records keep their original category.
            </p>
          </div>
          <button
            type="button"
            onClick={saveTransactionCategories}
            disabled={transactionCategorySaving}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {transactionCategorySaving ? 'Saving...' : 'Save categories'}
          </button>
        </div>

        <div className="space-y-4 mt-5">
          {transactionCategories.map((entry) => (
            <div key={entry.category} className="rounded-xl border border-gray-200 p-4">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-gray-900">{entry.label || entry.category}</p>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
                      entry.direction === 'INFLOW'
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : 'border-red-200 bg-red-50 text-red-700'
                    }`}>
                      {entry.direction === 'INFLOW' ? 'Money in' : 'Money out'}
                    </span>
                    {!entry.isActive ? (
                      <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-500">
                        Hidden from forms
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">{entry.category}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                <input
                  type="text"
                  value={entry.label || ''}
                  onChange={(e) => updateTransactionCategory(entry.category, 'label', e.target.value)}
                  placeholder="Category label"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={Boolean(entry.isActive)}
                    onChange={(e) => updateTransactionCategory(entry.category, 'isActive', e.target.checked)}
                  />
                  Show this category in banking forms
                </label>
                <textarea
                  value={entry.description || ''}
                  onChange={(e) => updateTransactionCategory(entry.category, 'description', e.target.value)}
                  rows="2"
                  placeholder="Short help text for staff"
                  className="md:col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
