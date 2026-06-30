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
