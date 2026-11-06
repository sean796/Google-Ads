import type { AgentRun } from "@/lib/agent-runs-types";
import { fetchAgentRunDeliverableFiles } from "@/lib/agent-runs-api";
import { resolveStepOutputFileRefsWithRetry } from "@/lib/workflow/workflow-step-file-refs";
import {
  fetchWorkflow,
  fetchWorkflowRun,
  fetchWorkflowStepOutputs,
  patchWorkflowRun,
  saveWorkflowStepOutput,
} from "@/lib/workflow/workflow-api";
import { resolveWorkflowSiteContext } from "@/lib/workflow/workflow-walk-helpers";
import { buildWorkflowWalkClientScope } from "@/lib/workflow/workflow-client-context";
import { syncWorkflowRunArchiveDeliverables } from "@/lib/workflow/workflow-rag-archive";
import {
  resolveWorkflowClientSiteIds,
  workflowClientVariableSuffix,
} from "@/lib/workflow/workflow-client-config";
import { readWorkflowAgentBinding } from "@/lib/workflow/workflow-agent-binding";
import {
  findClientNode,
  nodeById,
} from "@/lib/workflow/workflow-graph-utils";
import type {
  WorkflowClientConfig,
  WorkflowStepOutputFileRef,
} from "@/lib/workflow/workflow-types";
import {
  completeParallelWorkflowChain,
  clearParallelWorkflowChains,
} from "@/lib/workflow/workflow-parallel-completion";
import { hasIncompleteWorkflowSteps } from "@/lib/workflow/workflow-run-completion";
import { peekWorkflowCsvSequential } from "@/lib/workflow/workflow-csv-rows-stash";
import { isGridCsvFileRef } from "@/lib/entity-page-creator/resolve-upstream-grid-csv";
import {
  walkRemainingLinearSteps,
  actionConfig,
  contentGapGoalMetFromAgentResult,
} from "@/lib/workflow/workflow-step-dispatch";
import type { WorkflowRunCallbacks } from "@/lib/workflow/workflow-run-callbacks";
import {
  finishDeferredWorkflowRun,
  workflowStepChainKey,
  workflowStepChainStarted,
} from "@/lib/workflow/workflow-runner-state";

export async function runNextWorkflowAgentStep(
  teamId: number,
  agentRun: AgentRun,
  callbacks: WorkflowRunCallbacks,
  gridFileRefs?: WorkflowStepOutputFileRef[],
): Promise<void> {
  const binding = readWorkflowAgentBinding(agentRun);
  if (!binding) {
    throw new Error("Workflow agent run is missing workflow binding.");
  }

  const chainKey = workflowStepChainKey(
    binding.workflowRunId,
    binding.workflowNodeId,
    agentRun.id,
  );
  if (workflowStepChainStarted.has(chainKey)) {
    return;
  }
  workflowStepChainStarted.add(chainKey);

  try {
  const chainSiteId = agentRun.context?.siteId?.trim() ?? "";
  const workflow = await fetchWorkflow(teamId, binding.workflowId);
  if (!workflow) {
    throw new Error("Workflow not found for grid export chain.");
  }
  const run = await fetchWorkflowRun(teamId, binding.workflowId, binding.workflowRunId);
  if (!run) {
    throw new Error("Workflow run not found for grid export chain.");
  }

  const outputs = [...(await fetchWorkflowStepOutputs(teamId, binding.workflowId, binding.workflowRunId))];

  const completedNode = nodeById(workflow.nodes, binding.workflowNodeId);
  if (!completedNode) {
    throw new Error("Completed workflow node not found for grid export chain.");
  }

  if (
    completedNode.kind === "action_agent"
    && actionConfig(completedNode).executionKind === "content_gap_check"
    && contentGapGoalMetFromAgentResult(agentRun.result)
  ) {
    if (!hasIncompleteWorkflowSteps(workflow, outputs)) {
      const allChainsDone = completeParallelWorkflowChain(
        teamId,
        binding.workflowId,
        binding.workflowRunId,
      );
      if (allChainsDone) {
        clearParallelWorkflowChains(teamId, binding.workflowId, binding.workflowRunId);
        await finishDeferredWorkflowRun(teamId, binding.workflowId, binding.workflowRunId, {
          status: "done",
          errorMessage: null,
        });
      }
    }
    workflowStepChainStarted.delete(chainKey);
    return;
  }

  const clientNode = findClientNode(workflow);
  const clientConfig = (clientNode?.config ?? {}) as WorkflowClientConfig;
  const availableSiteIds = callbacks.listAvailableSiteIds
    ? await Promise.resolve(callbacks.listAvailableSiteIds())
    : [];
  const allClientSiteIds = resolveWorkflowClientSiteIds(clientConfig, availableSiteIds);
  const clientScope = buildWorkflowWalkClientScope(
    outputs,
    chainSiteId ? [chainSiteId] : allClientSiteIds,
    allClientSiteIds,
  );

  const completedConfig = actionConfig(completedNode);
  const hasStepOutput = outputs.some(
    (output) => output.nodeId === binding.workflowNodeId && output.agentRunId === agentRun.id,
  );
  const hasLdCsvOnOutputs =
    completedConfig.executionKind === "local_dominator_export"
    && outputs.some(
      (output) =>
        output.nodeId === binding.workflowNodeId
        && (output.fileRefs ?? []).some((file) => Boolean(file.url) && isGridCsvFileRef(file)),
    );
  // Persist CSV even when an empty LD placeholder already exists (resume must see the grid).
  if (!hasStepOutput || (completedConfig.executionKind === "local_dominator_export" && !hasLdCsvOnOutputs)) {
    const sitesToRun = allClientSiteIds.length > 0 ? allClientSiteIds : clientScope.activeSiteIds;
    const variableKey = `${completedConfig.ragVariableKey ?? `step_${binding.workflowNodeId}`}${workflowClientVariableSuffix(sitesToRun, chainSiteId)}`;
    let fileRefs =
      gridFileRefs && gridFileRefs.length > 0
        ? gridFileRefs
        : await resolveStepOutputFileRefsWithRetry(teamId, agentRun.id);
    if (completedConfig.executionKind === "local_dominator_export") {
      if (!fileRefs.some((file) => Boolean(file.url) && isGridCsvFileRef(file))) {
        workflowStepChainStarted.delete(chainKey);
        return;
      }
    } else if (fileRefs.length === 0) {
      const deliverableFiles = await fetchAgentRunDeliverableFiles(teamId, agentRun.id);
      if (deliverableFiles.length > 0) {
        fileRefs = await resolveStepOutputFileRefsWithRetry(teamId, agentRun.id, 8, 1_000);
      }
      if (fileRefs.length === 0) {
        workflowStepChainStarted.delete(chainKey);
        throw new Error(
          `Agent run ${agentRun.id} has no deliverable file refs for workflow chain (${deliverableFiles.length} files in archive).`,
        );
      }
    }
    if (fileRefs.length > 0) {
      const preview =
        completedConfig.executionKind === "local_dominator_export"
          ? "Grid export CSV"
          : typeof agentRun.result?.message === "string" && agentRun.result.message.trim()
            ? agentRun.result.message.trim()
            : completedConfig.title ?? completedNode.label;
      const saved = await saveWorkflowStepOutput(teamId, binding.workflowId, binding.workflowRunId, {
        nodeId: binding.workflowNodeId,
        variableKey,
        scope: "run",
        label: completedConfig.title ?? completedNode.label,
        textPreview: preview,
        agentRunId: agentRun.id,
        fileRefs,
        siteId: chainSiteId || undefined,
      });
      if (saved.ok && saved.output) {
        const withoutPrior = outputs.filter(
          (output) =>
            !(output.nodeId === binding.workflowNodeId && output.agentRunId === agentRun.id),
        );
        outputs.length = 0;
        outputs.push(...withoutPrior, saved.output);
      }
      if (completedConfig.executionKind === "local_dominator_export") {
        const archiveOutput = await syncWorkflowRunArchiveDeliverables({
          teamId,
          workflowId: binding.workflowId,
          workflowRunId: binding.workflowRunId,
          nodes: workflow.nodes,
          outputs,
          agentRunId: agentRun.id,
          textPreview: "Grid export CSV",
          extraFileRefs: fileRefs,
          siteId: chainSiteId || undefined,
          clientSiteIds: sitesToRun,
          siteName: resolveWorkflowSiteContext(chainSiteId || undefined).name,
        });
        if (archiveOutput) outputs.push(archiveOutput);
      }
    }
  }

  await patchWorkflowRun(teamId, binding.workflowId, binding.workflowRunId, {
    status: "running",
    currentNodeId: binding.workflowNodeId,
    errorMessage: null,
  });

  const sequentialCsv = peekWorkflowCsvSequential(binding.workflowRunId);
  if (
    sequentialCsv
    && sequentialCsv.nextNodeId === binding.workflowNodeId
    && sequentialCsv.currentIndex + 1 < sequentialCsv.payloads.length
  ) {
    workflowStepChainStarted.delete(chainKey);
    return;
  }

  const visited = new Set<string>();
  let deferredCompletion = false;
  const tail = await walkRemainingLinearSteps(
    workflow,
    run,
    binding.workflowNodeId,
    outputs,
    callbacks,
    visited,
    clientScope,
  );
  if (!tail.ok) {
    const message = tail.error ?? "Workflow chain step failed";
    await finishDeferredWorkflowRun(teamId, binding.workflowId, binding.workflowRunId, {
      status: "failed",
      errorMessage: message,
    });
    workflowStepChainStarted.delete(chainKey);
    throw new Error(message);
  }
  if (tail.deferWorkflowCompletion) {
    deferredCompletion = true;
  }

  if (deferredCompletion || hasIncompleteWorkflowSteps(workflow, outputs)) {
    workflowStepChainStarted.delete(chainKey);
    return;
  }

  const allChainsDone = completeParallelWorkflowChain(
    teamId,
    binding.workflowId,
    binding.workflowRunId,
  );
  if (allChainsDone) {
    clearParallelWorkflowChains(teamId, binding.workflowId, binding.workflowRunId);
    await finishDeferredWorkflowRun(teamId, binding.workflowId, binding.workflowRunId, {
      status: "done",
      errorMessage: null,
    });
  }
  workflowStepChainStarted.delete(chainKey);
  } catch (err) {
    workflowStepChainStarted.delete(chainKey);
    const binding = readWorkflowAgentBinding(agentRun);
    if (binding) {
      await finishDeferredWorkflowRun(teamId, binding.workflowId, binding.workflowRunId, {
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Workflow chain failed",
      }).catch(() => {});
    }
    throw err;
  }
}

