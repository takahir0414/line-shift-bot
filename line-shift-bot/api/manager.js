const { getLatestPeriod, listShiftSubmissions } = require("../lib/shiftStore");
const { buildCalendarView } = require("../lib/shiftView");
const { saveConfirmedShift, getConfirmedShift } = require("../lib/confirmedShiftStore");
const { getBudget } = require("../lib/budgetStore");
const { getScheduleNotes, saveScheduleNotes } = require("../lib/scheduleNotesStore");

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

function renderTimeBar(start, end, band, positionColor) {
  if (!start || !end) return "";
  const startMin = timeToMinutes(start);
  const endMin = timeToMinutes(end);
  const left = Math.max(0, Math.min(100, ((startMin - SCALE_START_MINUTES) / SCALE_RANGE_MINUTES) * 100));
  const width = Math.max(2, Math.min(100 - left, ((endMin - startMin) / SCALE_RANGE_MINUTES) * 100));
  const fillStyle = positionColor
    ? `style="left:${left.toFixed(1)}%;width:${width.toFixed(1)}%;background:${escapeHtml(positionColor)}"`
    : `class="time-bar-fill ${band === "lunch" ? "bar-lunch" : "bar-dinner"}" style="left:${left.toFixed(1)}%;width:${width.toFixed(1)}%"`;
  const fillTag = positionColor
    ? `<div class="time-bar-fill" ${fillStyle}></div>`
    : `<div ${fillStyle}></div>`;
  return `<div class="time-bar-track">${fillTag}</div>`;
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
  const posTag = cell.positionLabel
    ? `<span class="cell-pos" style="background:${escapeHtml(cell.positionColor || "#888")}">${escapeHtml(cell.positionLabel)}</span>`
    : "";
  return `<td class="cell-working">
    <label class="cell-checkbox">
      <input type="checkbox" name="${escapeHtml(fieldName)}" ${checked}>
      <span class="cell-band">${escapeHtml(bandLabel)}</span>${posTag}<br>${escapeHtml(time)}
    </label>
    ${renderTimeBar(cell.start, cell.end, cell.band, cell.positionColor)}
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

function ganttHourHeader() {
  return `<div class="gantt-hours">${HOUR_TICKS.map((h) => `<span>${h}</span>`).join("")}</div>`;
}

function barStyleCalc(startMin, endMin) {
  const left = Math.max(0, Math.min(100, ((startMin - SCALE_START_MINUTES) / SCALE_RANGE_MINUTES) * 100));
  const width = Math.max(1.5, Math.min(100 - left, ((endMin - startMin) / SCALE_RANGE_MINUTES) * 100));
  return { left: left.toFixed(2), width: width.toFixed(2) };
}

function renderGanttDay(d, store, scheduleNotes) {
  const workingStaff = store.staffRows
    .map((staff) => ({ staff, cell: staff.cells[d.date] }))
    .filter(({ cell }) => cell.type === "working" && cell.start && cell.end);

  if (!workingStaff.length) {
    return `<div class="gantt-day">
      <h3>${escapeHtml(d.label)} <span class="day-type">${escapeHtml(d.dayTypeLabel)}</span></h3>
      <p class="gantt-empty">出勤希望がありません</p>
    </div>`;
  }

  const rows = workingStaff.map(({ staff, cell }) => {
    const noteKey = `${d.date}__${staff.userId}`;
    const note = (scheduleNotes[d.date] || {})[staff.userId] || {};
    const startMin = timeToMinutes(note.adjustedStart || cell.start);
    const endMin   = timeToMinutes(note.adjustedEnd   || cell.end);
    const { left, width } = barStyleCalc(startMin, endMin);
    const bandCls = cell.positionColor ? "" : (cell.band === "lunch" ? " bar-lunch" : " bar-dinner");
    const bgStyle = cell.positionColor ? `background:${escapeHtml(cell.positionColor)};` : "";
    const startLabel = note.adjustedStart || cell.start;
    const endLabel   = note.adjustedEnd   || cell.end;

    const taskChips = (note.tasks || []).map((t) => {
      const tLeft = Math.max(0, Math.min(99, ((t.timeMin - SCALE_START_MINUTES) / SCALE_RANGE_MINUTES) * 100));
      return `<div class="task-chip" data-key="${escapeHtml(noteKey)}" data-time="${t.timeMin}" style="left:${tLeft.toFixed(2)}%">${escapeHtml(t.label)}<span class="task-del">×</span></div>`;
    }).join("");

    let breakBar = "";
    if (cell.breakStart && cell.breakEnd) {
      const bs = barStyleCalc(timeToMinutes(cell.breakStart), timeToMinutes(cell.breakEnd));
      breakBar = `<div class="gantt-bar gantt-bar-break" style="left:${bs.left}%;width:${bs.width}%">休憩</div>`;
    }

    return `<div class="gantt-row">
      <div class="gantt-name">${escapeHtml(staff.name)}</div>
      <div class="gantt-track" data-key="${escapeHtml(noteKey)}" data-date="${escapeHtml(d.date)}" data-userid="${escapeHtml(staff.userId)}" data-orig-start="${escapeHtml(cell.start)}" data-orig-end="${escapeHtml(cell.end)}">
        <div class="gantt-bar${bandCls}" id="bar-${escapeHtml(noteKey)}" style="left:${left}%;width:${width}%;${bgStyle}" data-key="${escapeHtml(noteKey)}">
          <div class="drag-handle drag-left" data-which="start" data-key="${escapeHtml(noteKey)}"></div>
          <span class="bar-label">${escapeHtml(startLabel)}–${escapeHtml(endLabel)}</span>
          <div class="drag-handle drag-right" data-which="end" data-key="${escapeHtml(noteKey)}"></div>
        </div>
        ${breakBar}${taskChips}
      </div>
    </div>`;
  }).join("\n");

  return `<div class="gantt-day">
    <h3>${escapeHtml(d.label)} <span class="day-type">${escapeHtml(d.dayTypeLabel)}</span></h3>
    ${ganttHourHeader()}
    ${rows}
  </div>`;
}

function renderInteractiveGantt(store, scheduleNotes, key) {
  const days = store.dates.map((d) => renderGanttDay(d, store, scheduleNotes)).join("\n");

  const barsData = {};
  for (const staff of store.staffRows) {
    for (const d of store.dates) {
      const cell = staff.cells[d.date];
      if (cell.type === "working" && cell.start && cell.end) {
        const noteKey = `${d.date}__${staff.userId}`;
        const note = (scheduleNotes[d.date] || {})[staff.userId] || {};
        barsData[noteKey] = {
          origStart: cell.start, origEnd: cell.end,
          start: note.adjustedStart || cell.start,
          end:   note.adjustedEnd   || cell.end,
          tasks: note.tasks || [],
          date: d.date, userId: staff.userId,
        };
      }
    }
  }

  return `
<h2>時間軸シフト編集</h2>
<p class="scale-note">バーの端をドラッグして勤務時間を調整 ／ トラック上をダブルクリックしてタスクを追加</p>
<button class="btn-save" onclick="saveNotes()">変更を保存</button>
<span id="save-status" style="margin-left:12px;font-size:13px;color:#555;"></span>
<div class="gantt-wrap">${days}</div>

<div id="task-picker" style="display:none;position:fixed;background:#fff;border:1px solid #ccc;border-radius:6px;padding:12px;box-shadow:0 2px 8px rgba(0,0,0,.2);z-index:9999;min-width:200px;">
  <div style="margin-bottom:8px;font-size:13px;font-weight:bold;">タスクを追加</div>
  <div id="picker-labels" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;"></div>
  <input id="picker-custom" type="text" placeholder="カスタム入力（Enterで追加）" style="width:100%;padding:4px;font-size:13px;box-sizing:border-box;border:1px solid #ccc;border-radius:3px;">
  <div style="margin-top:8px;display:flex;gap:8px;">
    <button onclick="confirmTask()" style="font-size:13px;padding:4px 12px;cursor:pointer;">追加</button>
    <button onclick="closePicker()" style="font-size:13px;padding:4px 12px;cursor:pointer;">キャンセル</button>
  </div>
</div>

<style>
  .drag-handle { position:absolute;top:0;width:8px;height:100%;cursor:ew-resize;z-index:10; }
  .drag-left  { left:0;  border-radius:3px 0 0 3px; background:rgba(0,0,0,.15); }
  .drag-right { right:0; border-radius:0 3px 3px 0; background:rgba(0,0,0,.15); }
  .drag-handle:hover { background:rgba(0,0,0,.35); }
  .bar-label { font-size:10px;color:#fff;white-space:nowrap;overflow:hidden;padding:0 10px;line-height:20px;display:block;text-align:center; }
  .task-chip { position:absolute;top:0;height:20px;background:#e67e22;color:#fff;font-size:10px;line-height:20px;padding:0 4px;border-radius:3px;white-space:nowrap;cursor:default;z-index:5; }
  .task-del { margin-left:3px;cursor:pointer;opacity:.7; }
  .task-del:hover { opacity:1; }
  .btn-save { background:#1a56db;color:#fff;border:none;border-radius:4px;font-size:14px;padding:8px 20px;cursor:pointer; }
  .btn-save:hover { background:#1340b0; }
</style>

<script>
(function(){
const SCALE_START=8*60,SCALE_END=26*60,SCALE_RANGE=18*60;
const TASK_LABELS=['発注','レジ','日報','X','キ','確認','清掃','補充'];
const storeId=${JSON.stringify(store.storeId)};
const periodStart=${JSON.stringify(store.periodStart)};
const adminKey=${JSON.stringify(key)};
const state=JSON.parse(${JSON.stringify(JSON.stringify(barsData))});

function tToM(t){const[h,m]=t.split(':').map(Number);let v=h*60+m;if(v<SCALE_START)v+=1440;return v;}
function mToT(m){const h=Math.floor(m/60),mm=m%60;return String(h).padStart(2,'0')+':'+String(mm).padStart(2,'0');}
function mToPct(m){return Math.max(0,Math.min(100,(m-SCALE_START)/SCALE_RANGE*100));}
function pxToM(px,w){return Math.round(((px/w)*SCALE_RANGE+SCALE_START)/15)*15;}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function redrawBar(key){
  const s=state[key];if(!s)return;
  const bar=document.getElementById('bar-'+key);
  const track=document.querySelector('.gantt-track[data-key="'+CSS.escape(key)+'"]');
  if(!bar||!track)return;
  const sm=tToM(s.start),em=tToM(s.end);
  const left=mToPct(sm),width=Math.max(1.5,mToPct(em)-left);
  bar.style.left=left+'%';bar.style.width=width+'%';
  bar.querySelector('.bar-label').textContent=s.start+'–'+s.end;
  track.querySelectorAll('.task-chip').forEach(el=>el.remove());
  (s.tasks||[]).forEach(t=>{
    const chip=document.createElement('div');
    chip.className='task-chip';chip.dataset.key=key;chip.dataset.time=t.timeMin;
    chip.style.left=mToPct(t.timeMin).toFixed(2)+'%';
    chip.innerHTML=esc(t.label)+'<span class="task-del" title="削除">×</span>';
    chip.querySelector('.task-del').addEventListener('click',e=>{
      e.stopPropagation();
      s.tasks=s.tasks.filter(x=>!(x.timeMin===t.timeMin&&x.label===t.label));
      redrawBar(key);
    });
    track.appendChild(chip);
  });
}

// Drag
let drag=null;
document.addEventListener('mousedown',e=>{
  const h=e.target.closest('.drag-handle');if(!h)return;
  e.preventDefault();
  const key=h.dataset.key;
  const track=document.querySelector('.gantt-track[data-key="'+CSS.escape(key)+'"]');
  drag={key,which:h.dataset.which,track};
});
document.addEventListener('mousemove',e=>{
  if(!drag)return;
  const rect=drag.track.getBoundingClientRect();
  const raw=Math.max(SCALE_START,Math.min(SCALE_END,pxToM(e.clientX-rect.left,rect.width)));
  const s=state[drag.key];if(!s)return;
  if(drag.which==='start'){if(raw<tToM(s.end)-15){s.start=mToT(raw);redrawBar(drag.key);}}
  else{if(raw>tToM(s.start)+15){s.end=mToT(raw);redrawBar(drag.key);}}
});
document.addEventListener('mouseup',()=>{drag=null;});

// Double-click to add task
let pickerKey=null,pickerTimeMin=null;
document.querySelectorAll('.gantt-track').forEach(track=>{
  track.addEventListener('dblclick',e=>{
    if(e.target.closest('.gantt-bar')||e.target.closest('.task-chip'))return;
    const rect=track.getBoundingClientRect();
    const raw=Math.max(SCALE_START,Math.min(SCALE_END-15,pxToM(e.clientX-rect.left,rect.width)));
    pickerKey=track.dataset.key;pickerTimeMin=raw;
    openPicker(e.clientX,e.clientY);
  });
});

// Init existing task chips delete handlers
document.querySelectorAll('.task-chip .task-del').forEach(el=>{
  el.addEventListener('click',e=>{
    e.stopPropagation();
    const chip=e.target.closest('.task-chip');
    const key=chip.dataset.key,timeMin=parseInt(chip.dataset.time);
    if(state[key])state[key].tasks=state[key].tasks.filter(t=>t.timeMin!==timeMin);
    redrawBar(key);
  });
});

function openPicker(x,y){
  const picker=document.getElementById('task-picker');
  const labels=document.getElementById('picker-labels');
  labels.innerHTML='';
  TASK_LABELS.forEach(l=>{
    const btn=document.createElement('button');
    btn.textContent=l;btn.style.cssText='font-size:12px;padding:3px 8px;cursor:pointer;border:1px solid #ccc;border-radius:3px;background:#f5f5f5;';
    btn.addEventListener('click',()=>{document.getElementById('picker-custom').value=l;});
    labels.appendChild(btn);
  });
  document.getElementById('picker-custom').value='';
  picker.style.display='block';
  picker.style.left=Math.min(x,window.innerWidth-220)+'px';
  picker.style.top=Math.min(y,window.innerHeight-180)+'px';
  setTimeout(()=>document.getElementById('picker-custom').focus(),50);
}
function closePicker(){document.getElementById('task-picker').style.display='none';pickerKey=null;pickerTimeMin=null;}
function confirmTask(){
  const label=document.getElementById('picker-custom').value.trim();
  if(!label||!pickerKey){closePicker();return;}
  if(!state[pickerKey])state[pickerKey]={tasks:[]};
  state[pickerKey].tasks=state[pickerKey].tasks||[];
  state[pickerKey].tasks.push({timeMin:pickerTimeMin,label});
  redrawBar(pickerKey);
  closePicker();
}
document.addEventListener('keydown',e=>{
  if(e.key==='Escape')closePicker();
  if(e.key==='Enter'&&document.getElementById('task-picker').style.display==='block')confirmTask();
});

// Save
window.saveNotes=function(){
  const notes={};
  for(const[key,s]of Object.entries(state)){
    const[date,userId]=key.split('__');
    if(!notes[date])notes[date]={};
    notes[date][userId]={
      adjustedStart:s.start!==s.origStart?s.start:null,
      adjustedEnd:s.end!==s.origEnd?s.end:null,
      tasks:s.tasks||[],
    };
  }
  const status=document.getElementById('save-status');
  status.textContent='保存中…';
  fetch('/api/schedule',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({storeId,periodStart,key:adminKey,notes}),
  }).then(r=>r.json()).then(r=>{
    status.textContent=r.ok?'✓ 保存しました':'保存失敗: '+r.error;
  }).catch(()=>{status.textContent='保存エラー';});
};
})();
</script>`;
}

function renderForm(store, key, adoptedKeys, confirmed, budget, scheduleNotes) {
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
  .cell-pos { font-size: 10px; color: #fff; border-radius: 3px; padding: 0 3px; margin-left: 3px; }
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
    border: 1px solid #eee; border-radius: 4px; cursor: crosshair;
  }
  .gantt-bar {
    position: absolute; top: 2px; height: 20px; border-radius: 3px;
    font-size: 10px; color: #fff; line-height: 20px; overflow: visible;
    white-space: nowrap; box-sizing: border-box; cursor: default;
    display: flex; align-items: center;
  }
  .gantt-bar-break {
    background: #aaa !important; color: #333; z-index: 2; overflow: hidden;
    font-size: 10px; display: flex; align-items: center; padding: 0 4px;
  }
</style>
</head>
<body>
<h1>店長確認・確定 - ${escapeHtml(store.storeName)}</h1>
<p>期間開始: ${escapeHtml(store.periodStart)} ／ 提出人数: ${store.submissionCount}名</p>
<p class="scale-note">セル内の横棒は出勤時間帯のイメージです（左端8:00〜右端26:00のスケール／<span class="bar-lunch-dot"></span>昼・<span class="bar-dinner-dot"></span>夜）</p>
<p>
  <a class="budget-link" href="/api/budget?storeId=${escapeHtml(store.storeId)}&periodStart=${escapeHtml(store.periodStart)}&key=${escapeHtml(key)}">📊 日割り予算・人件費を入力する</a>
  ／
  <a class="budget-link" href="/api/support?storeId=${escapeHtml(store.storeId)}&periodStart=${escapeHtml(store.periodStart)}&key=${escapeHtml(key)}">🤝 応援登録</a>
</p>
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
${renderInteractiveGantt(store, scheduleNotes, key)}
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
    const scheduleNotes = await getScheduleNotes(storeId, periodStart);

    res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send(renderForm(store, key, adoptedKeys, confirmed, budget, scheduleNotes));
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
