import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const publicDir = path.join(__dirname, "public");

async function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env.local");
  if (!existsSync(envPath)) return;
  const text = await readFile(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim().replace(/^\uFEFF/, "");
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

await loadLocalEnv();

const port = Number(process.env.PORT || 5176);
const host = process.env.HOST || "0.0.0.0";
const primaryProvider = {
  name: "primary",
  apiBase: (process.env.PRIMARY_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.deepseek.com/v1").replace(/\/$/, ""),
  apiKey: process.env.PRIMARY_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "",
  model: process.env.PRIMARY_OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-5.5",
};
const fableProvider = {
  name: "fable",
  apiBase: (process.env.FABLE_OPENAI_BASE_URL || "").replace(/\/$/, ""),
  apiKey: process.env.FABLE_OPENAI_API_KEY || "",
  model: process.env.FABLE_OPENAI_MODEL || "fable5.0",
};
const fableFreeUses = Number(process.env.FABLE_FREE_USES || 2);
const adminToken = process.env.ADMIN_TOKEN || "";

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, "");
  return JSON.parse(text || "{}");
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders,
  });
  res.end(body);
}

function publicConfig() {
  return {
    model: primaryProvider.model,
    hasApiKey: Boolean(primaryProvider.apiKey),
    fableFreeUses: 0,
    fableEnabled: false,
    providerNotice: "因 fable5 被 ban，当前使用 5.5",
  };
}

function requireAdmin(req, res) {
  if (!adminToken) {
    sendJson(res, 404, { error: "Admin API is disabled" });
    return false;
  }
  const token = req.headers["x-admin-token"];
  if (token !== adminToken) {
    sendJson(res, 401, { error: "Unauthorized" });
    return false;
  }
  return true;
}

async function callChat({ apiBase, apiKey, model, messages, responseFormat }) {
  const body = {
    model,
    messages,
  };
  if (responseFormat) body.response_format = responseFormat;

  let upstream;
  let raw = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    upstream = await fetch(`${apiBase}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    raw = await upstream.text();
    if (![502, 503, 504].includes(upstream.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
  }

  if (!upstream.ok) {
    const error = new Error("Model request failed");
    error.status = upstream.status;
    error.detail = safeProviderError(upstream.status, raw);
    throw error;
  }
  return JSON.parse(raw).choices?.[0]?.message?.content;
}

function safeProviderError(status, raw) {
  try {
    const data = JSON.parse(raw);
    return data.error?.message || data.message || `Model provider returned HTTP ${status}`;
  } catch {
    if (/<title>(.*?)<\/title>/i.test(raw)) {
      const title = raw.match(/<title>(.*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();
      return title || `Model provider returned HTTP ${status}`;
    }
    return raw.slice(0, 300) || `Model provider returned HTTP ${status}`;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1
          ? [part, ""]
          : [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function fableUses(req) {
  const value = Number.parseInt(parseCookies(req).wc_fable_used || "0", 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function providerForRequest() {
  return { provider: primaryProvider, used: 0, shouldIncrementFable: false };
}

function fableCookieHeaders(nextUsed) {
  return {
    "set-cookie": `wc_fable_used=${encodeURIComponent(String(nextUsed))}; Max-Age=2592000; Path=/; SameSite=Lax`,
  };
}

function selectedProviderHeaders(selected) {
  return selected.shouldIncrementFable ? fableCookieHeaders(selected.used + 1) : {};
}

async function listModels(req, res) {
  if (!requireAdmin(req, res)) return;
  if (!primaryProvider.apiKey) {
    sendJson(res, 400, { error: "Missing API key" });
    return;
  }

  const upstream = await fetch(`${primaryProvider.apiBase}/models`, {
    headers: { authorization: `Bearer ${primaryProvider.apiKey}` },
  });
  const raw = await upstream.text();
  if (!upstream.ok) {
    sendJson(res, upstream.status, { error: "Models request failed", detail: raw });
    return;
  }

  const data = JSON.parse(raw);
  const models = (data.data || [])
    .map((item) => item.id || item.name)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  sendJson(res, 200, { models, raw: data });
}

async function predict(req, res) {
  const payload = await readJson(req);
  const { teamA, teamB, stage = "小组赛" } = payload;

  if (!teamA || !teamB) {
    sendJson(res, 422, { error: "teamA and teamB are required" });
    return;
  }
  if (!primaryProvider.apiKey) {
    sendJson(res, 500, { error: "Server model provider is not configured" });
    return;
  }

  const skill = await readFile(path.join(repoRoot, "skill.md"), "utf8");
  const selected = providerForRequest(req);
  try {
    const content = await callChat({
      apiBase: selected.provider.apiBase,
      apiKey: selected.provider.apiKey,
      model: selected.provider.model,
      responseFormat: { type: "json_object" },
      messages: [
        { role: "system", content: skill },
        {
          role: "user",
          content: `请预测这场 2026 世界杯比赛:【${stage}】${teamA} vs ${teamB}。严格按约束文档的 JSON 格式输出。`,
        },
      ],
    });
    sendJson(res, 200, JSON.parse(content), selectedProviderHeaders(selected));
  } catch (error) {
    if (selected.provider.name === "fable" && primaryProvider.apiKey) {
      try {
        const content = await callChat({
          apiBase: primaryProvider.apiBase,
          apiKey: primaryProvider.apiKey,
          model: primaryProvider.model,
          responseFormat: { type: "json_object" },
          messages: [
            { role: "system", content: skill },
            {
              role: "user",
              content: `请预测这场 2026 世界杯比赛:【${stage}】${teamA} vs ${teamB}。严格按约束文档的 JSON 格式输出。`,
            },
          ],
        });
        sendJson(res, 200, JSON.parse(content), selectedProviderHeaders(selected));
        return;
      } catch (fallbackError) {
        error = fallbackError;
      }
    }
    if (error.detail) {
      sendJson(res, error.status || 502, { error: error.message, detail: error.detail });
    } else {
      sendJson(res, 502, { error: "Model did not return valid JSON", content: error.message });
    }
  }
}

function decodeXml(text) {
  return text
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function fetchNewsItems() {
  const url = "https://www.espn.com/espn/rss/soccer/news";
  const response = await fetch(url, {
    headers: { "user-agent": "worldcup-local-demo/1.0" },
  });
  const xml = await response.text();
  if (!response.ok) throw new Error(`News request failed: ${response.status}`);

  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .slice(0, 12)
    .map((match) => {
      const item = match[1];
      const title = decodeXml(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "").trim();
      const link = decodeXml(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "").trim();
      const pubDate = decodeXml(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "").trim();
      const source = decodeXml(item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] || "").trim();
      return { title, source, link, pubDate };
    })
    .filter((item) => item.title)
    .filter((item) => /world cup|世界杯|mexico|south africa|korea|czech|usa|canada|injury|squad/i.test(item.title))
    .filter((item) => !/betting|odds|best bets|props|futures/i.test(item.title));
}

function fallbackBrief(items) {
  const date = new Date().toISOString().slice(0, 10);
  const bullets = items.slice(0, 8).map((item) => {
    const source = item.source ? `（${item.source}）` : "";
    return `- ${item.title}${source}`;
  });
  return `## 六、最新情报（每日更新区）

> 本节由每日情报流程覆盖更新。**当本节与第四节冲突时，以本节为准**（本节更新）。

**情报日期：${date}**

${bullets.join("\n")}
`;
}

async function previewBrief(req, res) {
  if (!requireAdmin(req, res)) return;
  const items = await fetchNewsItems();
  let brief = fallbackBrief(items);

  if (primaryProvider.apiKey && primaryProvider.model) {
    const newsText = items
      .map((item, index) => `${index + 1}. ${item.title} | ${item.source || "unknown"} | ${item.pubDate}`)
      .join("\n");
    try {
      brief = await callChat({
        apiBase: primaryProvider.apiBase,
        apiKey: primaryProvider.apiKey,
        model: primaryProvider.model,
        messages: [
          {
            role: "system",
            content:
              "你是世界杯情报编辑。只根据用户给出的新闻标题和来源，生成 skill.md 第六节。不要编造伤停；不确定就写未确认。输出 Markdown，不要代码块。",
          },
          {
            role: "user",
            content: `请把以下新闻整理成“## 六、最新情报（每日更新区）”。要求：保留标题、情报日期、3-8条要点；若没有明确伤停，只写“暂无明确伤停确认”。\n\n${newsText}`,
          },
        ],
      });
    } catch {
      // Keep the deterministic fallback so the workflow still produces a preview.
    }
  }

  sendJson(res, 200, { brief, items });
}

async function writeBrief(req, res) {
  if (!requireAdmin(req, res)) return;
  const { brief } = await readJson(req);
  if (!String(brief || "").startsWith("## 六、最新情报")) {
    sendJson(res, 422, { error: "brief must start with ## 六、最新情报" });
    return;
  }
  const skillPath = path.join(repoRoot, "skill.md");
  const skill = await readFile(skillPath, "utf8");
  const marker = "## 六、最新情报";
  const index = skill.indexOf(marker);
  if (index === -1) {
    sendJson(res, 500, { error: "Section marker not found in skill.md" });
    return;
  }
  const next = `${skill.slice(0, index).trimEnd()}\n\n${String(brief).trim()}\n`;
  await writeFile(skillPath, next, "utf8");
  sendJson(res, 200, { ok: true });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(publicDir, pathname));
  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath);
  const contentType = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
  }[ext] || "application/octet-stream";
  res.writeHead(200, { "content-type": contentType });
  res.end(await readFile(filePath));
}

createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/api/config") {
      sendJson(res, 200, publicConfig());
      return;
    }
    if (req.method === "POST" && req.url === "/api/models") {
      await listModels(req, res);
      return;
    }
    if (req.method === "POST" && req.url === "/api/predict") {
      await predict(req, res);
      return;
    }
    if (req.method === "POST" && req.url === "/api/brief/preview") {
      await previewBrief(req, res);
      return;
    }
    if (req.method === "POST" && req.url === "/api/brief/write") {
      await writeBrief(req, res);
      return;
    }
    if (req.method === "GET") {
      await serveStatic(req, res);
      return;
    }
    res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    res.end("Method not allowed");
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}).listen(port, host, () => {
  console.log(`WorldCup local demo: http://${host}:${port}`);
  console.log(`Primary model endpoint: ${primaryProvider.apiBase} / ${primaryProvider.model}`);
  if (fableProvider.apiBase && fableProvider.apiKey) {
    console.log(`Fable model endpoint is configured but disabled; using primary model only.`);
  }
});
