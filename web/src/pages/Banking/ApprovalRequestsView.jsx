import { EmptyPanel } from './shared/ui';
import { categoryLabel, displayAccountName, fmtDate, fmtMoney } from './shared/constants';

const STATUS_STYLES = {
  PENDING: 'bg-warning-50 text-warning-700',
  APPROVED: 'bg-success-50 text-success-700',
  REJECTED: 'bg-error-50 text-error-700',
};

function personName(person) {
  if (!person) return '—';
  return `${person.firstName || ''} ${person.lastName || ''}`.trim() || '—';
}

export default function ApprovalRequestsView({
  requests,
  loading,
  categoryMap,
  currentUserRole,
  workingId,
  onApprove,
  onReject,
  onRefresh,
}) {
  if (loading) {
    return <div className="rounded-lg border border-surface-200 bg-surface-0 px-6 py-20 text-center text-sm text-surface-500">Loading approval requests…</div>;
  }

  if (!requests.length) {
    return <EmptyPanel title="No approval requests" body="Delete approval requests for Banking transactions will show here." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-surface-200 bg-surface-0 px-4 py-3 shadow-sm">
        <div>
          <h2 className="text-heading text-surface-900">Approval requests</h2>
          <p className="mt-1 text-body text-surface-600">Review pending delete requests for manual Banking entries and keep a clear audit trail.</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-sm font-medium text-surface-700 transition-colors duration-fast hover:bg-surface-50"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-3">
        {requests.map((request) => {
          const txn = request.entity || request.beforeData;
          const isPending = request.status === 'PENDING';
          return (
            <div key={request.id} className="rounded-lg border border-surface-200 bg-surface-0 p-4 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[request.status] || 'bg-surface-100 text-surface-700'}`}>
                      {request.status}
                    </span>
                    <span className="text-body-medium font-semibold text-surface-900">Delete manual banking entry</span>
                  </div>
                  <p className="text-body text-surface-700">
                    {txn?.description || txn?.reference || 'Bank transaction'}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-surface-500">
                    <span>{fmtDate(txn?.transactionDate)}</span>
                    <span>{displayAccountName(txn?.bankAccount || { name: txn?.bankAccountName, lastFour: txn?.lastFour, accountType: txn?.accountType })}</span>
                    <span>{categoryLabel(txn?.category, categoryMap)}</span>
                    <span>{fmtMoney(txn?.amount)}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-surface-500">
                    <span>Requested by {personName(request.requestedBy)}</span>
                    <span>{fmtDate(request.createdAt)}</span>
                    {request.approvedBy ? <span>Resolved by {personName(request.approvedBy)}</span> : null}
                    {request.resolvedAt ? <span>{fmtDate(request.resolvedAt)}</span> : null}
                  </div>
                  {request.reason ? (
                    <p className="text-body text-surface-600">Reason: {request.reason}</p>
                  ) : null}
                  {request.afterData?.reason ? (
                    <p className="text-body text-surface-600">Resolution note: {request.afterData.reason}</p>
                  ) : null}
                </div>

                {currentUserRole === 'ADMIN' && isPending ? (
                  <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
                    <button
                      type="button"
                      onClick={() => onApprove(request)}
                      disabled={workingId === request.id}
                      className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-surface-900 transition-colors duration-fast hover:bg-brand-400 disabled:opacity-50"
                    >
                      Approve delete
                    </button>
                    <button
                      type="button"
                      onClick={() => onReject(request)}
                      disabled={workingId === request.id}
                      className="rounded-md border border-error-200 bg-error-50 px-4 py-2 text-sm font-medium text-error-700 transition-colors duration-fast hover:bg-error-100 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
