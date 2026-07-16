import { supabase } from "./supabase.js";
import { requireAuth, pageReady, logoutToMain } from "./router.js";
import { initLanguage } from "./language.js";
import "./theme-toggle.js";

const modeButtons = Array.from(document.querySelectorAll("[data-checker-mode]"));
const panels = Array.from(document.querySelectorAll("[data-checker-panel]"));
const analyzeButtons = Array.from(document.querySelectorAll("[data-analyze-mode]"));
const saveButton = document.getElementById("checkerSave");
const loadingBar = document.querySelector("[data-checker-loading]");
const riskScore = document.getElementById("riskScore");
const riskCategory = document.getElementById("riskCategory");
const riskReason = document.getElementById("riskReason");
const riskConfidence = document.getElementById("riskConfidence");
const resultBadge = document.getElementById("resultBadge");
const resultIndicators = document.getElementById("resultIndicators");
const resultModel = document.getElementById("resultModel");
const agentState = document.getElementById("agentState");
const agentResponse = document.getElementById("agentResponse");
const agentHeadline = document.getElementById("agentHeadline");
const agentSummary = document.getElementById("agentSummary");
const agentNextSteps = document.getElementById("agentNextSteps");
const agentActions = document.getElementById("agentActions");
const evidenceLabel = document.getElementById("evidenceLabel");
const copyAnalysis = document.getElementById("copyAnalysis");
const reportAnalysis = document.getElementById("reportAnalysis");
const resultActionStatus = document.getElementById("resultActionStatus");
const agentFeedback = document.getElementById("agentFeedback");
const resultChecks = document.getElementById("resultChecks");
const checksPerformed = document.getElementById("checksPerformed");
const checksUnavailable = document.getElementById("checksUnavailable");
const investigationDashboard = document.getElementById("investigationDashboard");
const investigationTimeline = document.getElementById("investigationTimeline");
const caseIdentity = document.getElementById("caseIdentity");
const scanInputMeta = document.getElementById("scanInputMeta");
const emailFileInput = document.getElementById("emailFileInput");
const emailFileMeta = document.getElementById("emailFileMeta");
const logoutButtons = document.querySelectorAll("[data-logout]");
const scamScoreboardBody = document.getElementById("scamScoreboardBody");
const scamNumberCount = document.getElementById("scamNumberCount");
const exportScamNumbers = document.getElementById("exportScamNumbers");
const directoryExportStatus = document.getElementById("directoryExportStatus");
const directoryState = {
    scam: document.getElementById("scamList"),
    safe: document.getElementById("safeList"),
    other: document.getElementById("otherList")
};

let activeMode = "phone";
let activeResult = null;
let activeUser = null;
let selectedEmailFile = null;
let selectedEmailContext = null;
let activeCaseId = null;
let timelineTimer = null;
let scamNumberRows = [];
const persistedCaseIds = new Set();
const nlpApiUrl = import.meta.env.VITE_NLP_API_URL || "/api/spam-check";
const inputIds = { phone: "phoneInput", message: "messageInput", link: "linkInput", email: "emailInput" };

function activeInput() {
    return document.getElementById(inputIds[activeMode]);
}

function activeValue() {
    return activeInput()?.value.trim() || "";
}

function updateInputMeta() {
    if (scanInputMeta) scanInputMeta.textContent = `${activeValue().length.toLocaleString()} characters`;
}

function updateEmailFileMeta(message) {
    if (emailFileMeta) {
        emailFileMeta.textContent = message;
    }
}

async function awardAnalysisCredit() {
    if (!activeUser || !supabase || !activeResult || activeResult.confidence === 0) return;
    await supabase.rpc("award_scan_credit", { scan_kind: activeMode, scan_risk: activeResult.risk.toLowerCase() });
}

function normalizePhone(value) {
    return value.replace(/[^\d+]/g, "").trim();
}

function setActiveMode(mode) {
    activeMode = mode;

    modeButtons.forEach((button) => {
        const selected = button.dataset.checkerMode === mode;
        button.classList.toggle("is-active", selected);
        button.setAttribute("aria-selected", String(selected));
        button.tabIndex = selected ? 0 : -1;
    });

    panels.forEach((panel) => {
        const selected = panel.dataset.checkerPanel === mode;
        panel.classList.toggle("is-active", selected);
        panel.hidden = !selected;
    });
    updateInputMeta();
    if (mode === "email") {
        updateEmailFileMeta(selectedEmailFile ? `${selectedEmailFile.name} selected for analysis.` : "Upload a raw `.eml`, `.txt`, or exported message file. SafeMind extracts the sender and body locally for analysis.");
    }
    if (resultActionStatus) resultActionStatus.textContent = "";
}

function fallbackAgentGuidance(result) {
    const subject = { phone: "number", message: "message", link: "link", email: "sender" }[activeMode] || "item";
    if (!result.confidence) {
        return {
            headline: "Waiting for content",
            summary: "Choose a checker, enter the content, and I will explain the risk and the safest next steps.",
            actions: []
        };
    }
    if (result.risk === "HIGH") {
        return {
            headline: "High-risk behavior detected",
            summary: `I found strong warning signals in this ${subject}. Treat it as unsafe unless it is verified through an official channel.`,
            actions: ["Do not engage or share any code.", "Block the sender and preserve the evidence.", "Verify through the organization’s official app, website, or phone number."]
        };
    }
    if (result.risk === "MEDIUM") {
        return {
            headline: "Suspicious signals need verification",
            summary: `I found warning signals in this ${subject}, but the evidence is not conclusive. Pause and verify it independently.`,
            actions: ["Do not use links or contact details in the content.", "Verify the request through an official channel.", "Keep credentials, OTP codes, and payment details private."]
        };
    }
    return {
        headline: "No strong threat signal found",
        summary: `I did not find strong automated warning signals in this ${subject}. This does not guarantee that it is safe.`,
        actions: ["Confirm unexpected requests independently.", "Open official apps or websites directly.", "Never share credentials or verification codes."]
    };
}

function updateAgentResponse(result) {
    const fallback = fallbackAgentGuidance(result);
    const headline = result.agent_headline || fallback.headline;
    const summary = result.agent_summary || fallback.summary;
    const actions = Array.isArray(result.recommended_actions) ? result.recommended_actions : fallback.actions;
    if (agentState) agentState.textContent = result.confidence ? "Complete" : "Ready";
    if (agentHeadline) agentHeadline.textContent = headline;
    if (agentSummary) agentSummary.textContent = summary;
    if (agentActions) {
        agentActions.replaceChildren(...actions.map((action) => {
            const item = document.createElement("li");
            item.textContent = action;
            return item;
        }));
    }
    if (agentNextSteps) agentNextSteps.hidden = !actions.length;
    if (agentResponse) agentResponse.hidden = !result.confidence;
    if (evidenceLabel) evidenceLabel.hidden = !(result.indicators || []).length;
}

function updateResult(result) {
    activeResult = result;

    if (resultBadge) {
        resultBadge.textContent = result.risk;
        resultBadge.dataset.risk = result.risk.toLowerCase();
    }

    if (riskScore) {
        const riskLabel = Number(result.risk_score) >= 90
            ? "Critical Risk"
            : result.risk === "HIGH"
                ? "High Risk"
                : result.risk === "MEDIUM"
                    ? "Some Warning Signs"
                    : "Low Risk";
        riskScore.textContent = result.confidence ? riskLabel : "Ready to scan";
    }

    if (riskCategory) {
        riskCategory.textContent = result.category;
        riskCategory.hidden = !result.confidence;
    }

    if (riskReason) {
        riskReason.textContent = result.reason;
    }

    if (riskConfidence) {
        riskConfidence.textContent = `${result.confidence}% confidence`;
        riskConfidence.hidden = !result.confidence;
    }

    if (resultIndicators) {
        resultIndicators.replaceChildren(...(result.indicators || []).map((indicator) => {
            const item = document.createElement("li");
            item.textContent = indicator;
            return item;
        }));
    }

    if (resultModel) {
        resultModel.textContent = result.model ? `Analysis engine: ${result.model}` : "Hybrid analysis ready";
    }
    const ready = result.confidence > 0;
    if (resultChecks) {
        resultChecks.hidden = !ready;
        if (!ready) resultChecks.open = false;
    }
    if (checksPerformed) {
        const performed = result.investigation?.checks_performed || [
            "Input validation and normalization",
            `${activeMode[0].toUpperCase()}${activeMode.slice(1)} pattern analysis`,
            "Known scam wording and behavior checks",
            "Explainable risk scoring",
            result.investigation?.intelligence?.local_reputation_checked ? "Local reputation directory" : null
        ].filter(Boolean);
        checksPerformed.replaceChildren(...performed.map((label) => { const item = document.createElement("li"); item.textContent = label; return item; }));
    }
    if (checksUnavailable) {
        const unavailable = [...(result.investigation?.limitations || [])];
        if (!result.investigation?.intelligence?.external_feeds_configured) unavailable.push("Live external threat-intelligence feeds");
        if (!result.investigation?.intelligence?.whois_configured && activeMode === "link") unavailable.push("Domain age and ownership records");
        if (!result.investigation?.knowledge?.available) unavailable.push("External knowledge-base citations");
        if (!unavailable.length) unavailable.push("No unavailable checks reported");
        checksUnavailable.replaceChildren(...[...new Set(unavailable)].map((label) => { const item = document.createElement("li"); item.textContent = label; return item; }));
    }
    updateAgentResponse(result);
    if (copyAnalysis) copyAnalysis.disabled = !ready;
    if (reportAnalysis) reportAnalysis.disabled = !ready;
    renderInvestigation(result.investigation || null);
    if (result.investigation && !persistedCaseIds.has(result.investigation.case_id)) {
        persistedCaseIds.add(result.investigation.case_id);
        void persistSecurityCase(result);
    }
}

function timelineItem(event) {
    const item = document.createElement("li");
    item.dataset.status = event.status || "pending";
    const details = document.createElement("div");
    const agent = document.createElement("strong");
    const label = document.createElement("span");
    const duration = document.createElement("time");
    agent.textContent = event.agent;
    label.textContent = event.label;
    duration.textContent = event.duration_ms ? `${Number(event.duration_ms).toFixed(1)} ms` : "";
    details.append(agent, label);
    item.append(details, duration);
    return item;
}

function startInvestigationAnimation() {
    const phases = [
        ["Input Agent", "Reading and normalizing input"], ["Threat Agent", "Checking available intelligence"],
        ["ML Agent", "Running classification models"], ["Evidence Agent", "Extracting entities and behaviors"],
        ["Reasoning Agent", "Scoring explainable evidence"], ["Decision Agent", "Producing risk decision"]
    ];
    investigationDashboard.hidden = false;
    investigationDashboard.open = false;
    caseIdentity.hidden = true;
    document.getElementById("scoreContributions").replaceChildren();
    document.getElementById("evidenceGrid").replaceChildren();
    document.getElementById("threatGraph").replaceChildren();
    document.getElementById("intelligenceSummary").textContent = "Investigation in progress.";
    document.getElementById("relatedCasesState").textContent = "Waiting for investigation.";
    document.getElementById("knowledgeState").textContent = "Waiting for investigation.";
    investigationTimeline.replaceChildren(...phases.map(([agent, label]) => timelineItem({ agent, label, status: "pending" })));
    document.getElementById("timelineStatus").textContent = "Investigating";
    let index = 0;
    window.clearInterval(timelineTimer);
    timelineTimer = window.setInterval(() => {
        investigationTimeline.children[index]?.setAttribute("data-status", "completed");
        index += 1;
        if (index >= phases.length) window.clearInterval(timelineTimer);
    }, 180);
}

function renderInvestigation(investigation) {
    if (!investigation) {
        if (!loadingBar?.classList.contains("is-loading")) investigationDashboard.hidden = true;
        caseIdentity.hidden = true;
        activeCaseId = null;
        return;
    }
    window.clearInterval(timelineTimer);
    activeCaseId = investigation.case_id;
    investigationDashboard.hidden = false;
    caseIdentity.hidden = false;
    document.getElementById("caseNumber").textContent = investigation.case_number;
    document.getElementById("caseDuration").textContent = `${Number(investigation.investigation_time_ms || 0).toFixed(1)} ms`;
    document.getElementById("timelineStatus").textContent = "Completed";
    investigationTimeline.replaceChildren(...(investigation.timeline || []).map(timelineItem));
    document.getElementById("scoreTotal").textContent = `${activeResult?.risk_score ?? 0} points`;
    const scoreContainer = document.getElementById("scoreContributions");
    scoreContainer.replaceChildren(...(investigation.scoring || []).map((entry) => {
        const row = document.createElement("div"); row.className = "score-row";
        const label = document.createElement("span"); label.textContent = entry.label;
        const score = document.createElement("strong"); score.textContent = `+${entry.score}`;
        const bar = document.createElement("div"); bar.className = "score-bar";
        const fill = document.createElement("i"); fill.style.width = `${Math.min(100, Number(entry.score) * 3)}%`; bar.append(fill);
        row.append(label, score, bar); return row;
    }));
    document.getElementById("evidenceCount").textContent = `${investigation.evidence_count || 0} findings`;
    const evidenceGrid = document.getElementById("evidenceGrid");
    const evidence = [...(investigation.evidence || []), ...(activeResult?.indicators || []).map((label) => ({ kind: "signal", label, severity: "medium", explanation: "Detected by the active analysis model." }))];
    evidenceGrid.replaceChildren(...evidence.map((entry) => {
        const card = document.createElement("article"); card.className = "evidence-card"; card.dataset.severity = entry.severity || "medium";
        const kind = document.createElement("span"); kind.textContent = entry.kind || "signal";
        const title = document.createElement("strong"); title.textContent = entry.label;
        const detail = document.createElement("p"); detail.textContent = entry.value || entry.explanation || "Observed during investigation.";
        card.append(kind, title, detail); return card;
    }));
    const graph = document.getElementById("threatGraph");
    const nodes = investigation.graph?.nodes || [];
    const graphElements = [];
    nodes.forEach((node, index) => {
        if (index) { const arrow = document.createElement("span"); arrow.className = "graph-arrow"; arrow.textContent = "→"; graphElements.push(arrow); }
        const element = document.createElement("span"); element.className = "graph-node"; element.textContent = node.label; graphElements.push(element);
    });
    graph.replaceChildren(...graphElements);
    document.getElementById("intelligenceState").textContent = investigation.intelligence?.external_feeds_configured ? "Live intelligence" : "Local checks only";
    document.getElementById("intelligenceSummary").textContent = investigation.intelligence?.note || "No external intelligence result.";
    document.getElementById("relatedCasesState").textContent = investigation.related_cases?.available ? investigation.related_cases.summary : investigation.related_cases?.reason;
    document.getElementById("knowledgeState").textContent = investigation.knowledge?.available ? investigation.knowledge.summary : investigation.knowledge?.reason;
}

function buildResult(risk, confidence, category, reason, indicators = [], model = "") {
    return { risk, confidence, category, reason, indicators, model };
}

function fileToText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("The email file could not be read."));
        reader.readAsText(file);
    });
}

function parseEmailFile(rawText, fileName = "") {
    const normalized = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const parts = normalized.split(/\n\s*\n/);
    const headerBlock = parts.shift() || "";
    const body = parts.join("\n\n").trim();
    const headers = {};
    let currentKey = "";

    headerBlock.split("\n").forEach((line) => {
        if (/^\s/.test(line) && currentKey) {
            headers[currentKey] = `${headers[currentKey]} ${line.trim()}`.trim();
            return;
        }
        const separator = line.indexOf(":");
        if (separator === -1) return;
        currentKey = line.slice(0, separator).trim().toLowerCase();
        headers[currentKey] = line.slice(separator + 1).trim();
    });

    const fromHeader = headers.from || headers["reply-to"] || headers["return-path"] || "";
    const emailMatch = fromHeader.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}/i);
    const senderEmail = emailMatch ? emailMatch[0].toLowerCase() : "";
    const subject = headers.subject || "";
    const preview = [subject && `Subject: ${subject}`, fromHeader && `From: ${fromHeader}`, body].filter(Boolean).join("\n");

    return {
        fileName,
        senderEmail,
        subject,
        body,
        preview: preview || normalized.slice(0, 5000)
    };
}

function mergeAnalysisResults(results, context) {
    if (!results.length) {
        return buildResult("LOW", 0, "Awaiting input", "Choose a checker and enter a value.");
    }

    const riskRank = { LOW: 0, MEDIUM: 1, HIGH: 2 };
    const strongest = results.reduce((current, next) => {
        if (!current) return next;
        return riskRank[next.risk] > riskRank[current.risk] ? next : current;
    }, null);

    const indicators = [
        context.fileName ? `File: ${context.fileName}` : null,
        context.senderEmail ? `Extracted sender: ${context.senderEmail}` : null,
        context.subject ? `Subject: ${context.subject}` : null,
        ...results.flatMap((result) => result.indicators || [])
    ].filter(Boolean);

    const category = results.map((result) => result.category).filter(Boolean).join(" + ");
    const reason = strongest.reason || "The file was analyzed using both sender and message signals.";
    const confidence = Math.max(...results.map((result) => Number(result.confidence) || 0));
    const model = results.map((result) => result.model).filter(Boolean).join(" + ") || "email-file-analysis";

    const merged = buildResult(strongest.risk, confidence, category, reason, indicators.slice(0, 6), model);
    Object.assign(merged, {
        agent_headline: strongest.agent_headline,
        agent_summary: strongest.agent_summary,
        recommended_actions: strongest.recommended_actions,
        requires_human_review: results.some((result) => result.requires_human_review),
        risk_score: Math.max(...results.map((result) => Number(result.risk_score) || 0)),
        verdict: strongest.verdict,
        investigation: strongest.investigation
    });
    if (merged.investigation) {
        const fileEvidence = [
            context.fileName && { kind: "file", label: "Email file", severity: "low", value: context.fileName, explanation: "Locally parsed email evidence." },
            context.senderEmail && { kind: "email", label: "Extracted sender", severity: "medium", value: context.senderEmail, explanation: "Sender extracted from email headers." }
        ].filter(Boolean);
        merged.investigation.evidence = [...fileEvidence, ...(merged.investigation.evidence || [])].slice(0, 16);
        merged.investigation.evidence_count = merged.investigation.evidence.length + merged.indicators.length;
        merged.investigation.threat_type = category;
    }
    return merged;
}

function currentReportContent() {
    if (activeMode === "email" && selectedEmailContext) {
        return selectedEmailContext.preview.slice(0, 5000);
    }
    return activeValue().slice(0, 5000);
}

function reportResultSnapshot(result) {
    if (!result) return null;
    return {
        risk: result.risk,
        confidence: result.confidence,
        category: result.category,
        reason: result.reason,
        indicators: result.indicators,
        model: result.model,
        case_id: result.investigation?.case_id,
        case_number: result.investigation?.case_number
    };
}

async function analyzeWithAI(scanType, content) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
        const response = await fetch(nlpApiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scan_type: scanType, content }),
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "The security analysis service is unavailable.");
        const normalized = {
            ...buildResult(data.risk, data.confidence, data.category, data.reason, data.indicators, data.model),
            agent_headline: data.agent_headline,
            agent_summary: data.agent_summary,
            recommended_actions: data.recommended_actions,
            requires_human_review: data.requires_human_review,
            risk_score: data.risk_score,
            verdict: data.verdict,
            investigation: data.investigation
        };
        return normalized;
    } catch (error) {
        if (error.name === "AbortError") throw new Error("The scan timed out. Please try again.");
        throw error;
    } finally {
        window.clearTimeout(timeout);
    }
}

async function persistSecurityCase(result) {
    const investigation = result?.investigation;
    if (!investigation || !activeUser || !supabase) return;
    if (agentFeedback) { agentFeedback.hidden = true; delete agentFeedback.dataset.sent; }
    const { error } = await supabase.from("security_cases").insert({
        case_id: investigation.case_id,
        user_id: activeUser.id,
        agent_run_id: null,
        case_number: investigation.case_number,
        input_type: activeMode,
        status: investigation.status,
        confidence: investigation.confidence,
        risk_score: result.risk_score,
        threat_type: investigation.threat_type,
        investigation,
        content_stored: false
    });
    if (!error && agentFeedback) agentFeedback.hidden = false;
}

async function checkDirectory(scanType, normalizedValue) {
    if (!supabase) return null;
    const { data, error } = await supabase.from("threat_directory")
        .select("verdict,organization,reason")
        .eq("entry_type", scanType)
        .eq("normalized_value", normalizedValue)
        .maybeSingle();
    return error ? null : data;
}

function directoryResult(row) {
    const isScam = row.verdict === "scam";
    return buildResult(
        isScam ? "HIGH" : "LOW",
        99,
        isScam ? "Verified threat directory match" : "Verified safe directory match",
        row.reason || "This value exists in the verified SafeMind directory.",
        [row.organization ? `Organization: ${row.organization}` : "Exact directory match"],
        "verified-directory"
    );
}

function applyDirectoryIntelligence(result, row) {
    if (!row) return result;
    const directory = directoryResult(row);
    const isScam = row.verdict === "scam";
    Object.assign(result, {
        risk: directory.risk,
        confidence: 99,
        category: directory.category,
        reason: directory.reason,
        indicators: [...directory.indicators, ...(result.indicators || [])].slice(0, 6),
        model: `verified-directory + ${result.model}`,
        risk_score: isScam ? Math.max(95, Number(result.risk_score) || 0) : 5,
        verdict: isScam ? "scam" : "unknown",
        requires_human_review: isScam
    });
    if (result.investigation) {
        const investigation = result.investigation;
        investigation.status = isScam ? "Critical" : "Safe";
        investigation.confidence = 99;
        investigation.threat_type = directory.category;
        investigation.intelligence = {
            ...(investigation.intelligence || {}),
            local_reputation_checked: true,
            local_directory_match: true,
            directory_verdict: row.verdict,
            note: row.reason || "Matched the verified SafeMind directory."
        };
        investigation.evidence = [{
            kind: "intelligence", label: "Verified directory match", severity: isScam ? "high" : "low",
            value: row.organization || null, explanation: row.reason || "Matched the SafeMind directory."
        }, ...(investigation.evidence || [])].slice(0, 16);
        investigation.evidence_count = investigation.evidence.length + result.indicators.length;
        investigation.scoring = isScam
            ? [{ label: "Verified scam directory match", score: result.risk_score, source: "threat_intelligence" }]
            : [{ label: "Residual uncertainty", score: result.risk_score, source: "model" }];
    }
    return result;
}

async function investigateWithDirectory(scanType, value, directoryValue = value) {
    const [directoryRow, analysis] = await Promise.all([
        checkDirectory(scanType, directoryValue),
        analyzeWithAI(scanType, value)
    ]);
    return applyDirectoryIntelligence(analysis, directoryRow);
}

async function loadDirectoryLists() {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase.from("threat_directory").select("entry_type,normalized_value,verdict,organization,reason,created_at").order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    const rows = { scam: [], safe: [], other: [] };
    (data || []).forEach((row) => rows[row.verdict]?.push(row));
    scamNumberRows = rows.scam.filter((row) => row.entry_type === "phone");
    renderScamScoreboard();

    Object.entries(directoryState).forEach(([key, list]) => {
        if (!list) {
            return;
        }

        list.replaceChildren();
        const items = rows[key];

        if (!items.length) {
            const emptyItem = document.createElement("li");
            emptyItem.textContent = `No ${key} entries yet`;
            list.appendChild(emptyItem);
            return;
        }

        items.forEach((row) => {
            const item = document.createElement("li");
            const type = document.createElement("strong");
            const value = document.createElement("span");
            type.textContent = row.entry_type;
            value.textContent = row.normalized_value;
            item.append(type, value);
            item.title = row.reason;
            list.appendChild(item);
        });
    });
}

function formatDirectoryDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Recently" : date.toLocaleDateString();
}

function renderScamScoreboard() {
    if (!scamScoreboardBody) return;
    scamNumberCount.textContent = String(scamNumberRows.length);
    exportScamNumbers.disabled = scamNumberRows.length === 0;
    if (!scamNumberRows.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 4;
        cell.textContent = "No confirmed scam phone numbers yet.";
        row.append(cell);
        scamScoreboardBody.replaceChildren(row);
        return;
    }
    scamScoreboardBody.replaceChildren(...scamNumberRows.map((entry, index) => {
        const row = document.createElement("tr");
        const rank = document.createElement("td");
        const phone = document.createElement("td");
        const organization = document.createElement("td");
        const added = document.createElement("td");
        rank.textContent = String(index + 1);
        phone.textContent = entry.normalized_value;
        organization.textContent = entry.organization || "Community report";
        added.textContent = formatDirectoryDate(entry.created_at);
        row.append(rank, phone, organization, added);
        return row;
    }));
}

function excelSafeText(value) {
    const text = String(value || "");
    return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

exportScamNumbers?.addEventListener("click", async () => {
    if (!scamNumberRows.length) return;
    exportScamNumbers.disabled = true;
    directoryExportStatus.textContent = "Preparing XLSX file…";
    try {
        const { default: writeExcelFile } = await import("write-excel-file/browser");
        const header = (value) => ({ value, fontWeight: "bold", color: "#FFFFFF", backgroundColor: "#5A5D7A" });
        const sheetData = [
            [header("Rank"), header("Phone number"), header("Organization"), header("Reason"), header("Added")],
            ...scamNumberRows.map((entry, index) => [
                index + 1,
                excelSafeText(entry.normalized_value),
                excelSafeText(entry.organization || "Community report"),
                excelSafeText(entry.reason || "Verified scam directory record"),
                formatDirectoryDate(entry.created_at)
            ])
        ];
        const date = new Date().toISOString().slice(0, 10);
        await writeExcelFile(sheetData, {
            sheet: "Scam Numbers",
            stickyRowsCount: 1,
            columns: [{ width: 8 }, { width: 24 }, { width: 24 }, { width: 52 }, { width: 16 }]
        }).toFile(`safemind-scam-numbers-${date}.xlsx`);
        directoryExportStatus.textContent = "XLSX scoreboard downloaded.";
    } catch {
        directoryExportStatus.textContent = "Could not create the XLSX file. Please retry.";
    } finally {
        exportScamNumbers.disabled = scamNumberRows.length === 0;
    }
});

async function inspectPhone() {
    const phoneInput = document.getElementById("phoneInput");
    const phoneNotes = document.getElementById("phoneNotes");
    const value = normalizePhone(phoneInput?.value ?? "");

    if (!value) {
        updateResult(buildResult("LOW", 0, "Awaiting input", "Enter a phone number to analyze."));
        return;
    }

    const result = await investigateWithDirectory("phone", value);
    updateResult(result);

    if (phoneNotes && !phoneNotes.value.trim()) {
        phoneNotes.value = result.risk === "HIGH" ? "AI detected a high-risk number pattern" : "AI scan completed; manual verification recommended";
    }
}

async function inspectText() {
    const textInput = document.getElementById("messageInput");
    const value = (textInput?.value ?? "").trim();

    if (!value) {
        updateResult(buildResult("LOW", 0, "Awaiting input", "Enter a message to analyze."));
        return;
    }

    updateResult(await investigateWithDirectory("message", value, value.toLowerCase()));
}

async function inspectLink() {
    const linkInput = document.getElementById("linkInput");
    const value = (linkInput?.value ?? "").trim().toLowerCase();

    if (!value) {
        updateResult(buildResult("LOW", 0, "Awaiting input", "Enter a URL to analyze."));
        return;
    }

    updateResult(await investigateWithDirectory("link", value));
}

async function inspectEmail() {
    const value = (document.getElementById("emailInput")?.value ?? "").trim().toLowerCase();
    if (selectedEmailFile) {
        const parsed = await fileToText(selectedEmailFile).then((text) => parseEmailFile(text, selectedEmailFile.name));
        selectedEmailContext = parsed;
        const analyses = [];
        if (parsed.senderEmail) {
            analyses.push(await investigateWithDirectory("email", parsed.senderEmail));
        }
        if (parsed.body || parsed.subject) {
            const bodyInput = [parsed.subject && `Subject: ${parsed.subject}`, parsed.body].filter(Boolean).join("\n\n").trim();
            if (bodyInput) {
                analyses.push(await investigateWithDirectory("message", bodyInput, bodyInput.toLowerCase()));
            }
        }
        updateResult(mergeAnalysisResults(analyses, parsed));
        return;
    }

    if (!value) {
        updateResult(buildResult("LOW", 0, "Awaiting input", "Enter a sender email address to analyze."));
        return;
    }
    updateResult(await investigateWithDirectory("email", value));
}

async function savePhoneResult(category) {
    const phoneInput = document.getElementById("phoneInput");
    const phoneNotes = document.getElementById("phoneNotes");
    const phone = normalizePhone(phoneInput?.value ?? "");
    const notes = phoneNotes?.value.trim() ?? "";

    if (!phone) {
        updateResult(buildResult("LOW", 0, "Awaiting input", "Enter a phone number to save."));
        return;
    }

    const label = category === "scam" ? "Scam phone" : category === "safe" ? "Safe phone" : "Other phone";

    const reportResponse = await supabase.from("admin_reports").insert({
        reporter_id: activeUser.id,
        report_type: "phone",
        content: phone,
        notes: `${label}${notes ? `: ${notes}` : ""}`,
        automated_result: reportResultSnapshot(activeResult),
        status: "pending"
    });

    if (reportResponse.error) {
        throw reportResponse.error;
    }

    updateResult(buildResult(category === "scam" ? "HIGH" : category === "safe" ? "LOW" : "MEDIUM", category === "scam" ? 96 : category === "safe" ? 8 : 54, "Submitted for review", `${phone} was sent to an administrator. Verified entries are added to the directory after review.`));
}

async function runAnalysis(mode = activeMode) {
    if (!loadingBar || !analyzeButtons.length) {
        return;
    }

    setActiveMode(mode);
    analyzeButtons.forEach((button) => {
        button.disabled = true;
        if (button.dataset.analyzeMode === mode) button.textContent = "Analyzing...";
    });
    loadingBar.classList.add("is-loading");
    if (agentState) agentState.textContent = "Investigating signals…";
    startInvestigationAnimation();

    window.setTimeout(async () => {
        try {
            if (activeMode === "phone") {
                await inspectPhone();
            }

            if (activeMode === "message") {
                await inspectText();
            }

            if (activeMode === "link") {
                await inspectLink();
            }
            if (activeMode === "email") {
                await inspectEmail();
            }
            await awardAnalysisCredit();
        } catch (error) {
            updateResult(buildResult("LOW", 0, "Analysis Error", error.message));
        } finally {
            analyzeButtons.forEach((button) => {
                button.disabled = false;
                button.textContent = "Analyze";
            });
            loadingBar.classList.remove("is-loading");
            if (!activeResult?.investigation) investigationDashboard.hidden = true;
        }
    }, 650);
}

pageReady();
initLanguage();
logoutButtons.forEach((button) => button.addEventListener("click", logoutToMain));

async function initializeChecker() {
const user = await requireAuth("login.html");
activeUser = user;

if (user) {
    document.querySelectorAll(".reveal").forEach((element) => element.classList.add("is-visible"));
    const requestedMode = window.location.hash.slice(1);
    if (["phone", "message", "link", "email"].includes(requestedMode)) {
        activeMode = requestedMode;
    }

    try {
        await loadDirectoryLists();
    } catch (error) {
        scamNumberRows = [];
        if (scamNumberCount) scamNumberCount.textContent = "0";
        if (exportScamNumbers) exportScamNumbers.disabled = true;
        if (scamScoreboardBody) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 4;
            cell.textContent = "The verified directory is temporarily unavailable.";
            row.append(cell);
            scamScoreboardBody.replaceChildren(row);
        }
        updateResult(buildResult("LOW", 0, "Directory Error", error.message));
    }
    setActiveMode(activeMode);
    updateResult(buildResult("LOW", 0, "Awaiting input", "Choose a checker and enter a value."));

    modeButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const mode = button.dataset.checkerMode || "phone";
            setActiveMode(mode);
            history.replaceState(null, "", `#${mode}`);
        });

        button.addEventListener("keydown", (event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const currentIndex = modeButtons.indexOf(button);
            const nextIndex = event.key === "Home"
                ? 0
                : event.key === "End"
                    ? modeButtons.length - 1
                    : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + modeButtons.length) % modeButtons.length;
            const nextButton = modeButtons[nextIndex];
            setActiveMode(nextButton.dataset.checkerMode || "phone");
            history.replaceState(null, "", `#${nextButton.dataset.checkerMode || "phone"}`);
            nextButton.focus();
        });
    });

    analyzeButtons.forEach((button) => button.addEventListener("click", () => runAnalysis(button.dataset.analyzeMode || "phone")));

    panels.forEach((panel) => panel.addEventListener("focusin", () => {
        const mode = panel.dataset.checkerPanel || "phone";
        if (mode !== activeMode) setActiveMode(mode);
    }));

    document.querySelectorAll(".checker-panel input, .checker-panel textarea").forEach((input) => {
        input.addEventListener("input", updateInputMeta);
    });

    document.querySelectorAll("[data-clear-mode]").forEach((button) => button.addEventListener("click", () => {
        const mode = button.dataset.clearMode || "phone";
        setActiveMode(mode);
        const input = document.getElementById(inputIds[mode]);
        if (input) {
            input.value = "";
            input.focus();
        }
        if (mode === "phone") {
            const notes = document.getElementById("phoneNotes");
            if (notes) notes.value = "";
        }
        if (mode === "email") {
            selectedEmailFile = null;
            selectedEmailContext = null;
            if (emailFileInput) emailFileInput.value = "";
            updateEmailFileMeta("Upload a raw `.eml`, `.txt`, or exported message file. SafeMind extracts the sender and body locally for analysis.");
        }
        updateInputMeta();
        updateResult(buildResult("LOW", 0, "Awaiting input", "Choose a checker and enter a value."));
    }));

    copyAnalysis?.addEventListener("click", async () => {
        if (!activeResult) return;
        const guidance = fallbackAgentGuidance(activeResult);
        const headline = activeResult.agent_headline || guidance.headline;
        const summary = activeResult.agent_summary || guidance.summary;
        const actions = Array.isArray(activeResult.recommended_actions) ? activeResult.recommended_actions : guidance.actions;
        const text = [
            `${activeResult.risk} RISK — ${activeResult.category}`,
            activeResult.reason,
            ...(activeResult.indicators || []).map((item) => `• ${item}`),
            `${activeResult.confidence}% confidence`,
            "",
            headline,
            summary,
            ...actions.map((item, index) => `${index + 1}. ${item}`)
        ].join("\n");
        try {
            await navigator.clipboard.writeText(text);
            resultActionStatus.textContent = "Analysis copied.";
        } catch {
            resultActionStatus.textContent = "Copy was blocked by the browser.";
        }
    });

    reportAnalysis?.addEventListener("click", async () => {
        const content = currentReportContent();
        if (!content || !activeResult || !activeUser || !supabase) return;
        reportAnalysis.disabled = true;
        resultActionStatus.textContent = "Sending for review…";
        const { error } = await supabase.from("admin_reports").insert({
            reporter_id: activeUser.id,
            report_type: activeMode,
            content: content.slice(0, 5000),
            notes: "Submitted from the AI scanner result panel.",
            automated_result: reportResultSnapshot(activeResult),
            status: "pending"
        });
        reportAnalysis.disabled = false;
        resultActionStatus.textContent = error ? "The report could not be sent. Please try again later." : "Report sent for administrator review.";
    });

    document.querySelectorAll("[data-agent-feedback]").forEach((button) => {
        button.addEventListener("click", async () => {
            if (!activeCaseId || !supabase) return;
            const decision = button.dataset.agentFeedback;
            document.querySelectorAll("[data-agent-feedback]").forEach((item) => { item.disabled = true; });
            const { data, error } = await supabase.rpc("submit_case_feedback", {
                target_case_id: activeCaseId,
                feedback_label: button.dataset.caseFeedback || (decision === "confirm" ? "correct" : "incorrect")
            });
            document.querySelectorAll("[data-agent-feedback]").forEach((item) => { item.disabled = false; });
            if (error || !data) {
                resultActionStatus.textContent = "Feedback could not be saved.";
                return;
            }
            agentFeedback.dataset.sent = "true";
            agentFeedback.querySelector("span").textContent = decision === "confirm" ? "Result confirmed. Thank you." : "Result marked incorrect. Thank you.";
        });
    });

    document.querySelectorAll("[data-save-category]").forEach((button) => {
        button.addEventListener("click", async (event) => {
            const category = event.currentTarget.dataset.saveCategory || "other";
            try {
                await savePhoneResult(category);
            } catch (error) {
                updateResult(buildResult("LOW", 0, "Save Error", error.message));
            }
        });
    });

    document.querySelectorAll("[data-fill-example]").forEach((button) => {
        button.addEventListener("click", () => {
            if (activeMode === "email") {
                selectedEmailFile = null;
                selectedEmailContext = null;
                if (emailFileInput) emailFileInput.value = "";
                updateEmailFileMeta("Upload a raw `.eml`, `.txt`, or exported message file. SafeMind extracts the sender and body locally for analysis.");
            }
            const input = document.getElementById(inputIds[activeMode]);
            if (input) {
                input.value = button.dataset.fillExample || "";
                updateInputMeta();
            }
        });
    });

    emailFileInput?.addEventListener("change", async () => {
        const [file] = emailFileInput.files || [];
        selectedEmailFile = file || null;

        if (!file) {
            selectedEmailContext = null;
            updateEmailFileMeta("Upload a raw `.eml`, `.txt`, or exported message file. SafeMind extracts the sender and body locally for analysis.");
            return;
        }

        if (file.size > 1_048_576) {
            selectedEmailFile = null;
            selectedEmailContext = null;
            emailFileInput.value = "";
            updateEmailFileMeta("Please use a file smaller than 1 MB.");
            return;
        }

        updateEmailFileMeta(`Ready to analyze: ${file.name} (${Math.max(1, Math.round(file.size / 1024))} KB)`);
        if (activeMode !== "email") {
            setActiveMode("email");
            history.replaceState(null, "", "#email");
        }
    });
}
}

initializeChecker();
