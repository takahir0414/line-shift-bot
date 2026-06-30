const { STORES, REQUIRED_HEADCOUNT } = require("../lib/constants");
const { buildPeriodDates, formatMD, weekdayLabel } = require("../lib/flex");
const { listStores, listShiftSubmissions, getLatestPeriod } = require("../lib/shiftStore");
const { evaluateDayStatus } = require("../lib/shiftAnalysis");

const storeNameById = STORES.reduce((acc, s) => {
  acc[s.id] = s.name;
  return acc;
}, {});

function buildStoreView(storeId, periodStart, submissions) {
  const dates = buildPeriodDates(periodStart);

  const dayViews = dates.map((iso) => {
    const working = [];
    const dayOff = [];
    for (const submission of submissions) {
      const name = submission.profile && submission.profile.name;
      if (submission.dayOffDates && submission.dayOffDates.includes(iso)) {
        dayOff.push({ name });
      } else if (submission.selectedDates && submission.selectedDates.includes(iso)) {
        const entry = submission.timeEntries && submission.timeEntries[iso];
        working.push({ name, start: entry ? entry.start : null, end: entry ? entry.end : null });
      }
    }
    const requiredHeadcount = REQUIRED_HEADCOUNT[storeId] ?? null;
    const { status, diff } = evaluateDayStatus(working.length, requiredHeadcount);

    return {
      date: iso,
      label: `${formatMD(iso)}（${weekdayLabel(iso)}）`,
      requiredHeadcount,
      working,
      dayOff,
      status,
      diff,
    };
  });

  const shortageDays = dayViews.filter((d) => d.status === "shortage").length;
  const surplusDays = dayViews.filter((d) => d.status === "surplus").length;

  return {
    storeId,
    storeName: storeNameById[storeId] || storeId,
    periodStart,
    submissionCount: submissions.length,
    shortageDays,
    surplusDays,
    dates: dayViews,
  };
}

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

function renderStatusCell(d) {
  const label = STATUS_LABELS[d.status] || d.status;
  const diffText = d.diff ? `（${d.diff > 0 ? "+" : ""}${d.diff}）` : "";
  return `<td class="${STATUS_CLASS[d.status] || ""}">${escapeHtml(label)}${escapeHtml(diffText)}</td>`;
}

function renderStoreTable(store) {
  const rows = store.dates
    .map((d) => {
      const working = d.working.length
        ? d.working.map(renderWorkingEntry).join("<br>")
        : "-";
      const dayOff = d.dayOff.length
        ? d.dayOff.map((e) => escapeHtml(e.name || "(無名)")).join("<br>")
        : "-";
      return `<tr>
        <td>${escapeHtml(d.label)}</td>
        <td>${escapeHtml(d.requiredHeadcount ?? "未設定")}</td>
        <td>${working}</td>
        <td>${dayOff}</td>
        ${renderStatusCell(d)}
      </tr>`;
    })
    .join("\n");

  return `<section>
    <h2>${escapeHtml(store.storeName)}</h2>
    <p>期間開始: ${escapeHtml(store.periodStart)} ／ 提出人数: ${store.submissionCount}名 ／ 不足: ${store.shortageDays}日 ／ 過剰: ${store.surplusDays}日</p>
    <table>
      <thead>
        <tr><th>日付</th><th>必要人数</th><th>出勤希望</th><th>休み希望</th><th>状態</th></tr>
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
  .status-shortage { background: #fde2e2; color: #a31515; font-weight: bold; }
  .status-surplus { background: #fff4ce; color: #8a6d00; font-weight: bold; }
  .status-ok { background: #e3f6e5; color: #1e7d32; }
  .status-unset { color: #888; }
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
