import assert from "node:assert/strict";
import { runAgent } from "../api/spam-check.js";
import { isScamResult } from "../src/js/result-verdict.js";

const burmeseScam = "🎉ကမ္ဘာ့ဖလားချန်ပီယံအသင်းအကြောင်း အတွင်းလူအချက်အလက်များရယူရန် မှတ်ပုံတင်ရန်နှင့် ငွေဖြည့်ရန် လင့်ခ်ကို နှိပ်ပါ။ 🎁🔗 dljie.vip/kifh";
const scamResult = runAgent("message", burmeseScam);
assert.equal(scamResult.risk, "HIGH");
assert.equal(scamResult.label, "spam");
assert.equal(scamResult.is_spam, true);
assert(scamResult.spam_probability >= 0.5, "Scam probability must agree with the spam label.");
assert.equal(isScamResult(scamResult), true, "Simple Mode must render this result as SCAM.");

const safeResult = runAgent("message", "မနက်ဖြန် နေ့လယ်စာ အတူစားကြမလား");
assert.equal(safeResult.label, "not_spam");
assert(safeResult.spam_probability < 0.5, "Safe probability must agree with the not-spam label.");
assert.equal(isScamResult(safeResult), false, "Simple Mode must render a normal Burmese message as SAFE.");

console.log("Simple Mode scam regression passed: Burmese scam → SCAM, normal Burmese message → SAFE.");
