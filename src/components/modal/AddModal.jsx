import { useState, useMemo } from 'react';
import Modal from '../Modal.jsx';
import Icon from '../Icon.jsx';
import { useToast } from '../Toast.jsx';
import { fetchSingleVideo, fetchPlaylist, buildPayloadFromVideos } from '../../lib/ingest.js';
import { parseYouTubeUrl } from '../../lib/format.js';

const INGEST_URL = import.meta.env.VITE_INGEST_URL ||
  (typeof window !== 'undefined' && (window.PS_INGEST_URL || window.localStorage?.getItem?.('ps_ingest_url'))) || '';

export default function AddModal({ onClose, onAdd, defaultTab = 'video' }) {
  const [mode, setMode] = useState(defaultTab);
  const [videoUrl, setVideoUrl] = useState('');
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [maxVideos, setMaxVideos] = useState(25);
  const [bundleFile, setBundleFile] = useState(null);
  const [bundleName, setBundleName] = useState('');
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' });
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  // Batch mode state
  const [batchInput, setBatchInput] = useState('');
  const [batchName, setBatchName] = useState('');
  const [batchItems, setBatchItems] = useState([]); // [{ id, url, status, title?, error? }]

  const toast = useToast();

  // Parse the batch textarea into deduped { id, url } entries.
  const parsedBatch = useMemo(() => {
    if (!batchInput.trim()) return [];
    const tokens = batchInput.split(/[\s,;]+/).map(t => t.trim()).filter(Boolean);
    const seen = new Set();
    const out = [];
    const skipped = [];
    for (const tok of tokens) {
      const parsed = parseYouTubeUrl(tok);
      if (!parsed || (parsed.type !== 'video' && parsed.type !== 'playlist_with_video') || !parsed.id) {
        skipped.push(tok);
        continue;
      }
      if (seen.has(parsed.id)) continue;
      seen.add(parsed.id);
      out.push({ id: parsed.id, url: `https://www.youtube.com/watch?v=${parsed.id}` });
    }
    return { items: out, skipped };
  }, [batchInput]);

  const handleAddVideo = async () => {
    setStatus('working');
    setError('');
    setProgress({ done: 0, total: 1, current: 'Fetching video data and transcript...' });
    try {
      const video = await fetchSingleVideo(videoUrl.trim());
      const title = video.title || 'Untitled Video';
      const payload = buildPayloadFromVideos([video], title, { url: video.url, id: video.id });
      payload.synthesis_md = `# ${title}\n\n_Single video added on ${new Date().toLocaleDateString()}_\n\n## Summary\n\n` +
        (video.bullets || []).map((b, i) => `${i + 1}. ${b}`).join('\n');
      const meta = { title, source: 'single_video', videoCount: 1, language: video.content_lang || 'en' };
      const id = await onAdd(meta, payload);
      toast.push('Video added to library', { type: 'success' });
      onClose(id);
    } catch (e) {
      setError(e.message);
      setStatus('idle');
    }
  };

  const handleAddPlaylist = async () => {
    setStatus('working');
    setError('');
    setProgress({ done: 0, total: 0, current: 'Enumerating playlist…' });
    try {
      const result = await fetchPlaylist(
        playlistUrl.trim(),
        (p) => setProgress({ done: p.done, total: p.total, current: p.current }),
        { maxVideos: Math.max(1, Math.min(50, Number(maxVideos) || 25)), ingestServerUrl: INGEST_URL }
      );

      if (result._isServerBundle) {
        const meta = {
          title: result.meta?.playlist_title || 'Imported Playlist',
          source: 'playlist',
          videoCount: result.videos.length,
          language: 'mixed',
          playlist_url: result.meta?.playlist_url || playlistUrl,
        };
        const id = await onAdd(meta, result);
        if (result.meta?._partial) {
          toast.push(`Imported ${result.videos.length} videos · transcripts unavailable from server`, { type: 'warn', duration: 8000 });
        } else {
          toast.push(`Imported ${result.videos.length} videos (full pipeline)`, { type: 'success' });
        }
        onClose(id);
        return;
      }

      const payload = buildPayloadFromVideos(result.videos, result.playlist_title, { url: result.playlist_url, id: result.playlist_id });
      const failed = result.videos.filter(v => v._fetch_error).length;
      const succeeded = result.videos.length - failed;
      payload.synthesis_md = `# ${result.playlist_title}\n\n_By ${result.uploader} · ${result.videos.length} videos added on ${new Date().toLocaleDateString()}_\n\n${succeeded} fetched with full metadata${failed ? `, ${failed} stub-only (transcripts unavailable)` : ''}.\n\n## Tools mentioned across the playlist\n\n${
        Object.entries(payload.tool_index || {})
          .sort((a, b) => b[1].length - a[1].length).slice(0, 12)
          .map(([t, vids]) => `- **${t}** — ${vids.length} mentions`).join('\n') || '_No tools detected yet._'
      }`;
      const meta = {
        title: result.playlist_title,
        source: 'playlist',
        videoCount: result.videos.length,
        language: 'mixed',
        playlist_url: result.playlist_url,
      };
      const id = await onAdd(meta, payload);
      toast.push(`Playlist added (${succeeded} fully, ${failed} stub)`, { type: 'success' });
      onClose(id);
    } catch (e) {
      setError(e.message);
      setStatus('idle');
    }
  };

  const handleAddBatch = async () => {
    const items = parsedBatch.items || [];
    if (items.length === 0) return;

    setStatus('working');
    setError('');
    const tracking = items.map(it => ({ ...it, status: 'pending' }));
    setBatchItems(tracking);
    setProgress({ done: 0, total: items.length, current: '' });

    const fetched = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      tracking[i] = { ...tracking[i], status: 'working' };
      setBatchItems([...tracking]);
      setProgress({ done: i, total: items.length, current: `Fetching #${i + 1}: ${it.id}` });
      try {
        const video = await fetchSingleVideo(it.url);
        tracking[i] = { ...tracking[i], status: 'done', title: video.title || it.id };
        setBatchItems([...tracking]);
        fetched.push(video);
      } catch (e) {
        tracking[i] = { ...tracking[i], status: 'failed', error: e.message.slice(0, 200) };
        setBatchItems([...tracking]);
      }
    }
    setProgress({ done: items.length, total: items.length, current: '' });

    if (fetched.length === 0) {
      setError('Every URL in the batch failed. See per-URL errors above.');
      setStatus('idle');
      return;
    }

    const today = new Date().toLocaleDateString();
    const title = batchName.trim() || `Batch import — ${today}`;
    const payload = buildPayloadFromVideos(fetched, title, { url: '', id: `batch_${Date.now()}` });
    const failedCount = items.length - fetched.length;
    payload.synthesis_md = `# ${title}\n\n_Batch of ${items.length} URLs added on ${today} — ${fetched.length} succeeded${failedCount ? `, ${failedCount} failed` : ''}._\n\n## Videos in this batch\n\n${
      fetched.map((v, i) => `${i + 1}. **${v.title || v.id}** — ${v.uploader || 'unknown'}`).join('\n')
    }`;
    const meta = {
      title, source: 'batch', videoCount: fetched.length, language: 'mixed',
    };
    const id = await onAdd(meta, payload);
    if (failedCount > 0) {
      toast.push(`Batch added: ${fetched.length} videos imported, ${failedCount} failed`, { type: 'warn', duration: 8000 });
    } else {
      toast.push(`Batch added: ${fetched.length} videos`, { type: 'success' });
    }
    onClose(id);
  };

  const handleBundleFile = (file) => {
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      setError('Bundle must be a .json file from the Python pipeline');
      return;
    }
    setBundleFile(file);
    setBundleName(file.name.replace(/\.json$/, ''));
  };

  const handleAddBundle = async () => {
    if (!bundleFile) return;
    setStatus('working');
    setError('');
    try {
      const text = await bundleFile.text();
      const data = JSON.parse(text);
      if (!data.videos || !Array.isArray(data.videos)) {
        throw new Error('Invalid bundle format: missing "videos" array');
      }
      const meta = {
        title: bundleName || data.meta?.playlist_title || 'Imported Playlist',
        source: 'bundle',
        videoCount: data.videos.length,
        language: 'mixed',
      };
      const id = await onAdd(meta, data);
      toast.push(`Imported ${data.videos.length} videos`, { type: 'success' });
      onClose(id);
    } catch (e) {
      setError(e.message);
      setStatus('idle');
    }
  };

  return (
    <Modal onClose={() => onClose(null)} narrow>
      <div className="p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="display text-3xl"><span className="display-italic">Add</span> to library</h2>
          <button onClick={() => onClose(null)} className="btn-icon"><Icon name="x" /></button>
        </div>
        <p className="text-sm mb-5" style={{ color: 'var(--text-2)' }}>
          Three ways to bring content in: paste a single video URL, paste a playlist URL, or upload a JSON bundle from your Python pipeline.
        </p>
        {INGEST_URL && (
          <div className="text-xs mb-4 p-2 rounded" style={{ color: 'var(--text-2)', background: 'rgba(132,204,138,0.06)', border: '1px solid rgba(132,204,138,0.2)' }}>
            <Icon name="check" size={12} className="inline mr-1" /> Ingest server configured — Playlist URL will use the full Python pipeline server-side.
          </div>
        )}

        <div className="switch mb-5 flex-wrap">
          <button className={mode === 'video' ? 'active' : ''} onClick={() => setMode('video')}>Single video</button>
          <button className={mode === 'batch' ? 'active' : ''} onClick={() => setMode('batch')}>Batch URLs</button>
          <button className={mode === 'playlist' ? 'active' : ''} onClick={() => setMode('playlist')}>Playlist URL</button>
          <button className={mode === 'bundle' ? 'active' : ''} onClick={() => setMode('bundle')}>Upload bundle</button>
        </div>

        {mode === 'video' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-3)' }}>YouTube video URL</label>
              <input type="url" value={videoUrl} onChange={e => setVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..." className="input-base font-mono"
                disabled={status === 'working'} />
            </div>
            <div className="text-xs flex items-start gap-2" style={{ color: 'var(--text-2)' }}>
              <Icon name="sparkles" size={14} className="mt-0.5 flex-shrink-0" />
              <span>The free Gemini tier will fetch the video's metadata + transcript using Google Search grounding. Works for English, Arabic, French — any language YouTube provides captions for. Takes ~30 seconds per video.</span>
            </div>
            {error && <div className="text-sm p-3 rounded" style={{ color: 'var(--danger)', background: 'rgba(224,123,106,0.08)' }}>{error}</div>}
            <button className="btn-primary w-full justify-center" onClick={handleAddVideo} disabled={!videoUrl.trim() || status === 'working'}>
              {status === 'working' ? (<><span className="spinner" /> {progress.current}</>) : (<><Icon name="plus" /> Add video</>)}
            </button>
          </div>
        )}

        {mode === 'batch' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-3)' }}>
                YouTube video URLs — paste one per line (or comma-separated)
              </label>
              <textarea
                value={batchInput}
                onChange={e => setBatchInput(e.target.value)}
                placeholder={`https://youtu.be/GV_gs9MX3LA\nhttps://youtu.be/GBjQJEEyNTE\nhttps://www.youtube.com/watch?v=...`}
                className="input-base font-mono"
                rows={8}
                disabled={status === 'working'}
                style={{ fontSize: '0.8rem', lineHeight: 1.5 }}
              />
              <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-2)' }}>
                <span>
                  {parsedBatch.items?.length || 0} valid URL{(parsedBatch.items?.length || 0) === 1 ? '' : 's'} detected
                  {parsedBatch.skipped?.length > 0 && (
                    <span style={{ color: 'var(--danger)' }}> · {parsedBatch.skipped.length} skipped (unrecognized)</span>
                  )}
                </span>
                <span>~30s per video</span>
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-3)' }}>
                Batch name (optional)
              </label>
              <input
                type="text"
                value={batchName}
                onChange={e => setBatchName(e.target.value)}
                placeholder={`Batch import — ${new Date().toLocaleDateString()}`}
                className="input-base"
                disabled={status === 'working'}
              />
            </div>

            <div className="text-xs flex items-start gap-2 p-3 rounded"
                 style={{ color: 'var(--text-2)', background: 'rgba(212,163,115,0.06)', border: '1px solid rgba(212,163,115,0.18)' }}>
              <Icon name="sparkles" size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
              <span>Videos are fetched sequentially via the free Gemini path. Failures don't stop the batch — successful videos are still added to a single library entry. Run thumbnail OCR per video afterward from the video modal.</span>
            </div>

            {batchItems.length > 0 && (
              <div className="card p-0 max-h-64 overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
                {batchItems.map((it, i) => (
                  <div key={it.id} className="px-3 py-2 flex items-center gap-2 text-xs"
                       style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                    <span className="num flex-shrink-0" style={{ color: 'var(--text-3)', width: 22 }}>{i + 1}.</span>
                    <span className="flex-shrink-0">
                      {it.status === 'pending' && <span style={{ color: 'var(--text-3)' }}>○</span>}
                      {it.status === 'working' && <span className="spinner" style={{ width: 10, height: 10 }} />}
                      {it.status === 'done'    && <span style={{ color: 'var(--success)' }}>✓</span>}
                      {it.status === 'failed'  && <span style={{ color: 'var(--danger)' }}>✗</span>}
                    </span>
                    <span className="font-mono flex-shrink-0" style={{ color: 'var(--text-2)', width: 100 }}>{it.id}</span>
                    <span className="flex-1 truncate" style={{
                      color: it.status === 'failed' ? 'var(--danger)' : 'var(--text-1)',
                    }}>
                      {it.title || it.error || (it.status === 'pending' ? '— queued' : it.status === 'working' ? '— fetching…' : '')}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {status === 'working' && progress.total > 0 && (
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
            )}
            {error && <div className="text-sm p-3 rounded" style={{ color: 'var(--danger)', background: 'rgba(224,123,106,0.08)' }}>{error}</div>}

            <button className="btn-primary w-full justify-center"
                    onClick={handleAddBatch}
                    disabled={(parsedBatch.items?.length || 0) === 0 || status === 'working'}>
              {status === 'working'
                ? <><span className="spinner" /> {progress.done}/{progress.total} done</>
                : <><Icon name="plus" /> Add {parsedBatch.items?.length || 0} video{(parsedBatch.items?.length || 0) === 1 ? '' : 's'}</>}
            </button>
          </div>
        )}

        {mode === 'playlist' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-3)' }}>YouTube playlist URL</label>
              <input type="url" value={playlistUrl} onChange={e => setPlaylistUrl(e.target.value)}
                placeholder="https://www.youtube.com/playlist?list=..." className="input-base font-mono"
                disabled={status === 'working'} />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-3)' }}>Max videos to fetch</label>
              <input type="number" value={maxVideos} onChange={e => setMaxVideos(e.target.value)}
                min="1" max="50" className="input-base" disabled={status === 'working'} style={{ width: 120 }} />
              <span className="text-xs ml-3" style={{ color: 'var(--text-2)' }}>Each video ≈ 30s. 25 videos ≈ 12 minutes.</span>
            </div>
            <div className="text-xs flex items-start gap-2 p-3 rounded"
                 style={{ color: 'var(--text-2)', background: 'rgba(212,163,115,0.06)', border: '1px solid rgba(212,163,115,0.18)' }}>
              <Icon name="sparkles" size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
              <span>
                Claude enumerates the playlist via web search, then fetches each video. <strong>For 50+ videos or maximum data quality, use the Python pipeline + Upload bundle instead</strong> — it gets word-for-word transcripts and 25 comments per video which web search can't reliably do.
              </span>
            </div>
            {status === 'working' && progress.total > 0 && (
              <div>
                <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-2)' }}>
                  <span>{progress.current}</span>
                  <span className="num">{progress.done}/{progress.total}</span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
                </div>
              </div>
            )}
            {error && <div className="text-sm p-3 rounded" style={{ color: 'var(--danger)', background: 'rgba(224,123,106,0.08)' }}>{error}</div>}
            <button className="btn-primary w-full justify-center" onClick={handleAddPlaylist} disabled={!playlistUrl.trim() || status === 'working'}>
              {status === 'working' ? (<><span className="spinner" /> Working…</>) : (<><Icon name="plus" /> Fetch playlist</>)}
            </button>
          </div>
        )}

        {mode === 'bundle' && (
          <div className="space-y-3">
            <div className={`dropzone ${dragOver ? 'dragover' : ''}`}
                 onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                 onDragLeave={() => setDragOver(false)}
                 onDrop={e => { e.preventDefault(); setDragOver(false); handleBundleFile(e.dataTransfer.files[0]); }}
                 onClick={() => {
                   const input = document.createElement('input');
                   input.type = 'file'; input.accept = '.json';
                   input.onchange = e => handleBundleFile(e.target.files[0]);
                   input.click();
                 }}>
              <Icon name="upload" size={28} className="mx-auto mb-2" />
              <div className="text-sm mb-1" style={{ color: 'var(--text-0)' }}>
                {bundleFile ? bundleFile.name : 'Drop a JSON bundle here or click to browse'}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-2)' }}>
                {bundleFile ? `${(bundleFile.size / 1024).toFixed(0)} KB` : 'Output from your Python pipeline (must include videos, transcripts, comments)'}
              </div>
            </div>
            {bundleFile && (
              <div>
                <label className="text-xs uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-3)' }}>Name</label>
                <input type="text" value={bundleName} onChange={e => setBundleName(e.target.value)} className="input-base" />
              </div>
            )}
            <div className="text-xs flex items-start gap-2" style={{ color: 'var(--text-2)' }}>
              <Icon name="file" size={14} className="mt-0.5 flex-shrink-0" />
              <span>The bundle must be a single JSON file containing: <code>meta</code>, <code>videos</code>, <code>transcripts</code>, <code>comments</code>. Run <code>python3 build_bundle.py</code> in your pipeline directory to produce one.</span>
            </div>
            {error && <div className="text-sm p-3 rounded" style={{ color: 'var(--danger)', background: 'rgba(224,123,106,0.08)' }}>{error}</div>}
            <button className="btn-primary w-full justify-center" onClick={handleAddBundle} disabled={!bundleFile || status === 'working'}>
              {status === 'working' ? <><span className="spinner" /> Importing...</> : <><Icon name="check" /> Import bundle</>}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
