import {
  fetchAgentRun,
  patchAgentRun,
} from "@/lib/agent-runs-api";
import { flushAgentRunCheckpointPatch } from "@/lib/agent-runs/agent-run-checkpoint";
import { appendAgentRunStepLocally, patchAgentRunInList } from "@/lib/agent-runs/agent-runs-local-patch";
import {
  clearPostCreatorProof,
  initPostCreatorProof,
  resolvePostCreatorPostCountFromRun,
} from "@/lib/agent-runs/agent-run-post-creator-proof";
import { resolveAgentRunRecipeKey } from "@/lib/agent-runs/agent-run-navigation";
import { runAgentRunHarness } from "@/lib/agent-runs/harness-registry";
import { buildAgentRunBatchKey } from "@/lib/agent-runs/agent-run-batch-key";
import { agentRunHasResumeProgress, getAgentRunResumePoint } from "@/lib/agent-runs/agent-run-resume";
import { appendAgentRunStep, finalizeOpenAgentRunSteps } from "@/lib/agent-runs/agent-run-step";
import { AGENT_RUN_STEP_KEYS } from "@/lib/agent-runs/agent-run-step-keys";
import { chainWorkflowAfterAgentComplete } from "@/lib/workflow/workflow-grid-export-chain";
import { failWorkflowRunForAgentRun } from "@/lib/workflow/workflow-runner";
import { mergeAgentRunDeliveryFields } from "@/lib/agent-runs/agent-run-log-format";
import { runWorkflowBoundDeliverySteps } from "@/lib/workflow/workflow-bound-automation-runner";
import { runTaskExecutionClientHarness } from "@/lib/agent-runs/run-task-execution-client";
import { contentGapResultFromRun } from "@/lib/agent-runs/run-content-gap-check-client-harness";
import type { AgentRun, AgentRunResult } from "@/lib/agent-runs-types";
import { isAgentRunTerminal } from "@/lib/agent-runs-types";
import type { WordPressSite } from "@/components/integrations/types";
import {
  loadSitesForAgentRun,
  mergeAgentRunSiteFromSeed,
} from "@/lib/agent-runs/resolve-agent-run-site";
import { completeTaskExecution, fetchTaskExecution, reopenTaskExecutionForResume } from "@/lib/tasks-api";
import {
  clearPersistedAgentRunCancellations,
  isAgentRunCancelledPersisted,
  persistAgentRunCancelled,
  readPersistedCancelledAgentRunIds,
} from "@/lib/agent-runs/agent-run-cancellation-storage";

const activeRunIds = new Set<number>();
const TAB_SESSION_KEY = "neo_pulse_tab_session_id";

function tabSessionId(): string {
  const existing = sessionStorage.getItem(TAB_SESSION_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  sessionStorage.setItem(TAB_SESSION_KEY, next);
  return next;
}

function tryAcquireRunLease(runId: number): boolean {
  const key = `neo_pulse_agent_run_${runId}`;
  const owner = tabSessionId();
  const existing = sessionStorage.getItem(key);
  if (existing && existing !== owner) return false;
  sessionStorage.setItem(key, owner);
  return true;
}

function releaseRunLease(runId: number): void {
  const key = `neo_pulse_agent_run_${runId}`;
  if (sessionStorage.getItem(key) === tabSessionId()) {
    sessionStorage.removeItem(key);
  }
}

class AgentRunCancelledError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "AgentRunCancelledError";
  }
}

const locallyCancelledRunIds = new Set<number>();

function hydrateCancelledRunsForTeam(teamId: number): void {
  for (const runId of readPersistedCancelledAgentRunIds(teamId)) {
    locallyCancelledRunIds.add(runId);
  }
}

export function markAgentRunCancelledLocally(runId: number, teamId?: number): void {
  locallyCancelledRunIds.add(runId);
  if (teamId != null && teamId > 0) {
    persistAgentRunCancelled(teamId, runId);
  }
}

export function markAgentRunsCancelledLocally(
  runIds: Iterable<number>,
  teamId?: number,
): void {
  for (const runId of runIds) {
    markAgentRunCancelledLocally(runId, teamId);
  }
}

export function clearLocalAgentRunCancellations(teamId?: number): void {
  locallyCancelledRunIds.clear();
  clearPersistedAgentRunCancellations(teamId);
}

export function isAgentRunCancelledLocally(runId: number, teamId?: number): boolean {
  if (locallyCancelledRunIds.has(runId)) return true;
  if (teamId != null && isAgentRunCancelledPersisted(teamId, runId)) {
    locallyCancelledRunIds.add(runId);
    return true;
  }
  return false;
}

async function isRunCancelled(teamId: number, runId: number): Promise<boolean> {
  if (isAgentRunCancelledLocally(runId, teamId)) return true;
  const run = await fetchAgentRun(teamId, runId);
  if (run?.status === "cancelled") {
    markAgentRunCancelledLocally(runId, teamId);
    return true;
  }
  return false;
}

async function markRunCancelled(teamId: number, run: AgentRun): Promise<void> {
  await patchAgentRun(teamId, run.id, {
    status: "cancelled",
    step: { label: "Run was cancelled.", status: "error" },
  });
}

async function closeRunFromTaskExecution(run: AgentRun): Promise<AgentRunResult | "cancelled" | "failed" | null> {
  const executionId = run.plan?.taskExecutionId;
  if (!executionId || !run.teamId) return null;

  const { execution } = await fetchTaskExecution(run.teamId, executionId);
  if (!execution) return null;

  if (execution.status === "completed") {
    const updated =
      typeof run.result?.updated === "number"
        ? run.result.updated
        : run.result?.checkpoint?.uploadedUrls?.length ||
          run.result?.checkpoint?.completedUrls?.length ||
          1;
    const execResult =
      execution.result && typeof execution.result === "object"
        ? (execution.result as Record<string, unknown>)
        : undefined;
    const mergedResult = mergeAgentRunDeliveryFields(
      {
        ...(run.result ?? {}),
        updated,
        message:
          (typeof run.result?.message === "string" && run.result.message.trim())
          || execution.progress?.message
          || "Task execution completed",
        batchKey: run.clientBatchKey || run.result?.batchKey,
      },
      execResult,
    );
    await patchAgentRun(run.teamId, run.id, {
      status: "done",
      result: mergedResult,
      clientBatchKey: run.clientBatchKey || run.result?.batchKey,
    });
    return {
      updated,
      message: execution.progress?.message || "Task execution completed",
      batchKey: run.clientBatchKey || run.result?.batchKey,
      ...(mergedResult ?? {}),
    };
  }

  if (execution.status === "failed") {
    if (
      agentRunHasResumeProgress(run)
      && resolveAgentRunRecipeKey(run) !== "chatgpt_website_audit"
    ) {
      await reopenTaskExecutionForResume(run.teamId, executionId);
      return null;
    }
    const message = execution.error || execution.progress?.error || "Task execution failed";
    await patchAgentRun(run.teamId, run.id, {
      status: "failed",
      errorMessage: message,
      step: { label: message, status: "error" },
    });
    return "failed";
  }

  if (execution.status === "cancelled") {
    await markRunCancelled(run.teamId, run);
    return "cancelled";
  }

  return null;
}

function isServerExecutionRun(run: AgentRun): boolean {
  return run.result?.executionMode === "server" || run.plan?.executionMode === "server";
}

const inflightRuns = new Map<number, Promise<void>>();
/** Client harness started once per run id; blocks auto re-dispatch until explicit resume. */
const attemptedClientRunIds = new Set<number>();

export function markClientRunAttempted(runId: number): void {
  if (runId > 0) attemptedClientRunIds.add(runId);
}

export function clearClientRunAttempted(runId: number): void {
  attemptedClientRunIds.delete(runId);
}

export function hasClientRunAttempted(runId: number): boolean {
  return attemptedClientRunIds.has(runId);
}

export function isAgentRunInflight(runId: number): boolean {
  return inflightRuns.has(runId);
}

export function waitForAgentRunInflight(runId: number): Promise<void> {
  return inflightRuns.get(runId) ?? Promise.resolve();
}

export function executeAgentRun(run: AgentRun, sites: WordPressSite[]): Promise<void> {
  const existing = inflightRuns.get(run.id);
  if (existing) return existing;

  const promise = executeAgentRunOnce(run, sites).finally(() => {
    inflightRuns.delete(run.id);
  });
  inflightRuns.set(run.id, promise);
  return promise;
}

async function executeAgentRunOnce(
  run: AgentRun,
  sites: WordPressSite[],
): Promise<void> {
  const teamId = run.teamId;
  if (!tryAcquireRunLease(run.id)) {
    const inflight = inflightRuns.get(run.id);
    if (inflight) {
      await inflight;
      return;
    }
    const key = `neo_pulse_agent_run_${run.id}`;
    if (sessionStorage.getItem(key) === tabSessionId()) {
      sessionStorage.removeItem(key);
    }
    if (!tryAcquireRunLease(run.id)) {
      await waitForAgentRunInflight(run.id);
      const latest = (await fetchAgentRun(teamId, run.id)) ?? run;
      if (isAgentRunTerminal(latest.status)) {
        return;
      }
      if (!tryAcquireRunLease(run.id)) {
        return;
      }
    }
  }
  activeRunIds.add(run.id);
  markClientRunAttempted(run.id);

  let activeRun = run;

  try {
    if (await isRunCancelled(teamId, run.id)) {
      return;
    }

    if (isServerExecutionRun(run)) {
      return;
    }

    const latestForResume = (await fetchAgentRun(teamId, run.id)) ?? run;
    activeRun = mergeAgentRunSiteFromSeed(latestForResume, run);

    if (latestForResume.status === "done") {
      return;
    }

    const recipeKeyEarly = resolveAgentRunRecipeKey(activeRun);
    if (
      recipeKeyEarly === "chatgpt_website_audit"
      && (activeRun.errorMessage?.trim() || activeRun.status === "failed")
    ) {
      patchAgentRunInList(activeRun.id, {
        status: "failed",
        errorMessage: activeRun.errorMessage?.trim() || "ChatGPT audit failed.",
      });
      if (activeRun.status !== "failed") {
        await patchAgentRun(teamId, activeRun.id, {
          status: "failed",
          errorMessage: activeRun.errorMessage?.trim() || "ChatGPT audit failed.",
        });
      }
      return;
    }

    const resumePoint = getAgentRunResumePoint(latestForResume);
    const isResume = resumePoint != null;

    const alreadyCounted = contentGapResultFromRun(activeRun);
    if (alreadyCounted) {
      patchAgentRunInList(activeRun.id, {
        status: "done",
        errorMessage: "",
        result: { ...(activeRun.result ?? {}), ...alreadyCounted },
        clientBatchKey: alreadyCounted.batchKey,
      });
      await patchAgentRun(teamId, activeRun.id, {
        status: "done",
        errorMessage: "",
        result: { ...(activeRun.result ?? {}), ...alreadyCounted },
        clientBatchKey: alreadyCounted.batchKey,
      });
      if (activeRun.source === "workflow" && alreadyCounted.goalMet === true) {
        void chainWorkflowAfterAgentComplete({
          ...activeRun,
          status: "done",
          result: { ...(activeRun.result ?? {}), ...alreadyCounted },
        }).catch(() => {});
      }
      return;
    }

    const closed = await closeRunFromTaskExecution(activeRun);
    if (closed && closed !== "failed" && closed !== "cancelled") {
      return;
    }
    if (closed === "failed" || closed === "cancelled") {
      return;
    }

    if (isAgentRunCancelledLocally(activeRun.id, teamId)) {
      return;
    }

    patchAgentRunInList(activeRun.id, { status: "running" });

    const recipeKey = resolveAgentRunRecipeKey(activeRun);
    const skipStartingStep = recipeKey === "content_gap_check";

    if (!isResume) {
      clearPostCreatorProof(activeRun.id);
      if (recipeKey === "post_creator") {
        const postCount = resolvePostCreatorPostCountFromRun(activeRun);
        if (postCount >= 1) {
          initPostCreatorProof(
            activeRun.id,
            postCount,
            activeRun.plan?.clientRunContract?.featuredImage !== false,
          );
        }
      }
      if (!skipStartingStep) {
        await appendAgentRunStep(
          teamId,
          activeRun.id,
          { label: "Starting…", status: "running", stepKey: AGENT_RUN_STEP_KEYS.starting },
          activeRun,
        );
      }
      await patchAgentRun(teamId, activeRun.id, { status: "running" });
    } else {
      await patchAgentRun(teamId, activeRun.id, { status: "running" });
      if (recipeKey === "post_creator") {
        const postCount =
          typeof resumePoint!.payload.postCount === "number"
            ? resumePoint!.payload.postCount
            : resolvePostCreatorPostCountFromRun(activeRun);
        if (postCount >= 1) {
          initPostCreatorProof(
            activeRun.id,
            postCount,
            activeRun.plan?.clientRunContract?.featuredImage !== false,
          );
        }
      }
    }

    const pool = await loadSitesForAgentRun(activeRun, sites);
    const ctx = {
      onStep: async (
        label: string,
        status: "pending" | "running" | "done" | "error" = "running",
        resumePayload?: Record<string, unknown>,
        stepKey?: string,
      ) => {
        const current = (await fetchAgentRun(teamId, activeRun.id)) ?? activeRun;
        await appendAgentRunStep(teamId, activeRun.id, { label, status, resumePayload, stepKey }, current);
      },
      isCancelled: async () => {
        if (isAgentRunCancelledLocally(activeRun.id, teamId)) return true;
        return isRunCancelled(teamId, activeRun.id);
      },
      resumePoint,
      isResume,
      sites: pool,
    };

    if (activeRun.id > 0) {
      const clientBatchKey = buildAgentRunBatchKey(activeRun.id);
      if (activeRun.clientBatchKey !== clientBatchKey) {
        patchAgentRunInList(activeRun.id, { clientBatchKey });
        await patchAgentRun(teamId, activeRun.id, { clientBatchKey });
        activeRun = { ...activeRun, clientBatchKey };
      }
    }

    let result: AgentRunResult;

    if (activeRun.plan?.completedOnServer) {
      result = { message: "Completed on server", updated: 1 };
    } else if (activeRun.plan?.clientRunContract && activeRun.plan?.taskExecutionId) {
      result = await runTaskExecutionClientHarness(activeRun, pool, ctx);
    } else {
      result = await runAgentRunHarness(activeRun, ctx);
    }

    if (await isRunCancelled(teamId, run.id)) {
      await markRunCancelled(teamId, activeRun);
      return;
    }

    if (isAgentRunCancelledLocally(activeRun.id, teamId)) {
      await markRunCancelled(teamId, activeRun);
      return;
    }

    await flushAgentRunCheckpointPatch(teamId, activeRun.id);
    await finalizeOpenAgentRunSteps(teamId, activeRun.id, activeRun);

    const contentGapGoalMet = result.goalMet === true;
    const recipeKeyAfter = resolveAgentRunRecipeKey(activeRun);
    const workflowThenDelivery =
      activeRun.source === "workflow" && activeRun.plan?.workflowThenDelivery === true;
    // Content gap walk owns the next agents. Target met: do not run Then. LD has its own continue path.
    const runBoundThenDelivery =
      workflowThenDelivery
      && recipeKeyAfter !== "local_dominator_export"
      && recipeKeyAfter !== "content_gap_check";

    if (runBoundThenDelivery) {
      await runWorkflowBoundDeliverySteps({
        teamId,
        run: activeRun,
        onStep: ctx.onStep,
      });
    }

    const terminalStatus = "done";

    patchAgentRunInList(activeRun.id, {
      status: terminalStatus,
      errorMessage: "",
      result,
      clientBatchKey: result.batchKey,
    });
    await patchAgentRun(teamId, activeRun.id, {
      status: terminalStatus,
      errorMessage: "",
      result,
      clientBatchKey: result.batchKey,
    });

    // Gap check: walk already continues when a gap remains; only chain when target met (stop + finish).
    if (
      activeRun.source === "workflow"
      && (recipeKeyAfter !== "content_gap_check" || contentGapGoalMet)
    ) {
      void chainWorkflowAfterAgentComplete({ ...activeRun, status: terminalStatus, result }).catch(() => {});
    }
  } catch (err) {
    if (err instanceof AgentRunCancelledError || (err instanceof Error && err.message === "Cancelled")) {
      await markRunCancelled(teamId, activeRun);
      return;
    }

    if (await isRunCancelled(teamId, run.id)) {
      await markRunCancelled(teamId, activeRun);
      return;
    }

    const latestAfterInflight = (await fetchAgentRun(teamId, activeRun.id)) ?? activeRun;
    if (latestAfterInflight.status === "done") {
      return;
    }

    const message = err instanceof Error ? err.message : "Agent run failed";
    patchAgentRunInList(activeRun.id, {
      status: "failed",
      errorMessage: message,
    });
    await flushAgentRunCheckpointPatch(teamId, activeRun.id);
    const latest = await fetchAgentRun(teamId, activeRun.id);
    await appendAgentRunStep(
      teamId,
      activeRun.id,
      { label: message, status: "error" },
      latest ?? activeRun,
    );
    await patchAgentRun(teamId, activeRun.id, {
      status: "failed",
      errorMessage: message,
      ...(latest?.result ? { result: latest.result } : {}),
    });

    if (activeRun.source === "workflow") {
      await failWorkflowRunForAgentRun(teamId, activeRun, message).catch(() => {});
    }

    const executionId = activeRun.plan?.taskExecutionId;
    if (executionId && teamId > 0) {
      await completeTaskExecution(teamId, executionId, { ok: false, error: message });
    }
  } finally {
    activeRunIds.delete(run.id);
    releaseRunLease(run.id);
  }
}

export function isAgentRunActive(runId: number): boolean {
  return activeRunIds.has(runId);
}

export function filterRunnableRuns(runs: AgentRun[]): AgentRun[] {
  return runs.filter(
    (r) =>
      r.status === "queued" &&
      !hasClientRunAttempted(r.id) &&
      !isAgentRunInflight(r.id) &&
      !activeRunIds.has(r.id) &&
      !isAgentRunCancelledLocally(r.id, r.teamId) &&
      r.result?.executionMode !== "server" &&
      r.plan?.executionMode !== "server",
  );
}

export function hydrateAgentRunCancellationsForTeam(teamId: number): void {
  hydrateCancelledRunsForTeam(teamId);
}

export function hasActiveRuns(runs: AgentRun[]): boolean {
  return runs.some((r) => r.status === "queued" || r.status === "running");
}

export function hasPollingRuns(runs: AgentRun[]): boolean {
  return runs.some((r) => !isAgentRunTerminal(r.status));
}

export function hasTerminalRuns(runs: AgentRun[]): boolean {
  return runs.some((r) => isAgentRunTerminal(r.status));
}
