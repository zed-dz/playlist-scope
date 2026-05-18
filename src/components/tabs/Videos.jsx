import { useState, useEffect, useMemo } from 'react';
import VideoCard from '../VideoCard.jsx';
import Icon from '../Icon.jsx';
import { LANG_LABELS, langKey } from '../../lib/i18n.js';

export default function VideosTab({ data, onOpenVideo, initialFilter, bookmarks, selectMode, selectedIds, onToggleSelect }) {
  const [query, setQuery] = useState('');
  const [filterChannel, setFilterChannel] = useState(initialFilter?.channel || 'all');
  const [filterLang, setFilterLang] = useState('all');
  const [filterTool, setFilterTool] = useState(initialFilter?.tool || 'all');
  const [filterBookmark, setFilterBookmark] = useState(false);
  const [sortBy, setSortBy] = useState('order');

  useEffect(() => {
    if (initialFilter?.channel) setFilterChannel(initialFilter.channel);
    if (initialFilter?.tool) setFilterTool(initialFilter.tool);
  }, [initialFilter]);

  const channelCounts = useMemo(() => {
    const c = {};
    data.videos.forEach(v => { c[v.uploader] = (c[v.uploader] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [data.videos]);

  const langOptions = useMemo(() => {
    const langs = {};
    data.videos.forEach(v => {
      const l = langKey(v.content_lang || 'en');
      langs[l] = (langs[l] || 0) + 1;
    });
    return Object.entries(langs).sort((a, b) => b[1] - a[1]);
  }, [data.videos]);

  const tools = useMemo(() => Object.keys(data.tool_index || {}).sort(), [data.tool_index]);

  const filtered = useMemo(() => {
    let vids = [...data.videos];
    if (query) {
      const q = query.toLowerCase();
      vids = vids.filter(v =>
        v.title.toLowerCase().includes(q) ||
        v.uploader.toLowerCase().includes(q) ||
        (v.tools_mentioned || []).some(t => t.toLowerCase().includes(q)) ||
        (v.bullets || []).some(b => b.toLowerCase().includes(q))
      );
    }
    if (filterChannel !== 'all') vids = vids.filter(v => v.uploader === filterChannel);
    if (filterLang !== 'all') vids = vids.filter(v => langKey(v.content_lang) === filterLang);
    if (filterTool !== 'all') vids = vids.filter(v => (v.tools_mentioned || []).includes(filterTool));
    if (filterBookmark) vids = vids.filter(v => bookmarks[v.id]);
    if (sortBy === 'order') vids.sort((a, b) => a.index - b.index);
    else if (sortBy === 'order_desc') vids.sort((a, b) => b.index - a.index);
    else if (sortBy === 'views') vids.sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
    else if (sortBy === 'duration') vids.sort((a, b) => (b.duration_sec || 0) - (a.duration_sec || 0));
    else if (sortBy === 'duration_asc') vids.sort((a, b) => (a.duration_sec || 0) - (b.duration_sec || 0));
    else if (sortBy === 'transcript') vids.sort((a, b) => (b.transcript_chars || 0) - (a.transcript_chars || 0));
    return vids;
  }, [data.videos, query, filterChannel, filterLang, filterTool, filterBookmark, sortBy, bookmarks]);

  const anyFilter = filterChannel !== 'all' || filterTool !== 'all' || filterLang !== 'all' || filterBookmark || query;

  return (
    <div className="animate-in">
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex-1 min-w-[220px] relative">
          <input type="text" placeholder="Search title, channel, bullets, tools..."
            className="input-base pl-10" value={query} onChange={e => setQuery(e.target.value)} />
          <Icon name="search" size={16} className="absolute left-3 top-3 opacity-50" />
        </div>
        <select className="input-base" style={{ width: 'auto' }} value={filterChannel} onChange={e => setFilterChannel(e.target.value)}>
          <option value="all">All channels ({channelCounts.length})</option>
          {channelCounts.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
        </select>
        {langOptions.length > 1 && (
          <select className="input-base" style={{ width: 'auto' }} value={filterLang} onChange={e => setFilterLang(e.target.value)}>
            <option value="all">All languages</option>
            {langOptions.map(([l, n]) => <option key={l} value={l}>{LANG_LABELS[l]?.native || l} ({n})</option>)}
          </select>
        )}
        {tools.length > 0 && (
          <select className="input-base" style={{ width: 'auto' }} value={filterTool} onChange={e => setFilterTool(e.target.value)}>
            <option value="all">All tools</option>
            {tools.map(t => <option key={t} value={t}>{t} ({data.tool_index[t].length})</option>)}
          </select>
        )}
        <select className="input-base" style={{ width: 'auto' }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="order">Playlist order</option>
          <option value="order_desc">Reverse order</option>
          <option value="views">Most viewed</option>
          <option value="duration">Longest first</option>
          <option value="duration_asc">Shortest first</option>
          <option value="transcript">Most transcript content</option>
        </select>
        <button className={`btn-icon ${filterBookmark ? 'active' : ''}`}
                onClick={() => setFilterBookmark(!filterBookmark)}
                title={filterBookmark ? "Showing bookmarked only" : "Show bookmarked only"}
                style={{ padding: '0.45rem 0.9rem' }}>
          <Icon name="bookmark" size={14} className={filterBookmark ? 'bookmark-active' : ''} />
        </button>
      </div>
      <div className="text-xs mb-4 flex items-center justify-between" style={{ color: 'var(--text-2)' }}>
        <span>Showing <span className="num" style={{ color: 'var(--text-0)' }}>{filtered.length}</span> of {data.videos.length} videos
          {selectMode && <span style={{ color: 'var(--accent-bright)' }}> · {selectedIds.size} selected for compare</span>}
        </span>
        {anyFilter && (
          <button className="text-xs hover:underline" style={{ color: 'var(--accent-bright)' }}
                  onClick={() => { setQuery(''); setFilterChannel('all'); setFilterLang('all'); setFilterTool('all'); setFilterBookmark(false); }}>
            Clear filters
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map(v => (
          <VideoCard key={v.id} video={v} onOpen={onOpenVideo} query={query}
                     isBookmarked={bookmarks[v.id]}
                     selectMode={selectMode}
                     isSelected={selectedIds?.has(v.id)}
                     onToggleSelect={onToggleSelect} />
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="empty-state">
          <div className="display text-3xl"><span className="display-italic">Nothing</span> matches</div>
          <p>Try clearing filters or broadening your search.</p>
        </div>
      )}
    </div>
  );
}
