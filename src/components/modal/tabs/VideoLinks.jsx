export default function VideoLinksTab({ video, arabic }) {
  return (
    <div className="animate-in space-y-5">
      {video.tools_mentioned && video.tools_mentioned.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-3)' }}>Tools mentioned in video</div>
          <div className="card p-4 flex flex-wrap gap-2">
            {video.tools_mentioned.map(t => <span key={t} className="chip chip-accent">{t}</span>)}
          </div>
        </div>
      )}
      {video.description_links && video.description_links.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-3)' }}>Links in description ({video.description_links.length})</div>
          <div className="card divide-y" style={{ borderColor: 'var(--border)' }}>
            {video.description_links.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener" className="block p-3 text-sm hover:bg-white/[0.03] break-all" style={{ color: 'var(--accent-bright)' }}>{url}</a>
            ))}
          </div>
        </div>
      )}
      {video.description && (
        <details className="card p-4">
          <summary className="text-xs uppercase tracking-wider cursor-pointer" style={{ color: 'var(--text-3)' }}>Full description</summary>
          <pre className={`mt-3 text-sm whitespace-pre-wrap font-sans ${arabic ? 'rtl-content' : ''}`} style={{ color: 'var(--text-1)', lineHeight: 1.6 }}>{video.description}</pre>
        </details>
      )}
    </div>
  );
}
