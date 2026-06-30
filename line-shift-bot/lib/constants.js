// 対象店舗一覧（要件定義書 9. 今後の検討事項：店舗名・店舗コードは最終確定待ち。
// 現状判明している店舗名で仮置きしているので、確定後にここを更新してください）
const STORES = [
  { id: "kanda", name: "神田店" },
  { id: "ikebukuro", name: "池袋店" },
  { id: "honten", name: "本店" },
  { id: "hanare", name: "はなれ店" },
  { id: "chiba_sogo", name: "千葉そごう店" },
  { id: "tokugawa", name: "徳川商店" },
  { id: "plena", name: "プレナ店" },
  { id: "natsumi", name: "焼肉とごはんの奇跡" },
  { id: "wagyu_steak_hamburg", name: "和牛ステーキハンバーグ店" },
  { id: "honbu", name: "本部" },
];



const EMPLOYMENT_TYPES = [
  { id: "fulltime", label: "社員" },
  { id: "parttime", label: "アルバイト・パート" },
];

// シフトは2週間（14日）単位で作成する
const SHIFT_PERIOD_DAYS = 14;

const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

// 店舗別の必要人数（1日あたり、出勤希望ベース／休み希望者は含まない）。
// 本部担当者へのヒアリングが完了するまでの仮値として、運用対象の全店舗に一律3人/日を設定している。
// 本部ヒアリング完了後、店舗ごとの実数値に必ず差し替えること。
// 「本部」(honbu)はシフト運用対象外のため null（未設定）のままとする。
const REQUIRED_HEADCOUNT = STORES.reduce((acc, store) => {
  acc[store.id] = store.id === "honbu" ? null : 3;
  return acc;
}, {});

module.exports = { STORES, EMPLOYMENT_TYPES, SHIFT_PERIOD_DAYS, WEEKDAY_LABELS, REQUIRED_HEADCOUNT };
