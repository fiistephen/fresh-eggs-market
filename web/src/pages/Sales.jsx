import { useState, useEffect } from 'react';
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

function formatCurrency(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(n);
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
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

  useEffect(() => { loadSales(); }, [dateFilter, paymentFilter]);
  useEffect(() => { if (canViewReports) loadSummary(); }, [dateFilter]);

  async function loadSales() {
    setLoading(true);
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Sales</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">Record sales, view daily reports, and track revenue.</p>
        </div>
        {canRecord && (
          <button
            onClick={() => setShowRecordSale(true)}
            className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <span className="text-lg leading-none">+</span> Record Sale
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Date</label>
          <input
            type="date"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Payment Method</label>
          <select
            value={paymentFilter}
            onChange={e => setPaymentFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          >
            <option value="">All methods</option>
            {Object.entries(PAYMENT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
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

      {/* Daily summary cards */}
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

      {/* Payment method breakdown */}
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

      {/* Sales list */}
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
              Record a sale
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Receipt #</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Batch</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Profit</th>
                <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Payment</th>
                <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              </tr>
            </thead>
            <tbody>
              {sales.map(sale => {
                const profit = sale.totalAmount - sale.totalCost;
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
                    <td className="py-3 px-4 text-sm font-medium text-gray-700">{sale.batch?.name || '—'}</td>
                    <td className="py-3 px-4 text-sm text-right">{sale.totalQuantity.toLocaleString()}</td>
                    <td className="py-3 px-4 text-sm text-right font-medium">{formatCurrency(sale.totalAmount)}</td>
                    <td className={`py-3 px-4 text-sm text-right font-medium ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(profit)}
                    </td>
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
        </div>
      )}

      {/* Record sale modal */}
      {showRecordSale && (
        <RecordSaleModal
          onClose={() => setShowRecordSale(false)}
          onRecorded={() => { setShowRecordSale(false); loadSales(); if (canViewReports) loadSummary(); }}
        />
      )}

      {/* Sale detail modal */}
      {selectedSale && (
        <SaleDetailModal sale={selectedSale} onClose={() => setSelectedSale(null)} />
      )}
    </div>
  );
}

// ─── RECORD SALE MODAL ────────────────────────────────────────

function RecordSaleModal({ onClose, onRecorded }) {
  const [step, setStep] = useState(1); // 1: customer, 2: batch, 3: line items
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const [batches, setBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);

  const [lineItems, setLineItems] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [fulfillBookingId, setFulfillBookingId] = useState('');
  const [customerBookings, setCustomerBookings] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Search customers
  useEffect(() => {
    if (!customerSearch.trim()) { setCustomers([]); return; }
    const timer = setTimeout(async () => {
      setSearchingCustomers(true);
      try {
        const data = await api.get(`/customers?search=${encodeURIComponent(customerSearch)}`);
        setCustomers(data.customers);
      } catch {}
      setSearchingCustomers(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  // Load available batches
  useEffect(() => {
    if (step === 2) loadBatches();
  }, [step]);

  // Load customer's confirmed bookings when batch is selected
  useEffect(() => {
    if (selectedCustomer && selectedBatch) {
      loadCustomerBookings();
    }
  }, [selectedCustomer, selectedBatch]);

  async function loadBatches() {
    setLoadingBatches(true);
    try {
      const data = await api.get('/sales/available-batches');
      setBatches(data.batches);
    } catch {}
    setLoadingBatches(false);
  }

  async function loadCustomerBookings() {
    try {
      const data = await api.get(`/bookings?customerId=${selectedCustomer.id}&status=CONFIRMED`);
      setCustomerBookings(data.bookings.filter(b => b.batchId === selectedBatch.id));
    } catch {}
  }

  function selectBatch(batch) {
    setSelectedBatch(batch);
    // Initialize line items with one row per egg code
    setLineItems(batch.eggCodes.map(ec => ({
      batchEggCodeId: ec.id,
      code: ec.code,
      costPrice: ec.costPrice,
      saleType: 'WHOLESALE',
      quantity: '',
      unitPrice: batch.wholesalePrice,
    })));
    setStep(3);
  }

  function updateLineItem(index, field, value) {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };

    // Auto-set unit price based on sale type
    if (field === 'saleType' && selectedBatch) {
      if (value === 'WHOLESALE') updated[index].unitPrice = selectedBatch.wholesalePrice;
      else if (value === 'RETAIL') updated[index].unitPrice = selectedBatch.retailPrice;
      else if (value === 'CRACKED') updated[index].unitPrice = Math.round(updated[index].costPrice * 0.5);
      else if (value === 'WRITE_OFF') updated[index].unitPrice = 0;
    }

    setLineItems(updated);
  }

  // Computed totals
  const activeItems = lineItems.filter(li => li.quantity && Number(li.quantity) > 0);
  const totalQty = activeItems.reduce((s, li) => s + Number(li.quantity), 0);
  const totalAmount = activeItems.reduce((s, li) => s + Number(li.quantity) * Number(li.unitPrice), 0);
  const totalCost = activeItems.reduce((s, li) => s + Number(li.quantity) * Number(li.costPrice), 0);
  const profit = totalAmount - totalCost;

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    if (activeItems.length === 0) {
      setError('Enter quantity for at least one egg code');
      setSubmitting(false);
      return;
    }

    try {
      await api.post('/sales', {
        customerId: selectedCustomer.id,
        batchId: selectedBatch.id,
        bookingId: fulfillBookingId || undefined,
        paymentMethod,
        lineItems: activeItems.map(li => ({
          batchEggCodeId: li.batchEggCodeId,
          saleType: li.saleType,
          quantity: Number(li.quantity),
          unitPrice: Number(li.unitPrice),
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Record Sale</h2>
          <div className="flex gap-2 mt-2">
            {['1. Customer', '2. Batch', '3. Items & Payment'].map((label, i) => (
              <span key={i} className={`text-xs font-medium px-2 py-0.5 rounded ${
                step >= i + 1 ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-400'
              }`}>
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {error && <div className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm mb-4">{error}</div>}

          {/* STEP 1: Customer */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Search Customer</label>
                <input
                  type="text"
                  placeholder="Type name or phone..."
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                  autoFocus
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                />
              </div>
              {searchingCustomers && <p className="text-sm text-gray-400">Searching...</p>}
              {customers.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                  {customers.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedCustomer(c); setStep(2); }}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors"
                    >
                      <span className="font-medium text-gray-900">{c.name}</span>
                      <span className="text-sm text-gray-400 ml-2">{c.phone}</span>
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

          {/* STEP 2: Batch */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-sm text-gray-500">Customer:</span>
                <span className="text-sm font-medium">{selectedCustomer?.name}</span>
                <button onClick={() => { setStep(1); setSelectedBatch(null); }} className="ml-auto text-xs text-gray-400 hover:text-gray-600">Change</button>
              </div>

              <label className="block text-sm font-medium text-gray-700">Select Received Batch</label>
              {loadingBatches ? (
                <p className="text-sm text-gray-400">Loading batches...</p>
              ) : batches.length === 0 ? (
                <p className="text-sm text-gray-500">No received batches available for sale.</p>
              ) : (
                <div className="space-y-2">
                  {batches.map(batch => (
                    <button
                      key={batch.id}
                      type="button"
                      onClick={() => selectBatch(batch)}
                      className="w-full text-left border border-gray-200 rounded-lg px-4 py-3 hover:border-gray-300 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-900">{batch.name}</span>
                        <span className="text-xs text-gray-400">{batch.eggCodes.length} egg code(s)</span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm">
                        <span className="text-gray-500">Wholesale: <span className="font-medium text-gray-900">{formatCurrency(batch.wholesalePrice)}</span></span>
                        <span className="text-gray-500">Retail: <span className="font-medium text-gray-900">{formatCurrency(batch.retailPrice)}</span></span>
                        <span className="text-gray-500">Qty: <span className="font-medium">{batch.actualQuantity?.toLocaleString()}</span></span>
                      </div>
                      <div className="flex gap-2 mt-1">
                        {batch.eggCodes.map(ec => (
                          <span key={ec.id} className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{ec.code}</span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex justify-between pt-2">
                <button onClick={() => setStep(1)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">&larr; Back</button>
                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              </div>
            </div>
          )}

          {/* STEP 3: Line Items & Payment */}
          {step === 3 && (
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
              {/* Context pills */}
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-sm">
                <span className="text-gray-500">Customer:</span>
                <span className="font-medium">{selectedCustomer?.name}</span>
                <span className="text-gray-300 mx-1">|</span>
                <span className="text-gray-500">Batch:</span>
                <span className="font-medium">{selectedBatch?.name}</span>
                <button type="button" onClick={() => { setStep(2); setLineItems([]); }} className="ml-auto text-xs text-gray-400 hover:text-gray-600">Change</button>
              </div>

              {/* Fulfill booking option */}
              {customerBookings.length > 0 && (
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-blue-700 mb-1">Fulfilling a booking?</p>
                  <select
                    value={fulfillBookingId}
                    onChange={e => {
                      setFulfillBookingId(e.target.value);
                      if (e.target.value) setPaymentMethod('PRE_ORDER');
                    }}
                    className="w-full border border-blue-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">No — new walk-in sale</option>
                    {customerBookings.map(b => (
                      <option key={b.id} value={b.id}>
                        Booking: {b.quantity} crates — Paid {formatCurrency(b.amountPaid)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Line items */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Line Items</label>
                <div className="space-y-3 overflow-x-auto">
                  {lineItems.map((li, i) => (
                    <div key={i} className="grid grid-cols-12 gap-1 sm:gap-2 items-end min-w-[320px]">
                      <div className="col-span-2">
                        {i === 0 && <label className="block text-xs text-gray-500 mb-1">Egg Code</label>}
                        <div className="border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm font-mono font-semibold text-brand-600">
                          {li.code}
                        </div>
                      </div>
                      <div className="col-span-3">
                        {i === 0 && <label className="block text-xs text-gray-500 mb-1">Sale Type</label>}
                        <select
                          value={li.saleType}
                          onChange={e => updateLineItem(i, 'saleType', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                        >
                          {Object.entries(SALE_TYPE_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        {i === 0 && <label className="block text-xs text-gray-500 mb-1">Quantity</label>}
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={li.quantity}
                          onChange={e => updateLineItem(i, 'quantity', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                        />
                      </div>
                      <div className="col-span-3">
                        {i === 0 && <label className="block text-xs text-gray-500 mb-1">Unit Price (₦)</label>}
                        <input
                          type="number"
                          min="0"
                          value={li.unitPrice}
                          onChange={e => updateLineItem(i, 'unitPrice', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                        />
                      </div>
                      <div className="col-span-2 text-right">
                        {i === 0 && <label className="block text-xs text-gray-500 mb-1">Line Total</label>}
                        <p className="py-2 text-sm font-medium text-gray-700">
                          {li.quantity && Number(li.quantity) > 0 ? formatCurrency(Number(li.quantity) * Number(li.unitPrice)) : '—'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment method */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(PAYMENT_LABELS).map(([k, v]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setPaymentMethod(k)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        paymentMethod === k
                          ? 'bg-brand-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Order summary */}
              {totalQty > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
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
                    <span className={`font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(profit)}</span>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:justify-between gap-3 pt-2">
                <button type="button" onClick={() => { setStep(2); setLineItems([]); }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">&larr; Back</button>
                <div className="flex flex-col-reverse sm:flex-row gap-3">
                  <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
                  <button
                    type="submit"
                    disabled={submitting || totalQty === 0}
                    className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    {submitting ? 'Recording...' : `Record Sale — ${formatCurrency(totalAmount)}`}
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

// ─── SALE DETAIL MODAL ────────────────────────────────────────

function SaleDetailModal({ sale, onClose }) {
  const profit = sale.totalAmount - sale.totalCost;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-3 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Receipt {sale.receiptNumber}</h2>
            <span className="text-sm text-gray-400">{formatDate(sale.saleDate)}</span>
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-4">
          {/* Customer & batch info */}
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
              <p className="text-gray-400">Payment</p>
              <p className="font-medium text-gray-900">{PAYMENT_LABELS[sale.paymentMethod]}</p>
            </div>
            <div>
              <p className="text-gray-400">Recorded By</p>
              <p className="font-medium text-gray-900">{sale.recordedBy ? `${sale.recordedBy.firstName} ${sale.recordedBy.lastName}` : '—'}</p>
            </div>
          </div>

          {/* Line items */}
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
                    {sale.lineItems.map((li, i) => (
                      <tr key={i} className="border-b border-gray-50 text-sm">
                        <td className="py-2 px-3 font-mono font-semibold text-brand-600">{li.batchEggCode?.code || '—'}</td>
                        <td className="py-2 px-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${SALE_TYPE_COLORS[li.saleType]}`}>
                            {SALE_TYPE_LABELS[li.saleType]}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right">{li.quantity}</td>
                        <td className="py-2 px-3 text-right">{formatCurrency(li.unitPrice)}</td>
                        <td className="py-2 px-3 text-right font-medium">{formatCurrency(li.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Totals */}
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
