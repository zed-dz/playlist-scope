import { useState, useEffect } from 'react';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import { useToast } from './Toast.jsx';

export default function SettingsModal({ onClose }) {
  const [apiKey, setApiKey] = useState('');
  const toast = useToast();

  useEffect(() => {
    try {
      setApiKey(localStorage.getItem('anthropic_api_key') || '');
    } catch {}
  }, []);

  const save = () => {
    try {
      const trimmed = apiKey.trim();
      if (trimmed) {
        const isAnthropic = trimmed.startsWith('sk-ant-');
        const isGemini = trimmed.startsWith('AIza');
        if (!isAnthropic && !isGemini) {
          toast.push("Doesn't look like an Anthropic (sk-ant-) or Gemini (AIza) key", { type: 'warn' });
          return;
        }
        localStorage.setItem('anthropic_api_key', trimmed); // historical key name; holds either provider
        toast.push(`${isGemini ? 'Gemini' : 'Anthropic'} key saved locally`, { type: 'success' });
      } else {
        localStorage.removeItem('anthropic_api_key');
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
          AI features need an LLM API key. The server proxy at <code className="font-mono text-xs">/api/claude</code> supports both Gemini (free) and Anthropic (paid).
        </p>

        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="font-medium mb-2" style={{ color: 'var(--text-0)' }}>How auth works</h3>
            <ul className="text-xs space-y-2" style={{ color: 'var(--text-1)' }}>
              <li>
                <strong style={{ color: 'var(--accent-bright)' }}>Site-owner Gemini (recommended):</strong> set <code className="font-mono" style={{ color: 'var(--accent)' }}>GEMINI_API_KEY</code> in Netlify env vars. Free tier: 1,500 req/day, no credit card. Get a key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style={{ color: 'var(--accent-bright)' }}>aistudio.google.com/apikey</a>.
              </li>
              <li>
                <strong style={{ color: 'var(--accent-bright)' }}>Site-owner Anthropic:</strong> set <code className="font-mono" style={{ color: 'var(--accent)' }}>ANTHROPIC_API_KEY</code>. Pay-as-you-go after $5 free credit. Required for MCP exports (Notion/Drive/Gmail).
              </li>
              <li>
                <strong style={{ color: 'var(--accent-bright)' }}>In Claude.ai's artifact viewer:</strong> auth flows from your Claude session. No key needed.
              </li>
              <li>
                <strong style={{ color: 'var(--accent-bright)' }}>Bring-your-own-key (this panel):</strong> paste a Gemini (<code className="font-mono text-xs">AIza…</code>) or Anthropic (<code className="font-mono text-xs">sk-ant-…</code>) key. Stored in browser only.
              </li>
            </ul>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-3)' }}>
              LLM API key — Gemini (AIza…) or Anthropic (sk-ant-…)
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="AIza… or sk-ant-…"
              className="input-base font-mono w-full"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-xs mt-2" style={{ color: 'var(--text-2)' }}>
              Get a free Gemini key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style={{ color: 'var(--accent-bright)' }}>aistudio.google.com/apikey</a> (no credit card). Or an Anthropic key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" style={{ color: 'var(--accent-bright)' }}>console.anthropic.com</a>.
            </p>
          </div>

          <div className="card p-3" style={{ background: 'var(--bg-2)' }}>
            <p className="text-xs" style={{ color: 'var(--text-2)' }}>
              <strong style={{ color: 'var(--text-1)' }}>Privacy:</strong> The key is stored only in your browser's localStorage, never sent anywhere except directly to api.anthropic.com. Clear it by emptying the field and saving.
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
