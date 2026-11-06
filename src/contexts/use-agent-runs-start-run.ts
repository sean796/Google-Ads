import { useCallback, type Dispatch, type SetStateAction } from "react";
import {
  createAgentRun,
  fetchAgentRun,
  patchAgentRun,
} from "@/lib/agent-runs-api";
import { buildAgentRunBatchKey } from "@/lib/agent-runs/agent-run-batch-key";
import { pinAgentRunSiteId } from "@/lib/agent-runs/resolve-agent-run-site";
import {
  retainSiblingOptimisticAgentRuns,
} from "@/lib/agent-runs/optimistic-workflow-agent-run";
import { agentRunIsServerExecution } from "@/lib/agent-runs/agent-run-display";
import {
  executeAgentRun,
  waitForAgentRunInflight,
} from "@/lib/agent-runs/executor";
import type { AgentRunListPatch } from "@/lib/agent-runs/agent-runs-local-patch";
import type { AgentRun, StartAgentRunPayload } from "@/lib/agent-runs-types";
import { isAgentRunTerminal, resolveTaskExecuteSiteId, taskExecutionKindToRecipe } from "@/lib/agent-runs-types";
import { prepareTaskForAutomationExecute, resolveEffectiveExecutionKind } from "@/lib/task-automation-ui";
import { readCachedExecutionPayload } from "@/lib/forge-automation-plan-cache";
import { mergeExecutionPayloadForSave } from "@/lib/post-creator/post-creator-schedule-payload";
import { startTaskExecution } from "@/lib/tasks-api";
import {
  advanceServerAgentRun,
} from "@/lib/agent-runs/run-server-post-creator-upload";
import type { TaskExecutionPayload, TeamTask } from "@/lib/tasks-types";
import { rememberWorkflowAgentBinding } from "@/lib/workflow/workflow-agent-binding";
import { resolveWorkflowActionPayload } from "@/lib/workflow/resolve-workflow-action-payload";
import {
  applyWorkflowBinding,
  type StartRunOptions,
} from "@/contexts/agent-runs-provider-helpers";
import type { useWordPressSites } from "@/hooks/use-wordpress-sites";

type UseAgentRunsStartRunParams = {
  teamId: number | null;
  activeWordPressSiteId: string | null;
  sites: ReturnType<typeof useWordPressSites>["sites"];
  runsRef: { current: AgentRun[] };
  kickClientAgentRuns: (candidates: AgentRun[]) => void;
  openSidebar: (runId?: number) => void;
  patchRunInList: (runId: number, patch: AgentRunListPatch) => void;
  refreshRuns: () => Promise<void>;
  setRuns: Dispatch<SetStateAction<AgentRun[]>>;
};

export function useAgentRunsStartRun({
  teamId,
  activeWordPressSiteId,
  sites,
  runsRef,
  kickClientAgentRuns,
  openSidebar,
  patchRunInList,
  refreshRuns,
  setRuns,
}: UseAgentRunsStartRunParams) {
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
    [kickClientAgentRuns, openSidebar, patchRunInList, refreshRuns, setRuns, sites],
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
    [runsRef, sites, teamId],
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

  return {
    startRun,
    mapStartRunResult,
    startRunForWorkflow,
    startRunFromTask,
    startRunFromTaskForWorkflow,
  };
}
