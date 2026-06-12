# Local demo

This is a small local wrapper around the repository's `skill.md`.

## Run

PowerShell:

```powershell
$env:OPENAI_API_KEY = "sk-your-key"
$env:OPENAI_BASE_URL = "https://api.deepseek.com/v1"
$env:OPENAI_MODEL = "deepseek-v4-pro"
node local-demo/server.mjs
```

Then open:

```text
http://localhost:5176
```

Without `OPENAI_API_KEY`, the page still opens, but prediction calls return a setup hint.
