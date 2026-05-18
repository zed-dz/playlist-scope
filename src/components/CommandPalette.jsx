import { useState, useEffect, useMemo, useRef } from 'react';
import Icon from './Icon.jsx';
import { isArabic } from '../lib/i18n.js';

export default function CommandPalette({ open, onClose, data, onNavigate, onOpenVideo, onAddClick, library, activeId, onSwitchPlaylist }) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) { setQuery(''); setSelectedIdx(0); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const items = useMemo(() => {
    if (!data) return [];
    const out = [];
    out.push(
      { type: 'action', label: 'Add playlist or video', icon: 'plus', action: () => { onAddClick(); onClose(); }, hotkey: '⌘+N' },
      { type: 'action', label: 'Go to Library', icon: 'library', action: () => { onNavigate('library'); onClose(); } },
      { type: 'action', label: 'Go to Briefing', icon: 'file', action: () => { onNavigate('briefing'); onClose(); } },
      { type: 'action', label: 'Go to Videos', icon: 'grid', action: () => { onNavigate('videos'); onClose(); } },
      { type: 'action', label: 'Go to Search transcripts', icon: 'search', action: () => { onNavigate('search'); onClose(); } },
      { type: 'action', label: 'Go to Tools', icon: 'target', action: () => { onNavigate('tools'); onClose(); } },
      { type: 'action', label: 'Go to Links', icon: 'link', action: () => { onNavigate('links'); onClose(); } },
      { type: 'action', label: 'Go to Channels', icon: 'mic', action: () => { onNavigate('channels'); onClose(); } },
      { type: 'action', label: 'Go to Report Studio', icon: 'sparkles', action: () => { onNavigate('reports'); onClose(); } },
      { type: 'action', label: 'Go to Compare', icon: 'layers', action: () => { onNavigate('compare'); onClose(); } },
      { type: 'action', label: 'Open random video', icon: 'play', action: () => {
        const v = data.videos[Math.floor(Math.random() * data.videos.length)];
        onOpenVideo(v); onClose();
      }},
    );
    if (library?.index?.length > 0 && onSwitchPlaylist) {
      library.index.forEach(entry => {
        if (entry.id === activeId) return;
        out.push({
          type: 'switch',
          label: `Switch to: ${entry.title}`,
          sublabel: `${entry.videoCount} videos${entry.isDemo ? ' · demo' : ''}`,
          icon: 'library',
          action: () => { onSwitchPlaylist(entry.id); onClose(); },
        });
      });
    }
    data.videos.forEach(v => out.push({
      type: 'video',
      label: v.title,
      sublabel: `#${v.index} · ${v.uploader} · ${v.duration_hms}`,
      icon: 'play',
      action: () => { onOpenVideo(v); onClose(); },
      video: v,
    }));
    Object.entries(data.tool_index || {}).forEach(([tool, vids]) => out.push({
      type: 'tool',
      label: `Tool: ${tool}`,
      sublabel: `${vids.length} videos mention this`,
      icon: 'target',
      action: () => { onNavigate('tools', { tool }); onClose(); },
    }));
    return out;
  }, [data, library, activeId, onNavigate, onOpenVideo, onAddClick, onSwitchPlaylist, onClose]);

  const results = useMemo(() => {
    if (!query.trim()) return items.filter(it => it.type === 'action').slice(0, 12);
    const q = query.toLowerCase();
    const scored = items.map(it => {
      const haystack = (it.label + ' ' + (it.sublabel || '')).toLowerCase();
      if (haystack.includes(q)) {
        const labelL = it.label.toLowerCase();
        let score = 1;
        if (labelL === q) score = 100;
        else if (labelL.startsWith(q)) score = 50;
        else if (labelL.includes(q)) score = 20;
        else score = 5;
        return { ...it, score };
      }
      return null;
    }).filter(Boolean).sort((a, b) => b.score - a.score);
    return scored.slice(0, 30);
  }, [items, query]);

  useEffect(() => { setSelectedIdx(0); }, [query]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
      else if (e.key === 'Enter') { e.preventDefault(); const sel = results[selectedIdx]; if (sel) sel.action(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, results, selectedIdx]);

  if (!open) return null;

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" onClick={e => e.stopPropagation()}>
        <input ref={inputRef} type="text" className="palette-input"
               placeholder="Search videos, tools, actions..." value={query} onChange={e => setQuery(e.target.value)} />
        <div className="palette-results">
          {results.length === 0 && (
            <div className="p-4 text-sm text-center" style={{ color: 'var(--text-2)' }}>No matches for "{query}"</div>
          )}
          {results.map((r, i) => {
            const arabic = r.video && isArabic(r.video.content_lang);
            return (
              <div key={i} className={`palette-result ${i === selectedIdx ? 'selected' : ''}`}
                   onClick={r.action} onMouseEnter={() => setSelectedIdx(i)}>
                <Icon name={r.icon} size={14} className="opacity-70 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className={`text-sm truncate ${arabic ? 'rtl-content' : ''}`} style={{ color: 'var(--text-0)', lineHeight: 1.4 }}>{r.label}</div>
                  {r.sublabel && <div className="text-xs truncate" style={{ color: 'var(--text-2)' }}>{r.sublabel}</div>}
                </div>
                {r.hotkey && <span className="palette-shortcut">{r.hotkey}</span>}
              </div>
            );
          })}
        </div>
        <div className="px-4 py-2 text-xs flex items-center justify-between" style={{ color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}>
          <span><kbd className="palette-shortcut" style={{ marginRight: 4 }}>↑↓</kbd> navigate <kbd className="palette-shortcut" style={{ margin: '0 4px' }}>↵</kbd> open <kbd className="palette-shortcut" style={{ marginLeft: 4 }}>esc</kbd> close</span>
          <span>{results.length} results</span>
        </div>
      </div>
    </div>
  );
}
