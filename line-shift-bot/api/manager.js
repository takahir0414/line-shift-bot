const { getLatestPeriod, listShiftSubmissions } = require("../lib/shiftStore");
const { buildStoreView } = require("../lib/shiftView");
const { saveConfirmedShift, getConfirmedShift } = require("../lib/confirmedShiftStore");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function adoptFieldName(userId, date) {
  return `adopt_${userId}_${date}`;
}

function renderBandEntries(band, dateISO, adoptedKeys) {
  if (!band.entries.length) return "<p>-</p>";
  return band.entries
    .map((e) => {
      const fieldName = adoptFieldName(e.userId, dateISO);
      const checked = adoptedKeys === null || adoptedKeys.has(fieldName) ? "checked" : "";
      const time = e.start ? `${e.start}-${e.end || ""}` : "時間未入力";
      return `<label class="entry">
        <input type="checkbox" name="${escapeHtml(fieldName)}" ${checked}>
        ${escapeHtml(e.name || "(無名)")}（${escapeHtml(time)}）
      </label>`;
    })
    .join("\n");
}

function renderForm(store, key, adoptedKeys, confirmed) {
  const rows = store.dates
    .map((d) => {
      const dayOff = d.dayOff.length
        ? d.dayOff.map((e) => escapeHtml(e.name || "(無名)")).join("、")
        : "-";
      return `<tr>
        <td>${escapeHtml(d.label)}<br><span class="day-type">${escapeHtml(d.dayTypeLabel)}</span></td>
        <td>${renderBandEntries(d.lunch, d.date, adoptedKeys)}</td>
        <td>${renderBandEntries(d.dinner, d.date, adoptedKeys)}</td>
        <td>${dayOff}</td>
      </tr>`;
    })
    .join("\n");

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
  table { border-collapse: collapse; width: 100%; margin-bottom: 24px; }
  th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; }
  .day-type { font-size: 11px; color: #888; }
  .entry { display: block; margin-bottom: 4px; }
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
  <table>
    <thead>
      <tr><th>日付</th><th>ランチ</th><th>ディナー</th><th>休み希望</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
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
    const store = buildStoreView(storeId, periodStart, submissions);
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
    const store = buildStoreView(storeId, periodStart, submissions);

    const entries = [];
    for (const d of store.dates) {
      for (const band of [d.lunch, d.dinner]) {
        for (const e of band.entries) {
          const fieldName = adoptFieldName(e.userId, d.date);
          if (body[fieldName]) {
            entries.push({ date: d.date, userId: e.userId, name: e.name, start: e.start, end: e.end });
          }
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
