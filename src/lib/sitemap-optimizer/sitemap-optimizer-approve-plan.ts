import type { WordPressSite } from "@/components/integrations/types";
import {
  buildSitemapOptimizerAllRedirectCsvRedirectCsv,
  buildSitemapOptimizerContentUploadCsv,
} from "@/lib/sitemap-optimizer/sitemap-optimizer-download-csv";
import {
  trashMergeSourcePosts,
  type TrashMergeSourceProgress,
} from "@/lib/sitemap-optimizer/trash-merge-source-posts";
import { collectMergeSourcePosts } from "@/lib/sitemap-optimizer/trash-merge-source-posts";
import type { SitemapOptimizerRunResult } from "@/lib/sitemap-optimizer/types";

export type ApprovePlanPhase = "redirects" | "content_sheet" | "trash" | "done";

export type ApprovePlanPhaseProgress = {
  phase: ApprovePlanPhase;
  completed: number;
  total: number;
  detail?: string;
};

export type SitemapOptimizerApprovePlanSummary = {
  mergeGroupCount: number;
  sourcePostCount: number;
  trashed: number;
  trashFailed: number;
  trashSkipped: number;
  redirectRowCount: number;
  contentRowCount: number;
  contentSheetDownloaded: boolean;
  trashErrors: string[];
};

export type RunSitemapOptimizerApprovePlanArgs = {
  site: WordPressSite;
  result: SitemapOptimizerRunResult;
  triggerRedirectDownload: (csv: string, filename: string) => void;
  triggerContentSheetDownload: (csv: string, filename: string) => void;
  onPhaseProgress?: (p: ApprovePlanPhaseProgress) => void;
  onTrashProgress?: (p: TrashMergeSourceProgress) => void;
};

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function runSitemapOptimizerApprovePlan(
  args: RunSitemapOptimizerApprovePlanArgs,
): Promise<SitemapOptimizerApprovePlanSummary> {
  const {
    site,
    result,
    triggerRedirectDownload,
    triggerContentSheetDownload,
    onPhaseProgress,
    onTrashProgress,
  } = args;

  const publishAt = new Date().toISOString();
  const mergeGroupCount = result.merges.length;
  const sourcePostCount = collectMergeSourcePosts(result).length;

  onPhaseProgress?.({
    phase: "redirects",
    completed: 0,
    total: 1,
    detail: "Building NEO Pulse redirect redirect CSV",
  });

  const { csv: redirectCsv, rowCount: redirectRowCount } =
    buildSitemapOptimizerAllRedirectCsvRedirectCsv(result, publishAt);

  if (result.merges.length > 0 && redirectRowCount === 0) {
    throw new Error(
      "No redirect rows to export for this merge plan. Download redirects from the toolbar to inspect, then re-run analyze.",
    );
  }

  if (redirectRowCount > 0) {
    triggerRedirectDownload(
      redirectCsv,
      `sitemap-merge-pulse-redirect-redirects-${dateStamp()}.csv`,
    );
  }

  onPhaseProgress?.({
    phase: "redirects",
    completed: 1,
    total: 1,
    detail: redirectRowCount > 0 ? `${redirectRowCount} redirect row(s) downloaded` : "No redirect rows",
  });

  onPhaseProgress?.({
    phase: "content_sheet",
    completed: 0,
    total: 1,
    detail: "Building content sheet CSV",
  });

  const contentCsv = buildSitemapOptimizerContentUploadCsv(result, publishAt);
  const contentRowCount = Math.max(0, contentCsv.split(/\r?\n/).filter((l) => l.length > 0).length - 1);
  let contentSheetDownloaded = false;
  if (contentRowCount > 0) {
    triggerContentSheetDownload(
      contentCsv,
      `sitemap-content-sheet-${dateStamp()}.csv`,
    );
    contentSheetDownloaded = true;
  }

  onPhaseProgress?.({
    phase: "content_sheet",
    completed: 1,
    total: 1,
    detail: contentSheetDownloaded
      ? `${contentRowCount} content row(s) downloaded`
      : "No content rows",
  });

  onPhaseProgress?.({
    phase: "trash",
    completed: 0,
    total: sourcePostCount,
    detail: "Moving source posts to trash",
  });

  const trashResult = await trashMergeSourcePosts(site, result, onTrashProgress);

  onPhaseProgress?.({
    phase: "done",
    completed: trashResult.trashed,
    total: sourcePostCount,
    detail: "Complete",
  });

  return {
    mergeGroupCount,
    sourcePostCount,
    trashed: trashResult.trashed,
    trashFailed: trashResult.failed,
    trashSkipped: trashResult.skipped,
    redirectRowCount,
    contentRowCount,
    contentSheetDownloaded,
    trashErrors: trashResult.errors,
  };
}
