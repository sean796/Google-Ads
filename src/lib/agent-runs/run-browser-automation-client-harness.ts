import type { WordPressSite } from "@/components/integrations/types";
import { getStoredSites } from "@/components/integrations/storage";
import type { AgentRunHarnessContext } from "@/lib/agent-runs/harness-registry";
import type { AgentRun, AgentRunResult } from "@/lib/agent-runs-types";
import { persistAgentRunArtifact } from "@/lib/agent-runs/agent-run-artifacts";
import {
  startBrowserAutomationJob,
  waitForBrowserAutomationJob,
} from "@/lib/browser-automation-api";
import { buildExecutionCompletePayload, type TaskArchiveFileInput } from "@/lib/task-execution-archive";
import { completeTaskExecution, patchTaskExecutionProgress } from "@/lib/tasks-api";
import {
  browserAutomationRequiresClient,
  browserInstructionsForJob,
  resolveBrowserTargetUrl,
} from "@/lib/browser-automation/resolve-browser-target-url";
import type { TaskExecutionClientRunContract, TaskExecutionPayload } from "@/lib/tasks-types";
import { effectiveSaveLocalArchive } from "@/lib/schedule-output-destination";
import { automationTitleFromRun } from "@/lib/automation-email-delivery";
import { completeAgentRunExecution } from "@/lib/workflow/workflow-deliveries-skip";
import { fetchWorkflowStepOutputs } from "@/lib/workflow/workflow-api";
import { effectiveClientSiteIds } from "@/lib/workflow/workflow-rag-client";
import {
  captureDeliverablesFromSummary,
  persistBrowserDeliverables,
  sessionArchiveFile,
} from "@/lib/agent-runs/run-browser-automation-deliverables";
import { handleAutomationProgress } from "@/lib/agent-runs/run-browser-automation-preview";

export { progressDeliverableCommitSignature } from "@/lib/agent-runs/run-browser-automation-deliverables";

function resolveSite(siteId: string, sites: WordPressSite[]): WordPressSite {
  const fromList = sites.find((s) => s.id === siteId);
  if (fromList) return fromList;
  const stored = getStoredSites().find((s) => s.id === siteId);
  if (stored) return stored;
  throw new Error("WordPress site not found for this browser automation run.");
}

async function resolveBrowserRunInputs(
  run: AgentRun,
  contract: TaskExecutionClientRunContract & Record<string, unknown>,
  site?: WordPressSite,
): Promise<{ targetUrl: string; browserInstructionsHtml: string }> {
  const instructionsHtml = String(contract.browserInstructionsHtml ?? "").trim();
  if (!instructionsHtml) {
    throw new Error("Set browser instructions before running.");
  }

  const workflowId = Number(run.context?.workflowId ?? run.plan?.workflowId ?? 0);
  const workflowRunId = Number(run.context?.workflowRunId ?? run.plan?.workflowRunId ?? 0);
  const outputs =
    workflowId > 0 && workflowRunId > 0
      ? await fetchWorkflowStepOutputs(run.teamId, workflowId, workflowRunId)
      : undefined;
  const siteId = String(site?.id ?? contract.siteId ?? run.context?.siteId ?? "").trim() || undefined;
  const clientSiteIds = outputs ? effectiveClientSiteIds(outputs, siteId ? [siteId] : []) : [];

  const targetUrl = resolveBrowserTargetUrl(contract as TaskExecutionPayload, site, {
    outputs,
    siteId,
    clientSiteIds,
  });
  const browserInstructionsHtml = browserInstructionsForJob(
    instructionsHtml,
    String(contract.workflowContextBlock ?? ""),
  );

  return { targetUrl, browserInstructionsHtml };
}

function resolveBrowserAutomationRunContext(run: AgentRun): {
  contract: TaskExecutionClientRunContract & Record<string, unknown>;
  site?: WordPressSite;
} {
  const planPayload = (run.plan ?? {}) as Record<string, unknown>;
  const raw = (planPayload.executionPayload ?? planPayload.clientRunContract ?? planPayload) as
    | TaskExecutionClientRunContract
    | Record<string, unknown>;
  const siteId = String(raw.siteId ?? run.context?.siteId ?? "").trim() || undefined;
  const contract = {
    ...raw,
    ...(siteId ? { siteId } : {}),
  } as TaskExecutionClientRunContract & Record<string, unknown>;
  const site = siteId ? getStoredSites().find((item) => item.id === siteId) : undefined;
  return { contract, site };
}


async function runBrowserAutomationSession(
  run: AgentRun,
  targetUrl: string,
  browserInstructionsHtml: string,
  ctx: AgentRunHarnessContext,
): Promise<{
  archiveFiles: TaskArchiveFileInput[];
  summary: Record<string, unknown>;
}> {
  const planPayload = (run.plan ?? {}) as Record<string, unknown>;
  const contract = (planPayload.executionPayload ?? planPayload.clientRunContract ?? planPayload) as
    | TaskExecutionClientRunContract
    | Record<string, unknown>;
  const saveLocalArchive = effectiveSaveLocalArchive("browser_automation", contract);

  const started = await startBrowserAutomationJob({ targetUrl, browserInstructionsHtml });
  if (!started.ok || !started.jobId) {
    throw new Error(started.error ?? "Browser automation worker is not configured.");
  }

  const state = {
    lastLabel: "",
    lastScreenshot: null as string | null,
    lastPreviewLabel: "",
    saveLocalArchive,
    committedDeliverableSignatures: new Set<string>(),
  };

  const terminal = await waitForBrowserAutomationJob(started.jobId, {
    onProgress: (progress) => handleAutomationProgress(run, ctx, progress, state),
  });

  if (state.lastScreenshot) {
    await persistAgentRunArtifact(run.teamId, run, {
      stepKey: "browser_preview",
      stepLabel: state.lastLabel || "Browser preview",
      name: "browser-preview.jpg",
      mime: "image/jpeg",
      content: state.lastScreenshot,
    });
  }

  const summary = (terminal.result ?? {}) as Record<string, unknown>;
  const captureDeliverables = captureDeliverablesFromSummary(
    summary,
    state.lastScreenshot,
    browserInstructionsHtml,
  );
  const captureFiles = await persistBrowserDeliverables(
    run,
    captureDeliverables,
    saveLocalArchive,
    state.committedDeliverableSignatures,
  );
  const archiveFile = sessionArchiveFile({
    runId: run.id,
    targetUrl,
    summary,
  });

  await persistAgentRunArtifact(run.teamId, run, {
    stepKey: "browser_automation",
    stepLabel: "Browser automation result",
    name: archiveFile.fileName,
    mime: archiveFile.mime,
    content: archiveFile.content,
  });

  return {
    archiveFiles: [archiveFile, ...captureFiles],
    summary,
  };
}

export async function runBrowserAutomationDirectHarness(
  run: AgentRun,
  ctx: AgentRunHarnessContext,
): Promise<AgentRunResult> {
  const { contract, site } = resolveBrowserAutomationRunContext(run);

  if (
    browserAutomationRequiresClient(contract as TaskExecutionPayload) &&
    !String(contract.siteId ?? "").trim()
  ) {
    throw new Error("Set a client before running browser automation.");
  }

  const { targetUrl, browserInstructionsHtml } = await resolveBrowserRunInputs(run, contract, site);

  await ctx.onStep?.("Starting browser automation", "running");
  const { archiveFiles, summary } = await runBrowserAutomationSession(
    run,
    targetUrl,
    browserInstructionsHtml,
    ctx,
  );

  const saveLocalArchive = effectiveSaveLocalArchive("browser_automation", contract);
  if (saveLocalArchive && run.plan?.taskExecutionId) {
    await completeTaskExecution(
      run.teamId,
      Number(run.plan.taskExecutionId),
      buildExecutionCompletePayload({
        ok: Boolean(summary.success ?? true),
        run,
        saveLocalArchive: true,
        archiveFiles,
        result: summary,
      }),
    );
  }

  await ctx.onStep?.("Browser automation complete", "done");

  return {
    updated: 1,
    message: String(summary.summary ?? "Browser automation finished."),
    batchKey: run.clientBatchKey || undefined,
  };
}

function archiveFileContent(files: TaskArchiveFileInput[]): string {
  return files.map((file) => file.content).join("\n\n");
}

export async function runBrowserAutomationClientHarness(
  run: AgentRun,
  site: WordPressSite,
  contract: TaskExecutionClientRunContract,
  executionId: number,
  ctx: AgentRunHarnessContext,
  batchKey: string,
): Promise<AgentRunResult> {
  const { targetUrl, browserInstructionsHtml } = await resolveBrowserRunInputs(run, contract, site);

  await ctx.onStep?.("Starting browser automation", "running");
  await patchTaskExecutionProgress(run.teamId, executionId, {
    stepId: "preflight",
    message: `Opening ${targetUrl}…`,
    progress: 0.05,
  });

  const { archiveFiles, summary } = await runBrowserAutomationSession(
    run,
    targetUrl,
    browserInstructionsHtml,
    ctx,
  );
  const saveLocalArchive = effectiveSaveLocalArchive("browser_automation", contract);
  const summaryText = archiveFileContent(archiveFiles);

  const deliveryResult = await completeAgentRunExecution({
    teamId: run.teamId,
    executionId,
    contract,
    run,
    saveLocalArchive,
    ok: Boolean(summary.success ?? true),
    archiveFiles,
    summaryText,
    fileNameHint: site.name?.trim() ? `${site.name} browser automation` : "Browser automation",
    tokenContext: {
      siteName: site.name?.trim() || undefined,
      automationTitle: automationTitleFromRun(run),
      executionKind: "browser_automation",
      summary: String(summary.summary ?? "Browser automation finished."),
    },
    result: summary,
    onStep: (label, status) => ctx.onStep?.(label, status ?? "running"),
  });

  return {
    updated: 1,
    message: String(summary.summary ?? "Browser automation finished."),
    batchKey,
    ...deliveryResult,
  };
}

export { resolveSite };
