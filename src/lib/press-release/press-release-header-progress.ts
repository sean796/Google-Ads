import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";
import type { BlogImportHeaderProgress } from "@/lib/bulk/blog-import-header-progress";
import { buildBlogImportMicroSnapshot } from "@/lib/bulk/blog-import-header-progress";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";

export const PRESS_RELEASE_LABEL = "Press release";

export function pressReleaseHeaderProgressFromState(args: {
  isProcessing: boolean;
  runPhase?: string;
  harnessSections: BulkHarnessSectionUi[];
  harnessPlannedSectionCount: number | null;
}): BlogImportHeaderProgress | null {
  const runPhase = args.runPhase?.trim() ?? "";
  const isProcessing = Boolean(args.isProcessing);
  if (!isProcessing && !runPhase) return null;

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
      phase: runPhase || "Generating press release (harness)",
      completed: doneCount,
      total: planned,
      progressPct,
      harnessActive: true,
    };
  }

  if (!isProcessing && !runPhase) return null;

  return {
    phase: runPhase || PRESS_RELEASE_LABEL,
    completed: 0,
    total: 1,
    progressPct: isProcessing ? 5 : undefined,
    harnessActive: false,
  };
}

export function buildPressReleaseMicroSnapshot(
  progress: BlogImportHeaderProgress | null | undefined,
): MetaBulkMicroSnapshot | null {
  return buildBlogImportMicroSnapshot(progress, PRESS_RELEASE_LABEL);
}

export function pressReleaseProgressBusy(
  progress: BlogImportHeaderProgress | null | undefined,
): boolean {
  return Boolean(progress?.phase?.trim());
}
