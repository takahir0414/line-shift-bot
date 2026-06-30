/**
 * セッション管理
 * ------------------------------------------------------------
 * Upstash Redis（Vercel Marketplace連携）に会話状態を永続化する。
 * サーバーレス関数のコールドスタート・スケールアウトでもセッションが消えないようにするため。
 * get/set/clearの3関数だけを公開する「差し替えやすいインターフェース」は維持している。
 */
const { redis } = require("./redisClient");

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30日（未使用セッションの自然消滅用）

function sessionKey(userId) {
  return `session:${userId}`;
}

function createEmptySession() {
  return {
    // registration: not_started -> awaiting_name -> awaiting_store -> awaiting_employment -> registered
    registrationStep: "not_started",
    profile: { name: null, storeId: null, storeName: null, employmentType: null },

    // shift request flow
    requestStep: "idle", // idle -> selecting_days -> entering_time -> confirming
    periodStart: null, // 2週間の開始日（YYYY-MM-DD）
    selectedDates: [], // 希望提出の対象としてタップされた日付（YYYY-MM-DD）
    dayOffDates: [], // 休み希望としてタップされた日付（社員のみ）
    timeEntries: {}, // { "YYYY-MM-DD": { start: "17:00", end: "22:00" } }
    timeEntryQueue: [], // まだ時間帯を入力していない日付のキュー
    pendingDate: null, // 現在時刻入力中の日付
    pendingStartTime: null, // 開始時刻のdatetimepicker結果を一時保持
  };
}

async function getSession(userId) {
  const stored = await redis.get(sessionKey(userId));
  return stored || createEmptySession();
}

async function setSession(userId, session) {
  await redis.set(sessionKey(userId), session, { ex: SESSION_TTL_SECONDS });
}

async function clearSession(userId) {
  await redis.del(sessionKey(userId));
}

module.exports = { getSession, setSession, clearSession, createEmptySession };
