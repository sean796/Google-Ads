import type { WordPressSite } from "@/components/integrations/types";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import {
  appendCompanyKeepContentRows,
  buildCompanyKeepClusters,
  mergeClusterResults,
  partitionCompanyEditorialRows,
} from "@/lib/sitemap-optimizer/company-content-policy";
import { applyContentYearPolicy } from "@/lib/sitemap-optimizer/apply-content-year-policy";
import { dedupeContentSheetRowsByDestination } from "@/lib/sitemap-optimizer/dedupe-content-sheet-by-destination";
import { runGscPerformanceTriage } from "@/lib/sitemap-optimizer/gsc-performance-triage-agent";
import { applyGridOutputPolicies } from "@/lib/sitemap-optimizer/grid-output-policies";
import { buildPostRowsFromGscGrid } from "@/lib/sitemap-optimizer/grid-csv-catalog";
import {
  planGridBlogBriefTopics,
  runGridNewBlogBriefAgent,
} from "@/lib/sitemap-optimizer/grid-csv-new-blog-agent";
import { runGridMaxSizeClusterAgent } from "@/lib/sitemap-optimizer/grid-macro-cluster-agent";
import {
  blogDestinationPolicyForCollections,
  normalizeMergeDestinations,
} from "@/lib/sitemap-optimizer/blog-destination-policy";
import { runSitemapOptimizerClusterAgent } from "@/lib/sitemap-optimizer/sitemap-optimizer-cluster-agent";
import type { GscParsedPageRow } from "@/lib/sitemap-optimizer/parse-gsc-pages-csv";
import type {
  SitemapOptimizerGscDateRange,
  SitemapOptimizerProgress,
  SitemapOptimizerRunResult,
} from "@/lib/sitemap-optimizer/types";

const GRID_POLICY_MAX_URLS = 5 as const;

export type GridCsvHarnessCallbacks = {
  setPhase: (phase: SitemapOptimizerProgress["phase"]) => void;
  setProgress: (p: SitemapOptimizerProgress) => void;
  signal: AbortSignal;
};

function isRedirectMapGridRows(rows: readonly { gridRedirectFromUrl?: string }[]): boolean {
  return rows.some((r) => Boolean(r.gridRedirectFromUrl?.trim()));
}

export async function runGridCsvHarness(args: {
  gscPagesUpload: GscParsedPageRow[];
  dateRange: SitemapOptimizerGscDateRange;
  apiKey: string;
  site: WordPressSite | null;
  callbacks: GridCsvHarnessCallbacks;
}): Promise<{ ok: true; result: SitemapOptimizerRunResult } | { ok: false; error: string }> {
  const { gscPagesUpload, dateRange, callbacks } = args;
  const blogDestination = blogDestinationPolicyForCollections(new Set(["posts"]), {
    gridCsv: true,
    redirectMap: gscPagesUpload.some((r) => Boolean(r.redirectFromUrl?.trim())),
  });
  const { setPhase, setProgress, signal } = callbacks;
  const uploadCount = gscPagesUpload.length;

  if (!uploadCount) {
    return { ok: false, error: "Upload a GSC grid CSV with at least one URL row." };
  }

  setPhase("ingest_csv");
  setProgress({
    phase: "ingest_csv",
    completed: uploadCount,
    total: uploadCount,
    runMode: "grid_csv",
    uploadRowCount: uploadCount,
    urlsProcessed: uploadCount,
    inventoryCount: uploadCount,
  });

  if (signal.aborted) return { ok: false, error: "Cancelled" };

  let gridRows = buildPostRowsFromGscGrid(gscPagesUpload);
  const siteUrl = getPublicSiteUrl(args.site).trim() || args.site?.siteUrl?.trim() || "";
  const { editorial: editorialRows, company: companyRows } = partitionCompanyEditorialRows(
    gridRows,
    siteUrl,
  );
  const companyClusterResult = buildCompanyKeepClusters(companyRows);
  gridRows = editorialRows;

  setPhase("gsc_triage");
  setProgress({
    phase: "gsc_triage",
    completed: 0,
    total: gridRows.length,
    runMode: "grid_csv",
    uploadRowCount: uploadCount,
    inventoryCount: uploadCount,
    detail: "Analyzing GSC performance vs site",
  });

  const triage = await runGscPerformanceTriage(gridRows, args.apiKey, {
    signal,
    onProgress: (completed, total) => {
      setProgress({
        phase: "gsc_triage",
        completed,
        total,
        runMode: "grid_csv",
        uploadRowCount: uploadCount,
        inventoryCount: uploadCount,
        detail: `GSC triage ${completed} / ${total}`,
      });
    },
  });

  gridRows = triage.rows;
  const consolidateRows = triage.consolidateRows;
  const redirectMap = isRedirectMapGridRows(consolidateRows);

  let clusters: Awaited<ReturnType<typeof runSitemapOptimizerClusterAgent>> = {
    clusters: [],
    singletons: [],
  };
  let clusteredRows = consolidateRows;

  if (consolidateRows.length > 0) {
    setPhase("clustering");
    if (redirectMap) {
      const packed = await runGridMaxSizeClusterAgent(
        consolidateRows,
        1,
        args.apiKey,
        signal,
        (p) => {
          setProgress({
            phase: "clustering",
            completed: p.clustersCreated ?? 0,
            total: consolidateRows.length,
            runMode: "grid_csv",
            uploadRowCount: uploadCount,
            clustersCreated: p.clustersCreated,
            inventoryCount: uploadCount,
          });
        },
        "none",
      );
      clusters = packed.clusters;
      clusteredRows = packed.rows;
    } else {
      clusters = await runSitemapOptimizerClusterAgent(consolidateRows, args.apiKey, signal, {
        runMode: "grid_csv",
        gscPerformanceMode: true,
        onProgress: (p) => {
          setProgress({
            phase: "clustering",
            completed: p.clusterBatchCompleted ?? 0,
            total: p.clusterBatchTotal ?? consolidateRows.length,
            runMode: "grid_csv",
            uploadRowCount: uploadCount,
            urlsProcessed: p.urlsProcessed,
            clustersCreated: p.clustersCreated,
            inventoryCount: uploadCount,
          });
        },
      });
    }
  }

  if (signal.aborted) return { ok: false, error: "Cancelled" };

  const groupCount = clusters.clusters.length;
  const { topicsTotal, blogsTotal } = planGridBlogBriefTopics(
    clusters,
    clusteredRows,
    GRID_POLICY_MAX_URLS,
  );

  setPhase("merge");
  setProgress({
    phase: "merge",
    completed: 0,
    total: blogsTotal,
    runMode: "grid_csv",
    uploadRowCount: uploadCount,
    clustersCreated: groupCount,
    blogsTotal,
    topicsTotal,
    inventoryCount: uploadCount,
  });

  const analyzedAt = new Date().toISOString();
  let merges = await runGridNewBlogBriefAgent(
    clusters,
    clusteredRows,
    args.apiKey,
    signal,
    undefined,
    (sectionProgress) => {
      setProgress({
        phase: "merge",
        completed: sectionProgress.blogsCompleted,
        total: sectionProgress.blogsTotal,
        runMode: "grid_csv",
        uploadRowCount: uploadCount,
        blogsCompleted: sectionProgress.blogsCompleted,
        blogsTotal: sectionProgress.blogsTotal,
        topicsCompleted: sectionProgress.topicsCompleted,
        topicsTotal: sectionProgress.topicsTotal,
        inventoryCount: uploadCount,
      });
    },
    GRID_POLICY_MAX_URLS,
    blogDestination,
  );

  const rowMapForNormalize = new Map(clusteredRows.map((r) => [r.postId, r]));
  const memberUrlsByCluster = new Map(
    clusters.clusters.map((c) => [
      c.clusterId,
      c.memberPostIds
        .map((id) => rowMapForNormalize.get(id)?.url.trim())
        .filter((u): u is string => Boolean(u)),
    ]),
  );
  merges = normalizeMergeDestinations(merges, blogDestination, memberUrlsByCluster, analyzedAt);

  if (signal.aborted) return { ok: false, error: "Cancelled" };

  const {
    rows: policyRows,
    clusters: policyClusters,
    merges: refreshedMerges,
    contentSheet: editorialSheet,
  } = applyGridOutputPolicies({
    rows: clusteredRows,
    clusters,
    merges,
    gridMaxUrlsPerPost: GRID_POLICY_MAX_URLS,
    macroMode: true,
    analyzedAt,
  });

  const contentSheet = dedupeContentSheetRowsByDestination(
    appendCompanyKeepContentRows(editorialSheet, companyRows),
  );
  const finalClusters = mergeClusterResults(policyClusters, companyClusterResult);
  const yearApplied = applyContentYearPolicy({
    rows: [...triage.rows, ...companyRows],
    merges: refreshedMerges,
    contentSheet,
    clusters: finalClusters,
    analyzedAt,
  });

  const runResult: SitemapOptimizerRunResult = {
    rows: yearApplied.rows,
    clusters: finalClusters,
    merges: yearApplied.merges,
    contentSheet: yearApplied.contentSheet,
    gscMissCount: 0,
    dateRange,
    analyzedAt,
    gscUploadRowCount: uploadCount,
    runMode: "grid_csv",
    gridRedirectCsvOnly: false,
    blogDestination,
    redirectMapUpload: gscPagesUpload.some((r) => Boolean(r.redirectFromUrl?.trim())),
  };

  setPhase("done");
  setProgress({
    phase: "done",
    completed: contentSheet.length,
    total: contentSheet.length,
    runMode: "grid_csv",
    uploadRowCount: uploadCount,
  });

  return { ok: true, result: runResult };
}
