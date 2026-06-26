import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { filterUpcomingMatches, selectScheduleMatches } from "./live-data-cache.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const predictionsPath = path.join(dataDir, "predictions.json");
const userPredictionsPath = path.join(dataDir, "user-predictions.json");
const memoryPath = path.join(dataDir, "team-memory.json");
const usersPath = path.join(dataDir, "users.json");
const ordersPath = path.join(dataDir, "orders.json");
const redeemCodesPath = path.join(dataDir, "redeem-codes.json");
const scheduleCachePath = path.join(dataDir, "schedule-cache.json");
const recordsCachePath = path.join(dataDir, "records-cache.json");
const paymentProofsDir = path.join(dataDir, "payment-proofs");

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
const openAiBaseFromEnv = normalizeOpenAIBaseUrl(process.env.OPENAI_BASE_URL || "");
const openAiLooksLikeDeepSeek = /deepseek/i.test(openAiBaseFromEnv);
const gptModel = process.env.GPT_OPENAI_MODEL || (!openAiLooksLikeDeepSeek ? process.env.OPENAI_MODEL : "") || "gpt-5.5";
const primaryProvider = {
  name: "primary",
  apiBase: normalizeOpenAIBaseUrl(process.env.PRIMARY_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.deepseek.com/v1"),
  apiKey: process.env.PRIMARY_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "",
  model: process.env.PRIMARY_OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-5.5",
};
const gptProvider = {
  id: "gpt",
  name: "gpt",
  label: "GPT",
  apiBase: normalizeOpenAIBaseUrl(process.env.GPT_OPENAI_BASE_URL || (!openAiLooksLikeDeepSeek && openAiBaseFromEnv) || "https://api.openai.com/v1"),
  apiKey: process.env.GPT_OPENAI_API_KEY || (!openAiLooksLikeDeepSeek ? process.env.OPENAI_API_KEY : "") || "",
  model: gptModel,
  apiType: process.env.GPT_OPENAI_API_TYPE || (/^gpt-5/i.test(gptModel) ? "responses" : "chat"),
};
const deepSeekProvider = {
  id: "deepseek",
  name: "deepseek",
  label: "DeepSeek",
  apiBase: normalizeOpenAIBaseUrl(process.env.DEEPSEEK_OPENAI_BASE_URL || (openAiLooksLikeDeepSeek && openAiBaseFromEnv) || "https://api.deepseek.com/v1"),
  apiKey: process.env.DEEPSEEK_OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY || (openAiLooksLikeDeepSeek ? process.env.OPENAI_API_KEY : "") || "",
  model: process.env.DEEPSEEK_OPENAI_MODEL || (openAiLooksLikeDeepSeek ? process.env.OPENAI_MODEL : "") || "deepseek-chat",
  apiType: process.env.DEEPSEEK_OPENAI_API_TYPE || "chat",
};
const fableProvider = {
  name: "fable",
  apiBase: normalizeOpenAIBaseUrl(process.env.FABLE_OPENAI_BASE_URL || ""),
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
const membershipPlans = {
  trial3: { id: "trial3", name: "新用户免费", price: 0, credits: 3 },
  starter: { id: "starter", name: "体验包", price: 9.9, credits: 10 },
  group: { id: "group", name: "小组赛包", price: 29.9, credits: 40 },
  pro: { id: "pro", name: "进阶包", price: 68, credits: 120 },
  full: { id: "full", name: "全程包", price: 128, credits: 260 },
  deluxe: { id: "deluxe", name: "豪华包", price: 198, credits: 500 },
};
const paymentConfig = {
  wechatQrUrl: process.env.WECHAT_PAY_QR_URL || "/assets/payment/wechat-pay.jpg",
  alipayQrUrl: process.env.ALIPAY_PAY_QR_URL || "/assets/payment/alipay.jpg",
  payeeName: process.env.PAYMENT_PAYEE_NAME || "",
};
const supportContact = process.env.ADMIN_CONTACT || "请联系网站管理员";
const registrationLimits = {
  perDevice: Math.max(1, Number(process.env.MAX_REGISTRATIONS_PER_DEVICE || 1)),
  perIp: Math.max(1, Number(process.env.MAX_REGISTRATIONS_PER_IP || 5)),
  ipWindowDays: Math.max(1, Number(process.env.REGISTRATION_IP_WINDOW_DAYS || 30)),
};
let liveContextCache = null;
let liveContextPromise = null;
const liveClients = new Set();

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 6 * 1024 * 1024) {
      const error = new Error("Request body too large");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
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
    providers: [gptProvider, deepSeekProvider].map(providerPublicInfo),
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
  const headerToken = String(req.headers["x-admin-token"] || "");
  const hasHeaderToken = headerToken && safeTextEqual(headerToken, adminToken);
  if (!hasHeaderToken && !hasValidAdminSession(req)) {
    sendJson(res, 401, { error: "Unauthorized" });
    return false;
  }
  return true;
}

function normalizeOpenAIBaseUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  if (/^https:\/\/api\.(openai|deepseek)\.com$/i.test(raw)) return `${raw}/v1`;
  return raw;
}

function providerConnectionError(error, apiBase) {
  const wrapped = new Error("Model connection failed");
  const openAiHint = /api\.openai\.com/i.test(apiBase)
    ? "。服务器当前无法直连 OpenAI，请把 GPT_OPENAI_BASE_URL 配置为服务器可访问的 OpenAI 兼容转发地址"
    : "";
  wrapped.detail = `无法连接模型接口 ${apiBase}：${error?.message || "网络请求失败"}${openAiHint}`;
  return wrapped;
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
    try {
      upstream = await fetch(`${apiBase}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw providerConnectionError(error, apiBase);
    }
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

function responsesText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const chunks = [];
  for (const output of data?.output || []) {
    for (const content of output.content || []) {
      if (typeof content.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n");
}

async function callResponses({ apiBase, apiKey, model, messages, responseFormat }) {
  const body = {
    model,
    input: messages,
  };
  if (responseFormat) body.text = { format: responseFormat };

  let upstream;
  let raw = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      upstream = await fetch(`${apiBase}/responses`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw providerConnectionError(error, apiBase);
    }
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
  return responsesText(JSON.parse(raw));
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

function safeTextEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

function adminSessionSignature(expiresAt) {
  return createHmac("sha256", adminToken).update(`admin:${expiresAt}`).digest("hex");
}

function adminSessionCookie() {
  const expiresAt = Date.now() + 7 * 86400_000;
  const value = `${expiresAt}.${adminSessionSignature(expiresAt)}`;
  return `wc_admin_session=${encodeURIComponent(value)}; Max-Age=604800; Path=/; HttpOnly; SameSite=Strict`;
}

function clearAdminSessionCookie() {
  return "wc_admin_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict";
}

function hasValidAdminSession(req) {
  if (!adminToken) return false;
  const value = parseCookies(req).wc_admin_session || "";
  const [expiresText, signature] = value.split(".");
  const expiresAt = Number(expiresText);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() || !signature) return false;
  return safeTextEqual(signature, adminSessionSignature(expiresAt));
}

function fableUses(req) {
  const value = Number.parseInt(parseCookies(req).wc_fable_used || "0", 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function providerForRequest() {
  return { provider: primaryProvider, used: 0, shouldIncrementFable: false };
}

function providerPublicInfo(provider) {
  return {
    id: provider.id || provider.name,
    label: provider.label || provider.name,
    model: provider.model,
    configured: Boolean(provider.apiKey),
  };
}

function configuredPredictionProviders() {
  const providers = [gptProvider, deepSeekProvider].filter((provider) => provider.apiKey && provider.apiBase && provider.model);
  if (providers.length) return providers;
  return primaryProvider.apiKey ? [{ ...primaryProvider, id: "primary", label: "当前模型" }] : [];
}

function predictionUserMessage({ stage, teamA, teamB }) {
  return `请预测这场 2026 世界杯比赛「${stage}」：${teamA} vs ${teamB}。严格按约束文档的 JSON 格式输出。`;
}

async function callPredictionProvider(provider, systemPrompt, payload) {
  const callModel = provider.apiType === "responses" ? callResponses : callChat;
  const content = await callModel({
    apiBase: provider.apiBase,
    apiKey: provider.apiKey,
    model: provider.model,
    responseFormat: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: predictionUserMessage(payload) },
    ],
  });
  return JSON.parse(content);
}

function modelResultPayload(provider, result) {
  return {
    ok: true,
    provider: provider.id || provider.name,
    providerLabel: provider.label || provider.name,
    model: provider.model,
    result,
  };
}

function fableCookieHeaders(nextUsed) {
  return {
    "set-cookie": `wc_fable_used=${encodeURIComponent(String(nextUsed))}; Max-Age=2592000; Path=/; SameSite=Lax`,
  };
}

function selectedProviderHeaders(selected) {
  return selected.shouldIncrementFable ? fableCookieHeaders(selected.used + 1) : {};
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse((await readFile(filePath, "utf8")).replace(/^\uFEFF/, ""));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonFile(filePath, value) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readUsers() {
  const data = await readJsonFile(usersPath, { users: [], sessions: [] });
  data.users ||= [];
  data.sessions ||= [];
  return data;
}

async function writeUsers(data) {
  await writeJsonFile(usersPath, data);
}

async function readOrders() {
  return await readJsonFile(ordersPath, []);
}

async function writeOrders(orders) {
  await writeJsonFile(ordersPath, orders);
}

async function readUserPredictions() {
  const data = await readJsonFile(userPredictionsPath, []);
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return [data];
  return [];
}

async function writeUserPredictions(items) {
  await writeJsonFile(userPredictionsPath, items);
}

async function readRedeemCodes() {
  return await readJsonFile(redeemCodesPath, []);
}

async function writeRedeemCodes(codes) {
  await writeJsonFile(redeemCodesPath, codes);
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function isValidPhone(phone) {
  return /^1\d{10}$/.test(phone);
}

function passwordHash(password, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(String(password), salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const next = Buffer.from(passwordHash(password, salt).split(":")[1], "hex");
  const current = Buffer.from(hash, "hex");
  return current.length === next.length && timingSafeEqual(current, next);
}

function publicUser(user) {
  const credits = Number(user.predictionCredits ?? user.freePredictionsLeft ?? 0);
  return {
    id: user.id,
    phone: user.phone,
    predictionCredits: Math.max(0, credits),
    freePredictionsLeft: Math.max(0, credits),
    isMember: credits > 0,
    planName: user.planName || "",
    createdAtIso: user.createdAtIso,
  };
}

function publicPaymentConfig() {
  return {
    wechatQrUrl: paymentConfig.wechatQrUrl,
    alipayQrUrl: paymentConfig.alipayQrUrl,
    payeeName: paymentConfig.payeeName,
  };
}

function normalizeRedeemCode(code) {
  return String(code || "").trim().toUpperCase().replace(/\s+/g, "");
}

function makeRedeemCode() {
  return `WC26-${randomBytes(3).toString("hex").toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function publicRedeemCode(code) {
  return {
    id: code.id,
    code: code.code,
    planId: code.planId,
    planName: code.planName,
    amount: code.amount,
    credits: code.credits,
    status: code.status,
    note: code.note || "",
    createdAtIso: code.createdAtIso,
    usedAtIso: code.usedAtIso || "",
    usedByPhone: code.usedByPhone || "",
  };
}

function parseProofDataUrl(value) {
  const match = String(value || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return null;
  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (!buffer.length || buffer.length > 3 * 1024 * 1024) return null;
  const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  return { buffer, contentType: match[1], extension: extensions[match[1]] };
}

async function savePaymentProof(orderId, dataUrl) {
  const proof = parseProofDataUrl(dataUrl);
  if (!proof) return null;
  await mkdir(paymentProofsDir, { recursive: true });
  const fileName = `${orderId}.${proof.extension}`;
  await writeFile(path.join(paymentProofsDir, fileName), proof.buffer);
  return { fileName, contentType: proof.contentType };
}

function publicOrder(order) {
  return {
    id: order.id,
    orderNo: order.orderNo,
    userId: order.userId,
    phone: order.phone,
    planId: order.planId,
    planName: order.planName,
    amount: order.amount,
    credits: order.credits,
    status: order.status,
    paymentMethod: order.paymentMethod || "",
    payerName: order.payerName || "",
    payNote: order.payNote || "",
    hasProof: Boolean(order.proofFileName),
    createdAtIso: order.createdAtIso,
    approvedAtIso: order.approvedAtIso || "",
    rejectedAtIso: order.rejectedAtIso || "",
    rejectReason: order.rejectReason || "",
  };
}

function sessionCookie(token) {
  return `wc_session=${encodeURIComponent(token)}; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax`;
}

function clearSessionCookie() {
  return "wc_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax";
}

function deviceCookie(deviceId) {
  return `wc_device=${encodeURIComponent(deviceId)}; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax`;
}

function registrationHash(type, value) {
  return createHmac("sha256", adminToken || primaryProvider.apiKey || "worldcup2026-registration")
    .update(`${type}:${value}`)
    .digest("hex");
}

function registrationDevice(req) {
  const stored = String(parseCookies(req).wc_device || "");
  const deviceId = /^[0-9a-f-]{36}$/i.test(stored) ? stored : randomUUID();
  return { deviceId, hash: registrationHash("device", deviceId) };
}

function clientIp(req) {
  const realIp = String(req.headers["x-real-ip"] || "").trim();
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .at(-1);
  return realIp || forwarded || req.socket.remoteAddress || "unknown";
}

async function currentUser(req) {
  const token = parseCookies(req).wc_session;
  if (!token) return null;
  const data = await readUsers();
  const session = data.sessions.find((item) => item.token === token && new Date(item.expiresAtIso) > new Date());
  if (!session) return null;
  return data.users.find((user) => user.id === session.userId) || null;
}

async function requireUser(req, res) {
  const user = await currentUser(req);
  if (!user) {
    sendJson(res, 401, { error: "请先登录后再预测", code: "LOGIN_REQUIRED" });
    return null;
  }
  return user;
}

function hasPredictQuota(user) {
  return Number(user.predictionCredits ?? user.freePredictionsLeft ?? 0) > 0;
}

async function consumePredictionQuota(userId) {
  const data = await readUsers();
  const user = data.users.find((item) => item.id === userId);
  if (!user) return null;
  user.predictionCredits = Math.max(0, Number(user.predictionCredits ?? user.freePredictionsLeft ?? 0) - 1);
  user.freePredictionsLeft = user.predictionCredits;
  await writeUsers(data);
  return user;
}

function predictionKey(teamA, teamB) {
  return `${teamA}|${teamB}`;
}

function providerPredictionKey(provider, teamA, teamB) {
  return `${provider || "primary"}|${teamA}|${teamB}`;
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
    return new Map((Array.isArray(data) ? data : []).map((item) => [
      item.key || (item.provider ? providerPredictionKey(item.provider, item.teamA, item.teamB) : predictionKey(item.teamA, item.teamB)),
      item,
    ]));
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

async function savePredictionSnapshot(payload, result, provider = {}) {
  if (!result?.predictedScore || !payload.teamA || !payload.teamB) return;
  const saved = await readSavedPredictions();
  const key = provider.id
    ? providerPredictionKey(provider.id, payload.teamA, payload.teamB)
    : predictionKey(payload.teamA, payload.teamB);
  saved.set(key, {
    key,
    provider: provider.id || "",
    providerLabel: provider.label || "",
    model: provider.model || "",
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

async function saveUserPrediction(user, payload, result) {
  if (!user?.id || !result?.predictedScore || !payload.teamA || !payload.teamB) return;
  const items = await readUserPredictions();
  const item = {
    id: randomUUID(),
    userId: user.id,
    phone: user.phone,
    teamA: payload.teamA,
    teamB: payload.teamB,
    group: payload.group || "",
    date: payload.date || "",
    stage: payload.stage || "小组赛",
    predicted: result.predictedScore,
    confidence: result.confidence || "",
    creditsUsed: 1,
    createdAtIso: new Date().toISOString(),
  };
  items.unshift(item);
  await writeUserPredictions(items.slice(0, 5000));
}

function publicUserPrediction(item) {
  return {
    id: item.id,
    teamA: item.teamA,
    teamB: item.teamB,
    group: item.group || "",
    date: item.date || "",
    stage: item.stage || "",
    predicted: item.predicted,
    confidence: item.confidence || "",
    creditsUsed: Number(item.creditsUsed || 1),
    createdAtIso: item.createdAtIso,
  };
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
  return `\n\n## 小组赛复盘记忆\n以下为已收录的球队复盘材料。生成比分预测时必须纳入同队近期复盘，重点参考攻防暴露点、风险点、连续性表现和样本数量；若与实时情报冲突，以实时情报为准。\n\n${selected.join("\n\n")}`;
}

async function listModels(req, res) {
  if (!requireAdmin(req, res)) return;
  const provider = configuredPredictionProviders()[0] || primaryProvider;
  if (!provider.apiKey) {
    sendJson(res, 400, { error: "Missing API key" });
    return;
  }

  const upstream = await fetch(`${provider.apiBase}/models`, {
    headers: { authorization: `Bearer ${provider.apiKey}` },
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

async function authMe(req, res) {
  const user = await currentUser(req);
  sendJson(res, 200, {
    user: user ? publicUser(user) : null,
    plans: Object.values(membershipPlans).filter((plan) => plan.price > 0),
    payment: publicPaymentConfig(),
    supportContact,
  });
}

async function register(req, res) {
  const payload = await readJson(req);
  const phone = normalizePhone(payload.phone);
  const password = String(payload.password || "");
  if (!isValidPhone(phone)) {
    sendJson(res, 422, { error: "请输入 11 位手机号" });
    return;
  }
  if (password.length < 6) {
    sendJson(res, 422, { error: "密码至少 6 位" });
    return;
  }
  const data = await readUsers();
  if (data.users.some((user) => user.phone === phone)) {
    sendJson(res, 409, { error: "这个手机号已经注册" });
    return;
  }
  const device = registrationDevice(req);
  const ipHash = registrationHash("ip", clientIp(req));
  const deviceRegistrations = data.users.filter((user) => user.registrationDeviceHash === device.hash).length;
  if (deviceRegistrations >= registrationLimits.perDevice) {
    sendJson(
      res,
      403,
      {
        error: `这台设备已经注册过账号，请直接登录已有账号或${supportContact}`,
        code: "DEVICE_REGISTRATION_LIMIT",
      },
      { "set-cookie": deviceCookie(device.deviceId) },
    );
    return;
  }
  const windowStart = Date.now() - registrationLimits.ipWindowDays * 86400_000;
  const ipRegistrations = data.users.filter(
    (user) => user.registrationIpHash === ipHash && new Date(user.createdAtIso || 0).getTime() >= windowStart,
  ).length;
  if (ipRegistrations >= registrationLimits.perIp) {
    sendJson(
      res,
      429,
      {
        error: `当前网络注册账号过多，请稍后再试或${supportContact}`,
        code: "IP_REGISTRATION_LIMIT",
      },
      { "set-cookie": deviceCookie(device.deviceId) },
    );
    return;
  }
  const user = {
    id: randomUUID(),
    phone,
    passwordHash: passwordHash(password),
    predictionCredits: membershipPlans.trial3.credits,
    freePredictionsLeft: membershipPlans.trial3.credits,
    planName: "新用户免费",
    createdAtIso: new Date().toISOString(),
    registrationDeviceHash: device.hash,
    registrationIpHash: ipHash,
  };
  const token = randomUUID();
  data.users.push(user);
  data.sessions.push({ token, userId: user.id, createdAtIso: new Date().toISOString(), expiresAtIso: new Date(Date.now() + 30 * 86400_000).toISOString() });
  await writeUsers(data);
  sendJson(res, 200, { user: publicUser(user) }, { "set-cookie": [sessionCookie(token), deviceCookie(device.deviceId)] });
}

async function login(req, res) {
  const payload = await readJson(req);
  const phone = normalizePhone(payload.phone);
  if (!isValidPhone(phone)) {
    sendJson(res, 422, { error: "请输入 11 位手机号" });
    return;
  }
  const data = await readUsers();
  const user = data.users.find((item) => item.phone === phone);
  if (!user || !verifyPassword(payload.password, user.passwordHash)) {
    sendJson(res, 401, { error: "手机号或密码错误" });
    return;
  }
  const token = randomUUID();
  data.sessions.push({ token, userId: user.id, createdAtIso: new Date().toISOString(), expiresAtIso: new Date(Date.now() + 30 * 86400_000).toISOString() });
  data.sessions = data.sessions.filter((item) => new Date(item.expiresAtIso) > new Date()).slice(-5000);
  await writeUsers(data);
  sendJson(res, 200, { user: publicUser(user) }, { "set-cookie": sessionCookie(token) });
}

async function logout(req, res) {
  const token = parseCookies(req).wc_session;
  const data = await readUsers();
  data.sessions = data.sessions.filter((item) => item.token !== token);
  await writeUsers(data);
  sendJson(res, 200, { ok: true }, { "set-cookie": clearSessionCookie() });
}

async function createOrder(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  const payload = await readJson(req);
  const plan = membershipPlans[payload.planId];
  if (!plan || !plan.price) {
    sendJson(res, 422, { error: "请选择有效套餐" });
    return;
  }
  const paymentMethod = String(payload.paymentMethod || "");
  const payerName = String(payload.payerName || "").trim().slice(0, 60);
  if (!["wechat", "alipay"].includes(paymentMethod)) {
    sendJson(res, 422, { error: "请选择付款方式" });
    return;
  }
  const proofDataUrl = String(payload.proofDataUrl || "");
  if (proofDataUrl && !parseProofDataUrl(proofDataUrl)) {
    sendJson(res, 422, { error: "付款截图需为不超过 3MB 的 JPG、PNG 或 WebP 图片" });
    return;
  }
  const orders = await readOrders();
  const pendingOrder = orders.find((order) => order.userId === user.id && order.planId === plan.id && order.status === "pending");
  if (pendingOrder) {
    sendJson(res, 409, { error: `已有待审核订单 ${pendingOrder.orderNo}，请勿重复提交`, order: publicOrder(pendingOrder) });
    return;
  }
  const order = {
    id: randomUUID(),
    orderNo: `WC${Date.now()}${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`,
    userId: user.id,
    phone: user.phone,
    planId: plan.id,
    planName: plan.name,
    amount: plan.price,
    credits: plan.credits,
    status: "pending",
    paymentMethod,
    payerName,
    payNote: String(payload.payNote || "").slice(0, 200),
    createdAtIso: new Date().toISOString(),
    approvedAtIso: "",
    rejectedAtIso: "",
    rejectReason: "",
  };
  if (proofDataUrl) {
    const savedProof = await savePaymentProof(order.id, proofDataUrl);
    order.proofFileName = savedProof.fileName;
    order.proofContentType = savedProof.contentType;
  }
  orders.unshift(order);
  await writeOrders(orders);
  sendJson(res, 200, { order: publicOrder(order) });
}

async function myOrders(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  const orders = await readOrders();
  sendJson(res, 200, { orders: orders.filter((order) => order.userId === user.id).slice(0, 20).map(publicOrder) });
}

async function myPredictions(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  const items = await readUserPredictions();
  const own = items.filter((item) => item.userId === user.id);
  const totalCreditsUsed = own.reduce((sum, item) => sum + Number(item.creditsUsed || 1), 0);
  sendJson(res, 200, {
    total: own.length,
    totalCreditsUsed,
    predictions: own.slice(0, 60).map(publicUserPrediction),
  });
}

async function adminOrders(req, res) {
  if (!requireAdmin(req, res)) return;
  const orders = await readOrders();
  sendJson(res, 200, { orders: orders.slice(0, 100).map(publicOrder) });
}

async function adminLogin(req, res) {
  if (!adminToken) {
    sendJson(res, 404, { error: "Admin API is disabled" });
    return;
  }
  const payload = await readJson(req);
  if (!safeTextEqual(payload.token, adminToken)) {
    sendJson(res, 401, { error: "管理员密钥错误" });
    return;
  }
  sendJson(res, 200, { ok: true }, { "set-cookie": adminSessionCookie() });
}

async function adminLogout(req, res) {
  sendJson(res, 200, { ok: true }, { "set-cookie": clearAdminSessionCookie() });
}

async function adminOverview(req, res) {
  if (!requireAdmin(req, res)) return;
  const [{ users }, orders, codes, userPredictions] = await Promise.all([readUsers(), readOrders(), readRedeemCodes(), readUserPredictions()]);
  const approvedOrders = orders.filter((order) => order.status === "approved");
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayOrders = approvedOrders.filter((order) => String(order.approvedAtIso || order.createdAtIso || "").startsWith(todayKey));
  const todayPredictions = userPredictions.filter((item) => String(item.createdAtIso || "").startsWith(todayKey));
  const totalRevenue = approvedOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
  const todayRevenue = todayOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
  const totalCredits = users.reduce((sum, user) => sum + Number(user.predictionCredits ?? user.freePredictionsLeft ?? 0), 0);
  const paidUserIds = new Set(approvedOrders.map((order) => order.userId).filter(Boolean));
  const todayPredictionUsers = new Set(todayPredictions.map((item) => item.userId).filter(Boolean));
  const planSales = approvedOrders.reduce((map, order) => {
    const key = order.planName || order.planId || "未知套餐";
    const current = map.get(key) || { planName: key, count: 0, revenue: 0 };
    current.count += 1;
    current.revenue += Number(order.amount || 0);
    map.set(key, current);
    return map;
  }, new Map());
  const topPlans = [...planSales.values()]
    .sort((a, b) => b.count - a.count || b.revenue - a.revenue)
    .slice(0, 5)
    .map((item) => ({ ...item, revenue: Number(item.revenue.toFixed(2)) }));
  const activeUsers = users
    .slice()
    .sort((a, b) => (b.createdAtIso || "").localeCompare(a.createdAtIso || ""))
    .slice(0, 80)
    .map((user) => ({
      id: user.id,
      phone: user.phone,
      credits: Number(user.predictionCredits ?? user.freePredictionsLeft ?? 0),
      planName: user.planName || "",
      createdAtIso: user.createdAtIso,
    }));
  sendJson(res, 200, {
    plans: Object.values(membershipPlans).filter((plan) => plan.price > 0),
    payment: publicPaymentConfig(),
    stats: {
      users: users.length,
      totalCredits,
      approvedOrders: approvedOrders.length,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      todayOrders: todayOrders.length,
      todayRevenue: Number(todayRevenue.toFixed(2)),
      predictionTotal: userPredictions.length,
      predictionCreditsUsed: userPredictions.reduce((sum, item) => sum + Number(item.creditsUsed || 1), 0),
      todayPredictions: todayPredictions.length,
      todayPredictionUsers: todayPredictionUsers.size,
      paidUsers: paidUserIds.size,
      conversionRate: users.length ? Math.round((paidUserIds.size / users.length) * 100) : 0,
      unusedCodes: codes.filter((code) => code.status !== "used").length,
      usedCodes: codes.filter((code) => code.status === "used").length,
    },
    users: activeUsers,
    topPlans,
  });
}

async function approveOrder(req, res) {
  if (!requireAdmin(req, res)) return;
  const payload = await readJson(req);
  const orders = await readOrders();
  const order = orders.find((item) => item.id === payload.orderId || item.orderNo === payload.orderNo);
  if (!order) {
    sendJson(res, 404, { error: "订单不存在" });
    return;
  }
  if (order.status === "approved") {
    sendJson(res, 409, { error: "订单已经到账，不能重复确认" });
    return;
  }
  if (order.status === "rejected") {
    sendJson(res, 409, { error: "订单已驳回，不能直接确认" });
    return;
  }
  const plan = membershipPlans[order.planId];
  const data = await readUsers();
  const user = data.users.find((item) => item.id === order.userId);
  if (!user || !plan) {
    sendJson(res, 404, { error: "用户或套餐不存在" });
    return;
  }
  user.predictionCredits = Number(user.predictionCredits ?? user.freePredictionsLeft ?? 0) + plan.credits;
  user.freePredictionsLeft = user.predictionCredits;
  user.planName = plan.name;
  order.status = "approved";
  order.approvedAtIso = new Date().toISOString();
  await writeUsers(data);
  await writeOrders(orders);
  sendJson(res, 200, { order: publicOrder(order), user: publicUser(user) });
}

async function rejectOrder(req, res) {
  if (!requireAdmin(req, res)) return;
  const payload = await readJson(req);
  const orders = await readOrders();
  const order = orders.find((item) => item.id === payload.orderId || item.orderNo === payload.orderNo);
  if (!order) {
    sendJson(res, 404, { error: "订单不存在" });
    return;
  }
  if (order.status !== "pending") {
    sendJson(res, 409, { error: "只有待审核订单可以驳回" });
    return;
  }
  order.status = "rejected";
  order.rejectedAtIso = new Date().toISOString();
  order.rejectReason = String(payload.reason || "付款信息未核实").slice(0, 120);
  await writeOrders(orders);
  sendJson(res, 200, { order: publicOrder(order) });
}

async function adminPaymentProof(req, res, routeUrl) {
  if (!requireAdmin(req, res)) return;
  const orderId = routeUrl.searchParams.get("orderId");
  const orders = await readOrders();
  const order = orders.find((item) => item.id === orderId);
  if (!order?.proofFileName) {
    sendJson(res, 404, { error: "付款凭证不存在" });
    return;
  }
  const filePath = path.join(paymentProofsDir, path.basename(order.proofFileName));
  if (!existsSync(filePath)) {
    sendJson(res, 404, { error: "付款凭证文件不存在" });
    return;
  }
  res.writeHead(200, {
    "content-type": order.proofContentType || "image/jpeg",
    "cache-control": "private, no-store",
  });
  res.end(await readFile(filePath));
}

async function redeemCode(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  const payload = await readJson(req);
  const inputCode = normalizeRedeemCode(payload.code);
  if (!inputCode) {
    sendJson(res, 422, { error: "请输入充值码" });
    return;
  }

  const codes = await readRedeemCodes();
  const code = codes.find((item) => normalizeRedeemCode(item.code) === inputCode);
  if (!code) {
    sendJson(res, 404, { error: "充值码不存在" });
    return;
  }
  if (code.status === "used") {
    sendJson(res, 409, { error: "充值码已被使用" });
    return;
  }

  const plan = membershipPlans[code.planId];
  if (!plan) {
    sendJson(res, 422, { error: "充值码对应套餐已失效" });
    return;
  }

  const data = await readUsers();
  const savedUser = data.users.find((item) => item.id === user.id);
  if (!savedUser) {
    sendJson(res, 404, { error: "用户不存在" });
    return;
  }

  savedUser.predictionCredits = Number(savedUser.predictionCredits ?? savedUser.freePredictionsLeft ?? 0) + plan.credits;
  savedUser.freePredictionsLeft = savedUser.predictionCredits;
  savedUser.planName = plan.name;
  code.status = "used";
  code.usedAtIso = new Date().toISOString();
  code.usedByUserId = savedUser.id;
  code.usedByPhone = savedUser.phone;

  const orders = await readOrders();
  const order = {
    id: randomUUID(),
    orderNo: code.code,
    userId: savedUser.id,
    phone: savedUser.phone,
    planId: plan.id,
    planName: plan.name,
    amount: plan.price,
    credits: plan.credits,
    status: "approved",
    source: "redeem-code",
    payNote: "充值码兑换",
    createdAtIso: code.usedAtIso,
    approvedAtIso: code.usedAtIso,
  };
  orders.unshift(order);

  await writeUsers(data);
  await writeRedeemCodes(codes);
  await writeOrders(orders);
  sendJson(res, 200, { ok: true, code: publicRedeemCode(code), order, user: publicUser(savedUser) });
}

async function adminRedeemCodes(req, res) {
  if (!requireAdmin(req, res)) return;
  const codes = await readRedeemCodes();
  sendJson(res, 200, { codes: codes.slice(0, 200).map(publicRedeemCode) });
}

async function adminCreateRedeemCodes(req, res) {
  if (!requireAdmin(req, res)) return;
  const payload = await readJson(req);
  const plan = membershipPlans[payload.planId];
  const count = Math.max(1, Math.min(50, Number.parseInt(payload.count || "1", 10) || 1));
  if (!plan || !plan.price) {
    sendJson(res, 422, { error: "请选择有效套餐" });
    return;
  }

  const codes = await readRedeemCodes();
  const created = [];
  for (let index = 0; index < count; index += 1) {
    let nextCode = makeRedeemCode();
    while (codes.some((item) => item.code === nextCode)) nextCode = makeRedeemCode();
    const item = {
      id: randomUUID(),
      code: nextCode,
      planId: plan.id,
      planName: plan.name,
      amount: plan.price,
      credits: plan.credits,
      status: "unused",
      note: String(payload.note || "").slice(0, 120),
      createdAtIso: new Date().toISOString(),
      usedAtIso: "",
      usedByUserId: "",
      usedByPhone: "",
    };
    codes.unshift(item);
    created.push(item);
  }
  await writeRedeemCodes(codes);
  sendJson(res, 200, { codes: created.map(publicRedeemCode) });
}

async function predict(req, res) {
  const account = await requireUser(req, res);
  if (!account) return;
  if (!hasPredictQuota(account)) {
    sendJson(res, 402, { error: "预测次数已用完，请充值次数包后继续预测", code: "PAYMENT_REQUIRED", user: publicUser(account) });
    return;
  }
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
    await saveUserPrediction(account, payload, result);
    const updatedUser = await consumePredictionQuota(account.id);
    sendJson(res, 200, { ...result, user: publicUser(updatedUser || account) }, selectedProviderHeaders(selected));
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
        await saveUserPrediction(account, payload, result);
        const updatedUser = await consumePredictionQuota(account.id);
        sendJson(res, 200, { ...result, user: publicUser(updatedUser || account) }, selectedProviderHeaders(selected));
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

async function predictWithComparison(req, res) {
  const account = await requireUser(req, res);
  if (!account) return;
  if (!hasPredictQuota(account)) {
    sendJson(res, 402, { error: "预测次数已用完，请充值次数包后继续预测", code: "PAYMENT_REQUIRED", user: publicUser(account) });
    return;
  }

  const payload = await readJson(req);
  const { teamA, teamB, stage = "小组赛" } = payload;
  if (!teamA || !teamB) {
    sendJson(res, 422, { error: "teamA and teamB are required" });
    return;
  }

  const providers = configuredPredictionProviders();
  if (!providers.length) {
    sendJson(res, 500, {
      error: "预测服务未配置",
      hint: "请在 local-demo/.env.local 中设置 GPT_OPENAI_API_KEY 或 DEEPSEEK_OPENAI_API_KEY。",
    });
    return;
  }

  const [skill, liveContext, memory] = await Promise.all([
    readFile(path.join(repoRoot, "skill.md"), "utf8"),
    buildLiveContext(),
    readTeamMemory(),
  ]);
  const systemPrompt = `${skill}${liveContextForPrompt(liveContext)}${memoryForPrompt(memory, teamA, teamB)}`;
  const settled = await Promise.allSettled(
    providers.map((provider) => callPredictionProvider(provider, systemPrompt, { ...payload, stage, teamA, teamB })),
  );
  const modelResults = settled.map((item, index) => {
    const provider = providers[index];
    if (item.status === "fulfilled") return modelResultPayload(provider, item.value);
    return {
      ok: false,
      provider: provider.id || provider.name,
      providerLabel: provider.label || provider.name,
      model: provider.model,
      error: item.reason?.detail || item.reason?.message || "Model request failed",
    };
  });
  const successful = modelResults.find((item) => item.ok && item.result?.predictedScore);

  if (!successful) {
    sendJson(res, 502, {
      error: "Model did not return valid prediction",
      modelResults,
    });
    return;
  }

  const result = successful.result;
  for (const item of modelResults) {
    if (!item.ok || !item.result?.predictedScore) continue;
    await savePredictionSnapshot(payload, item.result, {
      id: item.provider,
      label: item.providerLabel,
      model: item.model,
    });
  }
  await saveUserPrediction(account, payload, result);
  const updatedUser = await consumePredictionQuota(account.id);
  sendJson(res, 200, {
    ...result,
    provider: {
      id: successful.provider,
      label: successful.providerLabel,
      model: successful.model,
    },
    modelResults,
    user: publicUser(updatedUser || account),
  });
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

function scoreMargin(score) {
  const [a, b] = String(score || "")
    .split("-")
    .map((value) => Number.parseInt(value.trim(), 10));
  return Number.isFinite(a) && Number.isFinite(b) ? a - b : null;
}

function knockoutNameZh(name) {
  return String(name || "")
    .replace(/Group ([A-L]) Winner/g, "$1组第1")
    .replace(/Group ([A-L]) 2nd Place/g, "$1组第2")
    .replace(/Third Place Group ([A-L/]+)/g, (_, groups) => `${groups.split("/").join("/")}组第3`)
    .replace(/Winner/g, "第1")
    .replace(/2nd Place/g, "第2")
    .replace(/Third Place/g, "第3");
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

function matchDateValue(value) {
  const match = String(value || "").match(/^(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!match) return 0;
  const [, month, day, hour = "0", minute = "0"] = match;
  return new Date(2026, Number(month) - 1, Number(day), Number(hour), Number(minute)).getTime();
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
  const homeZh = teamNameZh.get(homeName) || knockoutNameZh(homeName);
  const awayZh = teamNameZh.get(awayName) || knockoutNameZh(awayName);
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
  const responses = await Promise.allSettled(scoreboardDates().map(async (date) => {
    const response = await fetch(`${scoreboardBaseUrl}?dates=${date}`, {
      headers: { "user-agent": "worldcup-local-demo/1.0" },
    });
    if (!response.ok) throw new Error(`Scoreboard ${date} returned ${response.status}`);
    return response.json();
  }));
  const successful = responses.filter((result) => result.status === "fulfilled");
  if (!successful.length) throw new Error("Completed scoreboard source unavailable");
  for (const result of successful) {
    const data = result.value;
    for (const event of data.events || []) {
      if (!event.status?.type?.completed) continue;
      const normalized = normalizeScoreboardEvent(event, savedPredictions);
      if (!normalized) continue;
      records.push({
        group: normalized.group === "赛程" ? "赛果" : normalized.group,
        date: normalized.date,
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
  const responses = await Promise.allSettled(upcomingScoreboardDates(14).map(async (date) => {
    const response = await fetch(`${scoreboardBaseUrl}?dates=${date}`, {
      headers: { "user-agent": "worldcup-local-demo/1.0" },
    });
    if (!response.ok) throw new Error(`Scoreboard ${date} returned ${response.status}`);
    return response.json();
  }));
  const successful = responses.filter((result) => result.status === "fulfilled");
  if (!successful.length) throw new Error("Upcoming scoreboard source unavailable");
  for (const result of successful) {
    const data = result.value;
    for (const event of data.events || []) {
      const normalized = normalizeScoreboardEvent(event, savedPredictions);
      if (!normalized || normalized.status === "FT") continue;
      if (seen.has(normalized.eventId)) continue;
      seen.add(normalized.eventId);
      matches.push(normalized);
    }
  }
  return filterUpcomingMatches(matches);
}

async function schedule(req, res) {
  const cached = await readJsonFile(scheduleCachePath, { matches: [] });
  try {
    const liveMatches = await withTimeout(fetchUpcomingSchedule(), 10_000, "Schedule source timeout");
    const matches = selectScheduleMatches(liveMatches, cached.matches);
    const payload = {
      updatedAtIso: new Date().toISOString(),
      source: liveMatches.length ? "ESPN scoreboard" : "latest server cache",
      matches,
    };
    if (liveMatches.length) await writeJsonFile(scheduleCachePath, payload);
    sendJson(res, 200, payload);
  } catch (error) {
    const matches = selectScheduleMatches([], cached.matches);
    sendJson(res, 200, {
      updatedAtIso: cached.updatedAtIso || new Date().toISOString(),
      source: matches.length ? "latest server cache" : "schedule unavailable",
      sourceError: error.message,
      matches,
    });
  }
}

function applySavedPrediction(record, savedPredictions, provider = "") {
  const direct = provider
    ? savedPredictions.get(providerPredictionKey(provider, record.teamA, record.teamB))
    : savedPredictions.get(predictionKey(record.teamA, record.teamB));
  const reverse = provider
    ? savedPredictions.get(providerPredictionKey(provider, record.teamB, record.teamA))
    : savedPredictions.get(predictionKey(record.teamB, record.teamA));
  if (direct) {
    return {
      ...record,
      predicted: direct.predicted,
      provider: direct.provider || provider || "",
      providerLabel: direct.providerLabel || "",
      model: direct.model || "",
      group: direct.group || record.group,
      note: "",
    };
  }
  if (reverse) {
    return {
      ...record,
      predicted: reverseScore(reverse.predicted),
      provider: reverse.provider || provider || "",
      providerLabel: reverse.providerLabel || "",
      model: reverse.model || "",
      group: reverse.group || record.group,
      note: "",
    };
  }
  if (provider) {
    return {
      ...record,
      predicted: null,
      provider,
      note: "未找到该模型赛前预测",
    };
  }
  return record;
}

function mergeCompletedRecords(primaryRecords, localRecords, savedPredictions = new Map(), provider = "") {
  const merged = new Map();
  for (const record of localRecords) {
    const withPrediction = applySavedPrediction(record, savedPredictions, provider);
    merged.set(unorderedMatchKey(withPrediction.teamA, withPrediction.teamB), withPrediction);
  }
  for (const record of primaryRecords) {
    const withPrediction = applySavedPrediction(record, savedPredictions, provider);
    merged.set(unorderedMatchKey(withPrediction.teamA, withPrediction.teamB), withPrediction);
  }
  return [...merged.values()];
}

function summarizeRecords(records, sourceError = "", provider = "") {
  const normalizedAll = records
    .map((item) => ({
      ...item,
      outcomeHit: item.predicted ? scoreOutcome(item.predicted) === scoreOutcome(item.actual) : null,
      scoreHit: item.predicted ? item.predicted === item.actual : null,
      marginHit: item.predicted ? scoreMargin(item.predicted) === scoreMargin(item.actual) : null,
    }))
    .sort((a, b) => matchDateValue(b.date) - matchDateValue(a.date));
  const normalized = provider ? normalizedAll.filter((item) => item.predicted) : normalizedAll;

  const scored = normalized.filter((item) => item.outcomeHit !== null && item.scoreHit !== null);
  const total = scored.length;
  const outcomeHits = scored.filter((item) => item.outcomeHit).length;
  const scoreHits = scored.filter((item) => item.scoreHit).length;
  const marginHits = scored.filter((item) => item.marginHit).length;
  return {
    updatedAtIso: new Date().toISOString(),
    nextRefreshAtIso: new Date(Date.now() + recordsRefreshMs).toISOString(),
    provider,
    providers: [gptProvider, deepSeekProvider].map(providerPublicInfo),
    total,
    recordCount: normalized.length,
    outcomeHits,
    scoreHits,
    marginHits,
    sourceError,
    records: normalized,
  };
}

async function buildRecords(provider = "") {
  let savedPredictions = new Map();
  try {
    savedPredictions = await readSavedPredictions();
    const records = await fetchCompletedScoreboardRecords(savedPredictions);
    const result = summarizeRecords(mergeCompletedRecords(records, fallbackRecords, savedPredictions, provider), "", provider);
    if (!provider) await writeJsonFile(recordsCachePath, result);
    return result;
  } catch (error) {
    const cached = await readJsonFile(recordsCachePath, null);
    if (!provider && cached?.records?.length) {
      return {
        ...cached,
        nextRefreshAtIso: new Date(Date.now() + recordsRefreshMs).toISOString(),
        sourceError: error.message,
      };
    }
    return summarizeRecords(mergeCompletedRecords([], fallbackRecords, savedPredictions, provider), error.message, provider);
  }
}

async function records(req, res) {
  const routeUrl = new URL(req.url, `http://${req.headers.host}`);
  const provider = String(routeUrl.searchParams.get("provider") || "").trim().toLowerCase();
  sendJson(res, 200, await buildRecords(provider));
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
  const matchText = matches.map((item) => `${item.date || "时间未知"} ${item.teamA} ${item.actual} ${item.teamB}`).join("；") || "暂无已完赛记录";
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
  const matchText = matches.map((item) => `${item.date || "时间未知"} ${item.group} ${item.teamA} vs ${item.teamB} actual=${item.actual} predicted=${item.predicted || "未记录"}`).join("\n");
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
  const recentRecords = [...recordsData.records].sort((a, b) => matchDateValue(b.date) - matchDateValue(a.date));
  const teams = payload.team
    ? [payload.team]
    : [...new Set(recentRecords.flatMap((item) => [item.teamA, item.teamB]))].slice(0, 8);
  const memory = await readTeamMemory();
  memory.teams ||= {};
  memory.updatedAtIso = new Date().toISOString();
  memory.sources = reviewSourceUrls;
  memory.lastBatch = { teams, limit: payload.team ? 1 : 8, strategy: "recent completed first", updatedAtIso: memory.updatedAtIso };

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
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname === "/admin" ? "/admin.html" : decodeURIComponent(url.pathname);
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
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
  }[ext] || "application/octet-stream";
  res.writeHead(200, { "content-type": contentType });
  res.end(await readFile(filePath));
}

createServer(async (req, res) => {
  try {
    const routeUrl = new URL(req.url, `http://${req.headers.host}`);
    const route = routeUrl.pathname;
    if (req.method === "GET" && route === "/api/config") {
      sendJson(res, 200, publicConfig());
      return;
    }
    if (req.method === "GET" && route === "/api/auth/me") {
      await authMe(req, res);
      return;
    }
    if (req.method === "POST" && route === "/api/auth/register") {
      await register(req, res);
      return;
    }
    if (req.method === "POST" && route === "/api/auth/login") {
      await login(req, res);
      return;
    }
    if (req.method === "POST" && route === "/api/auth/logout") {
      await logout(req, res);
      return;
    }
    if (req.method === "POST" && route === "/api/orders") {
      await createOrder(req, res);
      return;
    }
    if (req.method === "GET" && route === "/api/orders") {
      await myOrders(req, res);
      return;
    }
    if (req.method === "GET" && route === "/api/my/predictions") {
      await myPredictions(req, res);
      return;
    }
    if (req.method === "POST" && route === "/api/redeem") {
      await redeemCode(req, res);
      return;
    }
    if (req.method === "POST" && route === "/api/admin/login") {
      await adminLogin(req, res);
      return;
    }
    if (req.method === "POST" && route === "/api/admin/logout") {
      await adminLogout(req, res);
      return;
    }
    if (req.method === "GET" && route === "/api/admin/orders") {
      await adminOrders(req, res);
      return;
    }
    if (req.method === "GET" && route === "/api/admin/overview") {
      await adminOverview(req, res);
      return;
    }
    if (req.method === "POST" && route === "/api/admin/orders/approve") {
      await approveOrder(req, res);
      return;
    }
    if (req.method === "POST" && route === "/api/admin/orders/reject") {
      await rejectOrder(req, res);
      return;
    }
    if (req.method === "GET" && route === "/api/admin/orders/proof") {
      await adminPaymentProof(req, res, routeUrl);
      return;
    }
    if (req.method === "GET" && route === "/api/admin/redeem-codes") {
      await adminRedeemCodes(req, res);
      return;
    }
    if (req.method === "POST" && route === "/api/admin/redeem-codes") {
      await adminCreateRedeemCodes(req, res);
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
      await predictWithComparison(req, res);
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
    sendJson(res, error.status || 500, { error: error.message });
  }
}).listen(port, host, () => {
  console.log(`WorldCup local demo: http://${host}:${port}`);
  console.log(`Primary model endpoint: ${primaryProvider.apiBase} / ${primaryProvider.model}`);
  if (fableProvider.apiBase && fableProvider.apiKey) {
    console.log(`Fable model endpoint is configured but disabled; using primary model only.`);
  }
});
