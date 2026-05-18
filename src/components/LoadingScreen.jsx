export default function LoadingScreen({ message = 'Loading…' }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: '#0a0807', color: '#f5ede1',
      flexDirection: 'column', gap: 24,
      fontFamily: 'Geist, sans-serif',
    }}>
      <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: '3rem' }}>
        Playlist <span style={{ fontStyle: 'italic', color: '#f5b97a' }}>Scope</span>
      </div>
      <div style={{ width: 200, height: 2, background: '#1c1815', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', background: '#d4a373',
          animation: 'loadFill 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        }} />
      </div>
      <div style={{ fontSize: 12, color: '#8a7f70', fontFamily: 'JetBrains Mono, monospace' }}>
        {message}
      </div>
      <style>{`
        @keyframes loadFill {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}
