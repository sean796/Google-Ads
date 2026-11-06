import {
  buildCityLocationBucketsFromRows,
  type GridLocationBucket,
} from "@/lib/local-analysis/grid-location-buckets";
import type { LocalDominatorRow } from "@/lib/local-dominator-csv";
import {
  buildClusterWikiCandidateTiers,
  type ClusterWikiGeo,
} from "@/lib/local-analysis/cluster-wiki-candidates";
import { searchWikipediaPages } from "@/lib/wikipedia/mediawiki-search";
import { isLocalGridWikiConsoleTraceActive, localGridWikiConsoleLog } from "@/lib/local-grid-studio/local-grid-wiki-console-trace";
import {
  bucketPlaceHints,
  cityGeoFromBucket,
  entityLabelFromWikiTitle,
  wikiPoolEntriesForParentCity,
  wikiUrlFromTitle,
  type HarvestWikiPlacesResult,
  type WikiGeoEntry,
  type WikiGeoTier,
} from "./wiki-entity-pool-geo";

function withSearchAugment(query: string, augment?: string): string {
  const q = query.trim();
  const aug = augment?.trim();
  if (!aug) return q;
  return `${q} ${aug}`;
}

function addTitlesToPool(
  titles: string[],
  tier: WikiGeoTier,
  pool: Map<string, WikiGeoEntry>,
  geo: ClusterWikiGeo | null,
): void {
  for (const raw of titles) {
    const title = raw.trim();
    if (!title) continue;
    const key = title.toLowerCase();
    if (pool.has(key)) continue;
    pool.set(key, {
      wikipediaTitle: title,
      wikipediaUrl: wikiUrlFromTitle(title),
      entityLabel: entityLabelFromWikiTitle(title, geo),
      tier,
    });
  }
}

function harvestPoolTarget(minCount: number): number {
  return Math.max(minCount + 2, Math.min(36, minCount * 5));
}

function harvestQueryCap(minCount: number, queryCount: number): number {
  if (minCount <= 1) return Math.min(4, queryCount);
  if (minCount <= 3) return Math.min(8, queryCount);
  if (minCount <= 9) return Math.min(14, queryCount);
  return queryCount;
}

function harvestLimitPerQuery(minCount: number, defaultLimit: number): number {
  if (minCount <= 1) return Math.min(8, defaultLimit);
  if (minCount <= 3) return Math.min(15, defaultLimit);
  return defaultLimit;
}

async function collectFromQueries(
  queries: string[],
  tier: WikiGeoTier,
  pool: Map<string, WikiGeoEntry>,
  geo: ClusterWikiGeo | null,
  limitPerQuery: number,
  wikipediaSearchAugment?: string,
  poolTarget?: number,
): Promise<void> {
  const trace = isLocalGridWikiConsoleTraceActive();
  const target = poolTarget ?? Number.POSITIVE_INFINITY;
  if (trace) {
    localGridWikiConsoleLog(`collectFromQueries start (${tier})`, {
      queryCount: queries.length,
      limitPerQuery,
      poolSizeBefore: pool.size,
      poolTarget: Number.isFinite(target) ? target : null,
    });
  }
  for (let i = 0; i < queries.length; i++) {
    if (pool.size >= target) break;
    const query = queries[i]!;
    const q = withSearchAugment(query, wikipediaSearchAugment);
    if (!q) continue;
    const before = pool.size;
    const titles = await searchWikipediaPages(q, limitPerQuery);
    addTitlesToPool(titles, tier, pool, geo);
    if (trace) {
      localGridWikiConsoleLog(`collectFromQueries [${i + 1}/${queries.length}] ${tier}`, {
        query: q,
        newTitles: pool.size - before,
        poolSize: pool.size,
      });
    }
  }
  if (trace) {
    localGridWikiConsoleLog(`collectFromQueries done (${tier})`, { poolSize: pool.size });
  }
}

function tier1PlaceQueries(geo: ClusterWikiGeo, bucketHints: string[]): string[] {
  const { city, regionName, regionCode } = geo;
  const cityRegion = `${city}, ${regionName}`;
  const cityRegionCode = `${city}, ${regionCode}`;
  const queries = [
    `${city}, ${regionName} neighbourhoods`,
    `${city}, ${regionCode} neighbourhoods`,
    `neighbourhoods in ${city}, ${regionName}`,
    `neighborhoods in ${city}, ${regionCode}`,
    `${city} neighbourhoods ${regionName}`,
    `${city} neighborhood ${regionCode}`,
    `${city} communities ${regionName}`,
    `${city} districts ${regionCode}`,
    `${city} suburbs ${regionName}`,
    cityRegion,
    cityRegionCode,
    ...buildClusterWikiCandidateTiers("", {
      bucketId: "",
      placeLabel: cityRegion,
      weight: 1,
      avgRank: 0,
      rowCount: 0,
      sampleAddresses: [],
    }).neighbourhood,
  ];
  for (const hint of bucketHints) {
    const h = hint.trim();
    if (!h) continue;
    queries.push(`${h}, ${city}, ${regionCode}`);
    queries.push(`${h} ${city} ${regionName}`);
  }
  return [...new Set(queries.map((q) => q.trim()).filter(Boolean))];
}

function tier2BuildingQueries(geo: ClusterWikiGeo): string[] {
  const { city, regionName, regionCode } = geo;
  return [
    `${city}, ${regionName} business district`,
    `${city}, ${regionName} commercial district`,
    `downtown ${city}, ${regionName}`,
    `${city}, ${regionName} industrial park`,
    `${city}, ${regionName} shopping mall`,
    `shopping centers in ${city}, ${regionCode}`,
    `${city}, ${regionName} buildings`,
    `buildings in ${city}, ${regionCode}`,
    `${city}, ${regionName} parks`,
    `parks in ${city}, ${regionName}`,
    `${city}, ${regionName} exhibition centre`,
    `${city}, ${regionName} civic centre`,
    `${city}, ${regionName} community centre`,
    `${city}, ${regionName} historic sites`,
  ];
}

/** Reject homonym Wikipedia titles (e.g. "Sherwood" when parent city is Sherwood Park). */
function bucketAddressQueries(bucket: GridLocationBucket, geo: ClusterWikiGeo): string[] {
  const queries: string[] = [];
  for (const addr of bucket.sampleAddresses.slice(0, 10)) {
    const segment = addr.split(",")[0]?.trim() ?? "";
    if (!segment || /^\d/.test(segment)) continue;
    queries.push(`${segment}, ${geo.city}, ${geo.regionCode}`);
    queries.push(`${segment} ${geo.city} ${geo.regionName}`);
  }
  return [...new Set(queries)];
}

/** Extra harvest queries for small hamlets / rural city buckets with few neighbourhood articles. */
function ruralHamletPlaceQueries(geo: ClusterWikiGeo, bucket: GridLocationBucket): string[] {
  const { city, regionName, regionCode } = geo;
  const queries = [
    `${city}, ${regionName}`,
    `${city} ${regionName}`,
    `${city}, ${regionCode}`,
    `${city} ${regionCode} Canada`,
    `${city} community ${regionName}`,
  ];
  const regionUpper = regionCode.trim().toUpperCase();
  if (regionUpper === "MB") {
    queries.push(
      `${city} Manitoba`,
      `Rural Municipality of Rhineland ${regionName}`,
      `Pembina Valley ${city}`,
      `Pembina Valley Region ${regionName}`,
    );
  }
  for (const addr of bucket.sampleAddresses.slice(0, 8)) {
    const parts = addr.split(",").map((s) => s.trim()).filter(Boolean);
    for (const part of parts.slice(0, 3)) {
      if (!part || /^\d/.test(part)) continue;
      queries.push(`${part} ${regionName}`);
      queries.push(`${part}, ${regionCode}`);
    }
  }
  return [...new Set(queries.map((q) => q.trim()).filter(Boolean))];
}

export async function harvestWikiPlacesForCity(args: {
  bucket: GridLocationBucket;
  gridPlaceHints: string[];
  minCount: number;
  wikipediaSearchAugment?: string;
}): Promise<HarvestWikiPlacesResult> {
  const minCount = Math.max(1, Math.floor(args.minCount));
  const geo = cityGeoFromBucket(args.bucket);
  if (!geo) {
    return { pool: [], tier1Count: 0, tier2Count: 0 };
  }

  const parentLabel = `${geo.city}, ${geo.regionCode}`;
  const hints = bucketPlaceHints(args.bucket).slice(0, 24);
  const augment = args.wikipediaSearchAugment;
  const pool = new Map<string, WikiGeoEntry>();

  if (isLocalGridWikiConsoleTraceActive()) {
    localGridWikiConsoleLog("harvestWikiPlacesForCity start", {
      parentLabel,
      minCount,
      hintCount: hints.length,
      wikipediaSearchAugment: augment ?? null,
      bucketPlaceLabel: args.bucket.placeLabel,
    });
  }

  const poolTarget = harvestPoolTarget(minCount);
  const tier1All = tier1PlaceQueries(geo, hints);
  const tier1Queries = tier1All.slice(0, harvestQueryCap(minCount, tier1All.length));
  const tier1Limit = harvestLimitPerQuery(minCount, 40);

  await collectFromQueries(tier1Queries, "place", pool, geo, tier1Limit, augment, poolTarget);
  const tier1Count = pool.size;

  if (pool.size < poolTarget) {
    const tier2All = tier2BuildingQueries(geo);
    const tier2 = tier2All.slice(0, harvestQueryCap(minCount, tier2All.length));
    await collectFromQueries(
      tier2,
      "building_landmark",
      pool,
      geo,
      harvestLimitPerQuery(minCount, 40),
      augment,
      poolTarget,
    );
  }
  if (pool.size < poolTarget && minCount > 1) {
    const addrAll = bucketAddressQueries(args.bucket, geo);
    const addrQ = addrAll.slice(0, harvestQueryCap(minCount, addrAll.length));
    await collectFromQueries(
      addrQ,
      "place",
      pool,
      geo,
      harvestLimitPerQuery(minCount, 30),
      augment,
      poolTarget,
    );
  }
  if (pool.size < poolTarget && minCount > 3) {
    const ruralAll = ruralHamletPlaceQueries(geo, args.bucket);
    const ruralQ = ruralAll.slice(0, harvestQueryCap(minCount, ruralAll.length));
    await collectFromQueries(
      ruralQ,
      "place",
      pool,
      geo,
      harvestLimitPerQuery(minCount, 30),
      augment,
      poolTarget,
    );
  }

  const tier2Count = pool.size - tier1Count;
  const filtered = wikiPoolEntriesForParentCity([...pool.values()], parentLabel, geo);

  if (isLocalGridWikiConsoleTraceActive()) {
    localGridWikiConsoleLog("harvestWikiPlacesForCity done", {
      parentLabel,
      tier1Count,
      tier2Count,
      rawPool: pool.size,
      filteredPool: filtered.length,
      sampleTitles: filtered.slice(0, 8).map((e) => e.wikipediaTitle),
    });
  }

  return {
    pool: filtered,
    tier1Count,
    tier2Count,
  };
}

/** Wikipedia article titles from tiered harvest (for strategy prompts and preferred-title resolution). */
export async function harvestWikiPoolTitlesFromGridRows(args: {
  rows: LocalDominatorRow[];
  gridPlaceHints: string[];
  minCount: number;
  wikipediaSearchAugment?: string;
}): Promise<string[]> {
  const buckets = buildCityLocationBucketsFromRows(args.rows);
  const bucket = buckets[0];
  if (!bucket) return [];
  const { pool } = await harvestWikiPlacesForCity({
    bucket,
    gridPlaceHints: args.gridPlaceHints,
    minCount: args.minCount,
    wikipediaSearchAugment: args.wikipediaSearchAugment,
  });
  return pool.map((e) => e.wikipediaTitle);
}
