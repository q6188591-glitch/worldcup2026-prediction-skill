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
  { group: "B组", date: "6/14 03:00", label: "小组赛 · 北京时间", teamA: "卡塔尔", teamB: "瑞士" },
  { group: "C组", date: "6/14 06:00", label: "小组赛 · 北京时间", teamA: "巴西", teamB: "摩洛哥" },
  { group: "C组", date: "6/14 09:00", label: "小组赛 · 北京时间", teamA: "海地", teamB: "苏格兰" },
  { group: "D组", date: "6/14 12:00", label: "小组赛 · 北京时间", teamA: "澳大利亚", teamB: "土耳其" },
  { group: "E组", date: "6/15 01:00", label: "小组赛 · 北京时间", teamA: "德国", teamB: "库拉索" },
  { group: "F组", date: "6/15 04:00", label: "小组赛 · 北京时间", teamA: "荷兰", teamB: "日本" },
  { group: "E组", date: "6/15 07:00", label: "小组赛 · 北京时间", teamA: "科特迪瓦", teamB: "厄瓜多尔" },
  { group: "F组", date: "6/15 10:00", label: "小组赛 · 北京时间", teamA: "瑞典", teamB: "突尼斯" },
];

const verifiedRecords = [
  {
    group: "A组",
    teamA: "墨西哥",
    teamB: "南非",
    predicted: "2-0",
    actual: "2-0",
    outcomeHit: true,
    scoreHit: true,
  },
  {
    group: "A组",
    teamA: "韩国",
    teamB: "捷克",
    predicted: "2-1",
    actual: "2-1",
    outcomeHit: true,
    scoreHit: true,
  },
  {
    group: "B组",
    teamA: "加拿大",
    teamB: "波黑",
    predicted: "2-1",
    actual: "1-1",
    outcomeHit: false,
    scoreHit: false,
  },
  {
    group: "D组",
    teamA: "美国",
    teamB: "巴拉圭",
    predicted: "2-0",
    actual: "4-1",
    outcomeHit: true,
    scoreHit: false,
  },
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
let isPredicting = false;
let predictRequestId = 0;

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

addTeamOptions(teamASelect);
addTeamOptions(teamBSelect);
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

function renderRecords() {
  const scoredRecords = verifiedRecords.filter((item) => item.outcomeHit !== null && item.scoreHit !== null);
  const total = scoredRecords.length;
  const outcomeHits = scoredRecords.filter((item) => item.outcomeHit).length;
  const scoreHits = scoredRecords.filter((item) => item.scoreHit).length;

  recordStats.innerHTML = `
    <div>
      <strong>${verifiedRecords.length}</strong>
      <span>已完赛记录</span>
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
  for (const item of verifiedRecords) {
    const row = document.createElement("div");
    const isUntracked = item.outcomeHit === null || item.scoreHit === null;
    row.className = `record-row${isUntracked ? " is-untracked" : ""}`;
    row.innerHTML = `
      <strong>${flag(item.teamA)} ${item.teamA} <em>vs</em> ${flag(item.teamB)} ${item.teamB}</strong>
      <span>${item.group}</span>
      <b>预测 ${item.predicted}</b>
      <b>实际 ${item.actual}</b>
      <mark>${isUntracked ? "未纳入统计" : item.outcomeHit ? "赛果命中" : "赛果未中"}</mark>
      <mark>${isUntracked ? (item.note || "仅赛果记录") : item.scoreHit ? "比分命中" : "比分未中"}</mark>
    `;
    recordList.append(row);
  }
}

async function loadConfig() {
  const res = await fetch(apiPath("config"));
  const config = await res.json();
  activeModelLabel.textContent = config.hasApiKey ? "预测服务已就绪" : "预测服务未配置";
  activeBaseLabel.textContent = config.hasApiKey
    ? config.providerNotice || "因 fable5 被 ban，当前使用 5.5"
    : "请在服务器环境变量中配置 OPENAI_API_KEY";
}

function renderPrediction(data) {
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

renderSchedule();
renderRecords();
loadConfig().catch((error) => {
  activeBaseLabel.textContent = error.message;
});
