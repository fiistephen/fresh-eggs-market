import { useEffect, useState } from 'react';
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

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartStr() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
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
      const response = await api.get(`/reports/sales?${params.toString()}`);
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
    default:
      return null;
  }
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

      <Panel
        title="Daily sales summary"
        body="This gives you the daily movement for the period you selected."
      >
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
                  <p className="font-medium text-gray-900">{row.itemCode}</p>
                  <p className="text-sm text-gray-500">{SALE_TYPE_LABELS[row.saleType] || row.saleType}</p>
                </div>
                <p className="font-semibold text-gray-900">{formatCurrency(row.totalAmount)}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Sales by item" body="Use the table to compare quantity sold, value, and profit by item.">
          <DataTable
            columns={['Item', 'Type', 'Items sold', 'Net sales', 'Cost of goods', 'Gross profit']}
            rows={data.byItem.map((row) => [
              row.itemCode,
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
    </div>
  );
}

function SalesByCategoryReport({ data }) {
  return (
    <Panel
      title="Sales by category"
      body="This compares the main sales categories for the selected period."
    >
      <DataTable
        columns={['Category', 'Items sold', 'Net sales', 'Cost of goods', 'Gross profit']}
        rows={data.byCategory.map((row) => [
          SALE_TYPE_LABELS[row.saleType] || row.saleType,
          row.quantity.toLocaleString(),
          formatCurrency(row.totalAmount),
          formatCurrency(row.totalCost),
          formatCurrency(row.grossProfit),
        ])}
        emptyText="No category data found for this period."
      />
    </Panel>
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

      <Panel
        title="Sales by payment type"
        body="Use this to see how much value came from each payment method."
      >
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
    <Panel
      title="Sales by employee"
      body="This shows the sales value each staff member recorded in the selected period."
    >
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
  );
}

function ReceiptsReport({ data }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="All receipts" value={data.receipts.length.toLocaleString()} />
        <SummaryCard label="Sales receipts" value={data.receipts.length.toLocaleString()} />
        <SummaryCard label="Refund receipts" value="0" />
      </div>

      <Panel
        title="Receipt log"
        body="This is the detailed receipt list for the selected period."
      >
        {data.receipts.length === 0 ? (
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
                </tr>
              </thead>
              <tbody>
                {data.receipts.map((receipt) => (
                  <tr key={receipt.id} className="border-b border-gray-50">
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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

function EmptyPanel({ text }) {
  return (
    <div className="border border-dashed border-gray-300 rounded-xl p-6 text-center text-sm text-gray-500">
      {text}
    </div>
  );
}
