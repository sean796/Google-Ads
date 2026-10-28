import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import type { LocalAnalysisHeaderProgress } from "@/lib/local-analysis/header-progress";

export const LOCAL_GRID_ENTITY_PIPELINE_TITLES = [
  "Grid neighbourhoods",
  "Assigning keywords from GSC",
  "Export bulk template",
] as const;

export function buildLocalGridEntityPipelineHarness(phase: string): BulkHarnessSectionUi[] {
  const p = phase.trim().toLowerCase();
  let activeIndex = 0;
  if (p.includes("downloading") || p.includes("export")) {
    activeIndex = 2;
  } else if (p.includes("gsc") || p.includes("keyword") || p.includes("inventory")) {
    activeIndex = 1;
  } else if (
    p.includes("neighbourhood") ||
    p.includes("planning") ||
    p.includes("wikipedia") ||
    p.includes("entity") ||
    p.includes("grid")
  ) {
    activeIndex = 0;
  }

  return LOCAL_GRID_ENTITY_PIPELINE_TITLES.map((title, sectionIndex) => ({
    sectionIndex,
    title,
    status:
      sectionIndex < activeIndex
        ? ("done" as const)
        : sectionIndex === activeIndex
          ? ("generating" as const)
          : ("waiting" as const),
  }));
}

export function buildLocalGridEntityHeaderProgress(args: {
  phase: string;
  entityCount: number;
  busy: boolean;
}): LocalAnalysisHeaderProgress | null {
  const phase = args.phase.trim();
  if (!phase && !args.busy) return null;
  const label = phase || "Entities";
  return {
    kind: "generate",
    phase: label,
    completed: 0,
    total: Math.max(1, args.entityCount),
  };
}
