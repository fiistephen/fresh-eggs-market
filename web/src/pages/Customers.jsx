import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Button, Input, Modal, Card, Badge, EmptyState, Textarea } from '../components/ui';

// SVG Icons
const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const UsersIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const EditIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const AlertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="10" />
  </svg>
);

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
          <h1 className="text-display text-surface-900">Customers</h1>
          <p className="text-body text-surface-500 mt-1">{total} customers in the database</p>
        </div>
        {canCreate && (
          <Button
            variant="primary"
            size="md"
            icon={<PlusIcon />}
            onClick={() => setShowCreate(true)}
          >
            New Customer
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="mb-6">
        <Input
          type="text"
          placeholder="Search by name, phone, or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          containerClassName="max-w-md"
        />
      </div>

      {error && (
        <div className="bg-error-50 text-error-600 px-4 py-3 rounded-lg mb-4 text-body mb-6">
          {error}
        </div>
      )}

      {/* Customer list */}
      {loading ? (
        <Card className="text-center py-12">
          <p className="text-body text-surface-500">Loading customers...</p>
        </Card>
      ) : customers.length === 0 ? (
        <EmptyState
          icon={<UsersIcon />}
          title={search ? 'No customers found' : 'No customers yet'}
          description={search ? 'Try adjusting your search' : 'Customers will appear here once you add them'}
          action={canCreate && !search ? () => setShowCreate(true) : undefined}
          actionLabel={canCreate && !search ? 'Add your first customer' : undefined}
        />
      ) : (
        <Card variant="outlined" padding="none">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  <th className="text-overline text-surface-500 text-left py-3 px-4 uppercase tracking-wider">Name</th>
                  <th className="text-overline text-surface-500 text-left py-3 px-4 uppercase tracking-wider">Phone</th>
                  <th className="text-overline text-surface-500 text-left py-3 px-4 uppercase tracking-wider">Email</th>
                  <th className="text-overline text-surface-500 text-center py-3 px-4 uppercase tracking-wider">Type</th>
                  <th className="text-overline text-surface-500 text-center py-3 px-4 uppercase tracking-wider">Bookings</th>
                  <th className="text-overline text-surface-500 text-center py-3 px-4 uppercase tracking-wider">Sales</th>
                  <th className="text-overline text-surface-500 text-left py-3 px-4 uppercase tracking-wider">Joined</th>
                </tr>
              </thead>
              <tbody>
                {customers.map(c => (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedCustomer(c.id)}
                    className="border-b border-surface-100 hover:bg-surface-50 cursor-pointer transition-colors duration-fast"
                  >
                    <td className="py-3 px-4">
                      <span className="text-body-medium text-surface-900 font-medium">{c.name}</span>
                    </td>
                    <td className="py-3 px-4 text-body text-surface-600">{c.phone}</td>
                    <td className="py-3 px-4 text-body text-surface-500">{c.email || '—'}</td>
                    <td className="py-3 px-4 text-center">
                      <Badge status={c.isFirstTime ? 'PENDING' : 'COMPLETED'}>
                        {c.isFirstTime ? 'New' : 'Returning'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-body text-surface-500 text-center">{c._count?.bookings || 0}</td>
                    <td className="py-3 px-4 text-body text-surface-500 text-center">{c._count?.sales || 0}</td>
                    <td className="py-3 px-4 text-body text-surface-500">{formatDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Create customer modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="New Customer"
        size="md"
      >
        <CreateCustomerModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadCustomers(); }}
        />
      </Modal>

      {/* Customer detail modal */}
      <Modal
        open={!!selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
        size="lg"
      >
        {selectedCustomer && (
          <CustomerDetailModal
            customerId={selectedCustomer}
            canEdit={canEdit}
            onClose={() => setSelectedCustomer(null)}
            onUpdated={loadCustomers}
          />
        )}
      </Modal>
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
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-error-50 text-error-600 px-3 py-2 rounded-lg text-body">
          {error}
        </div>
      )}

      <Input
        label="Name"
        required
        placeholder="Customer name"
        value={form.name}
        onChange={e => update('name', e.target.value)}
      />

      <Input
        label="Phone"
        type="tel"
        required
        placeholder="+234..."
        value={form.phone}
        onChange={e => update('phone', e.target.value)}
      />

      <Input
        label="Email"
        type="email"
        placeholder="Optional"
        value={form.email}
        onChange={e => update('email', e.target.value)}
      />

      <Textarea
        label="Notes"
        placeholder="Any notes about this customer..."
        value={form.notes}
        onChange={e => update('notes', e.target.value)}
      />

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={submitting}
        >
          {submitting ? 'Creating...' : 'Create Customer'}
        </Button>
      </div>
    </form>
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

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="text-center py-8 text-surface-400">Loading...</div>
      ) : !customer ? (
        <div className="text-center py-8 text-error-600">{error || 'Customer not found'}</div>
      ) : (
        <>
          {/* Header with name and edit button */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex-1">
              {editing ? (
                <div className="space-y-3">
                  <Input
                    value={editForm.name}
                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    containerClassName="mb-0"
                  />
                  <div className="flex gap-2">
                    <Input
                      type="tel"
                      value={editForm.phone}
                      onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                      placeholder="Phone"
                      containerClassName="mb-0 flex-1"
                    />
                    <Input
                      type="email"
                      value={editForm.email}
                      onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="Email"
                      containerClassName="mb-0 flex-1"
                    />
                  </div>
                  <Textarea
                    value={editForm.notes}
                    onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Notes"
                  />
                </div>
              ) : (
                <>
                  <h2 className="text-title text-surface-900">{customer.name}</h2>
                  <p className="text-body text-surface-500 mt-1">
                    {customer.phone}
                    {customer.email && ` · ${customer.email}`}
                  </p>
                  {customer.notes && <p className="text-body text-surface-600 mt-2 italic">{customer.notes}</p>}
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Badge status={customer.isFirstTime ? 'PENDING' : 'COMPLETED'}>
                {customer.isFirstTime ? 'New' : 'Returning'}
              </Badge>

              {canEdit && !editing && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<EditIcon />}
                  onClick={() => setEditing(true)}
                >
                  Edit
                </Button>
              )}

              {editing && (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={saving}
                    onClick={handleSave}
                  >
                    Save
                  </Button>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-error-50 text-error-600 px-3 py-2 rounded-lg text-body">
              {error}
            </div>
          )}

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card tint="bg-brand-50">
                <p className="text-overline text-surface-500">Total Bookings</p>
                <p className="text-metric text-brand-700 mt-1">{stats.totalBookings}</p>
                <p className="text-caption text-surface-500 mt-0.5">{stats.totalBookedCrates.toLocaleString()} crates</p>
              </Card>
              <Card tint="bg-success-50">
                <p className="text-overline text-surface-500">Total Purchases</p>
                <p className="text-metric text-success-700 mt-1">{stats.totalSales}</p>
                <p className="text-caption text-surface-500 mt-0.5">{stats.totalPurchasedCrates.toLocaleString()} crates</p>
              </Card>
              <Card tint="bg-info-50">
                <p className="text-overline text-surface-500">Total Spent</p>
                <p className="text-metric text-info-700 mt-1">{formatCurrency(stats.totalSpent)}</p>
              </Card>
            </div>
          )}

          {/* Recent bookings */}
          {customer.bookings?.length > 0 && (
            <div>
              <h3 className="text-heading text-surface-800 mb-3">Recent Bookings</h3>
              <Card variant="outlined" padding="none">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full min-w-[500px]">
                    <thead>
                      <tr className="border-b border-surface-200 bg-surface-50">
                        <th className="text-overline text-surface-500 text-left py-2 px-3 uppercase tracking-wider">Batch</th>
                        <th className="text-overline text-surface-500 text-right py-2 px-3 uppercase tracking-wider">Qty</th>
                        <th className="text-overline text-surface-500 text-right py-2 px-3 uppercase tracking-wider">Paid</th>
                        <th className="text-overline text-surface-500 text-center py-2 px-3 uppercase tracking-wider">Status</th>
                        <th className="text-overline text-surface-500 text-left py-2 px-3 uppercase tracking-wider">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customer.bookings.map(b => (
                        <tr key={b.id} className="border-b border-surface-100 text-body">
                          <td className="py-2 px-3 text-body-medium text-surface-900">{b.batch?.name || '—'}</td>
                          <td className="py-2 px-3 text-right text-surface-700">{b.quantity}</td>
                          <td className="py-2 px-3 text-right text-surface-700">{formatCurrency(b.amountPaid)}</td>
                          <td className="py-2 px-3 text-center">
                            <Badge status={b.status}>
                              {b.status.replace('_', ' ')}
                            </Badge>
                          </td>
                          <td className="py-2 px-3 text-surface-500">{formatDate(b.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {/* Recent sales */}
          {customer.sales?.length > 0 && (
            <div>
              <h3 className="text-heading text-surface-800 mb-3">Recent Sales</h3>
              <Card variant="outlined" padding="none">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full min-w-[500px]">
                    <thead>
                      <tr className="border-b border-surface-200 bg-surface-50">
                        <th className="text-overline text-surface-500 text-left py-2 px-3 uppercase tracking-wider">Receipt</th>
                        <th className="text-overline text-surface-500 text-left py-2 px-3 uppercase tracking-wider">Batch</th>
                        <th className="text-overline text-surface-500 text-right py-2 px-3 uppercase tracking-wider">Qty</th>
                        <th className="text-overline text-surface-500 text-right py-2 px-3 uppercase tracking-wider">Amount</th>
                        <th className="text-overline text-surface-500 text-left py-2 px-3 uppercase tracking-wider">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customer.sales.map(s => (
                        <tr key={s.id} className="border-b border-surface-100 text-body">
                          <td className="py-2 px-3 font-mono text-surface-600">{s.receiptNumber}</td>
                          <td className="py-2 px-3 text-body-medium text-surface-900">{s.batch?.name || '—'}</td>
                          <td className="py-2 px-3 text-right text-surface-700">{s.totalQuantity}</td>
                          <td className="py-2 px-3 text-right text-body-medium text-surface-900">{formatCurrency(s.totalAmount)}</td>
                          <td className="py-2 px-3 text-surface-500">{formatDate(s.saleDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end pt-2">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
