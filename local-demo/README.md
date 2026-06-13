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
```

The public frontend never receives the API key, base URL, or model list. Prediction calls use the server-side environment configuration.

`local-demo/.env.example` includes the current primary provider, the fable provider, and retained otokapi backup placeholders. Copy it to `.env.local` on a private machine or server, then replace placeholder keys there. `.env.local` is ignored by Git.

## Admin brief APIs

Daily brief update endpoints are hidden from the frontend and disabled unless `ADMIN_TOKEN` is set.

Send `x-admin-token: <ADMIN_TOKEN>` when calling:

```text
POST /api/brief/preview
POST /api/brief/write
POST /api/models
```
