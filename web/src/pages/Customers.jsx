import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Button, Input, Modal, Card, Badge, EmptyState, Textarea } from '../components/ui';

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
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(Number(n));
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function bookingSourceMeta(booking) {
  if (booking.portalCheckout?.checkoutType === 'BUY_NOW') {
    return { label: 'Portal · Buy now', tone: 'info' };
  }
  if (booking.portalCheckout?.checkoutType === 'BOOK_UPCOMING') {
    return { label: 'Portal · Book now', tone: 'brand' };
  }
  if (booking.channel === 'website') {
    return { label: 'Portal booking', tone: 'info' };
  }
  return { label: 'Manual booking', tone: 'neutral' };
}

function bookingPaymentTruthMeta(booking) {
  const checkout = booking.portalCheckout;
  if (checkout?.paymentMethod === 'TRANSFER') {
    if (checkout.status === 'ADMIN_CONFIRMED') return { label: 'Waiting for statement', tone: 'warning' };
    if (checkout.status === 'AWAITING_TRANSFER') return { label: 'Waiting for admin', tone: 'neutral' };
    if (checkout.status === 'PAID' && checkout.confirmationStatementLineId) return { label: 'Statement confirmed', tone: 'success' };
    if (checkout.status === 'PAID') return { label: 'Transfer confirmed', tone: 'success' };
    if (checkout.status === 'CANCELLED') return { label: 'Transfer declined', tone: 'error' };
  }
  if (checkout?.paymentMethod === 'CARD' && checkout.status === 'PAID') {
    return { label: 'Card verified', tone: 'success' };
  }
  if ((booking.allocations?.length || 0) > 0) {
    return { label: 'Deposits applied', tone: 'info' };
  }
  return { label: 'No payment linked', tone: 'neutral' };
}

function portalCheckoutStatusMeta(checkout) {
  if (checkout.paymentMethod === 'TRANSFER') {
    if (checkout.status === 'AWAITING_TRANSFER') return { label: 'Awaiting admin confirmation', tone: 'neutral' };
    if (checkout.status === 'ADMIN_CONFIRMED') return { label: 'Waiting for statement', tone: 'warning' };
    if (checkout.status === 'PAID' && checkout.confirmationStatementLineId) return { label: 'Statement confirmed', tone: 'success' };
    if (checkout.status === 'PAID') return { label: 'Transfer confirmed', tone: 'success' };
    if (checkout.status === 'CANCELLED') return { label: 'Transfer declined', tone: 'error' };
  }
  if (checkout.paymentMethod === 'CARD' && checkout.status === 'PAID') {
    return { label: 'Card verified', tone: 'success' };
  }
  if (checkout.status === 'FAILED') return { label: 'Payment failed', tone: 'error' };
  return { label: checkout.status.replaceAll('_', ' '), tone: 'neutral' };
}

function joinLinkedBookings(allocations) {
  if (!allocations?.length) return 'Not linked yet';
  return allocations
    .map((allocation) => allocation.booking?.batch?.name ? `${allocation.booking.batch.name} (${allocation.booking.quantity} crates)` : `Booking ${allocation.bookingId}`)
    .join(', ');
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
      setError('');
    } catch {
      setError('Failed to load customers');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-display text-surface-900">Customers</h1>
          <p className="text-body text-surface-500 mt-1">{total} customers in the database</p>
        </div>
        {canCreate && (
          <Button variant="primary" size="md" icon={<PlusIcon />} onClick={() => setShowCreate(true)}>
            New Customer
          </Button>
        )}
      </div>

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
        <div className="bg-error-50 text-error-600 px-4 py-3 rounded-lg text-body mb-6">
          {error}
        </div>
      )}

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
                {customers.map((customer) => (
                  <tr
                    key={customer.id}
                    onClick={() => setSelectedCustomer(customer.id)}
                    className="border-b border-surface-100 hover:bg-surface-50 cursor-pointer transition-colors duration-fast"
                  >
                    <td className="py-3 px-4">
                      <span className="text-body-medium text-surface-900 font-medium">{customer.name}</span>
                    </td>
                    <td className="py-3 px-4 text-body text-surface-600">{customer.phone}</td>
                    <td className="py-3 px-4 text-body text-surface-500">{customer.email || '—'}</td>
                    <td className="py-3 px-4 text-center">
                      <Badge status={customer.isFirstTime ? 'PENDING' : 'COMPLETED'}>
                        {customer.isFirstTime ? 'New' : 'Returning'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-body text-surface-500 text-center">{customer._count?.bookings || 0}</td>
                    <td className="py-3 px-4 text-body text-surface-500 text-center">{customer._count?.sales || 0}</td>
                    <td className="py-3 px-4 text-body text-surface-500">{formatDate(customer.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Customer" size="md">
        <CreateCustomerModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadCustomers();
          }}
        />
      </Modal>

      <Modal open={!!selectedCustomer} onClose={() => setSelectedCustomer(null)} size="xl">
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

function CreateCustomerModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
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

      <Input label="Name" required placeholder="Customer name" value={form.name} onChange={e => update('name', e.target.value)} />
      <Input label="Phone" type="tel" required placeholder="+234..." value={form.phone} onChange={e => update('phone', e.target.value)} />
      <Input label="Email" type="email" placeholder="Optional" value={form.email} onChange={e => update('email', e.target.value)} />
      <Textarea label="Notes" placeholder="Any notes about this customer..." value={form.notes} onChange={e => update('notes', e.target.value)} />

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" loading={submitting}>{submitting ? 'Creating...' : 'Create Customer'}</Button>
      </div>
    </form>
  );
}

function CustomerDetailModal({ customerId, canEdit, onClose, onUpdated }) {
  const [customer, setCustomer] = useState(null);
  const [stats, setStats] = useState(null);
  const [depositSummary, setDepositSummary] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadCustomer();
  }, [customerId]);

  async function loadCustomer() {
    setLoading(true);
    try {
      const data = await api.get(`/customers/${customerId}`);
      setCustomer(data.customer);
      setStats(data.stats);
      setDepositSummary(data.depositSummary);
      setDeposits(data.deposits || []);
      setEditForm({
        name: data.customer.name,
        phone: data.customer.phone,
        email: data.customer.email || '',
        notes: data.customer.notes || '',
      });
      setError('');
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

  const attentionItems = useMemo(() => {
    if (!customer || !stats || !depositSummary) return [];
    const items = [];
    if (depositSummary.availableAmount > 0) {
      items.push({
        tone: 'brand',
        title: 'Customer money is still hanging',
        text: `${formatCurrency(depositSummary.availableAmount)} is available in customer deposits and has not yet been fully matched to bookings.`,
      });
    }
    if (stats.pendingPortalTransfers > 0) {
      items.push({
        tone: 'warning',
        title: 'Portal transfer still needs follow-up',
        text: `${stats.pendingPortalTransfers} transfer ${stats.pendingPortalTransfers === 1 ? 'payment is' : 'payments are'} still waiting for admin or statement confirmation.`,
      });
    }
    return items;
  }, [customer, stats, depositSummary]);

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="text-center py-8 text-surface-400">Loading...</div>
      ) : !customer ? (
        <div className="text-center py-8 text-error-600">{error || 'Customer not found'}</div>
      ) : (
        <>
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="flex-1">
              {editing ? (
                <div className="space-y-3">
                  <Input value={editForm.name} onChange={e => setEditForm(current => ({ ...current, name: e.target.value }))} containerClassName="mb-0" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input type="tel" value={editForm.phone} onChange={e => setEditForm(current => ({ ...current, phone: e.target.value }))} placeholder="Phone" containerClassName="mb-0" />
                    <Input type="email" value={editForm.email} onChange={e => setEditForm(current => ({ ...current, email: e.target.value }))} placeholder="Email" containerClassName="mb-0" />
                  </div>
                  <Textarea value={editForm.notes} onChange={e => setEditForm(current => ({ ...current, notes: e.target.value }))} placeholder="Notes" />
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <h2 className="text-title text-surface-900">{customer.name}</h2>
                    <Badge status={customer.isFirstTime ? 'PENDING' : 'COMPLETED'}>
                      {customer.isFirstTime ? 'New customer' : 'Returning customer'}
                    </Badge>
                  </div>
                  <p className="text-body text-surface-500">{customer.phone}{customer.email ? ` · ${customer.email}` : ''}</p>
                  {customer.notes && <p className="text-body text-surface-600 mt-2 italic">{customer.notes}</p>}
                  <p className="text-caption text-surface-500 mt-3">Last activity: {formatDateTime(stats?.lastActivityAt)}</p>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              {canEdit && !editing && (
                <Button variant="ghost" size="sm" icon={<EditIcon />} onClick={() => setEditing(true)}>
                  Edit
                </Button>
              )}
              {editing && (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                  <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>Save</Button>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-error-50 text-error-600 px-3 py-2 rounded-lg text-body">
              {error}
            </div>
          )}

          {stats && depositSummary && (
            <>
              {/* CRM overview */}
              <Card variant="outlined">
                <h3 className="text-heading text-surface-800 mb-4">Customer overview</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div>
                    <p className="text-overline text-surface-500">Lifetime spend</p>
                    <p className="text-title font-bold text-surface-900 mt-1">{formatCurrency(stats.lifetimeSpend || stats.totalSpent)}</p>
                  </div>
                  <div>
                    <p className="text-overline text-surface-500">Total visits</p>
                    <p className="text-title font-bold text-surface-900 mt-1">{stats.totalVisits ?? stats.totalSales}</p>
                  </div>
                  <div>
                    <p className="text-overline text-surface-500">Crates purchased</p>
                    <p className="text-title font-bold text-surface-900 mt-1">{(stats.lifetimeCrates ?? stats.totalPurchasedCrates).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-overline text-surface-500">First visit</p>
                    <p className="text-body font-medium text-surface-900 mt-1">{stats.firstVisitDate ? new Date(stats.firstVisitDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No visits yet'}</p>
                  </div>
                  <div>
                    <p className="text-overline text-surface-500">Last visit</p>
                    <p className="text-body font-medium text-surface-900 mt-1">{stats.lastVisitDate ? new Date(stats.lastVisitDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No visits yet'}</p>
                  </div>
                  <div>
                    <p className="text-overline text-surface-500">Member since</p>
                    <p className="text-body font-medium text-surface-900 mt-1">{new Date(stats.memberSince || customer.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                </div>
              </Card>

              {/* Operational stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <Card tint="bg-brand-50">
                  <p className="text-overline text-surface-500">Active orders</p>
                  <p className="text-metric text-brand-700 mt-1">{stats.activeBookings}</p>
                  <p className="text-caption text-surface-500 mt-0.5">{stats.totalBookedCrates.toLocaleString()} crates booked overall</p>
                </Card>
                <Card tint="bg-success-50">
                  <p className="text-overline text-surface-500">Deposit available</p>
                  <p className="text-metric text-success-700 mt-1">{formatCurrency(depositSummary.availableAmount)}</p>
                  <p className="text-caption text-surface-500 mt-0.5">{depositSummary.hangingDepositCount} hanging deposit {depositSummary.hangingDepositCount === 1 ? 'line' : 'lines'}</p>
                </Card>
                <Card tint="bg-warning-50">
                  <p className="text-overline text-surface-500">Transfer follow-up</p>
                  <p className="text-metric text-warning-700 mt-1">{stats.pendingPortalTransfers}</p>
                  <p className="text-caption text-surface-500 mt-0.5">portal transfer {stats.pendingPortalTransfers === 1 ? 'payment' : 'payments'} waiting</p>
                </Card>
              </div>
            </>
          )}

          {attentionItems.length > 0 && (
            <Card variant="outlined" className="border-warning-200 bg-warning-50/60">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-warning-600"><AlertIcon /></span>
                <h3 className="text-heading text-surface-900">Needs attention</h3>
              </div>
              <div className="space-y-3">
                {attentionItems.map((item) => (
                  <div key={item.title} className="rounded-xl bg-white/80 border border-surface-200 px-4 py-3">
                    <p className="text-body-medium text-surface-900">{item.title}</p>
                    <p className="text-body text-surface-600 mt-1">{item.text}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div>
            <h3 className="text-heading text-surface-800 mb-3">Customer deposits</h3>
            {deposits.length === 0 ? (
              <Card variant="outlined">
                <p className="text-body text-surface-500">No customer deposit lines yet.</p>
              </Card>
            ) : (
              <Card variant="outlined" padding="none">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full min-w-[920px]">
                    <thead>
                      <tr className="border-b border-surface-200 bg-surface-50">
                        <th className="text-overline text-surface-500 text-left py-2 px-3 uppercase tracking-wider">Date</th>
                        <th className="text-overline text-surface-500 text-right py-2 px-3 uppercase tracking-wider">Amount</th>
                        <th className="text-overline text-surface-500 text-right py-2 px-3 uppercase tracking-wider">Allocated</th>
                        <th className="text-overline text-surface-500 text-right py-2 px-3 uppercase tracking-wider">Available</th>
                        <th className="text-overline text-surface-500 text-left py-2 px-3 uppercase tracking-wider">Category / account</th>
                        <th className="text-overline text-surface-500 text-left py-2 px-3 uppercase tracking-wider">Linked bookings</th>
                        <th className="text-overline text-surface-500 text-left py-2 px-3 uppercase tracking-wider">Staff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deposits.map((deposit) => (
                        <tr key={deposit.id} className="border-b border-surface-100 text-body align-top">
                          <td className="py-2 px-3 text-surface-600">{formatDateTime(deposit.transactionDate)}</td>
                          <td className="py-2 px-3 text-right text-surface-900 font-medium">{formatCurrency(deposit.amount)}</td>
                          <td className="py-2 px-3 text-right text-surface-600">{formatCurrency(deposit.allocatedAmount)}</td>
                          <td className="py-2 px-3 text-right">
                            <span className={deposit.availableAmount > 0 ? 'text-warning-700 font-medium' : 'text-surface-500'}>
                              {formatCurrency(deposit.availableAmount)}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-surface-600">
                            <div>{deposit.category.replaceAll('_', ' ')}</div>
                            <div className="text-caption text-surface-500">{deposit.bankAccount?.name || 'Account not set'}</div>
                          </td>
                          <td className="py-2 px-3 text-surface-600 max-w-[280px]">{joinLinkedBookings(deposit.allocations)}</td>
                          <td className="py-2 px-3 text-surface-600">{deposit.staffName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>

          <div>
            <h3 className="text-heading text-surface-800 mb-3">Orders and bookings</h3>
            {customer.bookings?.length ? (
              <Card variant="outlined" padding="none">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full min-w-[1040px]">
                    <thead>
                      <tr className="border-b border-surface-200 bg-surface-50">
                        <th className="text-overline text-surface-500 text-left py-2 px-3 uppercase tracking-wider">Batch</th>
                        <th className="text-overline text-surface-500 text-left py-2 px-3 uppercase tracking-wider">Source</th>
                        <th className="text-overline text-surface-500 text-right py-2 px-3 uppercase tracking-wider">Qty</th>
                        <th className="text-overline text-surface-500 text-right py-2 px-3 uppercase tracking-wider">Order value</th>
                        <th className="text-overline text-surface-500 text-right py-2 px-3 uppercase tracking-wider">Paid</th>
                        <th className="text-overline text-surface-500 text-right py-2 px-3 uppercase tracking-wider">Balance</th>
                        <th className="text-overline text-surface-500 text-left py-2 px-3 uppercase tracking-wider">Payment truth</th>
                        <th className="text-overline text-surface-500 text-left py-2 px-3 uppercase tracking-wider">Status</th>
                        <th className="text-overline text-surface-500 text-left py-2 px-3 uppercase tracking-wider">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customer.bookings.map((booking) => {
                        const source = bookingSourceMeta(booking);
                        const paymentTruth = bookingPaymentTruthMeta(booking);
                        const balance = Math.max(0, Number(booking.orderValue || 0) - Number(booking.amountPaid || 0));
                        return (
                          <tr key={booking.id} className="border-b border-surface-100 text-body align-top">
                            <td className="py-2 px-3">
                              <div className="text-body-medium text-surface-900">{booking.batch?.name || '—'}</div>
                              <div className="text-caption text-surface-500">{booking.batch?.eggTypeLabel || 'Eggs'}</div>
                              {booking.sale?.receiptNumber && <div className="text-caption text-surface-500">Receipt {booking.sale.receiptNumber}</div>}
                            </td>
                            <td className="py-2 px-3"><Badge color={source.tone}>{source.label}</Badge></td>
                            <td className="py-2 px-3 text-right text-surface-700">{booking.quantity}</td>
                            <td className="py-2 px-3 text-right text-surface-700">{formatCurrency(booking.orderValue)}</td>
                            <td className="py-2 px-3 text-right text-surface-700">{formatCurrency(booking.amountPaid)}</td>
                            <td className="py-2 px-3 text-right text-surface-700">{formatCurrency(balance)}</td>
                            <td className="py-2 px-3"><Badge color={paymentTruth.tone}>{paymentTruth.label}</Badge></td>
                            <td className="py-2 px-3"><Badge status={booking.status}>{booking.status.replaceAll('_', ' ')}</Badge></td>
                            <td className="py-2 px-3 text-surface-500">{formatDateTime(booking.createdAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : (
              <Card variant="outlined">
                <p className="text-body text-surface-500">No bookings yet.</p>
              </Card>
            )}
          </div>

          <div>
            <h3 className="text-heading text-surface-800 mb-3">Portal payment activity</h3>
            {customer.portalCheckouts?.length ? (
              <Card variant="outlined" padding="none">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full min-w-[980px]">
                    <thead>
                      <tr className="border-b border-surface-200 bg-surface-50">
                        <th className="text-overline text-surface-500 text-left py-2 px-3 uppercase tracking-wider">Reference</th>
                        <th className="text-overline text-surface-500 text-left py-2 px-3 uppercase tracking-wider">Type</th>
                        <th className="text-overline text-surface-500 text-left py-2 px-3 uppercase tracking-wider">Batch</th>
                        <th className="text-overline text-surface-500 text-right py-2 px-3 uppercase tracking-wider">Value</th>
                        <th className="text-overline text-surface-500 text-left py-2 px-3 uppercase tracking-wider">Payment</th>
                        <th className="text-overline text-surface-500 text-left py-2 px-3 uppercase tracking-wider">Current truth</th>
                        <th className="text-overline text-surface-500 text-left py-2 px-3 uppercase tracking-wider">Last action</th>
                        <th className="text-overline text-surface-500 text-left py-2 px-3 uppercase tracking-wider">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customer.portalCheckouts.map((checkout) => {
                        const truth = portalCheckoutStatusMeta(checkout);
                        return (
                          <tr key={checkout.id} className="border-b border-surface-100 text-body align-top">
                            <td className="py-2 px-3 font-mono text-surface-600">{checkout.reference}</td>
                            <td className="py-2 px-3 text-surface-700">{checkout.checkoutType === 'BUY_NOW' ? 'Buy now' : 'Book upcoming'}</td>
                            <td className="py-2 px-3 text-surface-700">{checkout.batch?.name || '—'}</td>
                            <td className="py-2 px-3 text-right text-surface-700">{formatCurrency(checkout.orderValue)}</td>
                            <td className="py-2 px-3 text-surface-700">{checkout.paymentMethod}</td>
                            <td className="py-2 px-3"><Badge color={truth.tone}>{truth.label}</Badge></td>
                            <td className="py-2 px-3 text-surface-600">
                              {checkout.latestDecision ? `${checkout.latestDecision.decisionType.replaceAll('_', ' ')} · ${checkout.latestDecision.actorName}` : 'No staff action yet'}
                            </td>
                            <td className="py-2 px-3 text-surface-500">{formatDateTime(checkout.createdAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : (
              <Card variant="outlined">
                <p className="text-body text-surface-500">No portal payment activity yet.</p>
              </Card>
            )}
          </div>

          <div>
            <h3 className="text-heading text-surface-800 mb-3">Recent pickups and sales</h3>
            {customer.sales?.length ? (
              <Card variant="outlined" padding="none">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full min-w-[820px]">
                    <thead>
                      <tr className="border-b border-surface-200 bg-surface-50">
                        <th className="text-overline text-surface-500 text-left py-2 px-3 uppercase tracking-wider">Receipt</th>
                        <th className="text-overline text-surface-500 text-left py-2 px-3 uppercase tracking-wider">Batch</th>
                        <th className="text-overline text-surface-500 text-right py-2 px-3 uppercase tracking-wider">Qty</th>
                        <th className="text-overline text-surface-500 text-right py-2 px-3 uppercase tracking-wider">Amount</th>
                        <th className="text-overline text-surface-500 text-left py-2 px-3 uppercase tracking-wider">Payment method</th>
                        <th className="text-overline text-surface-500 text-left py-2 px-3 uppercase tracking-wider">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customer.sales.map((sale) => (
                        <tr key={sale.id} className="border-b border-surface-100 text-body">
                          <td className="py-2 px-3 font-mono text-surface-600">{sale.receiptNumber}</td>
                          <td className="py-2 px-3 text-body-medium text-surface-900">{sale.batch?.name || '—'}</td>
                          <td className="py-2 px-3 text-right text-surface-700">{sale.totalQuantity}</td>
                          <td className="py-2 px-3 text-right text-body-medium text-surface-900">{formatCurrency(sale.totalAmount)}</td>
                          <td className="py-2 px-3 text-surface-700">{sale.paymentMethod?.replaceAll('_', ' ') || '—'}</td>
                          <td className="py-2 px-3 text-surface-500">{formatDateTime(sale.saleDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : (
              <Card variant="outlined">
                <p className="text-body text-surface-500">No pickup sales yet.</p>
              </Card>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        </>
      )}
    </div>
  );
}
