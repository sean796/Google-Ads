#!/usr/bin/env node
/**
 * Restore DataForSEO API password and Semrush API key in repo .env from
 * local manager-settings.json (workspace snapshot on disk).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const envPath = path.join(ROOT, ".env");
const mgrPath =
  process.env.NEO_PULSE_MANAGER_SETTINGS_PATH ||
  "C:/Users/Sean Craig/wpstaging/sites/neopulse.local/data/php/neo-pulse-data/manager-settings.json";

if (!fs.existsSync(mgrPath)) {
  console.error("FAIL: manager-settings.json not found:", mgrPath);
  process.exit(1);
}

const mgr = JSON.parse(fs.readFileSync(mgrPath, "utf8"));
const dfsRaw = String(mgr?.snapshot?.keys?.["dataforseo-api-key"] ?? "").trim();
const sem = String(mgr?.snapshot?.keys?.["semrush-api-key"] ?? "").trim();

let dfsLogin = "";
let dfsPass = dfsRaw;
const colon = dfsRaw.indexOf(":");
if (colon > 0) {
  dfsLogin = dfsRaw.slice(0, colon).trim();
  dfsPass = dfsRaw.slice(colon + 1).trim();
}

if (!dfsPass) {
  console.error("FAIL: dataforseo-api-key missing in snapshot");
  process.exit(1);
}
if (!sem) {
  console.error("FAIL: semrush-api-key missing in snapshot");
  process.exit(1);
}

let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

function setLine(key, value) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^\\s*${escaped}\\s*=.*$`, "m");
  const line = `${key}=${value}`;
  if (re.test(env)) {
    env = env.replace(re, line);
  } else {
    if (env.length > 0 && !env.endsWith("\n")) env += "\n";
    env += `${line}\n`;
  }
}

if (dfsLogin) {
  setLine("DATAFORSEO_API_LOGIN", dfsLogin);
  setLine("DATAFORSEO_LOGIN", dfsLogin);
  setLine("NEO_PULSE_APP_DATAFORSEO_LOGIN", dfsLogin);
}
setLine("DATAFORSEO_API_PASSWORD", dfsPass);
setLine("DATAFORSEO_PASSWORD", dfsPass);
setLine("NEO_PULSE_APP_DATAFORSEO_PASSWORD", dfsPass);
setLine("SEMRUSH_API_KEY", sem);
setLine("NEO_PULSE_APP_SEMRUSH_API_KEY", sem);

fs.writeFileSync(envPath, env.endsWith("\n") ? env : `${env}\n`);
console.log(
  `OK: .env updated (DATAFORSEO_API_PASSWORD ${dfsPass.length} chars, SEMRUSH_API_KEY ${sem.length} chars)`,
);
