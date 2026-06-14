const teams = [
  ["墨西哥", "🇲🇽"], ["南非", "🇿🇦"], ["韩国", "🇰🇷"], ["捷克", "🇨🇿"],
  ["加拿大", "🇨🇦"], ["波黑", "🇧🇦"], ["卡塔尔", "🇶🇦"], ["瑞士", "🇨🇭"],
  ["巴西", "🇧🇷"], ["摩洛哥", "🇲🇦"], ["海地", "🇭🇹"], ["苏格兰", "🏴"],
  ["美国", "🇺🇸"], ["巴拉圭", "🇵🇾"], ["澳大利亚", "🇦🇺"], ["土耳其", "🇹🇷"],
  ["德国", "🇩🇪"], ["库拉索", "🇨🇼"], ["科特迪瓦", "🇨🇮"], ["厄瓜多尔", "🇪🇨"],
  ["荷兰", "🇳🇱"], ["日本", "🇯🇵"], ["瑞典", "🇸🇪"], ["突尼斯", "🇹🇳"],
  ["比利时", "🇧🇪"], ["埃及", "🇪🇬"], ["伊朗", "🇮🇷"], ["新西兰", "🇳🇿"],
  ["西班牙", "🇪🇸"], ["佛得角", "🇨🇻"], ["沙特", "🇸🇦"], ["乌拉圭", "🇺🇾"],
  ["法国", "🇫🇷"], ["塞内加尔", "🇸🇳"], ["伊拉克", "🇮🇶"], ["挪威", "🇳🇴"],
  ["阿根廷", "🇦🇷"], ["阿尔及利亚", "🇩🇿"], ["奥地利", "🇦🇹"], ["约旦", "🇯🇴"],
  ["葡萄牙", "🇵🇹"], ["刚果金", "🇨🇩"], ["乌兹别克斯坦", "🇺🇿"], ["哥伦比亚", "🇨🇴"],
  ["英格兰", "🏴"], ["克罗地亚", "🇭🇷"], ["加纳", "🇬🇭"], ["巴拿马", "🇵🇦"],
];

const schedule = [
  { group: "A组", date: "6/12 03:00", label: "已赛 · 北京时间", teamA: "墨西哥", teamB: "南非", status: "FT", score: "2-0" },
  { group: "A组", date: "6/12 10:00", label: "已赛 · 北京时间", teamA: "韩国", teamB: "捷克", status: "FT", score: "2-1" },
  { group: "B组", date: "6/13 03:00", label: "已赛 · 北京时间", teamA: "加拿大", teamB: "波黑", status: "FT", score: "1-1" },
  { group: "D组", date: "6/13 09:00", label: "已赛 · 北京时间", teamA: "美国", teamB: "巴拉圭", status: "FT", score: "4-1" },
  { group: "B组", date: "6/14 03:00", label: "已赛 · 北京时间", teamA: "卡塔尔", teamB: "瑞士", status: "FT", score: "1-1" },
  { group: "C组", date: "6/14 06:00", label: "已赛 · 北京时间", teamA: "巴西", teamB: "摩洛哥", status: "FT", score: "1-1" },
  { group: "C组", date: "6/14 09:00", label: "已赛 · 北京时间", teamA: "海地", teamB: "苏格兰", status: "FT", score: "0-1" },
  { group: "D组", date: "6/14 12:00", label: "已赛 · 北京时间", teamA: "澳大利亚", teamB: "土耳其", status: "FT", score: "2-0" },
  { group: "E组", date: "6/15 01:00", label: "小组赛 · 北京时间", teamA: "德国", teamB: "库拉索" },
  { group: "F组", date: "6/15 04:00", label: "小组赛 · 北京时间", teamA: "荷兰", teamB: "日本" },
  { group: "E组", date: "6/15 07:00", label: "小组赛 · 北京时间", teamA: "科特迪瓦", teamB: "厄瓜多尔" },
  { group: "F组", date: "6/15 10:00", label: "小组赛 · 北京时间", teamA: "瑞典", teamB: "突尼斯" },
];

const teamMeta = new Map(teams);
const form = document.querySelector("#predictForm");
const predictButton = form.querySelector('button[type="submit"]');
const predictProgress = document.querySelector("#predictProgress");
const teamASelect = document.querySelector("#teamA");
const teamBSelect = document.querySelector("#teamB");
const activeModelLabel = document.querySelector("#activeModelLabel");
const activeBaseLabel = document.querySelector("#activeBaseLabel");
const matchRail = document.querySelector("#matchRail");
const scheduleGrid = document.querySelector("#scheduleGrid");
const recordStats = document.querySelector("#recordStats");
const recordList = document.querySelector("#recordList");
const liveStatus = document.querySelector("#liveStatus");
const liveMeta = document.querySelector("#liveMeta");
const refreshLiveButton = document.querySelector("#refreshLive");
const autoRePredict = document.querySelector("#autoRePredict");
const batchDateSelect = document.querySelector("#batchDate");
const batchPredictButton = document.querySelector("#batchPredict");
const batchStatus = document.querySelector("#batchStatus");
const batchResults = document.querySelector("#batchResults");
const memoryTeamSelect = document.querySelector("#memoryTeam");
const refreshMemoryButton = document.querySelector("#refreshMemory");
const memoryStatus = document.querySelector("#memoryStatus");
const memoryGrid = document.querySelector("#memoryGrid");
let isPredicting = false;
let isBatchPredicting = false;
let predictRequestId = 0;
let hasPrediction = false;
let lastLiveStamp = "";

function apiPath(path) {
  return `api/${path.replace(/^\//, "")}`;
}

function flag(team) {
  return teamMeta.get(team) || "";
}

function addTeamOptions(select) {
  for (const [team, icon] of teams) {
    select.add(new Option(`${icon} ${team}`, team));
  }
}

function matchDay(dateText) {
  return String(dateText || "").split(" ")[0];
}

function stageForMatch(match) {
  return match.label?.split("·")[0]?.trim() || "小组赛";
}

function addBatchDateOptions() {
  const days = [...new Set(schedule.filter((match) => match.status !== "FT").map((match) => matchDay(match.date)))];
  batchDateSelect.innerHTML = "";
  for (const day of days) {
    const count = schedule.filter((match) => match.status !== "FT" && matchDay(match.date) === day).length;
    batchDateSelect.add(new Option(`${day} · ${count} 场`, day));
  }
  if (days.includes("6/15")) batchDateSelect.value = "6/15";
}

function addMemoryTeamOptions() {
  memoryTeamSelect.innerHTML = "";
  memoryTeamSelect.add(new Option("全部已完赛球队", ""));
  for (const [team, icon] of teams) {
    memoryTeamSelect.add(new Option(`${icon} ${team}`, team));
  }
}

addTeamOptions(teamASelect);
addTeamOptions(teamBSelect);
addBatchDateOptions();
addMemoryTeamOptions();
teamASelect.value = "墨西哥";
teamBSelect.value = "南非";

function setText(id, value) {
  document.querySelector(id).textContent = value;
}

function selectMatch(match) {
  teamASelect.value = match.teamA;
  teamBSelect.value = match.teamB;
  document.querySelector("#stage").value = "小组赛";
  activeBaseLabel.textContent = `已选择：${match.teamA} vs ${match.teamB}`;
}

function renderSchedule() {
  matchRail.innerHTML = "";
  const upcoming = schedule.filter((match) => match.status !== "FT").slice(0, 4);
  upcoming.forEach((match, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "match-card";
    button.innerHTML = `
      <small>${index === 0 ? "下一场" : match.group} · ${match.date}</small>
      <strong>${flag(match.teamA)} ${match.teamA}</strong>
      <span>${match.status === "FT" ? match.score : "VS"}</span>
      <strong>${flag(match.teamB)} ${match.teamB}</strong>
      <small>${match.label}</small>
    `;
    button.addEventListener("click", () => selectMatch(match));
    matchRail.append(button);
  });

  scheduleGrid.innerHTML = "";
  schedule.forEach((match) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "schedule-row";
    row.innerHTML = `
      <span>${match.group}</span>
      <b>${match.date}</b>
      <strong>${flag(match.teamA)} ${match.teamA} <em>${match.status === "FT" ? match.score : "vs"}</em> ${flag(match.teamB)} ${match.teamB}</strong>
      <small>${match.label}</small>
    `;
    row.addEventListener("click", () => selectMatch(match));
    scheduleGrid.append(row);
  });
}

function setPredicting(active) {
  isPredicting = active;
  predictButton.disabled = active;
  predictButton.textContent = active ? "预测中..." : "开始预测";
  predictProgress.hidden = !active;
}

function percent(count, total) {
  if (!total) return "0%";
  return `${Math.round((count / total) * 100)}%`;
}

function renderRecords(data) {
  const records = data?.records ?? [];
  const total = data?.total ?? records.length;
  const outcomeHits = data?.outcomeHits ?? records.filter((item) => item.outcomeHit).length;
  const scoreHits = data?.scoreHits ?? records.filter((item) => item.scoreHit).length;

  recordStats.innerHTML = `
    <div>
      <strong>${records.length}</strong>
      <span>已完赛记录 · ${formatTime(data?.updatedAtIso)}</span>
    </div>
    <div>
      <strong>${percent(outcomeHits, total)}</strong>
      <span>赛果方向 ${outcomeHits}/${total}</span>
    </div>
    <div>
      <strong>${percent(scoreHits, total)}</strong>
      <span>比分命中 ${scoreHits}/${total}</span>
    </div>
  `;

  recordList.innerHTML = "";
  for (const item of records) {
    const row = document.createElement("div");
    const isUntracked = item.outcomeHit === null || item.scoreHit === null;
    row.className = `record-row${isUntracked ? " is-untracked" : ""}`;
    row.innerHTML = `
      <strong>${flag(item.teamA)} ${item.teamA} <em>vs</em> ${flag(item.teamB)} ${item.teamB}</strong>
      <span>${item.group}</span>
      <b>预测 ${item.predicted ?? "未记录"}</b>
      <b>实际 ${item.actual}</b>
      <mark>${isUntracked ? "未纳入统计" : item.outcomeHit ? "赛果命中" : "赛果未中"}</mark>
      <mark>${isUntracked ? (item.note || "仅赛果记录") : item.scoreHit ? "比分命中" : "比分未中"}</mark>
    `;
    recordList.append(row);
  }
}

async function loadConfig() {
  const res = await fetch(`${apiPath("config")}?v=20260614-model55`, { cache: "no-store" });
  const config = await res.json();
  activeModelLabel.textContent = config.hasApiKey ? "预测服务已就绪" : "预测服务未配置";
  activeBaseLabel.textContent = config.hasApiKey
    ? config.providerNotice || "因 fable5 被 ban，当前使用 5.5"
    : "请在服务器环境变量中配置 OPENAI_API_KEY";
}

function formatTime(value) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function renderLiveContext(data, { fromEvent = false } = {}) {
  const changed = data.updatedAtIso && data.updatedAtIso !== lastLiveStamp;
  lastLiveStamp = data.updatedAtIso || lastLiveStamp;
  liveStatus.textContent = data.ok ? `实时情报已更新 · ${data.itemCount} 条` : "实时情报暂不可用";
  liveMeta.textContent = data.ok
    ? `最近刷新 ${formatTime(data.updatedAtIso)}，下次约 ${formatTime(data.nextRefreshAtIso)}`
    : data.error || "将继续使用静态资料库预测";

  if (fromEvent && changed && autoRePredict.checked && hasPrediction && !isPredicting) {
    form.requestSubmit();
  }
}

async function loadLiveContext({ force = false } = {}) {
  refreshLiveButton.disabled = true;
  liveStatus.textContent = force ? "正在刷新实时情报..." : "正在读取实时情报...";
  try {
    const res = await fetch(apiPath(force ? "live/refresh" : "live"), {
      method: force ? "POST" : "GET",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "实时情报刷新失败");
    renderLiveContext(data);
  } catch (error) {
    liveStatus.textContent = "实时情报刷新失败";
    liveMeta.textContent = error.message;
  } finally {
    refreshLiveButton.disabled = false;
  }
}

async function loadRecords() {
  try {
    const res = await fetch(apiPath("records"));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "命中记录刷新失败");
    renderRecords(data);
  } catch (error) {
    recordStats.innerHTML = `<div><strong>--</strong><span>${error.message}</span></div>`;
    recordList.innerHTML = "";
  }
}

function renderMemory(memory) {
  const entries = Object.values(memory?.teams || {}).sort((a, b) => (b.updatedAtIso || "").localeCompare(a.updatedAtIso || ""));
  memoryStatus.textContent = entries.length
    ? `已收录 ${entries.length} 支球队，最近更新 ${formatTime(memory.updatedAtIso || entries[0]?.updatedAtIso)}`
    : "暂无复盘记忆，点击采集后开始收录。";
  memoryGrid.innerHTML = "";
  for (const entry of entries) {
    const card = document.createElement("article");
    card.className = "memory-card";
    const insights = (entry.insights || []).slice(0, 3).map((item) => `<li>${item}</li>`).join("");
    const risks = (entry.risks || []).slice(0, 2).map((item) => `<li>${item}</li>`).join("");
    card.innerHTML = `
      <header>
        <strong>${flag(entry.team)} ${entry.team}</strong>
        <span>${entry.matchCount || 0} 场样本 · ${entry.sourceCount || 0} 条线索</span>
      </header>
      <p>${entry.summary || "暂无摘要"}</p>
      <b>可复用观察</b>
      <ul>${insights || "<li>暂无</li>"}</ul>
      <b>风险点</b>
      <ul>${risks || "<li>暂无</li>"}</ul>
    `;
    memoryGrid.append(card);
  }
}

async function loadMemory() {
  try {
    const res = await fetch(apiPath("memory"));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "复盘记忆读取失败");
    renderMemory(data);
  } catch (error) {
    memoryStatus.textContent = error.message;
  }
}

async function refreshMemory() {
  refreshMemoryButton.disabled = true;
  memoryTeamSelect.disabled = true;
  memoryStatus.textContent = "正在采集赛后复盘材料并生成记忆...";
  try {
    const body = memoryTeamSelect.value ? { team: memoryTeamSelect.value } : {};
    const res = await fetch(apiPath("memory/refresh"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "复盘记忆采集失败");
    renderMemory(data);
  } catch (error) {
    memoryStatus.textContent = error.message;
  } finally {
    refreshMemoryButton.disabled = false;
    memoryTeamSelect.disabled = false;
  }
}

function connectLiveEvents() {
  if (!window.EventSource) return;
  const events = new EventSource(apiPath("live/events"));
  events.addEventListener("live-context", (event) => {
    renderLiveContext(JSON.parse(event.data), { fromEvent: true });
    loadRecords();
  });
  events.addEventListener("error", () => {
    liveStatus.textContent = "实时情报连接重试中";
  });
}

function renderPrediction(data) {
  hasPrediction = true;
  setText("#teamAName", data.teamA?.name ?? "--");
  setText("#teamAProb", `${data.teamA?.winProb ?? "--"}%`);
  setText("#drawProb", `${data.draw ?? "--"}%`);
  setText("#teamBName", data.teamB?.name ?? "--");
  setText("#teamBProb", `${data.teamB?.winProb ?? "--"}%`);
  setText("#predictedScore", data.predictedScore ?? "--");
  setText("#confidence", data.confidence ?? "--");
  setText("#analysis", data.analysis ?? "");
  document.querySelector("#rawJson").textContent = JSON.stringify(data, null, 2);

  const factors = document.querySelector("#factors");
  factors.innerHTML = "";
  for (const item of data.keyFactors ?? []) {
    const li = document.createElement("li");
    li.textContent = item;
    factors.append(li);
  }

  const players = document.querySelector("#players");
  players.innerHTML = "";
  for (const item of data.playersToWatch ?? []) {
    const card = document.createElement("div");
    card.className = "player-card";
    card.innerHTML = `<small>${item.team}</small><strong>${item.player}</strong><span>${item.reason}</span>`;
    players.append(card);
  }
}

function renderBatchRow(match, state, dataOrMessage = "") {
  const existing = batchResults.querySelector(`[data-match-key="${match.teamA}-${match.teamB}"]`);
  const row = existing || document.createElement("div");
  row.className = `batch-row is-${state}`;
  row.dataset.matchKey = `${match.teamA}-${match.teamB}`;
  const score = typeof dataOrMessage === "object" ? dataOrMessage.predictedScore || "--" : "--";
  const confidence = typeof dataOrMessage === "object" ? dataOrMessage.confidence || "--" : "";
  const note = typeof dataOrMessage === "string" ? dataOrMessage : confidence;
  row.innerHTML = `
    <strong>${flag(match.teamA)} ${match.teamA} <em>vs</em> ${flag(match.teamB)} ${match.teamB}</strong>
    <span>${match.group} · ${match.date}</span>
    <b>${state === "done" ? `预测 ${score}` : state === "error" ? "失败" : "预测中"}</b>
    <small>${note}</small>
  `;
  if (!existing) batchResults.append(row);
}

async function runBatchPrediction() {
  if (isBatchPredicting) return;
  const day = batchDateSelect.value;
  const matches = schedule.filter((match) => match.status !== "FT" && matchDay(match.date) === day);
  if (!matches.length) {
    batchStatus.textContent = "这个日期没有可批量预测的比赛。";
    return;
  }

  isBatchPredicting = true;
  batchPredictButton.disabled = true;
  batchDateSelect.disabled = true;
  batchResults.innerHTML = "";
  batchStatus.textContent = `正在预测 ${day} 的 ${matches.length} 场比赛...`;

  let okCount = 0;
  for (const match of matches) {
    renderBatchRow(match, "running");
    try {
      const res = await fetch(apiPath("predict"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stage: stageForMatch(match),
          group: match.group,
          date: match.date,
          teamA: match.teamA,
          teamB: match.teamB,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.hint || data.detail || data.error || "请求失败");
      okCount += 1;
      renderBatchRow(match, "done", data);
      renderPrediction(data);
    } catch (error) {
      renderBatchRow(match, "error", error.message);
    }
  }

  batchStatus.textContent = `批量预测完成：${okCount}/${matches.length} 场成功，结果已保存。`;
  isBatchPredicting = false;
  batchPredictButton.disabled = false;
  batchDateSelect.disabled = false;
  loadRecords();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isPredicting) return;
  const requestId = ++predictRequestId;
  setPredicting(true);
  activeBaseLabel.textContent = "正在请求模型...";

  const payload = {
    stage: document.querySelector("#stage").value,
    teamA: teamASelect.value,
    teamB: teamBSelect.value,
  };

  try {
    const res = await fetch(apiPath("predict"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.hint || data.detail || data.error || "请求失败");
    if (requestId !== predictRequestId) return;
    renderPrediction(data);
    activeBaseLabel.textContent = "预测完成";
  } catch (error) {
    if (requestId === predictRequestId) activeBaseLabel.textContent = error.message;
  } finally {
    if (requestId === predictRequestId) setPredicting(false);
  }
});

refreshLiveButton.addEventListener("click", () => {
  loadLiveContext({ force: true });
  loadRecords();
});

batchPredictButton.addEventListener("click", runBatchPrediction);
refreshMemoryButton.addEventListener("click", refreshMemory);

renderSchedule();
loadRecords();
loadMemory();
loadConfig().catch((error) => {
  activeBaseLabel.textContent = error.message;
});
loadLiveContext().then(connectLiveEvents).catch(() => connectLiveEvents());
setInterval(loadRecords, 60 * 1000);
