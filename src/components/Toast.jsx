import { createContext, useContext, useState, useRef, useCallback } from 'react';

const ToastContext = createContext({ push: () => {} });

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const push = useCallback((message, opts = {}) => {
    const id = ++idRef.current;
    const type = opts.type || 'info';
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), opts.duration || 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: t.type === 'error' ? '#3a1c18' : t.type === 'success' ? '#1c2a1f' : t.type === 'warn' ? '#352818' : '#1c1815',
            color: '#f5ede1',
            padding: '10px 16px',
            borderRadius: 8,
            border: t.type === 'warn' ? '1px solid rgba(212,163,115,0.4)' : '1px solid rgba(255,240,220,0.14)',
            fontSize: 14,
            maxWidth: 360,
          }}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
