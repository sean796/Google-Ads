import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import { restCollectionsFromSelectedKeys } from "@/lib/sitemap-optimizer/collection-options";
import {
  enrichSitemapOptimizerRowsFromGscCsvUpload,
  enrichSitemapOptimizerRowsWithGsc,
} from "@/lib/sitemap-optimizer/enrich-sitemap-optimizer-gsc";
import {
  mergeGscMetricsOntoInventory,
  runSitemapOptimizerGscImport,
  resolveSitemapOptimizerTrafficFilter,
  type SitemapOptimizerTrafficFilter,
} from "@/lib/sitemap-optimizer/enrich-sitemap-optimizer-gsc-import";
import { buildEntityCompressionProfile } from "@/lib/sitemap-optimizer/entity-compression-profile";
import { partitionEntityAndEditorialRows } from "@/lib/sitemap-optimizer/entity-compression-partition";
import { blogDestinationPolicyForCollections } from "@/lib/sitemap-optimizer/blog-destination-policy";
import {
  buildRedirectMapPipelineRows,
} from "@/lib/sitemap-optimizer/apply-redirect-map-to-inventory";
import {
  filterInventoryByGscPages,
  mergeInventoryWithGscPagesUpload,
} from "@/lib/sitemap-optimizer/filter-inventory-by-gsc-pages";
import { fetchSitemapOptimizerCatalog } from "@/lib/sitemap-optimizer/fetch-sitemap-optimizer-catalog";
import type { GscParsedPageRow } from "@/lib/sitemap-optimizer/parse-gsc-pages-csv";
import type {
  SitemapOptimizerPostRow,
  SitemapOptimizerRunResult,
} from "@/lib/sitemap-optimizer/types";
import { runGridCsvHarness } from "@/lib/sitemap-optimizer/run-grid-csv-harness";
import {
  buildCompanyKeepClusters,
  partitionCompanyEditorialRows,
} from "@/lib/sitemap-optimizer/company-content-policy";
import type {
  PreparedSitemapOptimizerRun,
  SitemapOptimizerRunArgs,
  SitemapOptimizerRunDeps,
  SitemapOptimizerRunPrepareResult,
} from "./use-sitemap-optimizer-run-types";

export async function prepareSitemapOptimizerRun(
  deps: SitemapOptimizerRunDeps,
  args: SitemapOptimizerRunArgs,
  runContext: {
    redirectGridUpload: GscParsedPageRow[] | null;
    gridHarness: boolean;
    apiKey: string;
    signal: AbortSignal;
  },
): Promise<SitemapOptimizerRunPrepareResult> {
  const { setPhase, setProgress, setError, setResult, abortRef } = deps;
  const {
    site,
    collectionOptions,
    selectedCollections,
    dateRange,
    gscPagesUpload,
    analyzeFullInventory = true,
    gscImportMode = false,
    forceLiveInventory = false,
  } = args;
  const { redirectGridUpload, gridHarness, apiKey, signal } = runContext;

  if (gridHarness) {
    const gridRes = await runGridCsvHarness({
      gscPagesUpload: gscPagesUpload!,
      dateRange,
      apiKey: apiKey ?? "",
      site,
      callbacks: { setPhase, setProgress, signal },
    });
    if (gridRes.ok === false) {
      if (gridRes.error !== "Cancelled") setError(gridRes.error);
      setPhase(gridRes.error === "Cancelled" ? "idle" : "error");
      return { outcome: { ok: false as const, error: gridRes.error } };
    }
    setResult(gridRes.result);
    abortRef.current = null;
    return { outcome: { ok: true as const, result: gridRes.result } };
  }

  const collections = restCollectionsFromSelectedKeys(collectionOptions, selectedCollections);
  if (!collections.length) {
    setError("Select at least one collection.");
    return { outcome: { ok: false as const, error: "Select at least one collection." } };
  }

  const blogDestination = blogDestinationPolicyForCollections(selectedCollections, {
    redirectMap: Boolean(redirectGridUpload),
  });
  const entityOnly =
    selectedCollections.has("entity") &&
    !selectedCollections.has("posts") &&
    !selectedCollections.has("pages");

  setPhase("inventory");
  setProgress({
    phase: "inventory",
    completed: 0,
    total: 1,
    detail: entityOnly ? "Loading entity sitemap" : "Loading WordPress inventory",
    entityPrimary: entityOnly,
  });

  const catalogRes = await fetchSitemapOptimizerCatalog(site, collections, {
    forceLiveInventory: gscImportMode || forceLiveInventory,
    entityOnly,
  });
  let inventoryRows: SitemapOptimizerPostRow[] = [];
  let inventoryDetail = entityOnly ? "Loading entity sitemap" : "Loading WordPress inventory";
  if (catalogRes.ok === false) {
    if (!entityOnly) {
      setError(catalogRes.error);
      setPhase("error");
      return { outcome: { ok: false as const, error: catalogRes.error } };
    }
  } else {
    inventoryRows = catalogRes.rows;
    inventoryDetail =
      catalogRes.source === "kb"
        ? "Inventory loaded from Knowledge Base JSON"
        : catalogRes.source === "sitemap"
          ? `Entity sitemap: ${catalogRes.rows.length} URLs`
          : "Inventory loaded from WordPress";
  }

  if (redirectGridUpload) {
    const built = buildRedirectMapPipelineRows(inventoryRows, redirectGridUpload);
    inventoryRows = built.rows;
    inventoryDetail = `Redirect map: ${built.uploadRowCount} row(s) from CSV`;
    if (built.linkedCount > 0) {
      inventoryDetail += ` (${built.linkedCount} linked to WP posts)`;
    }
  } else if (gscPagesUpload?.length && !analyzeFullInventory) {
    const filtered = filterInventoryByGscPages(inventoryRows, gscPagesUpload);
    if (!filtered.rows.length) {
      const msg =
        "No uploaded GSC URLs matched WordPress inventory. Check domain, paths, and selected collections.";
      setError(msg);
      setPhase("error");
      return { outcome: { ok: false as const, error: msg } };
    }
    inventoryRows = filtered.rows;
    inventoryDetail = `GSC CSV: ${filtered.matchedCount} of ${filtered.uploadRowCount} URLs matched inventory`;
  } else if (gscPagesUpload?.length) {
    const merged = mergeInventoryWithGscPagesUpload(inventoryRows, gscPagesUpload);
    inventoryRows = merged.rows;
    inventoryDetail = `Full inventory: ${inventoryRows.length} URLs (${merged.matchedCount} with GSC CSV metrics)`;
  }

  setProgress({
    phase: "inventory",
    completed: 1,
    total: 1,
    detail: inventoryDetail,
    inventoryCount: inventoryRows.length,
    entityPrimary: entityOnly,
  });

  if (signal.aborted) {
    setPhase("idle");
    setProgress({ phase: "idle", completed: 0, total: 0 });
    abortRef.current = null;
    return { outcome: { ok: false as const, error: "" } };
  }

  const usingGscCsvUpload = Boolean(gscPagesUpload?.length) && !gscImportMode;
  const gscSiteUrl = getPublicSiteUrl(site).trim() || site.siteUrl.trim();
  setPhase("gsc");
  setProgress({
    phase: "gsc",
    completed: 0,
    total: inventoryRows.length,
    detail: usingGscCsvUpload
      ? "Using uploaded GSC CSV"
      : gscImportMode
        ? "Importing Search Console (sitewide)"
        : "Fetching Search Console queries",
    inventoryCount: inventoryRows.length,
    entityPrimary: entityOnly,
  });

  let gscRows: SitemapOptimizerPostRow[];
  let missCount: number;
  let resolvedTrafficFilter: SitemapOptimizerTrafficFilter = "all";

  if (usingGscCsvUpload) {
    const fromCsv = enrichSitemapOptimizerRowsFromGscCsvUpload(inventoryRows);
    gscRows = fromCsv.rows;
    missCount = fromCsv.missCount;
    setProgress({
      phase: "gsc",
      completed: inventoryRows.length,
      total: inventoryRows.length,
      detail: "Using uploaded GSC CSV",
      inventoryCount: inventoryRows.length,
    });
  } else if (gscImportMode) {
    const importRes = await runSitemapOptimizerGscImport({
      siteUrl: gscSiteUrl,
      inventory: inventoryRows,
      dateRange,
      entityOnly,
      signal,
      onProgress: (p) => {
        const subphase =
          p.phase === "queries"
            ? "queries"
            : p.phase === "filter"
              ? "filter"
              : p.phase === "join"
                ? "join"
                : "sitewide";
        const activeFilter = p.trafficFilter ?? "traffic";
        const importStepTotal = activeFilter === "traffic" ? 4 : 3;
        let importStep = 0;
        if (p.phase === "sitewide") importStep = p.completed >= 1 ? 1 : 0;
        else if (p.phase === "join") importStep = p.completed >= 1 ? 2 : 1;
        else if (p.phase === "filter") importStep = p.completed >= 1 ? 3 : 2;
        else if (p.phase === "queries") importStep = Math.max(0, importStepTotal - 1);

        setProgress({
          phase: "gsc",
          completed: importStep,
          total: importStepTotal,
          detail: p.label,
          gscImportSubphase: subphase,
          gscSitePageCount: p.sitePageCount,
          gscAnalyzedPostCount: p.analyzedCount,
          gscTrafficFilter: activeFilter,
          inventoryCount: p.inventoryCount ?? inventoryRows.length,
          entityPrimary: entityOnly,
          ...(p.phase === "queries" && p.total > 0
            ? {
                gscQueryProgressCompleted: p.completed,
                gscQueryProgressTotal: p.total,
              }
            : {
                gscQueryProgressCompleted: undefined,
                gscQueryProgressTotal: undefined,
              }),
        });
      },
    });
    gscRows = importRes.rows;
    missCount = importRes.missCount;
    resolvedTrafficFilter = importRes.trafficFilter;
    if (!gscRows.length && entityOnly) {
      gscRows = inventoryRows;
      missCount = 0;
    }
    setProgress({
      phase: "gsc",
      completed: resolvedTrafficFilter === "traffic" ? 4 : 3,
      total: resolvedTrafficFilter === "traffic" ? 4 : 3,
      detail: "GSC import complete",
      gscSitePageCount: importRes.sitePageCount,
      gscAnalyzedPostCount: importRes.analyzedCount,
      gscTrafficFilter: resolvedTrafficFilter,
      inventoryCount: inventoryRows.length,
      entityPrimary: entityOnly,
    });
  } else {
    const legacy = await enrichSitemapOptimizerRowsWithGsc(
      gscSiteUrl,
      inventoryRows,
      dateRange,
      (completed, total) => {
        setProgress({
          phase: "gsc",
          completed,
          total,
          detail: "Fetching Search Console queries",
          inventoryCount: inventoryRows.length,
        });
      },
      signal,
    );
    const autoFiltered = resolveSitemapOptimizerTrafficFilter(legacy.rows, { entityOnly });
    gscRows = autoFiltered.rows;
    missCount = legacy.missCount;
    resolvedTrafficFilter = autoFiltered.filter;
    if (!gscRows.length && entityOnly) {
      gscRows = inventoryRows;
      missCount = legacy.missCount;
    }
  }

  if (signal.aborted) {
    setPhase("idle");
    setProgress({ phase: "idle", completed: 0, total: 0 });
    abortRef.current = null;
    return { outcome: { ok: false as const, error: "" } };
  }

  const enrichedInventory = mergeGscMetricsOntoInventory(inventoryRows, gscRows);

  const entityProfile = buildEntityCompressionProfile({
    site,
    selectedCollections,
    trafficFilter: resolvedTrafficFilter,
    redirectMap: Boolean(redirectGridUpload),
  });

  const entityPartitionSource = entityProfile.active ? enrichedInventory : gscRows;
  const { entityRows, editorialRows: preEditorialRows } = partitionEntityAndEditorialRows(
    entityPartitionSource,
    entityProfile.entityEndpoint,
  );

  let companyRows: SitemapOptimizerPostRow[] = [];
  let pipelineRows: SitemapOptimizerPostRow[] = [];

  if (entityProfile.entityOnly) {
    // Continue even when partition yields zero entity rows.
  } else if (entityProfile.skipCompanyPartition) {
    const part = partitionCompanyEditorialRows(preEditorialRows, gscSiteUrl);
    pipelineRows = part.editorial;
    companyRows = part.company;
  } else {
    const { editorialRows: editorialFromGsc } = partitionEntityAndEditorialRows(
      gscRows,
      entityProfile.entityEndpoint,
    );
    const part = partitionCompanyEditorialRows(
      entityProfile.active ? editorialFromGsc : gscRows,
      gscSiteUrl,
    );
    pipelineRows = part.editorial;
    companyRows = part.company;
  }

  const companyClusterResult = buildCompanyKeepClusters(companyRows);
  const hasEditorialPipeline = !entityProfile.entityOnly && pipelineRows.length > 0;
  const hasEntityPipeline = entityProfile.active && entityRows.length > 0;

  const gscAnalyzeProgress = {
    inventoryCount: inventoryRows.length,
    gscAnalyzedPostCount: gscRows.length,
    entityPrimary: entityOnly,
    ...(gscImportMode ? { gscTrafficFilter: resolvedTrafficFilter } : {}),
  };

  const redirectRowCount = pipelineRows.filter((r) =>
    Boolean(r.gridRedirectFromUrl?.trim()),
  ).length;
  const useRedirectFamilies =
    Boolean(redirectGridUpload) || redirectRowCount > 0;

  const pipelineClusters: SitemapOptimizerRunResult["clusters"] = {
    clusters: [],
    singletons: [],
  };
  const merges: SitemapOptimizerRunResult["merges"] = [];
  const contentSheet: SitemapOptimizerRunResult["contentSheet"] = [];
  const analyzedAt = new Date().toISOString();

  return {
    prepared: {
      site,
      apiKey,
      signal,
      blogDestination,
      entityOnly,
      gscRows,
      missCount,
      entityProfile,
      entityRows,
      pipelineRows,
      companyRows,
      companyClusterResult,
      hasEditorialPipeline,
      hasEntityPipeline,
      gscAnalyzeProgress,
      useRedirectFamilies,
      pipelineClusters,
      merges,
      contentSheet,
      analyzedAt,
      dateRange,
      gscPagesUpload,
      redirectGridUpload,
    },
  };
}
