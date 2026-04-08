import { useState } from 'react';
import { fmtMoney, fmtDate, accountLabel } from '../shared/constants';
import { PanelLoading, EmptyPanel, SummaryBanner, StatPill, StatusChip } from '../shared/ui';
import AllocationModal from './AllocationModal';

export default function QueueList({ loading, queue, openBatches, policy, onRefresh }) {
  const [activeTransaction, setActiveTransaction] = useState(null);

  if (loading) return <PanelLoading label="Loading customer booking queue…" />;
  if (!queue || queue.length === 0) {
    return <EmptyPanel title="No customer booking money waiting" body="Any transaction saved as Customer booking will show here until the customer and batch allocations are sorted out." />;
  }

  return (
    <div className="space-y-4">
      <SummaryBanner
        tone="amber"
        title={`${queue.length} customer booking transaction${queue.length === 1 ? '' : 's'} waiting for action`}
        body="Link the customer, split the money across one or more open batches, and create the actual bookings."
      />

      <div className="space-y-3">
        {queue.map((transaction) => (
          <div key={transaction.id} className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-semibold text-gray-900">{transaction.customer?.name || 'Customer not linked yet'}</p>
                  <StatusChip label={transaction.customer ? 'Customer linked' : 'Needs customer'} tone={transaction.customer ? 'green' : 'gray'} />
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  {fmtDate(transaction.transactionDate, true)} · {accountLabel(transaction.bankAccount)} · {transaction.reference || transaction.description || 'No reference'}
                </p>
                <p className="mt-2 text-sm text-gray-600">{transaction.description || 'No description entered.'}</p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm lg:min-w-[340px]">
                <StatPill label="Money received" value={fmtMoney(transaction.amount)} />
                <StatPill label="Already allocated" value={fmtMoney(transaction.allocatedAmount)} />
                <StatPill label="Still to assign" value={fmtMoney(transaction.availableAmount)} danger={transaction.availableAmount > 0.009} />
              </div>
            </div>

            {transaction.allocations?.length > 0 && (
              <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm font-semibold text-gray-900">Bookings already created from this money</p>
                <div className="mt-3 space-y-2">
                  {transaction.allocations.map((allocation) => (
                    <div key={allocation.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-sm">
                      <div>
                        <span className="font-medium text-gray-900">{allocation.booking?.batch?.name || 'Batch'}</span>
                        <span className="ml-2 text-gray-500">{allocation.booking?.batch?.eggTypeLabel || 'Regular Size Eggs'}</span>
                      </div>
                      <div className="text-gray-600">
                        {allocation.booking?.quantity || 0} crates · {fmtMoney(allocation.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveTransaction(transaction)}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                {transaction.customer ? 'Allocate to batch bookings' : 'Link customer and allocate'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {activeTransaction && (
        <AllocationModal
          transaction={activeTransaction}
          openBatches={openBatches}
          policy={policy}
          onClose={() => setActiveTransaction(null)}
          onSaved={() => {
            setActiveTransaction(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}
