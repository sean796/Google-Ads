import type { HarnessSectionListItem } from "@/lib/bulk/harness-sections-reducer";
import type { LinkCheckResult } from "@/lib/wordpress-api/validate-internal-links";

/** Bulk prep + per-URL pipeline steps (single path). */
export type ContentOptimizerStepId =
  | "prepInventory"
  | "prepResearch"
  | "load"
  | "plan"
  | "write"
  | "polish"
  | "publish"
  | "done";

export type ContentOptimizerStepDef = {
  id: ContentOptimizerStepId;
  label: string;
  /** Weight within a single URL run (sum = 100). */
  urlWeight: number;
  /** Weight within bulk prep only (sum = 8). */
  batchPrepWeight: number;
};

export const CONTENT_OPTIMIZER_STEPS: readonly ContentOptimizerStepDef[] = [
  { id: "prepInventory", label: "Prep inventory", urlWeight: 0, batchPrepWeight: 4 },
  { id: "prepResearch", label: "Warm research", urlWeight: 0, batchPrepWeight: 4 },
  { id: "load", label: "Load", urlWeight: 8, batchPrepWeight: 0 },
  { id: "plan", label: "Plan", urlWeight: 22, batchPrepWeight: 0 },
  { id: "write", label: "Write", urlWeight: 40, batchPrepWeight: 0 },
  { id: "polish", label: "Polish", urlWeight: 10, batchPrepWeight: 0 },
  { id: "publish", label: "Publish", urlWeight: 17, batchPrepWeight: 0 },
  { id: "done", label: "Done", urlWeight: 3, batchPrepWeight: 0 },
] as const;

export const CONTENT_OPTIMIZER_URL_STEPS = CONTENT_OPTIMIZER_STEPS.filter((s) => s.urlWeight > 0);

export const BATCH_PREP_WEIGHT_TOTAL = CONTENT_OPTIMIZER_STEPS.reduce(
  (sum, s) => sum + s.batchPrepWeight,
  0,
);

const STEP_BY_ID = new Map(CONTENT_OPTIMIZER_STEPS.map((s) => [s.id, s]));

const URL_STEP_ORDER: ContentOptimizerStepId[] = ["load", "plan", "write", "polish", "publish", "done"];

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function stepDef(stepId: ContentOptimizerStepId): ContentOptimizerStepDef {
  const def = STEP_BY_ID.get(stepId);
  if (!def) throw new Error(`Unknown Content Optimizer step: ${stepId}`);
  return def;
}

/** Completed URL-step weight before `stepId`. */
function urlWeightBefore(stepId: ContentOptimizerStepId): number {
  let sum = 0;
  for (const id of URL_STEP_ORDER) {
    if (id === stepId) break;
    sum += stepDef(id).urlWeight;
  }
  return sum;
}

/** 0–100 progress for a single URL run. */
export function computeUrlProgress(stepId: ContentOptimizerStepId, subProgress: number): number {
  const sub = clamp01(subProgress);
  const def = stepDef(stepId);
  if (def.urlWeight <= 0) {
    throw new Error(`Step ${stepId} is not a per-URL step`);
  }
  const raw = urlWeightBefore(stepId) + def.urlWeight * sub;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

/** 0–100 for bulk prep phase only. */
export function computePrepProgress(stepId: "prepInventory" | "prepResearch", subProgress: number): number {
  const sub = clamp01(subProgress);
  let before = 0;
  for (const s of CONTENT_OPTIMIZER_STEPS) {
    if (s.id === stepId) {
      return Math.min(100, Math.max(0, Math.round(((before + s.batchPrepWeight * sub) / BATCH_PREP_WEIGHT_TOTAL) * 100)));
    }
    before += s.batchPrepWeight;
  }
  return 0;
}

export type ComputeBatchProgressInput = {
  prepComplete: boolean;
  prepStepId?: "prepInventory" | "prepResearch";
  prepSubProgress?: number;
  completedUrls: number;
  totalUrls: number;
  currentUrlProgress: number;
};

export type BulkProgressMeta = {
  totalUrls: number;
  completedUrls: number;
  prepComplete: boolean;
};

export function computeBatchProgressFromSiteEntry(
  siteEntry: { stepId?: ContentOptimizerStepId; subProgress?: number; progress?: number },
  meta: BulkProgressMeta,
): number {
  const urlProgress =
    siteEntry.progress ??
    (siteEntry.stepId != null && siteEntry.subProgress != null
      ? computeProgressForStep(siteEntry.stepId, siteEntry.subProgress)
      : 0);
  return computeBatchProgress({
    prepComplete: meta.prepComplete,
    completedUrls: meta.completedUrls,
    totalUrls: meta.totalUrls,
    currentUrlProgress: urlProgress,
  });
}

/** 0–100 for entire bulk batch (prep + all URLs). */
export function computeBatchProgress(input: ComputeBatchProgressInput): number {
  const { prepComplete, prepStepId, prepSubProgress = 0, completedUrls, totalUrls, currentUrlProgress } = input;
  const prepShare = BATCH_PREP_WEIGHT_TOTAL / 100;
  const urlShare = 1 - prepShare;

  let prepPct = prepComplete ? 100 : 0;
  if (!prepComplete && prepStepId) {
    prepPct = computePrepProgress(prepStepId, prepSubProgress);
  }

  const total = Math.max(1, totalUrls);
  const urlFraction = (completedUrls + clamp01(currentUrlProgress / 100)) / total;
  const raw = prepPct * prepShare + urlFraction * urlShare * 100;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

export function stepLabel(stepId: ContentOptimizerStepId): string {
  return stepDef(stepId).label;
}

export function urlStepIndex(stepId: ContentOptimizerStepId): number {
  const idx = URL_STEP_ORDER.indexOf(stepId);
  return idx;
}

export function isBulkUploadPhaseStepId(stepId: ContentOptimizerStepId): boolean {
  return stepId === "publish";
}

export type RunProgressPatch = {
  stepId: ContentOptimizerStepId;
  subProgress: number;
  message?: string;
  error?: string;
  /** When set (bulk batch key), use this 0–100 value instead of per-URL step math. */
  batchProgress?: number;
  linkCheckResults?: LinkCheckResult[] | null;
  harnessSections?: HarnessSectionListItem[];
  harnessPlannedSectionCount?: number | null;
  pageUrl?: string;
  filesRevision?: number;
  generatedFileNames?: string[];
};

export type RunProgressReporter = (
  stepId: ContentOptimizerStepId,
  subProgress: number,
  message?: string,
  extra?: Omit<RunProgressPatch, "stepId" | "subProgress" | "message">,
) => void;

export type RunProgressEntry = RunProgressPatch & {
  step: string;
  progress: number;
  microLog?: { stepId: ContentOptimizerStepId; message?: string }[];
};

function computeProgressForStep(stepId: ContentOptimizerStepId, subProgress: number): number {
  if (stepId === "prepInventory" || stepId === "prepResearch") {
    return computePrepProgress(stepId, subProgress);
  }
  return computeUrlProgress(stepId, subProgress);
}

const MICRO_LOG_CAP = 100;

export function mergeRunProgress(
  prev: Record<string, RunProgressEntry | undefined>,
  key: string,
  incoming: RunProgressPatch,
): Record<string, RunProgressEntry | undefined> {
  const prevEntry = prev[key];
  const computed =
    incoming.batchProgress != null
      ? incoming.batchProgress
      : computeProgressForStep(incoming.stepId, incoming.subProgress);
  const progress = Math.max(prevEntry?.progress ?? 0, computed);

  const microLog = [...(prevEntry?.microLog ?? [])];
  if (incoming.stepId !== prevEntry?.stepId || incoming.message !== prevEntry?.message) {
    microLog.push({ stepId: incoming.stepId, message: incoming.message });
    while (microLog.length > MICRO_LOG_CAP) microLog.shift();
  }

  const next: RunProgressEntry = {
    ...prevEntry,
    ...incoming,
    step: stepLabel(incoming.stepId),
    progress,
    microLog,
  };

  if (incoming.linkCheckResults == null && prevEntry?.linkCheckResults != null) {
    next.linkCheckResults = prevEntry.linkCheckResults;
  }
  if (incoming.harnessSections == null && prevEntry?.harnessSections != null) {
    next.harnessSections = prevEntry.harnessSections;
    next.harnessPlannedSectionCount = prevEntry.harnessPlannedSectionCount;
  }
  if (incoming.generatedFileNames == null && prevEntry?.generatedFileNames != null) {
    next.generatedFileNames = prevEntry.generatedFileNames;
  }
  if (incoming.filesRevision == null && prevEntry?.filesRevision != null) {
    next.filesRevision = prevEntry.filesRevision;
  }

  return { ...prev, [key]: next };
}

export function reportRunProgress(
  setProgress: (
    updater: (prev: Record<string, RunProgressEntry | undefined>) => Record<string, RunProgressEntry | undefined>,
  ) => void,
  key: string,
  patch: RunProgressPatch,
): void {
  setProgress((prev) => mergeRunProgress(prev, key, patch));
}

/** Harness section completion maps into plan/write subProgress. */
export function harnessSubProgress(
  stepId: "plan" | "write",
  sectionIndex: number,
  totalSections: number,
  phase: "start" | "done" | "stream" | "progress",
): number {
  const total = Math.max(1, totalSections);
  const base = sectionIndex / total;
  if (phase === "done") return Math.min(1, (sectionIndex + 1) / total);
  if (phase === "stream" || phase === "progress") return Math.min(1, base + 0.5 / total);
  return base;
}
