import {
  isAgentRunCancelledLocally,
  markAgentRunCancelledLocally,
} from "@/lib/agent-runs/executor";
import type { AgentRun, StartAgentRunPayload } from "@/lib/agent-runs-types";
import { isAgentRunTerminal } from "@/lib/agent-runs-types";

export type StartRunOptions = {
  openSidebar?: boolean;
  workflowBinding?: {
    workflowId: number;
    workflowRunId: number;
    workflowNodeId: string;
    ragVariableKey?: string;
    workflowThenDelivery?: boolean;
  };
};

export function applyWorkflowBinding(
  payload: StartAgentRunPayload,
  binding: StartRunOptions["workflowBinding"],
): StartAgentRunPayload {
  if (!binding) return payload;
  return {
    ...payload,
    source: "workflow",
    context: {
      ...payload.context,
      workflowId: binding.workflowId,
      workflowRunId: binding.workflowRunId,
      workflowNodeId: binding.workflowNodeId,
    },
    plan: {
      ...payload.plan,
      workflowId: binding.workflowId,
      workflowRunId: binding.workflowRunId,
      workflowNodeId: binding.workflowNodeId,
      ragVariableKey: binding.ragVariableKey,
      workflowThenDelivery: binding.workflowThenDelivery === true,
    },
  };
}

export function applyCancelledRunState(run: AgentRun, teamId: number): AgentRun {
  if (run.status === "cancelled" || isAgentRunCancelledLocally(run.id, teamId)) {
    if (run.status === "cancelled") {
      markAgentRunCancelledLocally(run.id, teamId);
    }
    return {
      ...run,
      status: "cancelled",
      errorMessage: run.errorMessage?.trim() || "Cancelled",
    };
  }
  return run;
}

function agentRunListRowStable(existing: AgentRun, incoming: AgentRun): boolean {
  return (
    existing.status === incoming.status &&
    existing.errorMessage === incoming.errorMessage &&
    existing.title === incoming.title &&
    existing.result?.updated === incoming.result?.updated
  );
}

export function mergeAgentRunListRow(existing: AgentRun, incoming: AgentRun): AgentRun {
  if (agentRunListRowStable(existing, incoming)) {
    return existing;
  }
  if (!isAgentRunTerminal(existing.status) && existing.status === incoming.status) {
    return {
      ...incoming,
      result: existing.result ?? incoming.result,
      steps:
        (existing.steps?.length ?? 0) >= (incoming.steps?.length ?? 0)
          ? existing.steps
          : incoming.steps,
      errorMessage: existing.errorMessage || incoming.errorMessage,
    };
  }
  return incoming;
}
