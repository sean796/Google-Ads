import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import { usePulseTaskScheduleRunner } from "@/hooks/use-pulse-task-schedule-runner";
import { usePulseTaskTriggerRunner } from "@/hooks/use-pulse-task-trigger-runner";
import { useWorkflowTriggerRunner } from "@/hooks/use-workflow-trigger-runner";
import { useWorkflowLdContinueWatchdog } from "@/hooks/use-workflow-ld-continue-watchdog";
import { dispatchWorkflowRunExecution } from "@/lib/workflow/workflow-runner";
import { registerWorkflowGridExportChain } from "@/lib/workflow/workflow-grid-export-chain";
import { tryContinueWorkflowAfterAgentComplete } from "@/lib/workflow/workflow-ld-continue-watchdog";
import { listWorkflowAvailableSiteIds } from "@/lib/workflow/workflow-available-sites";
import {
  AGENT_RUNS_ALL_SITES_ID,
  isAgentsAllSitesFilter,
  resolveDefaultAgentsSiteFilter,
} from "@/lib/agent-runs/agent-runs-site-filter";
import type { AgentRun, StartAgentRunPayload } from "@/lib/agent-runs-types";
import type { TeamTask } from "@/lib/tasks-types";
import type { TeamMember } from "@/lib/teams-types";
import type { StartRunOptions } from "@/contexts/agent-runs-provider-helpers";

type UseAgentRunsWorkflowDispatchParams = {
  teamId: number | null;
  activeWordPressSiteId: string | null;
  agentsSiteIds: string[];
  setAgentsSiteFilterState: Dispatch<SetStateAction<string>>;
  refreshRuns: () => Promise<void>;
  refreshTasksWorkspace: () => Promise<void>;
  myTasks: TeamTask[];
  members: TeamMember[];
  patchOptimisticWorkflowAgentProgress: (message: string, siteId?: string) => void;
  mapStartRunResult: (
    result: { ok: boolean; run?: AgentRun; error?: string },
  ) => { ok: boolean; run?: { id: number; status: AgentRun["status"]; result?: Record<string, unknown> }; error?: string };
  startRun: (
    payload: StartAgentRunPayload,
    options?: StartRunOptions,
  ) => Promise<{ ok: boolean; run?: AgentRun; error?: string }>;
  startRunForWorkflow: (
    payload: StartAgentRunPayload,
    options?: StartRunOptions,
  ) => Promise<{ ok: boolean; run?: { id: number; status: AgentRun["status"]; result?: Record<string, unknown> }; error?: string }>;
  startRunFromTask: (
    task: TeamTask,
    options?: StartRunOptions,
  ) => Promise<{ ok: boolean; run?: AgentRun; error?: string }>;
  startRunFromTaskForWorkflow: (
    task: TeamTask,
    options?: StartRunOptions,
  ) => Promise<{ ok: boolean; run?: { id: number; status: AgentRun["status"]; result?: Record<string, unknown> }; error?: string }>;
  runs: AgentRun[];
};

export function useAgentRunsWorkflowDispatch({
  teamId,
  activeWordPressSiteId,
  agentsSiteIds,
  setAgentsSiteFilterState,
  refreshRuns,
  refreshTasksWorkspace,
  myTasks,
  members,
  patchOptimisticWorkflowAgentProgress,
  mapStartRunResult,
  startRun,
  startRunForWorkflow,
  startRunFromTask,
  startRunFromTaskForWorkflow,
  runs,
}: UseAgentRunsWorkflowDispatchParams) {
  const workflowDispatchCallbacks = useMemo(
    () => ({
      startRun: async (payload: StartAgentRunPayload, options?: StartRunOptions) =>
        mapStartRunResult(await startRun(payload, options)),
      startRunAndWait: startRunForWorkflow,
      startRunFromTask: async (task: TeamTask, options?: StartRunOptions) =>
        mapStartRunResult(await startRunFromTask(task, options)),
      startRunFromTaskAndWait: startRunFromTaskForWorkflow,
      listAvailableSiteIds: listWorkflowAvailableSiteIds,
      onClientProgress: patchOptimisticWorkflowAgentProgress,
    }),
    [
      mapStartRunResult,
      patchOptimisticWorkflowAgentProgress,
      startRun,
      startRunForWorkflow,
      startRunFromTask,
      startRunFromTaskForWorkflow,
    ],
  );

  const workflowChainRef = useRef({
    teamId: null as number | null,
    callbacks: workflowDispatchCallbacks,
    refreshRuns,
    openAgentSidebar: false,
  });
  workflowChainRef.current = {
    teamId,
    callbacks: workflowDispatchCallbacks,
    refreshRuns,
    openAgentSidebar: workflowChainRef.current.openAgentSidebar,
  };

  const dispatchWorkflowRun = useCallback(
    async (
      workflowId: number,
      runId: number,
      options?: {
        openAgentSidebar?: boolean;
        stopAfterNodeId?: string;
        clientSiteId?: string;
        skipSetupSteps?: boolean;
      },
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!teamId) return { ok: false, error: "No active team." };
      workflowChainRef.current.openAgentSidebar = options?.openAgentSidebar === true;
      if (options?.openAgentSidebar) {
        const clientSiteId = options.clientSiteId?.trim();
        setAgentsSiteFilterState(
          isAgentsAllSitesFilter(clientSiteId ?? "")
            ? AGENT_RUNS_ALL_SITES_ID
            : clientSiteId && agentsSiteIds.includes(clientSiteId)
              ? clientSiteId
              : resolveDefaultAgentsSiteFilter(activeWordPressSiteId, agentsSiteIds),
        );
      }
      const callbacks = {
        ...(options?.openAgentSidebar
          ? { ...workflowDispatchCallbacks, openAgentSidebar: true }
          : workflowDispatchCallbacks),
        ...(options?.stopAfterNodeId ? { stopAfterNodeId: options.stopAfterNodeId } : {}),
        ...(options?.skipSetupSteps ? { skipSetupSteps: true } : {}),
      };
      try {
        return await dispatchWorkflowRunExecution(teamId, workflowId, runId, callbacks);
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Workflow dispatch failed.",
        };
      } finally {
        await refreshRuns();
      }
    },
    [
      activeWordPressSiteId,
      agentsSiteIds,
      refreshRuns,
      setAgentsSiteFilterState,
      teamId,
      workflowDispatchCallbacks,
    ],
  );

  usePulseTaskScheduleRunner({
    teamId,
    myTasks,
    members,
    activeWordPressSiteId,
    startRunFromTask,
    onScheduledRun: () => {
      void refreshTasksWorkspace();
      void refreshRuns();
    },
  });

  usePulseTaskTriggerRunner({
    teamId,
    activeWordPressSiteId,
    startRunFromTask,
    onTriggerRun: () => {
      void refreshTasksWorkspace();
      void refreshRuns();
    },
  });

  useWorkflowTriggerRunner({
    teamId,
    callbacks: workflowDispatchCallbacks,
    onWorkflowRun: () => {
      void refreshRuns();
    },
  });

  useWorkflowLdContinueWatchdog({
    teamId,
    runs,
    callbacks: workflowDispatchCallbacks,
    onContinued: () => {
      void refreshRuns();
    },
  });

  useEffect(() => {
    registerWorkflowGridExportChain(async (run, payload) => {
      const ctx = workflowChainRef.current;
      if (!ctx.teamId) {
        throw new Error("No active team for workflow grid export chain.");
      }
      const chainCallbacks = {
        startRun: ctx.callbacks.startRunAndWait ?? ctx.callbacks.startRun,
        startRunAndWait: ctx.callbacks.startRunAndWait,
        startRunFromTask: ctx.callbacks.startRunFromTaskAndWait ?? ctx.callbacks.startRunFromTask,
        startRunFromTaskAndWait: ctx.callbacks.startRunFromTaskAndWait,
        listAvailableSiteIds: ctx.callbacks.listAvailableSiteIds,
        openAgentSidebar: ctx.openAgentSidebar,
      };
      await tryContinueWorkflowAfterAgentComplete(ctx.teamId, run, chainCallbacks);
      void ctx.refreshRuns();
    });
    return () => registerWorkflowGridExportChain(null);
  }, []);

  return {
    dispatchWorkflowRun,
  };
}
