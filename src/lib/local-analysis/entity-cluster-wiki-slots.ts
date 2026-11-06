import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
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
  isRejectedClusterWikiTitle,
  isRejectedNeighbourhoodWikiTitle,
} from "@/lib/local-analysis/cluster-wiki-candidates";
import { wikipediaArticleUrl } from "@/lib/wikipedia/wiki-urls";
import type { GridLocationBucket } from "@/lib/local-analysis/grid-location-buckets";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import {
  firstCityStateLabelFromAddress,
  isStreetCorridorPlaceLabel,
  type LocalDominatorRow,
} from "@/lib/local-dominator-place-hints";
import { isLeakedInstructionEntityLabel } from "@/lib/local-analysis/entity-label-guards";
import { isCityLevelOnlyEntity } from "@/lib/local-analysis/entity-preload-suggested-keywords";
import {
  bucketPlaceHints,
  harvestWikiPlacesForCity,
  pickWikiEntriesFromPool,
  wikiEntryToGridClusterWiki,
  type WikiGeoEntry,
} from "@/lib/wikipedia/wiki-entity-pool";
import { isRejectedSapGridEntityLabel } from "@/lib/local-analysis/sap-grid-entity-reject";
import {
  buildGridLocationBucketsWithSummaryFallback,
  cycleItemsForRowCount,
  isDirectionalCompassPlaceLabel,
  neighbourhoodPicksFromWikiPool,
  uniqueBucketsForClusters,
  type NeighbourhoodPick,
} from "@/lib/local-analysis/entity-neighbourhood-picker";

export type GridClusterWikipedia = {
  gridPlaceLabel: string;
  title: string;
  url: string;
};

export function cityFromBucket(bucket: GridLocationBucket): string | null {
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
export async function fillDistinctNeighbourhoodSlotsForBucket(
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
