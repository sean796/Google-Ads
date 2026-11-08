import type { BulkGeneratorDetailsPanelProps } from "@/components/keyword-research/bulk/BulkGeneratorDetailsPanel";
import type { SitemapPlanDetailsPanelProps } from "@/components/research/sitemap-optimizer/SitemapPlanDetailsPanel";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import type { CSVRow } from "@/lib/bulk-auto-generate";
import type { SitemapOptimizerCollectionKey, SitemapOptimizerProgress } from "@/lib/sitemap-optimizer/types";
import { isCustomSitemapOptimizerCollectionKey } from "@/lib/sitemap-optimizer/types";
import { resolveContentPrepBatchSectionTitles } from "@/lib/overview/overview-content-prep-harness-sections";
import { buildSitemapApproveHarnessSections } from "@/lib/sitemap-optimizer/sitemap-approve-harness";
import {
  sitemapPlanHeaderProgressToBlogImport,
  type SitemapPlanHeaderProgress,
} from "@/lib/sitemap-optimizer/sitemap-plan-header-progress";
import {
  sitemapOptimizerStepStatus,
  stepsForRunMode,
} from "@/lib/sitemap-optimizer/progress-display";

const BUILTIN_INVENTORY_LABELS = {
  posts: "Posts",
  pages: "Pages",
  entity: "SAP",
} as const;

function inventoryLabel(key: SitemapOptimizerCollectionKey): string {
  if (isCustomSitemapOptimizerCollectionKey(key)) {
    return key.slice("custom:".length).replace(/-/g, " ");
  }
  return BUILTIN_INVENTORY_LABELS[key];
}

function stepStatusToHarness(status: "pending" | "active" | "done"): BulkHarnessSectionUi["status"] {
  if (status === "active") return "generating";
  if (status === "done") return "done";
  return "waiting";
}

function isEntitySapRun(input: SitemapPlanDetailsPanelProps): boolean {
  return (
    input.selectedInventory === "entity" ||
    Boolean(input.analyzeProgress?.entityPrimary)
  );
}

function entityLabelFromUrl(url: string): string {
  try {
    const path = new URL(url.startsWith("http") ? url : `https://example.com${url}`).pathname;
    const segment = path.split("/").filter(Boolean).pop();
    if (segment) return segment.replace(/-/g, " ");
  } catch {
    /* use fallback */
  }
  return url;
}

function buildEntitySapDisplayRows(progress: SitemapOptimizerProgress | null): CSVRow[] {
  const currentUrl = progress?.currentUrl?.trim();
  const total = Math.max(1, progress?.total ?? progress?.inventoryCount ?? 1);

  if (total > 1) {
    const activeIndex = Math.min(
      Math.max(0, progress?.completed ?? 0),
      total - 1,
    );
    return Array.from({ length: total }, (_, index) => {
      const isActive = index === activeIndex;
      const url =
        isActive && currentUrl
          ? currentUrl
          : index < activeIndex && currentUrl
            ? `entity-done-${index}`
            : `entity-pending-${index}`;
      const entity =
        isActive && currentUrl
          ? entityLabelFromUrl(currentUrl)
          : `Service area ${index + 1}`;
      return {
        keyword: entity,
        title: entity,
        destination_url: url,
        entity,
      };
    });
  }

  if (currentUrl) {
    const entity = entityLabelFromUrl(currentUrl);
    return [{ keyword: entity, title: entity, destination_url: currentUrl, entity }];
  }

  return [
    {
      keyword: "Service areas",
      title: "Service areas",
      destination_url: "entity-sap-run",
      entity: "Service areas",
    },
  ];
}

function buildDefaultDisplayRows(input: SitemapPlanDetailsPanelProps): CSVRow[] {
  const progress = input.analyzeProgress;
  const title =
    progress?.runMode === "grid_csv"
      ? "Grid CSV analysis"
      : "Sitemap analysis";
  return [{ keyword: title, title, destination_url: title }];
}

function buildPlanDisplayRows(input: SitemapPlanDetailsPanelProps): CSVRow[] {
  if (isEntitySapRun(input)) {
    return buildEntitySapDisplayRows(input.analyzeProgress);
  }
  return buildDefaultDisplayRows(input);
}

function buildAnalyzeHarnessSections(
  input: SitemapPlanDetailsPanelProps,
): BulkHarnessSectionUi[] {
  const progress = input.analyzeProgress;
  if (!progress) return [];

  const steps = stepsForRunMode(progress.runMode, progress.entityPrimary);
  return steps.map((step, sectionIndex) => ({
    sectionIndex,
    title: step.label,
    status: stepStatusToHarness(
      sitemapOptimizerStepStatus(step.id, progress.phase, progress.runMode, progress.entityPrimary),
    ),
    markdown: progress.detail?.trim() || undefined,
  }));
}

function buildBatchPrepHarnessSections(
  input: SitemapPlanDetailsPanelProps & { busy: boolean },
  entitySap: boolean,
): BulkHarnessSectionUi[] {
  const titles = resolveContentPrepBatchSectionTitles(entitySap);
  const progress = input.analyzeProgress;
  const phase = progress?.phase ?? "";

  return titles.map((title, sectionIndex) => {
    let status: BulkHarnessSectionUi["status"] = "waiting";
    if (title === "Posts sitemap") {
      status =
        input.selectedInventory === "posts" || input.siteConnected
          ? progress
            ? "done"
            : "waiting"
          : "waiting";
    } else if (title === "Pages sitemap") {
      status =
        input.selectedInventory === "pages" || input.siteConnected
          ? progress
            ? "done"
            : "waiting"
          : "waiting";
    } else if (title === "Entity sitemap") {
      status = entitySap
        ? progress?.phase === "inventory" || progress?.phase === "gsc"
          ? "generating"
          : progress
            ? "done"
            : input.siteConnected
              ? "waiting"
              : "waiting"
        : "waiting";
    }

    if (!entitySap && title.includes("sitemap") && input.gscFileName) {
      status = "done";
    }
    if (input.rankMathImportSummary) {
      status = "done";
    }
    if (input.busy && phase === "inventory" && sectionIndex === titles.length - 1) {
      status = "generating";
    }

    return { sectionIndex, title, status };
  });
}

function buildPlanLiveMessage(input: SitemapPlanDetailsPanelProps): string | undefined {
  const parts: string[] = [
    inventoryLabel(input.selectedInventory),
    input.workspaceMode === "temp"
      ? "Temp seed"
      : input.siteConnected
        ? "Connected site"
        : "No site",
  ];
  if (input.gscFileName) {
    parts.push(
      `${input.gscFileName} (${input.gscUploadRowCount ?? 0} rows${input.isRedirectMapHarness ? " · redirect map" : ""})`,
    );
  }
  if (input.rankMathImportSummary) {
    parts.push(
      `NEO Pulse redirect: ${input.rankMathImportSummary.destinationCount} destination(s)`,
    );
  }
  return parts.filter(Boolean).join(" · ") || undefined;
}

function resolveCurrentRow(
  displayRows: CSVRow[],
  isAnalyzeRun: boolean,
  progress: SitemapOptimizerProgress | null,
): number {
  if (!isAnalyzeRun) return displayRows.length > 0 ? 0 : -1;
  const currentUrl = progress?.currentUrl?.trim();
  if (currentUrl) {
    const idx = displayRows.findIndex((row) => row.destination_url?.trim() === currentUrl);
    if (idx >= 0) return idx;
  }
  if (displayRows.length > 1 && progress) {
    return Math.min(Math.max(0, progress.completed), displayRows.length - 1);
  }
  return 0;
}

export function sitemapPlanDetailsCanOpen(input: {
  busy: boolean;
  gscFileName: string | null;
  rankMathImportSummary: SitemapPlanDetailsPanelProps["rankMathImportSummary"];
  error: string | null | undefined;
  rankMathError: string | null | undefined;
}): boolean {
  return (
    input.busy ||
    Boolean(input.gscFileName) ||
    Boolean(input.rankMathImportSummary) ||
    Boolean(input.error) ||
    Boolean(input.rankMathError)
  );
}

export function buildSitemapPlanBulkGeneratorDetailsProps(
  input: SitemapPlanDetailsPanelProps & { busy: boolean },
): BulkGeneratorDetailsPanelProps {
  const entitySap = isEntitySapRun(input);
  const displayRows = buildPlanDisplayRows(input);

  const isApproveRun = input.busy && Boolean(input.approveProgress);
  const isAnalyzeRun = input.busy && Boolean(input.analyzeProgress) && !isApproveRun;

  const harnessSections = isApproveRun
    ? buildSitemapApproveHarnessSections(input.approveProgress)
    : isAnalyzeRun
      ? buildAnalyzeHarnessSections(input)
      : [];

  const resolvedCurrentRow = isApproveRun
    ? 0
    : resolveCurrentRow(displayRows, isAnalyzeRun, input.analyzeProgress);

  const harnessByRow = new Map<number, BulkHarnessSectionUi[]>();
  if (harnessSections.length > 0) {
    const targetRow =
      resolvedCurrentRow >= 0 ? resolvedCurrentRow : displayRows.length > 0 ? 0 : -1;
    if (targetRow >= 0) {
      harnessByRow.set(targetRow, harnessSections);
    }
  }

  const batchPrepHarnessSections = buildBatchPrepHarnessSections(input, entitySap);

  const status =
    input.headerProgress?.phase?.trim() ??
    input.error?.trim() ??
    input.rankMathError?.trim() ??
    "";

  const headerProgress = sitemapPlanHeaderProgressToBlogImport(
    input.headerProgress as SitemapPlanHeaderProgress | null,
    input.busy,
  );

  return {
    variant: "csv",
    workspaceBusy: input.workspaceBusy,
    headerProgress,
    isProcessing: input.busy,
    status,
    harnessSections: [],
    harnessByRow,
    batchPrepHarnessSections,
    harnessPlannedSectionCount: harnessSections.length || null,
    currentRow: isApproveRun || isAnalyzeRun ? resolvedCurrentRow : -1,
    totalRows: displayRows.length,
    displayRows,
    postDestination: "local",
    wpConfig: null,
    entitySapRowDisplay: entitySap,
    pipelineSectionTitles: harnessSections.map((section) => section.title),
    liveMessage: buildPlanLiveMessage(input),
  };
}
