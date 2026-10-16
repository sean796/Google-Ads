import { notify } from "@/lib/app-notifications";
import { NOTIFY_USING_TEST_BLUEPRINT_DATA } from "@/lib/notify-messages";
import {
  enforceForbiddenWordsOnBlueprint,
  formatBlueprintFileContent,
  formatChecklistFileContent,
  prepareChecklistForPipeline,
} from "@/lib/content-word-blocklist";
import type { KeywordData } from "@/lib/keyword-types";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { type WordPressSite } from "@/components/integrations/types";
import { generateOptimizedBlueprint, generateAndUploadContent } from "@/lib/content-optimization-helpers";
import { updateOptimizationProgress, patchOptimizationProgress } from "./optimization-helpers";
import type { ContentOptimizerStepId } from "@/lib/content-optimization/content-optimizer-run-progress";
import type { SemrushClusterScatterPlan } from "@/lib/semrush-cluster-scatter";

export async function generateBlueprintFlow(
  selectedKeywords: string[],
  selectedH2Sections: string[],
  selectedPeopleAlsoAsk: string[],
  selectedResearchLinks: string[],
  titleForBlueprint: string,
  primaryKeyword: string,
  keywordData: KeywordData,
  paaRawResponse: any,
  site: WordPressSite,
  fileManager: OptimizationFileManager,
  siteId: string,
  wordPressPosts: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>,
  wordPressPagesForOfferTable: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }> | undefined,
  url: string,
  existingPost: any,
  hasEntityOverride: boolean | undefined,
  testMode: boolean,
  setOptimizationProgress: (prev: any) => any,
  semrushForBlueprint?: {
    keywordsRag?: string;
    clusterScatter?: SemrushClusterScatterPlan;
    externalUrls?: string[];
    anchorPhrases?: string[];
  },
  dfsArticleAuditBlock?: string,
  llmAuditSummary?: string,
  firstPartyAuthorityBlock?: string,
  llmAuditAuthorityLinks?: import("@/lib/bulk/modifier-external-links").LlmAuditAuthorityLinkLike[],
  serpResearchBriefJson?: string,
  forbiddenLiveH2s?: string[],
  onArtifactSaved?: () => void,
  onChecklistReady?: (pipelineChecklist: string[]) => void,
  onSerpH2OutlineReady?: (bodyHarnessTitles: string[]) => void,
): Promise<{ blueprintResult: any; checklist: string[]; llmAuditAuthorityExternalPairs: import("@/lib/content-generation/external-link-placeholders").ExternalLinkPair[] }> {
  if (testMode) {
    throw new Error("Test mode is not supported.");
  }

  const blueprintResultData = await generateOptimizedBlueprint(
    selectedKeywords,
    selectedH2Sections,
    selectedPeopleAlsoAsk,
    selectedResearchLinks,
    titleForBlueprint,
    primaryKeyword,
    keywordData,
    paaRawResponse,
    site,
    fileManager,
    (legacy) => {
      const sub = Math.min(1, Math.max(0, legacy.progress / 100));
      patchOptimizationProgress(setOptimizationProgress, siteId, {
        stepId: "plan" as ContentOptimizerStepId,
        subProgress: 0.7 + sub * 0.25,
        message: legacy.message ?? legacy.step,
      });
    },
    wordPressPosts,
    wordPressPagesForOfferTable,
    url,
    existingPost,
    hasEntityOverride,
    semrushForBlueprint,
    dfsArticleAuditBlock,
    llmAuditSummary,
    firstPartyAuthorityBlock,
    llmAuditAuthorityLinks,
    serpResearchBriefJson,
    forbiddenLiveH2s,
    onArtifactSaved,
    onChecklistReady,
    onSerpH2OutlineReady,
  );

  return {
    blueprintResult: blueprintResultData.blueprintResult,
    checklist: blueprintResultData.checklist,
    llmAuditAuthorityExternalPairs: blueprintResultData.llmAuditAuthorityExternalPairs,
  };
}

export async function generateAndUploadFlow(
  blueprintResult: any,
  existingTitle: string,
  primaryKeyword: string,
  site: WordPressSite,
  url: string,
  updateMode: 'update' | 'draft',
  existingPost: any,
  resolved: any,
  existingContent: string,
  existingExcerpt: string,
  selectedKeyword: any,
  clusterKeywords: string[] | undefined,
  wordPressPosts: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>,
  wordPressPagesForOfferTable: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }> | undefined,
  wordPressRAGContext: string,
  /** Top GSC queries JSON for SEO field inspiration (aligned with Overview export). */
  gscKeywordsContext: string | undefined,
  /** Semrush keyword lists JSON for content RAG (bulk content run). */
  semrushKeywordsContext: string | undefined,
  /** Semrush cluster + zone scatter JSON for content (bulk content run). */
  semrushScatterContext: string | undefined,
  /** Semrush-approved external URLs - kept in HTML at upload; prompt allowlist. */
  semrushExternalUrls: string[] | undefined,
  selectedPeopleAlsoAsk: any[],
  optimizationOptions: any,
  inContentImageRequest: any,
  acfFields: Record<string, any> | undefined,
  acfContext?: AIDrivenACFContext,
  acfFullPostSnapshot?: Record<string, unknown>,
  fileManager: OptimizationFileManager,
  siteId: string,
  setOptimizationProgress: (prev: any) => any,
  setBulkOptimizationState: (prev: any) => any,
  report?: (
    stepId: ContentOptimizerStepId,
    subProgress: number,
    message?: string,
  ) => void,
  contentPrepHarnessBridge?: import("@/lib/overview/overview-content-prep-harness-run").ContentPrepHarnessBridge,
): Promise<{ excerpt: string | undefined; changes?: { titleChanged?: boolean; metaChanged?: boolean; contentChanged?: boolean; title?: string; meta?: string } }> {
  const defaultOptimizationOptions = {
    optimizeTitle: true,
    optimizeMeta: true,
    optimizeExcerpt: true,
    optimizeContent: true,
    optimizeFeaturedImage: false,
    optimizeExtraText: true,
    optimizeExtraImage: false
  };
  const mergedOptimizationOptions = optimizationOptions
    ? { ...defaultOptimizationOptions, ...optimizationOptions }
    : defaultOptimizationOptions;

  const optimizationContext = {
    site,
    url,
    updateMode,
    existingPost,
    resolved,
    existingTitle,
    existingContent,
    existingExcerpt,
    primaryKeyword,
    selectedKeyword,
    clusterKeywords,
    wordPressPosts,
    wordPressPagesForOfferTable,
    wordPressRAGContext,
    gscKeywordsContext,
    semrushKeywordsContext,
    semrushScatterContext,
    semrushExternalUrls,
    optimizationOptions: mergedOptimizationOptions,
    inContentImageRequest: inContentImageRequest ? { imageType: inContentImageRequest.imageType as any, userPrompt: inContentImageRequest.userPrompt } : undefined,
    selectedPeopleAlsoAsk,
    acfFullPostSnapshot,
    llmAuditSummary: String(optimizationOptions?.llmAuditSummary ?? "").trim() || undefined,
    firstPartyAuthorityBlock: String(optimizationOptions?.firstPartyAuthorityBlock ?? "").trim() || undefined,
    llmAuditAuthorityExternalPairs: optimizationOptions?.llmAuditAuthorityExternalPairs,
    linkTargetsPlan: optimizationOptions?.linkTargetsPlan,
    gscResult: optimizationOptions?.gscResult,
    seoResearchRaw: typeof optimizationOptions?.seoResearchRaw === "string" ? optimizationOptions.seoResearchRaw : undefined,
  };

  const progressReporter =
    report ??
    ((stepId: ContentOptimizerStepId, subProgress: number, message?: string) => {
      updateOptimizationProgress(setOptimizationProgress, siteId, stepId, subProgress, message);
    });

  const { result, markdownContent, excerpt, changes } = await generateAndUploadContent(
    blueprintResult,
    existingTitle,
    primaryKeyword,
    site,
    optimizationContext,
    fileManager,
    progressReporter,
    undefined,
    mergedOptimizationOptions,
    acfFields,
    acfContext,
    setOptimizationProgress,
    contentPrepHarnessBridge,
  );

  const batchKey = `${site.id}-batch`;
  // Content-only module: meta/excerpt values are intentionally not persisted in bulk state.

  return { excerpt, changes };
}
