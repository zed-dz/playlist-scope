// LLM API helpers — always routed through the same-origin proxy at /api/claude.
//
// The proxy (netlify/edge-functions/claude-proxy.js) prefers the free Gemini
// tier (1,500 req/day, no credit card) and falls back to Anthropic only if a
// Gemini key isn't configured. No direct browser-to-provider calls are made
// from this file — that keeps the user's Claude.ai subscription out of the
// loop and ensures we use the free path by default.
//
// MCP exports (Notion/Drive/Gmail) still require an Anthropic key on the
// server because Gemini doesn't speak MCP — the proxy 501s gracefully when
// MCP is requested without an Anthropic key.

const PROXY_URL = '/api/claude';
const LEGACY_KEY = 'anthropic_api_key';
const STORAGE_KEY = 'llm_api_key';

function userApiKey() {
  try {
    return localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY) || null;
  } catch { return null; }
}

function proxyHeaders() {
  const h = { 'Content-Type': 'application/json' };
  const key = userApiKey();
  if (key) h['x-user-api-key'] = key;
  return h;
}

async function dispatch(body, signal) {
  return fetch(PROXY_URL, {
    method: 'POST',
    headers: proxyHeaders(),
    body: JSON.stringify(body),
    signal,
  });
}

// Parse the proxy's structured error envelope into a human-friendly message.
// The proxy returns shapes like:
//   { error: { type, provider, status, message, hint, providers_tried: [...] } }
// We surface message + hint when available, and tag the provider for context.
async function readError(response) {
  let raw = '';
  try { raw = await response.text(); } catch {}
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch {}
  const e = parsed?.error;
  if (!e) return `HTTP ${response.status}: ${raw.slice(0, 200) || 'no response body'}`;

  const providerTag = e.provider ? `[${e.provider}]` : '';
  const kindLabel = ({
    quota_exceeded: 'Daily quota exhausted',
    rate_limit: 'Rate limit',
    auth: 'Authentication failed',
    invalid_request: 'Invalid request',
    overload: 'Provider overloaded',
    server_error: 'Upstream server error',
    no_api_key: 'No API key configured',
    mcp_needs_anthropic: 'MCP needs Anthropic',
  })[e.type] || e.type || `HTTP ${response.status}`;

  const parts = [`${providerTag} ${kindLabel}`.trim()];
  if (e.message) parts.push(`— ${e.message}`);
  if (e.hint) parts.push(`\nHint: ${e.hint}`);
  if (Array.isArray(e.providers_tried) && e.providers_tried.length > 1) {
    const chain = e.providers_tried.map(p => `${p.provider}: ${p.kind}`).join(' → ');
    parts.push(`\nCascade: ${chain}`);
  }
  return parts.join(' ');
}

export async function callClaude({ prompt, maxTokens = 2000, tools = null, mcp_servers = null, system = null, signal = null }) {
  const body = {
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };
  if (system) body.system = system;
  if (tools) body.tools = tools;
  if (mcp_servers) body.mcp_servers = mcp_servers;

  const response = await dispatch(body, signal);
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  const data = await response.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
}

export async function callClaudeWithSearch({ prompt, maxTokens = 4000 }) {
  return callClaude({
    prompt,
    maxTokens,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
  });
}

// Vision: send a prompt + image (base64) and return the model's text response.
// Routed through the same /api/claude proxy — the proxy detects image content
// and constrains the cascade to vision-capable providers (Gemini, Anthropic).
export async function callClaudeVision({ prompt, imageBase64, mediaType = 'image/jpeg', maxTokens = 1500, signal = null }) {
  const body = {
    max_tokens: maxTokens,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
        { type: 'text', text: prompt },
      ],
    }],
  };
  const response = await dispatch(body, signal);
  if (!response.ok) throw new Error(await readError(response));
  const data = await response.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
}

// OCR the YouTube thumbnail for a video. Tries the highest-resolution variant
// first, falls back through lower-res ones. Returns whatever text the model
// reads off the thumbnail (titles, banners, captions), trimmed.
export async function ocrThumbnail(videoId, { signal = null } = {}) {
  const candidates = [
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  ];

  let lastErr = null;
  let imageBase64 = null;
  let mediaType = 'image/jpeg';

  for (const url of candidates) {
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) { lastErr = `${url} → HTTP ${res.status}`; continue; }
      const blob = await res.blob();
      // YouTube serves a 120x90 placeholder when maxres doesn't exist — skip it.
      if (blob.size < 2000) { lastErr = `${url} → ${blob.size}B placeholder`; continue; }
      mediaType = blob.type || 'image/jpeg';
      imageBase64 = await blobToBase64(blob);
      break;
    } catch (e) {
      lastErr = `${url} → ${e.message}`;
    }
  }

  if (!imageBase64) throw new Error(`Couldn't fetch any thumbnail variant: ${lastErr || 'unknown'}`);

  const prompt = `Look at this YouTube video thumbnail and extract ALL visible text exactly as it appears (titles, banners, captions, callouts, on-screen labels). Preserve original capitalization and line breaks. If text is in a language other than English, transcribe it in the original script.

If there is NO text on the thumbnail, respond with exactly: NO_TEXT

If there is text, return ONLY the extracted text — no preamble, no quotes, no "the thumbnail says".`;

  const result = await callClaudeVision({ prompt, imageBase64, mediaType, maxTokens: 800, signal });
  return result.trim();
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result;
      const comma = dataUrl.indexOf(',');
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

// MCP-aware caller. Throws if the model declined to invoke the tool, so callers
// see real failures instead of silent no-ops. Requires Anthropic on the server.
export async function callClaudeMCP({ prompt, mcpServers, maxTokens = 2000 }) {
  const body = {
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
    mcp_servers: mcpServers,
  };
  const response = await dispatch(body, null);
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  const data = await response.json();
  const parts = [];
  let toolUsed = false;
  let toolError = null;
  for (const block of (data.content || [])) {
    if (block.type === 'text') parts.push(block.text);
    else if (block.type === 'mcp_tool_use') toolUsed = true;
    else if (block.type === 'mcp_tool_result') {
      if (block.is_error) toolError = (block.content || []).map(c => c.text).join('\n');
      else parts.push((block.content || []).map(c => c.text).join('\n'));
    }
  }
  if (toolError) throw new Error(toolError.slice(0, 400));
  if (!toolUsed) throw new Error(parts.join('\n').slice(0, 400) || 'MCP tool was not invoked');
  return parts.join('\n');
}

export const MCP_SERVERS = {
  notion: { type: 'url', url: 'https://mcp.notion.com/mcp', name: 'Notion' },
  drive:  { type: 'url', url: 'https://drivemcp.googleapis.com/mcp/v1', name: 'GoogleDrive' },
  gmail:  { type: 'url', url: 'https://gmailmcp.googleapis.com/mcp/v1', name: 'Gmail' },
};

export async function exportToNotion(title, markdownContent) {
  const prompt = `Use the Notion MCP to create a new Notion page with the following content. The page title MUST be exactly: "${title}". The body MUST contain the entire markdown content provided below, preserving headings, lists, tables, and emphasis. Place the page at the user's workspace root if no parent is specified. After creation, return the public-ish Notion URL in this format: NOTION_URL: <url>

CONTENT TO PUT IN THE PAGE:
${markdownContent}`;
  return callClaudeMCP({ prompt, mcpServers: [MCP_SERVERS.notion], maxTokens: 3000 });
}

export async function exportToDrive(title, markdownContent) {
  const prompt = `Use the Google Drive MCP to create a new file named "${title}.md" with the following content. After creation, return the file's Drive URL or web link in this format: DRIVE_URL: <url>

FILE CONTENT:
${markdownContent}`;
  return callClaudeMCP({ prompt, mcpServers: [MCP_SERVERS.drive], maxTokens: 2000 });
}

export async function exportToGmail(subject, markdownContent) {
  const prompt = `Use the Gmail MCP to create a DRAFT email (do not send) addressed to the user's own primary email. Subject: "${subject}". Body: include the markdown content below verbatim. Return DRAFT_ID: <id> on success.

EMAIL BODY:
${markdownContent}`;
  return callClaudeMCP({ prompt, mcpServers: [MCP_SERVERS.gmail], maxTokens: 2000 });
}
