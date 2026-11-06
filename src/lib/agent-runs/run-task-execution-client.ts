import type { Dispatch, SetStateAction } from "react";
import { handleOptimizeContent } from "@/hooks/content-optimization/handle-optimize-content";
import { humanizeSlugFromUrl } from "@/hooks/content-optimization/bulk-optimization-constants";
import type { WordPressSite } from "@/components/integrations/types";
import type { AgentRunHarnessContext } from "@/lib/agent-runs/harness-registry";
import {
  patchAgentRunCheckpoint,
  readAgentRunCheckpoint,
} from "@/lib/agent-runs/agent-run-checkpoint";
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
import type { AgentRun, AgentRunResult } from "@/lib/agent-runs-types";
import type { TaskExecutionClientRunContract, TaskExecutionPayload } from "@/lib/tasks-types";
import { isTaskExecutionTargetAll } from "@/lib/task-execution-target";
import { patchTaskExecutionProgress } from "@/lib/tasks-api";
import { effectiveSaveLocalArchive } from "@/lib/schedule-output-destination";
import { executionKindFromRun } from "@/lib/automation-email-delivery";
import type { OptimizationFileManager } from "@/lib/optimization-file-manager";
import {
  completeOptimizerWithOptionalEmail,
  noopSetState,
  optimizationOptionsWithDfsArticleAudit,
  progressReporter,
  resolveRunContract,
  resolveTaskExecutionTerminalState,
} from "@/lib/agent-runs/run-task-execution-helpers";
import { runTaskExecutionBulkClientHarness } from "@/lib/agent-runs/run-task-execution-bulk";

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
