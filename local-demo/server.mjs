import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const predictionsPath = path.join(dataDir, "predictions.json");
const memoryPath = path.join(dataDir, "team-memory.json");

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
const liveRefreshMs = Number(process.env.LIVE_REFRESH_MS || 10 * 60 * 1000);
const liveNewsUrl = process.env.LIVE_NEWS_RSS_URL || "https://www.espn.com/espn/rss/soccer/news";
const recordsRefreshMs = Number(process.env.RECORDS_REFRESH_MS || 60 * 1000);
const scoreboardBaseUrl = (process.env.SCOREBOARD_BASE_URL || "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard").replace(/\/$/, "");
const reviewSourceUrls = (process.env.REVIEW_SOURCE_URLS || "https://www.espn.com/espn/rss/soccer/news,http://newsrss.bbc.co.uk/rss/sportonline_uk_edition/football/rss.xml")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
let liveContextCache = null;
let liveContextPromise = null;
const liveClients = new Set();

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
    providerNotice: "当前使用服务端配置模型；预测会自动注入实时情报。",
    liveRefreshMs,
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

function predictionKey(teamA, teamB) {
  return `${teamA}|${teamB}`;
}

function reverseScore(score) {
  const [a, b] = String(score || "").split("-");
  return a !== undefined && b !== undefined ? `${b}-${a}` : score;
}

function unorderedMatchKey(teamA, teamB) {
  return [teamA, teamB].sort((a, b) => a.localeCompare(b, "zh-CN")).join("|");
}

async function readSavedPredictions() {
  try {
    const text = await readFile(predictionsPath, "utf8");
    const data = JSON.parse(text);
    return new Map((Array.isArray(data) ? data : []).map((item) => [predictionKey(item.teamA, item.teamB), item]));
  } catch (error) {
    if (error.code === "ENOENT") return new Map();
    throw error;
  }
}

async function readTeamMemory() {
  try {
    const text = await readFile(memoryPath, "utf8");
    const data = JSON.parse(text);
    return data && typeof data === "object" ? data : { teams: {} };
  } catch (error) {
    if (error.code === "ENOENT") return { teams: {} };
    throw error;
  }
}

async function writeTeamMemory(memory) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(memoryPath, `${JSON.stringify(memory, null, 2)}\n`, "utf8");
}

async function fetchRssItems(url) {
  const response = await fetch(url, { headers: { "user-agent": "worldcup-local-demo/1.0" } });
  const xml = await response.text();
  if (!response.ok) throw new Error(`Review source failed: ${response.status}`);
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .slice(0, 30)
    .map((match) => {
      const item = match[1];
      return {
        title: decodeXml(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "").trim(),
        link: decodeXml(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "").trim(),
        pubDate: decodeXml(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "").trim(),
        source: new URL(url).hostname,
      };
    })
    .filter((item) => item.title);
}

async function fetchReviewItems() {
  const groups = await Promise.allSettled(reviewSourceUrls.map((url) => fetchRssItems(url)));
  return groups.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

function withTimeout(promise, ms, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

async function savePredictionSnapshot(payload, result) {
  if (!result?.predictedScore || !payload.teamA || !payload.teamB) return;
  const saved = await readSavedPredictions();
  const key = predictionKey(payload.teamA, payload.teamB);
  saved.set(key, {
    key,
    teamA: payload.teamA,
    teamB: payload.teamB,
    group: payload.group || "",
    date: payload.date || "",
    stage: payload.stage || "小组赛",
    predicted: result.predictedScore,
    confidence: result.confidence || "",
    updatedAtIso: new Date().toISOString(),
  });
  await mkdir(dataDir, { recursive: true });
  await writeFile(predictionsPath, `${JSON.stringify([...saved.values()], null, 2)}\n`, "utf8");
}

function memoryForPrompt(memory, teamA, teamB) {
  const teams = memory?.teams || {};
  const selected = [teamA, teamB]
    .map((team) => teams[team])
    .filter(Boolean)
    .map((entry) => {
      const insights = (entry.insights || []).slice(0, 5).map((item) => `- ${item}`).join("\n");
      const risks = (entry.risks || []).slice(0, 4).map((item) => `- ${item}`).join("\n");
      return `### ${entry.team}\n最近复盘：${entry.summary || "暂无"}\n可复用观察：\n${insights || "- 暂无"}\n风险点：\n${risks || "- 暂无"}`;
    });
  if (!selected.length) return "";
  return `\n\n## 小组赛复盘记忆\n以下为已收录的球队复盘材料，预测时应作为补充依据；若与实时情报冲突，以实时情报为准。\n\n${selected.join("\n\n")}`;
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
    sendJson(res, 500, {
      error: "预测服务未配置",
      hint: "请在 local-demo/.env.local 或当前终端环境变量中设置 OPENAI_API_KEY、OPENAI_BASE_URL、OPENAI_MODEL。",
    });
    return;
  }

  const [skill, liveContext, memory] = await Promise.all([
    readFile(path.join(repoRoot, "skill.md"), "utf8"),
    buildLiveContext(),
    readTeamMemory(),
  ]);
  const systemPrompt = `${skill}${liveContextForPrompt(liveContext)}${memoryForPrompt(memory, teamA, teamB)}`;
  const selected = providerForRequest(req);
  try {
    const content = await callChat({
      apiBase: selected.provider.apiBase,
      apiKey: selected.provider.apiKey,
      model: selected.provider.model,
      responseFormat: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `请预测这场 2026 世界杯比赛:【${stage}】${teamA} vs ${teamB}。严格按约束文档的 JSON 格式输出。`,
        },
      ],
    });
    const result = JSON.parse(content);
    await savePredictionSnapshot(payload, result);
    sendJson(res, 200, result, selectedProviderHeaders(selected));
  } catch (error) {
    if (selected.provider.name === "fable" && primaryProvider.apiKey) {
      try {
        const content = await callChat({
          apiBase: primaryProvider.apiBase,
          apiKey: primaryProvider.apiKey,
          model: primaryProvider.model,
          responseFormat: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `请预测这场 2026 世界杯比赛:【${stage}】${teamA} vs ${teamB}。严格按约束文档的 JSON 格式输出。`,
            },
          ],
        });
        const result = JSON.parse(content);
        await savePredictionSnapshot(payload, result);
        sendJson(res, 200, result, selectedProviderHeaders(selected));
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
  const response = await fetch(liveNewsUrl, {
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

async function buildLiveContext({ force = false } = {}) {
  const now = Date.now();
  if (!force && liveContextCache && now - liveContextCache.updatedAt < liveRefreshMs) {
    return liveContextCache;
  }
  if (!force && liveContextPromise) return liveContextPromise;

  liveContextPromise = (async () => {
    let items = [];
    let error = "";
    try {
      items = await fetchNewsItems();
    } catch (err) {
      error = err.message;
    }

    const brief = fallbackBrief(items.length ? items : [{ title: "暂无来自实时新闻源的世界杯相关更新", source: "local" }]);
    liveContextCache = {
      ok: !error,
      source: liveNewsUrl,
      updatedAt: Date.now(),
      updatedAtIso: new Date().toISOString(),
      nextRefreshAtIso: new Date(Date.now() + liveRefreshMs).toISOString(),
      itemCount: items.length,
      items,
      brief,
      error,
    };
    broadcastLiveContext(liveContextCache);
    return liveContextCache;
  })();

  try {
    return await liveContextPromise;
  } finally {
    liveContextPromise = null;
  }
}

function liveContextForPrompt(context) {
  if (!context) return "";
  return `\n\n${context.brief}\n\n实时情报来源：${context.source}\n刷新时间：${context.updatedAtIso}\n使用要求：若实时情报与静态资料库冲突，以实时情报为准；不要编造未确认伤停、阵容或比分。`;
}

function publicLiveContext(context) {
  return {
    ok: context.ok,
    source: context.source,
    updatedAtIso: context.updatedAtIso,
    nextRefreshAtIso: context.nextRefreshAtIso,
    itemCount: context.itemCount,
    items: context.items,
    error: context.error,
  };
}

function scoreOutcome(score) {
  const [a, b] = String(score || "")
    .split("-")
    .map((value) => Number.parseInt(value.trim(), 10));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "unknown";
  if (a > b) return "A";
  if (a < b) return "B";
  return "D";
}

const teamNameZh = new Map([
  ["Mexico", "墨西哥"],
  ["South Africa", "南非"],
  ["South Korea", "韩国"],
  ["Czechia", "捷克"],
  ["Canada", "加拿大"],
  ["Bosnia-Herzegovina", "波黑"],
  ["United States", "美国"],
  ["Paraguay", "巴拉圭"],
  ["Qatar", "卡塔尔"],
  ["Switzerland", "瑞士"],
  ["Brazil", "巴西"],
  ["Morocco", "摩洛哥"],
  ["Haiti", "海地"],
  ["Scotland", "苏格兰"],
  ["Australia", "澳大利亚"],
  ["Türkiye", "土耳其"],
  ["Turkey", "土耳其"],
  ["Germany", "德国"],
  ["Curaçao", "库拉索"],
  ["Curacao", "库拉索"],
  ["Netherlands", "荷兰"],
  ["Japan", "日本"],
  ["Ivory Coast", "科特迪瓦"],
  ["Côte d'Ivoire", "科特迪瓦"],
  ["Cote d'Ivoire", "科特迪瓦"],
  ["Ecuador", "厄瓜多尔"],
  ["Sweden", "瑞典"],
  ["Tunisia", "突尼斯"],
  ["Belgium", "比利时"],
  ["Egypt", "埃及"],
  ["Iran", "伊朗"],
  ["New Zealand", "新西兰"],
  ["Spain", "西班牙"],
  ["Cape Verde", "佛得角"],
  ["Cape Verde Islands", "佛得角"],
  ["Saudi Arabia", "沙特"],
  ["Uruguay", "乌拉圭"],
  ["France", "法国"],
  ["Senegal", "塞内加尔"],
  ["Iraq", "伊拉克"],
  ["Norway", "挪威"],
  ["Argentina", "阿根廷"],
  ["Algeria", "阿尔及利亚"],
  ["Austria", "奥地利"],
  ["Jordan", "约旦"],
  ["Portugal", "葡萄牙"],
  ["Congo DR", "刚果金"],
  ["DR Congo", "刚果金"],
  ["Uzbekistan", "乌兹别克斯坦"],
  ["Colombia", "哥伦比亚"],
  ["England", "英格兰"],
  ["Croatia", "克罗地亚"],
  ["Ghana", "加纳"],
  ["Panama", "巴拿马"],
]);

const predictionRecords = new Map([
  ["Mexico|South Africa", { group: "A组", predicted: "2-0" }],
  ["South Korea|Czechia", { group: "A组", predicted: "2-1" }],
  ["Canada|Bosnia-Herzegovina", { group: "B组", predicted: "2-1" }],
  ["United States|Paraguay", { group: "D组", predicted: "2-0" }],
  ["Qatar|Switzerland", { group: "B组", predicted: "0-2" }],
  ["Brazil|Morocco", { group: "C组", predicted: "2-1" }],
  ["Haiti|Scotland", { group: "C组", predicted: "0-2" }],
  ["Australia|Turkey", { group: "D组", predicted: null }],
  ["Germany|Curaçao", { group: "E组", predicted: null }],
  ["Germany|Curacao", { group: "E组", predicted: null }],
  ["Netherlands|Japan", { group: "F组", predicted: null }],
  ["Ivory Coast|Ecuador", { group: "E组", predicted: null }],
  ["Sweden|Tunisia", { group: "F组", predicted: null }],
  ["Belgium|Egypt", { group: "G组", predicted: null }],
  ["Iran|New Zealand", { group: "H组", predicted: null }],
  ["Spain|Cape Verde", { group: "G组", predicted: null }],
  ["Spain|Cape Verde Islands", { group: "G组", predicted: null }],
  ["Saudi Arabia|Uruguay", { group: "H组", predicted: null }],
  ["France|Senegal", { group: "I组", predicted: null }],
  ["Iraq|Norway", { group: "J组", predicted: null }],
  ["Argentina|Algeria", { group: "I组", predicted: null }],
  ["Austria|Jordan", { group: "J组", predicted: null }],
  ["Portugal|Congo DR", { group: "K组", predicted: null }],
  ["Portugal|DR Congo", { group: "K组", predicted: null }],
  ["Uzbekistan|Colombia", { group: "K组", predicted: null }],
  ["England|Croatia", { group: "L组", predicted: null }],
  ["Ghana|Panama", { group: "L组", predicted: null }],
]);

const fallbackRecords = [
  { group: "A组", teamA: "墨西哥", teamB: "南非", predicted: "2-0", actual: "2-0", source: "本地备份" },
  { group: "A组", teamA: "韩国", teamB: "捷克", predicted: "2-1", actual: "2-1", source: "本地备份" },
  { group: "B组", teamA: "加拿大", teamB: "波黑", predicted: "2-1", actual: "1-1", source: "本地备份" },
  { group: "D组", teamA: "美国", teamB: "巴拉圭", predicted: "2-0", actual: "4-1", source: "本地备份" },
  { group: "B组", teamA: "卡塔尔", teamB: "瑞士", predicted: "0-2", actual: "1-1", source: "本地备份" },
  { group: "C组", teamA: "巴西", teamB: "摩洛哥", predicted: "2-1", actual: "1-1", source: "本地备份" },
  { group: "C组", teamA: "海地", teamB: "苏格兰", predicted: "0-2", actual: "0-1", source: "本地备份" },
  { group: "D组", teamA: "澳大利亚", teamB: "土耳其", predicted: null, actual: "2-0", source: "本地备份", note: "未找到赛前预测" },
];

function dateKey(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function dateKeyFromOffset(offsetDays) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return dateKey(date);
}

function scoreboardDates() {
  const dates = [];
  const current = new Date("2026-06-11T00:00:00Z");
  const end = new Date();
  end.setUTCDate(end.getUTCDate() + 1);
  while (current <= end) {
    dates.push(dateKey(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function upcomingScoreboardDates(days = 14) {
  return Array.from({ length: days }, (_, index) => dateKeyFromOffset(index));
}

function beijingDateLabel(value) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const pick = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${Number(pick("month"))}/${Number(pick("day"))} ${pick("hour")}:${pick("minute")}`;
}

function normalizeScoreboardEvent(event, savedPredictions = new Map()) {
  const competition = event.competitions?.[0];
  if (!competition) return null;
  const home = competition.competitors?.find((item) => item.homeAway === "home");
  const away = competition.competitors?.find((item) => item.homeAway === "away");
  if (!home || !away) return null;
  const homeName = home.team?.displayName || "";
  const awayName = away.team?.displayName || "";
  const defaultPrediction = predictionRecords.get(`${homeName}|${awayName}`) || predictionRecords.get(`${awayName}|${homeName}`) || {};
  const isDefaultReversed = predictionRecords.has(`${awayName}|${homeName}`);
  const homeZh = teamNameZh.get(homeName) || homeName;
  const awayZh = teamNameZh.get(awayName) || awayName;
  const savedDirect = savedPredictions.get(predictionKey(homeZh, awayZh));
  const savedReverse = savedPredictions.get(predictionKey(awayZh, homeZh));
  const savedPrediction = savedDirect || savedReverse;
  const isSavedReversed = Boolean(savedReverse);
  const isReversed = savedPrediction ? isSavedReversed : isDefaultReversed;
  const teamA = isReversed ? awayZh : homeZh;
  const teamB = isReversed ? homeZh : awayZh;
  const predicted = savedPrediction
    ? isSavedReversed ? reverseScore(savedPrediction.predicted) : savedPrediction.predicted
    : defaultPrediction.predicted || null;
  const actual = event.status?.type?.completed
    ? isReversed ? `${away.score}-${home.score}` : `${home.score}-${away.score}`
    : "";
  return {
    eventId: event.id,
    group: savedPrediction?.group || defaultPrediction.group || "赛程",
    date: beijingDateLabel(event.date),
    label: `${event.status?.type?.completed ? "已赛" : "小组赛"} · 北京时间`,
    teamA,
    teamB,
    predicted,
    actual,
    status: event.status?.type?.completed ? "FT" : event.status?.type?.state || "",
    source: "ESPN scoreboard",
  };
}

async function fetchCompletedScoreboardRecords(savedPredictions = new Map()) {
  const records = [];
  for (const date of scoreboardDates()) {
    const response = await fetch(`${scoreboardBaseUrl}?dates=${date}`, {
      headers: { "user-agent": "worldcup-local-demo/1.0" },
    });
    if (!response.ok) continue;
    const data = await response.json();
    for (const event of data.events || []) {
      if (!event.status?.type?.completed) continue;
      const normalized = normalizeScoreboardEvent(event, savedPredictions);
      if (!normalized) continue;
      records.push({
        group: normalized.group === "赛程" ? "赛果" : normalized.group,
        teamA: normalized.teamA,
        teamB: normalized.teamB,
        predicted: normalized.predicted,
        actual: normalized.actual,
        source: normalized.source,
        eventId: normalized.eventId,
        note: normalized.predicted ? "" : "未找到赛前预测",
      });
    }
  }
  return records;
}

async function fetchUpcomingSchedule() {
  const savedPredictions = await readSavedPredictions();
  const matches = [];
  const seen = new Set();
  for (const date of upcomingScoreboardDates(14)) {
    const response = await fetch(`${scoreboardBaseUrl}?dates=${date}`, {
      headers: { "user-agent": "worldcup-local-demo/1.0" },
    });
    if (!response.ok) continue;
    const data = await response.json();
    for (const event of data.events || []) {
      const normalized = normalizeScoreboardEvent(event, savedPredictions);
      if (!normalized || normalized.status === "FT") continue;
      if (seen.has(normalized.eventId)) continue;
      seen.add(normalized.eventId);
      matches.push(normalized);
    }
  }
  return matches;
}

async function schedule(req, res) {
  try {
    const matches = await withTimeout(fetchUpcomingSchedule(), 10_000, "Schedule source timeout");
    sendJson(res, 200, {
      updatedAtIso: new Date().toISOString(),
      source: "ESPN scoreboard",
      matches,
    });
  } catch (error) {
    sendJson(res, 200, {
      updatedAtIso: new Date().toISOString(),
      source: "local fallback",
      sourceError: error.message,
      matches: [],
    });
  }
}

function applySavedPrediction(record, savedPredictions) {
  const direct = savedPredictions.get(predictionKey(record.teamA, record.teamB));
  const reverse = savedPredictions.get(predictionKey(record.teamB, record.teamA));
  if (direct) {
    return {
      ...record,
      predicted: direct.predicted,
      group: direct.group || record.group,
      note: "",
    };
  }
  if (reverse) {
    return {
      ...record,
      predicted: reverseScore(reverse.predicted),
      group: reverse.group || record.group,
      note: "",
    };
  }
  return record;
}

function mergeCompletedRecords(primaryRecords, localRecords, savedPredictions = new Map()) {
  const merged = new Map();
  for (const record of localRecords) {
    const withPrediction = applySavedPrediction(record, savedPredictions);
    merged.set(unorderedMatchKey(withPrediction.teamA, withPrediction.teamB), withPrediction);
  }
  for (const record of primaryRecords) {
    const withPrediction = applySavedPrediction(record, savedPredictions);
    merged.set(unorderedMatchKey(withPrediction.teamA, withPrediction.teamB), withPrediction);
  }
  return [...merged.values()];
}

function summarizeRecords(records, sourceError = "") {
  const normalized = records.map((item) => ({
    ...item,
    outcomeHit: item.predicted ? scoreOutcome(item.predicted) === scoreOutcome(item.actual) : null,
    scoreHit: item.predicted ? item.predicted === item.actual : null,
  }));

  const scored = normalized.filter((item) => item.outcomeHit !== null && item.scoreHit !== null);
  const total = scored.length;
  const outcomeHits = scored.filter((item) => item.outcomeHit).length;
  const scoreHits = scored.filter((item) => item.scoreHit).length;
  return {
    updatedAtIso: new Date().toISOString(),
    nextRefreshAtIso: new Date(Date.now() + recordsRefreshMs).toISOString(),
    total,
    recordCount: normalized.length,
    outcomeHits,
    scoreHits,
    sourceError,
    records: normalized,
  };
}

async function buildRecords() {
  let savedPredictions = new Map();
  try {
    savedPredictions = await readSavedPredictions();
    const records = await fetchCompletedScoreboardRecords(savedPredictions);
    return summarizeRecords(mergeCompletedRecords(records, fallbackRecords, savedPredictions));
  } catch (error) {
    return summarizeRecords(mergeCompletedRecords([], fallbackRecords, savedPredictions), error.message);
  }
}

async function records(req, res) {
  sendJson(res, 200, await buildRecords());
}

function teamArticles(team, items) {
  const lower = team.toLowerCase();
  const english = [...teamNameZh.entries()].find(([, zh]) => zh === team)?.[0]?.toLowerCase() || "";
  return items
    .filter((item) => {
      const title = item.title.toLowerCase();
      return title.includes(lower) || (english && title.includes(english));
    })
    .slice(0, 8);
}

function fallbackTeamReview(team, matches, articles) {
  const matchText = matches.map((item) => `${item.teamA} ${item.actual} ${item.teamB}`).join("；") || "暂无已完赛记录";
  const articleText = articles.map((item) => item.title).slice(0, 3).join("；") || "暂无相关新闻标题";
  return {
    team,
    summary: `${team}小组赛复盘基于已完赛结果：${matchText}。相关新闻线索：${articleText}。`,
    insights: matches.length
      ? matches.map((item) => `${item.teamA} vs ${item.teamB} 的实际比分为 ${item.actual}，后续预测应参考这场暴露出的攻防状态。`)
      : ["暂无已完赛样本，暂不形成强判断。"],
    risks: ["样本仍少，避免用单场表现过度外推。"],
    sources: articles.map((item) => ({ title: item.title, link: item.link, source: item.source })),
  };
}

async function buildTeamReview(team, matches, articles) {
  if (!primaryProvider.apiKey) return fallbackTeamReview(team, matches, articles);
  const matchText = matches.map((item) => `${item.group} ${item.teamA} vs ${item.teamB} actual=${item.actual} predicted=${item.predicted || "未记录"}`).join("\n");
  const newsText = articles.map((item, index) => `${index + 1}. ${item.title} | ${item.source} | ${item.pubDate}`).join("\n");
  try {
    const content = await withTimeout(
      callChat({
        apiBase: primaryProvider.apiBase,
        apiKey: primaryProvider.apiKey,
        model: primaryProvider.model,
        responseFormat: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "你是世界杯小组赛复盘分析员。只根据给定赛果和新闻标题做结构化总结，不编造伤停、战术或内部消息。输出严格 JSON：team, summary, insights(string[]), risks(string[]), sources(object[])。",
          },
          {
            role: "user",
            content: `球队：${team}\n\n已完赛样本：\n${matchText || "暂无"}\n\n相关新闻标题：\n${newsText || "暂无"}\n\n请生成可供后续预测复用的小组赛复盘记忆。`,
          },
        ],
      }),
      12_000,
      "Review model timeout",
    );
    const parsed = JSON.parse(content);
    return {
      team,
      summary: parsed.summary || "",
      insights: Array.isArray(parsed.insights) ? parsed.insights.slice(0, 8) : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 6) : [],
      sources: articles.map((item) => ({ title: item.title, link: item.link, source: item.source })),
    };
  } catch {
    return fallbackTeamReview(team, matches, articles);
  }
}

async function memory(req, res) {
  sendJson(res, 200, await readTeamMemory());
}

async function refreshMemory(req, res) {
  const payload = await readJson(req);
  const recordsData = await buildRecords();
  let reviewItems = [];
  try {
    reviewItems = await withTimeout(fetchReviewItems(), 8_000, "Review sources timeout");
  } catch {
    reviewItems = [];
  }
  const teams = (payload.team
    ? [payload.team]
    : [...new Set(recordsData.records.flatMap((item) => [item.teamA, item.teamB]))]).slice(0, 4);
  const memory = await readTeamMemory();
  memory.teams ||= {};
  memory.updatedAtIso = new Date().toISOString();
  memory.sources = reviewSourceUrls;
  memory.lastBatch = { teams, limit: 4, updatedAtIso: memory.updatedAtIso };

  for (const team of teams) {
    const matches = recordsData.records.filter((item) => item.teamA === team || item.teamB === team);
    const articles = teamArticles(team, reviewItems);
    try {
      const review = await buildTeamReview(team, matches, articles);
      memory.teams[team] = {
        ...review,
        matchCount: matches.length,
        sourceCount: articles.length,
        updatedAtIso: new Date().toISOString(),
      };
    } catch {
      memory.teams[team] = {
        ...fallbackTeamReview(team, matches, articles),
        matchCount: matches.length,
        sourceCount: articles.length,
        updatedAtIso: new Date().toISOString(),
      };
    }
  }

  await writeTeamMemory(memory);
  sendJson(res, 200, memory);
}

function broadcastLiveContext(context) {
  const payload = `event: live-context\ndata: ${JSON.stringify(publicLiveContext(context))}\n\n`;
  for (const res of liveClients) res.write(payload);
}

async function liveContext(req, res, { force = false } = {}) {
  const context = await buildLiveContext({ force });
  sendJson(res, 200, publicLiveContext(context));
}

async function liveEvents(req, res) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    connection: "keep-alive",
  });
  liveClients.add(res);
  const context = await buildLiveContext();
  res.write(`event: live-context\ndata: ${JSON.stringify(publicLiveContext(context))}\n\n`);
  req.on("close", () => liveClients.delete(res));
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

setInterval(() => {
  buildLiveContext({ force: true }).catch((error) => {
    console.warn(`Live context refresh failed: ${error.message}`);
  });
}, liveRefreshMs).unref();

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
    const route = new URL(req.url, `http://${req.headers.host}`).pathname;
    if (req.method === "GET" && route === "/api/config") {
      sendJson(res, 200, publicConfig());
      return;
    }
    if (req.method === "GET" && route === "/api/live") {
      await liveContext(req, res);
      return;
    }
    if (req.method === "POST" && route === "/api/live/refresh") {
      await liveContext(req, res, { force: true });
      return;
    }
    if (req.method === "GET" && route === "/api/live/events") {
      await liveEvents(req, res);
      return;
    }
    if (req.method === "GET" && route === "/api/records") {
      await records(req, res);
      return;
    }
    if (req.method === "GET" && route === "/api/schedule") {
      await schedule(req, res);
      return;
    }
    if (req.method === "GET" && route === "/api/memory") {
      await memory(req, res);
      return;
    }
    if (req.method === "POST" && route === "/api/memory/refresh") {
      await refreshMemory(req, res);
      return;
    }
    if (req.method === "POST" && route === "/api/models") {
      await listModels(req, res);
      return;
    }
    if (req.method === "POST" && route === "/api/predict") {
      await predict(req, res);
      return;
    }
    if (req.method === "POST" && route === "/api/brief/preview") {
      await previewBrief(req, res);
      return;
    }
    if (req.method === "POST" && route === "/api/brief/write") {
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
