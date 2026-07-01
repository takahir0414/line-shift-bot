const { getLatestPeriod, listShiftSubmissions } = require("../lib/shiftStore");
const { buildCalendarView } = require("../lib/shiftView");
const { saveConfirmedShift, getConfirmedShift } = require("../lib/confirmedShiftStore");
const { getBudget } = require("../lib/budgetStore");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function adoptFieldName(userId, date) {
  return `adopt_${userId}_${date}`;
}

// 営業時間スケール: 8:00〜26:00（深夜2時）の18時間を100%として時間軸バーを描画する。
const SCALE_START_MINUTES = 8 * 60;
const SCALE_END_MINUTES = 26 * 60;
const SCALE_RANGE_MINUTES = SCALE_END_MINUTES - SCALE_START_MINUTES;

function timeToMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  let minutes = h * 60 + m;
  if (minutes < SCALE_START_MINUTES) minutes += 24 * 60; // 日またぎ（例: 01:00→25:00扱い）
  return minutes;
}

function renderTimeBar(start, end, band) {
  if (!start || !end) return "";
  const startMin = timeToMinutes(start);
  const endMin = timeToMinutes(end);
  const left = Math.max(0, Math.min(100, ((startMin - SCALE_START_MINUTES) / SCALE_RANGE_MINUTES) * 100));
  const width = Math.max(2, Math.min(100 - left, ((endMin - startMin) / SCALE_RANGE_MINUTES) * 100));
  const cls = band === "lunch" ? "bar-lunch" : "bar-dinner";
  return `<div class="time-bar-track"><div class="time-bar-fill ${cls}" style="left:${left.toFixed(1)}%;width:${width.toFixed(1)}%"></div></div>`;
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

function renderBudgetRow(store, budget) {
  const cells = store.dates.map((d) => {
    const b = budget[d.date] || {};
    const rev = b.revenue ? `¥${b.revenue.toLocaleString()}` : "-";
    return `<td>${escapeHtml(rev)}</td>`;
  }).join("\n");
  return `<tr class="row-meta"><th>売上予算</th>${cells}</tr>`;
}

function renderLaborRow(store, budget) {
  const cells = store.dates.map((d) => {
    const b = budget[d.date] || {};
    const lab = b.laborCost ? `¥${b.laborCost.toLocaleString()}` : "-";
    const ratio = (b.revenue && b.laborCost)
      ? Math.round(b.laborCost / b.revenue * 100)
      : null;
    const cls = ratio === null ? "" : ratio <= 30 ? "ratio-ok" : ratio <= 35 ? "ratio-warn" : "ratio-bad";
    const ratioText = ratio !== null ? `<br><span class="${cls}">${ratio}%</span>` : "";
    return `<td>${escapeHtml(lab)}${ratioText}</td>`;
  }).join("\n");
  return `<tr class="row-meta"><th>人件費（率）</th>${cells}</tr>`;
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
    ${renderTimeBar(cell.start, cell.end, cell.band)}
  </td>`;
}

function renderStaffRow(staff, store, adoptedKeys) {
  const cells = store.dates
    .map((d) => renderCell(staff.cells[d.date], staff.userId, d.date, adoptedKeys))
    .join("\n");
  return `<tr><th class="staff-name">${escapeHtml(staff.name)}</th>${cells}</tr>`;
}

const HOUR_TICKS = [];
for (let h = 8; h <= 26; h++) HOUR_TICKS.push(h);

function renderGanttHourHeader() {
  const ticks = HOUR_TICKS.map((h) => `<span>${h}</span>`).join("");
  return `<div class="gantt-hours">${ticks}</div>`;
}

function renderGanttBar(cell) {
  const left = Math.max(0, Math.min(100, ((timeToMinutes(cell.start) - SCALE_START_MINUTES) / SCALE_RANGE_MINUTES) * 100));
  const width = Math.max(1.5, Math.min(100 - left, ((timeToMinutes(cell.end) - timeToMinutes(cell.start)) / SCALE_RANGE_MINUTES) * 100));
  const cls = cell.band === "lunch" ? "bar-lunch" : "bar-dinner";
  const label = `${cell.start}-${cell.end || ""}`;
  return `<div class="gantt-bar ${cls}" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%" title="${escapeHtml(label)}">${escapeHtml(label)}</div>`;
}

function renderGanttDay(d, store) {
  const workingStaff = store.staffRows
    .map((staff) => ({ staff, cell: staff.cells[d.date] }))
    .filter(({ cell }) => cell.type === "working");

  if (!workingStaff.length) {
    return `<div class="gantt-day">
      <h3>${escapeHtml(d.label)} <span class="day-type">${escapeHtml(d.dayTypeLabel)}</span></h3>
      <p class="gantt-empty">出勤希望がありません</p>
    </div>`;
  }

  const rows = workingStaff
    .map(({ staff, cell }) => `<div class="gantt-row">
      <div class="gantt-name">${escapeHtml(staff.name)}</div>
      <div class="gantt-track">${renderGanttBar(cell)}</div>
    </div>`)
    .join("\n");

  return `<div class="gantt-day">
    <h3>${escapeHtml(d.label)} <span class="day-type">${escapeHtml(d.dayTypeLabel)}</span></h3>
    ${renderGanttHourHeader()}
    ${rows}
  </div>`;
}

function renderGanttSection(store) {
  const days = store.dates.map((d) => renderGanttDay(d, store)).join("\n");
  return `<h2>時間軸で見るシフト状況</h2>
  <p class="scale-note">横軸は8:00〜26:00。バーが実際の出勤予定時間です。</p>
  <div class="gantt-wrap">${days}</div>`;
}

function renderForm(store, key, adoptedKeys, confirmed, budget) {
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
  .time-bar-track { position: relative; width: 64px; height: 6px; background: #eee; border-radius: 3px; margin: 4px auto 0; }
  .time-bar-fill { position: absolute; top: 0; height: 100%; border-radius: 3px; }
  .bar-lunch { background: #f2a93b; }
  .bar-dinner { background: #4a78d6; }
  .status-shortage { background: #fde2e2; color: #a31515; }
  .status-surplus { background: #fff4ce; color: #8a6d00; }
  .status-ok { background: #e3f6e5; color: #1e7d32; }
  .confirmed-note { color: #555; background: #f5f5f5; padding: 8px 12px; border-radius: 4px; }
  .ratio-ok { color: #1e7d32; font-weight: bold; }
  .ratio-warn { color: #8a6d00; font-weight: bold; }
  .ratio-bad { color: #a31515; font-weight: bold; }
  .budget-link { font-size: 13px; color: #1a56db; }
  .scale-note { font-size: 12px; color: #777; }
  .bar-lunch-dot, .bar-dinner-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin: 0 2px; }
  .bar-lunch-dot { background: #f2a93b; }
  .bar-dinner-dot { background: #4a78d6; }
  button { font-size: 16px; padding: 10px 24px; cursor: pointer; }

  .gantt-wrap { margin-top: 16px; }
  .gantt-day { border: 1px solid #ddd; border-radius: 6px; padding: 12px 16px; margin-bottom: 16px; }
  .gantt-day h3 { margin: 0 0 8px 0; font-size: 15px; }
  .gantt-empty { color: #999; font-size: 13px; margin: 0; }
  .gantt-hours { display: flex; justify-content: space-between; font-size: 11px; color: #888; padding-left: 100px; margin-bottom: 4px; }
  .gantt-row { display: flex; align-items: center; margin-bottom: 6px; }
  .gantt-name { width: 100px; flex-shrink: 0; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gantt-track {
    position: relative; flex: 1; height: 24px; background: #fafafa;
    background-image: repeating-linear-gradient(to right, #eee 0, #eee 1px, transparent 1px, transparent calc(100% / 18));
    border: 1px solid #eee; border-radius: 4px;
  }
  .gantt-bar {
    position: absolute; top: 2px; height: 20px; border-radius: 3px;
    font-size: 10px; color: #fff; line-height: 20px; overflow: hidden;
    white-space: nowrap; padding: 0 4px; box-sizing: border-box;
  }
</style>
</head>
<body>
<h1>店長確認・確定 - ${escapeHtml(store.storeName)}</h1>
<p>期間開始: ${escapeHtml(store.periodStart)} ／ 提出人数: ${store.submissionCount}名</p>
<p class="scale-note">セル内の横棒は出勤時間帯のイメージです（左端8:00〜右端26:00のスケール／<span class="bar-lunch-dot"></span>昼・<span class="bar-dinner-dot"></span>夜）</p>
<p><a class="budget-link" href="/api/budget?storeId=${escapeHtml(store.storeId)}&periodStart=${escapeHtml(store.periodStart)}&key=${escapeHtml(key)}">📊 日割り予算・人件費を入力する</a></p>
${confirmedNote}
<form method="POST" action="/api/manager">
  <input type="hidden" name="key" value="${escapeHtml(key)}">
  <input type="hidden" name="storeId" value="${escapeHtml(store.storeId)}">
  <input type="hidden" name="periodStart" value="${escapeHtml(store.periodStart)}">
  <div class="table-wrap">
    <table>
      <thead>${renderDayTypeRow(store)}</thead>
      <tbody>
        ${renderBudgetRow(store, budget)}
        ${renderLaborRow(store, budget)}
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
${renderGanttSection(store)}
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
    const budget = await getBudget(storeId, periodStart);

    res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send(renderForm(store, key, adoptedKeys, confirmed, budget));
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
