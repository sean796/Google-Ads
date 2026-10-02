#!/usr/bin/env node
/**
 * NEO Pulse Render API gateway: local /api/openrouter/* (OpenRouter + Ollama), proxy other /api/* to FlowbieONE.
 */
import http from "node:http";
import https from "node:https";

const port = Number(process.env.PORT || 10000);
const upstream = (process.env.FLOWBIEONE_UPSTREAM || "https://flowbieone.onrender.com").replace(/\/+$/, "");
const ollamaBase = (process.env.OLLAMA_BASE_URL || "").replace(/\/+$/, "");
const ollamaAuth = (process.env.OLLAMA_AUTH_TOKEN || "").trim();
const openRouterKey = (process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY || "").trim();

const OR_MODELS = "https://openrouter.ai/api/v1/models";
const OR_CHAT = "https://openrouter.ai/api/v1/chat/completions";
const OR_HEADERS = {
  "Content-Type": "application/json",
  "HTTP-Referer": "https://neo-pulse-static.onrender.com/",
  "X-Title": "NEO Pulse Web App",
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function jsonResponse(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function isOllamaModelId(model) {
  const id = String(model || "").trim();
  return id !== "" && !id.includes("/");
}

function ollamaHeaders() {
  const h = { "Content-Type": "application/json" };
  if (ollamaAuth) h.Authorization = `Bearer ${ollamaAuth}`;
  return h;
}

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      u,
      { method: options.method || "GET", headers: options.headers || {} },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let data = null;
          try {
            data = text ? JSON.parse(text) : null;
          } catch {
            data = { raw: text };
          }
          resolve({ status: res.statusCode || 502, data, headers: res.headers });
        });
      },
    );
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function normalizeOrModel(row) {
  const id = String(row?.id || "").trim();
  if (!id) return null;
  const pricing = row?.pricing && typeof row.pricing === "object" ? row.pricing : {};
  const parse = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  return {
    id,
    name: String(row?.name || id).trim() || id,
    promptUsdPerToken: parse(pricing.prompt),
    completionUsdPerToken: parse(pricing.completion),
    imageUsdPerToken: parse(pricing.image),
    contextLength: row?.context_length > 0 ? Number(row.context_length) : null,
    textOutput: true,
    imageOutput: String(id).toLowerCase().includes("image") || String(id).toLowerCase().includes("flux"),
  };
}

async function fetchOllamaCatalogEntries() {
  if (!ollamaBase) return [];
  const { status, data } = await fetchJson(`${ollamaBase}/api/tags`, { headers: ollamaHeaders() });
  if (status < 200 || status >= 300 || !data?.models) return [];
  const out = [];
  for (const tag of data.models) {
    const id = String(tag?.name || "").trim();
    if (!id) continue;
    out.push({
      id,
      name: id,
      promptUsdPerToken: null,
      completionUsdPerToken: null,
      imageUsdPerToken: null,
      contextLength: null,
      textOutput: true,
      imageOutput: false,
      local: true,
    });
  }
  return out;
}

async function handleModelsCatalog(req, res) {
  const headerKey = String(req.headers["x-openrouter-api-key"] || "").trim();
  const apiKey = headerKey || openRouterKey;
  const headers = { ...OR_HEADERS };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const { status, data } = await fetchJson(OR_MODELS, { headers });
  if (status < 200 || status >= 300) {
    jsonResponse(res, 500, { ok: false, error: `OpenRouter models ${status}` });
    return;
  }

  const rows = Array.isArray(data?.data) ? data.data : [];
  const models = [];
  const ids = new Set();
  for (const row of rows) {
    const n = normalizeOrModel(row);
    if (n) {
      models.push(n);
      ids.add(n.id);
    }
  }

  for (const row of await fetchOllamaCatalogEntries()) {
    if (!ids.has(row.id)) {
      models.push(row);
      ids.add(row.id);
    }
  }

  models.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  jsonResponse(res, 200, { ok: true, models, cachedAt: new Date().toISOString() });
}

async function handleChatCompletion(req, res) {
  const raw = await readBody(req);
  let body;
  try {
    body = JSON.parse(raw.toString("utf8") || "{}");
  } catch {
    jsonResponse(res, 400, { ok: false, error: "Invalid JSON body" });
    return;
  }

  const model = String(body.model || "").trim();
  const useOllama = isOllamaModelId(model) && ollamaBase !== "";

  const messages =
    Array.isArray(body.messages) && body.messages.length
      ? body.messages
      : body.system && body.user !== undefined
        ? [
            { role: "system", content: String(body.system) },
            { role: "user", content: String(body.user) },
          ]
        : [];

  if (!messages.length) {
    jsonResponse(res, 400, { ok: false, error: "messages, or system and user, are required" });
    return;
  }

  const payload = {
    model,
    messages,
    temperature: body.temperature ?? 0.5,
    max_tokens: body.maxTokens ?? body.max_tokens ?? 8192,
    stream: Boolean(body.stream),
  };
  if (body.topP !== undefined) payload.top_p = body.topP;
  if (body.top_p !== undefined) payload.top_p = body.top_p;
  if (body.responseFormat) payload.response_format = body.responseFormat;
  if (body.response_format) payload.response_format = body.response_format;

  if (useOllama) {
    const url = `${ollamaBase}/v1/chat/completions`;
    if (payload.stream) {
      await pipeStream(url, ollamaHeaders(), JSON.stringify(payload), res);
      return;
    }
    const { status, data } = await fetchJson(url, {
      method: "POST",
      headers: ollamaHeaders(),
      body: JSON.stringify(payload),
    });
    if (status < 200 || status >= 300) {
      const msg = data?.error?.message || data?.message || "Ollama error";
      jsonResponse(res, 500, { ok: false, error: `Ollama ${status}: ${msg}` });
      return;
    }
    const message = data?.choices?.[0]?.message || {};
    const content = String(message.content || message.reasoning || "").trim();
    jsonResponse(res, 200, {
      ok: true,
      content,
      finishReason: data?.choices?.[0]?.finish_reason ?? null,
      nativeFinishReason: null,
      raw: data,
    });
    return;
  }

  const headerKey = String(req.headers["x-openrouter-api-key"] || body.apiKey || "").trim();
  const apiKey = headerKey || openRouterKey;
  if (!apiKey) {
    jsonResponse(res, 500, { ok: false, error: "OpenRouter API key is missing. Add it in Dashboard → API Keys." });
    return;
  }

  const headers = { ...OR_HEADERS, Authorization: `Bearer ${apiKey}` };
  if (payload.stream) {
    await pipeStream(OR_CHAT, headers, JSON.stringify(payload), res, true);
    return;
  }

  const { status, data } = await fetchJson(OR_CHAT, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (status < 200 || status >= 300) {
    const msg = data?.error?.message || data?.message || "OpenRouter error";
    jsonResponse(res, 500, { ok: false, error: `OpenRouter ${status}: ${msg}` });
    return;
  }
  const message = data?.choices?.[0]?.message || {};
  const content = String(message.content || message.reasoning || "").trim();
  jsonResponse(res, 200, {
    ok: true,
    content,
    finishReason: data?.choices?.[0]?.finish_reason ?? null,
    nativeFinishReason: data?.choices?.[0]?.native_finish_reason ?? null,
    raw: data,
  });
}

function pipeStream(url, headers, body, res, sse = false) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      u,
      { method: "POST", headers, },
      (upstreamRes) => {
        if (sse) {
          res.writeHead(upstreamRes.statusCode || 200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
          });
        } else {
          res.writeHead(upstreamRes.statusCode || 200, upstreamRes.headers);
        }
        upstreamRes.pipe(res);
        upstreamRes.on("end", resolve);
      },
    );
    req.on("error", (err) => {
      if (!res.headersSent) jsonResponse(res, 502, { ok: false, error: err.message });
      reject(err);
    });
    req.write(body);
    req.end();
  });
}

function proxyToFlowbie(req, res) {
  const target = `${upstream}${req.url || "/"}`;
  const u = new URL(target);
  const lib = u.protocol === "https:" ? https : http;
  const headers = { ...req.headers, host: u.host };
  const proxyReq = lib.request(
    u,
    { method: req.method, headers },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on("error", (err) => {
    if (!res.headersSent) jsonResponse(res, 502, { ok: false, error: err.message });
  });
  req.pipe(proxyReq);
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-OpenRouter-Api-Key");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const pathname = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;

  if (pathname === "/api/openrouter/models" && req.method === "GET") {
    await handleModelsCatalog(req, res);
    return;
  }
  if (pathname === "/api/openrouter/chat-completion" && req.method === "POST") {
    await handleChatCompletion(req, res);
    return;
  }
  if (pathname === "/api/mcp/health" && req.method === "GET") {
    jsonResponse(res, 200, {
      status: "ok",
      message: "NEO Pulse Render API gateway",
      openrouter: true,
      ollamaBase: ollamaBase ? true : false,
      upstream,
    });
    return;
  }

  proxyToFlowbie(req, res);
});

server.listen(port, () => {
  console.log(`[neo-pulse-render-api-gateway] :${port} upstream=${upstream} ollama=${ollamaBase || "off"}`);
});
