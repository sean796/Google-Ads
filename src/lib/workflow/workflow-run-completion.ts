import { linearOrderedNodes } from "@/lib/workflow/workflow-graph-mutations";
import { isGridCsvFileRef } from "@/lib/entity-page-creator/resolve-upstream-grid-csv";
import { parseGapCountFromContentGapText } from "@/lib/workflow/resolve-workflow-content-gap-post-count";
import {
  isWorkflowThenKind,
  type WorkflowActionConfig,
  type WorkflowDefinition,
  type WorkflowNode,
  type WorkflowStepOutput,
} from "@/lib/workflow/workflow-types";
import { fetchWorkflowRun, fetchWorkflowStepOutputs } from "@/lib/workflow/workflow-api";
import { fetchAgentRuns } from "@/lib/agent-runs-api";
import type { AgentRun } from "@/lib/agent-runs-types";
import { chainWorkflowAfterAgentComplete } from "@/lib/workflow/workflow-grid-export-chain";

function isExecutableWorkflowStep(node: Pick<WorkflowNode, "kind">): boolean {
  return node.kind === "action_agent" || node.kind === "csv_rows" || node.kind === "rag_archive" || isWorkflowThenKind(node.kind);
}

function isContentGapCheckNode(node: WorkflowNode): boolean {
  if (node.kind !== "action_agent") return false;
  return (node.config as WorkflowActionConfig | undefined)?.executionKind === "content_gap_check";
}

function isLocalDominatorExportNode(node: WorkflowNode): boolean {
  if (node.kind !== "action_agent") return false;
  return (node.config as WorkflowActionConfig | undefined)?.executionKind === "local_dominator_export";
}

/** True when a content gap check output shows the target is met (zero posts needed). */
export function isContentGapGoalMetFromPreview(textPreview: string | undefined): boolean {
  if (!textPreview?.trim()) return false;
  return parseGapCountFromContentGapText(textPreview) === 0;
}

/** True when every content-gap output for this node shows the target is met. */
function contentGapCheckOutputSatisfied(
  node: WorkflowNode,
  outputs: WorkflowStepOutput[],
): boolean {
  if (!isContentGapCheckNode(node)) return false;
  const gapOutputs = outputs.filter(
    (output) => output.nodeId === node.id && output.scope === "run",
  );
  if (gapOutputs.length === 0) return false;
  return gapOutputs.every((output) => isContentGapGoalMetFromPreview(output.textPreview));
}

/**
 * Run-scoped output that means this step is finished enough to advance.
 * Local Dominator only counts once a grid CSV file ref exists (empty placeholders must not skip the node).
 */
export function workflowNodeHasReadyRunOutput(
  node: WorkflowNode,
  outputs: WorkflowStepOutput[],
): boolean {
  const nodeOutputs = outputs.filter(
    (output) => output.nodeId === node.id && output.scope === "run",
  );
  if (nodeOutputs.length === 0) return false;
  if (isLocalDominatorExportNode(node)) {
    return nodeOutputs.some((output) =>
      (output.fileRefs ?? []).some((file) => Boolean(file.url) && isGridCsvFileRef(file)),
    );
  }
  return true;
}

/** True while any configured agent, Then, or RAG step lacks a ready run-scoped output. */
export function hasIncompleteWorkflowSteps(
  workflow: Pick<WorkflowDefinition, "nodes" | "edges">,
  outputs: WorkflowStepOutput[],
): boolean {
  for (const node of linearOrderedNodes(workflow)) {
    if (!isExecutableWorkflowStep(node)) continue;
    if (!workflowNodeHasReadyRunOutput(node, outputs)) return true;
    // Gap covered: later agents (post creator, etc.) must not run.
    if (contentGapCheckOutputSatisfied(node, outputs)) return false;
  }
  return false;
}

export function missingWorkflowStepNodeIds(
  workflow: Pick<WorkflowDefinition, "nodes" | "edges">,
  outputs: WorkflowStepOutput[],
): string[] {
  const missing: string[] = [];
  for (const node of linearOrderedNodes(workflow)) {
    if (!isExecutableWorkflowStep(node)) continue;
    if (!workflowNodeHasReadyRunOutput(node, outputs)) {
      missing.push(node.id);
      continue;
    }
    if (contentGapCheckOutputSatisfied(node, outputs)) break;
  }
  return missing;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function workflowRunHasActiveAgent(
  agentRuns: AgentRun[],
  workflowId: number,
  runId: number,
): boolean {
  return agentRuns.some((agentRun) => {
    if (agentRun.status !== "queued" && agentRun.status !== "running") return false;
    const ctxWorkflowId = Number(agentRun.context?.workflowId ?? agentRun.plan?.workflowId ?? 0);
    const ctxRunId = Number(agentRun.context?.workflowRunId ?? agentRun.plan?.workflowRunId ?? 0);
    return ctxWorkflowId === workflowId && ctxRunId === runId;
  });
}

/** Wait until all executable workflow steps have run-scoped outputs; re-dispatch only when deferred and no agent is active. */
export async function pollWorkflowRunUntilComplete(args: {
  teamId: number;
  workflowId: number;
  runId: number;
  workflow: WorkflowDefinition;
  dispatch: () => Promise<{ ok: boolean; error?: string; deferWorkflowCompletion?: boolean }>;
  pollMs?: number;
  timeoutMs?: number;
}): Promise<{ ok: boolean; error?: string; outputs: WorkflowStepOutput[] }> {
  const pollMs = args.pollMs ?? 2_000;
  const timeoutMs = args.timeoutMs ?? 12 * 60 * 1_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const run = await fetchWorkflowRun(args.teamId, args.workflowId, args.runId);
    const outputs = await fetchWorkflowStepOutputs(args.teamId, args.workflowId, args.runId);

    if (run?.status === "failed") {
      return {
        ok: false,
        error: run.errorMessage?.trim() || "Workflow run failed",
        outputs,
      };
    }

    const incomplete = hasIncompleteWorkflowSteps(args.workflow, outputs);
    if (run?.status === "done" && !incomplete) {
      return { ok: true, outputs };
    }

    const agentRuns = await fetchAgentRuns(args.teamId);
    const doneAgents = agentRuns.filter((agentRun) => {
      if (agentRun.status !== "done") return false;
      const ctxWorkflowId = Number(agentRun.context?.workflowId ?? agentRun.plan?.workflowId ?? 0);
      const ctxRunId = Number(agentRun.context?.workflowRunId ?? agentRun.plan?.workflowRunId ?? 0);
      return ctxWorkflowId === args.workflowId && ctxRunId === args.runId;
    });
    for (const agentRun of doneAgents) {
      await chainWorkflowAfterAgentComplete(agentRun).catch(() => {});
    }

    const hasActiveAgent = workflowRunHasActiveAgent(agentRuns, args.workflowId, args.runId);
    if (!hasActiveAgent && (run?.status === "running" || incomplete)) {
      await args.dispatch();
    }

    await sleep(pollMs);
  }

  const outputs = await fetchWorkflowStepOutputs(args.teamId, args.workflowId, args.runId);
  const missing = missingWorkflowStepNodeIds(args.workflow, outputs);
  const missingLabels = missing
    .map((nodeId) => args.workflow.nodes.find((node) => node.id === nodeId)?.label ?? nodeId)
    .join(", ");
  return {
    ok: false,
    error: missing.length > 0
      ? `Workflow timed out before steps completed: ${missingLabels}`
      : "Workflow run timed out",
    outputs,
  };
}
