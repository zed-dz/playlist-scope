import { useState, useEffect } from 'react';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import { useToast } from './Toast.jsx';

const STORAGE_KEY = 'llm_api_key';
const LEGACY_KEY = 'anthropic_api_key';

export default function SettingsModal({ onClose }) {
  const [apiKey, setApiKey] = useState('');
  const toast = useToast();

  useEffect(() => {
    try {
      setApiKey(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY) || '');
    } catch {}
  }, []);

  const save = () => {
    try {
      const trimmed = apiKey.trim();
      if (trimmed) {
        const isGemini = trimmed.startsWith('AIza');
        const isAnthropic = trimmed.startsWith('sk-ant-');
        if (!isGemini && !isAnthropic) {
          toast.push("Doesn't look like a Gemini (AIza…) or Anthropic (sk-ant-…) key", { type: 'warn' });
          return;
        }
        localStorage.setItem(STORAGE_KEY, trimmed);
        try { localStorage.removeItem(LEGACY_KEY); } catch {}
        toast.push(`${isGemini ? 'Gemini' : 'Anthropic'} key saved locally`, { type: 'success' });
      } else {
        localStorage.removeItem(STORAGE_KEY);
        try { localStorage.removeItem(LEGACY_KEY); } catch {}
        toast.push('API key removed', { type: 'success' });
      }
      onClose();
    } catch (e) {
      toast.push('Failed to save: ' + e.message, { type: 'error' });
    }
  };

  return (
    <Modal onClose={onClose} narrow>
      <div className="p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="display text-3xl"><span className="display-italic">Settings</span></h2>
          <button onClick={onClose} className="btn-icon"><Icon name="x" /></button>
        </div>
        <p className="text-sm mb-5" style={{ color: 'var(--text-2)' }}>
          AI features run on <strong style={{ color: 'var(--accent-bright)' }}>Google Gemini's free tier</strong> — 1,500 requests/day, no credit card required. The server proxy never calls a paid Claude API by default.
        </p>

        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="font-medium mb-2" style={{ color: 'var(--text-0)' }}>How auth works</h3>
            <ul className="text-xs space-y-2" style={{ color: 'var(--text-1)' }}>
              <li>
                <strong style={{ color: 'var(--accent-bright)' }}>Free Gemini (recommended):</strong> set <code className="font-mono" style={{ color: 'var(--accent)' }}>GEMINI_API_KEY</code> in Netlify env vars, <em>or</em> paste a Gemini key below. Free tier: 1,500 req/day, no credit card. Grab a key in 30 seconds at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style={{ color: 'var(--accent-bright)' }}>aistudio.google.com/apikey</a>.
              </li>
              <li>
                <strong style={{ color: 'var(--text-2)' }}>Anthropic (only if you need MCP exports):</strong> set <code className="font-mono" style={{ color: 'var(--text-2)' }}>ANTHROPIC_API_KEY</code>. Required only for Notion/Drive/Gmail exports — every other feature runs fine on the free Gemini path.
              </li>
            </ul>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-3)' }}>
              Free Gemini API key — paste here
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="AIza…"
              className="input-base font-mono w-full"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-xs mt-2" style={{ color: 'var(--text-2)' }}>
              Get one at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style={{ color: 'var(--accent-bright)' }}>aistudio.google.com/apikey</a> — free, no credit card, takes under a minute.
            </p>
          </div>

          <div className="card p-3" style={{ background: 'var(--bg-2)' }}>
            <p className="text-xs" style={{ color: 'var(--text-2)' }}>
              <strong style={{ color: 'var(--text-1)' }}>Privacy:</strong> Your key is stored only in this browser's localStorage, then forwarded to the same-origin <code className="font-mono">/api/claude</code> proxy with each request. Clear it any time by emptying the field and saving.
            </p>
          </div>

          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="btn-ghost">Cancel</button>
            <button onClick={save} className="btn-primary">
              <Icon name="check" size={12} /> Save
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
