import { fetchAgentRunArtifacts, fetchAgentRunCsvContent } from "@/lib/agent-runs-api";
import { resolveAgentRunRecipeKey } from "@/lib/agent-runs/agent-run-navigation";
import type { AgentRun } from "@/lib/agent-runs-types";
import { isGridCsvFileRef } from "@/lib/entity-page-creator/resolve-upstream-grid-csv";
import {
  ackPendingWorkflowTrigger,
  fetchWorkflow,
  fetchWorkflowRun,
  fetchWorkflowStepOutputs,
  patchWorkflowRun,
} from "@/lib/workflow/workflow-api";
import { readWorkflowAgentBinding, type WorkflowAgentBindingFields } from "@/lib/workflow/workflow-agent-binding";
import { stashWorkflowGridCsv } from "@/lib/workflow/workflow-grid-csv-stash";
import { downstreamWorkflowAgentAlreadyStarted } from "@/lib/workflow/workflow-node-agent-dedupe";
import { hasIncompleteWorkflowSteps } from "@/lib/workflow/workflow-run-completion";
import { runNextWorkflowAgentStep, type WorkflowRunCallbacks } from "@/lib/workflow/workflow-runner";
import type { WorkflowStepOutputFileRef } from "@/lib/workflow/workflow-types";

const continueCompleted = new Set<string>();
const continueFlights = new Map<string, Promise<boolean>>();

function continueKey(binding: WorkflowAgentBindingFields, agentRunId: number): string {
  return `${binding.workflowRunId}:${binding.workflowNodeId}:${agentRunId}`;
}

export function isLdWorkflowExportRun(run: AgentRun): boolean {
  return run.source === "workflow" && resolveAgentRunRecipeKey(run) === "local_dominator_export";
}

function usesWorkflowThenDelivery(run: AgentRun): boolean {
  return run.source === "workflow" && run.plan?.workflowThenDelivery === true;
}

export function isWorkflowThenContinuationCandidate(run: AgentRun): boolean {
  if (run.source !== "workflow" || run.status !== "done") return false;
  if (isLdWorkflowExportRun(run)) return true;
  if (usesWorkflowThenDelivery(run)) return true;
  return readWorkflowAgentBinding(run) != null;
}

export async function isLdGridCsvReceived(
  teamId: number,
  binding: WorkflowAgentBindingFields,
  agentRunId: number,
): Promise<{ ready: boolean; fileRefs: WorkflowStepOutputFileRef[] }> {
  const outputs = await fetchWorkflowStepOutputs(teamId, binding.workflowId, binding.workflowRunId);
  const stepOutput = outputs.find(
    (output) => output.nodeId === binding.workflowNodeId && output.agentRunId === agentRunId,
  );
  const fromStep = (stepOutput?.fileRefs ?? []).filter((file) => file.url && isGridCsvFileRef(file));
  if (fromStep.length > 0) {
    return { ready: true, fileRefs: fromStep };
  }

  const artifacts = await fetchAgentRunArtifacts(teamId, agentRunId);
  const fromArtifacts = artifacts
    .filter(
      (artifact) =>
        artifact.url &&
        (artifact.stepKey === "grid_export" ||
          isGridCsvFileRef({ name: artifact.name, mime: artifact.mime })),
    )
    .filter((artifact) => isGridCsvFileRef({ name: artifact.name, mime: artifact.mime }))
    .map((artifact) => ({
      name: artifact.name,
      url: artifact.url,
      mime: artifact.mime,
    }));
  if (fromArtifacts.length > 0) {
    return { ready: true, fileRefs: fromArtifacts };
  }

  return { ready: false, fileRefs: [] };
}

async function ensureWorkflowRunActiveForContinuation(
  teamId: number,
  binding: WorkflowAgentBindingFields,
): Promise<boolean> {
  const [workflowRun, workflow, outputs] = await Promise.all([
    fetchWorkflowRun(teamId, binding.workflowId, binding.workflowRunId),
    fetchWorkflow(teamId, binding.workflowId),
    fetchWorkflowStepOutputs(teamId, binding.workflowId, binding.workflowRunId),
  ]);
  if (!workflowRun || !workflow) {
    return false;
  }
  if (!hasIncompleteWorkflowSteps(workflow, outputs)) {
    return false;
  }
  // Entity may have failed early (no CSV yet) and marked the workflow failed; reopen to continue.
  if (workflowRun.status === "done" || workflowRun.status === "failed") {
    await patchWorkflowRun(teamId, binding.workflowId, binding.workflowRunId, {
      status: "running",
      errorMessage: null,
    });
  } else if (workflowRun.status !== "running") {
    return false;
  }
  return true;
}

async function continueWorkflowAfterThenAgentOnce(
  teamId: number,
  agentRun: AgentRun,
  callbacks: WorkflowRunCallbacks,
): Promise<boolean> {
  if (agentRun.status !== "done" || isLdWorkflowExportRun(agentRun)) {
    return false;
  }

  const binding = readWorkflowAgentBinding(agentRun);
  if (!binding) {
    return false;
  }

  const key = continueKey(binding, agentRun.id);
  if (continueCompleted.has(key)) {
    return false;
  }

  const workflowRun = await fetchWorkflowRun(teamId, binding.workflowId, binding.workflowRunId);
  if (!workflowRun) {
    return false;
  }
  if (!(await ensureWorkflowRunActiveForContinuation(teamId, binding))) {
    return false;
  }

  continueCompleted.add(key);
  try {
    await runNextWorkflowAgentStep(teamId, agentRun, callbacks);
    const workflow = await fetchWorkflow(teamId, binding.workflowId);
    const outputs = await fetchWorkflowStepOutputs(teamId, binding.workflowId, binding.workflowRunId);
    if (workflow && hasIncompleteWorkflowSteps(workflow, outputs)) {
      continueCompleted.delete(key);
      return false;
    }
    await ackPendingWorkflowTrigger(teamId, binding.workflowId);
    return true;
  } catch {
    continueCompleted.delete(key);
    return false;
  }
}

async function continueWorkflowOnce(
  teamId: number,
  agentRun: AgentRun,
  callbacks: WorkflowRunCallbacks,
): Promise<boolean> {
  if (isLdWorkflowExportRun(agentRun)) {
    return continueWorkflowAfterLdExportOnce(teamId, agentRun, callbacks);
  }
  return continueWorkflowAfterThenAgentOnce(teamId, agentRun, callbacks);
}

async function continueWorkflowAfterLdExportOnce(
  teamId: number,
  agentRun: AgentRun,
  callbacks: WorkflowRunCallbacks,
): Promise<boolean> {
  if (!isLdWorkflowExportRun(agentRun) || agentRun.status !== "done") {
    return false;
  }

  const binding = readWorkflowAgentBinding(agentRun);
  if (!binding) {
    return false;
  }

  const key = continueKey(binding, agentRun.id);
  if (continueCompleted.has(key)) {
    return false;
  }

  const workflowRun = await fetchWorkflowRun(teamId, binding.workflowId, binding.workflowRunId);
  if (!workflowRun) {
    return false;
  }

  const csv = await isLdGridCsvReceived(teamId, binding, agentRun.id);
  if (!csv.ready) {
    return false;
  }

  const workflow = await fetchWorkflow(teamId, binding.workflowId);
  if (!workflow) {
    return false;
  }

  const outputs = await fetchWorkflowStepOutputs(teamId, binding.workflowId, binding.workflowRunId);
  if (
    await downstreamWorkflowAgentAlreadyStarted(
      teamId,
      workflow,
      binding.workflowRunId,
      binding.workflowNodeId,
      outputs,
    )
  ) {
    continueCompleted.add(key);
    await ensureWorkflowRunActiveForContinuation(teamId, binding);
    await ackPendingWorkflowTrigger(teamId, binding.workflowId);
    return false;
  }

  if (!(await ensureWorkflowRunActiveForContinuation(teamId, binding))) {
    return false;
  }

  continueCompleted.add(key);
  try {
    const csvText = await fetchAgentRunCsvContent(teamId, agentRun.id);
    if (csvText) {
      stashWorkflowGridCsv(binding.workflowRunId, csvText, csv.fileRefs);
    }
    await runNextWorkflowAgentStep(teamId, agentRun, callbacks, csv.fileRefs);
    const freshOutputs = await fetchWorkflowStepOutputs(teamId, binding.workflowId, binding.workflowRunId);
    if (hasIncompleteWorkflowSteps(workflow, freshOutputs)) {
      continueCompleted.delete(key);
      return false;
    }
    await ackPendingWorkflowTrigger(teamId, binding.workflowId);
    return true;
  } catch {
    continueCompleted.delete(key);
    return false;
  }
}

export async function tryContinueWorkflowAfterAgentComplete(
  teamId: number,
  agentRun: AgentRun,
  callbacks: WorkflowRunCallbacks,
): Promise<boolean> {
  const binding = readWorkflowAgentBinding(agentRun);
  if (!binding) {
    return false;
  }

  const key = continueKey(binding, agentRun.id);
  const inFlight = continueFlights.get(key);
  if (inFlight) {
    return inFlight;
  }

  const flight = continueWorkflowOnce(teamId, agentRun, callbacks);
  continueFlights.set(key, flight);
  try {
    return await flight;
  } finally {
    continueFlights.delete(key);
  }
}

/** @deprecated Use tryContinueWorkflowAfterAgentComplete */
export async function tryContinueWorkflowAfterLdExport(
  teamId: number,
  agentRun: AgentRun,
  callbacks: WorkflowRunCallbacks,
): Promise<boolean> {
  return tryContinueWorkflowAfterAgentComplete(teamId, agentRun, callbacks);
}

export async function tickLdWorkflowContinueWatchdog(
  teamId: number,
  runs: AgentRun[],
  callbacks: WorkflowRunCallbacks,
): Promise<void> {
  const candidates = runs.filter((run) => isWorkflowThenContinuationCandidate(run));
  for (const run of candidates) {
    await tryContinueWorkflowAfterAgentComplete(teamId, run, callbacks);
  }
}
