import type { SitemapOptimizerPhase, SitemapOptimizerProgress } from "@/lib/sitemap-optimizer/types";

export type SitemapOptimizerStepId =
  | "ingest_csv"
  | "tagging"
  | "inventory"
  | "gsc"
  | "gsc_triage"
  | "clustering"
  | "merge"
  | "content_sheet";

export const SITEMAP_OPTIMIZER_STEPS_WORDPRESS: { id: SitemapOptimizerStepId; label: string }[] = [
  { id: "inventory", label: "WordPress inventory" },
  { id: "gsc", label: "Search Console" },
  { id: "gsc_triage", label: "GSC performance triage" },
  { id: "clustering", label: "Intent clustering" },
  { id: "merge", label: "Merge briefs" },
  { id: "content_sheet", label: "Content sheet" },
];

export const SITEMAP_OPTIMIZER_STEPS_ENTITY: { id: SitemapOptimizerStepId; label: string }[] = [
  { id: "gsc_triage", label: "Keep" },
  { id: "clustering", label: "Compress" },
  { id: "merge", label: "Transform" },
];

export const SITEMAP_OPTIMIZER_STEPS_GRID: { id: SitemapOptimizerStepId; label: string }[] = [
  { id: "ingest_csv", label: "Ingest grid CSV" },
  { id: "gsc_triage", label: "GSC performance triage" },
  { id: "clustering", label: "Cluster underperformers" },
  { id: "merge", label: "NEO Pulse redirect targets" },
];

/** @deprecated Use stepsForRunMode */
export const SITEMAP_OPTIMIZER_STEPS = SITEMAP_OPTIMIZER_STEPS_WORDPRESS;

export function stepsForRunMode(
  runMode?: SitemapOptimizerProgress["runMode"],
  entityPrimary?: boolean,
): { id: SitemapOptimizerStepId; label: string }[] {
  if (runMode === "grid_csv") return SITEMAP_OPTIMIZER_STEPS_GRID;
  return entityPrimary ? SITEMAP_OPTIMIZER_STEPS_ENTITY : SITEMAP_OPTIMIZER_STEPS_WORDPRESS;
}

function stepIndex(
  phase: SitemapOptimizerPhase,
  runMode?: SitemapOptimizerProgress["runMode"],
  entityPrimary?: boolean,
): number {
  const steps = stepsForRunMode(runMode, entityPrimary);

  // Entity drawer is Keep / Compress / Transform only — fold prep and sheet into those.
  if (entityPrimary && runMode !== "grid_csv") {
    if (phase === "done") return steps.length;
    if (phase === "idle" || phase === "error") return -1;
    if (phase === "inventory" || phase === "gsc" || phase === "gsc_triage") {
      return steps.findIndex((s) => s.id === "gsc_triage");
    }
    if (phase === "clustering") {
      return steps.findIndex((s) => s.id === "clustering");
    }
    if (phase === "merge" || phase === "content_sheet") {
      return steps.findIndex((s) => s.id === "merge");
    }
    return -1;
  }

  const id =
    phase === "ingest_csv"
      ? "ingest_csv"
      : phase === "tagging"
        ? "tagging"
        : phase === "inventory"
          ? "inventory"
          : phase === "gsc"
            ? "gsc"
            : phase === "gsc_triage"
              ? "gsc_triage"
              : phase === "clustering"
                ? "clustering"
                : phase === "merge"
                  ? "merge"
                  : phase === "content_sheet"
                    ? "content_sheet"
                    : null;
  if (!id) return phase === "done" ? steps.length : -1;
  return steps.findIndex((s) => s.id === id);
}

export function sitemapOptimizerOverallPct(progress: SitemapOptimizerProgress): number {
  const { phase, completed, total, runMode } = progress;
  if (phase === "done") return 100;
  if (phase === "idle" || phase === "error") return 0;

  const steps = stepsForRunMode(runMode, progress.entityPrimary);
  const idx = stepIndex(phase, runMode, progress.entityPrimary);
  const segment = 100 / steps.length;

  // Entity: three equal segments (Keep / Compress / Transform).
  if (progress.entityPrimary && runMode !== "grid_csv") {
    if (idx < 0) return 0;
    const inner =
      total > 0 ? Math.min(1, completed / total) : phase === "inventory" || phase === "clustering" ? 0.35 : 0.15;
    return Math.min(99, segment * idx + inner * segment);
  }

  if (phase === "ingest_csv") {
    return total > 0 && completed >= total ? segment : Math.max(2, segment * 0.5);
  }
  if (phase === "tagging" && runMode === "grid_csv") {
    const base = segment;
    const inner = total > 0 ? Math.min(1, completed / total) : 0;
    return base + inner * segment;
  }
  if (phase === "inventory") {
    return total > 0 && completed >= total ? segment : Math.max(2, segment * 0.35);
  }
  if (phase === "gsc_triage") {
    const stepsBefore = runMode === "grid_csv" ? 1 : 2;
    const base = segment * stepsBefore;
    const inner = total > 0 ? Math.min(1, completed / total) : 0;
    return base + inner * segment;
  }
  if (phase === "gsc") {
    const base = segment;
    const span = segment * 2.2;
    let inner = total > 0 ? Math.min(1, completed / total) : 0;
    if (
      progress.gscImportSubphase === "queries" &&
      progress.gscQueryProgressTotal != null &&
      progress.gscQueryProgressTotal > 0 &&
      total > 0
    ) {
      const queryInner =
        (progress.gscQueryProgressCompleted ?? 0) / progress.gscQueryProgressTotal;
      inner = Math.min(1, (completed + queryInner) / total);
    }
    return base + inner * span;
  }
  if (phase === "clustering") {
    if (runMode === "grid_csv" && total > 0) {
      const base = segment * 2;
      const inner = Math.min(1, completed / total);
      return base + inner * segment;
    }
    return segment * 2.5 + segment * 0.4;
  }
  if (phase === "merge") {
    const base = runMode === "grid_csv" ? segment * 3 : segment * 3.2;
    const inner = total > 0 ? Math.min(1, completed / total) : 0;
    return base + inner * segment;
  }
  if (phase === "content_sheet") {
    const base = segment * 3.85;
    const inner = total > 0 ? Math.min(1, completed / total) : 0;
    return base + inner * segment * 0.9;
  }
  return idx >= 0 ? segment * (idx + 0.5) : 0;
}

export function sitemapOptimizerPhasePct(progress: SitemapOptimizerProgress): number | null {
  const { phase, completed, total, runMode } = progress;
  if (phase === "inventory" || (phase === "ingest_csv" && runMode !== "grid_csv")) {
    return total > 0 && completed >= total ? 100 : null;
  }
  if (phase === "ingest_csv" || phase === "tagging") {
    if (total <= 0) return null;
    return Math.round(Math.min(100, (completed / total) * 100));
  }
  if (phase === "gsc_triage") {
    if (total <= 0) return null;
    return Math.round(Math.min(100, (completed / total) * 100));
  }
  if (phase === "gsc") {
    if (
      progress.gscImportSubphase === "queries" &&
      progress.gscQueryProgressTotal != null &&
      progress.gscQueryProgressTotal > 0
    ) {
      return Math.round(
        Math.min(
          100,
          ((progress.gscQueryProgressCompleted ?? 0) / progress.gscQueryProgressTotal) * 100,
        ),
      );
    }
    if (total <= 0) return null;
    return Math.round(Math.min(100, (completed / total) * 100));
  }
  if (
    phase === "merge" ||
    phase === "content_sheet" ||
    (phase === "clustering" && runMode === "grid_csv")
  ) {
    if (total <= 0) return null;
    return Math.round(Math.min(100, (completed / total) * 100));
  }
  if (phase === "done") return 100;
  return null;
}

export function sitemapOptimizerPhaseIndeterminate(progress: SitemapOptimizerProgress): boolean {
  if (progress.runMode === "grid_csv") {
    return (
      (progress.phase === "tagging" || progress.phase === "clustering") &&
      (progress.total <= 0 || progress.completed < progress.total)
    );
  }
  if (progress.phase === "inventory") return true;
  if (progress.phase === "clustering") {
    return progress.clusteringSubphase === "batch"
      ? progress.total <= 0
      : progress.total <= 0 || progress.completed < progress.total;
  }
  return false;
}

export function sitemapOptimizerStepStatus(
  stepId: SitemapOptimizerStepId,
  phase: SitemapOptimizerPhase,
  runMode?: SitemapOptimizerProgress["runMode"],
  entityPrimary?: boolean,
): "pending" | "active" | "done" {
  if (phase === "done") return "done";
  const current = stepIndex(phase, runMode, entityPrimary);
  const steps = stepsForRunMode(runMode, entityPrimary);
  const target = steps.findIndex((s) => s.id === stepId);
  if (target < 0) return "pending";
  if (current < 0) return "pending";
  if (target < current) return "done";
  if (target === current) return "active";
  return "pending";
}
