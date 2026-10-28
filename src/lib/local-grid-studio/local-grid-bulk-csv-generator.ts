import type { WordPressSite } from "@/components/integrations/types";
import { writeStoredBlogGeneratorSection } from "@/components/blog-generator/blog-generator-sections";
import { runCompetitorGenerator } from "@/components/competitor-generation/generation/competitorGenerator";
import { notify } from "@/lib/app-notifications";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import type { CompetitorGridPlaceRow } from "@/lib/competitor-research/local-dominator-grid-parse";
import { parseCompetitorGridTopPlaces } from "@/lib/competitor-research/local-dominator-grid-parse";
import { DEFAULT_ENTITY_PAGE_CREATOR_ENTITY_TYPE_FOCUS, resolveEntityPageCreatorClusterContext } from "@/lib/entity-page-creator/entity-page-creator-cluster-context";
import { ensureEntityPageCreatorPayload } from "@/lib/entity-page-creator/entity-page-creator-defaults";
import { splitEntityTotalIntoAdGroupsAndAds } from "@/lib/local-analysis/entity-ad-group-budget";
import {
  applyGridClusterWikipediaToSapRows,
  runEntityGridLocationClusterAgent,
} from "@/lib/local-analysis/entity-grid-location-wiki-agent";
import { fillEntitySlotKeywordsFromGsc } from "@/lib/local-analysis/entity-preload-clusters-hydrate";
import { finalizeEntitySapRowsForAdGroups } from "@/lib/local-analysis/sap-entity-ad-groups";
import { buildBulkAutoGenerateTemplateCsvFromRows } from "@/lib/local-analysis-csv-export";
import { parseLocalGridEntityRowCount } from "@/lib/local-grid-studio/local-grid-entity-template-rows";
import {
  parseLocalDominatorCsv,
  wikipediaSearchAugmentFromGridRows,
} from "@/lib/local-dominator-csv";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { processParsedLocalDominatorRows } from "@/lib/process-local-dominator-upload";
import { assertSapRowsHaveLinkedWikipedia } from "@/lib/wikipedia/enrich-sap-rows-with-wikipedia";
import { writeSitemapOptimizerBulkCsvSeed } from "@/lib/sitemap-optimizer/sitemap-optimizer-bulk-handoff";
import {
  aggregateLocalGridScan,
  normalizeBusinessText,
  normalizeDomainHost,
} from "./local-grid-aggregator";
import { serializeLocalGridScanToCsv } from "./local-grid-csv";
import type { LocalGridScanDocument } from "./local-grid-types";

export type LocalGridBulkCsvMode = "locations" | "competitors" | "both";

export const NEO_PULSE_OPEN_BULK_CSV_FROM_GRID_EVENT = "neo-pulse:open-bulk-csv-from-grid";

export const LOCAL_GRID_ENTITY_TEMPLATE_FILENAME = "bulk-auto-generate-template.csv";

export function triggerCsvDownloadToPc(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 250);
}

/** Neighbourhood entities from grid cluster + unique GSC keywords (no generic near-me fallback). */
export async function generateLocationsWikiRowsFromGrid(options: {
  site: WordPressSite;
  scan: LocalGridScanDocument;
  gridCsvText: string;
  count: number;
  apiKey: string;
  onProgress?: (status: string) => void;
}): Promise<CSVRow[]> {
  const { site, scan, gridCsvText, count, apiKey, onProgress } = options;
  const report = (status: string) => onProgress?.(status);
  const total = parseLocalGridEntityRowCount(count);
  const { adGroupCount, adsPerGroup } = splitEntityTotalIntoAdGroupsAndAds(total);

  report("Reading grid pins and place weights…");
  const parsed = parseLocalDominatorCsv(gridCsvText, { defaultKeyword: scan.keyword });
  if (parsed.error || parsed.rows.length === 0) {
    throw new Error(parsed.error || "Grid scan has no ranked rows.");
  }

  const processed = await processParsedLocalDominatorRows(parsed.rows);
  if (!processed.ok) {
    throw new Error(processed.error);
  }

  const wikipediaSearchAugment = wikipediaSearchAugmentFromGridRows(parsed.rows);
  const businessName =
    scan.targetBusiness.business.trim() ||
    site.napInfo?.name?.trim() ||
    site.name?.trim() ||
    "Business";

  const defaultPayload = ensureEntityPageCreatorPayload({
    entityAdGroupCount: adGroupCount,
    entityAdsPerGroup: adsPerGroup,
    focusKeyword: scan.keyword,
    businessName,
    entityTypeFocus: [...DEFAULT_ENTITY_PAGE_CREATOR_ENTITY_TYPE_FOCUS],
  });

  const clusterContext = resolveEntityPageCreatorClusterContext({
    site,
    payload: defaultPayload,
    gridPlaceHints: processed.placeHints,
    focusKeyword: scan.keyword,
  });

  report(`Planning ${total} neighbourhood entit${total === 1 ? "y" : "ies"} from grid…`);
  const clusterResult = await runEntityGridLocationClusterAgent({
    apiKey,
    siteId: site.id,
    gridRows: parsed.rows,
    gridKeywordWeights: processed.gridKeywordWeights,
    gridLocations: processed.placeHints,
    gridSummaryMarkdown: processed.gridSummaryMarkdown,
    wikipediaSearchAugment,
    totalSapBudget: total,
    entityAdGroupCount: adGroupCount,
    entityAdsPerGroup: adsPerGroup,
    entityTypeFocus: [...clusterContext.entityTypeFocus],
    gridFallbackKeywordBases: scan.keyword.trim() ? [scan.keyword.trim()] : [],
    businessName: clusterContext.businessName,
    siteName: site.name?.trim() || clusterContext.businessName,
    ...(clusterContext.clientAudienceContextMarkdown
      ? { clientAudienceContextMarkdown: clusterContext.clientAudienceContextMarkdown }
      : {}),
    onClusterPhase: (msg) => report(msg),
    onClusterProgress: (_done, _total, placeLabel, cumulativeRows) => {
      report(`Entity ${cumulativeRows}/${total}: ${placeLabel}`);
    },
  });

  if (clusterResult.sapRows.length !== total) {
    throw new Error(
      `Grid clustering produced ${clusterResult.sapRows.length} entity row(s), expected ${total}.`,
    );
  }

  let baseRows = finalizeEntitySapRowsForAdGroups(
    clusterResult.sapRows.map((row) => ({
      ...row,
      sitemap_type: "entity" as const,
      featuredImage: row.featuredImage ?? "google-maps",
    })),
  );

  baseRows = applyGridClusterWikipediaToSapRows(baseRows, clusterResult.clusterWikipedia);
  assertSapRowsHaveLinkedWikipedia(baseRows);

  const siteName = site.name?.trim() || businessName;
  const siteUrl = site.siteUrl?.trim() || "";
  report("Assigning unique keywords from GSC…");
  const { rows: withKeywords } = await fillEntitySlotKeywordsFromGsc({
    site,
    apiKey,
    model: getResearchModel(site.id),
    siteName,
    siteUrl,
    rows: baseRows,
    gridLocations: processed.placeHints,
    entityTypeFocus: [...clusterContext.entityTypeFocus],
    ...(clusterContext.clientAudienceContextMarkdown
      ? { clientAudienceContextMarkdown: clusterContext.clientAudienceContextMarkdown }
      : {}),
    failOnBlankKeywords: true,
    onPhase: (phase) => report(phase),
  });

  report(`Downloading ${withKeywords.length} entit${withKeywords.length === 1 ? "y" : "ies"}…`);
  return finalizeEntitySapRowsForAdGroups(
    withKeywords.map((row) => ({
      ...row,
      sitemap_type: "entity" as const,
      featuredImage: row.featuredImage ?? "google-maps",
    })),
  );
}

export async function generateCompetitorRowsFromGrid(options: {
  site: WordPressSite;
  scan: LocalGridScanDocument;
  gridCsvText: string;
  count: number;
  apiKey: string;
  onProgress?: (status: string) => void;
}): Promise<CSVRow[]> {
  const { site, scan, gridCsvText, count, apiKey, onProgress } = options;
  const targetCount = Math.max(1, Math.min(20, Math.floor(count) || 5));

  onProgress?.("Selecting top competitors from grid leaderboard…");
  const targetCid = (scan.targetBusiness.cid || scan.targetBusiness.placeId || "").trim();
  const targetHost = normalizeDomainHost(scan.targetBusiness.websiteUrl || site.siteUrl);
  const targetName = normalizeBusinessText(scan.targetBusiness.business || site.name);

  const agg = aggregateLocalGridScan(scan.points, scan.targetBusiness);
  const rivalPlaces: CompetitorGridPlaceRow[] = [];

  for (const comp of agg.competitors) {
    const cHost = normalizeDomainHost(comp.websiteUrl);
    const cName = normalizeBusinessText(comp.business);
    const rawId = (comp.cid || comp.placeId || comp.googlePlaceId || "").trim();
    if (!rawId) continue;
    if (targetCid && rawId === targetCid) continue;
    if (targetHost && cHost && targetHost === cHost) continue;
    if (targetName && cName && targetName === cName) continue;

    const dfsKeyword = /^\d+$/.test(rawId) ? `cid:${rawId}` : `place_id:${rawId}`;
    const idLabel = /^\d+$/.test(rawId) ? `cid ${rawId}` : `place_id ${rawId}`;
    rivalPlaces.push({
      dfsKeyword,
      businessName: comp.business,
      rank: comp.bestRank,
      latitude: comp.latitude ?? scan.centerLat,
      longitude: comp.longitude ?? scan.centerLng,
      idLabel,
      websiteHostname: cHost || null,
    });
    if (rivalPlaces.length >= targetCount) break;
  }

  if (rivalPlaces.length === 0) {
    const parsed = parseCompetitorGridTopPlaces(gridCsvText, targetCount + 4);
    rivalPlaces.push(...parsed.places.slice(0, targetCount));
  }

  if (rivalPlaces.length === 0) {
    throw new Error("No rival competitors found in this grid scan.");
  }

  const res = await runCompetitorGenerator({
    site,
    places: rivalPlaces,
    keyword: scan.keyword,
    apiKey,
    siteId: site.id,
    onProgress: (msg) => onProgress?.(msg),
  });

  return res.rows.map((row) => ({
    ...row,
    sitemap_type: "entity" as const,
    featuredImage: row.featuredImage ?? "google-maps",
  }));
}

export async function generateBulkTemplateCsvFromLocalGrid(options: {
  site: WordPressSite;
  scan: LocalGridScanDocument;
  mode: LocalGridBulkCsvMode;
  count: number;
  onProgress?: (status: string) => void;
}): Promise<{
  rows: CSVRow[];
  csvContent: string;
  filename: string;
}> {
  const { site, scan, mode, count, onProgress } = options;
  const hasScannedItems = scan.points.some((p) => p.items.length > 0);
  if (!hasScannedItems) {
    throw new Error("Run a grid scan on the map first before generating bulk template CSVs.");
  }

  const apiKey = (await resolveOpenRouterApiKeyForHarness()).trim();
  if (!apiKey) {
    throw new Error("OpenRouter API key is required. Configure it in Dashboard -> API Keys.");
  }

  const gridCsvText = serializeLocalGridScanToCsv(scan);
  const allRows: CSVRow[] = [];

  if (mode === "locations" || mode === "both") {
    const locRows = await generateLocationsWikiRowsFromGrid({
      site,
      scan,
      gridCsvText,
      count,
      apiKey,
      onProgress,
    });
    allRows.push(...locRows);
  }

  if (mode === "competitors" || mode === "both") {
    const compRows = await generateCompetitorRowsFromGrid({
      site,
      scan,
      gridCsvText,
      count: mode === "both" ? Math.min(5, count) : count,
      apiKey,
      onProgress,
    });
    allRows.push(...compRows);
  }

  const csvContent = buildBulkAutoGenerateTemplateCsvFromRows(allRows, {
    marketHint: scan.keyword,
    defaultSitemapType: "entity",
  });

  const filename =
    mode === "locations"
      ? LOCAL_GRID_ENTITY_TEMPLATE_FILENAME
      : `${(site.name || "site").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}-${(scan.keyword || "grid").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}-${mode}-bulk-template.csv`;

  triggerCsvDownloadToPc(filename, csvContent);
  notify.success(`Downloaded ${filename} (${allRows.length} rows)`);
  return { rows: allRows, csvContent, filename };
}

export function openGeneratedCsvInBulkWorkspace(csvContent: string): void {
  writeSitemapOptimizerBulkCsvSeed(csvContent);
  writeStoredBlogGeneratorSection("bulk-prompt");
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(NEO_PULSE_OPEN_BULK_CSV_FROM_GRID_EVENT, {
        detail: { csv: csvContent },
      }),
    );
    window.location.hash = "generator/bulk-prompt";
  }
}
