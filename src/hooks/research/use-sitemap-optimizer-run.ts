import { useCallback, useRef, useState } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import { loadApiKey } from "@/lib/api";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import { restCollectionsFromSelectedKeys } from "@/lib/sitemap-optimizer/collection-options";
import type { SitemapOptimizerCollectionOption } from "@/lib/sitemap-optimizer/collection-options";
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
import { runEntityCompressionPipeline } from "@/lib/sitemap-optimizer/entity-compression-pipeline";
import { blogDestinationPolicyForCollections } from "@/lib/sitemap-optimizer/blog-destination-policy";
import {
  buildRedirectMapPipelineRows,
  isRedirectGridUpload,
} from "@/lib/sitemap-optimizer/apply-redirect-map-to-inventory";
import {
  filterInventoryByGscPages,
  mergeInventoryWithGscPagesUpload,
} from "@/lib/sitemap-optimizer/filter-inventory-by-gsc-pages";
import { fetchSitemapOptimizerCatalog } from "@/lib/sitemap-optimizer/fetch-sitemap-optimizer-catalog";
import type { GscParsedPageRow } from "@/lib/sitemap-optimizer/parse-gsc-pages-csv";
import type { SitemapOptimizerGscDateRange } from "@/lib/sitemap-optimizer/types";
import type {
  SitemapOptimizerCollectionKey,
  SitemapOptimizerPostRow,
  SitemapOptimizerProgress,
  SitemapOptimizerRunResult,
} from "@/lib/sitemap-optimizer/types";
import { runGridCsvHarness } from "@/lib/sitemap-optimizer/run-grid-csv-harness";
import { runWordpressEditorialGscPipeline } from "@/lib/sitemap-optimizer/wordpress-editorial-gsc-pipeline";
import {
  appendCompanyKeepContentRows,
  buildCompanyKeepClusters,
  mergeClusterResults,
  partitionCompanyEditorialRows,
} from "@/lib/sitemap-optimizer/company-content-policy";
import { applyContentYearPolicy } from "@/lib/sitemap-optimizer/apply-content-year-policy";
import { dedupeContentSheetRowsByDestination } from "@/lib/sitemap-optimizer/dedupe-content-sheet-by-destination";
export function useSitemapOptimizerRun() {
  const [phase, setPhase] = useState<SitemapOptimizerProgress["phase"]>("idle");
  const [progress, setProgress] = useState<SitemapOptimizerProgress>({
    phase: "idle",
    completed: 0,
    total: 0,
  });
  const [result, setResult] = useState<SitemapOptimizerRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("idle");
    setProgress({ phase: "idle", completed: 0, total: 0 });
  }, []);

  const run = useCallback(
    async (args: {
      site: WordPressSite | null;
      collectionOptions: SitemapOptimizerCollectionOption[];
      selectedCollections: Set<SitemapOptimizerCollectionKey>;
      dateRange: SitemapOptimizerGscDateRange;
      gscPagesUpload?: GscParsedPageRow[] | null;
      /** Redirect map CSV (old_url → new_url) — used with live GSC or WordPress inventory. */
      redirectMapUpload?: GscParsedPageRow[] | null;
      /** When false and GSC CSV is uploaded, only URLs in the CSV that match inventory are analyzed. */
      analyzeFullInventory?: boolean;
      /** Live GSC API import (sitewide metrics + traffic filter). */
      gscImportMode?: boolean;
      forceLiveInventory?: boolean;
    }) => {
      const {
        site,
        collectionOptions,
        selectedCollections,
        dateRange,
        gscPagesUpload,
        analyzeFullInventory = true,
        redirectMapUpload,
        gscImportMode = false,
        forceLiveInventory = false,
      } = args;
      setError(null);
      setResult(null);

      const redirectGridUpload =
        redirectMapUpload?.length && isRedirectGridUpload(redirectMapUpload)
          ? redirectMapUpload
          : gscPagesUpload?.length && isRedirectGridUpload(gscPagesUpload)
            ? gscPagesUpload
            : null;
      const gridHarness =
        Boolean(gscPagesUpload?.length) && !redirectGridUpload && !site;
      const apiKey = loadApiKey()?.trim();
      if (!apiKey) {
        setError("OpenRouter API key required.");
        return { ok: false as const, error: "OpenRouter API key required." };
      }

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const signal = ac.signal;

      try {
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
            return { ok: false as const, error: gridRes.error };
          }
          setResult(gridRes.result);
          abortRef.current = null;
          return { ok: true as const, result: gridRes.result };
        }

        const collections = restCollectionsFromSelectedKeys(collectionOptions, selectedCollections);
        if (!collections.length) {
          setError("Select at least one collection.");
          return { ok: false as const, error: "Select at least one collection." };
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
            return { ok: false as const, error: catalogRes.error };
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
            return { ok: false as const, error: msg };
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
          return { ok: false as const, error: "" };
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
          return { ok: false as const, error: "" };
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

        if (hasEntityPipeline) {
          setPhase("gsc_triage");
          setProgress({
            phase: "gsc_triage",
            completed: 0,
            total: entityRows.length,
            detail: `Keep 0 / ${entityRows.length} service areas`,
            ...gscAnalyzeProgress,
          });
        } else {
          setPhase("clustering");
          setProgress({
            phase: "clustering",
            completed: 0,
            total: 0,
            clusteringSubphase: "batch",
            ...gscAnalyzeProgress,
          });
        }

        let pipelineClusters: SitemapOptimizerRunResult["clusters"] = {
          clusters: [],
          singletons: [],
        };
        let merges: SitemapOptimizerRunResult["merges"] = [];
        let contentSheet: SitemapOptimizerRunResult["contentSheet"] = [];
        const analyzedAt = new Date().toISOString();

        if (hasEntityPipeline) {
          try {
            const entityResult = await runEntityCompressionPipeline({
            entityRows,
            profile: entityProfile,
            apiKey,
            siteName: site?.name,
            blogDestination,
            analyzedAt,
            signal,
            onTriageProgress: (completed, total) => {
              setPhase("gsc_triage");
              setProgress({
                phase: "gsc_triage",
                completed,
                total,
                detail: `Keep ${completed} / ${total} service areas`,
                entityPrimary: true,
                ...gscAnalyzeProgress,
              });
            },
            onClusterProgress: (p) => {
              setPhase("clustering");
              setProgress({
                phase: "clustering",
                completed: p.clusterBatchCompleted ?? 0,
                total: p.clusterBatchTotal ?? 0,
                urlsProcessed: p.urlsProcessed,
                clustersCreated: p.clustersCreated,
                clusteringSubphase:
                  p.subphase === "compress"
                    ? "compress"
                    : (p.subphase as SitemapOptimizerProgress["clusteringSubphase"]),
                detail:
                  p.subphase === "compress"
                    ? `Compress ${p.urlsProcessed} / ${p.clusterBatchTotal ?? p.urlsProcessed} service areas`
                    : undefined,
                entityPrimary: true,
                ...gscAnalyzeProgress,
              });
            },
            onMergeProgress: (completed, total) => {
              setPhase("merge");
              setProgress({
                phase: "merge",
                completed,
                total,
                detail: `Transform ${completed} / ${total} families`,
                entityPrimary: true,
                ...gscAnalyzeProgress,
              });
            },
          });

          pipelineClusters = entityResult.clusters;
          merges = entityResult.merges;
          contentSheet = dedupeContentSheetRowsByDestination(
            appendCompanyKeepContentRows(entityResult.contentSheet, companyRows),
          );
          gscRows = [...entityResult.rows, ...companyRows];
          } catch {
            gscRows = [...entityRows, ...companyRows];
          }
        }

        if (hasEditorialPipeline) {
          const editorialOut = await runWordpressEditorialGscPipeline({
            pipelineRows,
            useRedirectFamilies,
            apiKey,
            signal,
            blogDestination,
            analyzedAt,
            companyRows,
            companyClusterResult,
            existingContentSheet: contentSheet,
            existingMerges: merges,
            existingClusters: pipelineClusters,
            entityRows,
            gscAnalyzeProgress,
            setPhase,
            setProgress,
          });
          pipelineRows = editorialOut.pipelineRows;
          contentSheet = dedupeContentSheetRowsByDestination(editorialOut.contentSheet);
          merges = editorialOut.merges;
          pipelineClusters = editorialOut.pipelineClusters;
          gscRows = editorialOut.gscRows;

          setPhase("content_sheet");
          setProgress({
            phase: "content_sheet",
            completed: contentSheet.length,
            total: contentSheet.length,
            detail: `${contentSheet.length} content plans`,
            ...gscAnalyzeProgress,
          });
        } else if (!hasEntityPipeline && !entityProfile.entityOnly) {
          setPhase("content_sheet");
          setProgress({
            phase: "content_sheet",
            completed: 0,
            total: 0,
            detail: "No matching URLs",
            ...gscAnalyzeProgress,
          });
        } else {
          pipelineClusters = mergeClusterResults(pipelineClusters, companyClusterResult);
          setPhase("content_sheet");
          setProgress({
            phase: "content_sheet",
            completed: contentSheet.length,
            total: contentSheet.length,
            detail: `${contentSheet.length} service-area content plans`,
            ...gscAnalyzeProgress,
          });
        }

        const yearApplied = applyContentYearPolicy({
          rows: gscRows,
          merges,
          contentSheet,
          clusters: pipelineClusters,
          analyzedAt,
        });
        gscRows = yearApplied.rows;
        merges = yearApplied.merges;
        contentSheet = yearApplied.contentSheet;

        const runResult: SitemapOptimizerRunResult = {
          rows: gscRows,
          clusters: pipelineClusters,
          merges,
          contentSheet,
          gscMissCount: missCount,
          dateRange,
          analyzedAt,
          gscUploadRowCount: redirectGridUpload?.length ?? gscPagesUpload?.length,
          runMode: "wordpress",
          blogDestination,
          redirectMapUpload: Boolean(redirectGridUpload),
          entityPrimary: entityOnly,
        };

        setResult(runResult);
        setPhase("done");
        setProgress({
          phase: "done",
          completed: contentSheet.length,
          total: contentSheet.length,
          detail: "Complete",
        });
        abortRef.current = null;
        return { ok: true as const, result: runResult };
      } catch {
        abortRef.current = null;
        const analyzedAt = new Date().toISOString();
        const runResult: SitemapOptimizerRunResult = {
          rows: [],
          clusters: { clusters: [], singletons: [] },
          merges: [],
          contentSheet: [],
          gscMissCount: 0,
          dateRange,
          analyzedAt,
          runMode: "wordpress",
          blogDestination: blogDestinationPolicyForCollections(selectedCollections, {
            redirectMap: Boolean(redirectGridUpload),
          }),
          entityPrimary:
            selectedCollections.has("entity") &&
            !selectedCollections.has("posts") &&
            !selectedCollections.has("pages"),
        };
        setResult(runResult);
        setPhase("done");
        setProgress({
          phase: "done",
          completed: 0,
          total: 0,
          detail: "Complete",
        });
        return { ok: true as const, result: runResult };
      }
    },
    [],
  );

  const running = phase !== "idle" && phase !== "done" && phase !== "error";

  return {
    phase,
    progress,
    result,
    error,
    running,
    run,
    cancel,
    setResult,
    setError,
  };
}
