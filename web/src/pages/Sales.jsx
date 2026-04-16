import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Button, Input, Select, Modal, Card, Badge, EmptyState, useToast } from '../components/ui';

const PAYMENT_LABELS = { CASH: 'Cash', TRANSFER: 'Transfer', POS_CARD: 'POS/Card', PRE_ORDER: 'Pre-order', MIXED: 'Mixed' };
const SALE_TYPE_LABELS = { WHOLESALE: 'Wholesale', RETAIL: 'Retail', CRACKED: 'Cracked', WRITE_OFF: 'Write-off' };
const SALE_TYPE_BADGE_COLORS = {
  WHOLESALE: 'success',
  RETAIL: 'info',
  CRACKED: 'warning',
  WRITE_OFF: 'error',
};
const SOURCE_LABELS = { BOOKING: 'Booking pickup', DIRECT: 'Direct sale' };
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

function bookingPaymentTruthMeta(booking) {
  const checkout = booking?.portalCheckout;
  if (checkout?.paymentMethod === 'TRANSFER') {
    if (checkout.status === 'ADMIN_CONFIRMED') {
      return {
        label: 'Waiting for statement',
        description: 'Staff has seen the transfer, but the final financial truth still needs the bank statement match.',
        color: 'warning',
      };
    }
    if (checkout.status === 'AWAITING_TRANSFER') {
      return {
        label: 'Waiting for admin',
        description: 'The customer said they transferred, but staff has not confirmed seeing the money yet.',
        color: 'neutral',
      };
    }
    if (checkout.status === 'PAID' && checkout.confirmationStatementLineId) {
      return {
        label: 'Statement confirmed',
        description: 'This transfer has been fully confirmed from the bank statement.',
        color: 'success',
      };
    }
    if (checkout.status === 'PAID') {
      return {
        label: 'Transfer confirmed',
        description: 'This transfer has been confirmed and is ready for pickup.',
        color: 'success',
      };
    }
    if (checkout.status === 'CANCELLED') {
      return {
        label: 'Transfer declined',
        description: 'This transfer was declined and should not be fulfilled.',
        color: 'error',
      };
    }
  }
  if (checkout?.paymentMethod === 'CARD' && checkout.status === 'PAID') {
    return {
      label: 'Card verified',
      description: 'This portal card payment was verified automatically.',
      color: 'success',
    };
  }
  return {
    label: booking?.isFullyPaid ? 'Paid and ready' : 'Needs payment',
    description: booking?.isFullyPaid
      ? 'This booking is fully paid and can be completed now.'
      : 'Record the remaining payment in Banking before pickup.',
    color: booking?.isFullyPaid ? 'success' : 'warning',
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

function paymentRowLabel(paymentTransaction, fallbackMethod = '') {
  if (!paymentTransaction) return PAYMENT_LABELS[fallbackMethod] || fallbackMethod || 'Payment';
  if (paymentTransaction.bankAccount?.accountType === 'CASH_ON_HAND') return PAYMENT_LABELS.CASH;
  if (paymentTransaction.category === 'DIRECT_SALE_TRANSFER') return PAYMENT_LABELS.TRANSFER;
  if (paymentTransaction.category === 'POS_SETTLEMENT') return PAYMENT_LABELS.POS_CARD;
  return PAYMENT_LABELS[fallbackMethod] || fallbackMethod || 'Payment';
}

function salePaymentRows(sale) {
  if (sale.paymentTransactions?.length) return sale.paymentTransactions;
  if (sale.paymentTransaction) return [sale.paymentTransaction];
  if (sale.paymentMethod === 'PRE_ORDER') {
    return [{ id: 'pre-order', amount: sale.totalAmount, category: 'PRE_ORDER', bankAccount: null }];
  }
  return [];
}

function saleBatchLabel(sale) {
  return sale.batchSummary || sale.batch?.name || '—';
}

function saleSourceBadgeMeta(sale) {
  if (sale.booking?.portalCheckout?.checkoutType === 'BUY_NOW') {
    return { label: 'Portal buy now', color: 'info' };
  }
  if (sale.booking?.portalCheckout?.checkoutType === 'BOOK_UPCOMING') {
    return { label: 'Portal booking', color: 'brand' };
  }
  if (sale.sourceType === 'BOOKING') {
    return { label: 'Booking pickup', color: 'success' };
  }
  return { label: 'Direct sale', color: 'neutral' };
}

function saleSettlementMoments(sale) {
  const moments = [];
  if (sale.booking?.createdAt) {
    moments.push({
      label: 'Booking created',
      value: formatDateTime(sale.booking.createdAt),
      tone: 'neutral',
    });
  }
  if (sale.booking?.portalCheckout?.createdAt) {
    moments.push({
      label: 'Portal checkout started',
      value: formatDateTime(sale.booking.portalCheckout.createdAt),
      tone: 'neutral',
    });
  }
  if (sale.booking?.portalCheckout?.adminConfirmedAt) {
    moments.push({
      label: 'Staff saw transfer',
      value: formatDateTime(sale.booking.portalCheckout.adminConfirmedAt),
      tone: 'warning',
    });
  }
  if (sale.booking?.portalCheckout?.verifiedAt) {
    moments.push({
      label: sale.booking?.portalCheckout?.confirmationStatementLineId ? 'Statement confirmed' : 'Payment confirmed',
      value: formatDateTime(sale.booking.portalCheckout.verifiedAt),
      tone: 'success',
    });
  }
  moments.push({
    label: sale.sourceType === 'BOOKING' ? 'Pickup completed' : 'Sale recorded',
    value: formatDateTime(sale.saleDate),
    tone: 'success',
  });
  return moments;
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
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const [showRecordSale, setShowRecordSale] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);

  const canRecord = ['ADMIN', 'MANAGER', 'SHOP_FLOOR'].includes(user?.role);
  const canViewReports = ['ADMIN', 'MANAGER'].includes(user?.role);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    loadSales();
  }, [dateFilter, paymentFilter, search, page, pageSize]);

  useEffect(() => {
    if (canViewReports) loadSummary();
  }, [dateFilter, canViewReports]);

  async function loadSales() {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams();
      query.set('date', dateFilter);
      query.set('limit', String(pageSize));
      query.set('offset', String((page - 1) * pageSize));
      if (paymentFilter) query.set('paymentMethod', paymentFilter);
      if (search) query.set('search', search);
      const params = `?${query.toString()}`;
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
        <p className="text-body text-surface-600">
          Start with the customer. If they have a paid booking, finish the pickup. Otherwise, record a direct sale.
        </p>
      </Card>

      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div className="flex-1 min-w-[220px]">
          <Input
            label="Search"
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Receipt, customer, phone, batch, or portal ref"
            size="md"
          />
        </div>
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
          onClick={() => {
            setDateFilter(todayStr());
            setSearchInput('');
            setPaymentFilter('');
            setPage(1);
          }}
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
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-14 bg-surface-100 rounded-lg animate-pulse" />
          ))}
        </div>
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
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-caption text-surface-500">{total} sale record(s) in view.</p>
            <div className="flex items-center gap-3">
              <Select
                value={String(pageSize)}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                size="sm"
              >
                {[25, 50, 100, 200, 250].map((option) => (
                  <option key={option} value={option}>{option} / page</option>
                ))}
              </Select>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <span className="text-caption text-surface-600">
                Page {page} of {Math.max(1, Math.ceil(total / pageSize))}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((current) => Math.min(Math.max(1, Math.ceil(total / pageSize)), current + 1))}
                disabled={page >= Math.max(1, Math.ceil(total / pageSize))}
              >
                Next
              </Button>
            </div>
          </div>
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
    recentFulfilments: [],
    directSaleBatches: [],
    mixedDirectSaleStock: [],
  });

  const [workflow, setWorkflow] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [saleScopeLabel, setSaleScopeLabel] = useState('');
  const [lineItems, setLineItems] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentBreakdown, setPaymentBreakdown] = useState([{ paymentMethod: '', amount: '' }]);
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
        recentFulfilments: data.recentFulfilments || [],
        directSaleBatches: data.directSaleBatches || [],
        mixedDirectSaleStock: data.mixedDirectSaleStock || [],
      });
    } catch {
      setWorkspaceError('Failed to load this customer\'s sales options');
      setCustomerWorkspace({ customer: null, bookings: [], recentFulfilments: [], directSaleBatches: [], mixedDirectSaleStock: [] });
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
    setPaymentBreakdown([{ paymentMethod: '', amount: '' }]);
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
    setPaymentBreakdown([]);
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
    setPaymentBreakdown([{ paymentMethod: '', amount: '' }]);
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
    setPaymentBreakdown([{ paymentMethod: '', amount: '' }]);
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

  function updatePaymentRow(index, field, value) {
    setPaymentBreakdown((current) => current.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [field]: value } : row
    )));
  }

  function addPaymentRow() {
    setPaymentBreakdown((current) => [...current, { paymentMethod: '', amount: '' }]);
  }

  function removePaymentRow(index) {
    setPaymentBreakdown((current) => {
      if (current.length === 1) return [{ paymentMethod: '', amount: '' }];
      return current.filter((_, rowIndex) => rowIndex !== index);
    });
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
  const activePaymentRows = paymentBreakdown.filter((row) => row.paymentMethod && Number(row.amount) > 0);
  const paymentTotal = activePaymentRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const paymentGap = totalAmount - paymentTotal;
  const isDirectPaymentChosen = workflow !== 'DIRECT' || activePaymentRows.length > 0;
  const isPaymentBalanced = workflow !== 'DIRECT' || (totalAmount > 0 && Math.abs(paymentGap) <= 0.009);
  const canSubmit =
    workflow === 'BOOKING'
      ? !!selectedBooking && selectedBooking.isFullyPaid && isBookingQuantityReady
      : totalQty > 0 && isDirectPaymentChosen && isPaymentBalanced && (!needsLimitOverride || limitOverrideNote.trim().length > 0);

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
      const paymentPayload = workflow === 'DIRECT'
        ? activePaymentRows.map((row) => ({
            paymentMethod: row.paymentMethod,
            amount: Number(row.amount),
          }))
        : [];
      await api.post('/sales', {
        customerId: selectedCustomer.id,
        bookingId: workflow === 'BOOKING' ? selectedBooking.id : undefined,
        batchId: workflow === 'DIRECT' ? selectedBatch?.id : undefined,
        paymentMethod: workflow === 'DIRECT' && paymentPayload.length === 1 ? paymentPayload[0].paymentMethod : undefined,
        paymentBreakdown: workflow === 'DIRECT' ? paymentPayload : undefined,
        limitOverrideNote: workflow === 'DIRECT' ? limitOverrideNote.trim() || undefined : undefined,
        lineItems: activeItems.map((lineItem) => ({
          batchEggCodeId: lineItem.batchEggCodeId,
          saleType: lineItem.saleType,
          quantity: Number(lineItem.quantity),
          unitPrice: Number(lineItem.unitPrice),
        })),
      });

      // Post-sale banking feedback
      if (workflow === 'BOOKING') {
        toast.success('Booking pickup completed. Receipt is ready.');
      } else {
        const methods = paymentPayload.map(r => r.paymentMethod);
        const hasCash = methods.includes('CASH');
        const hasTransferOrCard = methods.some(m => m === 'TRANSFER' || m === 'POS_CARD');

        if (hasCash && hasTransferOrCard) {
          toast.success('Sale recorded. Cash portion added to undeposited cash in Banking. Transfer/card will appear when entered from the bank statement.');
        } else if (hasCash) {
          toast.success('Sale recorded. Added to undeposited cash in Banking.');
        } else {
          toast.success('Sale recorded. Will appear in Banking when the record keeper enters it from the bank statement.');
        }
      }

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
          <Input
            label="Search Customer"
            placeholder="Name or phone number"
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            autoFocus
            size="md"
          />

          <Card variant="outlined" padding="comfortable" className="border-dashed">
            <div className="flex items-center justify-between gap-3">
              <p className="text-body text-surface-600">Customer not found?</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowCreateCustomer((current) => !current);
                  setError('');
                }}
              >
                {showCreateCustomer ? 'Hide' : 'Create new'}
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
                <p className="text-caption text-warning-700 bg-warning-50 border border-warning-200 rounded-lg px-3 py-2">
                  New customers have an early-order limit. A staff note is required if the sale exceeds it.
                </p>
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
        <div className="space-y-4">
          {/* Customer bar */}
          <div className="flex items-center gap-3 bg-surface-50 rounded-lg px-4 py-3">
            <span className="text-body-medium font-semibold text-surface-900">{selectedCustomer?.name}</span>
            {selectedCustomer?.phone && <span className="text-body text-surface-500">{selectedCustomer.phone}</span>}
            {orderLimitProfile?.isUsingEarlyOrderLimit && (
              <Badge color="warning" dot>Max {orderLimitProfile.currentPerOrderLimit} crates</Badge>
            )}
            <button
              onClick={() => {
                setStep(1);
                setSelectedBatch(null);
                setSelectedBooking(null);
                setWorkflow('');
                setLineItems([]);
              }}
              className="ml-auto text-caption text-brand-600 hover:text-brand-700 font-medium"
            >
              Change
            </button>
          </div>

          {loadingWorkspace ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-20 bg-surface-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {/* Bookings section */}
              {customerWorkspace.bookings.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-overline text-surface-500">Open bookings</h3>
                  <div className="space-y-2">
                    {customerWorkspace.bookings.map((booking) => {
                      const sourceMeta = bookingSourceMeta(booking);
                      return (
                        <button
                          key={booking.id}
                          type="button"
                          disabled={!booking.isFullyPaid}
                          onClick={() => booking.isFullyPaid && chooseBooking(booking)}
                          className={`w-full text-left rounded-lg border px-4 py-3 transition-colors ${
                            booking.isFullyPaid
                              ? 'border-success-200 bg-success-50/50 hover:bg-success-50 cursor-pointer'
                              : 'border-surface-200 bg-surface-50 opacity-75 cursor-not-allowed'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-body-medium font-semibold text-surface-900">
                                {booking.batch?.name || 'Batch'}
                              </span>
                              <span className="text-body text-surface-600">
                                {booking.quantity} crates
                              </span>
                              <Badge color={sourceMeta.color} dot>{sourceMeta.label}</Badge>
                              {booking.portalCheckout?.reference && (
                                <span className="text-caption text-surface-400 font-mono">{booking.portalCheckout.reference}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {booking.isFullyPaid ? (
                                <Badge color="success" dot>Ready for pickup</Badge>
                              ) : (
                                <Badge color="warning" dot>{formatCurrency(booking.balance)} due</Badge>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Divider when both sections exist */}
              {customerWorkspace.bookings.length > 0 && customerWorkspace.directSaleBatches.length > 0 && (
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-surface-200" /></div>
                  <div className="relative flex justify-center">
                    <span className="bg-white px-3 text-caption text-surface-400">or</span>
                  </div>
                </div>
              )}

              {/* Direct sale section */}
              <section className="space-y-3">
                <h3 className="text-overline text-surface-500">Direct sale</h3>

                {customerWorkspace.mixedDirectSaleStock?.length > 0 && customerWorkspace.directSaleBatches.length > 1 && (
                  <button
                    type="button"
                    onClick={() => chooseMixedDirectSale()}
                    className="w-full text-left rounded-lg border border-brand-200 bg-brand-50/30 px-4 py-3 hover:bg-brand-50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-body-medium font-semibold text-surface-900">All available stock</span>
                        <span className="text-caption text-surface-500">across {customerWorkspace.directSaleBatches.length} batches</span>
                      </div>
                      <span className="text-caption text-brand-600 font-medium">Recommended</span>
                    </div>
                  </button>
                )}

                {customerWorkspace.directSaleBatches.length === 0 ? (
                  <div className="text-center py-6 text-body text-surface-400">
                    {customerWorkspace.bookings.length === 0
                      ? 'No batches available right now'
                      : 'No batches available for direct sale'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {customerWorkspace.directSaleBatches.map((batch) => (
                      <button
                        key={batch.id}
                        type="button"
                        onClick={() => chooseDirectSale(batch)}
                        className="w-full text-left border border-surface-200 rounded-lg px-4 py-3 hover:border-surface-300 hover:bg-surface-50 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-body-medium font-semibold text-surface-900">{batch.name}</span>
                            <span className="text-body text-surface-600">
                              W {formatCurrency(batch.wholesalePrice)} · R {formatCurrency(batch.retailPrice)}
                            </span>
                            <span className="text-caption text-surface-500">
                              {batch.availableForSale?.toLocaleString?.() || 0} available
                            </span>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            {batch.eggCodes.map((eggCode) => (
                              <span key={eggCode.id} className="text-caption font-mono bg-surface-100 text-surface-600 px-1.5 py-0.5 rounded">
                                {eggCode.code}
                              </span>
                            ))}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* Recent sales — collapsed by default */}
              {customerWorkspace.recentFulfilments?.length > 0 && (
                <details className="group">
                  <summary className="cursor-pointer text-caption text-surface-400 hover:text-surface-600 select-none py-1">
                    Recent sales ({customerWorkspace.recentFulfilments.length})
                  </summary>
                  <div className="mt-2 space-y-1.5">
                    {customerWorkspace.recentFulfilments.map((sale) => (
                      <div key={sale.id} className="flex items-center justify-between gap-3 px-3 py-2 bg-surface-50 rounded-lg text-caption">
                        <span className="text-surface-600 font-mono">{sale.receiptNumber}</span>
                        <span className="text-surface-500">
                          {sale.totalQuantity} crates · {formatCurrency(sale.totalAmount)} · {formatDate(sale.saleDate)}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
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

          {workflow === 'BOOKING' && !selectedBooking?.isFullyPaid && (
            <p className="text-body text-warning-700 bg-warning-50 border border-warning-200 rounded-lg px-4 py-2">
              This booking still has a balance. Record the remaining payment in Banking first.
            </p>
          )}

          {needsLimitOverride && (
            <Card variant="outlined" padding="compact" className="border-error-200 bg-error-50">
              <p className="text-body text-error-800">
                This sale exceeds the {orderLimitProfile.currentPerOrderLimit}-crate limit for this customer.
              </p>
              <textarea
                value={limitOverrideNote}
                onChange={(e) => setLimitOverrideNote(e.target.value)}
                rows={2}
                placeholder="Reason for override (required)"
                className="w-full mt-2 border border-error-300 rounded-lg px-3 py-2 text-body focus:ring-2 focus:ring-error-500 focus:border-error-500 outline-none"
              />
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
              <label className="block text-body-medium font-semibold text-surface-900 mb-3">Payment breakdown</label>
              <div className="space-y-3">
                {paymentBreakdown.map((row, index) => (
                  <div key={`payment-row-${index}`} className="grid grid-cols-1 gap-3 rounded-lg border border-surface-200 p-3 sm:grid-cols-[1fr_180px_auto]">
                    <Select
                      value={row.paymentMethod}
                      onChange={(e) => updatePaymentRow(index, 'paymentMethod', e.target.value)}
                      size="md"
                    >
                      <option value="">Choose payment method</option>
                      {Object.entries(PAYMENT_LABELS)
                        .filter(([key]) => !['PRE_ORDER', 'MIXED'].includes(key))
                        .map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                    </Select>
                    <Input
                      label="Amount"
                      type="number"
                      min="0"
                      value={row.amount}
                      onChange={(e) => updatePaymentRow(index, 'amount', e.target.value)}
                      placeholder="0"
                      size="md"
                    />
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="md"
                        onClick={() => removePaymentRow(index)}
                        disabled={paymentBreakdown.length === 1}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button type="button" variant="secondary" size="md" onClick={addPaymentRow}>
                  Add payment part
                </Button>
                <p className={`text-caption ${activePaymentRows.length === 0 ? 'text-warning-700' : Math.abs(paymentGap) <= 0.009 ? 'text-success-700' : 'text-warning-700'}`}>
                  {activePaymentRows.length === 0
                    ? 'Add at least one payment part before you save this sale.'
                    : Math.abs(paymentGap) <= 0.009
                      ? 'Payments balance exactly.'
                      : paymentGap > 0
                        ? `${formatCurrency(paymentGap)} still needs to be covered.`
                        : `${formatCurrency(Math.abs(paymentGap))} is too much. Reduce the payment parts.`}
                </p>
              </div>
              <p className="text-caption text-surface-400 mt-2">
                Banking entries are created automatically — no need to record this sale there.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-caption text-surface-500 px-1">
              <Badge color="neutral" dot>Pre-order</Badge>
              <span>Already paid via booking</span>
            </div>
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
              {workflow === 'DIRECT' && (
                <>
                  <div className="flex justify-between text-body">
                    <span className="text-surface-600">Payments entered</span>
                    <span className="text-body-medium font-semibold text-surface-900">{formatCurrency(paymentTotal)}</span>
                  </div>
                  <div className="flex justify-between text-body">
                    <span className="text-surface-600">Difference</span>
                    <span className={`text-body-medium font-semibold ${Math.abs(paymentGap) <= 0.009 ? 'text-success-700' : paymentGap > 0 ? 'text-warning-700' : 'text-error-700'}`}>
                      {Math.abs(paymentGap) <= 0.009 ? 'Balanced' : paymentGap > 0 ? `${formatCurrency(paymentGap)} short` : `${formatCurrency(Math.abs(paymentGap))} over`}
                    </span>
                  </div>
                </>
              )}
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
  const paymentRows = salePaymentRows(sale);
  const settlementMoments = saleSettlementMoments(sale);

  function customerLineItems(currentSale) {
    return (currentSale.lineItems || []).map((lineItem) => ({
      label: `Crate of Eggs (${SALE_TYPE_LABELS[lineItem.saleType] || lineItem.saleType})`,
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
            <!-- Business header with logo -->
            <div class="center" style="margin-bottom:8px;">
              <img src="/logo.webp" alt="Fresh Eggs" style="width:80px;height:auto;margin:0 auto 6px;" onerror="this.style.display='none'" />
              <div style="font-size:16px;font-weight:700;letter-spacing:0.5px;">Fresh Eggs Market</div>
              <div style="font-size:12px;color:#6b7280;margin-top:2px;">SALES RECEIPT</div>
              <div style="font-size:11px;color:#6b7280;margin-top:6px;line-height:1.5;">
                Spring Valley Estate, Alasia Bus-stop,<br/>
                Lekki-Epe Expressway, Lagos<br/>
                0916-000-7184 &nbsp; info@fresheggsmarket.ng<br/>
                www.fresheggsmarket.ng
              </div>
            </div>

            <div class="rule"></div>

            <div class="center">
              <div class="hero-amount">${formatCurrency(sale.totalAmount)}</div>
              <div class="hero-label">Total</div>
            </div>

            <div class="rule"></div>

            <div class="meta-stack">
              <div class="meta-stack-label">Employee: ${sale.recordedBy ? `${sale.recordedBy.firstName} ${sale.recordedBy.lastName}` : '—'}</div>
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
                ${paymentRows.map((row) => `
                  <tr class="summary-row">
                    <td class="summary-label">${paymentRowLabel(row, sale.paymentMethod)}</td>
                    <td class="summary-value">${formatCurrency(row.amount)}</td>
                  </tr>
                `).join('')}
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
              {sale.booking.portalCheckout?.reference && (
                <p className="text-caption text-surface-500 font-mono mt-1">{sale.booking.portalCheckout.reference}</p>
              )}
            </div>
          )}
          {paymentRows.length > 0 && (
            <div>
              <p className="text-surface-600">Money trail</p>
              <div className="mt-1 space-y-2">
                {paymentRows.map((row) => (
                  <div key={row.id}>
                    <p className="text-body-medium font-semibold text-surface-900">{row.bankAccount ? paymentAccountLabel(row) : 'Already covered before pickup'}</p>
                    <p className="text-caption text-surface-600">
                      {paymentRowLabel(row, sale.paymentMethod)} · {formatCurrency(row.amount)}{row.bankAccount ? ' recorded automatically' : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {sale.limitOverride?.note && (
          <Card variant="outlined" padding="comfortable" className="border-warning-200 bg-warning-50">
            <p className="text-overline text-warning-800">Limit Override Note</p>
            <p className="text-body text-warning-900 mt-2 whitespace-pre-wrap">{sale.limitOverride.note}</p>
          </Card>
        )}

        {sale.sourceType === 'BOOKING' && settlementMoments.length > 0 && (
          <Card variant="outlined" padding="comfortable" className="bg-surface-50">
            <p className="text-overline text-surface-600 mb-3">Settlement History</p>
            <div className="space-y-3">
              {settlementMoments.map((moment) => (
                <div key={`${moment.label}-${moment.value}`} className="flex items-start justify-between gap-3 border-b border-surface-200 pb-3 last:border-b-0 last:pb-0">
                  <div>
                    <p className="text-body-medium font-semibold text-surface-900">{moment.label}</p>
                    <p className="text-caption text-surface-600 mt-1">{moment.value}</p>
                  </div>
                  <Badge color={moment.tone} dot>{moment.label}</Badge>
                </div>
              ))}
            </div>
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
