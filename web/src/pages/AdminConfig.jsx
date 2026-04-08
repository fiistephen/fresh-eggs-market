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
    crackedCratesAllowance: '',
    writeOffCratesAllowance: '',
    bookingMinimumPaymentPercent: '',
    firstTimeBookingLimitCrates: '',
    firstCustomerOrderLimitCount: '',
    maxBookingCratesPerOrder: '',
    largePosPaymentThreshold: '',
  });
  const [policyHistory, setPolicyHistory] = useState([]);
  const [policySaving, setPolicySaving] = useState(false);
  const [transactionCategories, setTransactionCategories] = useState([]);
  const [transactionCategorySaving, setTransactionCategorySaving] = useState(false);
  const [addingTransactionCategory, setAddingTransactionCategory] = useState(false);
  const [newTransactionCategory, setNewTransactionCategory] = useState({
    label: '',
    direction: 'INFLOW',
    description: '',
  });
  const [customerEggTypes, setCustomerEggTypes] = useState([]);
  const [eggTypeSaving, setEggTypeSaving] = useState(false);

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
        crackedCratesAllowance: response.policy?.crackedCratesAllowance == null ? '' : String(response.policy.crackedCratesAllowance),
        writeOffCratesAllowance: response.policy?.writeOffCratesAllowance == null ? '' : String(response.policy.writeOffCratesAllowance),
        bookingMinimumPaymentPercent: String(response.policy?.bookingMinimumPaymentPercent ?? ''),
        firstTimeBookingLimitCrates: String(response.policy?.firstTimeBookingLimitCrates ?? ''),
        firstCustomerOrderLimitCount: String(response.policy?.firstCustomerOrderLimitCount ?? ''),
        maxBookingCratesPerOrder: String(response.policy?.maxBookingCratesPerOrder ?? ''),
        largePosPaymentThreshold: String(response.policy?.largePosPaymentThreshold ?? ''),
      });
      setPolicyHistory(response.policyHistory || []);
      setTransactionCategories(response.transactionCategories || []);
      setCustomerEggTypes(response.customerEggTypes || []);
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

  async function addTransactionCategory() {
    const label = newTransactionCategory.label.trim();
    if (!label) {
      setError('Enter a category name before adding it.');
      return;
    }

    const category = label
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    if (!category) {
      setError('Category name must contain letters or numbers.');
      return;
    }

    if (transactionCategories.some((entry) => entry.category === category)) {
      setError('That category already exists.');
      return;
    }

    resetNotice();
    setAddingTransactionCategory(true);
    try {
      const response = await api.post('/banking/categories', {
        label,
        direction: newTransactionCategory.direction,
        description: newTransactionCategory.description.trim(),
      });
      setTransactionCategories(response.transactionCategories || []);
      setNewTransactionCategory({
        label: '',
        direction: 'INFLOW',
        description: '',
      });
      setSuccess('Category added and saved globally.');
    } catch (err) {
      setError(err.error || 'Failed to add category');
    } finally {
      setAddingTransactionCategory(false);
    }
  }

  function updateCustomerEggType(key, field, value) {
    setCustomerEggTypes((current) => current.map((entry) => (
      entry.key === key ? { ...entry, [field]: value } : entry
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
        crackedCratesAllowance: policy.crackedCratesAllowance === '' ? null : Number(policy.crackedCratesAllowance),
        writeOffCratesAllowance: policy.writeOffCratesAllowance === '' ? null : Number(policy.writeOffCratesAllowance),
        bookingMinimumPaymentPercent: Number(policy.bookingMinimumPaymentPercent),
        firstTimeBookingLimitCrates: Number(policy.firstTimeBookingLimitCrates),
        firstCustomerOrderLimitCount: Number(policy.firstCustomerOrderLimitCount),
        maxBookingCratesPerOrder: Number(policy.maxBookingCratesPerOrder),
        largePosPaymentThreshold: Number(policy.largePosPaymentThreshold),
      });
      setPolicy({
        targetProfitPerCrate: String(response.policy.targetProfitPerCrate),
        crackAllowancePercent: String(response.policy.crackAllowancePercent),
        crackedCratesAllowance: response.policy?.crackedCratesAllowance == null ? '' : String(response.policy.crackedCratesAllowance),
        writeOffCratesAllowance: response.policy?.writeOffCratesAllowance == null ? '' : String(response.policy.writeOffCratesAllowance),
        bookingMinimumPaymentPercent: String(response.policy.bookingMinimumPaymentPercent),
        firstTimeBookingLimitCrates: String(response.policy.firstTimeBookingLimitCrates),
        firstCustomerOrderLimitCount: String(response.policy.firstCustomerOrderLimitCount),
        maxBookingCratesPerOrder: String(response.policy.maxBookingCratesPerOrder),
        largePosPaymentThreshold: String(response.policy.largePosPaymentThreshold),
      });
      setPolicyHistory(response.policyHistory || []);
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

  async function saveCustomerEggTypes() {
    resetNotice();
    setEggTypeSaving(true);
    try {
      const response = await api.patch('/admin/config/customer-egg-types', {
        customerEggTypes,
      });
      setCustomerEggTypes(response.customerEggTypes || []);
      setSuccess('Customer egg types updated.');
    } catch (err) {
      setError(err.error || 'Failed to update customer egg types');
    } finally {
      setEggTypeSaving(false);
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
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Customer Egg Types</h2>
            <p className="text-sm text-gray-500 mt-1">
              These are the names customers and staff see. Turn off any type you are not selling right now. Large eggs starts off hidden by default.
            </p>
          </div>
          <button
            type="button"
            onClick={saveCustomerEggTypes}
            disabled={eggTypeSaving}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {eggTypeSaving ? 'Saving...' : 'Save egg types'}
          </button>
        </div>

        <div className="space-y-4 mt-5">
          {customerEggTypes.map((entry) => (
            <div key={entry.key} className="rounded-xl border border-gray-200 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-gray-900">{entry.label || entry.key}</p>
                {!entry.isActive ? (
                  <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-500">
                    Hidden from selection
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-gray-400 mt-2">{entry.key}</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                <input
                  type="text"
                  value={entry.label || ''}
                  onChange={(e) => updateCustomerEggType(entry.key, 'label', e.target.value)}
                  placeholder="Display label"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={entry.shortLabel || ''}
                  onChange={(e) => updateCustomerEggType(entry.key, 'shortLabel', e.target.value)}
                  placeholder="Short label"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={Boolean(entry.isActive)}
                    onChange={(e) => updateCustomerEggType(entry.key, 'isActive', e.target.checked)}
                  />
                  Show this egg type when staff create or edit a batch
                </label>
              </div>
            </div>
          ))}
        </div>

      </section>

      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-lg font-semibold text-gray-900">Policy Settings</h2>
        <p className="text-sm text-gray-500 mt-1">
          These rules control how the app behaves. When you save a change, it becomes the rule for new work from that moment onward. Older records keep the earlier policy that applied when they were created.
        </p>

        <form onSubmit={savePolicy} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mt-5">
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

          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">Allowable cracked crates</span>
            <input
              type="number"
              min="0"
              step="1"
              value={policy.crackedCratesAllowance}
              onChange={(e) => setPolicy((current) => ({ ...current, crackedCratesAllowance: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Leave blank if you only want percentage control"
            />
            <span className="block text-xs text-gray-500 mt-1">Optional hard cap for total cracked crates in a batch.</span>
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">Allowable written-off crates</span>
            <input
              type="number"
              min="0"
              step="1"
              value={policy.writeOffCratesAllowance}
              onChange={(e) => setPolicy((current) => ({ ...current, writeOffCratesAllowance: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Leave blank if you do not want a fixed limit"
            />
            <span className="block text-xs text-gray-500 mt-1">Optional hard cap for badly damaged crates written off from a batch.</span>
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">Minimum booking payment (%)</span>
            <input
              type="number"
              min="1"
              max="100"
              step="1"
              value={policy.bookingMinimumPaymentPercent}
              onChange={(e) => setPolicy((current) => ({ ...current, bookingMinimumPaymentPercent: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <span className="block text-xs text-gray-500 mt-1">New bookings must reach this percentage before they can be confirmed.</span>
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">Early-order crate limit</span>
            <input
              type="number"
              min="1"
              step="1"
              value={policy.firstTimeBookingLimitCrates}
              onChange={(e) => setPolicy((current) => ({ ...current, firstTimeBookingLimitCrates: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <span className="block text-xs text-gray-500 mt-1">Each of a customer's first few orders must stay at or below this number of crates.</span>
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">Number of early orders</span>
            <input
              type="number"
              min="1"
              step="1"
              value={policy.firstCustomerOrderLimitCount}
              onChange={(e) => setPolicy((current) => ({ ...current, firstCustomerOrderLimitCount: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <span className="block text-xs text-gray-500 mt-1">Example: enter 3 if the lower crate cap should apply to a customer's first 3 orders.</span>
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">Standard order limit (crates)</span>
            <input
              type="number"
              min="1"
              step="1"
              value={policy.maxBookingCratesPerOrder}
              onChange={(e) => setPolicy((current) => ({ ...current, maxBookingCratesPerOrder: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <span className="block text-xs text-gray-500 mt-1">After the early-order window is used up, every new booking or buy-now order uses this cap.</span>
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">Large POS alert threshold (NGN)</span>
            <input
              type="number"
              min="0"
              step="1000"
              value={policy.largePosPaymentThreshold}
              onChange={(e) => setPolicy((current) => ({ ...current, largePosPaymentThreshold: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <span className="block text-xs text-gray-500 mt-1">Card payments at or above this amount appear in alerts for review.</span>
          </label>

          <div className="md:col-span-2 xl:col-span-4 flex justify-end">
            <button
              type="submit"
              disabled={policySaving}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {policySaving ? 'Saving...' : 'Save policy settings'}
            </button>
          </div>
        </form>

        <div className="mt-6 rounded-xl border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Policy history</h3>
            <p className="mt-1 text-xs text-gray-500">This shows when a policy version started. Older work continues to use the policy that was active when that work began.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px]">
              <thead className="bg-white">
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Effective from</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Profit / crate</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Crack %</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Cracked crates</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Written-off crates</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Min payment</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Early-order cap</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Early orders</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Order cap</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Large POS</th>
                </tr>
              </thead>
              <tbody>
                {policyHistory.map((entry, index) => (
                  <tr key={`${entry.effectiveFrom}-${index}`} className="border-b border-gray-100">
                    <td className="px-4 py-3 text-sm text-gray-800">
                      {new Date(entry.effectiveFrom).toLocaleString('en-NG', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-800">₦{Number(entry.targetProfitPerCrate || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-gray-800">{Number(entry.crackAllowancePercent || 0).toLocaleString()}%</td>
                    <td className="px-4 py-3 text-sm text-gray-800">{entry.crackedCratesAllowance == null ? '—' : Number(entry.crackedCratesAllowance).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-gray-800">{entry.writeOffCratesAllowance == null ? '—' : Number(entry.writeOffCratesAllowance).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-gray-800">{Number(entry.bookingMinimumPaymentPercent || 0).toLocaleString()}%</td>
                    <td className="px-4 py-3 text-sm text-gray-800">{Number(entry.firstTimeBookingLimitCrates || 0).toLocaleString()} crates</td>
                    <td className="px-4 py-3 text-sm text-gray-800">{Number(entry.firstCustomerOrderLimitCount || 0).toLocaleString()} orders</td>
                    <td className="px-4 py-3 text-sm text-gray-800">{Number(entry.maxBookingCratesPerOrder || 0).toLocaleString()} crates</td>
                    <td className="px-4 py-3 text-sm text-gray-800">₦{Number(entry.largePosPaymentThreshold || 0).toLocaleString()}</td>
                  </tr>
                ))}
                {policyHistory.length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-sm text-gray-500" colSpan={10}>No policy history yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
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

        <div className="mt-6 rounded-xl border border-dashed border-gray-300 p-4">
          <h3 className="text-sm font-semibold text-gray-900">Add another category</h3>
          <p className="text-sm text-gray-500 mt-1">
            Add it here to save it globally straight away. After that, you can still edit the label or help text above and save those changes too.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <input
              type="text"
              value={newTransactionCategory.label}
              onChange={(e) => setNewTransactionCategory((current) => ({ ...current, label: e.target.value }))}
              placeholder="Category name"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <select
              value={newTransactionCategory.direction}
              onChange={(e) => setNewTransactionCategory((current) => ({ ...current, direction: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="INFLOW">Money in</option>
              <option value="OUTFLOW">Money out</option>
            </select>
            <input
              type="text"
              value={newTransactionCategory.description}
              onChange={(e) => setNewTransactionCategory((current) => ({ ...current, description: e.target.value }))}
              placeholder="Short help text"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={addTransactionCategory}
              disabled={addingTransactionCategory}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {addingTransactionCategory ? 'Adding...' : 'Add and save globally'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
