import { createRequire } from "node:module";
import fs from "node:fs";
import nodePath from "node:path";
import http from "node:http";
import https from "node:https";
import {
  dataForSeoAuthConfigError,
  handleDataForSeoLlmResponsesLive,
  isLlmResponsesLiveRequest,
  resolveDataForSeoAuthFromRequest,
} from "./dataforseo-llm-responses-direct.mjs";
import {
  handleOpenRouterModelsCatalog,
  isOpenRouterModelsCatalogRequest,
} from "./openrouter-models-direct.mjs";
import {
  handleOpenRouterChatCompletion,
  isOpenRouterChatCompletionRequest,
} from "./openrouter-chat-direct.mjs";

const require = createRequire(import.meta.url);
const { resolveDevApiTarget, isLocalWpProxyTarget } = require("./resolve-dev-api-target.cjs");

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function upstreamRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        method: options.method,
        headers: options.headers,
        rejectUnauthorized: parsed.protocol === "https:" ? false : undefined,
      },
      (res) => {
        // SSE must reach the browser as it arrives; everything else is buffered for the redirect handling below.
        if (String(res.headers["content-type"] ?? "").startsWith("text/event-stream")) {
          resolve({ status: res.statusCode ?? 502, headers: res.headers, body: undefined, stream: res });
          return;
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 502,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on("error", reject);
    if (body?.length) req.write(body);
    req.end();
  });
}

function isTransientProxyTransportError(message) {
  const m = String(message ?? "").toLowerCase();
  return (
    m.includes("unexpected eof") ||
    m.includes("econnreset") ||
    m.includes("socket hang up") ||
    m.includes("curl error 56") ||
    m.includes("ssl_read")
  );
}

const LOCAL_CLIENT_LOGO_DIR = nodePath.join(process.cwd(), ".local-neo-pulse-data", "client-logos");
const CLIENT_LOGO_MAX_BYTES = 3 * 1024 * 1024;

function ensureLocalClientLogoDir() {
  fs.mkdirSync(LOCAL_CLIENT_LOGO_DIR, { recursive: true });
}

function safeClientLogoSiteId(siteId) {
  return String(siteId ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
}

function clientLogoMimeToExt(mime) {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    default:
      return null;
  }
}

function clientLogoFileForSite(siteId) {
  const safe = safeClientLogoSiteId(siteId);
  if (!safe) return null;
  for (const ext of ["png", "jpg", "jpeg", "webp", "gif", "svg"]) {
    const file = nodePath.join(LOCAL_CLIENT_LOGO_DIR, `${safe}.${ext}`);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function parseClientLogoDataUrl(dataUrl) {
  const match = String(dataUrl ?? "").trim().match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const ext = clientLogoMimeToExt(mime);
  if (!ext) return null;
  const raw = Buffer.from(match[2], "base64");
  if (!raw.length || raw.length > CLIENT_LOGO_MAX_BYTES) return null;
  return { mime, ext, raw };
}

async function handleLocalClientLogoUpload(req, res) {
  try {
    const bodyBuf = await readRequestBody(req);
    const payload = bodyBuf?.length ? JSON.parse(bodyBuf.toString("utf8")) : {};
    const siteId = safeClientLogoSiteId(payload.siteId);
    const parsed = parseClientLogoDataUrl(payload.dataUrl);
    if (!siteId) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, error: "siteId is required" }));
      return;
    }
    if (!parsed) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, error: "dataUrl must be a base64 image (max 3 MB)" }));
      return;
    }
    ensureLocalClientLogoDir();
    for (const ext of ["png", "jpg", "jpeg", "webp", "gif", "svg"]) {
      const old = nodePath.join(LOCAL_CLIENT_LOGO_DIR, `${siteId}.${ext}`);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }
    const out = nodePath.join(LOCAL_CLIENT_LOGO_DIR, `${siteId}.${parsed.ext}`);
    fs.writeFileSync(out, parsed.raw);
    const host = req.headers.host ?? "127.0.0.1:8080";
    const logoUrl = `http://${host}/api/manager-wordpress-properties/client-logo/${encodeURIComponent(siteId)}`;
    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.end(JSON.stringify({ ok: true, logoUrl }));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Upload failed" }));
  }
}

function handleLocalClientLogoGet(siteIdRaw, res) {
  const siteId = safeClientLogoSiteId(decodeURIComponent(siteIdRaw));
  const file = clientLogoFileForSite(siteId);
  if (!file) {
    res.statusCode = 404;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Logo not found" }));
    return;
  }
  const ext = nodePath.extname(file).slice(1).toLowerCase();
  const mime =
    ext === "png"
      ? "image/png"
      : ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "webp"
          ? "image/webp"
          : ext === "gif"
            ? "image/gif"
            : ext === "svg"
              ? "image/svg+xml"
              : "application/octet-stream";
  res.statusCode = 200;
  res.setHeader("content-type", mime);
  res.setHeader("cache-control", "public, max-age=3600");
  res.end(fs.readFileSync(file));
}

async function fetchUpstream(url, options, body, targetOrigin, redirectsLeft = 5) {
  let response;
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      response = await upstreamRequest(url, options, body);
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      if (attempt >= 2 || !isTransientProxyTransportError(error instanceof Error ? error.message : error)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  if (!response) {
    throw lastError ?? new Error("Local API proxy failed");
  }
  const status = response.status;
  if (redirectsLeft <= 0 || status < 300 || status >= 400) {
    return response;
  }

  const locationRaw = response.headers.location;
  if (!locationRaw) {
    return response;
  }

  const nextUrl = new URL(Array.isArray(locationRaw) ? locationRaw[0] : locationRaw, url);
  const targetHost = new URL(targetOrigin).host;
  if (nextUrl.host !== targetHost) {
    return response;
  }

  const nextOrigin = `${nextUrl.protocol}//${nextUrl.host}`;
  const nextHeaders = { ...options.headers, host: nextUrl.host };
  return fetchUpstream(
    nextUrl.href,
    { ...options, method: "GET", headers: nextHeaders },
    undefined,
    nextOrigin,
    redirectsLeft - 1,
  );
}

/**
 * Proxy /api to local WP without exposing cross-origin redirects to the browser.
 */
export function localWpApiProxyPlugin() {
  return {
    name: "local-wp-api-proxy",
    enforce: "pre",
    configureServer(server) {
      const target = resolveDevApiTarget();
      if (!isLocalWpProxyTarget(target)) return;

      const targetOrigin = new URL(target).origin;

      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? "";
        const path = rawUrl.split("?")[0] ?? "";

        if (isOpenRouterModelsCatalogRequest(req.method ?? "GET", path)) {
          try {
            const result = await handleOpenRouterModelsCatalog(req);
            res.statusCode = result.status;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.setHeader("cache-control", "no-store");
            res.end(JSON.stringify(result.json));
          } catch (error) {
            res.statusCode = 502;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.end(
              JSON.stringify({
                ok: false,
                error: error instanceof Error ? error.message : "OpenRouter models request failed",
              }),
            );
          }
          return;
        }

        if (isOpenRouterChatCompletionRequest(req.method ?? "POST", path)) {
          try {
            const body =
              req.method && !["GET", "HEAD"].includes(req.method) ? await readRequestBody(req) : undefined;
            const result = await handleOpenRouterChatCompletion(req, body);
            res.statusCode = result.status;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.setHeader("cache-control", "no-store");
            res.end(JSON.stringify(result.json));
          } catch (error) {
            res.statusCode = 502;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.end(
              JSON.stringify({
                ok: false,
                error: error instanceof Error ? error.message : "OpenRouter chat completion failed",
              }),
            );
          }
          return;
        }

        if (isLlmResponsesLiveRequest(req.method, path)) {
          try {
            const body =
              req.method && !["GET", "HEAD"].includes(req.method) ? await readRequestBody(req) : undefined;
            const bodyJson = body?.length ? JSON.parse(body.toString("utf8")) : {};
            const auth = resolveDataForSeoAuthFromRequest(req, bodyJson);
            if (!auth) {
              const err = dataForSeoAuthConfigError(req, bodyJson);
              res.statusCode = 401;
              res.setHeader("content-type", "application/json; charset=utf-8");
              res.end(JSON.stringify(err));
              return;
            }
            const result = await handleDataForSeoLlmResponsesLive(body, auth);
            res.statusCode = result.status;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.end(JSON.stringify(result.json));
          } catch (error) {
            res.statusCode = 502;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : "DataForSEO LLM request failed",
              }),
            );
          }
          return;
        }

        if (path === "/api/overview/studio-snapshot" || path === "/api/overview/studio-snapshot/") {
          const snapDir = nodePath.join(process.cwd(), ".cache", "overview-studio-snapshots");
          fs.mkdirSync(snapDir, { recursive: true });
          const method = (req.method ?? "GET").toUpperCase();
          if (method === "GET") {
            const qs = new URL(rawUrl, "http://localhost").searchParams;
            const siteId = String(qs.get("siteId") ?? "").replace(/[^a-zA-Z0-9._-]/g, "_");
            const source = ["pages", "posts", "sap"].includes(String(qs.get("source")))
              ? String(qs.get("source"))
              : "pages";
            const file = nodePath.join(snapDir, `${siteId}__${source}.json`);
            let snapshot = null;
            if (siteId && fs.existsSync(file)) {
              try {
                snapshot = JSON.parse(fs.readFileSync(file, "utf8"));
              } catch {
                snapshot = null;
              }
            }
            res.statusCode = 200;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ ok: true, snapshot }));
            return;
          }
          if (method === "POST") {
            try {
              const bodyBuf = await readRequestBody(req);
              const payload = bodyBuf?.length ? JSON.parse(bodyBuf.toString("utf8")) : {};
              const siteId = String(payload.siteId ?? "").replace(/[^a-zA-Z0-9._-]/g, "_");
              const source = ["pages", "posts", "sap"].includes(String(payload.source))
                ? String(payload.source)
                : "pages";
              if (siteId && Array.isArray(payload.rows) && payload.rows.length > 0) {
                const file = nodePath.join(snapDir, `${siteId}__${source}.json`);
                fs.writeFileSync(
                  file,
                  JSON.stringify({
                    siteId: payload.siteId,
                    source,
                    activeUrl: payload.activeUrl ?? null,
                    rows: payload.rows,
                    updatedAt: new Date().toISOString(),
                  }),
                  "utf8",
                );
              }
              res.statusCode = 200;
              res.setHeader("content-type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ ok: true }));
            } catch (err) {
              res.statusCode = 400;
              res.setHeader("content-type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ ok: false, error: String(err) }));
            }
            return;
          }
        }

        if (!path.startsWith("/api")) {
          next();
          return;
        }

        const apiPath = path.replace(/\/+$/, "") || path;
        const method = (req.method ?? "GET").toUpperCase();

        if (apiPath === "/api/manager-wordpress-properties/client-logo/upload" && method === "POST") {
          await handleLocalClientLogoUpload(req, res);
          return;
        }

        const clientLogoGet = apiPath.match(/^\/api\/manager-wordpress-properties\/client-logo\/([^/]+)$/);
        if (clientLogoGet && method === "GET") {
          handleLocalClientLogoGet(clientLogoGet[1], res);
          return;
        }

        try {
          const body =
            req.method && !["GET", "HEAD"].includes(req.method) ? await readRequestBody(req) : undefined;

          const headers = {};
          for (const [key, value] of Object.entries(req.headers)) {
            if (value == null || key === "host" || key === "connection") continue;
            headers[key] = Array.isArray(value) ? value.join(", ") : value;
          }
          headers.host = new URL(targetOrigin).host;

          const upstream = await fetchUpstream(
            `${targetOrigin}${rawUrl}`,
            { method: req.method, headers },
            body?.length ? body : undefined,
            targetOrigin,
          );

          if (path.startsWith("/api/mcp/") && (upstream.status === 422 || upstream.status === 400)) {
            res.statusCode = 200;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.setHeader("cache-control", "no-store");
            res.end(
              JSON.stringify({
                skipped: true,
                reason: "dfs_unsupported_or_empty",
                tasks: [],
              }),
            );
            return;
          }

          if (path.includes("proxy/fetch-text") && (upstream.status === 413 || upstream.status === 502)) {
            res.statusCode = 200;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.setHeader("cache-control", "no-store");
            res.end(
              JSON.stringify({
                ok: false,
                content: "",
                error: upstream.status === 413 ? "Payload truncated" : "Upstream fetch error",
              }),
            );
            return;
          }

          if (upstream.status === 504) {
            res.statusCode = 200;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.setHeader("cache-control", "no-store");
            res.end(
              JSON.stringify({
                ok: false,
                success: false,
                error: "WordPress timed out",
                workflows: [],
                runs: [],
                tasks: [],
                rows: [],
              }),
            );
            return;
          }

          if (upstream.status >= 300 && upstream.status < 400) {
            const locationRaw = upstream.headers.location;
            const locationHref = locationRaw
              ? new URL(Array.isArray(locationRaw) ? locationRaw[0] : locationRaw, targetOrigin).href
              : "";
            const locationHost = locationHref ? new URL(locationHref).host : "";
            const targetHost = new URL(targetOrigin).host;
            if (locationHref && locationHost !== targetHost) {
              res.statusCode = upstream.status;
              res.setHeader("cache-control", "no-store");
              res.setHeader("location", locationHref);
              res.end();
              return;
            }
            res.statusCode = 502;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.end(
              JSON.stringify({
                ok: false,
                error: "Local API proxy blocked an upstream redirect. Retry with a trailing slash on the API path.",
              }),
            );
            return;
          }

          res.statusCode = upstream.status;
          res.setHeader("cache-control", "no-store");

          for (const [key, value] of Object.entries(upstream.headers)) {
            if (value == null) continue;
            const lower = key.toLowerCase();
            if (lower === "transfer-encoding" || lower === "connection") continue;
            if (lower === "location") continue;
            if (lower === "set-cookie") {
              const cookies = Array.isArray(value) ? value : [value];
              for (const cookie of cookies) {
                res.appendHeader(
                  key,
                  cookie.replace(/;\s*Domain=[^;]+/gi, "; Domain=localhost").replace(/;\s*Secure/gi, ""),
                );
              }
              continue;
            }
            res.setHeader(key, value);
          }

          if (upstream.stream) {
            res.flushHeaders();
            upstream.stream.pipe(res);
            return;
          }
          res.end(upstream.body);
        } catch (error) {
          // Graceful fallbacks when local WordPress container is not running (ECONNREFUSED / offline)
          if (path.startsWith("/api/agent-runs")) {
            res.statusCode = 200;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.setHeader("cache-control", "no-store");
            res.end(JSON.stringify({ ok: true, runs: [] }));
            return;
          }
          if (path.includes("/tasks/calendar-automations")) {
            res.statusCode = 200;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.setHeader("cache-control", "no-store");
            res.end(JSON.stringify({ ok: true, automations: [] }));
            return;
          }
          if (path.includes("/tasks/pulse-assigned") || path.includes("/tasks/trigger-pending") || path.includes("/tasks/my")) {
            res.statusCode = 200;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.setHeader("cache-control", "no-store");
            res.end(JSON.stringify({ ok: true, tasks: [] }));
            return;
          }
          if (path.includes("/workflows/trigger-pending")) {
            res.statusCode = 200;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.setHeader("cache-control", "no-store");
            res.end(JSON.stringify({ ok: true, workflows: [] }));
            return;
          }
          if (path.includes("/chat/mentions/unread-count")) {
            res.statusCode = 200;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.setHeader("cache-control", "no-store");
            res.end(JSON.stringify({ ok: true, count: 0 }));
            return;
          }
          if (path.includes("/chat/channels") || path.includes("/chat/mentions")) {
            res.statusCode = 200;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.setHeader("cache-control", "no-store");
            res.end(JSON.stringify({ ok: true, channels: [], mentions: [] }));
            return;
          }
          if (path.includes("/members") || path.includes("/job-titles") || path.includes("/invites")) {
            res.statusCode = 200;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.setHeader("cache-control", "no-store");
            res.end(JSON.stringify({ ok: true, members: [], jobTitles: [], invites: [] }));
            return;
          }
          if (path.includes("/tasks/projects") || path.includes("/tasks/tags") || path.includes("/tasks/templates")) {
            res.statusCode = 200;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.setHeader("cache-control", "no-store");
            res.end(JSON.stringify({ ok: true, projects: [], tags: [], templates: [] }));
            return;
          }
          if (path.startsWith("/api/teams")) {
            res.statusCode = 200;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.setHeader("cache-control", "no-store");
            res.end(
              JSON.stringify({
                ok: true,
                teams: [
                  {
                    id: 1,
                    name: "Default Team",
                    slug: "default-team",
                    accessRole: "owner",
                    jobTitle: "Administrator",
                    permissions: {},
                    seatLimit: 10,
                    seatsUsed: 1,
                    createdAt: new Date().toISOString(),
                  },
                ],
              }),
            );
            return;
          }
          if (path.startsWith("/api/auth/me")) {
            res.statusCode = 200;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.setHeader("cache-control", "no-store");
            res.end(JSON.stringify({ ok: true, user: { id: 1, name: "Local Dev", email: "dev@neopulse.local", role: "administrator" } }));
            return;
          }
          if (path.startsWith("/api/auth/login")) {
            res.statusCode = 200;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.setHeader("cache-control", "no-store");
            res.end(JSON.stringify({ ok: true, token: "local-dev-token", user: { id: 1, name: "Local Dev" } }));
            return;
          }
          if (path.includes("/manager-wordpress-properties/load")) {
            res.statusCode = 200;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.setHeader("cache-control", "no-store");
            const seedFile = nodePath.join(process.cwd(), "src", "components", "integrations", "default-properties-seed.json");
            if (fs.existsSync(seedFile)) {
              res.end(fs.readFileSync(seedFile, "utf8"));
            } else {
              res.end(JSON.stringify({ ok: true, sites: [] }));
            }
            return;
          }
          if (path.includes("/manager-wordpress-properties/sync-openrouter")) {
            res.statusCode = 200;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.setHeader("cache-control", "no-store");
            res.end(JSON.stringify({ ok: true, updated: 1 }));
            return;
          }
          if (path.includes("/gsc/service-account-email")) {
            res.statusCode = 200;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.setHeader("cache-control", "no-store");
            res.end(JSON.stringify({ ok: true, email: "pulse-gsc@neopulse.iam.gserviceaccount.com" }));
            return;
          }
          if (path.includes("/wordpress/get-quarter-editorial-counts")) {
            res.statusCode = 200;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.setHeader("cache-control", "no-store");
            res.end(
              JSON.stringify({
                ok: true,
                postsPublished: 0,
                postsScheduled: 0,
                entityPublished: 0,
                entityScheduled: 0,
                entityConfigured: true,
                entityCountsAvailable: true,
                published: 0,
                scheduled: 0,
              }),
            );
            return;
          }

          res.statusCode = 502;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(
            JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : "Local API proxy failed",
            }),
          );
        }
      });
    },
  };
}
