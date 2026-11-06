import type { BulkGeneratorDetailsPanelProps } from "@/components/keyword-research/bulk/BulkGeneratorDetailsPanel";
import type { CompetitorGenerationProgress } from "@/components/competitor-generation/types";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import type { CompetitorHarnessStepStatus } from "@/lib/competitor-research/competitor-comparison-harness-state";

function stepStatusToHarness(status: CompetitorHarnessStepStatus): BulkHarnessSectionUi["status"] {
  if (status === "generating") return "generating";
  if (status === "done") return "done";
  if (status === "skipped") return "done";
  return "waiting";
}

export function buildCompetitorBulkGeneratorDetailsProps(input: {
  workspaceBusy: boolean;
  displayRows: CSVRow[];
  progress: CompetitorGenerationProgress | null;
  keyword: string;
}): BulkGeneratorDetailsPanelProps {
  const groups = input.progress?.harnessGroups ?? [];
  const harnessByRow = new Map<number, BulkHarnessSectionUi[]>();

  input.displayRows.forEach((_row, index) => {
    const group = groups[index];
    if (!group?.steps.length) return;
    harnessByRow.set(
      index,
      group.steps.map((step, sectionIndex) => ({
        sectionIndex,
        title: step.label,
        status: stepStatusToHarness(step.status),
        markdown: step.detail?.trim() || undefined,
      })),
    );
  });

  let currentRow = -1;
  for (let index = 0; index < groups.length; index += 1) {
    if (groups[index]?.status === "generating") {
      currentRow = index;
      break;
    }
  }

  const phase = input.progress?.currentMessage?.trim() ?? "";

  return {
    variant: "csv",
    workspaceBusy: input.workspaceBusy,
    headerProgress: null,
    isProcessing: input.workspaceBusy,
    status: phase,
    harnessSections: [],
    harnessByRow,
    batchPrepHarnessSections: [],
    harnessPlannedSectionCount: groups[0]?.steps.length ?? null,
    currentRow,
    totalRows: input.displayRows.length,
    displayRows: input.displayRows,
    postDestination: "local",
    wpConfig: null,
    entitySapRowDisplay: true,
    pipelineSectionTitles: groups[0]?.steps.map((step) => step.label),
    liveMessage: phase || undefined,
  };
}
