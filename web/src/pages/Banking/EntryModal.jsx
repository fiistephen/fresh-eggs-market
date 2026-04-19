import { useState } from 'react';
import { ModalShell } from './shared/ui';
import { displayAccountName, ACCOUNT_STYLES } from './shared/constants';
import RecordTransactionModal from './RecordTransactionModal';
import BulkTransactionModal from './BulkTransactionModal';

/* ── Account type → accent colour for the picker cards ── */
const CARD_ACCENTS = {
  CUSTOMER_DEPOSIT: { border: 'border-info-400', bg: 'bg-info-50', text: 'text-info-700', icon: '↓' },
  SALES: { border: 'border-success-400', bg: 'bg-success-50', text: 'text-success-700', icon: '₦' },
  PROFIT: { border: 'border-brand-400', bg: 'bg-brand-50', text: 'text-brand-700', icon: '★' },
  CASH_ON_HAND: { border: 'border-warning-400', bg: 'bg-warning-50', text: 'text-warning-700', icon: '⬤' },
};

const ACCOUNT_HINTS = {
  CUSTOMER_DEPOSIT: 'Customer payments, deposits, refunds',
  SALES: 'Sales transfers, farmer payments',
  PROFIT: 'Profit transfers, expenses',
  CASH_ON_HAND: 'Cash sales not yet banked',
};

const MODES = [
  { key: 'bulk', label: 'Enter many' },
  { key: 'single', label: 'Record one' },
];

export default function EntryModal(props) {
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [mode, setMode] = useState('bulk');

  const selectedAccount = selectedAccountId
    ? props.accounts.find((a) => a.id === selectedAccountId)
    : null;

  /* ── Step 1: Pick account ──────────────────────────── */
  if (!selectedAccount) {
    return (
      <ModalShell title="Record entry" onClose={props.onClose} maxWidth="max-w-lg">
        <div className="space-y-3">
          <p className="text-body text-surface-600">Which account is this for?</p>
          <div className="grid gap-2">
            {props.accounts.map((account) => {
              const accent = CARD_ACCENTS[account.accountType] || CARD_ACCENTS.CUSTOMER_DEPOSIT;
              const hint = ACCOUNT_HINTS[account.accountType] || '';
              return (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => setSelectedAccountId(account.id)}
                  className={`flex items-center gap-3 rounded-lg border-2 ${accent.border} ${accent.bg} px-4 py-3.5 text-left transition-all duration-fast hover:shadow-sm hover:scale-[1.01]`}
                >
                  <span className={`flex h-9 w-9 items-center justify-center rounded-full ${accent.bg} ${accent.text} text-lg font-bold`}>
                    {accent.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-body-medium font-semibold text-surface-900">{displayAccountName(account)}</p>
                    {hint && <p className="mt-0.5 text-caption text-surface-500">{hint}</p>}
                  </div>
                  <svg className="h-5 w-5 shrink-0 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              );
            })}
          </div>
        </div>
      </ModalShell>
    );
  }

  /* ── Step 2: Mode toggle + form ────────────────────── */
  const accent = CARD_ACCENTS[selectedAccount.accountType] || CARD_ACCENTS.CUSTOMER_DEPOSIT;

  return (
    <ModalShell title="Record entry" onClose={props.onClose} maxWidth={mode === 'bulk' ? 'max-w-6xl' : 'max-w-3xl'}>
      <div className="space-y-4">
        {/* Account header bar */}
        <div className={`flex items-center justify-between rounded-lg border ${accent.border} ${accent.bg} px-4 py-2.5`}>
          <div className="flex items-center gap-2">
            <span className={`flex h-7 w-7 items-center justify-center rounded-full ${accent.text} text-sm font-bold`}>
              {accent.icon}
            </span>
            <p className="text-body-medium font-semibold text-surface-900">{displayAccountName(selectedAccount)}</p>
          </div>
          <button
            type="button"
            onClick={() => setSelectedAccountId(null)}
            className="text-caption font-medium text-surface-500 hover:text-surface-700 transition-colors"
          >
            Change
          </button>
        </div>

        {/* Mode toggle */}
        <div className="rounded-lg border border-surface-200 bg-surface-50 p-1">
          <div className="grid gap-1 sm:grid-cols-2">
            {MODES.map((entryMode) => {
              const isActive = mode === entryMode.key;
              return (
                <button
                  key={entryMode.key}
                  type="button"
                  onClick={() => setMode(entryMode.key)}
                  className={`rounded-md px-4 py-3 text-left transition-all duration-fast ${
                    isActive
                      ? 'bg-brand-500 text-surface-900 shadow-xs'
                      : 'bg-transparent text-surface-600 hover:bg-surface-100'
                  }`}
                >
                  <div className="text-body-medium font-semibold">{entryMode.label}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Entry form — account is fixed */}
        {mode === 'bulk' ? (
          <BulkTransactionModal
            {...props}
            embedded
            fixedAccountId={selectedAccountId}
            onRecorded={() => props.onRecorded(true)}
          />
        ) : (
          <RecordTransactionModal
            {...props}
            embedded
            fixedAccountId={selectedAccountId}
          />
        )}
      </div>
    </ModalShell>
  );
}
