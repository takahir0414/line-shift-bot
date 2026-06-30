const { STORES } = require("../lib/constants");
const { listShiftSubmissions, getLatestPeriod } = require("../lib/shiftStore");
const { buildStoreView, computeFulfillment } = require("../lib/shiftView");
const { getConfirmedShift } = require("../lib/confirmedShiftStore");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function badgeFor(rate) {
  if (rate === null) return { label: "未設定", cls: "badge-unset" };
  if (rate >= 100) return { label: "充足", cls: "badge-ok" };
  if (rate >= 80) return { label: "やや不足", cls: "badge-warn" };
  return { label: "不足", cls: "badge-danger" };
}

function renderCard(row) {
  if (!row.periodStart) {
    return `<div class="card card-empty">
      <div class="card-title">${escapeHtml(row.storeName)}</div>
      <div class="card-empty-text">希望シフトの提出がまだありません</div>
    </div>`;
  }

  const { rate } = computeFulfillment(row);
  const badge = badgeFor(rate);
  const rateText = rate === null ? "-" : `${rate}%`;
  const confirmedText = row.confirmed
    ? `確定済み（${escapeHtml(row.confirmed.confirmedAt)} ／ ${row.confirmed.entries.length}件）`
    : "未確定";

  return `<div class="card">
    <div class="card-head">
      <div class="card-title">${escapeHtml(row.storeName)}</div>
      <span class="badge ${badge.cls}">${escapeHtml(badge.label)}</span>
    </div>
    <div class="card-rate">${escapeHtml(rateText)}</div>
    <div class="card-detail">不足コマ: ${row.shortageSlots} ／ 過剰コマ: ${row.surplusSlots}</div>
    <div class="card-detail">期間: ${escapeHtml(row.periodStart)}（提出${row.submissionCount}名）</div>
    <div class="card-detail">${confirmedText}</div>
    <a class="card-link" href="/api/manager?storeId=${encodeURIComponent(row.storeId)}&periodStart=${encodeURIComponent(row.periodStart)}&key=${encodeURIComponent(row.key)}">確認・確定へ</a>
  </div>`;
}

function renderHtmlPage(rows) {
  const cards = rows.map(renderCard).join("\n");
  const withData = rows.filter((r) => r.periodStart);
  const rates = withData.map((r) => computeFulfillment(r).rate).filter((r) => r !== null);
  const avgRate = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null;
  const totalShortage = rows.reduce((sum, r) => sum + (r.shortageSlots || 0), 0);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>本部ダッシュボード</title>
<style>
  body { font-family: sans-serif; margin: 24px; color: #222; background: #fafafa; }
  h1 { margin-bottom: 4px; }
  .summary { margin-bottom: 20px; font-size: 14px; color: #555; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
  .card { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .card-empty { color: #999; }
  .card-empty-text { font-size: 13px; margin-top: 8px; }
  .card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .card-title { font-weight: bold; font-size: 16px; }
  .card-rate { font-size: 28px; font-weight: bold; margin-bottom: 4px; }
  .card-detail { font-size: 12px; color: #666; margin-bottom: 2px; }
  .card-link { display: inline-block; margin-top: 10px; font-size: 13px; color: #1a56db; text-decoration: none; }
  .card-link:hover { text-decoration: underline; }
  .badge { font-size: 12px; font-weight: bold; padding: 3px 10px; border-radius: 999px; }
  .badge-ok { background: #e3f6e5; color: #1e7d32; }
  .badge-warn { background: #fff4ce; color: #8a6d00; }
  .badge-danger { background: #fde2e2; color: #a31515; }
  .badge-unset { background: #eee; color: #888; }
</style>
</head>
<body>
<h1>本部ダッシュボード</h1>
<p class="summary">店舗サマリー（${rows.length}店舗） ／ 平均充足率: ${avgRate === null ? "-" : avgRate + "%"} ／ 全店舗 不足コマ合計: ${totalShortage}</p>
<div class="grid">
${cards}
</div>
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
