const adminTokenInput = document.querySelector("#adminToken");
const loadDashboardButton = document.querySelector("#loadDashboard");
const adminStatus = document.querySelector("#adminStatus");
const adminStats = document.querySelector("#adminStats");
const topPlans = document.querySelector("#topPlans");
const adminPlanSelect = document.querySelector("#adminPlan");
const adminCodeCount = document.querySelector("#adminCodeCount");
const adminCodeNote = document.querySelector("#adminCodeNote");
const generateCodesButton = document.querySelector("#generateCodes");
const copyLatestCodesButton = document.querySelector("#copyLatestCodes");
const adminCodes = document.querySelector("#adminCodes");
const adminUsers = document.querySelector("#adminUsers");
const adminOrders = document.querySelector("#adminOrders");
const refreshOrdersButton = document.querySelector("#refreshOrders");
const proofDialog = document.querySelector("#proofDialog");
const proofImage = document.querySelector("#proofImage");
const closeProofButton = document.querySelector("#closeProof");

let plans = [];
let latestGeneratedCodes = [];

function apiPath(path) {
  return `api/${path.replace(/^\//, "")}`;
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

function price(value) {
  const number = Number(value || 0);
  return number.toFixed(number === 0.01 ? 2 : 1).replace(/\.0$/, "");
}

async function copyText(text) {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-999px";
    document.body.append(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  }
}

function authHeaders() {
  return { "x-admin-token": adminTokenInput.value };
}

function renderStats(stats = {}) {
  const items = [
    ["用户数", stats.users ?? 0],
    ["总余额次数", stats.totalCredits ?? 0],
    ["今日预测", stats.todayPredictions ?? 0],
    ["今日活跃", stats.todayPredictionUsers ?? 0],
    ["累计预测", stats.predictionTotal ?? 0],
    ["预测消耗", stats.predictionCreditsUsed ?? 0],
    ["今日收入", `￥${price(stats.todayRevenue)}`],
    ["累计收入", `￥${price(stats.totalRevenue)}`],
    ["付费用户", stats.paidUsers ?? 0],
    ["转化率", `${stats.conversionRate ?? 0}%`],
    ["未用充值码", stats.unusedCodes ?? 0],
    ["已用充值码", stats.usedCodes ?? 0],
  ];
  adminStats.innerHTML = items.map(([label, value]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join("");
}

function renderTopPlans(items = []) {
  topPlans.innerHTML = "";
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "admin-user-row";
    row.innerHTML = `
      <strong>${item.planName}</strong>
      <span>${item.count} 单</span>
      <small>￥${price(item.revenue)}</small>
    `;
    topPlans.append(row);
  }
  if (!items.length) topPlans.innerHTML = `<div class="order-empty">暂无销售数据</div>`;
}

function renderPlanOptions() {
  const current = adminPlanSelect.value || plans[0]?.id || "";
  adminPlanSelect.innerHTML = "";
  for (const plan of plans) {
    const suffix = Number(plan.price) === 0.01 ? " · 测试" : "";
    adminPlanSelect.add(new Option(`${plan.name} · ￥${price(plan.price)} · ${plan.credits} 次${suffix}`, plan.id));
  }
  adminPlanSelect.value = plans.some((plan) => plan.id === current) ? current : plans[0]?.id || "";
}

function renderCodes(codes = []) {
  adminCodes.innerHTML = "";
  for (const code of codes) {
    const row = document.createElement("div");
    row.className = `code-item is-${code.status}`;
    row.innerHTML = `
      <strong>${code.code}</strong>
      <span>${code.planName} · ￥${price(code.amount)} · ${code.credits} 次</span>
      <small>${code.status === "used" ? `已使用 · ${code.usedByPhone || "未知用户"}` : "未使用"} · ${formatTime(code.createdAtIso)}</small>
      <button type="button" ${code.status === "used" ? "disabled" : ""}>复制</button>
    `;
    row.querySelector("button")?.addEventListener("click", async () => {
      adminStatus.textContent = (await copyText(code.code)) ? `已复制 ${code.code}` : "复制失败，请手动选择。";
    });
    adminCodes.append(row);
  }
  if (!codes.length) adminCodes.innerHTML = `<div class="order-empty">暂无充值码</div>`;
}

function renderUsers(users = []) {
  adminUsers.innerHTML = "";
  for (const user of users) {
    const row = document.createElement("div");
    row.className = "admin-user-row";
    row.innerHTML = `
      <strong>${user.phone}</strong>
      <span>剩余 ${user.credits} 次</span>
      <small>${user.planName || "未充值"} · ${formatTime(user.createdAtIso)}</small>
    `;
    adminUsers.append(row);
  }
  if (!users.length) adminUsers.innerHTML = `<div class="order-empty">暂无用户</div>`;
}

function renderOrders(orders = []) {
  adminOrders.innerHTML = "";
  for (const order of orders) {
    const row = document.createElement("div");
    const statusLabel = order.status === "approved" ? "已到账" : order.status === "rejected" ? "已驳回" : "待审核";
    row.className = `order-item admin-order-item is-${order.status}`;
    row.innerHTML = `
      <strong>${order.planName} · ￥${price(order.amount)}</strong>
      <span>${order.phone || ""} · ${order.paymentMethod === "wechat" ? "微信" : order.paymentMethod === "alipay" ? "支付宝" : "充值码"} · ${order.payerName || ""}</span>
      <small>${statusLabel} · ${order.credits || ""} 次 · ${order.orderNo} · ${formatTime(order.createdAtIso)}${order.rejectReason ? ` · ${order.rejectReason}` : ""}</small>
      <div class="order-actions">
        ${order.hasProof ? `<button type="button" data-action="proof">查看凭证</button>` : ""}
        ${order.status === "pending" ? `<button type="button" data-action="approve">确认到账</button><button type="button" class="secondary" data-action="reject">驳回</button>` : ""}
      </div>
    `;
    row.querySelector('[data-action="proof"]')?.addEventListener("click", () => openProof(order.id).catch((error) => { adminStatus.textContent = error.message; }));
    row.querySelector('[data-action="approve"]')?.addEventListener("click", () => approveOrder(order.id).catch((error) => { adminStatus.textContent = error.message; }));
    row.querySelector('[data-action="reject"]')?.addEventListener("click", () => rejectOrder(order.id).catch((error) => { adminStatus.textContent = error.message; }));
    adminOrders.append(row);
  }
  if (!orders.length) adminOrders.innerHTML = `<div class="order-empty">暂无订单</div>`;
}

async function openProof(orderId) {
  adminStatus.textContent = "正在读取付款凭证...";
  const res = await fetch(`${apiPath("admin/orders/proof")}?orderId=${encodeURIComponent(orderId)}`, { headers: authHeaders() });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "付款凭证读取失败");
  }
  const blob = await res.blob();
  if (proofImage.src.startsWith("blob:")) URL.revokeObjectURL(proofImage.src);
  proofImage.src = URL.createObjectURL(blob);
  proofDialog.showModal();
  adminStatus.textContent = "付款凭证已打开。";
}

async function approveOrder(orderId) {
  const res = await fetch(apiPath("admin/orders/approve"), {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify({ orderId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "确认到账失败");
  adminStatus.textContent = `订单 ${data.order.orderNo} 已确认，${data.order.credits} 次已到账。`;
  await refreshDashboard();
}

async function rejectOrder(orderId) {
  const reason = window.prompt("请输入驳回原因", "付款信息未核实");
  if (reason === null) return;
  const res = await fetch(apiPath("admin/orders/reject"), {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify({ orderId, reason }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "驳回失败");
  adminStatus.textContent = `订单 ${data.order.orderNo} 已驳回。`;
  await refreshDashboard();
}

async function loadOverview() {
  adminStatus.textContent = "正在读取后台数据...";
  const res = await fetch(apiPath("admin/overview"), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "后台数据读取失败");
  plans = data.plans || [];
  renderStats(data.stats);
  renderTopPlans(data.topPlans || []);
  renderPlanOptions();
  renderUsers(data.users || []);
  adminStatus.textContent = "后台数据已更新。";
}

async function loadOrders() {
  const res = await fetch(apiPath("admin/orders"), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "订单读取失败");
  renderOrders(data.orders || []);
}

async function loadCodes() {
  const res = await fetch(apiPath("admin/redeem-codes"), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "充值码读取失败");
  renderCodes(data.codes || []);
}

async function refreshDashboard() {
  await loadOverview();
  await Promise.all([loadOrders(), loadCodes()]);
}

async function generateCodes() {
  generateCodesButton.disabled = true;
  adminStatus.textContent = "正在生成充值码...";
  try {
    const res = await fetch(apiPath("admin/redeem-codes"), {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        planId: adminPlanSelect.value,
        count: adminCodeCount.value,
        note: adminCodeNote.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "充值码生成失败");
    latestGeneratedCodes = data.codes || [];
    renderCodes(latestGeneratedCodes);
    adminStatus.textContent = `已生成 ${latestGeneratedCodes.length} 个充值码。`;
    loadOverview().catch(() => {});
  } finally {
    generateCodesButton.disabled = false;
  }
}

loadDashboardButton.addEventListener("click", () => refreshDashboard().catch((error) => { adminStatus.textContent = error.message; }));
refreshOrdersButton.addEventListener("click", () => Promise.all([loadOrders(), loadCodes()]).catch((error) => { adminStatus.textContent = error.message; }));
generateCodesButton.addEventListener("click", () => generateCodes().catch((error) => { adminStatus.textContent = error.message; }));
copyLatestCodesButton.addEventListener("click", async () => {
  const text = latestGeneratedCodes.map((code) => code.code).join("\n");
  if (!text) {
    adminStatus.textContent = "没有可复制的本次生成充值码。";
    return;
  }
  adminStatus.textContent = (await copyText(text)) ? `已复制 ${latestGeneratedCodes.length} 个充值码。` : "复制失败，请手动选择。";
});
closeProofButton.addEventListener("click", () => proofDialog.close());
proofDialog.addEventListener("click", (event) => {
  if (event.target === proofDialog) proofDialog.close();
});
