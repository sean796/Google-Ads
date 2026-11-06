import { Download } from "lucide-react";
import { BULK_HEADER_TOOL_BTN } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import {
  getProposalProgressStatusLine,
  type ProposalProgressPhase,
  type ProposalProgressSubphase,
} from "@/lib/research/proposal-header-progress";
import { cn } from "@/lib/utils";
import {
  WorkspaceDetailsKvRow,
  WorkspaceDetailsSection,
  WorkspaceDetailsStack,
} from "@/components/shared/WorkspaceDetailsStack";
import { Button } from "@/ui";

export type ProposalDetailsPanelProps = {
  workspaceMode: string;
  phase: ProposalProgressPhase;
  proposalSubphase: ProposalProgressSubphase;
  competitorPipelineStep: number;
  competitorPipelineLabel: string | null;
  localPipelineStep: number;
  localPipelineLabel: string | null;
  reportMicroLabel: string | null;
  gscError: string | null;
  gridSapSummaryMarkdown: string;
  gridCsvBusy: boolean;
  gridCsvProgress: string | null;
  error: string | null;
  hasSapScheduleRows: boolean;
  onDownloadEntitySapCsv: () => void;
};

export function ProposalDetailsPanel({
  workspaceMode,
  phase,
  proposalSubphase,
  competitorPipelineStep,
  competitorPipelineLabel,
  localPipelineStep,
  localPipelineLabel,
  reportMicroLabel,
  gscError,
  gridSapSummaryMarkdown,
  gridCsvBusy,
  gridCsvProgress,
  error,
  hasSapScheduleRows,
  onDownloadEntitySapCsv,
}: ProposalDetailsPanelProps) {
  const progressLine = getProposalProgressStatusLine({
    phase,
    proposalSubphase,
    competitorPipelineStep,
    competitorPipelineLabel,
    localPipelineStep,
    localPipelineLabel,
    reportMicroLabel,
  });

  let kvIndex = 0;

  return (
    <WorkspaceDetailsStack>
      <WorkspaceDetailsSection title="Workspace" stripeIndex={0}>
        <WorkspaceDetailsKvRow
          label="Mode"
          value={workspaceMode === "connected" ? "Connected site" : "Temp seed"}
          stripeIndex={kvIndex++}
        />
        {gridSapSummaryMarkdown.trim() ? (
          <WorkspaceDetailsKvRow label="Grid CSV" value="Loaded" stripeIndex={kvIndex++} />
        ) : null}
      </WorkspaceDetailsSection>

      <WorkspaceDetailsSection title="Run detail" stripeIndex={1} defaultOpen>
        {progressLine ? (
          <WorkspaceDetailsKvRow label="Progress" value={progressLine} stripeIndex={0} />
        ) : null}
        {gscError && workspaceMode === "connected" ? (
          <WorkspaceDetailsKvRow label="GSC" value={gscError} stripeIndex={1} />
        ) : null}
        {gridCsvBusy && phase === "idle" ? (
          <WorkspaceDetailsKvRow
            label="Grid CSV"
            value={gridCsvProgress ?? "Processing grid CSV…"}
            stripeIndex={2}
          />
        ) : null}
        {phase === "report" && hasSapScheduleRows ? (
          <div className="flex flex-wrap items-center gap-2 px-2.5 py-2 sm:px-3">
            <Button
              variant="quiet"
              type="button"
              onClick={onDownloadEntitySapCsv}
              title="Download SAP CSV"
            >
              <Download className="mr-1.5 h-4 w-4 shrink-0" aria-hidden />
              Entity SAP CSV
            </Button>
            <span className="text-muted-foreground">Ready.</span>
          </div>
        ) : null}
        {error ? (
          <WorkspaceDetailsKvRow label="Error" value={error} stripeIndex={3} />
        ) : null}
      </WorkspaceDetailsSection>
    </WorkspaceDetailsStack>
  );
}
