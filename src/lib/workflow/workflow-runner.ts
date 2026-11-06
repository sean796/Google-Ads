import type { AgentRun } from "@/lib/agent-runs-types";
import {
  ackPendingWorkflowTrigger,
  claimPendingWorkflowDispatch,
  patchWorkflowRun,
} from "@/lib/workflow/workflow-api";
import { clearParallelWorkflowChains } from "@/lib/workflow/workflow-parallel-completion";
import { readWorkflowAgentBinding } from "@/lib/workflow/workflow-agent-binding";
import type { WorkflowRunCallbacks } from "@/lib/workflow/workflow-run-callbacks";
import { executeWorkflowRun } from "@/lib/workflow/workflow-runner-execute";
import {
  markWorkflowRunFinished,
  workflowDispatchKey,
  workflowDispatchPromises,
} from "@/lib/workflow/workflow-runner-state";

export { workflowActionStartsFromCompiledTask } from "@/lib/workflow/workflow-step-dispatch";
export type { WorkflowAgentBinding, WorkflowRunCallbacks } from "@/lib/workflow/workflow-run-callbacks";
export { runNextWorkflowAgentStep } from "@/lib/workflow/workflow-runner-next-step";
export { executeWorkflowRun } from "@/lib/workflow/workflow-runner-execute";

export async function cancelWorkflowRunForAgentRun(
  teamId: number,
  agentRun: AgentRun,
): Promise<void> {
  const binding = readWorkflowAgentBinding(agentRun);
  if (!binding) return;
  clearParallelWorkflowChains(teamId, binding.workflowId, binding.workflowRunId);
  markWorkflowRunFinished(teamId, binding.workflowId, binding.workflowRunId);
  await ackPendingWorkflowTrigger(teamId, binding.workflowId);
  await patchWorkflowRun(teamId, binding.workflowId, binding.workflowRunId, {
    status: "cancelled",
    errorMessage: "Cancelled",
    currentNodeId: null,
  });
}

export async function failWorkflowRunForAgentRun(
  teamId: number,
  agentRun: AgentRun,
  errorMessage: string,
): Promise<void> {
  const binding = readWorkflowAgentBinding(agentRun);
  if (!binding) return;
  clearParallelWorkflowChains(teamId, binding.workflowId, binding.workflowRunId);
  markWorkflowRunFinished(teamId, binding.workflowId, binding.workflowRunId);
  await ackPendingWorkflowTrigger(teamId, binding.workflowId);
  await patchWorkflowRun(teamId, binding.workflowId, binding.workflowRunId, {
    status: "failed",
    errorMessage: errorMessage.trim() || "Agent run failed",
    currentNodeId: null,
  });
}

export async function dispatchWorkflowRunExecution(
  teamId: number,
  workflowId: number,
  runId: number,
  callbacks: WorkflowRunCallbacks,
): Promise<{ ok: boolean; error?: string; deferWorkflowCompletion?: boolean }> {
  const dispatchKey = workflowDispatchKey(teamId, workflowId, runId);
  const inFlight = workflowDispatchPromises.get(dispatchKey);
  if (inFlight) return inFlight;

  const promise = executeWorkflowRun(teamId, workflowId, runId, callbacks).finally(() => {
    workflowDispatchPromises.delete(dispatchKey);
  });
  workflowDispatchPromises.set(dispatchKey, promise);
  return promise;
}

export async function handlePendingWorkflowDispatch(
  teamId: number,
  workflowId: number,
  runId: number | undefined,
  callbacks: WorkflowRunCallbacks,
): Promise<{ ok: boolean; error?: string }> {
  if (!runId) {
    await ackPendingWorkflowTrigger(teamId, workflowId);
    return { ok: true };
  }

  const dispatchKey = workflowDispatchKey(teamId, workflowId, runId);
  const inFlight = workflowDispatchPromises.get(dispatchKey);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const claim = await claimPendingWorkflowDispatch(teamId, workflowId, runId);
      if (!claim.ok) {
        return { ok: false, error: claim.error ?? "Could not claim workflow dispatch" };
      }
      if (!claim.claimed) {
        return { ok: true };
      }
      const result = await executeWorkflowRun(teamId, workflowId, runId, callbacks);
      if (!result.deferWorkflowCompletion) {
        await ackPendingWorkflowTrigger(teamId, workflowId);
      }
      return result;
    } finally {
      workflowDispatchPromises.delete(dispatchKey);
    }
  })();
  workflowDispatchPromises.set(dispatchKey, promise);
  return promise;
}
