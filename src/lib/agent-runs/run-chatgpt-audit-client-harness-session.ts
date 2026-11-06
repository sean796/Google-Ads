import type { WordPressSite } from "@/components/integrations/types";
import type { AgentRunHarnessContext } from "@/lib/agent-runs/harness-registry";
import type { AgentRun } from "@/lib/agent-runs-types";
import { persistAgentRunArtifact } from "@/lib/agent-runs/agent-run-artifacts";
import {
  startChatGptAuditJob,
  waitForChatGptAuditJob,
  type ChatGptAuditJobProgress,
  type ChatGptAuditQueryResponse,
} from "@/lib/chatgpt-audit-api";
import {
  createChatGptAuditMultiUrlDriverState,
  driveChatGptAuditMultiUrlQuestions,
  resolveChatGptAuditQuestions,
  resolveChatGptAuditTargetUrls,
} from "@/lib/chatgpt-audit-preset-questions";
import { chatgptAuditArchiveFiles, type TaskArchiveFileInput } from "@/lib/task-execution-archive";
import type { TaskExecutionClientRunContract, TaskExecutionPayload } from "@/lib/tasks-types";
import { resolveTaskExecutionBucket, TASK_EXECUTION_TARGET_BUCKET_LABELS } from "@/lib/task-execution-bucket";
import { effectiveSaveLocalArchive } from "@/lib/schedule-output-destination";
import { ensureChatGptAuditExecutionPayload } from "@/lib/workflow/resolve-chatgpt-audit-workflow-payload";
import {
  clientUrlFromSite,
  loadExistingChatGptAuditCsv,
  patchBrowserPreviewLocally,
  patchRunSessionState,
  persistChatGptAuditCsv,
  readPriorChatGptAuditFailure,
} from "@/lib/agent-runs/run-chatgpt-audit-client-harness-helpers";

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

export async function runChatGptAuditSession(
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
