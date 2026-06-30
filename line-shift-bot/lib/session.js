/**
 * セッション管理
 * ------------------------------------------------------------
 * Vercelのサーバーレス関数はリクエストごとにインスタンスが使い回されない（スケールアウト・
 * コールドスタートがある）ため、メモリ上のMapだけでは本番運用で会話状態が消えてしまいます。
 *
 * 本番投入時は Upstash Redis（Vercel Marketplace連携あり）や Vercel KV 等、
 * サーバーレスから使える永続ストアに置き換えてください。
 * このファイルは「差し替えやすいインターフェース」として、get/set/clearの3関数だけを
 * 公開しています。今はローカル検証用にメモリ実装を入れています。
 *
 * 差し替え例（Upstash Redis版）:
 *   const { Redis } = require("@upstash/redis");
 *   const redis = Redis.fromEnv();
 *   async function getSession(userId) { return (await redis.get(`session:${userId}`)) || createEmptySession(); }
 *   async function setSession(userId, session) { await redis.set(`session:${userId}`, session); }
 *   async function clearSession(userId) { await redis.del(`session:${userId}`); }
 */

const memoryStore = new Map();

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
  if (!memoryStore.has(userId)) {
    memoryStore.set(userId, createEmptySession());
  }
  return memoryStore.get(userId);
}

async function setSession(userId, session) {
  memoryStore.set(userId, session);
}

async function clearSession(userId) {
  memoryStore.set(userId, createEmptySession());
}

module.exports = { getSession, setSession, clearSession, createEmptySession };
