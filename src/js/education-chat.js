import { supabase } from "./backend-client.js";
import { createActionReadiness } from "./action-readiness.js";

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
const evidenceTray = document.getElementById("educationEvidenceTray");
const evidenceClose = document.getElementById("educationEvidenceClose");
const attachButton = document.getElementById("educationAttach");
const cameraButton = document.getElementById("educationCamera");
const voiceButton = document.getElementById("educationVoice");
const emojiButton = document.getElementById("educationEmoji");
const protectionScore = document.getElementById("educationProtectionScore");
const protectionLabel = document.getElementById("educationProtectionLabel");
const currentAnalysis = document.getElementById("educationCurrentAnalysis");
const recentAnalyses = document.getElementById("educationRecentAnalyses");
const educationApiUrl = import.meta.env.VITE_EDUCATION_API_URL || "/api/education-chat";
const CHAT_HISTORY_PREFIX = "safemind-education-chat-v1";

if (form && chatLog) {
  const RISK_LEVELS = new Set(["LOW", "MEDIUM", "HIGH"]);
  const initialChat = chatLog.innerHTML;
  const history = [];
  let selectedImage = null;
  let activeObjectUrl = "";
  let activeRequest = null;
  let lastAssessment = null;
  let lastQuestion = "";
  let chatStorageKey = "";
  const submitReadiness = createActionReadiness({
    button: submitButton,
    controls: [questionInput, evidenceInput, fileInput],
    isReady: () => questionInput.value.trim().length > 0 || evidenceInput.value.trim().length > 0 || Boolean(selectedImage)
  });

  const locale = () => document.documentElement.lang === "my" ? "my" : "en";
  const copy = (english, burmese) => locale() === "my" ? burmese : english;

  function timeLabel() {
    return new Intl.DateTimeFormat(locale() === "my" ? "my-MM" : "en", { hour: "numeric", minute: "2-digit" }).format(new Date());
  }

  function setStatus(element, message, state = "") {
    if (!element) return;
    element.textContent = message;
    element.dataset.state = state;
  }

  function persistChatHistory() {
    if (!chatStorageKey) return;
    try {
      const messages = history.slice(-12).map((entry) => ({
        role: entry.role === "assistant" ? "assistant" : "user",
        content: plainText(entry.content).slice(0, 1_500)
      })).filter((entry) => entry.content);
      localStorage.setItem(chatStorageKey, JSON.stringify({
        version: 1,
        updated_at: new Date().toISOString(),
        messages,
        last_assessment: lastAssessment || null
      }));
    } catch {
      // Chat continues normally when private storage is unavailable or full.
    }
  }

  async function restoreChatHistory() {
    if (!supabase) return;
    try {
      const { data } = await supabase.auth.getSession();
      const userId = String(data?.session?.user?.id || "").trim();
      if (!userId) return;
      chatStorageKey = `${CHAT_HISTORY_PREFIX}:${userId}`;
      const saved = JSON.parse(localStorage.getItem(chatStorageKey) || "null");
      const messages = Array.isArray(saved?.messages) ? saved.messages.slice(-12) : [];
      if (!messages.length || history.length) return;
      const safeMessages = messages.map((entry) => ({
        role: entry?.role === "assistant" ? "assistant" : "user",
        content: plainText(entry?.content).slice(0, 1_500)
      })).filter((entry) => entry.content);
      if (!safeMessages.length) return;
      chatLog.querySelector(".education-empty-actions")?.remove();
      chatLog.querySelector(".education-welcome")?.remove();
      history.push(...safeMessages);
      lastAssessment = saved?.last_assessment && typeof saved.last_assessment === "object" ? saved.last_assessment : null;
      for (const entry of safeMessages) await appendMessage(entry.role, entry.content);
      const latestQuestion = [...safeMessages].reverse().find((entry) => entry.role === "user")?.content || "";
      lastQuestion = latestQuestion;
      if (latestQuestion) addRecentAnalysis(latestQuestion, lastAssessment);
      updateProtection(lastAssessment);
      setStatus(chatStatus, copy("Your previous chat was restored on this device.", "ဤစက်တွင် သိမ်းထားသော ယခင်စကားဝိုင်းကို ပြန်လည်ဖွင့်ပြီးပါပြီ။"), "success");
    } catch {
      // A malformed or blocked local history must never prevent the chat from opening.
    }
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
    submitReadiness.sync();
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
    submitReadiness.sync();
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

  const RESPONSE_LABELS = [
    ["summary", ["Summary", "အကျဉ်းချုပ်"]],
    ["threat-level", ["Risk Level", "Threat Level", "အန္တရာယ်အဆင့်"]],
    ["confidence", ["Confidence", "Confidence Score", "ယုံကြည်မှုအဆင့်"]],
    ["reasons", ["Reason", "Reasons", "အကြောင်းရင်း", "အကြောင်းရင်းများ"]],
    ["warning-signs", ["Warning Signs", "Indicators", "သတိပေးလက္ခဏာများ"]],
    ["evidence", ["Evidence Found", "Evidence", "တွေ့ရှိသော သက်သေအထောက်အထား", "တွေ့ရှိသောသက်သေ"]],
    ["recommended-actions", ["What You Should Do", "Recommended Actions", "သင်လုပ်သင့်သည်", "အကြံပြု လုပ်ဆောင်ချက်များ", "အကြံပြုလုပ်ဆောင်ချက်များ"]],
    ["prevention", ["Prevention Tips", "Prevention Tip", "ကာကွယ်ရေး အကြံပြုချက်", "ကာကွယ်ရေးအကြံပြုချက်"]],
    ["references", ["References", "ကိုးကားချက်များ"]],
    ["related", ["Related Scams", "ဆက်စပ်လိမ်လည်မှုများ"]],
    ["did-you-know", ["Did you know", "Did you know?", "သိထားသင့်သည်"]]
  ];

  function parseResponseSections(value) {
    const lines = plainText(value).split("\n");
    const sections = [];
    let current = null;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      let matched = null;
      for (const [key, labels] of RESPONSE_LABELS) {
        const label = labels.find((candidate) => line === candidate || line.startsWith(`${candidate}:`) || line.startsWith(`${candidate}။`));
        if (label) { matched = { key, label, rest: line.slice(label.length).replace(/^\s*[:။-]\s*/, "") }; break; }
      }
      if (matched) {
        current = { key: matched.key, title: matched.label.replace(/[?။]$/, ""), content: matched.rest };
        sections.push(current);
      } else if (current) current.content += `${current.content ? "\n" : ""}${line}`;
      else {
        current = { key: "summary", title: copy("Summary", "အကျဉ်းချုပ်"), content: line };
        sections.push(current);
      }
    }
    return sections.filter((section) => section.content);
  }

  function addMessageTime(container) {
    const time = document.createElement("time");
    time.className = "education-message-time";
    time.dateTime = new Date().toISOString();
    time.textContent = timeLabel();
    container.append(time);
  }

  function applyRiskBadge(container, assessment) {
    let badge = container.querySelector(".education-risk-badge");
    const risk = String(assessment?.risk || "").toUpperCase();
    if (!RISK_LEVELS.has(risk)) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "education-risk-badge";
      container.prepend(badge);
    }
    const confidence = Math.max(0, Math.min(99, Number(assessment.confidence) || 0));
    badge.dataset.risk = risk.toLowerCase();
    const riskLabel = locale() === "my"
      ? ({ HIGH: "အန္တရာယ်မြင့်", MEDIUM: "သံသယရှိ", LOW: "အန္တရာယ်နည်း" }[risk] || risk)
      : risk;
    badge.textContent = `${riskLabel} · ${confidence}%`;
  }

  function renderStructuredResponse(container, value) {
    const answer = plainText(value);
    container.querySelector("p")?.remove();
    container.querySelector(".education-response-grid")?.remove();
    container.querySelector(".education-response-actions")?.remove();
    container.querySelector(".education-message-time")?.remove();
    const sections = parseResponseSections(answer);
    const grid = document.createElement("div");
    grid.className = "education-response-grid";
    const groupContent = (keys, limit) => [...new Set(sections
      .filter((section) => keys.includes(section.key))
      .map((section) => section.content.trim())
      .filter(Boolean))].join("\n").slice(0, limit);
    const compactSections = [
      {
        key: "threat-level",
        title: copy("Risk Level", "အန္တရာယ်အဆင့်"),
        content: groupContent(["threat-level", "confidence"], 260)
      },
      {
        key: "reasons",
        title: copy("Reason", "အကြောင်းရင်း"),
        content: groupContent(["summary", "reasons", "warning-signs", "evidence"], 850)
      },
      {
        key: "recommended-actions",
        title: copy("What You Should Do", "သင်လုပ်သင့်သည်"),
        content: groupContent(["recommended-actions", "prevention"], 900)
      }
    ].filter((section) => section.content);
    if (!compactSections.length) compactSections.push({
      key: "summary",
      title: copy("Assessment", "စိစစ်ချက်"),
      content: answer.slice(0, 1_200)
    });
    for (const section of compactSections) {
      const card = document.createElement("section");
      card.className = "education-response-section";
      card.dataset.section = section.key;
      const heading = document.createElement("h3");
      heading.textContent = section.title;
      const paragraph = document.createElement("p");
      paragraph.textContent = section.content;
      card.append(heading, paragraph);
      grid.append(card);
    }
    container.append(grid);
    addMessageTime(container);
  }

  function updateProtection(assessment) {
    if (!protectionScore || !protectionLabel || !currentAnalysis) return;
    if (!assessment?.risk) {
      protectionScore.style.setProperty("--score", 0);
      protectionScore.removeAttribute("data-risk");
      protectionScore.querySelector("strong").textContent = "—";
      protectionLabel.textContent = copy("No analysis", "မစိစစ်ရသေးပါ");
      currentAnalysis.textContent = copy("Add evidence to start a private security analysis.", "သီးသန့်လုံခြုံရေးစိစစ်မှု စတင်ရန် သက်သေအထောက်အထား ထည့်ပါ။");
      return;
    }
    const confidence = Math.max(0, Math.min(99, Number(assessment.confidence) || 0));
    const risk = String(assessment.risk).toUpperCase();
    protectionScore.dataset.risk = risk.toLowerCase();
    protectionScore.style.setProperty("--score", confidence);
    protectionScore.querySelector("strong").textContent = `${confidence}%`;
    protectionLabel.textContent = risk === "HIGH" ? copy("High risk", "အန္တရာယ်မြင့်") : risk === "MEDIUM" ? copy("Needs review", "ထပ်မံစစ်ဆေးရန်လို") : copy("Low signal", "အန္တရာယ်လက္ခဏာနည်း");
    currentAnalysis.textContent = locale() === "my"
      ? "လုံခြုံရေးစိစစ်မှု ပြီးပါပြီ။"
      : assessment.category || "Security analysis complete.";
  }

  function localAssessmentAnswer(assessment) {
    const risk = String(assessment?.risk || "").toUpperCase();
    const confidence = Math.max(0, Math.min(99, Number(assessment?.confidence) || 0));
    if (locale() === "my") {
      const label = ({ HIGH: "အန္တရာယ်မြင့်", MEDIUM: "သံသယရှိ", LOW: "အန္တရာယ်နည်း" })[risk] || "မသေချာသေး";
      const reason = risk === "HIGH"
        ? "SafeMind ၏ စိစစ်မှုတွင် ပြင်းထန်သော လိမ်လည်မှုလက္ခဏာများ တွေ့ရှိထားပါသည်။ လုံခြုံကြောင်း သီးခြားအတည်မပြုမချင်း မလုပ်ဆောင်ပါနှင့်။"
        : risk === "MEDIUM"
          ? "SafeMind ၏ စိစစ်မှုတွင် သံသယဖြစ်ဖွယ် လက္ခဏာများ တွေ့ရှိထားပါသည်။ တရားဝင်လမ်းကြောင်းမှ အရင်စစ်ဆေးပါ။"
          : "SafeMind ၏ စိစစ်မှုတွင် ပြင်းထန်သော အန္တရာယ်လက္ခဏာ မတွေ့ရသေးပါ။ သို့သော် လုံခြုံကြောင်း အာမခံခြင်း မဟုတ်ပါ။";
      return `အန္တရာယ်အဆင့်\n${label} · ${confidence}%\n\nအကြောင်းရင်း\n${reason}\n\nသင်လုပ်သင့်သည်\n• မမျှော်လင့်သော လင့်ခ်ကို မနှိပ်ပါနှင့်။\n• OTP၊ စကားဝှက်နှင့် ဘဏ်အချက်အလက်ကို မမျှဝေပါနှင့်။\n• ပို့သူကို တရားဝင်အက်ပ်၊ ဝဘ်ဆိုက် သို့မဟုတ် ကိုယ်တိုင်ရှာထားသော ဖုန်းနံပါတ်မှ အတည်ပြုပါ။`;
    }
    const reason = risk === "HIGH"
      ? "SafeMind found strong scam indicators. Treat the content as unsafe until it is independently verified."
      : risk === "MEDIUM"
        ? "SafeMind found suspicious indicators that require verification through an official channel."
        : "SafeMind found no strong automated warning signs, but this does not guarantee the content is safe.";
    return `Risk Level\n${risk || "UNKNOWN"} · ${confidence}%\n\nReason\n${reason}\n\nWhat You Should Do\n• Do not open unexpected links or share security codes.\n• Verify the sender through an official app, website, or independently found phone number.\n• Block and report the sender if the request remains suspicious.`;
  }

  function addRecentAnalysis(question, assessment) {
    if (!recentAnalyses) return;
    if (recentAnalyses.querySelector(":scope > span")) recentAnalyses.replaceChildren();
    const button = document.createElement("button");
    button.type = "button";
    const title = document.createElement("strong");
    const meta = document.createElement("small");
    title.textContent = question;
    const risk = String(assessment?.risk || "").toUpperCase();
    const riskLabel = locale() === "my"
      ? ({ HIGH: "အန္တရာယ်မြင့်", MEDIUM: "သံသယရှိ", LOW: "အန္တရာယ်နည်း" }[risk] || "စစ်ဆေးပြီး")
      : risk || "Checked";
    meta.textContent = `${riskLabel} · ${timeLabel()}`;
    button.append(title, meta);
    button.addEventListener("click", () => { questionInput.value = question; submitReadiness.sync(); questionInput.focus(); });
    recentAnalyses.prepend(button);
    while (recentAnalyses.children.length > 3) recentAnalyses.lastElementChild.remove();
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
    if (role === "assistant") {
      const icon = document.createElement("img");
      icon.src = "/assets/green-logo.png";
      icon.alt = "";
      avatar.append(icon);
    } else {
      avatar.textContent = copy("You", "သင်");
    }
    const content = document.createElement("div");
    applyRiskBadge(content, assessment);
    const paragraph = document.createElement("p");
    const normalizedText = plainText(text);
    if (!animate) paragraph.textContent = normalizedText;
    content.append(paragraph);
    if (!animate) addMessageTime(content);
    article.append(avatar, content);
    chatLog.append(article);
    article.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (animate) {
      await renderTokenizedOutput(paragraph, normalizedText);
      if (role === "assistant") renderStructuredResponse(content, normalizedText);
      else addMessageTime(content);
    }
    return normalizedText;
  }

  function createLoadingMessage() {
    const article = document.createElement("article");
    article.className = "education-message is-assistant is-loading";
    const avatar = document.createElement("span");
    avatar.className = "education-message-avatar";
    avatar.setAttribute("aria-hidden", "true");
    const icon = document.createElement("img");
    icon.src = "/assets/green-logo.png";
    icon.alt = "";
    avatar.append(icon);
    const content = document.createElement("div");
    const label = document.createElement("strong");
    label.textContent = copy("Analyzing evidence...", "သက်သေအထောက်အထားကို စိစစ်နေသည်...");
    const dots = document.createElement("span");
    dots.className = "education-typing-dots";
    dots.setAttribute("aria-hidden", "true");
    dots.innerHTML = "<i></i><i></i><i></i>";
    const waitPanel = document.createElement("div");
    waitPanel.className = "education-wait-panel";
    waitPanel.hidden = true;
    const waitText = document.createElement("p");
    const waitActions = document.createElement("div");
    const continueButton = document.createElement("button");
    const retryButton = document.createElement("button");
    const cancelButton = document.createElement("button");
    continueButton.type = retryButton.type = cancelButton.type = "button";
    continueButton.textContent = copy("Continue waiting", "ဆက်လက်စောင့်ရန်");
    retryButton.textContent = copy("Retry", "ထပ်ကြိုးစားရန်");
    cancelButton.textContent = copy("Cancel", "မလုပ်တော့ပါ");
    waitActions.append(continueButton, retryButton, cancelButton);
    waitPanel.append(waitText, waitActions);
    content.append(label, dots, waitPanel);
    article.append(avatar, content);
    chatLog.append(article);
    chatLog.scrollTop = chatLog.scrollHeight;

    const timers = [];
    timers.push(window.setTimeout(() => {
      label.textContent = copy("Checking scam indicators...", "လိမ်လည်မှုလက္ခဏာများကို စစ်ဆေးနေသည်...");
    }, 1_600));
    timers.push(window.setTimeout(() => {
      waitText.textContent = copy("I'm still analyzing this evidence. You can keep waiting, retry, or cancel.", "ဤသက်သေအထောက်အထားကို ဆက်လက်စိစစ်နေပါသည်။ ဆက်စောင့်နိုင်သလို ထပ်ကြိုးစားခြင်း သို့မဟုတ် မလုပ်တော့ခြင်းကို ရွေးနိုင်ပါသည်။");
      waitPanel.hidden = false;
      dots.hidden = true;
    }, 8_000));

    let responseParagraph = null;
    function clearTimers() { timers.forEach(window.clearTimeout); }
    return {
      article,
      continueButton,
      retryButton,
      cancelButton,
      reset() {
        clearTimers();
        article.remove();
        return createLoadingMessage();
      },
      beginResponse(assessment) {
        clearTimers();
        article.classList.remove("is-loading");
        content.replaceChildren();
        applyRiskBadge(content, assessment);
        responseParagraph = document.createElement("p");
        responseParagraph.textContent = copy("Preparing guidance...", "အကြံပြုချက် ပြင်ဆင်နေသည်...");
        content.append(responseParagraph);
      },
      setResponse(text) {
        if (!responseParagraph) this.beginResponse(lastAssessment);
        responseParagraph.textContent = plainText(text);
        chatLog.scrollTop = chatLog.scrollHeight;
      },
      finish(text, assessment = null) {
        clearTimers();
        applyRiskBadge(content, assessment);
        this.setResponse(text);
        renderStructuredResponse(content, text);
        article.classList.remove("is-loading");
      },
      cancel() {
        clearTimers();
        content.replaceChildren();
        const message = document.createElement("p");
        message.textContent = copy("Analysis cancelled. Your evidence remains available if you want to try again.", "စိစစ်မှုကို ရပ်လိုက်ပါပြီ။ ထပ်ကြိုးစားလိုပါက သက်သေအထောက်အထားကို ဆက်လက်အသုံးပြုနိုင်သည်။");
        content.append(message);
        addMessageTime(content);
        article.classList.remove("is-loading");
      }
    };
  }

  function updateFollowUps(prompts) {
    const container = document.querySelector(".education-quick-prompts");
    if (!container || !Array.isArray(prompts) || !prompts.length) return;
    container.replaceChildren(...prompts.map((prompt) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.educationPrompt = prompt;
      button.textContent = prompt;
      button.addEventListener("click", () => { questionInput.value = prompt; submitReadiness.sync(); questionInput.focus(); });
      return button;
    }));
  }

  async function sendQuestion(question) {
    const typedQuestion = String(question || "").trim();
    const selectedType = evidenceType.value;
    const questionOnly = /^(?:why|what|how|when|where|who|is|are|can|could|should|would|explain|teach|tell|ဘာ|ဘယ်|မည်|ရှင်းပြ|သင်ပေး)/iu.test(typedQuestion)
      || /[?？]$/.test(typedQuestion);
    const evidenceText = evidenceInput.value.trim()
      || (typedQuestion && (selectedType !== "auto" || !questionOnly) ? typedQuestion : "");
    if (!question && !evidenceText && !selectedImage) {
      setStatus(chatStatus, copy("Add evidence or enter a question first.", "သက်သေအထောက်အထား ထည့်ပါ သို့မဟုတ် မေးခွန်းတစ်ခု ရေးပါ။"), "error");
      return;
    }
    const userQuestion = question || copy("Please assess this evidence and explain whether it may be a scam.", "ဤသက်သေအထောက်အထားကို စစ်ဆေးပြီး လိမ်လည်မှုဖြစ်နိုင်ခြေကို ရှင်းပြပါ။");
    lastQuestion = userQuestion;
    const scanType = selectedType === "auto" ? detectType(evidenceText || userQuestion) : selectedType;
    const previousHistory = history.slice(-8);
    chatLog.querySelector(".education-empty-actions")?.remove();
    chatLog.querySelector(".education-welcome")?.remove();
    submitReadiness.setBusy(true);
    questionInput.value = "";
    questionInput.style.height = "auto";
    questionInput.disabled = true;
    await appendMessage("user", userQuestion);
    history.push({ role: "user", content: userQuestion });
    persistChatHistory();
    setStatus(chatStatus, copy("SafeMind is matching NLP signals and verified records...", "SafeMind သည် NLP လက္ခဏာများနှင့် အတည်ပြုမှတ်တမ်းများကို တိုက်စစ်နေသည်..."), "pending");
    const loadingMessage = createLoadingMessage();
    const directoryContext = await Promise.race([
      directoryLookup(scanType, evidenceText),
      new Promise((resolve) => window.setTimeout(() => resolve(null), 650))
    ]);
    const requestPayload = {
      question: userQuestion,
      evidence_text: evidenceText,
      scan_type: scanType,
      image: selectedImage,
      directory_context: directoryContext,
      history: previousHistory,
      language: locale(),
      stream: true,
      memory: { last_assessment: lastAssessment, evidence_retained: Boolean(evidenceText || selectedImage) }
    };

    async function startAttempt(loading) {
      const controller = new AbortController();
      activeRequest = controller;
      let retrying = false;
      let cancelled = false;
      let streamedText = "";
      let renderFrame = 0;
      const scheduleStreamRender = () => {
        if (renderFrame) return;
        renderFrame = window.requestAnimationFrame(() => {
          renderFrame = 0;
          loading.setResponse(streamedText);
        });
      };
      loading.continueButton.onclick = () => {
        loading.continueButton.closest(".education-wait-panel").hidden = true;
        setStatus(chatStatus, copy("Still analyzing. The answer will stream here when ready.", "ဆက်လက်စိစစ်နေပါသည်။ အဖြေရရှိသည်နှင့် ဤနေရာတွင် တဖြည်းဖြည်း ပြသပါမည်။"), "pending");
      };
      loading.retryButton.onclick = () => {
        retrying = true;
        controller.abort();
        const nextLoading = loading.reset();
        setStatus(chatStatus, copy("Retrying the analysis...", "စိစစ်မှုကို ထပ်မံကြိုးစားနေသည်..."), "pending");
        void startAttempt(nextLoading);
      };
      loading.cancelButton.onclick = () => {
        cancelled = true;
        controller.abort();
        loading.cancel();
        setStatus(chatStatus, copy("Analysis cancelled.", "စိစစ်မှုကို ရပ်လိုက်ပါပြီ။"), "pending");
      };
      const timeout = window.setTimeout(() => controller.abort(), 65_000);
      try {
        const response = await fetch(educationApiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/x-ndjson" },
          credentials: "same-origin",
          signal: controller.signal,
          body: JSON.stringify(requestPayload)
        });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.error || copy("I'm sorry, I couldn't generate an answer. Please try again.", "စိတ်မကောင်းပါ။ အဖြေမထုတ်ပေးနိုင်ပါ။ ထပ်မံကြိုးစားပါ။"));
        }
        if (!response.body) throw new Error(copy("The streaming response is unavailable. Please retry.", "အဖြေကို တဖြည်းဖြည်းပြသနိုင်ခြင်း မရှိပါ။ ထပ်မံကြိုးစားပါ။"));
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let doneEvent = null;
        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            let event;
            try { event = JSON.parse(line); } catch { continue; }
            if (event.type === "meta") {
              lastAssessment = event.assessment || null;
              updateProtection(lastAssessment);
              loading.beginResponse(lastAssessment);
              setStatus(chatStatus, copy("Risk classified. Preparing guidance...", "အန္တရာယ်အဆင့် သတ်မှတ်ပြီးပါပြီ။ အကြံပြုချက် ပြင်ဆင်နေသည်..."), "pending");
            } else if (event.type === "token") {
              streamedText += event.token || "";
              scheduleStreamRender();
            } else if (event.type === "done") {
              doneEvent = event;
              streamedText = event.answer || streamedText;
            } else if (event.type === "error") {
              throw new Error(event.message || copy("The model stopped responding. Please retry.", "AI အဖြေ ရပ်တန့်သွားသည်။ ထပ်မံကြိုးစားပါ။"));
            }
          }
          if (done) break;
        }
        if (renderFrame) {
          window.cancelAnimationFrame(renderFrame);
          renderFrame = 0;
        }
        if (!doneEvent?.answer && !streamedText.trim()) throw new Error(copy("I'm sorry, I couldn't generate an answer. Please try again.", "စိတ်မကောင်းပါ။ အဖြေမထုတ်ပေးနိုင်ပါ။ ထပ်မံကြိုးစားပါ။"));
        const completedAnswer = plainText(doneEvent?.answer || streamedText);
        lastAssessment = doneEvent?.assessment || lastAssessment;
        updateProtection(lastAssessment);
        loading.finish(completedAnswer, lastAssessment);
        history.push({ role: "assistant", content: completedAnswer });
        persistChatHistory();
        addRecentAnalysis(userQuestion, lastAssessment);
        updateFollowUps(doneEvent?.follow_ups || []);
        setStatus(chatStatus, doneEvent?.response_complete === false
          ? copy("The response reached its limit. Use a follow-up to continue.", "အဖြေကန့်သတ်ချက်သို့ ရောက်သွားသည်။ ဆက်မေးရန် အောက်ပါမေးခွန်းများကို သုံးပါ။")
          : copy("Analysis complete.", "စိစစ်မှု ပြီးပါပြီ။"), doneEvent?.response_complete === false ? "pending" : "success");
      } catch (error) {
        if (retrying || cancelled) return;
        if (lastAssessment?.risk) {
          const fallbackAnswer = localAssessmentAnswer(lastAssessment);
          loading.finish(fallbackAnswer, lastAssessment);
          history.push({ role: "assistant", content: fallbackAnswer });
          persistChatHistory();
          addRecentAnalysis(userQuestion, lastAssessment);
          setStatus(chatStatus, copy(
            "Live coaching is temporarily unavailable. Showing the completed SafeMind assessment.",
            "တိုက်ရိုက်အကြံပေးစနစ်ကို ယာယီအသုံးမပြုနိုင်ပါ။ ပြီးစီးထားသော SafeMind စိစစ်ချက်ကို ပြသထားပါသည်။"
          ), "warning");
          return;
        }
        const message = error.name === "AbortError"
          ? copy("The request took too long. Retry when you are ready.", "တောင်းဆိုမှု အချိန်ကြာလွန်းပါသည်။ အဆင်ပြေသည့်အခါ ထပ်မံကြိုးစားပါ။")
          : locale() === "my" && /temporarily unavailable|busy right now|not configured/i.test(String(error.message || ""))
            ? "Scam Coach ကို ယာယီအသုံးမပြုနိုင်ပါ။ သက်သေအထောက်အထားကို ဆက်လက်သိမ်းထားပြီး မကြာမီ ထပ်မံကြိုးစားပါ။"
            : error.message || copy("I'm sorry, I couldn't generate an answer. Please try again.", "စိတ်မကောင်းပါ။ အဖြေမထုတ်ပေးနိုင်ပါ။ ထပ်မံကြိုးစားပါ။");
        loading.finish(message, lastAssessment);
        setStatus(chatStatus, message, "error");
      } finally {
        if (renderFrame) window.cancelAnimationFrame(renderFrame);
        window.clearTimeout(timeout);
        if (activeRequest === controller) {
          activeRequest = null;
          submitReadiness.setBusy(false);
          questionInput.disabled = false;
          questionInput.focus();
        }
      }
    }
    void startAttempt(loadingMessage);
  }

  fileInput?.addEventListener("change", async () => {
    try { await handleFile(fileInput.files?.[0]); }
    catch (error) { clearFile(); setStatus(fileStatus, error.message, "error"); }
    finally { fileInput.accept = "image/png,image/jpeg,image/webp,text/plain,.txt,.eml"; }
  });
  fileRemove?.addEventListener("click", () => clearFile());

  function showEvidence(type = "auto", focusEvidence = false) {
    evidenceTray.hidden = false;
    evidenceType.value = type;
    if (focusEvidence) window.setTimeout(() => evidenceInput.focus(), 0);
  }

  async function copyText(value) {
    try { await navigator.clipboard.writeText(value); }
    catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
  }

  document.addEventListener("click", async (event) => {
    const promptButton = event.target.closest("[data-education-prompt]");
    if (promptButton) {
      const prompt = promptButton.dataset.educationPrompt;
      questionInput.value = locale() === "my"
        ? ({
            "Why does this look like a scam?": "ဒီအကြောင်းအရာက ဘာကြောင့် လိမ်လည်မှုဖြစ်နိုင်တာလဲ။",
            "What should I do immediately after being scammed?": "လိမ်လည်ခံရပြီးနောက် ချက်ချင်း ဘာလုပ်သင့်သလဲ။",
            "Explain the warning signs in simple language.": "သတိပေးလက္ခဏာများကို ရိုးရှင်းစွာ ရှင်းပြပါ။",
            "Teach me how urgency is used in scams.": "လိမ်လည်သူများက အလျင်စလိုဖြစ်အောင် ဘယ်လိုဖိအားပေးသလဲ သင်ပေးပါ။"
          })[prompt] || prompt
        : prompt;
      submitReadiness.sync();
      questionInput.focus();
      return;
    }

    const emptyAction = event.target.closest("[data-education-empty-action]");
    if (emptyAction) {
      const action = emptyAction.dataset.educationEmptyAction;
      document.querySelectorAll("[data-education-empty-action]").forEach((button) => button.classList.toggle("is-active", button === emptyAction));
      const type = action === "paste" ? "message" : ["link", "email", "phone"].includes(action) ? action : "auto";
      evidenceType.value = type;
      const placeholders = locale() === "my"
        ? {
            paste: "သံသယဖြစ်ဖွယ် စာတိုကို ဤနေရာတွင် ထည့်ပါ...",
            link: "စစ်ဆေးလိုသော ဝဘ်ဆိုက်လင့်ခ်ကို ထည့်ပါ...",
            email: "သံသယဖြစ်ဖွယ် အီးမေးလ်လိပ်စာ သို့မဟုတ် စာကို ထည့်ပါ...",
            phone: "စစ်ဆေးလိုသော ဖုန်းနံပါတ်ကို ထည့်ပါ...",
            upload: "စခရင်ရှော့ထည့်ပြီး လိုအပ်သည့်အကြောင်းကို ရေးပါ...",
            qr: "QR တွင် ပါသောလင့်ခ်ကို ထည့်ပါ သို့မဟုတ် QR စခရင်ရှော့ကို ပူးတွဲပါ..."
          }
        : {
            paste: "Paste a suspicious message...",
            link: "Paste the website link to check...",
            email: "Paste a suspicious email address or message...",
            phone: "Enter the phone number to check...",
            upload: "Attach a screenshot and add any useful context...",
            qr: "Paste the QR destination or attach a QR screenshot..."
          };
      questionInput.placeholder = placeholders[action] || placeholders.paste;
      if (action === "upload") {
        evidenceTray.hidden = false;
        fileInput.accept = "image/png,image/jpeg,image/webp";
        fileInput?.click();
      } else questionInput.focus();
      return;
    }

    const responseButton = event.target.closest("[data-response-action]");
    if (!responseButton) return;
    const action = responseButton.dataset.responseAction;
    const answer = responseButton.dataset.answer || "";
    if (action === "copy") {
      await copyText(answer);
      responseButton.textContent = "✓";
      setStatus(chatStatus, copy("Analysis copied.", "စိစစ်ချက်ကို မိတ္တူကူးပြီးပါပြီ။"), "success");
    } else if (action === "regenerate") {
      if (!submitButton.disabled && lastQuestion) void sendQuestion(lastQuestion);
    } else if (action === "share") {
      if (navigator.share) await navigator.share({ title: "SafeMind Scam Analysis", text: answer }).catch(() => {});
      else { await copyText(answer); setStatus(chatStatus, copy("Analysis copied for sharing.", "မျှဝေရန် စိစစ်ချက်ကို မိတ္တူကူးပြီးပါပြီ။"), "success"); }
    } else {
      const pressed = responseButton.getAttribute("aria-pressed") !== "true";
      responseButton.setAttribute("aria-pressed", String(pressed));
      responseButton.textContent = action === "bookmark" ? (pressed ? "★" : "☆") : responseButton.textContent;
      setStatus(chatStatus, action === "bookmark"
        ? copy(pressed ? "Analysis bookmarked." : "Bookmark removed.", pressed ? "စိစစ်ချက်ကို သိမ်းထားပါပြီ။" : "သိမ်းထားမှုကို ဖယ်ရှားပြီးပါပြီ။")
        : copy("Thanks for your feedback.", "အကြံပြုချက်အတွက် ကျေးဇူးတင်ပါသည်။"), "success");
    }
  });

  attachButton?.addEventListener("click", () => {
    evidenceTray.hidden = false;
    fileInput.accept = "image/png,image/jpeg,image/webp,text/plain,.txt,.eml";
    fileInput?.click();
  });
  evidenceClose?.addEventListener("click", () => { evidenceTray.hidden = true; questionInput.focus(); });
  cameraButton?.addEventListener("click", () => {
    showEvidence("auto");
    fileInput.accept = "image/png,image/jpeg,image/webp";
    fileInput.click();
  });
  emojiButton?.addEventListener("click", () => {
    const start = questionInput.selectionStart || questionInput.value.length;
    questionInput.setRangeText(" 🛡️", start, start, "end");
    submitReadiness.sync();
    questionInput.focus();
  });
  voiceButton?.addEventListener("click", () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatus(chatStatus, copy("Voice input is not supported in this browser.", "ဤဘရောက်ဇာတွင် အသံဖြင့်ရေးသားခြင်းကို မပံ့ပိုးပါ။"), "error");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = locale() === "my" ? "my-MM" : "en-US";
    recognition.interimResults = false;
    recognition.onstart = () => { voiceButton.setAttribute("aria-pressed", "true"); setStatus(chatStatus, copy("Listening...", "နားထောင်နေသည်..."), "pending"); };
    recognition.onresult = (result) => { questionInput.value = `${questionInput.value} ${result.results[0][0].transcript}`.trim(); submitReadiness.sync(); };
    recognition.onerror = () => setStatus(chatStatus, copy("Voice input could not start.", "အသံဖြင့်ရေးသားခြင်း မစတင်နိုင်ပါ။"), "error");
    recognition.onend = () => { voiceButton.setAttribute("aria-pressed", "false"); questionInput.focus(); };
    recognition.start();
  });
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
  questionInput.addEventListener("input", () => {
    questionInput.style.height = "auto";
    questionInput.style.height = `${Math.min(questionInput.scrollHeight, 124)}px`;
  });
  newChatButton?.addEventListener("click", () => {
    activeRequest?.abort();
    activeRequest = null;
    lastAssessment = null;
    lastQuestion = "";
    history.length = 0;
    if (chatStorageKey) {
      try { localStorage.removeItem(chatStorageKey); } catch { /* Storage may be blocked. */ }
    }
    chatLog.innerHTML = initialChat;
    questionInput.value = "";
    evidenceInput.value = "";
    evidenceTray.hidden = true;
    updateProtection(null);
    clearFile();
    setStatus(chatStatus, copy("New private chat started.", "သီးသန့်စကားဝိုင်းအသစ် စတင်ပါပြီ။"), "success");
  });
  function applyLaunchIntent() {
    const intent = new URLSearchParams(window.location.search).get("prompt");
    const prompts = {
      urgency: "Teach me how urgency is used in scams.",
      verify: "Teach me how to verify a suspicious sender safely.",
      recovery: "Teach me what to do after I have been scammed.",
      investment: "Explain investment scams and their warning signs.",
      job: "Explain fake job scams and upfront fee warning signs.",
      romance: "Explain romance scams and how to respond safely.",
      qr: "Explain malicious QR code scams and how to check them.",
      marketplace: "Explain marketplace scams involving fake buyers or delivery fees.",
      bank: "Explain bank impersonation scams and account verification pressure.",
      crypto: "Explain crypto wallet and recovery phrase scams."
    };
    if (prompts[intent]) { questionInput.value = prompts[intent]; submitReadiness.sync(); }
    if (window.location.hash === "#upload") showEvidence("auto");
    if (prompts[intent] || window.location.hash === "#upload") questionInput.focus();
  }

  void restoreChatHistory().finally(applyLaunchIntent);
}
