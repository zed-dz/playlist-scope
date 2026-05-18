# Playlist Scope

A React + Vite app for analyzing YouTube playlists. Demo data, full per-video
transcripts, an Ask Claude search across the playlist, MCP exports to Notion /
Drive / Gmail, six-report studio per playlist, multi-language support
(EN / AR / FR / ES) with TTS + translation, and a built-in AI agent that
auto-enriches partial playlists with full transcripts via web search.

**Live:** https://playlist-scope.netlify.app

---

## How AI features work

The app uses a **two-source architecture** to fetch video data:

**1. Transcript + metadata** (the slow, painful part — YouTube blocks datacenter IPs):

- **Primary: Supadata.ai** (`/api/transcript`). Direct REST API with residential infrastructure. 100 requests/month free, no credit card. Returns clean structured data — no LLM hallucinations.
- **Fallback: Gemini 2.5 Flash with Google Search grounding** (`/api/claude`). Slower, occasionally produces malformed JSON or refuses on date logic — but covers what Supadata misses (no-caption videos, exhausted quota, etc.). 250 requests/day free.

**2. Derived features** (Ask Playlist, Ask Video, Extract Quotes, Generate Chapters, MCP exports):

- **Gemini** for everything except MCP exports (free, generous quota since input is already-fetched transcripts).
- **Anthropic** required for MCP exports to Notion/Drive/Gmail (Gemini doesn't speak MCP).

Routing is automatic. The frontend tries Supadata first for ingest, falls through to Gemini if Supadata fails or no key is set. For derived calls it goes straight to `/api/claude`.

## Setting up the keys

Both keys are **free** and take ~30 seconds each. You need *at least one* of them.

**Supadata (recommended for transcripts):**
1. Sign up at https://supadata.ai (Google login, no credit card)
2. Copy the key from the dashboard
3. ```bash
   npx netlify env:set SUPADATA_API_KEY <your-key> --context production
   npx netlify deploy --prod
   ```

**Gemini (recommended for everything else):**
1. Get key at https://aistudio.google.com/apikey
2. ```bash
   npx netlify env:set GEMINI_API_KEY AIza... --context production
   npx netlify deploy --prod
   ```

**Anthropic (only for MCP exports):**
```bash
npx netlify env:set ANTHROPIC_API_KEY sk-ant-... --context production
```

With Supadata + Gemini set, you get effectively unlimited free use for personal-scale playlists: Supadata burns one credit per video (100/month), Gemini handles everything else within its 250/day window.

## Local development

```bash
git clone <your-repo-url>
cd playlist-scope-app
npm install
npm run dev    # localhost:5173

# To test the proxy locally:
npx netlify dev    # serves frontend + /api/claude on localhost:8888
# Set ANTHROPIC_API_KEY in .env first
```

## Deploy

```bash
git push origin main
```

CI runs in `.github/workflows/ci.yml`: build + Playwright QA + auto-deploy on main.

Required GitHub secrets:
- `NETLIFY_AUTH_TOKEN`
- `NETLIFY_SITE_ID`

## The AI enrichment agent

When you add a playlist via URL, the Supabase Edge Function enumerates videos
(titles, durations, uploaders, IDs) but can't fetch transcripts —
[YouTube blocks datacenter IPs from caption access](https://github.com/yt-dlp/yt-dlp/issues/10128).

The Enrichment panel on Briefing fixes this. Click "Enrich N videos" — the
agent walks each missing transcript, uses Gemini's Google Search grounding
to find it, persists each result, then moves on. Pause / resume / retry.
Roughly 15–30s per video, with a 7s polite delay between videos to fit
under Gemini's 10 RPM free-tier rate limit.

### Known operational quirks

- **Gemini 2.5 Flash thinking mode** consumes the output token budget on
  hidden reasoning if not disabled. The proxy explicitly sets
  `thinkingConfig: { thinkingBudget: 0 }` so all tokens go to visible content.
- **Gemini occasionally emits unescaped `"` characters** inside JSON string
  values (e.g. `"transcript": "...the \"spacing effect,\" a well-doc..."` →
  unescaped quotes break `JSON.parse`). `src/lib/ingest.js` includes a
  `repairJsonStringQuotes` recovery pass that catches the dominant failure
  mode without affecting already-valid JSON.
- **Free-tier rate limits are tight.** Gemini 2.5 Flash free tier is
  10 RPM / 250 RPD on most regional accounts. A 100-video playlist will
  exhaust the daily quota partway through. For sustained use, set a paid
  Gemini key or use `ANTHROPIC_API_KEY` instead (proxy auto-selects).
- **Gemini 2.0 Flash is off the free tier** as of late 2025 — returns
  `quota: 0`. Stick with `gemini-2.5-flash`.

## Architecture

```
playlist-scope-app/
├── src/
│   ├── App.jsx                    # orchestrator
│   ├── styles/global.css          # Tailwind + design tokens
│   ├── lib/                       # api (with proxy routing), ingest, storage, ...
│   ├── hooks/                     # useLibrary, useEnrichmentAgent
│   └── components/
│       ├── EnrichmentPanel.jsx    # agent UI
│       ├── SettingsModal.jsx      # bring-your-own-key
│       ├── modal/                 # 3 modal types + 8 video sub-tabs
│       └── tabs/                  # 9 main tabs
├── netlify/functions/
│   └── claude-proxy.js            # server-side Anthropic proxy (solves CORS)
├── public/demo-payload.b64        # compressed demo playlist
├── scripts/qa.py                  # Playwright suite
└── netlify.toml                   # functions + redirects
```

Storage: `window.storage` (artifact) → `localStorage` → in-memory fallback.

Ingest server: Supabase Edge Function at
`https://dccrfsxwmyqhghvtnabl.supabase.co/functions/v1/playlist-ingest`.

## QA

```bash
npm run build
npx playwright install chromium
python3 -m http.server 4173 --directory dist &
python3 scripts/qa.py http://127.0.0.1:4173
```

## License

MIT. Built by Amine Hammou.
