import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runSecurityScan } from "../api/spam-check.js";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}

assert(process.env.OPENROUTER_API_KEY, "OPENROUTER_API_KEY is required for the live OpenRouter scan test.");

const scam = await runSecurityScan(
  "message",
  "This is the university president. I am using my private number. Treat this as urgent and reply once you see it.",
  { allowFallback: false, bypassCache: true }
);
assert.equal(scam.provider, "openrouter");
assert.equal(scam.analysis_source, "openrouter_structured_scan");
assert.equal(scam.risk, "HIGH");
assert.equal(scam.label, "spam");

const safe = await runSecurityScan(
  "message",
  "The university president's office posted the public meeting schedule on the official university website.",
  { allowFallback: false, bypassCache: true }
);
assert.equal(safe.provider, "openrouter");
assert.equal(safe.risk, "LOW");
assert.equal(safe.label, "not_spam");

console.log(`Live OpenRouter scan passed: impersonation=${scam.risk}/${scam.risk_score}, ordinary reference=${safe.risk}/${safe.risk_score}.`);
