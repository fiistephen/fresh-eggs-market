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
                  <p className="font-medium text-gray-900">{row.itemCode}</p>
                  <p className="text-sm text-gray-500">{SALE_TYPE_LABELS[row.saleType] || row.saleType}</p>
                </div>
                <p className="font-semibold text-gray-900">{formatCurrency(row.totalAmount)}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Sales by item chart" body="This visual makes it easier to spot the items driving the most sales value.">
          <BarComparisonChart
            data={data.byItem.slice(0, 8)}
            labelKey="itemCode"
            valueKey="totalAmount"
            valueFormatter={formatCurrency}
          />
        </Panel>
      </div>

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
  );
}

function SalesByCategoryReport({ data }) {
  return (
    <div className="space-y-6">
      <Panel title="Category comparison" body="This visual compares the sales value across the main categories.">
        <BarComparisonChart
          data={data.byCategory}
          labelKey="saleType"
          labelFormatter={(value) => SALE_TYPE_LABELS[value] || value}
          valueKey="totalAmount"
          valueFormatter={formatCurrency}
        />
      </Panel>

      <Panel title="Sales by category" body="This compares the main sales categories for the selected period.">
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
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="All receipts" value={data.receipts.length.toLocaleString()} />
        <SummaryCard label="Sales receipts" value={data.receipts.length.toLocaleString()} />
        <SummaryCard label="Refund receipts" value="0" />
      </div>

      <Panel title="Receipt log" body="This is the detailed receipt list for the selected period.">
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

function AreaTrendChart({ data, labelKey, valueKey, valueFormatter }) {
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
              <title>{`${formatDate(point.label)}: ${valueFormatter(point.value)}`}</title>
            </g>
          ))}
        </svg>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-500">
        {points.slice(-4).map((point) => (
          <div key={`legend-${point.label}`} className="rounded-lg bg-gray-50 px-3 py-2">
            <p>{formatDate(point.label)}</p>
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

function EmptyPanel({ text }) {
  return (
    <div className="border border-dashed border-gray-300 rounded-xl p-6 text-center text-sm text-gray-500">
      {text}
    </div>
  );
}
