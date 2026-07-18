import assert from "node:assert/strict";
import { Readable } from "node:stream";
import educationChatHandler from "../api/education-chat.js";

delete process.env.OPENROUTER_API_KEY;

function request(payload, ip) {
  const body = JSON.stringify(payload);
  const req = Readable.from([body]);
  req.method = "POST";
  req.headers = { "content-type": "application/json", "x-forwarded-for": ip };
  req.socket = { remoteAddress: ip };
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

const evidence = "သင့်ဘဏ်အကောင့်ပိတ်မည်။ OTP ကုဒ်ကို ချက်ချင်းပြန်ပို့ပါ။";
const basePayload = {
  question: "ဒီစာက လိမ်လည်မှု ဖြစ်နိုင်ပါသလား။",
  evidence_text: evidence,
  scan_type: "message",
  language: "my"
};

const jsonResponse = response();
await educationChatHandler(request({ ...basePayload, stream: false }, "fallback-json"), jsonResponse);
const jsonBody = JSON.parse(await jsonResponse.completed);
assert.equal(jsonResponse.statusCode, 200);
assert.equal(jsonBody.model, "safemind-hybrid-nlp");
assert.match(jsonBody.answer, /အန္တရာယ်အဆင့်/u);
assert.match(jsonBody.answer, /အကြောင်းရင်း/u);
assert.match(jsonBody.answer, /သင်လုပ်သင့်သည်/u);
assert.doesNotMatch(jsonBody.answer, /temporarily unavailable/i);

const streamResponse = response();
await educationChatHandler(request({ ...basePayload, stream: true }, "fallback-stream"), streamResponse);
const events = (await streamResponse.completed).trim().split("\n").map((line) => JSON.parse(line));
const done = events.find((event) => event.type === "done");
assert.equal(streamResponse.statusCode, 200);
assert(done?.response_complete);
assert.equal(done.model, "safemind-hybrid-nlp");
assert.match(done.answer, /အကြောင်းရင်း/u);
assert.doesNotMatch(done.answer, /temporarily unavailable/i);

console.log("Burmese Scam Coach local fallback passed for JSON and streaming responses.");
