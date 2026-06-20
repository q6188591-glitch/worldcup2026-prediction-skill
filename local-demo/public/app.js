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

const fallbackSchedule = [
  { group: "A组", date: "6/12 03:00", label: "已赛 · 北京时间", teamA: "墨西哥", teamB: "南非", status: "FT", score: "2-0" },
  { group: "A组", date: "6/12 10:00", label: "已赛 · 北京时间", teamA: "韩国", teamB: "捷克", status: "FT", score: "2-1" },
  { group: "B组", date: "6/13 03:00", label: "已赛 · 北京时间", teamA: "加拿大", teamB: "波黑", status: "FT", score: "1-1" },
  { group: "D组", date: "6/13 09:00", label: "已赛 · 北京时间", teamA: "美国", teamB: "巴拉圭", status: "FT", score: "4-1" },
  { group: "B组", date: "6/14 03:00", label: "已赛 · 北京时间", teamA: "卡塔尔", teamB: "瑞士", status: "FT", score: "1-1" },
  { group: "C组", date: "6/14 06:00", label: "已赛 · 北京时间", teamA: "巴西", teamB: "摩洛哥", status: "FT", score: "1-1" },
  { group: "C组", date: "6/14 09:00", label: "已赛 · 北京时间", teamA: "海地", teamB: "苏格兰", status: "FT", score: "0-1" },
  { group: "D组", date: "6/14 12:00", label: "已赛 · 北京时间", teamA: "澳大利亚", teamB: "土耳其", status: "FT", score: "2-0" },
  { group: "E组", date: "6/15 01:00", label: "已赛 · 北京时间", teamA: "德国", teamB: "库拉索", status: "FT", score: "7-1" },
  { group: "F组", date: "6/15 04:00", label: "已赛 · 北京时间", teamA: "荷兰", teamB: "日本", status: "FT", score: "2-2" },
  { group: "E组", date: "6/15 07:00", label: "已赛 · 北京时间", teamA: "科特迪瓦", teamB: "厄瓜多尔", status: "FT", score: "1-0" },
  { group: "F组", date: "6/15 10:00", label: "已赛 · 北京时间", teamA: "瑞典", teamB: "突尼斯", status: "FT" },
  { group: "G组", date: "6/16 01:00", label: "小组赛 · 北京时间", teamA: "比利时", teamB: "埃及" },
  { group: "H组", date: "6/16 04:00", label: "小组赛 · 北京时间", teamA: "伊朗", teamB: "新西兰" },
  { group: "G组", date: "6/16 07:00", label: "小组赛 · 北京时间", teamA: "西班牙", teamB: "佛得角" },
  { group: "H组", date: "6/16 10:00", label: "小组赛 · 北京时间", teamA: "沙特", teamB: "乌拉圭" },
  { group: "I组", date: "6/17 01:00", label: "小组赛 · 北京时间", teamA: "法国", teamB: "塞内加尔" },
  { group: "J组", date: "6/17 04:00", label: "小组赛 · 北京时间", teamA: "伊拉克", teamB: "挪威" },
  { group: "I组", date: "6/17 07:00", label: "小组赛 · 北京时间", teamA: "阿根廷", teamB: "阿尔及利亚" },
  { group: "J组", date: "6/17 10:00", label: "小组赛 · 北京时间", teamA: "奥地利", teamB: "约旦" },
];
let schedule = [...fallbackSchedule];

const teamMeta = new Map(teams);
const form = document.querySelector("#predictForm");
const predictButton = form.querySelector('button[type="submit"]');
const predictProgress = document.querySelector("#predictProgress");
const teamASelect = document.querySelector("#teamA");
const teamBSelect = document.querySelector("#teamB");
const activeModelLabel = document.querySelector("#activeModelLabel");
const activeBaseLabel = document.querySelector("#activeBaseLabel");
const accountStatus = document.querySelector("#accountStatus");
const accountMeta = document.querySelector("#accountMeta");
const authForms = document.querySelector("#authForms");
const authPhone = document.querySelector("#authPhone");
const authPassword = document.querySelector("#authPassword");
const loginButton = document.querySelector("#loginButton");
const registerButton = document.querySelector("#registerButton");
const authHint = document.querySelector("#authHint");
const logoutButton = document.querySelector("#logoutButton");
const memberArea = document.querySelector("#memberArea");
const userCenterPhone = document.querySelector("#userCenterPhone");
const userCenterCredits = document.querySelector("#userCenterCredits");
const userCenterPlan = document.querySelector("#userCenterPlan");
const planGrid = document.querySelector("#planGrid");
const openWechatQrButton = document.querySelector("#openWechatQr");
const openAlipayQrButton = document.querySelector("#openAlipayQr");
const paymentQrDialog = document.querySelector("#paymentQrDialog");
const paymentQrCrop = document.querySelector("#paymentQrCrop");
const paymentQrImage = document.querySelector("#paymentQrImage");
const closePaymentQrButton = document.querySelector("#closePaymentQr");
const selectedPlanText = document.querySelector("#selectedPlanText");
const payeeName = document.querySelector("#payeeName");
const paymentHint = document.querySelector("#paymentHint");
const paymentMethodSelect = document.querySelector("#paymentMethod");
const payerNameInput = document.querySelector("#payerName");
const paymentProofInput = document.querySelector("#paymentProof");
const proofFileName = document.querySelector("#proofFileName");
const submitPaymentOrderButton = document.querySelector("#submitPaymentOrder");
const paymentOrderStatus = document.querySelector("#paymentOrderStatus");
const redeemCodeInput = document.querySelector("#redeemCode");
const redeemButton = document.querySelector("#redeemButton");
const redeemStatus = document.querySelector("#redeemStatus");
const orderList = document.querySelector("#orderList");
const orderHistoryCount = document.querySelector("#orderHistoryCount");
const myPredictionStats = document.querySelector("#myPredictionStats");
const myPredictionList = document.querySelector("#myPredictionList");
const predictionHistoryCount = document.querySelector("#predictionHistoryCount");
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
let currentUser = null;
let plans = [];
let selectedPlanId = "";
let payment = {};
let knownOrderStatuses = null;

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

function matchStartAt(match) {
  const matchText = String(match.date || "").match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (!matchText) return null;
  const [, month, day, hour, minute] = matchText.map(Number);
  return new Date(2026, month - 1, day, hour, minute);
}

function matchTimeValue(match) {
  return matchStartAt(match)?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

function isPredictableMatch(match) {
  return match.status !== "FT";
}

function scheduleAnchorDate(matches = schedule) {
  const starts = matches.map(matchStartAt).filter(Boolean).sort((a, b) => a - b);
  return starts[0] || new Date();
}

function isWithinNextDays(match, days, anchor = scheduleAnchorDate()) {
  const startAt = matchStartAt(match);
  if (!startAt) return true;
  const endAt = new Date(anchor);
  endAt.setDate(endAt.getDate() + days);
  return startAt <= endAt;
}

function stageForMatch(match) {
  return match.label?.split("·")[0]?.trim() || "小组赛";
}

function addBatchDateOptions() {
  const availableMatches = schedule.filter(isPredictableMatch).sort((a, b) => matchTimeValue(a) - matchTimeValue(b));
  const days = [...new Set(availableMatches.map((match) => matchDay(match.date)))];
  batchDateSelect.innerHTML = "";
  for (const day of days) {
    const count = availableMatches.filter((match) => matchDay(match.date) === day).length;
    batchDateSelect.add(new Option(`${day} · ${count} 场`, day));
  }
  batchDateSelect.disabled = !days.length;
  batchPredictButton.disabled = !days.length;
  batchStatus.textContent = days.length
    ? "选择日期后开始批量预测，结果会自动保存到命中记录。"
    : "当前赛程里没有可批量预测的未来比赛。";
}

async function loadSchedule() {
  let statusMessage = "";
  try {
    const res = await fetch(`${apiPath("schedule")}?v=${Date.now()}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "赛程读取失败");
    if (Array.isArray(data.matches) && data.matches.length) {
      schedule = data.matches;
      statusMessage = `已读取实时赛程：${data.matches.length} 场未来比赛。`;
    } else {
      schedule = [...fallbackSchedule];
      statusMessage = data.sourceError
        ? `实时赛程暂不可用，已使用本地赛程兜底：${data.sourceError}`
        : "实时赛程暂无未来比赛，已使用本地赛程兜底。";
    }
  } catch (error) {
    schedule = [...fallbackSchedule];
    statusMessage = `实时赛程读取失败，已使用本地赛程兜底：${error.message}`;
  }
  addBatchDateOptions();
  renderSchedule();
  if (statusMessage) batchStatus.textContent = statusMessage;
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

function cleanPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function authValidationMessage() {
  const phone = cleanPhone(authPhone.value);
  const password = authPassword.value || "";
  if (!/^1\d{10}$/.test(phone)) return "请输入 11 位手机号。";
  if (password.length < 6) return "密码至少 6 位。";
  return "";
}

function setAuthHint(message = "") {
  authHint.textContent = message || "手机号用于登录和找回充值记录。";
}

function planPrice(plan) {
  const value = Number(plan?.price ?? plan?.amount ?? 0);
  return value.toFixed(value === 0.01 ? 2 : 1).replace(/\.0$/, "");
}

function isTestPlan(plan) {
  return plan?.id === "paytest" || Number(plan?.price) === 0.01;
}

function accountLabel(user) {
  if (!user) return "未登录";
  return `${user.phone} · 剩余 ${user.predictionCredits ?? user.freePredictionsLeft ?? 0} 次`;
}

function renderAccount(user) {
  currentUser = user;
  accountStatus.textContent = accountLabel(user);
  accountMeta.textContent = user
    ? `每预测 1 场消耗 1 次；批量预测按场次扣除。`
    : "注册后赠送 3 次免费预测，每预测 1 场消耗 1 次";
  authForms.hidden = Boolean(user);
  logoutButton.hidden = !user;
  memberArea.hidden = !user;
  if (user) {
    renderUserCenter(user);
    renderPlans();
    renderPayment();
  }
}

function renderUserCenter(user) {
  userCenterPhone.textContent = user.phone || "--";
  userCenterCredits.textContent = `${user.predictionCredits ?? user.freePredictionsLeft ?? 0} 次`;
  userCenterPlan.textContent = user.planName || "新用户权益";
}

function renderPlans() {
  planGrid.innerHTML = "";
  for (const plan of plans) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `plan-card${selectedPlanId === plan.id ? " is-selected" : ""}`;
    button.innerHTML = `
      <strong>${plan.name}${isTestPlan(plan) ? `<em>测试</em>` : ""}</strong>
      <span>￥${planPrice(plan)}</span>
      <small>${plan.credits} 次预测${isTestPlan(plan) ? " · 跑通后删除" : ""}</small>
    `;
    button.addEventListener("click", () => {
      selectedPlanId = plan.id;
      renderPlans();
      renderPayment();
    });
    planGrid.append(button);
  }
  if (!selectedPlanId && plans[0]) selectedPlanId = plans[0].id;
  renderPayment();
}

function selectedPlan() {
  return plans.find((plan) => plan.id === selectedPlanId) || plans[0] || null;
}

function setPaymentEntry(button, url) {
  button.disabled = !url;
  button.querySelector("span").textContent = url ? "点击打开收款码" : "收款码待配置";
}

function openPaymentQr(url, label, provider) {
  if (!url) return;
  paymentQrImage.src = url;
  paymentQrImage.alt = label;
  paymentQrCrop.className = `payment-qr-crop is-${provider}`;
  paymentQrDialog.showModal();
}

function renderPayment() {
  const plan = selectedPlan();
  selectedPlanText.textContent = plan ? `当前应付 ￥${planPrice(plan)} · ${plan.name} · ${plan.credits} 次` : "请选择次数包";
  payeeName.textContent = payment.payeeName ? `收款方：${payment.payeeName}` : "";
  paymentHint.textContent = plan
    ? isTestPlan(plan)
      ? "测试专用：付款 0.01 元后点击“我已支付”，审核通过自动到账。"
      : "扫码付款后点击“我已支付”，管理员按当前账号确认到账。"
    : "选择次数包后再扫码付款。";
  setPaymentEntry(openWechatQrButton, payment.wechatQrUrl);
  setPaymentEntry(openAlipayQrButton, payment.alipayQrUrl);
}

function renderOrders(container, orders) {
  orderHistoryCount.textContent = `${orders.length} 条`;
  container.innerHTML = "";
  for (const order of orders) {
    const row = document.createElement("div");
    const statusLabel = order.status === "approved" ? "已到账" : order.status === "rejected" ? "已驳回" : "待审核";
    row.className = `order-item is-${order.status}`;
    row.innerHTML = `
      <strong>${order.planName} · ￥${order.amount}</strong>
      <span>${order.paymentMethod === "wechat" ? "微信" : order.paymentMethod === "alipay" ? "支付宝" : "充值码"} · ${order.orderNo}</span>
      <small>${statusLabel} · ${order.credits || ""} 次 · ${formatTime(order.createdAtIso)}${order.rejectReason ? ` · ${order.rejectReason}` : ""}</small>
    `;
    container.append(row);
  }
  if (!orders.length) container.innerHTML = `<div class="order-empty">暂无订单</div>`;
}

function renderMyPredictions(data) {
  const predictions = data?.predictions || [];
  predictionHistoryCount.textContent = `${data?.total ?? predictions.length} 场`;
  myPredictionStats.textContent = predictions.length
    ? `已记录 ${data.total || predictions.length} 场预测，累计消耗 ${data.totalCreditsUsed || predictions.length} 次。`
    : "暂无预测记录。";
  myPredictionList.innerHTML = "";
  for (const item of predictions) {
    const row = document.createElement("div");
    row.className = "prediction-history-row";
    row.innerHTML = `
      <strong>${flag(item.teamA)} ${item.teamA} <em>vs</em> ${flag(item.teamB)} ${item.teamB}</strong>
      <span>${item.group || item.stage || "比赛"} · ${item.date || formatTime(item.createdAtIso)}</span>
      <b>预测 ${item.predicted}</b>
      <small>${item.confidence || ""} · 消耗 ${item.creditsUsed || 1} 次</small>
    `;
    myPredictionList.append(row);
  }
  if (!predictions.length) myPredictionList.innerHTML = `<div class="order-empty">暂无预测记录</div>`;
}

async function loadAuth() {
  const res = await fetch(apiPath("auth/me"));
  const data = await res.json();
  plans = data.plans || [];
  payment = data.payment || {};
  selectedPlanId ||= plans[0]?.id || "";
  renderAccount(data.user);
  if (data.user) {
    loadOrders();
    loadMyPredictions();
  }
}

async function submitAuth(mode) {
  const validation = authValidationMessage();
  if (validation) {
    setAuthHint(validation);
    return;
  }
  loginButton.disabled = true;
  registerButton.disabled = true;
  setAuthHint(mode === "login" ? "正在登录..." : "正在注册...");
  try {
    const res = await fetch(apiPath(`auth/${mode}`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: cleanPhone(authPhone.value), password: authPassword.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "账号操作失败");
    knownOrderStatuses = null;
    renderAccount(data.user);
    setAuthHint("登录成功。");
    loadOrders();
    loadMyPredictions();
  } finally {
    loginButton.disabled = false;
    registerButton.disabled = false;
  }
}

async function loadOrders() {
  if (!currentUser) return;
  const res = await fetch(apiPath("orders"));
  const data = await res.json();
  if (!res.ok) return;
  const orders = data.orders || [];
  if (knownOrderStatuses) {
    const newlyApproved = orders.find((order) => order.status === "approved" && knownOrderStatuses.get(order.id) === "pending");
    if (newlyApproved) {
      paymentOrderStatus.textContent = `充值成功：${newlyApproved.planName}，已到账 ${newlyApproved.credits} 次。`;
      const authRes = await fetch(apiPath("auth/me"));
      const authData = await authRes.json();
      if (authRes.ok && authData.user) renderAccount(authData.user);
    }
  }
  knownOrderStatuses = new Map(orders.map((order) => [order.id, order.status]));
  renderOrders(orderList, orders);
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("付款截图读取失败"));
    reader.readAsDataURL(file);
  });
}

async function submitPaymentOrder() {
  const plan = selectedPlan();
  const file = paymentProofInput.files?.[0];
  if (!plan) {
    paymentOrderStatus.textContent = "请先选择次数包。";
    return;
  }
  if (file && file.size > 3 * 1024 * 1024) {
    paymentOrderStatus.textContent = "付款截图不能超过 3MB。";
    return;
  }
  submitPaymentOrderButton.disabled = true;
  paymentOrderStatus.textContent = "正在提交付款订单...";
  try {
    const proofDataUrl = file ? await fileAsDataUrl(file) : "";
    const res = await fetch(apiPath("orders"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        planId: plan.id,
        paymentMethod: paymentMethodSelect.value,
        payerName: payerNameInput.value.trim(),
        proofDataUrl,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "付款凭证提交失败");
    paymentProofInput.value = "";
    proofFileName.textContent = "付款截图（可选）";
    paymentOrderStatus.textContent = `已提交“我已支付”：订单 ${data.order.orderNo}，等待管理员确认。`;
    await loadOrders();
  } catch (error) {
    paymentOrderStatus.textContent = error.message;
  } finally {
    submitPaymentOrderButton.disabled = false;
  }
}

async function loadMyPredictions() {
  if (!currentUser) return;
  const res = await fetch(apiPath("my/predictions"));
  const data = await res.json();
  if (res.ok) renderMyPredictions(data);
}

async function redeemCode() {
  const code = redeemCodeInput.value.trim();
  if (!code) {
    redeemStatus.textContent = "请输入充值码。";
    return;
  }
  redeemButton.disabled = true;
  redeemStatus.textContent = "正在兑换充值码...";
  try {
    const res = await fetch(apiPath("redeem"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "兑换失败");
    redeemCodeInput.value = "";
    renderAccount(data.user);
    redeemStatus.textContent = `兑换成功：${data.order.planName}，已到账 ${data.order.credits} 次。`;
    loadOrders();
    loadMyPredictions();
  } catch (error) {
    redeemStatus.textContent = error.message;
  } finally {
    redeemButton.disabled = false;
  }
}

function selectMatch(match) {
  teamASelect.value = match.teamA;
  teamBSelect.value = match.teamB;
  document.querySelector("#stage").value = "小组赛";
  activeBaseLabel.textContent = `已选择：${match.teamA} vs ${match.teamB}`;
}

function renderSchedule() {
  matchRail.innerHTML = "";
  const futureMatches = schedule.filter(isPredictableMatch).sort((a, b) => matchTimeValue(a) - matchTimeValue(b));
  const upcoming = futureMatches.slice(0, 4);
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
  const anchor = scheduleAnchorDate(futureMatches);
  const nearMatches = futureMatches.filter((match) => isWithinNextDays(match, 3, anchor));
  const laterMatches = futureMatches.filter((match) => !isWithinNextDays(match, 3, anchor));
  const visibleMatches = nearMatches.length ? nearMatches : futureMatches;
  const appendRow = (match, container = scheduleGrid) => {
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
    container.append(row);
  };
  visibleMatches.forEach((match) => appendRow(match));
  if (laterMatches.length && nearMatches.length) {
    const group = document.createElement("details");
    group.className = "schedule-more";
    group.innerHTML = `<summary>展开 3 天后的赛程 · ${laterMatches.length} 场</summary>`;
    const list = document.createElement("div");
    list.className = "schedule-more-list";
    laterMatches.forEach((match) => appendRow(match, list));
    group.append(list);
    scheduleGrid.append(group);
  }
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
  const marginHits = data?.marginHits ?? records.filter((item) => item.marginHit).length;

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
      <strong>${percent(marginHits, total)}</strong>
      <span>净胜球 ${marginHits}/${total}</span>
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
      <mark>${isUntracked ? "未纳入统计" : item.marginHit ? "净胜命中" : "净胜未中"}</mark>
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
    const card = document.createElement("details");
    card.className = "memory-card";
    const insights = (entry.insights || []).slice(0, 3).map((item) => `<li>${item}</li>`).join("");
    const risks = (entry.risks || []).slice(0, 2).map((item) => `<li>${item}</li>`).join("");
    card.innerHTML = `
      <summary>
        <strong>${flag(entry.team)} ${entry.team}</strong>
        <span>${entry.matchCount || 0} 场样本 · ${entry.sourceCount || 0} 条线索</span>
        <small>${formatTime(entry.updatedAtIso)}</small>
      </summary>
      <div class="memory-detail">
        <p>${entry.summary || "暂无摘要"}</p>
        <b>可复用观察</b>
        <ul>${insights || "<li>暂无</li>"}</ul>
        <b>风险点</b>
        <ul>${risks || "<li>暂无</li>"}</ul>
      </div>
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
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("复盘服务返回异常，请稍后重试或改为采集单支球队。");
    }
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
  const matches = schedule.filter((match) => isPredictableMatch(match) && matchDay(match.date) === day);
  if (!matches.length) {
    batchStatus.textContent = "这个日期没有可批量预测的比赛。";
    return;
  }
  const credits = Number(currentUser?.predictionCredits ?? currentUser?.freePredictionsLeft ?? 0);
  if (!currentUser) {
    batchStatus.textContent = "请先登录后再使用一键预测。";
    return;
  }
  if (credits < matches.length) {
    batchStatus.textContent = `本次需要 ${matches.length} 次预测，当前剩余 ${credits} 次，请先充值次数包。`;
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
      if (data.user) renderAccount(data.user);
      loadMyPredictions();
    } catch (error) {
      renderBatchRow(match, "error", error.message);
    }
  }

  batchStatus.textContent = `批量预测完成：${okCount}/${matches.length} 场成功，结果已保存。`;
  isBatchPredicting = false;
  batchPredictButton.disabled = false;
  batchDateSelect.disabled = false;
  loadRecords();
  loadMyPredictions();
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
    if (data.user) renderAccount(data.user);
    loadMyPredictions();
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

loginButton.addEventListener("click", () => submitAuth("login").catch((error) => { accountMeta.textContent = error.message; }));
registerButton.addEventListener("click", () => submitAuth("register").catch((error) => { accountMeta.textContent = error.message; }));
logoutButton.addEventListener("click", async () => {
  await fetch(apiPath("auth/logout"), { method: "POST" });
  knownOrderStatuses = null;
  renderAccount(null);
});
openWechatQrButton.addEventListener("click", () => openPaymentQr(payment.wechatQrUrl, "微信收款二维码", "wechat"));
openAlipayQrButton.addEventListener("click", () => openPaymentQr(payment.alipayQrUrl, "支付宝收款二维码", "alipay"));
closePaymentQrButton.addEventListener("click", () => paymentQrDialog.close());
paymentQrDialog.addEventListener("click", (event) => {
  if (event.target === paymentQrDialog) paymentQrDialog.close();
});
paymentProofInput.addEventListener("change", () => {
  proofFileName.textContent = paymentProofInput.files?.[0]?.name || "付款截图（可选）";
});
submitPaymentOrderButton.addEventListener("click", submitPaymentOrder);
redeemButton.addEventListener("click", redeemCode);
batchPredictButton.addEventListener("click", runBatchPrediction);
refreshMemoryButton.addEventListener("click", refreshMemory);

loadAuth().catch((error) => {
  accountMeta.textContent = error.message;
});
loadSchedule();
loadRecords();
loadMemory();
loadConfig().catch((error) => {
  activeBaseLabel.textContent = error.message;
});
loadLiveContext().then(connectLiveEvents).catch(() => connectLiveEvents());
setInterval(loadRecords, 60 * 1000);
setInterval(() => {
  if (currentUser) loadOrders();
}, 10 * 1000);
