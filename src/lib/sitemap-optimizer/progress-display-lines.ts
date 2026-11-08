import { trafficFilterLabelForCollections } from "@/lib/sitemap-optimizer/enrich-sitemap-optimizer-gsc-import";
import type { SitemapOptimizerProgress } from "@/lib/sitemap-optimizer/types";
import {
  sitemapOptimizerStepStatus,
  type SitemapOptimizerStepId,
} from "./progress-display-steps";

function catalogNoun(progress: SitemapOptimizerProgress): string {
  return progress.entityPrimary ? "service areas" : "URLs";
}

function inventoryProgressLines(progress: SitemapOptimizerProgress): string[] {
  const catalog = progress.inventoryCount;
  const analyze = progress.gscAnalyzedPostCount;
  const noun = catalogNoun(progress);
  if (catalog == null) {
    return progress.detail?.trim()
      ? [progress.detail.trim()]
      : [`Loading WordPress ${noun}…`];
  }
  if (analyze != null && analyze !== catalog) {
    const filter = progress.gscTrafficFilter;
    const filterLabel = filter
      ? trafficFilterLabelForCollections(filter, Boolean(progress.entityPrimary)).toLowerCase()
      : "selected";
    return [`${catalog} ${noun} in catalog`, `${analyze} ${filterLabel}`];
  }
  if (progress.detail?.trim() && progress.phase === "inventory") {
    return [progress.detail.trim()];
  }
  return [`${catalog} ${noun} in catalog`];
}

function clusteringProgressLines(progress: SitemapOptimizerProgress): string[] {
  const {
    completed,
    total,
    clustersCreated,
    urlsProcessed,
    gscAnalyzedPostCount,
    clusteringSubphase,
    detail,
  } = progress;
  const lines: string[] = [];
  const postTotal = gscAnalyzedPostCount ?? progress.inventoryCount;
  const entity = progress.entityPrimary === true;
  const packedNoun = entity ? "service areas" : "URLs";
  const groupNoun = entity ? "families" : "merge groups";

  if (entity) {
    if (clustersCreated != null && clustersCreated > 0) {
      lines.push(`${clustersCreated} ${groupNoun}`);
    }
    if (urlsProcessed != null && postTotal != null && postTotal > 0) {
      lines.push(`${urlsProcessed} / ${postTotal} ${packedNoun} packed`);
    } else if (urlsProcessed != null && urlsProcessed > 0) {
      lines.push(`${urlsProcessed} ${packedNoun} packed`);
    } else if (total > 0 && completed >= 0) {
      lines.push(`Compress ${Math.min(completed, total)} / ${total} ${packedNoun}`);
    }
    if (lines.length === 0 && detail?.trim() && !/^step\s+\d+/i.test(detail.trim())) {
      lines.push(detail.trim());
    }
    return lines.length > 0
      ? lines
      : ["Packing service areas into redirect families…"];
  }

  if (clusteringSubphase === "batch" && total > 0 && completed >= 0) {
    lines.push(`Cluster batch ${Math.min(completed, total)} / ${total}`);
  }
  if (clustersCreated != null && clustersCreated > 0) {
    lines.push(`${clustersCreated} ${groupNoun}`);
  }
  if (urlsProcessed != null && postTotal != null && postTotal > 0) {
    lines.push(`${urlsProcessed} / ${postTotal} ${packedNoun} grouped`);
  } else if (urlsProcessed != null && urlsProcessed > 0) {
    lines.push(`${urlsProcessed} ${packedNoun} grouped`);
  }

  const subphaseLabel =
    clusteringSubphase === "reconcile"
      ? "Reconciling batch clusters"
      : clusteringSubphase === "validate"
        ? "Validating merge groups"
        : clusteringSubphase === "tighten"
          ? "Tightening oversized groups"
          : clusteringSubphase === "finalize"
            ? "Finalizing clusters"
            : clusteringSubphase === "singleton_sweep"
              ? "Pairing overlapping singletons"
              : clusteringSubphase === "compress"
                ? "Compressing into redirect families"
                : null;
  if (subphaseLabel) {
    lines.push(subphaseLabel);
  } else if (detail?.trim() && !/^step\s+\d+/i.test(detail.trim())) {
    lines.push(detail.trim());
  }

  return lines.length > 0 ? lines : ["Grouping URLs into merge clusters…"];
}

function gscDoneProgressLines(progress: SitemapOptimizerProgress): string[] {
  const lines: string[] = [];
  const analyzed = progress.gscAnalyzedPostCount;
  const catalog = progress.inventoryCount;
  const filter = progress.gscTrafficFilter;

  const noun = catalogNoun(progress);
  if (analyzed != null) {
    if (filter) {
      lines.push(
        `${analyzed} ${trafficFilterLabelForCollections(filter, Boolean(progress.entityPrimary)).toLowerCase()}`,
      );
    } else {
      lines.push(`${analyzed} ${noun} with Search Console data`);
    }
  } else if (progress.detail?.trim()) {
    lines.push(progress.detail.trim());
  } else {
    lines.push("Search Console import complete");
  }

  if (catalog != null && analyzed != null && catalog > analyzed) {
    lines.push(`${catalog} ${noun} in catalog`);
  }
  return lines;
}


/** Single status line for the progress panel (no redundant sub-lines). */
export function sitemapOptimizerProgressTicker(progress: SitemapOptimizerProgress): string {
  const {
    phase,
    completed,
    total,
    detail,
    inventoryCount,
    uploadRowCount,
    clustersCreated,
    blogsCompleted,
    blogsTotal,
    tagsCompleted,
    tagsTotal,
    tagBucketsCompleted,
    tagBucketsTotal,
    runMode,
    gridMaxUrlsPerPost,
    gridTargetPostCount,
  } = progress;

  if (phase === "done") return "Analysis complete";
  if (phase === "idle" || phase === "error") return "";

  if (detail?.trim()) return detail.trim();

  if (phase === "ingest_csv") {
    if (uploadRowCount != null) return `${uploadRowCount} rows loaded`;
    return "Loading CSV…";
  }
  if (phase === "inventory") {
    return inventoryProgressLines(progress)[0] ?? "Loading WordPress catalog…";
  }
  if (phase === "gsc_triage" && total > 0) {
    return progress.entityPrimary
      ? `Keep ${completed} / ${total}`
      : `GSC triage ${completed} / ${total}`;
  }
  if (phase === "gsc" && total > 0) {
    return `Search Console ${completed} / ${total} pages`;
  }
  if (phase === "tagging" && runMode === "grid_csv") {
    if (detail?.trim()) return detail.trim();
    if (tagsTotal != null && tagsTotal > 0) {
      return `Tagging URLs ${tagsCompleted ?? 0} / ${tagsTotal}`;
    }
    return "Tagging URLs…";
  }
  if (phase === "clustering" && runMode === "grid_csv") {
    if (tagBucketsTotal != null && tagBucketsTotal > 0) {
      return `Clustering ${tagBucketsCompleted ?? 0} / ${tagBucketsTotal}`;
    }
    if (clustersCreated != null) return `${clustersCreated} groups ready`;
    const maxPer = gridMaxUrlsPerPost ?? gridTargetPostCount;
    return maxPer != null ? `Grouping (up to ${maxPer} URLs per post)…` : "Clustering…";
  }
  if (phase === "merge" && runMode === "grid_csv") {
    if (blogsTotal != null && blogsTotal > 0) {
      const batch =
        progress.mergeBatchTotal != null && progress.mergeBatchTotal > 0
          ? ` · batch ${progress.mergeBatchCompleted ?? 0}/${progress.mergeBatchTotal}`
          : "";
      return `AI content plans ${blogsCompleted ?? 0} / ${blogsTotal}${batch}`;
    }
    return "Generating content plans…";
  }
  if (phase === "merge" && total > 0) {
    return progress.entityPrimary
      ? `Transform ${completed} / ${total}`
      : `Merge briefs ${completed} / ${total}`;
  }
  if (phase === "content_sheet" && total > 0) {
    return `Content sheet ${completed} / ${total}`;
  }
  if (phase === "clustering") {
    return progress.entityPrimary ? "Compress…" : "Intent clustering…";
  }
  return phase;
}

/** @deprecated Prefer sitemapOptimizerProgressTicker for UI. */
export function sitemapOptimizerProgressLine(progress: SitemapOptimizerProgress): string {
  return sitemapOptimizerProgressTicker(progress) || progress.phase;
}

/** One line per status fact so the panel can stack them vertically without truncation. */
export function sitemapOptimizerProgressLines(progress: SitemapOptimizerProgress): string[] {
  const {
    phase,
    completed,
    total,
    detail,
    inventoryCount,
    uploadRowCount,
    urlsProcessed,
    clustersCreated,
    blogsCompleted,
    blogsTotal,
    tagsCompleted,
    tagsTotal,
    tagBucketsCompleted,
    tagBucketsTotal,
    topicsCompleted,
    topicsTotal,
    runMode,
    gridMaxUrlsPerPost,
    gridTargetPostCount,
  } = progress;
  const maxPerPost = gridMaxUrlsPerPost ?? gridTargetPostCount;

  if (phase === "gsc_triage") {
    if (detail?.trim()) return [detail.trim()];
    if (total > 0) {
      return progress.entityPrimary
        ? [`Keep ${completed} / ${total}`]
        : [`Keep vs consolidate ${completed} / ${total}`];
    }
    return progress.entityPrimary
      ? ["Keep: clicks vs consolidate…"]
      : ["Analyzing GSC performance vs site…"];
  }
  if (phase === "gsc") {
    if (detail?.trim()) return [detail.trim()];
    if (progress.gscImportSubphase === "queries") return ["Fetching top queries…"];
    if (progress.gscImportSubphase === "filter") return ["Filtering by traffic…"];
    if (progress.gscImportSubphase === "join") return ["Matching inventory to GSC…"];
    if (progress.gscImportSubphase === "sitewide") return ["Loading sitewide GSC metrics…"];
    return ["Importing Search Console…"];
  }

  if (phase === "ingest_csv" && uploadRowCount != null) {
    return maxPerPost != null
      ? [`${uploadRowCount} rows in grid`, `Up to ${maxPerPost} URLs per new post`]
      : [`${uploadRowCount} rows in grid`];
  }
  if (phase === "inventory") {
    return inventoryProgressLines(progress);
  }
  if (phase === "tagging" && runMode === "grid_csv") {
    if (tagsCompleted != null && tagsTotal != null) {
      return [`Tag ${tagsCompleted} / ${tagsTotal} URLs`];
    }
    return ["Tagging URLs"];
  }
  if (phase === "clustering" && runMode === "grid_csv") {
    const lines: string[] = [];
    if (tagBucketsCompleted != null && tagBucketsTotal != null) {
      lines.push(`Tag bucket ${tagBucketsCompleted} / ${tagBucketsTotal}`);
    }
    if (clustersCreated != null) {
      lines.push(`${clustersCreated} groups`);
    }
    if (maxPerPost != null) {
      lines.push(`Up to ${maxPerPost} URLs per group`);
    }
    return lines;
  }
  if (phase === "merge" && runMode === "grid_csv") {
    const lines: string[] = [];
    const topicsDone = progress.topicsCompleted;
    const topicsAll = progress.topicsTotal;
    if (topicsDone != null && topicsAll != null) {
      const label = progress.currentTopicLabel?.trim();
      lines.push(
        label
          ? `Topic ${topicsDone} / ${topicsAll} · ${label}`
          : `Topic ${topicsDone} / ${topicsAll}`,
      );
    }
    if (blogsTotal != null) {
      lines.push(`Groups ${blogsCompleted ?? 0} / ${blogsTotal}`);
    }
    return lines.length > 0 ? lines : ["NEO Pulse redirect targets"];
  }
  if (phase === "merge" && total > 0) {
    return progress.entityPrimary
      ? [`Transform ${completed} / ${total} families`]
      : [`Merge briefs ${completed} / ${total} groups`];
  }
  if (phase === "content_sheet" && total > 0) {
    return progress.entityPrimary
      ? [`Content sheet ${completed} / ${total}`]
      : [`Proposed titles ${completed} / ${total} URLs`];
  }
  if (phase === "clustering") {
    return clusteringProgressLines(progress);
  }
  if (detail?.trim()) return [detail.trim()];
  if (phase === "done") {
    return ["Analysis complete"];
  }
  return [phase];
}

/** Stacked micro-lines for the active step row (never collapsed to one line). */
export function sitemapOptimizerActiveStepLines(
  stepId: SitemapOptimizerStepId,
  progress: SitemapOptimizerProgress,
): string[] {
  const status = sitemapOptimizerStepStatus(
    stepId,
    progress.phase,
    progress.runMode,
    progress.entityPrimary,
  );
  if (status !== "active") return [];

  const entityKeepActive =
    progress.entityPrimary === true &&
    stepId === "gsc_triage" &&
    (progress.phase === "inventory" ||
      progress.phase === "gsc" ||
      progress.phase === "gsc_triage");
  const entityTransformActive =
    progress.entityPrimary === true &&
    stepId === "merge" &&
    (progress.phase === "merge" || progress.phase === "content_sheet");

  if (
    stepId === progress.phase ||
    entityKeepActive ||
    entityTransformActive ||
    (stepId === "gsc" && progress.phase === "gsc") ||
    (stepId === "gsc_triage" && progress.phase === "gsc_triage")
  ) {
    const lines = sitemapOptimizerProgressLines(progress);
    if (lines.length > 0) return lines;
  }
  if (progress.detail?.trim()) return [progress.detail.trim()];
  return [sitemapOptimizerProgressTicker(progress) || "Working…"];
}

export function sitemapOptimizerDoneStepLines(
  stepId: SitemapOptimizerStepId,
  progress: SitemapOptimizerProgress,
): string[] {
  if (stepId === "inventory") {
    return inventoryProgressLines(progress);
  }
  if (stepId === "gsc") {
    return gscDoneProgressLines(progress);
  }
  if (stepId === "clustering" && progress.clustersCreated != null) {
    return progress.entityPrimary
      ? [`${progress.clustersCreated} families`]
      : [`${progress.clustersCreated} merge groups`];
  }
  if (stepId === "gsc_triage") {
    return ["Done"];
  }
  if (stepId === "merge") {
    if (progress.entityPrimary && progress.total > 0) {
      return [`${progress.completed} / ${progress.total} families`];
    }
    if (progress.blogsTotal != null) {
      return [`${progress.blogsCompleted ?? progress.blogsTotal} / ${progress.blogsTotal} briefs`];
    }
  }
  return [doneStepSubtitle(stepId, progress)];
}

function doneStepSubtitle(stepId: SitemapOptimizerStepId, progress: SitemapOptimizerProgress): string {
  if (stepId === "ingest_csv" && progress.uploadRowCount != null) {
    return `${progress.uploadRowCount} rows`;
  }
  if (stepId === "tagging" && progress.tagsTotal != null && progress.tagsTotal > 0) {
    if (progress.detail?.includes("Skipped") || progress.detail?.includes("no AI")) {
      return progress.detail ?? "Done";
    }
    return `${progress.tagsCompleted ?? progress.tagsTotal} / ${progress.tagsTotal} URLs tagged`;
  }
  if (stepId === "clustering" && progress.clustersCreated != null) {
    return progress.entityPrimary
      ? `${progress.clustersCreated} families`
      : `${progress.clustersCreated} groups`;
  }
  return "Done";
}
