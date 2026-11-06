import { runEntityCompressionPipeline } from "@/lib/sitemap-optimizer/entity-compression-pipeline";
import { runWordpressEditorialGscPipeline } from "@/lib/sitemap-optimizer/wordpress-editorial-gsc-pipeline";
import {
  appendCompanyKeepContentRows,
  mergeClusterResults,
} from "@/lib/sitemap-optimizer/company-content-policy";
import { applyContentYearPolicy } from "@/lib/sitemap-optimizer/apply-content-year-policy";
import { dedupeContentSheetRowsByDestination } from "@/lib/sitemap-optimizer/dedupe-content-sheet-by-destination";
import type {
  SitemapOptimizerProgress,
  SitemapOptimizerRunResult,
} from "@/lib/sitemap-optimizer/types";
import type {
  PreparedSitemapOptimizerRun,
  SitemapOptimizerRunDeps,
  SitemapOptimizerRunOutcome,
} from "./use-sitemap-optimizer-run-types";

export async function finishSitemapOptimizerRun(
  deps: SitemapOptimizerRunDeps,
  prepared: PreparedSitemapOptimizerRun,
): Promise<SitemapOptimizerRunOutcome> {
  const { setPhase, setProgress, setResult, abortRef } = deps;
  let { gscRows, pipelineRows, pipelineClusters, merges, contentSheet } = prepared;
  const {
    site,
    apiKey,
    signal,
    blogDestination,
    entityOnly,
    missCount,
    entityProfile,
    entityRows,
    companyRows,
    companyClusterResult,
    hasEditorialPipeline,
    hasEntityPipeline,
    gscAnalyzeProgress,
    useRedirectFamilies,
    analyzedAt,
    dateRange,
    gscPagesUpload,
    redirectGridUpload,
  } = prepared;

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
}
