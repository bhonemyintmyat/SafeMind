import { supabase, isSupabaseConfigured } from "./backend-client.js";
import { redirectIfAuthenticated } from "./router.js";
import { initLanguage } from "./language.js";
import "./theme-toggle.js";

const authPage = document.body?.dataset.authPage;
const form = document.querySelector("[data-auth-form]");
const message = document.querySelector("[data-auth-message]");
const submitButton = form?.querySelector('button[type="submit"]');

function safeReturnTarget() {
    if (sessionStorage.getItem("safemindPendingReport")) return "reports.html";
    const requested = new URLSearchParams(window.location.search).get("returnTo");
    if (!requested) return "dashboard.html";
    try {
        const target = new URL(requested, window.location.origin);
        const allowedPages = ["dashboard.html", "reports.html", "education.html", "education-article.html", "profile.html"];
        const page = target.pathname.split("/").pop();
        if (target.origin === window.location.origin && allowedPages.includes(page)) {
            return `${target.pathname}${target.search}${target.hash}`;
        }
    } catch {
        return "dashboard.html";
    }
    return "dashboard.html";
}

function showMessage(text, isError = true) {
    if (!message) return;
    message.textContent = text;
    message.dataset.state = isError ? "error" : "success";
}

function setBusy(busy) {
    if (submitButton) submitButton.disabled = busy;
    document.querySelectorAll("[data-provider]").forEach((button) => {
        button.disabled = busy;
    });
}

function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function strongPassword(value) {
    return value.length >= 12 && value.length <= 128 && /[a-z]/.test(value)
        && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
}

function clearFieldError(field) {
    if (!field) return;
    field.removeAttribute("aria-invalid");
    const errorId = `${field.id}Error`;
    document.getElementById(errorId)?.remove();
    const describedBy = String(field.getAttribute("aria-describedby") || "").split(/\s+/).filter((id) => id && id !== errorId);
    if (describedBy.length) field.setAttribute("aria-describedby", describedBy.join(" "));
    else field.removeAttribute("aria-describedby");
}

function showFieldError(field, text) {
    if (!field) return;
    clearFieldError(field);
    const error = document.createElement("p");
    error.id = `${field.id}Error`;
    error.className = "field-error";
    error.textContent = text;
    field.setAttribute("aria-invalid", "true");
    const describedBy = String(field.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
    field.setAttribute("aria-describedby", [...new Set([...describedBy, error.id])].join(" "));
    field.insertAdjacentElement("afterend", error);
    field.focus();
}

form?.querySelectorAll("input").forEach((field) => field.addEventListener("input", () => clearFieldError(field)));

if (authPage && isSupabaseConfigured) {
    redirectIfAuthenticated(safeReturnTarget());
} else if (!isSupabaseConfigured) {
    showMessage("Authentication is not configured. Add the public Supabase settings to .env and restart the site.");
    setBusy(true);
}

form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!supabase) {
        showMessage("Authentication is unavailable. Refresh the page and try again.");
        return;
    }

    const isSignup = authPage === "signup";
    const emailField = document.getElementById(isSignup ? "newEmail" : "email");
    const passwordField = document.getElementById(isSignup ? "newPassword" : "password");
    const email = emailField?.value.trim();
    const password = passwordField?.value;

    if (!email || !password) {
        showMessage("Enter both your email and password.");
        showFieldError(!email ? emailField : passwordField, !email ? "Enter your email address." : "Enter your password.");
        return;
    }
    if (!validEmail(email)) {
        showMessage("Enter a valid email address.");
        showFieldError(emailField, "Enter a valid email address, such as you@example.com.");
        return;
    }
    if (isSignup && !strongPassword(password)) {
        showMessage("Use 12–128 characters with upper and lowercase letters, a number, and a symbol.");
        showFieldError(passwordField, "Use upper and lowercase letters, a number, and a symbol.");
        return;
    }

    setBusy(true);
    showMessage(isSignup ? "Creating your account..." : "Signing you in...", false);
    let response;
    try {
        response = isSignup
            ? await supabase.auth.signUp({ email, password })
            : await supabase.auth.signInWithPassword({ email, password });
    } catch {
        setBusy(false);
        showMessage("Could not reach the authentication service. Check your connection and try again.");
        return;
    }
    setBusy(false);

    if (response.error) {
        const errorText = String(response.error.message || "").toLowerCase();
        if (!isSignup && errorText.includes("email not confirmed")) {
            showMessage("Confirm your email address before logging in.");
        } else if (!isSignup && errorText.includes("invalid login")) {
            showMessage("Incorrect email or password.");
        } else {
            showMessage(response.error.message || (isSignup ? "Account creation failed." : "Login failed."));
        }
        return;
    }

    if (isSignup && !response.data.session) {
        showMessage("Check your email to confirm your account, then log in.", false);
        return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
        showMessage("Login succeeded, but the session could not be saved. Allow site storage and try again.");
        return;
    }
    window.location.replace(safeReturnTarget());
});

document.querySelectorAll("[data-provider]").forEach((button) => {
    button.addEventListener("click", async () => {
        if (!supabase) {
            showMessage("Authentication is unavailable. Refresh the page and try again.");
            return;
        }
        setBusy(true);
        let error;
        try {
            ({ error } = await supabase.auth.signInWithOAuth({
                provider: button.dataset.provider,
                options: {
                    scopes: button.dataset.provider === "azure" ? "email" : undefined,
                    redirectTo: new URL("dashboard.html", window.location.href).href
                }
            }));
        } catch {
            error = new Error("Authentication service unavailable");
        }
        if (error) {
            setBusy(false);
            showMessage("Social login could not be started. Please try again.");
        }
    });
});

initLanguage();
