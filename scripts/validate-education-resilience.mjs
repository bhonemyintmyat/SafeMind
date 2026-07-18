import assert from "node:assert/strict";
import { Readable } from "node:stream";
import educationChatHandler from "../api/education-chat.js";

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENROUTER_API_KEY;
const originalModel = process.env.OPENROUTER_MODEL;
const originalFallback = process.env.OPENROUTER_FALLBACK_MODEL;

process.env.OPENROUTER_API_KEY = "sk-or-v1-test-key-that-is-long-enough";
process.env.OPENROUTER_MODEL = "test/exhausted-primary";
process.env.OPENROUTER_FALLBACK_MODEL = "test/unavailable-fallback";
globalThis.fetch = async () => ({
  ok: false,
  status: 429,
  headers: { get: () => null },
  async json() { return { error: { message: "Test quota exhausted" } }; }
});

function request(payload) {
  const req = Readable.from([JSON.stringify(payload)]);
  req.method = "POST";
  req.headers = { "content-type": "application/json", "x-forwarded-for": "coach-resilience-test" };
  req.socket = { remoteAddress: "coach-resilience-test" };
  return req;
}

function response() {
  let resolveBody;
  const completed = new Promise((resolve) => { resolveBody = resolve; });
  const chunks = [];
  return {
    statusCode: 200,
    headersSent: false,
    headers: {},
    completed,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    flushHeaders() { this.headersSent = true; },
    write(value) { this.headersSent = true; chunks.push(String(value)); },
    end(value = "") {
      if (value) chunks.push(String(value));
      this.headersSent = true;
      resolveBody(chunks.join(""));
    }
  };
}

try {
  const res = response();
  await educationChatHandler(request({
    question: "Explain the warning signs.",
    scan_type: "message",
    language: "en",
    stream: true,
    history: [{ role: "user", content: "Is this a scam?" }],
    memory: {
      evidence_retained: true,
      last_assessment: {
        risk: "HIGH",
        confidence: 94,
        category: "Prize scam",
        reason: "The message requests an upfront payment to claim a prize.",
        indicators: ["Uses a prize or reward lure"],
        recommended_actions: ["Do not pay or reply."]
      }
    }
  }), res);
  const events = (await res.completed).trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.equal(res.statusCode, 200);
  assert.equal(events.some((event) => event.type === "error"), false);
  const done = events.find((event) => event.type === "done");
  assert(done, "A completed coaching response is required.");
  assert.equal(done.model, "safemind-assessment-continuity");
  assert.equal(done.assessment.risk, "HIGH");
  assert.match(done.answer, /Risk Level/);
  assert.match(done.answer, /What You Should Do/);
  console.log("EduAI resilience passed: provider quota failure returns a completed assessment-backed response.");
} finally {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.OPENROUTER_MODEL;
  else process.env.OPENROUTER_MODEL = originalModel;
  if (originalFallback === undefined) delete process.env.OPENROUTER_FALLBACK_MODEL;
  else process.env.OPENROUTER_FALLBACK_MODEL = originalFallback;
}
