import type { WordPressSite } from "@/components/integrations/types";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { gscSapKeywordBasesForOpenRouter } from "@/lib/bulk/bulk-gsc-site-queries";
import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import { aiRejectBrandOrBlockedTexts } from "@/lib/content-brand-ai-gate";
import { entityTypeFocusWantsNeighbourhoods } from "@/lib/entity-geographic-level";
import {
  extractTopPlaceHintsFromRows,
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
  harvestGenericTailPlacesFromBases,
  harvestTrailingPlacePhrasesFromBases,
  stripAllPlaceTokensFromKeyword,
} from "@/lib/local-analysis/entity-sap-row-keyword-fill";
import {
  ensureEntitySiteWarmCache,
  getEntitySiteWarmCacheIfReady,
  gscQueriesFromWarmBundleForSapBudget,
} from "@/lib/local-analysis/entity-site-warm-cache";
import { getPrimaryCityStateLabel } from "@/lib/primary-location-from-site";
import { stampPreloadRowsWithUniqueEntityWikipedia } from "@/lib/local-analysis/stamp-preload-entity-wikipedia";
import {
  assignUniqueEntitiesToSlots,
  buildEntityKeywordPlaceCorpus,
  fillBlankEntitySlotEntities,
  fillBlankEntitySlotKeywords,
  isBadPreloadEntityLabel,
  isCityLevelOnlyEntity,
  normalizeKwKey,
  pickUniqueSuggestedKeywords,
  resolveSafeCityEntityLabel,
  serviceKeywordForEntitySlot,
} from "@/lib/local-analysis/entity-preload-slot-helpers";
import {
  assignUniqueKeywordsPerAdGroup,
  loadEntityPreloadSuggestedKeywords,
} from "@/lib/local-analysis/entity-preload-keyword-assignment";

export {
  assignUniqueEntitiesToSlots,
  assignUniqueKeywordsPerAdGroup,
  buildEntityKeywordPlaceCorpus,
  fillBlankEntitySlotEntities,
  fillBlankEntitySlotKeywords,
  isBadPreloadEntityLabel,
  isCityLevelOnlyEntity,
  loadEntityPreloadSuggestedKeywords,
  pickUniqueSuggestedKeywords,
  resolveSafeCityEntityLabel,
  serviceKeywordForEntitySlot,
};


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
