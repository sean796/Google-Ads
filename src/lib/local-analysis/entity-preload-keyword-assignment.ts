import type { WordPressSite } from "@/components/integrations/types";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { gscSapKeywordBasesForOpenRouter } from "@/lib/bulk/bulk-gsc-site-queries";
import { aiFilterAllowedBrandTexts } from "@/lib/content-brand-ai-gate";
import {
  harvestGenericTailPlacesFromBases,
  harvestTrailingPlacePhrasesFromBases,
  stripAllPlaceTokensFromKeyword,
  composeServiceKeywordWithAdGroupEntity,
} from "@/lib/local-analysis/entity-sap-row-keyword-fill";
import { buildEntityAdGroupSections } from "@/lib/local-analysis/sap-entity-ad-groups";
import {
  ensureEntitySiteWarmCache,
  getEntitySiteWarmCacheIfReady,
  gscQueriesFromWarmBundleForSapBudget,
} from "@/lib/local-analysis/entity-site-warm-cache";
import {
  normalizeKwKey,
  pickUniqueSuggestedKeywords,
} from "@/lib/local-analysis/entity-preload-slot-helpers";

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
