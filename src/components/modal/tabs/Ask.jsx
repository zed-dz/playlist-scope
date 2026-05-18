import Icon from '../../Icon.jsx';
import { renderMarkdown } from '../../../lib/markdown.jsx';
import { langKey } from '../../../lib/i18n.js';

const SUGGESTIONS = {
  ar: ['ما هي الخطوات الرئيسية؟', 'ما هي الأدوات المذكورة؟', 'ما النصيحة الأكثر قيمة؟'],
  fr: ['Quels sont les 3 points à retenir?', 'Liste tous les outils mentionnés', 'Qu\'est-ce qui est controversé ici?'],
  en: ['What are the 3 most actionable takeaways?', 'List every tool mentioned with context', 'What\'s the main controversial claim here?', 'Is anything in this video misleading?'],
};

export default function AskTab({ lang, arabic, aiQuery, setAiQuery, aiStatus, aiResult, aiError, askAI }) {
  const isFr = langKey(lang) === 'fr';
  const suggestions = arabic ? SUGGESTIONS.ar : isFr ? SUGGESTIONS.fr : SUGGESTIONS.en;
  const placeholder = arabic ? 'مثال: ما هي الأدوات المستخدمة؟'
    : isFr ? 'ex: Quels sont les principaux outils mentionnés?'
    : 'e.g. What are the 3 actionable takeaways?';

  return (
    <div className="animate-in">
      <div className="card p-6 mb-4">
        <div className="display text-3xl mb-2"><span className="display-italic">Ask Claude</span> anything about this video</div>
        <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>
          Claude has the full transcript and will answer specifically from what's said.
          {arabic && ' Arabic video — answers in Arabic where appropriate.'}
          {isFr && ' French video — answers in French.'}
        </p>
        <div className="flex gap-2 flex-wrap">
          <input type="text" value={aiQuery} onChange={e => setAiQuery(e.target.value)}
                 onKeyDown={e => { if (e.key === 'Enter') askAI(); }}
                 placeholder={placeholder} className="input-base flex-1 min-w-[200px]" />
          <button className="btn-primary" disabled={aiStatus === 'loading' || !aiQuery.trim()} onClick={askAI}>
            {aiStatus === 'loading' ? <span className="spinner" /> : <><Icon name="sparkles" size={12} /> Ask</>}
          </button>
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          {suggestions.map(q => (
            <button key={q} className="text-xs" onClick={() => setAiQuery(q)}>
              <span className="chip chip-clickable">{q}</span>
            </button>
          ))}
        </div>
      </div>
      {aiStatus === 'loading' && (
        <div className="text-center py-12">
          <div className="spinner spinner-lg mx-auto mb-3"></div>
          <p className="text-sm pulse-soft" style={{ color: 'var(--text-2)' }}>Reading the transcript and thinking...</p>
        </div>
      )}
      {aiStatus === 'error' && (
        <div className="card p-5"><div className="text-sm" style={{ color: 'var(--danger)' }}>Error: {aiError}</div></div>
      )}
      {aiStatus === 'done' && aiResult && (
        <div className={`card p-6 md ${arabic ? 'rtl-content' : ''}`}>{renderMarkdown(aiResult)}</div>
      )}
    </div>
  );
}
