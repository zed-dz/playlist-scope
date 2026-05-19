import { useState, useCallback } from 'react';
import Icon from '../../Icon.jsx';
import { FORMATS, generateVisualization, visualizationToMarkdown } from '../../../lib/visualize.js';
import { slugify } from '../../../lib/format.js';

const COLOR_MAP = {
  amber:  { bg: 'rgba(212, 163, 115, 0.10)', bd: 'rgba(212, 163, 115, 0.35)', fg: 'var(--accent-bright)' },
  blue:   { bg: 'rgba(126, 182, 212, 0.10)', bd: 'rgba(126, 182, 212, 0.35)', fg: 'var(--info)' },
  green:  { bg: 'rgba(132, 204, 138, 0.10)', bd: 'rgba(132, 204, 138, 0.35)', fg: 'var(--success)' },
  purple: { bg: 'rgba(176, 138, 212, 0.10)', bd: 'rgba(176, 138, 212, 0.35)', fg: 'var(--purple)' },
  pink:   { bg: 'rgba(198, 138, 170, 0.10)', bd: 'rgba(198, 138, 170, 0.35)', fg: 'var(--magenta)' },
  cyan:   { bg: 'rgba(126, 212, 200, 0.10)', bd: 'rgba(126, 212, 200, 0.35)', fg: '#7ed4c8' },
};
const swatch = (c) => COLOR_MAP[c] || COLOR_MAP.amber;

export default function VisualizeTab({ video, transcriptObj, lang, arabic, toast }) {
  const [format, setFormat] = useState('mindmap');
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('idle'); // idle|loading|done|error
  const [error, setError] = useState(null);

  const hasTranscript = !!transcriptObj?.text;

  const run = useCallback(async (chosen) => {
    const fmt = chosen || format;
    if (!hasTranscript) {
      toast.push('No transcript available for this video', { type: 'error' });
      return;
    }
    setStatus('loading'); setError(null); setData(null);
    try {
      const result = await generateVisualization({
        format: fmt, video, transcript: transcriptObj.text, lang, arabic,
      });
      setData({ format: fmt, body: result });
      setStatus('done');
    } catch (e) {
      setError(e.message); setStatus('error');
    }
  }, [format, hasTranscript, video, transcriptObj, lang, arabic, toast]);

  const onPickFormat = (id) => {
    setFormat(id);
    if (data && data.format !== id) { setData(null); setStatus('idle'); }
  };

  const exportMarkdown = () => {
    if (!data) return;
    const md = visualizationToMarkdown(data.format, data.body, video);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slugify(video.title)}_${data.format}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.push('Exported as Markdown', { type: 'success' });
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data.body, null, 2));
      toast.push('JSON copied', { type: 'success' });
    } catch { toast.push('Copy failed', { type: 'error' }); }
  };

  const active = FORMATS.find(f => f.id === format);

  return (
    <div className="animate-in">
      <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-3)' }}>
        Visual format
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {FORMATS.map(f => (
          <button
            key={f.id}
            onClick={() => onPickFormat(f.id)}
            className="chip chip-clickable"
            style={format === f.id ? {
              background: 'var(--accent-soft)',
              color: 'var(--accent-bright)',
              borderColor: 'var(--accent-deep)',
            } : {}}
          >
            <Icon name={f.icon} size={11} /> {f.label}
          </button>
        ))}
      </div>
      <div className="text-xs mb-4" style={{ color: 'var(--text-2)' }}>{active?.blurb}</div>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {status !== 'loading' && (!data || data.format !== format) && (
          <button onClick={() => run()} className="btn-primary" disabled={!hasTranscript}>
            <Icon name="sparkles" size={12} /> Generate {active?.label.toLowerCase()}
          </button>
        )}
        {status === 'loading' && (
          <span className="text-sm flex items-center gap-2 pulse-soft" style={{ color: 'var(--text-2)' }}>
            <span className="spinner" /> Generating {active?.label.toLowerCase()}… this may take 20-60s
          </span>
        )}
        {data && data.format === format && status === 'done' && (
          <>
            <button onClick={() => run()} className="btn-ghost text-xs">
              <Icon name="refresh" size={12} /> Regenerate
            </button>
            <button onClick={exportMarkdown} className="btn-ghost text-xs">
              <Icon name="download" size={12} /> Export Markdown
            </button>
            <button onClick={copyJson} className="btn-ghost text-xs">
              <Icon name="copy" size={12} /> Copy JSON
            </button>
            <button onClick={() => window.print()} className="btn-ghost text-xs">
              <Icon name="file" size={12} /> Print
            </button>
          </>
        )}
      </div>

      {!hasTranscript && (
        <div className="empty-state">
          <div className="display text-2xl"><span className="display-italic">No</span> transcript</div>
          <p>This video has no transcript text yet — visualizations need transcript content to work from.</p>
        </div>
      )}

      {status === 'error' && (
        <div className="card p-4 text-sm" style={{ borderColor: 'rgba(224, 123, 106, 0.4)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {data && data.format === format && status === 'done' && (
        <div className={`animate-in ${arabic ? 'rtl-content' : ''}`}>
          {format === 'mindmap'      && <MindmapView data={data.body} arabic={arabic} />}
          {format === 'illustration' && <IllustrationView data={data.body} arabic={arabic} />}
          {format === 'workbook'     && <WorkbookView data={data.body} arabic={arabic} />}
          {format === 'guidebook'    && <GuidebookView data={data.body} arabic={arabic} />}
          {format === 'playbook'     && <PlaybookView data={data.body} arabic={arabic} />}
          {format === 'steps'        && <StepsView data={data.body} arabic={arabic} />}
        </div>
      )}
    </div>
  );
}

// ---------- MINDMAP ----------
function MindmapView({ data }) {
  return (
    <div className="mindmap-root">
      <div className="mindmap-center">
        <div className="display text-2xl">{data.title}</div>
        {data.subtitle && <div className="text-xs mt-1" style={{ color: 'var(--text-2)' }}>{data.subtitle}</div>}
      </div>
      <div className="mindmap-branches">
        {(data.branches || []).map((b, i) => (
          <MindmapBranch key={i} branch={b} />
        ))}
      </div>
    </div>
  );
}

function MindmapBranch({ branch }) {
  const c = swatch(branch.color);
  return (
    <div className="mindmap-branch" style={{ background: c.bg, borderColor: c.bd }}>
      <div className="mindmap-branch-label" style={{ color: c.fg }}>{branch.label}</div>
      {branch.children && branch.children.length > 0 && (
        <ul className="mindmap-children">
          {branch.children.map((ch, i) => <MindmapNode key={i} node={ch} />)}
        </ul>
      )}
    </div>
  );
}

function MindmapNode({ node }) {
  return (
    <li>
      <span>{node.label}</span>
      {node.children && node.children.length > 0 && (
        <ul className="mindmap-children">
          {node.children.map((c, i) => <MindmapNode key={i} node={c} />)}
        </ul>
      )}
    </li>
  );
}

// ---------- ILLUSTRATION ----------
function IllustrationView({ data }) {
  return (
    <div>
      <div className="mb-6 text-center">
        <div className="display text-4xl mb-1">{data.title}</div>
        {data.subtitle && <div className="text-sm" style={{ color: 'var(--text-2)' }}>{data.subtitle}</div>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(data.sections || []).map((s, i) => {
          const c = swatch(s.color);
          return (
            <div key={i} className="card p-5 card-hover" style={{ background: c.bg, borderColor: c.bd }}>
              {s.emoji && <div className="text-4xl mb-3">{s.emoji}</div>}
              <div className="display text-lg mb-2" style={{ color: c.fg }}>{s.heading}</div>
              <div className="text-sm" style={{ color: 'var(--text-1)', lineHeight: 1.55 }}>{s.body}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- WORKBOOK ----------
function WorkbookView({ data }) {
  return (
    <div>
      <div className="mb-5">
        <div className="display text-3xl mb-1">{data.title}</div>
        {data.intro && <div className="text-sm" style={{ color: 'var(--text-2)' }}>{data.intro}</div>}
      </div>
      <div className="space-y-5">
        {(data.modules || []).map((m, i) => (
          <div key={i} className="card p-5">
            <div className="flex items-baseline gap-3 mb-2">
              <span className="num text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-2)', color: 'var(--accent-bright)' }}>
                MODULE {i + 1}
              </span>
              <div className="display text-xl">{m.title}</div>
            </div>
            <div className="text-sm mb-3" style={{ color: 'var(--text-1)', lineHeight: 1.6 }}>{m.lesson}</div>
            {m.key_terms?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {m.key_terms.map((t, j) => <span key={j} className="chip chip-accent">{t}</span>)}
              </div>
            )}
            {m.exercises?.length > 0 && (
              <div className="space-y-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Exercises</div>
                {m.exercises.map((e, j) => <Exercise key={j} ex={e} n={j + 1} />)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Exercise({ ex, n }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState('');
  const typeColor = ex.type === 'quiz' ? 'var(--purple)' : ex.type === 'fill_blank' ? 'var(--info)' : 'var(--accent-bright)';
  return (
    <div className="p-3 rounded" style={{ background: 'var(--bg-1)', border: '1px solid var(--border)' }}>
      <div className="flex items-start gap-3 mb-2">
        <span className="num text-xs" style={{ color: typeColor, minWidth: 28 }}>Q{n}</span>
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wider mb-1" style={{ color: typeColor }}>{ex.type?.replace('_', ' ')}</div>
          <div className="text-sm" style={{ color: 'var(--text-0)' }}>{ex.prompt}</div>
        </div>
      </div>
      <textarea
        className="input-base text-sm"
        placeholder="Write your answer here…"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        style={{ minHeight: 60 }}
      />
      {(ex.hint || ex.answer) && (
        <div className="mt-2">
          <button className="text-xs" onClick={() => setOpen(o => !o)} style={{ color: 'var(--text-2)' }}>
            {open ? '▼' : '▶'} {ex.answer ? 'Reveal answer' : 'Show hint'}
          </button>
          {open && (
            <div className="text-xs mt-1 p-2 rounded" style={{ background: 'var(--bg-2)', color: 'var(--text-1)' }}>
              {ex.answer || ex.hint}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- GUIDEBOOK ----------
function GuidebookView({ data }) {
  return (
    <div>
      <div className="mb-6 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="display text-4xl mb-1">{data.title}</div>
        {data.subtitle && <div className="display-italic text-lg" style={{ color: 'var(--text-2)' }}>{data.subtitle}</div>}
      </div>
      <div className="space-y-6">
        {(data.chapters || []).map((c, i) => (
          <div key={i} className="card p-6">
            <div className="flex items-baseline gap-3 mb-3">
              <span className="num text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-2)', color: 'var(--accent-bright)' }}>
                CH {String(i + 1).padStart(2, '0')}
              </span>
              <div className="display text-2xl">{c.title}</div>
            </div>
            {c.intro && <div className="text-sm mb-4" style={{ color: 'var(--text-1)', lineHeight: 1.7 }}>{c.intro}</div>}
            {c.key_points?.length > 0 && (
              <ul className="mb-4 space-y-1.5">
                {c.key_points.map((p, j) => (
                  <li key={j} className="text-sm flex gap-2" style={{ color: 'var(--text-1)' }}>
                    <span style={{ color: 'var(--accent)' }}>•</span><span>{p}</span>
                  </li>
                ))}
              </ul>
            )}
            {c.example && (
              <div className="p-3 mb-3 rounded text-sm display-italic"
                   style={{ background: 'var(--bg-2)', borderLeft: '3px solid var(--accent)', color: 'var(--text-1)' }}>
                {c.example}
              </div>
            )}
            {c.takeaway && (
              <div className="text-sm pt-3" style={{ borderTop: '1px solid var(--border)', color: 'var(--accent-bright)' }}>
                <span className="text-xs uppercase tracking-wider mr-2" style={{ color: 'var(--text-3)' }}>Takeaway:</span>
                {c.takeaway}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- PLAYBOOK ----------
function PlaybookView({ data }) {
  return (
    <div>
      <div className="mb-6">
        <div className="display text-3xl mb-1">{data.title}</div>
        {data.subtitle && <div className="text-sm" style={{ color: 'var(--text-2)' }}>{data.subtitle}</div>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(data.plays || []).map((p, i) => (
          <div key={i} className="card p-5 card-hover">
            <div className="flex items-baseline gap-2 mb-3">
              <span className="num text-xl" style={{ color: 'var(--accent-deep)' }}>{String(i + 1).padStart(2, '0')}</span>
              <div className="display text-xl flex-1">{p.name}</div>
            </div>
            {p.when && (
              <div className="mb-3">
                <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--info)' }}>When</div>
                <div className="text-sm" style={{ color: 'var(--text-1)' }}>{p.when}</div>
              </div>
            )}
            {p.how?.length > 0 && (
              <div className="mb-3">
                <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--accent-bright)' }}>How</div>
                <ol className="text-sm space-y-1">
                  {p.how.map((step, j) => (
                    <li key={j} className="flex gap-2" style={{ color: 'var(--text-1)' }}>
                      <span className="num" style={{ color: 'var(--text-3)' }}>{j + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {p.outcome && (
              <div className="mb-3 p-2 rounded text-sm"
                   style={{ background: 'rgba(132, 204, 138, 0.08)', border: '1px solid rgba(132, 204, 138, 0.25)', color: 'var(--success)' }}>
                <span className="text-xs uppercase tracking-wider mr-2">Outcome:</span>{p.outcome}
              </div>
            )}
            {p.pitfalls?.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--danger)' }}>Pitfalls</div>
                <ul className="text-sm space-y-1">
                  {p.pitfalls.map((pf, j) => (
                    <li key={j} className="flex gap-2" style={{ color: 'var(--text-1)' }}>
                      <span style={{ color: 'var(--danger)' }}>⚠</span><span>{pf}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- STEPS ----------
function StepsView({ data }) {
  return (
    <div>
      <div className="mb-6">
        <div className="display text-3xl mb-1">{data.title}</div>
        {data.goal && (
          <div className="text-sm mb-3" style={{ color: 'var(--text-2)' }}>
            <span className="text-xs uppercase tracking-wider mr-2" style={{ color: 'var(--text-3)' }}>Goal:</span>{data.goal}
          </div>
        )}
        {data.prerequisites?.length > 0 && (
          <div className="card p-3 inline-block">
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>Prerequisites</div>
            <ul className="text-sm">
              {data.prerequisites.map((p, i) => (
                <li key={i} style={{ color: 'var(--text-1)' }}>· {p}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="step-timeline">
        {(data.steps || []).map((s, i) => (
          <div key={i} className="step-node">
            <div className="step-bullet num">{i + 1}</div>
            <div className="step-body card p-4">
              <div className="display text-lg mb-2" style={{ color: 'var(--text-0)' }}>{s.title}</div>
              {s.what && <div className="text-sm mb-2" style={{ color: 'var(--text-1)', lineHeight: 1.6 }}>{s.what}</div>}
              {s.why && (
                <div className="text-xs" style={{ color: 'var(--text-2)' }}>
                  <span className="uppercase tracking-wider mr-2" style={{ color: 'var(--text-3)' }}>Why:</span>{s.why}
                </div>
              )}
              {s.tip && (
                <div className="mt-3 p-2 rounded text-xs"
                     style={{ background: 'var(--accent-soft)', borderLeft: '2px solid var(--accent)', color: 'var(--accent-bright)' }}>
                  <span className="uppercase tracking-wider mr-1">Tip:</span>{s.tip}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
