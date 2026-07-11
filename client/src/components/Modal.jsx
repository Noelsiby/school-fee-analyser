import { useEffect, useRef } from 'react';
import './Modal.css';

/**
 * Reusable Modal component.
 * - Clicking the backdrop closes it.
 * - Pressing Escape closes it.
 * - Slide-in animation via CSS.
 */
export default function Modal({ isOpen, onClose, title, children, size = 'md', footer }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Focus trap — focus the dialog on open
  useEffect(() => {
    if (isOpen) dialogRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className={`modal-box modal-${size}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Body */}
        <div className="modal-body">{children}</div>

        {/* Footer (optional) */}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
