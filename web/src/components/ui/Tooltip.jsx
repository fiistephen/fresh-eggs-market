import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function Tooltip({ content, children, position = 'top', delay = 300, maxWidth = 240 }) {
  const [show, setShow] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const timerRef = useRef(null);

  const calculatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const gap = 6;

    let top, left;
    switch (position) {
      case 'bottom':
        top = rect.bottom + gap;
        left = rect.left + rect.width / 2;
        break;
      case 'left':
        top = rect.top + rect.height / 2;
        left = rect.left - gap;
        break;
      case 'right':
        top = rect.top + rect.height / 2;
        left = rect.right + gap;
        break;
      default: // top
        top = rect.top - gap;
        left = rect.left + rect.width / 2;
    }

    setCoords({ top, left });
  };

  const handleEnter = () => {
    timerRef.current = setTimeout(() => {
      calculatePosition();
      setShow(true);
    }, delay);
  };

  const handleLeave = () => {
    clearTimeout(timerRef.current);
    setShow(false);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (!content) return children;

  const transforms = {
    top: 'translate(-50%, -100%)',
    bottom: 'translate(-50%, 0)',
    left: 'translate(-100%, -50%)',
    right: 'translate(0, -50%)',
  };

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onFocus={handleEnter}
        onBlur={handleLeave}
        className="inline-flex"
      >
        {children}
      </span>
      {show && createPortal(
        <div
          className="fixed z-[200] pointer-events-none animate-fade-in"
          style={{
            top: coords.top,
            left: coords.left,
            transform: transforms[position],
            maxWidth,
          }}
        >
          <div className="bg-surface-800 text-surface-0 text-caption px-2 py-1 rounded-sm shadow-md">
            {content}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
