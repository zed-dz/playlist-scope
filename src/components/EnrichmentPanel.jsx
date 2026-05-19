import Icon from './Icon.jsx';

// Panel shown on Briefing when the playlist has videos missing transcripts.
// Drives the enrichment agent: shows queue size, progress, errors, auth hints.

export default function EnrichmentPanel({ agent, onOpenSettings, hasApiKey }) {
  const { status, progress, errors, authError, queueSize, start, stop, reset } = agent;

  if (queueSize === 0 && status === 'idle') return null;

  return (
    <div className="card p-5 mb-6" style={{
      borderColor: status === 'error' ? 'var(--danger)' : 'var(--accent)',
      background: status === 'error' ? 'rgba(224,123,106,0.04)' : 'rgba(212,163,115,0.04)',
    }}>
      <div className="flex items-start justify-between mb-3 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Icon name="sparkles" size={16} style={{ color: 'var(--accent)' }} />
            <h3 className="display text-xl">
              <span className="display-italic">Enrich</span> playlist with AI
            </h3>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>
            {queueSize > 0
              ? `${queueSize} video${queueSize !== 1 ? 's' : ''} still need${queueSize === 1 ? 's' : ''} transcripts. The free Gemini tier will fetch them via Google Search grounding, one at a time. Safe to leave running — progress saves as it goes.`
              : 'All videos enriched.'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {status === 'idle' && queueSize > 0 && (
            <button onClick={start} className="btn-primary">
              <Icon name="play" size={12} /> Enrich {queueSize} videos
            </button>
          )}
          {status === 'running' && (
            <button onClick={stop} className="btn-ghost text-xs">
              <Icon name="pause" size={12} /> Pause
            </button>
          )}
          {status === 'paused' && (
            <button onClick={start} className="btn-primary text-xs">
              <Icon name="play" size={12} /> Resume
            </button>
          )}
          {(status === 'done' || status === 'error') && (
            <button onClick={reset} className="btn-ghost text-xs">
              <Icon name="refresh" size={12} /> Reset
            </button>
          )}
        </div>
      </div>

      {(status === 'running' || status === 'paused') && progress.total > 0 && (
        <div>
          <div className="flex justify-between text-xs mb-2" style={{ color: 'var(--text-2)' }}>
            <span className="truncate flex-1 mr-2">
              {progress.currentTitle ? (
                <>Working on <span style={{ color: 'var(--accent-bright)' }}>#{progress.done + 1}</span>: {progress.currentTitle}</>
              ) : (
                <>Preparing…</>
              )}
            </span>
            <span className="num flex-shrink-0">{progress.done}/{progress.total}</span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
          </div>
        </div>
      )}

      {status === 'done' && (
        <div className="text-sm flex items-center gap-2" style={{ color: 'var(--accent-bright)' }}>
          <Icon name="check" size={14} /> Done. Enriched {progress.done} video{progress.done !== 1 ? 's' : ''}{errors.length > 0 ? `, ${errors.length} failed` : ''}.
        </div>
      )}

      {status === 'error' && authError && (
        <div className="text-sm p-3 rounded mt-2" style={{
          background: 'rgba(224,123,106,0.08)', border: '1px solid rgba(224,123,106,0.3)', color: 'var(--text-1)',
        }}>
          <div className="font-medium mb-2" style={{ color: 'var(--danger)' }}>No LLM API key configured</div>
          <div className="text-xs mb-2" style={{ color: 'var(--text-2)' }}>
            The server proxy at <code className="font-mono">/api/claude</code> needs a free Gemini key. Two paths:
          </div>
          <ul className="text-xs space-y-1 mb-3 pl-4" style={{ color: 'var(--text-1)', listStyle: 'disc' }}>
            <li><strong>Site owner sets it</strong> as <code className="font-mono">GEMINI_API_KEY</code> in Netlify env vars — free tier 1,500 req/day at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style={{ color: 'var(--accent-bright)' }}>aistudio.google.com/apikey</a>. No credit card.</li>
            <li><strong>Paste a Gemini key in Settings</strong> — stored only in your browser, takes 30 seconds.</li>
          </ul>
          {onOpenSettings && (
            <button className="btn-primary text-xs" onClick={onOpenSettings}>
              <Icon name="settings" size={12} /> {hasApiKey ? 'Update' : 'Add'} API key
            </button>
          )}
          <details className="mt-3">
            <summary className="text-xs cursor-pointer" style={{ color: 'var(--text-3)' }}>technical detail</summary>
            <pre className="text-xs mt-1 p-2 rounded" style={{
              background: 'var(--bg-2)', color: 'var(--text-2)', whiteSpace: 'pre-wrap',
              maxHeight: 100, overflow: 'auto',
            }}>{authError}</pre>
          </details>
        </div>
      )}

      {errors.length > 0 && status !== 'error' && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer" style={{ color: 'var(--text-3)' }}>
            {errors.length} video{errors.length !== 1 ? 's' : ''} couldn't be enriched
          </summary>
          <ul className="mt-2 space-y-1 pl-4" style={{ color: 'var(--text-2)', listStyle: 'disc' }}>
            {errors.slice(0, 5).map((e, i) => (
              <li key={i}><span className="num">{e.videoId.slice(0, 11)}</span>: {e.msg.slice(0, 100)}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
