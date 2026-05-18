import { useState, useEffect, useRef } from 'react';
import Modal from '../Modal.jsx';
import Icon from '../Icon.jsx';
import { callClaude } from '../../lib/api.js';
import { renderMarkdown } from '../../lib/markdown.jsx';
import { thumb } from '../../lib/format.js';

export default function AskPlaylistModal({ data, onClose, onOpenVideo }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  const ask = async () => {
    if (!query.trim()) return;
    setStatus('working');
    setError(null);
    try {
      const compact = data.videos.map(v =>
        `[#${v.index} id=${v.id}] "${v.title}" by ${v.uploader} — ${(v.bullets || []).slice(0, 2).join(' ')}`
      ).join('\n');
      const prompt = `User question: "${query}"

You're searching a YouTube playlist for the best videos to answer the question. Here are all videos with their summaries:

${compact}

Return a JSON object (no other text, no markdown fences):
{
  "answer": "Direct prose answer drawing from these videos. Cite videos by #number.",
  "recommended_videos": ["videoId1", "videoId2", "videoId3"],
  "explanation": "Why these videos are best, in 1-2 sentences."
}`;
      const response = await callClaude({ prompt, maxTokens: 2000 });
      let json = response.trim();
      const fence = json.match(/```(?:json)?\n([\s\S]*?)\n```/);
      if (fence) json = fence[1];
      const start = json.indexOf('{');
      const end = json.lastIndexOf('}');
      if (start >= 0) json = json.slice(start, end + 1);
      setResult(JSON.parse(json));
      setStatus('done');
    } catch (e) {
      setError(e.message);
      setStatus('idle');
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="p-6">
        <div className="flex items-start justify-between mb-1">
          <h2 className="display text-3xl"><span className="display-italic">Ask</span> the playlist</h2>
          <button onClick={onClose} className="btn-icon"><Icon name="x" /></button>
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>
          Claude reads all video summaries and answers from them, pointing you to the most relevant clips.
        </p>
        <div className="flex gap-2 mb-4">
          <input ref={inputRef} type="text" value={query} onChange={e => setQuery(e.target.value)}
                 onKeyDown={e => { if (e.key === 'Enter') ask(); }}
                 placeholder="e.g. How do I avoid Claude Code usage limits? Which video covers MCP best?"
                 className="input-base flex-1" />
          <button className="btn-primary" disabled={status === 'working' || !query.trim()} onClick={ask}>
            {status === 'working' ? <span className="spinner" /> : <><Icon name="sparkles" size={12} /> Ask</>}
          </button>
        </div>
        {error && <div className="text-sm p-3 rounded mb-4" style={{ color: 'var(--danger)', background: 'rgba(224,123,106,0.08)' }}>{error}</div>}
        {status === 'working' && (
          <div className="text-center py-8">
            <div className="spinner spinner-lg mx-auto mb-3"></div>
            <p className="text-sm pulse-soft" style={{ color: 'var(--text-2)' }}>Searching across all {data.videos.length} videos...</p>
          </div>
        )}
        {result && (
          <div className="space-y-4">
            <div className="card p-5">
              <div className="md text-sm">{renderMarkdown(result.answer)}</div>
            </div>
            {result.recommended_videos && result.recommended_videos.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-3)' }}>Recommended videos</div>
                <div className="space-y-2">
                  {result.recommended_videos.map(vid => {
                    const v = data.videos.find(vv => vv.id === vid);
                    if (!v) return null;
                    return (
                      <div key={vid} onClick={() => { onOpenVideo(v); onClose(); }}
                           className="card p-3 cursor-pointer card-hover flex items-start gap-3">
                        <img src={thumb(v.id, 'mq')} alt={v.title}
                             style={{ width: 100, height: 56, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium line-clamp-2" style={{ color: 'var(--text-0)' }}>{v.title}</div>
                          <div className="text-xs mt-1" style={{ color: 'var(--text-2)' }}>#{v.index} · {v.uploader} · {v.duration_hms}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {result.explanation && <div className="text-xs mt-2 italic" style={{ color: 'var(--text-2)' }}>{result.explanation}</div>}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
