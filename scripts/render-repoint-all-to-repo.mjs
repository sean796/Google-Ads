#!/usr/bin/env node
/**
 * Point all NEO Pulse Render services at a Git repo (repo + branch only).
 * Usage: NEO_PULSE_RENDER_REPO=https://github.com/.../NeoPulseAppSandbox node scripts/render-repoint-all-to-repo.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const API = "https://api.render.com/v1";
const REPO = (process.env.NEO_PULSE_RENDER_REPO || "").trim();
const BRANCH = (process.env.NEO_PULSE_RENDER_BRANCH || "main").trim();

if (!REPO) {
  console.error("Set NEO_PULSE_RENDER_REPO to the target Git URL.");
  process.exit(1);
}

const SERVICE_NAMES = [
  "neo-pulse-static",
  "neo-pulse-worker",
  "pulse-host-api",
  "pulse-host-wp-hub",
  "pulse-host-db-hub",
];

function loadApiKey() {
  const fromEnv = (process.env.RENDER_API_KEY || "").trim();
  if (fromEnv) return fromEnv;
  for (const filePath of [
    path.join(REPO_ROOT, ".secrets", "render-api-key.txt"),
    path.join(os.homedir(), "Downloads", "RENDER API KEY.txt"),
    path.join(os.homedir(), ".render", "api-key.txt"),
  ]) {
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, "utf8").trim();
  }
  throw new Error("Set RENDER_API_KEY or place key in .secrets/render-api-key.txt");
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
  if (!res.ok) throw new Error(`${method} ${route} failed (${res.status}): ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const data = await api("GET", "/services?limit=100");
  const services = (Array.isArray(data) ? data : []).map((row) => row.service ?? row).filter(Boolean);

  for (const name of SERVICE_NAMES) {
    const svc = services.find((s) => s.name === name);
    if (!svc?.id) throw new Error(`Service not found: ${name}`);
    const before = svc.repo;
    await api("PATCH", `/services/${svc.id}`, { repo: REPO, branch: BRANCH });
    console.log(`[repo] ${name}: ${before} -> ${REPO} (${BRANCH})`);
  }

  const apiSvc = services.find((s) => s.name === "pulse-host-api");
  if (apiSvc?.id) {
    const current = await api("GET", `/services/${apiSvc.id}/env-vars?limit=100`);
    const rows = (Array.isArray(current) ? current : []).map((row) => row.envVar ?? row);
    const merged = new Map(rows.map((v) => [v.key, String(v.value ?? "")]));
    merged.set("PULSE_HOST_RENDER_REPO", REPO);
    merged.set("PULSE_HOST_RENDER_BRANCH", BRANCH);
    await api(
      "PUT",
      `/services/${apiSvc.id}/env-vars`,
      [...merged.entries()].map(([key, value]) => ({ key, value })),
    );
    console.log(`[env] pulse-host-api: PULSE_HOST_RENDER_REPO=${REPO}`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
