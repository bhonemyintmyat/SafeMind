const sectionRoot = document.querySelector("main.dashboard-content");

if (sectionRoot) {
  const STORAGE_KEY = "safemind-dashboard-section-v1";
  const validSections = new Set(["home", "investigation", "activity", "learn", "threats"]);
  const panels = [...sectionRoot.querySelectorAll("[data-dashboard-section]")];
  const tabs = [...sectionRoot.querySelectorAll("[data-dashboard-tab]")];
  const selector = document.getElementById("dashboardSectionSelect");
  let activeSection = "home";

  function sectionFromLocation() {
    const requestedView = new URLSearchParams(window.location.search).get("view");
    if (requestedView === "investigation") return "investigation";
    const hash = window.location.hash.replace(/^#(?:dashboard-)?/, "");
    if (hash === "investigation") return "investigation";
    if (validSections.has(hash)) return hash;
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (validSections.has(saved)) return saved;
    } catch { /* The dashboard still works when storage is unavailable. */ }
    return "home";
  }

  function updateLocation(section) {
    const url = new URL(window.location.href);
    url.searchParams.delete("view");
    url.hash = section === "home" ? "" : section === "investigation" ? "investigation" : `dashboard-${section}`;
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function activate(section, options = {}) {
    const next = validSections.has(section) ? section : "home";
    activeSection = next;
    panels.forEach((panel) => { panel.hidden = panel.dataset.dashboardSection !== next; });
    tabs.forEach((tab) => {
      const selected = tab.dataset.dashboardTab === next;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    if (selector) selector.value = next;
    document.body.dataset.dashboardSection = next;
    try { sessionStorage.setItem(STORAGE_KEY, next); } catch { /* Optional state. */ }
    if (options.updateLocation !== false) updateLocation(next);
    if (options.scroll !== false) sectionRoot.scrollTo({ top: 0, behavior: options.instant ? "auto" : "smooth" });
    window.dispatchEvent(new CustomEvent("dashboard:sectionchange", { detail: { section: next } }));
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activate(tab.dataset.dashboardTab));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const targetIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      tabs[targetIndex].focus();
      activate(tabs[targetIndex].dataset.dashboardTab);
    });
  });
  selector?.addEventListener("change", () => activate(selector.value));
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-dashboard-target]");
    if (!trigger) return;
    event.preventDefault();
    activate(trigger.dataset.dashboardTarget);
  });

  window.SafeMindDashboardSections = { activate, current: () => activeSection };
  activate(sectionFromLocation(), { updateLocation: false, scroll: false, instant: true });
}
