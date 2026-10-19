#!/usr/bin/env node
/**
 * Push public client-report share to Render: point static + hub at neo-pulse repo and deploy.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const API = "https://api.render.com/v1";
const REPO = "https://github.com/neodigitalca/neo-pulse";
const BRANCH = "main";
const WORKSPACE_ID = "tea-d6135s14tr6s73b0v1s0";
const STATIC_ID = "srv-db01a9jtqb8s73e54iug";
const HUB_ID = "srv-db7a270473hc73cj7v80";

function loadApiKey() {
  const fromEnv = (process.env.RENDER_API_KEY || "").trim();
  if (fromEnv) return fromEnv;
  const filePath = path.join(REPO_ROOT, ".secrets", "render-api-key.txt");
  if (fs.existsSync(filePath)) return fs.readFileSync(filePath, "utf8").trim();
  throw new Error("Missing RENDER_API_KEY or .secrets/render-api-key.txt");
}

async function api(method, route, body) {
  const res = await fetch(`${API}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${loadApiKey()}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${route} (${res.status}): ${text.slice(0, 800)}`);
  return text ? JSON.parse(text) : null;
}

async function patchRepo(serviceId, name) {
  await api("PATCH", `/services/${serviceId}`, {
    repo: REPO,
    branch: BRANCH,
  });
  console.log(`[repo] ${name} -> ${REPO}@${BRANCH}`);
}

async function triggerDeploy(serviceId, name) {
  const deploy = await api("POST", `/services/${serviceId}/deploys`, { clearCache: "clear" });
  const id = deploy?.id || deploy?.deploy?.id || "started";
  console.log(`[deploy] ${name}: ${id}`);
}

async function main() {
  await patchRepo(STATIC_ID, "neo-pulse-static");
  await patchRepo(HUB_ID, "pulse-host-wp-hub");
  await triggerDeploy(HUB_ID, "pulse-host-wp-hub");
  await triggerDeploy(STATIC_ID, "neo-pulse-static");
  console.log("\nDone. Hub + static redeploy started from neo-pulse main.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
