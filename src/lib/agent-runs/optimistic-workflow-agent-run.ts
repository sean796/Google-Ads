import { agentRunSiteId } from "@/lib/agent-runs/agent-run-batch-key";
import type { AgentRun } from "@/lib/agent-runs-types";

export function createOptimisticWorkflowAgentRun(input: {
  teamId: number;
  title: string;
  siteId?: string;
  id?: number;
}): AgentRun {
  const now = new Date().toISOString();
  const title = input.title.trim() || "Full AISEO";
  return {
    id: input.id ?? -Date.now(),
    teamId: input.teamId,
    createdBy: 0,
    title,
    recipeKey: "content_optimizer_bulk",
    recipeTitle: title,
    status: "running",
    source: "workflow",
    taskId: 0,
    taskTitle: title,
    context: input.siteId ? { siteId: input.siteId } : {},
    plan: {},
    result: {
      checkpoint: {
        completedUrls: [],
        uploadedUrls: [],
        lastMessage: "Starting…",
        lastStepLabel: "Starting…",
      },
    },
    errorMessage: "",
    clientBatchKey: "",
    startedAt: now,
    finishedAt: null,
    createdAt: now,
    updatedAt: now,
    steps: [
      {
        id: 0,
        stepIndex: 0,
        stepKey: "starting",
        label: "Starting…",
        status: "running",
        createdAt: now,
      },
    ],
  };
}

/** Keep other clients' Starting rows when one real run arrives. */
export function retainSiblingOptimisticAgentRuns(prev: AgentRun[], incoming: AgentRun): AgentRun[] {
  const incomingSite = agentRunSiteId(incoming);
  let droppedUnscoped = false;
  return prev.filter((run) => {
    if (run.id > 0) return true;
    const optimisticSite = agentRunSiteId(run);
    if (incomingSite && optimisticSite === incomingSite) return false;
    if (!incomingSite && !droppedUnscoped) {
      droppedUnscoped = true;
      return false;
    }
    return true;
  });
}

export function applyOptimisticWorkflowAgentProgress(
  prev: AgentRun[],
  message: string,
  siteId?: string,
): AgentRun[] {
  const target = siteId?.trim() ?? "";
  return prev.map((run) => {
    if (run.id >= 0) return run;
    if (target && agentRunSiteId(run) !== target) return run;
    return {
      ...run,
      result: {
        checkpoint: {
          completedUrls: [],
          uploadedUrls: [],
          lastMessage: message,
          lastStepLabel: message,
        },
      },
      steps: [
        {
          id: 0,
          stepIndex: 0,
          stepKey: "starting",
          label: message,
          status: "running",
          createdAt: run.steps?.[0]?.createdAt ?? run.createdAt,
        },
      ],
    };
  });
}
