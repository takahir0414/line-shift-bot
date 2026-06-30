/**
 * 過不足判定ロジック
 * ------------------------------------------------------------
 * 1日あたりの出勤希望人数と REQUIRED_HEADCOUNT（必要人数）を比較し、
 * 不足／過剰／過不足なしを判定する。店長確認画面・本部ダッシュボードからも
 * 再利用できるよう、api/shifts.js から切り出した共通ロジック。
 */

function evaluateDayStatus(workingCount, requiredHeadcount) {
  if (requiredHeadcount === null || requiredHeadcount === undefined) {
    return { status: "unset", diff: null };
  }
  const diff = workingCount - requiredHeadcount;
  if (diff < 0) return { status: "shortage", diff };
  if (diff > 0) return { status: "surplus", diff };
  return { status: "ok", diff: 0 };
}

module.exports = { evaluateDayStatus };
