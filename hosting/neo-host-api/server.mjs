#!/usr/bin/env node
import http from "node:http";
import { runSchema, getPool } from "./db/pool.mjs";
import { readJsonBody, sendJson, getPathname } from "./lib/http.mjs";
import { assertServiceOrUserAuth } from "./lib/auth.mjs";
import { handleSitesRoute, bootstrapStagingSiteFromEnv } from "./routes/sites.mjs";
import { handleJobsRoute } from "./routes/jobs.mjs";
import { handleCronRoute } from "./routes/cron.mjs";
import { handleTagsRoute } from "./routes/tags.mjs";

const port = Number(process.env.PORT || 10020);

async function dispatch(req, res) {
  const pathname = getPathname(req);
  const method = (req.method || "GET").toUpperCase();

  if (pathname === "/health" || pathname === "/") {
    sendJson(res, 200, { ok: true, service: "pulse-host-api" });
    return;
  }

  if (pathname.startsWith("/internal/cron/")) {
    const sub = pathname.slice("/internal/cron/".length);
    await handleCronRoute(req, res, sub, method);
    return;
  }

  const hostingPrefix = "/v1/hosting/";
  if (!pathname.startsWith(hostingPrefix)) {
    sendJson(res, 404, { ok: false, error: "Not found." });
    return;
  }

  const subpath = pathname.slice(hostingPrefix.length);
  const body = method === "GET" || method === "HEAD" ? {} : await readJsonBody(req);
  if (body.__parseError) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON body." });
    return;
  }

  const auth = assertServiceOrUserAuth(req);
  if (!auth.ok) {
    sendJson(res, auth.status || 401, { ok: false, error: auth.error });
    return;
  }

  if (subpath.startsWith("jobs/")) {
    await handleJobsRoute(req, res, subpath.slice("jobs/".length), method, body, auth);
    return;
  }

  if (subpath.startsWith("sites")) {
    const sitesSub = subpath.slice("sites".length).replace(/^\//, "");
    await handleSitesRoute(req, res, sitesSub, method, body, auth);
    return;
  }

  if (subpath.startsWith("tags")) {
    const tagsSub = subpath.slice("tags".length).replace(/^\//, "");
    await handleTagsRoute(req, res, tagsSub, method, body, auth);
    return;
  }

  sendJson(res, 404, { ok: false, error: "Not found." });
}

const server = http.createServer((req, res) => {
  // No CORS: the only caller is the server-side PHP hub proxy, never a browser.
  dispatch(req, res).catch((err) => {
    console.error("[pulse-host-api]", err);
    sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
  });
});

async function main() {
  await runSchema();
  await bootstrapStagingSiteFromEnv();
  server.listen(port, "0.0.0.0", () => {
    console.log(`[pulse-host-api] listening on 0.0.0.0:${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
