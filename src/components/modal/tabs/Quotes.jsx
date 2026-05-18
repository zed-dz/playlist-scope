import Icon from '../../Icon.jsx';

export default function QuotesTab({ video, arabic, quotes, quotesLoading, extractQuotes, setQuotes, toast }) {
  return (
    <div className="animate-in">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="display text-2xl"><span className="display-italic">Memorable</span> quotes</div>
        {!quotes && !quotesLoading && (
          <button onClick={extractQuotes} className="btn-primary">
            <Icon name="sparkles" size={12} /> Extract with AI
          </button>
        )}
        {quotes && (
          <button onClick={() => { setQuotes(null); extractQuotes(); }} className="btn-ghost text-xs">
            <Icon name="refresh" size={12} /> Find more
          </button>
        )}
      </div>
      {quotesLoading && <div className="text-sm flex items-center gap-2 pulse-soft" style={{ color: 'var(--text-2)' }}><span className="spinner" /> Reading transcript and finding the gems...</div>}
      {quotes && (
        <div className="space-y-4">
          {quotes.map((q, i) => (
            <div key={i} className="card p-5">
              <div className={`md ${arabic ? 'rtl-content' : ''}`}>
                <blockquote>{q.quote}</blockquote>
              </div>
              {q.context && (
                <div className={`text-xs mt-2 ${arabic ? 'rtl-content' : ''}`} style={{ color: 'var(--text-2)' }}>— {q.context}</div>
              )}
              <button className="btn-ghost text-xs mt-3"
                      onClick={() => { navigator.clipboard.writeText(`"${q.quote}" — ${video.uploader}, "${video.title}"`); toast.push('Quote copied', { type: 'success' }); }}>
                <Icon name="copy" size={12} /> Copy
              </button>
            </div>
          ))}
        </div>
      )}
      {!quotes && !quotesLoading && (
        <div className="empty-state">
          <div className="display text-2xl"><span className="display-italic">Find</span> the gems</div>
          <p>Claude reads the transcript and extracts the most memorable, share-worthy lines.</p>
        </div>
      )}
    </div>
  );
}
