import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Button, Input, Select, Modal, Card, Badge, EmptyState, useToast } from '../components/ui';

const PAYMENT_LABELS = { CASH: 'Cash', TRANSFER: 'Transfer', POS_CARD: 'POS/Card', PRE_ORDER: 'Pre-order' };
const SALE_TYPE_LABELS = { WHOLESALE: 'Wholesale', RETAIL: 'Retail', CRACKED: 'Cracked', WRITE_OFF: 'Write-off' };
const SALE_TYPE_BADGE_COLORS = {
  WHOLESALE: 'success',
  RETAIL: 'info',
  CRACKED: 'warning',
  WRITE_OFF: 'error',
};
const SOURCE_LABELS = { BOOKING: 'Booking pickup', DIRECT: 'Direct sale' };
const DIRECT_PAYMENT_TRAIL_HINTS = {
  CASH: 'This sale will add money to Cash Account automatically.',
  TRANSFER: 'This sale will add money to Customer Deposit Account automatically.',
  POS_CARD: 'This sale will add a POS settlement record to Customer Deposit Account automatically.',
};

function bookingSourceMeta(booking) {
  if (booking?.portalCheckout?.checkoutType === 'BUY_NOW') {
    return {
      label: 'Portal buy now',
      description: 'Customer already paid online and is now collecting this order.',
      color: 'info',
      cta: 'Complete this pickup',
    };
  }
  if (booking?.portalCheckout?.checkoutType === 'BOOK_UPCOMING') {
    return {
      label: 'Portal booking',
      description: 'Customer booked this batch through the portal.',
      color: 'brand',
      cta: 'Use this booking',
    };
  }
  return {
    label: 'Manual booking',
    description: 'Customer already has a booking recorded by staff.',
    color: 'neutral',
    cta: 'Use this booking',
  };
}

function formatCurrency(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(n);
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
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

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function paymentAccountLabel(paymentTransaction) {
  if (!paymentTransaction?.bankAccount) return '—';
  const account = paymentTransaction.bankAccount;
  if (account.accountType === 'CASH_ON_HAND' || account.lastFour === 'CASH') {
    return 'Cash Account';
  }
  return `${account.name} • ••••${account.lastFour}`;
}

function saleBatchLabel(sale) {
  return sale.batchSummary || sale.batch?.name || '—';
}

function orderLimitMessage(orderLimitProfile) {
  if (!orderLimitProfile) return '';
  if (orderLimitProfile.isUsingEarlyOrderLimit) {
    return `This customer is still under the early-order limit: ${orderLimitProfile.currentPerOrderLimit} crates for order ${orderLimitProfile.nextOrderNumber}.`;
  }
  return `This customer can buy up to ${orderLimitProfile.currentPerOrderLimit} crates in one order.`;
}

// SVG icon components
function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-5 h-5">
      <path d="m4 10 3 3L16 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-5 h-5">
      <path d="m15 5-10 10M5 5l10 10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-5 h-5">
      <path d="m12 17-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PrintIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-5 h-5">
      <path d="M4 7h12M5 7v-1a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1m-2 10H5a2 2 0 0 1-2-2v-6h14v6a2 2 0 0 1-2 2h-6m-4-6h10v4H7v-4z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-5 h-5">
      <path d="M10 4v12M4 10h12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Sales() {
  const { user } = useAuth();
  const toast = useToast();
  const [sales, setSales] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateFilter, setDateFilter] = useState(todayStr());
  const [paymentFilter, setPaymentFilter] = useState('');

  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const [showRecordSale, setShowRecordSale] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);

  const canRecord = ['ADMIN', 'MANAGER', 'SHOP_FLOOR'].includes(user?.role);
  const canViewReports = ['ADMIN', 'MANAGER'].includes(user?.role);

  useEffect(() => {
    loadSales();
  }, [dateFilter, paymentFilter]);

  useEffect(() => {
    if (canViewReports) loadSummary();
  }, [dateFilter, canViewReports]);

  async function loadSales() {
    setLoading(true);
    setError('');
    try {
      let params = `?date=${dateFilter}`;
      if (paymentFilter) params += `&paymentMethod=${paymentFilter}`;
      const data = await api.get(`/sales${params}`);
      setSales(data.sales);
      setTotal(data.total);
    } catch {
      setError('Failed to load sales');
    } finally {
      setLoading(false);
    }
  }

  async function loadSummary() {
    setLoadingSummary(true);
    try {
      const data = await api.get(`/sales/daily-summary?date=${dateFilter}`);
      setSummary(data);
    } catch {
      setSummary(null);
    } finally {
      setLoadingSummary(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
        <div>
          <h1 className="text-display text-surface-900">Sales</h1>
          <p className="text-body text-surface-600 mt-2">
            Finish paid bookings, record walk-in sales, and review what was sold today.
          </p>
        </div>
        {canRecord && (
          <Button
            variant="primary"
            size="md"
            onClick={() => setShowRecordSale(true)}
            icon={<PlusIcon />}
          >
            Record Sale
          </Button>
        )}
      </div>

      <Card variant="outlined" padding="comfortable" className="mb-6">
        <p className="text-heading text-surface-900">How to use this page</p>
        <p className="text-body text-surface-600 mt-2">
          Start with the customer. If they already have a paid booking, finish the pickup here. If not, record a direct sale.
        </p>
      </Card>

      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div className="flex-1 min-w-[150px]">
          <Input
            label="Date"
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            size="md"
          />
        </div>
        <div className="flex-1 min-w-[150px]">
          <Select
            label="Payment Method"
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            size="md"
          >
            <option value="">All methods</option>
            {Object.entries(PAYMENT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </Select>
        </div>
        <Button
          variant="ghost"
          size="md"
          onClick={() => setDateFilter(todayStr())}
        >
          Today
        </Button>
      </div>

      {canViewReports && summary && !loadingSummary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <Card variant="default" padding="comfortable">
            <p className="text-overline text-surface-500">Total Sales</p>
            <p className="text-metric-lg text-surface-900 mt-2">{formatCurrency(summary.summary.totalSales)}</p>
          </Card>
          <Card variant="default" padding="comfortable">
            <p className="text-overline text-surface-500">Total Cost</p>
            <p className="text-metric-lg text-surface-900 mt-2">{formatCurrency(summary.summary.totalCost)}</p>
          </Card>
          <Card variant="default" padding="comfortable">
            <p className="text-overline text-surface-500">Gross Profit</p>
            <p className={`text-metric-lg mt-2 ${summary.summary.grossProfit >= 0 ? 'text-success-600' : 'text-error-600'}`}>
              {formatCurrency(summary.summary.grossProfit)}
            </p>
            <p className="text-caption text-surface-500 mt-1">{summary.summary.margin}% margin</p>
          </Card>
          <Card variant="default" padding="comfortable">
            <p className="text-overline text-surface-500">Transactions</p>
            <p className="text-metric-lg text-surface-900 mt-2">{summary.summary.transactionCount}</p>
          </Card>
          <Card variant="default" padding="comfortable">
            <p className="text-overline text-surface-500">Crates Sold</p>
            <p className="text-metric-lg text-surface-900 mt-2">{summary.summary.totalQuantity.toLocaleString()}</p>
          </Card>
        </div>
      )}

      {canViewReports && summary && Object.keys(summary.byPaymentMethod).length > 0 && (
        <div className="flex flex-wrap gap-3 mb-6">
          {Object.entries(summary.byPaymentMethod).map(([method, data]) => (
            <div key={method} className="bg-surface-50 border border-surface-200 rounded-lg px-4 py-2 flex items-center gap-3">
              <span className="text-body text-surface-600">{PAYMENT_LABELS[method] || method}</span>
              <span className="text-body-medium font-semibold text-surface-900">{formatCurrency(data.total)}</span>
              <span className="text-caption text-surface-500">({data.count})</span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <Card variant="outlined" padding="comfortable" className="mb-4 border-error-200 bg-error-50">
          <p className="text-body text-error-700">{error}</p>
        </Card>
      )}

      {loading ? (
        <div className="text-center py-12 text-surface-400">Loading sales...</div>
      ) : sales.length === 0 ? (
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-12 h-12">
              <circle cx="9" cy="21" r="1" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="20" cy="21" r="1" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
          title={`No sales for ${formatDate(dateFilter)}`}
          description="Start recording sales to see them here"
          action={canRecord}
          actionLabel="Record a sale"
          onAction={() => setShowRecordSale(true)}
        />
      ) : (
        <div className="overflow-x-auto custom-scrollbar">
          <Card variant="default" padding="compact">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-surface-200">
                  <th className="text-left py-3 px-4 text-overline text-surface-500">Receipt #</th>
                  <th className="text-left py-3 px-4 text-overline text-surface-500">Customer</th>
                  <th className="text-left py-3 px-4 text-overline text-surface-500">Source</th>
                  <th className="text-left py-3 px-4 text-overline text-surface-500">Batch</th>
                  <th className="text-right py-3 px-4 text-overline text-surface-500">Qty</th>
                  <th className="text-right py-3 px-4 text-overline text-surface-500">Amount</th>
                  <th className="text-center py-3 px-4 text-overline text-surface-500">Payment</th>
                  <th className="text-center py-3 px-4 text-overline text-surface-500">Type</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => {
                  const mainType = sale.lineItems?.[0]?.saleType || 'WHOLESALE';
                  return (
                    <tr
                      key={sale.id}
                      onClick={() => setSelectedSale(sale)}
                      className="border-b border-surface-100 hover:bg-surface-50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-mono text-body text-surface-700">{sale.receiptNumber}</td>
                      <td className="py-3 px-4">
                        <span className="text-body-medium font-semibold text-surface-900">{sale.customer?.name || '—'}</span>
                      </td>
                      <td className="py-3 px-4 text-body">
                        <Badge
                          color={sale.sourceType === 'BOOKING' ? 'success' : 'neutral'}
                          status={sale.sourceType}
                          dot
                        >
                          {SOURCE_LABELS[sale.sourceType] || 'Direct sale'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-body-medium font-semibold text-surface-800">{saleBatchLabel(sale)}</td>
                      <td className="py-3 px-4 text-body text-right text-surface-700">{sale.totalQuantity.toLocaleString()}</td>
                      <td className="py-3 px-4 text-body-medium text-right font-semibold text-surface-900">{formatCurrency(sale.totalAmount)}</td>
                      <td className="py-3 px-4 text-body text-center text-surface-700">{PAYMENT_LABELS[sale.paymentMethod] || sale.paymentMethod}</td>
                      <td className="py-3 px-4 text-center">
                        <Badge color={SALE_TYPE_BADGE_COLORS[mainType]} dot>
                          {SALE_TYPE_LABELS[mainType]}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          <p className="text-caption text-surface-500 mt-3">{total} sale record(s) shown.</p>
        </div>
      )}

      {showRecordSale && (
        <RecordSaleModal
          onClose={() => setShowRecordSale(false)}
          onRecorded={() => {
            setShowRecordSale(false);
            loadSales();
            if (canViewReports) loadSummary();
          }}
        />
      )}

      {selectedSale && (
        <SaleDetailModal sale={selectedSale} onClose={() => setSelectedSale(null)} />
      )}
    </div>
  );
}

function RecordSaleModal({ onClose, onRecorded }) {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({
    name: '',
    phone: '',
    email: '',
    notes: '',
  });

  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');
  const [customerWorkspace, setCustomerWorkspace] = useState({
    customer: null,
    bookings: [],
    directSaleBatches: [],
    mixedDirectSaleStock: [],
  });

  const [workflow, setWorkflow] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [saleScopeLabel, setSaleScopeLabel] = useState('');
  const [lineItems, setLineItems] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [limitOverrideNote, setLimitOverrideNote] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!customerSearch.trim()) {
      setCustomers([]);
      return undefined;
    }

    const timer = setTimeout(async () => {
      setSearchingCustomers(true);
      try {
        const data = await api.get(`/customers?search=${encodeURIComponent(customerSearch)}`);
        setCustomers(data.customers);
      } catch {
        setCustomers([]);
      } finally {
        setSearchingCustomers(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [customerSearch]);

  useEffect(() => {
    if (step === 2 && selectedCustomer) {
      loadCustomerWorkspace(selectedCustomer.id);
    }
  }, [step, selectedCustomer]);

  async function loadCustomerWorkspace(customerId) {
    setLoadingWorkspace(true);
    setWorkspaceError('');
    try {
      const data = await api.get(`/sales/customer-workspace/${customerId}`);
      setCustomerWorkspace({
        customer: data.customer || null,
        bookings: data.bookings || [],
        directSaleBatches: data.directSaleBatches || [],
        mixedDirectSaleStock: data.mixedDirectSaleStock || [],
      });
    } catch {
      setWorkspaceError('Failed to load this customer\'s sales options');
      setCustomerWorkspace({ customer: null, bookings: [], directSaleBatches: [], mixedDirectSaleStock: [] });
    } finally {
      setLoadingWorkspace(false);
    }
  }

  function initializeLineItemsFromRows(rows, options = {}) {
    const { presetQuantity = '' } = options;
    setLineItems((rows || []).map((eggCode, index) => ({
      batchEggCodeId: eggCode.id,
      batchId: eggCode.batchId,
      batchName: eggCode.batchName,
      code: eggCode.code,
      costPrice: eggCode.costPrice,
      remainingQuantity: eggCode.remainingQuantity ?? (Number(eggCode.quantity || 0) + Number(eggCode.freeQty || 0)),
      saleType: 'WHOLESALE',
      quantity: index === 0 && presetQuantity ? String(presetQuantity) : '',
      unitPrice: eggCode.wholesalePrice,
      wholesalePrice: eggCode.wholesalePrice,
      retailPrice: eggCode.retailPrice,
    })));
  }

  function initializeLineItems(batch, options = {}) {
    initializeLineItemsFromRows(
      (batch?.eggCodes || []).map((eggCode) => ({
        ...eggCode,
        batchId: batch.id,
        batchName: batch.name,
        wholesalePrice: eggCode.wholesalePrice ?? batch.wholesalePrice,
        retailPrice: eggCode.retailPrice ?? batch.retailPrice,
      })),
      options,
    );
  }

  function chooseCustomer(customer) {
    setSelectedCustomer(customer);
    setSelectedBooking(null);
    setSelectedBatch(null);
    setSaleScopeLabel('');
    setWorkflow('');
    setLineItems([]);
    setPaymentMethod('');
    setLimitOverrideNote('');
    setError('');
    setStep(2);
  }

  async function handleCreateCustomer(e) {
    e.preventDefault();
    setCreatingCustomer(true);
    setError('');
    try {
      const data = await api.post('/customers', {
        name: newCustomerForm.name.trim(),
        phone: newCustomerForm.phone.trim(),
        email: newCustomerForm.email.trim() || undefined,
        notes: newCustomerForm.notes.trim() || undefined,
      });
      setShowCreateCustomer(false);
      setNewCustomerForm({ name: '', phone: '', email: '', notes: '' });
      chooseCustomer(data.customer);
    } catch (err) {
      if (err.existingCustomer) {
        setCustomers((current) => {
          const existing = current.find((customer) => customer.id === err.existingCustomer.id);
          return existing ? current : [err.existingCustomer, ...current];
        });
      }
      setError(err.error || 'Failed to create customer');
    } finally {
      setCreatingCustomer(false);
    }
  }

  function chooseBooking(booking) {
    setWorkflow('BOOKING');
    setSelectedBooking(booking);
    setSelectedBatch(booking.batch);
    setSaleScopeLabel(booking.batch?.name || 'Booked batch');
    setPaymentMethod('PRE_ORDER');
    setLimitOverrideNote('');
    const preferredRows = booking.batchEggCodeId
      ? (booking.batch?.eggCodes || []).filter((eggCode) => eggCode.id === booking.batchEggCodeId)
      : booking.batch?.eggCodes || [];
    initializeLineItemsFromRows(
      preferredRows.map((eggCode) => ({
        ...eggCode,
        batchId: booking.batch?.id,
        batchName: booking.batch?.name,
      })),
      { presetQuantity: booking.quantity },
    );
    setError('');
    setStep(3);
  }

  function chooseDirectSale(batch) {
    setWorkflow('DIRECT');
    setSelectedBooking(null);
    setSelectedBatch(batch);
    setSaleScopeLabel(batch.name);
    setPaymentMethod('');
    setLimitOverrideNote('');
    initializeLineItems(batch);
    setError('');
    setStep(3);
  }

  function chooseMixedDirectSale() {
    setWorkflow('DIRECT');
    setSelectedBooking(null);
    setSelectedBatch(null);
    setSaleScopeLabel('Multiple batches');
    setPaymentMethod('');
    setLimitOverrideNote('');
    initializeLineItemsFromRows(customerWorkspace.mixedDirectSaleStock || []);
    setError('');
    setStep(3);
  }

  function updateLineItem(index, field, value) {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };

    if (field === 'saleType') {
      if (value === 'WHOLESALE') updated[index].unitPrice = updated[index].wholesalePrice;
      else if (value === 'RETAIL') updated[index].unitPrice = updated[index].retailPrice;
      else if (value === 'CRACKED') updated[index].unitPrice = Math.round(updated[index].costPrice * 0.5);
      else if (value === 'WRITE_OFF') updated[index].unitPrice = 0;
    }

    setLineItems(updated);
  }

  const activeItems = lineItems.filter((lineItem) => lineItem.quantity && Number(lineItem.quantity) > 0);
  const totalQty = activeItems.reduce((sum, lineItem) => sum + Number(lineItem.quantity), 0);
  const totalAmount = activeItems.reduce((sum, lineItem) => sum + Number(lineItem.quantity) * Number(lineItem.unitPrice), 0);
  const totalCost = activeItems.reduce((sum, lineItem) => sum + Number(lineItem.quantity) * Number(lineItem.costPrice), 0);
  const profit = totalAmount - totalCost;
  const bookingQuantityGap = selectedBooking ? selectedBooking.quantity - totalQty : 0;
  const isBookingQuantityReady = !selectedBooking || bookingQuantityGap === 0;
  const orderLimitProfile = customerWorkspace.customer?.orderLimitProfile || null;
  const currentPerOrderLimit = Number(orderLimitProfile?.currentPerOrderLimit || 0);
  const needsLimitOverride = workflow === 'DIRECT' && currentPerOrderLimit > 0 && totalQty > currentPerOrderLimit;
  const isDirectPaymentChosen = workflow !== 'DIRECT' || Boolean(paymentMethod);
  const canSubmit =
    workflow === 'BOOKING'
      ? !!selectedBooking && selectedBooking.isFullyPaid && isBookingQuantityReady
      : totalQty > 0 && isDirectPaymentChosen && (!needsLimitOverride || limitOverrideNote.trim().length > 0);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    if (activeItems.length === 0) {
      setError('Enter quantity for at least one egg code');
      setSubmitting(false);
      return;
    }

    if (workflow === 'BOOKING' && selectedBooking && !selectedBooking.isFullyPaid) {
      setError('This booking still has a balance. Finish the payment in Banking first.');
      setSubmitting(false);
      return;
    }

    if (workflow === 'BOOKING' && selectedBooking && totalQty !== selectedBooking.quantity) {
      setError(`This booking is for ${selectedBooking.quantity} crates. Enter exactly that quantity.`);
      setSubmitting(false);
      return;
    }

    try {
      await api.post('/sales', {
        customerId: selectedCustomer.id,
        bookingId: workflow === 'BOOKING' ? selectedBooking.id : undefined,
        batchId: workflow === 'DIRECT' ? selectedBatch?.id : undefined,
        paymentMethod: workflow === 'DIRECT' ? paymentMethod : undefined,
        limitOverrideNote: workflow === 'DIRECT' ? limitOverrideNote.trim() || undefined : undefined,
        lineItems: activeItems.map((lineItem) => ({
          batchEggCodeId: lineItem.batchEggCodeId,
          saleType: lineItem.saleType,
          quantity: Number(lineItem.quantity),
          unitPrice: Number(lineItem.unitPrice),
        })),
      });
      onRecorded();
    } catch (err) {
      setError(err.error || 'Failed to record sale');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} title="Record or Fulfill Sale" size="xl" footer={false}>
      <div className="flex gap-2 mb-4 flex-wrap">
        {['1. Customer', '2. Choose sale path', '3. Confirm items'].map((label, index) => (
          <span
            key={label}
            className={`text-caption font-semibold px-2 py-1 rounded-md ${
              step >= index + 1 ? 'bg-brand-100 text-brand-700' : 'bg-surface-100 text-surface-400'
            }`}
          >
            {label}
          </span>
        ))}
      </div>

      {(error || workspaceError) && (
        <Card variant="outlined" padding="compact" className="mb-4 border-error-200 bg-error-50">
          <p className="text-body text-error-700">{error || workspaceError}</p>
        </Card>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <Input
              label="Search Customer"
              placeholder="Type the customer name or phone number"
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              autoFocus
              size="md"
            />
            <p className="text-caption text-surface-600 mt-2">
              Start with the customer so the app can surface any existing booking or portal order before you create a new sale.
            </p>
          </div>

          <Card variant="outlined" padding="comfortable" className="border-dashed">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-heading text-surface-900">Need a new customer?</p>
                <p className="text-body text-surface-600 mt-1">
                  Create the customer here first, then continue with the sale.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => {
                  setShowCreateCustomer((current) => !current);
                  setError('');
                }}
              >
                {showCreateCustomer ? 'Hide form' : 'Create customer'}
              </Button>
            </div>

            {showCreateCustomer && (
              <form onSubmit={handleCreateCustomer} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Customer name"
                    value={newCustomerForm.name}
                    onChange={(e) => setNewCustomerForm((current) => ({ ...current, name: e.target.value }))}
                    required
                    size="md"
                  />
                  <Input
                    label="Phone number"
                    type="tel"
                    value={newCustomerForm.phone}
                    onChange={(e) => setNewCustomerForm((current) => ({ ...current, phone: e.target.value }))}
                    required
                    size="md"
                  />
                  <Input
                    label="Email address"
                    type="email"
                    value={newCustomerForm.email}
                    onChange={(e) => setNewCustomerForm((current) => ({ ...current, email: e.target.value }))}
                    size="md"
                  />
                  <Input
                    label="Notes"
                    value={newCustomerForm.notes}
                    onChange={(e) => setNewCustomerForm((current) => ({ ...current, notes: e.target.value }))}
                    size="md"
                  />
                </div>
                <Card variant="outlined" padding="comfortable" className="border-warning-200 bg-warning-50">
                  <p className="text-body text-warning-900">
                    New customers start under the early-order limit. If this sale goes above that limit later, a staff note will be required and saved with the sale.
                  </p>
                </Card>
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    loading={creatingCustomer}
                  >
                    Save customer and continue
                  </Button>
                </div>
              </form>
            )}
          </Card>

          {searchingCustomers && <p className="text-body text-surface-500">Searching...</p>}

          {customers.length > 0 && (
            <Card variant="outlined" padding="compact" className="max-h-72 overflow-y-auto custom-scrollbar">
              <div className="divide-y divide-surface-100">
                {customers.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => chooseCustomer(customer)}
                    className="w-full text-left px-4 py-3 hover:bg-surface-50 transition-colors"
                  >
                    <span className="text-body-medium font-semibold text-surface-900">{customer.name}</span>
                    <span className="text-body text-surface-500 ml-2">{customer.phone}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          {customerSearch && !searchingCustomers && customers.length === 0 && (
            <p className="text-body text-surface-500">No customers found</p>
          )}

          <div className="flex justify-end pt-2 gap-3">
            <Button onClick={onClose} variant="ghost" size="md">Cancel</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <Card variant="outlined" padding="comfortable" className="bg-surface-50">
            <div className="flex items-center gap-3">
              <span className="text-body text-surface-600">Customer:</span>
              <span className="text-body-medium font-semibold text-surface-900">{selectedCustomer?.name}</span>
              {selectedCustomer?.phone && <span className="text-body text-surface-500">{selectedCustomer.phone}</span>}
              <button
                onClick={() => {
                  setStep(1);
                  setSelectedBatch(null);
                  setSelectedBooking(null);
                  setWorkflow('');
                  setLineItems([]);
                }}
                className="ml-auto text-caption text-surface-500 hover:text-surface-700"
              >
                Change
              </button>
            </div>
          </Card>

          {orderLimitProfile && (
            <Card
              variant="outlined"
              padding="comfortable"
              className={orderLimitProfile.isUsingEarlyOrderLimit ? 'border-warning-200 bg-warning-50' : 'border-surface-200 bg-surface-50'}
            >
              <p className={`text-heading ${orderLimitProfile.isUsingEarlyOrderLimit ? 'text-warning-900' : 'text-surface-900'}`}>
                {orderLimitProfile.isUsingEarlyOrderLimit ? 'Early-order limit still applies' : 'Standard order limit'}
              </p>
              <p className={`text-body mt-1 ${orderLimitProfile.isUsingEarlyOrderLimit ? 'text-warning-800' : 'text-surface-700'}`}>
                {orderLimitMessage(orderLimitProfile)}
              </p>
              {orderLimitProfile.isUsingEarlyOrderLimit && (
                <p className="text-caption text-warning-800 mt-2">
                  This lighter cap stays active for the first {orderLimitProfile.earlyOrderLimitCount} orders.
                </p>
              )}
            </Card>
          )}

          <Card variant="outlined" padding="comfortable">
            <p className="text-heading text-surface-900">Choose what you want to do</p>
            <p className="text-body text-surface-600 mt-1">
              If this customer already paid for a booking, finish the pickup. If not, record a direct sale.
            </p>
          </Card>

          {loadingWorkspace ? (
            <p className="text-body text-surface-500">Loading customer options...</p>
          ) : (
            <>
              <section className="space-y-3">
                <div>
                  <h3 className="text-heading text-surface-900">1. Fulfil an existing booking or portal order</h3>
                  <p className="text-body text-surface-600 mt-1">
                    Use this when the customer already paid and is now collecting eggs.
                  </p>
                </div>

                {customerWorkspace.bookings.length === 0 ? (
                  <Card variant="outlined" padding="comfortable" className="border-dashed text-center">
                    <p className="text-body text-surface-600">This customer has no open bookings right now.</p>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {customerWorkspace.bookings.map((booking) => {
                      const sourceMeta = bookingSourceMeta(booking);
                      return (
                      <Card key={booking.id} variant="outlined" padding="comfortable">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-heading text-surface-900">{booking.batch?.name || 'Batch'}</p>
                            <p className="text-body-medium font-semibold text-surface-800 mt-1">{booking.batch?.eggTypeLabel || 'Regular Size Eggs'}</p>
                            <p className="text-body text-surface-600 mt-1">
                              {booking.quantity} crates{booking.batchEggCode?.code ? ` of ${booking.batchEggCode.code}` : ''} booked on {formatDate(booking.createdAt)}
                            </p>
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              <Badge color={sourceMeta.color} dot>{sourceMeta.label}</Badge>
                              {booking.portalCheckout?.reference && (
                                <span className="text-caption text-surface-500 font-mono">{booking.portalCheckout.reference}</span>
                              )}
                            </div>
                            <p className="text-caption text-surface-500 mt-2">{sourceMeta.description}</p>
                          </div>
                          <Badge
                            color={booking.isFullyPaid ? 'success' : 'warning'}
                            status={booking.isFullyPaid ? 'ready' : 'pending'}
                            dot
                          >
                            {booking.isFullyPaid ? 'Ready' : 'Needs payment'}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-3 gap-3 mt-4 text-sm">
                          <div>
                            <p className="text-surface-500">Booking value</p>
                            <p className="text-body-medium font-semibold text-surface-900">{formatCurrency(booking.orderValue)}</p>
                          </div>
                          <div>
                            <p className="text-surface-500">Paid</p>
                            <p className="text-body-medium font-semibold text-surface-900">{formatCurrency(booking.amountPaid)}</p>
                          </div>
                          <div>
                            <p className="text-surface-500">Balance</p>
                            <p className={`text-body-medium font-semibold ${booking.balance > 0 ? 'text-warning-700' : 'text-success-700'}`}>
                              {formatCurrency(booking.balance)}
                            </p>
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant={booking.isFullyPaid ? 'primary' : 'secondary'}
                          disabled={!booking.isFullyPaid}
                          onClick={() => chooseBooking(booking)}
                          size="md"
                          className="w-full mt-4"
                        >
                          {booking.isFullyPaid ? sourceMeta.cta : 'Record payment first'}
                        </Button>
                      </Card>
                    );})}
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <div>
                  <h3 className="text-heading text-surface-900">2. Create a new direct sale</h3>
                  <p className="text-body text-surface-600 mt-1">
                    Use this only when the customer is not collecting from an existing booking or portal order.
                  </p>
                </div>

                {customerWorkspace.mixedDirectSaleStock?.length > 0 && (
                  <button
                    type="button"
                    onClick={() => chooseMixedDirectSale()}
                    className="w-full text-left rounded-lg border border-brand-200 bg-brand-50/50 px-4 py-4 hover:bg-brand-50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-heading text-surface-900">Use stock from multiple batches</p>
                        <p className="text-body text-surface-600 mt-1">
                          Choose this when one receipt needs items from more than one received batch.
                        </p>
                      </div>
                      <span className="text-caption text-brand-600 font-semibold">Recommended</span>
                    </div>
                  </button>
                )}

                {customerWorkspace.directSaleBatches.length === 0 ? (
                  <Card variant="outlined" padding="comfortable" className="border-dashed text-center">
                    <p className="text-body text-surface-600">No received batches are available for direct sale right now.</p>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {customerWorkspace.directSaleBatches.map((batch) => (
                      <button
                        key={batch.id}
                        type="button"
                        onClick={() => chooseDirectSale(batch)}
                        className="w-full text-left border border-surface-200 rounded-lg px-4 py-4 hover:border-surface-300 hover:bg-surface-50 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-heading text-surface-900">{batch.name}</p>
                            <p className="text-body-medium font-semibold text-surface-800 mt-1">{batch.eggTypeLabel || 'Regular Size Eggs'}</p>
                            <p className="text-body text-surface-600 mt-1">
                              Wholesale {formatCurrency(batch.wholesalePrice)} · Retail {formatCurrency(batch.retailPrice)}
                            </p>
                            <p className="text-caption text-surface-500 mt-1">
                              {batch.availableForSale?.toLocaleString?.() || 0} crates available for direct sale
                            </p>
                          </div>
                          <span className="text-caption text-surface-500">{batch.eggCodes.length} code(s)</span>
                        </div>
                        <div className="flex gap-2 mt-3 flex-wrap">
                          {batch.eggCodes.map((eggCode) => (
                            <span key={eggCode.id} className="text-caption font-mono bg-surface-100 text-surface-700 px-2 py-1 rounded">
                              {eggCode.code}
                            </span>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          <div className="flex justify-between pt-2 gap-3">
            <Button onClick={() => setStep(1)} variant="ghost" size="md" icon={<ChevronLeftIcon />}>Back</Button>
            <Button onClick={onClose} variant="ghost" size="md">Cancel</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Card variant="outlined" padding="compact" className="bg-surface-50">
              <p className="text-body text-surface-600">Customer</p>
              <p className="text-body-medium font-semibold text-surface-900 mt-1">{selectedCustomer?.name}</p>
            </Card>
            <Card variant="outlined" padding="compact" className="bg-surface-50">
              <p className="text-body text-surface-600">Sale path</p>
              <p className="text-body-medium font-semibold text-surface-900 mt-1">{workflow === 'BOOKING' ? 'Booking or portal pickup' : 'New direct sale'}</p>
            </Card>
            <Card variant="outlined" padding="compact" className="bg-surface-50">
              <p className="text-body text-surface-600">Batch</p>
              <p className="text-body-medium font-semibold text-surface-900 mt-1">{saleScopeLabel || selectedBatch?.name || '—'}</p>
            </Card>
          </div>

          {workflow === 'BOOKING' ? (
            <Card
              variant="outlined"
              padding="comfortable"
              className={selectedBooking?.isFullyPaid ? 'border-success-200 bg-success-50' : 'border-warning-200 bg-warning-50'}
            >
              <p className={`text-heading ${selectedBooking?.isFullyPaid ? 'text-success-900' : 'text-warning-900'}`}>
                {selectedBooking?.isFullyPaid ? 'Complete this booking pickup' : 'This booking still has a balance'}
              </p>
              <p className={`text-body mt-1 ${selectedBooking?.isFullyPaid ? 'text-success-800' : 'text-warning-800'}`}>
                {selectedBooking?.isFullyPaid
                  ? `Enter the egg codes collected. The total must stay at ${selectedBooking?.quantity} crates.`
                  : 'Record the remaining payment in Banking and update the booking before pickup.'}
              </p>
            </Card>
          ) : (
            <Card variant="outlined" padding="comfortable" className="border-info-200 bg-info-50">
              <p className="text-heading text-info-900">Record a direct sale</p>
              <p className="text-body text-info-800 mt-1">
                Enter what the customer bought, then choose exactly how they paid before saving.
              </p>
            </Card>
          )}

          {workflow === 'DIRECT' && orderLimitProfile && (
            <Card
              variant="outlined"
              padding="comfortable"
              className={needsLimitOverride ? 'border-error-200 bg-error-50' : orderLimitProfile.isUsingEarlyOrderLimit ? 'border-warning-200 bg-warning-50' : 'border-surface-200 bg-surface-50'}
            >
              <p className={`text-heading ${needsLimitOverride ? 'text-error-900' : orderLimitProfile.isUsingEarlyOrderLimit ? 'text-warning-900' : 'text-surface-900'}`}>
                {needsLimitOverride ? 'This sale is above the customer limit' : 'Customer sale limit'}
              </p>
              <p className={`text-body mt-1 ${needsLimitOverride ? 'text-error-800' : orderLimitProfile.isUsingEarlyOrderLimit ? 'text-warning-800' : 'text-surface-700'}`}>
                {orderLimitMessage(orderLimitProfile)}
              </p>
              {needsLimitOverride && (
                <div className="mt-3 space-y-2">
                  <label className="block text-body-medium font-semibold text-error-900">
                    Why are you overriding this limit?
                  </label>
                  <textarea
                    value={limitOverrideNote}
                    onChange={(e) => setLimitOverrideNote(e.target.value)}
                    rows={3}
                    placeholder="Explain why this sale is going above the customer limit."
                    className="w-full border border-error-300 rounded-lg px-3 py-2 text-body focus:ring-2 focus:ring-error-500 focus:border-error-500 outline-none"
                  />
                  <p className="text-caption text-error-800">
                    Your note and your staff name will be saved with this sale.
                  </p>
                </div>
              )}
            </Card>
          )}

          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <label className="block text-body-medium font-semibold text-surface-900">Line Items</label>
              {workflow === 'BOOKING' && (
                <p className="text-caption text-surface-600">
                  Tip: if the customer picked different egg codes, split the quantity across the rows below.
                </p>
              )}
            </div>
            <div className="space-y-3 overflow-x-auto custom-scrollbar">
              {lineItems.map((lineItem, index) => (
                <div key={lineItem.batchEggCodeId} className="grid grid-cols-12 gap-1 sm:gap-2 items-end min-w-[320px]">
                  <div className="col-span-2">
                    {index === 0 && <label className="block text-caption text-surface-600 mb-1">Egg Code</label>}
                    <div className="border border-surface-200 bg-surface-50 rounded-lg px-3 py-2">
                      <p className="text-body-medium font-mono font-semibold text-brand-600">{lineItem.code}</p>
                      <p className="text-caption text-surface-500 mt-1 truncate">{lineItem.batchName}</p>
                    </div>
                  </div>
                  <div className="col-span-3">
                    {index === 0 && <label className="block text-caption text-surface-600 mb-1">Sale Type</label>}
                    <Select
                      value={lineItem.saleType}
                      onChange={(e) => updateLineItem(index, 'saleType', e.target.value)}
                      size="md"
                    >
                      {Object.entries(SALE_TYPE_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="col-span-2">
                    {index === 0 && <label className="block text-caption text-surface-600 mb-1">Quantity</label>}
                    <div>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={lineItem.quantity}
                        onChange={(e) => updateLineItem(index, 'quantity', e.target.value)}
                        className="w-full border border-surface-300 rounded-lg px-2 py-2 text-body focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                      />
                      <p className="text-caption text-surface-500 mt-1">
                        Remain {Number(lineItem.remainingQuantity || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="col-span-3">
                    {index === 0 && <label className="block text-caption text-surface-600 mb-1">Unit Price (₦)</label>}
                    <input
                      type="number"
                      min="0"
                      value={lineItem.unitPrice}
                      onChange={(e) => updateLineItem(index, 'unitPrice', e.target.value)}
                      className="w-full border border-surface-300 rounded-lg px-2 py-2 text-body focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                    />
                  </div>
                  <div className="col-span-2 text-right">
                    {index === 0 && <label className="block text-caption text-surface-600 mb-1">Line Total</label>}
                    <p className="py-2 text-body-medium font-semibold text-surface-800">
                      {lineItem.quantity && Number(lineItem.quantity) > 0
                        ? formatCurrency(Number(lineItem.quantity) * Number(lineItem.unitPrice))
                        : '—'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {workflow === 'DIRECT' ? (
            <div>
              <label className="block text-body-medium font-semibold text-surface-900 mb-3">Payment Method</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(PAYMENT_LABELS)
                  .filter(([key]) => key !== 'PRE_ORDER')
                  .map(([key, label]) => (
                    <Button
                      key={key}
                      type="button"
                      variant={paymentMethod === key ? 'primary' : 'secondary'}
                      size="md"
                      onClick={() => setPaymentMethod(key)}
                    >
                      {label}
                    </Button>
                  ))}
              </div>
              {!paymentMethod && (
                <p className="text-caption text-warning-700 mt-3">
                  Choose the payment method before you save this sale.
                </p>
              )}
              <Card variant="outlined" padding="comfortable" className="mt-3 bg-surface-50">
                <p className="text-body-medium font-semibold text-surface-900">What happens when you save</p>
                <p className="text-body text-surface-700 mt-1">
                  {paymentMethod
                    ? DIRECT_PAYMENT_TRAIL_HINTS[paymentMethod]
                    : 'Pick a payment method first so the app knows where this money should land.'}
                </p>
                <p className="text-caption text-surface-600 mt-2">
                  You do not need to enter this same direct sale again in Banking.
                </p>
              </Card>
            </div>
          ) : (
            <Card variant="outlined" padding="comfortable" className="bg-surface-50">
              <p className="text-body text-surface-600">Payment method</p>
              <p className="text-body-medium font-semibold text-surface-900 mt-1">Pre-order</p>
              <p className="text-caption text-surface-600 mt-1">This pickup will be saved as a booking sale that was already paid for.</p>
            </Card>
          )}

          {totalQty > 0 && (
            <Card variant="outlined" padding="comfortable" className="bg-surface-50 space-y-2">
              {workflow === 'BOOKING' && selectedBooking && (
                <>
                  <div className="flex justify-between text-body">
                    <span className="text-surface-600">Booking target</span>
                    <span className="text-body-medium font-semibold text-surface-900">{selectedBooking.quantity.toLocaleString()} crates</span>
                  </div>
                  <div className="flex justify-between text-body">
                    <span className="text-surface-600">Remaining to enter</span>
                    <span className={`text-body-medium font-semibold ${bookingQuantityGap === 0 ? 'text-success-700' : bookingQuantityGap > 0 ? 'text-warning-700' : 'text-error-700'}`}>
                      {bookingQuantityGap === 0
                        ? 'Complete'
                        : bookingQuantityGap > 0
                          ? `${bookingQuantityGap.toLocaleString()} crates left`
                          : `${Math.abs(bookingQuantityGap).toLocaleString()} crates too many`}
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-body">
                <span className="text-surface-600">Total Quantity</span>
                <span className="text-body-medium font-semibold text-surface-900">{totalQty.toLocaleString()} crates</span>
              </div>
              <div className="flex justify-between text-body">
                <span className="text-surface-600">Total Amount</span>
                <span className="text-metric font-bold text-surface-900">{formatCurrency(totalAmount)}</span>
              </div>
              <div className="flex justify-between text-body">
                <span className="text-surface-600">Total Cost</span>
                <span className="text-body-medium font-semibold text-surface-700">{formatCurrency(totalCost)}</span>
              </div>
              <div className="flex justify-between text-body border-t border-surface-200 pt-2">
                <span className="text-surface-600">Gross Profit</span>
                <span className={`text-metric font-bold ${profit >= 0 ? 'text-success-600' : 'text-error-600'}`}>
                  {formatCurrency(profit)}
                </span>
              </div>
            </Card>
          )}

          <div className="flex flex-col sm:flex-row sm:justify-between gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="md"
              icon={<ChevronLeftIcon />}
              onClick={() => {
                setStep(2);
                setError('');
              }}
            >
              Back
            </Button>

            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <Button type="button" variant="ghost" size="md" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={submitting || !canSubmit}
                loading={submitting}
              >
                {workflow === 'BOOKING'
                  ? 'Complete booking pickup'
                  : `Record sale — ${formatCurrency(totalAmount)}`}
              </Button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}

function SaleDetailModal({ sale, onClose }) {
  const profit = sale.totalAmount - sale.totalCost;

  function customerLineItems(currentSale) {
    return (currentSale.lineItems || []).map((lineItem) => ({
      label: `Crate of Eggs${lineItem.batchEggCode?.code ? ` (${lineItem.batchEggCode.code})` : ''} (${SALE_TYPE_LABELS[lineItem.saleType] || lineItem.saleType})`,
      quantity: lineItem.quantity,
      unitPrice: lineItem.unitPrice,
      lineTotal: lineItem.lineTotal,
    }));
  }

  function handleCustomerPrint() {
    if (typeof window === 'undefined') return;
    const printWindow = window.open('', '_blank', 'width=420,height=900');
    if (!printWindow) return;

    const rows = customerLineItems(sale).map((lineItem) => `
      <tr>
        <td class="item">
          <div class="name">${lineItem.label}</div>
          <div class="meta">${lineItem.quantity} x ${formatCurrency(lineItem.unitPrice)}</div>
        </td>
        <td class="amount">${formatCurrency(lineItem.lineTotal)}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Customer Receipt ${sale.receiptNumber}</title>
          <style>
            @page { size: 80mm auto; margin: 6mm; }
            body {
              margin: 0;
              font-family: Arial, Helvetica, sans-serif;
              color: #111827;
              background: #ffffff;
            }
            .receipt {
              width: 72mm;
              margin: 0 auto;
              padding: 2mm 0;
              font-size: 13px;
              line-height: 1.5;
            }
            .center { text-align: center; }
            .hero-amount {
              font-size: 18px;
              font-weight: 700;
              margin-bottom: 2px;
            }
            .hero-label {
              font-size: 11px;
              color: #6b7280;
            }
            .rule {
              border-top: 1px solid #d1d5db;
              margin: 10px 0;
            }
            .meta-row {
              display: flex;
              justify-content: space-between;
              gap: 12px;
              margin: 4px 0;
            }
            .meta-stack {
              margin: 6px 0;
            }
            .meta-stack-label {
              color: #374151;
              font-weight: 400;
              margin-bottom: 2px;
            }
            .meta-stack-value {
              font-weight: 500;
            }
            .muted {
              color: #6b7280;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            td {
              vertical-align: top;
              padding: 5px 0;
            }
            .item {
              width: 70%;
            }
            .amount {
              width: 30%;
              text-align: right;
              white-space: nowrap;
              font-weight: 600;
            }
            .name {
              font-weight: 500;
              font-size: 13px;
            }
            .meta {
              color: #6b7280;
              font-size: 12px;
            }
            .summary-row td {
              padding: 3px 0;
            }
            .summary-label {
              color: #4b5563;
            }
            .summary-value {
              text-align: right;
              font-weight: 600;
            }
            .total-row td {
              padding-top: 6px;
              font-size: 14px;
              font-weight: 700;
            }
            .footer-row {
              display: flex;
              justify-content: space-between;
              gap: 12px;
              margin-top: 8px;
              color: #6b7280;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="receipt">
            <div class="center">
              <div class="hero-amount">${formatCurrency(sale.totalAmount)}</div>
              <div class="hero-label">Total</div>
            </div>

            <div class="rule"></div>

            <div class="meta-stack">
              <div class="meta-stack-label">Staff: ${sale.recordedBy ? `${sale.recordedBy.firstName} ${sale.recordedBy.lastName}` : '—'}</div>
              <div class="meta-stack-value">POS: Shop Floor POS</div>
            </div>

            <div class="rule"></div>

            <div class="meta-stack">
              <div class="meta-stack-label">Customer: ${sale.customer?.name || 'Walk-in customer'}</div>
              ${sale.customer?.phone ? `<div class="meta-stack-value">${sale.customer.phone}</div>` : ''}
            </div>

            <div class="rule"></div>

            <table>
              <tbody>${rows}</tbody>
            </table>

            <div class="rule"></div>

            <table>
              <tbody>
                <tr class="summary-row">
                  <td class="summary-label">Subtotal</td>
                  <td class="summary-value">${formatCurrency(sale.totalAmount)}</td>
                </tr>
                <tr class="summary-row total-row">
                  <td class="summary-label">Total</td>
                  <td class="summary-value">${formatCurrency(sale.totalAmount)}</td>
                </tr>
                <tr class="summary-row">
                  <td class="summary-label">Amount due</td>
                  <td class="summary-value">${formatCurrency(0)}</td>
                </tr>
                <tr class="summary-row">
                  <td class="summary-label">${PAYMENT_LABELS[sale.paymentMethod] || sale.paymentMethod}</td>
                  <td class="summary-value">${formatCurrency(sale.totalAmount)}</td>
                </tr>
              </tbody>
            </table>

            <div class="rule"></div>

            <div class="footer-row">
              <span>${formatDateTime(sale.saleDate)}</span>
              <span>No ${sale.receiptNumber}</span>
            </div>
          </div>
          <script>
            window.onload = function () {
              window.focus();
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  return (
    <Modal open={true} onClose={onClose} title={`Receipt ${sale.receiptNumber}`} size="lg" footer={false}>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-heading text-surface-900">Receipt {sale.receiptNumber}</p>
            <span className="text-body text-surface-500">{formatDate(sale.saleDate)}</span>
          </div>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={handleCustomerPrint}
            icon={<PrintIcon />}
          >
            Print receipt
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-body">
          <div>
            <p className="text-surface-600">Customer</p>
            <p className="text-body-medium font-semibold text-surface-900 mt-1">{sale.customer?.name}</p>
            {sale.customer?.phone && <p className="text-body text-surface-600 text-xs mt-1">{sale.customer.phone}</p>}
          </div>
          <div>
            <p className="text-surface-600">Batch</p>
            <p className="text-body-medium font-semibold text-surface-900 mt-1">{saleBatchLabel(sale)}</p>
          </div>
          <div>
            <p className="text-surface-600">Sale source</p>
            <p className="text-body-medium font-semibold text-surface-900 mt-1">{SOURCE_LABELS[sale.sourceType] || 'Direct sale'}</p>
          </div>
          <div>
            <p className="text-surface-600">Payment</p>
            <p className="text-body-medium font-semibold text-surface-900 mt-1">{PAYMENT_LABELS[sale.paymentMethod]}</p>
          </div>
          <div>
            <p className="text-surface-600">Recorded By</p>
            <p className="text-body-medium font-semibold text-surface-900 mt-1">
              {sale.recordedBy ? `${sale.recordedBy.firstName} ${sale.recordedBy.lastName}` : '—'}
            </p>
          </div>
          {sale.limitOverride && (
            <div>
              <p className="text-surface-600">Limit override</p>
              <p className="text-body-medium font-semibold text-surface-900 mt-1">{sale.limitOverride.by || 'Recorded override'}</p>
              {sale.limitOverride.at && <p className="text-caption text-surface-600 mt-1">{formatDate(sale.limitOverride.at)}</p>}
            </div>
          )}
          {sale.booking && (
            <div>
              <p className="text-surface-600">Booking</p>
              <p className="text-body-medium font-semibold text-surface-900 mt-1">{sale.booking.quantity} crates</p>
              <p className="text-caption text-surface-600 mt-1">Paid {formatCurrency(sale.booking.amountPaid)}</p>
            </div>
          )}
          {sale.paymentTransaction && (
            <div>
              <p className="text-surface-600">Money trail</p>
              <p className="text-body-medium font-semibold text-surface-900 mt-1">{paymentAccountLabel(sale.paymentTransaction)}</p>
              <p className="text-caption text-surface-600 mt-1">
                {formatCurrency(sale.paymentTransaction.amount)} recorded automatically
              </p>
            </div>
          )}
        </div>

        {sale.limitOverride?.note && (
          <Card variant="outlined" padding="comfortable" className="border-warning-200 bg-warning-50">
            <p className="text-overline text-warning-800">Limit Override Note</p>
            <p className="text-body text-warning-900 mt-2 whitespace-pre-wrap">{sale.limitOverride.note}</p>
          </Card>
        )}

        {sale.lineItems && sale.lineItems.length > 0 && (
          <div>
            <h3 className="text-overline text-surface-600 mb-3">Line Items</h3>
            <div className="overflow-x-auto custom-scrollbar">
              <Card variant="outlined" padding="compact">
                <table className="w-full min-w-[320px]">
                  <thead>
                    <tr className="border-b border-surface-200 bg-surface-50">
                      <th className="text-left py-3 px-4 text-overline text-surface-600">Code</th>
                      <th className="text-left py-3 px-4 text-overline text-surface-600">Batch</th>
                      <th className="text-center py-3 px-4 text-overline text-surface-600">Type</th>
                      <th className="text-right py-3 px-4 text-overline text-surface-600">Qty</th>
                      <th className="text-right py-3 px-4 text-overline text-surface-600">Price</th>
                      <th className="text-right py-3 px-4 text-overline text-surface-600">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sale.lineItems.map((lineItem) => (
                      <tr key={lineItem.id || lineItem.batchEggCodeId} className="border-b border-surface-100 text-body">
                        <td className="py-3 px-4 font-mono font-semibold text-brand-600">{lineItem.batchEggCode?.code || '—'}</td>
                        <td className="py-3 px-4 text-surface-700">{lineItem.batchEggCode?.batch?.name || saleBatchLabel(sale)}</td>
                        <td className="py-3 px-4 text-center">
                          <Badge color={SALE_TYPE_BADGE_COLORS[lineItem.saleType]} dot>
                            {SALE_TYPE_LABELS[lineItem.saleType]}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right">{lineItem.quantity}</td>
                        <td className="py-3 px-4 text-right">{formatCurrency(lineItem.unitPrice)}</td>
                        <td className="py-3 px-4 text-right text-body-medium font-semibold text-surface-900">{formatCurrency(lineItem.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          </div>
        )}

        <Card variant="outlined" padding="comfortable" className="bg-surface-50 space-y-1">
          <div className="flex justify-between text-body">
            <span className="text-surface-600">Total ({sale.totalQuantity} crates)</span>
            <span className="text-metric font-bold text-surface-900">{formatCurrency(sale.totalAmount)}</span>
          </div>
          <div className="flex justify-between text-body">
            <span className="text-surface-600">Cost</span>
            <span className="text-body-medium font-semibold text-surface-700">{formatCurrency(sale.totalCost)}</span>
          </div>
          <div className="flex justify-between text-body border-t border-surface-200 pt-1">
            <span className="text-surface-600">Gross Profit</span>
            <span className={`text-metric font-bold ${profit >= 0 ? 'text-success-600' : 'text-error-600'}`}>{formatCurrency(profit)}</span>
          </div>
        </Card>

        <div className="flex justify-end pt-2">
          <Button onClick={onClose} variant="ghost" size="md">Close</Button>
        </div>
      </div>
    </Modal>
  );
}
