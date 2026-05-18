import { useMemo } from 'react';
import { BarChart } from '../Charts.jsx';
import Icon from '../Icon.jsx';
import { formatDuration, formatChars } from '../../lib/format.js';
import { LANG_LABELS, langKey } from '../../lib/i18n.js';
import { renderMarkdown } from '../../lib/markdown.jsx';

export default function BriefingTab({ data, onAskPlaylist, enrichmentPanel }) {
  const empty = !data.synthesis_md || data.synthesis_md.trim().length < 50;

  const topTools = useMemo(() =>
    Object.entries(data.tool_index || {}).sort((a, b) => b[1].length - a[1].length).slice(0, 8),
    [data.tool_index]
  );

  const totalDuration = useMemo(() =>
    data.videos.reduce((s, v) => s + (v.duration_sec || 0), 0),
    [data.videos]
  );

  const topChannels = useMemo(() => {
    const counts = {};
    data.videos.forEach(v => { counts[v.uploader || 'Unknown'] = (counts[v.uploader || 'Unknown'] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [data.videos]);

  const langDist = useMemo(() => {
    const counts = {};
    data.videos.forEach(v => {
      const l = langKey(v.content_lang || v.transcript_lang || 'en');
      const label = LANG_LABELS[l]?.label || l.toUpperCase();
      counts[label] = (counts[label] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [data.videos]);

  const themeAgg = useMemo(() => {
    const totals = {};
    data.videos.forEach(v => {
      (v.comment_analysis?.themes || []).forEach(t => {
        totals[t.theme] = (totals[t.theme] || 0) + (t.matches || 0);
      });
    });
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [data.videos]);

  const topLinks = useMemo(() =>
    Object.entries(data.link_index || {})
      .map(([url, vids]) => ({ url, count: vids.length, vids }))
      .filter(l => l.count > 1).sort((a, b) => b.count - a.count).slice(0, 8),
    [data.link_index]
  );

  const durationBuckets = useMemo(() => {
    const buckets = { '0–5 min': 0, '5–15 min': 0, '15–30 min': 0, '30–60 min': 0, '60+ min': 0 };
    data.videos.forEach(v => {
      const m = (v.duration_sec || 0) / 60;
      if (m < 5) buckets['0–5 min']++;
      else if (m < 15) buckets['5–15 min']++;
      else if (m < 30) buckets['15–30 min']++;
      else if (m < 60) buckets['30–60 min']++;
      else buckets['60+ min']++;
    });
    return Object.entries(buckets);
  }, [data.videos]);

  return (
    <div className="animate-in">
      {enrichmentPanel}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Videos</div>
          <div className="display text-4xl mt-1" style={{ color: 'var(--text-0)' }}>{data.meta.video_count}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Runtime</div>
          <div className="display text-4xl mt-1" style={{ color: 'var(--text-0)' }}>{formatDuration(totalDuration)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Transcript</div>
          <div className="display text-4xl mt-1" style={{ color: 'var(--text-0)' }}>{formatChars(data.meta.total_transcript_chars)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Tools indexed</div>
          <div className="display text-4xl mt-1" style={{ color: 'var(--accent-bright)' }}>{Object.keys(data.tool_index || {}).length}</div>
        </div>
      </div>

      <button onClick={onAskPlaylist}
              className="w-full card p-5 text-left hover:bg-white/[0.02] mb-6 group transition-all"
              style={{ borderColor: 'var(--accent-deep)' }}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
               style={{ background: 'var(--accent-soft)', color: 'var(--accent-bright)' }}>
            <Icon name="sparkles" size={20} />
          </div>
          <div className="flex-1">
            <div className="display text-2xl"><span className="display-italic">Ask</span> the playlist anything</div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-2)' }}>Natural language search across all transcripts. Claude picks the best videos and answers from them.</div>
          </div>
          <Icon name="arrow_right" size={20} className="opacity-50 group-hover:opacity-100" />
        </div>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wider mb-3 flex items-center justify-between" style={{ color: 'var(--text-3)' }}>
            <span>Top channels</span>
            <span style={{ color: 'var(--text-2)' }}>{topChannels.length} of {new Set(data.videos.map(v => v.uploader)).size}</span>
          </div>
          <BarChart data={topChannels} />
        </div>
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-3)' }}>Top tools mentioned</div>
          <BarChart data={topTools.map(([t, vids]) => [t, vids.length])} />
        </div>
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-3)' }}>Video duration distribution</div>
          <BarChart data={durationBuckets} />
        </div>
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-3)' }}>Languages</div>
          {langDist.length > 0 ? <BarChart data={langDist} /> : <div className="text-sm" style={{ color: 'var(--text-2)' }}>No language data.</div>}
        </div>
        {themeAgg.length > 0 && (
          <div className="card p-5">
            <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-3)' }}>Aggregate comment themes</div>
            <BarChart data={themeAgg} />
          </div>
        )}
        {topLinks.length > 0 && (
          <div className="card p-5">
            <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-3)' }}>Most-reused links</div>
            <div className="space-y-1 text-sm">
              {topLinks.map(({ url, count }) => (
                <div key={url} className="flex items-center gap-2">
                  <span className="num text-xs flex-shrink-0" style={{ color: 'var(--accent-bright)', minWidth: 32 }}>×{count}</span>
                  <a href={url} target="_blank" rel="noopener" className="hover:underline truncate" style={{ color: 'var(--text-1)' }}>{url.replace(/^https?:\/\//, '')}</a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {!empty && (
        <div className="mx-auto" style={{ maxWidth: '820px' }}>
          <div className="md">{renderMarkdown(data.synthesis_md)}</div>
        </div>
      )}
      {empty && (
        <div className="mx-auto" style={{ maxWidth: '820px' }}>
          <div className="md">
            <h1>{data.meta.playlist_title}</h1>
            <p style={{ color: 'var(--text-2)' }}>{data.meta.video_count} videos · {formatDuration(totalDuration)} runtime · {formatChars(data.meta.total_transcript_chars)} chars of transcript captured</p>
            <h2>Getting started</h2>
            <p>Use <em>Search transcripts</em> for full-text discovery, <em>Videos</em> for the grid, <em>Tools</em> to see which videos cover which products, or <em>Reports</em> to generate study guides, articles, podcast scripts and more — in your preferred language.</p>
          </div>
        </div>
      )}
    </div>
  );
}
