import { initLanguage } from "./language.js";
import "./theme-toggle.js";

const TERMS_KEY = "safemind-terms-choice-v3";
const EXPERIENCE_KEY = "safemind-page-experience-v1";
try {
  if (localStorage.getItem(TERMS_KEY) !== "accepted") window.location.replace("/");
  else if (localStorage.getItem(EXPERIENCE_KEY) === "standard") window.location.replace("/");
} catch { /* The simple page remains available if storage is blocked. */ }

const form = document.getElementById("simpleChecker");
const input = document.getElementById("simpleInput");
const checkButton = document.getElementById("simpleCheckButton");
const status = document.getElementById("simpleStatus");
const answer = document.getElementById("simpleAnswer");
const tutorial = document.getElementById("simpleTutorial");
const emergency = document.getElementById("simpleEmergency");
const locale = () => document.documentElement.lang === "my" ? "my" : "en";
const say = (en, my) => locale() === "my" ? my : en;

function detectType(value) {
  const text = value.trim();
  if (/^(?:https?:\/\/|www\.)\S+/i.test(text)) return "link";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(text)) return "email";
  if (/^\+?[\d\s().-]{7,22}$/.test(text)) return "phone";
  return "message";
}

function show(dialog) { if (dialog && !dialog.open) dialog.showModal(); }
function close(dialog) { if (dialog?.open) dialog.close(); }

input.addEventListener("input", () => { checkButton.disabled = input.value.trim().length < 3; });
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const content = input.value.trim();
  if (content.length < 3) return;
  checkButton.disabled = true;
  checkButton.textContent = say("CHECKING…", "စစ်ဆေးနေသည်…");
  status.textContent = say("SafeMind is checking this now…", "SafeMind က ယခု စစ်ဆေးနေသည်…");
  answer.hidden = true;
  try {
    const response = await fetch("/api/spam-check", { method:"POST", headers:{"Content-Type":"application/json"}, credentials:"same-origin", cache:"no-store", body:JSON.stringify({ scan_type:detectType(content), content }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error();
    const risk = String(result.risk || "LOW").toUpperCase();
    const risky = risk === "HIGH" || risk === "MEDIUM" || ["scam","suspicious"].includes(result.verdict);
    document.getElementById("simpleVerdict").textContent = risky ? say("Likely Scam", "လိမ်လည်မှု ဖြစ်နိုင်သည်") : say("Probably Safe", "လုံခြုံနိုင်ဖွယ် ရှိသည်");
    document.getElementById("simpleVerdict").dataset.risk = risky ? "warning" : "safe";
    document.getElementById("simpleSummary").textContent = risky
      ? say("Stop. Do not click, reply, or send money until you verify this yourself.", "ရပ်တန့်ပါ။ ကိုယ်တိုင်အတည်မပြုမချင်း လင့်ခ်မနှိပ်၊ စာမပြန်၊ ငွေမပို့ပါနှင့်။")
      : say("No strong scam signs were found. Still verify unexpected requests yourself.", "ပြင်းထန်သော လိမ်လည်မှုလက္ခဏာ မတွေ့ပါ။ မမျှော်လင့်သော တောင်းဆိုချက်များကို ကိုယ်တိုင်အတည်ပြုပါ။");
    const actions = risky
      ? [say("Do not send money", "ငွေမပို့ပါနှင့်"), say("Do not share an OTP or password", "OTP သို့မဟုတ် စကားဝှက် မမျှဝေပါနှင့်"), say("Call the organization using its official number", "အဖွဲ့အစည်း၏ တရားဝင်နံပါတ်ကို ခေါ်ပါ")]
      : [say("Verify unexpected requests", "မမျှော်လင့်သော တောင်းဆိုချက်ကို အတည်ပြုပါ"), say("Keep passwords and OTP codes private", "စကားဝှက်နှင့် OTP ကုဒ်ကို လျှို့ဝှက်ထားပါ")];
    document.getElementById("simpleActions").replaceChildren(...actions.map((text) => { const li = document.createElement("li"); li.textContent = text; return li; }));
    answer.hidden = false;
    answer.scrollIntoView({ behavior:"smooth", block:"start" });
    status.textContent = say("Check complete.", "စစ်ဆေးမှု ပြီးပါပြီ။");
  } catch {
    status.textContent = say("We could not finish the check. Your content is still here. Please try again.", "စစ်ဆေးမှု မပြီးဆုံးနိုင်ပါ။ သင့်အကြောင်းအရာ မပျောက်ပါ။ ထပ်မံကြိုးစားပါ။");
  } finally {
    checkButton.disabled = input.value.trim().length < 3;
    checkButton.textContent = say("CHECK NOW", "ယခု စစ်ဆေးရန်");
  }
});

document.getElementById("simpleAgain").addEventListener("click", () => { answer.hidden = true; input.focus(); form.scrollIntoView({behavior:"smooth"}); });
document.querySelectorAll("[data-open-simple-tutorial],[data-tutorial-topic]").forEach((button) => button.addEventListener("click", () => show(tutorial)));
document.querySelectorAll("[data-close-simple-tutorial]").forEach((button) => button.addEventListener("click", () => close(tutorial)));
document.querySelectorAll("[data-open-emergency]").forEach((button) => button.addEventListener("click", () => show(emergency)));
document.querySelectorAll("[data-close-emergency]").forEach((button) => button.addEventListener("click", () => close(emergency)));
document.querySelector("[data-emergency-check]").addEventListener("click", () => { close(emergency); input.focus(); form.scrollIntoView({behavior:"smooth"}); });
initLanguage();

