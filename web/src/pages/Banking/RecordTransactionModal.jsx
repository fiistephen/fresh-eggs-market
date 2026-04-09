import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { categoryOptionsForDirection, categoryLabel, categoryDescription, displayAccountName, fmtMoney, todayStr } from './shared/constants';
import { ModalShell, Field } from './shared/ui';
import QuickCategoryCreator from './QuickCategoryCreator';

export default function RecordTransactionModal({
  accounts,
  transactionCategories,
  categoryMap,
  onCategoriesChanged,
  onClose,
  onRecorded,
  embedded = false,
}) {
  const defaultDirection = 'INFLOW';
  const defaultCategory = categoryOptionsForDirection(defaultDirection, categoryMap, 'UNALLOCATED_INCOME')[0] || 'UNALLOCATED_INCOME';
  const cashAccount = accounts.find((a) => a.accountType === 'CASH_ON_HAND');
  const defaultAccountId = cashAccount?.id || accounts[0]?.id || '';

  const [form, setForm] = useState({
    bankAccountId: defaultAccountId,
    direction: defaultDirection,
    category: defaultCategory,
    amount: '',
    description: '',
    reference: '',
    transactionDate: todayStr(),
  });
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showCategoryCreator, setShowCategoryCreator] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [savedCount, setSavedCount] = useState(0);
  const [savedTotal, setSavedTotal] = useState(0);
  const [lastSavedMsg, setLastSavedMsg] = useState('');

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
    const preferredCategory = direction === 'INFLOW' ? 'UNALLOCATED_INCOME' : 'UNALLOCATED_EXPENSE';
    const nextCategories = categoryOptionsForDirection(direction, categoryMap, preferredCategory);
    setForm((current) => ({
      ...current,
      direction,
      category: nextCategories.includes(preferredCategory) ? preferredCategory : nextCategories[0] || preferredCategory,
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
      const savedAmt = Number(form.amount);
      setSavedCount((c) => c + 1);
      setSavedTotal((t) => t + savedAmt);
      setLastSavedMsg(`Saved ${fmtMoney(savedAmt)} — ${form.direction === 'INFLOW' ? 'money in' : 'money out'}`);
      setForm((current) => ({
        ...current,
        amount: '',
        description: '',
        reference: '',
      }));
      setSelectedCustomer(null);
      setCustomerSearch('');
      onRecorded(false);
    } catch (err) {
      setError(err.error || 'Failed to record transaction');
    } finally {
      setSubmitting(false);
    }
  }

  function handleDone() {
    if (savedCount > 0) onRecorded(true);
    else onClose();
  }

  const content = (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="rounded-lg border border-error-100 bg-error-50 px-3 py-2 text-body text-error-700">{error}</div>}

      {lastSavedMsg && (
        <div className="rounded-lg border border-success-100 bg-success-50 px-4 py-3 text-body text-success-700">
          {lastSavedMsg}
        </div>
      )}

      {savedCount > 0 && (
        <div className="rounded-lg border border-surface-200 bg-surface-50 px-4 py-3 text-body text-surface-700">
          {savedCount} {savedCount === 1 ? 'entry' : 'entries'} saved this session · {fmtMoney(savedTotal)} total
        </div>
      )}

      <div>
        <label className="mb-2 block text-body-medium text-surface-700">What happened?</label>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setDirection('INFLOW')} className={`rounded-md px-3 py-2.5 text-body-medium transition-colors duration-fast ${form.direction === 'INFLOW' ? 'bg-success-700 text-surface-0 shadow-sm' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}`}>Money received</button>
          <button type="button" onClick={() => setDirection('OUTFLOW')} className={`rounded-md px-3 py-2.5 text-body-medium transition-colors duration-fast ${form.direction === 'OUTFLOW' ? 'bg-error-700 text-surface-0 shadow-sm' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}`}>Money spent</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Account">
          <select
            value={form.bankAccountId}
            onChange={(event) => setForm((current) => ({ ...current, bankAccountId: event.target.value }))}
            className="w-full rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500"
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
            className="w-full rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500"
            required
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Category">
          <select
            value={form.category}
            onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
            className="w-full rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500"
          >
            {categoryOptions.map((category) => (
              <option key={category} value={category}>{categoryLabel(category, categoryMap)}</option>
            ))}
          </select>
          <p className="mt-1 text-caption text-surface-500">{categoryDescription(form.category, categoryMap) || 'Choose the clearest category for this entry.'}</p>
          <button
            type="button"
            onClick={() => setShowCategoryCreator((current) => !current)}
            className="mt-2 text-caption-medium font-medium text-brand-600 hover:text-brand-700"
          >
            {showCategoryCreator ? 'Close new category' : 'Add new category'}
          </button>
        </Field>
        <Field label="Amount (₦)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.amount}
            onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
            className="w-full rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500"
            required
            autoFocus={!embedded}
          />
        </Field>
      </div>

      {showCategoryCreator && (
        <QuickCategoryCreator
          transactionCategories={transactionCategories}
          direction={form.direction}
          onCreated={async (createdCategory) => {
            await onCategoriesChanged();
            setForm((current) => ({ ...current, category: createdCategory.category }));
            setShowCategoryCreator(false);
          }}
        />
      )}

      {form.category === 'CUSTOMER_BOOKING' && (
        <div className="rounded-lg border border-info-100 bg-info-50 px-4 py-3 text-body text-info-700">
          Save the money here first. After saving, go to <span className="font-semibold">Bookings Queue</span> to link the customer, choose the batch, and allocate the payment.
        </div>
      )}

      {needsCustomer && (
        <div className="space-y-2">
          <label className="block text-body-medium text-surface-700">Customer</label>
          {selectedCustomer ? (
            <div className="flex items-center justify-between rounded-md border border-surface-200 bg-surface-50 px-3 py-2 text-body">
              <span className="font-medium text-surface-800">{selectedCustomer.name}</span>
              <button type="button" onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); }} className="text-surface-500 hover:text-surface-700">Change</button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={customerSearch}
                onChange={(event) => setCustomerSearch(event.target.value)}
                placeholder="Search customer by name or phone"
                className="w-full rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500"
              />
              {customers.length > 0 && (
                <div className="max-h-40 custom-scrollbar overflow-y-auto rounded-md border border-surface-200">
                  {customers.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => { setSelectedCustomer(customer); setCustomers([]); }}
                      className="block w-full border-b border-surface-100 px-3 py-2 text-left text-body hover:bg-surface-50 last:border-b-0"
                    >
                      <span className="font-medium text-surface-900">{customer.name}</span>
                      <span className="ml-2 text-surface-500">{customer.phone}</span>
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
            placeholder="e.g. First Bank – Adebayo Oluwaseun"
            className="w-full rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500"
          />
        </Field>
        <Field label="Reference">
          <input
            type="text"
            value={form.reference}
            onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))}
            className="w-full rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500"
          />
        </Field>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-surface-200 pt-4 sm:flex-row sm:justify-end">
        <button type="button" onClick={handleDone} className="rounded-md px-4 py-2 text-body-medium text-surface-600 transition-colors duration-fast hover:bg-surface-100">
          Done
        </button>
        <button type="submit" disabled={submitting} className="rounded-md bg-brand-500 px-4 py-2 text-body-medium text-surface-900 transition-colors duration-fast hover:bg-brand-400 disabled:cursor-not-allowed disabled:bg-surface-300">
          {submitting ? 'Saving…' : 'Save and add next'}
        </button>
      </div>
    </form>
  );

  if (embedded) return content;

  return (
    <ModalShell title="Record transaction" onClose={handleDone}>
      {content}
    </ModalShell>
  );
}
