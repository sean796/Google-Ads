import {
  fetchWorkflow,
  fetchWorkflowRun,
  fetchWorkflowStepOutputs,
  patchWorkflowRun,
} from "@/lib/workflow/workflow-api";
import { buildWorkflowWalkClientScope } from "@/lib/workflow/workflow-client-context";
import {
  resolveWorkflowClientSiteIds,
  workflowClientScope,
} from "@/lib/workflow/workflow-client-config";
import { finalizeWorkflowBoundAgentRunsOnFailure } from "@/lib/workflow/workflow-agent-run-finalize";
import {
  findClientNode,
  resolveWorkflowRunStart,
  resolveWorkflowTestWalkStart,
} from "@/lib/workflow/workflow-graph-utils";
import type { WorkflowClientConfig } from "@/lib/workflow/workflow-types";
import { clearParallelWorkflowChains } from "@/lib/workflow/workflow-parallel-completion";
import { hasIncompleteWorkflowSteps } from "@/lib/workflow/workflow-run-completion";
import { validateWorkflowForRun } from "@/lib/workflow/workflow-run-validation";
import {
  walkFromNode,
  workflowRequiresClient,
  resolveWorkflowResumeNodeId,
  resolveWorkflowWalkEntryNodeId,
} from "@/lib/workflow/workflow-step-dispatch";
import type { WorkflowRunCallbacks } from "@/lib/workflow/workflow-run-callbacks";
import {
  markWorkflowRunFinished,
  workflowRunInProgressKey,
  workflowRunsInProgress,
} from "@/lib/workflow/workflow-runner-state";

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

