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

function loadLocalApiBase() {
  const cfgPath = path.join(REPO_ROOT, "scripts", "local-wp-staging.config.json");
  if (fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    const proxy = String(cfg.apiProxyTarget || cfg.siteUrl || "").trim();
    if (proxy) return proxy.replace(/\/+$/, "");
  }
  return LOCAL_API;
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

function loadRenderApiKey() {
  const fromEnv = (process.env.RENDER_API_KEY || "").trim();
  if (fromEnv) return fromEnv;
  const filePath = path.join(REPO_ROOT, ".secrets", "render-api-key.txt");
  if (fs.existsSync(filePath)) return fs.readFileSync(filePath, "utf8").trim();
  return "";
}

async function loadHubSyncTokenFromRender() {
  const apiKey = loadRenderApiKey();
  if (!apiKey) return "";
  const res = await fetch("https://api.render.com/v1/services?limit=100", {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  if (!res.ok) return "";
  const rows = await res.json();
  const list = Array.isArray(rows) ? rows : rows?.services ?? [];
  const hub = list.map((r) => r.service ?? r).find((s) => s.name === "pulse-host-wp-hub");
  if (!hub?.id) return "";
  const envRes = await fetch(`https://api.render.com/v1/services/${hub.id}/env-vars?limit=100`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  if (!envRes.ok) return "";
  const envRows = await envRes.json();
  const envList = Array.isArray(envRows) ? envRows : [];
  for (const row of envList) {
    const v = row.envVar ?? row;
    if (v?.key === "PULSE_HOST_API_TOKEN" && typeof v.value === "string" && v.value.trim()) {
      return v.value.trim();
    }
  }
  return "";
}

async function loadHubSyncToken() {
  const fromEnv = (process.env.PULSE_HOST_API_TOKEN || "").trim();
  if (fromEnv) return fromEnv;
  const dotenv = loadDotEnv(path.join(REPO_ROOT, ".env"));
  const dotenvLocal = loadDotEnv(path.join(REPO_ROOT, ".env.local"));
  const fromFile = (dotenvLocal.PULSE_HOST_API_TOKEN || dotenv.PULSE_HOST_API_TOKEN || "").trim();
  if (fromFile) return fromFile;
  const candidates = [
    path.join(REPO_ROOT, ".secrets", "pulse-host-api-token.txt"),
    path.join(REPO_ROOT, ".secrets", "render-pulse-host-api-token.txt"),
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, "utf8").trim();
  }
  return loadHubSyncTokenFromRender();
}

async function hubDataRequest(base, route, body, token) {
  const res = await fetch(`${base}/api/${route}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { "X-Pulse-Host-Api-Token": token } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${route} (${res.status}): non-JSON ${text.slice(0, 120)}`);
  }
  if (!res.ok || data.ok === false) {
    throw new Error(`${route} (${res.status}): ${data.error || text.slice(0, 200)}`);
  }
  return data;
}

const HUB_DATA_KEYS = ["google-ads-tokens", "google-ads-api", "gmb-oauth"];

async function syncHubDataFiles(localBase, hubBase, token) {
  if (!token) {
    console.log("[skip] hub-data sync: PULSE_HOST_API_TOKEN not set");
    return;
  }
  for (const key of HUB_DATA_KEYS) {
    try {
      const exported = await hubDataRequest(localBase, "integrations/hub-data-export", { key }, token);
      await hubDataRequest(hubBase, "integrations/hub-data-import", { key, data: exported.data }, token);
      console.log(`[hub] synced ${key}`);
    } catch (err) {
      console.log(`[hub] ${key}: ${err.message || err}`);
    }
  }
}

function normalizePropertyClientLogoUrlsForHub(sites) {
  const stamp = Date.now();
  for (const site of sites) {
    if (!site || typeof site.id !== "string") continue;
    const raw = typeof site.clientLogoUrl === "string" ? site.clientLogoUrl.trim() : "";
    if (!raw) continue;
    if (raw.startsWith("/api/")) continue;
    const isDevHosted =
      /client-logo/i.test(raw) &&
      (/localhost|127\.0\.0\.1|neopulse\.local/i.test(raw) || raw.includes(":8080"));
    if (isDevHosted) {
      site.clientLogoUrl = `/api/manager-wordpress-properties/client-logo/${encodeURIComponent(site.id)}?v=${stamp}`;
    }
  }
}

async function syncClientLogosToHub(localBase, hubBase, sites) {
  let copied = 0;
  for (const site of sites) {
    const siteId = site?.id;
    if (typeof siteId !== "string" || siteId.trim() === "") continue;
    const logoRes = await fetch(
      `${localBase}/api/manager-wordpress-properties/client-logo/${encodeURIComponent(siteId)}`,
      { headers: { Accept: "*/*" } },
    );
    if (!logoRes.ok) continue;
    const mime = logoRes.headers.get("content-type") || "image/png";
    const buf = Buffer.from(await logoRes.arrayBuffer());
    if (!buf.length) continue;
    const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
    const upload = await fetch(`${hubBase}/api/manager-wordpress-properties/client-logo/upload`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, dataUrl }),
    });
    const body = await upload.json().catch(() => ({}));
    if (!upload.ok || !body.ok) {
      console.log(`[hub] client-logo ${siteId}: ${body.error || upload.status}`);
      continue;
    }
    copied += 1;
    console.log(`[hub] client-logo ${siteId}`);
  }
  console.log(`[hub] client-logos copied: ${copied}`);
}

async function syncLocalGridScans(localBase, hubBase, siteId) {
  const historyRes = await fetch(
    `${localBase}/api/organic-dashboard/local-grid/history?siteId=${encodeURIComponent(siteId)}`,
    { headers: { Accept: "application/json" } },
  );
  const history = await historyRes.json();
  const scans = Array.isArray(history?.scans) ? history.scans : [];
  if (!scans.length) return;
  for (const row of scans.slice(0, 5)) {
    const scanId = row?.scanId;
    if (!scanId) continue;
    const scanRes = await fetch(
      `${localBase}/api/organic-dashboard/local-grid/scan?siteId=${encodeURIComponent(siteId)}&scanId=${encodeURIComponent(scanId)}`,
      { headers: { Accept: "application/json" } },
    );
    const scanPayload = await scanRes.json();
    const scan = scanPayload?.scan;
    if (!scan?.scanId) continue;
    await apiJson(hubBase, "organic-dashboard/local-grid/save", {
      method: "POST",
      body: JSON.stringify({ siteId, scan }),
    });
    console.log(`[hub] local-grid scan ${scanId} for ${siteId}`);
  }
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

  await syncClientLogosToHub(LOCAL_API, HUB_API, sites);
  normalizePropertyClientLogoUrlsForHub(sites);

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

  const hubToken = await loadHubSyncToken();
  await syncHubDataFiles(LOCAL_API, HUB_API, hubToken);
  for (const site of sites) {
    const id = site?.id;
    if (typeof id === "string" && id.trim() !== "") {
      await syncLocalGridScans(LOCAL_API, HUB_API, id.trim());
    }
  }

  const verify = await Promise.all([
    apiJson(HUB_API, "manager-wordpress-properties/load"),
    apiJson(HUB_API, "manager-cloud-settings/load"),
    apiJson(HUB_API, "ga/credentials-status"),
    apiJson(HUB_API, "gsc/credentials-status"),
    apiJson(HUB_API, "gsc/test-connection"),
    apiJson(HUB_API, "integrations/resolved-openrouter-key"),
    apiJson(HUB_API, "google-ads/status"),
  ]);
  const hubSites = verify[0].sites?.length ?? 0;
  const hubKeys = Object.keys(verify[1].snapshot?.keys || {}).length;
  const gaOk = Boolean(verify[2].configured);
  const gscOk = Boolean(verify[3].configured);
  const gscConnected = Boolean(verify[4].success);
  const orLen = (verify[5].key || "").length;
  const adsConnected = Boolean(verify[6]?.connected);
  console.log(
    `[verify] hub sites=${hubSites} managerKeys=${hubKeys} gaConfigured=${gaOk} gscConfigured=${gscOk} gscConnected=${gscConnected} openRouterKeyLen=${orLen} googleAdsConnected=${adsConnected}`,
  );
  if (
    hubSites !== sites.length ||
    hubKeys < 1 ||
    !gaOk ||
    !gscOk ||
    !gscConnected ||
    orLen < 10 ||
    !adsConnected
  ) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
