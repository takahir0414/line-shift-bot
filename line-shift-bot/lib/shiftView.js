/**
 * 希望シフトの店舗別ビュー構築
 * ------------------------------------------------------------
 * Redisに保存された生の提出データ（lib/shiftStore.js）を、日別・ランチ/ディナー別の
 * 過不足ステータス付きビューに変換する。api/shifts.js・api/manager.js・api/dashboard.js
 * から共通で利用する。
 */
const { STORES, REQUIRED_HEADCOUNT, POSITIONS } = require("./constants");

const positionById = POSITIONS.reduce((acc, p) => { acc[p.id] = p; return acc; }, {});
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
        const pos = submission.position ? positionById[submission.position] : null;
        working.push({
          name,
          userId,
          start: entry ? entry.start : null,
          end: entry ? entry.end : null,
          position: submission.position || null,
          positionLabel: pos ? pos.label : null,
          positionColor: pos ? pos.color : null,
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

/**
 * 充足率を算出する。各バンド（ランチ/ディナー×日）について
 * 「必要人数に対してどれだけ充足しているか」をmin(実数, 必要数)で積み上げ、
 * 必要人数合計に対する割合(%)を返す。必要人数が未設定のバンドは集計から除外する。
 */
function computeFulfillment(store) {
  let totalRequired = 0;
  let totalFilled = 0;
  for (const d of store.dates) {
    for (const band of [d.lunch, d.dinner]) {
      if (band.required === null || band.required === undefined) continue;
      totalRequired += band.required;
      totalFilled += Math.min(band.entries.length, band.required);
    }
  }
  const rate = totalRequired > 0 ? Math.round((totalFilled / totalRequired) * 100) : null;
  return { rate, totalRequired, totalFilled };
}

/**
 * 提出データを「日付×スタッフ」のカレンダー形式に変換する。
 * 1スタッフは1日につき出勤希望(ランチ/ディナーいずれか)・休み希望・未入力のいずれか1状態を持つ。
 */
function buildCalendarView(storeId, periodStart, submissions) {
  const store = buildStoreView(storeId, periodStart, submissions);

  const staffMap = new Map();
  for (const submission of submissions) {
    if (submission.userId && submission.profile && submission.profile.name) {
      staffMap.set(submission.userId, submission.profile.name);
    }
  }

  const staffRows = Array.from(staffMap.entries()).map(([userId, name]) => {
    const cells = {};
    for (const d of store.dates) {
      const lunchEntry = d.lunch.entries.find((e) => e.userId === userId);
      const dinnerEntry = d.dinner.entries.find((e) => e.userId === userId);
      const dayOffEntry = d.dayOff.find((e) => e.userId === userId);
      if (lunchEntry) {
        cells[d.date] = { type: "working", band: "lunch", start: lunchEntry.start, end: lunchEntry.end, position: lunchEntry.position, positionLabel: lunchEntry.positionLabel, positionColor: lunchEntry.positionColor };
      } else if (dinnerEntry) {
        cells[d.date] = { type: "working", band: "dinner", start: dinnerEntry.start, end: dinnerEntry.end, position: dinnerEntry.position, positionLabel: dinnerEntry.positionLabel, positionColor: dinnerEntry.positionColor };
      } else if (dayOffEntry) {
        cells[d.date] = { type: "dayoff" };
      } else {
        cells[d.date] = { type: "none" };
      }
    }
    return { userId, name, cells };
  });

  return { ...store, staffRows };
}

module.exports = { buildStoreView, computeFulfillment, buildCalendarView };
