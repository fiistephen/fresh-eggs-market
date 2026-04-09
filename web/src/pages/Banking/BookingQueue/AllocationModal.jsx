import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { fmtMoney, fmtDate } from '../shared/constants';
import { ModalShell, StatPill, StatusChip } from '../shared/ui';

function createAllocationRow(defaultBatchId = '') {
  return {
    id: globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2),
    batchId: defaultBatchId,
    quantity: '',
    allocatedAmount: '',
    notes: '',
  };
}

export default function AllocationModal({ transaction, openBatches, policy, onClose, onSaved }) {
  const [selectedCustomer, setSelectedCustomer] = useState(transaction.customer || null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [customerMode, setCustomerMode] = useState(transaction.customer ? 'linked' : 'existing');
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '', notes: '' });
  const [allocationRows, setAllocationRows] = useState([createAllocationRow()]);
  const [existingBookings, setExistingBookings] = useState([]);
  const [loadingExistingBookings, setLoadingExistingBookings] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [savingBookings, setSavingBookings] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!customerSearch.trim() || selectedCustomer || customerMode !== 'existing') { setCustomers([]); return; }
    const timer = setTimeout(async () => {
      try { const r = await api.get(`/customers?search=${encodeURIComponent(customerSearch)}`); setCustomers(r.customers || []); } catch { setCustomers([]); }
    }, 250);
    return () => clearTimeout(timer);
  }, [customerSearch, selectedCustomer, customerMode]);

  useEffect(() => {
    if (!selectedCustomer?.id) { setExistingBookings([]); return; }
    let cancelled = false;
    setLoadingExistingBookings(true);
    api.get(`/bookings?customerId=${selectedCustomer.id}&status=CONFIRMED`)
      .then((r) => { if (!cancelled) setExistingBookings(r.bookings || []); })
      .catch(() => { if (!cancelled) setExistingBookings([]); })
      .finally(() => { if (!cancelled) setLoadingExistingBookings(false); });
    return () => { cancelled = true; };
  }, [selectedCustomer?.id]);

  const activeRows = allocationRows.filter((r) => r.batchId || r.quantity || r.allocatedAmount || r.notes);
  const totalPlannedAllocation = activeRows.reduce((s, r) => s + Number(r.allocatedAmount || 0), 0);
  const remainingMoney = Math.max(0, Number(transaction.availableAmount) - totalPlannedAllocation);
  const minPayPct = Number(policy?.bookingMinimumPaymentPercent || 80);

  function updateRow(rowId, patch) { setAllocationRows((c) => c.map((r) => r.id === rowId ? { ...r, ...patch } : r)); }
  function addRow() { setAllocationRows((c) => [...c, createAllocationRow()]); }
  function removeRow(rowId) { setAllocationRows((c) => c.filter((r) => r.id !== rowId)); }

  async function linkExistingCustomer(customerId) {
    setSavingCustomer(true); setError('');
    try {
      const result = await api.patch(`/banking/customer-bookings/${transaction.id}/customer`, { customerId });
      setSelectedCustomer(result.transaction.customer); setCustomerMode('linked'); setCustomerSearch(''); setCustomers([]);
    } catch (err) { setError(err.error || 'Failed to link customer'); } finally { setSavingCustomer(false); }
  }

  async function createCustomer() {
    setSavingCustomer(true); setError('');
    try {
      const result = await api.post(`/banking/customer-bookings/${transaction.id}/customer`, newCustomer);
      setSelectedCustomer(result.customer); setCustomerMode('linked'); setNewCustomer({ name: '', phone: '', email: '', notes: '' });
    } catch (err) { setError(err.error || 'Failed to create customer'); } finally { setSavingCustomer(false); }
  }

  async function saveBookings() {
    setSavingBookings(true); setError('');
    try {
      await api.post(`/banking/customer-bookings/${transaction.id}/bookings`, {
        bookings: activeRows.map((r) => ({ batchId: r.batchId, quantity: Number(r.quantity), allocatedAmount: Number(r.allocatedAmount), notes: r.notes || undefined })),
      });
      onSaved();
    } catch (err) { setError(err.error || 'Failed to create bookings from this money'); } finally { setSavingBookings(false); }
  }

  return (
    <ModalShell title="Customer booking allocation" onClose={onClose} maxWidth="max-w-6xl">
      <div className="space-y-5">
        {error && <div className="rounded-lg border border-error-100 bg-error-50 px-4 py-3 text-body text-error-700">{error}</div>}

        {/* Money summary bar */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <StatPill label="Money received" value={fmtMoney(transaction.amount)} />
          <StatPill label="Already allocated" value={fmtMoney(transaction.allocatedAmount)} />
          <StatPill label="Planned now" value={fmtMoney(totalPlannedAllocation)} />
          <StatPill label="Left after this" value={fmtMoney(remainingMoney)} danger={remainingMoney > 0.009} />
        </div>

        {/* Visual money bar */}
        {Number(transaction.amount) > 0 && (
          <div className="rounded-lg border border-surface-200 bg-surface-50 p-3">
            <div className="flex h-4 overflow-hidden rounded-full bg-surface-200">
              {Number(transaction.allocatedAmount) > 0 && (
                <div className="bg-success-500" style={{ width: `${Math.min(100, (Number(transaction.allocatedAmount) / Number(transaction.amount)) * 100)}%` }} />
              )}
              {totalPlannedAllocation > 0 && (
                <div className="bg-info-500" style={{ width: `${Math.min(100 - (Number(transaction.allocatedAmount) / Number(transaction.amount)) * 100, (totalPlannedAllocation / Number(transaction.amount)) * 100)}%` }} />
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-caption text-surface-600">
              <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-success-500" /> Already allocated</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-info-500" /> Allocating now</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-surface-200" /> Remaining</span>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-info-100 bg-info-50 px-4 py-3 text-body text-info-700">
          Turn this customer booking payment into one or more real batch bookings. Choose the batch, enter the number of crates, and enter how much of this money belongs to that batch.
        </div>

        {/* Customer section */}
        {!selectedCustomer ? (
          <div className="rounded-lg border border-surface-200 p-5 space-y-4">
            <div className="flex gap-2">
              <button type="button" onClick={() => setCustomerMode('existing')} className={`rounded-md px-3 py-2 text-body-medium font-medium transition-colors duration-fast ${customerMode === 'existing' ? 'bg-brand-500 text-surface-0' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}`}>Link existing customer</button>
              <button type="button" onClick={() => setCustomerMode('new')} className={`rounded-md px-3 py-2 text-body-medium font-medium transition-colors duration-fast ${customerMode === 'new' ? 'bg-brand-500 text-surface-0' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}`}>Create new customer</button>
            </div>

            {customerMode === 'existing' ? (
              <div className="space-y-3">
                <input type="text" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Search customer by name or phone" className="w-full rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500" />
                {customers.length > 0 && (
                  <div className="max-h-48 custom-scrollbar overflow-y-auto rounded-lg border border-surface-200">
                    {customers.map((c) => (
                      <button key={c.id} type="button" onClick={() => linkExistingCustomer(c.id)} className="block w-full border-b border-surface-100 px-4 py-3 text-left text-body hover:bg-surface-50 last:border-b-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-surface-900">{c.name}</span>
                          {(c._count?.bookings || 0) > 0 && <span className="rounded-full bg-warning-100 px-2 py-1 text-caption-medium font-medium text-warning-700">{c._count.bookings} booking{c._count.bookings === 1 ? '' : 's'}</span>}
                        </div>
                        <div className="text-surface-500">{c.phone}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input type="text" value={newCustomer.name} onChange={(e) => setNewCustomer((c) => ({ ...c, name: e.target.value }))} placeholder="Full name" className="rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500" />
                <input type="text" value={newCustomer.phone} onChange={(e) => setNewCustomer((c) => ({ ...c, phone: e.target.value }))} placeholder="Phone number" className="rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500" />
                <input type="email" value={newCustomer.email} onChange={(e) => setNewCustomer((c) => ({ ...c, email: e.target.value }))} placeholder="Email (optional)" className="rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500" />
                <input type="text" value={newCustomer.notes} onChange={(e) => setNewCustomer((c) => ({ ...c, notes: e.target.value }))} placeholder="Notes (optional)" className="rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500" />
                <div className="md:col-span-2 flex justify-end">
                  <button type="button" onClick={createCustomer} disabled={savingCustomer} className="rounded-md bg-brand-600 px-4 py-2 text-body-medium font-medium text-surface-0 transition-colors duration-fast hover:bg-brand-700 disabled:bg-surface-300">
                    {savingCustomer ? 'Creating…' : 'Create and link customer'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-success-100 bg-success-50 px-4 py-3 text-body text-success-700">
              Customer linked: <span className="font-semibold">{selectedCustomer.name}</span> {selectedCustomer.phone ? `· ${selectedCustomer.phone}` : ''}
            </div>

            {loadingExistingBookings ? (
              <p className="text-body text-surface-500">Checking existing bookings…</p>
            ) : existingBookings.length > 0 && (
              <div className="rounded-lg border border-warning-100 bg-warning-50 p-4">
                <p className="text-body-medium font-semibold text-warning-700">This customer already has {existingBookings.length} confirmed booking{existingBookings.length === 1 ? '' : 's'}</p>
                <div className="mt-3 space-y-2">
                  {existingBookings.slice(0, 5).map((b) => (
                    <div key={b.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-body">
                      <p className="font-medium text-surface-900">{b.batch?.name || 'Batch'}{b.batch?.expectedDate ? ` · expected ${fmtDate(b.batch.expectedDate)}` : ''}</p>
                      <div className="flex gap-2">
                        <StatPill label="Crates" value={b.quantity} />
                        <StatPill label="Paid" value={fmtMoney(b.amountPaid)} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Allocation rows */}
        {selectedCustomer && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-heading text-surface-900">Batch allocations</h3>
                <p className="text-body text-surface-500">Split the money across one or more open batches. The app checks the {minPayPct}% minimum for each booking.</p>
              </div>
              <button type="button" onClick={addRow} className="rounded-md border border-surface-200 px-3 py-2 text-body-medium font-medium text-surface-700 transition-colors duration-fast hover:bg-surface-50">Add batch</button>
            </div>

            <div className="space-y-3">
              {allocationRows.map((row) => {
                const batch = openBatches.find((b) => b.id === row.batchId);
                const qty = Number(row.quantity || 0);
                const amt = Number(row.allocatedAmount || 0);
                const bookingValue = batch ? qty * Number(batch.wholesalePrice) : 0;
                const minPay = bookingValue * (minPayPct / 100);
                const paidPct = bookingValue > 0 ? (amt / bookingValue) * 100 : 0;

                return (
                  <div key={row.id} className="rounded-lg border border-surface-200 p-4">
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.3fr_0.7fr_0.8fr_auto]">
                      <select value={row.batchId} onChange={(e) => updateRow(row.id, { batchId: e.target.value })} className="rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500">
                        <option value="">Choose open batch</option>
                        {openBatches.map((b) => <option key={b.id} value={b.id}>{b.name} · {b.eggTypeLabel} · {b.remainingAvailable} left</option>)}
                      </select>
                      <input type="number" min="1" value={row.quantity} onChange={(e) => updateRow(row.id, { quantity: e.target.value })} placeholder="Crates" className="rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500" />
                      <input type="number" min="0" step="0.01" value={row.allocatedAmount} onChange={(e) => updateRow(row.id, { allocatedAmount: e.target.value })} placeholder="Amount for this batch" className="rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500" />
                      <button type="button" onClick={() => removeRow(row.id)} className="rounded-md border border-error-100 px-3 py-2 text-body-medium font-medium text-error-700 transition-colors duration-fast hover:bg-error-50">Remove</button>
                    </div>
                    <input type="text" value={row.notes} onChange={(e) => updateRow(row.id, { notes: e.target.value })} placeholder="Optional note" className="mt-3 w-full rounded-md border border-surface-200 px-3 py-2 text-body outline-none focus:ring-2 focus:ring-brand-500" />
                    <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-6">
                      <StatPill label="Batch" value={batch?.name || '—'} />
                      <StatPill label="Crates" value={qty || 0} />
                      <StatPill label="Price/crate" value={batch ? fmtMoney(batch.wholesalePrice) : '—'} />
                      <StatPill label="Booking value" value={fmtMoney(bookingValue)} />
                      <StatPill label="Paid %" value={`${paidPct.toFixed(1)}%`} danger={bookingValue > 0 && paidPct < minPayPct} />
                      <StatPill label={`${minPayPct}% minimum`} value={fmtMoney(minPay)} danger={bookingValue > 0 && amt + 0.009 < minPay} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-surface-200 pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-body-medium font-medium text-surface-600 transition-colors duration-fast hover:bg-surface-100">Close</button>
              <button type="button" onClick={saveBookings} disabled={savingBookings || activeRows.length === 0} className="rounded-md bg-brand-600 px-4 py-2 text-body-medium font-medium text-surface-0 transition-colors duration-fast hover:bg-brand-700 disabled:bg-surface-300">
                {savingBookings ? 'Saving…' : 'Create batch bookings'}
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
