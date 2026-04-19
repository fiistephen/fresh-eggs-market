import { useState } from 'react';
import { ModalShell } from './shared/ui';
import RecordTransactionModal from './RecordTransactionModal';
import BulkTransactionModal from './BulkTransactionModal';

const MODES = [
  {
    key: 'bulk',
    label: 'Enter many',
  },
  {
    key: 'single',
    label: 'Record one',
  },
];

export default function EntryModal(props) {
  const [mode, setMode] = useState('bulk');

  return (
    <ModalShell title="Record entry" onClose={props.onClose} maxWidth={mode === 'bulk' ? 'max-w-6xl' : 'max-w-3xl'}>
      <div className="space-y-5">
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

        {mode === 'bulk' ? (
          <BulkTransactionModal {...props} embedded onRecorded={() => props.onRecorded(true)} />
        ) : (
          <RecordTransactionModal {...props} embedded />
        )}
      </div>
    </ModalShell>
  );
}
