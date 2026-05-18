import { thumb } from '../lib/format.js';
import { LANG_LABELS, langKey, isArabic } from '../lib/i18n.js';
import { formatNum, formatChars } from '../lib/format.js';
import { highlightMatches } from '../lib/markdown.jsx';
import Icon from './Icon.jsx';

export default function VideoCard({ video, onOpen, query, isBookmarked, isSelected, onToggleSelect, selectMode }) {
  const lang = langKey(video.content_lang || video.transcript_lang);
  const arabic = isArabic(video.content_lang || video.transcript_lang);
  return (
    <div className={`card card-hover cursor-pointer overflow-hidden flex flex-col ${isSelected ? 'selected-for-compare' : ''}`}
         onClick={() => { if (selectMode) onToggleSelect(video.id); else onOpen(video); }}>
      <div className="thumb-wrap">
        <img src={thumb(video.id, 'hq')} alt={video.title} loading="lazy"
             onError={(e) => { e.target.src = thumb(video.id, 'mq'); }} />
        <div className="duration-pill">{video.duration_hms}</div>
        {isBookmarked && (
          <div className="bookmark-overlay">
            <Icon name="bookmark" size={12} className="bookmark-active" />
          </div>
        )}
        {selectMode && (
          <div className="bookmark-overlay" style={{ right: 6, left: 'auto', background: isSelected ? 'var(--accent)' : 'rgba(0,0,0,0.85)' }}>
            <Icon name={isSelected ? 'check' : 'plus'} size={14} className={isSelected ? '' : 'opacity-70'} />
          </div>
        )}
      </div>
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="text-xs flex items-center gap-2 min-w-0" style={{ color: 'var(--text-2)' }}>
            <span className="truncate" style={{ color: 'var(--text-1)' }}>{video.uploader}</span>
            <span className="lang-flag flex-shrink-0">{LANG_LABELS[lang]?.flag || lang.toUpperCase()}</span>
          </div>
          <div className="num text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>#{video.index}</div>
        </div>
        <div className={`text-sm font-medium leading-snug mb-3 line-clamp-2 ${arabic ? 'rtl-content' : ''}`}
             style={{ color: 'var(--text-0)', minHeight: '2.5rem' }}>
          {query ? highlightMatches(video.title, query) : video.title}
        </div>
        {video.bullets && video.bullets.length > 0 && (
          <div className={`text-xs leading-relaxed mb-3 line-clamp-3 ${arabic ? 'rtl-content' : ''}`}
               style={{ color: 'var(--text-2)' }}>
            {video.bullets[0]}
          </div>
        )}
        <div className="flex flex-wrap gap-1 mb-3">
          {(video.tools_mentioned || []).slice(0, 3).map(t => (
            <span key={t} className="chip text-xs">{t}</span>
          ))}
          {(video.tools_mentioned || []).length > 3 && (
            <span className="chip text-xs" style={{ color: 'var(--text-3)' }}>+{video.tools_mentioned.length - 3}</span>
          )}
        </div>
        <div className="flex items-center justify-between mt-auto pt-2" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="num text-xs" style={{ color: 'var(--text-2)' }}>{formatNum(video.view_count)} views</div>
          <div className="num text-xs" style={{ color: 'var(--text-2)' }}>{formatChars(video.transcript_chars)} chars</div>
        </div>
      </div>
    </div>
  );
}
