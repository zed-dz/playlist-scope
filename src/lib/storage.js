// Storage chain: window.storage (Claude.ai host) → localStorage (Vite/standalone) → memory.
// Same async interface so the rest of the app never knows which backend won.
const _memStore = {};

const _backend = (() => {
  if (typeof window !== 'undefined' && window.storage && typeof window.storage.set === 'function') {
    return {
      name: 'window.storage',
      async get(k) { const r = await window.storage.get(k); return r ? r.value : null; },
      async set(k, v) { await window.storage.set(k, v); },
      async del(k) { await window.storage.delete(k); },
    };
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    return {
      name: 'localStorage',
      async get(k) { return window.localStorage.getItem(k); },
      async set(k, v) { window.localStorage.setItem(k, v); },
      async del(k) { window.localStorage.removeItem(k); },
    };
  }
  return {
    name: 'memory',
    async get(k) { return _memStore[k] ?? null; },
    async set(k, v) { _memStore[k] = v; },
    async del(k) { delete _memStore[k]; },
  };
})();

export const Storage = {
  backend: _backend.name,
  async get(key) {
    try { const r = await _backend.get(key); return r ? JSON.parse(r) : null; }
    catch (e) { console.warn('Storage.get', key, e); return null; }
  },
  async set(key, value) {
    try { await _backend.set(key, JSON.stringify(value)); return true; }
    catch (e) { console.error('Storage.set', key, e); return false; }
  },
  async setRaw(key, raw) {
    try { await _backend.set(key, raw); return true; }
    catch (e) { console.error('Storage.setRaw', key, e); return false; }
  },
  async getRaw(key) {
    try { return await _backend.get(key); } catch { return null; }
  },
  async delete(key) {
    try { await _backend.del(key); return true; } catch { return false; }
  },
};
