/**
 * 希望シフトの永続化
 * ------------------------------------------------------------
 * LINE Bot側（api/webhook.js）の「この内容で提出」操作で確定した希望シフトをRedisに保存し、
 * 店舗別一覧API（api/shifts.js）から読み出せるようにする。
 *
 * キー設計:
 *   shift:{storeId}:{periodStart}:{userId}      … 1スタッフ分の提出内容（JSON）
 *   shift_period_index:{storeId}:{periodStart}  … その店舗・期間に提出したuserIdのSet
 *   shift_periods:{storeId}                     … その店舗で提出履歴のあるperiodStartのSet
 *   shift_stores                                … 提出履歴のあるstoreIdのSet
 */
const { redis } = require("./redisClient");

function submissionKey(storeId, periodStart, userId) {
  return `shift:${storeId}:${periodStart}:${userId}`;
}

function periodIndexKey(storeId, periodStart) {
  return `shift_period_index:${storeId}:${periodStart}`;
}

function periodsKey(storeId) {
  return `shift_periods:${storeId}`;
}

const STORES_KEY = "shift_stores";

async function saveShiftSubmission(storeId, periodStart, userId, submission) {
  await redis.set(submissionKey(storeId, periodStart, userId), submission);
  await redis.sadd(periodIndexKey(storeId, periodStart), userId);
  await redis.sadd(periodsKey(storeId), periodStart);
  await redis.sadd(STORES_KEY, storeId);
}

async function listShiftSubmissions(storeId, periodStart) {
  const userIds = await redis.smembers(periodIndexKey(storeId, periodStart));
  if (!userIds || userIds.length === 0) return [];
  const keys = userIds.map((userId) => submissionKey(storeId, periodStart, userId));
  const results = await redis.mget(...keys);
  return results.filter(Boolean);
}

async function listPeriods(storeId) {
  const periods = await redis.smembers(periodsKey(storeId));
  return (periods || []).sort().reverse();
}

async function listStores() {
  return (await redis.smembers(STORES_KEY)) || [];
}

async function getLatestPeriod(storeId) {
  const periods = await listPeriods(storeId);
  return periods[0] || null;
}

module.exports = {
  saveShiftSubmission,
  listShiftSubmissions,
  listPeriods,
  listStores,
  getLatestPeriod,
};
