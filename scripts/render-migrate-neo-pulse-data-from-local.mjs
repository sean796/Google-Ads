#!/usr/bin/env node
/**
 * Copy local neopulse.local workspace data (all clients) onto Render pulse-host-wp-hub.
 * Sources: local /api mirrors + wp-content/uploads/neo-pulse-data files.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");

const LOCAL_API = (process.env.NEO_PULSE_LOCAL_API_BASE || "http://127.0.0.1:8080").replace(
  /\/+$/,
  "",
);
const HUB_API = (process.env.NEO_PULSE_HUB_API_BASE || "https://pulse-host-wp-hub.onrender.com").replace(
  /\/+$/,
  "",
);

function loadLocalWpRoot() {
  const cfgPath = path.join(REPO_ROOT, "scripts", "local-wp-staging.config.json");
  if (!fs.existsSync(cfgPath)) return "";
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  return String(cfg.wpRoot || "").trim();
}

async function apiJson(base, route, init) {
  const res = await fetch(`${base}/api/${route.replace(/^\//, "")}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${route} (${res.status}): non-JSON ${text.slice(0, 120)}`);
  }
  if (!res.ok) {
    throw new Error(`${route} (${res.status}): ${data.error || text.slice(0, 200)}`);
  }
  return data;
}

function readNeoPulseDataFile(wpRoot, name) {
  const abs = path.join(wpRoot, "wp-content", "uploads", "neo-pulse-data", name);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, "utf8");
}

async function main() {
  const wpRoot = loadLocalWpRoot();
  if (!wpRoot) throw new Error("scripts/local-wp-staging.config.json wpRoot missing");

  const [props, mgr] = await Promise.all([
    apiJson(LOCAL_API, "manager-wordpress-properties/load"),
    apiJson(LOCAL_API, "manager-cloud-settings/load"),
  ]);
  const sites = Array.isArray(props.sites) ? props.sites : [];
  const snapshot = mgr.snapshot ?? null;
  if (!sites.length) throw new Error("Local sites mirror is empty");
  if (!snapshot?.keys) throw new Error("Local manager settings snapshot has no keys");

  console.log(`[local] ${sites.length} sites, ${Object.keys(snapshot.keys).length} manager keys`);

  const hubProps = await apiJson(HUB_API, "manager-wordpress-properties/save", {
    method: "POST",
    body: JSON.stringify({ sites }),
  });
  console.log(`[hub] sites saved: count=${hubProps.count ?? sites.length}`);

  const hubMgr = await apiJson(HUB_API, "manager-cloud-settings/save", {
    method: "POST",
    body: JSON.stringify({ snapshot }),
  });
  console.log(`[hub] manager settings saved: updatedAt=${hubMgr.updatedAt ?? "?"}`);

  const gaRaw = readNeoPulseDataFile(wpRoot, "ga-service-account.json");
  if (gaRaw) {
    const ga = await apiJson(HUB_API, "ga/test-and-save", {
      method: "POST",
      body: JSON.stringify({ serviceAccountJson: gaRaw }),
    });
    console.log(`[hub] GA credentials: ${ga.success ? "ok" : ga.error || "failed"}`);
  }

  const gscRaw = readNeoPulseDataFile(wpRoot, "gsc-service-account.json");
  if (gscRaw) {
    const gsc = await apiJson(HUB_API, "gsc/test-and-save", {
      method: "POST",
      body: JSON.stringify({ serviceAccountJson: gscRaw }),
    });
    console.log(
      `[hub] GSC credentials: ${gsc.success ? `ok (${gsc.siteCount ?? "?"} sites)` : gsc.error || "failed"}`,
    );
  }

  const workerRaw = readNeoPulseDataFile(wpRoot, "email-worker-keys.json");
  if (workerRaw) {
    const worker = JSON.parse(workerRaw);
    await apiJson(HUB_API, "integrations/sync-email-worker-keys", {
      method: "POST",
      body: JSON.stringify({
        openRouterApiKey: worker.openRouterApiKey || "",
        agentmailApiKey: worker.agentmailApiKey || "",
        agentmailGeneralEmail: worker.agentmailGeneralEmail || "",
        agentmailWebhookSecret: worker.agentmailWebhookSecret || "",
      }),
    });
    console.log("[hub] email-worker-keys synced");
  }

  if (snapshot.keys["openrouter-api-key"]) {
    await apiJson(HUB_API, "manager-wordpress-properties/sync-openrouter", {
      method: "POST",
      body: JSON.stringify({ openRouterApiKey: snapshot.keys["openrouter-api-key"] }),
    });
  }
  if (snapshot.keys["semrush-api-key"]) {
    await apiJson(HUB_API, "manager-wordpress-properties/sync-semrush", {
      method: "POST",
      body: JSON.stringify({ semrushApiKey: snapshot.keys["semrush-api-key"] }),
    });
  }

  const verify = await Promise.all([
    apiJson(HUB_API, "manager-wordpress-properties/load"),
    apiJson(HUB_API, "manager-cloud-settings/load"),
    apiJson(HUB_API, "ga/credentials-status"),
    apiJson(HUB_API, "gsc/credentials-status"),
    apiJson(HUB_API, "gsc/test-connection"),
    apiJson(HUB_API, "integrations/resolved-openrouter-key"),
  ]);
  const hubSites = verify[0].sites?.length ?? 0;
  const hubKeys = Object.keys(verify[1].snapshot?.keys || {}).length;
  const gaOk = Boolean(verify[2].configured);
  const gscOk = Boolean(verify[3].configured);
  const gscConnected = Boolean(verify[4].success);
  const orLen = (verify[5].key || "").length;
  console.log(
    `[verify] hub sites=${hubSites} managerKeys=${hubKeys} gaConfigured=${gaOk} gscConfigured=${gscOk} gscConnected=${gscConnected} openRouterKeyLen=${orLen}`,
  );
  if (hubSites !== sites.length || hubKeys < 1 || !gaOk || !gscOk || !gscConnected || orLen < 10) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
