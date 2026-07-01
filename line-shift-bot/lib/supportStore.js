const { redis } = require("./redisClient");

// キー: support:{storeId}:{periodStart} → [{userId, name, dates: [ISO...], position, positionLabel}]
// 「この店舗から他店舗へ応援に出せるスタッフ」を登録する

function supportKey(storeId, periodStart) {
  return `support:${storeId}:${periodStart}`;
}

async function saveSupportRegistrations(storeId, periodStart, registrations) {
  await redis.set(supportKey(storeId, periodStart), JSON.stringify(registrations));
}

async function getSupportRegistrations(storeId, periodStart) {
  const raw = await redis.get(supportKey(storeId, periodStart));
  if (!raw) return [];
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }
}

// 全店舗の応援一覧を集約（ダッシュボード用）
async function getAllSupportRegistrations(storeIds, periodStart) {
  const result = [];
  for (const storeId of storeIds) {
    const regs = await getSupportRegistrations(storeId, periodStart);
    result.push({ storeId, registrations: regs });
  }
  return result;
}

module.exports = { saveSupportRegistrations, getSupportRegistrations, getAllSupportRegistrations };
