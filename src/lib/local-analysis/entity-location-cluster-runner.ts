import type { GridKeywordWeight } from "@/lib/process-local-dominator-upload";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import type { GscSiteQueryRow } from "@/lib/competitor-research/types";
import type { SuggestedKeywordTarget } from "@/lib/local-analysis-suggest-keyword-targets";
import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import {
  cityBucketFromLocationLabel,
  type GridLocationBucket,
} from "@/lib/local-analysis/grid-location-buckets";
import { LOCAL_ANALYSIS_SUGGEST_SAP_MIN_PER_TARGET } from "@/lib/local-analysis-target-constants";
import { entityTypeFocusWantsNeighbourhoods } from "@/lib/entity-geographic-level";
import type { LocalDominatorRow } from "@/lib/local-dominator-place-hints";
import {
  allocatePagesAcrossNeighbourhoodPicks,
  buildGridLocationBucketsWithSummaryFallback,
  combineKeywordWithFullEntity,
  cycleItemsForRowCount,
  maxClustersForBudget,
  sapPagesPerBucket,
  uniqueBucketsForClusters,
  type NeighbourhoodPick,
} from "@/lib/local-analysis/entity-neighbourhood-picker";
import {
  cityFromBucket,
  fillDistinctNeighbourhoodSlotsForBucket,
  type GridClusterWikipedia,
} from "@/lib/local-analysis/entity-cluster-wiki-slots";

type ResolvedGridCluster = {
  bucket: GridLocationBucket;
  entity: string;
  baseKeywords: string[];
  wiki: GridClusterWikipedia;
};

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
  const sapRows = clusterSapRowsFromResolved(resolvedClusters);
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
