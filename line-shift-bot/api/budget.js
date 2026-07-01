const { STORES } = require("../lib/constants");
const { buildPeriodDates, formatMD, weekdayLabel } = require("../lib/flex");
const { getLatestPeriod } = require("../lib/shiftStore");
const { saveBudget, getBudget } = require("../lib/budgetStore");
const { getDayType } = require("../lib/holidays");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

const storeNameById = STORES.reduce((acc, s) => { acc[s.id] = s.name; return acc; }, {});

function renderForm(storeId, storeName, periodStart, dates, budget, key) {
  const rows = dates.map((iso) => {
    const label = `${formatMD(iso)}（${weekdayLabel(iso)}）`;
    const dayType = getDayType(iso);
    const dayTypeLabel = dayType === "holiday" ? "祝休日" : "平日";
    const b = budget[iso] || {};
    return `<tr>
      <td>${escapeHtml(label)}<br><span class="day-type">${escapeHtml(dayTypeLabel)}</span></td>
      <td><input type="number" name="revenue_${iso}" value="${escapeHtml(b.revenue ?? "")}" min="0" step="1000" placeholder="例: 300000"></td>
      <td><input type="number" name="labor_${iso}" value="${escapeHtml(b.laborCost ?? "")}" min="0" step="1000" placeholder="例: 90000"></td>
      <td class="ratio-cell" id="ratio_${iso}">${computeRatioHtml(b.revenue, b.laborCost)}</td>
    </tr>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>日割り予算入力 - ${escapeHtml(storeName)}</title>
<style>
  body { font-family: sans-serif; margin: 24px; color: #222; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 24px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: center; font-size: 13px; white-space: nowrap; }
  th { background: #f5f5f5; }
  td:first-child { text-align: left; }
  .day-type { font-size: 10px; color: #888; }
  input[type=number] { width: 120px; padding: 4px 6px; border: 1px solid #ccc; border-radius: 3px; font-size: 13px; }
  .ratio-ok { color: #1e7d32; font-weight: bold; }
  .ratio-warn { color: #8a6d00; font-weight: bold; }
  .ratio-bad { color: #a31515; font-weight: bold; }
  button { font-size: 16px; padding: 10px 24px; cursor: pointer; margin-top: 8px; }
  .back-link { font-size: 13px; margin-top: 16px; display: inline-block; color: #1a56db; }
</style>
<script>
function updateRatio(iso) {
  const rev = parseFloat(document.querySelector('[name="revenue_' + iso + '"]').value) || 0;
  const lab = parseFloat(document.querySelector('[name="labor_' + iso + '"]').value) || 0;
  const cell = document.getElementById('ratio_' + iso);
  if (!rev || !lab) { cell.textContent = '-'; cell.className = 'ratio-cell'; return; }
  const ratio = Math.round(lab / rev * 100);
  cell.textContent = ratio + '%';
  cell.className = 'ratio-cell ' + (ratio <= 30 ? 'ratio-ok' : ratio <= 35 ? 'ratio-warn' : 'ratio-bad');
}
window.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('input[type=number]').forEach(inp => {
    const m = inp.name.match(/_(\\d{4}-\\d{2}-\\d{2})$/);
    if (m) inp.addEventListener('input', () => updateRatio(m[1]));
  });
});
</script>
</head>
<body>
<h1>日割り予算入力</h1>
<h2>${escapeHtml(storeName)}</h2>
<p>期間: ${escapeHtml(periodStart)} 〜（14日間）</p>
<form method="POST" action="/api/budget">
  <input type="hidden" name="key" value="${escapeHtml(key)}">
  <input type="hidden" name="storeId" value="${escapeHtml(storeId)}">
  <input type="hidden" name="periodStart" value="${escapeHtml(periodStart)}">
  <table>
    <thead>
      <tr><th>日付</th><th>売上予算（円）</th><th>人件費（円）</th><th>人件費率</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <button type="submit">保存する</button>
</form>
<a class="back-link" href="/api/manager?storeId=${encodeURIComponent(storeId)}&periodStart=${encodeURIComponent(periodStart)}&key=${encodeURIComponent(key)}">← 店長確認・確定画面に戻る</a>
</body>
</html>`;
}

function computeRatioHtml(revenue, laborCost) {
  if (!revenue || !laborCost) return "-";
  const ratio = Math.round(laborCost / revenue * 100);
  return `${ratio}%`;
}

function renderDonePage(storeId, periodStart, key) {
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>保存しました</title>
<style>body{font-family:sans-serif;margin:24px;}</style></head><body>
<h1>保存しました</h1>
<p><a href="/api/budget?storeId=${encodeURIComponent(storeId)}&periodStart=${encodeURIComponent(periodStart)}&key=${encodeURIComponent(key)}">← 予算入力に戻る</a></p>
<p><a href="/api/manager?storeId=${encodeURIComponent(storeId)}&periodStart=${encodeURIComponent(periodStart)}&key=${encodeURIComponent(key)}">店長確認・確定画面へ</a></p>
</body></html>`;
}

module.exports = async function handler(req, res) {
  const adminKey = process.env.ADMIN_API_KEY;

  if (req.method === "GET") {
    const key = req.query.key;
    if (!adminKey || key !== adminKey) { res.status(401).json({ error: "Unauthorized" }); return; }

    const storeId = req.query.storeId;
    if (!storeId) { res.status(400).send("storeId is required"); return; }

    const periodStart = req.query.periodStart || await getLatestPeriod(storeId);
    if (!periodStart) { res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send("<p>シフト期間データがありません</p>"); return; }

    const dates = buildPeriodDates(periodStart);
    const budget = await getBudget(storeId, periodStart);
    const storeName = storeNameById[storeId] || storeId;

    res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send(renderForm(storeId, storeName, periodStart, dates, budget, key));
    return;
  }

  if (req.method === "POST") {
    const body = req.body || {};
    if (!adminKey || body.key !== adminKey) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { storeId, periodStart } = body;
    if (!storeId || !periodStart) { res.status(400).send("storeId and periodStart are required"); return; }

    const dates = buildPeriodDates(periodStart);
    const dailyBudgets = {};
    for (const iso of dates) {
      const revenue = parseInt(body[`revenue_${iso}`], 10) || null;
      const laborCost = parseInt(body[`labor_${iso}`], 10) || null;
      if (revenue !== null || laborCost !== null) {
        dailyBudgets[iso] = { revenue, laborCost };
      }
    }
    await saveBudget(storeId, periodStart, dailyBudgets);

    res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send(renderDonePage(storeId, periodStart, body.key));
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
