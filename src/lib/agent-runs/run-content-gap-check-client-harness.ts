import type { WordPressSite } from "@/components/integrations/types";
import { getStoredSites } from "@/components/integrations/storage";
import type { AgentRunHarnessContext } from "@/lib/agent-runs/harness-registry";
import { AGENT_RUN_STEP_KEYS } from "@/lib/agent-runs/agent-run-step-keys";
import { resolveContentGapCheckExecutionPayload } from "@/lib/content-gap/apply-editorial-package-content-gap-target";
import {
  contentGapOutcomeStepLabel,
  formatContentGapRunMessage,
  resolveContentGapCount,
} from "@/lib/content-gap/resolve-content-gap-count";
import type { AgentRun, AgentRunResult } from "@/lib/agent-runs-types";
import { patchAgentRun } from "@/lib/agent-runs-api";
import type { TaskExecutionClientRunContract, TaskExecutionPayload } from "@/lib/tasks-types";
import { patchTaskExecutionProgress } from "@/lib/tasks-api";
import { effectiveSaveLocalArchive } from "@/lib/schedule-output-destination";
import { automationTitleFromRun } from "@/lib/automation-email-delivery";
import { completeAgentRunExecution } from "@/lib/workflow/workflow-deliveries-skip";
import { patchAgentRunInList } from "@/lib/agent-runs/agent-runs-local-patch";

function resolveSite(siteId: string, sites: WordPressSite[]): WordPressSite {
  const fromList = sites.find((s) => s.id === siteId);
  if (fromList) return fromList;
  const stored = getStoredSites().find((s) => s.id === siteId);
  if (stored) return stored;
  throw new Error("WordPress site not found for this content gap check.");
}

function executionPayloadFromSource(
  source: TaskExecutionClientRunContract | TaskExecutionPayload | Record<string, unknown>,
): TaskExecutionPayload {
  return source as TaskExecutionPayload;
}

/** Reuse a finished gap count instead of counting again. */
export function contentGapResultFromRun(run: AgentRun): AgentRunResult | null {
  const result = run.result;
  if (!result || typeof result.gapCount !== "number") return null;
  const goalMet = result.goalMet === true || result.gapCount === 0;
  const message =
    typeof result.message === "string" && result.message.trim()
      ? result.message.trim()
      : goalMet
        ? "Target met"
        : `Gap found: ${result.gapCount}`;
  return {
    message,
    gapCount: result.gapCount,
    goalMet,
    postCount: typeof result.postCount === "number" ? result.postCount : result.gapCount,
    batchKey: run.clientBatchKey || String(run.id),
  };
}

function existingGapStepLabel(existing: AgentRunResult): string {
  if (existing.goalMet) return "Target met";
  const count = typeof existing.gapCount === "number" ? existing.gapCount : 0;
  return `Gap found: ${count}`;
}

export async function runContentGapCheckClientHarness(
  run: AgentRun,
  site: WordPressSite,
  contract: TaskExecutionClientRunContract,
  executionId: number,
  ctx: AgentRunHarnessContext,
  batchKey: string,
): Promise<AgentRunResult> {
  const existing = contentGapResultFromRun(run);
  if (existing) {
    await ctx.onStep?.(existingGapStepLabel(existing), "done", undefined, AGENT_RUN_STEP_KEYS.contentGap);
    return existing;
  }

  const payload = resolveContentGapCheckExecutionPayload(executionPayloadFromSource(contract), site);
  const saveLocalArchive = effectiveSaveLocalArchive("content_gap_check", contract);

  await ctx.onStep?.("Counting content", "running", undefined, AGENT_RUN_STEP_KEYS.contentGap);
  await patchTaskExecutionProgress(run.teamId, executionId, {
    stepId: "count",
    message: "Checking content counts…",
    progress: 0.2,
  });

  const gap = await resolveContentGapCount(site, payload);
  const summaryMessage = formatContentGapRunMessage(gap);
  const outcomeLabel = contentGapOutcomeStepLabel(gap);

  // One step row: replace "Counting content" with the outcome and mark done.
  await ctx.onStep?.(outcomeLabel, "done", undefined, AGENT_RUN_STEP_KEYS.contentGap);

  const countedResult = {
    message: gap.contextText,
    gapCount: gap.gapCount,
    goalMet: gap.goalMet,
    currentCount: gap.currentCount,
    targetCount: gap.targetCount,
    postCount: gap.gapCount,
  };
  // Persist count immediately so a second executor pass cannot recount.
  patchAgentRunInList(run.id, {
    result: { ...(run.result ?? {}), ...countedResult },
  });
  await patchAgentRun(run.teamId, run.id, {
    result: { ...(run.result ?? {}), ...countedResult },
  });

  await patchTaskExecutionProgress(run.teamId, executionId, {
    stepId: "complete",
    message: summaryMessage,
    progress: 1,
  });

  const deliveryResult = await completeAgentRunExecution({
    teamId: run.teamId,
    executionId,
    contract,
    run,
    saveLocalArchive,
    ok: true,
    summaryText: gap.contextText,
    tokenContext: {
      siteName: site.name,
      automationTitle: automationTitleFromRun(run),
      executionKind: "content_gap_check",
      summary: summaryMessage,
    },
    result: countedResult,
  });

  return {
    ...countedResult,
    batchKey,
    ...deliveryResult,
  };
}

export async function runContentGapCheckDirectHarness(
  run: AgentRun,
  ctx: AgentRunHarnessContext,
): Promise<AgentRunResult> {
  const existing = contentGapResultFromRun(run);
  if (existing) {
    await ctx.onStep?.(existingGapStepLabel(existing), "done", undefined, AGENT_RUN_STEP_KEYS.contentGap);
    return existing;
  }

  const siteId = String(run.context?.siteId ?? "").trim();
  if (!siteId) {
    throw new Error("Set a client on the workflow before running.");
  }

  const site = resolveSite(siteId, getStoredSites());
  const plan = (run.plan ?? {}) as Record<string, unknown>;
  const contract = (plan.executionPayload ?? plan.clientRunContract ?? plan) as TaskExecutionClientRunContract;
  const executionId = Number(run.plan?.taskExecutionId ?? 0);

  if (executionId > 0) {
    return runContentGapCheckClientHarness(
      run,
      site,
      contract,
      executionId,
      ctx,
      run.clientBatchKey || String(run.id),
    );
  }

  await ctx.onStep?.("Counting content", "running", undefined, AGENT_RUN_STEP_KEYS.contentGap);
  const gap = await resolveContentGapCount(
    site,
    resolveContentGapCheckExecutionPayload(executionPayloadFromSource(contract), site),
  );
  await ctx.onStep?.(contentGapOutcomeStepLabel(gap), "done", undefined, AGENT_RUN_STEP_KEYS.contentGap);

  return {
    message: gap.contextText,
    gapCount: gap.gapCount,
    goalMet: gap.goalMet,
    postCount: gap.gapCount,
    batchKey: run.clientBatchKey || String(run.id),
  };
}

export { resolveSite };
