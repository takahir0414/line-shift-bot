const { STORES, EMPLOYMENT_TYPES, WEEKDAY_LABELS } = require("./constants");

const NAVY = "#1B2A4A";
const RED = "#C8102E";
const GRAY = "#F0F0F0";
const TEXT_GRAY = "#888888";

/** 店舗選択（初回登録） */
function storeSelectMessage() {
  return {
    type: "flex",
    altText: "所属店舗を選択してください",
    contents: {
      type: "bubble",
      header: bubbleHeader("所属店舗を選択してください"),
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: STORES.map((s) => ({
          type: "button",
          style: "secondary",
          color: GRAY,
          action: { type: "postback", label: s.name, data: `action=select_store&storeId=${s.id}` },
        })),
      },
    },
  };
}

/** 雇用形態選択（初回登録） */
function employmentTypeMessage() {
  return {
    type: "flex",
    altText: "雇用形態を選択してください",
    contents: {
      type: "bubble",
      header: bubbleHeader("雇用形態を選択してください"),
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: EMPLOYMENT_TYPES.map((t) => ({
          type: "button",
          style: "primary",
          color: NAVY,
          action: { type: "postback", label: t.label, data: `action=select_employment&type=${t.id}` },
        })),
      },
    },
  };
}

/** 登録完了メッセージ */
function registrationCompleteMessage(profile) {
  const typeLabel = EMPLOYMENT_TYPES.find((t) => t.id === profile.employmentType)?.label || "";
  return {
    type: "text",
    text:
      `登録ありがとうございます🎉\n` +
      `${profile.name}さん（${profile.storeName}／${typeLabel}）\n` +
      `これでシフト希望を出せるようになりました！\n\n` +
      `「シフト」と送ってください。`,
  };
}

/** 日付ユーティリティ：2週間分の日付配列(YYYY-MM-DD)を返す */
function buildPeriodDates(periodStartISO) {
  const start = new Date(periodStartISO + "T00:00:00+09:00");
  const dates = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(toISODate(d));
  }
  return dates;
}

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatMD(iso) {
  const [, m, d] = iso.split("-");
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

function weekdayLabel(iso) {
  const d = new Date(iso + "T00:00:00+09:00");
  const idx = (d.getDay() + 6) % 7;
  return WEEKDAY_LABELS[idx];
}

/** 終了時刻が開始時刻より前（＝日付をまたぐ深夜営業）の場合は「翌」を付けて表示する */
function formatEndTime(start, end) {
  return end < start ? `翌${end}` : end;
}

/**
 * 2週間分の日付選択グリッド。
 * 各日付ボタンはタップする度に 状態が循環する：
 *   none → 出勤希望（赤） → （社員のみ）休み希望（紺） → none
 */
function daySelectMessage(session) {
  const dates = buildPeriodDates(session.periodStart);
  const week1 = dates.slice(0, 7);
  const week2 = dates.slice(7, 14);
  const isEmployee = session.profile.employmentType === "fulltime";

  const renderWeekRow = (weekDates) => ({
    type: "box",
    layout: "horizontal",
    spacing: "xs",
    contents: weekDates.map((iso) => dayButton(iso, session, isEmployee)),
  });

  return {
    type: "flex",
    altText: "希望日を選択してください（2週間分）",
    contents: {
      type: "bubble",
      header: bubbleHeader(`📅 ${formatMD(dates[0])}〜${formatMD(dates[13])}\n希望日を選んでください`),
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          sectionLabel("第1週"),
          renderWeekRow(week1),
          sectionLabel("第2週"),
          renderWeekRow(week2),
          {
            type: "text",
            text: isEmployee
              ? "タップする度に「出勤希望(赤)→休み希望(紺)→未選択」と切り替わります"
              : "タップする度に「出勤希望(赤)→未選択」と切り替わります",
            size: "xs",
            color: TEXT_GRAY,
            wrap: true,
            margin: "sm",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            color: NAVY,
            action: { type: "postback", label: "次へ（時間帯を入力する）", data: "action=days_done" },
          },
        ],
      },
    },
  };
}

function dayButton(iso, session, isEmployee) {
  const isSelected = session.selectedDates.includes(iso);
  const isDayOff = isEmployee && session.dayOffDates.includes(iso);
  let bg = "#FFFFFF";
  let color = "#333333";
  let borderColor = "#DDDDDD";
  if (isDayOff) {
    bg = NAVY;
    color = "#FFFFFF";
    borderColor = NAVY;
  } else if (isSelected) {
    bg = RED;
    color = "#FFFFFF";
    borderColor = RED;
  }
  const [, , dayOfMonth] = iso.split("-");
  return {
    type: "box",
    layout: "vertical",
    cornerRadius: "md",
    backgroundColor: bg,
    borderColor,
    borderWidth: "normal",
    paddingAll: "4px",
    flex: 1,
    spacing: "xs",
    contents: [
      { type: "text", text: weekdayLabel(iso), size: "xxs", align: "center", color, wrap: false },
      { type: "text", text: String(parseInt(dayOfMonth, 10)), size: "sm", weight: "bold", align: "center", color, wrap: false },
    ],
    action: { type: "postback", label: formatMD(iso), data: `action=cycle_day&date=${iso}` },
  };
}

/** 開始/終了時刻のdatetimepicker（テンプレートメッセージ） */
function timePickerMessage(dateISO, which) {
  const label = which === "start" ? "開始時刻" : "終了時刻";
  const text =
    which === "start"
      ? `${label}を選択してください`
      : `${label}を選択してください\n（日をまたぐ場合は翌日の時刻、例：深夜1時→01:00）`;
  return {
    type: "template",
    altText: `${formatMD(dateISO)}の${label}を選択してください`,
    template: {
      type: "buttons",
      title: `${formatMD(dateISO)}（${weekdayLabel(dateISO)}）`,
      text,
      actions: [
        {
          type: "datetimepicker",
          label: `${label}を選ぶ`,
          data: `action=set_time&which=${which}&date=${dateISO}`,
          mode: "time",
          initial: which === "start" ? "10:00" : "22:00",
          min: "00:00",
          max: "23:59",
        },
      ],
    },
  };
}

/** サマリー確認メッセージ */
function summaryMessage(session) {
  const dates = buildPeriodDates(session.periodStart).filter(
    (iso) => session.selectedDates.includes(iso) || session.dayOffDates.includes(iso)
  );

  const rows = dates.map((iso) => {
    const isDayOff = session.dayOffDates.includes(iso);
    const entry = session.timeEntries[iso];
    const rightText = isDayOff
      ? "休み希望"
      : entry
        ? `${entry.start} - ${formatEndTime(entry.start, entry.end)}`
        : "未入力";
    const rightColor = isDayOff ? TEXT_GRAY : RED;
    return {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: `${formatMD(iso)}（${weekdayLabel(iso)}）`, size: "sm", flex: 3 },
        { type: "text", text: rightText, size: "sm", flex: 3, color: rightColor, weight: "bold", align: "end" },
      ],
    };
  });

  return {
    type: "flex",
    altText: "希望シフトの確認",
    contents: {
      type: "bubble",
      header: bubbleHeader(
        `✅ 希望シフト確認\n${session.profile.name}／${session.profile.storeName}`
      ),
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: rows.length
          ? rows
          : [{ type: "text", text: "希望日が選択されていません", size: "sm", color: TEXT_GRAY }],
      },
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "secondary",
            action: { type: "postback", label: "修正する", data: "action=edit_restart" },
          },
          {
            type: "button",
            style: "primary",
            color: NAVY,
            action: { type: "postback", label: "この内容で提出", data: "action=submit" },
          },
        ],
      },
    },
  };
}

function bubbleHeader(text) {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: NAVY,
    paddingAll: "12px",
    contents: [{ type: "text", text, color: "#FFFFFF", weight: "bold", size: "sm", wrap: true }],
  };
}

function sectionLabel(text) {
  return { type: "text", text, size: "xs", color: TEXT_GRAY, weight: "bold" };
}

module.exports = {
  storeSelectMessage,
  employmentTypeMessage,
  registrationCompleteMessage,
  daySelectMessage,
  timePickerMessage,
  summaryMessage,
  buildPeriodDates,
  toISODate,
  formatMD,
  weekdayLabel,
};
