#!/usr/bin/env node
/**
 * AgentMail setup: create Neo Pulse inbox, upsert .env, sync email-worker-keys.json.
 *
 * Usage:
 *   node scripts/setup-agentmail.mjs
 *   node scripts/setup-agentmail.mjs --api-key am_us_...
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const envFile = path.join(repoRoot, ".env");
const configPaths = [
  path.join(__dirname, "local-wp-staging.config.json"),
  path.join(__dirname, "local-wp-staging.config.example.json"),
];

const INBOX_USERNAME = "neo-pulse";
const INBOX_DOMAIN = "agentmail.to";
const INBOX_EMAIL = `${INBOX_USERNAME}@${INBOX_DOMAIN}`;
const CLIENT_ID = "neo-pulse-v1";
const API_BASE = "https://api.agentmail.to/v0";

const ENV_KEYS = [
  "AGENTMAIL_API_KEY",
  "AGENTMAIL_INBOX",
  "AGENTMAIL_WEBHOOK_URL",
  "AGENTMAIL_WEBHOOK_SECRET",
  "CHATGPT_AUDIT_EMAIL",
  "NEO_PULSE_APP_AGENTMAIL_API_KEY",
  "NEO_PULSE_APP_AGENTMAIL_INBOX",
  "NEO_PULSE_APP_AGENTMAIL_WEBHOOK_SECRET",
];

function log(step, detail = "") {
  console.log(`${step}${detail ? ` ${detail}` : ""}`);
}

function readArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx < 0 || idx + 1 >= process.argv.length) return "";
  return process.argv[idx + 1].trim();
}

function loadDotEnv(filePath) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function upsertEnvValues(values) {
  const lines = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8").split(/\r?\n/) : [];
  const seen = new Set();
  const next = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      if (key in values) {
        next.push(`${key}=${values[key]}`);
        seen.add(key);
        continue;
      }
    }
    next.push(line);
  }

  for (const key of ENV_KEYS) {
    if (!seen.has(key) && values[key]) {
      next.push(`${key}=${values[key]}`);
    }
  }

  while (next.length > 0 && next[next.length - 1] === "") {
    next.pop();
  }
  fs.writeFileSync(envFile, `${next.join("\n")}\n`, "utf8");
}

function loadLocalConfig() {
  for (const configPath of configPaths) {
    if (!fs.existsSync(configPath)) continue;
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  }
  return null;
}

function resolveEmailWorkerKeysPath() {
  const config = loadLocalConfig();
  if (config?.wpRoot) {
    // Local staging data root (wp-config NEO_PULSE_DATA_DIR points at /data/neo-pulse-data).
    return path.join(process.env.NEO_PULSE_DATA_DIR || path.join(path.dirname(config.wpRoot), "data", "php", "neo-pulse-data"), "email-worker-keys.json");
  }
  return "";
}

async function agentMailFetch(apiKey, method, pathname, body) {
  const res = await fetch(`${API_BASE}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`AgentMail ${method} ${pathname} failed (${res.status}): ${text.slice(0, 240)}`);
  }
  return data;
}

async function listInboxes(apiKey) {
  const data = await agentMailFetch(apiKey, "GET", "/inboxes");
  const items = Array.isArray(data?.inboxes)
    ? data.inboxes
    : Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data)
        ? data
        : [];
  return items;
}

function inboxEmail(item) {
  return String(item?.email ?? item?.inbox_id ?? "").trim().toLowerCase();
}

async function ensureInbox(apiKey) {
  const existing = await listInboxes(apiKey);
  const match = existing.find((item) => inboxEmail(item) === INBOX_EMAIL);
  if (match) {
    log("OK", `Inbox already exists: ${INBOX_EMAIL}`);
    return INBOX_EMAIL;
  }

  const created = await agentMailFetch(apiKey, "POST", "/inboxes", {
    username: INBOX_USERNAME,
    domain: INBOX_DOMAIN,
    display_name: "Neo Pulse",
    client_id: CLIENT_ID,
  });
  const email = inboxEmail(created) || INBOX_EMAIL;
  log("Created", `Inbox: ${email}`);
  return email;
}

function resolveWebhookUrl() {
  const cli = readArg("--webhook-url");
  if (cli) return cli.replace(/\/$/, "");
  const dotenv = loadDotEnv(envFile);
  const fromEnv = String(dotenv.AGENTMAIL_WEBHOOK_URL ?? process.env.AGENTMAIL_WEBHOOK_URL ?? "").trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const config = loadLocalConfig();
  const siteUrl = String(config?.siteUrl ?? config?.apiProxyTarget ?? "").replace(/\/$/, "");
  if (siteUrl) return `${siteUrl}/webhook/agentmail`;
  return "";
}

function resolveWebhookSecret(existing = "") {
  const cli = readArg("--webhook-secret");
  if (cli) return cli;
  const dotenv = loadDotEnv(envFile);
  const fromEnv = String(
    dotenv.AGENTMAIL_WEBHOOK_SECRET ??
      process.env.AGENTMAIL_WEBHOOK_SECRET ??
      dotenv.NEO_PULSE_APP_AGENTMAIL_WEBHOOK_SECRET ??
      "",
  ).trim();
  if (fromEnv) return fromEnv;
  if (existing) return existing;
  return crypto.randomBytes(24).toString("hex");
}

async function listWebhooks(apiKey) {
  const data = await agentMailFetch(apiKey, "GET", "/webhooks");
  return Array.isArray(data?.webhooks)
    ? data.webhooks
    : Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data)
        ? data
        : [];
}

async function ensureWebhook(apiKey, inbox, webhookUrl, webhookSecret) {
  if (!webhookUrl) {
    log("WARN", "No AGENTMAIL_WEBHOOK_URL; skip webhook registration");
    return { webhookSecret, webhookUrl: "" };
  }

  const existing = await listWebhooks(apiKey);
  const match = existing.find((item) => String(item?.url ?? "").replace(/\/$/, "") === webhookUrl);
  if (match?.webhook_id || match?.webhookId) {
    log("OK", `Webhook already registered: ${webhookUrl}`);
    return { webhookSecret, webhookUrl };
  }

  await agentMailFetch(apiKey, "POST", "/webhooks", {
    url: webhookUrl,
    event_types: ["message.received"],
    inbox_ids: [inbox],
    client_id: "neo-pulse-agentmail-v1",
    headers: {
      Authorization: `Bearer ${webhookSecret}`,
    },
  });
  log("Created", `Webhook: ${webhookUrl}`);
  return { webhookSecret, webhookUrl };
}

function writeEmailWorkerKeys(apiKey, inbox, webhookSecret) {
  const keysPath = resolveEmailWorkerKeysPath();
  if (!keysPath) {
    log("WARN", "Could not resolve email-worker-keys.json path (no local-wp-staging config)");
    return;
  }

  fs.mkdirSync(path.dirname(keysPath), { recursive: true });
  let existing = {};
  if (fs.existsSync(keysPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(keysPath, "utf8"));
    } catch {
      existing = {};
    }
  }

  const payload = {
    ...existing,
    agentmailApiKey: apiKey,
    agentmailGeneralEmail: inbox,
    agentmailWebhookSecret: webhookSecret,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(keysPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  log("OK", `Wrote ${keysPath}`);
}

async function syncViaLocalApi(apiKey, inbox, webhookSecret) {
  const config = loadLocalConfig();
  const siteUrl = String(config?.siteUrl ?? config?.apiProxyTarget ?? "").replace(/\/$/, "");
  if (!siteUrl) return;

  try {
    const res = await fetch(`${siteUrl}/api/integrations/sync-email-worker-keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentmailApiKey: apiKey,
        agentmailGeneralEmail: inbox,
        agentmailWebhookSecret: webhookSecret,
      }),
    });
    if (res.ok) {
      log("OK", `Synced via ${siteUrl}/api/integrations/sync-email-worker-keys`);
    }
  } catch {
    /* local WP may be offline */
  }
}

async function main() {
  const cliKey = readArg("--api-key");
  const dotenv = loadDotEnv(envFile);
  const apiKey = cliKey || dotenv.AGENTMAIL_API_KEY || process.env.AGENTMAIL_API_KEY || "";
  if (!apiKey) {
    throw new Error("Missing AGENTMAIL_API_KEY. Pass --api-key or set it in .env.");
  }

  const inbox = await ensureInbox(apiKey);
  const keysPath = resolveEmailWorkerKeysPath();
  let existingSecret = "";
  if (keysPath && fs.existsSync(keysPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(keysPath, "utf8"));
      existingSecret = String(parsed?.agentmailWebhookSecret ?? "").trim();
    } catch {
      existingSecret = "";
    }
  }
  const webhookUrl = resolveWebhookUrl();
  const webhookSecret = resolveWebhookSecret(existingSecret);
  await ensureWebhook(apiKey, inbox, webhookUrl, webhookSecret);

  upsertEnvValues({
    AGENTMAIL_API_KEY: apiKey,
    AGENTMAIL_INBOX: inbox,
    AGENTMAIL_WEBHOOK_URL: webhookUrl,
    AGENTMAIL_WEBHOOK_SECRET: webhookSecret,
    CHATGPT_AUDIT_EMAIL: inbox,
    NEO_PULSE_APP_AGENTMAIL_API_KEY: apiKey,
    NEO_PULSE_APP_AGENTMAIL_INBOX: inbox,
    NEO_PULSE_APP_AGENTMAIL_WEBHOOK_SECRET: webhookSecret,
  });
  log("OK", `Updated ${envFile}`);

  writeEmailWorkerKeys(apiKey, inbox, webhookSecret);
  await syncViaLocalApi(apiKey, inbox, webhookSecret);

  console.log(`\nAgentMail ready: ${inbox}`);
  console.log("Next: npm run generate:local-app-secrets");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
