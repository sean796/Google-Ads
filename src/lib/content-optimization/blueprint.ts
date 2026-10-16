import { notify } from "@/lib/app-notifications";
import { NOTIFY_GENERATING_OPTIMIZED_BLUEPRINT_THIS_STEP, notifyBlueprintCreatedXSectionsStartingCo, notifyChecklistCreatedXItemsBuildingBluep } from "@/lib/notify-messages";
import { getMuteOptimizationToasts } from "@/hooks/content-optimization/optimization-toast-mute";
import { loadApiKey } from "@/lib/api";
import { generateChecklistFromSelections, generateBlueprintFromTemplate, type BlogTemplateContext } from "@/lib/blog-template-builder";
import {
  enforceForbiddenWordsOnBlueprint,
  formatBlueprintFileContent,
  formatChecklistFileContent,
  prepareChecklistForPipeline,
} from "@/lib/content-word-blocklist";
import { buildFocusedArticlePurpose } from "@/lib/content-generation/article-length-policy";
import type { KeywordData } from "@/lib/keyword-types";
import type { WordPressSite } from "@/components/integrations/types";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { truncateTitleForSEO } from "@/lib/content-generation/content-sanitizer";
import { progressWithGeneratedFiles } from "@/hooks/content-optimization/optimization-helpers";
import { cleanTitleForNonEntity } from "./title-cleaning";
import type { SemrushClusterScatterPlan } from "@/lib/semrush-cluster-scatter";
import { buildSemrushScatterContextJson } from "@/lib/semrush-cluster-scatter";
import { extractMediaFromHtmlTags } from "./images-extract";
import {
  buildForcedMediaUserPrompt,
  mergeForcedMediaIntoChecklist,
} from "./media-checklist-force";
import {
  injectLlmAuditAuthorityLinksIntoBlueprintAgents,
  injectLlmAuditAuthorityLinksIntoChecklist,
  type LlmAuditAuthorityLinkLike,
} from "@/lib/bulk/modifier-external-links";
import type { ExternalLinkPair } from "@/lib/content-generation/external-link-placeholders";

export async function generateOptimizedBlueprint(
  selectedKeywords: string[],
  selectedH2Sections: string[],
  selectedPeopleAlsoAsk: string[],
  selectedResearchLinks: string[],
  existingTitle: string,
  primaryKeyword: string,
  primaryKeywordData: KeywordData,
  paaRawResponse: any,
  site: WordPressSite,
  fileManager: OptimizationFileManager,
  setProgress: (progress: { step: string; progress: number; message?: string }) => void,
  wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>,
  wordPressPagesForOfferTable?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>,
  currentPageUrl?: string,
  existingPost?: any,
  hasEntityOverride?: boolean,
  semrushForBlueprint?: {
    keywordsRag?: string;
    clusterScatter?: SemrushClusterScatterPlan;
    externalUrls?: string[];
    anchorPhrases?: string[];
  },
  dfsArticleAuditBlock?: string,
  llmAuditSummary?: string,
  firstPartyAuthorityBlock?: string,
  llmAuditAuthorityLinks?: LlmAuditAuthorityLinkLike[],
  serpResearchBriefJson?: string,
  forbiddenLiveH2s?: string[],
  onArtifactSaved?: () => void,
  onChecklistReady?: (pipelineChecklist: string[]) => void,
  onSerpH2OutlineReady?: (bodyHarnessTitles: string[]) => void,
): Promise<{ blueprintResult: any; checklist: string[]; llmAuditAuthorityExternalPairs: ExternalLinkPair[] }> {
  const openRouterApiKey = loadApiKey();
  if (!openRouterApiKey?.trim()) throw new Error("OpenRouter API key not found. Please set it in settings.");

  if (!getMuteOptimizationToasts()) notify.info(NOTIFY_GENERATING_OPTIMIZED_BLUEPRINT_THIS_STEP);

  setProgress({ step: "Generating optimized blueprint...", progress: 62, message: "Generating checklist…" });
  const researchModel = getResearchModel(site.id);

  const bodyHtmlForMedia =
    (typeof existingPost?.content === "string" ? existingPost.content : "") || "";
  const existingMedia = bodyHtmlForMedia.trim() ? extractMediaFromHtmlTags(bodyHtmlForMedia) : [];
  const forcedMediaPrompt = buildForcedMediaUserPrompt(existingMedia);

  const semrushScatterStr = buildSemrushScatterContextJson(semrushForBlueprint?.clusterScatter);
  const semrushKeywordsCtx =
    semrushForBlueprint?.keywordsRag && semrushForBlueprint.keywordsRag.trim().length > 0
      ? semrushForBlueprint.keywordsRag
      : undefined;

  let checklistResult = await generateChecklistFromSelections(
    selectedKeywords,
    selectedH2Sections,
    existingTitle || primaryKeyword,
    primaryKeywordData,
    {
      apiKey: openRouterApiKey,
      model: researchModel,
      temperature: 1.0,
      maxTokens: 16000,
      topP: 0.9,
      serpData: paaRawResponse,
      selectedPeopleAlsoAsk,
      selectedResearchLinks,
      connectedSite: { name: site.name, siteUrl: site.siteUrl },
      wordPressPosts,
      wordPressPagesForOfferTable,
      currentPageUrl,
      runExternalResearch: false,
      siteId: site.id,
      primaryKeyword,
      setProgress,
      semrushKeywordsContext: semrushKeywordsCtx,
      semrushScatterContext: semrushScatterStr,
      semrushApprovedExternalUrls: semrushForBlueprint?.externalUrls,
      semrushAnchorPhrases: semrushForBlueprint?.anchorPhrases,
      ...(forcedMediaPrompt ? { userPrompt: forcedMediaPrompt } : {}),
      ...(dfsArticleAuditBlock?.trim() ? { dfsArticleAuditBlock } : {}),
      ...(llmAuditSummary?.trim() ? { llmAuditSummary } : {}),
      ...(firstPartyAuthorityBlock?.trim() ? { firstPartyAuthorityBlock } : {}),
      ...(llmAuditAuthorityLinks?.length ? { llmAuditAuthorityLinks } : {}),
      ...(serpResearchBriefJson?.trim() ? { serpResearchBriefJson } : {}),
      ...(forbiddenLiveH2s?.length ? { forbiddenLiveH2s } : {}),
      ...(onSerpH2OutlineReady ? { onSerpH2OutlineReady } : {}),
    } as any
  );

  let checklist = checklistResult.items;

  if (llmAuditAuthorityLinks?.length) {
    checklist = injectLlmAuditAuthorityLinksIntoChecklist(checklist, llmAuditAuthorityLinks);
  }

  if (!checklist.length) {
    throw new Error("Checklist is empty; new template did not return items");
  }

  checklist = mergeForcedMediaIntoChecklist(checklist, existingMedia);
  const pipelineChecklist = prepareChecklistForPipeline(checklist);

  if (!pipelineChecklist.length) {
    throw new Error("Checklist is empty after sanitize; new template did not return items");
  }

  const checklistFileName = OptimizationFileManager.generateFilename("checklist", primaryKeyword, "txt");
  fileManager.addFile(
    checklistFileName,
    formatChecklistFileContent(checklist),
    "text/plain"
  );
  onArtifactSaved?.();
  onChecklistReady?.(pipelineChecklist);

  if (!getMuteOptimizationToasts()) notify.success(notifyChecklistCreatedXItemsBuildingBluep(pipelineChecklist.length), { duration: 4000 });
  setProgress(
    progressWithGeneratedFiles(
      { step: "Generating optimized blueprint...", progress: 70, message: "Converting checklist to blueprint structure..." },
      fileManager,
    ),
  );

  const blueprintContext: BlogTemplateContext = {
    flowTitle: existingTitle || primaryKeyword,
    flowPurpose: buildFocusedArticlePurpose(primaryKeyword),
    keywordData: primaryKeywordData,
    ...(forcedMediaPrompt ? { userPrompt: forcedMediaPrompt } : {}),
  };

  let blueprintResult: Awaited<ReturnType<typeof generateBlueprintFromTemplate>>;

  blueprintResult = await generateBlueprintFromTemplate(pipelineChecklist, blueprintContext, {
    apiKey: openRouterApiKey,
    model: researchModel,
    temperature: 1.0,
    maxTokens: 8000,
    topP: 0.9,
    connectedSite: { name: site.name, siteUrl: site.siteUrl },
    wordPressPosts,
    currentPageUrl,
    siteId: site.id,
    primaryKeyword,
    semrushKeywordsContext: semrushKeywordsCtx,
    semrushScatterContext: semrushScatterStr,
    semrushApprovedExternalUrls: semrushForBlueprint?.externalUrls,
    semrushAnchorPhrases: semrushForBlueprint?.anchorPhrases,
    ...(forcedMediaPrompt ? { userPrompt: forcedMediaPrompt } : {}),
    ...(dfsArticleAuditBlock?.trim() ? { dfsArticleAuditBlock } : {}),
    ...(llmAuditSummary?.trim() ? { llmAuditSummary } : {}),
    ...(firstPartyAuthorityBlock?.trim() ? { firstPartyAuthorityBlock } : {}),
    ...(llmAuditAuthorityLinks?.length ? { llmAuditAuthorityLinks } : {}),
  } as any);

  if (!blueprintResult.agents?.length) {
    throw new Error("Blueprint contract failed: no agents");
  }

  const enforcedBlueprint = enforceForbiddenWordsOnBlueprint(blueprintResult);
  Object.assign(blueprintResult, enforcedBlueprint);

  if (llmAuditAuthorityLinks?.length) {
    blueprintResult.agents = injectLlmAuditAuthorityLinksIntoBlueprintAgents(
      blueprintResult.agents,
      llmAuditAuthorityLinks,
    );
  }

  (blueprintResult as any).entityAnalysis = undefined;
  if (checklistResult.h2Outline?.length) {
    (blueprintResult as any).h2Outline = checklistResult.h2Outline;
  }

  if (blueprintResult.title) {
    const cleaned = cleanTitleForNonEntity(blueprintResult.title, "N/A");
    if (cleaned !== blueprintResult.title) {
      console.log("[Optimize Content] Cleaned location mentions from blueprint title:", { original: blueprintResult.title, cleaned });
      blueprintResult.title = cleaned;
    }
  }

  if (blueprintResult.title) {
    const originalLength = blueprintResult.title.length;
    blueprintResult.title = truncateTitleForSEO(blueprintResult.title, 50);
    if (originalLength > 50) {
      console.log("[Optimize Content] Truncated blueprint title to 50 characters (Content Optimizer module requirement):", {
        originalLength,
        truncatedLength: blueprintResult.title.length,
      });
    }
  }

  if (!getMuteOptimizationToasts()) notify.success(notifyBlueprintCreatedXSectionsStartingCo(blueprintResult.agents.length), { duration: 4000 });

  const blueprintFileName = OptimizationFileManager.generateFilename("blueprint", primaryKeyword, "json");
  fileManager.addFile(blueprintFileName, formatBlueprintFileContent(blueprintResult as Record<string, unknown>), "application/json");
  onArtifactSaved?.();

  setProgress(
    progressWithGeneratedFiles(
      {
        step: "Generating optimized content...",
        progress: 75,
        message: `Blueprint ready (${blueprintResult.agents.length} sections)`,
      },
      fileManager,
    ),
  );

  return {
    blueprintResult,
    checklist: pipelineChecklist,
    llmAuditAuthorityExternalPairs: (llmAuditAuthorityLinks ?? []).map((link) => ({
      url: link.url,
      anchor: link.anchorText,
    })),
  };
}
