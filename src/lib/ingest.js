import { callClaudeWithSearch } from './api.js';
import { parseYouTubeUrl } from './format.js';
import { langKey } from './i18n.js';

// Repair JSON string-literal quoting when an LLM emits unescaped " inside a
// string value. Heuristic: walk the input tracking whether we're inside a
// string. When inside, escape any " that isn't immediately followed by a
// JSON-significant character (whitespace, : , } ] EOF). Conservative — leaves
// already-correct JSON unchanged. Handles the dominant Gemini failure mode:
// "transcript": "...he said "hello" and..." → "...he said \"hello\" and..."
function repairJsonStringQuotes(src) {
  const out = [];
  let i = 0, n = src.length;
  let inString = false;
  while (i < n) {
    const c = src[i];
    if (!inString) {
      if (c === '"') inString = true;
      out.push(c);
      i++;
      continue;
    }
    // Inside a string
    if (c === '\\' && i + 1 < n) {
      // Pass through escape sequences as-is
      out.push(c, src[i + 1]);
      i += 2;
      continue;
    }
    if (c === '"') {
      // Could be: end of string, OR a stray unescaped quote inside the value.
      // Look ahead past whitespace for the next non-space character.
      let j = i + 1;
      while (j < n && /\s/.test(src[j])) j++;
      const next = j < n ? src[j] : '';
      // End-of-string only if followed by JSON structure chars or EOF
      const isEnd = next === '' || next === ',' || next === ':' ||
                    next === '}' || next === ']';
      if (isEnd) {
        out.push('"');
        inString = false;
      } else {
        // Stray quote — escape it
        out.push('\\', '"');
      }
      i++;
      continue;
    }
    if (c === '\n') {
      // Unescaped newline inside string — convert to space
      out.push(' ');
      i++;
      continue;
    }
    if (c === '\r') { out.push(' '); i++; continue; }
    if (c === '\t') { out.push(' '); i++; continue; }
    out.push(c);
    i++;
  }
  return out.join('');
}

// Fetch metadata + (best-effort) transcript for a single YouTube video.
//
// Primary path: /api/transcript (Supadata.ai) — fast, reliable, no LLM
//   hallucinations. Returns metadata + transcript in one go.
// Fallback path: callClaudeWithSearch (Gemini or Anthropic via /api/claude)
//   — slower, occasionally flaky on edge cases, but works when Supadata fails
//   (404, no captions, etc.) or when SUPADATA_API_KEY isn't configured.
//
// If the user supplied a Supadata key in Settings (localStorage), it's
// forwarded as x-user-api-key for the proxy to use.
export async function fetchSingleVideo(videoUrl) {
  const parsed = parseYouTubeUrl(videoUrl);
  if (!parsed || (parsed.type !== 'video' && parsed.type !== 'playlist_with_video')) {
    throw new Error('Not a valid YouTube video URL');
  }
  const videoId = parsed.id;

  // === PRIMARY: Supadata ===
  try {
    const data = await fetchViaSupadata(videoId);
    if (data && data.transcript && data.transcript.length > 100) {
      return shapeBundle(videoId, data);
    }
    // Supadata succeeded but no usable transcript → fall through to Gemini
  } catch (e) {
    // Supadata key missing or transient failure → fall through silently.
    // We don't surface this to the user; the Gemini path is the fallback.
    console.info('[ingest] Supadata path skipped:', e?.message?.slice(0, 100));
  }

  // === FALLBACK: Gemini/Claude search-grounded ===
  return await fetchViaSearch(videoId);
}

async function fetchViaSupadata(videoId) {
  const supadataKey = (() => { try { return localStorage.getItem('supadata_api_key') || null; } catch { return null; } })();
  const headers = { 'Content-Type': 'application/json' };
  if (supadataKey) headers['x-user-api-key'] = supadataKey;

  const resp = await fetch('/api/transcript', {
    method: 'POST',
    headers,
    body: JSON.stringify({ videoId }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Supadata ${resp.status}: ${errText.slice(0, 200)}`);
  }
  return await resp.json();
}

async function fetchViaSearch(videoId) {
  const prompt = `You have access to web_search. For YouTube video https://www.youtube.com/watch?v=${videoId}, find and return the FOLLOWING in strict JSON format (no other text, no markdown fences):

1. Get the video's title, channel name (uploader), duration (in HH:MM:SS), view count, like count, comment count, and upload date
2. The full transcript — search youtubetranscript.com, tactiq.io, or any transcript service. If transcript not available, use empty string.
3. Detect the language of the transcript (en, ar, fr, es, de, etc.)
4. Identify tools/products/services mentioned in the video (AI tools, software products, websites)
5. Extract URLs from the description (search for the description on youtube.com directly)
6. Generate 6 key takeaway bullets that summarize the video's content

CRITICAL JSON RULES — read these carefully:
- Use SINGLE quotes for any quoted phrases INSIDE string values (e.g. write she said 'hello' not she said "hello"). Double quotes inside strings break JSON.
- No newlines inside string values — replace them with spaces.
- No unescaped control characters.
- The output must be valid JSON that JSON.parse() accepts with no preprocessing.

Return EXACTLY this JSON structure:
{
  "title": "...",
  "uploader": "...",
  "channel_url": "https://www.youtube.com/...",
  "duration_hms": "HH:MM:SS",
  "duration_sec": number,
  "view_count": number,
  "like_count": number,
  "comment_count": number,
  "upload_date": "YYYYMMDD",
  "transcript": "full text using only single quotes for internal quotation...",
  "transcript_lang": "en",
  "tools_mentioned": ["tool1", "tool2"],
  "description_links": ["url1", "url2"],
  "tags": ["tag1", "tag2"],
  "description": "full description...",
  "bullets": ["bullet 1", "bullet 2", "bullet 3", "bullet 4", "bullet 5", "bullet 6"]
}

If you cannot find specific data, use null or empty arrays.`;

  const result = await callClaudeWithSearch({ prompt, maxTokens: 8000 });

  let jsonStr = result.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\n([\s\S]*?)\n```/);
  if (fenceMatch) jsonStr = fenceMatch[1];
  const bs = jsonStr.indexOf('{'), be = jsonStr.lastIndexOf('}');
  if (bs >= 0 && be > bs) jsonStr = jsonStr.slice(bs, be + 1);

  let parsed_data;
  try {
    parsed_data = JSON.parse(jsonStr);
  } catch (firstErr) {
    // Repair pass: Gemini sometimes emits unescaped double quotes inside string values.
    // Walk the JSON character by character, tracking string state, and escape stray quotes
    // that aren't followed by JSON-structure-significant characters.
    try {
      const repaired = repairJsonStringQuotes(jsonStr);
      parsed_data = JSON.parse(repaired);
    } catch (secondErr) {
      throw new Error(`Failed to parse API response. AI returned: ${result.slice(0, 300)}...`);
    }
  }

  const lang = langKey(parsed_data.transcript_lang || 'en');
  return shapeBundle(videoId, parsed_data, lang);
}

// Map any source's parsed data (Supadata or Gemini) to the canonical video
// bundle shape consumed by the rest of the app.
function shapeBundle(videoId, d, lang) {
  if (!lang) lang = langKey(d.transcript_lang || 'en');
  return {
    index: 1,
    id: videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: d.title || 'Untitled',
    uploader: d.uploader || 'Unknown',
    channel_url: d.channel_url || '',
    duration_hms: d.duration_hms || '0:00',
    duration_sec: d.duration_sec || 0,
    view_count: d.view_count || 0,
    like_count: d.like_count || 0,
    comment_count: d.comment_count || 0,
    upload_date: d.upload_date || '',
    description: d.description || '',
    transcript: d.transcript || '',
    transcript_lang: d.transcript_lang || 'en',
    transcript_chars: (d.transcript || '').length,
    transcript_path: `transcripts/${videoId}.${lang}.txt`,
    content_lang: lang,
    description_links: d.description_links || [],
    transcript_links: [],
    transcript_links_clean: [],
    tools_mentioned: d.tools_mentioned || [],
    tags: d.tags || [],
    bullets: d.bullets || [],
    comment_analysis: { count: 0, highlights: [], links: [], themes: [] },
  };
}

// Enumerate a playlist, then fetch each video. Calls onProgress between videos.
// opts: { maxVideos, ingestServerUrl }. When ingestServerUrl is set, prefer it
// over web_search — it returns the full bundle in one shot.
export async function fetchPlaylist(playlistUrl, onProgress, opts = {}) {
  const maxVideos = opts.maxVideos || 50;
  const parsed = parseYouTubeUrl(playlistUrl);
  if (!parsed || (parsed.type !== 'playlist' && parsed.type !== 'playlist_with_video')) {
    throw new Error('Not a valid YouTube playlist URL');
  }
  const listId = parsed.list;

  // Server path: one POST → full bundle.
  // Supabase Edge Function URLs (/functions/v1/<name>) are used as-is.
  // Other servers get /api/ingest appended for backward compat with the Python pipeline.
  if (opts.ingestServerUrl) {
    const endpoint = opts.ingestServerUrl.includes('/functions/v1/')
      ? opts.ingestServerUrl
      : opts.ingestServerUrl.replace(/\/$/, '') + '/api/ingest';
    onProgress?.({ stage: 'server', done: 0, total: 0, current: `Calling ingest server (${new URL(endpoint).hostname})…` });
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: playlistUrl, max_videos: maxVideos }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Server returned ${resp.status}`);
    }
    const bundle = await resp.json();
    onProgress?.({ stage: 'done', done: bundle.videos?.length || 0, total: bundle.videos?.length || 0, current: 'Done' });
    return { ...bundle, _isServerBundle: true };
  }

  // Client/web-search fallback path.
  onProgress?.({ stage: 'enumerate', done: 0, total: 0, current: 'Enumerating playlist…' });

  const enumPrompt = `Use web_search to find every video in YouTube playlist https://www.youtube.com/playlist?list=${listId}. Visit the playlist page (also try invidious mirrors and pipedapi.kavin.rocks if the main page is rate-limited). Return STRICT JSON, no markdown fences:

{
  "playlist_title": "...",
  "uploader": "...",
  "videos": [
    {"id": "VIDEO_ID_11_CHARS", "title": "...", "uploader": "channel name", "duration_hms": "MM:SS"},
    ...
  ]
}

Return up to ${maxVideos} videos. The "id" MUST be the 11-character YouTube video ID. Include all videos you can find in playlist order. If you can only find a few, return what you have.`;

  const enumResp = await callClaudeWithSearch({ prompt: enumPrompt, maxTokens: 8000 });
  let jsonStr = enumResp.trim();
  const fence = jsonStr.match(/```(?:json)?\n([\s\S]*?)\n```/);
  if (fence) jsonStr = fence[1];
  const bs = jsonStr.indexOf('{'), be = jsonStr.lastIndexOf('}');
  if (bs >= 0 && be > bs) jsonStr = jsonStr.slice(bs, be + 1);
  let enumData;
  try { enumData = JSON.parse(jsonStr); }
  catch (e) { throw new Error('Could not parse playlist enumeration: ' + enumResp.slice(0, 300)); }

  const list = (enumData.videos || []).filter(v => v.id && v.id.length >= 10).slice(0, maxVideos);
  if (list.length === 0) throw new Error('No videos found in playlist (try the JSON bundle path for full coverage)');

  const total = list.length;
  const videos = [];
  for (let i = 0; i < list.length; i++) {
    const stub = list[i];
    onProgress?.({ stage: 'fetch', done: i, total, current: `Video ${i + 1}/${total}: ${stub.title?.slice(0, 50) || stub.id}` });
    try {
      const full = await fetchSingleVideo(`https://www.youtube.com/watch?v=${stub.id}`);
      videos.push({ ...full, index: i + 1, _stub_title: stub.title });
    } catch (err) {
      videos.push({
        index: i + 1,
        id: stub.id,
        url: `https://www.youtube.com/watch?v=${stub.id}`,
        title: stub.title || stub.id,
        uploader: stub.uploader || 'Unknown',
        channel_url: '',
        duration_hms: stub.duration_hms || '?',
        duration_sec: 0,
        view_count: 0, like_count: 0, comment_count: 0,
        description: '',
        transcript_lang: 'en',
        transcript_chars: 0,
        content_lang: 'en',
        description_links: [],
        transcript_links: [],
        transcript: '',
        tools_mentioned: [],
        tags: [],
        bullets: [],
        comment_analysis: { count: 0, highlights: [], links: [], themes: [] },
        _fetch_error: err.message,
      });
    }
  }
  onProgress?.({ stage: 'done', done: total, total, current: 'Building payload…' });

  return {
    playlist_title: enumData.playlist_title || 'Imported Playlist',
    uploader: enumData.uploader || 'Unknown',
    playlist_url: playlistUrl,
    playlist_id: listId,
    videos,
  };
}

// Turn an array of video objects into the artifact's `data` payload shape.
export function buildPayloadFromVideos(videos, title, source) {
  const transcripts = {};
  const comments = {};
  const tool_index = {};
  const link_index = {};
  const comment_link_index = {};

  videos.forEach((v, i) => {
    v.index = i + 1;
    if (v.transcript) transcripts[v.id] = { lang: v.transcript_lang || 'en', text: v.transcript };
    if (v.comments) comments[v.id] = v.comments;
    else comments[v.id] = [];

    (v.tools_mentioned || []).forEach(tool => {
      if (!tool_index[tool]) tool_index[tool] = [];
      tool_index[tool].push({ id: v.id, index: v.index, title: v.title, channel: v.uploader });
    });

    (v.description_links || []).forEach(link => {
      const clean = link.replace(/\/$/, '');
      if (!link_index[clean]) link_index[clean] = [];
      link_index[clean].push({ id: v.id, index: v.index, title: v.title });
    });

    delete v.transcript;
    delete v.comments;
  });

  return {
    meta: {
      playlist_id: source.id || '',
      playlist_title: title,
      playlist_uploader: 'You',
      playlist_url: source.url || '',
      video_count: videos.length,
      total_transcript_chars: Object.values(transcripts).reduce((s, t) => s + t.text.length, 0),
      total_comments: Object.values(comments).reduce((s, c) => s + c.length, 0),
      languages: videos.reduce((acc, v) => {
        const l = langKey(v.content_lang || 'en');
        acc[l] = (acc[l] || 0) + 1;
        return acc;
      }, {}),
    },
    videos,
    transcripts,
    comments,
    tool_index,
    link_index,
    comment_link_index,
    synthesis_md: '',
  };
}
