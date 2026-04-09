import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

/* ─── Icons ─── */
const icons = {
  success: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ),
  error: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  warning: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  info: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
};

const accentColors = {
  success: 'text-success-500',
  error: 'text-error-500',
  warning: 'text-warning-500',
  info: 'text-info-500',
};

const leftBorders = {
  success: 'border-l-success-500',
  error: 'border-l-error-500',
  warning: 'border-l-warning-500',
  info: 'border-l-info-500',
};

const autoDismiss = {
  success: 4000,
  error: 8000,
  warning: 8000,
  info: 4000,
};

/* ─── Single Toast ─── */
function ToastItem({ toast, onDismiss }) {
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef(null);
  const hovering = useRef(false);

  const startTimer = useCallback(() => {
    const duration = autoDismiss[toast.type] || 4000;
    timerRef.current = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(toast.id), 200);
    }, duration);
  }, [toast, onDismiss]);

  useEffect(() => {
    startTimer();
    return () => clearTimeout(timerRef.current);
  }, [startTimer]);

  const handleMouseEnter = () => {
    hovering.current = true;
    clearTimeout(timerRef.current);
  };

  const handleMouseLeave = () => {
    hovering.current = false;
    startTimer();
  };

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 200);
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`
        flex items-start gap-3 w-full max-w-[380px]
        bg-surface-0 rounded-lg shadow-lg
        border-l-[3px] ${leftBorders[toast.type]}
        p-3 pr-2
        ${exiting ? 'animate-toast-exit' : 'animate-toast-enter'}
      `}
      role="alert"
    >
      <span className={`shrink-0 mt-0.5 ${accentColors[toast.type]}`}>
        {icons[toast.type]}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-body-medium text-surface-800">{toast.message}</p>
        {toast.description && (
          <p className="text-caption text-surface-500 mt-0.5">{toast.description}</p>
        )}
        {toast.action && (
          <button
            onClick={toast.action.onClick}
            className="text-caption-medium text-brand-500 hover:text-brand-600 mt-1"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 p-1 rounded text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors duration-fast"
        aria-label="Dismiss"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

/* ─── Toast Container ─── */
function ToastContainer({ toasts, dismiss }) {
  if (toasts.length === 0) return null;

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col-reverse gap-2 pointer-events-none">
      {toasts.slice(0, 3).map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onDismiss={dismiss} />
        </div>
      ))}
    </div>,
    document.body
  );
}

/* ─── Context + Provider ─── */
const ToastContext = createContext(null);

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((type, message, options = {}) => {
    const id = ++idCounter;
    setToasts((prev) => [...prev, { id, type, message, ...options }]);
    return id;
  }, []);

  const toast = {
    success: (msg, opts) => addToast('success', msg, opts),
    error: (msg, opts) => addToast('error', msg, opts),
    warning: (msg, opts) => addToast('warning', msg, opts),
    info: (msg, opts) => addToast('info', msg, opts),
    dismiss,
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

export default ToastProvider;
