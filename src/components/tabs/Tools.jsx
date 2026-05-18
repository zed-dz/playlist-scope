import { useState, useMemo } from 'react';
import Icon from '../Icon.jsx';

export default function ToolsTab({ data, onJumpToVideos, onOpenVideo }) {
  const sortedTools = useMemo(() =>
    Object.entries(data.tool_index || {})
      .map(([name, videos]) => ({ name, videos, count: videos.length }))
      .sort((a, b) => b.count - a.count),
    [data.tool_index]
  );
  const [selectedTool, setSelectedTool] = useState(null);

  if (sortedTools.length === 0) {
    return (
      <div className="empty-state">
        <div className="display text-3xl"><span className="display-italic">No</span> tools indexed</div>
        <p>This playlist doesn't have any tool/product mentions extracted yet.</p>
      </div>
    );
  }

  return (
    <div className="animate-in">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-3)' }}>
            Tools mentioned across the playlist
          </div>
          <div className="card divide-y" style={{ borderColor: 'var(--border)' }}>
            {sortedTools.map(({ name, count }) => (
              <button key={name} onClick={() => setSelectedTool(name)}
                className={`w-full px-4 py-3 flex items-center justify-between text-left transition-colors ${selectedTool === name ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'}`}>
                <span style={{ color: selectedTool === name ? 'var(--accent-bright)' : 'var(--text-0)' }}>{name}</span>
                <span className="num text-xs" style={{ color: 'var(--text-2)' }}>{count}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          {selectedTool ? (
            <div>
              <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-3)' }}>
                Videos mentioning <span style={{ color: 'var(--accent-bright)' }}>{selectedTool}</span>
              </div>
              <div className="card p-4 max-h-[60vh] overflow-y-auto">
                <div className="space-y-2">
                  {data.tool_index[selectedTool].map((v) => {
                    const video = data.videos.find(vv => vv.id === v.id);
                    return (
                      <div key={v.id} className="text-sm flex items-start gap-2 py-1.5 px-2 -mx-2 rounded hover:bg-white/[0.03] cursor-pointer"
                           onClick={() => video && onOpenVideo(video)}>
                        <span className="num text-xs mt-0.5 flex-shrink-0" style={{ color: 'var(--text-3)' }}>#{String(v.index).padStart(2, '0')}</span>
                        <span style={{ color: 'var(--text-1)' }}>{v.title}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <button onClick={() => onJumpToVideos(null, { tool: selectedTool })} className="btn-ghost mt-3 text-xs">
                Filter Videos tab by "{selectedTool}" <Icon name="arrow_right" size={12} />
              </button>
            </div>
          ) : (
            <div className="card p-8 text-center" style={{ color: 'var(--text-2)' }}>
              <div className="display text-3xl mb-2" style={{ color: 'var(--text-1)' }}>
                <span className="display-italic">Select</span> a tool
              </div>
              <p className="text-sm">to see every video that mentions it.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
