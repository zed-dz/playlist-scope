import Icon from '../../Icon.jsx';

export default function ChaptersTab({ arabic, existingChapters, chapters, chaptersLoading, generateChapters, setChapters }) {
  return (
    <div className="animate-in">
      {existingChapters.length > 0 && (
        <div className="mb-4">
          <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-3)' }}>From description</div>
          <div className="card divide-y" style={{ borderColor: 'var(--border)' }}>
            {existingChapters.map((ch, i) => (
              <div key={i} className="p-3 flex items-start gap-4 hover:bg-white/[0.02]">
                <span className="num text-xs flex-shrink-0 px-2 py-1 rounded" style={{ background: 'var(--bg-2)', color: 'var(--accent-bright)' }}>{ch.time}</span>
                <span className="text-sm" style={{ color: 'var(--text-0)' }}>{ch.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
            {existingChapters.length > 0 ? 'AI-augmented chapter breakdown' : 'AI-generated chapters'}
          </div>
          {!chapters && !chaptersLoading && (
            <button onClick={generateChapters} className="btn-ghost text-xs">
              <Icon name="sparkles" size={12} /> Generate with AI
            </button>
          )}
          {chapters && (
            <button onClick={() => { setChapters(null); generateChapters(); }} className="btn-ghost text-xs">
              <Icon name="refresh" size={12} /> Regenerate
            </button>
          )}
        </div>
        {chaptersLoading && <div className="text-sm flex items-center gap-2 pulse-soft" style={{ color: 'var(--text-2)' }}><span className="spinner" /> Analyzing transcript and generating chapters...</div>}
        {chapters && (
          <div className="card divide-y" style={{ borderColor: 'var(--border)' }}>
            {chapters.map((ch, i) => (
              <div key={i} className="p-4 hover:bg-white/[0.02]">
                <div className="flex items-start gap-4">
                  <span className="num text-xs flex-shrink-0 px-2 py-1 rounded" style={{ background: 'var(--bg-2)', color: 'var(--accent-bright)' }}>{ch.approx_time}</span>
                  <div className="flex-1">
                    <div className={`text-sm font-medium mb-1 ${arabic ? 'rtl-content' : ''}`} style={{ color: 'var(--text-0)' }}>{ch.title}</div>
                    {ch.summary && <div className={`text-xs ${arabic ? 'rtl-content' : ''}`} style={{ color: 'var(--text-2)' }}>{ch.summary}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {!chapters && !chaptersLoading && existingChapters.length === 0 && (
          <div className="empty-state">
            <div className="display text-2xl"><span className="display-italic">No</span> chapters</div>
            <p>This video doesn't have timestamps. Click above to generate them with AI.</p>
          </div>
        )}
      </div>
    </div>
  );
}
