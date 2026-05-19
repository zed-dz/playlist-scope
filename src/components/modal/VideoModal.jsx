import { useState, useEffect, useMemo } from 'react';
import Modal from '../Modal.jsx';
import Icon from '../Icon.jsx';
import { useToast } from '../Toast.jsx';
import { callClaude } from '../../lib/api.js';
import { LANG_LABELS, langKey, isArabic } from '../../lib/i18n.js';
import { formatNum, formatChars, slugify } from '../../lib/format.js';

import OverviewTab from './tabs/Overview.jsx';
import TranscriptTab from './tabs/Transcript.jsx';
import CommentsTab from './tabs/Comments.jsx';
import ChaptersTab from './tabs/Chapters.jsx';
import QuotesTab from './tabs/Quotes.jsx';
import NotesTab from './tabs/Notes.jsx';
import VideoLinksTab from './tabs/VideoLinks.jsx';
import AskTab from './tabs/Ask.jsx';
import VisualizeTab from './tabs/Visualize.jsx';

const TARGET_LANG_NAMES = { en: 'English', ar: 'Arabic', fr: 'French', es: 'Spanish', de: 'German', pt: 'Portuguese' };

export default function VideoModal({ video, data, onClose, isBookmarked, onToggleBookmark, notes, onSaveNotes }) {
  const [tab, setTab] = useState('overview');
  const transcriptObj = data.transcripts[video.id];
  const comments = data.comments[video.id] || [];
  const lang = transcriptObj?.lang || video.content_lang || 'en';
  const arabic = isArabic(lang);
  const toast = useToast();

  // Ask AI
  const [aiQuery, setAiQuery] = useState('');
  const [aiResult, setAiResult] = useState(null);
  const [aiStatus, setAiStatus] = useState('idle');
  const [aiError, setAiError] = useState(null);

  // Notes
  const [notesLocal, setNotesLocal] = useState(notes || '');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  useEffect(() => { setNotesLocal(notes || ''); }, [notes, video.id]);

  // Quotes + Chapters caches
  const [quotes, setQuotes] = useState(null);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [chapters, setChapters] = useState(null);
  const [chaptersLoading, setChaptersLoading] = useState(false);

  // TTS
  const [ttsStatus, setTtsStatus] = useState('idle');
  const ttsAvail = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Translation
  const [translateTo, setTranslateTo] = useState('');
  const [translation, setTranslation] = useState(null);
  const [translateStatus, setTranslateStatus] = useState('idle');

  useEffect(() => { setTranslation(null); setTranslateTo(''); }, [video.id]);
  useEffect(() => () => { if (ttsAvail) window.speechSynthesis.cancel(); }, [video.id, ttsAvail]);

  const playTTS = () => {
    if (!ttsAvail || !transcriptObj) return;
    const synth = window.speechSynthesis;
    if (ttsStatus === 'paused') { synth.resume(); setTtsStatus('speaking'); return; }
    if (ttsStatus === 'speaking') { synth.pause(); setTtsStatus('paused'); return; }
    synth.cancel();
    const text = transcriptObj.text;
    const langTag = (transcriptObj.lang || lang || 'en').replace(/_/g, '-');
    const sentences = text.match(/[^.!?\u061f\u06d4]+[.!?\u061f\u06d4]+|\S+/g) || [text];
    const chunks = [];
    let cur = '';
    for (const s of sentences) {
      if (cur.length + s.length > 220) { chunks.push(cur); cur = s; }
      else cur += ' ' + s;
    }
    if (cur.trim()) chunks.push(cur);
    chunks.forEach((chunk, i) => {
      const u = new SpeechSynthesisUtterance(chunk.trim());
      u.lang = langTag;
      u.rate = arabic ? 0.95 : 1.05;
      if (i === chunks.length - 1) u.onend = () => setTtsStatus('idle');
      synth.speak(u);
    });
    setTtsStatus('speaking');
  };

  const stopTTS = () => { if (ttsAvail) { window.speechSynthesis.cancel(); setTtsStatus('idle'); } };

  const translateTranscript = async (targetLang) => {
    if (!transcriptObj || !targetLang) return;
    setTranslateStatus('working');
    try {
      const langName = TARGET_LANG_NAMES[targetLang] || targetLang;
      const text = transcriptObj.text.length > 60000 ? transcriptObj.text.slice(0, 60000) + '...[truncated]' : transcriptObj.text;
      const result = await callClaude({
        prompt: `Translate the following transcript into ${langName}. Preserve paragraph structure. Keep proper nouns, brand names, URLs, and code references in their original form. Output ONLY the translation, no preamble, no commentary.\n\nTRANSCRIPT:\n${text}`,
        maxTokens: 6000,
      });
      setTranslation({ lang: targetLang, text: result.trim() });
      toast.push(`Translated to ${langName}`, { type: 'success' });
    } catch (e) {
      toast.push(`Translation failed: ${e.message.slice(0, 80)}`, { type: 'error' });
    }
    setTranslateStatus('idle');
  };

  const existingChapters = useMemo(() => {
    if (!video.description) return [];
    const ch = [];
    const re = /(?:^|\n)(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)/g;
    let m;
    while ((m = re.exec(video.description)) !== null) ch.push({ time: m[1], title: m[2].trim() });
    return ch;
  }, [video.description]);

  const askAI = async () => {
    if (!aiQuery.trim()) return;
    setAiStatus('loading');
    setAiError(null);
    try {
      const transcript = transcriptObj?.text || '';
      const trimmed = transcript.length > 80000 ? transcript.slice(0, 80000) + '\n...[truncated]' : transcript;
      const result = await callClaude({
        prompt: `You have the FULL transcript of a YouTube video. Answer the user's question based ONLY on this transcript content. Be specific, cite particular moments if you can.

Video: "${video.title}"
Channel: ${video.uploader}
Duration: ${video.duration_hms}

User's question: ${aiQuery}

${arabic ? 'IMPORTANT: Respond in Arabic (العربية). Use clear MSA. Keep tool names and URLs in their original Latin form.' : ''}
${langKey(lang) === 'fr' ? 'IMPORTANT: Respond in French. Use proper diacritics.' : ''}
${langKey(lang) === 'es' ? 'IMPORTANT: Respond in Spanish.' : ''}

Transcript:
${trimmed}`,
        maxTokens: 1500,
      });
      setAiResult(result); setAiStatus('done');
    } catch (e) { setAiError(e.message); setAiStatus('error'); }
  };

  const extractQuotes = async () => {
    if (quotes) return;
    setQuotesLoading(true);
    try {
      const transcript = transcriptObj?.text || '';
      const trimmed = transcript.length > 80000 ? transcript.slice(0, 80000) : transcript;
      const result = await callClaude({
        prompt: `Extract the 5 most memorable, quotable lines from this video transcript. These should be sentences that stand alone, contain real insight, and would be share-worthy. Avoid generic statements.

Return as JSON array only (no other text, no markdown fences):
[{"quote": "...", "context": "brief explanation of what they meant"}, ...]

${arabic ? 'Quotes should be the exact original Arabic from the transcript. The context can be in Arabic.' : ''}

Transcript:
${trimmed}`,
        maxTokens: 1500,
      });
      let json = result.trim();
      const fence = json.match(/```(?:json)?\n([\s\S]*?)\n```/);
      if (fence) json = fence[1];
      const arrStart = json.indexOf('[');
      const arrEnd = json.lastIndexOf(']');
      if (arrStart >= 0) json = json.slice(arrStart, arrEnd + 1);
      setQuotes(JSON.parse(json));
    } catch (e) { toast.push('Failed to extract quotes: ' + e.message, { type: 'error' }); }
    setQuotesLoading(false);
  };

  const generateChapters = async () => {
    if (chapters) return;
    setChaptersLoading(true);
    try {
      const transcript = transcriptObj?.text || '';
      const trimmed = transcript.length > 60000 ? transcript.slice(0, 60000) : transcript;
      const result = await callClaude({
        prompt: `This is a transcript of a ${video.duration_hms} YouTube video. Generate 6-10 logical chapters with rough timestamps based on where topics transition. Return as JSON array only (no other text):

[{"approx_time": "MM:SS or HH:MM:SS", "title": "Chapter title", "summary": "1-sentence summary"}, ...]

Estimate timestamps by treating the transcript as evenly-paced across the ${video.duration_hms} runtime. Chapters should reflect natural content transitions.

${arabic ? 'Return chapter titles and summaries in Arabic.' : ''}

Transcript:
${trimmed}`,
        maxTokens: 2000,
      });
      let json = result.trim();
      const fence = json.match(/```(?:json)?\n([\s\S]*?)\n```/);
      if (fence) json = fence[1];
      const arrStart = json.indexOf('[');
      const arrEnd = json.lastIndexOf(']');
      if (arrStart >= 0) json = json.slice(arrStart, arrEnd + 1);
      setChapters(JSON.parse(json));
    } catch (e) { toast.push('Failed to generate chapters: ' + e.message, { type: 'error' }); }
    setChaptersLoading(false);
  };

  const saveNotes = async () => {
    setNotesSaving(true);
    await onSaveNotes(video.id, notesLocal);
    setNotesSaving(false);
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 1500);
  };

  const exportAsMarkdown = () => {
    const ts = transcriptObj?.text || '';
    const md = `# ${video.title}

**Channel:** ${video.uploader}
**Duration:** ${video.duration_hms}
**URL:** ${video.url}
**Views:** ${formatNum(video.view_count)}
**Language:** ${LANG_LABELS[langKey(lang)]?.label || lang}

## Key Bullets

${(video.bullets || []).map((b, i) => `${i+1}. ${b}`).join('\n')}

## Tools Mentioned

${(video.tools_mentioned || []).map(t => `- ${t}`).join('\n') || 'None'}

## Description Links

${(video.description_links || []).map(l => `- ${l}`).join('\n') || 'None'}

${notesLocal ? `## My Notes\n\n${notesLocal}\n` : ''}

## Transcript

${ts}
`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${video.index}_${slugify(video.title)}.md`;
    a.click();
    toast.push('Exported as Markdown', { type: 'success' });
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'transcript', label: `Transcript · ${formatChars(video.transcript_chars)}` },
    { id: 'comments', label: `Comments · ${comments.length}` },
    { id: 'chapters', label: 'Chapters' },
    { id: 'quotes', label: 'Quotes' },
    { id: 'notes', label: 'Notes' },
    { id: 'links', label: 'Links' },
    { id: 'visualize', label: <span className="flex items-center gap-1"><Icon name="layers" size={12} /> Visualize</span> },
    { id: 'ask', label: <span className="flex items-center gap-1"><Icon name="sparkles" size={12} /> Ask</span> },
  ];

  return (
    <Modal onClose={onClose}>
      <div className="flex items-start justify-between p-6" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2 text-xs flex-wrap" style={{ color: 'var(--text-2)' }}>
            <span className="num">#{video.index} of {data.meta.video_count}</span>
            <span>·</span>
            <a href={video.channel_url} target="_blank" rel="noopener" className="hover:underline" style={{ color: 'var(--text-1)' }}>{video.uploader}</a>
            <span>·</span>
            <span className="lang-flag">{LANG_LABELS[langKey(lang)]?.flag || langKey(lang).toUpperCase()}</span>
            <span>·</span>
            <span className="num">{video.duration_hms}</span>
            <span>·</span>
            <span className="num">{formatNum(video.view_count)} views</span>
            {video.like_count != null && (<><span>·</span><span className="num">{formatNum(video.like_count)} ♥</span></>)}
          </div>
          <h2 className={`display text-3xl ${arabic ? 'rtl-content' : ''}`} style={{ color: 'var(--text-0)' }}>{video.title}</h2>
        </div>
        <div className="flex items-center gap-2 ml-4 flex-shrink-0">
          <button onClick={() => onToggleBookmark(video.id)} className={`btn-icon ${isBookmarked ? 'active' : ''}`}
                  title={isBookmarked ? 'Remove bookmark' : 'Bookmark this video'}>
            <Icon name="bookmark" size={16} className={isBookmarked ? 'bookmark-active' : ''} />
          </button>
          <a href={video.url} target="_blank" rel="noopener" className="btn-icon" title="Open on YouTube"><Icon name="play" size={14} /></a>
          <button onClick={exportAsMarkdown} className="btn-icon" title="Export as Markdown"><Icon name="download" size={14} /></button>
          <button onClick={onClose} className="btn-icon" title="Close (Esc)"><Icon name="x" size={16} /></button>
        </div>
      </div>

      <div className="px-6 flex overflow-x-auto no-scrollbar" style={{ borderBottom: '1px solid var(--border)' }}>
        {tabs.map(t => (
          <button key={t.id} className={`tab-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'overview' && <OverviewTab video={video} lang={lang} arabic={arabic} />}
        {tab === 'transcript' && <TranscriptTab
          video={video} transcriptObj={transcriptObj} lang={lang} arabic={arabic} toast={toast}
          translation={translation} setTranslation={setTranslation}
          translateTo={translateTo} setTranslateTo={setTranslateTo}
          translateStatus={translateStatus} translateTranscript={translateTranscript}
          ttsAvail={ttsAvail} ttsStatus={ttsStatus} playTTS={playTTS} stopTTS={stopTTS} />}
        {tab === 'comments' && <CommentsTab video={video} comments={comments} />}
        {tab === 'chapters' && <ChaptersTab
          arabic={arabic} existingChapters={existingChapters}
          chapters={chapters} chaptersLoading={chaptersLoading}
          generateChapters={generateChapters} setChapters={setChapters} />}
        {tab === 'quotes' && <QuotesTab
          video={video} arabic={arabic} quotes={quotes} quotesLoading={quotesLoading}
          extractQuotes={extractQuotes} setQuotes={setQuotes} toast={toast} />}
        {tab === 'notes' && <NotesTab
          arabic={arabic} notesLocal={notesLocal} setNotesLocal={setNotesLocal}
          saveNotes={saveNotes} notesSaving={notesSaving} notesSaved={notesSaved} />}
        {tab === 'links' && <VideoLinksTab video={video} arabic={arabic} />}
        {tab === 'visualize' && <VisualizeTab
          video={video} transcriptObj={transcriptObj} lang={lang} arabic={arabic} toast={toast} />}
        {tab === 'ask' && <AskTab
          lang={lang} arabic={arabic}
          aiQuery={aiQuery} setAiQuery={setAiQuery}
          aiStatus={aiStatus} aiResult={aiResult} aiError={aiError} askAI={askAI} />}
      </div>
    </Modal>
  );
}
