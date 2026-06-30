/**
 * Upstash Redis共通クライアント。
 * 環境変数 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN はVercelのUpstash統合で自動設定される。
 */
const { Redis } = require("@upstash/redis");

const redis = Redis.fromEnv();

module.exports = { redis };
