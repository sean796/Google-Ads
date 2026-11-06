import {
  normalizeMergeDestinations,
  type BlogDestinationPolicy,
} from "@/lib/sitemap-optimizer/blog-destination-policy";
import { buildContentSheetRows } from "@/lib/sitemap-optimizer/build-content-sheet-rows";
import {
  appendCompanyKeepContentRows,
  mergeClusterResults,
} from "@/lib/sitemap-optimizer/company-content-policy";
import type { SitemapOptimizerClusterResult } from "@/lib/sitemap-optimizer/types";
import { runGscPerformanceTriage } from "@/lib/sitemap-optimizer/gsc-performance-triage-agent";
import { applyGridOutputPolicies } from "@/lib/sitemap-optimizer/grid-output-policies";
import { clusterRedirectMapForFamilies } from "@/lib/sitemap-optimizer/grid-prefilled-group-cluster";
import { runGridNewBlogBriefAgent } from "@/lib/sitemap-optimizer/grid-csv-new-blog-agent";
import { runGridTemporalCannibalizationAgent } from "@/lib/sitemap-optimizer/grid-temporal-cannibalization";
import {
  filterMergeableMerges,
  isMergeableCluster,
  pruneClusterResultToMergeable,
  resolvedMemberRows,
} from "@/lib/sitemap-optimizer/resolved-cluster-members";
import { SITEMAP_OPTIMIZER_MERGE_CONCURRENCY } from "@/lib/sitemap-optimizer/constants";
import { runSitemapOptimizerClusterAgent } from "@/lib/sitemap-optimizer/sitemap-optimizer-cluster-agent";
import { runSitemapOptimizerMergeAgent } from "@/lib/sitemap-optimizer/sitemap-optimizer-merge-agent";
import { runSitemapOptimizerSingletonPairAgent } from "@/lib/sitemap-optimizer/sitemap-optimizer-singleton-pair-agent";
import type {
  SitemapOptimizerContentSheetRow,
  SitemapOptimizerMergeRecommendation,
  SitemapOptimizerPostRow,
  SitemapOptimizerProgress,
} from "@/lib/sitemap-optimizer/types";

const REDIRECT_FAMILY_MAX_URLS = 5 as const;

export type WordpressEditorialGscPipelineArgs = {
  pipelineRows: SitemapOptimizerPostRow[];
  useRedirectFamilies: boolean;
  apiKey: string;
  signal?: AbortSignal;
  blogDestination: BlogDestinationPolicy;
  analyzedAt: string;
  companyRows: SitemapOptimizerPostRow[];
  companyClusterResult: SitemapOptimizerClusterResult;
  existingContentSheet: SitemapOptimizerContentSheetRow[];
  existingMerges: SitemapOptimizerMergeRecommendation[];
  existingClusters: SitemapOptimizerClusterResult;
  entityRows: SitemapOptimizerPostRow[];
  gscAnalyzeProgress: Record<string, unknown>;
  setPhase: (phase: SitemapOptimizerProgress["phase"]) => void;
  setProgress: (p: SitemapOptimizerProgress) => void;
};

export type WordpressEditorialGscPipelineResult = {
  pipelineRows: SitemapOptimizerPostRow[];
  contentSheet: SitemapOptimizerContentSheetRow[];
  merges: SitemapOptimizerMergeRecommendation[];
  pipelineClusters: SitemapOptimizerClusterResult;
  gscRows: SitemapOptimizerPostRow[];
};

export async function runWordpressEditorialGscPipeline(
  args: WordpressEditorialGscPipelineArgs,
): Promise<WordpressEditorialGscPipelineResult> {
  const {
    apiKey,
    signal,
    blogDestination,
    analyzedAt,
    companyRows,
    companyClusterResult,
    entityRows,
    gscAnalyzeProgress,
    setPhase,
    setProgress,
    useRedirectFamilies,
  } = args;

  let pipelineRows = args.pipelineRows;
  let contentSheet = [...args.existingContentSheet];
  let merges = [...args.existingMerges];
  let pipelineClusters = args.existingClusters;

  setPhase("gsc_triage");
  setProgress({
    phase: "gsc_triage",
    completed: 0,
    total: pipelineRows.length,
    detail: "Analyzing GSC performance vs site",
    ...gscAnalyzeProgress,
  });

  const triage = await runGscPerformanceTriage(pipelineRows, apiKey, {
    signal,
    onProgress: (completed, total) => {
      setProgress({
        phase: "gsc_triage",
        completed,
        total,
        detail: `GSC triage ${completed} / ${total}`,
        ...gscAnalyzeProgress,
      });
    },
  });

  pipelineRows = triage.rows;
  const consolidateRows = triage.consolidateRows;
  const rowMap = new Map(pipelineRows.map((r) => [r.postId, r]));

  if (useRedirectFamilies && consolidateRows.length > 0) {
    setPhase("clustering");
    setProgress({
      phase: "clustering",
      completed: 0,
      total: consolidateRows.length,
      clusteringSubphase: "temporal",
      detail: "Detecting time-sliced URL series",
      ...gscAnalyzeProgress,
    });

    const temporalExempt = await runGridTemporalCannibalizationAgent(
      consolidateRows,
      apiKey,
      signal,
    );

    const { clusters: draftClusters, rows: clusteredRows } = clusterRedirectMapForFamilies(
      consolidateRows,
      REDIRECT_FAMILY_MAX_URLS,
      temporalExempt,
    );

    setPhase("merge");
    setProgress({
      phase: "merge",
      completed: 0,
      total: draftClusters.clusters.length,
      detail: `Writing briefs for ${draftClusters.clusters.length} destination families`,
      ...gscAnalyzeProgress,
    });

    const draftMerges = await runGridNewBlogBriefAgent(
      draftClusters,
      clusteredRows,
      apiKey,
      signal,
      (completed, total) => {
        setProgress({
          phase: "merge",
          completed,
          total,
          detail: `Writing briefs for ${completed} / ${total} destination families`,
          ...gscAnalyzeProgress,
        });
      },
      undefined,
      REDIRECT_FAMILY_MAX_URLS,
      blogDestination,
    );

    const policies = applyGridOutputPolicies({
      rows: clusteredRows,
      clusters: draftClusters,
      merges: draftMerges,
      gridMaxUrlsPerPost: REDIRECT_FAMILY_MAX_URLS,
      macroMode: true,
      analyzedAt,
    });

    pipelineClusters = mergeClusterResults(
      mergeClusterResults(policies.clusters, pipelineClusters),
      companyClusterResult,
    );
    merges = [
      ...merges,
      ...normalizeMergeDestinations(
        policies.merges,
        blogDestination,
        new Map(
          policies.clusters.clusters.map((c) => [
            c.clusterId,
            resolvedMemberRows(c, new Map(policies.rows.map((r) => [r.postId, r]))).map((m) =>
              m.url.trim(),
            ),
          ]),
        ),
        analyzedAt,
      ),
    ];
    contentSheet = [
      ...contentSheet,
      ...appendCompanyKeepContentRows(policies.contentSheet, companyRows),
    ];
    pipelineRows = [...triage.keepRows, ...policies.rows];
  } else if (consolidateRows.length > 0) {
    setPhase("clustering");
    let clusters = await runSitemapOptimizerClusterAgent(consolidateRows, apiKey, signal, {
      gscPerformanceMode: true,
      onProgress: (p) => {
        setProgress({
          phase: "clustering",
          completed: p.clusterBatchCompleted ?? 0,
          total: p.clusterBatchTotal ?? 0,
          urlsProcessed: p.urlsProcessed,
          clustersCreated: p.clustersCreated,
          clusteringSubphase: p.subphase,
          ...gscAnalyzeProgress,
        });
      },
    });

    clusters = await runSitemapOptimizerSingletonPairAgent(clusters, consolidateRows, apiKey, signal);
    const editorialClusters = pruneClusterResultToMergeable(clusters, consolidateRows);
    pipelineClusters = mergeClusterResults(editorialClusters, pipelineClusters);

    const mergeTotal = editorialClusters.clusters.filter((c) =>
      isMergeableCluster(c, rowMap),
    ).length;

    setPhase("merge");
    setProgress({
      phase: "merge",
      completed: 0,
      total: mergeTotal,
      detail: "Writing merge recommendations",
      ...gscAnalyzeProgress,
    });

    const rawMerges = await runSitemapOptimizerMergeAgent(
      editorialClusters.clusters,
      consolidateRows,
      apiKey,
      SITEMAP_OPTIMIZER_MERGE_CONCURRENCY,
      signal,
      (completed, total) => {
        setProgress({
          phase: "merge",
          completed,
          total,
          detail: "Writing merge recommendations",
          ...gscAnalyzeProgress,
        });
      },
    );

    const mergeable = filterMergeableMerges(rawMerges, editorialClusters.clusters, consolidateRows);
    const memberUrlsByCluster = new Map(
      editorialClusters.clusters.map((c) => [
        c.clusterId,
        resolvedMemberRows(c, rowMap).map((m) => m.url.trim()),
      ]),
    );
    const editorialMerges = normalizeMergeDestinations(
      mergeable,
      blogDestination,
      memberUrlsByCluster,
      analyzedAt,
    );
    merges = [...merges, ...editorialMerges];

    contentSheet = [
      ...contentSheet,
      ...appendCompanyKeepContentRows(
        buildContentSheetRows({
          rows: consolidateRows,
          clusters: editorialClusters,
          merges: editorialMerges,
          standaloneProposals: [],
          blogDestination,
        }),
        companyRows,
      ),
    ];
    pipelineClusters = mergeClusterResults(
      mergeClusterResults(editorialClusters, pipelineClusters),
      companyClusterResult,
    );
  } else {
    contentSheet = [...contentSheet, ...appendCompanyKeepContentRows([], companyRows)];
    pipelineClusters = mergeClusterResults(pipelineClusters, companyClusterResult);
  }

  const gscRows = [...entityRows, ...pipelineRows, ...companyRows];

  return { pipelineRows, contentSheet, merges, pipelineClusters, gscRows };
}
