import { supabase } from "./supabase.js";

const main = document.querySelector("main.dashboard-content");
const workspace = document.getElementById("dashboardInvestigation");
const form = document.getElementById("dashboardScannerForm");
if (main && workspace && form) {
  const STORAGE_KEY = "safemind-dashboard-investigation-v1";
  const quickInput = document.getElementById("quickScanInput");
  const input = document.getElementById("dashboardScanInput");
  const fileInput = document.getElementById("dashboardScanFile");
  const uploadArea = document.getElementById("dashboardScanUploadArea");
  const preview = document.getElementById("dashboardScanFilePreview");
  const previewImage = document.getElementById("dashboardScanFileImage");
  const fileName = document.getElementById("dashboardScanFileName");
  const fileMeta = document.getElementById("dashboardScanFileMeta");
  const status = document.getElementById("dashboardScanStatus");
  const progress = document.getElementById("dashboardScanProgress");
  const progressLabel = document.getElementById("dashboardScanProgressLabel");
  const results = document.getElementById("dashboardScanResults");
  const analyzeButton = document.getElementById("dashboardScanAnalyze");
  const reportButton = document.getElementById("dashboardReportScam");
  const copyButton = document.getElementById("dashboardCopyFinding");
  const dialog = document.getElementById("investigationReportDialog");
  const reportForm = document.getElementById("investigationReportForm");
  let selectedFile = null;
  let imagePayload = null;
  let activeResult = null;
  let overviewScroll = 0;

  const typeCopy = {
    message: ["Suspicious message", "Paste the suspicious message exactly as received..."],
    link: ["Website address", "Paste the complete website address, including https://..."],
    phone: ["Phone number", "Enter the unfamiliar phone number..."],
    email: ["Email address or email content", "Paste the sender address or suspicious email content..."],
    qr: ["QR destination or context", "Paste the link from the QR code, or upload a screenshot..."],
    screenshot: ["Screenshot context", "Briefly describe where this screenshot came from (optional)..."]
  };

  const currentType = () => form.querySelector('input[name="dashboardScanType"]:checked')?.value || "message";
  const setStatus = (message, state = "") => { status.textContent = message; status.dataset.state = state; };
  const formatBytes = (bytes) => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

  function saveState() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ type: currentType(), input: input.value, quick: quickInput.value, result: activeResult, investigating: !workspace.hidden, overviewScroll }));
    } catch { /* The scanner remains usable when storage is blocked. */ }
  }

  function updateType(type) {
    const radio = form.querySelector(`input[name="dashboardScanType"][value="${type}"]`);
    if (radio) radio.checked = true;
    const [label, placeholder] = typeCopy[type] || typeCopy.message;
    document.getElementById("dashboardScanLabel").textContent = label;
    input.placeholder = placeholder;
    const imageOnly = type === "qr" || type === "screenshot";
    fileInput.accept = imageOnly ? "image/png,image/jpeg,image/webp" : "image/png,image/jpeg,image/webp,text/plain,.txt,.eml";
    uploadArea.classList.toggle("is-recommended", imageOnly);
    saveState();
  }

  function detectType(value) {
    const text = String(value || "").trim();
    if (/^https?:\/\//i.test(text) || /\bwww\./i.test(text)) return "link";
    if (/^[+\d][\d\s().-]{6,}$/.test(text)) return "phone";
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return "email";
    return "message";
  }

  function openInvestigation(type = currentType(), preserveScroll = false) {
    if (!preserveScroll) overviewScroll = window.scrollY;
    workspace.hidden = false;
    main.classList.add("is-investigating");
    updateType(type);
    history.replaceState(null, "", "#investigation");
    workspace.scrollIntoView({ block: "start" });
    saveState();
  }

  function closeInvestigation() {
    main.classList.remove("is-investigating");
    workspace.hidden = true;
    history.replaceState(null, "", window.location.pathname);
    window.scrollTo({ top: overviewScroll, behavior: "smooth" });
    saveState();
  }

  function clearFile() {
    selectedFile = null;
    imagePayload = null;
    fileInput.value = "";
    preview.hidden = true;
    previewImage.hidden = true;
    previewImage.removeAttribute("src");
    fileName.textContent = "";
    fileMeta.textContent = "";
  }

  function readFile(file, mode) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("The selected file could not be read."));
      mode === "data" ? reader.readAsDataURL(file) : reader.readAsText(file);
    });
  }

  async function selectFile(file) {
    if (!file) return;
    const imageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
    const textTypes = new Set(["text/plain", "message/rfc822"]);
    const isImage = imageTypes.has(file.type);
    const maximumSize = isImage ? 2 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maximumSize) throw new Error(`Choose ${isImage ? "an image smaller than 2 MB" : "a file smaller than 5 MB"}.`);
    if (!isImage && !textTypes.has(file.type) && !/\.(txt|eml)$/i.test(file.name)) throw new Error("Choose a PNG, JPEG, WebP, TXT, or EML file.");
    clearFile();
    selectedFile = file;
    if (isImage) {
      const dataUrl = await readFile(file, "data");
      imagePayload = { data_url: dataUrl, mime_type: file.type };
      previewImage.src = dataUrl;
      previewImage.hidden = false;
      if (["qr", "screenshot"].includes(currentType()) === false) updateType("screenshot");
    } else {
      input.value = (await readFile(file, "text")).slice(0, 10000);
    }
    fileName.textContent = file.name;
    fileMeta.textContent = `${isImage ? "Image evidence" : "Text evidence"} · ${formatBytes(file.size)}`;
    preview.hidden = false;
    setStatus("Evidence ready for analysis.", "success");
    saveState();
  }

  async function analyzeText(type, content) {
    const apiType = type === "qr" ? (/^https?:\/\//i.test(content) ? "link" : "message") : type;
    const response = await fetch("/api/spam-check", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store", body: JSON.stringify({ scan_type: apiType, content }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "The analysis service is unavailable.");
    return data;
  }

  async function analyzeImage(type, content) {
    const response = await fetch("/api/education-chat", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store", body: JSON.stringify({ question: type === "qr" ? "Analyze this QR code screenshot for scam risk." : "Analyze this screenshot for scam risk.", evidence_text: content, scan_type: "auto", image: imagePayload, language: document.documentElement.lang === "my" ? "my" : "en", stream: false }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "The image analysis service is unavailable.");
    const assessment = data.assessment || {};
    const analysis = data.analysis || {};
    const risk = assessment.risk || ({ high: "HIGH", warning: "MEDIUM", low: "LOW" }[analysis.riskLevel] || "LOW");
    return {
      risk,
      risk_score: assessment.risk_score ?? (risk === "HIGH" ? 85 : risk === "MEDIUM" ? 55 : 18),
      confidence: assessment.confidence ?? Math.round((Number(analysis.confidence) || 0) * 100),
      category: assessment.category || analysis.riskLevel || "Screenshot review",
      reason: assessment.reason || analysis.summary || data.answer,
      indicators: assessment.indicators || analysis.warningSigns || [],
      agent_headline: analysis.summary || assessment.category || "Screenshot analysis complete",
      agent_summary: data.answer || analysis.summary || assessment.reason,
      recommended_actions: assessment.recommended_actions || analysis.recommendedActions || []
    };
  }

  function fillList(element, values, emptyText) {
    const rows = Array.isArray(values) && values.length ? values : [emptyText];
    element.replaceChildren(...rows.map((value) => { const item = document.createElement("li"); item.textContent = value; return item; }));
  }

  function renderResult(result) {
    activeResult = result;
    const risk = String(result.risk || "LOW").toUpperCase();
    const score = Math.max(0, Math.min(99, Number(result.risk_score) || (risk === "HIGH" ? 85 : risk === "MEDIUM" ? 55 : 18)));
    document.getElementById("dashboardFindingScore").textContent = `${score}%`;
    document.getElementById("dashboardFindingRisk").textContent = `${risk} RISK`;
    document.getElementById("dashboardFindingRisk").dataset.risk = risk.toLowerCase();
    document.getElementById("dashboardFindingConfidence").textContent = `${Math.max(0, Math.min(99, Number(result.confidence) || 0))}%`;
    document.getElementById("dashboardFindingHeadline").textContent = result.agent_headline || result.category || "Analysis complete";
    document.getElementById("dashboardFindingSummary").textContent = result.agent_summary || result.reason || "The investigation is complete.";
    document.getElementById("dashboardFindingPattern").textContent = result.category || "No exact pattern match";
    document.getElementById("dashboardFindingReason").textContent = result.reason || "Verify unexpected requests through an official channel.";
    fillList(document.getElementById("dashboardFindingWarnings"), result.indicators, "No strong automated warning sign was found.");
    fillList(document.getElementById("dashboardFindingActions"), result.recommended_actions, "Verify the request independently before acting.");
    results.hidden = false;
    reportButton.disabled = false;
    copyButton.disabled = false;
    saveState();
  }

  async function runProgress(task) {
    const steps = [...progress.querySelectorAll("li")];
    steps.forEach((step) => step.classList.remove("is-complete", "is-active"));
    progress.hidden = false;
    const timers = steps.map((step, index) => window.setTimeout(() => {
      steps.slice(0, index).forEach((item) => item.classList.add("is-complete"));
      step.classList.add("is-active");
      progressLabel.textContent = step.textContent;
    }, index * 360));
    try {
      const [value] = await Promise.all([task(), new Promise((resolve) => window.setTimeout(resolve, 1800))]);
      steps.forEach((step) => { step.classList.remove("is-active"); step.classList.add("is-complete"); });
      progressLabel.textContent = "Investigation complete";
      return value;
    } finally { timers.forEach(window.clearTimeout); }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const type = currentType();
    const content = input.value.trim();
    if (!content && !imagePayload) { setStatus("Enter suspicious content or upload evidence first.", "error"); input.focus(); return; }
    analyzeButton.disabled = true;
    results.hidden = true;
    setStatus("SafeMind is analyzing your evidence...", "pending");
    try {
      const result = await runProgress(() => imagePayload && ["qr", "screenshot"].includes(type) ? analyzeImage(type, content) : analyzeText(type, content));
      renderResult(result);
      setStatus("Investigation complete.", "success");
      const { data } = await supabase?.auth.getSession() || {};
      if (data?.session?.user) await supabase.rpc("award_scan_credit", { scan_kind: type, scan_risk: String(result.risk || "low").toLowerCase() });
    } catch (error) {
      setStatus(error.message || "The investigation could not be completed. Please retry.", "error");
    } finally { analyzeButton.disabled = false; }
  });

  document.getElementById("quickScanInvestigate").addEventListener("click", () => {
    const value = quickInput.value.trim();
    input.value = value;
    openInvestigation(detectType(value));
    if (value) form.requestSubmit();
  });
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-open-investigation], [data-investigation-type]");
    if (!trigger) return;
    event.preventDefault();
    openInvestigation(trigger.dataset.investigationType || currentType());
  });
  document.getElementById("quickScanUpload").addEventListener("click", () => { openInvestigation("screenshot"); fileInput.click(); });
  document.getElementById("quickScanVoice").addEventListener("click", () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { quickInput.placeholder = "Voice input is not supported in this browser."; return; }
    const recognition = new Recognition(); recognition.lang = document.documentElement.lang === "my" ? "my-MM" : "en-US";
    recognition.onresult = (event) => { quickInput.value = event.results[0][0].transcript; saveState(); };
    recognition.start();
  });
  document.getElementById("investigationBack").addEventListener("click", closeInvestigation);
  document.getElementById("investigationClear").addEventListener("click", () => { input.value = ""; quickInput.value = ""; activeResult = null; results.hidden = true; progress.hidden = true; clearFile(); setStatus(""); saveState(); });
  form.addEventListener("change", (event) => { if (event.target.name === "dashboardScanType") updateType(event.target.value); });
  input.addEventListener("input", saveState); quickInput.addEventListener("input", saveState);
  fileInput.addEventListener("change", () => selectFile(fileInput.files?.[0]).catch((error) => setStatus(error.message, "error")));
  document.getElementById("dashboardScanFileRemove").addEventListener("click", () => { clearFile(); setStatus(""); });
  uploadArea.addEventListener("dragover", (event) => { event.preventDefault(); uploadArea.classList.add("is-dragging"); });
  uploadArea.addEventListener("dragleave", () => uploadArea.classList.remove("is-dragging"));
  uploadArea.addEventListener("drop", (event) => { event.preventDefault(); uploadArea.classList.remove("is-dragging"); selectFile(event.dataTransfer.files?.[0]).catch((error) => setStatus(error.message, "error")); });

  copyButton.addEventListener("click", async () => {
    const text = `${document.getElementById("dashboardFindingRisk").textContent}\n${document.getElementById("dashboardFindingHeadline").textContent}\n${document.getElementById("dashboardFindingSummary").textContent}`;
    await navigator.clipboard.writeText(text).catch(() => {}); setStatus("Result copied.", "success");
  });
  reportButton.addEventListener("click", () => { dialog.showModal(); document.body.classList.add("modal-open"); });
  const closeDialog = () => { dialog.close(); document.body.classList.remove("modal-open"); };
  document.getElementById("investigationReportClose").addEventListener("click", closeDialog);
  dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDialog(); });
  dialog.addEventListener("close", () => document.body.classList.remove("modal-open"));
  reportForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const reportStatus = document.getElementById("investigationReportStatus");
    const { data } = await supabase.auth.getSession();
    if (!data?.session?.user) { reportStatus.textContent = "Sign in again before sending a report."; return; }
    reportStatus.textContent = "Sending report...";
    let screenshotPath = null;
    if (selectedFile && imagePayload) {
      const extension = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" })[selectedFile.type];
      screenshotPath = `${data.session.user.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("report-screenshots").upload(screenshotPath, selectedFile, { contentType: selectedFile.type, cacheControl: "3600", upsert: false });
      if (uploadError) { reportStatus.textContent = "The screenshot could not be uploaded. Please retry."; return; }
    }
    const { error } = await supabase.from("admin_reports").insert({ reporter_id: data.session.user.id, report_type: currentType(), content: input.value.trim().slice(0, 5000) || `[${selectedFile?.name || "Uploaded evidence"}]`, notes: document.getElementById("investigationReportNotes").value.trim() || null, automated_result: activeResult, screenshot_path: screenshotPath, screenshot_name: imagePayload ? selectedFile?.name.slice(0, 255) : null, screenshot_type: imagePayload ? selectedFile?.type : null, screenshot_size: imagePayload ? selectedFile?.size : null, status: "pending" });
    if (error && screenshotPath) await supabase.storage.from("report-screenshots").remove([screenshotPath]);
    reportStatus.textContent = error ? "The report could not be sent. Please retry." : "Report sent for administrator review.";
    if (!error) window.setTimeout(closeDialog, 900);
  });

  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
    if (saved) { quickInput.value = saved.quick || ""; input.value = saved.input || ""; overviewScroll = Number(saved.overviewScroll) || 0; updateType(saved.type || "message"); if (saved.result) renderResult(saved.result); if (saved.investigating || window.location.hash === "#investigation" || new URLSearchParams(window.location.search).get("view") === "investigation") openInvestigation(saved.type, true); }
    else if (window.location.hash === "#investigation" || new URLSearchParams(window.location.search).get("view") === "investigation") openInvestigation("message");
  } catch { updateType("message"); }
}
