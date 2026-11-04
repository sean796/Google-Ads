#!/usr/bin/env node
/**
 * Create and persist a Local Grid workspace panel for every location of every client site
 * using each site's primaryLocalKeyword and the standard 7x7 circle / 1 mi setup (49 pins).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEED_PATH = path.join(REPO_ROOT, "src/components/integrations/default-properties-seed.json");
const BASE = (process.env.NEO_PULSE_BASE || "http://127.0.0.1:8080").replace(/\/$/, "");

/** Exact verified coordinates for every client location. */
const VERIFIED_COORDS = {
  "Plum Coulee, Manitoba": { lat: 49.188, lng: -97.7671 },
  "Winkler, Manitoba": { lat: 49.1871, lng: -97.9376 },
  "Morden, Manitoba": { lat: 49.1927, lng: -98.1015 },
  "Winnipeg, Manitoba": { lat: 49.8955, lng: -97.1385 },
  "10615 170 St NW, Edmonton, Alberta": { lat: 53.5504, lng: -113.6143 },
  "8005 Emerald Dr Unit 110, Sherwood Park, Alberta": { lat: 53.5594, lng: -113.2878 },
  "8708 48 Ave NW #103, Edmonton, Alberta": { lat: 53.4856, lng: -113.4616 },
  "9771 54 Ave, Edmonton, Alberta": { lat: 53.4892, lng: -113.4835 },
  "Edmonton, Alberta": { lat: 53.5461, lng: -113.4938 },
  "Sherwood Park, Alberta": { lat: 53.5257, lng: -113.2966 },
  "St. Albert, Alberta": { lat: 53.6332, lng: -113.6288 },
  "Fort Saskatchewan, Alberta": { lat: 53.7031, lng: -113.1943 },
  "Calgary, Alberta": { lat: 51.0552, lng: -114.1059 },
  "Cochrane, Alberta": { lat: 51.1875, lng: -114.4711 },
  "Airdrie, Alberta": { lat: 51.286, lng: -114.0106 },
  "Marietta, Georgia": { lat: 34.0342, lng: -84.5262 },
  "Dacula, Georgia": { lat: 34.0664, lng: -83.9121 },
  "Ellijay, Georgia": { lat: 34.6806, lng: -84.4915 },
  "Manteca, California": { lat: 37.7974, lng: -121.233 },
  "Elk Grove, California": { lat: 38.409, lng: -121.4101 },
  "Livermore, California": { lat: 37.6803, lng: -121.767 },
  "Stuart, Florida": { lat: 27.1754, lng: -80.234 },
  "Port St. Lucie, Florida": { lat: 27.2112, lng: -80.3267 },
  "185 E Indiantown Rd STE 213, Jupiter, Florida": { lat: 26.9342, lng: -80.0913 },
  "Jupiter, Florida": { lat: 26.9342, lng: -80.0942 },
  "Palm Beach Gardens, Florida": { lat: 26.8234, lng: -80.1387 },
  "Yellowknife, Northwest Territories": { lat: 62.454, lng: -114.3718 },
  "Naples, Florida": { lat: 26.2929, lng: -81.8012 },
  "Estero, Florida": { lat: 26.4381, lng: -81.8068 },
  "Rocklin, California": { lat: 38.7966, lng: -121.2858 },
  "Folsom, California": { lat: 38.6848, lng: -121.1788 },
  "Sacramento, California": { lat: 38.5811, lng: -121.4939 },
  "Litchfield Park, Arizona": { lat: 33.4932, lng: -112.3458 },
  "Scottsdale, Arizona": { lat: 33.7001, lng: -111.9255 },
  "Phoenix, Arizona": { lat: 33.4484, lng: -112.0741 },
  "Brandon, Manitoba": { lat: 49.8465, lng: -99.9996 },
  "Minnedosa, Manitoba": { lat: 50.2499, lng: -99.8385 },
  "Clear Lake, Manitoba": { lat: 50.6594, lng: -99.9922 },
};

async function geocodeLocation(loc) {
  const addrKey = loc.address ? `${loc.address}, ${loc.city}, ${loc.state}` : "";
  if (addrKey && VERIFIED_COORDS[addrKey]) {
    return VERIFIED_COORDS[addrKey];
  }
  const cityKey = `${loc.city}, ${loc.state}`;
  if (VERIFIED_COORDS[cityKey]) {
    return VERIFIED_COORDS[cityKey];
  }
  const cleanStreet = String(loc.address || "")
    .replace(/\b(?:suite|ste|unit|#)\s*[a-z0-9-]+\b/gi, "")
    .trim();
  const fullAddr = [cleanStreet, loc.city, loc.state, loc.zip, loc.country].filter(Boolean).join(", ");
  try {
    const res = await fetch(`${BASE}/api/organic-dashboard/local-grid/geocode-address`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: fullAddr,
        city: loc.city,
        state: loc.state,
        zip: loc.zip,
        country: loc.country,
      }),
    });
    const data = await res.json();
    if (res.ok && data.ok && typeof data.latitude === "number" && typeof data.longitude === "number") {
      return { lat: data.latitude, lng: data.longitude };
    }
  } catch (err) {
    throw new Error(`Geocode failed for ${fullAddr}: ${err instanceof Error ? err.message : err}`);
  }
  throw new Error(`Geocode returned no coordinates for ${fullAddr}`);
}

function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function main() {
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, "utf8")).sites || [];
  const loadRes = await fetch(`${BASE}/api/manager-wordpress-properties/load?_=${Date.now()}`).then((r) => r.json());
  const sites = (loadRes.sites && loadRes.sites.length > 0 ? loadRes.sites : seed);

  // Ensure Shutter Spot is included if missing from server load
  for (const s of seed) {
    if (!sites.some((x) => x.id === s.id || x.siteUrl === s.siteUrl)) {
      sites.push(s);
    }
  }

  for (const site of sites) {
    const kw = (site.primaryLocalKeyword || "").trim();
    if (!kw) {
      console.error(`[ERROR] ${site.name}: primaryLocalKeyword is empty in profile settings; skipped.`);
      continue;
    }
    const locs = site.locations && site.locations.length > 0 ? site.locations : site.napInfo?.locations || [];
    if (locs.length === 0) continue;

    const panels = [];
    for (let i = 0; i < locs.length; i++) {
      const loc = locs[i];
      const coords = await geocodeLocation(loc);
      const addrLabel = [loc.address, loc.city, loc.state, loc.zip].filter(Boolean).join(", ");
      const businessName = loc.name || site.napInfo?.name || site.name;
      const publicUrl = (site.productionSiteUrl || site.siteUrl || "").trim();

      const activeBusiness = {
        key: `biz:${site.id}:loc:${i + 1}`,
        business: businessName,
        address: addrLabel,
        placeId: site.gbpLocationId?.trim() || "",
        cid: site.gbpLocationId?.trim() || "",
        websiteUrl: publicUrl,
        primaryCategory: "",
        secondaryCategories: "",
        rating: null,
        reviews: null,
        latitude: coords.lat,
        longitude: coords.lng,
      };

      const panelId = `grid_${site.id}_loc_${i + 1}`;
      panels.push({
        id: panelId,
        siteId: site.id,
        layoutLocked: false,
        layoutSnapshot: {
          keyword: kw,
          centerLat: coords.lat,
          centerLng: coords.lng,
          scanSize: "7x7",
          shape: "circle",
          distance: 1,
          distanceMeasure: "mile",
          activeBusiness,
          activeScanId: null,
        },
      });
    }

    const workspaceDoc = {
      version: 1,
      updatedAt: new Date().toISOString(),
      activePanelId: panels[0].id,
      panels,
    };

    const saveRes = await fetch(`${BASE}/api/organic-dashboard/local-grid/workspace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: site.id, workspace: workspaceDoc }),
    }).then((r) => r.json());

    console.log(
      `${site.name} (${site.id}): saved ${panels.length} grid(s) [${kw}] ->`,
      panels.map((p) => `${p.layoutSnapshot.activeBusiness.address} (${p.layoutSnapshot.centerLat.toFixed(4)}, ${p.layoutSnapshot.centerLng.toFixed(4)})`).join(" | "),
      saveRes.ok ? "OK" : saveRes.error,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
