import { notify } from "@/lib/app-notifications";
import { notifyXPostInWordpress } from "@/lib/notify-messages";
import { getMuteOptimizationToasts } from "@/hooks/content-optimization/optimization-toast-mute";
import { loadApiKey } from "@/lib/api";
import type { OptimizationFileManager } from "@/lib/optimization-file-manager";
import type { WordPressSite } from "@/components/integrations/types";
import { getStoredSites } from "@/components/integrations/storage";
import { buildPortfolioBlockedHosts } from "@/lib/portfolio-link-blocklist";
import { generateOptimizedContent } from "@/lib/content-generation/content-generator";
import { readACFFieldsAgentically, type AIDrivenACFContext } from "@/lib/content-generation/ai-driven-acf-reader";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { reduceHarnessSectionList } from "@/lib/bulk/harness-sections-reducer";
import { mergeHarnessProgressSiteAndBatch, mergeOptimizationProgress } from "@/hooks/content-optimization/optimization-helpers";
import type { RunProgressReporter, ContentOptimizerStepId } from "@/lib/content-optimization/content-optimizer-run-progress";
import { harnessSubProgress } from "@/lib/content-optimization/content-optimizer-run-progress";
import { markContentPrepHarnessSection, type ContentPrepHarnessBridge, pipelineIndexForHarnessTitle } from "@/lib/overview/overview-content-prep-harness-run";
import type { Dispatch, SetStateAction } from "react";
import type { OptimizationProgressState } from "@/hooks/content-optimization/use-optimization-state";
import { polishContentForWordPressUpload, toStringContent, type BlueprintResult, type OptimizationContext } from "./content-generation/content-upload-polish-and-faq";
import { uploadContentToWordPressWithExtras } from "./content-generation/content-upload-wp-and-extras";
import { completeContentUploadPostSyncAndReport } from "./content-generation/content-upload-post-sync-report";
import type { uploadToWordPress } from "@/lib/content-generation/wordpress-uploader";
export { polishContentForWordPressUpload, toStringContent, dedupeTrimmedUrls, buildGscKeywordsContextJson, type BlueprintResult, type OptimizationContext, type ContentUploadPolishArgs } from "./content-generation/content-upload-polish-and-faq";
export { uploadContentToWordPressWithExtras, type ContentUploadWpAndExtrasArgs } from "./content-generation/content-upload-wp-and-extras";
export { completeContentUploadPostSyncAndReport, type ContentUploadPostSyncReportArgs } from "./content-generation/content-upload-post-sync-report";

export async function generateAndUploadContent(
  blueprintResult: BlueprintResult,
  existingTitle: string,
  primaryKeyword: string,
  site: WordPressSite,
  context: OptimizationContext,
  fileManager: OptimizationFileManager,
  setProgress: RunProgressReporter,
  onContentChunk?: (chunk: string) => void,
  optimizationOptions?: {
    optimizeTitle?: boolean;
    optimizeMeta?: boolean;
    optimizeExcerpt?: boolean;
    optimizeContent?: boolean;
    optimizeFeaturedImage?: boolean;
    featuredImageType?: 'ai-generated' | 'google-maps';
    hasEntity?: boolean;
    inventorySitemapSource?: "posts" | "pages" | "sap";
    optimizeExtraText?: boolean;
    optimizeExtraImage?: boolean;
    stagingSite?: boolean;
    bulkFaqMinimum4?: boolean;
    contentOnlyUpload?: boolean;
    seoExtraTextFieldOnly?: boolean;
  },
  acfFields?: Record<string, unknown>,
  acfContext?: AIDrivenACFContext,
  /** Raw optimization progress setter for harness section list merges (functional updates). */
  setOptimizationProgressRaw?: Dispatch<
    SetStateAction<Record<string, OptimizationProgressState>>
  >,
  /** Bulk Details: status-only updates on url harness — no legacy site harness markdown. */
  contentPrepHarnessBridge?: ContentPrepHarnessBridge,
): Promise<{ result: Awaited<ReturnType<typeof uploadToWordPress>>["result"]; markdownContent: string; excerpt: string; changes?: { titleChanged?: boolean; metaChanged?: boolean; contentChanged?: boolean; title?: string; meta?: string } }> {
  // Defaults when no options passed. Caller's optimizationOptions are respected so content can be updated.
  const DEFAULT_OPTIMIZATION_OPTIONS = {
    // Force content-only optimization by default.
    // Title + RankMath meta fields must never be generated or overwritten.
    optimizeTitle: false,
    optimizeMeta: false,
    optimizeExcerpt: false,
    optimizeContent: true,
    optimizeFeaturedImage: false,
    optimizeExtraText: false,
    optimizeExtraImage: false,
  };

  const opts = { ...DEFAULT_OPTIMIZATION_OPTIONS, ...context.optimizationOptions, ...optimizationOptions };
  const seoExtraTextFieldOnly = opts.seoExtraTextFieldOnly === true;

  // Content optimizer bulk runs always generate body HTML unless SEO-extra-text-only mode.
  const shouldOptimizeContent =
    seoExtraTextFieldOnly !== true && opts.optimizeContent !== false;
  const shouldOptimizeFeaturedImage = opts.optimizeFeaturedImage === true;
  const shouldOptimizeTitle = opts.optimizeTitle === true;
  const shouldOptimizeMeta = opts.optimizeMeta === true;
  const shouldOptimizeExcerpt = opts.optimizeExcerpt === true;
  const legacyContentOnlyInference =
    opts.optimizeTitle === false &&
    opts.optimizeMeta === false &&
    opts.optimizeExcerpt === false &&
    opts.optimizeContent === true;
  const contentOnlyUpload =
    opts.contentOnlyUpload === true || (opts.contentOnlyUpload !== false && legacyContentOnlyInference);
  const skipMediaPipeline =
    (contentOnlyUpload && !seoExtraTextFieldOnly) ||
    (shouldOptimizeContent &&
      !shouldOptimizeFeaturedImage &&
      opts.optimizeExtraText !== true &&
      opts.optimizeExtraImage !== true);
  const bulkFaqMinimum4 = opts.bulkFaqMinimum4 === true;
  const writeFocusKeywords = !contentOnlyUpload;
  const generateFaqSchema = !contentOnlyUpload;
  const writeMetaDescription = shouldOptimizeExcerpt && !contentOnlyUpload;
  const writeExcerpt = shouldOptimizeExcerpt && !contentOnlyUpload;
  
  // Log optimization options for debugging
  console.log('[Content Generation Upload] Optimization options:', {
    optimizeContent: opts.optimizeContent,
    shouldOptimizeContent,
    optimizeTitle: opts.optimizeTitle,
    shouldOptimizeTitle,
    optimizeMeta: opts.optimizeMeta,
    shouldOptimizeMeta,
    optimizeExcerpt: opts.optimizeExcerpt,
    shouldOptimizeExcerpt,
    optimizeFeaturedImage: opts.optimizeFeaturedImage,
    shouldOptimizeFeaturedImage,
    rawOptions: optimizationOptions
  });

  // Load API key once for use in content generation, in-content images, and featured images
  const openRouterApiKey = loadApiKey();
  if (!openRouterApiKey || openRouterApiKey.trim().length === 0) {
    throw new Error('OpenRouter API key not found. Please set it in settings.');
  }

  // Resolve AI-driven ACF context: use passed acfContext or read agentically from acfFields (no static key names)
  let resolvedAcfContext: AIDrivenACFContext | undefined = acfContext;
  if (!resolvedAcfContext && acfFields && Object.keys(acfFields).length > 0) {
    resolvedAcfContext = await readACFFieldsAgentically(acfFields, {
      apiKey: openRouterApiKey,
      siteUrl: site.siteUrl,
      model: getResearchModel(site.id),
    });
  }

  const uploadStartTime = Date.now();

  // Step 1: Generate optimized content (skip if content optimization is disabled)
  let htmlContent: string;
  let excerpt: string;
  let preservedMediaUrls: string[] = [];
  // Content-only module: never generate or overwrite meta/description/excerpt.
  // Keep excerpt empty so UI and upload code can't render or persist it.
  excerpt = '';

  const legacyProgress = (stepId: ContentOptimizerStepId) =>
    (p: { step: string; progress: number; message?: string }) => {
      setProgress(stepId, Math.min(1, Math.max(0, p.progress / 100)), p.message ?? p.step);
    };

  if (!shouldOptimizeContent) {
    throw new Error("Content optimization is required for this pipeline.");
  }

  if (!getMuteOptimizationToasts()) notify.info(notifyXPostInWordpress(context.updateMode === "update" ? "Updating" : "Creating"), { duration: 3000 });
  setProgress("write", 0, "Generating content and meta…");

    const portfolioList = buildPortfolioBlockedHosts(getStoredSites(), {
      excludeSiteId: site.id,
      excludeSiteUrl: site.siteUrl,
    });
    const portfolioBlockedHostsForPrompts =
      portfolioList.length > 0 ? portfolioList : undefined;

    const blueprintAgents = Array.isArray(blueprintResult?.agents) ? blueprintResult.agents : [];
    const plannedContentSections = blueprintAgents.length;
    const usePrepHarnessBridge = Boolean(contentPrepHarnessBridge);

    if (setOptimizationProgressRaw && !usePrepHarnessBridge) {
      const waitingContentHarness = Array.from({ length: plannedContentSections }, (_, sectionIndex) => ({
        sectionIndex,
        title: '',
        status: 'waiting' as const,
      }));
      setOptimizationProgressRaw((prev) =>
        mergeOptimizationProgress(prev, site.id, {
          stepId: "write",
          subProgress: 0,
          harnessSections: waitingContentHarness,
          harnessPlannedSectionCount: plannedContentSections > 0 ? plannedContentSections : null,
        }),
      );
    }

    const contentResult = await generateOptimizedContent({
      blueprintResult,
      existingTitle,
      primaryKeyword,
      site,
      context: {
        wordPressRAGContext: context.wordPressRAGContext,
        wordPressPosts: context.wordPressPosts,
        url: context.url,
        existingContent: toStringContent(context.existingContent),
        inContentImageRequest: skipMediaPipeline ? undefined : context.inContentImageRequest,
        acfFields,
        acfContext: resolvedAcfContext,
        isPage: context.resolved?.subtype === 'page',
        gscKeywordsContext: context.gscKeywordsContext,
        semrushKeywordsContext: context.semrushKeywordsContext,
        semrushScatterContext: context.semrushScatterContext,
        semrushExternalUrls: context.semrushExternalUrls,
        portfolioBlockedHosts: portfolioBlockedHostsForPrompts,
        llmAuditSummary: context.llmAuditSummary,
        firstPartyAuthorityBlock: context.firstPartyAuthorityBlock,
        llmAuditAuthorityExternalPairs: context.llmAuditAuthorityExternalPairs,
        linkTargetsPlan: context.linkTargetsPlan,
      },
      fileManager,
      setProgress: legacyProgress("write"),
      onContentChunk,
      shouldOptimizeContent,
      hasEntityOverride: optimizationOptions?.hasEntity,
      skipMetaDescriptionGeneration: !shouldOptimizeMeta,
      onHarnessSection: usePrepHarnessBridge
        ? (payload) => {
            const bridge = contentPrepHarnessBridge!;
            const sectionIndex = pipelineIndexForHarnessTitle(payload.title, bridge.pipelineTitles);
            if (sectionIndex < 0) return;
            const phase =
              payload.phase === "done"
                ? "done"
                : payload.phase === "start"
                  ? "start"
                  : "progress";
            markContentPrepHarnessSection(
              bridge.url,
              sectionIndex,
              phase,
              bridge.setters,
              0,
              payload.phase === "done" ? payload.markdownSlice : undefined,
              bridge.pipelineTitles,
            );
            if (payload.phase === "done") {
              bridge.flushGeneratedFiles?.();
            }
          }
        : setOptimizationProgressRaw
          ? (payload) => {
              setOptimizationProgressRaw((prev) => {
                const nextSections = reduceHarnessSectionList(prev[site.id]?.harnessSections || [], payload);
                return mergeHarnessProgressSiteAndBatch(prev, site.id, {
                  stepId: "write",
                  subProgress: harnessSubProgress("write", payload.sectionIndex, payload.totalSections, payload.phase),
                  harnessSections: nextSections,
                  harnessPlannedSectionCount: payload.totalSections,
                  message: `Harness ${payload.sectionIndex + 1}/${payload.totalSections}: ${payload.title}${payload.phase === "start" ? "…" : ""}`,
                });
              });
            }
          : undefined,
    });

    const markdownContent = contentResult.markdownContent;
    htmlContent = contentResult.htmlContent;
    if (!contentOnlyUpload) {
      excerpt = contentResult.excerpt ?? "";
    }
    preservedMediaUrls = contentResult.preservedMediaUrls ?? [];

    if (contentPrepHarnessBridge) {
      const bridge = contentPrepHarnessBridge;
      const contentHtmlIndex = pipelineIndexForHarnessTitle("Post content", bridge.pipelineTitles);
      const contentMdIndex = pipelineIndexForHarnessTitle("Content Markdown", bridge.pipelineTitles);
      if (contentHtmlIndex >= 0) {
        markContentPrepHarnessSection(
          bridge.url,
          contentHtmlIndex,
          "done",
          bridge.setters,
          0,
          htmlContent,
          bridge.pipelineTitles,
        );
      }
      if (contentMdIndex >= 0) {
        markContentPrepHarnessSection(
          bridge.url,
          contentMdIndex,
          "done",
          bridge.setters,
          0,
          markdownContent,
          bridge.pipelineTitles,
        );
      }
      bridge.flushGeneratedFiles?.();
    }

    // CRITICAL: Never silently upload when user asked for content optimization but we got no generated content
    const generatedTrimmed = (markdownContent || '').trim();
    if (context.updateMode === 'update' && !generatedTrimmed) {
      console.error('[Content Generation Upload] Content optimization was enabled but no content was generated', {
        generatedLength: generatedTrimmed.length,
        existingContentLength: toStringContent(context.existingContent).length,
      });
      throw new Error('Content optimization was enabled but no content was generated. Refusing to overwrite with empty content.');
    }
  const polishResult = await polishContentForWordPressUpload({
    htmlContent,
    markdownContent,
    blueprintResult,
    blueprintAgents,
    existingTitle,
    primaryKeyword,
    site,
    context,
    shouldOptimizeContent,
    preservedMediaUrls,
    acfFields,
    resolvedAcfContext,
    openRouterApiKey,
    excerpt,
    setProgress,
  });
  htmlContent = polishResult.htmlContent;

  const wpResult = await uploadContentToWordPressWithExtras({
    context,
    blueprintResult,
    cleanedExistingTitle: polishResult.cleanedExistingTitle,
    existingTitle,
    primaryKeyword,
    htmlContent,
    strippedHtml: polishResult.strippedHtml,
    markdownContent,
    excerpt,
    shouldOptimizeContent,
    shouldOptimizeTitle,
    shouldOptimizeFeaturedImage,
    optimizeExtraText: opts.optimizeExtraText === true,
    optimizeExtraImage: opts.optimizeExtraImage === true,
    featuredImageType: opts.featuredImageType,
    writeFocusKeywords,
    generateFaqSchema,
    prefetchedFaqRaw: polishResult.prefetchedFaqRaw,
    bulkFaqMinimum4,
    writeMetaDescription,
    writeExcerpt,
    legacyProgress,
    entity: polishResult.entity,
    allowedExternalUrls: polishResult.allowedExternalUrls,
    openRouterApiKey,
    optimizeFaqBundle: polishResult.optimizeFaqBundle,
    skipMediaPipeline,
    contentOnlyUpload,
    seoExtraTextFieldOnly,
    site,
    fileManager,
    setProgress,
    setOptimizationProgressRaw,
    resolvedAcfContext,
    contentPrepHarnessBridge,
  });

  return completeContentUploadPostSyncAndReport({
    uploadResult: wpResult.uploadResult,
    strippedHtml: wpResult.strippedHtml,
    extraTextContent: wpResult.extraTextContent,
    strippedExtra: wpResult.strippedExtra,
    context,
    site,
    blueprintResult,
    existingTitle,
    primaryKeyword,
    excerpt,
    markdownContent,
    shouldOptimizeTitle,
    shouldOptimizeMeta,
    shouldOptimizeContent,
    contentOnlyUpload,
    seoExtraTextFieldOnly,
    basicWordPressContentUpdate: wpResult.basicWordPressContentUpdate,
    fileManager,
    setProgress,
    legacyProgress,
    uploadStartTime,
    openRouterApiKey,
    resolvedAcfContext,
    acfFields,
    optimizeFaqBundle: polishResult.optimizeFaqBundle,
    markWpUploadHarness: wpResult.markWpUploadHarness,
    contentPrepHarnessBridge,
    opts,
  });
}
