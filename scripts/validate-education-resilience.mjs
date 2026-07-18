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

  process.env.OPENROUTER_MODEL = "test/leaky-primary";
  process.env.OPENROUTER_FALLBACK_MODEL = "test/leaky-fallback";
  let capturedBody = null;
  globalThis.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return new Response(JSON.stringify({
      model: "test/leaky-primary",
      choices: [{
        finish_reason: "length",
        message: {
          content: "Risk Level\nHIGH · 94%\n\nReason\nThe message uses a wrong-number opener and asks for personal details, such as We need to continue exactly where we stopped. The previous answer was cut off and we must finish the remaining sections."
        }
      }]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const leakRes = response();
  await educationChatHandler(request({
    question: "Why is the wrong-number message risky?",
    scan_type: "message",
    language: "en",
    stream: true,
    history: [{ role: "user", content: "Please check this message." }],
    memory: {
      evidence_retained: true,
      last_assessment: {
        risk: "HIGH",
        confidence: 94,
        category: "Wrong-number scam",
        reason: "The message uses a wrong-number opener and asks for personal details.",
        indicators: ["Unsolicited contact", "Requests personal information"],
        recommended_actions: ["Do not reply.", "Do not share personal details.", "Block and report the sender."]
      }
    }
  }), leakRes);
  const leakEvents = (await leakRes.completed).trim().split(/\r?\n/).map((line) => JSON.parse(line));
  const leakDone = leakEvents.find((event) => event.type === "done");
  assert(leakDone, "A sanitized completed response is required.");
  assert.doesNotMatch(leakDone.answer, /we need to continue|previous answer|remaining sections/iu);
  assert.equal((leakDone.answer.match(/Risk Level/g) || []).length, 1);
  assert.equal((leakDone.answer.match(/\nReason\n/g) || []).length, 1);
  assert.equal((leakDone.answer.match(/What You Should Do/g) || []).length, 1);
  assert.match(leakDone.answer, /HIGH · 94%/);
  assert.doesNotMatch(leakDone.answer, /Risk Level\n\n/);
  assert.equal((leakDone.answer.match(/^• /gm) || []).length, 3);
  assert.equal(capturedBody.max_tokens, 240);
  assert.equal(capturedBody.reasoning.enabled, false);
  console.log("EduAI output guard passed: leaked continuation text is replaced with a short three-section answer.");
} finally {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.OPENROUTER_MODEL;
  else process.env.OPENROUTER_MODEL = originalModel;
  if (originalFallback === undefined) delete process.env.OPENROUTER_FALLBACK_MODEL;
  else process.env.OPENROUTER_FALLBACK_MODEL = originalFallback;
}
