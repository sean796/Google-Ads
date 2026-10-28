import type { WordPressSite } from "@/components/integrations/types";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import type { GscSiteQueryRow } from "@/lib/competitor-research/types";
import {
  buildEntityTitleClusterJobsFromTargets,
  type EntityTitleClusterKeywordTarget,
} from "@/lib/local-analysis/entity-sap-title-cluster-jobs";
import {
  applyGridClusterWikipediaToSapRows,
  type GridClusterWikipedia,
} from "@/lib/local-analysis/entity-grid-location-wiki-agent";
import { hydrateEntityClusterSapRows } from "@/lib/local-analysis/entity-preview-sap-hydrate";
import {
  fillEntitySapRowKeywordsFromInventoryAndGsc,
  type EntitySapKeywordSources,
} from "@/lib/local-analysis/entity-sap-row-keyword-fill";
import { ensureBulkGenerationWpInventory } from "@/lib/bulk/bulk-generation-wp-inventory";
import {
  buildEntitySapOccupancy,
  type EntitySapOccupancy,
} from "@/lib/local-analysis/entity-sap-inventory-collision";
import { applySapTargetSlugsFromKeywordEntity } from "@/lib/sap-slug-from-keyword-entity";
import {
  ensureEntitySiteWarmCache,
  gscAllQueriesFromWarmBundle,
} from "@/lib/local-analysis/entity-site-warm-cache";
import { mergeGscQueriesWithInventoryFallback } from "@/lib/local-analysis/entity-gsc-inventory-fallback";
import { sapKeywordFromShortBaseAndEntity } from "@/lib/local-analysis/entity-sap-row-keyword-fill";
import { keywordUniquenessKey } from "@/lib/local-analysis-fill-keywords-from-wp-inventory";
import {
  buildEntityAdGroupSections,
  finalizeEntitySapRowsForAdGroups,
} from "@/lib/local-analysis/sap-entity-ad-groups";

export type PreloadClusterKeywordTarget = {
  id: string;
  keyword: string;
  entityHint: string;
  sapPages: number;
  clusterId?: string;
  clusterRole?: "seed" | "member";
};

export function keywordTargetsFromPreloadedSapRows(
  rows: CSVRow[],
  createId: () => string,
): PreloadClusterKeywordTarget[] {
  const sections = buildEntityAdGroupSections(rows);
  return sections.map((section) => ({
    id: createId(),
    keyword: "",
    entityHint: section.entity,
    sapPages: section.rowIndices.length,
    clusterId: section.groupId,
    clusterRole: "seed" as const,
  }));
}

export function preloadTargetsToTitleTargets(
  rows: PreloadClusterKeywordTarget[],
): EntityTitleClusterKeywordTarget[] {
  return rows.map((t) => ({
    id: t.id,
    keyword: t.keyword,
    entityHint: t.entityHint,
    sapPages: t.sapPages,
    ...(t.clusterId ? { clusterId: t.clusterId } : {}),
    ...(t.clusterRole ? { clusterRole: t.clusterRole } : {}),
  }));
}

export function countBlankEntityKeywordRows(rows: readonly CSVRow[]): number {
  return rows.filter((r) => r.entity?.trim() && !r.keyword?.trim()).length;
}

/** Assign keywords when GSC/OpenRouter fill leaves blanks (Clusters must always show rows). */
export function fillBlankEntitySapKeywordsDeterministic(
  rows: CSVRow[],
  baseKeyword: string,
): CSVRow[] {
  const base = baseKeyword.trim() || "services";
  const used = new Set<string>();
  for (const row of rows) {
    const kw = row.keyword?.trim();
    if (kw) used.add(keywordUniquenessKey(kw));
  }
  return rows.map((row) => {
    if (row.keyword?.trim() || !row.entity?.trim()) return row;
    let kw =
      sapKeywordFromShortBaseAndEntity(base, row.entity) ||
      `${base} ${row.entity}`.replace(/\s+/g, " ").trim();
    let key = keywordUniquenessKey(kw);
    let n = 2;
    while (used.has(key)) {
      kw = `${base} ${n}`;
      key = keywordUniquenessKey(kw);
      n += 1;
    }
    used.add(key);
    return { ...row, keyword: kw };
  });
}

export function fallbackEntityClusterSapRows(locationLabel: string, total: number): CSVRow[] {
  const entity = locationLabel.trim() || "Service area";
  const n = Math.max(1, Math.floor(total));
  return Array.from({ length: n }, () => ({ entity }));
}

const DEFAULT_ENTITY_TITLE_TEMPLATE = "{keyword} Near {entity}";

async function fillAndResolveEntitySapKeywords(args: {
  site: WordPressSite;
  apiKey: string;
  model: string;
  siteName: string;
  siteUrl: string;
  rows: CSVRow[];
  seedKeywords: string[];
  buckets: EntitySapKeywordSources["buckets"];
  gscQueries: GscSiteQueryRow[];
  gridLocations: string[];
  entityTypeFocus?: readonly string[];
  clientAudienceContextMarkdown?: string;
  titleTemplate?: string;
  onGroupComplete?: (rows: CSVRow[], doneGroups: number, totalGroups: number) => void;
}): Promise<CSVRow[]> {
  const bulkInventory = await ensureBulkGenerationWpInventory(args.site, undefined, { force: true });
  const sapOccupancy = buildEntitySapOccupancy(bulkInventory.rows);
  const reservedSlugsInRun = new Set<string>();
  const titleTemplate = args.titleTemplate?.trim() || DEFAULT_ENTITY_TITLE_TEMPLATE;

  const withKeywords = await fillEntitySapRowKeywordsFromInventoryAndGsc({
    apiKey: args.apiKey,
    model: args.model,
    siteId: args.site.id,
    siteName: args.siteName,
    siteUrl: args.siteUrl,
    rows: args.rows,
    seedKeywords: args.seedKeywords,
    buckets: args.buckets,
    gscQueries: args.gscQueries,
    gridLocations: args.gridLocations,
    sapOccupancy,
    reservedSlugsInRun,
    titleTemplate,
    ...(args.entityTypeFocus && args.entityTypeFocus.length > 0
      ? { entityTypeFocus: [...args.entityTypeFocus] }
      : {}),
    ...(args.clientAudienceContextMarkdown?.trim()
      ? { clientAudienceContextMarkdown: args.clientAudienceContextMarkdown.trim() }
      : {}),
    onGroupComplete: args.onGroupComplete,
  });

  return applySapTargetSlugsFromKeywordEntity(withKeywords);
}

export type FillEntitySlotKeywordsFromGscArgs = {
  site: WordPressSite;
  apiKey: string;
  model: string;
  siteName: string;
  siteUrl: string;
  rows: CSVRow[];
  gridLocations: string[];
  entityTypeFocus?: readonly string[];
  clientAudienceContextMarkdown?: string;
  /** When true, throw if any entity row has no keyword after GSC fill (no deterministic fallback). */
  failOnBlankKeywords?: boolean;
  onPhase?: (phase: string, completed?: number, stepTotal?: number) => void;
  onRowsUpdate?: (rows: CSVRow[]) => void;
};

export type FillEntitySlotKeywordsFromGscResult = {
  rows: CSVRow[];
  keywordSources: EntitySapKeywordSources;
};

/** Upload preload: GSC + OpenRouter keyword fill only (no grid fallbacks). */
export async function fillEntitySlotKeywordsFromGsc(
  args: FillEntitySlotKeywordsFromGscArgs,
): Promise<FillEntitySlotKeywordsFromGscResult> {
  const apiKey = args.apiKey.trim();
  if (!apiKey) {
    throw new Error("OpenRouter API key is required to assign keywords from GSC.");
  }
  const siteUrl = args.siteUrl.trim();
  if (!siteUrl) {
    throw new Error("WordPress site URL is required to load GSC keywords.");
  }

  args.onPhase?.("Loading site inventory and GSC cache", 0);
  const warm = await ensureEntitySiteWarmCache(args.site, { requireGsc: true });
  if (warm.error) {
    throw new Error(warm.error);
  }
  if (warm.inventory.totalRows === 0) {
    throw new Error(
      "WordPress sitemap inventory is empty. Connect the site and ensure Pages, Posts, and SAP sitemaps return URLs.",
    );
  }
  const gscQueries = mergeGscQueriesWithInventoryFallback(
    gscAllQueriesFromWarmBundle(warm),
    warm.inventory.buckets,
  );

  const keywordSources: EntitySapKeywordSources = {
    links: warm.inventory.links,
    buckets: warm.inventory.buckets,
    gscQueries,
    gscDateRange: warm.gsc.dateRange,
  };

  const grouped = finalizeEntitySapRowsForAdGroups(args.rows.map((row) => ({ ...row })));
  args.onPhase?.("Assigning unique keywords from GSC", 0);
  const seedKeywords = new Array<string>(grouped.length).fill("");
  const withKeywords = await fillAndResolveEntitySapKeywords({
    site: args.site,
    apiKey,
    model: args.model,
    siteName: args.siteName,
    siteUrl,
    rows: grouped,
    seedKeywords,
    buckets: keywordSources.buckets,
    gscQueries: keywordSources.gscQueries as GscSiteQueryRow[],
    gridLocations: args.gridLocations,
    ...(args.entityTypeFocus && args.entityTypeFocus.length > 0
      ? { entityTypeFocus: args.entityTypeFocus }
      : {}),
    ...(args.clientAudienceContextMarkdown?.trim()
      ? { clientAudienceContextMarkdown: args.clientAudienceContextMarkdown.trim() }
      : {}),
    onGroupComplete: (partialRows, doneGroups, totalGroups) => {
      args.onRowsUpdate?.(partialRows);
      args.onPhase?.(
        "Assigning unique keywords from GSC",
        Math.min(Math.max(0, doneGroups), totalGroups),
        totalGroups,
      );
    },
  });

  const finalized = finalizeEntitySapRowsForAdGroups(withKeywords.map((row) => ({ ...row })));
  if (args.failOnBlankKeywords) {
    const missing = finalized.filter((r) => r.entity?.trim() && !r.keyword?.trim());
    if (missing.length > 0) {
      const preview = missing
        .slice(0, 5)
        .map((r) => r.entity?.trim())
        .filter(Boolean)
        .join(", ");
      throw new Error(
        `GSC did not assign a keyword for ${missing.length} entity row(s)${preview ? `: ${preview}` : ""}.`,
      );
    }
    return { rows: finalized, keywordSources };
  }
  const seedBase =
    finalized.find((r) => r.keyword?.trim())?.keyword?.trim() || args.siteName.trim() || "services";
  const filled = fillBlankEntitySapKeywordsDeterministic(finalized, seedBase);

  return { rows: filled, keywordSources };
}

export type HydratePreloadedEntitySapRowsArgs = {
  apiKey: string;
  model: string;
  siteId?: string;
  site?: WordPressSite;
  siteName: string;
  siteUrl: string;
  rows: CSVRow[];
  targets: PreloadClusterKeywordTarget[];
  keywordSources: Pick<EntitySapKeywordSources, "buckets" | "gscQueries">;
  gridLocations: string[];
  entityTypeFocus?: readonly string[];
  clientAudienceContextMarkdown?: string;
  clusterWikipedia?: GridClusterWikipedia[];
  skipKeywordFill?: boolean;
  titleTemplate?: string;
  onPhase?: (phase: string, completed?: number, stepTotal?: number) => void;
  onRowsUpdate?: (rows: CSVRow[]) => void;
};

export async function hydratePreloadedEntitySapRows(
  args: HydratePreloadedEntitySapRowsArgs,
): Promise<{ rows: CSVRow[]; targets: PreloadClusterKeywordTarget[] }> {
  const groupedSapRows = finalizeEntitySapRowsForAdGroups(args.rows.map((row) => ({ ...row })));
  if (groupedSapRows.length === 0) {
    throw new Error("Clusters produced 0 SAP preview rows. Check grid weights and suggest output.");
  }

  let withKeywords = groupedSapRows;
  let sapOccupancy: EntitySapOccupancy | undefined;
  if (!args.skipKeywordFill) {
    if (!args.site) {
      throw new Error("WordPress site is required for inventory-aware keyword fill.");
    }
    args.onPhase?.("Assigning unique keywords from GSC", 0);
    const titleTargets = preloadTargetsToTitleTargets(args.targets);
    const seedKeywords = new Array<string>(groupedSapRows.length).fill("");
    const keywordJobs = buildEntityTitleClusterJobsFromTargets(titleTargets, groupedSapRows.length);
    for (const job of keywordJobs) {
      for (const idx of job.rowIndices) {
        if (idx >= 0 && idx < seedKeywords.length) seedKeywords[idx] = job.seedKeyword;
      }
    }

    const bulkInventory = await ensureBulkGenerationWpInventory(args.site, undefined, { force: true });
    sapOccupancy = buildEntitySapOccupancy(bulkInventory.rows);

    withKeywords = await fillAndResolveEntitySapKeywords({
      site: args.site,
      apiKey: args.apiKey,
      model: args.model,
      siteName: args.siteName,
      siteUrl: args.siteUrl,
      rows: groupedSapRows,
      seedKeywords,
      buckets: args.keywordSources.buckets,
      gscQueries: args.keywordSources.gscQueries as GscSiteQueryRow[],
      gridLocations: args.gridLocations,
      titleTemplate: args.titleTemplate,
      ...(args.entityTypeFocus && args.entityTypeFocus.length > 0
        ? { entityTypeFocus: args.entityTypeFocus }
        : {}),
      ...(args.clientAudienceContextMarkdown?.trim()
        ? { clientAudienceContextMarkdown: args.clientAudienceContextMarkdown.trim() }
        : {}),
      onGroupComplete: (partialRows, doneGroups, totalGroups) => {
        args.onRowsUpdate?.(partialRows);
        args.onPhase?.(
          "Assigning unique keywords from GSC",
          Math.min(Math.max(0, doneGroups - 1), Math.max(0, totalGroups - 1)),
        );
      },
    });
    args.onRowsUpdate?.(withKeywords);
  }

  args.onPhase?.("Writing titles", 0);
  const hydrated = await hydrateEntityClusterSapRows({
      apiKey: args.apiKey,
      model: args.model,
      siteId: args.siteId,
      siteName: args.siteName,
      gridLocations: args.gridLocations,
      rows: withKeywords,
      titleTemplate: args.titleTemplate,
      forceRewriteTitles: Boolean(args.titleTemplate?.trim()),
      sapOccupancy,
      ...(args.entityTypeFocus && args.entityTypeFocus.length > 0
        ? { entityTypeFocus: args.entityTypeFocus }
        : {}),
      onTitleProgress: (done, titleTotal) => {
        args.onPhase?.("Writing titles", done, titleTotal);
      },
      onMetaProgress: (done, metaTotal) => {
        args.onPhase?.("Writing meta descriptions", done, metaTotal);
      },
      onRowsUpdate: args.onRowsUpdate,
    });

  if (hydrated.length === 0) {
    throw new Error("Clusters finished with 0 SAP rows after hydrate.");
  }

  const wiki = args.clusterWikipedia ?? [];
  const withWiki = wiki.length > 0 ? applyGridClusterWikipediaToSapRows(hydrated, wiki) : hydrated;
  return {
    rows: finalizeEntitySapRowsForAdGroups(withWiki.map((row) => ({ ...row }))),
    targets: args.targets,
  };
}
