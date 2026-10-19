#!/usr/bin/env node
/**
 * Upload local wp-content/uploads/neo-pulse-data/gsc-service-account.json to pulse-host-wp-hub
 * (same path and API contract as local GA credentials sync).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
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

async function main() {
  const wpRoot = loadLocalWpRoot();
  if (!wpRoot) throw new Error("scripts/local-wp-staging.config.json wpRoot missing");

  const gscPath = path.join(wpRoot, "wp-content", "uploads", "neo-pulse-data", "gsc-service-account.json");
  if (!fs.existsSync(gscPath)) {
    throw new Error(`Missing local GSC credentials file: ${gscPath}`);
  }
  const gscRaw = fs.readFileSync(gscPath, "utf8");

  const res = await fetch(`${HUB_API}/api/gsc/test-and-save`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ serviceAccountJson: gscRaw }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  console.log(`[ok] GSC credentials on hub: ${data.client_email} (${data.siteCount ?? "?"} properties)`);

  const verify = await fetch(`${HUB_API}/api/gsc/test-connection`, { headers: { Accept: "application/json" } });
  const conn = await verify.json();
  if (!conn.success) {
    throw new Error(conn.error || "GSC test-connection failed after save");
  }
  console.log(`[verify] connected siteCount=${conn.siteCount ?? 0}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
