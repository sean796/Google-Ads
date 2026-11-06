import type {
  OptimizationMicroLogEntry,
  OptimizationProgressState,
} from "@/hooks/content-optimization/use-optimization-state";
import {
  stepLabel,
  type ContentOptimizerStepId,
} from "@/lib/content-optimization/content-optimizer-run-progress";

export type FrontendMilestoneKey = ContentOptimizerStepId | "other";

export type OptimizationMilestone = {
  key: FrontendMilestoneKey;
  label: string;
};

function labelForStepId(stepId: ContentOptimizerStepId, message?: string): string {
  const trimmed = message?.trim();
  if (trimmed) return trimmed;
  return stepLabel(stepId);
}

type ProgressEntry = OptimizationMicroLogEntry;

function collectProgressEntries(
  progress: Pick<OptimizationProgressState, "stepId" | "message" | "microLog"> | undefined,
): ProgressEntry[] {
  if (!progress) return [];

  const entries: ProgressEntry[] = [...(progress.microLog ?? [])];
  if (!progress.stepId) return entries;

  const last = entries[entries.length - 1];
  const message = progress.message?.trim();
  if (!last || last.stepId !== progress.stepId || (last.message?.trim() ?? "") !== (message ?? "")) {
    entries.push({ stepId: progress.stepId, message });
  }

  return entries;
}

/** Dedupes progress into one line per stepId change. */
export function collapseOptimizationProgressToMilestones(
  progress: Pick<OptimizationProgressState, "stepId" | "message" | "microLog"> | undefined,
): OptimizationMilestone[] {
  const entries = collectProgressEntries(progress);
  const milestones: OptimizationMilestone[] = [];

  for (const entry of entries) {
    const key = entry.stepId ?? "other";
    const label = humanizeOptimizationMilestone(key, entry.message);
    const prev = milestones[milestones.length - 1];
    if (prev?.key === key) {
      prev.label = label;
      continue;
    }
    milestones.push({ key, label });
  }

  return milestones;
}

/** @deprecated Use stepId-based milestones. Kept for callers migrating off substring maps. */
export function resolveFrontendMilestoneKey(step: string, _message?: string): FrontendMilestoneKey {
  const ids: ContentOptimizerStepId[] = [
    "prepInventory",
    "prepResearch",
    "load",
    "plan",
    "write",
    "polish",
    "publish",
    "done",
  ];
  const hit = ids.find((id) => id === step || stepLabel(id).toLowerCase() === step.toLowerCase());
  return hit ?? "other";
}

/** @deprecated Prefer labelForStepId via collapseOptimizationProgressToMilestones. */
export function humanizeOptimizationMilestone(
  key: FrontendMilestoneKey,
  message?: string,
): string {
  if (key === "other") return message?.trim() || "Optimizing";
  return labelForStepId(key, message);
}

export function pickLatestOptimizationStatus(
  progress: (Pick<OptimizationProgressState, "stepId" | "message" | "microLog"> & { step?: string }) | undefined,
): string {
  if (progress?.stepId) {
    return labelForStepId(progress.stepId, progress.message);
  }
  const milestones = collapseOptimizationProgressToMilestones(progress);
  if (milestones.length === 0) return progress?.step?.trim() ?? "";
  return milestones[milestones.length - 1]!.label;
}

export function formatOptimizationProgressLog(
  progress: Pick<OptimizationProgressState, "stepId" | "message" | "microLog"> | undefined,
): string {
  return collapseOptimizationProgressToMilestones(progress)
    .map((m) => m.label)
    .filter(Boolean)
    .join("\n");
}

function formatRawProgressEntry(entry: ProgressEntry): string {
  const label = entry.stepId ? stepLabel(entry.stepId) : "";
  const message = entry.message?.trim();
  if (!label) return message ?? "";
  return message ? `${label}: ${message}` : label;
}

export function formatRawOptimizationProgressLog(
  progress: Pick<OptimizationProgressState, "stepId" | "message" | "microLog"> | undefined,
): string {
  return collectProgressEntries(progress).map(formatRawProgressEntry).filter(Boolean).join("\n");
}

export function downloadOptimizationProgressLog(
  progress: Pick<OptimizationProgressState, "stepId" | "message" | "microLog"> | undefined,
  filename = "optimization-log.txt",
): void {
  const body = formatRawOptimizationProgressLog(progress);
  if (!body.trim()) return;
  const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
