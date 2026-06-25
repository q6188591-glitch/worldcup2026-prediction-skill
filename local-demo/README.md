# Public deployment demo

This wrapper serves a public prediction page while keeping provider credentials on the server.

## Run locally

PowerShell:

```powershell
$env:OPENAI_API_KEY = "sk-your-key"
$env:OPENAI_BASE_URL = "https://api.example.com/v1"
$env:OPENAI_MODEL = "gpt-5.5"
node local-demo/server.mjs
```

Then open:

```text
http://localhost:5176
```

## Server environment

Required:

```text
OPENAI_API_KEY
OPENAI_BASE_URL
OPENAI_MODEL
```

Optional dual prediction providers:

```text
GPT_OPENAI_API_KEY
GPT_OPENAI_BASE_URL=https://api.openai.com/v1
GPT_OPENAI_MODEL=gpt-5.5

DEEPSEEK_OPENAI_API_KEY
DEEPSEEK_OPENAI_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_OPENAI_MODEL=deepseek-chat
```

When both GPT and DeepSeek are configured, every `/api/predict` request calls both providers and returns `modelResults` for side-by-side display. The legacy `OPENAI_*` settings are still supported and are treated as GPT unless the base URL contains `deepseek`.

Retained fable provider settings:

```text
FABLE_OPENAI_API_KEY
FABLE_OPENAI_BASE_URL
FABLE_OPENAI_MODEL=anthropic/claude-fable-5
FABLE_FREE_USES=2
```

Fable settings can stay in the private environment file for later use, but the current runtime disables fable and sends every public prediction through the primary `OPENAI_*` provider because fable5 is banned.

Optional:

```text
PORT=5176
ADMIN_TOKEN=change-this-if-you-want-admin-brief-apis
LIVE_NEWS_RSS_URL=https://www.espn.com/espn/rss/soccer/news
LIVE_REFRESH_MS=600000
```

The public frontend never receives the API key, base URL, or model list. Prediction calls use the server-side environment configuration.

## Live prediction updates

The demo now keeps a server-side live news context. The server refreshes `LIVE_NEWS_RSS_URL` every `LIVE_REFRESH_MS` milliseconds, pushes update events to the browser, and injects the latest brief into every `/api/predict` call. On the page, the "实时情报" bar shows refresh status, supports manual refresh, and can automatically recalculate the current matchup after new context arrives.

`local-demo/.env.example` includes the current primary provider, the fable provider, and retained otokapi backup placeholders. Copy it to `.env.local` on a private machine or server, then replace placeholder keys there. `.env.local` is ignored by Git.

## Admin brief APIs

Daily brief update endpoints are hidden from the frontend and disabled unless `ADMIN_TOKEN` is set.

Send `x-admin-token: <ADMIN_TOKEN>` when calling:

```text
POST /api/brief/preview
POST /api/brief/write
POST /api/models
```
