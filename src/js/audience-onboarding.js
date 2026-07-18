const TERMS_KEY = "safemind-terms-choice-v3";
const AGE_KEY = "safemind-age-range-v1";
const EXPERIENCE_KEY = "safemind-page-experience-v1";
const ageDialog = document.getElementById("ageRangeDialog");
const tutorialDialog = document.getElementById("tutorialDialog");

function stored(key) {
  try { return localStorage.getItem(key) || ""; } catch { return ""; }
}

function save(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Personalization remains available for this visit. */ }
}

function showDialog(dialog) {
  if (dialog && !dialog.open && typeof dialog.showModal === "function") dialog.showModal();
}

function closeDialog(dialog) {
  if (dialog?.open) dialog.close();
}

function chooseAge(range) {
  const experience = range === "18-35" ? "standard" : "simple";
  save(AGE_KEY, range);
  save(EXPERIENCE_KEY, experience);
  closeDialog(ageDialog);
  if (experience === "simple") window.location.assign("/simple");
}

const wantsAgeChange = new URLSearchParams(window.location.search).get("changeAge") === "1";
const savedExperience = stored(EXPERIENCE_KEY);
if (!wantsAgeChange && savedExperience === "simple") window.location.replace("/simple");

document.querySelectorAll("[data-age-range]").forEach((button) => {
  button.addEventListener("click", () => chooseAge(button.dataset.ageRange));
});

window.addEventListener("safemind:terms-choice", (event) => {
  if (event.detail?.choice === "accepted" && !stored(AGE_KEY)) window.setTimeout(() => showDialog(ageDialog), 120);
});

if ((wantsAgeChange || (stored(TERMS_KEY) === "accepted" && !stored(AGE_KEY))) && ageDialog) {
  window.requestAnimationFrame(() => showDialog(ageDialog));
}

document.querySelectorAll("[data-open-tutorial]").forEach((button) => button.addEventListener("click", () => showDialog(tutorialDialog)));
document.querySelectorAll("[data-close-tutorial]").forEach((button) => button.addEventListener("click", () => closeDialog(tutorialDialog)));
document.querySelectorAll("[data-tutorial-start]").forEach((link) => link.addEventListener("click", () => closeDialog(tutorialDialog)));
document.querySelectorAll("[data-change-age]").forEach((button) => button.addEventListener("click", () => {
  closeDialog(tutorialDialog);
  showDialog(ageDialog);
}));

tutorialDialog?.addEventListener("click", (event) => {
  if (event.target === tutorialDialog) closeDialog(tutorialDialog);
});

