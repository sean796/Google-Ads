import type { Dispatch, SetStateAction } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import type { AgentRunHarnessContext } from "@/lib/agent-runs/harness-registry";
import {
  readAgentRunCheckpoint,
  scheduleAgentRunCheckpointPatch,
} from "@/lib/agent-runs/agent-run-checkpoint";
import { getAgentRunOptimizationBridge } from "@/lib/agent-runs/agent-run-optimization-bridge";
import type { AgentRun, AgentRunResult } from "@/lib/agent-runs-types";
import type { TaskExecutionClientRunContract, TaskExecutionPayload } from "@/lib/tasks-types";
import { resolveDfsArticleAuditBlockForUrl } from "@/lib/dfs-article-audit/resolve-dfs-article-audit-block";
import { fetchWorkflowStepOutputs } from "@/lib/workflow/workflow-api";
import { mergeRunContractOptimizationOptions } from "@/lib/agent-runs/merge-run-contract-optimization-options";
import {
  fetchTaskExecution,
  patchTaskExecutionProgress,
  reopenTaskExecutionForResume,
} from "@/lib/tasks-api";
import { agentRunHasResumeProgress } from "@/lib/agent-runs/agent-run-resume";
import {
  automationTitleFromRun,
  executionKindFromRun,
} from "@/lib/automation-email-delivery";
import {
  completeAgentRunExecution,
  completeExecutionArchiveOnly,
  shouldSkipInlineDeliveries,
} from "@/lib/workflow/workflow-deliveries-skip";
import type { OptimizationProgressState } from "@/hooks/content-optimization/use-optimization-state";

export function noopSetState<T>(_value: SetStateAction<T>): void {
  /* agent run harness uses API steps only */
}

export async function optimizationOptionsWithDfsArticleAudit(
  run: AgentRun,
  contract: TaskExecutionClientRunContract & object,
  url: string,
): Promise<NonNullable<TaskExecutionClientRunContract["optimizationOptions"]>> {
  const base = { ...(contract.optimizationOptions ?? {}) };
  const workflowId = Number(run.context?.workflowId ?? run.plan?.workflowId ?? 0);
  const workflowRunId = Number(run.context?.workflowRunId ?? run.plan?.workflowRunId ?? 0);
  let workflowOutputs: Awaited<ReturnType<typeof fetchWorkflowStepOutputs>> | undefined;
  if (workflowId > 0 && workflowRunId > 0) {
    workflowOutputs = await fetchWorkflowStepOutputs(run.teamId, workflowId, workflowRunId);
  }

  const workflowContextBlock = String(contract.workflowContextBlock ?? base.workflowContextBlock ?? "");
  const block = base.dfsArticleAuditBlock?.trim()
    ? base.dfsArticleAuditBlock
    : await resolveDfsArticleAuditBlockForUrl({
        articleUrl: url,
        workflowOutputs,
        workflowContextBlock,
      });

  const optionalPrompt = String(contract.optionalPrompt ?? base.optionalPrompt ?? "").trim();
  return {
    ...base,
    ...(workflowContextBlock ? { workflowContextBlock } : {}),
    ...(workflowOutputs?.length ? { workflowAuditOutputs: workflowOutputs } : {}),
    ...(block.trim() ? { dfsArticleAuditBlock: block } : {}),
    ...(optionalPrompt ? { optionalPrompt } : {}),
  };
}

export function resolveRunContract(run: AgentRun): TaskExecutionClientRunContract & object {
  const plan = run.plan ?? {};
  const client = plan.clientRunContract ?? {};
  const payload = plan.executionPayload ?? {};
  const siteId =
    String(
      run.context?.siteId ??
        (payload as { siteId?: string }).siteId ??
        (client as { siteId?: string }).siteId ??
        "",
    ).trim() || undefined;
  const merged = {
    ...payload,
    ...client,
    ...(siteId ? { siteId } : {}),
    optimizationOptions: mergeRunContractOptimizationOptions(
      payload as TaskExecutionPayload,
      client as TaskExecutionClientRunContract,
    ),
  } as TaskExecutionClientRunContract & object;
  if (
    run.recipeKey === "local_dominator_export"
    && (payload as TaskExecutionPayload).keyword !== undefined
  ) {
    merged.keyword = (payload as TaskExecutionPayload).keyword;
  }
  return merged;
}

export async function completeOptimizerWithOptionalEmail(args: {
  run: AgentRun;
  site: WordPressSite;
  contract: TaskExecutionClientRunContract & object;
  executionId: number;
  saveLocalArchive: boolean;
  ok: boolean;
  result: Record<string, unknown>;
  summaryText: string;
  summary?: string;
  onStep?: AgentRunHarnessContext["onStep"];
}) {
  const executionKind = executionKindFromRun(args.run) || "content_optimizer";
  if (shouldSkipInlineDeliveries(args.run)) {
    await completeExecutionArchiveOnly({
      teamId: args.run.teamId,
      executionId: args.executionId,
      run: args.run,
      saveLocalArchive: args.saveLocalArchive,
      ok: args.ok,
      result: args.result,
      error: args.ok ? undefined : String(args.result.error ?? "Run failed"),
    });
    return {};
  }
  return completeAgentRunExecution({
    run: args.run,
    teamId: args.run.teamId,
    executionId: args.executionId,
    contract: args.contract,
    saveLocalArchive: args.saveLocalArchive,
    ok: args.ok,
    result: args.result,
    summaryText: args.summaryText,
    fileNameHint: `${args.site.name} ${executionKind.replace(/_/g, " ")}`,
    tokenContext: {
      siteName: args.site.name,
      automationTitle: automationTitleFromRun(args.run),
      executionKind,
      summary: args.summary,
    },
    onStep: (label, status) => args.onStep?.(label, status ?? "running"),
  });
}

export async function resolveTaskExecutionTerminalState(
  run: AgentRun,
  ctx: AgentRunHarnessContext,
): Promise<AgentRunResult | null> {
  const executionId = run.plan?.taskExecutionId;
  if (!executionId || !run.teamId) return null;

  const { execution } = await fetchTaskExecution(run.teamId, executionId);
  if (!execution) return null;

  if (execution.status === "completed") {
    const checkpoint = readAgentRunCheckpoint(run);
    return {
      updated: checkpoint.uploadedUrls.length || checkpoint.completedUrls.length || 1,
      message: execution.progress?.message || "Task execution completed",
      batchKey: run.clientBatchKey || undefined,
    };
  }

  if (execution.status === "failed") {
    if (ctx.resumePoint || agentRunHasResumeProgress(run)) {
      await reopenTaskExecutionForResume(run.teamId, executionId);
      return null;
    }
    throw new Error(execution.error || execution.progress?.error || "Task execution failed");
  }

  if (execution.status === "cancelled") {
    throw new Error("Cancelled");
  }

  return null;
}

export function progressReporter(
  run: AgentRun,
  ctx: AgentRunHarnessContext,
  siteId: string,
  batchKey: string,
  checkpointTotals?: { totalCount?: number; completedCount?: number },
): Dispatch<SetStateAction<Record<string, OptimizationProgressState>>> {
  const executionId = run.plan?.taskExecutionId;
  const bridge = getAgentRunOptimizationBridge();
  const base = bridge?.setOptimizationProgress;
  let stepChain = Promise.resolve();

  return (updater) => {
    let snapshot: Record<string, OptimizationProgressState> = {};

    if (base) {
      base((prev) => {
        snapshot =
          typeof updater === "function"
            ? updater(prev as Record<string, OptimizationProgressState>)
            : (updater as Record<string, OptimizationProgressState>);
        return snapshot;
      });
    } else {
      snapshot =
        typeof updater === "function"
          ? updater({} as Record<string, OptimizationProgressState>)
          : (updater as Record<string, OptimizationProgressState>);
    }

    const entry =
      (snapshot[siteId] as { stepId?: string; message?: string; step?: string; progress?: number; pageUrl?: string } | undefined) ??
      (snapshot[batchKey] as { stepId?: string; message?: string; step?: string; progress?: number; pageUrl?: string } | undefined) ??
      (Object.values(snapshot)[0] as { stepId?: string; message?: string; step?: string; progress?: number; pageUrl?: string } | undefined);

    if (entry?.message || entry?.stepId || entry?.step) {
      const message = entry.message || entry.step || entry.stepId || "Running";
      const stepPayload = {
        currentUrl: entry.pageUrl,
        currentUrlProgress: typeof entry.progress === "number" ? entry.progress : undefined,
        totalCount: checkpointTotals?.totalCount,
        currentIndex: checkpointTotals?.completedCount,
        lastMessage: message,
      };
      stepChain = stepChain.then(() =>
        Promise.resolve(ctx.onStep?.(message, "running", stepPayload)),
      );
      if (executionId) {
        const stepId = entry.stepId === "done" ? "publish" : entry.stepId;
        void patchTaskExecutionProgress(run.teamId, executionId, {
          stepId,
          message: entry.message,
          progress: typeof entry.progress === "number" ? entry.progress : undefined,
        });
      }
    }

    const message = entry?.message || entry?.step || undefined;
    const hasProgressPatch = Boolean(message) || typeof entry?.progress === "number";
    if (hasProgressPatch) {
      scheduleAgentRunCheckpointPatch(run.teamId, run.id, {
        lastMessage: message,
        currentUrlProgress: typeof entry?.progress === "number" ? entry.progress : undefined,
        totalCount: checkpointTotals?.totalCount,
      });
    }
  };
}
