/**
 * 希望シフトの店舗別ビュー構築
 * ------------------------------------------------------------
 * Redisに保存された生の提出データ（lib/shiftStore.js）を、日別・ランチ/ディナー別の
 * 過不足ステータス付きビューに変換する。api/shifts.js・api/manager.js・api/dashboard.js
 * から共通で利用する。
 */
const { STORES, REQUIRED_HEADCOUNT } = require("./constants");
const { buildPeriodDates, formatMD, weekdayLabel } = require("./flex");
const { analyzeDay } = require("./shiftAnalysis");

const storeNameById = STORES.reduce((acc, s) => {
  acc[s.id] = s.name;
  return acc;
}, {});

const DAY_TYPE_LABELS = { weekday: "平日", holiday: "祝休日" };

function buildStoreView(storeId, periodStart, submissions) {
  const dates = buildPeriodDates(periodStart);
  const requiredHeadcountByStore = REQUIRED_HEADCOUNT[storeId] ?? null;

  const dayViews = dates.map((iso) => {
    const working = [];
    const dayOff = [];
    for (const submission of submissions) {
      const name = submission.profile && submission.profile.name;
      const userId = submission.userId;
      if (submission.dayOffDates && submission.dayOffDates.includes(iso)) {
        dayOff.push({ name, userId });
      } else if (submission.selectedDates && submission.selectedDates.includes(iso)) {
        const entry = submission.timeEntries && submission.timeEntries[iso];
        working.push({
          name,
          userId,
          start: entry ? entry.start : null,
          end: entry ? entry.end : null,
        });
      }
    }

    const { dayType, lunch, dinner } = analyzeDay(iso, working, requiredHeadcountByStore);

    return {
      date: iso,
      label: `${formatMD(iso)}（${weekdayLabel(iso)}）`,
      dayType,
      dayTypeLabel: DAY_TYPE_LABELS[dayType],
      lunch,
      dinner,
      dayOff,
    };
  });

  const countShortage = (band) => dayViews.filter((d) => d[band].status === "shortage").length;
  const countSurplus = (band) => dayViews.filter((d) => d[band].status === "surplus").length;
  const shortageSlots = countShortage("lunch") + countShortage("dinner");
  const surplusSlots = countSurplus("lunch") + countSurplus("dinner");

  return {
    storeId,
    storeName: storeNameById[storeId] || storeId,
    periodStart,
    submissionCount: submissions.length,
    shortageSlots,
    surplusSlots,
    dates: dayViews,
  };
}

module.exports = { buildStoreView };
