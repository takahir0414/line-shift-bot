const { STORES } = require("../lib/constants");
const { listShiftSubmissions, getLatestPeriod } = require("../lib/shiftStore");
const { buildStoreView } = require("../lib/shiftView");
const { getConfirmedShift } = require("../lib/confirmedShiftStore");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function renderShortageBar(shortageSlots, totalSlots) {
  if (!totalSlots) return "-";
  const pct = Math.round((shortageSlots / totalSlots) * 100);
  return `<div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><span class="bar-label">${shortageSlots}/${totalSlots}コマ不足</span>`;
}

function renderRow(row) {
  if (!row.periodStart) {
    return `<tr>
      <td>${escapeHtml(row.storeName)}</td>
      <td colspan="4">希望シフトの提出がまだありません</td>
    </tr>`;
  }

  const totalSlots = row.dates.length * 2;
  const confirmedText = row.confirmed
    ? `確定済み（${escapeHtml(row.confirmed.confirmedAt)} ／ ${row.confirmed.entries.length}件）`
    : "未確定";

  return `<tr>
    <td>${escapeHtml(row.storeName)}</td>
    <td>${escapeHtml(row.periodStart)}（提出${row.submissionCount}名）</td>
    <td>${renderShortageBar(row.shortageSlots, totalSlots)}</td>
    <td>${confirmedText}</td>
    <td><a href="/api/manager?storeId=${encodeURIComponent(row.storeId)}&periodStart=${encodeURIComponent(row.periodStart)}&key=${encodeURIComponent(row.key)}">確認・確定へ</a></td>
  </tr>`;
}

function renderHtmlPage(rows) {
  const body = rows.map(renderRow).join("\n");
  const totalShortage = rows.reduce((sum, r) => sum + (r.shortageSlots || 0), 0);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>本部ダッシュボード</title>
<style>
  body { font-family: sans-serif; margin: 24px; color: #222; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; vertical-align: middle; }
  th { background: #f0f0f0; }
  .bar-track { display: inline-block; width: 120px; height: 10px; background: #eee; border-radius: 5px; overflow: hidden; vertical-align: middle; }
  .bar-fill { height: 100%; background: #d9534f; }
  .bar-label { margin-left: 8px; font-size: 12px; color: #555; }
  .summary { margin-bottom: 16px; font-size: 14px; color: #555; }
</style>
</head>
<body>
<h1>本部ダッシュボード</h1>
<p class="summary">全店舗 不足コマ合計: ${totalShortage}</p>
<table>
  <thead>
    <tr><th>店舗</th><th>直近期間</th><th>不足状況</th><th>確定状況</th><th>操作</th></tr>
  </thead>
  <tbody>${body}</tbody>
</table>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const adminKey = process.env.ADMIN_API_KEY;
  const key = req.query.key;
  if (!adminKey || key !== adminKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const operationalStores = STORES.filter((s) => s.id !== "honbu");

  const rows = [];
  for (const store of operationalStores) {
    const periodStart = await getLatestPeriod(store.id);
    if (!periodStart) {
      rows.push({ storeId: store.id, storeName: store.name, periodStart: null, key });
      continue;
    }
    const submissions = await listShiftSubmissions(store.id, periodStart);
    const view = buildStoreView(store.id, periodStart, submissions);
    const confirmed = await getConfirmedShift(store.id, periodStart);
    rows.push({ ...view, confirmed, key });
  }

  res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send(renderHtmlPage(rows));
};
