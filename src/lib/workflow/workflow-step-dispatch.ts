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
import type { WalkFromNodeResult } from "@/lib/workflow/workflow-walk-types";
import { walkWorkflowThenNode } from "@/lib/workflow/workflow-dispatch-then-node";
import { walkWorkflowRagArchiveNode } from "@/lib/workflow/workflow-dispatch-rag-archive-node";
import { walkWorkflowCsvRowsNode } from "@/lib/workflow/workflow-dispatch-csv-node";
import { walkWorkflowActionAgentNode } from "@/lib/workflow/workflow-dispatch-action-agent-node";
import {
  buildMastraWorkflowPipeline,
  runMastraWorkflowNodeStep,
} from "@/lib/workflow/workflow-mastra-bridge";

import {
  startWorkflowAgentForSite,
  contentGapGoalMetFromAgentResult,
  actionConfig,
  workflowActionStartsFromCompiledTask,
  workflowRequiresClient,
  pathConfig,
  resolveWorkflowSiteId,
} from "@/lib/workflow/workflow-dispatch-agent-core";
import { readWorkflowAgentBinding } from "@/lib/workflow/workflow-agent-binding";

function resolveWorkflowResumeNodeId(
  workflow: Pick<WorkflowDefinition, "nodes" | "edges">,
  outputs: WorkflowStepOutput[],
  defaultNodeId: string,
): string {
  for (const node of linearOrderedNodes(workflow)) {
    if (node.kind !== "action_agent" && !isWorkflowThenKind(node.kind) && node.kind !== "rag_archive" && node.kind !== "csv_rows") {
      continue;
    }
    if (!workflowNodeHasReadyRunOutput(node, outputs)) return node.id;
  }
  return defaultNodeId;
}

function resolveWorkflowWalkEntryNodeId(
  workflow: Pick<WorkflowDefinition, "nodes" | "edges">,
  outputs: WorkflowStepOutput[],
  defaultNodeId: string,
  stopAfterNodeId?: string,
): string {
  if (stopAfterNodeId) {
    const stopNode = workflow.nodes.find((node) => node.id === stopAfterNodeId);
    if (stopNode?.kind === "then_google_drive") {
      return stopAfterNodeId;
    }
  }
  return resolveWorkflowResumeNodeId(workflow, outputs, defaultNodeId);
}

async function walkRemainingLinearSteps(
  workflow: WorkflowDefinition,
  run: WorkflowRun,
  afterNodeId: string,
  outputs: WorkflowStepOutput[],
  callbacks: WorkflowRunCallbacks,
  visited: Set<string>,
  clientScope: WorkflowWalkClientScope,
): Promise<WalkFromNodeResult> {
  for (const tailNode of linearExecutableTailNodes(workflow, afterNodeId)) {
    if (visited.has(tailNode.id)) continue;
    const next = await walkFromNode(
      workflow,
      run,
      tailNode.id,
      outputs,
      callbacks,
      visited,
      clientScope,
    );
    if (!next.ok) return next;
    if (next.deferWorkflowCompletion) return next;
  }
  return { ok: true };
}

async function walkFromNode(
  workflow: WorkflowDefinition,
  run: WorkflowRun,
  nodeId: string,
  outputs: WorkflowStepOutput[],
  callbacks: WorkflowRunCallbacks,
  visited: Set<string>,
  clientScope: WorkflowWalkClientScope,
): Promise<WalkFromNodeResult> {
  let walkScope = clientScope;
  const { allSiteIds } = walkScope;
  if (visited.has(nodeId)) return { ok: true };
  visited.add(nodeId);
  const node = nodeById(workflow.nodes, nodeId);
  if (!node) return { ok: true };

  if (node.kind === "path_rules") {
    const branchId = pickPathBranchId(pathConfig(node).branches, {
      triggerPayload: run.triggerPayload,
      stepOutputs: outputs,
    });
    const edge = outgoingEdges(workflow.edges, nodeId, branchId)[0]
      ?? outgoingEdges(workflow.edges, nodeId, "default")[0]
      ?? outgoingEdges(workflow.edges, nodeId)[0];
    if (!edge) return { ok: true };
    return walkFromNode(workflow, run, edge.target, outputs, callbacks, visited, walkScope);
  }

  const csvWalk = await runMastraWorkflowNodeStep({
    workflow,
    run,
    node,
    executeNode: () =>
      walkWorkflowCsvRowsNode({
        workflow,
        run,
        node,
        nodeId,
        outputs,
        callbacks,
        visited,
        walkScope,
        allSiteIds,
        walkFromNode,
        walkRemainingLinearSteps,
      }),
  });
  if (csvWalk !== null) return csvWalk;

  const walkScopeState = { current: walkScope };
  const actionWalk = await runMastraWorkflowNodeStep({
    workflow,
    run,
    node,
    executeNode: () =>
      walkWorkflowActionAgentNode({
        workflow,
        run,
        node,
        nodeId,
        outputs,
        callbacks,
        visited,
        walkScopeState,
        walkRemainingLinearSteps,
      }),
  });
  if (actionWalk !== null) return actionWalk;
  walkScope = walkScopeState.current;

  const thenWalk = await runMastraWorkflowNodeStep({
    workflow,
    run,
    node,
    executeNode: () =>
      walkWorkflowThenNode({
        workflow,
        run,
        node,
        outputs,
        callbacks,
        walkScope,
        allSiteIds,
      }),
  });
  if (thenWalk) return thenWalk;

  const ragWalk = await runMastraWorkflowNodeStep({
    workflow,
    run,
    node,
    executeNode: () =>
      walkWorkflowRagArchiveNode({
        workflow,
        run,
        node,
        outputs,
        walkScope,
        allSiteIds,
      }),
  });
  if (ragWalk) return ragWalk;

  if (callbacks.stopAfterNodeId === nodeId) {
    return { ok: true };
  }

  for (const edge of outgoingEdges(workflow.edges, nodeId)) {
    const next = await walkFromNode(workflow, run, edge.target, outputs, callbacks, visited, walkScope);
    if (!next.ok) return next;
    if (next.deferWorkflowCompletion) {
      return { ok: true, deferWorkflowCompletion: true };
    }
  }

  const linearTail = await walkRemainingLinearSteps(
    workflow,
    run,
    nodeId,
    outputs,
    callbacks,
    visited,
    walkScope,
  );
  if (!linearTail.ok) return linearTail;
  if (linearTail.deferWorkflowCompletion) return linearTail;

  return { ok: true };
}

export {
  walkFromNode,
  walkRemainingLinearSteps,
  workflowRequiresClient,
  resolveWorkflowResumeNodeId,
  resolveWorkflowWalkEntryNodeId,
  actionConfig,
  contentGapGoalMetFromAgentResult,
  workflowActionStartsFromCompiledTask,
  buildMastraWorkflowPipeline,
  runMastraWorkflowNodeStep,
};

