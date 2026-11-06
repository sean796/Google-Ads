/**
 * Assign one unique keyword per Entity SAP row: GSC first, OpenRouter when GSC cannot fill.
 */
import type { WordPressSite } from "@/components/integrations/types";
import { ensureMasterInstructionsInMemory } from "@/lib/master-instructions-storage";
import type {
  PromptBulkSitemapInventoryBuckets,
  PromptBulkSitemapInventoryLink,
} from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import {
  brandExclusionPhrasesFromNames,
  fetchEntityGscKeywordBundle,
  gscAllQueryStringsForEntityKeywordFill,
} from "@/lib/bulk/bulk-gsc-site-queries";
import {
  ensureEntitySiteWarmCache,
  gscAllQueriesFromWarmBundle,
} from "@/lib/local-analysis/entity-site-warm-cache";
import type { GscCompetitorDateRange, GscSiteQueryRow } from "@/lib/competitor-research/types";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { buildEntityAdGroupSections } from "@/lib/local-analysis/sap-entity-ad-groups";
import type { EntitySapOccupancy } from "@/lib/local-analysis/entity-sap-inventory-collision";
import {
  applyKeywordFillsToSapRows,
  runEntityAdGroupKeywordSubAgent,
} from "@/lib/local-analysis/entity-sap-keyword-ad-group-agent";

export {
  adGroupEntityKeywordSuffix,
  collapseRepeatedPlaceSegmentsInKeyword,
  composeServiceKeywordWithAdGroupEntity,
  harvestGenericTailPlacesFromBases,
  harvestOrphanPlaceLabelsFromBases,
  harvestTrailingPlacePhrasesFromBases,
  keywordPlaceSuffixFromEntity,
  keywordStillContainsPlaceTokens,
  normalizeSapKeywordWithPlaceSuffix,
  placeTokenSetFromLabels,
  sanitizeUniqueServiceKeywordsForAdGroup,
  sapKeywordFromShortBaseAndEntity,
  serviceKeywordForSapTitle,
  stripAllPlaceTokensFromKeyword,
  stripBaseTokensPresentInPlace,
} from "./entity-sap-keyword-place-tokens";
export {
  buildEntitySapKeywordPickSystemPrompt,
  buildEntitySapKeywordPickUserPayload,
  padGscProductBasesFromCandidates,
} from "./entity-sap-keyword-pick-prompts";
export type {
  EntitySapKeywordPickPromptArgs,
  EntitySapKeywordPickUserPayloadArgs,
} from "./entity-sap-keyword-pick-prompts";
export { applyKeywordFillsToSapRows } from "./entity-sap-keyword-ad-group-agent";

export type EntitySapKeywordSources = {
  links: PromptBulkSitemapInventoryLink[];
  buckets: PromptBulkSitemapInventoryBuckets;
  gscQueries: GscSiteQueryRow[];
  gscDateRange: GscCompetitorDateRange;
};

export type FillEntitySapRowKeywordsArgs = {
  apiKey: string;
  model: string;
  siteId?: string;
  siteName: string;
  siteUrl: string;
  rows: CSVRow[];
  seedKeywords: string[];
  buckets: PromptBulkSitemapInventoryBuckets;
  gscQueries: GscSiteQueryRow[];
  gridLocations: string[];
  entityTypeFocus?: string[];
  clientAudienceContextMarkdown?: string;
  temperature?: number;
  topP?: number;
  onGroupComplete?: (rows: CSVRow[], doneGroups: number, totalGroups: number) => void;
  sapOccupancy?: EntitySapOccupancy;
  reservedSlugsInRun?: Set<string>;
  titleTemplate?: string;
};

export async function fetchEntitySapKeywordSources(
  site: WordPressSite,
  rowCount: number,
  onProgress?: (message: string) => void,
): Promise<EntitySapKeywordSources> {
  onProgress?.("Loading site inventory and GSC from cache");
  const warm = await ensureEntitySiteWarmCache(site);
  if (warm.error) {
    throw new Error(warm.error);
  }
  if (warm.inventory.totalRows === 0) {
    throw new Error(
      "WordPress sitemap inventory is empty. Connect the site and ensure Pages, Posts, and SAP sitemaps return URLs.",
    );
  }
  return {
    links: warm.inventory.links,
    buckets: warm.inventory.buckets,
    gscQueries: gscAllQueriesFromWarmBundle(warm),
    gscDateRange: warm.gsc.dateRange,
  };
}

export async function buildEntitySapKeywordSourcesFromInventory(
  inventory: { links: PromptBulkSitemapInventoryLink[]; buckets: PromptBulkSitemapInventoryBuckets; totalRows: number },
  site: WordPressSite,
  rowCount: number,
  onProgress?: (message: string) => void,
): Promise<EntitySapKeywordSources> {
  if (inventory.totalRows === 0) {
    throw new Error(
      "WordPress sitemap inventory is empty. Connect the site and ensure Pages, Posts, and SAP sitemaps return URLs.",
    );
  }
  const gsc = await fetchEntityGscKeywordBundle(site, rowCount, onProgress);
  return {
    links: inventory.links,
    buckets: inventory.buckets,
    gscQueries: gsc.queries,
    gscDateRange: gsc.dateRange,
  };
}

/** AI picks N GSC product bases per ad group; applies them directly (no post-pick filter). */
export async function fillEntitySapRowKeywordsFromInventoryAndGsc(
  args: FillEntitySapRowKeywordsArgs,
): Promise<CSVRow[]> {
  const {
    apiKey,
    model,
    siteId,
    siteName,
    siteUrl,
    rows,
    seedKeywords,
    gscQueries,
    gridLocations,
    temperature = 0.35,
    topP = 1,
    sapOccupancy,
    reservedSlugsInRun: reservedSlugsInRunArg,
    titleTemplate,
    clientAudienceContextMarkdown,
    entityTypeFocus,
  } = args;

  if (rows.length === 0) return rows;
  await ensureMasterInstructionsInMemory(siteId);

  const reservedSlugsInRun = reservedSlugsInRunArg ?? new Set<string>();

  const fillTemperature = rows.length >= 2 ? Math.max(temperature, 0.45) : temperature;
  const brandPhrases = brandExclusionPhrasesFromNames(siteName, siteUrl);
  const gscKeywords = gscAllQueryStringsForEntityKeywordFill(gscQueries, brandPhrases, siteName);
  const sections = buildEntityAdGroupSections(rows);
  const allFills = new Map<number, string>();

  const totalGroups = sections.length;
  let doneGroups = 0;
  await Promise.all(
    sections.map(async (section) => {
      const localFills = new Map<number, string>();
      await runEntityAdGroupKeywordSubAgent({
        section,
        rows,
        gscKeywords,
        seedKeywords,
        allFills: localFills,
        apiKey,
        model,
        siteId,
        siteName,
        siteUrl,
        gridLocations,
        clientAudienceContextMarkdown,
        entityTypeFocus,
        fillTemperature,
        topP,
      });
      for (const [idx, kw] of localFills) {
        allFills.set(idx, kw);
      }
      doneGroups += 1;
      args.onGroupComplete?.(applyKeywordFillsToSapRows(rows, allFills), doneGroups, totalGroups);
    }),
  );

  return applyKeywordFillsToSapRows(rows, allFills);
}
