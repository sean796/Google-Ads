import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";

export type CompetitorHarnessStepId =
  | "ScanSitemap"
  | "ExtractMeta"
  | "BuildComparison"
  | "WriteCsvRow";

export type CompetitorHarnessStepStatus = "waiting" | "generating" | "done" | "skipped";

export type CompetitorHarnessStep = {
  id: CompetitorHarnessStepId;
  label: string;
  status: CompetitorHarnessStepStatus;
  detail?: string;
};

export type CompetitorComparisonHarnessGroup = {
  competitorKey: string;
  competitorName: string;
  domain: string | null;
  status: "waiting" | "generating" | "done" | "skipped";
  steps: CompetitorHarnessStep[];
  generatedTitle?: string;
};

export const COMPETITOR_HARNESS_STEP_LABELS: Record<CompetitorHarnessStepId, string> = {
  ScanSitemap: "Google SERP query",
  ExtractMeta: "Extract SERP snippets",
  BuildComparison: "Build comparison",
  WriteCsvRow: "Write CSV row",
};

export function buildCompetitorHarnessGroups(
  competitorNames: string[],
): CompetitorComparisonHarnessGroup[] {
  return competitorNames.map((name, i) => ({
    competitorKey: `competitor-${i}-${name.slice(0, 40).replace(/\s+/g, "-").toLowerCase()}`,
    competitorName: name,
    domain: null,
    status: "waiting" as const,
    steps: (Object.keys(COMPETITOR_HARNESS_STEP_LABELS) as CompetitorHarnessStepId[]).map((id) => ({
      id,
      label: COMPETITOR_HARNESS_STEP_LABELS[id],
      status: "waiting" as const,
    })),
  }));
}

export function applyCompetitorHarnessStep(
  groups: CompetitorComparisonHarnessGroup[],
  competitorKey: string,
  stepId: CompetitorHarnessStepId,
  patch: Partial<Pick<CompetitorHarnessStep, "status" | "detail">>,
): CompetitorComparisonHarnessGroup[] {
  return groups.map((group) => {
    if (group.competitorKey !== competitorKey) return group;
    const steps = group.steps.map((step) =>
      step.id === stepId ? { ...step, ...patch } : step,
    );
    const anyGenerating = steps.some((s) => s.status === "generating");
    const allDoneOrSkipped = steps.every((s) => s.status === "done" || s.status === "skipped");
    const allSkipped = steps.every((s) => s.status === "skipped");
    let status = group.status;
    if (allSkipped) status = "skipped";
    else if (allDoneOrSkipped) status = "done";
    else if (anyGenerating) status = "generating";
    return { ...group, steps, status };
  });
}

export function setCompetitorHarnessDomain(
  groups: CompetitorComparisonHarnessGroup[],
  competitorKey: string,
  domain: string | null,
): CompetitorComparisonHarnessGroup[] {
  return groups.map((group) =>
    group.competitorKey === competitorKey ? { ...group, domain } : group,
  );
}

export function setCompetitorHarnessTitle(
  groups: CompetitorComparisonHarnessGroup[],
  competitorKey: string,
  title: string,
): CompetitorComparisonHarnessGroup[] {
  return groups.map((group) =>
    group.competitorKey === competitorKey ? { ...group, generatedTitle: title } : group,
  );
}

export function countCompetitorHarnessSteps(groups: CompetitorComparisonHarnessGroup[]): {
  done: number;
  total: number;
} {
  let done = 0;
  let total = 0;
  for (const group of groups) {
    for (const step of group.steps) {
      total += 1;
      if (step.status === "done" || step.status === "skipped") done += 1;
    }
  }
  return { done, total };
}

export function buildCompetitorMicroSnapshot(args: {
  phase: string;
  harnessGroups: CompetitorComparisonHarnessGroup[];
}): MetaBulkMicroSnapshot | null {
  const phase = args.phase.trim();
  if (!phase) return null;
  const { done, total } = countCompetitorHarnessSteps(args.harnessGroups);
  const stepTotal = Math.max(total, 1);
  const progressPct = Math.min(100, Math.round((done / stepTotal) * 100));
  return {
    label: "Competitor generation",
    completed: done,
    total: stepTotal,
    progressPct,
    statusMessage: phase,
  };
}
