// Pure formatters - no React, no hooks.
export const formatNum = (n) => {
  if (n == null) return '—';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
};

export const formatChars = (n) => {
  if (!n) return '—';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
  return String(n);
};

export const formatDuration = (sec) => {
  if (!sec) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

export const formatDateAgo = (iso) => {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return d.toLocaleDateString();
};

export const slugify = (s) =>
  (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);

export const parseYouTubeUrl = (url) => {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes('youtu.be')) return { type: 'video', id: u.pathname.slice(1) };
    if (u.searchParams.get('list')) {
      const listId = u.searchParams.get('list');
      const videoId = u.searchParams.get('v');
      return { type: videoId ? 'playlist_with_video' : 'playlist', list: listId, id: videoId };
    }
    if (u.searchParams.get('v')) return { type: 'video', id: u.searchParams.get('v') };
  } catch (e) { /* fall through */ }
  return null;
};

export const thumb = (id, q = 'hq') => `https://i.ytimg.com/vi/${id}/${q}default.jpg`;
