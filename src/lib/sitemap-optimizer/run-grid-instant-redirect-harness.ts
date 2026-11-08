import { applyCompanyNewsTags } from "@/lib/sitemap-optimizer/grid-company-news";
import { applyGridOutputPolicies } from "@/lib/sitemap-optimizer/grid-output-policies";
import { buildPostRowsFromGscGrid } from "@/lib/sitemap-optimizer/grid-csv-catalog";
import { isGridInstantRedirectMode } from "@/lib/sitemap-optimizer/grid-compression-policy";
import { buildDeterministicGridBriefs } from "@/lib/sitemap-optimizer/grid-deterministic-brief";
import { finalizeGridClusterResult } from "@/lib/sitemap-optimizer/grid-finalize-clusters";
import { clusterRedirectMapForOneToOne } from "@/lib/sitemap-optimizer/grid-prefilled-group-cluster";
import type { GscParsedPageRow } from "@/lib/sitemap-optimizer/parse-gsc-pages-csv";
import type {
  SitemapOptimizerGscDateRange,
  SitemapOptimizerProgress,
  SitemapOptimizerRunResult,
} from "@/lib/sitemap-optimizer/types";
import type { GridCompressionLevel } from "@/lib/sitemap-optimizer/grid-compression-policy";
import type { GridMaxUrlsPerPost } from "@/lib/sitemap-optimizer/grid-macro-cluster-policy";

export type GridCsvHarnessCallbacks = {
  setPhase: (phase: SitemapOptimizerProgress["phase"]) => void;
  setProgress: (p: SitemapOptimizerProgress) => void;
  signal: AbortSignal;
};

function buildGridRunResult(args: {
  gscPagesUpload: GscParsedPageRow[];
  dateRange: SitemapOptimizerGscDateRange;
  maxUrlsPerPost: GridMaxUrlsPerPost;
  gridCompression: GridCompressionLevel;
  gridRows: ReturnType<typeof buildPostRowsFromGscGrid>;
  clusters: ReturnType<typeof finalizeGridClusterResult>;
  merges: ReturnType<typeof buildDeterministicGridBriefs>;
}): SitemapOptimizerRunResult {
  const analyzedAt = new Date().toISOString();
  const { rows, clusters, merges, contentSheet } = applyGridOutputPolicies({
    rows: args.gridRows,
    clusters: args.clusters,
    merges: args.merges,
    gridMaxUrlsPerPost: args.maxUrlsPerPost,
    macroMode: true,
    analyzedAt,
  });

  return {
    rows,
    clusters,
    merges,
    contentSheet,
    gscMissCount: 0,
    dateRange: args.dateRange,
    analyzedAt,
    gscUploadRowCount: args.gscPagesUpload.length,
    runMode: "grid_csv",
    gridMaxUrlsPerPost: args.maxUrlsPerPost,
    gridRedirectCsvOnly: true,
    gridCompression: args.gridCompression,
  };
}

/** Synchronous 1:1 redirect map — no OpenRouter tagging or briefs. */
export function runGridInstantRedirectHarness(args: {
  gscPagesUpload: GscParsedPageRow[];
  dateRange: SitemapOptimizerGscDateRange;
  callbacks: GridCsvHarnessCallbacks;
}): { ok: true; result: SitemapOptimizerRunResult } | { ok: false; error: string } {
  const maxUrlsPerPost = 1 as const;
  const gridCompression = "none" as const;
  const { gscPagesUpload, dateRange, callbacks } = args;
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
    gridMaxUrlsPerPost: maxUrlsPerPost,
  });

  if (signal.aborted) return { ok: false, error: "Cancelled" };

  const taggedRows = applyCompanyNewsTags(buildPostRowsFromGscGrid(gscPagesUpload));
  const { clusters: draftClusters, rows: clusteredRows } = clusterRedirectMapForOneToOne(taggedRows);
  const clusters = finalizeGridClusterResult(draftClusters, clusteredRows, maxUrlsPerPost);
  const merges = buildDeterministicGridBriefs(clusters.clusters, clusteredRows);

  if (signal.aborted) return { ok: false, error: "Cancelled" };

  const result = buildGridRunResult({
    gscPagesUpload,
    dateRange,
    maxUrlsPerPost,
    gridCompression,
    gridRows: clusteredRows,
    clusters,
    merges,
  });

  setPhase("done");
  setProgress({
    phase: "done",
    completed: result.contentSheet.length,
    total: result.contentSheet.length,
    runMode: "grid_csv",
    uploadRowCount: uploadCount,
    clustersCreated: clusters.clusters.length,
    gridMaxUrlsPerPost: maxUrlsPerPost,
  });

  return { ok: true, result };
}

export { isGridInstantRedirectMode };
