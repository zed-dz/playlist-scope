# Push to GitHub (2 minutes)

The directory you have is already a git repo with one commit, ready to push.

## Easiest path — with `gh` CLI (recommended)

If you have GitHub CLI installed (`gh --version` to check, install:
https://cli.github.com), run one command from inside `playlist-scope-app/`:

```bash
gh repo create playlist-scope --public --source=. --remote=origin --push
```

That creates the repo on your GitHub account, sets it as `origin`, and
pushes `main`. You'll get the URL back. Done.

## Manual path — without `gh`

1. Go to https://github.com/new
2. Repository name: `playlist-scope`
3. Public or Private — your call
4. Don't initialize with README, .gitignore, or license (you already have all three)
5. Click "Create repository"
6. GitHub shows the new repo's URL — copy it (`https://github.com/<you>/playlist-scope.git`)
7. From inside `playlist-scope-app/`:

```bash
git remote add origin https://github.com/<you>/playlist-scope.git
git push -u origin main
```

## Then use it in Claude Code

```bash
gh repo clone <you>/playlist-scope
cd playlist-scope
claude
```

…or open the directory in any IDE and start working.

## Hook up CI auto-deploy

The repo includes `.github/workflows/ci.yml` which runs build + Playwright QA
on every push, and auto-deploys to Netlify on `main`. To enable:

1. GitHub repo → Settings → Secrets and variables → Actions → New repository secret
2. Add `NETLIFY_AUTH_TOKEN` — get from https://app.netlify.com/user/applications#personal-access-tokens
3. Add `NETLIFY_SITE_ID` = `80af5f0f-64bf-4bb8-89f6-0ab050fd42de`

(If you want a fresh Netlify site instead of mine, run
`npx netlify init` from the repo root and follow the prompts. The `NETLIFY_SITE_ID`
secret then points to your new site.)

## Set the API key in Netlify

After cloning + pushing, the LLM proxy at `/api/claude` returns 401 until
a key is set. **Recommended: Gemini free tier.** No credit card, 1,500 req/day:

1. Get key at https://aistudio.google.com/apikey
2. Set + redeploy:

```bash
npx netlify env:set GEMINI_API_KEY AIza... --context production
npx netlify deploy --prod
```

Anthropic alternative (pay-as-you-go after $5 free credit, supports MCP exports):

```bash
npx netlify env:set ANTHROPIC_API_KEY sk-ant-... --context production
npx netlify deploy --prod
```

Or set either via dashboard: Site → Site configuration → Environment variables.

---

## What you'll get after `git push`

```
github.com/<you>/playlist-scope/
├── README.md                      # Architecture + AI auth routing
├── LICENSE                        # MIT
├── .github/workflows/ci.yml       # Build + QA + Netlify deploy
├── netlify/functions/claude-proxy.js  # CORS-solving Anthropic proxy
├── src/                           # 38 modular React components
├── public/demo-payload.b64        # 1.16 MB compressed demo (79 videos)
├── scripts/qa.py                  # Playwright suite
└── package.json
```

57 files, 1 initial commit. Build it locally: `npm install && npm run build`.
