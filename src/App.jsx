import { useState, useEffect, useCallback } from 'react';
import { decompressPayload } from './lib/decompress.js';
import { Storage } from './lib/storage.js';
import { useLibrary, DEMO_ID } from './hooks/useLibrary.js';
import { useToast } from './components/Toast.jsx';
import Icon from './components/Icon.jsx';
import LoadingScreen from './components/LoadingScreen.jsx';
import { formatChars } from './lib/format.js';

import BriefingTab from './components/tabs/Briefing.jsx';
import VideosTab from './components/tabs/Videos.jsx';
import SearchTab from './components/tabs/Search.jsx';
import ToolsTab from './components/tabs/Tools.jsx';
import LinksTab from './components/tabs/Links.jsx';
import ChannelsTab from './components/tabs/Channels.jsx';
import ReportsTab from './components/tabs/Reports.jsx';
import CompareTab from './components/tabs/Compare.jsx';
import LibraryView from './components/tabs/Library.jsx';

import VideoModal from './components/modal/VideoModal.jsx';
import AddModal from './components/modal/AddModal.jsx';
import AskPlaylistModal from './components/modal/AskPlaylistModal.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import EnrichmentPanel from './components/EnrichmentPanel.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import { useEnrichmentAgent } from './hooks/useEnrichmentAgent.js';

export default function App() {
  const [demoData, setDemoData] = useState(null);
  const [bootError, setBootError] = useState(null);

  // Boot — fetch and decompress the demo payload once.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/demo-payload.b64');
        if (!res.ok) throw new Error('Demo payload missing — drop one at public/demo-payload.b64 or wire VITE_INGEST_URL.');
        const b64 = (await res.text()).trim();
        const data = await decompressPayload(b64);
        setDemoData(data);
      } catch (e) { setBootError(e.message); }
    })();
  }, []);

  if (bootError) {
    return (
      <div style={{ padding: 32, fontFamily: 'Geist, sans-serif', color: 'var(--text-0)' }}>
        <h1 className="display text-4xl mb-4">Failed to load</h1>
        <p style={{ color: 'var(--text-1)' }}>{bootError}</p>
      </div>
    );
  }
  if (!demoData) return <LoadingScreen message="Unpacking payload…" />;

  return <AppShell demoData={demoData} />;
}

function AppShell({ demoData }) {
  const library = useLibrary();
  const [activeId, setActiveId] = useState(DEMO_ID);
  const [activeData, setActiveData] = useState(demoData);
  const [loadingActive, setLoadingActive] = useState(false);

  const [tab, setTab] = useState('briefing');
  const [openVideo, setOpenVideo] = useState(null);
  const [videosFilter, setVideosFilter] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [bookmarks, setBookmarks] = useState({});
  const [notes, setNotes] = useState({});
  const [reports, setReports] = useState({});
  const [settingsOpen, setSettingsOpen] = useState(false);

  const toast = useToast();

  // Mutation callback used by the enrichment agent. Updates the active
  // playlist's data in-place (state + persisted storage) when a video gets
  // its full transcript + metadata from web_search.
  const onVideoEnriched = useCallback(async (videoId, enriched) => {
    setActiveData(prev => {
      if (!prev) return prev;
      const videos = prev.videos.map(v => v.id === videoId ? {
        ...v,
        title: enriched.title || v.title,
        uploader: enriched.uploader || v.uploader,
        channel_url: enriched.channel_url || v.channel_url,
        duration_hms: enriched.duration_hms || v.duration_hms,
        duration_sec: enriched.duration_sec || v.duration_sec,
        view_count: enriched.view_count ?? v.view_count,
        like_count: enriched.like_count ?? v.like_count,
        comment_count: enriched.comment_count ?? v.comment_count,
        upload_date: enriched.upload_date || v.upload_date,
        description: enriched.description || v.description,
        transcript_lang: enriched.transcript_lang || v.transcript_lang,
        transcript_chars: enriched.transcript ? enriched.transcript.length : v.transcript_chars,
        content_lang: enriched.content_lang || v.content_lang,
        description_links: enriched.description_links?.length ? enriched.description_links : v.description_links,
        tools_mentioned: enriched.tools_mentioned?.length ? enriched.tools_mentioned : v.tools_mentioned,
        tags: enriched.tags?.length ? enriched.tags : v.tags,
        bullets: enriched.bullets?.length ? enriched.bullets : v.bullets,
      } : v);

      const transcripts = { ...prev.transcripts };
      if (enriched.transcript) {
        transcripts[videoId] = { lang: enriched.transcript_lang || 'en', text: enriched.transcript };
      }

      // Patch tool_index + link_index incrementally
      const tool_index = { ...prev.tool_index };
      const link_index = { ...prev.link_index };
      const v = videos.find(x => x.id === videoId);
      (enriched.tools_mentioned || []).forEach(t => {
        if (!tool_index[t]) tool_index[t] = [];
        if (!tool_index[t].some(e => e.id === videoId)) {
          tool_index[t].push({ id: videoId, index: v.index, title: v.title, channel: v.uploader });
        }
      });
      (enriched.description_links || []).forEach(l => {
        const c = l.replace(/\/$/, '');
        if (!link_index[c]) link_index[c] = [];
        if (!link_index[c].some(e => e.id === videoId)) {
          link_index[c].push({ id: videoId, index: v.index, title: v.title });
        }
      });

      const total_transcript_chars = Object.values(transcripts).reduce((s, t) => s + (t.text?.length || 0), 0);
      const next = {
        ...prev,
        videos, transcripts, tool_index, link_index,
        meta: { ...prev.meta, total_transcript_chars, _partial: undefined, _partial_reason: undefined },
      };

      // Persist (non-blocking; failures are logged but don't stop the agent)
      if (activeId !== DEMO_ID) {
        library.updatePlaylist(activeId, next).catch(e => console.error('persist failed:', e));
      }
      return next;
    });
  }, [activeId, library]);

  const agent = useEnrichmentAgent({ playlistId: activeId, data: activeData, onVideoEnriched });
  const hasApiKey = (() => { try { return !!localStorage.getItem('anthropic_api_key'); } catch { return false; } })();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const b = await Storage.get(`library:bookmarks:${activeId}`) || {};
      const n = await Storage.get(`library:notes:${activeId}`) || {};
      const r = await Storage.get(`library:reports:${activeId}`) || {};
      if (!cancelled) { setBookmarks(b); setNotes(n); setReports(r); }
    })();
    return () => { cancelled = true; };
  }, [activeId]);

  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setPaletteOpen(o => !o); }
      else if ((e.metaKey || e.ctrlKey) && e.key === 'n') { e.preventDefault(); setAddOpen(true); }
      else if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault(); setPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  const switchTo = useCallback(async (id) => {
    if (id === activeId) { setTab('briefing'); return; }
    if (id === DEMO_ID) { setActiveData(demoData); setActiveId(DEMO_ID); setTab('briefing'); return; }
    setLoadingActive(true);
    try {
      const data = await library.loadPlaylist(id);
      if (data) { setActiveData(data); setActiveId(id); setTab('briefing'); }
      else toast.push('Failed to load playlist', { type: 'error' });
    } catch (e) { toast.push('Error: ' + e.message, { type: 'error' }); }
    setLoadingActive(false);
  }, [activeId, demoData, library, toast]);

  const handleAddClose = useCallback((newId) => {
    setAddOpen(false);
    if (newId) switchTo(newId);
  }, [switchTo]);

  const toggleBookmark = useCallback(async (videoId) => {
    const next = { ...bookmarks };
    if (next[videoId]) delete next[videoId]; else next[videoId] = true;
    setBookmarks(next);
    await Storage.set(`library:bookmarks:${activeId}`, next);
    toast.push(next[videoId] ? 'Bookmarked' : 'Removed bookmark', { type: 'success' });
  }, [bookmarks, activeId, toast]);

  const saveNotes = useCallback(async (videoId, text) => {
    const next = { ...notes, [videoId]: text };
    setNotes(next);
    await Storage.set(`library:notes:${activeId}`, next);
  }, [notes, activeId]);

  const saveReport = useCallback(async (key, text) => {
    const next = { ...reports, [key]: text };
    setReports(next);
    await Storage.set(`library:reports:${activeId}`, next);
  }, [reports, activeId]);

  const handleJumpToVideos = useCallback((videoId, filter = null) => {
    if (videoId) {
      const v = activeData.videos.find(vv => vv.id === videoId);
      if (v) setOpenVideo(v);
    } else if (filter) { setVideosFilter(filter); setTab('videos'); }
  }, [activeData]);

  const toggleSelect = useCallback((id) => {
    setSelectedIds(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      else toast.push('Max 4 videos for compare', { type: 'info' });
      return next;
    });
  }, [toast]);

  const tabs = [
    { id: 'briefing', label: 'Briefing' },
    { id: 'videos', label: `Videos · ${activeData.meta.video_count}` },
    { id: 'search', label: 'Search' },
    { id: 'tools', label: `Tools · ${Object.keys(activeData.tool_index || {}).length}` },
    { id: 'links', label: `Links · ${Object.keys(activeData.link_index || {}).length}` },
    { id: 'channels', label: 'Channels' },
    { id: 'reports', label: <span className="flex items-center gap-1"><Icon name="sparkles" size={11} /> Reports</span> },
    { id: 'compare', label: <span className="flex items-center gap-1"><Icon name="layers" size={11} /> Compare {selectedIds.size > 0 && <span className="num" style={{ color: 'var(--accent-bright)' }}>{selectedIds.size}</span>}</span> },
    { id: 'library', label: <span className="flex items-center gap-1"><Icon name="library" size={11} /> Library</span> },
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 glass" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-[1400px] mx-auto px-6 py-4">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold"
                     style={{ background: 'var(--accent)', color: 'var(--bg-0)' }}>PS</div>
                <span className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-2)' }}>Playlist Scope</span>
                {activeId !== DEMO_ID && (
                  <span className="chip" style={{ marginLeft: 4 }}>
                    {library.index.find(x => x.id === activeId)?.source === 'single_video' ? 'Video' : 'Playlist'}
                  </span>
                )}
              </div>
              <h1 className="display text-3xl md:text-4xl" style={{ color: 'var(--text-0)' }}>
                <span>{activeData.meta.playlist_title}</span>
                <span className="display-italic ml-2 text-2xl" style={{ color: 'var(--text-2)' }}>
                  · {activeData.meta.video_count} {activeData.meta.video_count === 1 ? 'video' : 'videos'}
                  {activeData.meta.total_transcript_chars > 0 && ` · ${formatChars(activeData.meta.total_transcript_chars)} chars`}
                </span>
              </h1>
              <div className="text-xs mt-1 flex items-center gap-3 flex-wrap" style={{ color: 'var(--text-2)' }}>
                {activeData.meta.playlist_url && (
                  <a href={activeData.meta.playlist_url} target="_blank" rel="noopener" className="hover:underline">
                    {activeData.meta.playlist_uploader ? `by ${activeData.meta.playlist_uploader}` : 'view on YouTube'} ↗
                  </a>
                )}
                {activeData.meta.total_comments > 0 && (<><span>·</span><span className="num">{activeData.meta.total_comments} comments</span></>)}
                {Object.keys(activeData.tool_index || {}).length > 0 && (<><span>·</span><span className="num">{Object.keys(activeData.tool_index).length} tools</span></>)}
                {Object.keys(activeData.link_index || {}).length > 0 && (<><span>·</span><span className="num">{Object.keys(activeData.link_index).length} links</span></>)}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {tab === 'videos' && (
                <button className="btn-ghost"
                        style={selectMode ? { color: 'var(--accent-bright)', borderColor: 'var(--accent-deep)' } : {}}
                        onClick={() => { setSelectMode(s => !s); if (selectMode) setSelectedIds(new Set()); }}>
                  <Icon name="layers" size={12} /> {selectMode ? `Compare (${selectedIds.size})` : 'Compare mode'}
                </button>
              )}
              <button className="btn-ghost" onClick={() => setPaletteOpen(true)} title="Command palette (⌘K)">
                <Icon name="search" size={12} /> <span className="hidden md:inline">Search</span>
                <span className="palette-shortcut" style={{ marginLeft: 4 }}>⌘K</span>
              </button>
              <button className="btn-icon" onClick={() => setSettingsOpen(true)} title="Settings">
                <Icon name="settings" size={14} />
              </button>
              <button className="btn-primary" onClick={() => setAddOpen(true)}>
                <Icon name="plus" size={14} /> Add
              </button>
            </div>
          </div>

          <nav className="flex mt-4 -mb-px overflow-x-auto no-scrollbar">
            {tabs.map(t => (
              <button key={t.id} className={`tab-btn ${tab === t.id ? 'active' : ''}`}
                      onClick={() => { setTab(t.id); if (t.id !== 'videos') setVideosFilter(null); }}>
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-8">
        {loadingActive && (
          <div className="text-center py-12">
            <div className="spinner spinner-lg mx-auto mb-3"></div>
            <p className="text-sm pulse-soft" style={{ color: 'var(--text-2)' }}>Loading playlist...</p>
          </div>
        )}
        {!loadingActive && tab === 'briefing' && (
          <BriefingTab data={activeData} onOpenVideo={setOpenVideo} onAskPlaylist={() => setAskOpen(true)}
            enrichmentPanel={<EnrichmentPanel agent={agent} onOpenSettings={() => setSettingsOpen(true)} hasApiKey={hasApiKey} />} />
        )}
        {!loadingActive && tab === 'videos' && <VideosTab data={activeData} onOpenVideo={setOpenVideo}
          initialFilter={videosFilter} bookmarks={bookmarks}
          selectMode={selectMode} selectedIds={selectedIds} onToggleSelect={toggleSelect} />}
        {!loadingActive && tab === 'search' && <SearchTab data={activeData} onOpenVideo={setOpenVideo} />}
        {!loadingActive && tab === 'tools' && <ToolsTab data={activeData} onJumpToVideos={handleJumpToVideos} onOpenVideo={setOpenVideo} />}
        {!loadingActive && tab === 'links' && <LinksTab data={activeData} onOpenVideo={setOpenVideo} />}
        {!loadingActive && tab === 'channels' && <ChannelsTab data={activeData} onJumpToVideos={handleJumpToVideos} onOpenVideo={setOpenVideo} />}
        {!loadingActive && tab === 'reports' && <ReportsTab data={activeData} reports={reports} onSaveReport={saveReport} onOpenVideo={setOpenVideo} />}
        {!loadingActive && tab === 'compare' && <CompareTab data={activeData} selectedIds={selectedIds}
          onClearSelection={() => { setSelectedIds(new Set()); setSelectMode(false); }}
          onOpenVideo={setOpenVideo} onToggleSelect={toggleSelect} />}
        {!loadingActive && tab === 'library' && <LibraryView library={library} activeId={activeId}
          onSwitch={switchTo} onAddClick={() => setAddOpen(true)}
          onDelete={async (id) => { await library.deletePlaylist(id); if (activeId === id) switchTo(DEMO_ID); toast.push('Playlist deleted', { type: 'success' }); }} />}
      </main>

      <footer className="max-w-[1400px] mx-auto px-6 py-12 text-xs flex flex-wrap justify-between gap-4"
              style={{ color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}>
        <div><span className="display-italic">Playlist Scope v3</span> · Multi-playlist intelligence · ⌘K to search · ⌘N to add</div>
        <div className="num">Storage: {Storage.backend} · Pipeline: ytplaylist.py → web_embedded + SRV1 direct fetch</div>
      </footer>

      {openVideo && (
        <VideoModal video={openVideo} data={activeData} onClose={() => setOpenVideo(null)}
          isBookmarked={!!bookmarks[openVideo.id]} onToggleBookmark={toggleBookmark}
          notes={notes[openVideo.id] || ''} onSaveNotes={saveNotes} />
      )}

      {paletteOpen && <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)}
        data={activeData} onNavigate={(t) => setTab(t)} onOpenVideo={setOpenVideo}
        onAddClick={() => setAddOpen(true)}
        library={library} activeId={activeId} onSwitchPlaylist={switchTo} />}

      {addOpen && <AddModal onClose={handleAddClose}
        onAdd={(meta, payload) => library.addToLibrary(meta, payload)} />}

      {askOpen && <AskPlaylistModal data={activeData} onClose={() => setAskOpen(false)}
        onOpenVideo={(v) => { setOpenVideo(v); setAskOpen(false); }} />}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
