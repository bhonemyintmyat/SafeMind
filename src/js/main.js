import { supabase } from "./backend-client.js";
import { initLanguage } from "./language.js";
import { createActionReadiness } from "./action-readiness.js";
import "./theme-toggle.js";
import "./audience-onboarding.js";

const demoTabs = [...document.querySelectorAll("[data-demo-mode]")];
const demoInput = document.getElementById("demoInput");
const demoLabel = document.getElementById("demoLabel");
const demoHint = document.getElementById("demoHint");
const demoInputPanel = document.getElementById("demoInputPanel");
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
let demoReadiness;
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
        button.setAttribute("aria-selected", String(selected));
        button.tabIndex = selected ? 0 : -1;
    });
    const activeTab = demoTabs.find((button) => button.dataset.demoMode === mode);
    if (activeTab && demoInputPanel) demoInputPanel.setAttribute("aria-labelledby", activeTab.id);
    demoLabel.textContent = copy[mode][0];
    demoHint.textContent = copy[mode][1];
    demoInput.placeholder = copy[mode][2];
    demoInput.value = "";
    demoReport.hidden = true;
    demoReadiness?.sync();
}

demoReadiness = createActionReadiness({
    button: demoAnalyze,
    controls: [demoInput],
    isReady: () => demoInput.value.trim().length > 0
});

async function analyzeDemo() {
    const value = demoInput.value.trim();
    if (!value) return { verdict: "waiting", title: "Awaiting input", confidence: 0, reason: "Enter a value to check.", signals: [] };

    try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 45_000);
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
            if (analysis.provider !== "openrouter" || analysis.analysis_source !== "openrouter_structured_scan") {
                throw new Error("A live OpenRouter verdict was not returned.");
            }
            const verdict = analysis.label === "spam" || analysis.is_spam === true ? "scam" : "safe";
            return {
                verdict,
                risk: analysis.risk,
                title: verdict === "scam" ? "AI detected scam risk" : "AI found no strong scam pattern",
                confidence: analysis.confidence,
                riskScore: analysis.risk_score,
                category: analysis.category,
                reason: analysis.reason,
                signals: analysis.indicators || [],
                model: analysis.model
            };
        } finally {
            window.clearTimeout(timeout);
        }
    } catch (error) {
        return {
            verdict: "error",
            title: "Live AI scan unavailable",
            confidence: 0,
            category: "No verdict generated",
            reason: error?.name === "AbortError" ? "The live OpenRouter scan timed out. Please try again." : (error?.message || "OpenRouter could not complete this scan."),
            signals: ["SafeMind did not substitute demo data or a fixed local verdict."]
        };
    }
}

function renderResult(result) {
    latestDemoResult = result;
    const risk = ["LOW", "MEDIUM", "HIGH"].includes(result.risk) ? result.risk : null;
    demoRisk.textContent = result.verdict === "safe" ? `NOT SCAM · ${risk || "LOW"} RISK` : result.verdict === "scam" ? `SCAM · ${risk || "HIGH"} RISK` : result.verdict === "error" ? "NO RESULT" : "WAITING";
    demoRisk.dataset.risk = risk?.toLowerCase() || (result.verdict === "error" ? "medium" : "low");
    demoConfidence.textContent = result.title;
    demoCategory.textContent = result.verdict === "error" ? result.category : `${result.category || "AI assessment"} · Confidence ${result.confidence}%`;
    demoReason.textContent = result.reason;
    demoSignals.replaceChildren(...result.signals.map((text) => {
        const item = document.createElement("li");
        item.textContent = text;
        return item;
    }));
    demoReport.hidden = result.verdict !== "scam";
}

async function loadContacts() {
    const list = document.getElementById("verifiedEmailList");
    if (!list) return;
    if (!supabase) {
        const notice = document.createElement("p");
        notice.textContent = "The live verified-contact directory is unavailable.";
        list.replaceChildren(notice);
        return;
    }
    const response = await supabase.from("verified_organization_emails").select("organization,email,purpose,source_url").order("organization");
    if (response.error || !response.data?.length) {
        const notice = document.createElement("p");
        notice.textContent = response.error ? "The live verified-contact directory could not be loaded." : "No verified contacts are currently published.";
        list.replaceChildren(notice);
        return;
    }
    const rows = response.data;
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
demoTabs.forEach((button, index) => button.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = index;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + demoTabs.length) % demoTabs.length;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % demoTabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = demoTabs.length - 1;
    const nextTab = demoTabs[nextIndex];
    setMode(nextTab.dataset.demoMode);
    nextTab.focus();
}));
document.querySelectorAll("[data-hero-feature]").forEach((button) => button.addEventListener("click", () => {
    setMode(button.dataset.heroFeature);
    document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" });
}));
demoAnalyze?.addEventListener("click", async () => {
    demoReadiness.setBusy(true);
    const progressLabels = ["Connecting to AI…", "Scanning warning signs…", "Preparing verdict…"];
    let progressIndex = 0;
    demoAnalyze.textContent = progressLabels[progressIndex];
    const progressTimer = window.setInterval(() => {
        progressIndex = (progressIndex + 1) % progressLabels.length;
        demoAnalyze.textContent = progressLabels[progressIndex];
    }, 2200);
    document.querySelector("[data-demo-loading]")?.classList.add("is-loading");
    try {
        renderResult(await analyzeDemo());
    } finally {
        window.clearInterval(progressTimer);
        document.querySelector("[data-demo-loading]")?.classList.remove("is-loading");
        demoReadiness.setBusy(false);
        demoAnalyze.textContent = "Check with AI";
    }
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
    let typingTimer;
    let character = 0;
    const typeHeading = () => {
        const language = localStorage.getItem("safemindLanguage") === "my" ? "my" : "en";
        const heading = headings[language];
        typingTarget.textContent = heading.slice(0, character += 1);
        if (character < heading.length) {
            typingTimer = window.setTimeout(typeHeading, language === "my" ? 90 : 65);
        } else {
            typingTimer = window.setTimeout(() => {
                character = 0;
                typingTarget.textContent = "";
                typingTimer = window.setTimeout(typeHeading, 550);
            }, 1800);
        }
    };
    window.addEventListener("safemind:language-change", () => {
        window.clearTimeout(typingTimer);
        character = 0;
        typingTarget.textContent = "";
        typeHeading();
    });
    typeHeading();
}
const backToTop = document.querySelector("[data-back-to-top]");
if (backToTop) {
    const toggleBackToTop = () => backToTop.classList.toggle("is-visible", window.scrollY > 300);
    window.addEventListener("scroll", toggleBackToTop, { passive: true });
    toggleBackToTop();
    backToTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
}

const siteFooter = document.querySelector(".site-footer");
if (siteFooter && "IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
        document.body.classList.toggle("footer-in-view", entry.isIntersecting);
    }).observe(siteFooter);
}

const termsPanel = document.querySelector("[data-terms-consent]");
if (termsPanel) {
    const storageKey = "safemind-terms-choice-v3";
    const status = termsPanel.querySelector("[data-terms-status]");
    const choiceButtons = [...termsPanel.querySelectorAll("[data-terms-choice]")];
    const renderChoice = (choice) => {
        const language = document.documentElement.lang === "my" ? "my" : "en";
        const messages = {
            accepted: { en: "Terms accepted on this browser.", my: "ဤဘရောက်ဇာတွင် စည်းကမ်းချက်များကို လက်ခံထားသည်။" },
            declined: { en: "Terms declined. Basic browsing remains available.", my: "စည်းကမ်းချက်များကို ငြင်းပယ်ထားသည်။ အခြေခံကြည့်ရှုမှုကို ဆက်လက်အသုံးပြုနိုင်သည်။" },
            pending: { en: "No choice selected yet.", my: "ရွေးချယ်မှု မပြုလုပ်ရသေးပါ။" }
        };
        const selected = ["accepted", "declined"].includes(choice) ? choice : "pending";
        termsPanel.dataset.choice = selected;
        if (status) status.textContent = messages[selected][language];
        choiceButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.termsChoice === selected)));
    };
    let savedChoice = "";
    try { savedChoice = localStorage.getItem(storageKey) || ""; } catch { /* Consent controls remain usable without storage. */ }
    const openTerms = () => {
        if (typeof termsPanel.showModal === "function" && !termsPanel.open) termsPanel.showModal();
        document.body.classList.add("terms-dialog-open");
    };
    const closeTerms = () => {
        if (termsPanel.open) termsPanel.close();
        document.body.classList.remove("terms-dialog-open");
    };
    choiceButtons.forEach((button) => button.addEventListener("click", () => {
        savedChoice = button.dataset.termsChoice;
        try { localStorage.setItem(storageKey, savedChoice); } catch { /* Keep the current in-page choice. */ }
        renderChoice(savedChoice);
        closeTerms();
        window.dispatchEvent(new CustomEvent("safemind:terms-choice", { detail: { choice: savedChoice } }));
    }));
    termsPanel.querySelector("[data-terms-close]")?.addEventListener("click", closeTerms);
    termsPanel.addEventListener("close", () => document.body.classList.remove("terms-dialog-open"));
    termsPanel.addEventListener("cancel", () => document.body.classList.remove("terms-dialog-open"));
    document.querySelectorAll("[data-open-terms]").forEach((button) => button.addEventListener("click", openTerms));
    window.addEventListener("safemind:language-change", () => renderChoice(savedChoice));
    renderChoice(savedChoice);
    if (!savedChoice) window.requestAnimationFrame(openTerms);
}
setMode(activeDemoMode);
loadContacts();
document.body.classList.add("is-ready");
initLanguage();
