// Server-side LLM proxy. Solves CORS for the deployed app, and abstracts the
// LLM provider so the frontend stays unchanged.
//
// Provider selection (priority order):
//   1. GEMINI_API_KEY env var — free tier 1,500 req/day, Google Search grounding,
//      native YouTube URL understanding. RECOMMENDED.
//   2. ANTHROPIC_API_KEY env var — pay-as-you-go, web_search tool, MCP support.
//   3. Client-supplied key via x-user-api-key header (bring-your-own-key path).
//
// API contract: the frontend sends Anthropic-shaped requests; the proxy
// translates to whichever provider is configured and returns Anthropic-shaped
// responses. This keeps src/lib/api.js unchanged.
//
// MCP exports (Notion/Drive/Gmail) require Anthropic — Gemini doesn't speak
// MCP. If the request has `mcp_servers`, we force the Anthropic path and 501
// gracefully if only Gemini is configured.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-user-api-key, anthropic-version',
};

const GEMINI_MODEL = 'gemini-2.5-flash';

function envGet(name) {
  try {
    if (globalThis.Netlify?.env?.get) return globalThis.Netlify.env.get(name);
    if (globalThis.Deno?.env?.get) return globalThis.Deno.env.get(name);
    if (globalThis.process?.env) return globalThis.process.env[name];
    return null;
  } catch { return null; }
}

// Convert Anthropic-style messages → Gemini contents.
function toGemini(req) {
  const contents = (req.messages || []).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: typeof m.content === 'string'
      ? [{ text: m.content }]
      : (m.content || []).map(p => p.type === 'text' ? { text: p.text } : { text: JSON.stringify(p) }),
  }));

  // Gemini system instruction: combine the caller's system message (if any)
  // with a hard-coded anchor that disarms date-based refusals. Gemini 2.5's
  // training cutoff predates our current date, so it sometimes refuses to
  // fetch content it deems "in the future" when reasoning about upload dates.
  const SYS_ANCHOR = "You are a research assistant accessing public web content via search. When asked about a video, article, or other artifact: if search returns results for it, the artifact exists — return what the results say. Never refuse based on date comparisons; your internal sense of 'today' may be wrong. Trust the search results over your own temporal reasoning. Always answer with your best effort from available data.";
  const userSystem = req.system ? req.system + "\n\n" : "";
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

// Convert Gemini response → Anthropic-shaped { content: [{type, text}] }
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

async function callGemini(req, apiKey) {
  const body = toGemini(req);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  // Retry once on transient overload (503), no backoff. Total time budget for
  // the edge function is 50s, so we can't afford long exponential retries.
  // Other failure modes (500, 429, 4xx) propagate as-is — the agent's
  // video-level error path will skip them; user can re-click Enrich.
  let r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let text = await r.text();
  if (r.status === 503) {
    await new Promise(res => setTimeout(res, 500));
    r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    text = await r.text();
  }

  if (!r.ok) {
    return new Response(JSON.stringify({
      error: { type: 'gemini_error', message: `Gemini API ${r.status}: ${text.slice(0, 400)}` },
    }), { status: r.status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }});
  }
  let gem;
  try { gem = JSON.parse(text); }
  catch {
    return new Response(JSON.stringify({ error: { type: 'parse_error', message: 'Bad Gemini JSON' }}), {
      status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify(fromGemini(gem)), {
    status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
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
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
  const rawBody = await req.text();
  let parsed;
  try { parsed = JSON.parse(rawBody); }
  catch {
    return new Response(JSON.stringify({ error: { type: 'invalid_body', message: 'Body must be valid JSON' }}), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const wantsMCP = Array.isArray(parsed?.mcp_servers) && parsed.mcp_servers.length > 0;
  const clientKey = req.headers.get('x-user-api-key');
  const geminiKey = envGet('GEMINI_API_KEY');
  const anthropicKey = envGet('ANTHROPIC_API_KEY');

  if (wantsMCP) {
    const key = anthropicKey || (clientKey?.startsWith('sk-ant-') ? clientKey : null);
    if (!key) {
      return new Response(JSON.stringify({
        error: { type: 'mcp_needs_anthropic', message: 'MCP exports require ANTHROPIC_API_KEY (Gemini does not support MCP). Set it in Netlify env vars or paste an Anthropic key in Settings.' },
      }), { status: 501, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }});
    }
    return callAnthropic(rawBody, key);
  }

  if (geminiKey) return callGemini(parsed, geminiKey);
  if (anthropicKey) return callAnthropic(rawBody, anthropicKey);
  if (clientKey) {
    if (clientKey.startsWith('sk-ant-')) return callAnthropic(rawBody, clientKey);
    if (clientKey.startsWith('AIza')) return callGemini(parsed, clientKey);
  }

  return new Response(JSON.stringify({
    error: {
      type: 'no_api_key',
      message: 'No LLM API key configured. Recommended: set GEMINI_API_KEY in Netlify env vars (free tier at https://aistudio.google.com/apikey, 1,500 req/day). Or set ANTHROPIC_API_KEY. Or paste a key in app Settings.',
    },
  }), { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }});
};

export const config = { path: '/api/claude' };
