import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";
import {
  countEntityHarnessSteps,
  type EntityTitleHarnessClusterGroup,
} from "@/lib/local-analysis/entity-title-harness-state";

export type LocalAnalysisRunKind = "suggest" | "generate" | "csv";

export type LocalAnalysisHeaderProgress = {
  kind: LocalAnalysisRunKind;
  /** Human-readable step label shown in the progress bar and details drawer. */
  phase: string;
  completed: number;
  total: number;
  progressPct?: number;
  titleHarnessGroups?: EntityTitleHarnessClusterGroup[];
  harnessPlannedSectionCount?: number;
};

const RUN_KIND_LABELS: Record<LocalAnalysisRunKind, string> = {
  csv: "Loading grid CSV",
  suggest: "Clusters",
  generate: "Generate SAP rows",
};

export function buildLocalAnalysisMicroSnapshot(
  progress: LocalAnalysisHeaderProgress | null | undefined,
): MetaBulkMicroSnapshot | null {
  if (!progress?.phase?.trim()) return null;
  const label = RUN_KIND_LABELS[progress.kind] ?? "Local analysis";
  const harnessCounts =
    progress.titleHarnessGroups && progress.titleHarnessGroups.length > 0
      ? countEntityHarnessSteps(progress.titleHarnessGroups)
      : null;
  const completed = harnessCounts
    ? harnessCounts.done
    : Math.max(0, Math.floor(progress.completed));
  const rawTotal = harnessCounts
    ? Math.max(
        harnessCounts.total,
        progress.harnessPlannedSectionCount ?? 0,
        Math.floor(progress.total),
      )
    : Math.max(0, Math.floor(progress.total));
  /** Keep neon bar animating when step text is set but counts are not wired yet. */
  const total = rawTotal > 0 ? rawTotal : 1;
  const phase = progress.phase.trim();
  const statusMessage = phase.toLowerCase() !== label.toLowerCase() ? phase : undefined;
  const progressPct =
    typeof progress.progressPct === "number" && Number.isFinite(progress.progressPct)
      ? Math.min(100, Math.max(0, progress.progressPct))
      : undefined;
  return {
    label,
    completed,
    total,
    statusMessage,
    progressPct,
  };
}

export function localAnalysisProgressBusy(
  progress: LocalAnalysisHeaderProgress | null | undefined,
): boolean {
  return Boolean(progress?.phase?.trim());
}

/** Ordered phases for the details drawer step list while a run is active. */
export const LOCAL_ANALYSIS_SUGGEST_PHASES = [
  "Loading site inventory and GSC cache",
  "Grepping Wiki for locations",
  "Building cluster entities",
  "Preparing SAP",
  "Generating SAP rows",
  "Assigning unique keywords from GSC",
  "Writing titles",
] as const;

export const LOCAL_ANALYSIS_GENERATE_PHASES = LOCAL_ANALYSIS_SUGGEST_PHASES;

export function activePhaseIndex(
  phases: readonly string[],
  currentPhase: string,
): number {
  const norm = currentPhase.trim().toLowerCase();
  if (!norm) return -1;
  const idx = phases.findIndex((p) => {
    const pl = p.toLowerCase();
    return (
      norm.startsWith(pl) ||
      (pl === "writing titles" && norm.startsWith("titles ·")) ||
      (pl === "loading gsc keywords" && norm.includes("gsc"))
    );
  });
  return idx;
}
