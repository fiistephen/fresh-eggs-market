import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

const PAYMENT_LABELS = { CASH: 'Cash', TRANSFER: 'Transfer', POS_CARD: 'POS/Card', PRE_ORDER: 'Pre-order' };
const SALE_TYPE_LABELS = { WHOLESALE: 'Wholesale', RETAIL: 'Retail', CRACKED: 'Cracked', WRITE_OFF: 'Write-off' };
const SALE_TYPE_COLORS = {
  WHOLESALE: 'bg-blue-100 text-blue-700',
  RETAIL: 'bg-green-100 text-green-700',
  CRACKED: 'bg-yellow-100 text-yellow-700',
  WRITE_OFF: 'bg-red-100 text-red-700',
};
const SOURCE_LABELS = { BOOKING: 'Booking pickup', DIRECT: 'Direct sale' };
const DIRECT_PAYMENT_TRAIL_HINTS = {
  CASH: 'This sale will add money to Cash Account automatically.',
  TRANSFER: 'This sale will add money to Customer Deposit Account automatically.',
  POS_CARD: 'This sale will add a POS settlement record to Customer Deposit Account automatically.',
};

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

export default function Sales() {
  const { user } = useAuth();
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Sales</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Finish paid bookings, record walk-in sales, and review what was sold today.
          </p>
        </div>
        {canRecord && (
          <button
            onClick={() => setShowRecordSale(true)}
            className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <span className="text-lg leading-none">+</span> Record or Fulfill Sale
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <p className="text-sm font-medium text-gray-900">How to use this page</p>
        <p className="text-sm text-gray-600 mt-1">
          Start with the customer. If they already have a paid booking, finish the pickup here. If not, record a direct sale.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Date</label>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Payment Method</label>
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          >
            <option value="">All methods</option>
            {Object.entries(PAYMENT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setDateFilter(todayStr())}
          className="text-sm text-brand-500 hover:text-brand-600 font-medium"
        >
          Today
        </button>
      </div>

      {canViewReports && summary && !loadingSummary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Total Sales</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(summary.summary.totalSales)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Total Cost</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(summary.summary.totalCost)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Gross Profit</p>
            <p className={`text-xl font-bold mt-1 ${summary.summary.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(summary.summary.grossProfit)}
            </p>
            <p className="text-xs text-gray-400">{summary.summary.margin}% margin</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Transactions</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{summary.summary.transactionCount}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Crates Sold</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{summary.summary.totalQuantity.toLocaleString()}</p>
          </div>
        </div>
      )}

      {canViewReports && summary && Object.keys(summary.byPaymentMethod).length > 0 && (
        <div className="flex flex-wrap gap-3 mb-6">
          {Object.entries(summary.byPaymentMethod).map(([method, data]) => (
            <div key={method} className="bg-white rounded-lg border border-gray-200 px-4 py-2 flex items-center gap-3">
              <span className="text-sm text-gray-500">{PAYMENT_LABELS[method] || method}</span>
              <span className="font-semibold text-gray-900">{formatCurrency(data.total)}</span>
              <span className="text-xs text-gray-400">({data.count})</span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading sales...</div>
      ) : sales.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">💰</div>
          <p className="text-gray-500">No sales recorded for {formatDate(dateFilter)}</p>
          {canRecord && (
            <button
              onClick={() => setShowRecordSale(true)}
              className="mt-4 text-brand-500 hover:text-brand-600 text-sm font-medium"
            >
              Record or fulfill a sale
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Receipt #</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Batch</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Payment</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => {
                  const mainType = sale.lineItems?.[0]?.saleType || 'WHOLESALE';
                  return (
                    <tr
                      key={sale.id}
                      onClick={() => setSelectedSale(sale)}
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-mono text-sm text-gray-600">{sale.receiptNumber}</td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-gray-900 text-sm">{sale.customer?.name || '—'}</span>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          sale.sourceType === 'BOOKING' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {SOURCE_LABELS[sale.sourceType] || 'Direct sale'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm font-medium text-gray-700">{sale.batch?.name || '—'}</td>
                      <td className="py-3 px-4 text-sm text-right">{sale.totalQuantity.toLocaleString()}</td>
                      <td className="py-3 px-4 text-sm text-right font-medium">{formatCurrency(sale.totalAmount)}</td>
                      <td className="py-3 px-4 text-sm text-center">{PAYMENT_LABELS[sale.paymentMethod] || sale.paymentMethod}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${SALE_TYPE_COLORS[mainType]}`}>
                          {SALE_TYPE_LABELS[mainType]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-3">{total} sale record(s) shown.</p>
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
  const [step, setStep] = useState(1);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');
  const [customerWorkspace, setCustomerWorkspace] = useState({ bookings: [], directSaleBatches: [] });

  const [workflow, setWorkflow] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('CASH');

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
        bookings: data.bookings || [],
        directSaleBatches: data.directSaleBatches || [],
      });
    } catch {
      setWorkspaceError('Failed to load this customer’s sales options');
      setCustomerWorkspace({ bookings: [], directSaleBatches: [] });
    } finally {
      setLoadingWorkspace(false);
    }
  }

  function initializeLineItems(batch, options = {}) {
    const { presetQuantity = '' } = options;
    setLineItems((batch?.eggCodes || []).map((eggCode, index) => ({
      batchEggCodeId: eggCode.id,
      code: eggCode.code,
      costPrice: eggCode.costPrice,
      saleType: 'WHOLESALE',
      quantity: index === 0 && presetQuantity ? String(presetQuantity) : '',
      unitPrice: batch.wholesalePrice,
    })));
  }

  function chooseCustomer(customer) {
    setSelectedCustomer(customer);
    setSelectedBooking(null);
    setSelectedBatch(null);
    setWorkflow('');
    setLineItems([]);
    setPaymentMethod('CASH');
    setError('');
    setStep(2);
  }

  function chooseBooking(booking) {
    setWorkflow('BOOKING');
    setSelectedBooking(booking);
    setSelectedBatch(booking.batch);
    setPaymentMethod('PRE_ORDER');
    initializeLineItems(booking.batch, { presetQuantity: booking.quantity });
    setError('');
    setStep(3);
  }

  function chooseDirectSale(batch) {
    setWorkflow('DIRECT');
    setSelectedBooking(null);
    setSelectedBatch(batch);
    setPaymentMethod('CASH');
    initializeLineItems(batch);
    setError('');
    setStep(3);
  }

  function updateLineItem(index, field, value) {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };

    if (field === 'saleType' && selectedBatch) {
      if (value === 'WHOLESALE') updated[index].unitPrice = selectedBatch.wholesalePrice;
      else if (value === 'RETAIL') updated[index].unitPrice = selectedBatch.retailPrice;
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
  const canSubmit =
    workflow === 'BOOKING'
      ? !!selectedBooking && selectedBooking.isFullyPaid && isBookingQuantityReady
      : !!selectedBatch && totalQty > 0;

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
        batchId: workflow === 'DIRECT' ? selectedBatch.id : undefined,
        paymentMethod: workflow === 'DIRECT' ? paymentMethod : undefined,
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-3 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Record or Fulfill Sale</h2>
          <div className="flex gap-2 mt-2 flex-wrap">
            {['1. Customer', '2. Choose sale path', '3. Confirm items'].map((label, index) => (
              <span
                key={label}
                className={`text-xs font-medium px-2 py-0.5 rounded ${
                  step >= index + 1 ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-400'
                }`}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {(error || workspaceError) && (
            <div className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm mb-4">{error || workspaceError}</div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Search Customer</label>
                <input
                  type="text"
                  placeholder="Type the customer name or phone number"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  autoFocus
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Start here so the app can show existing bookings before you record a new sale.
                </p>
              </div>

              {searchingCustomers && <p className="text-sm text-gray-400">Searching...</p>}

              {customers.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                  {customers.map((customer) => (
                    <button
                      key={customer.id}
                      onClick={() => chooseCustomer(customer)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors"
                    >
                      <span className="font-medium text-gray-900">{customer.name}</span>
                      <span className="text-sm text-gray-400 ml-2">{customer.phone}</span>
                    </button>
                  ))}
                </div>
              )}

              {customerSearch && !searchingCustomers && customers.length === 0 && (
                <p className="text-sm text-gray-400">No customers found</p>
              )}

              <div className="flex justify-end pt-2">
                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-sm">
                <span className="text-gray-500">Customer:</span>
                <span className="font-medium text-gray-900">{selectedCustomer?.name}</span>
                {selectedCustomer?.phone && <span className="text-gray-400">{selectedCustomer.phone}</span>}
                <button
                  onClick={() => {
                    setStep(1);
                    setSelectedBatch(null);
                    setSelectedBooking(null);
                    setWorkflow('');
                    setLineItems([]);
                  }}
                  className="ml-auto text-xs text-gray-400 hover:text-gray-600"
                >
                  Change
                </button>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-base font-semibold text-gray-900">Choose what you want to do</p>
                <p className="text-sm text-gray-600 mt-1">
                  If this customer already paid for a booking, finish the pickup. If not, record a direct sale.
                </p>
              </div>

              {loadingWorkspace ? (
                <p className="text-sm text-gray-400">Loading customer options...</p>
              ) : (
                <>
                  <section className="space-y-3">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">1. Complete a paid booking</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Use this when the customer already booked eggs and the payment is complete.
                      </p>
                    </div>

                    {customerWorkspace.bookings.length === 0 ? (
                      <div className="border border-dashed border-gray-300 rounded-xl p-4 text-sm text-gray-500">
                        This customer has no open bookings right now.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {customerWorkspace.bookings.map((booking) => (
                          <div key={booking.id} className="border border-gray-200 rounded-xl p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-gray-900">{booking.batch?.name || 'Batch'}</p>
                                <p className="text-sm text-gray-500 mt-1">
                                  {booking.quantity} crates booked on {formatDate(booking.createdAt)}
                                </p>
                              </div>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                booking.isFullyPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                              }`}>
                                {booking.isFullyPaid ? 'Ready for pickup' : 'Needs full payment'}
                              </span>
                            </div>

                            <div className="grid grid-cols-3 gap-3 mt-4 text-sm">
                              <div>
                                <p className="text-gray-400">Booking value</p>
                                <p className="font-medium text-gray-900">{formatCurrency(booking.orderValue)}</p>
                              </div>
                              <div>
                                <p className="text-gray-400">Paid</p>
                                <p className="font-medium text-gray-900">{formatCurrency(booking.amountPaid)}</p>
                              </div>
                              <div>
                                <p className="text-gray-400">Balance</p>
                                <p className={`font-medium ${booking.balance > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                                  {formatCurrency(booking.balance)}
                                </p>
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={!booking.isFullyPaid}
                              onClick={() => chooseBooking(booking)}
                              className={`mt-4 w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                booking.isFullyPaid
                                  ? 'bg-brand-500 hover:bg-brand-600 text-white'
                                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              }`}
                            >
                              {booking.isFullyPaid ? 'Use this booking' : 'Record remaining payment first'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="space-y-3">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">2. Record a direct sale</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Use this for walk-in sales or any sale that is not tied to an existing booking.
                      </p>
                    </div>

                    {customerWorkspace.directSaleBatches.length === 0 ? (
                      <div className="border border-dashed border-gray-300 rounded-xl p-4 text-sm text-gray-500">
                        No received batches are available for direct sale right now.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {customerWorkspace.directSaleBatches.map((batch) => (
                          <button
                            key={batch.id}
                            type="button"
                            onClick={() => chooseDirectSale(batch)}
                            className="w-full text-left border border-gray-200 rounded-xl px-4 py-4 hover:border-gray-300 hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-semibold text-gray-900">{batch.name}</p>
                                <p className="text-sm text-gray-500 mt-1">
                                  Wholesale {formatCurrency(batch.wholesalePrice)} · Retail {formatCurrency(batch.retailPrice)}
                                </p>
                              </div>
                              <span className="text-xs text-gray-400">{batch.eggCodes.length} egg code(s)</span>
                            </div>
                            <div className="flex gap-2 mt-3 flex-wrap">
                              {batch.eggCodes.map((eggCode) => (
                                <span key={eggCode.id} className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
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

              <div className="flex justify-between pt-2">
                <button onClick={() => setStep(1)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">&larr; Back</button>
                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-sm">
                <div className="bg-gray-50 rounded-lg px-3 py-3">
                  <p className="text-gray-500">Customer</p>
                  <p className="font-medium text-gray-900">{selectedCustomer?.name}</p>
                </div>
                <div className="bg-gray-50 rounded-lg px-3 py-3">
                  <p className="text-gray-500">Sale path</p>
                  <p className="font-medium text-gray-900">{workflow === 'BOOKING' ? 'Booking pickup' : 'Direct sale'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg px-3 py-3">
                  <p className="text-gray-500">Batch</p>
                  <p className="font-medium text-gray-900">{selectedBatch?.name}</p>
                </div>
              </div>

              {workflow === 'BOOKING' ? (
                <div className={`rounded-xl p-4 ${selectedBooking?.isFullyPaid ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                  <p className={`text-sm font-semibold ${selectedBooking?.isFullyPaid ? 'text-emerald-800' : 'text-amber-800'}`}>
                    {selectedBooking?.isFullyPaid ? 'Complete this booking pickup' : 'This booking still has a balance'}
                  </p>
                  <p className={`text-sm mt-1 ${selectedBooking?.isFullyPaid ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {selectedBooking?.isFullyPaid
                      ? `Enter the egg codes collected. The total must stay at ${selectedBooking?.quantity} crates.`
                      : 'Record the remaining payment in Banking and update the booking before pickup.'}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl p-4 bg-blue-50">
                  <p className="text-sm font-semibold text-blue-800">Record a direct sale</p>
                  <p className="text-sm text-blue-700 mt-1">
                    Enter what the customer bought and choose how they paid.
                  </p>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <label className="block text-sm font-medium text-gray-700">Line Items</label>
                  {workflow === 'BOOKING' && (
                    <p className="text-xs text-gray-500">
                      Tip: if the customer picked different egg codes, split the quantity across the rows below.
                    </p>
                  )}
                </div>
                <div className="space-y-3 overflow-x-auto">
                  {lineItems.map((lineItem, index) => (
                    <div key={lineItem.batchEggCodeId} className="grid grid-cols-12 gap-1 sm:gap-2 items-end min-w-[320px]">
                      <div className="col-span-2">
                        {index === 0 && <label className="block text-xs text-gray-500 mb-1">Egg Code</label>}
                        <div className="border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm font-mono font-semibold text-brand-600">
                          {lineItem.code}
                        </div>
                      </div>
                      <div className="col-span-3">
                        {index === 0 && <label className="block text-xs text-gray-500 mb-1">Sale Type</label>}
                        <select
                          value={lineItem.saleType}
                          onChange={(e) => updateLineItem(index, 'saleType', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                        >
                          {Object.entries(SALE_TYPE_LABELS).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        {index === 0 && <label className="block text-xs text-gray-500 mb-1">Quantity</label>}
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={lineItem.quantity}
                          onChange={(e) => updateLineItem(index, 'quantity', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                        />
                      </div>
                      <div className="col-span-3">
                        {index === 0 && <label className="block text-xs text-gray-500 mb-1">Unit Price (₦)</label>}
                        <input
                          type="number"
                          min="0"
                          value={lineItem.unitPrice}
                          onChange={(e) => updateLineItem(index, 'unitPrice', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                        />
                      </div>
                      <div className="col-span-2 text-right">
                        {index === 0 && <label className="block text-xs text-gray-500 mb-1">Line Total</label>}
                        <p className="py-2 text-sm font-medium text-gray-700">
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(PAYMENT_LABELS)
                      .filter(([key]) => key !== 'PRE_ORDER')
                      .map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setPaymentMethod(key)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            paymentMethod === key
                              ? 'bg-brand-500 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                  </div>
                  <div className="mt-3 rounded-lg bg-gray-50 px-3 py-3 text-sm">
                    <p className="font-medium text-gray-900">What happens when you save</p>
                    <p className="text-gray-600 mt-1">{DIRECT_PAYMENT_TRAIL_HINTS[paymentMethod]}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      You do not need to enter this same direct sale again in Banking.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-4 text-sm">
                  <p className="text-gray-500">Payment method</p>
                  <p className="font-medium text-gray-900 mt-1">Pre-order</p>
                  <p className="text-xs text-gray-500 mt-1">This pickup will be saved as a booking sale that was already paid for.</p>
                </div>
              )}

              {totalQty > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  {workflow === 'BOOKING' && selectedBooking && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Booking target</span>
                        <span className="font-medium">{selectedBooking.quantity.toLocaleString()} crates</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Remaining to enter</span>
                        <span className={`font-medium ${bookingQuantityGap === 0 ? 'text-emerald-700' : bookingQuantityGap > 0 ? 'text-amber-700' : 'text-red-700'}`}>
                          {bookingQuantityGap === 0
                            ? 'Complete'
                            : bookingQuantityGap > 0
                              ? `${bookingQuantityGap.toLocaleString()} crates left`
                              : `${Math.abs(bookingQuantityGap).toLocaleString()} crates too many`}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total Quantity</span>
                    <span className="font-medium">{totalQty.toLocaleString()} crates</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total Amount</span>
                    <span className="font-bold text-gray-900">{formatCurrency(totalAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total Cost</span>
                    <span className="font-medium text-gray-600">{formatCurrency(totalCost)}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-gray-200 pt-2">
                    <span className="text-gray-500">Gross Profit</span>
                    <span className={`font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(profit)}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep(2);
                    setError('');
                  }}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  &larr; Back
                </button>

                <div className="flex flex-col-reverse sm:flex-row gap-3">
                  <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !canSubmit}
                    className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    {submitting
                      ? 'Saving...'
                      : workflow === 'BOOKING'
                        ? 'Complete booking pickup'
                        : `Record direct sale — ${formatCurrency(totalAmount)}`}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function SaleDetailModal({ sale, onClose }) {
  const profit = sale.totalAmount - sale.totalCost;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-3 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Receipt {sale.receiptNumber}</h2>
            <span className="text-sm text-gray-400">{formatDate(sale.saleDate)}</span>
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-400">Customer</p>
              <p className="font-medium text-gray-900">{sale.customer?.name}</p>
              {sale.customer?.phone && <p className="text-gray-500 text-xs">{sale.customer.phone}</p>}
            </div>
            <div>
              <p className="text-gray-400">Batch</p>
              <p className="font-medium text-gray-900">{sale.batch?.name}</p>
            </div>
            <div>
              <p className="text-gray-400">Sale source</p>
              <p className="font-medium text-gray-900">{SOURCE_LABELS[sale.sourceType] || 'Direct sale'}</p>
            </div>
            <div>
              <p className="text-gray-400">Payment</p>
              <p className="font-medium text-gray-900">{PAYMENT_LABELS[sale.paymentMethod]}</p>
            </div>
            <div>
              <p className="text-gray-400">Recorded By</p>
              <p className="font-medium text-gray-900">
                {sale.recordedBy ? `${sale.recordedBy.firstName} ${sale.recordedBy.lastName}` : '—'}
              </p>
            </div>
            {sale.booking && (
              <div>
                <p className="text-gray-400">Booking</p>
                <p className="font-medium text-gray-900">{sale.booking.quantity} crates</p>
                <p className="text-xs text-gray-500">Paid {formatCurrency(sale.booking.amountPaid)}</p>
              </div>
            )}
            {sale.paymentTransaction && (
              <div>
                <p className="text-gray-400">Money trail</p>
                <p className="font-medium text-gray-900">{paymentAccountLabel(sale.paymentTransaction)}</p>
                <p className="text-xs text-gray-500">
                  {formatCurrency(sale.paymentTransaction.amount)} recorded automatically
                </p>
              </div>
            )}
          </div>

          {sale.lineItems && sale.lineItems.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Line Items</h3>
              <div className="border border-gray-200 rounded-lg overflow-x-auto">
                <table className="w-full min-w-[320px]">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left py-2 px-3 text-xs text-gray-500">Code</th>
                      <th className="text-center py-2 px-3 text-xs text-gray-500">Type</th>
                      <th className="text-right py-2 px-3 text-xs text-gray-500">Qty</th>
                      <th className="text-right py-2 px-3 text-xs text-gray-500">Price</th>
                      <th className="text-right py-2 px-3 text-xs text-gray-500">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sale.lineItems.map((lineItem) => (
                      <tr key={lineItem.id || lineItem.batchEggCodeId} className="border-b border-gray-50 text-sm">
                        <td className="py-2 px-3 font-mono font-semibold text-brand-600">{lineItem.batchEggCode?.code || '—'}</td>
                        <td className="py-2 px-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${SALE_TYPE_COLORS[lineItem.saleType]}`}>
                            {SALE_TYPE_LABELS[lineItem.saleType]}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right">{lineItem.quantity}</td>
                        <td className="py-2 px-3 text-right">{formatCurrency(lineItem.unitPrice)}</td>
                        <td className="py-2 px-3 text-right font-medium">{formatCurrency(lineItem.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total ({sale.totalQuantity} crates)</span>
              <span className="font-bold text-gray-900">{formatCurrency(sale.totalAmount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Cost</span>
              <span className="text-gray-600">{formatCurrency(sale.totalCost)}</span>
            </div>
            <div className="flex justify-between text-sm border-t border-gray-200 pt-1">
              <span className="text-gray-500">Gross Profit</span>
              <span className={`font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(profit)}</span>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
