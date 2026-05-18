import { useState, useEffect, useMemo } from 'react';
import { LANG_LABELS, langKey, isArabic } from '../../lib/i18n.js';
import { thumb, formatChars } from '../../lib/format.js';
import { highlightMatches } from '../../lib/markdown.jsx';

export default function SearchTab({ data, onOpenVideo }) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [scope, setScope] = useState('all');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  const langOptions = useMemo(() => {
    const langs = {};
    Object.values(data.transcripts || {}).forEach(t => {
      const l = langKey(t.lang || 'en');
      langs[l] = (langs[l] || 0) + 1;
    });
    return Object.entries(langs).sort((a, b) => b[1] - a[1]);
  }, [data.transcripts]);

  const results = useMemo(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) return [];
    const q = debouncedQuery.toLowerCase();
    const out = [];
    for (const video of data.videos) {
      const transcriptData = data.transcripts[video.id];
      if (!transcriptData) continue;
      if (scope !== 'all' && langKey(transcriptData.lang) !== scope) continue;
      const text = transcriptData.text;
      const lowText = text.toLowerCase();
      const matches = [];
      let idx = 0;
      while ((idx = lowText.indexOf(q, idx)) !== -1 && matches.length < 3) {
        const start = Math.max(0, idx - 120);
        const end = Math.min(text.length, idx + q.length + 120);
        const snippet = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
        matches.push(snippet);
        idx += q.length;
      }
      let total = 0;
      let s = lowText.indexOf(q);
      while (s !== -1) { total++; s = lowText.indexOf(q, s + 1); }
      if (matches.length > 0) out.push({ video, matches, total, lang: transcriptData.lang });
    }
    out.sort((a, b) => b.total - a.total);
    return out;
  }, [debouncedQuery, scope, data]);

  const totalMatches = useMemo(() => results.reduce((s, r) => s + r.total, 0), [results]);

  return (
    <div className="animate-in">
      <div className="card p-6 mb-5">
        <div className="display text-3xl mb-2"><span className="display-italic">Search</span> all transcripts</div>
        <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>
          Full-text search across <span className="num" style={{ color: 'var(--accent-bright)' }}>{formatChars(data.meta.total_transcript_chars)}</span> characters of transcript — every word from every video, no fetching, instant.
        </p>
        <div className="flex gap-2 flex-wrap">
          <input type="text" placeholder='Try: "claude code", "MCP", "skool", "nano banana"...'
                 value={query} onChange={e => setQuery(e.target.value)}
                 className="input-base flex-1 font-mono" autoFocus />
          {langOptions.length > 1 && (
            <select className="input-base" style={{ width: 'auto' }} value={scope} onChange={e => setScope(e.target.value)}>
              <option value="all">All languages</option>
              {langOptions.map(([l, n]) => <option key={l} value={l}>{LANG_LABELS[l]?.native || l} ({n})</option>)}
            </select>
          )}
        </div>
        {debouncedQuery.length >= 2 && (
          <div className="text-xs mt-3" style={{ color: 'var(--text-2)' }}>
            <span className="num" style={{ color: 'var(--accent-bright)' }}>{totalMatches}</span> matches in <span className="num" style={{ color: 'var(--accent-bright)' }}>{results.length}</span> videos
          </div>
        )}
      </div>

      {debouncedQuery.length >= 2 && results.length === 0 && (
        <div className="empty-state">
          <div className="display text-3xl"><span className="display-italic">No</span> matches</div>
          <p>Try different keywords or check spelling.</p>
        </div>
      )}

      <div className="space-y-3">
        {results.map(({ video, matches, total, lang }) => (
          <div key={video.id} className="card p-5 cursor-pointer card-hover" onClick={() => onOpenVideo(video)}>
            <div className="flex items-start gap-4">
              <img src={thumb(video.id, 'mq')} alt={video.title}
                   style={{ width: 120, height: 68, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className={`font-medium ${isArabic(lang) ? 'rtl-content' : ''}`} style={{ color: 'var(--text-0)' }}>{video.title}</div>
                  <div className="text-xs flex items-center gap-2 flex-shrink-0">
                    <span className="num" style={{ color: 'var(--accent-bright)' }}>{total} {total === 1 ? 'match' : 'matches'}</span>
                    <span className="lang-flag">{LANG_LABELS[langKey(lang)]?.flag || langKey(lang).toUpperCase()}</span>
                  </div>
                </div>
                <div className="text-xs mb-3" style={{ color: 'var(--text-2)' }}>#{video.index} · {video.uploader} · {video.duration_hms}</div>
                <div className="space-y-2">
                  {matches.map((m, i) => (
                    <div key={i} className={`text-xs leading-relaxed ${isArabic(lang) ? 'rtl-content' : ''}`} style={{ color: 'var(--text-1)' }}>
                      {highlightMatches(m, debouncedQuery)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
