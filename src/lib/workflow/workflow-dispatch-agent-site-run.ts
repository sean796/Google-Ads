import type { AgentRun } from "@/lib/agent-runs-types";
import type { WordPressSite } from "@/components/integrations/types";
import { getStoredSites } from "@/components/integrations/storage";
import { isGridCsvFileRef } from "@/lib/entity-page-creator/resolve-upstream-grid-csv";
import { fetchTaskDetail } from "@/lib/tasks-api";
import type { TaskExecutionPayload } from "@/lib/tasks-types";
import { fetchAgentRun } from "@/lib/agent-runs-api";
import { applyCsvRowsPayloadForNode } from "@/lib/workflow/apply-csv-rows-payload";
import { resolveDfsArticleAuditWorkflowPayload } from "@/lib/workflow/resolve-dfs-article-audit-workflow-payload";
import {
  resolveUpstreamContentGapPostCount,
} from "@/lib/workflow/resolve-workflow-content-gap-post-count";
import { awaitAgentRunTerminal } from "@/lib/workflow/workflow-await-agent-run";
import { saveWorkflowStepOutput } from "@/lib/workflow/workflow-api";
import { workflowClientVariableSuffix } from "@/lib/workflow/workflow-client-config";
import {
  attachPageAuditCsvToAgentRun,
  ensureWorkflowCsvRowsStashForAction,
} from "@/lib/workflow/workflow-csv-rows-runner";
import {
  contentGapGoalMetFromAgentResult,
  stepOutputPreview,
  workflowActionStartsFromCompiledTask,
} from "@/lib/workflow/workflow-dispatch-agent-helpers";
import { buildActionPayload } from "@/lib/workflow/workflow-dispatch-agent-payload";
import type {
  SiteAgentRunResult,
  WorkflowStartRunResult,
} from "@/lib/workflow/workflow-dispatch-agent-types";
import { findWorkflowNodeAgentRun } from "@/lib/workflow/workflow-node-agent-dedupe";
import type { WorkflowRunCallbacks } from "@/lib/workflow/workflow-run-callbacks";
import { resolveStepOutputFileRefsWithRetry } from "@/lib/workflow/workflow-step-file-refs";
import type {
  WorkflowActionConfig,
  WorkflowDefinition,
  WorkflowNode,
  WorkflowRun,
  WorkflowStepOutput,
} from "@/lib/workflow/workflow-types";

export async function startWorkflowAgentForSite(args: {
  workflow: WorkflowDefinition;
  run: WorkflowRun;
  node: WorkflowNode;
  config: WorkflowActionConfig & { compiledTaskId?: number };
  siteId: string;
  sitesToRun: string[];
  outputs: WorkflowStepOutput[];
  contextBlock: string;
  usesThenDelivery: boolean;
  showAgentInSidebar: boolean;
  callbacks: WorkflowRunCallbacks;
  ignoreExistingAgent?: boolean;
}): Promise<SiteAgentRunResult> {
  const {
    workflow,
    run,
    node,
    config,
    siteId,
    sitesToRun,
    outputs,
    contextBlock,
    usesThenDelivery,
    showAgentInSidebar,
    callbacks,
    ignoreExistingAgent,
  } = args;

  const awaitAgentCompletion = config.executionKind !== "local_dominator_export";

  await ensureWorkflowCsvRowsStashForAction({
    teamId: workflow.teamId,
    workflowRunId: run.id,
    workflow,
    actionNode: node,
    outputs,
    siteId,
  });

  const startRunFn = awaitAgentCompletion
    ? (callbacks.startRunAndWait ?? callbacks.startRun)
    : callbacks.startRun;

  const existingNodeRun = ignoreExistingAgent
    ? null
    : await findWorkflowNodeAgentRun(workflow.teamId, run.id, node.id, siteId);
  if (existingNodeRun) {
    const existingGoalMet =
      config.executionKind === "content_gap_check"
        ? contentGapGoalMetFromAgentResult(existingNodeRun.result)
        : undefined;
    const existingOutput = outputs.find(
      (output) => output.nodeId === node.id && output.agentRunId === existingNodeRun.id,
    );
    if (existingOutput) {
      return {
        ok: true,
        stepOutput: existingOutput,
        goalMet: existingGoalMet,
        siteId,
      };
    }
    // Agent already ran (e.g. bound Then finished) but workflow output was never saved.
    const baseVariableKey = config.ragVariableKey ?? `step_${node.id}`;
    const variableKey = `${baseVariableKey}${workflowClientVariableSuffix(sitesToRun, siteId)}`;
    const preview = stepOutputPreview(
      existingNodeRun.result as Record<string, unknown> | undefined,
      existingNodeRun.status,
      existingNodeRun.id,
    );
    const fileRefs = await resolveStepOutputFileRefsWithRetry(workflow.teamId, existingNodeRun.id);
    // Local Dominator: never persist an empty placeholder; resume treats that as complete.
    if (config.executionKind === "local_dominator_export") {
      const hasCsv = fileRefs.some((file) => Boolean(file.url) && isGridCsvFileRef(file));
      if (!hasCsv) {
        const cleanupRace =
          existingNodeRun.status === "failed"
          && /job not found|already cleaned up/i.test(String(existingNodeRun.errorMessage ?? ""));
        const stillInFlight =
          existingNodeRun.status === "queued" || existingNodeRun.status === "running";
        if (cleanupRace || stillInFlight) {
          return { ok: true, defer: true, siteId };
        }
        return {
          ok: false,
          error:
            existingNodeRun.errorMessage?.trim()
            || "Local Dominator export did not produce a grid CSV.",
          siteId,
        };
      }
    }
    const saved = await saveWorkflowStepOutput(workflow.teamId, workflow.id, run.id, {
      nodeId: node.id,
      variableKey,
      scope: "run",
      label: config.title ?? node.label,
      textPreview:
        config.executionKind === "local_dominator_export" ? "Grid export CSV" : preview,
      agentRunId: existingNodeRun.id,
      fileRefs,
      siteId,
    });
    const ldJobCleanupRace =
      config.executionKind === "local_dominator_export"
      && existingNodeRun.status === "failed"
      && /job not found|already cleaned up/i.test(String(existingNodeRun.errorMessage ?? ""));
    return {
      ok:
        ldJobCleanupRace
        || (existingNodeRun.status !== "failed" && existingNodeRun.status !== "cancelled"),
      error:
        ldJobCleanupRace
          ? undefined
          : existingNodeRun.status === "failed"
            ? existingNodeRun.errorMessage?.trim() || "Agent run failed"
            : existingNodeRun.status === "cancelled"
              ? "Agent run cancelled"
              : undefined,
      stepOutput: saved.ok ? saved.output : undefined,
      goalMet: existingGoalMet,
      siteId,
    };
  }

  if (config.executionKind === "post_creator" && siteId.trim()) {
    const gapCount = resolveUpstreamContentGapPostCount(
      workflow,
      node.id,
      outputs,
      siteId,
      sitesToRun,
    );
    if (gapCount === 0) {
      const baseVariableKey = config.ragVariableKey ?? `step_${node.id}`;
      const variableKey = `${baseVariableKey}${workflowClientVariableSuffix(sitesToRun, siteId)}`;
      const preview = "Skipped: content gap already met (0 posts needed).";
      const saved = await saveWorkflowStepOutput(workflow.teamId, workflow.id, run.id, {
        nodeId: node.id,
        variableKey,
        scope: "run",
        label: config.title ?? node.label,
        textPreview: preview,
        siteId,
      });
      return {
        ok: true,
        siteId,
        stepOutput: saved.ok ? saved.output : undefined,
      };
    }
  }

  const payload = await buildActionPayload(
    workflow,
    node,
    contextBlock,
    run,
    siteId,
    outputs,
    sitesToRun,
  ).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : "Workflow action payload failed";
    return { error: message } as const;
  });
  if (!payload || "error" in payload) {
    return { ok: false, error: "error" in payload ? payload.error : "Invalid action node" };
  }

  const workflowBinding = {
    workflowId: workflow.id,
    workflowRunId: run.id,
    workflowNodeId: node.id,
    ragVariableKey: config.ragVariableKey ?? `step_${node.id}`,
    workflowThenDelivery: true,
  };
  const runOptions = {
    openSidebar: showAgentInSidebar,
    workflowBinding,
  };

  let started: WorkflowStartRunResult;
  if (
    config.compiledTaskId
    && workflowActionStartsFromCompiledTask(config.executionKind)
    && callbacks.startRunFromTaskAndWait
  ) {
    const detail = await fetchTaskDetail(workflow.teamId, config.compiledTaskId);
    if (!detail.task) {
      return {
        ok: false,
        error: "Compiled task missing for this workflow action.",
      };
    }
    const compiledPayload: TaskExecutionPayload & { wordpressSiteId: string } = {
      ...(config.executionPayload ?? {}),
      siteId,
      wordpressSiteId: siteId,
    };
    let executionPayload: TaskExecutionPayload = applyCsvRowsPayloadForNode(
      run.id,
      node.id,
      compiledPayload,
      siteId,
    );
    if (config.executionKind === "dfs_llm_article_audit" && siteId.trim()) {
      const site = getStoredSites().find((item) => item.id === siteId);
      if (site) {
        try {
          executionPayload = await resolveDfsArticleAuditWorkflowPayload(site, executionPayload);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "DFS LLM article audit setup failed";
          return { ok: false, error: message };
        }
      }
    }
    started = await callbacks.startRunFromTaskAndWait(
      {
        ...detail.task,
        wordpressSiteId: siteId || detail.task.wordpressSiteId,
        executionKind: config.executionKind,
        executionPayload,
      },
      runOptions,
    );
  } else if (config.executionKind === "content_optimizer") {
    return {
      ok: false,
      error: "Full AISEO needs a compiled workflow task. Save the workflow, then run again.",
    };
  } else {
    started = await startRunFn(payload, runOptions);
  }

  if (!started.ok || !started.run) {
    return { ok: false, error: started.error ?? "Agent run failed to start" };
  }

  const startedAgentRun = await fetchAgentRun(workflow.teamId, started.run.id);
  if (startedAgentRun) {
    await attachPageAuditCsvToAgentRun({
      agentRun: startedAgentRun,
      outputs,
      workflow,
      actionNodeId: node.id,
      persistToTask: !config.compiledTaskId,
    });
  }

  let agentRunId = started.run.id;
  let status = started.run.status;
  let resolvedResult = started.run.result as Record<string, unknown> | undefined;
  let terminalRun: AgentRun | null = null;

  if (
    awaitAgentCompletion
    && status !== "cancelled"
    && status !== "failed"
    && status !== "done"
  ) {
    const terminal = await awaitAgentRunTerminal(workflow.teamId, agentRunId);
    if (!terminal) return { ok: false, error: "Agent run missing after wait" };
    terminalRun = terminal;
    agentRunId = terminal.id;
    status = terminal.status;
    resolvedResult = terminal.result as Record<string, unknown> | undefined;
  } else if (
    awaitAgentCompletion &&
    (status === "done" || status === "failed" || status === "cancelled")
  ) {
    terminalRun = await fetchAgentRun(workflow.teamId, agentRunId);
    if (terminalRun) {
      status = terminalRun.status;
      resolvedResult = terminalRun.result as Record<string, unknown> | undefined;
    }
  }

  if (status === "cancelled") {
    return { ok: false, error: "Agent run cancelled" };
  }
  if (status === "failed") {
    const failedRun = terminalRun ?? (await fetchAgentRun(workflow.teamId, agentRunId));
    const resultMessage =
      typeof resolvedResult?.message === "string" ? resolvedResult.message.trim() : "";
    const message = failedRun?.errorMessage?.trim() || resultMessage || "Agent run failed";
    return { ok: false, error: message };
  }
  // Grid CSV is written later; do not save a step output yet or resume will skip past this node.
  if (config.executionKind === "local_dominator_export") {
    return { ok: true, defer: true };
  }

  const baseVariableKey = config.ragVariableKey ?? `step_${node.id}`;
  const variableKey = `${baseVariableKey}${workflowClientVariableSuffix(sitesToRun, siteId)}`;
  const preview = stepOutputPreview(resolvedResult, status, agentRunId);
  const fileRefs = await resolveStepOutputFileRefsWithRetry(workflow.teamId, agentRunId);
  const saved = await saveWorkflowStepOutput(workflow.teamId, workflow.id, run.id, {
    nodeId: node.id,
    variableKey,
    scope: "run",
    label: config.title ?? node.label,
    textPreview: preview,
    agentRunId,
    fileRefs,
    siteId,
  });

  const stepOutput = saved.ok ? saved.output : undefined;

  const goalMet = contentGapGoalMetFromAgentResult(resolvedResult);
  return {
    ok: true,
    stepOutput,
    siteId,
    goalMet: config.executionKind === "content_gap_check" ? goalMet : undefined,
  };
}
