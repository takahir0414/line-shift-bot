/**
 * Upstash Redis共通クライアント。
 * VercelのUpstash for Redis統合（Marketplace連携）は、Redis.fromEnv()が読む
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN ではなく、
 * 旧Vercel KV互換の KV_REST_API_URL / KV_REST_API_TOKEN という名前で環境変数を発行する。
 * 両方の命名に対応できるようフォールバックしている。
 */
const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

module.exports = { redis };
