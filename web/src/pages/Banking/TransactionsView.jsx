import { useState } from 'react';
import { DIRECTION_COLORS, SOURCE_LABELS, fmtMoney, fmtDate, accountLabel, displayAccountName, categoryLabel } from './shared/constants';
import { FilterField, EmptyState } from './shared/ui';

export default function TransactionsView({ accounts, transactions, total, loading, filters, onFilterChange, categoryMap }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label="Account">
            <select
              value={filters.bankAccountId}
              onChange={(event) => onFilterChange({ bankAccountId: event.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All accounts</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{displayAccountName(account)}</option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Direction">
            <select
              value={filters.direction}
              onChange={(event) => onFilterChange({ direction: event.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All directions</option>
              <option value="INFLOW">Inflows</option>
              <option value="OUTFLOW">Outflows</option>
            </select>
          </FilterField>

          <FilterField label="Source">
            <select
              value={filters.sourceType}
              onChange={(event) => onFilterChange({ sourceType: event.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All sources</option>
              {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </FilterField>

          <FilterField label="From">
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(event) => onFilterChange({ dateFrom: event.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            />
          </FilterField>

          <FilterField label="To">
            <input
              type="date"
              value={filters.dateTo}
              onChange={(event) => onFilterChange({ dateTo: event.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            />
          </FilterField>

          <button
            onClick={() => onFilterChange({ bankAccountId: '', direction: '', sourceType: '', dateFrom: '', dateTo: '' })}
            className="rounded-lg px-2 py-2 text-sm text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Transactions</h2>
            <p className="text-sm text-gray-500">{total} transaction{total !== 1 ? 's' : ''} in view</p>
          </div>
        </div>

        {loading ? (
          <div className="px-6 py-20 text-center text-sm text-gray-500">Loading transactions…</div>
        ) : transactions.length === 0 ? (
          <div className="px-6 py-20">
            <EmptyState title="No transactions match this filter" body="Try widening the date range or clearing the source and direction filters." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Account</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Customer</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">By</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <tr key={transaction.id} className="border-b border-gray-50 align-top">
                    <td className="px-4 py-3 text-sm text-gray-600">{fmtDate(transaction.transactionDate, true)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">{accountLabel(transaction.bankAccount)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{categoryLabel(transaction.category, categoryMap)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{SOURCE_LABELS[transaction.sourceType] || transaction.sourceType}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{transaction.description || transaction.reference || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{transaction.customer?.name || '—'}</td>
                    <td className={`px-4 py-3 text-right text-sm font-semibold ${DIRECTION_COLORS[transaction.direction]}`}>
                      {transaction.direction === 'INFLOW' ? '+' : '-'}{fmtMoney(transaction.amount)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{transaction.enteredBy?.firstName || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
