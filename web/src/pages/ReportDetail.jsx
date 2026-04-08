import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { getReportCard } from './reportsCatalog';

const PAYMENT_LABELS = {
  CASH: 'Cash',
  TRANSFER: 'Transfer',
  POS_CARD: 'POS/Card',
  PRE_ORDER: 'Pre-order',
};

const SALE_TYPE_LABELS = {
  WHOLESALE: 'Wholesale',
  RETAIL: 'Retail',
  CRACKED: 'Cracked',
  WRITE_OFF: 'Write-off',
};

const SOURCE_LABELS = {
  BOOKING: 'Booking pickup',
  DIRECT: 'Direct sale',
};

const ITEM_CATEGORY_LABELS = {
  FE_EGGS: 'FE Eggs',
  CRATES: 'Crates',
  DELIVERY: 'Delivery',
  LEGACY_MISC: 'Legacy / Misc',
  UNCATEGORIZED: 'Uncategorized',
};

const CRACK_ALERT_STYLES = {
  OK: 'bg-green-50 text-green-700 border-green-200',
  WATCH: 'bg-amber-50 text-amber-700 border-amber-200',
  ALERT: 'bg-red-50 text-red-700 border-red-200',
};

function formatCurrency(value) {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(Number(value));
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatSignedCurrency(value) {
  const amount = Number(value || 0);
  const formatted = formatCurrency(Math.abs(amount));
  return amount > 0 ? `+${formatted}` : amount < 0 ? `-${formatted}` : formatted;
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartStr() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function getReportEndpoint(reportType) {
  if (['batch-summary', 'inventory-control'].includes(reportType)) {
    return '/reports/operations';
  }

  return '/reports/sales';
}

export default function ReportDetail() {
  const { reportType } = useParams();
  const navigate = useNavigate();
  const report = getReportCard(reportType);

  const [filters, setFilters] = useState({
    dateFrom: monthStartStr(),
    dateTo: todayStr(),
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!report) {
      navigate('/reports', { replace: true });
    }
  }, [report, navigate]);

  useEffect(() => {
    if (report) {
      loadReport();
    }
  }, [report, filters.dateFrom, filters.dateTo]);

  async function loadReport() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      const response = await api.get(`${getReportEndpoint(reportType)}?${params.toString()}`);
      setData(response);
    } catch {
      setError('Failed to load this report');
    } finally {
      setLoading(false);
    }
  }

  if (!report) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <Link to="/reports" className="text-sm text-brand-500 hover:text-brand-600 font-medium">
            &larr; Back to Reports
          </Link>
          <div className="flex items-center gap-3 mt-3">
            <span className="text-3xl" aria-hidden="true">{report.icon}</span>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{report.title}</h1>
              <p className="text-sm text-gray-500 mt-1">{report.description}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col sm:flex-row gap-3 sm:items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((current) => ({ ...current, dateFrom: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((current) => ({ ...current, dateTo: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          Loading report...
        </div>
      ) : !data ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          No data available for this report.
        </div>
      ) : (
        <ReportBody reportType={reportType} data={data} />
      )}
    </div>
  );
}

function ReportBody({ reportType, data }) {
  switch (reportType) {
    case 'executive-summary':
      return <ExecutiveSummaryReport data={data} />;
    case 'sales-summary':
      return <SalesSummaryReport data={data} />;
    case 'sales-by-item':
      return <SalesByItemReport data={data} />;
    case 'sales-by-category':
      return <SalesByCategoryReport data={data} />;
    case 'sales-by-payment-type':
      return <SalesByPaymentTypeReport data={data} />;
    case 'sales-by-employee':
      return <SalesByEmployeeReport data={data} />;
    case 'receipts':
      return <ReceiptsReport data={data} />;
    case 'batch-summary':
      return <BatchSummaryReport data={data} />;
    case 'inventory-control':
      return <InventoryControlReport data={data} />;
    default:
      return null;
  }
}

function ExecutiveSummaryReport({ data }) {
  const topItem = data.byItem[0];
  const topPayment = data.byPaymentMethod[0];
  const bestDay = [...data.byDay].sort((a, b) => b.totalAmount - a.totalAmount)[0];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard label="Sales value" value={formatCurrency(data.summary.totalSalesAmount)} />
        <SummaryCard label="Gross profit" value={formatCurrency(data.summary.grossProfit)} hint={`${data.summary.marginPercent}% margin`} />
        <SummaryCard label="Receipts" value={data.summary.transactionCount.toLocaleString()} hint={`${data.summary.totalQuantity.toLocaleString()} crates sold`} />
        <SummaryCard label="Sale mix" value={`${data.summary.directSaleCount} direct`} hint={`${data.summary.bookingPickupCount} booking pickups`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-6">
        <Panel title="Sales trend" body="This is the high-level movement of sales value across the selected period.">
          <AreaTrendChart
            data={data.byDay}
            valueKey="totalAmount"
            labelKey="date"
            valueFormatter={formatCurrency}
          />
        </Panel>

        <Panel title="Executive notes" body="Use these headline points when you need a quick investor or funder-ready summary.">
          <ExecutiveNote
            label="Top selling item"
            value={topItem ? `${topItem.itemCode} (${formatCurrency(topItem.totalAmount)})` : 'No item sales yet'}
          />
          <ExecutiveNote
            label="Main payment channel"
            value={topPayment ? `${PAYMENT_LABELS[topPayment.paymentMethod] || topPayment.paymentMethod} (${formatCurrency(topPayment.totalAmount)})` : 'No payment data yet'}
          />
          <ExecutiveNote
            label="Best sales day"
            value={bestDay ? `${formatDate(bestDay.date)} (${formatCurrency(bestDay.totalAmount)})` : 'No daily sales yet'}
          />
          <ExecutiveNote
            label="Direct vs pickup"
            value={`${data.summary.directSaleCount} direct sales and ${data.summary.bookingPickupCount} booking pickups`}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Payment mix" body="This shows which payment methods carried the most sales value.">
          <BarComparisonChart
            data={data.byPaymentMethod.slice(0, 6)}
            labelKey="paymentMethod"
            labelFormatter={(value) => PAYMENT_LABELS[value] || value}
            valueKey="totalAmount"
            valueFormatter={formatCurrency}
          />
        </Panel>

        <Panel title="Top items" body="This highlights the strongest items for the selected period.">
          <BarComparisonChart
            data={data.byItem.slice(0, 6)}
            labelKey="itemCode"
            valueKey="totalAmount"
            valueFormatter={formatCurrency}
          />
        </Panel>
      </div>
    </div>
  );
}

function SalesSummaryReport({ data }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <SummaryCard label="Gross sales" value={formatCurrency(data.summary.totalSalesAmount)} />
        <SummaryCard label="Gross profit" value={formatCurrency(data.summary.grossProfit)} hint={`${data.summary.marginPercent}% margin`} />
        <SummaryCard label="Transactions" value={data.summary.transactionCount.toLocaleString()} />
        <SummaryCard label="Crates sold" value={data.summary.totalQuantity.toLocaleString()} />
        <SummaryCard label="Sale mix" value={`${data.summary.directSaleCount} direct`} hint={`${data.summary.bookingPickupCount} pickup`} />
      </div>

      <Panel title="Sales trend" body="This gives you a clear daily view of gross sales across the selected period.">
        <AreaTrendChart
          data={data.byDay}
          valueKey="totalAmount"
          labelKey="date"
          valueFormatter={formatCurrency}
        />
      </Panel>

      <Panel title="Daily sales summary" body="Use the table when you need the exact daily breakdown behind the chart.">
        <DataTable
          columns={['Date', 'Transactions', 'Qty', 'Gross sales', 'Cost of goods', 'Gross profit']}
          rows={data.byDay.map((row) => [
            formatDate(row.date),
            row.transactionCount.toLocaleString(),
            row.totalQuantity.toLocaleString(),
            formatCurrency(row.totalAmount),
            formatCurrency(row.totalCost),
            formatCurrency(row.grossProfit),
          ])}
          emptyText="No daily sales found for this period."
        />
      </Panel>
    </div>
  );
}

function SalesByItemReport({ data }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Top items" body="These are the items that brought in the most value in this period.">
          <div className="space-y-3">
            {data.byItem.slice(0, 5).map((row) => (
              <div key={`${row.itemCode}-${row.saleType}`} className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 p-4">
                <div>
                  <p className="font-medium text-gray-900">{row.itemLabel || row.itemCode}</p>
                  <p className="text-sm text-gray-500">
                    {SALE_TYPE_LABELS[row.saleType] || row.saleType} · {ITEM_CATEGORY_LABELS[row.category] || row.category}
                  </p>
                </div>
                <p className="font-semibold text-gray-900">{formatCurrency(row.totalAmount)}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Sales by item chart" body="This visual makes it easier to spot the items driving the most sales value.">
          <BarComparisonChart
          data={data.byItem.slice(0, 8)}
            labelKey="itemLabel"
            valueKey="totalAmount"
            valueFormatter={formatCurrency}
          />
        </Panel>
      </div>

      <Panel title="Sales by item" body="Use the table to compare quantity sold, value, and profit by item.">
        <DataTable
          columns={['Item', 'Type', 'Items sold', 'Net sales', 'Cost of goods', 'Gross profit']}
          rows={data.byItem.map((row) => [
            row.itemLabel || row.itemCode,
            SALE_TYPE_LABELS[row.saleType] || row.saleType,
            row.quantity.toLocaleString(),
            formatCurrency(row.totalAmount),
            formatCurrency(row.totalCost),
            formatCurrency(row.grossProfit),
          ])}
          emptyText="No item sales found for this period."
        />
      </Panel>
    </div>
  );
}

function SalesByCategoryReport({ data }) {
  return (
    <div className="space-y-6">
      <Panel title="Category comparison" body="This visual compares the sales value across the main categories.">
        <BarComparisonChart
          data={data.byCategory}
          labelKey="category"
          labelFormatter={(value) => ITEM_CATEGORY_LABELS[value] || value}
          valueKey="totalAmount"
          valueFormatter={formatCurrency}
        />
      </Panel>

      <Panel title="Sales by category" body="This compares the main product categories for the selected period.">
        <DataTable
          columns={['Category', 'Items sold', 'Net sales', 'Cost of goods', 'Gross profit']}
          rows={data.byCategory.map((row) => [
            ITEM_CATEGORY_LABELS[row.category] || row.category,
            row.quantity.toLocaleString(),
            formatCurrency(row.totalAmount),
            formatCurrency(row.totalCost),
            formatCurrency(row.grossProfit),
          ])}
          emptyText="No category data found for this period."
        />
      </Panel>
    </div>
  );
}

function SalesByPaymentTypeReport({ data }) {
  const totalAmount = data.byPaymentMethod.reduce((sum, row) => sum + row.totalAmount, 0);
  const totalTransactions = data.byPaymentMethod.reduce((sum, row) => sum + row.transactionCount, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <SummaryCard label="Payment amount" value={formatCurrency(totalAmount)} />
        <SummaryCard label="Payment transactions" value={totalTransactions.toLocaleString()} />
        <SummaryCard label="Payment types used" value={data.byPaymentMethod.length.toLocaleString()} />
      </div>

      <Panel title="Payment type chart" body="This visual shows which payment channels carried the most sales value.">
        <BarComparisonChart
          data={data.byPaymentMethod}
          labelKey="paymentMethod"
          labelFormatter={(value) => PAYMENT_LABELS[value] || value}
          valueKey="totalAmount"
          valueFormatter={formatCurrency}
        />
      </Panel>

      <Panel title="Sales by payment type" body="Use this to see how much value came from each payment method.">
        <DataTable
          columns={['Payment type', 'Payment transactions', 'Payment amount', 'Average sale', 'Gross profit']}
          rows={data.byPaymentMethod.map((row) => [
            PAYMENT_LABELS[row.paymentMethod] || row.paymentMethod,
            row.transactionCount.toLocaleString(),
            formatCurrency(row.totalAmount),
            formatCurrency(row.averageTicket),
            formatCurrency(row.grossProfit),
          ])}
          footer={[
            'Total',
            totalTransactions.toLocaleString(),
            formatCurrency(totalAmount),
            '—',
            formatCurrency(data.byPaymentMethod.reduce((sum, row) => sum + row.grossProfit, 0)),
          ]}
          emptyText="No payment data found for this period."
        />
      </Panel>
    </div>
  );
}

function SalesByEmployeeReport({ data }) {
  return (
    <div className="space-y-6">
      <Panel title="Employee comparison" body="This visual helps you compare sales value across staff members.">
        <BarComparisonChart
          data={data.byEmployee}
          labelKey="employeeName"
          valueKey="totalAmount"
          valueFormatter={formatCurrency}
        />
      </Panel>

      <Panel title="Sales by employee" body="This shows the sales value each staff member recorded in the selected period.">
        <DataTable
          columns={['Name', 'Gross sales', 'Receipts', 'Average sale', 'Crates sold', 'Gross profit']}
          rows={data.byEmployee.map((row) => [
            row.employeeName,
            formatCurrency(row.totalAmount),
            row.transactionCount.toLocaleString(),
            formatCurrency(row.averageTicket),
            row.totalQuantity.toLocaleString(),
            formatCurrency(row.grossProfit),
          ])}
          emptyText="No employee sales found for this period."
        />
      </Panel>
    </div>
  );
}

function ReceiptsReport({ data }) {
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [selectedReceiptId, setSelectedReceiptId] = useState('');

  const filteredReceipts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data.receipts || []).filter((receipt) => {
      if (paymentFilter && receipt.paymentMethod !== paymentFilter) return false;
      if (sourceFilter && receipt.sourceType !== sourceFilter) return false;

      if (!term) return true;

      const haystack = [
        receipt.receiptNumber,
        receipt.customer?.name,
        receipt.customer?.phone,
        receipt.batch?.name,
        receipt.paymentTransaction?.reference,
        receipt.recordedBy?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [data.receipts, paymentFilter, search, sourceFilter]);

  const selectedReceipt = filteredReceipts.find((receipt) => receipt.id === selectedReceiptId)
    || data.receipts.find((receipt) => receipt.id === selectedReceiptId)
    || null;

  const directCount = data.receipts.filter((receipt) => receipt.sourceType === 'DIRECT').length;
  const bookingCount = data.receipts.filter((receipt) => receipt.sourceType === 'BOOKING').length;
  const linkedMoneyTrailCount = data.receipts.filter((receipt) => receipt.paymentTransaction).length;

  useEffect(() => {
    if (selectedReceiptId && !filteredReceipts.some((receipt) => receipt.id === selectedReceiptId)) {
      setSelectedReceiptId('');
    }
  }, [filteredReceipts, selectedReceiptId]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard label="All receipts" value={data.receipts.length.toLocaleString()} />
        <SummaryCard label="Direct sale receipts" value={directCount.toLocaleString()} />
        <SummaryCard label="Booking pickup receipts" value={bookingCount.toLocaleString()} />
        <SummaryCard label="Linked bank trail" value={linkedMoneyTrailCount.toLocaleString()} hint={`${data.receipts.length - linkedMoneyTrailCount} pre-paid before pickup`} />
      </div>

      <Panel title="Receipt tools" body="Search the receipt log, narrow it to one payment type, and open the full receipt when you need more detail.">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_220px_220px]">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by receipt number, customer, phone, or batch"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500"
          />
          <select
            value={paymentFilter}
            onChange={(event) => setPaymentFilter(event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500"
          >
            <option value="">All payment methods</option>
            {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500"
          >
            <option value="">All receipt types</option>
            <option value="DIRECT">Direct sale</option>
            <option value="BOOKING">Booking pickup</option>
          </select>
        </div>
      </Panel>

      <Panel title="Receipt log" body="This is the detailed receipt list for the selected period. Click one row to open the full receipt.">
        {filteredReceipts.length === 0 ? (
          <EmptyPanel text="No receipts found for this period." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Receipt no.</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Payment</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Money trail</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Detail</th>
                </tr>
              </thead>
              <tbody>
                {filteredReceipts.map((receipt) => (
                  <tr
                    key={receipt.id}
                    className={`border-b border-gray-50 transition-colors hover:bg-gray-50 ${selectedReceipt?.id === receipt.id ? 'bg-brand-50/60' : ''}`}
                  >
                    <td className="py-3 px-4 text-sm font-mono text-gray-700">{receipt.receiptNumber}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{formatDateTime(receipt.saleDate)}</td>
                    <td className="py-3 px-4 text-sm">
                      <p className="font-medium text-gray-900">{receipt.customer?.name || '—'}</p>
                      {receipt.customer?.phone && <p className="text-xs text-gray-500">{receipt.customer.phone}</p>}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">{SOURCE_LABELS[receipt.sourceType] || receipt.sourceType}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{PAYMENT_LABELS[receipt.paymentMethod] || receipt.paymentMethod}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {receipt.paymentTransaction
                        ? `${receipt.paymentTransaction.bankAccount?.name || 'Linked account'} · ${formatCurrency(receipt.paymentTransaction.amount)}`
                        : 'Already covered before pickup'}
                    </td>
                    <td className="py-3 px-4 text-sm text-right font-medium">{formatCurrency(receipt.totalAmount)}</td>
                    <td className="py-3 px-4 text-sm text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedReceiptId(receipt.id)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {selectedReceipt && (
        <ReceiptDetailModal receipt={selectedReceipt} onClose={() => setSelectedReceiptId('')} />
      )}
    </div>
  );
}

function ReceiptDetailModal({ receipt, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4 sm:px-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Receipt {receipt.receiptNumber}</h3>
            <p className="mt-1 text-sm text-gray-500">{formatDateTime(receipt.saleDate)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-800"
          >
            Close
          </button>
        </div>

        <div className="p-4 sm:p-6">
          <ReceiptDetailCard receipt={receipt} />
        </div>
      </div>
    </div>
  );
}

function ReceiptDetailCard({ receipt }) {
  function customerLineItems(receipt) {
    return (receipt.lineItems || []).map((lineItem) => ({
      label: lineItem.itemLabel,
      quantity: lineItem.quantity,
      unitPrice: lineItem.unitPrice,
      lineTotal: lineItem.lineTotal,
    }));
  }

  function handleInternalPrint() {
    if (typeof window === 'undefined') return;
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;

    const rows = (receipt.lineItems || []).map((lineItem) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${lineItem.itemLabel}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${SALE_TYPE_LABELS[lineItem.saleType] || lineItem.saleType}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${lineItem.quantity}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCurrency(lineItem.unitPrice)}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCurrency(lineItem.lineTotal)}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Receipt ${receipt.receiptNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
            h1, h2, p { margin: 0 0 8px; }
            .meta { margin-bottom: 20px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
            .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th { text-align: left; padding: 8px; font-size: 12px; text-transform: uppercase; color: #6b7280; border-bottom: 1px solid #e5e7eb; }
            td { font-size: 14px; }
          </style>
        </head>
        <body>
          <h1>Receipt ${receipt.receiptNumber}</h1>
          <p>${formatDateTime(receipt.saleDate)}</p>
          <div class="grid">
            <div class="card">
              <h2>Customer</h2>
              <p>${receipt.customer?.name || '—'}</p>
              <p>${receipt.customer?.phone || '—'}</p>
            </div>
            <div class="card">
              <h2>Payment</h2>
              <p>${PAYMENT_LABELS[receipt.paymentMethod] || receipt.paymentMethod}</p>
              <p>${receipt.paymentTransaction ? `${receipt.paymentTransaction.bankAccount?.name || 'Linked account'} · ${formatCurrency(receipt.paymentTransaction.amount)}` : 'Already covered before pickup'}</p>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Sale type</th>
                <th style="text-align:right;">Qty</th>
                <th style="text-align:right;">Unit price</th>
                <th style="text-align:right;">Line total</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="grid" style="margin-top:20px;">
            <div class="card">
              <h2>Receipt summary</h2>
              <p>Total quantity: ${receipt.totalQuantity} crates</p>
              <p>Total amount: ${formatCurrency(receipt.totalAmount)}</p>
              <p>Gross profit: ${formatCurrency(receipt.grossProfit)}</p>
            </div>
            <div class="card">
              <h2>Employee</h2>
              <p>${receipt.recordedBy?.name || '—'}</p>
              <p>${SOURCE_LABELS[receipt.sourceType] || receipt.sourceType}</p>
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  function handleCustomerPrint() {
    if (typeof window === 'undefined') return;
    const printWindow = window.open('', '_blank', 'width=420,height=900');
    if (!printWindow) return;

    const rows = customerLineItems(receipt).map((lineItem) => `
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
          <title>Customer Receipt ${receipt.receiptNumber}</title>
          <style>
            @page { size: 80mm auto; margin: 6mm; }
            body {
              margin: 0;
              font-family: "Courier New", Courier, monospace;
              color: #111;
              background: #fff;
            }
            .receipt {
              width: 72mm;
              margin: 0 auto;
              padding: 2mm 0;
              font-size: 12px;
              line-height: 1.45;
            }
            .center { text-align: center; }
            .title { font-size: 16px; font-weight: 700; }
            .muted { color: #444; }
            .rule {
              border-top: 1px dashed #000;
              margin: 8px 0;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            td {
              vertical-align: top;
              padding: 4px 0;
            }
            .item { width: 70%; }
            .amount {
              width: 30%;
              text-align: right;
              white-space: nowrap;
            }
            .name { font-weight: 700; }
            .meta { color: #444; font-size: 11px; }
            .summary-row td {
              padding: 2px 0;
            }
            .summary-row .label { color: #444; }
            .summary-row .value {
              text-align: right;
              white-space: nowrap;
            }
            .total {
              font-size: 14px;
              font-weight: 700;
            }
            .thanks {
              margin-top: 10px;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="receipt">
            <div class="center">
              <div class="title">Fresh Eggs Market</div>
              <div class="muted">Customer Receipt</div>
            </div>
            <div class="rule"></div>
            <div><strong>Receipt No:</strong> ${receipt.receiptNumber}</div>
            <div><strong>Date:</strong> ${formatDateTime(receipt.saleDate)}</div>
            <div><strong>Employee:</strong> ${receipt.recordedBy?.name || '—'}</div>
            <div><strong>Customer:</strong> ${receipt.customer?.name || 'Walk-in customer'}</div>
            ${receipt.customer?.phone ? `<div><strong>Phone:</strong> ${receipt.customer.phone}</div>` : ''}
            <div><strong>Payment:</strong> ${PAYMENT_LABELS[receipt.paymentMethod] || receipt.paymentMethod}</div>
            <div class="rule"></div>
            <table>
              <tbody>${rows}</tbody>
            </table>
            <div class="rule"></div>
            <table>
              <tbody>
                <tr class="summary-row">
                  <td class="label">Crates</td>
                  <td class="value">${receipt.totalQuantity}</td>
                </tr>
                <tr class="summary-row total">
                  <td class="label">Total Paid</td>
                  <td class="value">${formatCurrency(receipt.totalAmount)}</td>
                </tr>
              </tbody>
            </table>
            <div class="rule"></div>
            <div class="thanks">
              Thank you for your purchase.
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
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-semibold text-gray-900">{receipt.receiptNumber}</h3>
            <StatusPill label={SOURCE_LABELS[receipt.sourceType] || receipt.sourceType} tone={receipt.sourceType === 'BOOKING' ? 'green' : 'slate'} />
          </div>
          <p className="mt-2 text-sm text-gray-500">{formatDateTime(receipt.saleDate)}</p>
        </div>
        <button
          type="button"
          onClick={handleCustomerPrint}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Print customer receipt
        </button>
      </div>

      <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
        <div className="flex flex-col gap-3 border-b border-green-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-green-700">Customer receipt</p>
            <h4 className="mt-2 text-lg font-semibold text-gray-900">Simple receipt for the buyer</h4>
            <p className="mt-1 text-sm text-gray-600">
              This version keeps only the sale details a customer typically needs: receipt number, date, items, quantity, payment method, and total paid.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCustomerPrint}
            className="rounded-lg border border-green-300 bg-white px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100"
          >
            Thermal print
          </button>
        </div>

        <div className="mx-auto mt-5 max-w-md rounded-2xl border border-dashed border-green-200 bg-white p-5 shadow-sm">
          <div className="text-center">
            <p className="text-lg font-bold text-gray-900">Fresh Eggs Market</p>
            <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Customer Receipt</p>
          </div>

          <div className="mt-4 space-y-1 text-sm">
            <div className="flex items-start justify-between gap-4">
              <span className="text-gray-500">Receipt No</span>
              <span className="font-medium text-gray-900">{receipt.receiptNumber}</span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <span className="text-gray-500">Date</span>
              <span className="font-medium text-gray-900">{formatDateTime(receipt.saleDate)}</span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <span className="text-gray-500">Employee</span>
              <span className="text-right font-medium text-gray-900">{receipt.recordedBy?.name || '—'}</span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <span className="text-gray-500">Customer</span>
              <span className="text-right font-medium text-gray-900">{receipt.customer?.name || 'Walk-in customer'}</span>
            </div>
            {receipt.customer?.phone && (
              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500">Phone</span>
                <span className="font-medium text-gray-900">{receipt.customer.phone}</span>
              </div>
            )}
            <div className="flex items-start justify-between gap-4">
              <span className="text-gray-500">Payment</span>
              <span className="font-medium text-gray-900">{PAYMENT_LABELS[receipt.paymentMethod] || receipt.paymentMethod}</span>
            </div>
          </div>

          <div className="my-4 border-t border-dashed border-gray-300" />

          <div className="space-y-3">
            {customerLineItems(receipt).map((lineItem, index) => (
              <div key={`${lineItem.label}-${index}`} className="flex items-start justify-between gap-4 text-sm">
                <div>
                  <p className="font-medium text-gray-900">{lineItem.label}</p>
                  <p className="text-xs text-gray-500">{lineItem.quantity} x {formatCurrency(lineItem.unitPrice)}</p>
                </div>
                <p className="font-semibold text-gray-900">{formatCurrency(lineItem.lineTotal)}</p>
              </div>
            ))}
          </div>

          <div className="my-4 border-t border-dashed border-gray-300" />

          <div className="space-y-1 text-sm">
            <div className="flex items-start justify-between gap-4">
              <span className="text-gray-500">Crates</span>
              <span className="font-medium text-gray-900">{receipt.totalQuantity}</span>
            </div>
            <div className="flex items-start justify-between gap-4 text-base">
              <span className="font-semibold text-gray-900">Total paid</span>
              <span className="font-bold text-gray-900">{formatCurrency(receipt.totalAmount)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Internal receipt</p>
          <p className="mt-1 text-sm text-gray-500">This version keeps the admin-level audit detail for staff review.</p>
        </div>
        <button
          type="button"
          onClick={handleInternalPrint}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Print internal receipt
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">Customer</p>
          <p className="mt-2 text-base font-semibold text-gray-900">{receipt.customer?.name || '—'}</p>
          <p className="mt-1 text-sm text-gray-500">{receipt.customer?.phone || 'No phone saved'}</p>
        </div>
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">Payment trail</p>
          <p className="mt-2 text-base font-semibold text-gray-900">{PAYMENT_LABELS[receipt.paymentMethod] || receipt.paymentMethod}</p>
          <p className="mt-1 text-sm text-gray-500">
            {receipt.paymentTransaction
              ? `${receipt.paymentTransaction.bankAccount?.name || 'Linked account'} · ${formatCurrency(receipt.paymentTransaction.amount)}`
              : 'Already paid before pickup'}
          </p>
          {receipt.paymentTransaction?.reference && (
            <p className="mt-1 text-xs text-gray-400">Ref: {receipt.paymentTransaction.reference}</p>
          )}
        </div>
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">Receipt summary</p>
          <p className="mt-2 text-base font-semibold text-gray-900">{formatCurrency(receipt.totalAmount)}</p>
          <p className="mt-1 text-sm text-gray-500">{receipt.totalQuantity} crates sold</p>
          <p className="mt-1 text-sm text-gray-500">Employee {receipt.recordedBy?.name || '—'}</p>
        </div>
      </div>

      <DataTable
        columns={['Item', 'Sale type', 'Qty', 'Unit price', 'Line total', 'Gross profit']}
        rows={(receipt.lineItems || []).map((lineItem) => [
          lineItem.itemLabel,
          SALE_TYPE_LABELS[lineItem.saleType] || lineItem.saleType,
          lineItem.quantity.toLocaleString(),
          formatCurrency(lineItem.unitPrice),
          formatCurrency(lineItem.lineTotal),
          formatCurrency(lineItem.grossProfit),
        ])}
        footer={[
          'Total',
          '—',
          receipt.totalQuantity.toLocaleString(),
          '—',
          formatCurrency(receipt.totalAmount),
          formatCurrency(receipt.grossProfit),
        ]}
        emptyText="No receipt line items found."
      />
    </div>
  );
}

function BatchSummaryReport({ data }) {
  const policy = data.policy || {};
  const monthly = data.monthlySummary || {};
  const batches = data.batchSummary || [];
  const monthlyTrend = data.monthlyTrend || [];
  const highlights = data.highlights || {};

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-sm font-medium text-gray-900">How to read this report</p>
        <p className="text-sm text-gray-600 mt-1">
          This page compares each batch against the policy that was active when that batch started. The current company target is {formatCurrency(policy.targetProfitPerCrate)} profit per crate.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <SummaryCard label="Batches" value={(monthly.totalBatches || 0).toLocaleString()} />
        <SummaryCard label="Actual profit" value={formatCurrency(monthly.totalActualProfit)} />
        <SummaryCard label="Policy target" value={formatCurrency(monthly.totalExpectedProfit)} />
        <SummaryCard label="Variance" value={formatSignedCurrency(monthly.totalVarianceToPolicy)} hint={`${monthly.aboveTargetCount || 0} above target`} />
        <SummaryCard label="Crack alerts" value={(monthly.crackAlertCount || 0).toLocaleString()} hint={`${formatPercent(monthly.averageCrackRatePercent)} average crack rate`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Profit by batch" body="This shows which batches are carrying performance and which ones are below target.">
          <BarComparisonChart
            data={batches.slice(0, 8)}
            labelKey="batchName"
            valueKey="grossProfit"
            valueFormatter={formatCurrency}
          />
        </Panel>

        <Panel title="Policy notes" body="Use these figures when reviewing batch performance with management.">
          <ExecutiveNote label="Average profit per crate" value={formatCurrency(monthly.averageProfitPerCrate)} />
          <ExecutiveNote label="Above target batches" value={`${monthly.aboveTargetCount || 0} batches`} />
          <ExecutiveNote label="Below target batches" value={`${monthly.belowTargetCount || 0} batches`} />
          <ExecutiveNote label="Current crack allowance" value={`${policy.crackAllowancePercent || 0}%`} />
          <ExecutiveNote label="Current cracked crate cap" value={policy.crackedCratesAllowance == null ? 'No fixed cap' : `${policy.crackedCratesAllowance} crates`} />
          <ExecutiveNote label="Current write-off cap" value={policy.writeOffCratesAllowance == null ? 'No fixed cap' : `${policy.writeOffCratesAllowance} crates`} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-6">
        <Panel title="Monthly batch trend" body="This helps management see how each month performed against policy, not just individual batches.">
          <AreaTrendChart
            data={monthlyTrend}
            labelKey="monthLabel"
            valueKey="totalActualProfit"
            valueFormatter={formatCurrency}
            labelFormatter={(value) => value}
          />
        </Panel>

        <Panel title="Management highlights" body="Use these quick notes when you need the story behind the numbers.">
          <ExecutiveNote
            label="Strongest batch"
            value={highlights.strongestBatch ? `${highlights.strongestBatch.batchName} (${formatSignedCurrency(highlights.strongestBatch.varianceToPolicy)})` : 'No batch data yet'}
          />
          <ExecutiveNote
            label="Weakest batch"
            value={highlights.weakestBatch ? `${highlights.weakestBatch.batchName} (${formatSignedCurrency(highlights.weakestBatch.varianceToPolicy)})` : 'No batch data yet'}
          />
          <ExecutiveNote
            label="Highest crack pressure"
            value={highlights.highestCrackBatch ? `${highlights.highestCrackBatch.batchName} (${formatPercent(highlights.highestCrackBatch.crackRatePercent)})` : 'No batch data yet'}
          />
          <ExecutiveNote
            label="Monthly average profit per crate"
            value={formatCurrency(monthly.averageProfitPerCrate)}
          />
        </Panel>
      </div>

      <Panel title="Monthly batch summary" body="This is the roll-up view management can use for monthly review meetings.">
        <DataTable
          columns={['Month', 'Batches', 'Received', 'Actual profit', 'Policy target', 'Variance', 'Above target', 'Crack alerts']}
          rows={monthlyTrend.map((row) => [
            row.monthLabel,
            row.totalBatches.toLocaleString(),
            `${row.totalReceived.toLocaleString()} crates`,
            formatCurrency(row.totalActualProfit),
            formatCurrency(row.totalExpectedProfit),
            formatSignedCurrency(row.totalVarianceToPolicy),
            row.aboveTargetCount.toLocaleString(),
            row.crackAlertCount.toLocaleString(),
          ])}
          emptyText="No monthly batch data found for this period."
        />
      </Panel>

      <Panel title="Batch summary" body="Open this when you need the full batch-by-batch picture for the selected period.">
        <div className="space-y-3">
          {batches.length === 0 ? (
            <EmptyPanel text="No batches found for this period." />
          ) : (
            batches.map((batch) => (
              <div key={batch.batchId} className="rounded-xl border border-gray-200 p-4">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-gray-900">{batch.batchName}</h3>
                      <p className="mt-1 text-sm font-medium text-gray-700">{batch.eggTypeLabel || 'Regular Size Eggs'}</p>
                      <StatusPill label={batch.status} tone={batch.status === 'CLOSED' ? 'slate' : 'green'} />
                      <CrackAlertPill alert={batch.crackAlert} />
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      Batch date: {formatDate(batch.batchDate)} · Received: {batch.totalReceived.toLocaleString()} crates
                    </p>
                  </div>

                  <div className="text-left lg:text-right">
                    <p className={`text-lg font-bold ${batch.varianceToPolicy >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatSignedCurrency(batch.varianceToPolicy)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Variance to policy target</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 xl:grid-cols-6 gap-3 mt-4">
                  <MiniMetric label="Revenue" value={formatCurrency(batch.totalRevenue)} />
                  <MiniMetric label="Profit" value={formatCurrency(batch.grossProfit)} />
                  <MiniMetric label="Target" value={formatCurrency(batch.expectedPolicyProfit)} />
                  <MiniMetric label="Profit/crate" value={formatCurrency(batch.profitPerCrate)} />
                  <MiniMetric label="Crack rate" value={formatPercent(batch.crackRatePercent)} />
                  <MiniMetric label="Write-offs" value={`${batch.totalWriteOffs.toLocaleString()} crates`} />
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
                  <div className="rounded-xl bg-gray-50 p-4">
                    <p className="text-xs uppercase tracking-wider text-gray-500">FE mix</p>
                    <div className="mt-3 space-y-2">
                      {(batch.eggCodeMix || []).map((row) => (
                        <div key={`${batch.batchId}-${row.code}`} className="flex items-center justify-between gap-3 text-sm">
                          <div>
                            <p className="font-medium text-gray-900">{row.code}</p>
                            <p className="text-xs text-gray-500">{formatCurrency(row.costPrice)} cost price</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-gray-900">{(row.quantity + row.freeQty).toLocaleString()} crates</p>
                            <p className="text-xs text-gray-500">{row.freeQty > 0 ? `${row.freeQty} free` : 'No free crates'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl bg-gray-50 p-4">
                    <p className="text-xs uppercase tracking-wider text-gray-500">Sales and crack mix</p>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <MiniMetric label="Wholesale" value={`${(batch.salesByType?.WHOLESALE?.quantity || 0).toLocaleString()} crates`} />
                      <MiniMetric label="Retail" value={`${(batch.salesByType?.RETAIL?.quantity || 0).toLocaleString()} crates`} />
                      <MiniMetric label="Cracked sold" value={`${batch.crackedSoldQuantity.toLocaleString()} crates`} />
                      <MiniMetric label="Damaged write-off" value={`${batch.totalWriteOffs.toLocaleString()} crates`} />
                    </div>
                    <div className="mt-3 text-sm text-gray-600">
                      <p>Cracked sold value: <span className="font-medium text-gray-900">{formatCurrency(batch.crackedSoldValue)}</span></p>
                      <p className="mt-1">Sale-ready stock left: <span className="font-medium text-gray-900">{batch.availableForSale.toLocaleString()} crates</span></p>
                    </div>
                  </div>
                </div>

                {batch.latestCount && batch.latestCount.discrepancy !== 0 ? (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    Last count on {formatDate(batch.latestCount.countDate)} shows a discrepancy of {batch.latestCount.discrepancy > 0 ? '+' : ''}{batch.latestCount.discrepancy} crates.
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}

function InventoryControlReport({ data }) {
  const policy = data.policy || {};
  const control = data.inventoryControl || {};
  const activeInventory = control.activeInventory || [];
  const flaggedBatches = control.flaggedBatches || [];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-sm font-medium text-gray-900">What needs attention</p>
        <p className="text-sm text-gray-600 mt-1">
          This report helps the team catch stock issues early. Batches are flagged when cracks move close to or above the policy that applied to that batch, or when the last count has a discrepancy.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <SummaryCard label="Active batches" value={(control.activeBatchCount || 0).toLocaleString()} />
        <SummaryCard label="On hand" value={(control.totalOnHand || 0).toLocaleString()} hint="crates in stock" />
        <SummaryCard label="Booked" value={(control.totalBooked || 0).toLocaleString()} hint="already promised" />
        <SummaryCard label="Available" value={(control.totalAvailable || 0).toLocaleString()} hint="ready for sale" />
        <SummaryCard label="Flagged batches" value={flaggedBatches.length.toLocaleString()} hint={`${control.totalWriteOffs || 0} write-off crates`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Batches with alerts" body="These are the batches that need a closer look right now.">
          {flaggedBatches.length === 0 ? (
            <EmptyPanel text="No crack or count alerts in the selected period." />
          ) : (
            <div className="space-y-3">
              {flaggedBatches.map((batch) => (
                <div key={batch.batchId} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">{batch.batchName}</p>
                      <p className="mt-1 text-xs font-medium text-gray-600">{batch.eggTypeLabel || 'Regular Size Eggs'}</p>
                      <p className="text-sm text-gray-500 mt-1">
                        On hand: {batch.onHand.toLocaleString()} · Available: {batch.available.toLocaleString()}
                      </p>
                    </div>
                    <CrackAlertPill alert={batch.crackAlert} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                    <MiniMetric label="Crack rate" value={formatPercent(batch.crackRatePercent)} />
                    <MiniMetric label="Write-offs" value={`${batch.totalWriteOffs.toLocaleString()} crates`} />
                  </div>
                  {batch.latestCount && batch.latestCount.discrepancy !== 0 ? (
                    <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                      Last count discrepancy: {batch.latestCount.discrepancy > 0 ? '+' : ''}{batch.latestCount.discrepancy} crates on {formatDate(batch.latestCount.countDate)}.
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Stock by active batch" body="This makes it easier to see where the current stock is concentrated.">
          <BarComparisonChart
            data={activeInventory.slice(0, 8)}
            labelKey="batchName"
            valueKey="onHand"
            valueFormatter={(value) => `${Number(value || 0).toLocaleString()} crates`}
          />
        </Panel>
      </div>

      <Panel title="Inventory control table" body="Use this table for the exact stock position and crack status of each active batch.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Batch</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">On hand</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Booked</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Available</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Cracked sold</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Write-offs</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Crack rate</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {activeInventory.map((batch) => (
                <tr key={batch.batchId} className="border-b border-gray-50">
                  <td className="py-3 px-4 text-sm font-medium text-gray-900">
                    <div>{batch.batchName}</div>
                    <div className="mt-1 text-xs font-medium text-gray-500">{batch.eggTypeLabel || 'Regular Size Eggs'}</div>
                  </td>
                  <td className="py-3 px-4 text-sm text-right">{batch.onHand.toLocaleString()}</td>
                  <td className="py-3 px-4 text-sm text-right">{batch.booked.toLocaleString()}</td>
                  <td className="py-3 px-4 text-sm text-right">{batch.available.toLocaleString()}</td>
                  <td className="py-3 px-4 text-sm text-right">{batch.crackedSoldQuantity.toLocaleString()}</td>
                  <td className="py-3 px-4 text-sm text-right">{batch.totalWriteOffs.toLocaleString()}</td>
                  <td className="py-3 px-4 text-sm text-right">{formatPercent(batch.crackRatePercent)}</td>
                  <td className="py-3 px-4 text-sm">
                    <CrackAlertPill alert={batch.crackAlert} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Panel({ title, body, children }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <p className="text-sm text-gray-500 mt-1 mb-4">{body}</p>
      {children}
    </section>
  );
}

function SummaryCard({ label, value, hint }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
      {hint ? <p className="text-xs text-gray-500 mt-2">{hint}</p> : null}
    </div>
  );
}

function DataTable({ columns, rows, footer, emptyText = 'No rows found.' }) {
  if (!rows.length) {
    return <EmptyPanel text={emptyText} />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px]">
        <thead>
          <tr className="border-b border-gray-100">
            {columns.map((column) => (
              <th key={column} className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${rowIndex}-${row[0]}`} className="border-b border-gray-50">
              {row.map((cell, cellIndex) => (
                <td key={`${rowIndex}-${cellIndex}`} className="py-3 px-4 text-sm text-gray-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {footer ? (
            <tr className="bg-gray-50 font-medium">
              {footer.map((cell, cellIndex) => (
                <td key={`footer-${cellIndex}`} className="py-3 px-4 text-sm text-gray-900">
                  {cell}
                </td>
              ))}
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function AreaTrendChart({ data, labelKey, valueKey, valueFormatter, labelFormatter = (value) => formatDate(value) }) {
  if (!data?.length) {
    return <EmptyPanel text="No chart data found for this period." />;
  }

  const width = 720;
  const height = 260;
  const padding = 28;
  const values = data.map((row) => Number(row[valueKey] || 0));
  const maxValue = Math.max(...values, 1);
  const stepX = data.length === 1 ? 0 : (width - padding * 2) / (data.length - 1);

  const points = data.map((row, index) => {
    const x = padding + stepX * index;
    const normalized = Number(row[valueKey] || 0) / maxValue;
    const y = height - padding - normalized * (height - padding * 2);
    return { x, y, label: row[labelKey], value: Number(row[valueKey] || 0) };
  });

  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-emerald-50/60 p-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
          {[0, 0.25, 0.5, 0.75, 1].map((step) => {
            const y = height - padding - step * (height - padding * 2);
            return (
              <g key={step}>
                <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#E5E7EB" strokeWidth="1" />
                <text x="0" y={y + 4} fontSize="11" fill="#6B7280">
                  {valueFormatter(maxValue * step)}
                </text>
              </g>
            );
          })}

          <path d={areaPath} fill="rgba(16, 185, 129, 0.12)" />
          <path d={linePath} fill="none" stroke="#10B981" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />

          {points.map((point) => (
            <g key={point.label}>
              <circle cx={point.x} cy={point.y} r="4" fill="#10B981" />
              <title>{`${labelFormatter(point.label)}: ${valueFormatter(point.value)}`}</title>
            </g>
          ))}
        </svg>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-500">
        {points.slice(-4).map((point) => (
          <div key={`legend-${point.label}`} className="rounded-lg bg-gray-50 px-3 py-2">
            <p>{labelFormatter(point.label)}</p>
            <p className="font-medium text-gray-800 mt-1">{valueFormatter(point.value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarComparisonChart({ data, labelKey, valueKey, valueFormatter, labelFormatter = (value) => value }) {
  if (!data?.length) {
    return <EmptyPanel text="No chart data found for this period." />;
  }

  const maxValue = Math.max(...data.map((row) => Number(row[valueKey] || 0)), 1);

  return (
    <div className="space-y-3">
      {data.map((row) => {
        const value = Number(row[valueKey] || 0);
        const widthPercent = (value / maxValue) * 100;
        const label = labelFormatter(row[labelKey]);

        return (
          <div key={`${label}-${value}`} className="space-y-1">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-gray-700 font-medium truncate">{label}</span>
              <span className="text-gray-500">{valueFormatter(value)}</span>
            </div>
            <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-400"
                style={{ width: `${Math.max(widthPercent, 4)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ExecutiveNote({ label, value }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-900 mt-2">{value}</p>
    </div>
  );
}

function MiniMetric({ label, value }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-900 mt-1">{value}</p>
    </div>
  );
}

function StatusPill({ label, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone] || tones.slate}`}>
      {label}
    </span>
  );
}

function CrackAlertPill({ alert }) {
  if (!alert) return null;

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${CRACK_ALERT_STYLES[alert.level] || CRACK_ALERT_STYLES.OK}`}>
      {alert.label}
    </span>
  );
}

function EmptyPanel({ text }) {
  return (
    <div className="border border-dashed border-gray-300 rounded-xl p-6 text-center text-sm text-gray-500">
      {text}
    </div>
  );
}
