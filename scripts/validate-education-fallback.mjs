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
assert.equal(jsonResponse.statusCode, 503);
assert.match(jsonBody.error, /ယာယီအသုံးမပြုနိုင်/u);
assert.equal(jsonBody.assessment, undefined);

const streamResponse = response();
await educationChatHandler(request({ ...basePayload, stream: true }, "fallback-stream"), streamResponse);
const streamBody = JSON.parse(await streamResponse.completed);
assert.equal(streamResponse.statusCode, 503);
assert.match(streamBody.error, /ယာယီအသုံးမပြုနိုင်/u);
assert.equal(streamBody.assessment, undefined);

console.log("Scam Coach no-key regression passed: unavailable response, no fabricated local assessment.");
