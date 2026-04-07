import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

function formatCurrency(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(n);
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Customers() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [error, setError] = useState('');

  const canCreate = ['ADMIN', 'MANAGER', 'SHOP_FLOOR'].includes(user?.role);
  const canEdit = ['ADMIN', 'MANAGER'].includes(user?.role);

  useEffect(() => {
    const timer = setTimeout(() => loadCustomers(), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search]);

  async function loadCustomers() {
    setLoading(true);
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const data = await api.get(`/customers${params}`);
      setCustomers(data.customers);
      setTotal(data.total);
    } catch (err) {
      setError('Failed to load customers');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-sm text-gray-500 mt-1">{total} customers in the database</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 w-fit"
          >
            <span className="text-lg leading-none">+</span> New Customer
          </button>
        )}
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by name, phone, or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-md border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
        />
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>
      )}

      {/* Customer list */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading customers...</div>
      ) : customers.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">👥</div>
          <p className="text-gray-500">{search ? 'No customers match your search' : 'No customers yet'}</p>
          {canCreate && !search && (
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 text-brand-500 hover:text-brand-600 text-sm font-medium"
            >
              Add your first customer
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Bookings</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Sales</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
                </tr>
              </thead>
              <tbody>
                {customers.map(c => (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedCustomer(c.id)}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4">
                      <span className="font-semibold text-gray-900">{c.name}</span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">{c.phone}</td>
                    <td className="py-3 px-4 text-sm text-gray-500">{c.email || '—'}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        c.isFirstTime ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {c.isFirstTime ? 'New' : 'Returning'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500 text-center">{c._count?.bookings || 0}</td>
                    <td className="py-3 px-4 text-sm text-gray-500 text-center">{c._count?.sales || 0}</td>
                    <td className="py-3 px-4 text-sm text-gray-500">{formatDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create customer modal */}
      {showCreate && (
        <CreateCustomerModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadCustomers(); }}
        />
      )}

      {/* Customer detail modal */}
      {selectedCustomer && (
        <CustomerDetailModal
          customerId={selectedCustomer}
          canEdit={canEdit}
          onClose={() => setSelectedCustomer(null)}
          onUpdated={loadCustomers}
        />
      )}
    </div>
  );
}

// ─── CREATE CUSTOMER MODAL ────────────────────────────────────

function CreateCustomerModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post('/customers', {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      onCreated();
    } catch (err) {
      setError(err.error || 'Failed to create customer');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">New Customer</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              required
              placeholder="Customer name"
              value={form.name}
              onChange={e => update('name', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
            <input
              type="tel"
              required
              placeholder="+234..."
              value={form.phone}
              onChange={e => update('phone', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              placeholder="Optional"
              value={form.email}
              onChange={e => update('email', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              placeholder="Any notes about this customer..."
              rows={2}
              value={form.notes}
              onChange={e => update('notes', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-none"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {submitting ? 'Creating...' : 'Create Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── CUSTOMER DETAIL MODAL ────────────────────────────────────

function CustomerDetailModal({ customerId, canEdit, onClose, onUpdated }) {
  const [customer, setCustomer] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadCustomer(); }, [customerId]);

  async function loadCustomer() {
    setLoading(true);
    try {
      const data = await api.get(`/customers/${customerId}`);
      setCustomer(data.customer);
      setStats(data.stats);
      setEditForm({ name: data.customer.name, phone: data.customer.phone, email: data.customer.email || '', notes: data.customer.notes || '' });
    } catch {
      setError('Failed to load customer');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await api.patch(`/customers/${customerId}`, {
        name: editForm.name.trim(),
        phone: editForm.phone.trim(),
        email: editForm.email.trim() || null,
        notes: editForm.notes.trim() || null,
      });
      setEditing(false);
      loadCustomer();
      onUpdated();
    } catch (err) {
      setError(err.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const BOOKING_STATUS = {
    CONFIRMED: 'bg-green-100 text-green-700',
    PICKED_UP: 'bg-blue-100 text-blue-700',
    CANCELLED: 'bg-red-100 text-red-700',
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : !customer ? (
          <div className="p-8 text-center text-red-500">{error || 'Customer not found'}</div>
        ) : (
          <>
            <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                {editing ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-lg font-semibold focus:ring-2 focus:ring-brand-500 outline-none"
                    />
                    <div className="flex gap-2">
                      <input
                        type="tel"
                        value={editForm.phone}
                        onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="Phone"
                        className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                      />
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                        placeholder="Email"
                        className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                      />
                    </div>
                    <textarea
                      value={editForm.notes}
                      onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Notes"
                      rows={2}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-brand-500 outline-none resize-none"
                    />
                  </div>
                ) : (
                  <>
                    <h2 className="text-lg font-semibold text-gray-900">{customer.name}</h2>
                    <p className="text-sm text-gray-500 mt-0.5">{customer.phone}{customer.email && ` · ${customer.email}`}</p>
                    {customer.notes && <p className="text-sm text-gray-400 mt-1 italic">{customer.notes}</p>}
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  customer.isFirstTime ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                }`}>
                  {customer.isFirstTime ? 'New' : 'Returning'}
                </span>
                {canEdit && !editing && (
                  <button onClick={() => setEditing(true)} className="text-brand-500 hover:text-brand-600 text-sm font-medium">
                    Edit
                  </button>
                )}
                {editing && (
                  <div className="flex gap-1">
                    <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600 text-sm">Cancel</button>
                    <button onClick={handleSave} disabled={saving} className="text-brand-500 hover:text-brand-600 text-sm font-medium">
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="mx-4 sm:mx-6 mt-4 bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm">{error}</div>
            )}

            {/* Stats */}
            {stats && (
              <div className="px-4 sm:px-6 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400 uppercase">Total Bookings</p>
                  <p className="text-lg font-bold text-gray-900">{stats.totalBookings}</p>
                  <p className="text-xs text-gray-400">{stats.totalBookedCrates.toLocaleString()} crates</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400 uppercase">Total Purchases</p>
                  <p className="text-lg font-bold text-gray-900">{stats.totalSales}</p>
                  <p className="text-xs text-gray-400">{stats.totalPurchasedCrates.toLocaleString()} crates</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400 uppercase">Total Spent</p>
                  <p className="text-lg font-bold text-green-600">{formatCurrency(stats.totalSpent)}</p>
                </div>
              </div>
            )}

            {/* Recent bookings */}
            {customer.bookings?.length > 0 && (
              <div className="px-4 sm:px-6 pb-4">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Recent Bookings</h3>
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
                  <table className="w-full min-w-[500px]">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 px-3 text-xs text-gray-500">Batch</th>
                        <th className="text-right py-2 px-3 text-xs text-gray-500">Qty</th>
                        <th className="text-right py-2 px-3 text-xs text-gray-500">Paid</th>
                        <th className="text-center py-2 px-3 text-xs text-gray-500">Status</th>
                        <th className="text-left py-2 px-3 text-xs text-gray-500">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customer.bookings.map(b => (
                        <tr key={b.id} className="border-b border-gray-50 text-sm">
                          <td className="py-2 px-3 font-medium">{b.batch?.name || '—'}</td>
                          <td className="py-2 px-3 text-right">{b.quantity}</td>
                          <td className="py-2 px-3 text-right">{formatCurrency(b.amountPaid)}</td>
                          <td className="py-2 px-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${BOOKING_STATUS[b.status]}`}>
                              {b.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-gray-500">{formatDate(b.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Recent sales */}
            {customer.sales?.length > 0 && (
              <div className="px-4 sm:px-6 pb-4">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Recent Sales</h3>
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
                  <table className="w-full min-w-[500px]">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 px-3 text-xs text-gray-500">Receipt</th>
                        <th className="text-left py-2 px-3 text-xs text-gray-500">Batch</th>
                        <th className="text-right py-2 px-3 text-xs text-gray-500">Qty</th>
                        <th className="text-right py-2 px-3 text-xs text-gray-500">Amount</th>
                        <th className="text-left py-2 px-3 text-xs text-gray-500">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customer.sales.map(s => (
                        <tr key={s.id} className="border-b border-gray-50 text-sm">
                          <td className="py-2 px-3 font-mono text-gray-600">{s.receiptNumber}</td>
                          <td className="py-2 px-3 font-medium">{s.batch?.name || '—'}</td>
                          <td className="py-2 px-3 text-right">{s.totalQuantity}</td>
                          <td className="py-2 px-3 text-right font-medium">{formatCurrency(s.totalAmount)}</td>
                          <td className="py-2 px-3 text-gray-500">{formatDate(s.saleDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="px-4 sm:px-6 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
