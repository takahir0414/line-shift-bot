// 対象店舗一覧（要件定義書 9. 今後の検討事項：店舗名・店舗コードは最終確定待ち。
// 現状判明している店舗名で仮置きしているので、確定後にここを更新してください）
const STORES = [
  { id: "kanda", name: "神田店" },
  { id: "ikebukuro", name: "池袋店" },
  { id: "honten", name: "本店" },
  { id: "hanare", name: "はなれ店" },
  { id: "chiba_sogo", name: "千葉そごう店" },
  { id: "tokugawa", name: "徳川店" },
  { id: "plena", name: "プレナ店" },
  { id: "natsumi", name: "夏見店" },
  { id: "other", name: "その他（本部に確認）" },
];

const EMPLOYMENT_TYPES = [
  { id: "fulltime", label: "社員" },
  { id: "parttime", label: "アルバイト・パート" },
];

// シフトは2週間（14日）単位で作成する
const SHIFT_PERIOD_DAYS = 14;

const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

module.exports = { STORES, EMPLOYMENT_TYPES, SHIFT_PERIOD_DAYS, WEEKDAY_LABELS };
