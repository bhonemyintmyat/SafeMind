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

const taskReference = runAgent("message", "Congrats! You’ve been selected for a remote task role. Earn daily income by rating hotels. Start today!");
assert.equal(taskReference.risk, "HIGH");
assert.equal(taskReference.category, "Task job scam");
assert.equal(isScamResult(taskReference), true);

const unseenTaskParaphrase = runAgent("message", "Flexible online work: review travel listings and receive commission each day. Message us to begin.");
assert.equal(unseenTaskParaphrase.risk, "HIGH", "The model must generalize beyond the reference wording.");
assert.equal(isScamResult(unseenTaskParaphrase), true);

const safeHotelReview = runAgent("message", "I rated the hotel after our vacation and shared the review with my family.");
assert.equal(safeHotelReview.risk, "LOW", "A normal hotel review must not be classified as a task scam.");
assert.equal(isScamResult(safeHotelReview), false);

const authorityImpersonation = runAgent(
  "message",
  "This is President Joan T. A. Gabel, the president of the University of Minnesota. I am sending this message with my private number and it is needed to be treated with urgency. Kindly leave a message once you see this message."
);
assert.equal(authorityImpersonation.risk, "HIGH", "Authority + private channel + urgency must be high risk.");
assert.equal(authorityImpersonation.category, "Authority impersonation scam");
assert.equal(isScamResult(authorityImpersonation), true, "Simple Mode must render authority impersonation as SCAM.");

const burmeseAuthorityImpersonation = runAgent(
  "message",
  "ကျွန်တော် ကုမ္ပဏီ ဥက္ကဋ္ဌပါ။ ကိုယ်ပိုင်ဖုန်းနံပါတ်အသစ်ကနေ စာပို့တာပါ။ အရေးကြီးလို့ တွေ့တာနဲ့ စာပြန်ပါ။"
);
assert.equal(burmeseAuthorityImpersonation.risk, "HIGH", "Burmese authority impersonation must be high risk.");
assert.equal(burmeseAuthorityImpersonation.category, "Authority impersonation scam");
assert.equal(isScamResult(burmeseAuthorityImpersonation), true);

const safeAuthorityReference = runAgent(
  "message",
  "The university president's office posted the meeting schedule on the official website."
);
assert.equal(safeAuthorityReference.risk, "LOW", "A normal third-person authority reference must remain low risk.");
assert.equal(isScamResult(safeAuthorityReference), false);

console.log("Simple Mode scam regression passed: task and authority impersonation scams → SCAM; ordinary messages → SAFE.");
