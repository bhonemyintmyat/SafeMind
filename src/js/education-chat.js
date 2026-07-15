import { supabase } from "./supabase.js";

const form = document.getElementById("educationChatForm");
const chatLog = document.getElementById("educationChatLog");
const questionInput = document.getElementById("educationQuestion");
const evidenceInput = document.getElementById("educationEvidence");
const evidenceType = document.getElementById("educationEvidenceType");
const fileInput = document.getElementById("educationEvidenceFile");
const filePreview = document.getElementById("educationFilePreview");
const fileImage = document.getElementById("educationFileImage");
const fileName = document.getElementById("educationFileName");
const fileMeta = document.getElementById("educationFileMeta");
const fileStatus = document.getElementById("educationFileStatus");
const fileRemove = document.getElementById("educationFileRemove");
const submitButton = document.getElementById("educationChatSubmit");
const chatStatus = document.getElementById("educationChatStatus");
const newChatButton = document.getElementById("educationNewChat");
const educationApiUrl = import.meta.env.VITE_EDUCATION_API_URL || "/api/education-chat";

if (form && chatLog) {
  const initialChat = chatLog.innerHTML;
  const history = [];
  let selectedImage = null;
  let activeObjectUrl = "";

  const locale = () => document.documentElement.lang === "my" ? "my" : "en";
  const copy = (english, burmese) => locale() === "my" ? burmese : english;

  function setStatus(element, message, state = "") {
    if (!element) return;
    element.textContent = message;
    element.dataset.state = state;
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Unable to read the selected file."));
      reader.readAsDataURL(file);
    });
  }

  function readAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Unable to read the selected file."));
      reader.readAsText(file);
    });
  }

  function clearFile({ clearInput = true } = {}) {
    if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = "";
    selectedImage = null;
    if (clearInput && fileInput) fileInput.value = "";
    if (filePreview) filePreview.hidden = true;
    if (fileImage) {
      fileImage.hidden = true;
      fileImage.removeAttribute("src");
    }
    if (fileName) fileName.textContent = "";
    if (fileMeta) fileMeta.textContent = "";
    setStatus(fileStatus, "");
  }

  async function handleFile(file) {
    clearFile({ clearInput: false });
    if (!file) return;
    const imageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
    const isImage = imageTypes.has(file.type);
    const isText = file.type === "text/plain" || /\.(txt|eml)$/i.test(file.name);
    if (!isImage && !isText) throw new Error(copy("Choose a PNG, JPEG, WebP, TXT, or EML file.", "PNG၊ JPEG၊ WebP၊ TXT သို့မဟုတ် EML ဖိုင်ကို ရွေးပါ။"));
    const limit = isImage ? 2 * 1024 * 1024 : 1024 * 1024;
    if (!file.size || file.size > limit) throw new Error(copy(`Choose a file smaller than ${isImage ? "2 MB" : "1 MB"}.`, `${isImage ? "2 MB" : "1 MB"} ထက်ငယ်သော ဖိုင်ကို ရွေးပါ။`));
    if (isImage) {
      selectedImage = { mime_type: file.type, data_url: await readAsDataUrl(file) };
      activeObjectUrl = URL.createObjectURL(file);
      fileImage.src = activeObjectUrl;
      fileImage.hidden = false;
    } else {
      const text = (await readAsText(file)).trim().slice(0, 10_000);
      if (!text) throw new Error(copy("The selected text file is empty.", "ရွေးထားသော စာသားဖိုင်တွင် အကြောင်းအရာ မရှိပါ။"));
      evidenceInput.value = text;
      selectedImage = null;
    }
    fileName.textContent = file.name;
    fileMeta.textContent = `${isImage ? copy("Screenshot", "စခရင်ရှော့") : copy("Text evidence", "စာသားသက်သေ")} · ${formatBytes(file.size)}`;
    filePreview.hidden = false;
    setStatus(fileStatus, copy("Evidence ready for analysis.", "စိစစ်ရန် သက်သေအထောက်အထား အသင့်ဖြစ်ပါပြီ။"), "success");
  }

  function detectType(value) {
    const text = String(value || "").trim();
    if (/\b(?:https?:\/\/|www\.)\S+/i.test(text)) return "link";
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(text)) return "email";
    if (/^\+?[\d\s().-]{7,22}$/.test(text)) return "phone";
    return "message";
  }

  function normalizeDirectoryValue(type, value) {
    const text = String(value || "").trim();
    if (type === "phone") return text.replace(/[^\d+]/g, "");
    if (type === "link") {
      try {
        const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
        return url.href.toLowerCase().replace(/\/$/, "");
      } catch { return text.toLowerCase(); }
    }
    return text.toLowerCase();
  }

  async function directoryLookup(type, value) {
    if (!supabase || !value) return null;
    const normalized = normalizeDirectoryValue(type, value);
    const { data, error } = await supabase.from("threat_directory")
      .select("verdict,organization,reason")
      .eq("entry_type", type)
      .eq("normalized_value", normalized)
      .maybeSingle();
    if (error || !data) return { matched: false, verdict: "other", organization: "", reason: "" };
    return { matched: true, verdict: data.verdict, organization: data.organization || "", reason: data.reason || "" };
  }

  function plainText(value) {
    return String(value || "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/`{1,3}/g, "")
      .replace(/^\s{0,3}#{1,6}\s*/gm, "")
      .replace(/^\s*[-*+]\s+/gm, "• ")
      .replace(/\*+/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function tokenizeForDisplay(value) {
    const text = plainText(value);
    if (!text) return [];
    if (typeof Intl.Segmenter === "function") {
      const segmenter = new Intl.Segmenter(locale() === "my" ? "my" : "en", { granularity: "word" });
      return Array.from(segmenter.segment(text), ({ segment }) => segment);
    }
    return text.match(/\s+|[^\s]+/gu) || [text];
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  async function renderTokenizedOutput(paragraph, value) {
    const text = plainText(value);
    const tokens = tokenizeForDisplay(text);
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion || tokens.length < 5) {
      paragraph.textContent = text;
      return;
    }
    paragraph.textContent = "";
    const batchSize = Math.max(2, Math.ceil(tokens.length / 90));
    for (let index = 0; index < tokens.length; index += batchSize) {
      paragraph.append(document.createTextNode(tokens.slice(index, index + batchSize).join("")));
      chatLog.scrollTop = chatLog.scrollHeight;
      await nextFrame();
    }
  }

  async function appendMessage(role, text, assessment = null, animate = false) {
    const article = document.createElement("article");
    article.className = `education-message is-${role}`;
    const avatar = document.createElement("span");
    avatar.className = "education-message-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = role === "assistant" ? "SM" : copy("You", "သင်");
    const content = document.createElement("div");
    if (assessment?.risk) {
      const badge = document.createElement("span");
      badge.className = "education-risk-badge";
      badge.dataset.risk = String(assessment.risk).toLowerCase();
      badge.textContent = `${assessment.risk} · ${assessment.confidence || 0}%`;
      content.append(badge);
    }
    const paragraph = document.createElement("p");
    const normalizedText = plainText(text);
    if (!animate) paragraph.textContent = normalizedText;
    content.append(paragraph);
    article.append(avatar, content);
    chatLog.append(article);
    article.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (animate) await renderTokenizedOutput(paragraph, normalizedText);
    return normalizedText;
  }

  async function sendQuestion(question) {
    const evidenceText = evidenceInput.value.trim();
    if (!question && !evidenceText && !selectedImage) {
      setStatus(chatStatus, copy("Add evidence or enter a question first.", "သက်သေအထောက်အထား ထည့်ပါ သို့မဟုတ် မေးခွန်းတစ်ခု ရေးပါ။"), "error");
      return;
    }
    const userQuestion = question || copy("Please assess this evidence and explain whether it may be a scam.", "ဤသက်သေအထောက်အထားကို စစ်ဆေးပြီး လိမ်လည်မှုဖြစ်နိုင်ခြေကို ရှင်းပြပါ။");
    const selectedType = evidenceType.value;
    const scanType = selectedType === "auto" ? detectType(evidenceText || userQuestion) : selectedType;
    const previousHistory = history.slice(-8);
    await appendMessage("user", userQuestion);
    history.push({ role: "user", content: userQuestion });
    submitButton.disabled = true;
    questionInput.disabled = true;
    setStatus(chatStatus, copy("SafeMind is matching NLP signals and verified records...", "SafeMind သည် NLP လက္ခဏာများနှင့် အတည်ပြုမှတ်တမ်းများကို တိုက်စစ်နေသည်..."), "pending");
    try {
      const directoryContext = await directoryLookup(scanType, evidenceText);
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 65_000);
      const response = await fetch(educationApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        credentials: "same-origin",
        signal: controller.signal,
        body: JSON.stringify({
          question: userQuestion,
          evidence_text: evidenceText,
          scan_type: scanType,
          image: selectedImage,
          directory_context: directoryContext,
          history: previousHistory,
          language: locale()
        })
      });
      window.clearTimeout(timeout);
      const result = await response.json().catch(() => ({ error: copy("The API returned an unreadable response.", "API အဖြေကို ဖတ်၍မရပါ။") }));
      if (!response.ok) throw new Error(result.error || copy("The Scam Coach could not respond.", "Scam Coach က မတုံ့ပြန်နိုင်ပါ။"));
      const completedAnswer = await appendMessage("assistant", result.answer, result.assessment, true);
      history.push({ role: "assistant", content: completedAnswer });
      questionInput.value = "";
      setStatus(chatStatus, result.response_complete === false
        ? copy("The model reached its response limit. Ask it to continue if needed.", "အဖြေကန့်သတ်ချက်သို့ ရောက်သွားသည်။ လိုအပ်ပါက ဆက်ရှင်းပြရန် မေးပါ။")
        : result.directory_match
          ? copy("Response includes a verified directory match.", "အဖြေတွင် အတည်ပြုမှတ်တမ်းနှင့် ကိုက်ညီမှု ပါဝင်သည်။")
          : copy("Complete response received.", "အဖြေအပြည့်အစုံ ရရှိပါပြီ။"), result.response_complete === false ? "pending" : "success");
    } catch (error) {
      const message = error.name === "AbortError"
        ? copy("The AI request timed out. Please try again.", "AI တောင်းဆိုမှု အချိန်ကုန်သွားသည်။ ထပ်မံကြိုးစားပါ။")
        : error.message || copy("I could not complete the analysis. Please try again.", "စိစစ်မှု မပြီးမြောက်နိုင်ပါ။ ထပ်မံကြိုးစားပါ။");
      await appendMessage("assistant", message);
      setStatus(chatStatus, message, "error");
    } finally {
      submitButton.disabled = false;
      questionInput.disabled = false;
      questionInput.focus();
    }
  }

  fileInput?.addEventListener("change", async () => {
    try { await handleFile(fileInput.files?.[0]); }
    catch (error) { clearFile(); setStatus(fileStatus, error.message, "error"); }
  });
  fileRemove?.addEventListener("click", () => clearFile());
  document.querySelectorAll("[data-education-prompt]").forEach((button) => button.addEventListener("click", () => {
    questionInput.value = locale() === "my"
      ? ({
          "Why does this look like a scam?": "ဒီအကြောင်းအရာက ဘာကြောင့် လိမ်လည်မှုဖြစ်နိုင်တာလဲ။",
          "What should I do immediately after being scammed?": "လိမ်လည်ခံရပြီးနောက် ချက်ချင်း ဘာလုပ်သင့်သလဲ။",
          "Explain the warning signs in simple language.": "သတိပေးလက္ခဏာများကို ရိုးရှင်းစွာ ရှင်းပြပါ။"
        })[button.dataset.educationPrompt] || button.dataset.educationPrompt
      : button.dataset.educationPrompt;
    questionInput.focus();
  }));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!submitButton.disabled) void sendQuestion(questionInput.value.trim());
  });
  questionInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!submitButton.disabled) void sendQuestion(questionInput.value.trim());
    }
  });
  newChatButton?.addEventListener("click", () => {
    history.length = 0;
    chatLog.innerHTML = initialChat;
    questionInput.value = "";
    evidenceInput.value = "";
    clearFile();
    setStatus(chatStatus, copy("New private chat started.", "သီးသန့်စကားဝိုင်းအသစ် စတင်ပါပြီ။"), "success");
  });
}
