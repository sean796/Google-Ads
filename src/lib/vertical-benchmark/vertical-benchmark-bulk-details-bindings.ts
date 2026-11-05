import type { BulkGeneratorDetailsPanelProps } from "@/components/keyword-research/bulk/BulkGeneratorDetailsPanel";
import type { VerticalBenchmarkDetailsPanelProps } from "@/components/vertical-benchmark/VerticalBenchmarkDetailsPanel";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import type { PromptBulkSitemapInventoryLink } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import type { ContentTypeFilter } from "@/hooks/vertical-benchmark/use-vertical-benchmark-controller";
import type {
  BenchmarkPipelineStep,
  BenchmarkPipelineStepStatus,
} from "@/lib/vertical-benchmark/vertical-benchmark-pipeline-types";

function stepStatusToHarness(status: BenchmarkPipelineStepStatus): BulkHarnessSectionUi["status"] {
  if (status === "active") return "generating";
  if (status === "done") return "done";
  if (status === "error") return "skipped";
  return "waiting";
}

function categoryFilterLabel(tagFilter: string): string {
  return tagFilter;
}

function contentTypeLabel(contentTypeFilter: ContentTypeFilter): string {
  if (contentTypeFilter === "post") return "Posts";
  if (contentTypeFilter === "entity") return "Entity";
  if (contentTypeFilter === "both") return "Posts + Entity";
  return "All content";
}

function benchmarkInventoryLinks(
  links: VerticalBenchmarkDetailsPanelProps["bulkInventoryLinks"],
): PromptBulkSitemapInventoryLink[] {
  return links.map((link) => ({
    siteId: link.siteId,
    siteName: link.siteName,
    href: link.href,
    filename: link.filename,
    rowCount: link.rowCount,
    source: "posts",
    label: link.siteName,
  }));
}

function siteIdsFromSteps(steps: BenchmarkPipelineStep[]): string[] {
  const ids = new Set<string>();
  for (const step of steps) {
    const match = step.id.match(/^(?:inv|gsc|gemini)-([^-]+(?:-[^-]+)*)/);
    if (match?.[1]) ids.add(match[1]);
  }
  return [...ids];
}

function stepsForSite(steps: BenchmarkPipelineStep[], siteId: string): BenchmarkPipelineStep[] {
  return steps.filter((step) => step.id.includes(siteId));
}

function buildHarnessForSteps(steps: BenchmarkPipelineStep[]): BulkHarnessSectionUi[] {
  return steps.map((step, sectionIndex) => ({
    sectionIndex,
    title: step.label,
    status: stepStatusToHarness(step.status),
    markdown: step.detail?.trim() || undefined,
  }));
}

export function buildVerticalBenchmarkBulkGeneratorDetailsProps(
  input: VerticalBenchmarkDetailsPanelProps & { contentTypeFilter: ContentTypeFilter },
): BulkGeneratorDetailsPanelProps {
  const activeProgress = input.bulkTemplateProgress ?? input.exportProgress;

  const siteIds = activeProgress?.steps?.length
    ? siteIdsFromSteps(activeProgress.steps)
    : [];

  const allStepTitles = activeProgress?.steps?.length
    ? activeProgress.steps.map((step) => step.label)
    : undefined;

  const displayRows =
    siteIds.length > 0
      ? siteIds.map((siteId) => {
          const siteStep = activeProgress!.steps.find(
            (step) => step.id.includes(siteId) && step.label.trim(),
          );
          const siteName =
            input.bulkInventoryLinks.find((link) => link.siteId === siteId)?.siteName ??
            siteStep?.label ??
            siteId;
          return {
            keyword: siteName,
            title: siteName,
            destination_url: `#benchmark-${siteId}`,
          };
        })
      : [{ keyword: "Industry vertical curate", title: "Industry vertical curate", destination_url: "#benchmark-curate" }];

  const harnessByRow = new Map<number, BulkHarnessSectionUi[]>();
  if (activeProgress?.steps?.length) {
    if (siteIds.length > 0) {
      siteIds.forEach((siteId, index) => {
        harnessByRow.set(index, buildHarnessForSteps(stepsForSite(activeProgress.steps, siteId)));
      });
    } else {
      harnessByRow.set(0, buildHarnessForSteps(activeProgress.steps));
    }
  }

  const batchPrepHarnessSections: BulkHarnessSectionUi[] = [
    {
      sectionIndex: 0,
      title: "Grid CSV",
      status: input.gridCsvContext ? "done" : input.gridCsvParsing ? "generating" : "waiting",
    },
    {
      sectionIndex: 1,
      title: "Site selection",
      status: input.selectedCount > 0 ? "done" : "waiting",
    },
    {
      sectionIndex: 2,
      title: "Category filter",
      status: input.tagFilter ? "done" : "waiting",
    },
  ];

  let currentRow = -1;
  if (input.busy && activeProgress?.steps?.length) {
    const activeSiteIdx = siteIds.findIndex((siteId) =>
      stepsForSite(activeProgress.steps, siteId).some((step) => step.status === "active"),
    );
    currentRow = activeSiteIdx >= 0 ? activeSiteIdx : 0;
  }

  const status = activeProgress?.message?.trim() ?? "";

  return {
    variant: "csv",
    workspaceBusy: input.busy,
    headerProgress: null,
    isProcessing: input.busy,
    status,
    harnessSections: [],
    harnessByRow,
    batchPrepHarnessSections,
    harnessPlannedSectionCount: activeProgress?.steps.length ?? null,
    currentRow,
    totalRows: displayRows.length,
    displayRows,
    postDestination: "local",
    wpConfig: null,
    sitemapInventoryLinks: benchmarkInventoryLinks(input.bulkInventoryLinks),
    selectedCount: input.selectedCount,
    prepAccordionTitle: "Curate prep",
    pipelineSectionTitles: siteIds.length > 0 ? undefined : allStepTitles,
    liveMessage: [
      status || null,
      categoryFilterLabel(input.tagFilter),
      contentTypeLabel(input.contentTypeFilter),
      input.gridCsvFileName ? `${input.gridCsvFileName}` : null,
      input.selectedCount > 0 ? `${input.selectedCount} / ${input.rosterCount} selected` : null,
      input.blogCount > 0 ? `${input.blogCount} blogs` : null,
    ]
      .filter(Boolean)
      .join(" · ") || undefined,
  };
}
