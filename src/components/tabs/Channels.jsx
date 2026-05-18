import { useMemo } from 'react';
import Icon from '../Icon.jsx';
import { formatNum } from '../../lib/format.js';

export default function ChannelsTab({ data, onJumpToVideos, onOpenVideo }) {
  const channels = useMemo(() => {
    const map = {};
    data.videos.forEach(v => {
      if (!map[v.uploader]) {
        map[v.uploader] = { name: v.uploader, url: v.channel_url, videos: [], totalViews: 0, totalDuration: 0, totalChars: 0 };
      }
      map[v.uploader].videos.push(v);
      map[v.uploader].totalViews += v.view_count || 0;
      map[v.uploader].totalDuration += v.duration_sec || 0;
      map[v.uploader].totalChars += v.transcript_chars || 0;
    });
    return Object.values(map).sort((a, b) => b.videos.length - a.videos.length);
  }, [data.videos]);

  return (
    <div className="animate-in space-y-3">
      {channels.map(ch => (
        <div key={ch.name} className="card p-4 card-hover">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-3 mb-1 flex-wrap">
                <a href={ch.url} target="_blank" rel="noopener" className="display text-2xl hover:opacity-75" style={{ color: 'var(--text-0)' }}>
                  {ch.name}
                </a>
                <span className="num text-sm" style={{ color: 'var(--accent-bright)' }}>{ch.videos.length} videos</span>
                <span className="num text-xs" style={{ color: 'var(--text-2)' }}>{formatNum(ch.totalViews)} combined views</span>
                <span className="num text-xs" style={{ color: 'var(--text-2)' }}>{(ch.totalDuration / 3600).toFixed(1)}h runtime</span>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {ch.videos.slice(0, 8).map(v => (
                  <button key={v.id} className="chip chip-clickable" onClick={() => onOpenVideo(v)}>
                    #{v.index} · {v.title.length > 50 ? v.title.slice(0, 50) + '…' : v.title}
                  </button>
                ))}
                {ch.videos.length > 8 && (
                  <button className="chip" onClick={() => onJumpToVideos(null, { channel: ch.name })}
                          style={{ color: 'var(--accent-bright)', cursor: 'pointer' }}>
                    +{ch.videos.length - 8} more <Icon name="arrow_right" size={10} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
