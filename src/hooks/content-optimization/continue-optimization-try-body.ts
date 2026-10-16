import { loadApiKey } from "@/lib/api";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { type WordPressSite } from "@/components/integrations/types";
import {
  updateOptimizationProgress,
  bindRunProgressReporter,
  saveKeywordResearch,
} from "./optimization-helpers";
import { saveSerpResearchBrief } from "./optimization-helpers-b";
import { createSiteCache, seedSiteCacheFromLinkablePosts } from "@/lib/wordpress-site-cache";
import { buildMergedLinkPoolRows } from "@/lib/content-generation/extra-text-inventory-links";
import {
  ensureMergedPostsPagesLinkPool,
  getBulkOptimizerInventoryFromSession,
} from "./bulk-optimization-load-inventory-snapshot";
import { snapshotHasInventoryEntries } from "@/lib/wordpress-api/inventory-match";
import { updateKeywordResearchFile } from "./keyword-research-flow";
import {
  buildOptimizeSelectionsFromStoredBrief,
  llmAuditSummaryFromSeoResearchBrief,
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
import type { PendingOptimization } from "./use-optimization-state";
import { markContentPrepHarnessSection, syncContentOptimizeHarnessBodySections } from "@/lib/overview/overview-content-prep-harness-run";
import type { ContentPrepHarnessSetters } from "@/lib/overview/overview-content-prep-harness-run";
import {
  buildContentOptimizePipelineTitles,
  contentOptimizeHarnessSectionIndex,
  flushUrlGeneratedFilesToBulkState,
  sanitizeHarnessArticleTitle,
} from "@/lib/overview/overview-content-optimize-pipeline";
import { extractChecklistItemTitle } from "@/lib/checklist-item-title";
import { resolveDfsArticleAuditBlockForUrl } from "@/lib/dfs-article-audit/resolve-dfs-article-audit-block";
import type { AIDrivenACFContext } from "@/lib/content-generation/ai-driven-acf-reader";
import { resolveSiteLocationLabel } from "@/lib/llm-audit/resolve-site-location-label";
import {
  firstPartyAuthorityBlockFromBrief,
  buildConnectedSiteIdentityBlock,
  swotTextFromResearchFields,
} from "@/lib/content-optimization/first-party-authority-prompt";
import { extractH2Titles } from "@/lib/content-optimization/optimize-output-verification";
import { mergeOptimizerInstructions } from "@/lib/prompt-builders/system-user";
import { isAgentRunBatchKey } from "@/lib/agent-runs/agent-run-batch-key";
import type { LinkTargetsPlan } from "@/lib/bulk/bulk-generation-wp-inventory";
import {
  runContentLinkTargetsHarness,
} from "@/lib/overview/overview-content-link-targets-harness-run";
import { runContinueOptimizationElementorPage } from "@/lib/elementor-page-content/continue-optimization-elementor";

export interface ContinueOptimizationTryBodyInput {
  siteId: string;
  site: WordPressSite;
  url: string;
  updateMode: "update" | "draft";
  gscResult: unknown;
  existingPost: unknown;
  resolved: unknown;
  existingTitle: string;
  existingContent: string;
  existingExcerpt: string;
  selectedKeyword: { query: string; clicks: number; impressions: number; ctr: number; position: number };
  clusterKeywords?: string[];
  secondaryKeywords?: string[];
  optimizationOptions: Record<string, unknown>;
  inContentImageRequest: unknown;
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
      markContentPrepHarnessSection(url, errIndex, "error", contentPrepHarnessSetters);
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

  saveKeywordResearch(fileManager, primaryKeyword, {
    primaryKeyword,
    gscMetrics: selectedKeyword,
    keywordData,
    aiAnalysis,
    peopleAlsoAsk: aiAnalysis.peopleAlsoAsk ?? [],
    relatedGSCKeywords: relatedKeywords,
    selectedKeywords: finalKwList,
    selectedH2Sections: finalH2,
    selectedPeopleAlsoAsk: finalPaa,
    selectedResearchLinks: finalLinks,
  });

  if (contentPrepHarnessSetters) {
    markContentPrepHarnessSection(
      url,
      contentOptimizeHarnessSectionIndex("Keyword research"),
      "done",
      contentPrepHarnessSetters,
    );
    flushGeneratedFiles();
  }

  updateKeywordResearchFile(
    fileManager,
    siteId,
    finalKwList,
    finalH2,
    finalPaa,
    finalLinks,
    setOptimizationFileManagers,
  );

  let wordPressPosts: Array<{
    id: number;
    slug: string;
    title: string;
    excerpt: string;
    link: string;
    date_gmt: string;
    postType?: "post" | "page";
  }> = [];
  const wordPressPagesForOfferTable = pending.wordPressPagesForOfferTable ?? [];

  if (site.username && site.appPassword) {
    const merged = await ensureMergedPostsPagesLinkPool(site, (msg) => {
      updateOptimizationProgress(setOptimizationProgress, siteId, "plan", 0.5, msg);
    });
    wordPressPosts = buildMergedLinkPoolRows(merged, site.siteUrl);
    if (wordPressPosts.length > 0) seedSiteCacheFromLinkablePosts(site, wordPressPosts);
  } else if (pending.wordPressPosts?.length) {
    wordPressPosts = pending.wordPressPosts;
  } else {
    const inv = getBulkOptimizerInventoryFromSession(site);
    if (inv && snapshotHasInventoryEntries(inv)) {
      wordPressPosts = buildMergedLinkPoolRows(inv, site.siteUrl);
      if (wordPressPosts.length > 0) seedSiteCacheFromLinkablePosts(site, wordPressPosts);
    } else {
      updateOptimizationProgress(setOptimizationProgress, siteId, "plan", 0.5, "Loading link pool…");
      const cache = await createSiteCache(site, undefined, (msg) => {
        updateOptimizationProgress(setOptimizationProgress, siteId, "plan", 0.55, msg);
      });
      wordPressPosts = cache.posts;
    }
  }

  updateOptimizationProgress(setOptimizationProgress, siteId, "plan", 0.65, "Building blueprint…");

  const dfsArticleAuditBlock =
    String(finalOptimizationOptions?.dfsArticleAuditBlock ?? "").trim()
    || (await resolveDfsArticleAuditBlockForUrl({
      articleUrl: url,
      workflowOutputs: finalOptimizationOptions?.workflowAuditOutputs,
      workflowContextBlock: String(finalOptimizationOptions?.workflowContextBlock ?? ""),
    }));

  const titleForBlueprint = sanitizeHarnessArticleTitle(
    pendingCleanedTitle || finalTitle || existingTitle,
    { pageUrl: url, keyword: primaryKeyword },
  );
  if (!site.name?.trim()) {
    throw new Error("Connected site name is required for content optimization.");
  }

  const parsedBrief = parsedBriefFromAcf;

  const swotText = swotTextFromResearchFields({
    promptModifier: String(
      workingAcfContext.promptModifier
      ?? (acfFields as { prompt_modifier?: string } | undefined)?.prompt_modifier
      ?? "",
    ),
    seoResearch: seoResearchRaw,
  });
  const serviceArea = resolveSiteLocationLabel(site, primaryKeyword);
  const firstPartyAuthorityBlock = [
    firstPartyAuthorityBlockFromBrief(parsedBrief, swotText),
    buildConnectedSiteIdentityBlock(site.name.trim(), serviceArea),
  ]
    .filter(Boolean)
    .join("\n\n");
  saveSerpResearchBrief(fileManager, primaryKeyword, seoResearchRaw);
  if (contentPrepHarnessSetters) {
    markContentPrepHarnessSection(
      url,
      contentOptimizeHarnessSectionIndex("SERP research brief"),
      "done",
      contentPrepHarnessSetters,
    );
    flushGeneratedFiles();
  }
  const llmAuditSummary = llmAuditSummaryFromSeoResearchBrief(seoResearchRaw);

  const resolvedSubtype = String(
    (resolved as { subtype?: string; postType?: string } | undefined)?.subtype ?? "",
  ).toLowerCase();

  if (resolvedSubtype === "page") {
    const internalLinkHints = wordPressPosts
      .slice(0, 40)
      .map((p) => `${p.title}: ${p.link}`)
      .join("\n");
    await runContinueOptimizationElementorPage({
      site,
      siteId,
      url,
      focusKeyword: resolvedPrimaryKeyword,
      pageTitle: resolved?.title?.trim() || undefined,
      seoResearchRaw,
      internalLinkHints,
      setOptimizationProgress,
      contentPrepHarnessSetters,
      flushGeneratedFiles,
    });
    return;
  }

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

  if (contentPrepHarnessSetters) {
    const bodyTitles = (blueprintResult.agents ?? [])
      .map((agent: { title?: string }) => agent.title?.trim())
      .filter(Boolean) as string[];
    const pipelineTitles = buildContentOptimizePipelineTitles(bodyTitles);
    if (bodyTitles.length) {
      syncContentOptimizeHarnessBodySections(url, bodyTitles, contentPrepHarnessSetters);
    }
    markContentPrepHarnessSection(
      url,
      contentOptimizeHarnessSectionIndex("Checklist"),
      "done",
      contentPrepHarnessSetters,
      0,
      undefined,
      pipelineTitles,
    );
    markContentPrepHarnessSection(
      url,
      contentOptimizeHarnessSectionIndex("Blueprint"),
      "done",
      contentPrepHarnessSetters,
      0,
      undefined,
      pipelineTitles,
    );
    flushGeneratedFiles();
  }

  const bodyTitlesForLinkPlan = (blueprintResult.agents ?? [])
    .map((agent: { title?: string }) => agent.title?.trim())
    .filter(Boolean) as string[];
  const pipelineTitlesAfterBlueprint = buildContentOptimizePipelineTitles(bodyTitlesForLinkPlan);
  let linkTargetsPlan: LinkTargetsPlan | undefined = pending.linkTargetsPlan;

  if (contentPrepHarnessSetters) {
    markContentPrepHarnessSection(
      url,
      contentOptimizeHarnessSectionIndex("Link targets"),
      "start",
      contentPrepHarnessSetters,
      0,
      undefined,
      pipelineTitlesAfterBlueprint,
    );
  }

  if (!linkTargetsPlan && wordPressPosts.length > 0) {
    const fileSlug =
      url
        .split("/")
        .filter(Boolean)
        .pop()
        ?.toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "article";
    linkTargetsPlan = await runContentLinkTargetsHarness({
      apiKey: openRouterApiKey,
      siteId,
      primaryKeyword,
      bodySectionTitles: bodyTitlesForLinkPlan,
      linkPool: wordPressPosts,
      fileManager,
      fileSlug,
    });
    flushGeneratedFiles();
  }

  if (contentPrepHarnessSetters && linkTargetsPlan) {
    markContentPrepHarnessSection(
      url,
      contentOptimizeHarnessSectionIndex("Link targets"),
      "done",
      contentPrepHarnessSetters,
      0,
      undefined,
      pipelineTitlesAfterBlueprint,
    );
    flushGeneratedFiles();
  }

  if (contentPrepHarnessSetters && bodyTitlesForLinkPlan.length) {
    syncContentOptimizeHarnessBodySections(url, bodyTitlesForLinkPlan, contentPrepHarnessSetters);
    flushGeneratedFiles();
  }

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

  if (contentPrepHarnessSetters) {
    if (contentHtmlIndex >= 0) {
      markContentPrepHarnessSection(
        url,
        contentHtmlIndex,
        "done",
        contentPrepHarnessSetters,
        0,
        undefined,
        pipelineTitlesForContent,
      );
    }
    if (contentMdIndex >= 0) {
      markContentPrepHarnessSection(
        url,
        contentMdIndex,
        "done",
        contentPrepHarnessSetters,
        0,
        undefined,
        pipelineTitlesForContent,
      );
    }
    if (implReportIndex >= 0) {
      markContentPrepHarnessSection(
        url,
        implReportIndex,
        "done",
        contentPrepHarnessSetters,
        0,
        undefined,
        pipelineTitlesForContent,
      );
    }
    if (wpUploadIndex >= 0) {
      markContentPrepHarnessSection(
        url,
        wpUploadIndex,
        "done",
        contentPrepHarnessSetters,
        0,
        undefined,
        pipelineTitlesForContent,
      );
    }
    flushGeneratedFiles();
  }

  if (changes) {
    setPendingOptimization((prev: Record<string, PendingOptimization>) => {
      const pend = prev[siteId];
      if (!pend) return prev;
      return {
        ...prev,
        [siteId]: { ...pend, optimizationChanges: changes, url },
      };
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  setPendingOptimization((prev: Record<string, PendingOptimization>) => {
    const updated = { ...prev };
    delete updated[siteId];
    return updated;
  });

  setOptimizationFileManagers((prev: Record<string, OptimizationFileManager>) => ({ ...prev }));

  const finalFileManager = optimizationFileManagers[siteId] || fileManager;
  const fileCount = finalFileManager.getFileCount();
  const totalOptimizationTime = Math.floor((Date.now() - optimizationStartTime) / 1000);
  const minutes = Math.floor(totalOptimizationTime / 60);
  const seconds = totalOptimizationTime % 60;
  const timeString = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

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
