import { createRequire } from "node:module";
import http from "node:http";
import https from "node:https";
import { normalizeOpenRouterModelsPayload } from "./openrouter-models-catalog-normalize.mjs";

const require = createRequire(import.meta.url);
const { openRouterKey } = require("./load-root-openrouter-env.cjs");

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** @type {{ models: import("./openrouter-models-catalog-normalize.mjs").CatalogEntry[], cachedAt: string } | null} */
let cache = null;

/**
 * @param {string} apiKey
 */
function fetchOpenRouterModels(apiKey) {
  return new Promise((resolve, reject) => {
    /** @type {Record<string, string>} */
    const headers = {
      "Content-Type": "application/json",
      "HTTP-Referer": "https://neodigital.ca/neo-pulse/",
      "X-Title": "NEO Pulse Web App",
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const req = https.request(
      OPENROUTER_MODELS_URL,
      { method: "GET", headers },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          const code = res.statusCode ?? 502;
          if (code < 200 || code >= 300) {
            reject(new Error(`OpenRouter models ${code}: ${body.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error("OpenRouter models response was not JSON"));
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function isModelsCatalogPath(pathname) {
  return pathname === "/api/openrouter/models" || pathname === "/api/openrouter/models/";
}

function isChatCompletionPath(pathname) {
  return (
    pathname === "/api/openrouter/chat-completion" ||
    pathname === "/api/openrouter/chat-completion/"
  );
}

/** @param {string} model */
function isOllamaModelId(model) {
  const id = String(model || "").trim();
  return id !== "" && !id.includes("/");
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * @param {string} url
 * @param {{ method?: string, headers?: Record<string, string>, body?: string }} options
 */
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
          resolve({ status: res.statusCode || 502, data });
        });
      },
    );
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {Record<string, unknown>} body
 */
function jsonResponse(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

/**
 * Local Ollama chat (OpenAI-compatible). No OpenRouter key or WP hop.
 *
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {Buffer} raw
 */
async function handleLocalOllamaChat(req, res, raw) {
  const base = ollamaBaseUrl();
  if (!base) {
    jsonResponse(res, 500, { ok: false, error: "Ollama base URL is not configured." });
    return;
  }

  /** @type {Record<string, unknown>} */
  let body;
  try {
    body = JSON.parse(raw.toString("utf8") || "{}");
  } catch {
    jsonResponse(res, 400, { ok: false, error: "Invalid JSON body" });
    return;
  }

  const model = String(body.model || "").trim();
  if (!isOllamaModelId(model)) {
    jsonResponse(res, 400, { ok: false, error: "Not a local Ollama model id." });
    return;
  }

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
    jsonResponse(res, 400, {
      ok: false,
      error: "messages, or system and user, are required",
    });
    return;
  }

  /** @type {Record<string, unknown>} */
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

  const url = `${base}/v1/chat/completions`;
  const headers = { "Content-Type": "application/json" };
  const bodyJson = JSON.stringify(payload);

  if (payload.stream) {
    await new Promise((resolve, reject) => {
      const u = new URL(url);
      const lib = u.protocol === "https:" ? https : http;
      const upstream = lib.request(u, { method: "POST", headers }, (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode || 200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "X-Accel-Buffering": "no",
        });
        upstreamRes.pipe(res);
        upstreamRes.on("end", resolve);
      });
      upstream.on("error", (err) => {
        if (!res.headersSent) jsonResponse(res, 502, { ok: false, error: err.message });
        reject(err);
      });
      upstream.write(bodyJson);
      upstream.end();
    });
    return;
  }

  const { status, data } = await fetchJson(url, { method: "POST", headers, body: bodyJson });
  if (status < 200 || status >= 300) {
    const msg =
      (data && typeof data === "object" && data.error && typeof data.error === "object"
        ? data.error.message
        : null) ||
      (data && typeof data === "object" ? data.message : null) ||
      "Ollama error";
    jsonResponse(res, 500, { ok: false, error: `Ollama ${status}: ${String(msg)}` });
    return;
  }

  const message =
    data && typeof data === "object" && Array.isArray(data.choices)
      ? data.choices[0]?.message || {}
      : {};
  const content = String(message.content || message.reasoning || "").trim();
  jsonResponse(res, 200, {
    ok: true,
    content,
    finishReason:
      data && typeof data === "object" && Array.isArray(data.choices)
        ? (data.choices[0]?.finish_reason ?? null)
        : null,
    nativeFinishReason: null,
    raw: data,
  });
}

function ollamaBaseUrl() {
  return (
    process.env.OLLAMA_BASE_URL ||
    process.env.NEO_PULSE_OLLAMA_BASE_URL ||
    "http://127.0.0.1:11434"
  )
    .trim()
    .replace(/\/+$/, "");
}

/**
 * @returns {Promise<import("./openrouter-models-catalog-normalize.mjs").CatalogEntry[]>}
 */
function fetchOllamaCatalogEntries() {
  const base = ollamaBaseUrl();
  if (!base) return Promise.resolve([]);

  return new Promise((resolve) => {
    const url = new URL(`${base}/api/tags`);
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      { method: "GET", headers: { "Content-Type": "application/json" } },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const code = res.statusCode ?? 502;
          if (code < 200 || code >= 300) {
            resolve([]);
            return;
          }
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            const tags = Array.isArray(data?.models) ? data.models : [];
            /** @type {import("./openrouter-models-catalog-normalize.mjs").CatalogEntry[]} */
            const out = [];
            for (const tag of tags) {
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
            resolve(out);
          } catch {
            resolve([]);
          }
        });
      },
    );
    req.on("error", () => resolve([]));
    req.setTimeout(8000, () => {
      req.destroy();
      resolve([]);
    });
    req.end();
  });
}

/**
 * @param {import("./openrouter-models-catalog-normalize.mjs").CatalogEntry[]} models
 * @param {import("./openrouter-models-catalog-normalize.mjs").CatalogEntry[]} ollama
 */
function mergeOllamaModels(models, ollama) {
  if (!ollama.length) return models;
  const ids = new Set(models.map((m) => m.id));
  const merged = [...models];
  for (const row of ollama) {
    if (!ids.has(row.id)) {
      merged.push(row);
      ids.add(row.id);
    }
  }
  merged.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return merged;
}

/**
 * Local dev: OpenRouter models catalog + direct Ollama chat for local model ids.
 */
export function openrouterModelsCatalogDevPlugin() {
  return {
    name: "openrouter-models-catalog-dev",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url ?? "").split("?")[0] ?? "";

        if (req.method === "POST" && isChatCompletionPath(pathname)) {
          try {
            const raw = await readRequestBody(req);
            let model = "";
            try {
              model = String(JSON.parse(raw.toString("utf8") || "{}").model || "").trim();
            } catch {
              jsonResponse(res, 400, { ok: false, error: "Invalid JSON body" });
              return;
            }
            if (isOllamaModelId(model)) {
              await handleLocalOllamaChat(req, res, raw);
              return;
            }
            next();
            return;
          } catch (error) {
            jsonResponse(res, 500, {
              ok: false,
              error: error instanceof Error ? error.message : "Local Ollama chat failed",
            });
            return;
          }
        }

        if (req.method !== "GET" || !isModelsCatalogPath(pathname)) {
          next();
          return;
        }

        const headerKey = String(req.headers["x-openrouter-api-key"] ?? "").trim();
        const apiKey = headerKey || openRouterKey || "";

        try {
          const ollama = await fetchOllamaCatalogEntries();
          const now = Date.now();
          if (cache && now - Date.parse(cache.cachedAt) < CACHE_TTL_MS) {
            const models = mergeOllamaModels(cache.models, ollama);
            res.statusCode = 200;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.setHeader("cache-control", "no-store");
            res.end(JSON.stringify({ ok: true, models, cachedAt: cache.cachedAt }));
            return;
          }

          const raw = await fetchOpenRouterModels(apiKey);
          const models = mergeOllamaModels(normalizeOpenRouterModelsPayload(raw), ollama);
          const cachedAt = new Date().toISOString();
          cache = { models: models.filter((m) => !m.local), cachedAt };

          res.statusCode = 200;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.setHeader("cache-control", "no-store");
          res.end(JSON.stringify({ ok: true, models, cachedAt }));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.setHeader("cache-control", "no-store");
          res.end(
            JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : "OpenRouter models fetch failed",
            }),
          );
        }
      });
    },
  };
}
