import {
  ackPendingWorkflowTrigger,
  patchWorkflowRun,
} from "@/lib/workflow/workflow-api";

export const workflowDispatchPromises = new Map<string, Promise<{ ok: boolean; error?: string }>>();
export const workflowRunsInProgress = new Set<string>();
export const workflowStepChainStarted = new Set<string>();

export function workflowDispatchKey(teamId: number, workflowId: number, runId: number): string {
  return `${teamId}:${workflowId}:${runId}`;
}

export function workflowRunInProgressKey(teamId: number, workflowId: number, runId: number): string {
  return workflowDispatchKey(teamId, workflowId, runId);
}

export function markWorkflowRunFinished(teamId: number, workflowId: number, runId: number): void {
  workflowRunsInProgress.delete(workflowRunInProgressKey(teamId, workflowId, runId));
}

export async function finishDeferredWorkflowRun(
  teamId: number,
  workflowId: number,
  runId: number,
  patch: { status: "done" | "failed"; errorMessage?: string | null },
): Promise<void> {
  await patchWorkflowRun(teamId, workflowId, runId, {
    status: patch.status,
    errorMessage: patch.errorMessage ?? null,
    currentNodeId: null,
  });
  markWorkflowRunFinished(teamId, workflowId, runId);
  await ackPendingWorkflowTrigger(teamId, workflowId);
}

export function workflowStepChainKey(workflowRunId: number, nodeId: string, agentRunId?: number): string {
  if (agentRunId != null && agentRunId > 0) {
    return `${workflowRunId}:${nodeId}:${agentRunId}`;
  }
  return `${workflowRunId}:${nodeId}`;
}

