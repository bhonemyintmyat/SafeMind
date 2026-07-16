import { supabase } from "./supabase.js";
import { initLanguage } from "./language.js";
import "./theme-toggle.js";

const demoTabs = [...document.querySelectorAll("[data-demo-mode]")];
const demoInput = document.getElementById("demoInput");
const demoLabel = document.getElementById("demoLabel");
const demoHint = document.getElementById("demoHint");
const demoRisk = document.getElementById("demoRisk");
const demoConfidence = document.getElementById("demoConfidence");
const demoCategory = document.getElementById("demoCategory");
const demoReason = document.getElementById("demoReason");
const demoSignals = document.getElementById("demoSignals");
const demoAnalyze = document.getElementById("demoAnalyze");
const demoReport = document.getElementById("demoReport");
const mobileMenuButton = document.querySelector(".mobile-menu-button");
const mainNavigation = document.getElementById("mainNavigation");
const typingTarget = document.getElementById("typingHeading");
let activeDemoMode = "phone";
let latestDemoResult = null;
const securityApiUrl = import.meta.env.VITE_NLP_API_URL || "/api/spam-check";

mobileMenuButton?.addEventListener("click", () => {
    const open = mobileMenuButton.getAttribute("aria-expanded") !== "true";
    mobileMenuButton.setAttribute("aria-expanded", String(open));
    mobileMenuButton.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    mainNavigation?.classList.toggle("is-open", open);
});

mainNavigation?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
    mobileMenuButton?.setAttribute("aria-expanded", "false");
    mobileMenuButton?.setAttribute("aria-label", "Open navigation");
    mainNavigation.classList.remove("is-open");
}));

const copy = {
    phone: ["Phone number", "Check a complete international phone number.", "+1 900 555 0100"],
    message: ["Message", "Paste the full suspicious message.", "Your account will close today unless you verify now"],
    link: ["Website link", "Paste the complete URL without opening it.", "https://secure-login.example.com/verify"],
    email: ["Email address", "Check the sender or an official reporting address.", "phishing@paypal.com"]
};

const examples = {
    phone: { scam: "+1 900 555 0100", safe: "+1 202 555 0147", unknown: "+95 9 765 432 101" },
    message: { scam: "Your account will close today unless you verify now", safe: "Your requested monthly statement is ready in the official app", unknown: "Can we move our meeting to Friday?" },
    link: { scam: "https://secure-login.example.com/verify", safe: "https://www.microsoft.com", unknown: "https://hackathon-demo.example.org" },
    email: { scam: "microsoft-support@outlook-security.example", safe: "phishing@paypal.com", unknown: "hello@unknown-demo.example" }
};

const officialContacts = [
    { organization: "Microsoft", email: "phish@office365.microsoft.com", purpose: "Phishing reports", source_url: "https://support.microsoft.com/en-us/security/protect-yourself-from-phishing" },
    { organization: "PayPal", email: "phishing@paypal.com", purpose: "Suspicious email and text reports", source_url: "https://www.paypal.com/us/security/report-suspicious-messages" },
    { organization: "Apple", email: "reportphishing@apple.com", purpose: "Phishing reports", source_url: "https://support.apple.com/en-us/102406" },
    { organization: "Amazon", email: "stop-spoofing@amazon.com", purpose: "Suspicious email reports", source_url: "https://aws.amazon.com/security/report-suspicious-emails/" }
];

function normalize(mode, value) {
    const trimmed = value.trim().toLowerCase();
    return mode === "phone" ? trimmed.replace(/[^\d+]/g, "") : trimmed;
}

function safeOfficialUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === "https:" ? url.href : null;
    } catch {
        return null;
    }
}

function setMode(mode) {
    activeDemoMode = mode;
    demoTabs.forEach((button) => {
        const selected = button.dataset.demoMode === mode;
        button.classList.toggle("is-active", selected);
        button.setAttribute("aria-pressed", String(selected));
    });
    demoLabel.textContent = copy[mode][0];
    demoHint.textContent = copy[mode][1];
    demoInput.placeholder = copy[mode][2];
    demoInput.value = "";
    demoReport.hidden = true;
}

async function checkDirectory(mode, value) {
    if (!supabase) return null;
    const { data, error } = await supabase
        .from("threat_directory")
        .select("verdict,organization,reason,source_url")
        .eq("entry_type", mode)
        .eq("normalized_value", normalize(mode, value))
        .maybeSingle();
    return error ? null : data;
}

function heuristicScam(mode, value) {
    const text = value.toLowerCase();
    if (mode === "message" && /(urgent|verify now|gift card|password|account.*close|suspended)/.test(text)) return "Urgency or credential-theft language detected";
    if (mode === "link" && /(secure-login|verify-account|bit\.ly|tinyurl|xn--)/.test(text)) return "Phishing-style URL pattern detected";
    if (mode === "email" && /support@.*\.(example|click|top)$/.test(text)) return "Impersonation-style sender domain detected";
    return null;
}

async function analyzeDemo() {
    const value = demoInput.value.trim();
    if (!value) return { verdict: "waiting", title: "Awaiting input", confidence: 0, reason: "Enter a value to check.", signals: [] };

    const row = await checkDirectory(activeDemoMode, value);
    if (row) {
        const safe = row.verdict === "safe";
        return {
            verdict: safe ? "safe" : "scam",
            title: safe ? "Not scam — verified directory match" : "Scam — directory match",
            confidence: 100,
            reason: row.reason,
            signals: [row.organization ? `Organization: ${row.organization}` : "Matched the SafeMind directory", "Database record found"]
        };
    }

    const knownContact = activeDemoMode === "email" && officialContacts.find((item) => item.email === value.toLowerCase());
    if (knownContact) return { verdict: "safe", title: "Not scam — verified official contact", confidence: 100, reason: knownContact.purpose, signals: [`Organization: ${knownContact.organization}`, "Published on the organization’s official website"] };

    try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 12_000);
        try {
            const response = await fetch(securityApiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ scan_type: activeDemoMode, content: value }),
                cache: "no-store",
                credentials: "same-origin",
                signal: controller.signal
            });
            const analysis = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(analysis.error || "Analysis failed");
            const verdict = analysis.verdict === "scam" ? "scam" : analysis.verdict === "suspicious" ? "suspicious" : "unknown";
            return {
                verdict,
                title: analysis.risk === "HIGH" ? "High-risk warning signs found" : analysis.risk === "MEDIUM" ? "Suspicious — use caution" : "No obvious warning signs",
                confidence: analysis.confidence,
                riskScore: analysis.risk_score,
                reason: analysis.reason,
                signals: analysis.indicators || [],
                model: analysis.model
            };
        } finally {
            window.clearTimeout(timeout);
        }
    } catch {
        const warning = heuristicScam(activeDemoMode, value);
        if (warning) return { verdict: "scam", title: "Likely scam — warning signs found", confidence: 72, reason: warning, signals: ["Local fallback analysis", "Automated pattern detection"] };
    }

    return { verdict: "unknown", title: "Not in database", confidence: 0, reason: "SafeMind has no verified record for this value.", signals: ["Unknown does not mean safe", "Send it to an admin for manual review"] };
}

function renderResult(result) {
    latestDemoResult = result;
    demoRisk.textContent = result.verdict === "safe" ? "NOT SCAM" : result.verdict === "scam" ? "HIGH RISK" : result.verdict === "suspicious" ? "SUSPICIOUS" : result.verdict === "unknown" ? "NOT VERIFIED" : "WAITING";
    demoRisk.dataset.risk = result.verdict === "safe" ? "low" : result.verdict === "scam" ? "high" : "medium";
    demoConfidence.textContent = result.title;
    demoCategory.textContent = result.confidence ? `Confidence: ${result.confidence}%` : "Manual review recommended";
    demoReason.textContent = result.reason;
    demoSignals.replaceChildren(...result.signals.map((text) => {
        const item = document.createElement("li");
        item.textContent = text;
        return item;
    }));
    demoReport.hidden = !["unknown", "suspicious", "scam"].includes(result.verdict);
}

async function loadContacts() {
    const list = document.getElementById("verifiedEmailList");
    if (!list) return;
    let rows = officialContacts;
    if (supabase) {
        const response = await supabase.from("verified_organization_emails").select("organization,email,purpose,source_url").order("organization");
        if (!response.error && response.data?.length) rows = response.data;
    }
    rows.forEach((row) => {
        const card = document.createElement("article");
        card.className = "verified-card";
        const title = document.createElement("h3");
        title.textContent = row.organization;
        const email = document.createElement("a");
        email.href = `mailto:${row.email}`;
        email.textContent = row.email;
        const purpose = document.createElement("p");
        purpose.textContent = row.purpose;
        card.append(title, email, purpose);
        const sourceUrl = safeOfficialUrl(row.source_url);
        if (sourceUrl) {
            const source = document.createElement("a");
            source.href = sourceUrl;
            source.target = "_blank";
            source.rel = "noopener noreferrer external";
            source.referrerPolicy = "no-referrer";
            source.textContent = "Official source";
            card.append(source);
        }
        list.append(card);
    });
}

demoTabs.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.demoMode)));
document.querySelectorAll("[data-demo-example]").forEach((button) => button.addEventListener("click", () => {
    demoInput.value = examples[activeDemoMode][button.dataset.demoExample];
}));
demoAnalyze?.addEventListener("click", async () => {
    demoAnalyze.disabled = true;
    demoAnalyze.textContent = "Checking…";
    document.querySelector("[data-demo-loading]")?.classList.add("is-loading");
    renderResult(await analyzeDemo());
    document.querySelector("[data-demo-loading]")?.classList.remove("is-loading");
    demoAnalyze.disabled = false;
    demoAnalyze.textContent = "Analyze Demo";
});
demoReport?.addEventListener("click", () => {
    sessionStorage.setItem("safemindPendingReport", JSON.stringify({ type: activeDemoMode, content: demoInput.value, result: latestDemoResult }));
});

document.querySelectorAll("[data-faq-button]").forEach((button) => button.addEventListener("click", () => {
    const open = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(open));
    button.closest(".faq-item")?.classList.toggle("is-open", open);
}));

document.querySelectorAll("[data-counter]").forEach((element) => {
    const target = Number(element.dataset.counter || 0);
    const suffix = element.dataset.suffix || "";
    element.textContent = `${target.toLocaleString()}${suffix}`;
});

if (typingTarget) {
    const headings = { en: "Your AI Shield Against Scams", my: "လိမ်လည်မှုများမှ ကာကွယ်ပေးမည့် သင့် AI ဒိုင်းလွှာ" };
    const updateHeading = () => {
        const language = localStorage.getItem("safemindLanguage") === "my" ? "my" : "en";
        typingTarget.textContent = headings[language];
    };
    window.addEventListener("safemind:language-change", updateHeading);
    updateHeading();
}
setMode(activeDemoMode);
loadContacts();
document.body.classList.add("is-ready");
initLanguage();
