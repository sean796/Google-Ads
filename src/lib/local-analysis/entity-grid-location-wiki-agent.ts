import type { GridKeywordWeight } from "@/lib/process-local-dominator-upload";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import type { GscSiteQueryRow } from "@/lib/competitor-research/types";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import type { SuggestedKeywordTarget } from "@/lib/local-analysis-suggest-keyword-targets";
import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import { checkWikipediaPageExists } from "@/lib/wikipedia/mediawiki-search";
import { fetchWikipediaIntroPlainText } from "@/lib/wikipedia/mediawiki-intro";
import {
  isAcceptedWikiPlaceValidation,
  validateWikipediaPlacePage,
  type WikiPlaceValidationTier,
} from "@/lib/wikipedia/validate-wikipedia-place-page-openrouter";
import {
  buildClusterWikiCandidateTiers,
  clusterCityWikiTitle,
  extractClusterWikiGeo,
  isCityLevelWikiTitle,
  isRejectedClusterWikiTitle,
  isRejectedNeighbourhoodWikiTitle,
} from "@/lib/local-analysis/cluster-wiki-candidates";
import { wikipediaArticleUrl } from "@/lib/wikipedia/wiki-urls";
import {
  buildCityLocationBucketsFromRows,
  buildGridLocationBucketsFromRows,
  cityBucketFromLocationLabel,
  type GridLocationBucket,
} from "@/lib/local-analysis/grid-location-buckets";
import { pickGridLocationBucketsFromSummary } from "@/lib/local-analysis/pick-grid-location-buckets-from-summary";
import { repairSapPageAllocationWeighted } from "@/lib/local-analysis-suggest-keyword-targets";
import {
  firstCityStateLabelFromAddress,
  isStreetCorridorPlaceLabel,
  type LocalDominatorRow,
} from "@/lib/local-dominator-csv";
import {
  LOCAL_ANALYSIS_SAP_MAX,
  LOCAL_ANALYSIS_SUGGEST_SAP_MIN_PER_TARGET,
} from "@/lib/local-analysis-target-constants";
import { entityTypeFocusWantsNeighbourhoods } from "@/lib/entity-geographic-level";
import { isLeakedInstructionEntityLabel } from "@/lib/local-analysis/entity-label-guards";
import { isCityLevelOnlyEntity } from "@/lib/local-analysis/entity-preload-suggested-keywords";
import { sapKeywordFromShortBaseAndEntity } from "@/lib/local-analysis/entity-sap-row-keyword-fill";
import {
  bucketPlaceHints,
  harvestWikiPlacesForCity,
  isWikiTitleScopedToParentCity,
  pickWikiEntriesFromPool,
  wikiEntryToGridClusterWiki,
  type WikiGeoEntry,
} from "@/lib/wikipedia/wiki-entity-pool";
import { isRejectedSapGridEntityLabel } from "@/lib/local-analysis/sap-grid-entity-reject";
import { appendMasterInstructionsToSystemPrompt } from "@/lib/master-instructions-storage";
import { openRouterAssistantTextFromMessage, postOpenRouterAppChat } from "@/lib/openrouter-app-api";

export { isCityLevelOnlyEntity };

const NEIGHBOURHOOD_PICK_SYSTEM = `Plan sub-ad neighbourhoods under one parent city ad group, ranked by POS (grid pin weakness).

Output **only** valid JSON:
{"parentCity":"City, ST","entities":[{"name":"Neighbourhood, City, ST","posWeight":12.5}, ...]}

Rules:
- \`parentCity\` must echo \`gridPlaceLabel\` (the parent MapPin city ad group).
- Return **exactly** \`count\` distinct sub-ads in \`entities\` — each a **child neighbourhood inside parentCity**, not a different city.
- **name:** first segment must be a **named community or consumer-facing place** (neighbourhood, district, park, mall, community centre), then city, then province/state (e.g. "Millwood, Altona, MB", "Altona Community Centre, Altona, MB"). **Not** a street token, civic number, or ordinal route (\`2 St\`, \`130 Ave\`).
- **Priority order for first segment:** (1) neighbourhoods and residential quarters; (2) business or historic districts; (3) parks, malls, community centres; (4) only if nothing else fits from grid evidence, a named corridor — never numbered routes or bare address fragments.
- **Never use:** police/sheriff/fire HQs, jails, courthouses, embassies, military bases, person names, crime/news events, abstract topics, or country names alone unless grid \`sampleAddresses\` name that local place.
- **posWeight:** positive number from grid POS — higher when more/weaker pins in \`sampleAddresses\` fall in that neighbourhood.
- **Forbidden:** parent city only (e.g. "Altona, MB"), directional composites ("South West Altona", "North East City"), street names, avenues, roads, highways, corridors, bare addresses.
- Use \`sampleAddresses\` and \`gridLocations\` to pick neighbourhoods that contain those pins within parentCity.
- Must **not** repeat any name in \`entitiesAlreadyUsed\` or within your own \`entities\` list.

**Client-aware entity preference (when \`clientAudienceContextMarkdown\` or \`entityTypeFocus\` is present):**
- Act as a **senior local SEO specialist**: prefer entities where this client's searchers **live, work, shop, commute, or book appointments**.
- Read **Client & site context** from the user payload. When the client serves **professional / B2B services** (accounting, tax, legal, advisory, consulting), **prioritize** business districts, downtown cores, commercial corridors, business parks, and industrial pockets; **deprioritize** individual schools, school districts, school boards, and campus-only labels.
- Grid pins near a school are **scan evidence only**; do not use the school as the entity unless client context is education-focused.
- When \`entityTypeFocus\` includes business or industrial types, reorder priority accordingly (business districts before residential quarters when both fit grid evidence).
- When no client context is provided, keep the default priority order above.

When \`wikipediaPool\` is in the user payload, every \`entities[].name\` MUST be copied **exactly** from one \`entityLabel\` in that list (same spelling and commas). Do not invent names outside the pool.`;

const DIRECTIONAL_COMPASS_PREFIX = /^(North|South)\s+(East|West)\s+/i;

/** Reject synthetic lat/lng quadrant labels (not real neighbourhoods). */
export function isDirectionalCompassPlaceLabel(label: string): boolean {
  return DIRECTIONAL_COMPASS_PREFIX.test(label.trim());
}

export type NeighbourhoodPick = {
  name: string;
  /** Relative POS weakness; higher → more pages in the AdGroup. */
  posWeight: number;
};

/** Service keyword + entity place (no duplicated city/neighbourhood tokens). */
export function combineKeywordWithFullEntity(baseKeyword: string, entity: string): string {
  return sapKeywordFromShortBaseAndEntity(baseKeyword, entity);
}

export type GridClusterWikipedia = {
  gridPlaceLabel: string;
  title: string;
  url: string;
};

type ResolvedGridCluster = {
  bucket: GridLocationBucket;
  entity: string;
  baseKeywords: string[];
  wiki: GridClusterWikipedia;
};

function sapMinPerClusterForBudget(totalSapBudget: number): number {
  return Math.min(LOCAL_ANALYSIS_SUGGEST_SAP_MIN_PER_TARGET, Math.max(1, totalSapBudget));
}

function maxClustersForBudget(totalSapBudget: number): number {
  if (totalSapBudget < 1) return 0;
  const minPer = sapMinPerClusterForBudget(totalSapBudget);
  return Math.max(1, Math.floor(totalSapBudget / minPer));
}

async function buildGridLocationBucketsWithSummaryFallback(args: {
  gridRows: LocalDominatorRow[];
  wantsNeighbourhoods: boolean;
  apiKey: string;
  siteId?: string;
  gridSummaryMarkdown: string;
  totalSapBudget: number;
  entityAdGroupCount?: number;
  businessName?: string;
  clientAudienceContextMarkdown?: string;
  entityTypeFocus?: readonly string[];
}): Promise<GridLocationBucket[]> {
  const fromRows = args.wantsNeighbourhoods
    ? buildCityLocationBucketsFromRows(args.gridRows)
    : buildGridLocationBucketsFromRows(args.gridRows);
  if (fromRows.length > 0) return fromRows;

  const bucketCount =
    args.entityAdGroupCount != null && args.entityAdGroupCount >= 1
      ? Math.floor(args.entityAdGroupCount)
      : maxClustersForBudget(args.totalSapBudget);

  return pickGridLocationBucketsFromSummary({
    apiKey: args.apiKey,
    siteId: args.siteId,
    gridSummaryMarkdown: args.gridSummaryMarkdown,
    gridRows: args.gridRows,
    bucketCount,
    wantsNeighbourhoods: args.wantsNeighbourhoods,
    businessName: args.businessName,
    clientAudienceContextMarkdown: args.clientAudienceContextMarkdown,
    entityTypeFocus: args.entityTypeFocus,
  });
}

function uniqueBucketsForClusters(buckets: GridLocationBucket[], clusterCap: number): GridLocationBucket[] {
  const cap = Math.max(1, clusterCap);
  const out: GridLocationBucket[] = [];
  const seen = new Set<string>();
  for (const bucket of buckets) {
    const key = bucket.placeLabel.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(bucket);
    if (out.length >= cap) break;
  }
  return out;
}

function sapPagesPerBucket(
  buckets: GridLocationBucket[],
  totalSapBudget: number,
): number[] {
  const minPer = sapMinPerClusterForBudget(totalSapBudget);
  const weights = buckets.map((b) => b.weight);
  const placeholders = buckets.map((bucket, i) => ({
    keyword: `cluster-${i}`,
    sapPages: minPer,
    entityHint: bucket.placeLabel,
  }));
  const allocated = repairSapPageAllocationWeighted(
    placeholders,
    weights,
    totalSapBudget,
    minPer,
    LOCAL_ANALYSIS_SAP_MAX,
  );
  const counts = allocated.map((r) => r.sapPages);
  return counts;
}

/** Repeat items in order until rowCount rows (reuse places when picks < slots). */
export function cycleItemsForRowCount<T>(items: readonly T[], rowCount: number): T[] {
  const n = Math.max(0, Math.floor(rowCount));
  if (n === 0 || items.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    out.push(items[i % items.length]!);
  }
  return out;
}

function assertNeighbourhoodSubAdEntity(
  entity: string,
  parentLabel: string,
  usedKeys: Set<string>,
): void {
  if (!entity) {
    throw new Error("Neighbourhood entity label is empty.");
  }
  if (isStreetCorridorPlaceLabel(entity)) {
    throw new Error(`Neighbourhood entity "${entity}" is a street corridor.`);
  }
  if (isDirectionalCompassPlaceLabel(entity)) {
    throw new Error(`Neighbourhood entity "${entity}" is a directional composite.`);
  }
  if (isCityLevelOnlyEntity(entity, parentLabel)) {
    throw new Error(`Neighbourhood entity "${entity}" is city-level only for ${parentLabel}.`);
  }
  if (isRejectedSapGridEntityLabel(entity)) {
    throw new Error(`Neighbourhood entity "${entity}" is not an allowed local grid place.`);
  }
  const key = entity.trim().toLowerCase();
  if (usedKeys.has(key)) {
    throw new Error(`Neighbourhood entity "${entity}" is already used in this run.`);
  }
}

/** Neighbourhood / district entities for a city grid bucket (Clusters + Entity preload). */
export type PickNeighbourhoodEntitiesOptions = {
  clientAudienceContextMarkdown?: string;
  entityTypeFocus?: readonly string[];
  wikipediaPool?: readonly { entityLabel: string; wikipediaTitle: string }[];
};

function neighbourhoodPicksFromOpenRouterContent(raw: string): NeighbourhoodPick[] {
  let text = raw.trim();
  if (!text) return [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]?.trim()) {
    text = fenced[1].trim();
  }
  const list: NeighbourhoodPick[] = [];
  const pushName = (name: string, posWeight?: unknown) => {
    const trimmedName = name.trim();
    if (!trimmedName || isLeakedInstructionEntityLabel(trimmedName)) return;
    if (isRejectedSapGridEntityLabel(trimmedName)) return;
    const w = Number(posWeight);
    list.push({
      name: trimmedName,
      posWeight: Number.isFinite(w) && w > 0 ? w : 1,
    });
  };
  try {
    const parsed = JSON.parse(text) as { entities?: unknown; entity?: unknown };
    if (Array.isArray(parsed.entities)) {
      for (const item of parsed.entities) {
        if (typeof item === "string") {
          pushName(item);
          continue;
        }
        if (item && typeof item === "object") {
          const rec = item as { name?: unknown; posWeight?: unknown; entity?: unknown };
          pushName(String(rec.name ?? rec.entity ?? ""), rec.posWeight);
        }
      }
    } else if (typeof parsed.entity === "string") {
      pushName(parsed.entity);
    }
  } catch {
    return [];
  }
  return list;
}

/** Harvested Wikipedia rows → neighbourhood picks (no second OpenRouter pass). */
export function neighbourhoodPicksFromWikiPool(
  pool: readonly { entityLabel: string }[],
  count: number,
  entitiesAlreadyUsed: readonly string[],
): NeighbourhoodPick[] {
  const need = Math.max(1, Math.floor(count));
  const used = new Set(entitiesAlreadyUsed.map((s) => s.trim().toLowerCase()).filter(Boolean));
  const picks: NeighbourhoodPick[] = [];
  const push = (raw: string) => {
    const name = normalizeEntityHintCommaLabel(raw.trim());
    if (!name || isLeakedInstructionEntityLabel(name)) return;
    if (isRejectedSapGridEntityLabel(name)) return;
    const key = name.toLowerCase();
    if (used.has(key)) return;
    used.add(key);
    picks.push({ name, posWeight: 1 });
  };
  for (const entry of pool) {
    if (picks.length >= need) break;
    push(entry.entityLabel);
  }
  if (pool.length === 0) return picks;
  let guard = 0;
  while (picks.length < need && guard < need * pool.length * 3) {
    const entry = pool[guard % pool.length]!;
    push(entry.entityLabel);
    guard += 1;
  }
  return picks.slice(0, need);
}

function neighbourhoodPicksFromChatResult(
  result: Awaited<ReturnType<typeof postOpenRouterAppChat>>,
): NeighbourhoodPick[] {
  const chunks: string[] = [];
  if (result.parsed && typeof result.parsed === "object" && !Array.isArray(result.parsed)) {
    chunks.push(JSON.stringify(result.parsed));
  }
  if (typeof result.content === "string" && result.content.trim()) {
    chunks.push(result.content);
  }
  const raw = result.raw;
  if (raw && typeof raw === "object") {
    const choices = Array.isArray((raw as { choices?: unknown }).choices)
      ? (raw as { choices: unknown[] }).choices
      : null;
    const message =
      choices?.[0] && typeof choices[0] === "object"
        ? (choices[0] as { message?: unknown }).message
        : undefined;
    const fromMessage = openRouterAssistantTextFromMessage(message);
    if (fromMessage.trim()) chunks.push(fromMessage);
  }
  for (const chunk of chunks) {
    const picks = neighbourhoodPicksFromOpenRouterContent(chunk);
    if (picks.length > 0) return picks;
  }
  return [];
}

export async function pickNeighbourhoodEntitiesForCluster(
  bucket: GridLocationBucket,
  gridLocations: string[],
  entitiesAlreadyUsed: string[],
  count: number,
  apiKey: string,
  siteId: string | undefined,
  options?: PickNeighbourhoodEntitiesOptions,
): Promise<NeighbourhoodPick[]> {
  const n = Math.max(1, Math.floor(count));
  const clientCtx = options?.clientAudienceContextMarkdown?.trim();
  const entityTypeFocus = options?.entityTypeFocus?.map((f) => f.trim()).filter(Boolean);
  const userPayload: Record<string, unknown> = {
    count: n,
    parentCity: bucket.placeLabel,
    gridPlaceLabel: bucket.placeLabel,
    sampleAddresses: bucket.sampleAddresses.slice(0, 8),
    gridLocations,
    entitiesAlreadyUsed,
    bucketWeight: bucket.weight,
    bucketAvgRank: bucket.avgRank,
  };
  if (clientCtx) userPayload.clientAudienceContextMarkdown = clientCtx;
  if (entityTypeFocus?.length) userPayload.entityTypeFocus = entityTypeFocus;
  const pool = options?.wikipediaPool?.filter((e) => e.entityLabel?.trim() && e.wikipediaTitle?.trim());
  if (pool?.length) userPayload.wikipediaPool = pool.slice(0, 80);

  const systemPrompt = appendMasterInstructionsToSystemPrompt(NEIGHBOURHOOD_PICK_SYSTEM, siteId ?? null);
  const result = await postOpenRouterAppChat({
    apiKey,
    model: getResearchModel(siteId),
    system: systemPrompt,
    user: JSON.stringify(userPayload),
    temperature: 0.2,
    responseFormat: { type: "json_object" },
  });
  let picks = neighbourhoodPicksFromChatResult(result).slice(0, n);
  const wikiPool = pool ?? options?.wikipediaPool;
  if (picks.length < n && wikiPool?.length) {
    const fromPool = neighbourhoodPicksFromWikiPool(
      wikiPool,
      n,
      [...entitiesAlreadyUsed, ...picks.map((p) => p.name)],
    );
    const seen = new Set(picks.map((p) => p.name.trim().toLowerCase()));
    for (const p of fromPool) {
      if (picks.length >= n) break;
      const key = p.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      picks.push(p);
    }
  }
  if (picks.length < n && wikiPool?.length) {
    picks = cycleItemsForRowCount(
      picks.length > 0 ? picks : neighbourhoodPicksFromWikiPool(wikiPool, 1, entitiesAlreadyUsed),
      n,
    );
  }
  return picks.slice(0, n);
}

/**
 * Split city-bucket SAP pages across neighbourhood AdGroups by POS weights.
 * Fewer AdGroups than pages so each group gets multiple keywords when budget allows.
 */
export function allocatePagesAcrossNeighbourhoodPicks(
  picks: NeighbourhoodPick[],
  totalPages: number,
): Array<{ entity: string; pages: number; posWeight: number }> {
  if (totalPages < 1 || picks.length === 0) return [];
  const groupCap = Math.min(picks.length, maxClustersForBudget(totalPages));
  const capped = picks.slice(0, Math.max(1, groupCap));
  const minPer = sapMinPerClusterForBudget(totalPages);
  const placeholders = capped.map((p, i) => ({
    keyword: p.name.trim() || `nh-${i}`,
    sapPages: minPer,
    entityHint: p.name.trim(),
  }));
  const weights = capped.map((p) => (p.posWeight > 0 ? p.posWeight : 1));
  const allocated = repairSapPageAllocationWeighted(
    placeholders,
    weights,
    totalPages,
    minPer,
    LOCAL_ANALYSIS_SAP_MAX,
  );
  return allocated.map((row, i) => ({
    entity: capped[i]?.name.trim() || row.entityHint || row.keyword,
    pages: row.sapPages,
    posWeight: capped[i]?.posWeight ?? 1,
  }));
}

function cityFromBucket(bucket: GridLocationBucket): string | null {
  for (const addr of bucket.sampleAddresses) {
    const city = firstCityStateLabelFromAddress(addr);
    if (city) return city;
  }
  const fromLabel = extractClusterWikiGeo(bucket.placeLabel);
  if (fromLabel) return `${fromLabel.city}, ${fromLabel.regionCode}`;
  return null;
}

/** Verified Wikipedia: neighbourhood → city + region → province. */
async function resolveClusterWiki(
  entity: string,
  bucket: GridLocationBucket,
  apiKey: string,
  siteId: string | undefined,
): Promise<GridClusterWikipedia> {
  const tiers = buildClusterWikiCandidateTiers(entity, bucket);
  const geo = tiers.geo;
  const model = getResearchModel(siteId);

  const tryCandidates = async (
    candidates: string[],
    reject: (title: string) => boolean,
    tier: WikiPlaceValidationTier,
  ): Promise<{ title: string; url: string; candidate: string } | null> => {
    for (const candidate of candidates) {
      const ex = await checkWikipediaPageExists(candidate);
      if (!ex.exists || !ex.title || !ex.url) continue;
      if (reject(ex.title)) continue;
      if (geo?.city) {
        const intro = await fetchWikipediaIntroPlainText(ex.title, 600);
        const validation = await validateWikipediaPlacePage({
          apiKey,
          model,
          siteId,
          entity,
          candidateTitle: candidate,
          resolvedTitle: ex.title,
          expectedCity: geo.city,
          expectedRegion: geo.regionName,
          intro,
        });
        if (!isAcceptedWikiPlaceValidation(validation, tier)) continue;
      }
      return { title: ex.title, url: ex.url, candidate };
    }
    return null;
  };

  const rejectCity = (title: string) => isRejectedClusterWikiTitle(title, geo);
  const rejectNeighbourhood = (title: string) => isRejectedNeighbourhoodWikiTitle(title, geo);

  const resolved =
    (await tryCandidates(tiers.neighbourhood, rejectNeighbourhood, "neighbourhood")) ??
    (await tryCandidates(tiers.city, rejectCity, "city"));

  if (resolved) {
    return {
      gridPlaceLabel: bucket.placeLabel,
      title: resolved.title,
      url: resolved.url,
    };
  }

  const cityTitle = geo
    ? clusterCityWikiTitle(geo)
    : tiers.city[0]?.trim() || cityFromBucket(bucket) || entity.trim() || bucket.placeLabel;
  return {
    gridPlaceLabel: bucket.placeLabel,
    title: cityTitle,
    url: wikipediaArticleUrl(cityTitle),
  };
}

async function resolveGridCluster(
  entity: string,
  bucket: GridLocationBucket,
  apiKey: string,
  siteId: string | undefined,
): Promise<GridClusterWikipedia> {
  return resolveClusterWiki(entity, bucket, apiKey, siteId);
}

/** Stamp the parent city article for wiki content. Entity stays the neighbourhood. */
export async function resolveNeighbourhoodWikiOnly(
  entity: string,
  bucket: GridLocationBucket,
  _apiKey: string,
  _siteId: string | undefined,
): Promise<GridClusterWikipedia | null> {
  return cityWikiStampFromParent(entity, bucket);
}

function cityWikiStampFromParent(
  entity: string,
  bucket: GridLocationBucket,
): GridClusterWikipedia | null {
  const tiers = buildClusterWikiCandidateTiers(entity, bucket);
  const title = tiers.city[0]?.trim() || (tiers.geo ? clusterCityWikiTitle(tiers.geo) : "");
  if (!title) return null;
  return {
    gridPlaceLabel: bucket.placeLabel,
    title,
    url: wikipediaArticleUrl(title),
  };
}

export type ResolveNeighbourhoodSapSlotsOptions = {
  gridRows: LocalDominatorRow[];
  adGroupCount: number;
  adsPerGroup: number;
  apiKey: string;
  siteId?: string;
  gridLocations: string[];
  gridSummaryMarkdown: string;
  wikipediaSearchAugment?: string;
  clientAudienceContextMarkdown?: string;
  entityTypeFocus?: readonly string[];
  onProgress?: (phase: string, completed?: number, total?: number) => void;
};

type SubAdSlot = { entity: string; wiki: GridClusterWikipedia };

type FillDistinctNeighbourhoodSlotsOptions = {
  bucket: GridLocationBucket;
  slotCount: number;
  gridRows: LocalDominatorRow[];
  gridLocations: string[];
  gridSummaryMarkdown: string;
  wikipediaSearchAugment?: string;
  apiKey: string;
  siteId?: string;
  clientAudienceContextMarkdown?: string;
  entityTypeFocus?: readonly string[];
  globalUsedKeys: Set<string>;
  globalUsedNames: string[];
  onProgress?: (phase: string, completed?: number, total?: number) => void;
  progressCompleted?: number;
  progressTotal?: number;
};

function isAcceptableSubAdEntity(
  entity: string,
  parentLabel: string,
  usedKeys: Set<string>,
): boolean {
  if (!entity || isLeakedInstructionEntityLabel(entity)) return false;
  if (isRejectedSapGridEntityLabel(entity)) return false;
  if (isStreetCorridorPlaceLabel(entity)) return false;
  if (isDirectionalCompassPlaceLabel(entity)) return false;
  if (isCityLevelOnlyEntity(entity, parentLabel)) return false;
  const key = entity.trim().toLowerCase();
  return !usedKeys.has(key);
}

function wikiGeoEntryForPickName(pool: readonly WikiGeoEntry[], pickName: string): WikiGeoEntry | undefined {
  const normalizedPick = normalizeEntityHintCommaLabel(pickName).trim().toLowerCase();
  if (!normalizedPick) return undefined;
  for (const entry of pool) {
    const label = normalizeEntityHintCommaLabel(entry.entityLabel).trim().toLowerCase();
    if (label === normalizedPick) return entry;
  }
  const head = normalizedPick.split(",")[0]?.trim() ?? "";
  if (!head) return undefined;
  for (const entry of pool) {
    const label = normalizeEntityHintCommaLabel(entry.entityLabel).trim().toLowerCase();
    if (label.startsWith(head)) return entry;
  }
  return undefined;
}

/** One distinct sub-ad entity per slot under a parent city bucket (Wikipedia harvest → AI pick). */
async function fillDistinctNeighbourhoodSlotsForBucket(
  options: FillDistinctNeighbourhoodSlotsOptions,
): Promise<SubAdSlot[]> {
  const {
    bucket,
    gridLocations,
    gridSummaryMarkdown,
    wikipediaSearchAugment,
    apiKey,
    siteId,
    clientAudienceContextMarkdown,
    entityTypeFocus,
    globalUsedKeys,
    globalUsedNames,
    onProgress,
    progressCompleted = 0,
    progressTotal,
  } = options;
  const ads = Math.max(1, Math.floor(options.slotCount));
  const parentLabel = normalizeEntityHintCommaLabel(
    cityFromBucket(bucket) ?? bucket.placeLabel.trim(),
  );
  if (!parentLabel) {
    return [];
  }

  const localHints = bucketPlaceHints(bucket);

  onProgress?.(`Harvesting Wikipedia places for ${parentLabel}`, progressCompleted, progressTotal);

  const harvestMin = Math.max(ads, 12);
  const harvestHints = [
    ...new Set([...localHints, ...gridLocations.map((s) => s.trim()).filter(Boolean)].slice(0, 48)),
  ];
  const { pool: rawPool } = await harvestWikiPlacesForCity({
    bucket,
    gridPlaceHints: harvestHints.length > 0 ? harvestHints : localHints,
    minCount: harvestMin,
    wikipediaSearchAugment,
  });

  onProgress?.(`Selecting ${ads} neighbourhoods for ${parentLabel}`, progressCompleted, progressTotal);

  let pickedFromPool: WikiGeoEntry[] = [];
  if (rawPool.length > 0 && apiKey.trim() && gridSummaryMarkdown.trim()) {
    pickedFromPool = await pickWikiEntriesFromPool({
      pool: rawPool,
      count: ads,
      parentCity: parentLabel,
      sampleAddresses: bucket.sampleAddresses,
      gridLocations: harvestHints.length > 0 ? harvestHints : localHints,
      gridSummaryMarkdown,
      excludeTitles: globalUsedNames,
      apiKey,
      siteId,
      clientAudienceContextMarkdown,
      entityTypeFocus,
    });
  }

  const nhPicks: NeighbourhoodPick[] =
    pickedFromPool.length > 0
      ? pickedFromPool.map((e) => ({
          name: normalizeEntityHintCommaLabel(e.entityLabel) || e.entityLabel.trim(),
          posWeight: 1,
        }))
      : neighbourhoodPicksFromWikiPool(
          rawPool.map((e) => ({ entityLabel: e.entityLabel })),
          ads,
          globalUsedNames,
        );

  let picks = nhPicks.filter((p) => p.name.trim() && !isRejectedSapGridEntityLabel(p.name));
  if (picks.length < ads) {
    picks = cycleItemsForRowCount(
      picks.length > 0 ? picks : [{ name: parentLabel, posWeight: 1 }],
      ads,
    );
  }

  const slots: SubAdSlot[] = [];
  for (const pick of picks.slice(0, ads)) {
    const entity = normalizeEntityHintCommaLabel(pick.name) || pick.name.trim();
    if (!entity || isRejectedSapGridEntityLabel(entity)) continue;
    const matched = wikiGeoEntryForPickName(rawPool, entity) ?? pickedFromPool.find(
      (e) =>
        normalizeEntityHintCommaLabel(e.entityLabel).trim().toLowerCase() === entity.trim().toLowerCase(),
    );
    let wiki: GridClusterWikipedia | null = matched
      ? wikiEntryToGridClusterWiki(matched, bucket.placeLabel)
      : null;
    if (!wiki) {
      wiki = await resolveNeighbourhoodWikiOnly(entity, bucket, apiKey, siteId);
    }
    if (!wiki) {
      wiki = cityWikiStampFromParent(entity, bucket);
    }
    if (!wiki) {
      const title = matched?.wikipediaTitle?.trim() || entity.split(",")[0]?.trim() || entity;
      wiki = {
        gridPlaceLabel: bucket.placeLabel,
        title,
        url: wikipediaArticleUrl(title),
      };
    }
    const key = entity.trim().toLowerCase();
    globalUsedKeys.add(key);
    globalUsedNames.push(entity);
    slots.push({ entity, wiki });
    if (slots.length >= ads) break;
  }

  if (slots.length > 0 && slots.length < ads) {
    return cycleItemsForRowCount(slots, ads);
  }

  return slots.slice(0, ads);
}

/** OpenRouter plans sub-ads per parent city; every slot gets a distinct entity and Wikipedia stamp. */
export async function resolveNeighbourhoodSapSlotsForLayout(
  options: ResolveNeighbourhoodSapSlotsOptions,
): Promise<CSVRow[]> {
  const {
    gridRows,
    apiKey,
    siteId,
    gridLocations,
    gridSummaryMarkdown,
    wikipediaSearchAugment,
    clientAudienceContextMarkdown,
    entityTypeFocus,
    onProgress,
  } = options;
  const groups = Math.max(1, Math.floor(options.adGroupCount));
  const ads = Math.max(1, Math.floor(options.adsPerGroup));
  const total = groups * ads;

  if (!apiKey.trim()) {
    throw new Error("OpenRouter API key is required to plan neighbourhood sub-ads.");
  }
  if (gridRows.length === 0) {
    throw new Error("Grid CSV has no rows for neighbourhood planning.");
  }

  const allBuckets = await buildGridLocationBucketsWithSummaryFallback({
    gridRows,
    wantsNeighbourhoods: true,
    apiKey,
    siteId,
    gridSummaryMarkdown,
    totalSapBudget: groups * ads,
    entityAdGroupCount: groups,
    clientAudienceContextMarkdown,
    entityTypeFocus,
  });
  if (allBuckets.length === 0) {
    throw new Error("No city buckets found in grid. Check Address column or grid summary.");
  }

  const rankedBuckets = uniqueBucketsForClusters(allBuckets, allBuckets.length);
  const bucketsToRun = cycleItemsForRowCount(rankedBuckets, groups);
  const usedKeys = new Set<string>();
  const usedNames: string[] = [];
  const out: CSVRow[] = [];

  for (let g = 0; g < bucketsToRun.length; g++) {
    const bucket = bucketsToRun[g]!;
    const parentLabel = normalizeEntityHintCommaLabel(
      cityFromBucket(bucket) ?? bucket.placeLabel.trim(),
    );
    if (!parentLabel) continue;

    onProgress?.(`Planning sub-ads for ${parentLabel}`, out.length, total);

    const slots = await fillDistinctNeighbourhoodSlotsForBucket({
      bucket,
      slotCount: ads,
      gridRows,
      gridLocations,
      gridSummaryMarkdown,
      wikipediaSearchAugment,
      apiKey,
      siteId,
      clientAudienceContextMarkdown,
      entityTypeFocus,
      globalUsedKeys: usedKeys,
      globalUsedNames: usedNames,
      onProgress,
      progressCompleted: out.length,
      progressTotal: total,
    });

    for (const row of slots) {
      out.push({
        keyword: "",
        entity: row.entity,
        ad_group_label: parentLabel,
        title: "",
        modifier: "",
        featuredImage: "google-maps",
        wikipedia_url: row.wiki.url,
        wikipedia_title: row.wiki.title,
      });
    }
  }

  if (out.length !== total) {
    throw new Error(`Planned ${out.length} of ${total} sub-ad slots. Check grid Address column and entity type focus.`);
  }

  return out;
}

function buildWikiMarkdown(entries: GridClusterWikipedia[]): string {
  const lines = ["**Grid cluster Wikipedia (neighbourhood articles):**", ""];
  for (const e of entries) {
    lines.push(`### ${e.title}`);
    lines.push(`- Grid pins: ${e.gridPlaceLabel}`);
    lines.push(`- URL: ${e.url}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}

function clusterSapRowsFromResolved(clusters: ResolvedGridCluster[]): CSVRow[] {
  const out: CSVRow[] = [];
  for (const c of clusters) {
    const subEntity = normalizeEntityHintCommaLabel(c.entity);
    const parentLabel = normalizeEntityHintCommaLabel(
      cityFromBucket(c.bucket) ?? c.bucket.placeLabel.trim(),
    );
    const adGroupLabel =
      parentLabel && subEntity && parentLabel.toLowerCase() !== subEntity.toLowerCase()
        ? parentLabel
        : undefined;
    for (const _baseKeyword of c.baseKeywords) {
      out.push({
        keyword: "",
        entity: subEntity,
        ...(adGroupLabel ? { ad_group_label: adGroupLabel } : {}),
        title: "",
        modifier: "",
        featuredImage: "google-maps",
        wikipedia_url: c.wiki.url,
        wikipedia_title: c.wiki.title,
      });
    }
  }
  return out;
}

/** Stamp verified Wikipedia on rows whose entity is the neighbourhood article title. */
export function applyGridClusterWikipediaToSapRows(
  rows: CSVRow[],
  clusterWikipedia: GridClusterWikipedia[],
): CSVRow[] {
  const byTitle = new Map(clusterWikipedia.map((w) => [w.title.trim().toLowerCase(), w]));
  return rows.map((row) => {
    if (row.wikipedia_url?.trim()) return row;
    const key = (row.entity ?? "").trim().toLowerCase();
    const wiki = byTitle.get(key);
    if (!wiki) return row;
    return {
      ...row,
      wikipedia_url: wiki.url,
      wikipedia_title: wiki.title,
    };
  });
}

export type EntityGridLocationClusterResult = {
  suggestedTargets: SuggestedKeywordTarget[];
  sapRows: CSVRow[];
  wikiEntityPoolTitles: string[];
  wikiMarkdown: string;
  bucketsUsed: GridLocationBucket[];
  clusterWikipedia: GridClusterWikipedia[];
};

export type EntityLocationClusterFromBucketsOptions = {
  apiKey: string;
  siteId?: string;
  buckets: GridLocationBucket[];
  gscQueries?: GscSiteQueryRow[];
  gridLocations: string[];
  gridSummaryMarkdown: string;
  wikipediaSearchAugment?: string;
  totalSapBudget: number;
  /** When set with entityAdsPerGroup, use explicit Ad groups × Ads layout instead of weighted split. */
  entityAdGroupCount?: number;
  entityAdsPerGroup?: number;
  entityGeographicLevel?: import("@/lib/entity-geographic-level").EntityGeographicLevel;
  entityTypeFocus?: string[];
  businessName?: string;
  siteName?: string;
  clientAudienceContextMarkdown?: string;
  gridRows?: LocalDominatorRow[];
  gridFallbackKeywordBases?: readonly string[];
  /** Existing entity labels from entity sitemap / origin ACF to exclude during clustering. */
  entitiesAlreadyUsedFromSitemap?: readonly string[];
  onClusterProgress?: (done: number, total: number, placeLabel: string, cumulativeSapRows: number) => void;
  /** Human-readable phase labels for long wiki harvest / pick steps. */
  onClusterPhase?: (phase: string) => void;
};

export type EntityGridLocationClusterOptions = EntityLocationClusterFromBucketsOptions & {
  gridRows: LocalDominatorRow[];
  gridKeywordWeights: GridKeywordWeight[];
  /** City, ST from the site profile or Location field when no grid CSV. */
  profileLocationLabel?: string;
  profileSampleAddress?: string;
};

function explicitLayoutSapCounts(adGroupCount: number, adsPerGroup: number): number[] {
  const groups = Math.max(1, Math.floor(adGroupCount) || 1);
  const ads = Math.max(1, Math.floor(adsPerGroup) || 1);
  return Array.from({ length: groups }, () => ads);
}

function explicitLayoutRowBudget(adGroupCount: number, adsPerGroup: number): number {
  return explicitLayoutSapCounts(adGroupCount, adsPerGroup).reduce((sum, n) => sum + n, 0);
}

export async function runEntityLocationClusterFromBuckets(
  options: EntityLocationClusterFromBucketsOptions,
): Promise<EntityGridLocationClusterResult> {
  const {
    apiKey,
    siteId,
    buckets: allBuckets,
    gridLocations,
    totalSapBudget,
    entityAdGroupCount,
    entityAdsPerGroup,
    entityTypeFocus,
    clientAudienceContextMarkdown,
    gridRows,
    gridSummaryMarkdown,
    wikipediaSearchAugment,
    entitiesAlreadyUsedFromSitemap,
    onClusterProgress,
    onClusterPhase,
  } = options;
  if (!apiKey.trim()) {
    throw new Error("OpenRouter API key is required for neighbourhood clustering.");
  }
  if (allBuckets.length === 0) {
    throw new Error("No location buckets found for clustering.");
  }

  const wantsNeighbourhoods = entityTypeFocusWantsNeighbourhoods(entityTypeFocus);
  const hasExplicitLayout =
    entityAdGroupCount != null &&
    entityAdsPerGroup != null &&
    entityAdGroupCount >= 1 &&
    entityAdsPerGroup >= 1;
  const clusterCap = hasExplicitLayout
    ? Math.max(1, Math.floor(entityAdGroupCount))
    : maxClustersForBudget(totalSapBudget);

  const candidateBuckets = hasExplicitLayout
    ? uniqueBucketsForClusters(allBuckets, allBuckets.length)
    : uniqueBucketsForClusters(allBuckets, clusterCap);
  if (candidateBuckets.length === 0) {
    throw new Error("No unique grid locations for clusters.");
  }

  const sapCounts = hasExplicitLayout
    ? explicitLayoutSapCounts(entityAdGroupCount!, entityAdsPerGroup!)
    : sapPagesPerBucket(candidateBuckets, totalSapBudget);
  const bucketsToRun = hasExplicitLayout
    ? cycleItemsForRowCount(candidateBuckets, sapCounts.length)
    : candidateBuckets.slice(0, sapCounts.length);
  const maxClusters = bucketsToRun.length;
  const entitiesUsed: string[] = [];
  const usedKeys = new Set<string>();
  for (const label of entitiesAlreadyUsedFromSitemap ?? []) {
    const trimmed = label.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    entitiesUsed.push(trimmed);
  }

  const clusterPlans: Array<{
    bucket: GridLocationBucket;
    entity: string;
    baseKeywords: string[];
    sapPageCount: number;
    wiki?: GridClusterWikipedia;
  }> = [];
  let cumulativeSapRows = 0;

  for (let i = 0; i < bucketsToRun.length; i++) {
    const bucket = bucketsToRun[i]!;
    const sapPageCount = sapCounts[i] ?? LOCAL_ANALYSIS_SUGGEST_SAP_MIN_PER_TARGET;
    const cityLabel = cityFromBucket(bucket) ?? bucket.placeLabel.trim();

    if (wantsNeighbourhoods) {
      if (hasExplicitLayout) {
        const parentLabel = normalizeEntityHintCommaLabel(cityLabel);
        const slots = await fillDistinctNeighbourhoodSlotsForBucket({
          bucket,
          slotCount: sapPageCount,
          gridRows: gridRows ?? [],
          gridLocations,
          gridSummaryMarkdown,
          wikipediaSearchAugment,
          apiKey,
          siteId,
          clientAudienceContextMarkdown,
          entityTypeFocus,
          globalUsedKeys: usedKeys,
          globalUsedNames: entitiesUsed,
          onProgress: (phase) => onClusterPhase?.(phase),
        });
        for (const slot of slots) {
          clusterPlans.push({
            bucket,
            entity: slot.entity,
            baseKeywords: [""],
            sapPageCount: 1,
            wiki: slot.wiki,
          });
          cumulativeSapRows += 1;
          onClusterProgress?.(i + 1, maxClusters, slot.entity, cumulativeSapRows);
        }
        continue;
      }

      const neighbourhoodPickCount = Math.max(1, maxClustersForBudget(sapPageCount));
      const slots = await fillDistinctNeighbourhoodSlotsForBucket({
        bucket,
        slotCount: neighbourhoodPickCount,
        gridRows: gridRows ?? [],
        gridLocations,
        gridSummaryMarkdown,
        wikipediaSearchAugment,
        apiKey,
        siteId,
        clientAudienceContextMarkdown,
        entityTypeFocus,
        globalUsedKeys: usedKeys,
        globalUsedNames: entitiesUsed,
        onProgress: (phase) => onClusterPhase?.(phase),
      });
      const wikiByEntity = new Map(slots.map((s) => [s.entity, s.wiki]));
      const validPicks: NeighbourhoodPick[] = slots.map((s) => ({ name: s.entity, posWeight: 1 }));
      const allocations = allocatePagesAcrossNeighbourhoodPicks(validPicks, sapPageCount);
      for (const alloc of allocations) {
        const pages = Math.max(1, alloc.pages);
        clusterPlans.push({
          bucket,
          entity: alloc.entity,
          baseKeywords: Array.from({ length: pages }, () => ""),
          sapPageCount: pages,
          wiki: wikiByEntity.get(alloc.entity),
        });
        cumulativeSapRows += pages;
        onClusterProgress?.(i + 1, maxClusters, alloc.entity, cumulativeSapRows);
      }
      continue;
    }

    const entity = normalizeEntityHintCommaLabel(bucket.placeLabel.trim()) || bucket.placeLabel.trim();
    entitiesUsed.push(entity);
    clusterPlans.push({
      bucket,
      entity,
      baseKeywords: Array.from({ length: sapPageCount }, () => ""),
      sapPageCount,
    });
    cumulativeSapRows += sapPageCount;
    onClusterProgress?.(i + 1, maxClusters, entity || bucket.placeLabel, cumulativeSapRows);
  }

  if (clusterPlans.length === 0) {
    throw new Error(
      wantsNeighbourhoods
        ? "No neighbourhood entities returned. Neighbourhoods focus does not use city-level ad groups."
        : "No location clusters produced.",
    );
  }

  const resolvedClusters: ResolvedGridCluster[] = clusterPlans
    .filter((plan): plan is typeof plan & { wiki: GridClusterWikipedia } => Boolean(plan.wiki))
    .map((plan) => ({
      bucket: plan.bucket,
      entity: plan.entity,
      baseKeywords: plan.baseKeywords,
      wiki: plan.wiki,
    }));

  const suggestedTargets: SuggestedKeywordTarget[] = resolvedClusters.map((c) => ({
    keyword: combineKeywordWithFullEntity(c.baseKeywords[0] ?? "", c.entity),
    sapPages: c.baseKeywords.length,
    entityHint: c.entity,
    clusterId: c.bucket.bucketId,
    clusterRole: "seed" as const,
  }));

  const clusterWikipedia = resolvedClusters.map((r) => r.wiki);
  let sapRows = clusterSapRowsFromResolved(resolvedClusters);
  if (hasExplicitLayout) {
    const targetRows = explicitLayoutRowBudget(entityAdGroupCount!, entityAdsPerGroup!);
    if (sapRows.length !== targetRows) {
      throw new Error(`Grid clustering produced ${sapRows.length} of ${targetRows} configured entity rows.`);
    }
  }

  onClusterProgress?.(resolvedClusters.length, resolvedClusters.length, "", sapRows.length);

  return {
    suggestedTargets,
    sapRows,
    wikiEntityPoolTitles: clusterWikipedia.map((w) => w.title),
    wikiMarkdown: buildWikiMarkdown(clusterWikipedia),
    bucketsUsed: resolvedClusters.map((r) => r.bucket),
    clusterWikipedia,
  };
}

export async function runEntityGridLocationClusterAgent(
  options: EntityGridLocationClusterOptions,
): Promise<EntityGridLocationClusterResult> {
  const {
    gridRows,
    entityTypeFocus,
    apiKey,
    siteId,
    gridSummaryMarkdown,
    totalSapBudget,
    entityAdGroupCount,
    businessName,
    clientAudienceContextMarkdown,
    profileLocationLabel,
    profileSampleAddress,
    ...rest
  } = options;
  if (gridRows.length === 0) {
    const label = profileLocationLabel?.trim();
    if (!label) {
      throw new Error("No city on this site profile for location clustering.");
    }
    return runEntityLocationClusterFromBuckets({
      ...rest,
      apiKey,
      siteId,
      gridSummaryMarkdown,
      totalSapBudget,
      entityAdGroupCount,
      businessName,
      clientAudienceContextMarkdown,
      entityTypeFocus,
      buckets: [cityBucketFromLocationLabel(label, profileSampleAddress)],
      gridRows: [],
    });
  }
  const wantsNeighbourhoods = entityTypeFocusWantsNeighbourhoods(entityTypeFocus);
  const allBuckets = await buildGridLocationBucketsWithSummaryFallback({
    gridRows,
    wantsNeighbourhoods,
    apiKey,
    siteId,
    gridSummaryMarkdown,
    totalSapBudget,
    entityAdGroupCount,
    businessName,
    clientAudienceContextMarkdown,
    entityTypeFocus,
  });
  if (allBuckets.length === 0) {
    throw new Error("No grid location buckets found from CSV or scan summary.");
  }
  return runEntityLocationClusterFromBuckets({
    ...rest,
    apiKey,
    siteId,
    gridSummaryMarkdown,
    totalSapBudget,
    entityAdGroupCount,
    businessName,
    clientAudienceContextMarkdown,
    entityTypeFocus,
    buckets: allBuckets,
    gridRows,
  });
}
