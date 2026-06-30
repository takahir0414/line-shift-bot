const { listStores, listShiftSubmissions, getLatestPeriod } = require("../lib/shiftStore");
const { buildStoreView } = require("../lib/shiftView");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function renderWorkingEntry(entry) {
  const time = entry.start ? `${entry.start}-${entry.end || ""}` : "時間未入力";
  return `${escapeHtml(entry.name || "(無名)")}（${escapeHtml(time)}）`;
}

const STATUS_LABELS = {
  shortage: "不足",
  surplus: "過剰",
  ok: "OK",
  unset: "未設定",
};

const STATUS_CLASS = {
  shortage: "status-shortage",
  surplus: "status-surplus",
  ok: "status-ok",
  unset: "status-unset",
};

function renderBandCell(band) {
  const entriesHtml = band.entries.length ? band.entries.map(renderWorkingEntry).join("<br>") : "-";
  const label = STATUS_LABELS[band.status] || band.status;
  const diffText = band.diff ? `（${band.diff > 0 ? "+" : ""}${band.diff}）` : "";
  const requiredText = band.required ?? "未設定";
  return `<td class="${STATUS_CLASS[band.status] || ""}">
    <div>${entriesHtml}</div>
    <div class="band-status">必要${escapeHtml(requiredText)}名／${escapeHtml(label)}${escapeHtml(diffText)}</div>
  </td>`;
}

function renderStoreTable(store) {
  const rows = store.dates
    .map((d) => {
      const dayOff = d.dayOff.length
        ? d.dayOff.map((e) => escapeHtml(e.name || "(無名)")).join("<br>")
        : "-";
      return `<tr>
        <td>${escapeHtml(d.label)}<br><span class="day-type">${escapeHtml(d.dayTypeLabel)}</span></td>
        ${renderBandCell(d.lunch)}
        ${renderBandCell(d.dinner)}
        <td>${dayOff}</td>
      </tr>`;
    })
    .join("\n");

  return `<section>
    <h2>${escapeHtml(store.storeName)}</h2>
    <p>期間開始: ${escapeHtml(store.periodStart)} ／ 提出人数: ${store.submissionCount}名 ／ 不足コマ: ${store.shortageSlots} ／ 過剰コマ: ${store.surplusSlots}</p>
    <table>
      <thead>
        <tr><th>日付</th><th>ランチ</th><th>ディナー</th><th>休み希望</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function renderHtmlPage(stores) {
  const body = stores.length
    ? stores.map(renderStoreTable).join("\n")
    : "<p>表示できる希望シフトデータがありません。</p>";

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>希望シフト一覧</title>
<style>
  body { font-family: sans-serif; margin: 24px; color: #222; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 32px; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; }
  h2 { margin-bottom: 4px; }
  .day-type { font-size: 11px; color: #888; }
  .band-status { font-size: 11px; color: #555; margin-top: 4px; }
  .status-shortage { background: #fde2e2; }
  .status-shortage .band-status { color: #a31515; font-weight: bold; }
  .status-surplus { background: #fff4ce; }
  .status-surplus .band-status { color: #8a6d00; font-weight: bold; }
  .status-ok { background: #e3f6e5; }
  .status-ok .band-status { color: #1e7d32; }
  .status-unset .band-status { color: #888; }
</style>
</head>
<body>
<h1>希望シフト一覧</h1>
${body}
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey || req.query.key !== adminKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const requestedStoreId = req.query.storeId;
  const requestedPeriodStart = req.query.periodStart;

  const storeIds = requestedStoreId ? [requestedStoreId] : await listStores();

  const results = [];
  for (const storeId of storeIds) {
    const periodStart = requestedPeriodStart || (await getLatestPeriod(storeId));
    if (!periodStart) continue;
    const submissions = await listShiftSubmissions(storeId, periodStart);
    results.push(buildStoreView(storeId, periodStart, submissions));
  }

  const wantsJson =
    req.query.format === "json" ||
    (req.headers.accept && req.headers.accept.includes("application/json") && !req.headers.accept.includes("text/html"));

  if (wantsJson) {
    res.status(200).json({ stores: results });
    return;
  }

  res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send(renderHtmlPage(results));
};
