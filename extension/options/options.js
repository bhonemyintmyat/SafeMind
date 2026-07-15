const extensionApi = globalThis.browser || globalThis.chrome;
const defaultWebAppUrl = "https://safemind.app/";
const form = document.getElementById("settingsForm");
const input = document.getElementById("webAppUrl");
const status = document.getElementById("status");

function normalizeBaseUrl(value) {
  const url = new URL(value);
  const localDevelopment = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(localDevelopment && url.protocol === "http:")) {
    throw new Error("Use HTTPS, or HTTP only for localhost development.");
  }
  url.hash = "";
  url.search = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.href;
}

async function loadSettings() {
  const saved = await extensionApi.storage.local.get("webAppUrl");
  input.value = saved.webAppUrl || defaultWebAppUrl;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.dataset.error = "false";
  try {
    const webAppUrl = normalizeBaseUrl(input.value.trim());
    await extensionApi.storage.local.set({ webAppUrl });
    input.value = webAppUrl;
    status.textContent = "Website address saved.";
  } catch (error) {
    status.dataset.error = "true";
    status.textContent = error.message;
  }
});

loadSettings().catch(() => {
  input.value = defaultWebAppUrl;
  status.dataset.error = "true";
  status.textContent = "Settings could not be loaded.";
});
