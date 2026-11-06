import { loadApiKey } from "@/lib/api";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { type WordPressSite } from "@/components/integrations/types";
import {
  updateOptimizationProgress,
  bindRunProgressReporter,
} from "./optimization-helpers";
import {
  buildOptimizeSelectionsFromStoredBrief,
  mergeStoredSeoResearchBriefIntoContext,
  parseSeoResearchBrief,
  type PageGscResultLike,
} from "@/lib/content-optimization/seo-research-brief-for-optimize";
import {
  ensureSeoResearchBriefForOptimize,
  resolveOptimizeFocusKeyword,
} from "@/lib/content-optimization/ensure-seo-research-brief-for-optimize";
import { getMuteOptimizationToasts } from "./optimization-toast-mute";
import { generateBlueprintFlow, generateAndUploadFlow } from "./blueprint-content-flow";
import type {
  PendingOptimization,
  ResolvedTargetLike,
  WpExistingPostLike,
} from "./use-optimization-state";
import type { OptimizationContext } from "@/lib/content-generation-upload";
import { markContentPrepHarnessSection } from "@/lib/overview/overview-content-prep-harness-run";
import type { ContentPrepHarnessSetters } from "@/lib/overview/overview-content-prep-harness-run";
import {
  contentOptimizeHarnessSectionIndex,
  flushUrlGeneratedFilesToBulkState,
  sanitizeHarnessArticleTitle,
} from "@/lib/overview/overview-content-optimize-pipeline";
import { extractChecklistItemTitle } from "@/lib/checklist-item-title";
import type { AIDrivenACFContext } from "@/lib/content-generation/ai-driven-acf-reader";
import { extractH2Titles } from "@/lib/content-optimization/optimize-output-verification";
import { mergeOptimizerInstructions } from "@/lib/prompt-builders/system-user";
import { isAgentRunBatchKey } from "@/lib/agent-runs/agent-run-batch-key";
import { syncContentOptimizeHarnessBodySections } from "@/lib/overview/overview-content-prep-harness-run";
import {
  buildContinueOptimizationBlueprintPrep,
  loadContinueOptimizationWordPressPosts,
  saveContinueOptimizationKeywordResearch,
} from "./continue-optimization-try-body-prep";
import {
  completeContinueOptimizationAfterUpload,
  markContinueOptimizationBlueprintHarness,
  resolveContinueOptimizationLinkTargets,
} from "./continue-optimization-try-body-finalize";

export interface ContinueOptimizationTryBodyInput {
  siteId: string;
  site: WordPressSite;
  url: string;
  updateMode: "update" | "draft";
  gscResult: unknown;
  existingPost: WpExistingPostLike | null;
  resolved: ResolvedTargetLike | null;
  existingTitle: string;
  existingContent: string;
  existingExcerpt: string;
  selectedKeyword: { query: string; clicks: number; impressions: number; ctr: number; position: number };
  clusterKeywords?: string[];
  secondaryKeywords?: string[];
  optimizationOptions: Record<string, unknown>;
  inContentImageRequest: OptimizationContext["inContentImageRequest"];
  acfFields: Record<string, unknown>;
  acfContext: unknown;
  pending: PendingOptimization;
  pendingCleanedTitle: string | undefined;
  primaryKeyword: string;
  finalOptimizationOptions: Record<string, unknown>;
  extractedEntity: string | "N/A";
  finalTitle: string;
  optimizationStartTime: number;
  fileManager: OptimizationFileManager;
  optimizationFileManagers: Record<string, OptimizationFileManager>;
  setOptimizationFileManagers: (prev: unknown) => unknown;
  setOptimizationProgress: (prev: unknown) => unknown;
  setPendingOptimization: (prev: unknown) => unknown;
  setBulkOptimizationState: (prev: unknown) => unknown;
}

export async function runContinueOptimizationTryBody(input: ContinueOptimizationTryBodyInput): Promise<void> {
  const {
    siteId,
    site,
    url,
    pending,
    setOptimizationProgress,
    setBulkOptimizationState,
  } = input;

  const openRouterApiKey = loadApiKey();
  if (!openRouterApiKey?.trim()) {
    throw new Error("OpenRouter API key not found. Please set it in settings.");
  }

  const report = bindRunProgressReporter(setOptimizationProgress, siteId);

  const batchKey = String((pending as { batchKey?: string }).batchKey ?? "").trim();
  let contentPrepHarnessSetters: ContentPrepHarnessSetters | null = null;
  const flushGeneratedFiles = () => {
    if (!batchKey) return;
    flushUrlGeneratedFilesToBulkState({
      batchKey,
      url,
      fileManager: input.fileManager,
      setBulkOptimizationState,
    });
  };

  if (batchKey) {
    contentPrepHarnessSetters = {
      siteId,
      batchKey,
      setBulkOptimizationState,
      setOptimizationProgress,
    };
  }

  try {
  await runContinueOptimizationTryBodyInner({
    ...input,
    report,
    contentPrepHarnessSetters,
    openRouterApiKey,
    flushGeneratedFiles,
  });
  } catch (err) {
    if (contentPrepHarnessSetters) {
      const errIndex = contentOptimizeHarnessSectionIndex("Blueprint");
      markContentPrepHarnessSection(url, errIndex, "done", contentPrepHarnessSetters);
    }
    throw err;
  }
}

async function runContinueOptimizationTryBodyInner(input: ContinueOptimizationTryBodyInput & {
  report: ReturnType<typeof bindRunProgressReporter>;
  contentPrepHarnessSetters: ContentPrepHarnessSetters | null;
  openRouterApiKey: string;
  flushGeneratedFiles: () => void;
}): Promise<void> {
  const {
    siteId,
    site,
    url,
    updateMode,
    gscResult,
    existingPost,
    resolved,
    existingTitle,
    existingContent,
    existingExcerpt,
    selectedKeyword,
    clusterKeywords,
    secondaryKeywords,
    optimizationOptions,
    inContentImageRequest,
    acfFields,
    acfContext,
    pending,
    pendingCleanedTitle,
    primaryKeyword,
    finalOptimizationOptions,
    optimizationStartTime,
    fileManager,
    optimizationFileManagers,
    setOptimizationFileManagers,
    setOptimizationProgress,
    setPendingOptimization,
    setBulkOptimizationState,
    finalTitle,
    extractedEntity,
    report,
    openRouterApiKey,
    contentPrepHarnessSetters,
    flushGeneratedFiles,
  } = input;
  const batchKey = String((pending as { batchKey?: string }).batchKey ?? "").trim();

  if (contentPrepHarnessSetters) {
    markContentPrepHarnessSection(
      url,
      contentOptimizeHarnessSectionIndex("Selected keyword"),
      "done",
      contentPrepHarnessSetters,
    );
    flushGeneratedFiles();
  }

  const mergedContext = mergeStoredSeoResearchBriefIntoContext(
    acfFields as Record<string, unknown>,
    acfContext as AIDrivenACFContext | undefined,
    String((acfContext as { seoResearch?: string } | undefined)?.seoResearch ?? "").trim() || undefined,
  );

  const focusKeyword = resolveOptimizeFocusKeyword({
    url,
    acfFields: acfFields as Record<string, unknown>,
    acfContext: mergedContext,
    selectedKeywordQuery: selectedKeyword.query,
    pendingPrimaryKeyword: primaryKeyword,
  });

  const gscQueries = ((gscResult as PageGscResultLike)?.queries ?? [])
    .map((q) => q.query?.trim())
    .filter(Boolean) as string[];

  const forceNewResearch =
    (finalOptimizationOptions as { forceNewResearch?: boolean } | undefined)?.forceNewResearch ===
    true;

  const ensured = await ensureSeoResearchBriefForOptimize({
    url,
    site,
    acfFields: acfFields as Record<string, unknown>,
    acfContext: mergedContext,
    storedBrief: String(mergedContext?.seoResearch ?? "").trim() || undefined,
    focusKeyword,
    gscQueries,
    muteToasts: getMuteOptimizationToasts(),
    forceNewResearch,
    onProgress: (message) =>
      updateOptimizationProgress(setOptimizationProgress, siteId, "plan", 0.05, message),
  });

  const workingAcfFields = ensured.acfFields;
  const operatorInstructions = String(
    (finalOptimizationOptions as { optionalPrompt?: string } | undefined)?.optionalPrompt ?? "",
  ).trim();
  const workingAcfContext = {
    ...ensured.acfContext,
    promptModifier: mergeOptimizerInstructions(
      operatorInstructions,
      ensured.acfContext?.promptModifier,
    ),
  };
  const seoResearchRaw = ensured.seoResearchRaw;

  if (pending.acfFields && typeof pending.acfFields === "object") {
    Object.assign(pending.acfFields as Record<string, unknown>, workingAcfFields);
  }
  pending.acfContext = workingAcfContext;

  const parsedBriefFromAcf = parseSeoResearchBrief(seoResearchRaw);
  if (!parsedBriefFromAcf) {
    console.warn(`[Continue optimization] SERP research brief on ${url} is not valid research brief JSON — continuing with raw brief`);
  }

  const resolvedPrimaryKeyword =
    resolveOptimizeFocusKeyword({
      url,
      acfFields: workingAcfFields,
      acfContext: workingAcfContext,
      selectedKeywordQuery: selectedKeyword.query,
      pendingPrimaryKeyword: primaryKeyword,
    }) || primaryKeyword;

  updateOptimizationProgress(
    setOptimizationProgress,
    siteId,
    "plan",
    0.1,
    forceNewResearch ? "Using new live research…" : "Using saved research brief…",
  );

  const {
    keywordData,
    aiAnalysis,
    relatedKeywords,
    selectedKeywords: finalKwList,
    selectedH2Sections: finalH2,
    selectedPeopleAlsoAsk: finalPaa,
    selectedResearchLinks: finalLinks,
    paaRawResponse,
  } = buildOptimizeSelectionsFromStoredBrief({
    primaryKeyword: resolvedPrimaryKeyword,
    selectedKeyword,
    gscResult: gscResult as PageGscResultLike,
    seoResearchBrief: seoResearchRaw,
    clusterKeywords,
    secondaryKeywords,
    sapEntity: extractedEntity !== "N/A" ? extractedEntity : undefined,
  });


  saveContinueOptimizationKeywordResearch({
    fileManager,
    primaryKeyword,
    selectedKeyword,
    keywordData,
    aiAnalysis,
    relatedKeywords,
    finalKwList,
    finalH2,
    finalPaa,
    finalLinks,
    url,
    contentPrepHarnessSetters,
    flushGeneratedFiles,
    siteId,
    setOptimizationFileManagers,
  });

  const { wordPressPosts, wordPressPagesForOfferTable } =
    await loadContinueOptimizationWordPressPosts({
      site,
      pending,
      setOptimizationProgress,
      siteId,
    });

  updateOptimizationProgress(setOptimizationProgress, siteId, "plan", 0.65, "Building blueprint…");

  const {
    dfsArticleAuditBlock,
    titleForBlueprint,
    firstPartyAuthorityBlock,
    llmAuditSummary,
  } = await buildContinueOptimizationBlueprintPrep({
    finalOptimizationOptions,
    url,
    pendingCleanedTitle,
    finalTitle,
    existingTitle,
    primaryKeyword,
    site,
    parsedBriefFromAcf,
    workingAcfContext,
    acfFields,
    seoResearchRaw,
    fileManager,
    contentPrepHarnessSetters,
    flushGeneratedFiles,
  });

  updateOptimizationProgress(setOptimizationProgress, siteId, "plan", 0.68, "Building blueprint…");
  const forbiddenLiveH2s = existingContent?.trim() ? extractH2Titles(existingContent) : undefined;
  if (contentPrepHarnessSetters) {
    markContentPrepHarnessSection(
      url,
      contentOptimizeHarnessSectionIndex("Checklist"),
      "start",
      contentPrepHarnessSetters,
    );
  }
  const { blueprintResult, llmAuditAuthorityExternalPairs } = await generateBlueprintFlow(
    finalKwList,
    finalH2,
    finalPaa,
    finalLinks,
    titleForBlueprint,
    primaryKeyword,
    keywordData,
    paaRawResponse,
    site,
    fileManager,
    siteId,
    wordPressPosts,
    wordPressPagesForOfferTable.length ? wordPressPagesForOfferTable : undefined,
    url,
    existingPost,
    optimizationOptions?.hasEntity as boolean | undefined,
    false,
    setOptimizationProgress,
    undefined,
    dfsArticleAuditBlock || undefined,
    llmAuditSummary,
    firstPartyAuthorityBlock || undefined,
    undefined,
    seoResearchRaw,
    forbiddenLiveH2s,
    flushGeneratedFiles,
    (pipelineChecklist) => {
      if (!contentPrepHarnessSetters) return;
      const bodyTitles = pipelineChecklist
        .map((item) => extractChecklistItemTitle(item).trim())
        .filter(Boolean);
      if (!bodyTitles.length) return;
      syncContentOptimizeHarnessBodySections(url, bodyTitles, contentPrepHarnessSetters);
      flushGeneratedFiles();
    },
    (bodyHarnessTitles) => {
      if (!contentPrepHarnessSetters || !bodyHarnessTitles.length) return;
      syncContentOptimizeHarnessBodySections(url, bodyHarnessTitles, contentPrepHarnessSetters);
    },
  );

  markContinueOptimizationBlueprintHarness({
    blueprintResult,
    url,
    contentPrepHarnessSetters,
    flushGeneratedFiles,
  });

  const {
    linkTargetsPlan,
    bodyTitlesForLinkPlan,
    pipelineTitlesAfterBlueprint,
  } = await resolveContinueOptimizationLinkTargets({
    blueprintResult,
    pendingLinkTargetsPlan: pending.linkTargetsPlan,
    wordPressPosts,
    url,
    contentPrepHarnessSetters,
    flushGeneratedFiles,
    openRouterApiKey,
    siteId,
    primaryKeyword,
    fileManager,
  });

  setOptimizationFileManagers((prev: Record<string, OptimizationFileManager>) => ({ ...prev, [siteId]: fileManager }));

  updateOptimizationProgress(setOptimizationProgress, siteId, "write", 0, "Generating content and meta…");

  const bodyTitlesForPipeline = bodyTitlesForLinkPlan;
  const pipelineTitlesForContent = pipelineTitlesAfterBlueprint;
  const contentHtmlIndex = pipelineTitlesForContent.indexOf("Post content");
  const contentMdIndex = pipelineTitlesForContent.indexOf("Content Markdown");
  const implReportIndex = pipelineTitlesForContent.indexOf("Implementation report");
  const wpUploadIndex = pipelineTitlesForContent.indexOf("WordPress upload");

  const { changes } = await generateAndUploadFlow(
    blueprintResult,
    existingTitle,
    primaryKeyword,
    site,
    url,
    updateMode,
    existingPost,
    resolved,
    existingContent,
    existingExcerpt,
    selectedKeyword,
    clusterKeywords,
    wordPressPosts,
    wordPressPagesForOfferTable.length ? wordPressPagesForOfferTable : undefined,
    "",
    undefined,
    undefined,
    undefined,
    undefined,
    finalPaa,
    { ...finalOptimizationOptions, optionalPrompt: operatorInstructions || undefined, llmAuditSummary, firstPartyAuthorityBlock, llmAuditAuthorityExternalPairs, linkTargetsPlan, gscResult, seoResearchRaw },
    inContentImageRequest,
    workingAcfFields,
    workingAcfContext,
    pending.acfFullPostSnapshot,
    fileManager,
    siteId,
    setOptimizationProgress,
    setBulkOptimizationState,
    report,
    contentPrepHarnessSetters && pipelineTitlesForContent.length
      ? {
          url,
          pipelineTitles: pipelineTitlesForContent,
          setters: contentPrepHarnessSetters,
          flushGeneratedFiles,
        }
      : undefined,
  );

  const { fileCount, timeString } = await completeContinueOptimizationAfterUpload({
    contentPrepHarnessSetters,
    url,
    contentHtmlIndex,
    contentMdIndex,
    implReportIndex,
    wpUploadIndex,
    pipelineTitlesForContent,
    flushGeneratedFiles,
    changes,
    setPendingOptimization,
    siteId,
    setOptimizationFileManagers,
    optimizationFileManagers,
    fileManager,
    optimizationStartTime,
  });

  if (!isAgentRunBatchKey(batchKey)) {
    updateOptimizationProgress(
      setOptimizationProgress,
      siteId,
      "done",
      1,
      `Optimization complete in ${timeString}. ${fileCount} files generated.`,
    );
  }
}
