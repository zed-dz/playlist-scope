// Anthropic API helpers + MCP export wrappers.
//
// Routing strategy:
//   1. In Claude.ai's artifact viewer, direct calls to api.anthropic.com work
//      because auth is auto-injected by the runtime.
//   2. On the deployed Netlify site, CORS blocks direct browser calls. We fall
//      back to a same-origin proxy at /api/claude (Netlify Function) which
//      adds the server-side API key.
//   3. If the user has set their own key in localStorage, it's forwarded as
//      x-user-api-key (the proxy uses it when no env var is set).
//
// Detection: we attempt direct first. If it fails with a CORS/network error
// (TypeError: Failed to fetch), we switch to the proxy for the rest of the
// session and remember that choice.

const MODEL = 'claude-sonnet-4-20250514';
const DIRECT_URL = 'https://api.anthropic.com/v1/messages';
const PROXY_URL = '/api/claude';

let routeMode = 'auto'; // 'auto' | 'direct' | 'proxy'

function userApiKey() {
  try { return localStorage.getItem('anthropic_api_key') || null; }
  catch { return null; }
}

function directHeaders() {
  const h = { 'Content-Type': 'application/json' };
  const key = userApiKey();
  if (key) {
    h['x-api-key'] = key;
    h['anthropic-version'] = '2023-06-01';
    h['anthropic-dangerous-direct-browser-access'] = 'true';
  }
  return h;
}

function proxyHeaders() {
  const h = { 'Content-Type': 'application/json' };
  const key = userApiKey();
  if (key) h['x-user-api-key'] = key;
  return h;
}

async function dispatch(body, signal) {
  // Try direct first when in 'auto' or 'direct' mode.
  // Direct path only works for: (a) Claude.ai artifact context (auth auto-injected,
  // no key in localStorage), or (b) user-provided Anthropic key (sk-ant-…) using
  // the dangerous-direct-browser-access header. Gemini keys go via proxy.
  const stored = userApiKey();
  const isGeminiKey = stored && stored.startsWith('AIza');
  if (routeMode !== 'proxy' && !isGeminiKey) {
    try {
      const r = await fetch(DIRECT_URL, { method: 'POST', headers: directHeaders(), body: JSON.stringify(body), signal });
      if (r.ok || r.status >= 400) {
        if (routeMode === 'auto') routeMode = 'direct';
        return r;
      }
    } catch (e) {
      if (routeMode === 'auto') {
        routeMode = 'proxy';
        console.info('[api] direct API blocked, switching to /api/claude proxy');
      }
    }
  }
  return fetch(PROXY_URL, { method: 'POST', headers: proxyHeaders(), body: JSON.stringify(body), signal });
}

export async function callClaude({ prompt, maxTokens = 2000, tools = null, mcp_servers = null, system = null, signal = null }) {
  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };
  if (system) body.system = system;
  if (tools) body.tools = tools;
  if (mcp_servers) body.mcp_servers = mcp_servers;

  const response = await dispatch(body, signal);
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API ${response.status}: ${err.slice(0, 200)}`);
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

// MCP-aware caller. Throws if the model declined to invoke the tool, so callers
// see real failures instead of silent no-ops.
export async function callClaudeMCP({ prompt, mcpServers, maxTokens = 2000 }) {
  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
    mcp_servers: mcpServers,
  };
  const response = await dispatch(body, null);
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API ${response.status}: ${err.slice(0, 300)}`);
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
