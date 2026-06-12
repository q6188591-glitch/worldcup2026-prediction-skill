const teams = [
  "墨西哥", "南非", "韩国", "捷克", "加拿大", "波黑", "卡塔尔", "瑞士",
  "巴西", "摩洛哥", "海地", "苏格兰", "美国", "巴拉圭", "澳大利亚", "土耳其",
  "德国", "库拉索", "科特迪瓦", "厄瓜多尔", "荷兰", "日本", "瑞典", "突尼斯",
  "比利时", "埃及", "伊朗", "新西兰", "西班牙", "佛得角", "沙特", "乌拉圭",
  "法国", "塞内加尔", "伊拉克", "挪威", "阿根廷", "阿尔及利亚", "奥地利", "约旦",
  "葡萄牙", "刚果金", "乌兹别克斯坦", "哥伦比亚", "英格兰", "克罗地亚", "加纳", "巴拿马",
];

const form = document.querySelector("#predictForm");
const statusEl = document.querySelector("#status");
const teamASelect = document.querySelector("#teamA");
const teamBSelect = document.querySelector("#teamB");
const apiBaseInput = document.querySelector("#apiBase");
const apiKeyInput = document.querySelector("#apiKey");
const modelInput = document.querySelector("#model");
const modelList = document.querySelector("#modelList");
const loadModelsButton = document.querySelector("#loadModels");
const previewBriefButton = document.querySelector("#previewBrief");
const writeBriefButton = document.querySelector("#writeBrief");
const briefText = document.querySelector("#briefText");
const newsList = document.querySelector("#newsList");

for (const team of teams) {
  teamASelect.add(new Option(team, team));
  teamBSelect.add(new Option(team, team));
}
teamASelect.value = "墨西哥";
teamBSelect.value = "南非";

function setText(id, value) {
  document.querySelector(id).textContent = value;
}

async function loadConfig() {
  const res = await fetch("/api/config");
  const config = await res.json();
  apiBaseInput.value = config.apiBase || "https://otokapi.com/v1";
  modelInput.value = config.model || "fable5.0";
}

function providerPayload() {
  return {
    apiBase: apiBaseInput.value.trim(),
    apiKey: apiKeyInput.value.trim(),
    model: modelInput.value.trim(),
  };
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
}

loadModelsButton.addEventListener("click", async () => {
  statusEl.textContent = "正在获取模型列表...";
  modelList.innerHTML = '<option value="">正在加载...</option>';
  try {
    const res = await fetch("/api/models", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(providerPayload()),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.error || "获取模型失败");
    modelList.innerHTML = '<option value="">请选择模型</option>';
    for (const model of data.models) {
      modelList.add(new Option(model, model));
    }
    statusEl.textContent = `已获取 ${data.models.length} 个模型。`;
  } catch (error) {
    modelList.innerHTML = '<option value="">获取失败</option>';
    statusEl.textContent = error.message;
  }
});

modelList.addEventListener("change", () => {
  if (modelList.value) modelInput.value = modelList.value;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusEl.textContent = "正在请求模型...";

  const payload = {
    ...providerPayload(),
    stage: document.querySelector("#stage").value,
    teamA: teamASelect.value,
    teamB: teamBSelect.value,
  };

  try {
    const res = await fetch("/api/predict", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.hint || data.detail || data.error || "请求失败");
    renderPrediction(data);
    statusEl.textContent = `预测完成。当前模型：${payload.model}`;
  } catch (error) {
    statusEl.textContent = error.message;
  }
});

previewBriefButton.addEventListener("click", async () => {
  statusEl.textContent = "正在获取新闻并整理第六节...";
  try {
    const res = await fetch("/api/brief/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(providerPayload()),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.error || "情报整理失败");
    briefText.value = data.brief;
    newsList.innerHTML = "";
    for (const item of data.items || []) {
      const a = document.createElement("a");
      a.href = item.link;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.textContent = item.source ? `${item.title} - ${item.source}` : item.title;
      newsList.append(a);
    }
    statusEl.textContent = "情报已生成预览，确认后可写入第六节。";
  } catch (error) {
    statusEl.textContent = error.message;
  }
});

writeBriefButton.addEventListener("click", async () => {
  statusEl.textContent = "正在写入 skill.md 第六节...";
  try {
    const res = await fetch("/api/brief/write", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brief: briefText.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "写入失败");
    statusEl.textContent = "已写入 skill.md 第六节。";
  } catch (error) {
    statusEl.textContent = error.message;
  }
});

loadConfig().catch((error) => {
  statusEl.textContent = error.message;
});
