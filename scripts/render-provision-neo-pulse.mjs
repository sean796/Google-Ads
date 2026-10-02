#!/usr/bin/env node
/**
 * Provision NEO Pulse on Render (Google-Ads repo): static UI + LD worker.
 * Requires RENDER_API_KEY env or Downloads/RENDER API KEY.txt
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const API = "https://api.render.com/v1";
const REPO =
  (process.env.NEO_PULSE_RENDER_REPO || "https://github.com/sean796/Google-Ads").trim();
const BRANCH = (process.env.NEO_PULSE_RENDER_BRANCH || "main").trim();
const FLOWBIEONE_UPSTREAM = "https://flowbieone.onrender.com";
const RENDER_API = "https://neo-pulse-api.onrender.com/api/mcp";

function loadApiKey() {
  const fromEnv = (process.env.RENDER_API_KEY || "").trim();
  if (fromEnv) return fromEnv;
  const candidates = [
    path.join(REPO_ROOT, ".secrets", "render-api-key.txt"),
    path.join(os.homedir(), "Downloads", "RENDER API KEY.txt"),
    path.join(os.homedir(), ".render", "api-key.txt"),
    path.join(os.homedir(), "Documents", "RENDER API KEY.txt"),
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, "utf8").trim();
  }
  throw new Error(
    "Set RENDER_API_KEY or place key in .secrets/render-api-key.txt or Downloads/RENDER API KEY.txt",
  );
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

async function listServices() {
  const data = await api("GET", "/services?limit=100");
  const rows = Array.isArray(data) ? data : data?.services ?? [];
  return rows.map((row) => row.service ?? row).filter(Boolean);
}

async function getOwnerId() {
  const data = await api("GET", "/owners?limit=20");
  const list = Array.isArray(data) ? data.map((row) => row.owner ?? row) : data?.owners ?? [];
  const preferred = list.find((o) => o.type === "team") ?? list[0];
  if (!preferred?.id) throw new Error("No Render owner found.");
  return preferred.id;
}

async function ensureStaticSite(ownerId) {
  const name = "neo-pulse-static";
  const existing = (await listServices()).find((s) => s.name === name);
  if (existing?.id) {
    console.log(`[skip] ${name} exists: ${existing.id}`);
    await api("PATCH", `/services/${existing.id}`, {
      repo: REPO,
      branch: BRANCH,
      serviceDetails: {
        buildCommand: "npm ci && npm run build:render-static",
        publishPath: "dist",
      },
    });
    return existing;
  }
  const created = await api("POST", "/services", {
    type: "static_site",
    name,
    ownerId,
    repo: REPO,
    branch: BRANCH,
    autoDeploy: "yes",
    serviceDetails: {
      buildCommand: "npm ci && npm run build:render-static",
      publishPath: "dist",
    },
  });
  const svc = created.service ?? created;
  console.log(`[created] ${name}:`, svc.id);
  return svc;
}

async function ensureNodeApiGateway(ownerId) {
  const name = "neo-pulse-api";
  const existing = (await listServices()).find((s) => s.name === name);
  if (existing?.id) {
    console.log(`[skip] ${name} exists: ${existing.id}`);
    await api("PATCH", `/services/${existing.id}`, { repo: REPO, branch: BRANCH });
    return existing;
  }
  const created = await api("POST", "/services", {
    type: "web_service",
    name,
    ownerId,
    repo: REPO,
    branch: BRANCH,
    autoDeploy: "yes",
    serviceDetails: {
      runtime: "node",
      plan: "starter",
      envSpecificDetails: {
        buildCommand: "npm ci",
        startCommand: "node scripts/neo-pulse-render-api-gateway.mjs",
      },
    },
  });
  const svc = created.service ?? created;
  console.log(`[created] ${name}:`, svc.id);
  return svc;
}

async function ensureOllama(ownerId) {
  const name = "neo-pulse-ollama";
  const existing = (await listServices()).find((s) => s.name === name);
  if (existing?.id) {
    console.log(`[skip] ${name} exists: ${existing.id}`);
    await api("PATCH", `/services/${existing.id}`, { repo: REPO, branch: BRANCH });
    return existing;
  }
  const created = await api("POST", "/services", {
    type: "web_service",
    name,
    ownerId,
    repo: REPO,
    branch: BRANCH,
    autoDeploy: "yes",
    serviceDetails: {
      runtime: "docker",
      plan: "standard",
      envSpecificDetails: {
        dockerfilePath: "./Dockerfile.ollama",
        dockerContext: ".",
      },
    },
  });
  const svc = created.service ?? created;
  console.log(`[created] ${name}:`, svc.id);
  return svc;
}

async function ensureWorker(ownerId) {
  const name = "neo-pulse-worker";
  const existing = (await listServices()).find((s) => s.name === name);
  if (existing?.id) {
    console.log(`[skip] ${name} exists: ${existing.id}`);
    await api("PATCH", `/services/${existing.id}`, { repo: REPO, branch: BRANCH });
    return existing;
  }
  const created = await api("POST", "/services", {
    type: "web_service",
    name,
    ownerId,
    repo: REPO,
    branch: BRANCH,
    autoDeploy: "yes",
    serviceDetails: {
      runtime: "docker",
      plan: "standard",
      envSpecificDetails: {
        dockerfilePath: "./Dockerfile.ld-worker",
        dockerContext: ".",
      },
    },
  });
  const svc = created.service ?? created;
  console.log(`[created] ${name}:`, svc.id);
  return svc;
}

async function putEnvVars(serviceId, vars) {
  const payload = vars
    .filter((item) => item.value?.trim())
    .map((item) => ({ key: item.key, value: String(item.value) }));
  if (!payload.length) return;
  await api("PUT", `/services/${serviceId}/env-vars`, payload);
  console.log(`[env] ${serviceId}:`, payload.map((p) => p.key).join(", "));
}

function readRepoEnv() {
  const readKey = (file, key) => {
    const filePath = path.join(REPO_ROOT, file);
    if (!fs.existsSync(filePath)) return "";
    const line = fs.readFileSync(filePath, "utf8").split(/\r?\n/).find((row) => row.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1).trim() : "";
  };
  return {
    openRouter: readKey(".env", "OPEN_ROUTER_API_KEY"),
    ldEmail: readKey(".env.localdominator", "LOCAL_DOMINATOR_EMAIL"),
    ldPassword: readKey(".env.localdominator", "LOCAL_DOMINATOR_PASSWORD"),
    ldLoginUrl: readKey(".env.localdominator", "LOCAL_DOMINATOR_LOGIN_URL") || "https://app.localdominator.co/login/",
    workerToken: process.env.LD_WORKER_AUTH_TOKEN || crypto.randomBytes(24).toString("hex"),
    ollamaToken: process.env.OLLAMA_AUTH_TOKEN || crypto.randomBytes(24).toString("hex"),
  };
}

async function resumeIfSuspended(serviceId, name) {
  try {
    await api("POST", `/services/${serviceId}/resume`, {});
    console.log(`[resume] ${name}`);
  } catch {
    /* not suspended */
  }
}

async function triggerDeploy(serviceId) {
  const deploy = await api("POST", `/services/${serviceId}/deploys`, { clearCache: "do_not_clear" });
  console.log(`[deploy] ${serviceId}:`, deploy?.id || deploy?.deploy?.id || "started");
}

async function main() {
  const ownerId = await getOwnerId();
  const secrets = readRepoEnv();
  const staticSite = await ensureStaticSite(ownerId);
  const worker = await ensureWorker(ownerId);
  const apiGateway = await ensureNodeApiGateway(ownerId);
  const ollama = await ensureOllama(ownerId);

  const ollamaUrl =
    ollama?.serviceDetails?.url?.trim() || "https://neo-pulse-ollama.onrender.com";

  if (staticSite?.id) {
    await resumeIfSuspended(staticSite.id, "neo-pulse-static");
    await putEnvVars(staticSite.id, [
      { key: "RENDER_PROFILE", value: "prod" },
      { key: "VITE_BASE_PATH", value: "/" },
      { key: "VITE_MCP_API_BASE", value: RENDER_API },
      { key: "NEO_PULSE_RENDER_API_BASE", value: RENDER_API },
      { key: "VITE_OPENROUTER_API_KEY", value: secrets.openRouter },
    ]);
    await triggerDeploy(staticSite.id);
  }

  if (worker?.id) {
    await resumeIfSuspended(worker.id, "neo-pulse-worker");
    await putEnvVars(worker.id, [
      { key: "LOCAL_DOMINATOR_LOGIN_URL", value: secrets.ldLoginUrl },
      { key: "LOCAL_DOMINATOR_EMAIL", value: secrets.ldEmail },
      { key: "LOCAL_DOMINATOR_PASSWORD", value: secrets.ldPassword },
      { key: "LD_WORKER_AUTH_TOKEN", value: secrets.workerToken },
    ]);
    await triggerDeploy(worker.id);
  }

  if (apiGateway?.id) {
    await resumeIfSuspended(apiGateway.id, "neo-pulse-api");
    await putEnvVars(apiGateway.id, [
      { key: "FLOWBIEONE_UPSTREAM", value: FLOWBIEONE_UPSTREAM },
      { key: "OLLAMA_BASE_URL", value: ollamaUrl.replace(/\/+$/, "") },
      { key: "OLLAMA_AUTH_TOKEN", value: secrets.ollamaToken },
      { key: "OPENROUTER_API_KEY", value: secrets.openRouter },
    ]);
    await triggerDeploy(apiGateway.id);
  }

  if (ollama?.id) {
    await resumeIfSuspended(ollama.id, "neo-pulse-ollama");
    await putEnvVars(ollama.id, [
      { key: "OLLAMA_MODELS", value: "qwen3:8b" },
      { key: "OLLAMA_AUTH_TOKEN", value: secrets.ollamaToken },
    ]);
    await triggerDeploy(ollama.id);
  }

  console.log("\nNEO Pulse Render URLs:");
  console.log("- UI:", staticSite?.serviceDetails?.url || "https://neo-pulse-static.onrender.com");
  console.log("- Terms:", "https://neo-pulse-static.onrender.com/terms-of-service");
  console.log("- Privacy:", "https://neo-pulse-static.onrender.com/privacy-policy");
  console.log("- Worker:", worker?.serviceDetails?.url || "https://neo-pulse-worker.onrender.com");
  console.log("- API gateway:", apiGateway?.serviceDetails?.url || "https://neo-pulse-api.onrender.com");
  console.log("- API (UI build):", RENDER_API);
  console.log("- Ollama:", ollamaUrl);
  console.log("- LD_WORKER_AUTH_TOKEN:", secrets.workerToken);
  console.log("- OLLAMA_AUTH_TOKEN:", secrets.ollamaToken);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
