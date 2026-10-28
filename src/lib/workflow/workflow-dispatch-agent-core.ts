import type { StartAgentRunPayload } from "@/lib/agent-runs-types";
import { isAgentRunTerminal, taskExecutionKindToRecipe, type AgentRun } from "@/lib/agent-runs-types";
import {
  resolveStepOutputFileRefsWithRetry,
} from "@/lib/workflow/workflow-step-file-refs";
import type { TaskExecutionKind, TaskExecutionPayload, TeamTask } from "@/lib/tasks-types";
import { browserAutomationRequiresClient } from "@/lib/browser-automation/resolve-browser-target-url";
import { isClientAgnosticExecutionKind } from "@/lib/agent-runs-types";
import { fetchAgentRun } from "@/lib/agent-runs-api";
import { patchWorkflowRun, saveWorkflowStepOutput } from "@/lib/workflow/workflow-api";
import { resolveArchiveOutputForClient, resolveRagInputKeys } from "@/lib/workflow/workflow-rag-utils";
import {
  applyLocalDominatorWorkflowKeyword,
  collectWorkflowRunContextBlock,
  resolveWorkflowSiteContext,
} from "@/lib/workflow/workflow-walk-helpers";
import {
  buildWorkflowWalkClientScope,
  type WorkflowWalkClientScope,
} from "@/lib/workflow/workflow-client-context";
import {
  filterWorkflowArchiveFileRefs,
  mergeWorkflowDeliverableFileRefs,
  syncWorkflowRunArchiveDeliverables,
} from "@/lib/workflow/workflow-rag-archive";
import {
  resolveWorkflowClientSiteIds,
  workflowClientVariableSuffix,
} from "@/lib/workflow/workflow-client-config";
import { pickPathBranchId } from "@/lib/workflow/workflow-path-evaluator";
import { executeWorkflowThenStep } from "@/lib/workflow/workflow-then-runner";
import {
  mergeThenStepScheduleIntoPayload,
  stripWorkflowAgentDeliveryPayload,
  thenConfig,
  workflowAgentUsesThenDelivery,
  workflowThenOutputExistsForSite,
} from "@/lib/workflow/workflow-then-utils";
import {
  applyWorkflowTriggerScheduleToPayload,
} from "@/lib/workflow/workflow-agent-plan";
import { workflowRunThenEmailAlreadySent } from "@/lib/workflow/workflow-then-aggregate";
import {
  awaitThenUpstreamTerminal,
  shouldDeferThenStepForParallelWait,
} from "@/lib/workflow/workflow-then-wait";
import { findClientNode, nodeById, outgoingEdges } from "@/lib/workflow/workflow-graph-utils";
import {
  applyContentGapPostCountToPostCreatorPayload,
  resolveUpstreamContentGapPostCount,
} from "@/lib/workflow/resolve-workflow-content-gap-post-count";
import { fetchTaskDetail } from "@/lib/tasks-api";
import { resolveDfsArticleAuditWorkflowPayload } from "@/lib/workflow/resolve-dfs-article-audit-workflow-payload";
import { ensureChatGptAuditExecutionPayload } from "@/lib/workflow/resolve-chatgpt-audit-workflow-payload";
import { applyEditorialPackageContentGapTarget } from "@/lib/content-gap/apply-editorial-package-content-gap-target";
import { applyEditorialPackageEntityPageCount } from "@/lib/editorial/apply-editorial-package-entity-page-count";
import { resolveWorkflowActionPayload } from "@/lib/workflow/resolve-workflow-action-payload";
import { applyCsvRowsPayloadForNode } from "@/lib/workflow/apply-csv-rows-payload";
import {
  attachPageAuditCsvToAgentRun,
  ensureWorkflowCsvRowsStashForAction,
  executeWorkflowCsvRowsStep,
  persistPageAuditCsvToNextTask,
} from "@/lib/workflow/workflow-csv-rows-runner";
import { csvTextToDataHref } from "@/lib/workflow/workflow-rag-run-files";
import { peekWorkflowCsvSequential, stashWorkflowCsvSequential } from "@/lib/workflow/workflow-csv-rows-stash";
import { applyUpstreamContextToPostCreatorPayload } from "@/lib/workflow/upstream-research-facts";
import { getStoredSites } from "@/components/integrations/storage";
import type {
  WorkflowActionConfig,
  WorkflowClientConfig,
  WorkflowDefinition,
  WorkflowNode,
  WorkflowPathRulesConfig,
  WorkflowRagArchiveConfig,
  WorkflowRun,
  WorkflowStepOutput,
} from "@/lib/workflow/workflow-types";
import { isWorkflowThenKind } from "@/lib/workflow/workflow-types";
import { awaitAgentRunTerminal } from "@/lib/workflow/workflow-await-agent-run";
import { isLdGridCsvReceived } from "@/lib/workflow/workflow-ld-continue-watchdog";
import {
  findWorkflowNodeAgentRun,
} from "@/lib/workflow/workflow-node-agent-dedupe";
import {
  completeParallelWorkflowChain,
  registerParallelWorkflowChains,
  clearParallelWorkflowChains,
} from "@/lib/workflow/workflow-parallel-completion";
import { isContentGapGoalMetFromPreview, workflowNodeHasReadyRunOutput } from "@/lib/workflow/workflow-run-completion";
import { linearExecutableTailNodes } from "@/lib/workflow/workflow-linear-tail";
import { findUpstreamActionAgent, linearOrderedNodes } from "@/lib/workflow/workflow-graph-mutations";
import { filterWorkflowOutputsForSite, clientDeliverableOutputs } from "@/lib/workflow/workflow-rag-client";
import { runAgentMailEmailIntake } from "@/lib/agentmail/agentmail-email-intake";
import { isGridCsvFileRef } from "@/lib/entity-page-creator/resolve-upstream-grid-csv";
import type { WorkflowRunCallbacks } from "@/lib/workflow/workflow-run-callbacks";


export type WorkflowStartRunResult = {
  ok: boolean;
  run?: { id: number; status: string; result?: Record<string, unknown> };
  error?: string;
};

type SiteAgentRunResult = {
  ok: boolean;
  error?: string;
  defer?: boolean;
  goalMet?: boolean;
  siteId?: string;
  stepOutput?: WorkflowStepOutput;
  archiveOutput?: WorkflowStepOutput | null;
};

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
        error: detail.error ?? "Compiled task missing for this workflow action.",
      };
    }
    let executionPayload: TaskExecutionPayload = applyCsvRowsPayloadForNode(
      run.id,
      node.id,
      { ...(config.executionPayload ?? {}), siteId, wordpressSiteId: siteId },
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

  await attachPageAuditCsvToAgentRun({
    agentRun: started.run,
    outputs,
    workflow,
    actionNodeId: node.id,
    persistToTask: !config.compiledTaskId,
  });

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
  } else if (awaitAgentCompletion && isAgentRunTerminal(status)) {
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

function contentGapGoalMetFromAgentResult(
  result: AgentRun["result"] | Record<string, unknown> | null | undefined,
): boolean {
  if (!result || typeof result !== "object") return false;
  const record = result as Record<string, unknown>;
  if (record.goalMet === true) return true;
  if (typeof record.gapCount === "number" && record.gapCount === 0) return true;
  if (typeof record.message === "string" && isContentGapGoalMetFromPreview(record.message)) {
    return true;
  }
  return false;
}

function actionConfig(node: WorkflowNode): WorkflowActionConfig {
  return (node.config ?? {}) as WorkflowActionConfig;
}

function actionRequiresClient(config: WorkflowActionConfig): boolean {
  if (config.executionKind === "browser_automation") {
    return browserAutomationRequiresClient(config.executionPayload);
  }
  return !isClientAgnosticExecutionKind(config.executionKind);
}

function workflowRequiresClient(workflow: Pick<WorkflowDefinition, "nodes">): boolean {
  return workflow.nodes.some(
    (node) => node.kind === "action_agent" && actionRequiresClient(actionConfig(node)),
  );
}

function pathConfig(node: WorkflowNode): WorkflowPathRulesConfig {
  const config = node.config as WorkflowPathRulesConfig;
  return { branches: config?.branches ?? [] };
}

function resolveWorkflowSiteId(workflow: WorkflowDefinition): string | undefined {
  if (workflow.wordpressSiteId?.trim()) return workflow.wordpressSiteId.trim();
  const client = findClientNode(workflow);
  const siteIds = (client?.config as WorkflowClientConfig | undefined)?.siteIds ?? [];
  return siteIds[0]?.trim() || undefined;
}

function stepOutputPreview(
  result: Record<string, unknown> | undefined,
  status: string,
  agentRunId: number,
): string {
  const message = result?.message;
  if (typeof message === "string" && message.trim()) return message.trim();
  if (status === "done") return "Complete";
  return JSON.stringify(result ?? { status, agentRunId }).slice(0, 4000);
}

async function buildActionPayload(
  workflow: WorkflowDefinition,
  node: WorkflowNode,
  contextBlock: string,
  run: WorkflowRun,
  siteId: string | undefined,
  outputs: WorkflowStepOutput[],
  clientSiteIds: string[],
): Promise<StartAgentRunPayload | null> {
  const config = actionConfig(node);
  const kind = config.executionKind as TaskExecutionKind;
  const recipeKey = taskExecutionKindToRecipe(kind);
  if (!recipeKey) return null;
  await ensureWorkflowCsvRowsStashForAction({
    teamId: workflow.teamId,
    workflowRunId: run.id,
    workflow,
    actionNode: node,
    outputs,
    siteId,
  });
  let basePayload: TaskExecutionPayload = {
    ...config.executionPayload,
    workflowContextBlock: contextBlock,
  };
  basePayload = applyWorkflowTriggerScheduleToPayload(workflow, kind, basePayload);
  basePayload = mergeThenStepScheduleIntoPayload(workflow, node.id, basePayload);
  const strippedPayload = stripWorkflowAgentDeliveryPayload(basePayload);

  if (run.triggerKind === "trigger_agentmail" && kind === "post_creator") {
    const messageId = String(run.triggerPayload?.messageId ?? "").trim();
    if (!messageId) {
      throw new Error("Agent Mail trigger is missing messageId.");
    }
    const intake = await runAgentMailEmailIntake(workflow.teamId, messageId);
    const intentParts = [intake.classification.intent, intake.contextNotes].filter(Boolean);
    strippedPayload.optionalPrompt = intentParts.join("\n\n").trim() || strippedPayload.optionalPrompt;
    strippedPayload.prefilledImportRows = intake.rows;
    strippedPayload.postCount = intake.rows.length;
    strippedPayload.agentMailMessageId = messageId;
  }

  const resolvedSiteId = siteId?.trim() || resolveWorkflowSiteId(workflow);
  const siteContext = resolveWorkflowSiteContext(resolvedSiteId);
  const withKeyword =
    kind === "local_dominator_export"
      ? applyLocalDominatorWorkflowKeyword(strippedPayload, config.executionPayload, siteContext.name)
      : strippedPayload;
  let payload = resolveWorkflowActionPayload(
    kind,
    withKeyword,
    siteContext.site,
    run.id,
    { outputs, siteId: resolvedSiteId, clientSiteIds },
  );
  if (resolvedSiteId) {
    payload = { ...payload, siteId: resolvedSiteId };
  }
  if (kind === "content_gap_check") {
    const gapSite = resolvedSiteId
      ? getStoredSites().find((item) => item.id === resolvedSiteId) ?? siteContext.site
      : siteContext.site;
    payload = applyEditorialPackageContentGapTarget(payload, gapSite ?? undefined);
  }
  if (
    kind === "entity_generator"
    || kind === "sap_generator"
    || kind === "entity_page_creator"
  ) {
    const entitySite = resolvedSiteId
      ? getStoredSites().find((item) => item.id === resolvedSiteId) ?? siteContext.site
      : siteContext.site;
    payload = applyEditorialPackageEntityPageCount(payload, entitySite ?? undefined);
  }
  const clientSiteUrl = (siteContext.url ?? siteContext.site.siteUrl ?? siteContext.site.productionSiteUrl ?? "").trim();
  if (clientSiteUrl) {
    payload = {
      ...payload,
      siteUrl: clientSiteUrl,
      productionSiteUrl: (siteContext.site.productionSiteUrl ?? clientSiteUrl).trim(),
    };
  }
  if (siteContext.name.trim() && !payload.businessName?.trim()) {
    payload = { ...payload, businessName: siteContext.name.trim() };
  }
  if (kind === "post_creator" && resolvedSiteId) {
    payload = applyContentGapPostCountToPostCreatorPayload(
      payload,
      workflow,
      node.id,
      outputs,
      resolvedSiteId,
      clientSiteIds,
    );
  }
  payload = applyCsvRowsPayloadForNode(run.id, node.id, payload, resolvedSiteId);
  if (kind === "post_creator") {
    payload = applyUpstreamContextToPostCreatorPayload(payload);
  }
  if (kind === "dfs_llm_article_audit" && resolvedSiteId) {
    const fullSite = getStoredSites().find((item) => item.id === resolvedSiteId);
    if (fullSite) {
      payload = await resolveDfsArticleAuditWorkflowPayload(fullSite, payload);
    }
  }
  if (kind === "chatgpt_website_audit") {
    payload = ensureChatGptAuditExecutionPayload(payload);
  }
  return {
    teamId: workflow.teamId,
    source: "workflow",
    recipeKey,
    title: config.title ?? node.label,
    context: {
      siteId: resolvedSiteId,
      workflowId: workflow.id,
      workflowRunId: run.id,
      workflowNodeId: node.id,
    },
    plan: {
      executionKind: kind,
      executionPayload: payload,
      workflowId: workflow.id,
      workflowRunId: run.id,
      workflowNodeId: node.id,
      ragVariableKey: config.ragVariableKey ?? `step_${node.id}`,
      workflowThenDelivery: true,
    },
  };
}

export function workflowActionStartsFromCompiledTask(kind: string | undefined): boolean {
  return kind === "dfs_llm_article_audit" || kind === "content_optimizer";
}

export {
  contentGapGoalMetFromAgentResult,
  actionConfig,
  workflowRequiresClient,
  pathConfig,
  resolveWorkflowSiteId,
};
