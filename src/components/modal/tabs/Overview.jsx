import { formatNum, formatChars } from '../../../lib/format.js';
import { LANG_LABELS, langKey } from '../../../lib/i18n.js';

export default function OverviewTab({ video, lang, arabic }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 animate-in">
      <div className="lg:col-span-3">
        <div className="rounded-lg overflow-hidden mb-4" style={{ aspectRatio: '16/9', background: 'var(--bg-2)' }}>
          <iframe src={`https://www.youtube.com/embed/${video.id}`} title={video.title} className="w-full h-full" allowFullScreen />
        </div>
        {video.bullets && video.bullets.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-3)' }}>Key Bullets · extracted from transcript</div>
            <div className="card p-5">
              <ul className="space-y-3">
                {video.bullets.map((b, i) => (
                  <li key={i} className={`flex gap-3 ${arabic ? 'rtl-content' : ''}`}>
                    <span className="num text-xs mt-1 flex-shrink-0" style={{ color: 'var(--accent)' }}>{String(i+1).padStart(2, '0')}</span>
                    <span style={{ color: 'var(--text-1)' }}>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
      <div className="lg:col-span-2 space-y-4">
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-3)' }}>Stats</div>
          <div className="space-y-2 text-sm">
            <Row label="Channel" value={video.uploader} />
            <Row label="Duration" value={video.duration_hms} mono />
            <Row label="Views" value={formatNum(video.view_count)} mono />
            <Row label="Likes" value={formatNum(video.like_count)} mono />
            <Row label="Comments" value={video.comment_count} mono />
            <Row label="Transcript" value={`${formatChars(video.transcript_chars)} chars`} mono />
            <Row label="Language" value={LANG_LABELS[langKey(lang)]?.label || lang} />
            {video.upload_date && (
              <Row label="Uploaded" value={`${video.upload_date.slice(0,4)}-${video.upload_date.slice(4,6)}-${video.upload_date.slice(6,8)}`} mono />
            )}
          </div>
        </div>
        {video.tools_mentioned && video.tools_mentioned.length > 0 && (
          <div className="card p-4">
            <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-3)' }}>Tools Mentioned</div>
            <div className="flex flex-wrap gap-2">
              {video.tools_mentioned.map(t => <span key={t} className="chip chip-accent">{t}</span>)}
            </div>
          </div>
        )}
        {video.comment_analysis?.themes && video.comment_analysis.themes.length > 0 && (
          <div className="card p-4">
            <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-3)' }}>Comment Themes</div>
            <div className="flex flex-wrap gap-2">
              {video.comment_analysis.themes.map(t => (
                <span key={t.theme} className={`chip theme-${t.theme}`}>{t.theme} · {t.matches}</span>
              ))}
            </div>
          </div>
        )}
        {video.tags && video.tags.length > 0 && (
          <div className="card p-4">
            <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-3)' }}>Tags</div>
            <div className="flex flex-wrap gap-1">
              {video.tags.slice(0, 8).map(t => <span key={t} className="chip text-xs">{t}</span>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: 'var(--text-2)' }}>{label}</span>
      <span className={mono ? 'num' : ''} style={{ color: 'var(--text-0)' }}>{value}</span>
    </div>
  );
}
