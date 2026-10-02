#!/usr/bin/env node
/**
 * Smoke: POST OpenAI-compatible chat to Ollama (optional Bearer auth).
 * Usage: OLLAMA_BASE_URL=http://127.0.0.1:11434 node scripts/verify-ollama-chat.mjs
 */
const base = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const auth = (process.env.OLLAMA_AUTH_TOKEN || "").trim();
const model = (process.env.OLLAMA_MODEL || "qwen3:8b").trim();

const headers = { "Content-Type": "application/json" };
if (auth) headers.Authorization = `Bearer ${auth}`;

const res = await fetch(`${base}/v1/chat/completions`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    model,
    messages: [{ role: "user", content: "Reply with exactly: ok" }],
    max_tokens: 16,
    stream: false,
  }),
});

const text = await res.text();
if (!res.ok) {
  console.error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  process.exit(1);
}

let json;
try {
  json = JSON.parse(text);
} catch {
  console.error("Response was not JSON:", text.slice(0, 400));
  process.exit(1);
}

const content = json?.choices?.[0]?.message?.content ?? "";
console.log(JSON.stringify({ ok: true, model, content: String(content).trim() }));
