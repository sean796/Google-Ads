/* @refresh reset */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AgentRunsContext } from "@/contexts/agent-runs-react-context";
import type { AgentRunsContextValue } from "@/contexts/agent-runs-context-value";
import { useTeam } from "@/contexts/TeamContext";
import { useActiveWordPressSite } from "@/contexts/active-wordpress-site-context";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { usePulseTaskScheduleRunner } from "@/hooks/use-pulse-task-schedule-runner";
import { usePulseTaskTriggerRunner } from "@/hooks/use-pulse-task-trigger-runner";
import { useWorkflowTriggerRunner } from "@/hooks/use-workflow-trigger-runner";
import { useWorkflowLdContinueWatchdog } from "@/hooks/use-workflow-ld-continue-watchdog";
import { handlePendingWorkflowDispatch, dispatchWorkflowRunExecution, cancelWorkflowRunForAgentRun } from "@/lib/workflow/workflow-runner";
import { registerWorkflowGridExportChain } from "@/lib/workflow/workflow-grid-export-chain";
import { tryContinueWorkflowAfterAgentComplete } from "@/lib/workflow/workflow-ld-continue-watchdog";
import { listWorkflowAvailableSiteIds } from "@/lib/workflow/workflow-available-sites";
import { ackPendingWorkflowTrigger, fetchPendingWorkflowTriggers } from "@/lib/workflow/workflow-api";
import {
  cancelAllRegisteredLocalDominatorExportJobs,
  cancelLocalDominatorExportJobForAgentRun,
} from "@/lib/local-dominator/local-dominator-export-job-registry";
import {
  createAgentRun,
  cancelAgentRun,
  clearAgentRuns,
  fetchAgentRun,
  fetchAgentRuns,
  patchAgentRun,
} from "@/lib/agent-runs-api";
import { agentRunSiteId, buildAgentRunBatchKey } from "@/lib/agent-runs/agent-run-batch-key";
import { pinAgentRunSiteId } from "@/lib/agent-runs/resolve-agent-run-site";
import {
  applyOptimisticWorkflowAgentProgress,
  createOptimisticWorkflowAgentRun,
  retainSiblingOptimisticAgentRuns,
} from "@/lib/agent-runs/optimistic-workflow-agent-run";
import {
  AGENT_RUNS_ALL_SITES_ID,
  isAgentsAllSitesFilter,
  resolveDefaultAgentsSiteFilter,
} from "@/lib/agent-runs/agent-runs-site-filter";
import { flushAllAgentRunCheckpointPatches } from "@/lib/agent-runs/agent-run-checkpoint";
import { agentRunHasResumeProgress } from "@/lib/agent-runs/agent-run-resume";
import { agentRunIsServerExecution } from "@/lib/agent-runs/agent-run-display";
import {
  executeAgentRun,
  clearClientRunAttempted,
  hasClientRunAttempted,
  hasTerminalRuns,
  hydrateAgentRunCancellationsForTeam,
  isAgentRunActive,
  isAgentRunInflight,
  markAgentRunCancelledLocally,
  markAgentRunsCancelledLocally,
  clearLocalAgentRunCancellations,
  isAgentRunCancelledLocally,
  waitForAgentRunInflight,
} from "@/lib/agent-runs/executor";
import { registerAgentRunListPatcher, type AgentRunListPatch } from "@/lib/agent-runs/agent-runs-local-patch";
import { isAgentRunInterrupted } from "@/lib/agent-runs/agent-run-checkpoint";
import type { AgentRun, AgentRunContext, StartAgentRunPayload } from "@/lib/agent-runs-types";
import { isAgentRunTerminal, resolveTaskExecuteSiteId, taskExecutionKindToRecipe } from "@/lib/agent-runs-types";
import { prepareTaskForAutomationExecute, resolveEffectiveExecutionKind } from "@/lib/task-automation-ui";
import { readCachedExecutionPayload } from "@/lib/forge-automation-plan-cache";
import { mergeExecutionPayloadForSave } from "@/lib/post-creator/post-creator-schedule-payload";
import { writeAgentRunsSidebarOpen } from "@/lib/agent-runs/storage";
import { writeSidebarOpen, writeSidebarPanel, type SidebarPanel } from "@/lib/pulse-assist/storage";
import { startTaskExecution, reopenTaskExecutionForResume, cancelTaskExecution } from "@/lib/tasks-api";
import {
  advanceServerAgentRun,
  warmInventoryForServerPostCreatorRun,
} from "@/lib/agent-runs/run-server-post-creator-upload";
import type { TaskExecutionPayload, TeamTask } from "@/lib/tasks-types";
import { rememberWorkflowAgentBinding } from "@/lib/workflow/workflow-agent-binding";
import { resolveWorkflowActionPayload } from "@/lib/workflow/resolve-workflow-action-payload";
type StartRunOptions = {
  openSidebar?: boolean;
  workflowBinding?: {
    workflowId: number;
    workflowRunId: number;
    workflowNodeId: string;
    ragVariableKey?: string;
    workflowThenDelivery?: boolean;
  };
};

function applyWorkflowBinding(
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

type AgentRunsContextProviderProps = {
  children: ReactNode;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  sidebarPanel: SidebarPanel;
  setSidebarPanel: (panel: SidebarPanel) => void;
};

function applyCancelledRunState(run: AgentRun, teamId: number): AgentRun {
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

function mergeAgentRunListRow(existing: AgentRun, incoming: AgentRun): AgentRun {
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

export function AgentRunsContextProvider({
  children,
  sidebarOpen,
  setSidebarOpen,
  sidebarPanel,
  setSidebarPanel,
}: AgentRunsContextProviderProps) {
  const { activeTeam, myTasks, members, refreshTasksWorkspace } = useTeam();
  const { activeWordPressSiteId } = useActiveWordPressSite();
  const teamId = activeTeam?.id ?? null;

  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const runsRef = useRef(runs);
  runsRef.current = runs;

  const { sites } = useWordPressSites();
  const agentsSiteIds = useMemo(() => sites.map((site) => site.id), [sites]);

  const kickClientAgentRuns = useCallback(
    (candidates: AgentRun[]) => {
      for (const run of candidates) {
        if (agentRunIsServerExecution(run)) continue;
        if (isAgentRunCancelledLocally(run.id, teamId ?? undefined)) continue;
        const stalledRunning =
          run.status === "running"
          && !isAgentRunInflight(run.id)
          && !isAgentRunActive(run.id)
          && agentRunHasResumeProgress(run);
        if (run.status !== "queued" && !stalledRunning) continue;
        if (hasClientRunAttempted(run.id) && !stalledRunning) continue;
        if (isAgentRunInflight(run.id)) continue;
        if (stalledRunning) {
          clearClientRunAttempted(run.id);
        }
        void executeAgentRun(run, sites);
      }
    },
    [sites, teamId],
  );
  const [agentsSiteFilter, setAgentsSiteFilterState] = useState<string>("");
  const setAgentsSiteFilter = useCallback((siteId: string) => {
    setAgentsSiteFilterState(siteId);
  }, []);

  useEffect(() => {
    setAgentsSiteFilterState(resolveDefaultAgentsSiteFilter(activeWordPressSiteId, agentsSiteIds));
  }, [activeWordPressSiteId, agentsSiteIds]);

  const refreshRuns = useCallback(async () => {
    if (!teamId) {
      setRuns([]);
      return;
    }
    const list = await fetchAgentRuns(teamId);
    const hydrated = await Promise.all(
      list.map(async (run) => {
        if (
          isAgentRunInterrupted(run) ||
          (!isAgentRunTerminal(run.status) && agentRunIsServerExecution(run))
        ) {
          const detail = await fetchAgentRun(teamId, run.id);
          return detail ?? run;
        }
        return run;
      }),
    );
    setRuns((prev) => {
      const prevById = new Map(prev.map((run) => [run.id, run]));
      const mergedById = new Map<number, AgentRun>();

      for (const incoming of hydrated) {
        const normalized = applyCancelledRunState(incoming, teamId);
        const existing = prevById.get(normalized.id);
        mergedById.set(
          normalized.id,
          existing ? mergeAgentRunListRow(existing, normalized) : normalized,
        );
      }

      for (const run of prev) {
        if (mergedById.has(run.id)) continue;
        if (run.id < 0) {
          const site = agentRunSiteId(run);
          const replaced = site
            ? [...mergedById.values()].some((item) => item.id > 0 && agentRunSiteId(item) === site)
            : false;
          if (!replaced) mergedById.set(run.id, run);
          continue;
        }
        const normalized = applyCancelledRunState(run, teamId);
        if (isAgentRunTerminal(normalized.status)) continue;
        mergedById.set(normalized.id, normalized);
      }

      return [...mergedById.values()].sort((a, b) => b.id - a.id);
    });
    kickClientAgentRuns(
      hydrated.filter(
        (run) =>
          !isAgentRunTerminal(run.status)
          && !agentRunIsServerExecution(run),
      ),
    );
  }, [kickClientAgentRuns, teamId]);

  const patchRunInList = useCallback(
    (runId: number, patch: AgentRunListPatch) => {
      setRuns((prev) => {
        const idx = prev.findIndex((r) => r.id === runId);
        if (idx < 0) return prev;
        const current = prev[idx];
        const partial = typeof patch === "function" ? patch(current) : patch;
        const next = [...prev];
        next[idx] = { ...current, ...partial };
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    registerAgentRunListPatcher(patchRunInList);
    return () => registerAgentRunListPatcher(null);
  }, [patchRunInList]);

  const openSidebar = useCallback(
    (runId?: number) => {
      setSidebarPanel("agents");
      writeSidebarPanel("agents");
      setSidebarOpen(true);
      writeSidebarOpen(true);
      writeAgentRunsSidebarOpen(true);
      if (runId) setSelectedRunId(runId);
    },
    [setSidebarOpen, setSidebarPanel],
  );

  const seedOptimisticWorkflowAgent = useCallback(
    (title: string, siteId?: string | readonly string[]) => {
      if (!teamId) {
        openSidebar();
        return;
      }
      const siteIds = Array.isArray(siteId) ? siteId : siteId ? [siteId] : [undefined];
      const now = Date.now();
      const nextRuns = siteIds.map((id, index) =>
        createOptimisticWorkflowAgentRun({
          teamId,
          title,
          siteId: id,
          id: -(now + index + 1),
        }),
      );
      setRuns((prev) => [...nextRuns, ...prev.filter((item) => item.id > 0)]);
      openSidebar(nextRuns[0]?.id);
    },
    [openSidebar, teamId],
  );

  const patchOptimisticWorkflowAgentProgress = useCallback((message: string, siteId?: string) => {
    setRuns((prev) => applyOptimisticWorkflowAgentProgress(prev, message, siteId));
  }, []);

  const startRun = useCallback(
    async (payload: StartAgentRunPayload, options?: StartRunOptions) => {
      const result = await createAgentRun(applyWorkflowBinding(payload, options?.workflowBinding));
      if (result.ok && result.run) {
        const binding = options?.workflowBinding;
        if (binding) {
          rememberWorkflowAgentBinding(result.run.id, {
            workflowId: binding.workflowId,
            workflowRunId: binding.workflowRunId,
            workflowNodeId: binding.workflowNodeId,
          });
        }
        const clientBatchKey = buildAgentRunBatchKey(result.run.id);
        const siteId =
          payload.context?.siteId?.trim()
          || String(payload.plan?.clientRunContract?.siteId ?? "").trim()
          || String((payload.plan?.executionPayload as { siteId?: string } | undefined)?.siteId ?? "").trim();
        const run = pinAgentRunSiteId({ ...result.run, clientBatchKey }, siteId);
        void patchAgentRun(result.run.teamId, result.run.id, { clientBatchKey });
        setRuns((prev) => {
          const withoutOptimistic = retainSiblingOptimisticAgentRuns(prev, run);
          const idx = withoutOptimistic.findIndex((r) => r.id === run.id);
          if (idx >= 0) {
            const next = [...withoutOptimistic];
            next[idx] = run;
            return next;
          }
          return [run, ...withoutOptimistic];
        });
        if (options?.openSidebar !== false) {
          openSidebar(result.run.id);
        }
        if (agentRunIsServerExecution(run)) {
          void advanceServerAgentRun(payload.teamId, run, sites)
            .then((latest) => {
              patchRunInList(run.id, latest);
            })
            .catch((err) => {
              console.error("[Agent runs] Server run advance failed:", err);
            });
        } else if (!agentRunIsServerExecution(run)) {
          if (!options?.workflowBinding) {
            kickClientAgentRuns([run]);
          }
        }
        return { ok: true, run };
      } else {
        void refreshRuns();
      }
      return result;
    },
    [kickClientAgentRuns, openSidebar, patchRunInList, refreshRuns, sites],
  );

  const mapStartRunResult = useCallback(
    (result: { ok: boolean; run?: AgentRun; error?: string }) => ({
      ok: result.ok,
      run: result.run
        ? {
            id: result.run.id,
            status: result.run.status,
            result: result.run.result as Record<string, unknown> | undefined,
          }
        : undefined,
      error: result.error,
    }),
    [],
  );

  const awaitClientAgentRunHarness = useCallback(
    async (run: AgentRun | undefined): Promise<AgentRun | undefined> => {
      if (!run || !teamId || agentRunIsServerExecution(run)) return run;
      if (!isAgentRunTerminal(run.status)) {
        await executeAgentRun(run, sites);
      }
      await waitForAgentRunInflight(run.id);
      return (await fetchAgentRun(teamId, run.id)) ?? runsRef.current.find((item) => item.id === run.id) ?? run;
    },
    [sites, teamId],
  );

  const awaitServerAgentRunHarness = useCallback(
    async (run: AgentRun | undefined): Promise<AgentRun | undefined> => {
      if (!run || !teamId || !agentRunIsServerExecution(run)) return run;
      let active = run;
      while (active && !isAgentRunTerminal(active.status)) {
        active = await advanceServerAgentRun(teamId, active, sites);
        patchRunInList(active.id, active);
        if (!isAgentRunTerminal(active.status)) {
          await new Promise((resolve) => window.setTimeout(resolve, 1500));
        }
      }
      return active;
    },
    [patchRunInList, sites, teamId],
  );

  const finishWorkflowAgentRun = useCallback(
    async (run: AgentRun | undefined): Promise<AgentRun | undefined> => {
      if (!run) return run;
      if (agentRunIsServerExecution(run)) {
        return awaitServerAgentRunHarness(run);
      }
      return awaitClientAgentRunHarness(run);
    },
    [awaitClientAgentRunHarness, awaitServerAgentRunHarness],
  );

  const startRunForWorkflow = useCallback(
    async (payload: StartAgentRunPayload, options?: StartRunOptions) => {
      const result = await startRun(payload, options);
      if (!result.ok || !result.run) return mapStartRunResult(result);
      const latest = await finishWorkflowAgentRun(result.run);
      const terminal = latest ?? result.run;
      const failed =
        terminal.status === "failed" || terminal.status === "cancelled";
      if (failed) {
        const message =
          terminal.errorMessage?.trim()
          || (typeof terminal.result?.message === "string" ? terminal.result.message.trim() : "")
          || "Agent run failed";
        return mapStartRunResult({ ok: false, run: terminal, error: message });
      }
      return mapStartRunResult({ ok: true, run: terminal });
    },
    [finishWorkflowAgentRun, mapStartRunResult, startRun],
  );

  const startRunFromTask = useCallback(
    async (task: TeamTask, options?: StartRunOptions) => {
      if (!teamId) return { ok: false, error: "No active team" };
      const workflowExecutionKind = options?.workflowBinding
        ? (task.executionKind ?? "").trim()
        : "";
      const prepared = prepareTaskForAutomationExecute(task, null, activeWordPressSiteId);
      const kind =
        workflowExecutionKind ||
        (prepared.executionKind ?? "").trim() ||
        resolveEffectiveExecutionKind(prepared);
      const recipeKey = taskExecutionKindToRecipe(kind);
      if (!recipeKey) return { ok: false, error: "Task has no execution recipe" };

      const siteId = options?.workflowBinding
        ? task.wordpressSiteId?.trim() || ""
        : prepared.wordpressSiteId?.trim() || resolveTaskExecuteSiteId(prepared, activeWordPressSiteId);
      if (!siteId) {
        return { ok: false, error: "Set a client on the project." };
      }

      const executionPayload: TaskExecutionPayload = options?.workflowBinding
        ? {
            targetBucket: "posts",
            ...(prepared.executionPayload ?? {}),
            ...(task.executionPayload ?? {}),
          }
        : mergeExecutionPayloadForSave(
            readCachedExecutionPayload(prepared.projectId),
            prepared.executionPayload,
          );
      const site = sites.find((item) => item.id === siteId);
      const payloadForExecution =
        options?.workflowBinding &&
        (kind === "entity_page_creator" || kind === "entity_generator" || kind === "local_dominator_export")
          ? resolveWorkflowActionPayload(
              kind as "entity_page_creator" | "entity_generator" | "local_dominator_export",
              executionPayload,
              site,
              options.workflowBinding.workflowRunId,
            )
          : executionPayload;

      const pinnedPayload = {
        ...payloadForExecution,
        siteId,
        wordpressSiteId: siteId,
      };
      const exec = await startTaskExecution(teamId, prepared.id, {
        executionKind: kind as TeamTask["executionKind"],
        executionPayload: pinnedPayload,
        wordpressSiteId: siteId,
      });
      if (!exec.ok || !exec.execution) {
        return { ok: false, error: exec.error ?? "Could not start task execution" };
      }

      if (exec.execution.status === "completed") {
        return startRun(
          {
            teamId,
            source: "task_manager",
            recipeKey,
            title: prepared.title,
            taskId: prepared.id,
            context: {
              siteId,
              taskKeyword: prepared.keyword,
              taskTitle: prepared.title,
              projectId: prepared.projectId,
            },
            plan: {
              taskExecutionId: exec.execution.id,
              completedOnServer: true,
              executionPayload: pinnedPayload,
              clientRunContract: { siteId },
            },
          },
          options,
        );
      }

      const executionMode =
        exec.execution.executionMode === "server" ? ("server" as const) : undefined;

      return startRun(
        {
          teamId,
          source: "task_manager",
          recipeKey,
          title: prepared.title,
          taskId: prepared.id,
          context: {
            siteId,
            taskKeyword: prepared.keyword,
            taskTitle: prepared.title,
            projectId: prepared.projectId,
          },
            plan: {
              taskExecutionId: exec.execution.id,
              executionKind: kind,
              clientRunContract: {
                ...(exec.execution.clientRunContract ?? {}),
                siteId,
              },
              executionPayload: pinnedPayload,
              executionMode,
            },
        },
        options,
      );
    },
    [activeWordPressSiteId, sites, startRun, teamId],
  );

  const startRunFromTaskForWorkflow = useCallback(
    async (task: TeamTask, options?: StartRunOptions) => {
      const result = await startRunFromTask(task, options);
      if (!result.ok || !result.run) return mapStartRunResult(result);
      const latest = await finishWorkflowAgentRun(result.run);
      const terminal = latest ?? result.run;
      const failed =
        terminal.status === "failed" || terminal.status === "cancelled";
      if (failed) {
        const message =
          terminal.errorMessage?.trim()
          || (typeof terminal.result?.message === "string" ? terminal.result.message.trim() : "")
          || "Agent run failed";
        return mapStartRunResult({ ok: false, run: terminal, error: message });
      }
      return mapStartRunResult({ ok: true, run: terminal });
    },
    [finishWorkflowAgentRun, mapStartRunResult, startRunFromTask],
  );

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
    [patchRunInList, teamId],
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
  }, [runs, teamId]);

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

  useEffect(() => {
    if (!teamId) {
      setRuns([]);
      return;
    }
    hydrateAgentRunCancellationsForTeam(teamId);
    void refreshRuns();
    // Fetch once per team; local patches handle run updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  useEffect(() => {
    if (!teamId) return;
    const flush = () => {
      void flushAllAgentRunCheckpointPatches(teamId);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [teamId]);

  const serverProcessInFlight = useRef(new Set<number>());

  useEffect(() => {
    if (!teamId) return;
    for (const run of runs) {
      if (
        (run.status === "queued" || run.status === "running") &&
        agentRunIsServerExecution(run) &&
        !serverProcessInFlight.current.has(run.id)
      ) {
        serverProcessInFlight.current.add(run.id);
        void warmInventoryForServerPostCreatorRun(run, sites);
        void advanceServerAgentRun(teamId, run, sites)
          .then((latest) => {
            patchRunInList(run.id, latest);
          })
          .catch((err) => {
            console.error("[Agent runs] Server run advance failed:", err);
          })
          .finally(() => {
            serverProcessInFlight.current.delete(run.id);
          });
      }
    }
  }, [patchRunInList, runs, sites, teamId]);

  useEffect(() => {
    if (!teamId) return;
    const tick = async () => {
      const active = runsRef.current.filter(
        (run) =>
          agentRunIsServerExecution(run) &&
          (run.status === "queued" || run.status === "running"),
      );
      if (active.length === 0) return;
      await Promise.all(
        active.map(async (run) => {
          const latest = await advanceServerAgentRun(teamId, run, sites);
          patchRunInList(run.id, latest);
        }),
      );
    };
    void tick();
    const id = window.setInterval(tick, 3000);
    return () => window.clearInterval(id);
  }, [patchRunInList, sites, teamId]);

  const selectedRun = useMemo(
    () => runs.find((r) => r.id === selectedRunId) ?? null,
    [runs, selectedRunId],
  );

  useEffect(() => {
    if (selectedRunId != null && !runs.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(null);
    }
  }, [runs, selectedRunId]);

  const hasTerminalHistory = useMemo(() => hasTerminalRuns(runs), [runs]);

  const value = useMemo(
    () => ({
      runs,
      selectedRunId,
      selectedRun,
      sidebarOpen,
      setSidebarOpen,
      sidebarPanel,
      setSidebarPanel,
      agentsSiteFilter,
      setAgentsSiteFilter,
      openSidebar,
      seedOptimisticWorkflowAgent,
      patchOptimisticWorkflowAgentProgress,
      selectRun: setSelectedRunId,
      refreshRuns,
      patchRunInList,
      startRun,
      startRunFromTask,
      dispatchWorkflowRun,
      cancelRun,
      resumeRun,
      clearHistory,
      cancelActiveRuns,
      hasTerminalHistory,
    }),
    [
      agentsSiteFilter,
      cancelActiveRuns,
      cancelRun,
      clearHistory,
      hasTerminalHistory,
      openSidebar,
      seedOptimisticWorkflowAgent,
      patchOptimisticWorkflowAgentProgress,
      patchRunInList,
      refreshRuns,
      resumeRun,
      runs,
      selectedRun,
      selectedRunId,
      setAgentsSiteFilter,
      sidebarOpen,
      setSidebarOpen,
      sidebarPanel,
      setSidebarPanel,
      startRun,
      startRunFromTask,
      dispatchWorkflowRun,
    ],
  );

  return <AgentRunsContext.Provider value={value}>{children}</AgentRunsContext.Provider>;
}
