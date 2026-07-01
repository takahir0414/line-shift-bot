const redis = require("./redisClient");

// キー: budget:{storeId}:{periodStart}
// 値: { [date]: { revenue: number, laborCost: number } }

function budgetKey(storeId, periodStart) {
  return `budget:${storeId}:${periodStart}`;
}

async function saveBudget(storeId, periodStart, dailyBudgets) {
  // dailyBudgets: { [date]: { revenue: number, laborCost: number } }
  await redis.set(budgetKey(storeId, periodStart), JSON.stringify(dailyBudgets));
}

async function getBudget(storeId, periodStart) {
  const raw = await redis.get(budgetKey(storeId, periodStart));
  if (!raw) return {};
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }
}

module.exports = { saveBudget, getBudget };
