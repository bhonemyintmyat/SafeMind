import { supabase } from "./backend-client.js";
import { requireAuth, formatDisplayName, getInitials, pageReady, logoutToMain } from "./router.js";
import { initLanguage } from "./language.js";
import "./theme-toggle.js";

const page = document.body.dataset.page;
const usernameNodes = document.querySelectorAll(".username");
const avatarNodes = document.querySelectorAll("[data-avatar]");
const reportForm = document.getElementById("reportForm");
const educationForm = document.getElementById("educationForm");
const educationFeed = document.getElementById("educationFeed");
const mobileNavMore = document.querySelector(".mobile-nav-more");
const dashboardUtilities = document.querySelector(".dashboard-utilities");
const dashboardSidebar = document.querySelector(".dashboard-sidebar");
const dashboardHeader = document.querySelector(".dashboard-header");
const reportScreenshotInput = document.getElementById("reportScreenshot");
const reportScreenshotPreview = document.getElementById("reportScreenshotPreview");
const reportScreenshotImage = document.getElementById("reportScreenshotImage");
const reportScreenshotName = document.getElementById("reportScreenshotName");
const reportScreenshotSize = document.getElementById("reportScreenshotSize");
const reportScreenshotStatus = document.getElementById("reportScreenshotStatus");
const reportScreenshotRemove = document.getElementById("reportScreenshotRemove");
const REPORT_SCREENSHOT_BUCKET = "report-screenshots";
const MAX_REPORT_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const REPORT_SCREENSHOT_TYPES = new Map([
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["image/webp", "webp"]
]);
let user = null;
let educationRows = [];
let activeEducationFilter = "all";
let latestResult = null;
let reportScreenshotUrl = "";
let recentActivityRows = [];
let activitySearchTerm = "";
let activityRisk = "all";
let adminReportRows = [];

function setupMobileDrawer() {
    if (!dashboardSidebar || !dashboardHeader || document.querySelector(".dashboard-drawer-toggle")) return;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "dashboard-drawer-toggle";
    toggle.setAttribute("aria-label", "Open navigation");
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = "<span></span><span></span><span></span>";
    const overlay = document.createElement("button");
    overlay.type = "button";
    overlay.className = "dashboard-drawer-overlay";
    overlay.setAttribute("aria-label", "Close navigation");
    document.body.append(overlay);
    dashboardHeader.prepend(toggle);
    const setOpen = (open) => {
        dashboardSidebar.classList.toggle("is-drawer-open", open);
        document.body.classList.toggle("dashboard-drawer-open", open);
        toggle.setAttribute("aria-expanded", String(open));
        toggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    };
    toggle.addEventListener("click", () => setOpen(!dashboardSidebar.classList.contains("is-drawer-open")));
    overlay.addEventListener("click", () => setOpen(false));
    dashboardSidebar.addEventListener("click", (event) => { if (event.target.closest("a")) setOpen(false); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") setOpen(false); });
}

setupMobileDrawer();

function closeMobileUtilities() {
    dashboardUtilities?.classList.remove("is-open");
    mobileNavMore?.setAttribute("aria-expanded", "false");
}

mobileNavMore?.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = !dashboardUtilities?.classList.contains("is-open");
    dashboardUtilities?.classList.toggle("is-open", open);
    mobileNavMore.setAttribute("aria-expanded", String(open));
});

dashboardUtilities?.addEventListener("click", (event) => event.stopPropagation());
document.addEventListener("click", closeMobileUtilities);
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mobileNavMore?.getAttribute("aria-expanded") === "true") {
        closeMobileUtilities();
        mobileNavMore?.focus();
    }
});

function displayNameFor(activeUser) {
    const savedName = String(activeUser?.user_metadata?.display_name || "").trim();
    return savedName || formatDisplayName(activeUser?.email);
}

function renderIdentity(activeUser) {
    const name = displayNameFor(activeUser);
    usernameNodes.forEach((node) => { node.textContent = name; });
    avatarNodes.forEach((node) => { node.textContent = getInitials(name); });
    return name;
}

function setStatus(element, message, state = "pending") {
    if (!element) return;
    element.textContent = message;
    element.dataset.state = state;
}

function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function resetReportScreenshot({ clearInput = true, clearStatus = true } = {}) {
    if (reportScreenshotUrl) URL.revokeObjectURL(reportScreenshotUrl);
    reportScreenshotUrl = "";
    if (clearInput && reportScreenshotInput) reportScreenshotInput.value = "";
    if (reportScreenshotImage) reportScreenshotImage.removeAttribute("src");
    if (reportScreenshotName) reportScreenshotName.textContent = "";
    if (reportScreenshotSize) reportScreenshotSize.textContent = "";
    if (reportScreenshotPreview) reportScreenshotPreview.hidden = true;
    if (clearStatus) setStatus(reportScreenshotStatus, "");
}

function reportScreenshotError(file) {
    if (!REPORT_SCREENSHOT_TYPES.has(file?.type)) {
        return "Choose a PNG, JPEG, or WebP screenshot.";
    }
    if (!file.size) return "The selected screenshot is empty.";
    if (file.size > MAX_REPORT_SCREENSHOT_BYTES) {
        return "Choose a screenshot smaller than 5 MB.";
    }
    return "";
}

async function canDecodeImage(file) {
    if (typeof createImageBitmap === "function") {
        try {
            const image = await createImageBitmap(file);
            const valid = image.width > 0 && image.height > 0;
            image.close();
            return valid;
        } catch {
            return false;
        }
    }
    return new Promise((resolve) => {
        const image = new Image();
        const url = URL.createObjectURL(file);
        image.onload = () => { URL.revokeObjectURL(url); resolve(image.naturalWidth > 0); };
        image.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
        image.src = url;
    });
}

reportScreenshotInput?.addEventListener("change", async () => {
    const file = reportScreenshotInput.files?.[0];
    resetReportScreenshot({ clearInput: false });
    if (!file) return;
    const validationError = reportScreenshotError(file);
    if (validationError || !(await canDecodeImage(file))) {
        resetReportScreenshot();
        setStatus(reportScreenshotStatus, validationError || "Choose a valid image screenshot.", "error");
        return;
    }
    reportScreenshotUrl = URL.createObjectURL(file);
    reportScreenshotImage.src = reportScreenshotUrl;
    reportScreenshotName.textContent = file.name;
    reportScreenshotSize.textContent = formatFileSize(file.size);
    reportScreenshotPreview.hidden = false;
    setStatus(reportScreenshotStatus, "Screenshot ready to upload.", "success");
});

reportScreenshotRemove?.addEventListener("click", () => {
    resetReportScreenshot();
    reportScreenshotInput?.focus();
});

async function checkAdminAccess() {
    if (!supabase) return false;
    const { data, error } = await supabase.rpc("is_safemind_admin");
    return !error && data === true;
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
}

function renderProgress(progress = {}) {
    const scans = Number(progress.total_scans) || 0;
    setText("userCredits", Number(progress.credits) || 0);
    setText("userStreak", Number(progress.current_streak) || 0);
    setText("totalScans", scans);
    setText("badgeCount", [1, 5, 10, 25, 50, 100].filter((goal) => scans >= goal).length);
}

async function loadProgress() {
    if (!user || !supabase || page !== "overview") return;
    const { data } = await supabase
        .from("user_scan_progress")
        .select("credits,total_scans,current_streak")
        .eq("user_id", user.id)
        .maybeSingle();
    renderProgress(data || {});
}

function buildActivityRow(row, compact = false) {
    const item = document.createElement("article");
    item.className = compact ? "home-activity-row" : "activity-row";
    const details = document.createElement("div");
    const type = document.createElement("strong");
    const date = document.createElement("span");
    const risk = document.createElement("span");
    const credits = document.createElement("strong");
    type.textContent = String(row.scan_type || "scan");
    const createdAt = new Date(row.created_at);
    date.textContent = Number.isNaN(createdAt.getTime()) ? "Recently" : createdAt.toLocaleString();
    risk.className = "activity-risk";
    risk.dataset.risk = ["low", "medium", "high"].includes(row.risk) ? row.risk : "low";
    risk.textContent = String(row.risk || "unknown");
    credits.textContent = `+${Number(row.credits_earned) || 0}`;
    details.append(type, date);
    item.append(details, risk);
    if (!compact) item.append(credits);
    return item;
}

function renderActivityLists() {
    const list = document.getElementById("activityList");
    const homeList = document.getElementById("homeActivityList");
    const recent = recentActivityRows.slice(0, 3);
    if (homeList && recent.length) homeList.replaceChildren(...recent.map((row) => buildActivityRow(row, true)));
    if (!list) return;
    const filtered = recentActivityRows.filter((row) => {
        const matchesRisk = activityRisk === "all" || row.risk === activityRisk;
        const matchesSearch = !activitySearchTerm || String(row.scan_type || "scan").toLowerCase().includes(activitySearchTerm);
        return matchesRisk && matchesSearch;
    });
    if (!filtered.length) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = recentActivityRows.length ? "No checks match these filters." : "Your completed checks will appear here.";
        list.replaceChildren(empty);
        return;
    }
    list.replaceChildren(...filtered.map((row) => buildActivityRow(row)));
}

async function loadRecentActivity() {
    if (!document.getElementById("activityList") || !user || !supabase) return;
    const { data } = await supabase
        .from("user_scan_history")
        .select("scan_type,risk,credits_earned,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
    recentActivityRows = data || [];
    renderActivityLists();
    if (!recentActivityRows.length) return;
    const latest = recentActivityRows[0];
    const latestRisk = ["low", "medium", "high"].includes(latest.risk) ? latest.risk : "low";
    const riskPresentation = {
        low: { score: 18, label: "Low risk", advice: "Few warning signs were found. Keep verifying unexpected requests.", color: "var(--lime)" },
        medium: { score: 55, label: "Caution", advice: "Several warning signs need verification through an official channel.", color: "var(--warning)" },
        high: { score: 86, label: "High risk", advice: "Do not respond, click, pay, or share information. Report and block it.", color: "var(--danger)" }
    }[latestRisk];
    const ring = document.getElementById("dashboardRiskRing");
    if (ring) {
        ring.style.setProperty("--risk-score", String(riskPresentation.score));
        ring.style.setProperty("--ring-color", riskPresentation.color);
    }
    setText("dashboardRiskScore", `${riskPresentation.score}%`);
    setText("dashboardRiskLabel", riskPresentation.label);
    setText("dashboardRiskAdvice", riskPresentation.advice);
    setText("dashboardLatestScan", `${String(latest.scan_type || "scan")} · ${riskPresentation.label}`);
    const latestCreatedAt = new Date(latest.created_at);
    setText("dashboardLatestScanTime", Number.isNaN(latestCreatedAt.getTime()) ? "Recently" : latestCreatedAt.toLocaleString());
}

function formatReportVerdict(value) {
    if (value === "scam") return "Scam";
    if (value === "not_scam") return "Not scam";
    return "Pending classification";
}

function buildAdminReportCard(row) {
    const card = document.createElement("article");
    card.className = "admin-report-card";
    const header = document.createElement("header");
    const heading = document.createElement("h3");
    const verdict = document.createElement("span");
    heading.textContent = `${String(row.report_type || "other")} report #${row.id}`;
    verdict.className = "admin-report-verdict";
    verdict.textContent = formatReportVerdict(row.verdict);
    header.append(heading, verdict);
    const content = document.createElement("p");
    content.className = "admin-report-content";
    content.textContent = row.content;
    const meta = document.createElement("p");
    meta.className = "admin-report-meta";
    const created = new Date(row.created_at);
    meta.textContent = Number.isNaN(created.getTime()) ? "Submitted recently" : `Submitted ${created.toLocaleString()}`;
    const actions = document.createElement("div");
    actions.className = "admin-report-actions";
    [["scam", "Mark as scam"], ["not_scam", "Mark as not scam"]].forEach(([value, label]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.classList.toggle("is-selected", row.verdict === value);
        button.setAttribute("aria-pressed", String(row.verdict === value));
        button.addEventListener("click", () => classifyAdminReport(row.id, value, button));
        actions.append(button);
    });
    card.append(header, content);
    if (row.notes) {
        const notes = document.createElement("p");
        notes.textContent = `Context: ${row.notes}`;
        card.append(notes);
    }
    card.append(meta, actions);
    return card;
}

function renderAdminReports() {
    const list = document.getElementById("adminReportReviewList");
    if (!list) return;
    if (!adminReportRows.length) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "No submitted reports are waiting for review.";
        list.replaceChildren(empty);
        return;
    }
    list.replaceChildren(...adminReportRows.map(buildAdminReportCard));
}

async function loadAdminReports() {
    const status = document.getElementById("adminReportsStatus");
    if (!supabase || !status) return;
    setStatus(status, "Loading submitted reports...");
    const { data, error } = await supabase.from("admin_reports")
        .select("id,report_type,content,notes,status,verdict,created_at,reviewed_at")
        .order("created_at", { ascending: false })
        .limit(100);
    if (error) {
        setStatus(status, "Reports could not be loaded. Apply the latest Supabase admin-reports migration.", "error");
        return;
    }
    adminReportRows = data || [];
    setStatus(status, `${adminReportRows.length} reports loaded.`, "success");
    renderAdminReports();
}

async function classifyAdminReport(id, verdict, button) {
    const status = document.getElementById("adminReportsStatus");
    if (!supabase || !status) return;
    const buttons = button.closest(".admin-report-actions")?.querySelectorAll("button") || [];
    buttons.forEach((item) => { item.disabled = true; });
    setStatus(status, "Saving classification...");
    const { error } = await supabase.from("admin_reports").update({ verdict }).eq("id", id);
    buttons.forEach((item) => { item.disabled = false; });
    if (error) {
        setStatus(status, "The classification could not be saved.", "error");
        return;
    }
    const row = adminReportRows.find((item) => item.id === id);
    if (row) row.verdict = verdict;
    renderAdminReports();
    setStatus(status, "Classification saved in Supabase.", "success");
}

document.getElementById("adminReportsRefresh")?.addEventListener("click", loadAdminReports);

function refreshCheckData() {
    window.setTimeout(() => { void Promise.all([loadProgress(), loadRecentActivity()]); }, 120);
}

async function loadThreatNumbers() {
    const list = document.getElementById("threatNumberList");
    if (!list || !supabase) return;
    const { data, error } = await supabase.from("threat_directory")
        .select("normalized_value,organization,created_at")
        .eq("entry_type", "phone")
        .eq("verdict", "scam")
        .order("created_at", { ascending: false })
        .limit(5);
    if (error || !data?.length) {
        const empty = document.createElement("p");
        empty.textContent = "No verified scam numbers are available right now.";
        list.replaceChildren(empty);
        return;
    }
    list.replaceChildren(...data.map((row) => {
        const item = document.createElement("div");
        const number = document.createElement("strong");
        const source = document.createElement("span");
        number.textContent = row.normalized_value || "Unknown number";
        source.textContent = row.organization || "Community report";
        item.append(number, source);
        return item;
    }));
}

document.getElementById("activitySearch")?.addEventListener("input", (event) => {
    activitySearchTerm = event.target.value.trim().toLowerCase();
    renderActivityLists();
});
document.getElementById("activityRiskFilter")?.addEventListener("change", (event) => {
    activityRisk = event.target.value;
    renderActivityLists();
});

function educationExcerpt(content) {
    const value = String(content || "").replace(/\s+/g, " ").trim();
    return value.length > 150 ? `${value.slice(0, 147)}...` : value;
}

function filteredEducationRows() {
    if (activeEducationFilter === "all") return educationRows;
    return educationRows.filter((row) => String(row.category || "").toLowerCase().includes(activeEducationFilter));
}

function renderEducation() {
    if (!educationFeed) return;
    const rows = filteredEducationRows();
    if (!rows.length) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "No education has been published yet.";
        educationFeed.replaceChildren(empty);
        return;
    }
    educationFeed.replaceChildren(...rows.map((row) => {
        const article = document.createElement("article");
        article.className = "education-item";
        const category = document.createElement("p");
        category.className = "education-category";
        category.textContent = row.category || "Safety";
        const title = document.createElement("h3");
        title.textContent = row.title;
        const excerpt = document.createElement("p");
        excerpt.className = "education-excerpt";
        excerpt.textContent = educationExcerpt(row.content);
        const meta = document.createElement("div");
        meta.className = "education-meta";
        const date = document.createElement("time");
        const published = new Date(row.created_at);
        date.dateTime = Number.isNaN(published.getTime()) ? "" : published.toISOString();
        date.textContent = Number.isNaN(published.getTime()) ? "Recently" : published.toLocaleDateString();
        const link = document.createElement("a");
        link.href = `/eduai/article?id=${encodeURIComponent(row.id)}`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Read article";
        link.setAttribute("aria-label", `Read ${row.title} in a new tab`);
        meta.append(date, link);
        article.append(category, title, excerpt, meta);
        return article;
    }));
}

async function loadEducation() {
    if (!supabase || !educationFeed) return;
    const { data, error } = await supabase
        .from("scam_education")
        .select("id,title,category,content,created_at")
        .order("created_at", { ascending: false });
    educationRows = error ? [] : (data || []);
    renderEducation();
}

async function loadArticle() {
    const container = document.getElementById("articleContent");
    if (!container || !supabase) return;
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) {
        container.innerHTML = '<p class="empty-state">Article not found.</p>';
        return;
    }
    const { data, error } = await supabase
        .from("scam_education")
        .select("id,title,category,content,created_at")
        .eq("id", id)
        .maybeSingle();
    if (error || !data) {
        container.innerHTML = '<p class="empty-state">Article not found.</p>';
        return;
    }
    document.title = `${data.title} | SafeMind`;
    const category = document.createElement("p");
    category.className = "education-category";
    category.textContent = data.category || "Safety";
    const title = document.createElement("h1");
    title.textContent = data.title;
    const date = document.createElement("p");
    date.className = "article-date";
    const published = new Date(data.created_at);
    date.textContent = Number.isNaN(published.getTime()) ? "Published recently" : `Published ${published.toLocaleDateString()}`;
    const content = document.createElement("p");
    content.className = "article-body";
    content.textContent = data.content;
    container.replaceChildren(category, title, date, content);
}

function loadPendingReport() {
    if (!reportForm) return;
    const pendingReport = sessionStorage.getItem("safemindPendingReport");
    if (!pendingReport) return;
    try {
        const pending = JSON.parse(pendingReport);
        const type = document.getElementById("reportType");
        if (["message", "link", "phone", "email", "other"].includes(pending.type)) type.value = pending.type;
        document.getElementById("reportContent").value = String(pending.content || "").slice(0, 5000);
        latestResult = pending.result || null;
    } catch {
        latestResult = null;
    }
    sessionStorage.removeItem("safemindPendingReport");
}

async function initializePage(activeUser) {
    user = activeUser;
    if (!user) return;
    if (page === "overview" && sessionStorage.getItem("safemindPendingReport")) {
        window.location.replace("/reports");
        return;
    }
    const name = renderIdentity(user);
    if (page === "overview") {
        await Promise.all([loadProgress(), loadRecentActivity(), loadThreatNumbers()]);
        window.addEventListener("safemind:scan-complete", refreshCheckData);
    }
    if (page === "education") {
        const admin = await checkAdminAccess();
        const adminPublish = document.getElementById("adminPublish");
        if (adminPublish) adminPublish.hidden = !admin;
        await loadEducation();
    }
    if (page === "education-article") await loadArticle();
    if (page === "reports") {
        loadPendingReport();
        const admin = await checkAdminAccess();
        const review = document.getElementById("adminReportReview");
        if (review) review.hidden = !admin;
        if (admin) await loadAdminReports();
    }
    if (page === "profile") {
        document.getElementById("profileName").value = name;
        document.getElementById("profileEmail").value = user.email || "";
    }
}

reportForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!user || !supabase) return;
    const submit = document.getElementById("reportSubmit");
    const status = document.getElementById("reportStatus");
    const content = document.getElementById("reportContent").value.trim();
    const screenshot = reportScreenshotInput?.files?.[0] || null;
    if (!content) return;
    if (screenshot) {
        const validationError = reportScreenshotError(screenshot);
        if (validationError || !(await canDecodeImage(screenshot))) {
            setStatus(reportScreenshotStatus, validationError || "Choose a valid image screenshot.", "error");
            reportScreenshotInput?.focus();
            return;
        }
    }
    submit.disabled = true;
    let screenshotPath = null;
    try {
        if (screenshot) {
            setStatus(status, "Uploading screenshot...");
            const extension = REPORT_SCREENSHOT_TYPES.get(screenshot.type);
            const identifier = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            screenshotPath = `${user.id}/${identifier}.${extension}`;
            const { error: uploadError } = await supabase.storage
                .from(REPORT_SCREENSHOT_BUCKET)
                .upload(screenshotPath, screenshot, {
                    cacheControl: "3600",
                    contentType: screenshot.type,
                    upsert: false
                });
            if (uploadError) throw uploadError;
        }

        setStatus(status, "Sending report...");
        const { error } = await supabase.from("admin_reports").insert({
            reporter_id: user.id,
            report_type: document.getElementById("reportType").value,
            content,
            notes: document.getElementById("reportNotes").value.trim() || null,
            automated_result: latestResult,
            screenshot_path: screenshotPath,
            screenshot_name: screenshot?.name.slice(0, 255) || null,
            screenshot_type: screenshot?.type || null,
            screenshot_size: screenshot?.size || null,
            status: "pending"
        });
        if (error) throw error;
    } catch {
        if (screenshotPath) {
            await supabase.storage.from(REPORT_SCREENSHOT_BUCKET).remove([screenshotPath]);
        }
        submit.disabled = false;
        setStatus(status, "The report could not be sent. Please try again.", "error");
        return;
    }
    submit.disabled = false;
    reportForm.reset();
    resetReportScreenshot();
    latestResult = null;
    setStatus(status, "Report sent for administrator review.", "success");
});

educationForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!user || !supabase) return;
    const submit = document.getElementById("educationSubmit");
    const status = document.getElementById("educationStatus");
    submit.disabled = true;
    setStatus(status, "Publishing article...");
    const { error } = await supabase.from("scam_education").insert({
        author_id: user.id,
        title: document.getElementById("educationTitle").value.trim(),
        category: document.getElementById("educationCategory").value.trim(),
        content: document.getElementById("educationContent").value.trim()
    });
    submit.disabled = false;
    if (error) {
        setStatus(status, "The article could not be published.", "error");
        return;
    }
    educationForm.reset();
    setStatus(status, "Article published.", "success");
    await loadEducation();
});

document.querySelectorAll("[data-education-filter]").forEach((button) => button.addEventListener("click", () => {
    activeEducationFilter = button.dataset.educationFilter;
    document.querySelectorAll("[data-education-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
    renderEducation();
}));

document.getElementById("profileForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!user || !supabase) return;
    const submit = document.getElementById("profileSubmit");
    const status = document.getElementById("profileStatus");
    const displayName = document.getElementById("profileName").value.trim();
    submit.disabled = true;
    setStatus(status, "Saving profile...");
    const { data, error } = await supabase.auth.updateUser({ data: { display_name: displayName } });
    submit.disabled = false;
    if (error) {
        setStatus(status, error.message || "The profile could not be saved.", "error");
        return;
    }
    user = data.user || { ...user, user_metadata: { ...user.user_metadata, display_name: displayName } };
    renderIdentity(user);
    setStatus(status, "Profile saved.", "success");
});

document.getElementById("passwordForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!user || !supabase) return;
    const submit = document.getElementById("passwordSubmit");
    const status = document.getElementById("passwordStatus");
    const currentPassword = document.getElementById("profileCurrentPassword").value;
    const password = document.getElementById("profilePassword").value;
    const confirmation = document.getElementById("profilePasswordConfirm").value;
    if (password !== confirmation) {
        setStatus(status, "New passwords do not match.", "error");
        document.getElementById("profilePasswordConfirm").focus();
        return;
    }
    if (currentPassword === password) {
        setStatus(status, "Choose a new password that is different from your current password.", "error");
        document.getElementById("profilePassword").focus();
        return;
    }
    if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
        setStatus(status, "Use at least 12 characters with upper and lowercase letters, a number, and a symbol.", "error");
        document.getElementById("profilePassword").focus();
        return;
    }
    submit.disabled = true;
    setStatus(status, "Confirming current password...");
    const { error: confirmationError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
    if (confirmationError) {
        submit.disabled = false;
        setStatus(status, "Current password is incorrect.", "error");
        document.getElementById("profileCurrentPassword").focus();
        return;
    }
    setStatus(status, "Updating password...");
    const { error } = await supabase.auth.updateUser({ password });
    submit.disabled = false;
    if (error) {
        setStatus(status, error.message || "The password could not be updated.", "error");
        return;
    }
    event.currentTarget.reset();
    setStatus(status, "Password updated.", "success");
});

pageReady();
initLanguage();
document.querySelectorAll("[data-logout]").forEach((button) => button.addEventListener("click", logoutToMain));
requireAuth("/login").then(initializePage);
