import Icon from '../../Icon.jsx';
import { LANG_LABELS, langKey, isArabic } from '../../../lib/i18n.js';

export default function TranscriptTab({
  video, transcriptObj, lang, arabic, toast,
  translation, setTranslation, translateTo, setTranslateTo, translateStatus, translateTranscript,
  ttsAvail, ttsStatus, playTTS, stopTTS,
}) {
  if (!transcriptObj) {
    return (
      <div className="empty-state">
        <div className="display text-2xl">No transcript</div>
        <p>This video doesn't have a transcript available.</p>
      </div>
    );
  }

  const displayLang = translation?.lang || lang;
  const displayIsArabic = translation ? isArabic(translation.lang) : arabic;
  const content = translation?.text || transcriptObj.text;

  return (
    <div className="animate-in">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="text-xs flex items-center gap-3 flex-wrap" style={{ color: 'var(--text-2)' }}>
          <span><span className="num">{transcriptObj.text.length.toLocaleString()}</span> characters</span>
          <span>·</span>
          <span>Language: <span style={{ color: 'var(--text-1)' }}>{LANG_LABELS[langKey(displayLang)]?.label || displayLang}</span>{translation && <span style={{ color: 'var(--accent-bright)' }}> · translated</span>}</span>
          {translation && (
            <button className="text-xs underline" style={{ color: 'var(--accent-bright)' }} onClick={() => setTranslation(null)}>Show original</button>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <select className="input-base text-xs" value={translateTo}
                  disabled={translateStatus === 'working'}
                  onChange={e => { const v = e.target.value; setTranslateTo(v); if (v) translateTranscript(v); }}
                  style={{ width: 'auto', padding: '0.3rem 0.6rem' }}>
            <option value="">Translate to…</option>
            <option value="en">English</option>
            <option value="ar">العربية</option>
            <option value="fr">Français</option>
            <option value="es">Español</option>
            <option value="de">Deutsch</option>
            <option value="pt">Português</option>
          </select>
          {translateStatus === 'working' && <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-2)' }}><span className="spinner" /> Translating…</span>}
          {ttsAvail && (
            <>
              <button className="btn-ghost text-xs" onClick={playTTS}
                      title={ttsStatus === 'speaking' ? 'Pause speech' : ttsStatus === 'paused' ? 'Resume speech' : 'Read transcript aloud'}>
                <Icon name={ttsStatus === 'speaking' ? 'pause' : 'play'} size={12} /> {ttsStatus === 'speaking' ? 'Pause' : ttsStatus === 'paused' ? 'Resume' : 'Listen'}
              </button>
              {ttsStatus !== 'idle' && (
                <button className="btn-ghost text-xs" onClick={stopTTS} title="Stop speech">
                  <Icon name="x" size={12} /> Stop
                </button>
              )}
            </>
          )}
          <button className="btn-ghost text-xs" onClick={() => { navigator.clipboard.writeText(content); toast.push('Copied', { type: 'success' }); }}>
            <Icon name="copy" size={12} /> Copy
          </button>
          <button className="btn-ghost text-xs" onClick={() => {
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `${video.index}_${video.id}_${displayLang}.txt`; a.click();
          }}>
            <Icon name="download" size={12} /> .txt
          </button>
        </div>
      </div>
      <div className={`card p-6 ${displayIsArabic ? 'rtl-content' : ''}`}
           style={{ maxHeight: '65vh', overflowY: 'auto', lineHeight: displayIsArabic ? '2' : '1.8', color: 'var(--text-1)', fontSize: displayIsArabic ? '1.05rem' : '0.95rem' }}>
        {content}
      </div>
    </div>
  );
}
