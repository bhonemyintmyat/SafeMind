import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

globalThis.document = { title: "" };
globalThis.localStorage = { getItem: () => null };

const { translateString } = await import("../src/js/language.js");
const pagesDirectory = resolve("src/pages");
const pageNames = (await readdir(pagesDirectory)).filter((name) => name.endsWith(".html"));
const scriptsDirectory = resolve("src/js");
const allowedUntranslated = [
  /^(?:SafeMind|EduAI|SM|QR|SMS|OTP|AI)$/,
  /^(?:success|error|pending)$/,
  /^© /,
  /@/,
  /^https?:/,
  /^\+?[\d\s().-]+$/,
  /^(?:PNG|JPEG|WebP|TXT|EML|PDF|XLSX|CSV)(?:\s|$)/,
];

const decode = (value) => value
  .replaceAll("&amp;", "&")
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">");

const missing = new Map();
for (const pageName of pageNames) {
  const html = await readFile(resolve(pagesDirectory, pageName), "utf8");
  const content = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(?:script|style|svg)\b[\s\S]*?<\/(?:script|style|svg)>/gi, "");
  const candidates = [];
  for (const match of content.matchAll(/>([^<>]+)</g)) candidates.push(match[1]);
  for (const match of content.matchAll(/\b(?:placeholder|aria-label|title)="([^"]+)"/g)) candidates.push(match[1]);
  for (const rawValue of candidates) {
    const value = decode(rawValue).replace(/\s+/g, " ").trim();
    if (!/[A-Za-z]/.test(value) || allowedUntranslated.some((pattern) => pattern.test(value))) continue;
    if (translateString(value, "my") !== value) continue;
    if (!missing.has(value)) missing.set(value, new Set());
    missing.get(value).add(pageName);
  }
}

const scriptNames = (await readdir(scriptsDirectory)).filter((name) => name.endsWith(".js") && name !== "language.js");
for (const scriptName of scriptNames) {
  const source = await readFile(resolve(scriptsDirectory, scriptName), "utf8");
  const candidates = [];
  const patterns = [
    /\.textContent\s*=\s*(["'])([^"'\n]+)\1/g,
    /(?:setStatus|showMessage)\([^,\n]+,\s*(["'])([^"'\n]+)\1/g,
    /(?:setStatus|showMessage)\(\s*(["'])([^"'\n]+)\1/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) candidates.push(match[2]);
  }
  for (const value of candidates) {
    if (!/[A-Za-z]/.test(value) || value.includes("<") || allowedUntranslated.some((pattern) => pattern.test(value))) continue;
    if (translateString(value, "my") !== value) continue;
    if (!missing.has(value)) missing.set(value, new Set());
    missing.get(value).add(scriptName);
  }
}

if (missing.size) {
  for (const [value, pages] of missing) console.error(`${value}\t${[...pages].join(", ")}`);
  console.error(`\n${missing.size} untranslated English UI strings found.`);
  process.exitCode = 1;
} else {
  console.log(`Translation coverage passed for ${pageNames.length} HTML pages and ${scriptNames.length} UI scripts.`);
}
