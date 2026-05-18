import { useState, useEffect, useCallback } from 'react';
import { Storage } from '../lib/storage.js';
import { compressJson, decompressPayload } from '../lib/decompress.js';
import { slugify } from '../lib/format.js';

export const DEMO_ID = '__demo__';

export function useLibrary() {
  const [index, setIndex] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const idx = await Storage.get('library:index') || [];
    setIndex(idx);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const addToLibrary = useCallback(async (meta, payloadJson) => {
    const id = meta.id || slugify(meta.title) + '-' + Date.now().toString(36).slice(-4);
    meta.id = id;
    meta.dateAdded = new Date().toISOString();
    const compressed = await compressJson(payloadJson);
    const ok = await Storage.setRaw(`library:playlist:${id}`, compressed);
    if (!ok) throw new Error('Failed to save playlist (may be too large)');
    const newIdx = [{ ...meta }, ...index.filter(x => x.id !== id)];
    await Storage.set('library:index', newIdx);
    setIndex(newIdx);
    return id;
  }, [index]);

  const deletePlaylist = useCallback(async (id) => {
    await Storage.delete(`library:playlist:${id}`);
    await Storage.delete(`library:meta:${id}`);
    const newIdx = index.filter(x => x.id !== id);
    await Storage.set('library:index', newIdx);
    setIndex(newIdx);
  }, [index]);

  const loadPlaylist = useCallback(async (id) => {
    if (id === DEMO_ID) return null;
    const b64 = await Storage.getRaw(`library:playlist:${id}`);
    if (!b64) return null;
    return await decompressPayload(b64);
  }, []);

  // Save mutated bundle for an existing playlist (used by enrichment agent).
  // Returns true on success, false on failure (e.g. quota exceeded).
  const updatePlaylist = useCallback(async (id, newData) => {
    if (id === DEMO_ID) return false;
    try {
      const compressed = await compressJson(newData);
      const ok = await Storage.setRaw(`library:playlist:${id}`, compressed);
      // Refresh index entry's videoCount/total chars in case those changed
      const idxEntry = index.find(x => x.id === id);
      if (idxEntry && newData.meta) {
        const updated = { ...idxEntry, videoCount: newData.meta.video_count || idxEntry.videoCount };
        const newIdx = index.map(x => x.id === id ? updated : x);
        await Storage.set('library:index', newIdx);
        setIndex(newIdx);
      }
      return ok;
    } catch (e) {
      console.error('updatePlaylist failed:', e);
      return false;
    }
  }, [index]);

  return { index, loading, addToLibrary, deletePlaylist, loadPlaylist, updatePlaylist, refresh };
}
