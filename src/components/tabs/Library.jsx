import Icon from '../Icon.jsx';
import { formatDateAgo } from '../../lib/format.js';
import { DEMO_ID } from '../../hooks/useLibrary.js';

export default function LibraryView({ library, activeId, onSwitch, onAddClick, onDelete }) {
  const allEntries = [
    { id: DEMO_ID, title: 'AI · Demo Playlist', source: 'embedded', videoCount: 79, language: 'mixed', dateAdded: '2026-05-17T00:00:00Z', isDemo: true },
    ...library.index,
  ];

  return (
    <div className="animate-in">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="display text-4xl"><span className="display-italic">Your</span> library</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
            {library.index.length === 0
              ? 'The demo playlist is ready to explore. Add your own to build a collection.'
              : `${library.index.length} playlist${library.index.length === 1 ? '' : 's'} saved, plus the demo. Click any to load it.`}
          </p>
        </div>
        <button className="btn-primary" onClick={onAddClick}>
          <Icon name="plus" /> Add playlist or video
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {allEntries.map(entry => (
          <div key={entry.id}
               className={`library-card ${entry.id === activeId ? 'active' : ''}`}
               onClick={() => onSwitch(entry.id)}>
            {entry.id === activeId && <div className="badge">Active</div>}
            {entry.isDemo && entry.id !== activeId && (
              <div className="badge" style={{ color: 'var(--info)', borderColor: 'var(--info)', background: 'rgba(126,182,212,0.1)' }}>Demo</div>
            )}
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0"
                   style={{ background: entry.id === activeId ? 'var(--accent)' : 'var(--bg-3)', color: entry.id === activeId ? 'var(--bg-0)' : 'var(--accent-bright)' }}>
                <Icon name={entry.source === 'single_video' ? 'play' : 'library'} size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate" style={{ color: 'var(--text-0)' }}>{entry.title}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
                  <span className="num">{entry.videoCount}</span> {entry.videoCount === 1 ? 'video' : 'videos'} · added {formatDateAgo(entry.dateAdded)}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                {entry.source === 'single_video' && 'Single video'}
                {entry.source === 'bundle' && 'From Python pipeline'}
                {entry.source === 'embedded' && 'Built-in demo'}
                {entry.source === 'playlist' && 'YouTube playlist'}
              </span>
              {!entry.isDemo && (
                <button className="btn-icon"
                  onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${entry.title}"?`)) onDelete(entry.id); }}
                  title="Delete">
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
