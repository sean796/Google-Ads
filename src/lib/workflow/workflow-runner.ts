import type { AgentRun } from "@/lib/agent-runs-types";
import { fetchAgentRunDeliverableFiles } from "@/lib/agent-runs-api";
import { resolveStepOutputFileRefsWithRetry } from "@/lib/workflow/workflow-step-file-refs";
import {
  ackPendingWorkflowTrigger,
  claimPendingWorkflowDispatch,
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
  workflowClientScope,
  workflowClientVariableSuffix,
} from "@/lib/workflow/workflow-client-config";
import { finalizeWorkflowBoundAgentRunsOnFailure } from "@/lib/workflow/workflow-agent-run-finalize";
import { readWorkflowAgentBinding } from "@/lib/workflow/workflow-agent-binding";
import {
  findClientNode,
  nodeById,
  resolveWorkflowRunStart,
  resolveWorkflowTestWalkStart,
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
import { validateWorkflowForRun } from "@/lib/workflow/workflow-run-validation";
import { peekWorkflowCsvSequential } from "@/lib/workflow/workflow-csv-rows-stash";
import { isGridCsvFileRef } from "@/lib/entity-page-creator/resolve-upstream-grid-csv";
import {
  walkFromNode,
  walkRemainingLinearSteps,
  workflowRequiresClient,
  resolveWorkflowResumeNodeId,
  resolveWorkflowWalkEntryNodeId,
  actionConfig,
  contentGapGoalMetFromAgentResult,
} from "@/lib/workflow/workflow-step-dispatch";

import type { WorkflowRunCallbacks } from "@/lib/workflow/workflow-run-callbacks";
export { workflowActionStartsFromCompiledTask } from "@/lib/workflow/workflow-step-dispatch";
export type { WorkflowAgentBinding, WorkflowRunCallbacks } from "@/lib/workflow/workflow-run-callbacks";

const workflowDispatchPromises = new Map<string, Promise<{ ok: boolean; error?: string }>>();
const workflowRunsInProgress = new Set<string>();
const workflowStepChainStarted = new Set<string>();

function workflowDispatchKey(teamId: number, workflowId: number, runId: number): string {
  return `${teamId}:${workflowId}:${runId}`;
}

function workflowRunInProgressKey(teamId: number, workflowId: number, runId: number): string {
  return workflowDispatchKey(teamId, workflowId, runId);
}

function markWorkflowRunFinished(teamId: number, workflowId: number, runId: number): void {
  workflowRunsInProgress.delete(workflowRunInProgressKey(teamId, workflowId, runId));
}

async function finishDeferredWorkflowRun(
  teamId: number,
  workflowId: number,
  runId: number,
  patch: { status: "done" | "failed"; errorMessage?: string | null },
): Promise<void> {
  await patchWorkflowRun(teamId, workflowId, runId, {
    status: patch.status,
    errorMessage: patch.errorMessage ?? null,
    currentNodeId: null,
  });
  markWorkflowRunFinished(teamId, workflowId, runId);
  await ackPendingWorkflowTrigger(teamId, workflowId);
}

function workflowStepChainKey(workflowRunId: number, nodeId: string, agentRunId?: number): string {
  if (agentRunId != null && agentRunId > 0) {
    return `${workflowRunId}:${nodeId}:${agentRunId}`;
  }
  return `${workflowRunId}:${nodeId}`;
}

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

export async function executeWorkflowRun(
  teamId: number,
  workflowId: number,
  runId: number,
  callbacks: WorkflowRunCallbacks,
): Promise<{ ok: boolean; error?: string; deferWorkflowCompletion?: boolean }> {
  const workflow = await fetchWorkflow(teamId, workflowId);
  if (!workflow) return { ok: false, error: "Workflow not found" };
  const run = await fetchWorkflowRun(teamId, workflowId, runId);
  if (!run) return { ok: false, error: "Run not found" };

  const existingOutputs = await fetchWorkflowStepOutputs(teamId, workflowId, runId);

  if (run.status === "done") {
    if (!hasIncompleteWorkflowSteps(workflow, existingOutputs)) {
      return { ok: true };
    }
    await patchWorkflowRun(teamId, workflowId, runId, {
      status: "running",
      errorMessage: null,
    });
  } else if (run.status === "cancelled") {
    return { ok: true };
  }
  if (run.status === "failed") {
    return { ok: false, error: run.errorMessage ?? "Run failed" };
  }

  const runKey = workflowRunInProgressKey(teamId, workflowId, runId);
  if (workflowRunsInProgress.has(runKey)) {
    return { ok: true, deferWorkflowCompletion: true };
  }

  const runValidation = validateWorkflowForRun(workflow);
  if (runValidation.ok === false) return { ok: false, error: runValidation.error };

  const runStart = callbacks.skipSetupSteps
    ? resolveWorkflowTestWalkStart(workflow)
    : resolveWorkflowRunStart(workflow);
  if (!runStart) return { ok: false, error: "Workflow has no runnable steps" };

  const clientNode = findClientNode(workflow);
  const clientConfig = (clientNode?.config ?? {}) as WorkflowClientConfig;
  const availableSiteIds = callbacks.listAvailableSiteIds
    ? await Promise.resolve(callbacks.listAvailableSiteIds())
    : [];
  const clientSiteIds = resolveWorkflowClientSiteIds(clientConfig, availableSiteIds);
  if (workflowRequiresClient(workflow)) {
    if (workflowClientScope(clientConfig) === "selected" && clientSiteIds.length === 0) {
      return { ok: false, error: "Select at least one client on the Client step." };
    }
    if (workflowClientScope(clientConfig) === "all" && clientSiteIds.length === 0) {
      return { ok: false, error: "No WordPress sites available. Add clients in Integrations." };
    }
  }

  const outputs = [...existingOutputs];
  const walkNodeId = resolveWorkflowWalkEntryNodeId(
    workflow,
    outputs,
    runStart.firstWalkNodeId,
    callbacks.stopAfterNodeId,
  );

  await patchWorkflowRun(teamId, workflowId, runId, {
    status: "running",
    currentNodeId: walkNodeId,
  });
  workflowRunsInProgress.add(runKey);
  try {
    const result = await walkFromNode(
      workflow,
      run,
      walkNodeId,
      outputs,
      callbacks,
      new Set(),
      buildWorkflowWalkClientScope(outputs, clientSiteIds),
    );
    if (!result.ok) {
      await finalizeWorkflowBoundAgentRunsOnFailure({
        teamId,
        workflow,
        outputs,
        errorMessage: result.error ?? "Workflow step failed",
      });
      await patchWorkflowRun(teamId, workflowId, runId, {
        status: "failed",
        errorMessage: result.error ?? "Workflow step failed",
        currentNodeId: null,
      });
      return result;
    }
    if (result.deferWorkflowCompletion) {
      await patchWorkflowRun(teamId, workflowId, runId, {
        status: "running",
        errorMessage: null,
      });
      return { ok: true, deferWorkflowCompletion: true };
    }
    if (hasIncompleteWorkflowSteps(workflow, outputs)) {
      const resumeNodeId = resolveWorkflowResumeNodeId(workflow, outputs, walkNodeId);
      if (resumeNodeId !== walkNodeId) {
        const tailResult = await walkFromNode(
          workflow,
          run,
          resumeNodeId,
          outputs,
          callbacks,
          new Set(),
          buildWorkflowWalkClientScope(outputs, clientSiteIds),
        );
        if (!tailResult.ok) {
          await finalizeWorkflowBoundAgentRunsOnFailure({
            teamId,
            workflow,
            outputs,
            errorMessage: tailResult.error ?? "Workflow step failed",
          });
          await patchWorkflowRun(teamId, workflowId, runId, {
            status: "failed",
            errorMessage: tailResult.error ?? "Workflow step failed",
            currentNodeId: null,
          });
          return tailResult;
        }
        if (tailResult.deferWorkflowCompletion) {
          await patchWorkflowRun(teamId, workflowId, runId, {
            status: "running",
            errorMessage: null,
          });
          return { ok: true, deferWorkflowCompletion: true };
        }
      }
    }
    if (hasIncompleteWorkflowSteps(workflow, outputs)) {
      await patchWorkflowRun(teamId, workflowId, runId, {
        status: "running",
        errorMessage: null,
      });
      return { ok: true, deferWorkflowCompletion: true };
    }
    clearParallelWorkflowChains(teamId, workflowId, runId);
    await patchWorkflowRun(teamId, workflowId, runId, {
      status: result.ok ? "done" : "failed",
      errorMessage: result.error ?? null,
      currentNodeId: null,
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Workflow run failed";
    await finalizeWorkflowBoundAgentRunsOnFailure({
      teamId,
      workflow,
      outputs,
      errorMessage: message,
    }).catch(() => {});
    await patchWorkflowRun(teamId, workflowId, runId, {
      status: "failed",
      errorMessage: message,
      currentNodeId: null,
    }).catch(() => {});
    return { ok: false, error: message };
  } finally {
    markWorkflowRunFinished(teamId, workflowId, runId);
  }
}

export async function cancelWorkflowRunForAgentRun(
  teamId: number,
  agentRun: AgentRun,
): Promise<void> {
  const binding = readWorkflowAgentBinding(agentRun);
  if (!binding) return;
  clearParallelWorkflowChains(teamId, binding.workflowId, binding.workflowRunId);
  markWorkflowRunFinished(teamId, binding.workflowId, binding.workflowRunId);
  await ackPendingWorkflowTrigger(teamId, binding.workflowId);
  await patchWorkflowRun(teamId, binding.workflowId, binding.workflowRunId, {
    status: "cancelled",
    errorMessage: "Cancelled",
    currentNodeId: null,
  });
}

export async function failWorkflowRunForAgentRun(
  teamId: number,
  agentRun: AgentRun,
  errorMessage: string,
): Promise<void> {
  const binding = readWorkflowAgentBinding(agentRun);
  if (!binding) return;
  clearParallelWorkflowChains(teamId, binding.workflowId, binding.workflowRunId);
  markWorkflowRunFinished(teamId, binding.workflowId, binding.workflowRunId);
  await ackPendingWorkflowTrigger(teamId, binding.workflowId);
  await patchWorkflowRun(teamId, binding.workflowId, binding.workflowRunId, {
    status: "failed",
    errorMessage: errorMessage.trim() || "Agent run failed",
    currentNodeId: null,
  });
}

export async function dispatchWorkflowRunExecution(
  teamId: number,
  workflowId: number,
  runId: number,
  callbacks: WorkflowRunCallbacks,
): Promise<{ ok: boolean; error?: string; deferWorkflowCompletion?: boolean }> {
  const dispatchKey = workflowDispatchKey(teamId, workflowId, runId);
  const inFlight = workflowDispatchPromises.get(dispatchKey);
  if (inFlight) return inFlight;

  const promise = executeWorkflowRun(teamId, workflowId, runId, callbacks).finally(() => {
    workflowDispatchPromises.delete(dispatchKey);
  });
  workflowDispatchPromises.set(dispatchKey, promise);
  return promise;
}

export async function handlePendingWorkflowDispatch(
  teamId: number,
  workflowId: number,
  runId: number | undefined,
  callbacks: WorkflowRunCallbacks,
): Promise<{ ok: boolean; error?: string }> {
  if (!runId) {
    await ackPendingWorkflowTrigger(teamId, workflowId);
    return { ok: true };
  }

  const dispatchKey = workflowDispatchKey(teamId, workflowId, runId);
  const inFlight = workflowDispatchPromises.get(dispatchKey);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const claim = await claimPendingWorkflowDispatch(teamId, workflowId, runId);
      if (!claim.ok) {
        return { ok: false, error: claim.error ?? "Could not claim workflow dispatch" };
      }
      if (!claim.claimed) {
        return { ok: true };
      }
      const result = await executeWorkflowRun(teamId, workflowId, runId, callbacks);
      if (!result.deferWorkflowCompletion) {
        await ackPendingWorkflowTrigger(teamId, workflowId);
      }
      return result;
    } finally {
      workflowDispatchPromises.delete(dispatchKey);
    }
  })();
  workflowDispatchPromises.set(dispatchKey, promise);
  return promise;
}
