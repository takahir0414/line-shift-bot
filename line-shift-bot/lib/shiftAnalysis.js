/**
 * 過不足判定ロジック
 * ------------------------------------------------------------
 * 1日の出勤希望を「ランチ」「ディナー」に分類したうえで、平日/祝休日別の
 * 必要人数（lib/constants.js の REQUIRED_HEADCOUNT）と比較し、
 * 不足／過剰／過不足なしを判定する。店長確認画面・本部ダッシュボードからも
 * 再利用できるよう、api/shifts.js から切り出した共通ロジック。
 */

const { getDayType } = require("./holidays");

const LUNCH_DINNER_BOUNDARY = "15:00";

function classifyTimeBand(start) {
  if (!start) return "dinner";
  return start < LUNCH_DINNER_BOUNDARY ? "lunch" : "dinner";
}

function evaluateDayStatus(workingCount, requiredHeadcount) {
  if (requiredHeadcount === null || requiredHeadcount === undefined) {
    return { status: "unset", diff: null };
  }
  const diff = workingCount - requiredHeadcount;
  if (diff < 0) return { status: "shortage", diff };
  if (diff > 0) return { status: "surplus", diff };
  return { status: "ok", diff: 0 };
}

/**
 * 1日分の出勤希望エントリ（{ name, start, end }[]）をランチ/ディナーに分類し、
 * それぞれの過不足ステータスを算出する。
 * requiredHeadcountByStore は lib/constants.js の REQUIRED_HEADCOUNT[storeId]
 * （{ weekdayLunch, weekdayDinner, holidayLunch, holidayDinner } または null）。
 */
function analyzeDay(dateISO, workingEntries, requiredHeadcountByStore) {
  const dayType = getDayType(dateISO);

  const lunchEntries = [];
  const dinnerEntries = [];
  for (const entry of workingEntries) {
    if (classifyTimeBand(entry.start) === "lunch") {
      lunchEntries.push(entry);
    } else {
      dinnerEntries.push(entry);
    }
  }

  const lunchRequired = requiredHeadcountByStore
    ? requiredHeadcountByStore[dayType === "holiday" ? "holidayLunch" : "weekdayLunch"]
    : null;
  const dinnerRequired = requiredHeadcountByStore
    ? requiredHeadcountByStore[dayType === "holiday" ? "holidayDinner" : "weekdayDinner"]
    : null;

  return {
    dayType,
    lunch: { entries: lunchEntries, required: lunchRequired, ...evaluateDayStatus(lunchEntries.length, lunchRequired) },
    dinner: { entries: dinnerEntries, required: dinnerRequired, ...evaluateDayStatus(dinnerEntries.length, dinnerRequired) },
  };
}

module.exports = { classifyTimeBand, evaluateDayStatus, analyzeDay };
