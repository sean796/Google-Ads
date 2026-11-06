import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";

export type BlogImportHeaderProgress = {
  phase: string;
  completed: number;
  total: number;
  progressPct?: number;
  harnessActive: boolean;
};

export const BLOG_IMPORT_PIPELINE_PHASES = [
  "Sending local file to OpenRouter",
  "Running keyword research",
  "Research external links",
  "Analyzing imported draft tone & voice",
  "Generating checklist",
  "Blueprint + image outline + SEO draft",
  "Generating blog content",
  "Finalizing post title",
  "Publishing",
] as const;

const BLOG_IMPORT_LABEL = "Blog import";

export function activeBlogImportPhaseIndex(phase: string): number {
  const norm = phase.trim().toLowerCase();
  if (!norm) return -1;
  const idx = BLOG_IMPORT_PIPELINE_PHASES.findIndex((p) => norm.startsWith(p.toLowerCase()));
  return idx;
}

export type BlogImportHeaderProgressFromBulkArgs = {
  status?: string;
  isProcessing?: boolean;
  harnessSections?: BulkHarnessSectionUi[];
  harnessPlannedSectionCount?: number | null;
  currentRow?: number;
  csvRowProgress?: { done: number; total: number };
  /** Prompt / blog-import batch: row index (0-based) and batch size for the top progress bar. */
  batchRowProgress?: { current: number; total: number; activeRowOptimizing?: boolean };
};

export function blogImportHeaderProgressFromBulk(
  args: BlogImportHeaderProgressFromBulkArgs,
): BlogImportHeaderProgress | null {
  const status = args.status?.trim() ?? "";
  const isProcessing = Boolean(args.isProcessing);
  if (!isProcessing && !status) return null;

  const csvProgress = args.csvRowProgress;
  if (csvProgress && csvProgress.total > 0 && isProcessing) {
    const { done, total } = csvProgress;
    const progressPct = Math.round((done / Math.max(total, 1)) * 100);
    return {
      phase: status || "Generating",
      completed: done,
      total,
      progressPct,
      harnessActive: false,
    };
  }

  const batchProgress = args.batchRowProgress;
  if (batchProgress && batchProgress.total > 0 && isProcessing) {
    const { current, total, activeRowOptimizing } = batchProgress;
    const harnessSections = args.harnessSections ?? [];
    const planned =
      typeof args.harnessPlannedSectionCount === "number" && args.harnessPlannedSectionCount > 0
        ? args.harnessPlannedSectionCount
        : harnessSections.length;
    let intraRow = 0;
    if (activeRowOptimizing) {
      intraRow = status ? 0.08 : 0;
      if (harnessSections.length > 0 && planned > 0) {
        const harnessDone = harnessSections.filter((s) => s.status === "done").length;
        intraRow = harnessDone / planned;
      }
    }
    const completed = Math.min(current + intraRow, total);
    const progressPct = Math.round((completed / total) * 100);
    return {
      phase: status || "Processing",
      completed,
      total,
      progressPct,
      harnessActive: harnessSections.length > 0,
    };
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
      phase: status || "Generating blog content (harness)",
      completed: doneCount,
      total: planned,
      progressPct,
      harnessActive: true,
    };
  }

  const phase = status || BLOG_IMPORT_LABEL;
  const phaseIdx = activeBlogImportPhaseIndex(phase);
  const progressPct =
    phaseIdx >= 0
      ? Math.round(((phaseIdx + 1) / BLOG_IMPORT_PIPELINE_PHASES.length) * 100)
      : isProcessing
        ? 5
        : undefined;

  return {
    phase,
    completed: args.currentRow ?? 0,
    total: 1,
    progressPct,
    harnessActive: false,
  };
}

export function buildBlogImportMicroSnapshot(
  progress: BlogImportHeaderProgress | null | undefined,
  runLabel = BLOG_IMPORT_LABEL,
): MetaBulkMicroSnapshot | null {
  if (!progress?.phase?.trim()) return null;
  const completed = Math.max(0, Math.floor(progress.completed));
  const total = Math.max(0, Math.floor(progress.total));
  const phase = progress.phase.trim();
  const statusMessage =
    phase.toLowerCase() !== runLabel.toLowerCase() ? phase : undefined;
  const progressPct =
    typeof progress.progressPct === "number" && Number.isFinite(progress.progressPct)
      ? Math.min(100, Math.max(0, progress.progressPct))
      : undefined;
  return {
    label: runLabel,
    completed,
    total: progress.harnessActive ? total : Math.max(total, 1),
    statusMessage,
    progressPct,
  };
}

export function blogImportProgressBusy(
  progress: BlogImportHeaderProgress | null | undefined,
): boolean {
  return Boolean(progress?.phase?.trim());
}
