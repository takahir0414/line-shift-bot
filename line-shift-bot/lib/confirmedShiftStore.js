/**
 * 確定シフトの永続化
 * ------------------------------------------------------------
 * 店長確認・確定画面（api/manager.js）で「採用」された出勤エントリを
 * 確定シフトとしてRedisに保存する。lib/shiftStore.js と同様の
 * シンプルなRedisラッパー構成。
 *
 * キー設計:
 *   confirmed:{storeId}:{periodStart} … { confirmedAt, entries: [{date, userId, name, start, end}] }
 */
const { redis } = require("./redisClient");

function confirmedKey(storeId, periodStart) {
  return `confirmed:${storeId}:${periodStart}`;
}

async function saveConfirmedShift(storeId, periodStart, entries) {
  const record = { confirmedAt: new Date().toISOString(), entries };
  await redis.set(confirmedKey(storeId, periodStart), record);
  return record;
}

async function getConfirmedShift(storeId, periodStart) {
  return (await redis.get(confirmedKey(storeId, periodStart))) || null;
}

module.exports = { saveConfirmedShift, getConfirmedShift };
