import https from "node:https";
import { normalizeOpenRouterModelsPayload } from "./openrouter-models-catalog-normalize.mjs";

const MODELS_URL = "https://openrouter.ai/api/v1/models";
const VIDEO_MODELS_URL = "https://openrouter.ai/api/v1/models?output_modalities=video";
const CACHE_TTL_MS = 23 * 60 * 60 * 1000;

/** @type {{ models: unknown[]; cachedAt: string; expiresAt: number } | null} */
let memoryCache = null;

function loadEnvOpenRouterKey() {
  const key = String(process.env.OPENROUTER_API_KEY ?? process.env.VITE_OPENROUTER_API_KEY ?? "").trim();
  return key || null;
}

function headerOpenRouterKey(req) {
  const raw = req.headers["x-openrouter-api-key"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const key = String(value ?? "").trim();
  return key || null;
}

function fetchOpenRouterUrl(url, apiKey) {
  return new Promise((resolve, reject) => {
    /** @type {Record<string, string>} */
    const headers = {
      "HTTP-Referer": "https://neodigital.ca/neo-pulse/",
      "X-Title": "NEO Pulse Web App",
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    https
      .get(url, { headers }, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 502, json: JSON.parse(body) });
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

export function isOpenRouterModelsCatalogRequest(method, path) {
  const p = path.split("?")[0] ?? "";
  return method === "GET" && (p === "/api/openrouter/models" || p === "/api/openrouter/models/");
}

/**
 * @param {import("node:http").IncomingMessage} req
 */
export async function handleOpenRouterModelsCatalog(req) {
  const apiKey = headerOpenRouterKey(req) ?? loadEnvOpenRouterKey();
  if (memoryCache && memoryCache.expiresAt > Date.now() && memoryCache.models.length > 0) {
    return {
      status: 200,
      json: { ok: true, models: memoryCache.models, cachedAt: memoryCache.cachedAt },
    };
  }

  try {
    const [upstreamText, upstreamVideo] = await Promise.all([
      fetchOpenRouterUrl(MODELS_URL, apiKey),
      fetchOpenRouterUrl(VIDEO_MODELS_URL, apiKey).catch(() => ({ status: 200, json: { data: [] } })),
    ]);

    if (upstreamText.status < 200 || upstreamText.status >= 300) {
      return {
        status: 502,
        json: {
          ok: false,
          error: `OpenRouter models HTTP ${upstreamText.status}`,
        },
      };
    }

    const textModels = normalizeOpenRouterModelsPayload(upstreamText.json);
    const videoModels = upstreamVideo?.json ? normalizeOpenRouterModelsPayload(upstreamVideo.json) : [];

    // Merge models, prioritizing video models so their videoOutput=true is preserved
    const seenIds = new Set();
    const models = [];
    for (const m of [...videoModels, ...textModels]) {
      if (!seenIds.has(m.id)) {
        seenIds.add(m.id);
        models.push(m);
      }
    }

    const cachedAt = new Date().toISOString();
    if (models.length > 0) {
      memoryCache = { models, cachedAt, expiresAt: Date.now() + CACHE_TTL_MS };
    }

    return {
      status: 200,
      json: {
        ok: true,
        models,
        cachedAt,
      },
    };
  } catch (err) {
    return {
      status: 502,
      json: {
        ok: false,
        error: String(err?.message || err),
      },
    };
  }
}
