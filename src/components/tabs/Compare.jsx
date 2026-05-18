import { useState, useMemo } from 'react';
import Icon from '../Icon.jsx';
import { useToast } from '../Toast.jsx';
import { callClaude } from '../../lib/api.js';
import { renderMarkdown } from '../../lib/markdown.jsx';
import { thumb } from '../../lib/format.js';
import { REPORT_LANGUAGES } from './Reports.jsx';

export default function CompareTab({ data, selectedIds, onClearSelection, onOpenVideo, onToggleSelect }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [language, setLanguage] = useState('en');
  const toast = useToast();

  const selectedVideos = useMemo(() =>
    data.videos.filter(v => selectedIds.has(v.id)),
    [data.videos, selectedIds]
  );

  const runComparison = async () => {
    setLoading(true);
    setError(null);
    try {
      const videosData = selectedVideos.map(v => {
        const transcript = data.transcripts[v.id]?.text || '';
        const trimmed = transcript.length > 30000 ? transcript.slice(0, 30000) + '...' : transcript;
        return `=== Video: "${v.title}" by ${v.uploader} (${v.duration_hms}) ===
Bullets: ${(v.bullets || []).join(' | ')}
Tools mentioned: ${(v.tools_mentioned || []).join(', ')}

Transcript:
${trimmed}`;
      }).join('\n\n---\n\n');

      const langInstr = language === 'en' ? 'Write in English.'
        : language === 'ar' ? 'IMPORTANT: Write the analysis in Arabic (العربية). Use proper MSA. Keep tool names and URLs in Latin form.'
        : language === 'fr' ? 'IMPORTANT: Write the analysis in French.'
        : 'IMPORTANT: Write the analysis in Spanish.';

      const prompt = `You are comparing ${selectedVideos.length} YouTube videos. Generate a thorough side-by-side analysis with these sections (use markdown headings):

## Common Ground
What do these videos AGREE on? List the points all/most share.

## Where They Diverge
Specific disagreements or contradictions between them. Cite which video.

## Unique to Each
For each video, the most distinctive insight that the others don't cover.

## Recommended Watch Order
If someone wanted to learn this topic, what order should they watch in and why?

## Verdict
Which video offers the most value, for whom? Be specific and opinionated.

${langInstr}

Source content:
${videosData}`;

      const result = await callClaude({ prompt, maxTokens: 4000 });
      setAnalysis(result);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const arabic = language === 'ar';

  if (selectedIds.size === 0) {
    return (
      <div className="empty-state mx-auto" style={{ maxWidth: '600px' }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
             style={{ background: 'var(--accent-soft)', color: 'var(--accent-bright)' }}>
          <Icon name="layers" size={28} />
        </div>
        <div className="display text-3xl"><span className="display-italic">Compare</span> videos</div>
        <p>Go to the Videos tab and click <strong>Compare mode</strong> in the header, then pick 2-4 videos to compare side by side.</p>
      </div>
    );
  }

  return (
    <div className="animate-in">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="display text-4xl"><span className="display-italic">Compare</span> {selectedVideos.length} videos</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
            Claude reads all transcripts and synthesizes agreements, disagreements, and unique insights.
          </p>
        </div>
        <button className="btn-ghost" onClick={onClearSelection}><Icon name="x" size={12} /> Clear selection</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {selectedVideos.map(v => (
          <div key={v.id} className="card p-3 relative">
            <button className="absolute top-2 right-2 btn-icon" style={{ width: 24, height: 24, padding: 2 }}
                    onClick={() => onToggleSelect(v.id)}>
              <Icon name="x" size={12} />
            </button>
            <img src={thumb(v.id, 'mq')} alt={v.title}
                 className="w-full rounded mb-2 cursor-pointer"
                 style={{ aspectRatio: '16/9', objectFit: 'cover' }}
                 onClick={() => onOpenVideo(v)} />
            <div className="text-xs line-clamp-2" style={{ color: 'var(--text-0)' }}>{v.title}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-2)' }}>{v.uploader} · {v.duration_hms}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <select className="input-base" style={{ width: 'auto' }} value={language} onChange={e => setLanguage(e.target.value)}>
          {REPORT_LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.native}</option>)}
        </select>
        <button className="btn-primary" onClick={runComparison} disabled={loading || selectedIds.size < 2}>
          {loading ? <><span className="spinner" /> Analyzing...</> : <><Icon name="sparkles" size={14} /> {analysis ? 'Re-run analysis' : 'Run comparison'}</>}
        </button>
        {analysis && (
          <button className="btn-ghost" onClick={() => { navigator.clipboard.writeText(analysis); toast.push('Copied', { type: 'success' }); }}>
            <Icon name="copy" size={12} /> Copy
          </button>
        )}
        {selectedIds.size < 2 && !loading && (
          <div className="text-sm" style={{ color: 'var(--text-2)' }}>Pick at least 2 videos to compare.</div>
        )}
        {error && <div className="text-sm" style={{ color: 'var(--danger)' }}>Error: {error}</div>}
      </div>

      {loading && (
        <div className="card p-8 text-center">
          <div className="spinner spinner-lg mx-auto mb-3"></div>
          <p className="text-sm pulse-soft" style={{ color: 'var(--text-2)' }}>Reading all transcripts and comparing...</p>
        </div>
      )}

      {analysis && (
        <div className="card p-8 mx-auto" style={{ maxWidth: '820px' }}>
          <div className={`md ${arabic ? 'rtl-content' : ''}`}>{renderMarkdown(analysis)}</div>
        </div>
      )}
    </div>
  );
}
