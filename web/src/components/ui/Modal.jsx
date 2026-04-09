import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const sizes = {
  sm: 'max-w-[400px]',
  md: 'max-w-[540px]',
  lg: 'max-w-[720px]',
  xl: 'max-w-[900px]',
};

export default function Modal({
  open,
  onClose,
  title,
  size = 'md',
  children,
  footer,
  className = '',
}) {
  const overlayRef = useRef(null);
  const panelRef = useRef(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  // Focus trap — focus the panel when opened
  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.focus();
    }
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose?.(); }}
    >
      {/* Backdrop — Apple blur */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`
          relative w-full ${sizes[size] || sizes.md}
          bg-surface-0 rounded-lg shadow-xl
          animate-modal-enter
          max-h-[90vh] flex flex-col
          focus:outline-none
          ${className}
        `.trim()}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
            <h2 className="text-title text-surface-800">{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 -mr-1.5 rounded-md text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors duration-fast"
              aria-label="Close"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-surface-100">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/* Convenience: ModalFooter pattern */
export function ModalFooter({ children }) {
  return <>{children}</>;
}
