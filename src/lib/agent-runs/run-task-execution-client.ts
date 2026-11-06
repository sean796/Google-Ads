import type { Dispatch, SetStateAction } from "react";
import { handleOptimizeContent } from "@/hooks/content-optimization/handle-optimize-content";
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
import { resolveAgentRunBatchKey } from "@/lib/agent-runs/agent-run-batch-key";
import {
  loadSitesForAgentRun,
  resolveAgentRunWordPressSite,
  resolveGscReportingSite,
} from "@/lib/agent-runs/resolve-agent-run-site";
import { resolveAgentRunRecipeKey } from "@/lib/agent-runs/agent-run-navigation";
import { getAgentRunOptimizationBridge } from "@/lib/agent-runs/agent-run-optimization-bridge";
import { resolveGscReportingRunConfig } from "@/lib/gsc-reporting/resolve-gsc-reporting-run-config";
import { runGscReportingClientHarness } from "@/lib/agent-runs/run-gsc-reporting-client-harness";
import { runAdsReportingClientHarness } from "@/lib/agent-runs/run-ads-reporting-client-harness";
import { resolveAdsReportingRunConfig } from "@/lib/ads-reporting/resolve-ads-reporting-run-config";
import { runLocalDominatorExportClientHarness } from "@/lib/agent-runs/run-local-dominator-export-client-harness";
import { runDfsArticleAuditClientHarness } from "@/lib/agent-runs/run-dfs-article-audit-client-harness";
import { runChatGptAuditClientHarness } from "@/lib/agent-runs/run-chatgpt-audit-client-harness";
import { browserAutomationRequiresClient } from "@/lib/browser-automation/resolve-browser-target-url";
import {
  runBrowserAutomationClientHarness,
  runBrowserAutomationDirectHarness,
} from "@/lib/agent-runs/run-browser-automation-client-harness";
import { runContentGapCheckClientHarness } from "@/lib/agent-runs/run-content-gap-check-client-harness";
import {
  runPostCreatorClientHarness,
  shouldRunPostCreatorHarness,
} from "@/lib/agent-runs/run-post-creator-client-harness";
import {
  runEntityPageCreatorClientHarness,
  shouldRunEntityPageCreatorHarness,
} from "@/lib/agent-runs/run-entity-page-creator-client-harness";
import {
  runEntityGeneratorClientHarness,
} from "@/lib/agent-runs/run-entity-generator-client-harness";
import {
  runSapGeneratorClientHarness,
  shouldRunSapGeneratorHarness,
} from "@/lib/agent-runs/run-sap-generator-client-harness";
import { fetchAgentRun } from "@/lib/agent-runs-api";
import type { AgentRun, AgentRunCheckpointUrlSummary, AgentRunResult } from "@/lib/agent-runs-types";
import type { TaskExecutionClientRunContract, TaskExecutionPayload } from "@/lib/tasks-types";
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
import { isTaskExecutionTargetAll } from "@/lib/task-execution-target";
import {
  completeTaskExecution,
  fetchTaskExecution,
  patchTaskExecutionProgress,
  reopenTaskExecutionForResume,
} from "@/lib/tasks-api";
import { agentRunHasResumeProgress } from "@/lib/agent-runs/agent-run-resume";
import { effectiveSaveLocalArchive } from "@/lib/schedule-output-destination";
import {
  automationTitleFromRun,
  executionKindFromRun,
} from "@/lib/automation-email-delivery";
import {
  completeAgentRunExecution,
  completeExecutionArchiveOnly,
  shouldSkipInlineDeliveries,
} from "@/lib/workflow/workflow-deliveries-skip";
import { resolveDfsArticleAuditBlockForUrl } from "@/lib/dfs-article-audit/resolve-dfs-article-audit-block";
import { fetchWorkflowStepOutputs } from "@/lib/workflow/workflow-api";
import { mergeRunContractOptimizationOptions } from "@/lib/agent-runs/merge-run-contract-optimization-options";
import type { OptimizationProgressState } from "@/hooks/content-optimization/use-optimization-state";
import type { OptimizationFileManager } from "@/lib/optimization-file-manager";

function noopSetState<T>(_value: SetStateAction<T>): void {
  /* agent run harness uses API steps only */
}

async function optimizationOptionsWithDfsArticleAudit(
  run: AgentRun,
  contract: TaskExecutionClientRunContract & object,
  url: string,
): Promise<NonNullable<TaskExecutionClientRunContract["optimizationOptions"]>> {
  const base = { ...(contract.optimizationOptions ?? {}) };
  const workflowId = Number(run.context?.workflowId ?? run.plan?.workflowId ?? 0);
  const workflowRunId = Number(run.context?.workflowRunId ?? run.plan?.workflowRunId ?? 0);
  let workflowOutputs: Awaited<ReturnType<typeof fetchWorkflowStepOutputs>> | undefined;
  if (workflowId > 0 && workflowRunId > 0) {
    workflowOutputs = await fetchWorkflowStepOutputs(run.teamId, workflowId, workflowRunId);
  }

  const workflowContextBlock = String(contract.workflowContextBlock ?? base.workflowContextBlock ?? "");
  const block = base.dfsArticleAuditBlock?.trim()
    ? base.dfsArticleAuditBlock
    : await resolveDfsArticleAuditBlockForUrl({
        articleUrl: url,
        workflowOutputs,
        workflowContextBlock,
      });

  const optionalPrompt = String(contract.optionalPrompt ?? base.optionalPrompt ?? "").trim();
  return {
    ...base,
    ...(workflowContextBlock ? { workflowContextBlock } : {}),
    ...(workflowOutputs?.length ? { workflowAuditOutputs: workflowOutputs } : {}),
    ...(block.trim() ? { dfsArticleAuditBlock: block } : {}),
    ...(optionalPrompt ? { optionalPrompt } : {}),
  };
}

function resolveRunContract(run: AgentRun): TaskExecutionClientRunContract & object {
  const plan = run.plan ?? {};
  const client = plan.clientRunContract ?? {};
  const payload = plan.executionPayload ?? {};
  const siteId =
    String(
      run.context?.siteId ??
        (payload as { siteId?: string }).siteId ??
        (client as { siteId?: string }).siteId ??
        "",
    ).trim() || undefined;
  const merged = {
    ...payload,
    ...client,
    ...(siteId ? { siteId } : {}),
    optimizationOptions: mergeRunContractOptimizationOptions(
      payload as TaskExecutionPayload,
      client as TaskExecutionClientRunContract,
    ),
  } as TaskExecutionClientRunContract & object;
  if (
    run.recipeKey === "local_dominator_export"
    && (payload as TaskExecutionPayload).keyword !== undefined
  ) {
    merged.keyword = (payload as TaskExecutionPayload).keyword;
  }
  return merged;
}

async function completeOptimizerWithOptionalEmail(args: {
  run: AgentRun;
  site: WordPressSite;
  contract: TaskExecutionClientRunContract & object;
  executionId: number;
  saveLocalArchive: boolean;
  ok: boolean;
  result: Record<string, unknown>;
  summaryText: string;
  summary?: string;
  onStep?: AgentRunHarnessContext["onStep"];
}) {
  const executionKind = executionKindFromRun(args.run) || "content_optimizer";
  if (shouldSkipInlineDeliveries(args.run)) {
    await completeExecutionArchiveOnly({
      teamId: args.run.teamId,
      executionId: args.executionId,
      run: args.run,
      saveLocalArchive: args.saveLocalArchive,
      ok: args.ok,
      result: args.result,
      error: args.ok ? undefined : String(args.result.error ?? "Run failed"),
    });
    return {};
  }
  return completeAgentRunExecution({
    run: args.run,
    teamId: args.run.teamId,
    executionId: args.executionId,
    contract: args.contract,
    saveLocalArchive: args.saveLocalArchive,
    ok: args.ok,
    result: args.result,
    summaryText: args.summaryText,
    fileNameHint: `${args.site.name} ${executionKind.replace(/_/g, " ")}`,
    tokenContext: {
      siteName: args.site.name,
      automationTitle: automationTitleFromRun(args.run),
      executionKind,
      summary: args.summary,
    },
    onStep: (label, status) => args.onStep?.(label, status ?? "running"),
  });
}

async function resolveTaskExecutionTerminalState(
  run: AgentRun,
  ctx: AgentRunHarnessContext,
): Promise<AgentRunResult | null> {
  const executionId = run.plan?.taskExecutionId;
  if (!executionId || !run.teamId) return null;

  const { execution } = await fetchTaskExecution(run.teamId, executionId);
  if (!execution) return null;

  if (execution.status === "completed") {
    const checkpoint = readAgentRunCheckpoint(run);
    return {
      updated: checkpoint.uploadedUrls.length || checkpoint.completedUrls.length || 1,
      message: execution.progress?.message || "Task execution completed",
      batchKey: run.clientBatchKey || undefined,
    };
  }

  if (execution.status === "failed") {
    if (ctx.resumePoint || agentRunHasResumeProgress(run)) {
      await reopenTaskExecutionForResume(run.teamId, executionId);
      return null;
    }
    throw new Error(execution.error || execution.progress?.error || "Task execution failed");
  }

  if (execution.status === "cancelled") {
    throw new Error("Cancelled");
  }

  return null;
}

function progressReporter(
  run: AgentRun,
  ctx: AgentRunHarnessContext,
  siteId: string,
  batchKey: string,
  checkpointTotals?: { totalCount?: number; completedCount?: number },
): Dispatch<SetStateAction<Record<string, OptimizationProgressState>>> {
  const executionId = run.plan?.taskExecutionId;
  const bridge = getAgentRunOptimizationBridge();
  const base = bridge?.setOptimizationProgress;
  let stepChain = Promise.resolve();

  return (updater) => {
    let snapshot: Record<string, OptimizationProgressState> = {};

    if (base) {
      base((prev) => {
        snapshot =
          typeof updater === "function"
            ? updater(prev as Record<string, OptimizationProgressState>)
            : (updater as Record<string, OptimizationProgressState>);
        return snapshot;
      });
    } else {
      snapshot =
        typeof updater === "function"
          ? updater({} as Record<string, OptimizationProgressState>)
          : (updater as Record<string, OptimizationProgressState>);
    }

    const entry =
      (snapshot[siteId] as { stepId?: string; message?: string; step?: string; progress?: number; pageUrl?: string } | undefined) ??
      (snapshot[batchKey] as { stepId?: string; message?: string; step?: string; progress?: number; pageUrl?: string } | undefined) ??
      (Object.values(snapshot)[0] as { stepId?: string; message?: string; step?: string; progress?: number; pageUrl?: string } | undefined);

    if (entry?.message || entry?.stepId || entry?.step) {
      const message = entry.message || entry.step || entry.stepId || "Running";
      const stepPayload = {
        currentUrl: entry.pageUrl,
        currentUrlProgress: typeof entry.progress === "number" ? entry.progress : undefined,
        totalCount: checkpointTotals?.totalCount,
        currentIndex: checkpointTotals?.completedCount,
        lastMessage: message,
      };
      stepChain = stepChain.then(() =>
        Promise.resolve(ctx.onStep?.(message, "running", stepPayload)),
      );
      if (executionId) {
        const stepId = entry.stepId === "done" ? "publish" : entry.stepId;
        void patchTaskExecutionProgress(run.teamId, executionId, {
          stepId,
          message: entry.message,
          progress: typeof entry.progress === "number" ? entry.progress : undefined,
        });
      }
    }

    const message = entry?.message || entry?.step || undefined;
    const hasProgressPatch = Boolean(message) || typeof entry?.progress === "number";
    if (hasProgressPatch) {
      scheduleAgentRunCheckpointPatch(run.teamId, run.id, {
        lastMessage: message,
        currentUrlProgress: typeof entry?.progress === "number" ? entry.progress : undefined,
        totalCount: checkpointTotals?.totalCount,
      });
    }
  };
}

export async function runTaskExecutionClientHarness(
  run: AgentRun,
  sites: WordPressSite[],
  ctx: AgentRunHarnessContext,
): Promise<AgentRunResult> {
  const executionId = run.plan?.taskExecutionId;
  if (!run.plan?.clientRunContract || !executionId) {
    throw new Error("Task execution contract missing from agent run plan.");
  }

  const terminalResult = await resolveTaskExecutionTerminalState(run, ctx);
  if (terminalResult) {
    return terminalResult;
  }

  const preliminaryContract = resolveRunContract(run);
  const effectiveRecipe = resolveAgentRunRecipeKey(run);

  if (effectiveRecipe === "browser_automation" && !preliminaryContract.siteId?.trim()) {
    if (browserAutomationRequiresClient(preliminaryContract as TaskExecutionPayload)) {
      throw new Error("Set a client before running browser automation.");
    }
    return runBrowserAutomationDirectHarness(run, ctx);
  }

  if (effectiveRecipe === "ads_reporting") {
    const site = resolveGscReportingSite(run, sites);
    const contract = resolveRunContract(run);
    const adsConfig = resolveAdsReportingRunConfig(contract);
    const reportingContract = {
      ...contract,
      comparePreset: adsConfig.comparePreset,
      gscComparePresetId: adsConfig.presetId,
      gscCompareRanges: adsConfig.compareRanges,
    };
    return runAdsReportingClientHarness(
      run,
      site,
      reportingContract,
      executionId,
      ctx,
      resolveAgentRunBatchKey(run, site.id),
    );
  }

  if (effectiveRecipe === "gsc_reporting") {
    const site = resolveGscReportingSite(run, sites);
    const contract = resolveRunContract(run);
    const gscConfig = resolveGscReportingRunConfig(contract);
    const reportingContract = {
      ...contract,
      comparePreset: gscConfig.comparePreset,
      gscComparePresetId: gscConfig.presetId,
      gscCompareRanges: gscConfig.compareRanges,
      gscReportStructure: gscConfig.gscReportStructure,
    };
    return runGscReportingClientHarness(
      run,
      site,
      reportingContract,
      executionId,
      ctx,
      resolveAgentRunBatchKey(run, site.id),
    );
  }

  const pool = await loadSitesForAgentRun(run, sites);
  const site = resolveAgentRunWordPressSite(
    run,
    pool,
    "WordPress site not found for this task.",
  );
  const contract = resolveRunContract(run);

  const batchKey = resolveAgentRunBatchKey(run, site.id);

  if (effectiveRecipe === "local_dominator_export") {
    return runLocalDominatorExportClientHarness(run, site, contract, executionId, ctx, batchKey);
  }

  if (effectiveRecipe === "chatgpt_website_audit") {
    return runChatGptAuditClientHarness(run, site, contract, executionId, ctx, batchKey);
  }

  if (effectiveRecipe === "dfs_llm_article_audit") {
    return runDfsArticleAuditClientHarness(run, site, contract, executionId, ctx, batchKey);
  }

  if (effectiveRecipe === "browser_automation") {
    return runBrowserAutomationClientHarness(run, site, contract, executionId, ctx, batchKey);
  }

  if (effectiveRecipe === "content_gap_check") {
    return runContentGapCheckClientHarness(run, site, contract, executionId, ctx, batchKey);
  }

  if (effectiveRecipe === "entity_generator") {
    return runEntityGeneratorClientHarness(run, site, contract, executionId, ctx, batchKey);
  }

  if (effectiveRecipe === "sap_generator" || shouldRunSapGeneratorHarness(contract)) {
    return runSapGeneratorClientHarness(run, site, contract, executionId, ctx, batchKey);
  }

  if (effectiveRecipe === "entity_page_creator" || shouldRunEntityPageCreatorHarness(contract)) {
    return runEntityPageCreatorClientHarness(run, site, contract, executionId, ctx, batchKey);
  }

  if (effectiveRecipe === "post_creator" || shouldRunPostCreatorHarness(contract)) {
    return runPostCreatorClientHarness(run, site, contract, executionId, ctx, batchKey);
  }

  if (effectiveRecipe !== "content_optimizer_bulk" && effectiveRecipe !== "overview_pages_meta_batch") {
    throw new Error(`Unsupported agent run recipe: ${String(effectiveRecipe || "unknown")}`);
  }

  if (isTaskExecutionTargetAll(contract.url) || contract.scope === "all" || contract.targetBucket) {
    return runTaskExecutionBulkClientHarness(run, site, contract, executionId, ctx, batchKey);
  }

  if (!contract.resolvedPost?.id) {
    throw new Error("Task execution contract is missing resolved post.");
  }

  const executionKind = executionKindFromRun(run) || "content_optimizer";
  const saveLocalArchive = effectiveSaveLocalArchive(executionKind, contract);
  const resumePayload = ctx.resumePoint?.payload ?? readAgentRunCheckpoint(run).lastStepPayload ?? {};
  if (resumePayload.uploaded === true && typeof resumePayload.url === "string") {
    const emailResult = await completeOptimizerWithOptionalEmail({
      run,
      site,
      contract,
      executionId,
      saveLocalArchive,
      ok: true,
      result: { url: resumePayload.url },
      summaryText: `Optimized ${resumePayload.url}`,
      summary: `Optimized ${resumePayload.url}`,
      onStep: ctx.onStep,
    });
    return {
      updated: 1,
      message: `Optimized ${resumePayload.url}`,
      batchKey,
      ...emailResult,
    };
  }

  await ctx.onStep?.("Load", "running", {
    phase: "single_url",
    url: contract.url,
    currentIndex: 0,
    totalCount: 1,
    currentUrl: contract.url,
    currentUrlProgress: 5,
  });
  await patchTaskExecutionProgress(run.teamId, executionId, {
    stepId: "load",
    message: "Loading page and ACF…",
    progress: 0.05,
  });
  await patchAgentRunCheckpoint(run.teamId, run.id, {
    totalCount: 1,
    currentIndex: 0,
    currentUrl: contract.url,
    currentUrlProgress: 5,
    lastMessage: "Loading page and ACF…",
  });

  if (await ctx.isCancelled?.()) {
    throw new Error("Cancelled");
  }

  const resolvedPost = {
    id: contract.resolvedPost.id,
    title: "",
    link: contract.resolvedPost.link ?? contract.url,
    slug: contract.resolvedPost.slug ?? "",
    subtype: contract.resolvedPost.subtype,
    endpoint: contract.resolvedPost.endpoint,
  };

  const bridge = getAgentRunOptimizationBridge();
  const optimizationOptions = await optimizationOptionsWithDfsArticleAudit(run, contract, contract.url);

  await handleOptimizeContent({
    site,
    url: contract.url,
    updateMode: contract.updateMode,
    setGscQueriesForSelection: noopSetState,
    setIsKeywordSelectionOpen: noopSetState,
    setGscClusterAnalysis: noopSetState,
    setIsAnalyzingClusters: noopSetState,
    skipOnNoGSC: true,
    optimizationOptions,
    resolvedPost,
    testMode: Boolean(contract.optimizationOptions?.testMode),
    setIsOptimizingContent:
      bridge?.setIsOptimizingContent ??
      (noopSetState as Dispatch<SetStateAction<Record<string, boolean>>>),
    setOptimizationProgress: progressReporter(run, ctx, site.id, batchKey, { totalCount: 1, completedCount: 0 }),
    setOptimizationFileManagers:
      bridge?.setOptimizationFileManagers ??
      (noopSetState as Dispatch<SetStateAction<Record<string, OptimizationFileManager>>>),
    setPendingOptimization: noopSetState as Dispatch<SetStateAction<unknown>>,
    optimizationFileManagers: bridge?.optimizationFileManagers ?? {},
    continueOptimizationRef: bridge?.continueOptimizationRef ?? { current: null },
  });

  await patchAgentRunCheckpoint(run.teamId, run.id, {
    completedUrls: [contract.url],
    uploadedUrls: [contract.url],
    currentUrl: contract.url,
    currentIndex: 0,
    totalCount: 1,
    currentUrlProgress: 100,
    lastMessage: "Uploaded to WordPress",
    updated: 1,
    completedUrlSummaries: [{ url: contract.url, postTitle: humanizeSlugFromUrl(contract.url) }],
  });

  const singleDonePayload = {
    phase: "single_url",
    url: contract.url,
    uploaded: true,
    currentIndex: 0,
    totalCount: 1,
    uploadedUrls: [contract.url],
    completedUrls: [contract.url],
  };
  await ctx.onStep?.("Uploaded to WordPress", "running", singleDonePayload);

  const emailResult = await completeOptimizerWithOptionalEmail({
    run,
    site,
    contract,
    executionId,
    saveLocalArchive,
    ok: true,
    result: { url: contract.url },
    summaryText: `Optimized ${contract.url}`,
    summary: `Optimized ${contract.url}`,
    onStep: ctx.onStep,
  });

  return {
    updated: 1,
    message: `Optimized ${contract.url}`,
    batchKey,
    ...emailResult,
  };
}

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

async function runTaskExecutionBulkClientHarness(
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
