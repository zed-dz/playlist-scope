import { useState, useRef, useCallback, useEffect } from 'react';
import { fetchSingleVideo } from '../lib/ingest.js';

// Background agent that walks through every video missing a transcript
// and enriches it via Claude's web_search. Persists progress per playlist.
//
// State machine:
//   idle → running → (paused | done | error)
//   paused → running
//
// Persistence: progress is saved to storage so it survives page reload.
// Auto-pauses if the API auth path is blocked (CORS or 401) so the user
// can decide whether to add an API key.

export function useEnrichmentAgent({ playlistId, data, onVideoEnriched }) {
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0, current: null, currentTitle: null });
  const [errors, setErrors] = useState([]); // [{ videoId, msg }]
  const [authError, setAuthError] = useState(null);
  const runningRef = useRef(false);
  const queueRef = useRef([]);

  // Reset when playlist changes
  useEffect(() => {
    runningRef.current = false;
    setStatus('idle');
    setProgress({ done: 0, total: 0, current: null, currentTitle: null });
    setErrors([]);
    setAuthError(null);
  }, [playlistId]);

  // Compute videos that still need transcripts
  const computeQueue = useCallback(() => {
    if (!data?.videos) return [];
    return data.videos
      .filter(v => {
        const t = data.transcripts?.[v.id];
        return !t || !t.text || t.text.length === 0;
      })
      .map(v => ({ id: v.id, title: v.title, index: v.index }));
  }, [data]);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    const queue = computeQueue();
    if (queue.length === 0) {
      setStatus('done');
      return;
    }
    queueRef.current = queue;
    runningRef.current = true;
    setStatus('running');
    setProgress({ done: 0, total: queue.length, current: null, currentTitle: null });
    setErrors([]);
    setAuthError(null);

    for (let i = 0; i < queue.length; i++) {
      if (!runningRef.current) {
        setStatus('paused');
        return;
      }
      const stub = queue[i];
      setProgress({ done: i, total: queue.length, current: stub.id, currentTitle: stub.title });
      try {
        const enriched = await fetchSingleVideo(`https://www.youtube.com/watch?v=${stub.id}`);
        await onVideoEnriched(stub.id, enriched);
      } catch (e) {
        const msg = String(e?.message || e);
        // Detect auth/CORS failures and pause for user action
        if (msg.includes('Failed to fetch') || msg.includes('CORS') ||
            msg.includes('401') || msg.includes('403') || msg.includes('authentication') ||
            msg.includes('no_api_key') || msg.includes('API_KEY_INVALID') ||
            msg.includes('gemini_error')) {
          setAuthError(msg.slice(0, 300));
          runningRef.current = false;
          setStatus('error');
          return;
        }
        setErrors(prev => [...prev, { videoId: stub.id, msg: msg.slice(0, 200) }]);
      }
      // Polite delay between videos. Gemini free tier is 10 RPM
      // (requests per minute) — at 6s minimum gap we stay under it.
      // Each call also takes 15-30s on average, but include the gap for safety.
      await new Promise(r => setTimeout(r, 7000));
    }
    setProgress(p => ({ ...p, done: queue.length, current: null, currentTitle: null }));
    runningRef.current = false;
    setStatus('done');
  }, [computeQueue, onVideoEnriched]);

  const stop = useCallback(() => {
    runningRef.current = false;
    setStatus('paused');
  }, []);

  const reset = useCallback(() => {
    runningRef.current = false;
    setStatus('idle');
    setProgress({ done: 0, total: 0, current: null, currentTitle: null });
    setErrors([]);
    setAuthError(null);
  }, []);

  const queueSize = computeQueue().length;

  return { status, progress, errors, authError, queueSize, start, stop, reset };
}
