import Icon from '../../Icon.jsx';
import { renderMarkdown } from '../../../lib/markdown.jsx';

export default function NotesTab({ arabic, notesLocal, setNotesLocal, saveNotes, notesSaving, notesSaved }) {
  return (
    <div className="animate-in">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="display text-2xl"><span className="display-italic">Your</span> notes</div>
        <div className="flex gap-2">
          <button className="btn-ghost text-xs" onClick={saveNotes} disabled={notesSaving}>
            {notesSaving ? <span className="spinner" /> : <Icon name="check" size={12} />}
            {notesSaved ? ' Saved' : ' Save'}
          </button>
        </div>
      </div>
      <p className="text-xs mb-3" style={{ color: 'var(--text-2)' }}>
        Markdown supported. Notes save per-playlist and persist across sessions.
      </p>
      <textarea value={notesLocal} onChange={e => setNotesLocal(e.target.value)}
        placeholder={arabic ? 'اكتب ملاحظاتك هنا...' : 'Write your thoughts here. Markdown works.'}
        className={`notes-area ${arabic ? 'rtl-content' : ''}`} style={{ minHeight: '300px' }} />
      {notesLocal.trim() && (
        <div className="mt-4">
          <div className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>Preview</div>
          <div className={`card p-4 md ${arabic ? 'rtl-content' : ''}`}>{renderMarkdown(notesLocal)}</div>
        </div>
      )}
    </div>
  );
}
