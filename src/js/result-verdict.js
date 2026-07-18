const SAFE_LABELS = new Set(["0", "safe", "not_spam", "not-scam", "not_scam", "negative"]);
const SCAM_LABELS = new Set(["1", "scam", "spam", "positive"]);

export function isScamResult(result = {}) {
  const numericPrediction = result.prediction ?? result.predicted_class ?? result.class_id;
  if (numericPrediction === 0 || numericPrediction === "0") return false;
  if (numericPrediction === 1 || numericPrediction === "1") return true;

  const label = String(result.label ?? result.classification ?? "").trim().toLowerCase();
  if (SAFE_LABELS.has(label)) return false;
  if (SCAM_LABELS.has(label)) return true;

  if (typeof result.is_spam === "boolean") return result.is_spam;
  if (result.is_spam === 0 || result.is_spam === "0") return false;
  if (result.is_spam === 1 || result.is_spam === "1") return true;

  const verdict = String(result.verdict || "").toLowerCase();
  if (["safe", "not_spam", "not_scam", "unknown"].includes(verdict)) return false;
  if (["scam", "spam", "suspicious"].includes(verdict)) return true;
  return ["HIGH", "MEDIUM"].includes(String(result.risk || "").toUpperCase());
}
