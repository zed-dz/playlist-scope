import { useEffect } from 'react';

export default function Modal({ children, onClose, narrow = false, allowEscape = true }) {
  useEffect(() => {
    if (!allowEscape) return;
    const h = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose, allowEscape]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-content ${narrow ? 'modal-content-narrow' : ''}`} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
