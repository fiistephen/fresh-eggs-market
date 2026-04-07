import { useEffect, useState } from 'react';
import { api } from '../lib/api';

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

export default function Reports() {
  const [filters, setFilters] = useState({
    dateFrom: monthStartStr(),
    dateTo: todayStr(),
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadReports();
  }, [filters.dateFrom, filters.dateTo]);

  async function loadReports() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      const response = await api.get(`/reports/sales?${params.toString()}`);
      setData(response);
    } catch {
      setError('Failed to load reports');
    } finally {
      setLoading(false);
    }
  }

  function setThisMonth() {
    setFilters({
      dateFrom: monthStartStr(),
      dateTo: todayStr(),
    });
  }

  function setLast30Days() {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 29);
    setFilters({
      dateFrom: start.toISOString().slice(0, 10),
      dateTo: end.toISOString().slice(0, 10),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-1">
            Review sales clearly by period, item, category, payment type, and receipt.
          </p>
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
          <button
            onClick={setThisMonth}
            className="text-sm text-brand-500 hover:text-brand-600 font-medium"
          >
            This month
          </button>
          <button
            onClick={setLast30Days}
            className="text-sm text-brand-500 hover:text-brand-600 font-medium"
          >
            Last 30 days
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-sm font-medium text-gray-900">How to use this page</p>
        <p className="text-sm text-gray-600 mt-1">
          Choose a date range first. Then read the summary cards for the big picture and use the tables below for detail.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          Loading reports...
        </div>
      ) : !data ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          No report data available.
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <SummaryCard label="Sales value" value={formatCurrency(data.summary.totalSalesAmount)} />
            <SummaryCard label="Gross profit" value={formatCurrency(data.summary.grossProfit)} hint={`${data.summary.marginPercent}% margin`} />
            <SummaryCard label="Transactions" value={data.summary.transactionCount.toLocaleString()} hint={`${data.summary.totalQuantity.toLocaleString()} crates sold`} />
            <SummaryCard label="Sale mix" value={`${data.summary.directSaleCount} direct`} hint={`${data.summary.bookingPickupCount} booking pickups`} />
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Sales by payment type</h2>
                <p className="text-sm text-gray-500 mt-1">
                  This shows how customers paid in the period you selected.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {data.byPaymentMethod.map((row) => (
                <div key={row.paymentMethod} className="rounded-xl border border-gray-200 p-4 bg-gray-50">
                  <p className="text-sm font-medium text-gray-900">{PAYMENT_LABELS[row.paymentMethod] || row.paymentMethod}</p>
                  <p className="text-xl font-bold text-gray-900 mt-2">{formatCurrency(row.totalAmount)}</p>
                  <p className="text-sm text-gray-500 mt-1">{row.transactionCount} transaction(s)</p>
                  <p className="text-xs text-gray-500 mt-2">Average ticket: {formatCurrency(row.averageTicket)}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <ReportPanel
              title="Sales by item"
              body="Use this to see which egg codes and sale types brought in the most value."
              emptyText="No sales by item found for this period."
            >
              <DataTable
                columns={['Item', 'Type', 'Qty', 'Amount', 'Profit']}
                rows={data.byItem.map((row) => [
                  row.itemCode,
                  SALE_TYPE_LABELS[row.saleType] || row.saleType,
                  row.quantity.toLocaleString(),
                  formatCurrency(row.totalAmount),
                  formatCurrency(row.grossProfit),
                ])}
              />
            </ReportPanel>

            <ReportPanel
              title="Sales by category"
              body="Use this to compare wholesale, retail, cracked, and write-off performance."
              emptyText="No category summary found for this period."
            >
              <DataTable
                columns={['Category', 'Lines', 'Qty', 'Amount', 'Profit']}
                rows={data.byCategory.map((row) => [
                  SALE_TYPE_LABELS[row.saleType] || row.saleType,
                  row.lineCount.toLocaleString(),
                  row.quantity.toLocaleString(),
                  formatCurrency(row.totalAmount),
                  formatCurrency(row.grossProfit),
                ])}
              />
            </ReportPanel>
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900">Sales by day</h2>
            <p className="text-sm text-gray-500 mt-1 mb-4">
              This helps you see daily movement inside the selected period.
            </p>
            <DataTable
              columns={['Date', 'Transactions', 'Qty', 'Sales value', 'Profit']}
              rows={data.byDay.map((row) => [
                formatDate(row.date),
                row.transactionCount.toLocaleString(),
                row.totalQuantity.toLocaleString(),
                formatCurrency(row.totalAmount),
                formatCurrency(row.grossProfit),
              ])}
              emptyText="No daily sales found for this period."
            />
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900">Receipt log</h2>
            <p className="text-sm text-gray-500 mt-1 mb-4">
              This is the detailed receipt list for the selected period.
            </p>

            {data.receipts.length === 0 ? (
              <EmptyPanel text="No receipts found for this period." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px]">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Receipt</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Payment</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Money trail</th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
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
                        <td className="py-3 px-4 text-sm text-right">{receipt.totalQuantity.toLocaleString()}</td>
                        <td className="py-3 px-4 text-sm text-right font-medium">{formatCurrency(receipt.totalAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, hint }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
      {hint && <p className="text-xs text-gray-500 mt-2">{hint}</p>}
    </div>
  );
}

function ReportPanel({ title, body, emptyText, children }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <p className="text-sm text-gray-500 mt-1 mb-4">{body}</p>
      {children || <EmptyPanel text={emptyText} />}
    </section>
  );
}

function DataTable({ columns, rows, emptyText = 'No rows found.' }) {
  if (!rows.length) {
    return <EmptyPanel text={emptyText} />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
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
