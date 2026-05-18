// Supadata.ai transcript + metadata proxy.
// Reliable alternative to the Gemini search-grounding path: directly fetches
// the YouTube transcript via Supadata's residential infrastructure, without
// LLM hallucinations or date-based refusals.
//
// Free tier: 100 requests/month. No credit card.
// Sign up: https://supadata.ai
// Set SUPADATA_API_KEY in Netlify env vars to enable.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-user-api-key',
};

function envGet(name) {
  try {
    if (globalThis.Netlify?.env?.get) return globalThis.Netlify.env.get(name);
    if (globalThis.Deno?.env?.get) return globalThis.Deno.env.get(name);
    if (globalThis.process?.env) return globalThis.process.env[name];
    return null;
  } catch { return null; }
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  let body;
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: { type: 'invalid_body', message: 'Body must be valid JSON' }}), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const videoId = body.videoId || body.id;
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return new Response(JSON.stringify({ error: { type: 'bad_request', message: 'videoId must be an 11-char YouTube ID' }}), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const envKey = envGet('SUPADATA_API_KEY');
  const clientKey = req.headers.get('x-user-api-key');
  const apiKey = envKey || clientKey;
  if (!apiKey) {
    return new Response(JSON.stringify({
      error: {
        type: 'no_api_key',
        message: 'No Supadata API key configured. Set SUPADATA_API_KEY in Netlify env vars (100 free requests/month at https://supadata.ai), or paste a key in app Settings.',
      },
    }), { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }});
  }

  // Fetch transcript first (more important), then metadata after a short gap.
  // Parallel calls trigger Supadata's per-second rate limit and 429 one of them.
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const opts = { headers: { 'x-api-key': apiKey } };

  const transcriptResp = await fetch(`https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}&text=true`, opts);
  const transcriptText = await transcriptResp.text();
  let transcript = null;
  try { transcript = JSON.parse(transcriptText); } catch {}

  // Small gap so the metadata call doesn't hit the per-second rate limit
  await new Promise(r => setTimeout(r, 600));

  const metadataResp = await fetch(`https://api.supadata.ai/v1/youtube/video?id=${videoId}`, opts);
  const metadataText = await metadataResp.text();
  let metadata = null;
  try { metadata = JSON.parse(metadataText); } catch {}

  // If both endpoints failed badly, return the error
  if (!transcriptResp.ok && !metadataResp.ok) {
    return new Response(JSON.stringify({
      error: {
        type: 'supadata_error',
        transcript_status: transcriptResp.status,
        metadata_status: metadataResp.status,
        message: (transcript?.error || metadata?.error || transcriptText || metadataText).toString().slice(0, 300),
      },
    }), { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }});
  }

  // Normalize to the shape the frontend expects (matches Gemini path output)
  // Transcript shape: { content: string, lang: string } when text=true
  // Metadata shape:   { id, title, description, duration, channel, uploadDate, viewCount, likeCount, ... }
  const transcriptStr =
    typeof transcript?.content === 'string' ? transcript.content :
    Array.isArray(transcript?.content) ? transcript.content.map(c => c.text || '').join(' ') :
    '';

  const out = {
    videoId,
    title: metadata?.title || '',
    uploader: metadata?.channel?.name || metadata?.channel?.title || '',
    channel_url: metadata?.channel?.id ? `https://www.youtube.com/channel/${metadata.channel.id}` : '',
    duration_sec: metadata?.duration || 0,
    duration_hms: secondsToHms(metadata?.duration || 0),
    view_count: metadata?.viewCount || 0,
    like_count: metadata?.likeCount || 0,
    comment_count: 0, // Supadata doesn't expose comment count
    upload_date: (metadata?.uploadDate || '').replace(/-/g, '').slice(0, 8),
    description: metadata?.description || '',
    transcript: transcriptStr,
    transcript_lang: transcript?.lang || 'en',
    transcript_chars: transcriptStr.length,
    description_links: extractLinks(metadata?.description || ''),
    tags: metadata?.tags || [],
    tools_mentioned: [], // requires LLM analysis; left empty for downstream enrichment
    bullets: [],         // ditto
    _source: 'supadata',
    _partial: !transcriptStr, // mark partial if no transcript could be fetched
  };

  return new Response(JSON.stringify(out), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
};

function secondsToHms(sec) {
  sec = Math.floor(sec || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(s).padStart(2, '0')}`;
}

function extractLinks(text) {
  if (!text) return [];
  const re = /https?:\/\/[^\s)<>\]]+/g;
  return Array.from(new Set((text.match(re) || []).map(u => u.replace(/[.,;:!?]+$/, ''))));
}

export const config = { path: '/api/transcript' };
