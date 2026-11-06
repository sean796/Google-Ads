import type { WordPressSite } from "@/components/integrations/types";
import { getStoredSites } from "@/components/integrations/storage";
import type { AgentRunHarnessContext } from "@/lib/agent-runs/harness-registry";
import type { AgentRun, AgentRunResult, AgentRunStepArtifact } from "@/lib/agent-runs-types";
import { persistAgentRunArtifact } from "@/lib/agent-runs/agent-run-artifacts";
import { agentRunBrowserPreviewDataUrl } from "@/lib/agent-runs/agent-run-browser-preview";
import { patchAgentRunInList } from "@/lib/agent-runs/agent-runs-local-patch";
import { patchAgentRun } from "@/lib/agent-runs-api";
import { commitAgentRunDeliverable } from "@/lib/agent-runs/commit-agent-run-deliverable";
import {
  startChatGptAuditJob,
  waitForChatGptAuditJob,
  type ChatGptAuditJobProgress,
  type ChatGptAuditQueryResponse,
} from "@/lib/chatgpt-audit-api";
import { chatgptAuditCsvFileName } from "@/lib/chatgpt-audit-csv";
import {
  createChatGptAuditMultiUrlDriverState,
  driveChatGptAuditMultiUrlQuestions,
  resolveChatGptAuditQuestions,
  resolveChatGptAuditTargetUrls,
} from "@/lib/chatgpt-audit-preset-questions";
import {
  chatgptAuditArchiveFiles,
  chatgptAuditCumulativeCsvFile,
  buildExecutionCompletePayload,
  type TaskArchiveFileInput,
} from "@/lib/task-execution-archive";
import { completeTaskExecution, patchTaskExecutionProgress } from "@/lib/tasks-api";
import type { TaskExecutionClientRunContract, TaskExecutionPayload } from "@/lib/tasks-types";
import {
  resolveTaskExecutionBucket,
  TASK_EXECUTION_TARGET_BUCKET_LABELS,
} from "@/lib/task-execution-bucket";
import { effectiveSaveLocalArchive } from "@/lib/schedule-output-destination";
import { syncAgentRunHostedFilesFromBulk } from "@/lib/agent-runs/agent-run-hosted-files";
import type { BulkGeneratedFile } from "@/lib/bulk-file-manager";
import { automationTitleFromRun } from "@/lib/automation-email-delivery";
import { completeAgentRunExecution } from "@/lib/workflow/workflow-deliveries-skip";
import { fetchWorkflowStepOutputs } from "@/lib/workflow/workflow-api";
import { fetchAppApiText } from "@/lib/proxy-fetch-text";
import { ensureChatGptAuditExecutionPayload } from "@/lib/workflow/resolve-chatgpt-audit-workflow-payload";

function resolveSite(siteId: string, sites: WordPressSite[]): WordPressSite {
  const fromList = sites.find((s) => s.id === siteId);
  if (fromList) return fromList;
  const stored = getStoredSites().find((s) => s.id === siteId);
  if (stored) return stored;
  throw new Error("WordPress site not found for this ChatGPT audit run.");
}

function clientUrlFromSite(site: WordPressSite): string {
  const url = site.productionSiteUrl?.trim() || site.siteUrl?.trim() || "";
  if (url) return url.replace(/\/+$/, "");
  return "";
}

function readWorkflowBinding(run: AgentRun): {
  workflowId: number;
  workflowRunId: number;
} | null {
  const ctx = run.context ?? {};
  const plan = run.plan ?? {};
  const workflowId = Number(ctx.workflowId ?? plan.workflowId ?? 0);
  const workflowRunId = Number(ctx.workflowRunId ?? plan.workflowRunId ?? 0);
  if (!workflowId || !workflowRunId) return null;
  return { workflowId, workflowRunId };
}

async function loadExistingChatGptAuditCsv(run: AgentRun): Promise<string | undefined> {
  const binding = readWorkflowBinding(run);
  if (!binding) return undefined;

  const fileName = chatgptAuditCsvFileName({
    runId: run.id,
    workflowRunId: binding.workflowRunId,
  });
  const outputs = await fetchWorkflowStepOutputs(
    run.teamId,
    binding.workflowId,
    binding.workflowRunId,
  );

  for (const output of [...outputs].reverse()) {
    for (const ref of output.fileRefs ?? []) {
      if (ref.name !== fileName || !ref.url?.trim()) continue;
      return fetchAppApiText(ref.url);
    }
  }
  return undefined;
}

async function patchBrowserPreviewLocally(
  runId: number,
  label: string,
  screenshotBase64: string,
  mime = "image/jpeg",
): Promise<void> {
  const artifact: AgentRunStepArtifact = {
    id: `preview-live-${Date.now()}`,
    name: "browser-preview.jpg",
    url: agentRunBrowserPreviewDataUrl(screenshotBase64, mime),
    mime,
  };
  const at = new Date().toISOString();
  patchAgentRunInList(runId, (run) => {
    const steps = run.steps ?? [];
    const idx = steps.findIndex((step) => step.stepKey === "browser_preview");
    if (idx >= 0) {
      const next = [...steps];
      next[idx] = {
        ...steps[idx]!,
        label,
        status: "running",
        payload: { artifacts: [artifact] },
        updatedAt: at,
      };
      return { steps: next };
    }
    return {
      steps: [
        ...steps,
        {
          id: Date.now(),
          stepIndex: steps.length,
          stepKey: "browser_preview",
          label,
          status: "running",
          payload: { artifacts: [artifact] },
          createdAt: at,
          updatedAt: at,
        },
      ],
    };
  });
}

function patchRunSessionState(
  run: AgentRun,
  patch: {
    jobId?: string;
    sessionReady?: boolean;
    responseCount?: number;
  },
): void {
  patchAgentRunInList(run.id, (current) => {
    const prev: AgentRunResult = current.result ?? {};
    const nextResult: AgentRunResult = {
      ...prev,
      jobId: patch.jobId ?? prev.jobId,
      sessionReady: patch.sessionReady ?? prev.sessionReady,
      responseCount: patch.responseCount ?? prev.responseCount,
    };
    delete nextResult.responses;
    void patchAgentRun(run.teamId, run.id, {
      result: nextResult,
    });
    return { result: nextResult };
  });
}

function readPriorChatGptAuditFailure(run: AgentRun): string | null {
  const message = run.errorMessage?.trim();
  if (message) return message;
  const steps = run.steps ?? [];
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (step?.status === "error" && step.label?.trim()) {
      return step.label.trim();
    }
  }
  return null;
}

async function persistBrowserPreviewArtifact(
  run: AgentRun,
  label: string,
  screenshotBase64: string,
): Promise<void> {
  await persistAgentRunArtifact(run.teamId, run, {
    stepKey: "browser_preview",
    stepLabel: label,
    name: "browser-preview.jpg",
    mime: "image/jpeg",
    content: screenshotBase64,
  });
}

async function handleAuditProgress(
  run: AgentRun,
  ctx: AgentRunHarnessContext,
  progress: ChatGptAuditJobProgress,
  state: {
    lastLabel: string;
    lastError: string;
    lastScreenshot: string | null;
    lastPreviewLabel: string;
    lastScreenshotCapturedAt: string | null;
    processedCount: number;
    responses: ChatGptAuditQueryResponse[];
  },
): Promise<void> {
  if (progress.status === "error") {
    const failure = progress.error?.trim() || progress.label?.trim() || "ChatGPT audit session failed.";
    if (failure !== state.lastError) {
      state.lastError = failure;
      state.lastLabel = failure;
      await ctx.onStep?.(failure, "error");
    }
    return;
  }

  const label = progress.label?.trim();
  if (label && label !== state.lastLabel) {
    state.lastLabel = label;
    await ctx.onStep?.(label, "running");
  }

  const screenshot = progress.screenshotBase64?.trim();
  const previewLabel = label || state.lastLabel || "Browser preview";
  const capturedAt = progress.screenshotCapturedAt?.trim() ?? null;
  const shouldUpdatePreview =
    Boolean(screenshot) &&
    (screenshot !== state.lastScreenshot ||
      previewLabel !== state.lastPreviewLabel ||
      capturedAt !== state.lastScreenshotCapturedAt);
  if (shouldUpdatePreview && screenshot) {
    state.lastScreenshot = screenshot;
    state.lastPreviewLabel = previewLabel;
    state.lastScreenshotCapturedAt = capturedAt;
    await patchBrowserPreviewLocally(run.id, previewLabel, screenshot);
  }

  if (progress.jobId) {
    patchRunSessionState(run, { jobId: progress.jobId });
  }

  const responses = progress.responses ?? [];
  if (responses.length > state.processedCount) {
    for (let i = state.processedCount; i < responses.length; i += 1) {
      state.responses.push(responses[i]!);
    }
    state.processedCount = responses.length;
    await ctx.onStep?.(`Saved reply ${state.processedCount}`, "running");
    patchRunSessionState(run, {
      sessionReady: progress.sessionReady,
      responseCount: state.processedCount,
    });
  } else if (progress.sessionReady) {
    patchRunSessionState(run, { sessionReady: true, responseCount: state.processedCount });
  }
}

async function persistChatGptAuditCsv(
  run: AgentRun,
  site: WordPressSite,
  clientUrl: string,
  responses: ChatGptAuditQueryResponse[],
  saveLocalArchive: boolean,
  existingContent?: string,
): Promise<TaskArchiveFileInput> {
  const binding = readWorkflowBinding(run);
  const priorContent = existingContent ?? (await loadExistingChatGptAuditCsv(run));
  const csvFile = chatgptAuditCumulativeCsvFile({
    runId: run.id,
    workflowRunId: binding?.workflowRunId,
    clientUrl,
    clientName: site.name,
    responses,
    existingContent: priorContent,
  });

  if (!csvFile.content.trim()) {
    throw new Error("ChatGPT audit CSV is empty.");
  }

  await commitAgentRunDeliverable({
    run,
    stepKey: "chatgpt_session",
    stepLabel: "ChatGPT audit CSV",
    files: [csvFile],
    textPreview: `${parseChatGptAuditRowCount(csvFile.content)} row(s) in ${csvFile.fileName}`,
    saveLocalArchive,
    replaceOutput: true,
  });

  syncAgentRunHostedFilesFromBulk(run.id, [
    {
      id: `chatgpt-audit-csv-${run.id}`,
      rowIndex: 0,
      fileName: csvFile.fileName,
      content: csvFile.content,
      mimeType: csvFile.mime,
      status: "completed",
      timestamp: Date.now(),
      rowData: { title: site.name, keyword: clientUrl },
    } satisfies BulkGeneratedFile,
  ]);

  return csvFile;
}

function parseChatGptAuditRowCount(content: string): number {
  const lines = content.trim().split(/\r?\n/).filter(Boolean);
  return Math.max(0, lines.length - 1);
}

async function runChatGptAuditSession(
  run: AgentRun,
  site: WordPressSite,
  ctx: AgentRunHarnessContext,
  contract?: TaskExecutionClientRunContract | Record<string, unknown>,
): Promise<{
  archiveFiles: TaskArchiveFileInput[];
  responses: ChatGptAuditQueryResponse[];
  summary?: Record<string, unknown>;
}> {
  const clientName = site.name;
  const presetQuestions = resolveChatGptAuditQuestions(contract, run);
  const normalizedContract = ensureChatGptAuditExecutionPayload({
    ...((run.plan?.executionPayload ?? {}) as TaskExecutionPayload),
    ...((contract ?? {}) as TaskExecutionPayload),
  });
  const auditUrls = await resolveChatGptAuditTargetUrls(site, normalizedContract, run, (message) => {
    void ctx.onStep?.(message, "running");
  });
  const bucket = resolveTaskExecutionBucket(normalizedContract);
  const bucketLabel = bucket ? TASK_EXECUTION_TARGET_BUCKET_LABELS[bucket] : "URLs";
  await ctx.onStep?.(
    `Auditing ${auditUrls.length} URL${auditUrls.length === 1 ? "" : "s"} from ${bucketLabel}`,
    "running",
  );
  const multiUrlState = createChatGptAuditMultiUrlDriverState();
  const saveLocalArchive = effectiveSaveLocalArchive(
    "chatgpt_website_audit",
    contract ?? run.plan?.executionPayload ?? {},
  );

  const priorFailure = readPriorChatGptAuditFailure(run);
  if (priorFailure) {
    throw new Error(priorFailure);
  }

  const started = await startChatGptAuditJob({
    clientName,
    clientUrl: auditUrls[0] ?? clientUrlFromSite(site),
  });
  if (!started.ok || !started.jobId) {
    throw new Error(started.error ?? "ChatGPT audit worker is not configured.");
  }

  patchRunSessionState(run, { jobId: started.jobId, sessionReady: false, responseCount: 0 });

  const state = {
    lastLabel: "",
    lastError: "",
    lastScreenshot: null as string | null,
    lastPreviewLabel: "",
    lastScreenshotCapturedAt: null as string | null,
    processedCount: 0,
    responses: [] as ChatGptAuditQueryResponse[],
  };
  let csvExistingContent = await loadExistingChatGptAuditCsv(run);
  let lastCsvFile: TaskArchiveFileInput | null = null;

  const terminal = await waitForChatGptAuditJob(started.jobId, {
    onProgress: async (progress) => {
      await handleAuditProgress(run, ctx, { ...progress, jobId: started.jobId }, state);
      await driveChatGptAuditMultiUrlQuestions({
        jobId: started.jobId!,
        urls: auditUrls,
        questions: presetQuestions,
        sessionReady: progress.sessionReady === true,
        newChatReady: progress.newChatReady === true,
        newChatUrl: progress.newChatUrl ?? null,
        responseCount: state.responses.length,
        state: multiUrlState,
        onUrlComplete: async (url, responseCountForUrl) => {
          const slice = state.responses.slice(
            multiUrlState.urlResponseStart,
            multiUrlState.urlResponseStart + responseCountForUrl,
          );
          if (slice.length === 0) {
            throw new Error(`ChatGPT audit finished URL with no replies: ${url}`);
          }
          const csvFile = await persistChatGptAuditCsv(
            run,
            site,
            url,
            slice,
            saveLocalArchive,
            csvExistingContent,
          );
          csvExistingContent = csvFile.content;
          lastCsvFile = csvFile;
          const urlNumber = multiUrlState.completedUrls.length;
          await ctx.onStep?.(
            `Saved ${slice.length} repl${slice.length === 1 ? "y" : "ies"} for URL ${urlNumber} of ${auditUrls.length}`,
            "running",
          );
        },
        onAdvanceToUrl: async (urlNumber, totalUrls, url) => {
          await ctx.onStep?.(`Starting URL ${urlNumber} of ${totalUrls}`, "running");
        },
      });
    },
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

  if (state.responses.length === 0) {
    throw new Error("ChatGPT audit finished with no replies.");
  }

  if (!lastCsvFile) {
    throw new Error("ChatGPT audit CSV was not saved.");
  }

  return {
    archiveFiles: chatgptAuditArchiveFiles([lastCsvFile]),
    responses: state.responses,
    summary: {
      ...((terminal.result ?? undefined) as Record<string, unknown> | undefined),
      completedUrls: multiUrlState.completedUrls,
      urlCount: auditUrls.length,
      responseCount: state.responses.length,
    },
  };
}

export async function runChatGptAuditDirectHarness(
  run: AgentRun,
  ctx: AgentRunHarnessContext,
): Promise<AgentRunResult> {
  const siteId = String(run.context?.siteId ?? "").trim();
  if (!siteId) {
    throw new Error("Set a client on the workflow before running.");
  }

  const site = resolveSite(siteId, getStoredSites());
  const planPayload = (run.plan ?? {}) as Record<string, unknown>;
  const contract = ensureChatGptAuditExecutionPayload(
    (planPayload.executionPayload ?? planPayload.clientRunContract ?? planPayload) as TaskExecutionPayload,
  ) as TaskExecutionClientRunContract | Record<string, unknown>;

  await ctx.onStep?.("Starting ChatGPT audit session", "running");

  const { archiveFiles, responses, summary } = await runChatGptAuditSession(run, site, ctx, contract);
  const saveLocalArchive = effectiveSaveLocalArchive("chatgpt_website_audit", contract);

  if (saveLocalArchive && run.plan?.taskExecutionId) {
    await completeTaskExecution(
      run.teamId,
      Number(run.plan.taskExecutionId),
      buildExecutionCompletePayload({
        ok: true,
        run,
        saveLocalArchive: true,
        archiveFiles,
        result: {
          clientName: site.name,
          clientUrl: clientUrlFromSite(site),
          responseCount: responses.length,
          completedUrls: Array.isArray(summary?.completedUrls)
            ? (summary.completedUrls as string[])
            : undefined,
          urlCount: Number(summary?.urlCount ?? 0) || undefined,
        },
      }),
    );
  }

  const completedUrlCount = Array.isArray(summary?.completedUrls)
    ? (summary.completedUrls as string[]).length
    : 0;
  const totalUrlCount = Number(summary?.urlCount ?? completedUrlCount) || completedUrlCount;
  await ctx.onStep?.(
    totalUrlCount > 1
      ? `Session complete (${completedUrlCount} of ${totalUrlCount} URLs)`
      : "Session complete",
    "done",
  );

  return {
    updated: responses.length,
    message: `ChatGPT audit saved ${responses.length} repl${responses.length === 1 ? "y" : "ies"} for ${site.name}`,
    batchKey: run.clientBatchKey || undefined,
  };
}

export async function runChatGptAuditClientHarness(
  run: AgentRun,
  site: WordPressSite,
  contract: TaskExecutionClientRunContract,
  executionId: number,
  ctx: AgentRunHarnessContext,
  batchKey: string,
): Promise<AgentRunResult> {
  await ctx.onStep?.("Starting ChatGPT audit session", "running");
  await patchTaskExecutionProgress(run.teamId, executionId, {
    stepId: "preflight",
    message: `Opening ChatGPT for ${site.name}…`,
    progress: 0.05,
  });

  const { archiveFiles, responses, summary } = await runChatGptAuditSession(run, site, ctx, contract);
  const saveLocalArchive = effectiveSaveLocalArchive("chatgpt_website_audit", contract);
  const summaryText = archiveFiles.map((file) => file.content).join("\n\n");
  const completedUrls = Array.isArray(summary?.completedUrls)
    ? (summary.completedUrls as string[])
    : [];

  const deliveryResult = await completeAgentRunExecution({
    teamId: run.teamId,
    executionId,
    contract,
    run,
    saveLocalArchive,
    ok: true,
    archiveFiles,
    summaryText,
    fileNameHint: `${site.name} ChatGPT audit`,
    tokenContext: {
      siteName: site.name,
      automationTitle: automationTitleFromRun(run),
      executionKind: "chatgpt_website_audit",
      summary: `ChatGPT audit saved ${responses.length} repl${responses.length === 1 ? "y" : "ies"} across ${completedUrls.length || 1} URL${completedUrls.length === 1 ? "" : "s"}`,
    },
    result: {
      clientName: site.name,
      clientUrl: clientUrlFromSite(site),
      responseCount: responses.length,
      completedUrls,
      urlCount: Number(summary?.urlCount ?? completedUrls.length) || undefined,
    },
    onStep: (label, status) => ctx.onStep?.(label, status ?? "running"),
  });

  return {
    updated: responses.length,
    message: `ChatGPT audit saved ${responses.length} repl${responses.length === 1 ? "y" : "ies"} for ${site.name}`,
    batchKey,
    ...deliveryResult,
  };
}

export { resolveSite };
