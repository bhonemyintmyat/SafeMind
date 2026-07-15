const extensionApi = globalThis.browser || globalThis.chrome;
const defaultWebAppUrl = "https://safemind.app/";

function normalizeBaseUrl(value) {
  const url = new URL(String(value || defaultWebAppUrl));
  const localDevelopment = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(localDevelopment && url.protocol === "http:")) {
    throw new Error("SafeMind must use HTTPS outside local development.");
  }
  url.hash = "";
  url.search = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.href;
}

async function configuredBaseUrl() {
  const saved = await extensionApi.storage.local.get("webAppUrl");
  return normalizeBaseUrl(saved.webAppUrl);
}

async function openSafeMindPage(page) {
  try {
    const baseUrl = await configuredBaseUrl();
    const destination = new URL(`src/pages/${page}.html`, baseUrl).href;
    await extensionApi.tabs.create({ url: destination });
    window.close();
  } catch (error) {
    document.getElementById("siteStatus").textContent = error.message;
  }
}

async function showConfiguredSite() {
  try {
    const url = new URL(await configuredBaseUrl());
    document.getElementById("siteStatus").textContent = `Website: ${url.host}`;
  } catch {
    document.getElementById("siteStatus").textContent = "Set a valid website address";
  }
}

document.getElementById("openScanner").addEventListener("click", () => openSafeMindPage("scam-checker"));
document.getElementById("openWebsite").addEventListener("click", () => openSafeMindPage("main"));
document.getElementById("openSettings").addEventListener("click", () => extensionApi.runtime.openOptionsPage());

showConfiguredSite();
