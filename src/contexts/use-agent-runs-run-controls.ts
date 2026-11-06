import { useCallback, type Dispatch, type SetStateAction } from "react";
import { cancelWorkflowRunForAgentRun } from "@/lib/workflow/workflow-runner";
import { ackPendingWorkflowTrigger, fetchPendingWorkflowTriggers } from "@/lib/workflow/workflow-api";
import {
  cancelAllRegisteredLocalDominatorExportJobs,
  cancelLocalDominatorExportJobForAgentRun,
} from "@/lib/local-dominator/local-dominator-export-job-registry";
import {
  cancelAgentRun,
  clearAgentRuns,
  fetchAgentRuns,
  patchAgentRun,
} from "@/lib/agent-runs-api";
import { agentRunHasResumeProgress } from "@/lib/agent-runs/agent-run-resume";
import { agentRunIsServerExecution } from "@/lib/agent-runs/agent-run-display";
import {
  clearClientRunAttempted,
  markAgentRunCancelledLocally,
  markAgentRunsCancelledLocally,
  clearLocalAgentRunCancellations,
} from "@/lib/agent-runs/executor";
import { isAgentRunTerminal } from "@/lib/agent-runs-types";
import type { AgentRun } from "@/lib/agent-runs-types";
import type { AgentRunListPatch } from "@/lib/agent-runs/agent-runs-local-patch";
import { cancelTaskExecution, reopenTaskExecutionForResume } from "@/lib/tasks-api";
import {
  advanceServerAgentRun,
  warmInventoryForServerPostCreatorRun,
} from "@/lib/agent-runs/run-server-post-creator-upload";
import { applyCancelledRunState } from "@/contexts/agent-runs-provider-helpers";
import type { useWordPressSites } from "@/hooks/use-wordpress-sites";

type UseAgentRunsRunControlsParams = {
  teamId: number | null;
  runs: AgentRun[];
  runsRef: { current: AgentRun[] };
  sites: ReturnType<typeof useWordPressSites>["sites"];
  patchRunInList: (runId: number, patch: AgentRunListPatch) => void;
  kickClientAgentRuns: (candidates: AgentRun[]) => void;
  refreshRuns: () => Promise<void>;
  setRuns: Dispatch<SetStateAction<AgentRun[]>>;
  setSelectedRunId: Dispatch<SetStateAction<number | null>>;
};

export function useAgentRunsRunControls({
  teamId,
  runs,
  runsRef,
  sites,
  patchRunInList,
  kickClientAgentRuns,
  refreshRuns,
  setRuns,
  setSelectedRunId,
}: UseAgentRunsRunControlsParams) {
  const cancelRun = useCallback(
    async (runId: number) => {
      if (!teamId) return;
      if (runId < 0) {
        setRuns((prev) => prev.filter((run) => run.id !== runId));
        return;
      }
      const existing = runsRef.current.find((run) => run.id === runId);
      markAgentRunCancelledLocally(runId, teamId);
      patchRunInList(runId, { status: "cancelled", errorMessage: "Cancelled" });
      void cancelLocalDominatorExportJobForAgentRun(runId);
      if (existing) {
        void cancelWorkflowRunForAgentRun(teamId, existing);
      }
      const executionId = existing?.plan?.taskExecutionId;
      if (executionId) {
        void cancelTaskExecution(teamId, executionId);
      }
      const result = await cancelAgentRun(teamId, runId);
      if (result.ok && result.run) {
        patchRunInList(runId, applyCancelledRunState(result.run, teamId));
      }
    },
    [patchRunInList, runsRef, setRuns, teamId],
  );

  const resumeRun = useCallback(
    async (runId: number) => {
      if (!teamId) return;
      const existing = runs.find((r) => r.id === runId);
      if (existing && agentRunIsServerExecution(existing)) {
        let active = existing;
        if (active.status === "failed" || active.status === "cancelled") {
          const requeued = await patchAgentRun(teamId, runId, {
            status: "running",
            errorMessage: "",
          });
          if (requeued.ok && requeued.run) {
            active = requeued.run;
            patchRunInList(runId, active);
          }
        }
        await warmInventoryForServerPostCreatorRun(active, sites);
        const latest = await advanceServerAgentRun(teamId, active, sites);
        patchRunInList(runId, latest);
        return;
      }
      const executionId = existing?.plan?.taskExecutionId;
      if (executionId && existing && agentRunHasResumeProgress(existing)) {
        await reopenTaskExecutionForResume(teamId, executionId);
      }
      const result = await patchAgentRun(teamId, runId, {
        status: "queued",
        errorMessage: "",
        step: { label: "Queued for resume", status: "pending" },
      });
      if (result.ok && result.run) {
        clearClientRunAttempted(runId);
        patchRunInList(runId, result.run);
        kickClientAgentRuns([result.run]);
      }
    },
    [kickClientAgentRuns, patchRunInList, runs, sites, teamId],
  );

  const clearHistory = useCallback(async () => {
    if (!teamId) return;
    const list = runs.length > 0 ? runs : await fetchAgentRuns(teamId);
    const active = list.filter((run) => !isAgentRunTerminal(run.status));
    markAgentRunsCancelledLocally(list.map((run) => run.id), teamId);
    setSelectedRunId(null);
    setRuns([]);
    try {
      await cancelAllRegisteredLocalDominatorExportJobs();
      const pending = await fetchPendingWorkflowTriggers(teamId);
      await Promise.all(
        pending.map((item) => ackPendingWorkflowTrigger(teamId, item.workflowId)),
      );
      await Promise.all(active.map((run) => cancelWorkflowRunForAgentRun(teamId, run)));
      await Promise.all(active.map((run) => cancelAgentRun(teamId, run.id)));
      await clearAgentRuns(teamId);
    } finally {
      clearLocalAgentRunCancellations(teamId);
    }
  }, [runs, setRuns, setSelectedRunId, teamId]);

  const cancelActiveRuns = useCallback(async () => {
    if (!teamId) return;
    const list = runs.length > 0 ? runs : await fetchAgentRuns(teamId);
    const active = list.filter((run) => !isAgentRunTerminal(run.status));
    if (active.length === 0) return;
    markAgentRunsCancelledLocally(active.map((run) => run.id), teamId);
    for (const run of active) {
      patchRunInList(run.id, { status: "cancelled", errorMessage: "Cancelled" });
      void cancelLocalDominatorExportJobForAgentRun(run.id);
      void cancelWorkflowRunForAgentRun(teamId, run);
      const executionId = run.plan?.taskExecutionId;
      if (executionId) {
        void cancelTaskExecution(teamId, executionId);
      }
    }
    try {
      await cancelAllRegisteredLocalDominatorExportJobs();
      await Promise.all(active.map((run) => cancelAgentRun(teamId, run.id)));
    } finally {
      clearLocalAgentRunCancellations(teamId);
      void refreshRuns();
    }
  }, [patchRunInList, refreshRuns, runs, teamId]);

  return {
    cancelRun,
    resumeRun,
    clearHistory,
    cancelActiveRuns,
  };
}
