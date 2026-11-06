import type { WordPressSite } from "@/components/integrations/types";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { gscSapKeywordBasesForOpenRouter } from "@/lib/bulk/bulk-gsc-site-queries";
import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import {
  aiFilterAllowedBrandTexts,
  aiRejectBrandOrBlockedTexts,
} from "@/lib/content-brand-ai-gate";
import { entityTypeFocusWantsNeighbourhoods } from "@/lib/entity-geographic-level";
import {
  extractTopPlaceHintsFromRows,
  isStreetCorridorPlaceLabel,
  parseLocalDominatorCsv,
} from "@/lib/local-dominator-csv";
import {
  allocatePagesAcrossNeighbourhoodPicks,
  pickNeighbourhoodEntitiesForCluster,
  type NeighbourhoodPick,
} from "@/lib/local-analysis/entity-grid-location-wiki-agent";
import {
  allocateSapPagesToLocationBuckets,
  buildCityLocationBucketsFromRows,
} from "@/lib/local-analysis/grid-location-buckets";
import {
  LOCAL_ANALYSIS_SAP_MAX,
  LOCAL_ANALYSIS_SUGGEST_SAP_MIN_PER_TARGET,
} from "@/lib/local-analysis-target-constants";
import {
  composeServiceKeywordWithAdGroupEntity,
  harvestGenericTailPlacesFromBases,
  harvestOrphanPlaceLabelsFromBases,
  harvestTrailingPlacePhrasesFromBases,
  stripAllPlaceTokensFromKeyword,
} from "@/lib/local-analysis/entity-sap-row-keyword-fill";
import { buildEntityAdGroupSections } from "@/lib/local-analysis/sap-entity-ad-groups";
import {
  ensureEntitySiteWarmCache,
  getEntitySiteWarmCacheIfReady,
  gscQueriesFromWarmBundleForSapBudget,
} from "@/lib/local-analysis/entity-site-warm-cache";
import { getPrimaryCityStateLabel } from "@/lib/primary-location-from-site";
import { stampPreloadRowsWithUniqueEntityWikipedia } from "@/lib/local-analysis/stamp-preload-entity-wikipedia";

function normalizeKwKey(s: string): string {
  return s.trim().toLowerCase();
}

/** True when entity is metro/city-only (not a neighbourhood AdGroup). */
export function isCityLevelOnlyEntity(
  entity: string,
  cityLabel: string | null | undefined,
): boolean {
  const norm = normalizeEntityHintCommaLabel(entity);
  if (!norm) return true;
  const parts = norm.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return true;
  const city = normalizeEntityHintCommaLabel(cityLabel ?? "");
  if (!city) {
    return parts.length <= 2;
  }
  const cityParts = city.split(",").map((s) => s.trim()).filter(Boolean);
  const cityName = (cityParts[0] ?? "").toLowerCase();
  const first = (parts[0] ?? "").toLowerCase();
  if (norm.toLowerCase() === city.toLowerCase()) return true;
  if (first === cityName && parts.length <= Math.max(cityParts.length, 2)) return true;
  return false;
}

/** Street / NAP address lines are not place entities for AdGroups. */
export function isBadPreloadEntityLabel(label: string | undefined | null): boolean {
  const t = label?.trim() ?? "";
  if (!t) return true;
  if (/^\d+\s/.test(t)) return true;
  if (isStreetCorridorPlaceLabel(t)) return true;
  return false;
}

/** City/region place label only (never street address). */
export function resolveSafeCityEntityLabel(args: {
  suggestFocusLocation?: string;
  site: WordPressSite;
  gridCityLabels?: readonly string[];
}): string {
  const candidates = [
    args.suggestFocusLocation,
    getPrimaryCityStateLabel(args.site),
    ...(args.gridCityLabels ?? []),
  ];
  for (const raw of candidates) {
    const t = normalizeEntityHintCommaLabel(raw?.trim() ?? "") || raw?.trim() || "";
    if (!t || isBadPreloadEntityLabel(t)) continue;
    return t;
  }
  return "";
}

/** Pick up to `count` unique candidates not in alreadyUsed (case-insensitive). */
export function pickUniqueSuggestedKeywords(
  candidates: string[],
  count: number,
  alreadyUsed: readonly string[] = [],
): string[] {
  const used = new Set(alreadyUsed.map(normalizeKwKey).filter(Boolean));
  const out: string[] = [];
  for (const raw of candidates) {
    if (out.length >= count) break;
    const t = raw.trim();
    if (!t) continue;
    const key = normalizeKwKey(t);
    if (used.has(key)) continue;
    used.add(key);
    out.push(t);
  }
  return out;
}

/** Fill blank keyword slots left-to-right with suggestions; preserve non-blank. */
export function fillBlankEntitySlotKeywords(rows: CSVRow[], suggestions: string[]): CSVRow[] {
  let si = 0;
  return rows.map((row) => {
    if (row.keyword?.trim()) return row;
    const next = suggestions[si++]?.trim();
    if (!next) return row;
    return { ...row, keyword: next };
  });
}

/**
 * Stamp place entity on blank or street-address fields.
 * Does not overwrite a real neighbourhood / city entity the user already set.
 */
export function fillBlankEntitySlotEntities(rows: CSVRow[], defaultEntity: string): CSVRow[] {
  const ent = defaultEntity.trim();
  if (!ent || isBadPreloadEntityLabel(ent)) return rows;
  return rows.map((row) => {
    if (!isBadPreloadEntityLabel(row.entity)) return row;
    return { ...row, entity: ent };
  });
}

/** Assign unique place entities to slots that still need one. */
export function assignUniqueEntitiesToSlots(rows: CSVRow[], entities: string[]): CSVRow[] {
  let ei = 0;
  return rows.map((row) => {
    if (!isBadPreloadEntityLabel(row.entity)) return row;
    const next = entities[ei++]?.trim();
    if (!next || isBadPreloadEntityLabel(next)) return row;
    return { ...row, entity: next };
  });
}

/** Strip all place corpus tokens; empty if foreign locations remain. */
export function serviceKeywordForEntitySlot(
  base: string,
  entity: string | undefined,
  extraPlaceLabels: readonly string[] = [],
): string {
  const places = [entity, ...extraPlaceLabels].filter(Boolean) as string[];
  return stripAllPlaceTokensFromKeyword(base, places);
}

/** Build full place corpus from grid + row entities + orphan places in keyword bases. */
export function buildEntityKeywordPlaceCorpus(
  gridCsvText: string,
  rows: CSVRow[],
  keywordBases: readonly string[] = [],
): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string | undefined) => {
    const t = raw?.trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    labels.push(t);
  };
  if (gridCsvText.trim()) {
    const parsed = parseLocalDominatorCsv(gridCsvText);
    if (!parsed.error && parsed.rows.length > 0) {
      // Every grid city (not top-N) so foreign places like Sherwood Park strip cleanly.
      for (const b of buildCityLocationBucketsFromRows(parsed.rows)) add(b.placeLabel);
      for (const h of extractTopPlaceHintsFromRows(parsed.rows, 10_000)) add(h);
    }
  }
  for (const row of rows) add(row.entity);
  const bases = [
    ...keywordBases,
    ...rows.map((r) => r.keyword?.trim() ?? "").filter(Boolean),
  ];
  for (const trailing of harvestTrailingPlacePhrasesFromBases(bases)) add(trailing);
  for (const generic of harvestGenericTailPlacesFromBases(bases)) add(generic);
  for (const orphan of harvestOrphanPlaceLabelsFromBases(bases, labels)) add(orphan);
  return labels;
}

/**
 * Unique GSC service bases for Entity amount preload (no city in keyword).
 * Own trading name filtered via existing AI brand gate (Hunter Douglas / Alta kept).
 */
export async function loadEntityPreloadSuggestedKeywords(
  site: WordPressSite,
  count: number,
  alreadyUsed: readonly string[] = [],
  options?: {
    businessName?: string;
    apiKey?: string;
    model?: string;
    placeLabels?: readonly string[];
  },
): Promise<string[]> {
  if (count <= 0 || !site.siteUrl?.trim()) return [];
  const warm =
    getEntitySiteWarmCacheIfReady(site.id) ?? (await ensureEntitySiteWarmCache(site));
  if (warm.error || warm.gsc.queries.length === 0) return [];
  const need = count + alreadyUsed.length;
  const queries = gscQueriesFromWarmBundleForSapBudget(warm, Math.max(need, count));
  const pool = gscSapKeywordBasesForOpenRouter(queries, need + 40);
  const companyName = (options?.businessName?.trim() || site.name?.trim() || "").trim();
  const apiKey = options?.apiKey?.trim() || "";
  const model = options?.model?.trim() || "";
  const allowed =
    apiKey && model && companyName
      ? await aiFilterAllowedBrandTexts({
          apiKey,
          model,
          companyName,
          candidates: pool,
          kind: "keyword",
        })
      : pool;
  const places = [
    ...(options?.placeLabels ?? []),
    ...harvestTrailingPlacePhrasesFromBases(allowed),
    ...harvestGenericTailPlacesFromBases(allowed),
  ];
  const stripped = allowed
    .map((k) => stripAllPlaceTokensFromKeyword(k, places))
    .filter(Boolean);
  const usedClean = alreadyUsed
    .map((k) => stripAllPlaceTokensFromKeyword(k, places))
    .filter(Boolean);
  return pickUniqueSuggestedKeywords(stripped, count, usedClean);
}

/**
 * Assign unique keywords within each AdGroup: strip foreign places, append entity
 * (lowercase, no commas). Different AdGroups may reuse the same service phrase.
 * Rows with no entity still get service keywords (ungrouped) so Amount slots are visible
 * before Neighbourhoods resolve from the grid.
 */
export function assignUniqueKeywordsPerAdGroup(
  rows: CSVRow[],
  placeCorpus: readonly string[],
  suggestionPool: string[],
): CSVRow[] {
  const next = rows.map((r) => ({ ...r }));
  const sections = buildEntityAdGroupSections(next);
  const covered = new Set<number>();
  for (const s of sections) {
    for (const idx of s.rowIndices) covered.add(idx);
  }
  const orphanIndices = next.map((_, i) => i).filter((i) => !covered.has(i));
  const workSections =
    orphanIndices.length > 0
      ? [...sections, { groupId: "__ungrouped__", entity: "", rowIndices: orphanIndices }]
      : sections;

  for (const section of workSections) {
    const usedInGroup = new Set<string>();
    const places = [...placeCorpus, section.entity].filter(Boolean);
    for (const idx of section.rowIndices) {
      const existingKeyword = next[idx]?.keyword?.trim() ?? "";
      const service = stripAllPlaceTokensFromKeyword(existingKeyword, places);
      const key = service ? normalizeKwKey(service) : "";
      if (service && key && !usedInGroup.has(key)) {
        usedInGroup.add(key);
        next[idx] = {
          ...next[idx]!,
          keyword: section.entity
            ? composeServiceKeywordWithAdGroupEntity(service, section.entity)
            : service.toLowerCase(),
        };
      } else {
        // Duplicate within this AdGroup (or nothing left after stripping):
        // blank it so the pool refill below assigns a unique keyword.
        next[idx] = { ...next[idx]!, keyword: "" };
      }
    }

    // Restart pool each AdGroup so later sections are not left blank after early drain.
    for (const idx of section.rowIndices) {
      if (next[idx]?.keyword?.trim()) continue;
      for (let poolIdx = 0; poolIdx < suggestionPool.length; poolIdx++) {
        const service = stripAllPlaceTokensFromKeyword(suggestionPool[poolIdx] ?? "", places);
        if (!service) continue;
        const key = normalizeKwKey(service);
        if (usedInGroup.has(key)) continue;
        usedInGroup.add(key);
        next[idx] = {
          ...next[idx]!,
          keyword: section.entity
            ? composeServiceKeywordWithAdGroupEntity(service, section.entity)
            : service.toLowerCase(),
        };
        break;
      }
    }
  }

  return next;
}

/**
 * POS-weighted neighbourhood AdGroups → one entity label per row (repeated for multi-page groups).
 */
async function loadNeighbourhoodPreloadEntitiesByRow(args: {
  gridCsvText: string;
  totalPages: number;
  apiKey: string;
  siteId: string;
}): Promise<string[]> {
  if (args.totalPages <= 0) return [];
  const parsed = parseLocalDominatorCsv(args.gridCsvText);
  if (parsed.error || parsed.rows.length === 0) return [];
  const buckets = buildCityLocationBucketsFromRows(parsed.rows);
  if (buckets.length === 0) return [];
  const gridLocations = extractTopPlaceHintsFromRows(parsed.rows, 24);
  const minPer = Math.min(
    LOCAL_ANALYSIS_SUGGEST_SAP_MIN_PER_TARGET,
    Math.max(1, args.totalPages),
  );
  const cityPageCounts = allocateSapPagesToLocationBuckets(
    buckets,
    args.totalPages,
    minPer,
    LOCAL_ANALYSIS_SAP_MAX,
  );

  const rowEntities: string[] = [];
  const usedNames: string[] = [];
  const usedKeys = new Set<string>();

  for (let i = 0; i < buckets.length; i++) {
    if (rowEntities.length >= args.totalPages) break;
    const bucket = buckets[i]!;
    const pagesForCity = cityPageCounts[i] ?? 0;
    if (pagesForCity < 1) continue;
    const cityLabel = bucket.placeLabel.trim();
    const adGroupCap = Math.max(1, Math.floor(pagesForCity / minPer));
    const picked = await pickNeighbourhoodEntitiesForCluster(
      bucket,
      gridLocations,
      usedNames,
      adGroupCap,
      args.apiKey,
      args.siteId,
    );
    const validPicks: NeighbourhoodPick[] = [];
    let skippedCity = 0;
    for (const pick of picked) {
      const entity = normalizeEntityHintCommaLabel(pick.name) || pick.name.trim();
      if (!entity || isBadPreloadEntityLabel(entity)) continue;
      if (isCityLevelOnlyEntity(entity, cityLabel)) {
        skippedCity++;
        continue;
      }
      const key = normalizeKwKey(entity);
      if (usedKeys.has(key)) continue;
      usedKeys.add(key);
      usedNames.push(entity);
      validPicks.push({ name: entity, posWeight: pick.posWeight });
    }
    const allocations = allocatePagesAcrossNeighbourhoodPicks(validPicks, pagesForCity);
    for (const alloc of allocations) {
      for (let p = 0; p < alloc.pages; p++) {
        if (rowEntities.length >= args.totalPages) break;
        rowEntities.push(alloc.entity);
      }
    }
  }
  return rowEntities;
}

export type RefreshEntityPreloadOptions = {
  businessName?: string;
  apiKey?: string;
  model?: string;
  /** Manual Location field (must be city/region, not street). */
  suggestFocusLocation?: string;
  entityTypeFocus?: readonly string[];
  gridCsvText?: string;
};

/**
 * Assign neighbourhood/city AdGroups first, then unique service-only keywords per AdGroup.
 */
export async function refreshEntityPreloadSlotKeywords(
  site: WordPressSite,
  rows: CSVRow[],
  options?: RefreshEntityPreloadOptions,
): Promise<CSVRow[]> {
  if (rows.length === 0) return rows;
  if (rows.every((r) => r.entity?.trim() && r.keyword?.trim())) {
    return rows;
  }
  const companyName = (options?.businessName?.trim() || site.name?.trim() || "").trim();
  const apiKey = options?.apiKey?.trim() || "";
  const model = options?.model?.trim() || "";
  const gridCsvText = options?.gridCsvText?.trim() || "";

  let next: CSVRow[] = rows.map((r) => ({
    ...r,
    entity: isBadPreloadEntityLabel(r.entity) ? undefined : r.entity,
  }));

  const wantsNeighbourhoods = entityTypeFocusWantsNeighbourhoods(options?.entityTypeFocus);
  const parsedGrid = gridCsvText ? parseLocalDominatorCsv(gridCsvText) : null;
  const gridCityLabel =
    parsedGrid && !parsedGrid.error && parsedGrid.rows.length > 0
      ? buildCityLocationBucketsFromRows(parsedGrid.rows)[0]?.placeLabel.trim()
      : "";
  const cityContext =
    gridCityLabel ||
    normalizeEntityHintCommaLabel(options?.suggestFocusLocation ?? "") ||
    getPrimaryCityStateLabel(site)?.trim() ||
    "";

  if (wantsNeighbourhoods && gridCsvText && apiKey) {
    const entitiesByRow = await loadNeighbourhoodPreloadEntitiesByRow({
      gridCsvText,
      totalPages: next.length,
      apiKey,
      siteId: site.id,
    });
    next = next.map((row, i) => {
      const nh = entitiesByRow[i]?.trim();
      if (nh && !isBadPreloadEntityLabel(nh) && !isCityLevelOnlyEntity(nh, cityContext)) {
        return { ...row, entity: nh };
      }
      const prior = row.entity?.trim();
      if (
        prior &&
        !isBadPreloadEntityLabel(prior) &&
        !isCityLevelOnlyEntity(prior, cityContext)
      ) {
        return { ...row, entity: prior };
      }
      return row;
    });
  }

  const placeCorpus = buildEntityKeywordPlaceCorpus(gridCsvText, next);

  // City fallback only when Neighbourhoods is NOT selected (log A: cityStamp with wantsNeighbourhoods:true).
  if (!wantsNeighbourhoods && next.some((r) => isBadPreloadEntityLabel(r.entity))) {
    const city = resolveSafeCityEntityLabel({
      suggestFocusLocation: options?.suggestFocusLocation,
      site,
      gridCityLabels: placeCorpus,
    });
    if (city) next = fillBlankEntitySlotEntities(next, city);
  }

  // Refresh corpus after any city stamp.
  let corpus = buildEntityKeywordPlaceCorpus(gridCsvText, next);

  if (apiKey && model && companyName) {
    const filled = next.map((r) => r.keyword?.trim() ?? "").filter(Boolean);
    if (filled.length > 0) {
      const rejected = await aiRejectBrandOrBlockedTexts({
        apiKey,
        model,
        companyName,
        candidates: filled,
        kind: "keyword",
      });
      const rejectKeys = new Set(rejected.map(normalizeKwKey));
      next = next.map((r) =>
        rejectKeys.has(normalizeKwKey(r.keyword ?? "")) ? { ...r, keyword: "" } : r,
      );
    }
  }

  const blankCount = next.filter((r) => {
    const cleaned = stripAllPlaceTokensFromKeyword(r.keyword ?? "", [
      ...corpus,
      r.entity ?? "",
    ]);
    return !cleaned;
  }).length;

  let pool: string[] = [];
  let rawGscBases: string[] = [];
  {
    const warm =
      getEntitySiteWarmCacheIfReady(site.id) ?? (await ensureEntitySiteWarmCache(site));
    if (!warm.error && warm.gsc.queries.length > 0) {
      const queries = gscQueriesFromWarmBundleForSapBudget(
        warm,
        Math.max(blankCount * 3, next.length, 40),
      );
      rawGscBases = gscSapKeywordBasesForOpenRouter(queries, Math.max(blankCount * 3, 40) + 40);
    }
  }
  const harvestedFromGsc = [
    ...harvestTrailingPlacePhrasesFromBases(rawGscBases),
    ...harvestGenericTailPlacesFromBases(rawGscBases),
  ];
  if (blankCount > 0) {
    pool = await loadEntityPreloadSuggestedKeywords(
      site,
      Math.max(blankCount * 3, blankCount),
      [],
      {
        ...options,
        placeLabels: [...corpus, ...harvestedFromGsc],
      },
    );
  }

  // Expand corpus with foreign places from row keywords + raw GSC (e.g. sherwood park).
  corpus = buildEntityKeywordPlaceCorpus(gridCsvText, next, [...pool, ...rawGscBases]);

  const assigned = assignUniqueKeywordsPerAdGroup(next, corpus, pool);
  const withWiki = await stampPreloadRowsWithUniqueEntityWikipedia(assigned);
  return withWiki;
}
