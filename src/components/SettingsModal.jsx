import { useState, useEffect } from 'react';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import { useToast } from './Toast.jsx';

const STORAGE_KEY = 'llm_api_key';
const LEGACY_KEY = 'anthropic_api_key';

const PROVIDERS = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    prefix: 'AIza',
    badge: 'Recommended',
    tier: '1,500 req/day free',
    signupUrl: 'https://aistudio.google.com/apikey',
    blurb: 'No credit card. Google Search grounding for transcript enrichment. Best default.',
  },
  {
    id: 'groq',
    name: 'Groq',
    prefix: 'gsk_',
    badge: 'Fastest',
    tier: '~14k req/day free',
    signupUrl: 'https://console.groq.com/keys',
    blurb: 'Llama 3.3 70B. ~500 tokens/sec — feels instant. No search grounding.',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    prefix: 'sk-or-',
    badge: 'Flexible',
    tier: '20 req/min, no daily cap',
    signupUrl: 'https://openrouter.ai/keys',
    blurb: 'Llama 3.3 70B via free models. Backup when Gemini hits its daily cap.',
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    prefix: 'csk-',
    badge: 'Blazing',
    tier: '8k req/day free',
    signupUrl: 'https://cloud.cerebras.ai',
    blurb: 'World-record fastest inference. Great when Groq rate-limits you.',
  },
];

function detectProviderName(key) {
  for (const p of PROVIDERS) if (key.startsWith(p.prefix)) return p.name;
  if (key.startsWith('sk-ant-')) return 'Anthropic';
  return null;
}

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
        const providerName = detectProviderName(trimmed);
        if (!providerName) {
          toast.push("Key doesn't match any known provider prefix (AIza…, gsk_…, sk-or-…, csk-…, sk-ant-…)", { type: 'warn' });
          return;
        }
        localStorage.setItem(STORAGE_KEY, trimmed);
        try { localStorage.removeItem(LEGACY_KEY); } catch {}
        toast.push(`${providerName} key saved locally`, { type: 'success' });
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

  const detected = apiKey.trim() ? detectProviderName(apiKey.trim()) : null;

  return (
    <Modal onClose={onClose} narrow>
      <div className="p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="display text-3xl"><span className="display-italic">Settings</span></h2>
          <button onClick={onClose} className="btn-icon"><Icon name="x" /></button>
        </div>
        <p className="text-sm mb-5" style={{ color: 'var(--text-2)' }}>
          AI features run on free LLM providers. The proxy cascades through whichever keys are configured — when one runs out, it tries the next automatically.
        </p>

        <div className="space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>
              Free providers — grab any one (or several) and paste below
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {PROVIDERS.map(p => (
                <a key={p.id} href={p.signupUrl} target="_blank" rel="noopener"
                   className="card p-3 card-hover block"
                   style={{ textDecoration: 'none' }}>
                  <div className="flex items-start justify-between mb-1">
                    <span className="font-medium text-sm" style={{ color: 'var(--text-0)' }}>{p.name}</span>
                    <span className="chip" style={{ fontSize: '0.6rem' }}>{p.badge}</span>
                  </div>
                  <div className="text-xs mb-1" style={{ color: 'var(--accent-bright)' }}>{p.tier}</div>
                  <div className="text-xs" style={{ color: 'var(--text-2)' }}>{p.blurb}</div>
                  <div className="text-xs mt-2 font-mono" style={{ color: 'var(--text-3)' }}>
                    Key starts with <code>{p.prefix}…</code>
                  </div>
                </a>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-3)' }}>
              Paste your API key (any provider above)
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="AIza… or gsk_… or sk-or-… or csk-…"
              className="input-base font-mono w-full"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-xs mt-2" style={{ color: detected ? 'var(--accent-bright)' : 'var(--text-2)' }}>
              {detected ? `✓ Detected: ${detected}` : 'Provider will be auto-detected from the key prefix.'}
            </p>
          </div>

          <div className="card p-3" style={{ background: 'var(--bg-2)' }}>
            <p className="text-xs" style={{ color: 'var(--text-2)' }}>
              <strong style={{ color: 'var(--text-1)' }}>How fallback works:</strong> the proxy tries your pasted key first, then any keys the site owner has set in Netlify env vars (<code className="font-mono">GEMINI_API_KEY</code>, <code className="font-mono">GROQ_API_KEY</code>, <code className="font-mono">OPENROUTER_API_KEY</code>, <code className="font-mono">CEREBRAS_API_KEY</code>). On rate-limit or quota errors it advances to the next. Auth errors stop the chain so bad keys surface immediately.
            </p>
            <p className="text-xs mt-2" style={{ color: 'var(--text-2)' }}>
              <strong style={{ color: 'var(--text-1)' }}>Privacy:</strong> Your key is stored only in this browser's localStorage and forwarded to the same-origin <code className="font-mono">/api/claude</code> proxy with each request.
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
