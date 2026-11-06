import { getResearchModel } from "@/lib/optimization-settings-storage";
import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import { repairSapPageAllocationWeighted } from "@/lib/local-analysis-suggest-keyword-targets";
import {
  LOCAL_ANALYSIS_SAP_MAX,
  LOCAL_ANALYSIS_SUGGEST_SAP_MIN_PER_TARGET,
} from "@/lib/local-analysis-target-constants";
import {
  buildCityLocationBucketsFromRows,
  buildGridLocationBucketsFromRows,
  type GridLocationBucket,
} from "@/lib/local-analysis/grid-location-buckets";
import { pickGridLocationBucketsFromSummary } from "@/lib/local-analysis/pick-grid-location-buckets-from-summary";
import {
  isStreetCorridorPlaceLabel,
  type LocalDominatorRow,
} from "@/lib/local-dominator-place-hints";
import { isLeakedInstructionEntityLabel } from "@/lib/local-analysis/entity-label-guards";
import { isCityLevelOnlyEntity } from "@/lib/local-analysis/entity-preload-suggested-keywords";
import { sapKeywordFromShortBaseAndEntity } from "@/lib/local-analysis/entity-sap-keyword-place-tokens";
import { isRejectedSapGridEntityLabel } from "@/lib/local-analysis/sap-grid-entity-reject";
import { appendMasterInstructionsToSystemPrompt } from "@/lib/master-instructions-storage";
import { openRouterAssistantTextFromMessage, postOpenRouterAppChat } from "@/lib/openrouter-app-api";

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

function sapMinPerClusterForBudget(totalSapBudget: number): number {
  return Math.min(LOCAL_ANALYSIS_SUGGEST_SAP_MIN_PER_TARGET, Math.max(1, totalSapBudget));
}

export function maxClustersForBudget(totalSapBudget: number): number {
  if (totalSapBudget < 1) return 0;
  const minPer = sapMinPerClusterForBudget(totalSapBudget);
  return Math.max(1, Math.floor(totalSapBudget / minPer));
}

export async function buildGridLocationBucketsWithSummaryFallback(args: {
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

export function uniqueBucketsForClusters(buckets: GridLocationBucket[], clusterCap: number): GridLocationBucket[] {
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

export function sapPagesPerBucket(
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
