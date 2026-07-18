import { supabase } from "./backend-client.js";
import { initLanguage } from "./language.js";
import { createActionReadiness } from "./action-readiness.js";
import "./theme-toggle.js";

const form = document.getElementById("universalChecker");
const input = document.getElementById("universalInput");
const fileInput = document.getElementById("universalFile");
const uploadButton = document.getElementById("universalUpload");
const voiceButton = document.getElementById("universalVoice");
const checkButton = document.getElementById("universalCheck");
const status = document.getElementById("universalStatus");
const resultSection = document.getElementById("check-result");
const skeleton = document.getElementById("resultSkeleton");
const answerCard = document.getElementById("answerCard");
const securityApiUrl = import.meta.env.VITE_NLP_API_URL || "/api/spam-check";
const educationApiUrl = import.meta.env.VITE_EDUCATION_API_URL || "/api/education-chat";
const mobileMenuButton = document.querySelector(".mobile-menu-button");
const mainNavigation = document.getElementById("mainNavigation");
let selectedImage = null;
let selectedFile = null;
let latestResult = null;

const locale = () => document.documentElement.lang === "my" ? "my" : "en";
const say = (english, burmese) => locale() === "my" ? burmese : english;

function setStatus(message = "", state = "") {
  status.textContent = message;
  status.dataset.state = state;
}

function formatBytes(bytes) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function detectInputType(value) {
  const text = String(value || "").trim();
  if (/^(?:https?:\/\/|www\.)\S+/i.test(text)) return "link";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(text)) return "email";
  if (/^\+?[\d\s().-]{7,22}$/.test(text)) return "phone";
  return "message";
}

const readiness = createActionReadiness({
  button: checkButton,
  controls: [input, fileInput],
  isReady: () => Boolean(input.value.trim() || selectedImage)
});

mobileMenuButton?.addEventListener("click", () => {
  const open = mobileMenuButton.getAttribute("aria-expanded") !== "true";
  mobileMenuButton.setAttribute("aria-expanded", String(open));
  mobileMenuButton.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  mainNavigation?.classList.toggle("is-open", open);
});

mainNavigation?.querySelectorAll("a,button").forEach((control) => control.addEventListener("click", () => {
  mobileMenuButton?.setAttribute("aria-expanded", "false");
  mainNavigation.classList.remove("is-open");
}));

uploadButton?.addEventListener("click", () => fileInput.click());

fileInput?.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(file.type) || !file.size || file.size > 2 * 1024 * 1024) {
    fileInput.value = "";
    selectedImage = null;
    selectedFile = null;
    setStatus(say("Choose a PNG, JPEG, or WebP image smaller than 2 MB.", "2 MB ထက်ငယ်သော PNG၊ JPEG သို့မဟုတ် WebP ပုံကို ရွေးပါ။"), "error");
    readiness.sync();
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    selectedFile = file;
    selectedImage = { mime_type: file.type, data_url: String(reader.result || "") };
    document.getElementById("universalFileImage").src = selectedImage.data_url;
    document.getElementById("universalFileName").textContent = file.name;
    document.getElementById("universalFileSize").textContent = formatBytes(file.size);
    document.getElementById("universalFilePreview").hidden = false;
    setStatus(say("Screenshot ready to check.", "စခရင်ရှော့ကို စစ်ဆေးရန် အသင့်ဖြစ်ပါပြီ။"), "success");
    readiness.sync();
  };
  reader.onerror = () => setStatus(say("The screenshot could not be read.", "စခရင်ရှော့ကို ဖတ်မရပါ။"), "error");
  reader.readAsDataURL(file);
});

document.getElementById("universalFileRemove")?.addEventListener("click", () => {
  selectedImage = null;
  selectedFile = null;
  fileInput.value = "";
  document.getElementById("universalFilePreview").hidden = true;
  readiness.sync();
  setStatus("");
});

voiceButton?.addEventListener("click", () => {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    setStatus(say("Voice input is not available in this browser.", "ဤဘရောက်ဇာတွင် အသံဖြင့် ထည့်သွင်းမှုကို အသုံးမပြုနိုင်ပါ။"), "error");
    return;
  }
  const recognition = new Recognition();
  recognition.lang = locale() === "my" ? "my-MM" : "en-US";
  recognition.interimResults = false;
  voiceButton.disabled = true;
  setStatus(say("Listening…", "နားထောင်နေသည်…"), "pending");
  recognition.onresult = (event) => {
    input.value = event.results[0][0].transcript;
    setStatus(say("Voice added. Press Check Now.", "အသံမှ စာသားထည့်ပြီးပါပြီ။ ယခုစစ်ဆေးရန်ကို နှိပ်ပါ။"), "success");
    readiness.sync();
  };
  recognition.onerror = () => setStatus(say("We could not hear that. Please try again.", "အသံကို မကြားရပါ။ ထပ်မံကြိုးစားပါ။"), "error");
  recognition.onend = () => { voiceButton.disabled = false; };
  recognition.start();
});

function friendlyReason(value) {
  const text = String(value || "").toLowerCase();
  if (/otp|password|passcode|authentication secret|verification code/.test(text)) return say("Asks for an OTP, password, or security code", "OTP၊ စကားဝှက် သို့မဟုတ် လုံခြုံရေးကုဒ် တောင်းထားသည်");
  if (/urgent|immediate|pressure|today|account.*close/.test(text)) return say("Pressures you to act quickly", "အလျင်စလို လုပ်ဆောင်ရန် ဖိအားပေးထားသည်");
  if (/payment|money|gift card|crypto|bank detail/.test(text)) return say("Asks for money or payment details", "ငွေ သို့မဟုတ် ငွေပေးချေမှုအချက်အလက် တောင်းထားသည်");
  if (/authority|bank|support|impersonat/.test(text)) return say("May be pretending to be a trusted organization", "ယုံကြည်ရသော အဖွဲ့အစည်းအဖြစ် အယောင်ဆောင်ထားနိုင်သည်");
  if (/link|url|domain|website/.test(text)) return say("Includes a link that should be checked separately", "သီးခြားစစ်ဆေးသင့်သော လင့်ခ် ပါဝင်သည်");
  if (/remote access|device access/.test(text)) return say("Asks for control of your device", "သင့်စက်ကို ထိန်းချုပ်ခွင့် တောင်းထားသည်");
  return String(value || "").trim();
}

function resultActions(risky) {
  return risky
    ? [
        say("Do not send money", "ငွေမပို့ပါနှင့်"),
        say("Do not click links or reply", "လင့်ခ်မနှိပ်ပါနှင့်၊ ပြန်မဖြေပါနှင့်"),
        say("Call the organization using its official number", "အဖွဲ့အစည်း၏ တရားဝင်ဖုန်းနံပါတ်ကို ကိုယ်တိုင်ခေါ်ပါ"),
        say("Block the sender", "ပို့သူကို ပိတ်ဆို့ပါ")
      ]
    : [
        say("Verify unexpected requests yourself", "မမျှော်လင့်သော တောင်းဆိုချက်ကို ကိုယ်တိုင်အတည်ပြုပါ"),
        say("Keep OTP codes and passwords private", "OTP ကုဒ်နှင့် စကားဝှက်ကို လျှို့ဝှက်ထားပါ"),
        say("Stop if anyone asks for money", "တစ်စုံတစ်ယောက်က ငွေတောင်းပါက ရပ်တန့်ပါ")
      ];
}

async function checkText(content) {
  const scanType = detectInputType(content);
  const response = await fetch(securityApiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ scan_type: scanType, content })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Check failed");
  return { ...data, detectedType: scanType };
}

async function checkImage(context) {
  const response = await fetch(educationApiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({
      question: say("Check this screenshot for scam warning signs.", "ဤစခရင်ရှော့တွင် လိမ်လည်မှုသတိပေးလက္ခဏာ ရှိမရှိ စစ်ဆေးပါ။"),
      evidence_text: context,
      image: selectedImage,
      scan_type: "auto",
      language: locale(),
      stream: false
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Image check failed");
  const assessment = data.assessment || {};
  const analysis = data.analysis || {};
  const risk = assessment.risk || ({ high: "HIGH", warning: "MEDIUM", low: "LOW" }[analysis.riskLevel] || "LOW");
  return {
    ...assessment,
    risk,
    reason: assessment.reason || analysis.summary || data.answer,
    indicators: assessment.indicators || analysis.warningSigns || [],
    recommended_actions: assessment.recommended_actions || analysis.recommendedActions || [],
    agent_summary: data.answer || analysis.summary || assessment.reason,
    detectedType: "screenshot"
  };
}

function renderResult(result) {
  latestResult = result;
  const risk = String(result.risk || "LOW").toUpperCase();
  const risky = risk === "HIGH" || risk === "MEDIUM" || result.verdict === "scam" || result.verdict === "suspicious";
  const reasons = [...new Set((result.indicators || []).map(friendlyReason).filter(Boolean))].slice(0, 4);
  if (!reasons.length) reasons.push(risky
    ? say("The request contains patterns often used in scams", "တောင်းဆိုပုံတွင် လိမ်လည်မှုများ၌ အသုံးများသော ပုံစံများ တွေ့ရသည်")
    : say("No common scam warning signs were found", "အများတွေ့ရသော လိမ်လည်မှုသတိပေးလက္ခဏာ မတွေ့ရပါ"));
  document.getElementById("answerKicker").textContent = risky ? say("WARNING", "သတိပေးချက်") : say("SAFE", "လုံခြုံနိုင်သည်");
  const verdict = document.getElementById("answerVerdict");
  verdict.dataset.verdict = risky ? "warning" : "safe";
  verdict.querySelector("span").textContent = risky ? "🔴" : "🟢";
  document.getElementById("resultHeading").textContent = risky ? say("Likely Scam", "လိမ်လည်မှု ဖြစ်နိုင်သည်") : say("Probably Safe", "လုံခြုံနိုင်ဖွယ် ရှိသည်");
  document.getElementById("answerSummary").textContent = risky
    ? say("This looks suspicious. Stop and verify it before you act.", "ဤအကြောင်းအရာသည် သံသယဖြစ်ဖွယ် ရှိပါသည်။ မလုပ်ဆောင်မီ ရပ်တန့်ပြီး အတည်ပြုပါ။")
    : say("We did not find strong scam signs, but unexpected requests should still be verified.", "ပြင်းထန်သော လိမ်လည်မှုလက္ခဏာ မတွေ့ပါ။ သို့သော် မမျှော်လင့်သော တောင်းဆိုချက်ကို အတည်ပြုသင့်ပါသည်။");
  document.getElementById("answerReasons").replaceChildren(...reasons.map((reason) => {
    const item = document.createElement("li");
    item.textContent = reason;
    return item;
  }));
  document.getElementById("answerActions").replaceChildren(...resultActions(risky).map((action) => {
    const item = document.createElement("li");
    item.textContent = action;
    return item;
  }));
  skeleton.hidden = true;
  answerCard.hidden = false;
  resultSection.hidden = false;
  resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const content = input.value.trim();
  if (!content && !selectedImage) return;
  readiness.setBusy(true);
  checkButton.textContent = say("CHECKING…", "စစ်ဆေးနေသည်…");
  const checkingMessage = say("SafeMind is checking this automatically…", "SafeMind က အလိုအလျောက် စစ်ဆေးနေသည်…");
  setStatus(checkingMessage, "pending");
  resultSection.hidden = false;
  answerCard.hidden = true;
  skeleton.hidden = false;
  resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
  try {
    const result = selectedImage ? await checkImage(content) : await checkText(content);
    renderResult(result);
    setStatus(say("Check complete.", "စစ်ဆေးမှု ပြီးပါပြီ။"), "success");
  } catch {
    resultSection.hidden = true;
    skeleton.hidden = true;
    setStatus(say("We could not finish the check. Your content is still here—please try again.", "စစ်ဆေးမှုကို မပြီးဆုံးနိုင်ပါ။ သင့်အကြောင်းအရာ မပျောက်ပါ။ ထပ်မံကြိုးစားပါ။"), "error");
  } finally {
    readiness.setBusy(false);
    checkButton.textContent = say("CHECK NOW", "ယခု စစ်ဆေးရန်");
  }
});

document.getElementById("answerBlock")?.addEventListener("click", () => {
  document.getElementById("answerNote").textContent = say("Open the sender's profile or message menu, then choose Block.", "ပို့သူ၏ ပရိုဖိုင် သို့မဟုတ် စာမီနူးကို ဖွင့်ပြီး ပိတ်ဆို့ရန်ကို ရွေးပါ။");
});

document.getElementById("answerReport")?.addEventListener("click", async () => {
  sessionStorage.setItem("safemindPendingReport", JSON.stringify({
    type: latestResult?.detectedType || detectInputType(input.value),
    content: input.value.trim() || `[${selectedFile?.name || "Screenshot"}]`,
    result: latestResult
  }));
  const { data } = await supabase?.auth.getSession() || {};
  window.location.href = data?.session ? "/reports" : "/login?returnTo=%2Freports";
});

document.getElementById("checkAnother")?.addEventListener("click", () => {
  resultSection.hidden = true;
  answerCard.hidden = true;
  input.focus();
  form?.scrollIntoView({ behavior: "smooth", block: "center" });
});

const emergencyDialog = document.getElementById("emergencyDialog");
document.querySelectorAll("[data-open-emergency]").forEach((button) => button.addEventListener("click", () => {
  if (!emergencyDialog.open) emergencyDialog.showModal();
  document.body.classList.add("modal-open");
}));
const closeEmergency = () => { emergencyDialog.close(); document.body.classList.remove("modal-open"); };
document.getElementById("emergencyClose")?.addEventListener("click", closeEmergency);
document.getElementById("emergencyCheck")?.addEventListener("click", () => {
  closeEmergency();
  form?.scrollIntoView({ behavior: "smooth", block: "center" });
  input.focus();
});
emergencyDialog?.addEventListener("close", () => document.body.classList.remove("modal-open"));

const termsPanel = document.querySelector("[data-terms-consent]");
if (termsPanel) {
  const storageKey = "safemind-terms-choice-v3";
  const statusNode = termsPanel.querySelector("[data-terms-status]");
  const buttons = [...termsPanel.querySelectorAll("[data-terms-choice]")];
  let savedChoice = "";
  try { savedChoice = localStorage.getItem(storageKey) || ""; } catch { /* Storage is optional. */ }
  const renderChoice = () => {
    const accepted = savedChoice === "accepted";
    const declined = savedChoice === "declined";
    statusNode.textContent = accepted
      ? say("Terms accepted on this browser.", "ဤဘရောက်ဇာတွင် စည်းကမ်းချက်များကို လက်ခံထားသည်။")
      : declined
        ? say("Terms declined. Basic checking remains available.", "စည်းကမ်းချက်များကို ငြင်းပယ်ထားသည်။ အခြေခံစစ်ဆေးမှုကို ဆက်သုံးနိုင်သည်။")
        : say("No choice selected yet.", "ရွေးချယ်မှု မပြုလုပ်ရသေးပါ။");
    buttons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.termsChoice === savedChoice)));
  };
  const openTerms = () => { if (!termsPanel.open) termsPanel.showModal(); document.body.classList.add("terms-dialog-open"); };
  const closeTerms = () => { termsPanel.close(); document.body.classList.remove("terms-dialog-open"); };
  buttons.forEach((button) => button.addEventListener("click", () => {
    savedChoice = button.dataset.termsChoice;
    try { localStorage.setItem(storageKey, savedChoice); } catch { /* Keep the in-page choice. */ }
    renderChoice();
    closeTerms();
  }));
  termsPanel.querySelector("[data-terms-close]")?.addEventListener("click", closeTerms);
  document.querySelectorAll("[data-open-terms]").forEach((button) => button.addEventListener("click", openTerms));
  window.addEventListener("safemind:language-change", renderChoice);
  renderChoice();
}

window.addEventListener("safemind:language-change", () => {
  checkButton.textContent = say("CHECK NOW", "ယခု စစ်ဆေးရန်");
  if (latestResult && !resultSection.hidden) renderResult(latestResult);
});

initLanguage();
