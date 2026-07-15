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
  let activeRequest = null;
  let lastAssessment = null;

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

  function loadingStages() {
    return locale() === "my"
      ? ["အကောင့်အချက်အလက် ခိုးယူသည့်ပုံစံများကို ရှာဖွေနေသည်", "ဘာသာစကားပုံစံဖြင့် စာသားကို စိစစ်နေသည်", "အတည်ပြုထားသော လိမ်လည်မှုမှတ်တမ်းနှင့် တိုက်စစ်နေသည်", "လူမှုဆိုင်ရာ လှည့်ဖြားမှုလက္ခဏာများကို သုံးသပ်နေသည်", "နားလည်လွယ်သော အဖြေကို ပြင်ဆင်နေသည်"]
      : ["Detecting phishing patterns", "Running NLP analysis", "Checking known scam records", "Evaluating social engineering signals", "Preparing a clear explanation"];
  }

  function createLoadingMessage() {
    const article = document.createElement("article");
    article.className = "education-message is-assistant is-loading";
    const avatar = document.createElement("span");
    avatar.className = "education-message-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = "SM";
    const content = document.createElement("div");
    const label = document.createElement("strong");
    label.textContent = copy("Analyzing evidence...", "သက်သေအထောက်အထားကို စိစစ်နေသည်...");
    const dots = document.createElement("span");
    dots.className = "education-typing-dots";
    dots.setAttribute("aria-hidden", "true");
    dots.innerHTML = "<i></i><i></i><i></i>";
    const stages = document.createElement("ul");
    stages.className = "education-analysis-stages";
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
    content.append(label, dots, stages, waitPanel);
    article.append(avatar, content);
    chatLog.append(article);
    chatLog.scrollTop = chatLog.scrollHeight;

    const timers = [];
    const stageItems = loadingStages().map((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      stages.append(item);
      return item;
    });
    stageItems.forEach((item, index) => timers.push(window.setTimeout(() => {
      item.classList.add("is-complete");
      if (index === 1) label.textContent = copy("Checking scam indicators...", "လိမ်လည်မှုလက္ခဏာများကို စစ်ဆေးနေသည်...");
    }, 850 + index * 900)));
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
        if (assessment?.risk) {
          const badge = document.createElement("span");
          badge.className = "education-risk-badge";
          badge.dataset.risk = String(assessment.risk).toLowerCase();
          badge.textContent = `${assessment.risk} · ${assessment.confidence || 0}%`;
          content.append(badge);
        }
        responseParagraph = document.createElement("p");
        content.append(responseParagraph);
      },
      setResponse(text) {
        if (!responseParagraph) this.beginResponse(lastAssessment);
        responseParagraph.textContent = plainText(text);
        chatLog.scrollTop = chatLog.scrollHeight;
      },
      finish(text) {
        clearTimers();
        this.setResponse(text);
        article.classList.remove("is-loading");
      },
      cancel() {
        clearTimers();
        content.replaceChildren();
        const message = document.createElement("p");
        message.textContent = copy("Analysis cancelled. Your evidence remains available if you want to try again.", "စိစစ်မှုကို ရပ်လိုက်ပါပြီ။ ထပ်ကြိုးစားလိုပါက သက်သေအထောက်အထားကို ဆက်လက်အသုံးပြုနိုင်သည်။");
        content.append(message);
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
      button.addEventListener("click", () => { questionInput.value = prompt; questionInput.focus(); });
      return button;
    }));
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
    chatLog.querySelector(".education-empty-actions")?.remove();
    await appendMessage("user", userQuestion);
    history.push({ role: "user", content: userQuestion });
    submitButton.disabled = true;
    questionInput.disabled = true;
    setStatus(chatStatus, copy("SafeMind is matching NLP signals and verified records...", "SafeMind သည် NLP လက္ခဏာများနှင့် အတည်ပြုမှတ်တမ်းများကို တိုက်စစ်နေသည်..."), "pending");
    const loadingMessage = createLoadingMessage();
    const directoryContext = await directoryLookup(scanType, evidenceText);
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
        let streamedText = "";
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
              loading.beginResponse(lastAssessment);
            } else if (event.type === "token") {
              streamedText += event.token || "";
              loading.setResponse(streamedText);
            } else if (event.type === "done") {
              doneEvent = event;
              streamedText = event.answer || streamedText;
            } else if (event.type === "error") {
              throw new Error(event.message || copy("The model stopped responding. Please retry.", "AI အဖြေ ရပ်တန့်သွားသည်။ ထပ်မံကြိုးစားပါ။"));
            }
          }
          if (done) break;
        }
        if (!doneEvent?.answer && !streamedText.trim()) throw new Error(copy("I'm sorry, I couldn't generate an answer. Please try again.", "စိတ်မကောင်းပါ။ အဖြေမထုတ်ပေးနိုင်ပါ။ ထပ်မံကြိုးစားပါ။"));
        const completedAnswer = plainText(doneEvent?.answer || streamedText);
        loading.finish(completedAnswer);
        history.push({ role: "assistant", content: completedAnswer });
        updateFollowUps(doneEvent?.follow_ups || []);
        questionInput.value = "";
        setStatus(chatStatus, doneEvent?.response_complete === false
          ? copy("The response reached its limit. Use a follow-up to continue.", "အဖြေကန့်သတ်ချက်သို့ ရောက်သွားသည်။ ဆက်မေးရန် အောက်ပါမေးခွန်းများကို သုံးပါ။")
          : copy("Complete response received.", "အဖြေအပြည့်အစုံ ရရှိပါပြီ။"), doneEvent?.response_complete === false ? "pending" : "success");
      } catch (error) {
        if (retrying || cancelled) return;
        const message = error.name === "AbortError"
          ? copy("The request took too long. Retry when you are ready.", "တောင်းဆိုမှု အချိန်ကြာလွန်းပါသည်။ အဆင်ပြေသည့်အခါ ထပ်မံကြိုးစားပါ။")
          : error.message || copy("I'm sorry, I couldn't generate an answer. Please try again.", "စိတ်မကောင်းပါ။ အဖြေမထုတ်ပေးနိုင်ပါ။ ထပ်မံကြိုးစားပါ။");
        loading.finish(message);
        setStatus(chatStatus, message, "error");
      } finally {
        window.clearTimeout(timeout);
        if (activeRequest === controller) {
          activeRequest = null;
          submitButton.disabled = false;
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
  document.querySelectorAll("[data-education-empty-action]").forEach((button) => button.addEventListener("click", () => {
    const action = button.dataset.educationEmptyAction;
    if (action === "upload") fileInput?.click();
    else if (action === "link") { evidenceType.value = "link"; evidenceInput.focus(); }
    else if (action === "paste") evidenceInput.focus();
    else questionInput.focus();
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
    activeRequest?.abort();
    activeRequest = null;
    lastAssessment = null;
    history.length = 0;
    chatLog.innerHTML = initialChat;
    questionInput.value = "";
    evidenceInput.value = "";
    clearFile();
    setStatus(chatStatus, copy("New private chat started.", "သီးသန့်စကားဝိုင်းအသစ် စတင်ပါပြီ။"), "success");
  });
}
