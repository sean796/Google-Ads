#!/usr/bin/env node
/**
 * Writes wordpress-plugins/neo-pulse-app/includes/neo-pulse-app-secrets.php
 * for local WP Staging (neopulse.local) from repo root .env.
 *
 * Usage:
 *   node scripts/generate-local-app-secrets.mjs
 *   npm run generate:local-app-secrets
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "wordpress-plugins", "neo-pulse-app", "includes", "neo-pulse-app-secrets.php");
const WP_GSC_CONFIG = path.join(
  ROOT,
  "wordpress-plugins",
  "neo-pulse-wp",
  "includes",
  "neo-pulse-wp-gsc-config.php",
);
const CONFIG_PATHS = [
  path.join(__dirname, "local-wp-staging.config.json"),
  path.join(__dirname, "local-wp-staging.config.example.json"),
];

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
    if (typeof val === "string" && val.trim() !== "") {
      return val.trim();
    }
  }
  return "";
}

function loadLocalConfig() {
  for (const configPath of CONFIG_PATHS) {
    if (!fs.existsSync(configPath)) continue;
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  }
  return {
    siteUrl: "https://neopulse.local",
    viteDevUrl: "http://localhost:8080/",
  };
}

function phpString(value) {
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function loadGscJsonFromWpConfig() {
  if (!fs.existsSync(WP_GSC_CONFIG)) return "";
  const src = fs.readFileSync(WP_GSC_CONFIG, "utf8");
  const match = src.match(
    /define\(\s*'NEO_PULSE_WP_GSC_SERVICE_ACCOUNT_JSON',\s*'((?:\\'|[^'])*)'\s*\)/,
  );
  if (!match) return "";
  return match[1].replace(/\\'/g, "'");
}

function resolveGscServiceAccountJson(dotenv) {
  const fromWp = loadGscJsonFromWpConfig();
  if (fromWp.includes("neopulse-505422")) {
    return fromWp;
  }
  const fromEnv = pick(dotenv, "NEO_PULSE_APP_GSC_SERVICE_ACCOUNT_JSON", "GSC_SERVICE_ACCOUNT_JSON");
  if (fromEnv && !fromEnv.includes("flowbie-483717") && !fromEnv.includes("flowbie-812@")) {
    return fromEnv;
  }
  return fromWp || fromEnv;
}

const INVALID_OPENROUTER_KEY = "0df04520eb8c0146e19f925295a5559b058f399917db3db7c0a3e3bb97361148";

function loadOpenRouterFromEmailWorkerKeys(local) {
  const wpRoot = String(local.wpRoot || "").trim();
  if (!wpRoot) return "";
  // Local staging data root (wp-config NEO_PULSE_DATA_DIR points at /data/neo-pulse-data).
  const keysPath = path.join(process.env.NEO_PULSE_DATA_DIR || path.join(path.dirname(wpRoot), "data", "php", "neo-pulse-data"), "email-worker-keys.json");
  if (!fs.existsSync(keysPath)) return "";
  try {
    const data = JSON.parse(fs.readFileSync(keysPath, "utf8"));
    return String(data.openRouterApiKey || "").trim();
  } catch {
    return "";
  }
}

function resolveOpenRouterApiKey(dotenv, local) {
  const fromEnv = pick(dotenv, "NEO_PULSE_APP_OPENROUTER_API_KEY", "OPEN_ROUTER_API_KEY", "OPENROUTER_API_KEY");
  if (fromEnv && !fromEnv.includes(INVALID_OPENROUTER_KEY)) {
    return fromEnv;
  }
  const fromWorker = loadOpenRouterFromEmailWorkerKeys(local);
  if (fromWorker && !fromWorker.includes(INVALID_OPENROUTER_KEY)) {
    return fromWorker;
  }
  return fromEnv || fromWorker;
}

function main() {
  const dotenv = loadDotEnv(path.join(ROOT, ".env"));
  const local = loadLocalConfig();
  const siteUrl = String(local.siteUrl || "https://neopulse.local").replace(/\/+$/, "");
  const frontendUrl = String(local.viteDevUrl || "http://localhost:8080/").replace(/(?<!\/)$/, "/");
  const googleMcpRedirectUri = `${frontendUrl.replace(/\/+$/, "")}/api/google-mcp/callback`;
  const googleAdsRedirectUri = `${frontendUrl.replace(/\/+$/, "")}/api/google-ads/callback`;

  const gscJson = resolveGscServiceAccountJson(dotenv);
  const openRouterKey = resolveOpenRouterApiKey(dotenv, local);
  const nodeBinary = process.execPath.replace(/\\/g, "/");
  const ldExportScript = path
    .join(ROOT, "scripts", "research", "local-dominator", "export-grid.mjs")
    .replace(/\\/g, "/");
  const ldEnvFile = path.join(ROOT, ".env.localdominator").replace(/\\/g, "/");
  const chatgptSessionScript = path
    .join(ROOT, "scripts", "research", "chatgpt-audit", "run-session.mjs")
    .replace(/\\/g, "/");
  const chatgptEnvFile = path.join(ROOT, ".env").replace(/\\/g, "/");
  const chatgptWorkerUrl = "http://host.docker.internal:8080/api";
  const localWorkerPort = pick(dotenv, "NEO_PULSE_APP_LOCAL_WORKER_PORT", "LOCAL_WORKER_PORT") || "10000";
  const postCreatorWorkerUrl = `http://host.docker.internal:${localWorkerPort}`;
  const postCreatorApiBase = siteUrl;
  const postCreatorWorkerAuth = pick(dotenv, "NEO_PULSE_APP_POST_CREATOR_WORKER_AUTH", "LD_WORKER_AUTH_TOKEN");
  const ldWorkerUrl =
    pick(dotenv, "NEO_PULSE_APP_LOCAL_DOMINATOR_WORKER_URL")
    || `http://host.docker.internal:${localWorkerPort}`;
  const ldWorkerAuth = pick(dotenv, "NEO_PULSE_APP_LOCAL_DOMINATOR_WORKER_AUTH", "LD_WORKER_AUTH_TOKEN");
  const browserAutomationScript = path
    .join(ROOT, "scripts", "research", "browser-automation", "run-session.mjs")
    .replace(/\\/g, "/");
  const residentialProxyEnvFile = path.join(ROOT, ".env.residential-proxy").replace(/\\/g, "/");
  const lines = [
    "<?php",
    "/**",
    " * Generated by scripts/generate-local-app-secrets.mjs for local WP Staging.",
    " *",
    " * @package Neo_Pulse_App",
    " */",
    "",
    "defined( 'ABSPATH' ) || exit;",
    "",
    `if ( ! defined( 'NEO_PULSE_APP_SESSION_SECRET' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_SESSION_SECRET', ${phpString(pick(dotenv, "NEO_PULSE_APP_SESSION_SECRET", "SESSION_SECRET"))} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_GSC_SERVICE_ACCOUNT_JSON' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_GSC_SERVICE_ACCOUNT_JSON', ${phpString(gscJson)} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_DATAFORSEO_LOGIN' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_DATAFORSEO_LOGIN', ${phpString(pick(dotenv, "NEO_PULSE_APP_DATAFORSEO_LOGIN", "DATAFORSEO_API_LOGIN", "DATAFORSEO_LOGIN"))} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_DATAFORSEO_PASSWORD' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_DATAFORSEO_PASSWORD', ${phpString(pick(dotenv, "NEO_PULSE_APP_DATAFORSEO_PASSWORD", "DATAFORSEO_API_PASSWORD", "DATAFORSEO_PASSWORD"))} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_SEMRUSH_API_KEY' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_SEMRUSH_API_KEY', ${phpString(pick(dotenv, "NEO_PULSE_APP_SEMRUSH_API_KEY", "SEMRUSH_API_KEY"))} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_OPENROUTER_API_KEY' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_OPENROUTER_API_KEY', ${phpString(openRouterKey)} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_GMB_CLIENT_ID' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_GMB_CLIENT_ID', ${phpString(pick(dotenv, "NEO_PULSE_APP_GMB_CLIENT_ID", "GMB_CLIENT_ID"))} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_GMB_CLIENT_SECRET' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_GMB_CLIENT_SECRET', ${phpString(pick(dotenv, "NEO_PULSE_APP_GMB_CLIENT_SECRET", "GMB_CLIENT_SECRET"))} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_GMB_REDIRECT_URI' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_GMB_REDIRECT_URI', ${phpString(`${siteUrl}/api/gmb/callback`)} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_GOOGLE_MCP_REDIRECT_URI' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_GOOGLE_MCP_REDIRECT_URI', ${phpString(googleMcpRedirectUri)} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_GOOGLE_ADS_REDIRECT_URI' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_GOOGLE_ADS_REDIRECT_URI', ${phpString(googleAdsRedirectUri)} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_FRONTEND_URL' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_FRONTEND_URL', ${phpString(frontendUrl)} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_CHEKKIT_EVENTS_WEBHOOK_URL' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_CHEKKIT_EVENTS_WEBHOOK_URL', ${phpString(pick(dotenv, "NEO_PULSE_APP_CHEKKIT_EVENTS_WEBHOOK_URL", "CHEKKIT_WEBHOOK_URL", "CHEKKIT_EVENTS_WEBHOOK_URL", "FLOWBIE_WP_CHEKKIT_WEBHOOK_URL"))} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_CHEKKIT_FORM_EMAIL' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_CHEKKIT_FORM_EMAIL', ${phpString(pick(dotenv, "NEO_PULSE_APP_CHEKKIT_FORM_EMAIL", "FLOWBIE_APP_CHEKKIT_FORM_EMAIL", "CHEKKIT_FORM_EMAIL"))} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_NODE_BINARY' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_NODE_BINARY', ${phpString(nodeBinary)} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_LOCAL_DOMINATOR_EXPORT_SCRIPT' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_LOCAL_DOMINATOR_EXPORT_SCRIPT', ${phpString(ldExportScript)} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_LOCAL_DOMINATOR_ENV_FILE' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_LOCAL_DOMINATOR_ENV_FILE', ${phpString(ldEnvFile)} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_AGENTMAIL_API_KEY' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_AGENTMAIL_API_KEY', ${phpString(pick(dotenv, "NEO_PULSE_APP_AGENTMAIL_API_KEY", "AGENTMAIL_API_KEY", "NEO_PULSE_WP_AGENTMAIL_API_KEY"))} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_AGENTMAIL_INBOX' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_AGENTMAIL_INBOX', ${phpString(pick(dotenv, "NEO_PULSE_APP_AGENTMAIL_INBOX", "AGENTMAIL_INBOX", "NEO_PULSE_WP_AGENTMAIL_INBOX"))} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_GMB_OAUTH_REFRESH_TOKEN' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_GMB_OAUTH_REFRESH_TOKEN', ${phpString(pick(dotenv, "NEO_PULSE_APP_GMB_OAUTH_REFRESH_TOKEN"))} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_GOOGLE_ADS_OAUTH_REFRESH_TOKEN' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_GOOGLE_ADS_OAUTH_REFRESH_TOKEN', ${phpString(pick(dotenv, "NEO_PULSE_APP_GOOGLE_ADS_OAUTH_REFRESH_TOKEN"))} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_GOOGLE_MCP_OAUTH_REFRESH_TOKEN' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_GOOGLE_MCP_OAUTH_REFRESH_TOKEN', ${phpString(pick(dotenv, "NEO_PULSE_APP_GOOGLE_MCP_OAUTH_REFRESH_TOKEN"))} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_SITES_JSON' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_SITES_JSON', ${phpString(pick(dotenv, "NEO_PULSE_APP_SITES_JSON"))} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_AGENTMAIL_SIGNING_SECRET' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_AGENTMAIL_SIGNING_SECRET', ${phpString(pick(dotenv, "NEO_PULSE_APP_AGENTMAIL_SIGNING_SECRET", "AGENTMAIL_SIGNING_SECRET"))} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_CHEKKIT_WEBHOOK_TOKEN' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_CHEKKIT_WEBHOOK_TOKEN', ${phpString(pick(dotenv, "NEO_PULSE_APP_CHEKKIT_WEBHOOK_TOKEN", "CHEKKIT_WEBHOOK_TOKEN"))} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_CHATGPT_AUDIT_SCRIPT' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_CHATGPT_AUDIT_SCRIPT', ${phpString(chatgptSessionScript)} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_CHATGPT_AUDIT_ENV_FILE' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_CHATGPT_AUDIT_ENV_FILE', ${phpString(chatgptEnvFile)} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_CHATGPT_AUDIT_WORKER_URL' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_CHATGPT_AUDIT_WORKER_URL', ${phpString(chatgptWorkerUrl)} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_BROWSER_AUTOMATION_SCRIPT' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_BROWSER_AUTOMATION_SCRIPT', ${phpString(browserAutomationScript)} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_RESIDENTIAL_PROXY_ENV_FILE' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_RESIDENTIAL_PROXY_ENV_FILE', ${phpString(residentialProxyEnvFile)} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_LOCAL_DOMINATOR_WORKER_URL' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_LOCAL_DOMINATOR_WORKER_URL', ${phpString(ldWorkerUrl)} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_LOCAL_DOMINATOR_WORKER_AUTH' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_LOCAL_DOMINATOR_WORKER_AUTH', ${phpString(ldWorkerAuth)} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_POST_CREATOR_WORKER_URL' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_POST_CREATOR_WORKER_URL', ${phpString(postCreatorWorkerUrl)} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_POST_CREATOR_WORKER_AUTH' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_POST_CREATOR_WORKER_AUTH', ${phpString(postCreatorWorkerAuth)} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_POST_CREATOR_API_BASE' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_POST_CREATOR_API_BASE', ${phpString(postCreatorApiBase)} );`,
    "}",
    `if ( ! defined( 'NEO_PULSE_APP_PUBLIC_API_BASE' ) ) {`,
    `\tdefine( 'NEO_PULSE_APP_PUBLIC_API_BASE', ${phpString(siteUrl)} );`,
    "}",
    `if ( ! defined( 'PULSE_HOST_API_BASE' ) ) {`,
    `\tdefine( 'PULSE_HOST_API_BASE', ${phpString(pick(dotenv, "PULSE_HOST_API_BASE"))} );`,
    "}",
    `if ( ! defined( 'PULSE_HOST_API_TOKEN' ) ) {`,
    `\tdefine( 'PULSE_HOST_API_TOKEN', ${phpString(pick(dotenv, "PULSE_HOST_API_TOKEN"))} );`,
    "}",
    "",
  ];

  fs.writeFileSync(OUT, lines.join("\n"), "utf8");
  console.log("Wrote", OUT);
}

main();
