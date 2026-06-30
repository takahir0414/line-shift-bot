const { STORES, REQUIRED_HEADCOUNT } = require("../lib/constants");
const { buildPeriodDates, formatMD, weekdayLabel } = require("../lib/flex");
const { listStores, listShiftSubmissions, getLatestPeriod } = require("../lib/shiftStore");

const storeNameById = STORES.reduce((acc, s) => {
  acc[s.id] = s.name;
  return acc;
}, {});

function buildStoreView(storeId, periodStart, submissions) {
  const dates = buildPeriodDates(periodStart);

  const dayViews = dates.map((iso) => {
    const working = [];
    const dayOff = [];
    for (const submission of submissions) {
      const name = submission.profile && submission.profile.name;
      if (submission.dayOffDates && submission.dayOffDates.includes(iso)) {
        dayOff.push({ name });
      } else if (submission.selectedDates && submission.selectedDates.includes(iso)) {
        const entry = submission.timeEntries && submission.timeEntries[iso];
        working.push({ name, start: entry ? entry.start : null, end: entry ? entry.end : null });
      }
    }
    return {
      date: iso,
      label: `${formatMD(iso)}（${weekdayLabel(iso)}）`,
      requiredHeadcount: REQUIRED_HEADCOUNT[storeId] ?? null,
      working,
      dayOff,
    };
  });

  return {
    storeId,
    storeName: storeNameById[storeId] || storeId,
    periodStart,
    submissionCount: submissions.length,
    dates: dayViews,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey || req.query.key !== adminKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const requestedStoreId = req.query.storeId;
  const requestedPeriodStart = req.query.periodStart;

  const storeIds = requestedStoreId ? [requestedStoreId] : await listStores();

  const results = [];
  for (const storeId of storeIds) {
    const periodStart = requestedPeriodStart || (await getLatestPeriod(storeId));
    if (!periodStart) continue;
    const submissions = await listShiftSubmissions(storeId, periodStart);
    results.push(buildStoreView(storeId, periodStart, submissions));
  }

  res.status(200).json({ stores: results });
};
