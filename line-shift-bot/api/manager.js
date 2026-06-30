const { getLatestPeriod, listShiftSubmissions } = require("../lib/shiftStore");
const { buildCalendarView } = require("../lib/shiftView");
const { saveConfirmedShift, getConfirmedShift } = require("../lib/confirmedShiftStore");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function adoptFieldName(userId, date) {
  return `adopt_${userId}_${date}`;
}

const STATUS_LABELS = { shortage: "不足", surplus: "過剰", ok: "OK", unset: "-" };
const STATUS_CLASS = {
  shortage: "status-shortage",
  surplus: "status-surplus",
  ok: "status-ok",
  unset: "status-unset",
};

function renderRequiredRow(label, store, band) {
  const cells = store.dates
    .map((d) => `<td>${escapeHtml(d[band].required ?? "-")}</td>`)
    .join("\n");
  return `<tr class="row-meta"><th>${escapeHtml(label)}必要人数</th>${cells}</tr>`;
}

function renderFulfillmentRow(label, store, band) {
  const cells = store.dates
    .map((d) => {
      const b = d[band];
      const label2 = STATUS_LABELS[b.status] || b.status;
      return `<td class="${STATUS_CLASS[b.status] || ""}">${b.entries.length}名（${escapeHtml(label2)}）</td>`;
    })
    .join("\n");
  return `<tr class="row-meta"><th>${escapeHtml(label)}充足</th>${cells}</tr>`;
}

function renderDayTypeRow(store) {
  const cells = store.dates
    .map((d) => `<td>${escapeHtml(d.label)}<br><span class="day-type">${escapeHtml(d.dayTypeLabel)}</span></td>`)
    .join("\n");
  return `<tr><th>日付</th>${cells}</tr>`;
}

function renderCell(cell, userId, date, adoptedKeys) {
  if (cell.type === "none") return `<td class="cell-none">-</td>`;
  if (cell.type === "dayoff") return `<td class="cell-dayoff">休</td>`;

  const fieldName = adoptFieldName(userId, date);
  const checked = adoptedKeys === null || adoptedKeys.has(fieldName) ? "checked" : "";
  const time = cell.start ? `${cell.start}-${cell.end || ""}` : "時間未入力";
  const bandLabel = cell.band === "lunch" ? "昼" : "夜";
  return `<td class="cell-working">
    <label class="cell-checkbox">
      <input type="checkbox" name="${escapeHtml(fieldName)}" ${checked}>
      <span class="cell-band">${escapeHtml(bandLabel)}</span><br>${escapeHtml(time)}
    </label>
  </td>`;
}

function renderStaffRow(staff, store, adoptedKeys) {
  const cells = store.dates
    .map((d) => renderCell(staff.cells[d.date], staff.userId, d.date, adoptedKeys))
    .join("\n");
  return `<tr><th class="staff-name">${escapeHtml(staff.name)}</th>${cells}</tr>`;
}

function renderForm(store, key, adoptedKeys, confirmed) {
  const staffRows = store.staffRows.length
    ? store.staffRows.map((s) => renderStaffRow(s, store, adoptedKeys)).join("\n")
    : `<tr><th class="staff-name">-</th><td colspan="${store.dates.length}">出勤希望の提出がありません</td></tr>`;

  const confirmedNote = confirmed
    ? `<p class="confirmed-note">前回確定日時: ${escapeHtml(confirmed.confirmedAt)}（${confirmed.entries.length}件採用）。再度「この内容で確定する」を押すと上書きされます。</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>店長確認・確定 - ${escapeHtml(store.storeName)}</title>
<style>
  body { font-family: sans-serif; margin: 24px; color: #222; }
  .table-wrap { overflow-x: auto; margin-bottom: 24px; }
  table { border-collapse: collapse; min-width: 100%; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: center; vertical-align: middle; font-size: 13px; white-space: nowrap; }
  thead th, .row-meta th { background: #f5f5f5; }
  .staff-name { background: #fafafa; text-align: left; white-space: nowrap; }
  .day-type { font-size: 10px; color: #888; }
  .cell-none { color: #ccc; }
  .cell-dayoff { color: #888; background: #f0f0f0; }
  .cell-checkbox { display: inline-block; cursor: pointer; }
  .cell-band { font-size: 10px; color: #888; }
  .status-shortage { background: #fde2e2; color: #a31515; }
  .status-surplus { background: #fff4ce; color: #8a6d00; }
  .status-ok { background: #e3f6e5; color: #1e7d32; }
  .confirmed-note { color: #555; background: #f5f5f5; padding: 8px 12px; border-radius: 4px; }
  button { font-size: 16px; padding: 10px 24px; cursor: pointer; }
</style>
</head>
<body>
<h1>店長確認・確定 - ${escapeHtml(store.storeName)}</h1>
<p>期間開始: ${escapeHtml(store.periodStart)} ／ 提出人数: ${store.submissionCount}名</p>
${confirmedNote}
<form method="POST" action="/api/manager">
  <input type="hidden" name="key" value="${escapeHtml(key)}">
  <input type="hidden" name="storeId" value="${escapeHtml(store.storeId)}">
  <input type="hidden" name="periodStart" value="${escapeHtml(store.periodStart)}">
  <div class="table-wrap">
    <table>
      <thead>${renderDayTypeRow(store)}</thead>
      <tbody>
        ${renderRequiredRow("ランチ", store, "lunch")}
        ${renderFulfillmentRow("ランチ", store, "lunch")}
        ${renderRequiredRow("ディナー", store, "dinner")}
        ${renderFulfillmentRow("ディナー", store, "dinner")}
        ${staffRows}
      </tbody>
    </table>
  </div>
  <button type="submit">この内容で確定する</button>
</form>
</body>
</html>`;
}

function renderDoneScreen(store, record) {
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"><title>確定しました</title>
<style>body { font-family: sans-serif; margin: 24px; }</style>
</head>
<body>
<h1>確定しました</h1>
<p>${escapeHtml(store.storeName)} ／ 期間開始: ${escapeHtml(store.periodStart)}</p>
<p>確定日時: ${escapeHtml(record.confirmedAt)} ／ 採用人数: ${record.entries.length}件</p>
<p><a href="?storeId=${encodeURIComponent(store.storeId)}&periodStart=${encodeURIComponent(store.periodStart)}&key=${encodeURIComponent(store._key)}">確認画面に戻る</a></p>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  const adminKey = process.env.ADMIN_API_KEY;

  if (req.method === "GET") {
    const key = req.query.key;
    if (!adminKey || key !== adminKey) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const storeId = req.query.storeId;
    if (!storeId) {
      res.status(400).send("storeId is required");
      return;
    }

    const periodStart = req.query.periodStart || (await getLatestPeriod(storeId));
    if (!periodStart) {
      res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send("<p>表示できる希望シフトデータがありません。</p>");
      return;
    }

    const submissions = await listShiftSubmissions(storeId, periodStart);
    const store = buildCalendarView(storeId, periodStart, submissions);
    const confirmed = await getConfirmedShift(storeId, periodStart);
    const adoptedKeys = confirmed
      ? new Set(confirmed.entries.map((e) => adoptFieldName(e.userId, e.date)))
      : null;

    res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send(renderForm(store, key, adoptedKeys, confirmed));
    return;
  }

  if (req.method === "POST") {
    const body = req.body || {};
    if (!adminKey || body.key !== adminKey) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const storeId = body.storeId;
    const periodStart = body.periodStart;
    if (!storeId || !periodStart) {
      res.status(400).send("storeId and periodStart are required");
      return;
    }

    const submissions = await listShiftSubmissions(storeId, periodStart);
    const store = buildCalendarView(storeId, periodStart, submissions);

    const entries = [];
    for (const staff of store.staffRows) {
      for (const d of store.dates) {
        const cell = staff.cells[d.date];
        if (cell.type !== "working") continue;
        const fieldName = adoptFieldName(staff.userId, d.date);
        if (body[fieldName]) {
          entries.push({ date: d.date, userId: staff.userId, name: staff.name, start: cell.start, end: cell.end });
        }
      }
    }

    const record = await saveConfirmedShift(storeId, periodStart, entries);
    store._key = body.key;
    res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send(renderDoneScreen(store, record));
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
