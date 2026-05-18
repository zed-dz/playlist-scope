export default function CommentsTab({ video, comments }) {
  if (comments.length === 0) {
    return <div className="empty-state"><div className="display text-2xl">No comments captured</div></div>;
  }

  return (
    <div className="animate-in space-y-4">
      {video.comment_analysis && (
        <div className="card p-5">
          <div className="flex items-baseline gap-3 mb-3 flex-wrap">
            <div className="display text-2xl"><span className="display-italic">{video.comment_analysis.count}</span> comments</div>
            {video.comment_analysis.themes && video.comment_analysis.themes.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {video.comment_analysis.themes.map(t => (
                  <span key={t.theme} className={`chip theme-${t.theme}`}>{t.theme} · {t.matches}</span>
                ))}
              </div>
            )}
          </div>
          {video.comment_analysis.highlights && video.comment_analysis.highlights.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider mt-3 mb-2" style={{ color: 'var(--text-3)' }}>Top highlights</div>
              {video.comment_analysis.highlights.slice(0, 3).map((h, i) => (
                <div key={i} className="text-sm py-2" style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                  <div className="flex items-center gap-2 text-xs mb-1">
                    <span style={{ color: 'var(--accent-bright)' }}>{h.author}</span>
                    <span className="num" style={{ color: 'var(--text-3)' }}>♥ {h.likes}</span>
                  </div>
                  <div style={{ color: 'var(--text-1)' }}>{h.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div>
        <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-3)' }}>All comments</div>
        <div className="space-y-2">
          {comments.map((c, i) => (
            <div key={i} className="card p-4" style={{ background: c.is_pinned ? 'var(--accent-soft)' : 'var(--bg-1)' }}>
              <div className="flex items-center justify-between mb-2 text-xs">
                <span style={{ color: 'var(--accent-bright)' }}>{c.author} {c.is_pinned && <span style={{ color: 'var(--accent)' }}>📌</span>}</span>
                <span className="num" style={{ color: 'var(--text-3)' }}>♥ {c.likes || 0}</span>
              </div>
              <div className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-1)' }}>{c.text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
