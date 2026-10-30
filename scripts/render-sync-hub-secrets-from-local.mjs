#!/usr/bin/env node
/**
 * Merge local .env integration keys onto Render pulse-host-wp-hub (same contract as generate-local-app-secrets).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const API = "https://api.render.com/v1";
const HUB_SERVICE_NAME = "pulse-host-wp-hub";

function loadDotEnv(filePath) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function pick(env, ...keys) {
  for (const key of keys) {
    const val = env[key];
    if (typeof val === "string" && val.trim() !== "") return val.trim();
  }
  return "";
}

function loadApiKey() {
  const fromEnv = (process.env.RENDER_API_KEY || "").trim();
  if (fromEnv) return fromEnv;
  const candidates = [
    path.join(REPO_ROOT, ".secrets", "render-api-key.txt"),
    path.join(os.homedir(), "Downloads", "RENDER API KEY.txt"),
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, "utf8").trim();
  }
  throw new Error("RENDER_API_KEY or .secrets/render-api-key.txt required");
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
  if (!res.ok) throw new Error(`${method} ${route} (${res.status}): ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

function loadGscJsonFromWpConfig() {
  const wpGsc = path.join(
    REPO_ROOT,
    "wordpress-plugins",
    "neo-pulse-wp",
    "includes",
    "neo-pulse-wp-gsc-config.php",
  );
  if (!fs.existsSync(wpGsc)) return "";
  const src = fs.readFileSync(wpGsc, "utf8");
  const match = src.match(
    /define\(\s*'NEO_PULSE_WP_GSC_SERVICE_ACCOUNT_JSON',\s*'((?:\\'|[^'])*)'\s*\)/,
  );
  if (!match) return "";
  return match[1].replace(/\\'/g, "'");
}

function readOpenRouterFromGeneratedSecretsPhp() {
  const secretsPhp = path.join(
    REPO_ROOT,
    "wordpress-plugins",
    "neo-pulse-app",
    "includes",
    "neo-pulse-app-secrets.php",
  );
  if (!fs.existsSync(secretsPhp)) return "";
  const src = fs.readFileSync(secretsPhp, "utf8");
  const match = src.match(
    /define\(\s*'NEO_PULSE_APP_OPENROUTER_API_KEY',\s*'((?:\\'|[^'])*)'\s*\)/,
  );
  if (!match) return "";
  const key = match[1].replace(/\\'/g, "'");
  return key.trim();
}

async function readOpenRouterFromLocalHub() {
  const base = (process.env.NEO_PULSE_LOCAL_API_BASE || "http://127.0.0.1:8080").replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/api/integrations/resolved-openrouter-key`, {
      cache: "no-store",
    });
    if (!res.ok) return "";
    const data = await res.json();
    return typeof data.key === "string" ? data.key.trim() : "";
  } catch {
    return "";
  }
}

async function buildHubEnvVars() {
  const dotenv = loadDotEnv(path.join(REPO_ROOT, ".env"));
  const dotenvLocal = loadDotEnv(path.join(REPO_ROOT, ".env.local"));
  const merged = { ...dotenv, ...dotenvLocal };
  let openRouter = pick(
    merged,
    "NEO_PULSE_APP_OPENROUTER_API_KEY",
    "OPEN_ROUTER_API_KEY",
    "OPENROUTER_API_KEY",
  );
  if (!openRouter) openRouter = readOpenRouterFromGeneratedSecretsPhp();
  if (!openRouter) openRouter = await readOpenRouterFromLocalHub();
  const dfsLogin = pick(
    merged,
    "NEO_PULSE_APP_DATAFORSEO_LOGIN",
    "DATAFORSEO_API_LOGIN",
    "DATAFORSEO_LOGIN",
    "NEO_MASTER_DATAFORSEO_USERNAME",
  );
  const dfsPass = pick(
    merged,
    "NEO_PULSE_APP_DATAFORSEO_PASSWORD",
    "DATAFORSEO_API_PASSWORD",
    "DATAFORSEO_PASSWORD",
    "NEO_MASTER_DATAFORSEO_PASSWORD",
  );
  const semrush = pick(
    merged,
    "NEO_PULSE_APP_SEMRUSH_API_KEY",
    "SEMRUSH_API_KEY",
    "NEO_MASTER_SEMRUSH_PASSWORD",
  );
  const session = pick(merged, "NEO_PULSE_APP_SESSION_SECRET", "SESSION_SECRET");
  const gsc =
    pick(merged, "NEO_PULSE_APP_GSC_SERVICE_ACCOUNT_JSON", "GSC_SERVICE_ACCOUNT_JSON") ||
    loadGscJsonFromWpConfig();

  /** @type {{ key: string, value: string }[]} */
  const vars = [];
  const add = (key, value) => {
    if (value?.trim()) vars.push({ key, value: value.trim() });
  };

  add("OPENROUTER_API_KEY", openRouter);
  add("OPEN_ROUTER_API_KEY", openRouter);
  add("NEO_PULSE_APP_OPENROUTER_API_KEY", openRouter);
  add("DATAFORSEO_LOGIN", dfsLogin);
  add("DATAFORSEO_PASSWORD", dfsPass);
  add("DATAFORSEO_API_LOGIN", dfsLogin);
  add("DATAFORSEO_API_PASSWORD", dfsPass);
  add("NEO_PULSE_APP_DATAFORSEO_LOGIN", dfsLogin);
  add("NEO_PULSE_APP_DATAFORSEO_PASSWORD", dfsPass);
  add("SEMRUSH_API_KEY", semrush);
  add("NEO_PULSE_APP_SEMRUSH_API_KEY", semrush);
  add("NEO_PULSE_APP_SESSION_SECRET", session);
  // GSC JSON belongs in hub uploads/gsc-service-account.json (env var is too large for Render).

  add("NEO_PULSE_APP_GMB_CLIENT_ID", pick(merged, "NEO_PULSE_APP_GMB_CLIENT_ID", "GMB_CLIENT_ID"));
  add(
    "NEO_PULSE_APP_GMB_CLIENT_SECRET",
    pick(merged, "NEO_PULSE_APP_GMB_CLIENT_SECRET", "GMB_CLIENT_SECRET"),
  );
  add(
    "NEO_PULSE_APP_GMB_REDIRECT_URI",
    pick(merged, "NEO_PULSE_APP_GMB_REDIRECT_URI") ||
      "https://pulse-host-wp-hub.onrender.com/api/gmb/callback",
  );
  add(
    "NEO_PULSE_APP_FRONTEND_URL",
    pick(merged, "NEO_PULSE_APP_FRONTEND_URL", "NEO_PULSE_FRONTEND_URL") ||
      "https://neo-pulse-static.onrender.com/",
  );
  add(
    "NEO_PULSE_APP_GOOGLE_ADS_MCC_ID",
    pick(merged, "NEO_PULSE_APP_GOOGLE_ADS_MCC_ID", "GOOGLE_ADS_MCC_ID") || "3937136350",
  );
  add(
    "NEO_PULSE_APP_GOOGLE_ADS_DEVELOPER_TOKEN",
    pick(merged, "NEO_PULSE_APP_GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_DEVELOPER_TOKEN"),
  );
  add("GMB_CLIENT_ID", pick(merged, "NEO_PULSE_APP_GMB_CLIENT_ID", "GMB_CLIENT_ID"));
  add("GMB_CLIENT_SECRET", pick(merged, "NEO_PULSE_APP_GMB_CLIENT_SECRET", "GMB_CLIENT_SECRET"));
  add("PULSE_HOST_API_TOKEN", pick(merged, "PULSE_HOST_API_TOKEN", "NEO_HOST_API_TOKEN"));

  return vars;
}

async function main() {
  const vars = await buildHubEnvVars();
  if (!vars.some((v) => v.key === "OPENROUTER_API_KEY")) {
    throw new Error("No OpenRouter key in .env (OPEN_ROUTER_API_KEY / OPENROUTER_API_KEY).");
  }

  const services = await api("GET", "/services?limit=100");
  const rows = Array.isArray(services) ? services : services?.services ?? [];
  const hub = rows.map((r) => r.service ?? r).find((s) => s.name === HUB_SERVICE_NAME);
  if (!hub?.id) throw new Error(`${HUB_SERVICE_NAME} not found on Render.`);

  const current = await api("GET", `/services/${hub.id}/env-vars?limit=100`);
  const merged = new Map(
    (Array.isArray(current) ? current : []).map((row) => row.envVar ?? row).map((v) => [v.key, String(v.value ?? "")]),
  );
  for (const v of vars) merged.set(v.key, v.value);
  await api(
    "PUT",
    `/services/${hub.id}/env-vars`,
    [...merged.entries()].map(([key, value]) => ({ key, value })),
  );
  console.log(
    `[ok] ${HUB_SERVICE_NAME} (${hub.id}): merged ${vars.length} integration keys (${merged.size} total env keys; values not logged).`,
  );
  await api("POST", `/services/${hub.id}/restart`, {});
  console.log("[restart] hub restarted to load env (no git rebuild).");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
