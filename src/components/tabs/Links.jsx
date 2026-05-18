import { useState, useMemo } from 'react';
import { BarChart } from '../Charts.jsx';

export default function LinksTab({ data, onOpenVideo }) {
  const [tab, setTab] = useState('description');
  const [query, setQuery] = useState('');

  const sortedDescLinks = useMemo(() =>
    Object.entries(data.link_index || {})
      .map(([url, videos]) => ({ url, videos, count: videos.length }))
      .filter(l => !query || l.url.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => b.count - a.count),
    [data.link_index, query]);

  const sortedCommentLinks = useMemo(() =>
    Object.entries(data.comment_link_index || {})
      .map(([url, items]) => ({ url, items, count: items.length }))
      .filter(l => !query || l.url.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => b.count - a.count),
    [data.comment_link_index, query]);

  const domainCounts = useMemo(() => {
    const counts = {};
    const source = tab === 'description' ? sortedDescLinks : sortedCommentLinks;
    source.forEach(({ url, count }) => {
      try {
        const host = new URL(url).hostname.replace(/^www\./, '');
        counts[host] = (counts[host] || 0) + count;
      } catch { /* skip malformed */ }
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [tab, sortedDescLinks, sortedCommentLinks]);

  if (sortedDescLinks.length === 0 && sortedCommentLinks.length === 0) {
    return <div className="empty-state"><div className="display text-3xl"><span className="display-italic">No</span> links indexed</div><p>This playlist doesn't have description or comment links extracted.</p></div>;
  }

  return (
    <div className="animate-in">
      <div className="flex gap-3 mb-4 items-center flex-wrap">
        <div className="switch">
          <button onClick={() => setTab('description')} className={tab === 'description' ? 'active' : ''}>
            Description ({sortedDescLinks.length})
          </button>
          <button onClick={() => setTab('comments')} className={tab === 'comments' ? 'active' : ''}>
            Comments ({sortedCommentLinks.length})
          </button>
        </div>
        <input type="text" placeholder="Filter URLs..." value={query} onChange={e => setQuery(e.target.value)}
               className="input-base flex-1 min-w-[200px] font-mono text-sm" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-3)' }}>
            {tab === 'description' ? 'Description URLs sorted by reuse' : 'Comment URLs sorted by reuse'}
          </div>
          <div className="card divide-y max-h-[70vh] overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
            {(tab === 'description' ? sortedDescLinks : sortedCommentLinks).slice(0, 80).map(item => (
              <div key={item.url} className="p-3 hover:bg-white/[0.02]">
                <div className="flex items-start gap-3">
                  <span className="num text-xs" style={{ color: item.count > 1 ? 'var(--accent-bright)' : 'var(--text-3)', minWidth: '24px' }}>
                    ×{item.count}
                  </span>
                  <div className="flex-1 min-w-0">
                    <a href={item.url} target="_blank" rel="noopener" className="text-sm hover:underline break-all" style={{ color: 'var(--accent-bright)' }}>{item.url}</a>
                    {tab === 'description' && (
                      <div className="mt-1 text-xs space-x-2" style={{ color: 'var(--text-2)' }}>
                        {item.videos.slice(0, 3).map(v => (
                          <button key={v.id} className="hover:underline"
                                  onClick={(e) => { e.stopPropagation(); onOpenVideo(data.videos.find(vv => vv.id === v.id)); }}
                                  style={{ color: 'var(--text-2)' }}>#{v.index}</button>
                        ))}
                        {item.videos.length > 3 && <span style={{ color: 'var(--text-3)' }}>+{item.videos.length - 3} more</span>}
                      </div>
                    )}
                    {tab === 'comments' && item.items[0] && (
                      <div className="mt-1 text-xs italic line-clamp-1" style={{ color: 'var(--text-2)' }}>
                        — {item.items[0].author}: {item.items[0].comment_excerpt}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-3)' }}>Top domains</div>
          <div className="card p-4"><BarChart data={domainCounts} /></div>
        </div>
      </div>
    </div>
  );
}
