import { createRequire } from "node:module";
import fs from "node:fs";
import nodePath from "node:path";
import http from "node:http";
import https from "node:https";
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

          if (path.includes("/video/") && upstream.status === 413) {
            res.statusCode = 413;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.setHeader("cache-control", "no-store");
            res.end(
              JSON.stringify({
                ok: false,
                error: "Uploaded video file exceeds the server maximum body limit (413 Payload Too Large).",
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
