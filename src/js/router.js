import { supabase } from "./supabase.js";

export async function getActiveUser() {
    if (!supabase) {
        return null;
    }
    try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) return null;
        if (sessionData.session?.user) return sessionData.session.user;

        const { data: userData, error: userError } = await supabase.auth.getUser();
        return userError ? null : (userData.user ?? null);
    } catch {
        return null;
    }
}

export async function redirectIfAuthenticated(target = "dashboard.html") {
    const user = await getActiveUser();

    if (user) {
        window.location.replace(target);
        return true;
    }

    return false;
}

export async function requireAuth(target = "login.html") {
    const user = await getActiveUser();

    if (!user) {
        const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        const loginUrl = new URL(target, window.location.href);
        loginUrl.searchParams.set("returnTo", returnTo);
        window.location.replace(loginUrl.href);
        return null;
    }

    return user;
}

export function bindLogoLinks(target = "main.html") {
    document.querySelectorAll("[data-logo-link]").forEach((link) => {
        if (link instanceof HTMLAnchorElement) {
            link.href = target;
        }
    });
}

export function formatDisplayName(email) {
    if (!email) {
        return "Alex";
    }

    return email
        .split("@")[0]
        .replace(/[._-]+/g, " ")
        .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function getInitials(name) {
    return name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "A")
        .join("") || "SM";
}

export async function logoutToMain() {
    if (supabase) {
        await supabase.auth.signOut();
    }
    window.location.replace("main.html");
}

export function pageReady() {
    requestAnimationFrame(() => {
        document.body.classList.add("is-ready");
    });
}
