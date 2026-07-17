import "../css/agent-widget.css";

const blockedPages = new Set(["main", "education", "splash", "onboarding"]);
const page = document.body?.dataset.page || "";

if (document.body && !document.body.dataset.authPage && !blockedPages.has(page) && !document.querySelector("[data-safemind-agent]")) {
  const STORAGE_KEY = "safemind-floating-agent-v1";
  const isBurmese = () => document.documentElement.lang === "my";
  const copy = (english, burmese) => isBurmese() ? burmese : english;
  const plainText = (value) => String(value || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`{1,3}/g, "")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/\*+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  let messages = [];
  let lastEvidence = "";
  let lastAssessment = null;
  let busy = false;

  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(saved?.messages)) messages = saved.messages.slice(-10);
    lastEvidence = String(saved?.lastEvidence || "").slice(0, 10_000);
    lastAssessment = saved?.lastAssessment && typeof saved.lastAssessment === "object" ? saved.lastAssessment : null;
  } catch { /* The assistant works without browser storage. */ }

  const root = document.createElement("div");
  root.className = "agent-widget";
  root.dataset.safemindAgent = "";
  root.innerHTML = `
    <button class="agent-launcher" type="button" aria-expanded="false" aria-controls="safeMindAgentPanel" aria-label="Open SafeMind Agent">
      <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.6 2.9 8.4 7 10 4.1-1.6 7-5.4 7-10V6Z"/><path d="M8.5 10.5h7M8.5 14h4"/></svg></span><b>Ask SafeMind</b>
    </button>
    <section class="agent-panel" id="safeMindAgentPanel" role="dialog" aria-label="SafeMind Agent" hidden>
      <header><div><strong>SafeMind Agent</strong><small><i aria-hidden="true"></i> Online</small></div><button type="button" data-agent-close aria-label="Close SafeMind Agent">×</button></header>
      <div class="agent-log" aria-live="polite"></div>
      <form><label class="sr-only" for="safeMindAgentInput">Ask SafeMind</label><textarea id="safeMindAgentInput" rows="1" maxlength="4000" placeholder="Paste suspicious content or ask a question..."></textarea><button type="submit" aria-label="Send to SafeMind">Send</button></form>
      <p class="agent-note">Never share passwords, OTP codes, or payment details.</p>
    </section>`;
  // Keep the assistant outside page/footer layout so fixed positioning cannot be
  // clipped or pushed below mobile navigation while the document scrolls.
  document.body.append(root);

  const launcher = root.querySelector(".agent-launcher");
  const panel = root.querySelector(".agent-panel");
  const closeButton = root.querySelector("[data-agent-close]");
  const log = root.querySelector(".agent-log");
  const form = root.querySelector("form");
  const input = root.querySelector("textarea");
  const sendButton = form.querySelector('button[type="submit"]');

  function syncVisualViewport() {
    const viewport = window.visualViewport;
    if (!viewport) {
      root.style.setProperty("--agent-visual-bottom", "0px");
      root.style.setProperty("--agent-visual-height", `${window.innerHeight}px`);
      return;
    }
    const layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight);
    const coveredBottom = Math.max(0, layoutHeight - viewport.height - viewport.offsetTop);
    root.style.setProperty("--agent-visual-bottom", `${coveredBottom}px`);
    root.style.setProperty("--agent-visual-height", `${viewport.height}px`);
  }
  syncVisualViewport();
  requestAnimationFrame(syncVisualViewport);
  window.visualViewport?.addEventListener("resize", syncVisualViewport);
  window.visualViewport?.addEventListener("scroll", syncVisualViewport);
  window.addEventListener("resize", syncVisualViewport);
  window.addEventListener("orientationchange", syncVisualViewport);
  window.addEventListener("pageshow", syncVisualViewport);

  function save() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: messages.slice(-10), lastEvidence, lastAssessment })); } catch { /* Optional. */ }
  }

  function addMessage(role, value, pending = false) {
    const article = document.createElement("article");
    article.className = `agent-message is-${role}${pending ? " is-pending" : ""}`;
    const label = document.createElement("span");
    label.textContent = role === "assistant" ? "SM" : copy("You", "သင်");
    const text = document.createElement("p");
    text.textContent = plainText(value);
    article.append(label, text);
    log.append(article);
    log.scrollTop = log.scrollHeight;
    return { article, text };
  }

  function showWelcome() {
    if (messages.length) {
      messages.forEach((message) => addMessage(message.role, message.content));
      return;
    }
    const welcome = document.createElement("div");
    welcome.className = "agent-welcome";
    welcome.innerHTML = `<strong>${copy("How can I help?", "ဘာကူညီပေးရမလဲ။")}</strong><p>${copy("Paste suspicious content, then ask follow-up questions about the result.", "သံသယဖြစ်ဖွယ်အကြောင်းအရာကို ထည့်ပြီး ရလဒ်အကြောင်း ဆက်မေးနိုင်သည်။")}</p>`;
    log.append(welcome);
  }

  showWelcome();

  function setOpen(open) {
    panel.hidden = !open;
    launcher.setAttribute("aria-expanded", String(open));
    if (open) window.setTimeout(() => input.focus(), 0);
  }

  launcher.addEventListener("click", () => setOpen(panel.hidden));
  closeButton.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !panel.hidden) setOpen(false); });

  function looksLikeQuestion(value) {
    return /^(?:why|what|how|when|where|who|is|are|can|could|should|would|explain|tell|ဘာ|ဘယ်|မည်|ရှင်းပြ|ပြောပြ)/iu.test(value.trim()) || /[?？]$/.test(value.trim());
  }

  async function readStream(response, pending) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let streamed = "";
    let complete = null;
    let frame = 0;
    const paint = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; pending.text.textContent = plainText(streamed) || copy("Thinking…", "စဉ်းစားနေသည်…"); log.scrollTop = log.scrollHeight; });
    };
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        if (event.type === "meta") lastAssessment = event.assessment || lastAssessment;
        if (event.type === "token") { streamed += event.token || ""; paint(); }
        if (event.type === "done") complete = event;
        if (event.type === "error") throw new Error(event.message || "SafeMind stopped responding.");
      }
      if (done) break;
    }
    if (frame) cancelAnimationFrame(frame);
    lastAssessment = complete?.assessment || lastAssessment;
    return plainText(complete?.answer || streamed);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question || busy) return;
    const previousHistory = messages.slice(-8);
    const followUp = looksLikeQuestion(question) && Boolean(lastEvidence);
    const evidence = followUp ? lastEvidence : question;
    if (!followUp) lastEvidence = question;
    log.querySelector(".agent-welcome")?.remove();
    addMessage("user", question);
    messages.push({ role: "user", content: question });
    input.value = "";
    input.style.height = "auto";
    busy = true;
    sendButton.disabled = true;
    const pending = addMessage("assistant", copy("Thinking…", "စဉ်းစားနေသည်…"), true);
    try {
      const response = await fetch("/api/education-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/x-ndjson" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          question,
          evidence_text: evidence,
          scan_type: "auto",
          history: previousHistory,
          language: isBurmese() ? "my" : "en",
          stream: true,
          memory: { last_assessment: lastAssessment, evidence_retained: Boolean(lastEvidence) }
        })
      });
      if (!response.ok || !response.body) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || copy("SafeMind is unavailable. Please retry.", "SafeMind ကို ခေတ္တအသုံးမပြုနိုင်ပါ။ ထပ်ကြိုးစားပါ။"));
      }
      const answer = await readStream(response, pending);
      pending.article.classList.remove("is-pending");
      pending.text.textContent = answer;
      messages.push({ role: "assistant", content: answer });
      save();
    } catch (error) {
      pending.article.classList.remove("is-pending");
      pending.text.textContent = error.message || copy("Please retry.", "ထပ်ကြိုးစားပါ။");
    } finally {
      busy = false;
      sendButton.disabled = false;
      input.focus();
    }
  });

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(112, input.scrollHeight)}px`;
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
  });
}
