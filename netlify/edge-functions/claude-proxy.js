// Server-side LLM proxy. Solves CORS for the deployed app, and abstracts the
// LLM provider so the frontend stays unchanged.
//
// Provider cascade — tried in this order, each one configured by env var:
//   1. GEMINI_API_KEY      — Google Gemini, free tier 1,500 req/day. Best.
//   2. GROQ_API_KEY        — Groq Llama 3.3 70B, free tier ~14k req/day. Very fast.
//   3. OPENROUTER_API_KEY  — OpenRouter free Llama 3.3 70B, generous limits.
//   4. CEREBRAS_API_KEY    — Cerebras Llama 3.3 70B, free tier 8k req/day, blazing fast.
//   5. ANTHROPIC_API_KEY   — Claude (paid). Required for MCP exports.
//
// Bring-your-own-key (BYOK) via x-user-api-key header. The key prefix tells
// us which provider it's for. The BYOK key is *prepended* to the cascade so
// it's tried first, but on quota/overload we fall through to the env-var keys.
//
//   AIza…    → Gemini
//   gsk_…    → Groq
//   sk-or-…  → OpenRouter
//   csk-…    → Cerebras
//   sk-ant-… → Anthropic
//
// API contract: frontend sends Anthropic-shaped requests; proxy translates
// to whichever provider it ends up using and returns Anthropic-shaped
// responses. The response includes _meta.provider for transparency.
//
// Cascade rules: advance to the next provider on transient errors (429, 500,
// 502, 503, 504) and on quota-exhaustion. Do NOT advance on hard auth errors
// (400 with bad-key, 401, 403) — those mean the configured key is wrong, not
// that the provider is unavailable.
//
// MCP exports (Notion/Drive/Gmail) require Anthropic — they bypass the cascade
// and hit Anthropic directly. 501 gracefully if no Anthropic key is configured.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-user-api-key, anthropic-version',
};

const GEMINI_MODEL = 'gemini-2.5-flash';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';
const CEREBRAS_MODEL = 'llama-3.3-70b';

const SYS_ANCHOR = "You are a research assistant accessing public web content via search. When asked about a video, article, or other artifact: if search returns results for it, the artifact exists — return what the results say. Never refuse based on date comparisons; your internal sense of 'today' may be wrong. Trust the search results over your own temporal reasoning. Always answer with your best effort from available data.";

function envGet(name) {
  try {
    if (globalThis.Netlify?.env?.get) return globalThis.Netlify.env.get(name);
    if (globalThis.Deno?.env?.get) return globalThis.Deno.env.get(name);
    if (globalThis.process?.env) return globalThis.process.env[name];
    return null;
  } catch { return null; }
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// ---------- Provider key detection ----------

function detectProvider(key) {
  if (!key) return null;
  if (key.startsWith('AIza'))   return 'gemini';
  if (key.startsWith('gsk_'))   return 'groq';
  if (key.startsWith('sk-or-')) return 'openrouter';
  if (key.startsWith('csk-'))   return 'cerebras';
  if (key.startsWith('sk-ant-')) return 'anthropic';
  return null;
}

// ---------- Error classification ----------
// Each provider has its own error shape. We normalize into:
//   { kind: 'rate_limit'|'quota_exceeded'|'auth'|'invalid_request'|'overload'|'server_error'|'unknown',
//     message: human-readable cause, status: HTTP status, retry_after?: seconds }
// Cascade advances on: rate_limit, quota_exceeded, overload, server_error.
// Cascade stops on: auth, invalid_request.

const ADVANCE_KINDS = new Set(['rate_limit', 'quota_exceeded', 'overload', 'server_error']);

function classifyError(provider, status, bodyText) {
  let body = null;
  try { body = JSON.parse(bodyText); } catch {}

  const msg = (body?.error?.message || body?.message || bodyText || '').toString();
  const lower = msg.toLowerCase();

  if (status === 401 || status === 403) {
    return { kind: 'auth', message: msg.slice(0, 300) || `${provider}: authentication failed (invalid or revoked key)`, status };
  }
  if (status === 429) {
    // Distinguish daily-quota-exhaust from per-minute rate-limit when possible
    const isDaily = /day|daily|quota/.test(lower) || /resource has been exhausted/.test(lower);
    return {
      kind: isDaily ? 'quota_exceeded' : 'rate_limit',
      message: msg.slice(0, 300) || `${provider}: ${isDaily ? 'daily quota exhausted' : 'rate limit hit'}`,
      status,
      retry_after: body?.error?.retry_after || null,
    };
  }
  if (status === 402) {
    return { kind: 'quota_exceeded', message: msg.slice(0, 300) || `${provider}: insufficient credit / quota exhausted`, status };
  }
  if (status === 503 || status === 504) {
    return { kind: 'overload', message: msg.slice(0, 300) || `${provider}: service overloaded, try again shortly`, status };
  }
  if (status >= 500) {
    return { kind: 'server_error', message: msg.slice(0, 300) || `${provider}: upstream server error (${status})`, status };
  }
  if (status === 400) {
    if (/api[_ ]?key|unauthor/i.test(lower)) {
      return { kind: 'auth', message: msg.slice(0, 300), status };
    }
    return { kind: 'invalid_request', message: msg.slice(0, 300) || `${provider}: bad request`, status };
  }
  return { kind: 'unknown', message: msg.slice(0, 300) || `${provider}: HTTP ${status}`, status };
}

// ---------- Anthropic shape <-> OpenAI shape ----------
// Used by Groq, OpenRouter, Cerebras.

function toOpenAI(req, model) {
  const messages = (req.messages || []).map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: typeof m.content === 'string'
      ? m.content
      : (m.content || []).map(p => p.type === 'text' ? p.text : JSON.stringify(p)).join('\n'),
  }));
  if (req.system) messages.unshift({ role: 'system', content: req.system });
  return {
    model,
    messages,
    max_tokens: req.max_tokens || 2000,
    temperature: req.temperature ?? 0.7,
    stream: false,
  };
}

function fromOpenAI(resp, providerLabel, modelLabel) {
  const text = resp?.choices?.[0]?.message?.content || '';
  return {
    id: `msg_${providerLabel}_${Date.now()}`,
    model: modelLabel,
    role: 'assistant',
    content: text ? [{ type: 'text', text }] : [{ type: 'text', text: '[empty response]' }],
    stop_reason: resp?.choices?.[0]?.finish_reason || 'end_turn',
    usage: {
      input_tokens: resp?.usage?.prompt_tokens || 0,
      output_tokens: resp?.usage?.completion_tokens || 0,
    },
  };
}

// ---------- Anthropic shape <-> Gemini shape ----------

function toGemini(req) {
  const partFor = (p) => {
    if (p.type === 'text') return { text: p.text };
    if (p.type === 'image' && p.source?.type === 'base64') {
      return { inlineData: { mimeType: p.source.media_type || 'image/jpeg', data: p.source.data } };
    }
    return { text: JSON.stringify(p) };
  };
  const contents = (req.messages || []).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: typeof m.content === 'string' ? [{ text: m.content }] : (m.content || []).map(partFor),
  }));
  const userSystem = req.system ? req.system + '\n\n' : '';
  const fullSystem = userSystem + SYS_ANCHOR;
  const out = {
    contents,
    systemInstruction: { parts: [{ text: fullSystem }] },
    generationConfig: {
      maxOutputTokens: req.max_tokens || 2000,
      temperature: req.temperature ?? 0.7,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  if (req.tools && req.tools.some(t => t?.type?.startsWith('web_search') || t?.name === 'web_search')) {
    out.tools = [{ googleSearch: {} }];
  }
  return out;
}

function fromGemini(gem) {
  const parts = gem?.candidates?.[0]?.content?.parts || [];
  const content = parts.filter(p => p.text != null).map(p => ({ type: 'text', text: p.text }));
  if (content.length === 0) {
    const finish = gem?.candidates?.[0]?.finishReason;
    const block = gem?.promptFeedback?.blockReason;
    content.push({
      type: 'text',
      text: block ? `[blocked: ${block}]` : (finish ? `[no output: ${finish}]` : '[empty response]'),
    });
  }
  return {
    id: `msg_gem_${Date.now()}`,
    model: GEMINI_MODEL,
    role: 'assistant',
    content,
    stop_reason: gem?.candidates?.[0]?.finishReason || 'end_turn',
    usage: {
      input_tokens: gem?.usageMetadata?.promptTokenCount || 0,
      output_tokens: gem?.usageMetadata?.candidatesTokenCount || 0,
    },
  };
}

// ---------- Provider callers ----------
// Each returns { ok: true, body: AnthropicShape } on success, or
//             { ok: false, err: ClassifiedError } on failure.

async function callGemini(req, apiKey) {
  const body = toGemini(req);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) return { ok: false, err: classifyError('gemini', r.status, text) };
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { return { ok: false, err: { kind: 'server_error', message: 'gemini: malformed JSON', status: 502 } }; }
  return { ok: true, body: fromGemini(parsed) };
}

async function callOpenAILike(req, apiKey, url, model, providerLabel, extraHeaders = {}) {
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify(toOpenAI(req, model)),
  });
  const text = await r.text();
  if (!r.ok) return { ok: false, err: classifyError(providerLabel, r.status, text) };
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { return { ok: false, err: { kind: 'server_error', message: `${providerLabel}: malformed JSON`, status: 502 } }; }
  return { ok: true, body: fromOpenAI(parsed, providerLabel, model) };
}

async function callGroq(req, apiKey) {
  return callOpenAILike(req, apiKey, 'https://api.groq.com/openai/v1/chat/completions', GROQ_MODEL, 'groq');
}

async function callOpenRouter(req, apiKey) {
  return callOpenAILike(req, apiKey, 'https://openrouter.ai/api/v1/chat/completions', OPENROUTER_MODEL, 'openrouter', {
    'HTTP-Referer': 'https://playlist-scope.netlify.app',
    'X-Title': 'Playlist Scope',
  });
}

async function callCerebras(req, apiKey) {
  return callOpenAILike(req, apiKey, 'https://api.cerebras.ai/v1/chat/completions', CEREBRAS_MODEL, 'cerebras');
}

async function callAnthropic(rawBody, apiKey) {
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: rawBody,
  });
  const text = await upstream.text();
  if (!upstream.ok) return { ok: false, err: classifyError('anthropic', upstream.status, text), raw: text, status: upstream.status };
  try { return { ok: true, body: JSON.parse(text) }; }
  catch { return { ok: false, err: { kind: 'server_error', message: 'anthropic: malformed JSON', status: 502 } }; }
}

// ---------- Cascade builder ----------

// Detect whether the request includes any image content blocks. Llama-based
// providers (Groq/OpenRouter free tier/Cerebras) don't support vision on the
// models we use, so vision requests are constrained to Gemini + Anthropic.
function hasImageContent(parsed) {
  for (const m of (parsed?.messages || [])) {
    if (Array.isArray(m.content)) {
      for (const p of m.content) {
        if (p?.type === 'image') return true;
      }
    }
  }
  return false;
}

function buildCascade(parsed, clientKey) {
  const visionOnly = hasImageContent(parsed);
  const chain = [];
  const seen = new Set();
  const add = (provider, key, caller, supportsVision = false) => {
    if (!key || seen.has(provider)) return;
    if (visionOnly && !supportsVision) return;
    seen.add(provider);
    chain.push({ provider, key, caller });
  };

  // 1) User-supplied BYOK first (so users with their own quota burn that first)
  const byokProvider = detectProvider(clientKey);
  if (byokProvider === 'gemini')     add('gemini',     clientKey, (req) => callGemini(req, clientKey), true);
  if (byokProvider === 'groq')       add('groq',       clientKey, (req) => callGroq(req, clientKey));
  if (byokProvider === 'openrouter') add('openrouter', clientKey, (req) => callOpenRouter(req, clientKey));
  if (byokProvider === 'cerebras')   add('cerebras',   clientKey, (req) => callCerebras(req, clientKey));
  // sk-ant- BYOK intentionally skipped here — Anthropic always goes last and is paid.

  // 2) Server env vars, free providers first
  const geminiKey     = envGet('GEMINI_API_KEY');
  const groqKey       = envGet('GROQ_API_KEY');
  const openrouterKey = envGet('OPENROUTER_API_KEY');
  const cerebrasKey   = envGet('CEREBRAS_API_KEY');
  const anthropicKey  = envGet('ANTHROPIC_API_KEY');

  if (geminiKey)     add('gemini',     geminiKey,     (req) => callGemini(req, geminiKey), true);
  if (groqKey)       add('groq',       groqKey,       (req) => callGroq(req, groqKey));
  if (openrouterKey) add('openrouter', openrouterKey, (req) => callOpenRouter(req, openrouterKey));
  if (cerebrasKey)   add('cerebras',   cerebrasKey,   (req) => callCerebras(req, cerebrasKey));

  // 3) Anthropic last (paid). Anthropic supports vision.
  if (anthropicKey)                      add('anthropic', anthropicKey, null, true);
  else if (byokProvider === 'anthropic') add('anthropic', clientKey,    null, true);

  return chain;
}

// ---------- Main handler ----------

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: { type: 'method_not_allowed', message: 'POST only' } }, 405);

  const rawBody = await req.text();
  let parsed;
  try { parsed = JSON.parse(rawBody); }
  catch { return jsonResponse({ error: { type: 'invalid_body', message: 'Body must be valid JSON' } }, 400); }

  const wantsMCP = Array.isArray(parsed?.mcp_servers) && parsed.mcp_servers.length > 0;
  const clientKey = req.headers.get('x-user-api-key');

  // MCP path — bypass cascade, Anthropic only
  if (wantsMCP) {
    const anthropicKey = envGet('ANTHROPIC_API_KEY') || (clientKey?.startsWith('sk-ant-') ? clientKey : null);
    if (!anthropicKey) {
      return jsonResponse({
        error: {
          type: 'mcp_needs_anthropic',
          provider: 'anthropic',
          message: 'MCP exports (Notion/Drive/Gmail) need an Anthropic API key — Gemini, Groq, OpenRouter, and Cerebras do not support MCP. Set ANTHROPIC_API_KEY in Netlify env vars or paste an sk-ant-… key in Settings.',
        },
      }, 501);
    }
    const result = await callAnthropic(rawBody, anthropicKey);
    if (result.ok) {
      const body = result.body;
      body._meta = { provider: 'anthropic', via: 'mcp' };
      return jsonResponse(body, 200);
    }
    return jsonResponse({
      error: {
        type: result.err.kind,
        provider: 'anthropic',
        status: result.err.status,
        message: `Anthropic MCP call failed — ${result.err.message}`,
      },
    }, result.err.status || 502);
  }

  // Normal path — cascade through providers
  const chain = buildCascade(parsed, clientKey);
  if (chain.length === 0) {
    return jsonResponse({
      error: {
        type: 'no_api_key',
        message: 'No LLM API key configured. Easiest path: get a free Gemini key (1,500 req/day, no credit card) at https://aistudio.google.com/apikey and paste it in app Settings. Or set GEMINI_API_KEY / GROQ_API_KEY / OPENROUTER_API_KEY / CEREBRAS_API_KEY in Netlify env vars.',
        providers_available: {
          gemini:     'https://aistudio.google.com/apikey (1,500 req/day free)',
          groq:       'https://console.groq.com/keys (free, very fast Llama 3.3 70B)',
          openrouter: 'https://openrouter.ai/keys (free Llama 3.3 70B via :free models)',
          cerebras:   'https://cloud.cerebras.ai (free, fastest inference)',
        },
      },
    }, 401);
  }

  const attempts = [];
  for (let i = 0; i < chain.length; i++) {
    const link = chain[i];
    let result;
    if (link.provider === 'anthropic') {
      result = await callAnthropic(rawBody, link.key);
    } else {
      result = await link.caller(parsed);
    }
    if (result.ok) {
      const body = result.body;
      body._meta = { provider: link.provider, attempts: attempts.length, fallback_used: i > 0 };
      return jsonResponse(body, 200);
    }
    attempts.push({ provider: link.provider, ...result.err });
    // Stop the cascade on hard auth / invalid_request — those mean the key
    // itself is bad, not that the provider is unavailable.
    if (!ADVANCE_KINDS.has(result.err.kind)) break;
  }

  // All providers failed (or first hard-error stopped the cascade)
  const last = attempts[attempts.length - 1];
  const triedNames = attempts.map(a => a.provider).join(' → ');
  const summary = attempts.length > 1
    ? `All ${attempts.length} providers failed (${triedNames}). Last error: ${last.message}`
    : last.message;

  return jsonResponse({
    error: {
      type: last.kind,
      provider: last.provider,
      providers_tried: attempts.map(a => ({ provider: a.provider, kind: a.kind, status: a.status, message: a.message })),
      message: summary,
      hint: hintForError(last, attempts),
    },
  }, last.status || 502);
};

function hintForError(last, attempts) {
  if (last.kind === 'quota_exceeded' || last.kind === 'rate_limit') {
    const others = ['gemini', 'groq', 'openrouter', 'cerebras', 'anthropic'].filter(p => !attempts.some(a => a.provider === p));
    if (others.length > 0) {
      return `${last.provider} ran out — add a fallback key for any of: ${others.join(', ')}. Each takes 30 seconds to sign up.`;
    }
    return last.kind === 'quota_exceeded'
      ? `Daily quota exhausted. ${last.retry_after ? `Retry in ${last.retry_after}s. ` : ''}Add more provider keys to get more headroom.`
      : `Rate limit. Wait a few seconds and retry, or add another provider key.`;
  }
  if (last.kind === 'auth') {
    return `The ${last.provider} key looks invalid or revoked. Get a fresh one and update it in Settings or Netlify env vars.`;
  }
  if (last.kind === 'invalid_request') {
    return `Request was rejected as malformed — usually a prompt-too-long issue. Try a shorter input.`;
  }
  return null;
}

export const config = { path: '/api/claude' };
