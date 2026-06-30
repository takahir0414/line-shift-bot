/**
 * 祝休日判定
 * ------------------------------------------------------------
 * 必要人数（予算）をランチ/ディナー×平日/祝休日で切り替えるために、
 * シフト対象日が「祝休日」（土日 または 日本の祝日）かどうかを判定する。
 *
 * 祝日は春分の日・秋分の日のように年によって日付が変わるものを含むため、
 * 天文計算による動的算出はせず、年ごとの静的テーブルを用意して引く方式にしている。
 * 年が変わって翌年分のテーブルが無い場合は、土日判定のみにフォールバックする
 * （祝日扱いされないだけで、平日扱いにはなるため安全側に倒れる）。
 *
 * 【重要】年が変わったら HOLIDAYS_BY_YEAR に新しい年のテーブルを追加すること。
 */

const HOLIDAYS_BY_YEAR = {
  2026: [
    "2026-01-01", // 元日
    "2026-01-12", // 成人の日
    "2026-02-11", // 建国記念の日
    "2026-02-23", // 天皇誕生日
    "2026-03-20", // 春分の日
    "2026-04-29", // 昭和の日
    "2026-05-03", // 憲法記念日
    "2026-05-04", // みどりの日
    "2026-05-05", // こどもの日
    "2026-05-06", // 振替休日
    "2026-07-20", // 海の日
    "2026-08-11", // 山の日
    "2026-09-21", // 敬老の日
    "2026-09-22", // 国民の休日
    "2026-09-23", // 秋分の日
    "2026-10-12", // スポーツの日
    "2026-11-03", // 文化の日
    "2026-11-23", // 勤労感謝の日
  ],
};

function isWeekend(dateISO) {
  const day = new Date(`${dateISO}T00:00:00+09:00`).getDay();
  return day === 0 || day === 6;
}

function isNationalHoliday(dateISO) {
  const year = dateISO.slice(0, 4);
  const list = HOLIDAYS_BY_YEAR[year];
  return Boolean(list && list.includes(dateISO));
}

function isHoliday(dateISO) {
  return isWeekend(dateISO) || isNationalHoliday(dateISO);
}

function getDayType(dateISO) {
  return isHoliday(dateISO) ? "holiday" : "weekday";
}

module.exports = { isHoliday, getDayType };
