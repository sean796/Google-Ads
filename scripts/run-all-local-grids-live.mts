#!/usr/bin/env tsx
/**
 * Run live Local Grid scans (7x7 circle, 3 mi, 37 pins) for every location panel
 * of every client property, save the completed scan documents to the server,
 * and update each workspace panel's activeScanId and resolved targetBusiness.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateLocalGridCoordinates } from "../src/lib/local-grid-studio/local-grid-math";
import {
  aggregateLocalGridScan,
  buildCanonicalBusinessKey,
} from "../src/lib/local-grid-studio/local-grid-aggregator";
import type {
  LocalGridBusinessIdentity,
  LocalGridCoordinateNode,
  LocalGridPointResult,
  LocalGridScanDocument,
  LocalGridScanSize,
  LocalGridShape,
  LocalGridDistanceMeasure,
} from "../src/lib/local-grid-studio/local-grid-types";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEED_PATH = path.join(REPO_ROOT, "src/components/integrations/default-properties-seed.json");
const BASE = (process.env.NEO_PULSE_BASE || "http://127.0.0.1:8080").replace(/\/$/, "");

async function scanBatchOnServer(
  keyword: string,
  points: LocalGridCoordinateNode[],
): Promise<LocalGridPointResult[]> {
  const res = await fetch(`${BASE}/api/organic-dashboard/local-grid/scan-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      keyword,
      points,
      zoom: 14,
      languageCode: "en",
    }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    error?: string;
    results?: LocalGridPointResult[];
  };
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `scan-batch HTTP ${res.status}`);
  }
  return data.results ?? [];
}

async function resolveBusinessOnServer(params: {
  siteId: string;
  siteName: string;
  siteUrl: string;
  gbpLocationId?: string;
  address?: string;
  locationCoordinate: string;
}): Promise<LocalGridBusinessIdentity | null> {
  try {
    const res = await fetch(`${BASE}/api/organic-dashboard/local-grid/resolve-business`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId: params.siteId,
        siteName: params.siteName,
        napName: params.siteName,
        siteUrl: params.siteUrl,
        gbpLocationId: params.gbpLocationId,
        address: params.address,
        locationCoordinate: params.locationCoordinate,
        languageCode: "en",
        forceRefresh: true,
      }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      business?: Omit<LocalGridBusinessIdentity, "key"> | null;
    };
    if (res.ok && data.ok && data.business) {
      return {
        ...data.business,
        key: buildCanonicalBusinessKey(data.business),
      };
    }
  } catch {
    /* fallback to SERP match */
  }
  return null;
}

async function runFullScanForPanel(
  site: {
    id: string;
    name: string;
    siteUrl: string;
    productionSiteUrl?: string;
    gbpLocationId?: string;
  },
  panelIndex: number,
  panel: {
    id: string;
    siteId: string;
    layoutLocked: boolean;
    layoutSnapshot: {
      keyword: string;
      centerLat: number;
      centerLng: number;
      scanSize: LocalGridScanSize;
      shape: LocalGridShape;
      distance: number;
      distanceMeasure: LocalGridDistanceMeasure;
      activeBusiness: LocalGridBusinessIdentity;
      activeScanId: string | null;
    };
  },
): Promise<{
  scanId: string;
  avgRank: number;
  tarp: number;
  rankedPoints: number;
  totalPoints: number;
  resolvedBusiness: LocalGridBusinessIdentity;
}> {
  const snap = panel.layoutSnapshot;
  const kw = snap.keyword.trim();
  if (!kw) throw new Error(`Panel ${panel.id} has no keyword; set primaryLocalKeyword in profile settings.`);
  const publicUrl = (site.productionSiteUrl || site.siteUrl || "").trim();
  const addressLabel = snap.activeBusiness?.address?.trim() || "";

  // Check if activeScanId already exists and has valid points
  if (snap.activeScanId) {
    try {
      const existingRes = await fetch(
        `${BASE}/api/organic-dashboard/local-grid/scan?siteId=${encodeURIComponent(site.id)}&scanId=${encodeURIComponent(snap.activeScanId)}`,
      ).then((r) => r.json());
      if (
        existingRes.ok &&
        existingRes.scan &&
        String(existingRes.scan.scanDateIso ?? "").slice(0, 10) === new Date().toISOString().slice(0, 10) &&
        Array.isArray(existingRes.scan.points) &&
        existingRes.scan.points.length >= 20 &&
        existingRes.scan.points.some((p: LocalGridPointResult) => Array.isArray(p.items) && p.items.length > 0)
      ) {
        const doc = existingRes.scan as LocalGridScanDocument;
        const agg = aggregateLocalGridScan(doc.points, doc.targetBusiness);
        console.log(
          `  [SKIP - ALREADY LIVE] ${site.name} (${addressLabel}) -> scanId=${doc.scanId}, TARP=${agg.summary.tarp.toFixed(2)}, Ranked=${agg.summary.rankedPoints}/${agg.summary.totalPoints}`,
        );
        return {
          scanId: doc.scanId,
          avgRank: agg.summary.avgRank,
          tarp: agg.summary.tarp,
          rankedPoints: agg.summary.rankedPoints,
          totalPoints: agg.summary.totalPoints,
          resolvedBusiness: {
            ...doc.targetBusiness,
            address: addressLabel || doc.targetBusiness.address,
          },
        };
      }
    } catch {
      /* proceed with fresh scan */
    }
  }

  const nodes = generateLocalGridCoordinates({
    centerLat: snap.centerLat,
    centerLng: snap.centerLng,
    scanSize: snap.scanSize || "7x7",
    shape: snap.shape || "circle",
    distance: snap.distance || 3,
    distanceMeasure: snap.distanceMeasure || "mile",
  });

  // Resolve target business + run all 37 pin batches in parallel (5 batches of up to 8 points)
  const batchChunks: LocalGridCoordinateNode[][] = [];
  for (let i = 0; i < nodes.length; i += 8) {
    batchChunks.push(nodes.slice(i, i + 8));
  }

  const [dfsResolvedBiz, ...batchResults] = await Promise.all([
    resolveBusinessOnServer({
      siteId: site.id,
      siteName: site.name,
      siteUrl: publicUrl,
      gbpLocationId: site.gbpLocationId,
      address: addressLabel,
      locationCoordinate: `${snap.centerLat},${snap.centerLng},14z`,
    }),
    ...batchChunks.map((chunk) => scanBatchOnServer(kw, chunk)),
  ]);

  const allPoints: LocalGridPointResult[] = batchResults.flat();

  // Build targetBusiness with websiteUrl and canonical key so domain/CID/name matching works
  let targetBusiness: LocalGridBusinessIdentity = dfsResolvedBiz
    ? {
        ...dfsResolvedBiz,
        address: addressLabel || dfsResolvedBiz.address,
        websiteUrl: dfsResolvedBiz.websiteUrl || publicUrl,
      }
    : {
        ...snap.activeBusiness,
        business: snap.activeBusiness?.business || site.name,
        address: addressLabel,
        websiteUrl: snap.activeBusiness?.websiteUrl || publicUrl,
        placeId: "",
        cid: "",
      };
  targetBusiness.key = buildCanonicalBusinessKey(targetBusiness);

  let agg = aggregateLocalGridScan(allPoints, targetBusiness);
  if (agg.summary.rankedPoints === 0 && agg.competitors.length > 0) {
    const cleanSiteName = site.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    const firstToken = cleanSiteName.split(" ")[0] || "";
    const bestComp = agg.competitors.find((c) => {
      const cName = c.business.toLowerCase();
      return (
        (cleanSiteName && cName.includes(cleanSiteName)) ||
        (firstToken.length >= 4 && cName.includes(firstToken) && c.websiteUrl.toLowerCase().includes(firstToken))
      );
    });
    if (bestComp) {
      targetBusiness = {
        ...bestComp,
        address: addressLabel || bestComp.address,
      };
      agg = aggregateLocalGridScan(allPoints, targetBusiness);
    }
  }

  const scanId = `scan_${Date.now()}_${panelIndex + 1}`;
  const now = new Date();
  const scanDateIso = now.toISOString();
  const scanDateLabel = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const completedDoc: LocalGridScanDocument = {
    scanId,
    siteId: site.id,
    scanDateIso,
    scanDateLabel,
    keyword: kw,
    scanSize: snap.scanSize || "7x7",
    shape: snap.shape || "circle",
    distance: snap.distance || 3,
    distanceMeasure: snap.distanceMeasure || "mile",
    centerLat: snap.centerLat,
    centerLng: snap.centerLng,
    targetBusiness,
    points: allPoints,
    summary: agg.summary,
  };

  const saveRes = await fetch(`${BASE}/api/organic-dashboard/local-grid/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ siteId: site.id, scan: completedDoc }),
  }).then((r) => r.json());

  if (!saveRes.ok) {
    throw new Error(`Failed to save scan ${scanId} for ${site.name}`);
  }

  console.log(
    `  [LIVE SCAN DONE] ${site.name} (${addressLabel}) [${kw}] -> scanId=${scanId}, TARP=${agg.summary.tarp.toFixed(2)}, AvgRank=${agg.summary.avgRank.toFixed(2)}, Ranked=${agg.summary.rankedPoints}/${agg.summary.totalPoints}`,
  );

  return {
    scanId,
    avgRank: agg.summary.avgRank,
    tarp: agg.summary.tarp,
    rankedPoints: agg.summary.rankedPoints,
    totalPoints: agg.summary.totalPoints,
    resolvedBusiness: targetBusiness,
  };
}

async function main() {
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, "utf8")).sites || [];
  const loadRes = await fetch(`${BASE}/api/manager-wordpress-properties/load?_=${Date.now()}`).then((r) =>
    r.json(),
  );
  const sites = loadRes.sites && loadRes.sites.length > 0 ? loadRes.sites : seed;
  for (const s of seed) {
    if (!sites.some((x: { id: string; siteUrl: string }) => x.id === s.id || x.siteUrl === s.siteUrl)) {
      sites.push(s);
    }
  }

  console.log(`Starting live Local Grid scans across ${sites.length} properties...`);

  for (const site of sites) {
    const wsRes = await fetch(
      `${BASE}/api/organic-dashboard/local-grid/workspace?siteId=${encodeURIComponent(site.id)}`,
    ).then((r) => r.json());
    const ws = wsRes.workspace;
    if (!ws || !Array.isArray(ws.panels) || ws.panels.length === 0) {
      console.log(`Skipping ${site.name}: no workspace panels.`);
      continue;
    }

    console.log(`\n=== ${site.name} (${ws.panels.length} locations) ===`);
    for (let i = 0; i < ws.panels.length; i++) {
      const panel = ws.panels[i];
      if (!panel.layoutSnapshot) continue;
      try {
        const res = await runFullScanForPanel(site, i, panel);
        panel.layoutSnapshot.activeScanId = res.scanId;
        panel.layoutSnapshot.activeBusiness = res.resolvedBusiness;
      } catch (err) {
        console.error(`  [ERROR] ${site.name} panel ${panel.id}:`, err instanceof Error ? err.message : err);
      }
    }

    ws.updatedAt = new Date().toISOString();
    await fetch(`${BASE}/api/organic-dashboard/local-grid/workspace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: site.id, workspace: ws }),
    });
  }

  console.log("\nAll client location grids have been scanned live and saved.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
