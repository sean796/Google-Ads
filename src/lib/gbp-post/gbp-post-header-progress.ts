import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";
import type { BlogImportHeaderProgress } from "@/lib/bulk/blog-import-header-progress";
import { buildBlogImportMicroSnapshot } from "@/lib/bulk/blog-import-header-progress";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";

export const GBP_POST_LABEL = "GBP post";

const GBP_HARNESS_STEPS_PER_SITE = 3;

export function gbpPostAggregateHarnessProgress(
  harnessBySiteId: Record<string, BulkHarnessSectionUi[]>,
  siteCount: number,
  plannedPerSite = GBP_HARNESS_STEPS_PER_SITE,
): { completed: number; total: number } {
  const total = siteCount * plannedPerSite;
  let completed = 0;
  for (const sections of Object.values(harnessBySiteId)) {
    completed += sections.filter((s) => s.status === "done").length;
  }
  return { completed, total };
}

export function gbpPostHeaderProgressFromState(args: {
  isProcessing: boolean;
  statusLine?: string;
  harnessSections: BulkHarnessSectionUi[];
  harnessPlannedSectionCount: number | null;
  currentRow?: number;
  totalRows?: number;
  /** When set, aggregate harness done/total across all parallel sites. */
  harnessBySiteId?: Record<string, BulkHarnessSectionUi[]>;
  parallelSiteCount?: number;
}): BlogImportHeaderProgress | null {
  const statusLine = args.statusLine?.trim() ?? "";
  const isProcessing = Boolean(args.isProcessing);
  if (!isProcessing && !statusLine) return null;

  const parallelSiteCount = args.parallelSiteCount ?? 0;
  if (args.harnessBySiteId && parallelSiteCount > 0) {
    const { completed, total } = gbpPostAggregateHarnessProgress(
      args.harnessBySiteId,
      parallelSiteCount,
    );
    if (total > 0 && (completed > 0 || isProcessing)) {
      return {
        phase: statusLine || "Generating GBP posts",
        completed,
        total,
        progressPct: Math.round((completed / total) * 100),
        harnessActive: true,
      };
    }
  }

  const harnessSections = args.harnessSections ?? [];
  const harnessActive = harnessSections.length > 0;
  const planned =
    typeof args.harnessPlannedSectionCount === "number" && args.harnessPlannedSectionCount > 0
      ? args.harnessPlannedSectionCount
      : harnessSections.length;

  if (harnessActive && planned > 0) {
    const doneCount = harnessSections.filter((s) => s.status === "done").length;
    const progressPct = Math.round((doneCount / planned) * 100);
    return {
      phase: statusLine || "Generating GBP post",
      completed: doneCount,
      total: planned,
      progressPct,
      harnessActive: true,
    };
  }

  const totalRows = Math.max(1, args.totalRows ?? 1);
  const currentRow = Math.max(0, args.currentRow ?? 0);

  return {
    phase: statusLine || GBP_POST_LABEL,
    completed: isProcessing ? currentRow : 0,
    total: totalRows,
    progressPct: isProcessing ? 5 : undefined,
    harnessActive: false,
  };
}

export function buildGbpPostMicroSnapshot(
  progress: BlogImportHeaderProgress | null | undefined,
): MetaBulkMicroSnapshot | null {
  return buildBlogImportMicroSnapshot(progress, GBP_POST_LABEL);
}
