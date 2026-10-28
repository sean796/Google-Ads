import type { GridLocationBucket } from "@/lib/local-analysis/grid-location-buckets";
import { buildCityLocationBucketsFromRows } from "@/lib/local-analysis/grid-location-buckets";
import type { LocalDominatorRow } from "@/lib/local-dominator-csv";
import {
  buildClusterWikiCandidateTiers,
  extractClusterWikiGeo,
  isRejectedNeighbourhoodWikiTitle,
  type ClusterWikiGeo,
} from "@/lib/local-analysis/cluster-wiki-candidates";
import { firstCityStateLabelFromAddress } from "@/lib/local-dominator-csv";
import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { searchWikipediaPages } from "@/lib/wikipedia/mediawiki-search";
import { matchTitleInList } from "@/lib/wikipedia/entity-hint-openrouter";
import { appendMasterInstructionsToSystemPrompt } from "@/lib/master-instructions-storage";
import { isLocalGridWikiConsoleTraceActive, localGridWikiConsoleLog } from "@/lib/local-grid-studio/local-grid-wiki-console-trace";
import {
  isRejectedSapGridEntityLabel,
  isRejectedSapGridWikiTitle,
} from "@/lib/local-analysis/sap-grid-entity-reject";

export type WikiGeoTier = "place" | "building_landmark";

export type WikiGeoEntry = {
  wikipediaTitle: string;
  wikipediaUrl: string;
  entityLabel: string;
  tier: WikiGeoTier;
};

export type HarvestWikiPlacesResult = {
  pool: WikiGeoEntry[];
  tier1Count: number;
  tier2Count: number;
};

function wikiUrlFromTitle(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, "_"))}`;
}

export function entityLabelFromWikiTitle(title: string, geo: ClusterWikiGeo | null): string {
  const t = title.trim();
  if (!t) return "";
  if (geo && t.includes(",")) {
    return t;
  }
  if (geo) {
    return `${t}, ${geo.city}, ${geo.regionCode}`;
  }
  return t;
}

export function isListIndexWikiTitle(title: string): boolean {
  return title.trim().toLowerCase().startsWith("list of");
}

/** Reject org/gov/conference/news titles that are not physical places. */
export function isRejectedNonPlaceWikiTitle(title: string): boolean {
  if (isRejectedSapGridWikiTitle(title)) return true;
  const lower = title.trim().toLowerCase();
  if (!lower) return true;
  if (/\bconference\b/.test(lower)) return true;
  if (/\bdepartment of\b/.test(lower)) return true;
  if (/\bministry of\b/.test(lower)) return true;
  if (/\bjustice\b/.test(lower) && !/\bpark\b/.test(lower)) return true;
  if (/\bmurder\b/.test(lower)) return true;
  if (/\bshooting\b/.test(lower)) return true;
  if (/\btrial\b/.test(lower)) return true;
  if (/\bdisaster\b/.test(lower)) return true;
  if (/\baccident\b/.test(lower)) return true;
  if (/^block settlement\b/.test(lower)) return true;
  return false;
}

function isCityOnlyWikiTitle(title: string, geo: ClusterWikiGeo): boolean {
  const lower = title.trim().toLowerCase();
  return (
    lower === `${geo.city}, ${geo.regionName}`.toLowerCase()
    || lower === `${geo.city}, ${geo.regionCode}`.toLowerCase()
    || lower === geo.city.toLowerCase()
  );
}

/** Entity label must name a place inside parentCity (not a different city in the grid list). */
export function entityBelongsToParentCity(entity: string, parentLabel: string): boolean {
  const parentGeo = extractClusterWikiGeo(parentLabel);
  if (!parentGeo) return true;
  const norm = normalizeEntityHintCommaLabel(entity);
  const parts = norm.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  const parentCity = parentGeo.city.toLowerCase();
  if (parts.length === 2) {
    const first = parts[0]!.toLowerCase();
    const second = parts[1]!.toLowerCase();
    if (second === parentCity) return true;
    if (second === parentGeo.regionCode.toLowerCase() || second === parentGeo.regionName.toLowerCase()) {
      return first === parentCity;
    }
    return first === parentCity;
  }
  if (parts.length >= 3) {
    return parts[parts.length - 2]!.toLowerCase() === parentCity;
  }
  return parts[0]!.toLowerCase() === parentCity;
}

/** Keep only neighbourhood/building titles scoped to this parent city bucket. */
export function wikiPoolEntriesForParentCity(
  pool: WikiGeoEntry[],
  parentLabel: string,
  geo: ClusterWikiGeo,
): WikiGeoEntry[] {
  return pool.filter((entry) => {
    if (isListIndexWikiTitle(entry.wikipediaTitle)) return false;
    if (isRejectedNonPlaceWikiTitle(entry.wikipediaTitle)) return false;
    if (isRejectedNeighbourhoodWikiTitle(entry.wikipediaTitle, geo)) return false;
    if (isCityOnlyWikiTitle(entry.wikipediaTitle, geo)) return false;
    const entity = normalizeEntityHintCommaLabel(entry.entityLabel);
    if (!entity || isRejectedSapGridEntityLabel(entity)) return false;
    return entityBelongsToParentCity(entity, parentLabel);
  });
}

/** Place hints from this bucket only (not the whole grid export). */
export function bucketPlaceHints(bucket: GridLocationBucket): string[] {
  const out = new Set<string>();
  for (const addr of bucket.sampleAddresses) {
    const citySt = firstCityStateLabelFromAddress(addr);
    if (citySt) out.add(citySt);
  }
  const label = bucket.placeLabel.trim();
  if (label) out.add(label);
  return [...out];
}

function cityGeoFromBucket(bucket: GridLocationBucket): ClusterWikiGeo | null {
  for (const addr of bucket.sampleAddresses) {
    const citySt = firstCityStateLabelFromAddress(addr);
    if (citySt) {
      const geo = extractClusterWikiGeo(citySt);
      if (geo) return geo;
    }
  }
  const label = bucket.placeLabel.trim();
  return extractClusterWikiGeo(label) ?? extractClusterWikiGeo(`${label}, MB`);
}

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
export function isWikiTitleScopedToParentCity(title: string, parentLabel: string): boolean {
  const geo = extractClusterWikiGeo(parentLabel);
  if (!geo) return true;
  const t = title.trim();
  if (!t) return false;
  if (t.includes(",")) return true;
  const city = geo.city.trim();
  const cityLower = city.toLowerCase();
  const titleLower = t.toLowerCase();
  if (titleLower.includes(cityLower)) return true;
  if (city.includes(" ") && titleLower.length < cityLower.length) {
    const firstWord = cityLower.split(/\s+/)[0] ?? "";
    if (firstWord && titleLower === firstWord) return false;
  }
  return true;
}

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

function stripJsonFence(text: string): string {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

const SYS_PICK_POOL = `You choose Wikipedia article titles for local service-area entity pages under ONE parent city ad group.

Read the **Grid scan** block in the user message FIRST. That block defines the geographic footprint (centroid, bounding box, pin addresses, country/region).

Then read the numbered Wikipedia title list. Every title in the list is already inside **Parent city**. Pick exactly the requested count from that list ONLY.

ALLOWED (you may pick):
- Neighbourhoods, districts, communities, suburbs, hamlets within the parent city
- Parks, squares, waterfronts, plazas in the parent city
- Buildings, malls, civic centres, exhibition halls, landmarks, historic sites in the parent city

FORBIDDEN (never pick, even if listed):
- A different city, town, or region (e.g. Winkler, Morden, Winnipeg when parent city is Altona)
- Places in a different country (homonym cities abroad)
- Murders, deaths, crimes, trials, disasters, accidents, shootings, news events
- Biographies of people, companies, conferences, religious organizations, sports teams
- Law enforcement and emergency HQs (police department, sheriff, jail, prison, fire department as an org)
- Government offices (city hall, courthouse, embassy, military base) unless the client is public-sector
- Abstract topics (multiculturalism, ideologies) and person surnames used as the place name
- "List of …" index pages
- Anything that is not a physical place or building in the parent city

Prefer neighbourhoods, suburbs, and residential communities where the client's customers live. Malls and parks are OK; police stations and courthouses are not.

**Client-aware preference (when Client & site context is in the user message):**
- Act as a **senior local SEO specialist**: re-rank among allowed titles to match **who** the client serves and **where** those people work, shop, or commute.
- For **professional / B2B services** (accounting, tax, legal, advisory): prefer business districts, historic districts, commercial corridors, and business parks over residential neighbourhoods; **do not pick** individual schools, school districts, or school board articles unless client context is education-focused.
- When **entity type focus** includes business or industrial types, prioritize matching district and corridor titles from the list.
- Grid evidence near a school is footprint context only; do not pick the school article as the entity for non-education clients.

Reply ONLY valid JSON: {"titles":["Exact Title From List", ...]}
Copy each title exactly as shown in the numbered list. Never invent a title not in the list.`;

export async function pickWikiEntriesFromPool(args: {
  pool: WikiGeoEntry[];
  count: number;
  parentCity: string;
  sampleAddresses: string[];
  gridLocations: string[];
  gridSummaryMarkdown: string;
  excludeTitles: readonly string[];
  apiKey: string;
  siteId?: string;
  clientAudienceContextMarkdown?: string;
  entityTypeFocus?: readonly string[];
}): Promise<WikiGeoEntry[]> {
  const count = Math.max(1, Math.floor(args.count));
  const exclude = new Set(args.excludeTitles.map((t) => t.trim().toLowerCase()).filter(Boolean));

  const byTitle = new Map(args.pool.map((e) => [e.wikipediaTitle.toLowerCase(), e]));
  const excludeLabels = new Set(
    args.excludeTitles.map((t) => t.trim().toLowerCase()).filter(Boolean),
  );
  const available = args.pool.filter((e) => {
    if (exclude.has(e.wikipediaTitle.toLowerCase())) return false;
    const labelKey = normalizeEntityHintCommaLabel(e.entityLabel).trim().toLowerCase();
    if (labelKey && excludeLabels.has(labelKey)) return false;
    if (isRejectedSapGridWikiTitle(e.wikipediaTitle)) return false;
    if (isRejectedSapGridEntityLabel(e.entityLabel)) return false;
    return isWikiTitleScopedToParentCity(e.wikipediaTitle, args.parentCity);
  });
  if (available.length === 0) return [];

  const n = Math.min(count, available.length);
  const candidates = available.map((e) => e.wikipediaTitle);
  if (isLocalGridWikiConsoleTraceActive()) {
    localGridWikiConsoleLog("OpenRouter pickWikiEntriesFromPool →", {
      parentCity: args.parentCity,
      pickCount: n,
      poolAvailable: available.length,
      excludeCount: exclude.size,
    });
  }
  const list = candidates.slice(0, 80).map((t, i) => `${i + 1}. ${t}`).join("\n");
  const gridBlock = args.gridSummaryMarkdown.trim();
  const clientCtx = args.clientAudienceContextMarkdown?.trim();
  const entityTypeFocus = args.entityTypeFocus?.map((f) => f.trim()).filter(Boolean);
  const clientBlock =
    clientCtx || entityTypeFocus?.length
      ? `\n--- Client & site context (preference for which places to prioritize) ---\n${
          clientCtx ?? ""
        }${
          entityTypeFocus?.length
            ? `\n- **Entity type emphasis:** ${entityTypeFocus.join(", ")}`
            : ""
        }\n`
      : "";
  const user = `--- Grid scan (read this first) ---
${gridBlock}
${clientBlock}
--- Pick request ---
Parent city: ${args.parentCity}
Count: ${n}
Sample addresses in this city ad group: ${args.sampleAddresses.slice(0, 8).join(" | ")}
Place names in this city ad group: ${args.gridLocations.slice(0, 12).join(", ")}

Every pick must be a physical place inside **${args.parentCity}** only. Do not pick other cities from the wider grid scan.

Read the grid scan above, then pick exactly ${n} distinct ALLOWED physical-place titles from this Wikipedia list (copy exactly):

${list}

Return JSON only: {"titles":["...", ...]} with length ${n}.`;

  const { streamChatCompletion } = await import("@/lib/api");
  const systemPrompt = appendMasterInstructionsToSystemPrompt(SYS_PICK_POOL, args.siteId ?? null);
  let out = "";
  await streamChatCompletion({
    apiKey: args.apiKey,
    model: getResearchModel(args.siteId),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: user },
    ],
    temperature: 0.15,
    maxTokens: 800,
    topP: 0.9,
    onContentChunk: (c) => {
      out += c;
    },
  });

  let titles: string[] = [];
  try {
    const parsed = JSON.parse(stripJsonFence(out)) as { titles?: unknown };
    if (Array.isArray(parsed.titles)) {
      titles = parsed.titles
        .filter((t): t is string => typeof t === "string" && t.trim() !== "")
        .map((t) => t.trim());
    }
  } catch {
    const m = stripJsonFence(out).match(/"titles"\s*:\s*\[([\s\S]*?)\]/);
    if (m?.[1]) {
      titles = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]!.trim()).filter(Boolean);
    }
  }

  const picked: WikiGeoEntry[] = [];
  const seen = new Set<string>();
  for (const raw of titles) {
    if (picked.length >= count) break;
    const matched =
      matchTitleInList(JSON.stringify({ chosen: raw }), candidates) ??
      candidates.find((c) => c.toLowerCase() === raw.toLowerCase());
    if (!matched) continue;
    const key = matched.toLowerCase();
    if (seen.has(key) || exclude.has(key)) continue;
    const entry = byTitle.get(key);
    if (!entry) continue;
    seen.add(key);
    picked.push(entry);
  }

  const result = picked.slice(0, count);
  if (isLocalGridWikiConsoleTraceActive()) {
    localGridWikiConsoleLog("OpenRouter pickWikiEntriesFromPool ←", {
      requested: count,
      parsedTitleCount: titles.length,
      picked: result.length,
      titles: result.map((e) => e.wikipediaTitle),
    });
  }

  return result;
}

export function wikiEntryToGridClusterWiki(
  entry: WikiGeoEntry,
  gridPlaceLabel: string,
): { gridPlaceLabel: string; title: string; url: string } {
  return {
    gridPlaceLabel,
    title: entry.wikipediaTitle,
    url: entry.wikipediaUrl,
  };
}
