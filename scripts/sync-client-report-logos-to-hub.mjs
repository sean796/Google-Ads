#!/usr/bin/env node
/**
 * Seed client report cover logos on the hub for every portfolio property.
 * For each site: download the source logo server-side, upload it to the hub
 * client-logo store, save clientLogoUrl + clientLogoBoxTheme on the hub
 * properties mirror, and verify the static origin serves the logo.
 *
 * Usage: node scripts/sync-client-report-logos-to-hub.mjs [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HUB = "https://pulse-host-wp-hub.onrender.com";
const STATIC = "https://neo-pulse-static.onrender.com";
const LOCAL_LOGO_DIR = path.join(REPO_ROOT, ".local-neo-pulse-data", "client-logos");
const DRY_RUN = process.argv.includes("--dry-run");

/** Box color decided per client from the logo foreground (light foreground -> black box). */
export const CLIENT_LOGO_PLAN = [
  { id: "wp-1791924906059-0", name: "Advance Blinds", box: "black", url: "https://advanceblindsanddrapery.com/wp-content/uploads/2025/09/Advance-Blinds-Drapery-Logo.png" },
  { id: "wp-1791924906059-1", name: "Blind Magic", box: "black", url: "https://blindmagic.com/wp-content/uploads/2026/04/Blind-Magic-Logo-2022.png" },
  { id: "wp-1791924906059-2", name: "Blinds West", box: "black", url: "https://blindswest.ca/wp-content/uploads/2026/01/Logo-Blinds-West-1000-x-500-px-800-x-250-px.png" },
  { id: "wp-1791924906059-3", name: "DM Interiors", box: "black", url: "https://dminteriorsanddesign.com/wp-content/uploads/2025/11/logo-dark.2408261014550.png" },
  { id: "wp-1791924906059-4", name: "Elite Shutters & Shadings", box: "white", url: "https://eliteshadings.com/wp-content/uploads/2026/09/Elite-Logo-Dark.png" },
  { id: "wp-1791924906059-5", name: "In the Shade", box: "white", url: "https://intheshadeflorida.com/wp-content/uploads/2025/06/Full-Logo.svg" },
  { id: "wp-1791924906059-6", name: "Interiors by Laura", box: "white", url: "https://interiorsbylaura.com/wp-content/uploads/2026/01/Interiors-By-Laura.png" },
  { id: "wp-1791924906059-7", name: "KWB", box: "white", url: "https://kwbllp.com/wp-content/uploads/2026/05/KWB-Dark.png" },
  { id: "wp-1791924906059-8", name: "Lindsey Blinds", box: "white", url: "https://lindseyblindsetc.com/wp-content/uploads/2026/10/LogoLindsey-Blinds.svg" },
  { id: "wp-1791924906059-9", name: "Neo Digital", box: "black", url: "https://neodigital.ca/wp-content/uploads/2025/02/Light.svg" },
  { id: "wp-1791924906059-10", name: "Phoenix Painting", box: "black", url: "https://phoenixpainting.ca/wp-content/uploads/2025/02/Phoenix-Logo-Dark.png" },
  { id: "wp-1791924906059-11", name: "Posh Outdoors", box: "white", url: "https://posh-outdoors.com/wp-content/uploads/2025/09/Dark@3x-scaled.png" },
  { id: "wp-1791924906059-12", name: "Shutter Spot", box: "black", url: "https://shutterspot.com/wp-content/uploads/2026/05/Blind-Spot-Logo.png" },
  { id: "wp-1791924906059-13", name: "Superior Blinds", box: "black", url: "https://superiorblinds.com/wp-content/uploads/2025/07/Primary@2x.png" },
  { id: "wp-1791924906059-14", name: "Superior Tent Rentals", box: "black", url: "https://superiortentrentals.com/wp-content/uploads/2025/07/Superior-Tent-Rentals-Logo-Dark.svg" },
  { id: "wp-1791924906059-15", name: "Tailored Interiors", box: "white", url: "https://tailoredinteriors.ca/wp-content/uploads/2026/03/tailored-logo_Final-03_edited-1.webp" },
  { id: "wp-1791924906059-16", name: "You Junk It... I Dump It", box: "black", url: "https://youjunkit.ca/wp-content/uploads/2024/08/YJI-mobile.png" },
];

const MIME_BY_EXT = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml" };
const EXT_BY_MIME = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg" };

function mimeFor(url, headerType) {
  const header = (headerType ?? "").split(";")[0].trim().toLowerCase();
  if (EXT_BY_MIME[header]) return header;
  const ext = new URL(url).pathname.split(".").pop()?.toLowerCase() ?? "";
  if (MIME_BY_EXT[ext]) return MIME_BY_EXT[ext];
  throw new Error(`Unsupported logo type "${header || ext}" for ${url}`);
}

async function hubFetch(url, init, attempts = 3) {
  for (let i = 1; ; i++) {
    const res = await fetch(url, init);
    if (res.status !== 502 && res.status !== 503 && res.status !== 504) return res;
    if (i >= attempts) return res;
    console.log(`  hub ${res.status}, retry ${i}/${attempts - 1} after ${2 * i}s`);
    await new Promise((r) => setTimeout(r, 2000 * i));
  }
}

async function downloadLogo(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 NeoPulse logo sync" } });
  if (!res.ok) throw new Error(`download HTTP ${res.status} ${url}`);
  const mime = mimeFor(url, res.headers.get("content-type"));
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error(`empty logo body ${url}`);
  if (buf.length > 3145728) throw new Error(`logo over 3 MB (${buf.length} bytes) ${url}`);
  return { mime, buf, ext: EXT_BY_MIME[mime] };
}

async function uploadToHub(siteId, mime, buf) {
  const res = await hubFetch(`${HUB}/api/manager-wordpress-properties/client-logo/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ siteId, dataUrl: `data:${mime};base64,${buf.toString("base64")}` }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `upload HTTP ${res.status}`);
}

function writeLocal(siteId, ext, buf) {
  fs.mkdirSync(LOCAL_LOGO_DIR, { recursive: true });
  for (const old of Object.keys(MIME_BY_EXT)) {
    const p = path.join(LOCAL_LOGO_DIR, `${siteId}.${old}`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  fs.writeFileSync(path.join(LOCAL_LOGO_DIR, `${siteId}.${ext}`), buf);
}

async function loadHubSites() {
  const res = await hubFetch(`${HUB}/api/manager-wordpress-properties/load?_=${Date.now()}`, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !Array.isArray(data.sites)) throw new Error(`hub load HTTP ${res.status}`);
  return data.sites;
}

async function saveHubSites(sites) {
  const res = await hubFetch(`${HUB}/api/manager-wordpress-properties/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sites }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `hub save HTTP ${res.status}`);
}

async function verifyServed(siteId) {
  const url = `${STATIC}/api/manager-wordpress-properties/client-logo/${encodeURIComponent(siteId)}`;
  const res = await hubFetch(url, { cache: "no-store" });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.startsWith("image/")) throw new Error(`verify ${url} -> HTTP ${res.status} ${type}`);
  return type;
}

async function main() {
  const failures = [];
  const rows = [];
  const sites = DRY_RUN ? [] : await loadHubSites();
  const byId = new Map(sites.map((s) => [s.id, s]));

  for (const plan of CLIENT_LOGO_PLAN) {
    console.log(`${plan.name} (${plan.id}) box=${plan.box}`);
    try {
      const { mime, buf, ext } = await downloadLogo(plan.url);
      if (DRY_RUN) {
        rows.push({ ...plan, result: `ok ${mime} ${buf.length}B (dry run)` });
        continue;
      }
      await uploadToHub(plan.id, mime, buf);
      writeLocal(plan.id, ext, buf);
      const site = byId.get(plan.id);
      if (!site) throw new Error(`site ${plan.id} missing on hub`);
      site.clientLogoUrl = `/api/manager-wordpress-properties/client-logo/${plan.id}`;
      site.clientLogoSource = "manual";
      site.clientLogoFetchedAt = Date.now();
      site.clientLogoBoxTheme = plan.box;
      rows.push({ ...plan, result: `uploaded ${mime} ${buf.length}B` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(`${plan.name}: ${msg}`);
      rows.push({ ...plan, result: `FAIL ${msg}` });
    }
  }

  if (!DRY_RUN && failures.length === 0) {
    await saveHubSites(sites);
    console.log(`Saved ${sites.length} hub properties.`);
    for (const plan of CLIENT_LOGO_PLAN) {
      try {
        const type = await verifyServed(plan.id);
        rows.find((r) => r.id === plan.id).result += ` served ${type}`;
      } catch (e) {
        failures.push(e instanceof Error ? e.message : String(e));
      }
    }
  }

  console.log("");
  console.log("| Client | Box | Result |");
  console.log("| --- | --- | --- |");
  for (const r of rows) console.log(`| ${r.name} | ${r.box} | ${r.result} |`);
  if (failures.length) {
    console.error(`\n${failures.length} failure(s):\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
