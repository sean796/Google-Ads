import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";
import {
  REPORT_PIPELINE_MICRO_TOTAL,
} from "@/lib/competitor-research/competitor-report-openrouter-limits";
import {
  LOCAL_STRATEGY_REPORT_MICRO_TOTAL,
} from "@/lib/local-strategy-research/local-strategy-report-openrouter-limits";

export const PROPOSAL_LABEL = "Proposal";

export type ProposalProgressPhase = "idle" | "semrush" | "report";

export type ProposalProgressSubphase = "competitor" | "local" | "sap" | "parallel" | null;

function formatProposalCompetitorReportProgressLine(
  step: number,
  label: string | null,
  total: number,
): string {
  const micro = label ?? "…";
  if (step <= 0) {
    return `Step 3: Competitor strategist · ${micro} · 0/${total}`;
  }
  const phase = step <= 5 ? "Prep" : "Strategist";
  const phaseDetail = step <= 5 ? `${step}/5` : `${step - 5}/4`;
  return `Step 3: Competitor strategist · ${phase} ${phaseDetail} · ${step}/${total} · ${micro}`;
}

function formatProposalLocalBlueprintProgressLine(
  step: number,
  label: string | null,
  total: number,
): string {
  const micro = label ?? "…";
  if (step <= 0) {
    return `Step 4: Local blueprint · ${micro} · 0/${total}`;
  }
  return `Step 4: Local blueprint · ${step}/${total} · ${micro}`;
}

function formatProposalParallelWaveProgressLine(
  competitorStep: number,
  competitorLabel: string | null,
  localStep: number,
  localLabel: string | null,
  cTotal: number,
  lTotal: number,
): string {
  const cMicro = competitorLabel ?? "…";
  const lMicro = localLabel ?? "…";
  const cPart =
    competitorStep <= 0
      ? `Competitor · 0/${cTotal} · ${cMicro}`
      : `Competitor · ${competitorStep}/${cTotal} · ${cMicro}`;
  const lPart =
    localStep <= 0
      ? `Local blueprint · 0/${lTotal} · ${lMicro}`
      : `Local blueprint · ${localStep}/${lTotal} · ${lMicro}`;
  return `Steps 2–4 (parallel) · ${cPart} · ${lPart} · Entity SAP (same window)`;
}

export function getProposalProgressStatusLine(args: {
  phase: ProposalProgressPhase;
  proposalSubphase: ProposalProgressSubphase;
  competitorPipelineStep: number;
  competitorPipelineLabel: string | null;
  localPipelineStep: number;
  localPipelineLabel: string | null;
  reportMicroLabel: string | null;
}): string | null {
  if (args.phase === "idle") return null;
  if (args.phase === "semrush") {
    return args.reportMicroLabel ?? "Running local analysis…";
  }
  if (args.proposalSubphase === "parallel") {
    return formatProposalParallelWaveProgressLine(
      args.competitorPipelineStep,
      args.competitorPipelineLabel,
      args.localPipelineStep,
      args.localPipelineLabel,
      REPORT_PIPELINE_MICRO_TOTAL,
      LOCAL_STRATEGY_REPORT_MICRO_TOTAL,
    );
  }
  if (args.proposalSubphase === "competitor") {
    return formatProposalCompetitorReportProgressLine(
      args.competitorPipelineStep,
      args.competitorPipelineLabel,
      REPORT_PIPELINE_MICRO_TOTAL,
    );
  }
  if (args.proposalSubphase === "local") {
    return formatProposalLocalBlueprintProgressLine(
      args.localPipelineStep,
      args.localPipelineLabel,
      LOCAL_STRATEGY_REPORT_MICRO_TOTAL,
    );
  }
  if (args.proposalSubphase === "sap") {
    return args.reportMicroLabel ?? "Step 2: Entity SAP (grid CSV)…";
  }
  return args.reportMicroLabel?.trim() || "…";
}

export function buildProposalMicroSnapshot(args: {
  phase: ProposalProgressPhase;
  proposalSubphase: ProposalProgressSubphase;
  competitorPipelineStep: number;
  competitorPipelineLabel: string | null;
  localPipelineStep: number;
  localPipelineLabel: string | null;
  reportMicroLabel: string | null;
  reportProgressPct: number;
}): MetaBulkMicroSnapshot | null {
  const statusMessage = getProposalProgressStatusLine(args);
  if (!statusMessage) return null;

  if (args.phase === "semrush") {
    return {
      label: PROPOSAL_LABEL,
      completed: 0,
      total: 1,
      statusMessage,
    };
  }

  const progressPct = Math.min(100, Math.max(0, Math.round(args.reportProgressPct)));
  return {
    label: PROPOSAL_LABEL,
    completed: progressPct,
    total: 100,
    statusMessage,
    progressPct: progressPct > 0 ? progressPct : undefined,
  };
}
