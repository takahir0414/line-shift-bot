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
      `「希望を出す」と送ってください。`,
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
 *   none →
