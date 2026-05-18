import { useState } from 'react';
import Icon from '../Icon.jsx';
import { useToast } from '../Toast.jsx';
import { callClaude, exportToNotion, exportToDrive, exportToGmail } from '../../lib/api.js';
import { renderMarkdown, MindmapSVG } from '../../lib/markdown.jsx';
import { slugify } from '../../lib/format.js';

export const REPORT_STYLES = [
  { id: 'briefing', name: 'Briefing', icon: 'file', desc: 'Executive summary with key findings and topic clusters',
    promptTemplate: () => `Write a structured briefing document. Include: a one-sentence top-line summary; 3-5 main themes with explanation; key tools/products discussed; standout claims or controversies; what to take away. Editorial tone. Use markdown headings and prose paragraphs (not just bullets). Be specific, name names, quote when useful.` },
  { id: 'study_guide', name: 'Study Guide', icon: 'book', desc: 'Question-and-answer format for learning',
    promptTemplate: () => `Write a study guide in Q&A format. Start with 5 short-answer questions (with answers). Then 3 deeper essay-style questions (with model answers). Then a glossary of 8-12 key terms. Use markdown headings.` },
  { id: 'article', name: 'Article', icon: 'edit', desc: 'Flowing editorial prose, magazine-style',
    promptTemplate: () => `Write a long-form editorial article (1200-1500 words) synthesizing the content. Use a strong opening hook, structured argument with subheadings, specific examples and quotes, and a memorable closing. Write in the voice of a thoughtful tech journalist. Use markdown.` },
  { id: 'cheatsheet', name: 'Cheatsheet', icon: 'list', desc: 'Dense bullets, quick-reference scan format',
    promptTemplate: () => `Build a dense cheatsheet. Organize by topic. Use short bullets (under 12 words each). Include: every tool/product mentioned with one-line definition; every URL/resource referenced; commands or specific techniques; numbers/stats/prices. Use markdown headings and tables. Scannable, not narrative.` },
  { id: 'podcast', name: 'Podcast Script', icon: 'mic', desc: 'Two-host conversational dialogue, NotebookLM-style',
    promptTemplate: () => `Write a podcast script with TWO hosts (call them Host A and Host B) having an engaging conversation about this content. Length: 8-12 minutes spoken (roughly 1500-2000 words). Include: opening hook, natural back-and-forth dialogue, hosts disagreeing or pushing back on each other, specific examples from the source, listener-friendly explanations of jargon, and a clear sign-off. Format as: **Host A:** ... / **Host B:** ... etc.` },
  { id: 'mindmap', name: 'Mindmap', icon: 'layers', desc: 'Hierarchical breakdown of concepts and relationships',
    promptTemplate: () => `Build a hierarchical mindmap in nested markdown lists. Top level = main themes (3-5). Each branches into sub-concepts. Leaf nodes are specific examples, tools, or facts. Use 4 levels of nesting maximum. Be exhaustive but precise.` },
];

export const REPORT_LANGUAGES = [
  { id: 'en', label: 'English', native: 'English' },
  { id: 'ar', label: 'Arabic', native: 'العربية' },
  { id: 'fr', label: 'French', native: 'Français' },
  { id: 'es', label: 'Spanish', native: 'Español' },
];

export const REPORT_LENGTHS = [
  { id: 'short', label: 'Short', tokens: 1500 },
  { id: 'medium', label: 'Medium', tokens: 3000 },
  { id: 'long', label: 'Long', tokens: 6000 },
];

export default function ReportsTab({ data, reports, onSaveReport }) {
  const [scope, setScope] = useState('playlist');
  const [videoId, setVideoId] = useState(null);
  const [style, setStyle] = useState('briefing');
  const [language, setLanguage] = useState('en');
  const [length, setLength] = useState('medium');
  const [status, setStatus] = useState('idle');
  const [mcpStatus, setMcpStatus] = useState('idle');
  const [error, setError] = useState(null);
  const toast = useToast();

  const cacheKey = `${scope}:${videoId || 'all'}:${style}:${language}:${length}`;
  const cachedResult = reports[cacheKey];
  const selectedStyle = REPORT_STYLES.find(s => s.id === style);
  const selectedLang = REPORT_LANGUAGES.find(l => l.id === language);
  const selectedLength = REPORT_LENGTHS.find(l => l.id === length);
  const arabic = language === 'ar';

  const buildPrompt = () => {
    const stylePrompt = selectedStyle.promptTemplate(language);
    const langInstr = language === 'en' ? 'Write in clear English.'
      : language === 'ar' ? 'IMPORTANT: Write the entire report in Arabic (العربية). Use proper MSA. Keep tool names and URLs in their original Latin form, but everything else in Arabic.'
      : language === 'fr' ? 'IMPORTANT: Write the entire report in French. Use proper diacritics and idiomatic French.'
      : 'IMPORTANT: Write the entire report in Spanish.';
    const lengthInstr = length === 'short' ? 'Keep it concise - this should be a quick read.'
      : length === 'long' ? 'Be thorough and detailed - go deep on every section.'
      : 'Aim for moderate depth.';

    let sourceContent = '';
    if (scope === 'video') {
      const v = data.videos.find(vv => vv.id === videoId);
      if (!v) return null;
      const transcript = data.transcripts[v.id]?.text || '';
      const trimmed = transcript.length > 80000 ? transcript.slice(0, 80000) + '...[truncated]' : transcript;
      sourceContent = `Single video:
Title: ${v.title}
Channel: ${v.uploader}
Duration: ${v.duration_hms}

Bullets:
${(v.bullets || []).map((b, i) => `${i+1}. ${b}`).join('\n')}

Tools mentioned: ${(v.tools_mentioned || []).join(', ')}

Full transcript:
${trimmed}`;
    } else {
      const videoBriefs = data.videos.map(v =>
        `[#${v.index}] "${v.title}" (${v.uploader}, ${v.duration_hms})
${(v.bullets || []).map(b => `  • ${b}`).join('\n')}
${v.tools_mentioned?.length ? `  Tools: ${v.tools_mentioned.join(', ')}` : ''}`
      ).join('\n\n');
      sourceContent = `YouTube playlist: "${data.meta.playlist_title}" (${data.videos.length} videos)

VIDEO-BY-VIDEO BREAKDOWN:
${videoBriefs}

CROSS-PLAYLIST DATA:
Tool mentions (sorted): ${Object.entries(data.tool_index || {}).sort((a, b) => b[1].length - a[1].length).slice(0, 30).map(([t, vs]) => `${t} (${vs.length})`).join(', ')}`;
    }
    return `You are creating a ${selectedStyle.name.toLowerCase()} report from YouTube video content.

${stylePrompt}

${langInstr}
${lengthInstr}

${sourceContent}

Return ONLY the report content in markdown. No preamble, no meta-commentary like "Here is your report". Start directly with the title or first heading.`;
  };

  const generate = async () => {
    setStatus('working');
    setError(null);
    try {
      const prompt = buildPrompt();
      if (!prompt) throw new Error('Could not build prompt');
      const result = await callClaude({ prompt, maxTokens: selectedLength.tokens });
      await onSaveReport(cacheKey, result);
      setStatus('idle');
      toast.push('Report generated', { type: 'success' });
    } catch (e) { setError(e.message); setStatus('idle'); }
  };

  const regenerate = () => generate();

  const exportReport = () => {
    if (!cachedResult) return;
    const blob = new Blob([cachedResult], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const scope_label = scope === 'video' ? (data.videos.find(v => v.id === videoId)?.title || 'video') : data.meta.playlist_title;
    a.href = url;
    a.download = `${slugify(scope_label)}_${style}_${language}.md`;
    a.click();
    toast.push('Exported as Markdown', { type: 'success' });
  };

  const doMcpExport = async (kind) => {
    setMcpStatus(kind);
    try {
      if (kind === 'notion') {
        const title = scope === 'video'
          ? `${data.videos.find(v => v.id === videoId)?.title || 'Video'} — ${selectedStyle.name}`
          : `${data.meta.playlist_title} — ${selectedStyle.name} (${selectedLang.label})`;
        const resp = await exportToNotion(title, cachedResult);
        const m = resp.match(/NOTION_URL:\s*(\S+)/);
        toast.push(m ? `Sent to Notion → ${m[1]}` : 'Sent to Notion', { type: 'success' });
      } else if (kind === 'drive') {
        const title = scope === 'video'
          ? `${slugify(data.videos.find(v => v.id === videoId)?.title || 'video')}_${style}_${language}`
          : `${slugify(data.meta.playlist_title)}_${style}_${language}`;
        const resp = await exportToDrive(title, cachedResult);
        const m = resp.match(/DRIVE_URL:\s*(\S+)/);
        toast.push(m ? `Saved to Drive → ${m[1]}` : 'Saved to Drive', { type: 'success' });
      } else if (kind === 'gmail') {
        const subject = scope === 'video'
          ? `${selectedStyle.name}: ${data.videos.find(v => v.id === videoId)?.title || 'Video'}`
          : `${selectedStyle.name} (${selectedLang.label}): ${data.meta.playlist_title}`;
        await exportToGmail(subject, cachedResult);
        toast.push('Draft created in Gmail', { type: 'success' });
      }
    } catch (e) {
      toast.push(`${kind}: ${e.message.slice(0, 100)}`, { type: 'error' });
    }
    setMcpStatus('idle');
  };

  return (
    <div className="animate-in">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="display text-4xl"><span className="display-italic">Report</span> Studio</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
            Generate study guides, articles, podcast scripts and more from your playlist — in your language.
          </p>
        </div>
      </div>

      <div className="mb-6">
        <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-3)' }}>Choose a format</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {REPORT_STYLES.map(s => (
            <div key={s.id} className={`report-style-card ${style === s.id ? 'selected' : ''}`} onClick={() => setStyle(s.id)}>
              <div className="icon"><Icon name={s.icon} size={18} /></div>
              <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-0)' }}>{s.name}</div>
              <div className="text-xs leading-snug" style={{ color: 'var(--text-2)' }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <div>
          <div className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>Source</div>
          <select className="input-base" value={scope === 'playlist' ? 'playlist' : videoId || ''}
                  onChange={e => {
                    if (e.target.value === 'playlist') { setScope('playlist'); setVideoId(null); }
                    else { setScope('video'); setVideoId(e.target.value); }
                  }}>
            <option value="playlist">Whole playlist ({data.videos.length} videos)</option>
            <optgroup label="Single video">
              {data.videos.map(v => <option key={v.id} value={v.id}>#{v.index} · {v.title.slice(0, 60)}</option>)}
            </optgroup>
          </select>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>Language</div>
          <select className="input-base" value={language} onChange={e => setLanguage(e.target.value)}>
            {REPORT_LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.native} ({l.label})</option>)}
          </select>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>Length</div>
          <select className="input-base" value={length} onChange={e => setLength(e.target.value)}>
            {REPORT_LENGTHS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {!cachedResult && (
          <button className="btn-primary" onClick={generate} disabled={status === 'working'}>
            {status === 'working' ? <><span className="spinner" /> Generating...</> : <><Icon name="sparkles" size={14} /> Generate {selectedStyle.name}</>}
          </button>
        )}
        {cachedResult && (
          <>
            <button className="btn-ghost" onClick={regenerate} disabled={status === 'working'}>
              {status === 'working' ? <span className="spinner" /> : <Icon name="refresh" size={12} />} Regenerate
            </button>
            <button className="btn-ghost" onClick={() => { navigator.clipboard.writeText(cachedResult); toast.push('Copied', { type: 'success' }); }}>
              <Icon name="copy" size={12} /> Copy
            </button>
            <button className="btn-ghost" onClick={exportReport}>
              <Icon name="download" size={12} /> Export .md
            </button>
            <button className="btn-ghost" disabled={mcpStatus === 'notion'} onClick={() => doMcpExport('notion')}>
              {mcpStatus === 'notion' ? <span className="spinner" /> : <Icon name="file" size={12} />} Send to Notion
            </button>
            <button className="btn-ghost" disabled={mcpStatus === 'drive'} onClick={() => doMcpExport('drive')}>
              {mcpStatus === 'drive' ? <span className="spinner" /> : <Icon name="upload" size={12} />} Save to Drive
            </button>
            <button className="btn-ghost" disabled={mcpStatus === 'gmail'} onClick={() => doMcpExport('gmail')}>
              {mcpStatus === 'gmail' ? <span className="spinner" /> : <Icon name="mail" size={12} />} Email me
            </button>
          </>
        )}
        {error && <div className="text-sm flex-1" style={{ color: 'var(--danger)' }}>Error: {error}</div>}
      </div>

      {status === 'working' && !cachedResult && (
        <div className="card p-8 text-center">
          <div className="spinner spinner-lg mx-auto mb-3"></div>
          <p className="text-sm pulse-soft" style={{ color: 'var(--text-2)' }}>
            Generating {selectedStyle.name.toLowerCase()} in {selectedLang.native}...
          </p>
          <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>
            {scope === 'playlist' ? `Reading all ${data.videos.length} videos...` : 'Analyzing the transcript...'}
          </p>
        </div>
      )}

      {cachedResult && (
        <div className="card p-8 mx-auto" style={{ maxWidth: style === 'mindmap' ? '100%' : '820px' }}>
          {style === 'mindmap' ? (
            <>
              <div className="text-xs uppercase tracking-wider mb-4" style={{ color: 'var(--text-3)' }}>
                Visual mindmap · drag to scroll · view source as markdown below
              </div>
              <MindmapSVG markdown={cachedResult} isRTL={arabic} />
              <details className="mt-6">
                <summary className="text-xs cursor-pointer" style={{ color: 'var(--text-2)' }}>Markdown source</summary>
                <div className={`md mt-4 ${arabic ? 'rtl-content' : ''}`}
                     style={arabic ? { textAlign: 'right', direction: 'rtl', fontFamily: 'Amiri, Geist, serif' } : {}}>
                  {renderMarkdown(cachedResult)}
                </div>
              </details>
            </>
          ) : (
            <div className={`md ${arabic ? 'rtl-content' : ''}`}
                 style={arabic ? { textAlign: 'right', direction: 'rtl', fontFamily: 'Amiri, Geist, serif' } : {}}>
              {renderMarkdown(cachedResult)}
            </div>
          )}
        </div>
      )}

      {!cachedResult && status !== 'working' && (
        <div className="empty-state mx-auto" style={{ maxWidth: '600px' }}>
          <div className="display text-3xl mb-2"><span className="display-italic">Pick</span> a style and generate</div>
          <p>Reports are cached per playlist/video/style/language combo — you can switch settings to compare outputs without losing previous ones.</p>
        </div>
      )}
    </div>
  );
}
