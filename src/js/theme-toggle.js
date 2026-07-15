import "../css/theme-toggle.css";

const STORAGE_KEY = "safemind-theme";

function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function setTheme(theme, persist = true) {
  const nextTheme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = nextTheme;
  document.documentElement.style.colorScheme = nextTheme;

  document.querySelectorAll("[data-set-theme]").forEach((button) => {
    const selected = button.dataset.setTheme === nextTheme;
    button.setAttribute("aria-pressed", String(selected));
  });

  const themeColor = document.querySelector('meta[name="theme-color"]');
  themeColor?.setAttribute("content", nextTheme === "light" ? "#F7F8FA" : "#08090B");

  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, nextTheme);
    } catch {
      // The visual preference still applies for this page when storage is blocked.
    }
  }
}

function buildThemeSwitcher(extraClass = "") {
  const switcher = document.createElement("div");
  switcher.className = `theme-switcher ${extraClass}`.trim();
  switcher.dataset.themeSwitcher = "";
  switcher.setAttribute("role", "group");
  switcher.setAttribute("aria-label", "Color theme");
  switcher.innerHTML = `
    <button type="button" data-set-theme="light" aria-label="Use light mode" title="Light mode">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"></path></svg>
      <span>Light</span>
    </button>
    <button type="button" data-set-theme="dark" aria-label="Use dark mode" title="Dark mode">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.1A8.5 8.5 0 0 1 9.9 3.5 8.5 8.5 0 1 0 20.5 14.1Z"></path></svg>
      <span>Dark</span>
    </button>`;

  switcher.addEventListener("click", (event) => {
    const button = event.target.closest("[data-set-theme]");
    if (button) setTheme(button.dataset.setTheme);
  });

  return switcher;
}

function createThemeSwitchers() {
  if (document.querySelector("[data-theme-switcher]") || document.body.classList.contains("splash")) return;

  const navigationTargets = document.querySelectorAll(".nav-actions, .mobile-nav-actions");
  navigationTargets.forEach((target) => target.prepend(buildThemeSwitcher("theme-switcher--nav")));

  const dashboardSidebar = document.querySelector(".dashboard-sidebar");
  if (dashboardSidebar) {
    const switcher = buildThemeSwitcher("theme-switcher--nav");
    const utilities = dashboardSidebar.querySelector(".dashboard-utilities");
    if (utilities) utilities.prepend(switcher);
    else dashboardSidebar.insertBefore(switcher, dashboardSidebar.querySelector(".sidebar-control"));
  }

  const headerTarget = document.querySelector(".checker-header-actions, .article-header, .app-header");
  if (headerTarget) headerTarget.append(buildThemeSwitcher("theme-switcher--nav"));

  const authCopy = document.querySelector(".auth-copy");
  if (authCopy) authCopy.append(buildThemeSwitcher("theme-switcher--auth"));

  if (!document.querySelector("[data-theme-switcher]")) {
    document.body.append(buildThemeSwitcher("theme-switcher--fallback"));
  }

  setTheme(currentTheme(), false);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", createThemeSwitchers, { once: true });
} else {
  createThemeSwitchers();
}
