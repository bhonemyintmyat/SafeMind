import { supabase } from "./supabase.js";
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

async function loadRecentActivity() {
    const list = document.getElementById("activityList");
    if (!list || !user || !supabase) return;
    const { data } = await supabase
        .from("user_scan_history")
        .select("scan_type,risk,credits_earned,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(6);
    if (!data?.length) return;
    list.replaceChildren(...data.map((row) => {
        const item = document.createElement("article");
        item.className = "activity-row";
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
        item.append(details, risk, credits);
        return item;
    }));
}

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
        link.href = `education-article.html?id=${encodeURIComponent(row.id)}`;
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
        window.location.replace("reports.html");
        return;
    }
    const name = renderIdentity(user);
    if (page === "overview") {
        await Promise.all([loadProgress(), loadRecentActivity()]);
    }
    if (page === "education") {
        const admin = await checkAdminAccess();
        const adminPublish = document.getElementById("adminPublish");
        if (adminPublish) adminPublish.hidden = !admin;
        await loadEducation();
    }
    if (page === "education-article") await loadArticle();
    if (page === "reports") loadPendingReport();
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
    const password = document.getElementById("profilePassword").value;
    submit.disabled = true;
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
requireAuth("login.html").then(initializePage);
