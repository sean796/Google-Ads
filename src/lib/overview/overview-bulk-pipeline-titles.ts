import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type {
  BulkOptimizationState,
  OptimizationProgressState,
} from "@/hooks/content-optimization/use-optimization-state";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import {
  CONTENT_OPTIMIZE_PIPELINE_TITLES,
  GOOGLE_IMAGE_PIPELINE_TITLE,
  isContentOptimizePipelineTitles,
  resolveContentOptimizePipelineTitlesForRow,
  resolveContentOptimizePipelineTitlesFromHarness,
  withGoogleImagePipelineFirst,
} from "@/lib/overview/overview-content-optimize-pipeline";
import {
  RESEARCH_HARNESS_PIPELINE_TITLES,
  RESEARCH_HARNESS_SECTION_TITLES,
  RESEARCH_HARNESS_TOTAL_SECTIONS,
  isResearchHarnessPipelineTitles,
} from "@/lib/overview/overview-research-harness-sections";

export const RESEARCH_PIPELINE_TITLES = RESEARCH_HARNESS_PIPELINE_TITLES;

const BLUEPRINT_PIPELINE_TITLE = "Blueprint";

/**
 * Cache-only AISEO body harnesses: ignore stale research artifacts on grid rows.
 * Runs in overview-aiseo-row-artifacts use fixed file slots (Element | Post content | WordPress upload) in Details.
 */
const AISEO_SIMPLE_HARNESS_RUN_KINDS = new Set<BulkOptimizationState["runKind"]>([
  "aiTitle",
  "aiAnswer",
  "aiOverview",
  "aiScenario",
  "aiHeaders",
  "aiLinks",
  "aiWikipediaLink",
  "aiFaq",
  "contentCleanup",
]);

export function isAiseoSimpleHarnessRunKind(
  runKind: BulkOptimizationState["runKind"] | undefined,
): boolean {
  return runKind != null && AISEO_SIMPLE_HARNESS_RUN_KINDS.has(runKind);
}

/** Batch-level pipeline titles for cache-only AISEO harness runs (Overview details drawer). */
export function resolveSimpleAiseoBatchPipelineTitles(
  runKind: BulkOptimizationState["runKind"] | undefined,
): readonly string[] | undefined {
  if (!isAiseoSimpleHarnessRunKind(runKind)) return undefined;
  switch (runKind) {
    case "aiAnswer":
      return ["Answer"];
    case "aiScenario":
      return undefined; // FAQ-shaped: Case scenario + WordPress upload only
    case "contentCleanup":
      return ["Clean Up"];
    case "aiWikipediaLink":
      return ["Wikipedia link"];
    case "aiFaq":
      return undefined;
    default:
      return undefined;
  }
}

export { CONTENT_OPTIMIZE_PIPELINE_TITLES, isContentOptimizePipelineTitles };

export type ResearchBatchSignals = Partial<
  Pick<BulkOptimizationState, "runKind" | "currentStep" | "urlHarnessSections">
> & {
  currentStepProgress?: Partial<OptimizationProgressState>;
};

function isResearchPipelineTitles(titles: readonly string[] | undefined): boolean {
  return isResearchHarnessPipelineTitles(titles);
}

export function rowHarnessIsResearch(rowHarness: BulkHarnessSectionUi[] | undefined): boolean {
  if (!rowHarness?.length) return false;
  const titles = new Set(rowHarness.map((section) => section.title?.trim()).filter(Boolean));
  return RESEARCH_HARNESS_SECTION_TITLES.some((title) => titles.has(title));
}

function urlHarnessSectionsIncludeResearch(
  urlHarnessSections: BulkOptimizationState["urlHarnessSections"] | undefined,
): boolean {
  if (!urlHarnessSections) return false;
  for (const sections of Object.values(urlHarnessSections)) {
    if (rowHarnessIsResearch(sections as BulkHarnessSectionUi[])) return true;
  }
  return false;
}

export function overviewRowByUrlMap(rows: OverviewRow[]): Map<string, OverviewRow> {
  const map = new Map<string, OverviewRow>();
  for (const row of rows) {
    const key = normalizePageUrlKey(row.url);
    if (key) map.set(key, row);
  }
  return map;
}

/** True when batch state indicates an active/completed Research All run (not grid row status alone). */
export function overviewBatchIsResearchContext(
  bulkState: BulkOptimizationState | undefined,
  _overviewRows?: OverviewRow[],
): boolean {
  if (!bulkState) return false;
  if (bulkState.runKind === "research") return true;
  if (urlHarnessSectionsIncludeResearch(bulkState.urlHarnessSections)) return true;
  return isResearchBatchState(bulkState);
}

export function buildResearchRowIndexSet(
  bulkState: BulkOptimizationState | undefined,
  overviewRows: OverviewRow[],
): Set<number> {
  const indices = new Set<number>();
  const urls = bulkState?.urls ?? [];
  if (!urls.length) return indices;
  const rowByUrl = overviewRowByUrlMap(overviewRows);
  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index]!;
    if (rowByUrl.get(normalizePageUrlKey(url))?.status === "research-faq") {
      indices.add(index);
    }
  }
  return indices;
}

export function isResearchBatchState(
  bulkState?: ResearchBatchSignals | null,
): boolean {
  if (!bulkState) return false;
  if (bulkState.runKind === "research") return true;
  const step = bulkState.currentStep?.trim() ?? "";
  const msg = bulkState.currentStepProgress?.message?.trim() ?? "";
  if (step.includes("Researching") || msg.includes("Research") || msg.includes("Research row")) return true;
  const planned = bulkState.currentStepProgress?.harnessPlannedSectionCount;
  if (planned === RESEARCH_HARNESS_TOTAL_SECTIONS) {
    return (
      step.includes("Research") ||
      msg.includes("Research") ||
      urlHarnessSectionsIncludeResearch(bulkState.urlHarnessSections)
    );
  }
  if (urlHarnessSectionsIncludeResearch(bulkState.urlHarnessSections)) return true;
  return false;
}

export function isResearchBulkRowPipeline(
  runKind: BulkOptimizationState["runKind"] | undefined,
  rowHarness: BulkHarnessSectionUi[] | undefined,
  batchPipelineTitles?: readonly string[],
  bulkState?: ResearchBatchSignals | null,
): boolean {
  return (
    isResearchBatchState(bulkState ?? (runKind ? { runKind } : null)) ||
    runKind === "research" ||
    rowHarnessIsResearch(rowHarness) ||
    isResearchPipelineTitles(batchPipelineTitles)
  );
}

export function isBlueprintGeneratedFileName(name: string): boolean {
  return name.toLowerCase().startsWith("blueprint-");
}

type RowFileRef = { name?: string; fileName?: string };

/** Overview Research All artifacts only. Play's shared `serp-research-brief` is not research. */
export function rowFilesIncludeResearchArtifacts(rowFiles: RowFileRef[] | undefined): boolean {
  if (!rowFiles?.length) return false;
  return rowFiles.some((file) => {
    const name = (file.name ?? file.fileName ?? "").toLowerCase();
    if (!name) return false;
    return (
      name.startsWith("research-") ||
      name.includes("llm-audit") ||
      name.includes("semrush-enrichment") ||
      name.includes("dataforseo-serp") ||
      name.includes("gsc-quick-wins") ||
      name.includes("serp-dump-load") ||
      name.startsWith("seo_brief__")
    );
  });
}

export function isBlueprintPipelineVisible(
  rowHarness: BulkHarnessSectionUi[] | undefined,
  rowFiles: RowFileRef[] | undefined,
): boolean {
  const blueprintSection = rowHarness?.find((section) => section.title === BLUEPRINT_PIPELINE_TITLE);
  if (blueprintSection && blueprintSection.status !== "waiting") return true;
  return Boolean(
    rowFiles?.some((file) =>
      isBlueprintGeneratedFileName(file.name ?? file.fileName ?? ""),
    ),
  );
}

function isExplicitResearchPipeline(
  runKind: BulkOptimizationState["runKind"] | undefined,
  rowHarness: BulkHarnessSectionUi[] | undefined,
  batchPipelineTitles: readonly string[] | undefined,
  bulkState: ResearchBatchSignals | null | undefined,
): boolean {
  return (
    runKind === "research" ||
    bulkState?.runKind === "research" ||
    rowHarnessIsResearch(rowHarness) ||
    isResearchHarnessPipelineTitles(batchPipelineTitles) ||
    isResearchBatchState(bulkState)
  );
}

/** Per-row Generated files pipeline. Research All shows 8 harness steps. Content optimize shows full predetermined slots. */
export function resolveBulkRowPipelineTitles(
  runKind: BulkOptimizationState["runKind"] | undefined,
  rowHarness: BulkHarnessSectionUi[] | undefined,
  rowFiles: RowFileRef[] | undefined,
  batchPipelineTitles?: readonly string[],
  bulkState?: ResearchBatchSignals | null,
): readonly string[] {
  if (isAiseoSimpleHarnessRunKind(runKind)) {
    if (batchPipelineTitles?.length && !isResearchHarnessPipelineTitles(batchPipelineTitles)) {
      return [...batchPipelineTitles];
    }
    switch (runKind) {
      case "aiAnswer":
        return ["Answer"];
      case "aiScenario":
        return [];
      case "contentCleanup":
        return ["Clean Up"];
      case "aiWikipediaLink":
        return ["Wikipedia link"];
      case "aiFaq":
        return [];
      default:
        return batchPipelineTitles?.length ? [...batchPipelineTitles] : ["Answer"];
    }
  }

  if (isExplicitResearchPipeline(runKind, rowHarness, batchPipelineTitles, bulkState)) {
    return [...RESEARCH_HARNESS_PIPELINE_TITLES];
  }

  if (
    rowFilesIncludeResearchArtifacts(rowFiles) &&
    !isBlueprintPipelineVisible(rowHarness, rowFiles)
  ) {
    return [...RESEARCH_HARNESS_PIPELINE_TITLES];
  }

  if (batchPipelineTitles?.length) {
    if (isResearchHarnessPipelineTitles(batchPipelineTitles)) {
      return [...RESEARCH_HARNESS_PIPELINE_TITLES];
    }
    if (isContentOptimizePipelineTitles(batchPipelineTitles)) {
      const googleImageFirst = batchPipelineTitles[0] === GOOGLE_IMAGE_PIPELINE_TITLE;
      return resolveContentOptimizePipelineTitlesForRow(
        rowHarness,
        rowFiles,
        undefined,
        googleImageFirst,
      );
    }
    return [...batchPipelineTitles];
  }

  if (isResearchBatchState(bulkState ?? null) && runKind === "research") {
    return [...RESEARCH_HARNESS_PIPELINE_TITLES];
  }

  return resolveContentOptimizePipelineTitlesForRow(rowHarness, rowFiles);
}

export function resolveBulkRowPipelineTitlesWithGoogleImage(
  runKind: BulkOptimizationState["runKind"] | undefined,
  rowHarness: BulkHarnessSectionUi[] | undefined,
  rowFiles: RowFileRef[] | undefined,
  googleImageFirst: boolean,
  batchPipelineTitles?: readonly string[],
  bulkState?: ResearchBatchSignals | null,
): readonly string[] {
  const titles = resolveBulkRowPipelineTitles(
    runKind,
    rowHarness,
    rowFiles,
    batchPipelineTitles,
    bulkState,
  );
  return googleImageFirst ? withGoogleImagePipelineFirst(titles) : titles;
}
