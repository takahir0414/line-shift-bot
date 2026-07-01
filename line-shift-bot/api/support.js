const { STORES, POSITIONS } = require("../lib/constants");
const { buildPeriodDates, formatMD, weekdayLabel } = require("../lib/flex");
const { getLatestPeriod, listShiftSubmissions } = require("../lib/shiftStore");
const { buildCalendarView, computeFulfillment } = require("../lib/shiftView");
const { saveSupportRegistrations, getSupportRegistrations } = require("../lib/supportStore");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

const storeNameById = STORES.reduce((acc, s) => { acc[s.id] = s.name; return acc; }, {});
const positionById = POSITIONS.reduce((acc, p) => { acc[p.id] = p; return acc; }, {});

function renderForm(storeId, storeName, periodStart, store, existingRegs, key) {
  // 余剰スタッフ（出勤希望あり・確定不要な日にいるスタッフ）を一覧表示
  // ここでは全スタッフを表示し、応援に出せる日付とポジションを登録できるようにする
  const staffOptions = store.staffRows.map((staff) => {
    const availDates = store.dates
      .filter((d) => staff.cells[d.date] && staff.cells[d.date].type === "working")
      .map((d) => d.date);

    const existing = existingRegs.find((r) => r.userId === staff.userId) || {};
    const existingDates = existing.dates || [];
    const existingPosition = existing.position || (staff.cells[store.dates[0]?.date]?.position || "");

    const dateCheckboxes = availDates.map((iso) => {
      const label = `${formatMD(iso)}（${weekdayLabel(iso)}）`;
      const checked = existingDates.includes(iso) ? "checked" : "";
      return `<label style="margin-right:8px;font-size:12px;white-space:nowrap">
        <input type="checkbox" name="support_${staff.userId}_date_${iso}" ${checked}> ${escapeHtml(label)}
      </label>`;
    }).join("");

    const positionSelect = POSITIONS.map((p) => {
      const sel = existingPosition === p.id ? "selected" : "";
      return `<option value="${escapeHtml(p.id)}" ${sel}>${escapeHtml(p.label)}</option>`;
    }).join("");

    return `<tr>
      <td><strong>${escapeHtml(staff.name)}</strong></td>
      <td>
        <select name="support_${staff.userId}_position">
          <option value="">ポジション選択</option>
          ${positionSelect}
        </select>
      </td>
      <td>${availDates.length ? dateCheckboxes : '<span style="color:#999;font-size:12px">出勤希望なし</span>'}</td>
    </tr>`;
  }).join("\n");

  const noStaff = !store.staffRows.length
    ? `<tr><td colspan="3" style="color:#999">出勤希望の提出がありません</td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>応援登録 - ${escapeHtml(storeName)}</title>
<style>
  body { font-family: sans-serif; margin: 24px; color: #222; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 24px; }
  th, td { border: 1px solid #ddd; padding: 8px 10px; vertical-align: top; font-size: 13px; }
  th { background: #f5f5f5; text-align: left; }
  select { padding: 4px; border: 1px solid #ccc; border-radius: 3px; font-size: 13px; }
  button { font-size: 16px; padding: 10px 24px; cursor: pointer; }
  .back-link { font-size: 13px; margin-top: 16px; display: inline-block; color: #1a56db; }
  .desc { font-size: 13px; color: #555; background: #f9f9f9; padding: 10px 14px; border-radius: 4px; margin-bottom: 16px; }
</style>
</head>
<body>
<h1>応援登録</h1>
<h2>${escapeHtml(storeName)}</h2>
<p>期間: ${escapeHtml(periodStart)} 〜（14日間）</p>
<div class="desc">出勤希望があるスタッフを他店舗へ応援に出せる場合、対象の日付にチェックを入れてポジションを選択してください。<br>登録内容は本部ダッシュボードに反映されます。</div>
<form method="POST" action="/api/support">
  <input type="hidden" name="key" value="${escapeHtml(key)}">
  <input type="hidden" name="storeId" value="${escapeHtml(storeId)}">
  <input type="hidden" name="periodStart" value="${escapeHtml(periodStart)}">
  <table>
    <thead><tr><th>スタッフ</th><th>ポジション</th><th>応援可能日</th></tr></thead>
    <tbody>${staffOptions || noStaff}</tbody>
  </table>
  <button type="submit">保存する</button>
</form>
<a class="back-link" href="/api/manager?storeId=${encodeURIComponent(storeId)}&periodStart=${encodeURIComponent(periodStart)}&key=${encodeURIComponent(key)}">← 店長確認・確定画面に戻る</a>
</body>
</html>`;
}

function renderDonePage(storeId, storeName, periodStart, key) {
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>応援登録完了</title>
<style>body{font-family:sans-serif;margin:24px;}</style></head><body>
<h1>応援登録を保存しました</h1>
<p>${escapeHtml(storeName)}</p>
<p><a href="/api/support?storeId=${encodeURIComponent(storeId)}&periodStart=${encodeURIComponent(periodStart)}&key=${encodeURIComponent(key)}">← 応援登録に戻る</a></p>
<p><a href="/api/dashboard?key=${encodeURIComponent(key)}">本部ダッシュボードへ</a></p>
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

    const submissions = await listShiftSubmissions(storeId, periodStart);
    const store = buildCalendarView(storeId, periodStart, submissions);
    const existingRegs = await getSupportRegistrations(storeId, periodStart);
    const storeName = storeNameById[storeId] || storeId;

    res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send(renderForm(storeId, storeName, periodStart, store, existingRegs, key));
    return;
  }

  if (req.method === "POST") {
    const body = req.body || {};
    if (!adminKey || body.key !== adminKey) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { storeId, periodStart } = body;
    if (!storeId || !periodStart) { res.status(400).send("storeId and periodStart are required"); return; }

    const submissions = await listShiftSubmissions(storeId, periodStart);
    const store = buildCalendarView(storeId, periodStart, submissions);

    const registrations = [];
    for (const staff of store.staffRows) {
      const positionId = body[`support_${staff.userId}_position`] || null;
      const availDates = store.dates
        .filter((d) => staff.cells[d.date] && staff.cells[d.date].type === "working")
        .map((d) => d.date);
      const selectedDates = availDates.filter((iso) => body[`support_${staff.userId}_date_${iso}`]);

      if (selectedDates.length > 0 && positionId) {
        const pos = positionById[positionId];
        registrations.push({
          userId: staff.userId,
          name: staff.name,
          dates: selectedDates,
          position: positionId,
          positionLabel: pos ? pos.label : positionId,
          positionColor: pos ? pos.color : null,
        });
      }
    }

    await saveSupportRegistrations(storeId, periodStart, registrations);
    const storeName = storeNameById[storeId] || storeId;
    res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send(renderDonePage(storeId, storeName, periodStart, body.key));
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
