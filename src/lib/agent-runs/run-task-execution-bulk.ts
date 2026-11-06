import type { Dispatch, SetStateAction } from "react";
import { handleOptimizeMultipleContent } from "@/hooks/content-optimization/bulk-optimization";
import { humanizeSlugFromUrl } from "@/hooks/content-optimization/bulk-optimization-constants";
import type { WordPressSite } from "@/components/integrations/types";
import type { AgentRunHarnessContext } from "@/lib/agent-runs/harness-registry";
import {
  flushAgentRunCheckpointPatch,
  patchAgentRunCheckpoint,
  readAgentRunCheckpoint,
  resumeCompletedUrlsFromCheckpoint,
  scheduleAgentRunCheckpointPatch,
} from "@/lib/agent-runs/agent-run-checkpoint";
import { patchAgentRunInList } from "@/lib/agent-runs/agent-runs-local-patch";
import { fetchAgentRun } from "@/lib/agent-runs-api";
import type { AgentRun, AgentRunCheckpointUrlSummary, AgentRunResult } from "@/lib/agent-runs-types";
import type { TaskExecutionClientRunContract } from "@/lib/tasks-types";
import type { PrefilledOverviewTarget } from "@/hooks/content-optimization/bulk-optimization-params";
import {
  resolveTaskExecutionBucketInventory,
  workUrlsFromExplicitTargets,
} from "@/lib/task-execution-resolve-bucket-urls";
import {
  auditUrlsMissingNewTemplate,
  inventoryHtmlForUrl,
  isMissingNewTemplateFilter,
  type MissingTemplateAudit,
} from "@/lib/content-optimization/missing-new-template";
import { patchTaskExecutionProgress } from "@/lib/tasks-api";
import { isTaskExecutionTargetAll } from "@/lib/task-execution-target";
import { effectiveSaveLocalArchive } from "@/lib/schedule-output-destination";
import { executionKindFromRun } from "@/lib/automation-email-delivery";
import { getAgentRunOptimizationBridge } from "@/lib/agent-runs/agent-run-optimization-bridge";
import {
  completeOptimizerWithOptionalEmail,
  noopSetState,
  optimizationOptionsWithDfsArticleAudit,
  progressReporter,
} from "@/lib/agent-runs/run-task-execution-helpers";

function prefilledOverviewTargetsFromContract(
  research: Record<string, string> | undefined,
): Record<string, PrefilledOverviewTarget> | undefined {
  if (!research || typeof research !== "object") return undefined;
  const out: Record<string, PrefilledOverviewTarget> = {};
  for (const [url, seo] of Object.entries(research)) {
    const trimmedUrl = url.trim();
    const seoResearch = String(seo ?? "").trim();
    if (!trimmedUrl || !seoResearch) continue;
    out[trimmedUrl] = { postId: 0, seoResearch };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export async function runTaskExecutionBulkClientHarness(
  run: AgentRun,
  site: WordPressSite,
  contract: TaskExecutionClientRunContract & object,
  executionId: number,
  ctx: AgentRunHarnessContext,
  batchKey: string,
): Promise<AgentRunResult> {
  const latestRun = (await fetchAgentRun(run.teamId, run.id)) ?? run;
  const checkpoint = readAgentRunCheckpoint(latestRun);
  const resumeCompletedUrls = resumeCompletedUrlsFromCheckpoint(checkpoint);

  await ctx.onStep?.("Inventory", "running");
  await patchTaskExecutionProgress(run.teamId, executionId, {
    stepId: "inventory",
    message: "Loading inventory…",
    progress: 0.05,
  });

  if (await ctx.isCancelled?.()) {
    throw new Error("Cancelled");
  }

  const bucket = contract.targetBucket ?? (isTaskExecutionTargetAll(contract.url) ? "all" : null);
  if (!bucket) {
    throw new Error("Task execution contract is missing target bucket.");
  }

  const urlFilter = (contract as TaskExecutionClientRunContract).urlFilter;
  const needTemplateAudit = isMissingNewTemplateFilter(urlFilter);
  const explicitTargetUrls = Array.isArray(contract.targetUrls);
  const { urls, snapshot: prefetchedBulkInventorySnapshot } = await resolveTaskExecutionBucketInventory(
    site,
    bucket,
    (message) => {
      void patchTaskExecutionProgress(run.teamId, executionId, { message });
      scheduleAgentRunCheckpointPatch(run.teamId, run.id, { lastMessage: message });
    },
    needTemplateAudit || explicitTargetUrls ? { includeContent: true } : undefined,
  );

  if (explicitTargetUrls && contract.targetUrls.length === 0) {
    const saveLocalArchive = effectiveSaveLocalArchive(
      executionKindFromRun(run) || "content_optimizer",
      contract,
    );
    const doneMessage = "No posts needed";
    await ctx.onStep?.(doneMessage, "done");
    await patchTaskExecutionProgress(run.teamId, executionId, {
      stepId: "done",
      message: doneMessage,
      progress: 1,
    });
    scheduleAgentRunCheckpointPatch(run.teamId, run.id, {
      lastMessage: doneMessage,
      lastStepLabel: doneMessage,
    });
    const emailResult = await completeOptimizerWithOptionalEmail({
      run,
      site,
      contract,
      executionId,
      saveLocalArchive,
      ok: true,
      result: { targetBucket: bucket, count: 0, optimized: 0 },
      summaryText: doneMessage,
      summary: doneMessage,
      onStep: ctx.onStep,
    });
    return {
      updated: 0,
      message: doneMessage,
      batchKey,
      ...emailResult,
    };
  }

  let workUrls = explicitTargetUrls
    ? workUrlsFromExplicitTargets(
        contract.targetUrls,
        prefetchedBulkInventorySnapshot,
        site.siteUrl,
        bucket,
      )
    : urls;

  let templateAudit: MissingTemplateAudit | null = null;
  if (needTemplateAudit) {
    templateAudit = auditUrlsMissingNewTemplate(workUrls, (url) =>
      inventoryHtmlForUrl(prefetchedBulkInventorySnapshot, site.siteUrl, url, bucket),
    );
    workUrls = templateAudit.missing;
    const auditMessage = `Audit ${bucket}: ${templateAudit.alreadyNew.length} already new, ${templateAudit.missing.length} to optimize`;
    await patchTaskExecutionProgress(run.teamId, executionId, {
      stepId: "audit",
      message: auditMessage,
      progress: 0.08,
    });
    await ctx.onStep?.(auditMessage, "running", {
      phase: "template_audit",
      targetBucket: bucket,
      scanned: templateAudit.scanned,
      missingCount: templateAudit.missing.length,
      alreadyNewCount: templateAudit.alreadyNew.length,
      missing: templateAudit.missing,
      alreadyNew: templateAudit.alreadyNew,
    });
    if (templateAudit.missing.length === 0) {
      const saveLocalArchive = effectiveSaveLocalArchive(
        executionKindFromRun(run) || "content_optimizer",
        contract,
      );
      const doneMessage = "No posts needed";
      await ctx.onStep?.(doneMessage, "done");
      await patchTaskExecutionProgress(run.teamId, executionId, {
        stepId: "done",
        message: doneMessage,
        progress: 1,
      });
      scheduleAgentRunCheckpointPatch(run.teamId, run.id, {
        lastMessage: doneMessage,
        lastStepLabel: doneMessage,
      });
      const emailResult = await completeOptimizerWithOptionalEmail({
        run,
        site,
        contract,
        executionId,
        saveLocalArchive,
        ok: true,
        result: {
          targetBucket: bucket,
          count: 0,
          optimized: 0,
          audit: templateAudit,
        },
        summaryText: doneMessage,
        summary: doneMessage,
        onStep: ctx.onStep,
      });
      return {
        updated: 0,
        message: doneMessage,
        batchKey,
        ...emailResult,
      };
    }
  }

  const resumeCount = resumeCompletedUrls.length;
  const currentWorkUrl = workUrls[resumeCount] ?? workUrls[0] ?? "";
  const resumeMessage =
    resumeCount > 0
      ? `Resuming ${resumeCount + 1}/${workUrls.length} ${currentWorkUrl}`.trim()
      : currentWorkUrl
        ? `Working ${currentWorkUrl} (1/${workUrls.length})`
        : `Optimizing ${workUrls.length} URLs…`;
  await patchTaskExecutionProgress(run.teamId, executionId, {
    stepId: "bulk",
    message: resumeMessage,
    progress: workUrls.length > 0 ? Math.round((resumeCount / workUrls.length) * 100) : 0,
  });
  const bulkResumePayload = {
    phase: "bulk_optimizer",
    totalCount: workUrls.length,
    currentIndex: resumeCount,
    currentUrl: workUrls[resumeCount],
    uploadedUrls:
      checkpoint.uploadedUrls.length > 0 ? checkpoint.uploadedUrls : resumeCompletedUrls,
    completedUrls: resumeCompletedUrls,
    completedUrlSummaries: checkpoint.completedUrlSummaries,
  };
  await ctx.onStep?.(resumeMessage, "running", bulkResumePayload);
  await patchAgentRunCheckpoint(run.teamId, run.id, {
    totalCount: workUrls.length,
    currentIndex: resumeCount,
    currentUrl: workUrls[resumeCount],
    currentUrlProgress: 0,
    lastMessage: resumeMessage,
    completedUrls: resumeCompletedUrls,
    uploadedUrls:
      checkpoint.uploadedUrls.length > 0 ? checkpoint.uploadedUrls : resumeCompletedUrls,
    completedUrlSummaries: checkpoint.completedUrlSummaries,
    updated: resumeCount,
  });

  const inventorySitemapSource =
    bucket === "all" ? undefined : (bucket as "pages" | "posts" | "sap");

  const bridge = getAgentRunOptimizationBridge();
  let completedUrls = [...resumeCompletedUrls];
  let uploadedUrls =
    checkpoint.uploadedUrls.length > 0 ? [...checkpoint.uploadedUrls] : [...resumeCompletedUrls];
  let completedUrlSummaries: AgentRunCheckpointUrlSummary[] = [...checkpoint.completedUrlSummaries];

  const onBulkUrlComplete = async (info: {
    url: string;
    index: number;
    total: number;
    uploaded: boolean;
  }) => {
    if (!completedUrls.includes(info.url)) {
      completedUrls = [...completedUrls, info.url];
    }
    if (info.uploaded && !uploadedUrls.includes(info.url)) {
      uploadedUrls = [...uploadedUrls, info.url];
    }
    const postTitle = humanizeSlugFromUrl(info.url);
    completedUrlSummaries = [
      ...completedUrlSummaries.filter((entry) => entry.url !== info.url),
      { url: info.url, postTitle },
    ];
    const nextIndex = info.index + 1;
    const stepMessage = info.uploaded ? `Uploaded ${postTitle}` : `Completed ${postTitle}`;
    const stepPayload = {
      phase: "bulk_optimizer",
      totalCount: info.total,
      currentIndex: nextIndex,
      currentUrl: workUrls[nextIndex],
      uploadedUrls,
      completedUrls,
      completedUrlSummaries,
    };
    void ctx.onStep?.(stepMessage, "running", stepPayload);
    const patched = await patchAgentRunCheckpoint(run.teamId, run.id, {
      completedUrls,
      uploadedUrls,
      completedUrlSummaries,
      currentIndex: nextIndex,
      currentUrl: workUrls[nextIndex],
      totalCount: info.total,
      currentUrlProgress: 0,
      lastMessage: stepMessage,
      updated: uploadedUrls.length,
    });
    if (patched?.result) {
      patchAgentRunInList(run.id, { result: patched.result });
    }
  };

  const sharedOptimizationOptions = await optimizationOptionsWithDfsArticleAudit(
    run,
    contract,
    workUrls[0] ?? contract.url ?? "",
  );

  const bulkResult = await handleOptimizeMultipleContent({
    site,
    urls: workUrls,
    updateMode: contract.updateMode,
    setGscQueriesForSelection: noopSetState,
    setIsKeywordSelectionOpen: noopSetState,
    setGscClusterAnalysis: noopSetState,
    setIsAnalyzingClusters: noopSetState,
    optimizationOptions: {
      ...sharedOptimizationOptions,
      inventorySitemapSource,
    },
    setIsOptimizingContent:
      bridge?.setIsOptimizingContent ??
      (noopSetState as Dispatch<SetStateAction<Record<string, boolean>>>),
    setOptimizationProgress: progressReporter(run, ctx, site.id, batchKey, {
      totalCount: workUrls.length,
      completedCount: resumeCount,
    }),
    setBulkOptimizationState:
      bridge?.setBulkOptimizationState ??
      (noopSetState as Dispatch<SetStateAction<Record<string, unknown>>>),
    optimizationFileManagers: bridge?.optimizationFileManagers ?? {},
    continueOptimizationRef: bridge?.continueOptimizationRef ?? { current: null },
    muteToasts: true,
    resumeCompletedUrls,
    prefetchedBulkInventorySnapshot,
    useSiteWarmCacheOnly: true,
    onBulkUrlComplete,
    batchKey,
    prefilledOverviewTargets: prefilledOverviewTargetsFromContract(
      (contract as TaskExecutionClientRunContract).prefilledUrlResearch,
    ),
  });

  await flushAgentRunCheckpointPatch(run.teamId, run.id);

  if (uploadedUrls.length <= resumeCount && workUrls.length > resumeCount) {
    throw new Error(
      bulkResult.prepCompleted
        ? "Bulk optimization finished without uploading any URLs."
        : "Bulk optimization stopped during inventory prep.",
    );
  }

  const executionKind = executionKindFromRun(run) || "content_optimizer";
  const saveLocalArchive = effectiveSaveLocalArchive(executionKind, contract);
  const bulkMessage = `Optimized ${uploadedUrls.length} URLs`;
  const emailResult = await completeOptimizerWithOptionalEmail({
    run,
    site,
    contract,
    executionId,
    saveLocalArchive,
    ok: true,
    result: {
      targetBucket: bucket,
      count: workUrls.length,
      optimized: uploadedUrls.length,
      ...(templateAudit ? { audit: templateAudit } : {}),
    },
    summaryText: `${bulkMessage}\n${uploadedUrls.slice(0, 12).join("\n")}`,
    summary: bulkMessage,
    onStep: ctx.onStep,
  });

  return {
    updated: uploadedUrls.length,
    message: `Optimized ${uploadedUrls.length} URLs`,
    batchKey,
    ...emailResult,
  };
}
