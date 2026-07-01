const { redis } = require("./redisClient");

// キー: schedule:{storeId}:{periodStart}
// 値: {
//   [date]: {
//     [userId]: {
//       adjustedStart: "10:00" | null,
//       adjustedEnd:   "14:00" | null,
//       tasks: [{ timeMin: 660, label: "発注" }, ...]
//     }
//   }
// }

function scheduleKey(storeId, periodStart) {
  return `schedule:${storeId}:${periodStart}`;
}

async function saveScheduleNotes(storeId, periodStart, notes) {
  await redis.set(scheduleKey(storeId, periodStart), JSON.stringify(notes));
}

async function getScheduleNotes(storeId, periodStart) {
  const raw = await redis.get(scheduleKey(storeId, periodStart));
  if (!raw) return {};
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }
}

module.exports = { saveScheduleNotes, getScheduleNotes };
