/**
 * Content Generation Upload Orchestrator
 * Orchestrates content generation, WordPress upload, and optimization workflows
 * Uses entity endpoint logic directly - NO service-area conditionals, NO normalization
 */

import { notify } from "@/lib/app-notifications";
import { NOTIFY_CONTENT_OPTIMIZATION_DISABLED_PROCEEDING, NOTIFY_CONTENT_OPTIMIZED_BUT_IMPLEMENTATION_REP, NOTIFY_FAILED_TO_GENERATE_EXTRA_IMAGE_CONTINUIN, NOTIFY_FAILED_TO_GENERATE_EXTRA_TEXT_CONTINUING, NOTIFY_IMPLEMENTATION_REPORT_GENERATED, NOTIFY_POST_UPLOAD_COMPLETED_BUT_MAY_NOT_HAVE_B, notifyOptimizedXs, notifyViewPostX, notifyXPostInWordpress } from "@/lib/notify-messages";
import { getMuteOptimizationToasts } from "@/hooks/content-optimization/optimization-toast-mute";
import { loadApiKey } from "@/lib/api";
import { htmlToMarkdown } from "@/lib/wordpress-converter";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { generateImplementationReport } from "@/lib/implementation-report-generator";
import { type WordPressSite } from "@/components/integrations/types";
import { getStoredSites } from "@/components/integrations/storage";
import { buildPortfolioBlockedHosts } from "@/lib/portfolio-link-blocklist";
import { generateOptimizedContent } from "@/lib/content-generation/content-generator";
import { handleFeaturedImage } from "@/lib/content-generation/featured-image-handler";
import { uploadToWordPress } from "@/lib/content-generation/wordpress-uploader";
import { updateWordPressPost } from "@/lib/wordpress-api";
import { optimizeMetaFields } from "@/lib/content-generation/meta-optimizer";
import { updateACFOriginField } from "@/lib/content-generation/acf-origin-updater";
import { cleanTitleForNonEntity } from "@/lib/content-optimization-helpers";
import type { ImageType } from "@/lib/image-section-analyzer";
import { generateExtraTextForPage, generateExtraImageForPage } from "@/lib/content-generation/page-extra-content-generator";
import { EXTRA_TEXT_HARNESS_TOTAL_SECTIONS } from "@/lib/content-generation/page-extra-content-generator-prompts";
import { readACFFieldsAgentically, hasExtraTextField, hasExtraImageField, type AIDrivenACFContext } from "@/lib/content-generation/ai-driven-acf-reader";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { normalizeInternalUrl, extractInternalLinksFromContent } from "@/lib/wordpress-api/validate-internal-links";
import { ensureWhatWeOfferTablePageLinks } from "@/lib/content-generation/what-we-offer-table-page-links";
import { removeInvalidInternalLinks, deduplicateInternalLinksInHtml } from "@/lib/content-generation/content-sanitizer";
import { resolveInternalLinkPlaceholdersInHtml } from "@/lib/content-generation/internal-link-placeholders";
import { prepareHarnessContentForUpload } from "@/lib/content-generation/harness-upload-prep";
import {
  applyOptimizeFaqToHarnessHtml,
  type PrecomputedAcfSeoBundle,
} from "@/lib/content-generation/bulk-acf-seo-bundle";
import {
  mergeExternalLinkPairs,
  parseExternalSemrushPairsFromAgents,
  parseLlmAuditAuthorityPairsFromAgents,
} from "@/lib/content-generation/external-link-placeholders";
import { ensureSemrushExternalLinksInHtml } from "@/lib/content-generation/ensure-semrush-external-links";
import { reduceHarnessSectionList } from "@/lib/bulk/harness-sections-reducer";
import {
  mergeHarnessProgressSiteAndBatch,
  mergeOptimizationProgress,
  progressWithGeneratedFiles,
} from "@/hooks/content-optimization/optimization-helpers";
import type { RunProgressReporter, ContentOptimizerStepId } from "@/lib/content-optimization/content-optimizer-run-progress";
import { harnessSubProgress } from "@/lib/content-optimization/content-optimizer-run-progress";
import {
  markContentPrepHarnessSection,
  type ContentPrepHarnessBridge,
  pipelineIndexForHarnessTitle,
} from "@/lib/overview/overview-content-prep-harness-run";
import { rowUrlMatchesWordPressSite } from "@/lib/overview/overview-aiseo-after-upload";
import {
  attachWordPressUploadProofToFileManager,
} from "@/lib/overview/overview-wp-upload-harness-artifacts";
import type { OverviewBulkSeoApiItem } from "@/lib/overview/overview-bulk-seo-payload";
import { restCollectionEndpointForSubtype } from "@/lib/overview/overview-bulk-seo-payload";

/** WordPress REST API can return content/excerpt as { raw, rendered }. Normalize to string. */
function toStringContent(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'raw' in value && typeof (value as { raw?: string }).raw === 'string')
    return (value as { raw: string }).raw;
  if (typeof value === 'object' && 'rendered' in value && typeof (value as { rendered?: string }).rendered === 'string')
    return (value as { rendered: string }).rendered;
  return String(value);
}

function dedupeTrimmedUrls(urls: string[] | undefined): string[] {
  if (!urls?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const t = typeof u === 'string' ? u.trim() : '';
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export interface OptimizationContext {
  site: WordPressSite;
  url: string; // URL of the page being optimized
  updateMode: 'update' | 'draft';
  existingPost: any;
  resolved: any;
  existingTitle: string;
  existingContent: string;
  existingExcerpt: string;
  primaryKeyword: string;
  selectedKeyword: {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  };
  clusterKeywords?: string[];
  wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>;
  /** Entity SAP: pages bucket for What We Offer table links (title attributes). */
  wordPressPagesForOfferTable?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string; postType?: "post" | "page" }>;
  wordPressRAGContext?: string; // WordPress content as RAG context for AI
  /** JSON string: real Google queries for Rank Math meta inspiration (aligned with Overview). */
  gscKeywordsContext?: string;
  /** JSON string: Semrush url_organic + phrase_related keyword lists (bulk content run). */
  semrushKeywordsContext?: string;
  /** JSON string: Semrush keyword clusters + zone scatter (bulk content run). */
  semrushScatterContext?: string;
  /** Semrush-filtered external URLs - preserved verbatim in HTML; sanitizer allowlist. */
  semrushExternalUrls?: string[];
  optimizationOptions?: {
    optimizeTitle?: boolean;
    optimizeMeta?: boolean;
    optimizeExcerpt?: boolean;
    optimizeContent?: boolean;
    optimizeFeaturedImage?: boolean;
    featuredImageType?: 'ai-generated' | 'google-maps';
    testMode?: boolean;
    hasEntity?: boolean;
    /** When set from overview/bulk SAP runs, enables SAP image bank for featured. */
    inventorySitemapSource?: "posts" | "pages" | "sap";
    optimizeExtraText?: boolean;
    optimizeExtraImage?: boolean;
    stagingSite?: boolean;
    bulkFaqMinimum4?: boolean;
    /** When true: skip focus-keyword/FAQ writes during WP upload but still allow post-upload ACF SEO (optimizeMeta). */
    contentOnlyUpload?: boolean;
    /** Only write the `seo_extra_text` / `extra_text` ACF field; no origin/meta optimizer or other ACF. */
    seoExtraTextFieldOnly?: boolean;
  };
  inContentImageRequest?: { imageType: ImageType; userPrompt?: string }; // Optional in-content image generation request
  selectedPeopleAlsoAsk?: string[]; // PAA questions for FAQ schema generation
  /** From prefetch `getACFFieldsForPost` — lets upload skip a second ACF read when ids match. */
  acfFullPostSnapshot?: Record<string, unknown>;
  /** Merged LLM audit facts for harness sections (from seo_research or live fetch). */
  llmAuditSummary?: string;
  firstPartyAuthorityBlock?: string;
  /** LLM audit authority externals (gov/municipal/news) — harness allowlist. */
  llmAuditAuthorityExternalPairs?: import("@/lib/content-generation/external-link-placeholders").ExternalLinkPair[];
  linkTargetsPlan?: import("@/lib/bulk/bulk-generation-wp-inventory").LinkTargetsPlan;
  gscResult?: unknown;
  seoResearchRaw?: string;
}

/** Queries by impressions for meta AI (same shape as Overview GSC context). */
export function buildGscKeywordsContextJson(
  pageUrl: string,
  queries: Array<{ query?: string; impressions?: number }> | undefined,
): string | undefined {
  if (!pageUrl?.trim() || !queries?.length) return undefined;
  const sorted = [...queries]
    .filter((q) => q?.query?.trim())
    .sort((a, b) => (b.impressions || 0) - (a.impressions || 0));
  const rows = sorted.map((q) => ({ query: String(q.query).trim() }));
  if (!rows.length) return undefined;
  return JSON.stringify({ gsc_keywords_for_url: pageUrl.trim(), rows });
}

export async function generateAndUploadContent(
  blueprintResult: any,
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
  acfFields?: Record<string, any>,
  acfContext?: AIDrivenACFContext,
  /** Raw optimization progress setter for harness section list merges (functional updates). */
  setOptimizationProgressRaw?: (fn: (prev: any) => any) => void,
  /** Bulk Details: status-only updates on url harness — no legacy site harness markdown. */
  contentPrepHarnessBridge?: ContentPrepHarnessBridge,
): Promise<{ result: any; markdownContent: string; excerpt: string; changes?: { titleChanged?: boolean; metaChanged?: boolean; contentChanged?: boolean; title?: string; meta?: string } }> {
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
  let markdownContent: string;
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
      setOptimizationProgressRaw((prev: any) =>
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
                  : "generating";
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
              setOptimizationProgressRaw((prev: any) => {
                const entry = prev[site.id] || {};
                const nextSections = reduceHarnessSectionList(entry.harnessSections || [], payload);
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

    markdownContent = contentResult.markdownContent;
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

  // Shared harness upload prep (Overview scroll links, anchor ids, placeholder resolve, HTML repair)
  setProgress("polish", 0.1, "Preparing content for upload…");
  const externalUrlPairs = mergeExternalLinkPairs(
    parseExternalSemrushPairsFromAgents(blueprintAgents),
    parseLlmAuditAuthorityPairsFromAgents(blueprintAgents),
    context.llmAuditAuthorityExternalPairs ?? [],
  );
  htmlContent = await prepareHarnessContentForUpload({
    markdownContent: markdownContent || htmlContent,
    blueprintAgents,
    wordPressPosts: context.wordPressPosts,
    siteId: site.id,
    siteUrl: site.siteUrl,
    currentPageUrl: context.url,
    externalUrlPairs,
    apiKey: openRouterApiKey,
    keyword: primaryKeyword,
    articleTitle: blueprintResult?.title || existingTitle || primaryKeyword,
    linkTargetsPlan: context.linkTargetsPlan,
    onePassOptimize: context.resolved?.subtype !== "page",
  });

  const isBlogOptimize = context.resolved?.subtype !== "page";

  if (context.wordPressPosts && context.wordPressPosts.length > 0) {
    htmlContent = deduplicateInternalLinksInHtml(htmlContent);
  }

  if (context.wordPressPagesForOfferTable?.length && !isBlogOptimize) {
    htmlContent = ensureWhatWeOfferTablePageLinks(
      htmlContent,
      context.wordPressPagesForOfferTable,
      context.url,
      site.siteUrl,
    );
  }

    if (shouldOptimizeContent && context.semrushExternalUrls?.length && !isBlogOptimize) {
    htmlContent = ensureSemrushExternalLinksInHtml(htmlContent, context.semrushExternalUrls);
  }

  const blueprintEntity = (blueprintResult as any)?.entity;
  const entity = blueprintEntity && blueprintEntity !== 'N/A' ? blueprintEntity : undefined;

  let cleanedExistingTitle = existingTitle;
  if (!blueprintEntity || blueprintEntity === 'N/A') {
    cleanedExistingTitle = cleanTitleForNonEntity(existingTitle, blueprintEntity || 'N/A');
    if (cleanedExistingTitle !== existingTitle) {
      console.log('[Content Generation Upload] Cleaned existingTitle before upload:', {
        original: existingTitle,
        cleaned: cleanedExistingTitle,
        entity: blueprintEntity || 'N/A'
      });
    }
  }

  let optimizeFaqBundle: PrecomputedAcfSeoBundle | null = null;
  if (shouldOptimizeContent) {
    setProgress("polish", 0.85, "Generating FAQ and appending table…");
    const postTitleForFaq =
      blueprintResult?.title?.trim() || cleanedExistingTitle || primaryKeyword;
    let preBlogSkeleton: Record<string, unknown> | undefined;
    const seoResearchRaw =
      resolvedAcfContext?.seoResearch?.trim() ||
      (typeof acfFields?.seo_research === "string" ? acfFields.seo_research.trim() : "");
    if (seoResearchRaw) {
      try {
        preBlogSkeleton = JSON.parse(seoResearchRaw) as Record<string, unknown>;
      } catch {
        preBlogSkeleton = undefined;
      }
    }
    const faqApplied = await applyOptimizeFaqToHarnessHtml({
      htmlContent,
      markdownContent: markdownContent || htmlContent,
      site,
      primaryKw: primaryKeyword,
      postTitle: postTitleForFaq,
      excerpt,
      apiKey: openRouterApiKey,
      postUrl: context.url?.trim() || site.siteUrl,
      preBlogSkeleton,
      entity,
      onProgress: (message) => setProgress("polish", 0.88, message),
    });
    htmlContent = faqApplied.html;
    optimizeFaqBundle = faqApplied.faqBundle;
  }

  let strippedHtml = removeInvalidInternalLinks(htmlContent, context.wordPressPosts, site.siteUrl);
  let extraTextContent: string | undefined;
  let extraImageBase64: string | undefined;
  let strippedExtra: string | undefined;

  const prefetchedFaqRaw = (() => {
    if (!acfFields) return '';
    const raw = acfFields.faq ?? acfFields.seo_faq;
    if (typeof raw === 'string') return raw;
    if (raw != null) return String(raw);
    return '';
  })();

  const allowedExternalUrls = dedupeTrimmedUrls([
    ...(context.semrushExternalUrls ?? []),
    ...preservedMediaUrls,
  ]);

  let uploadResult: Awaited<ReturnType<typeof uploadToWordPress>>;

  const wpUploadHarnessIndex = contentPrepHarnessBridge
    ? pipelineIndexForHarnessTitle("WordPress upload", contentPrepHarnessBridge.pipelineTitles)
    : -1;
  const markWpUploadHarness = (
    phase: "start" | "done" | "error",
    markdownSlice?: string,
  ) => {
    if (!contentPrepHarnessBridge || wpUploadHarnessIndex < 0) return;
    markContentPrepHarnessSection(
      contentPrepHarnessBridge.url,
      wpUploadHarnessIndex,
      phase,
      contentPrepHarnessBridge.setters,
      0,
      markdownSlice,
      contentPrepHarnessBridge.pipelineTitles,
    );
    contentPrepHarnessBridge.flushGeneratedFiles?.();
  };

  markWpUploadHarness("start");
  setProgress("publish", 0.05, "Uploading to WordPress…");

  const basicWordPressContentUpdate =
    context.updateMode === "update" &&
    contentOnlyUpload &&
    !seoExtraTextFieldOnly;

  if (skipMediaPipeline) {
    if (shouldOptimizeContent && strippedHtml?.trim()) {
      fileManager.syncContentArtifactHtml(strippedHtml, htmlToMarkdown(strippedHtml));
      const filesPatch = progressWithGeneratedFiles(
        { stepId: "publish", subProgress: 0.2, message: "Saving optimized body to WordPress…" },
        fileManager,
      );
      setProgress(filesPatch.stepId!, filesPatch.subProgress!, filesPatch.message, filesPatch);
    }

    if (basicWordPressContentUpdate) {
      const postIdNum = Number(context.existingPost?.id ?? 0);
      if (!Number.isFinite(postIdNum) || postIdNum <= 0) {
        throw new Error("WordPress update blocked: missing postId");
      }
      const postTypeEndpoint =
        (context.existingPost?.postTypeEndpoint as string | undefined)?.trim() ||
        (context.resolved?.subtype === "page" ? "pages" : "posts");
      const postStatus = (context.existingPost?.status as string | undefined)?.trim() || "publish";
      const originalSlug = context.existingPost?.slug || context.resolved?.slug;
      const wpResult = await updateWordPressPost(
        site.siteUrl,
        site.username,
        site.appPassword,
        postIdNum,
        cleanedExistingTitle,
        strippedHtml,
        undefined,
        postStatus as "draft" | "publish",
        (context.existingPost?.post_type as string | undefined) || "post",
        undefined,
        undefined,
        undefined,
        originalSlug,
        postTypeEndpoint,
      );
      if (!wpResult.success) {
        throw new Error(wpResult.error || "WordPress update-post failed");
      }
      if (wpResult.contentSaveWarning) {
        throw new Error(String(wpResult.contentSaveWarning));
      }
      uploadResult = {
        result: wpResult,
        postId: wpResult.postId ?? postIdNum,
        link: wpResult.link || context.url,
        finalTitle: cleanedExistingTitle,
      };
    } else {
    uploadResult = await uploadToWordPress({
      context,
      blueprintResult,
      existingTitle: cleanedExistingTitle,
      primaryKeyword,
      htmlContent: strippedHtml,
      excerpt,
      featuredImageId: undefined,
      shouldOptimizeTitle,
      writeFocusKeywords,
      generateFaqSchema,
      prefetchedFaqRaw,
      bulkFaqMinimum4,
      writeMetaDescription,
      writeExcerpt,
      setProgress: legacyProgress("publish"),
      entity,
      faqQuestions: context.selectedPeopleAlsoAsk,
      allowedExternalUrls,
      apiKey: openRouterApiKey,
      extraTextContent: undefined,
      extraImageBase64: undefined,
      seoExtraTextFieldOnly: false,
      faqSchemaOverride: optimizeFaqBundle?.faqForAcf,
    });
    }
  } else {
    const featuredImageType = opts.featuredImageType || "ai-generated";

    const featuredImageResult = await handleFeaturedImage({
      blueprintResult,
      existingTitle,
      primaryKeyword,
      site,
      markdownContent,
      existingContent: toStringContent(context.existingContent),
      existingPost: context.existingPost,
      fileManager,
      setProgress: legacyProgress("polish"),
      shouldOptimizeFeaturedImage,
      apiKey: openRouterApiKey,
      featuredImageType,
      entity,
    });

    const { featuredImageId } = featuredImageResult;

    const isPage = context.resolved?.subtype === 'page' ||
                   context.resolved?.endpoint === 'pages' ||
                   context.existingPost?.postTypeEndpoint === 'pages';
    const hasExtraText = resolvedAcfContext ? hasExtraTextField(resolvedAcfContext) : false;
    const shouldGenerateExtraText =
      opts.optimizeExtraText === true &&
      (resolvedAcfContext ? hasExtraText || isPage : isPage);

    if (shouldGenerateExtraText) {
      try {
        if (setOptimizationProgressRaw) {
          setOptimizationProgressRaw((prev: any) =>
            mergeHarnessProgressSiteAndBatch(prev, site.id, {
              stepId: "write",
              subProgress: 0.85,
              harnessSections: [],
              harnessPlannedSectionCount: EXTRA_TEXT_HARNESS_TOTAL_SECTIONS,
            }),
          );
        }
        setProgress("write", 0.85, `Extra text 1/${EXTRA_TEXT_HARNESS_TOTAL_SECTIONS}: H2…`);
        const existingBody = toStringContent(context.existingContent).trim();
        const pageRagFromPost =
          context.wordPressRAGContext?.trim() ||
          (existingBody
            ? `Main post content (match this topic):\n${existingBody.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4500)}`
            : "");
        extraTextContent = await generateExtraTextForPage({
          existingContent: existingBody,
          primaryKeyword,
          secondaryKeywords: context.clusterKeywords || [],
          pageUrl: context.url,
          pageTitle: cleanedExistingTitle,
          wordPressRAGContext: pageRagFromPost,
          wordPressPosts: context.wordPressPosts || [],
          site,
          apiKey: openRouterApiKey,
          siteId: site.id,
          setProgress: legacyProgress("write"),
          onHarnessSection: setOptimizationProgressRaw
            ? (payload) => {
                setOptimizationProgressRaw((prev: any) => {
                  const entry = prev[site.id] || {};
                  const nextSections = reduceHarnessSectionList(entry.harnessSections || [], payload);
                  return mergeHarnessProgressSiteAndBatch(prev, site.id, {
                    stepId: "write",
                    subProgress: harnessSubProgress("write", payload.sectionIndex, payload.totalSections, payload.phase),
                    harnessSections: nextSections,
                    harnessPlannedSectionCount: payload.totalSections,
                    message: `Extra text ${payload.sectionIndex + 1}/${payload.totalSections}: ${payload.title}${payload.phase === "start" ? "…" : ""}`,
                  });
                });
              }
            : undefined,
        });
        console.log('[Content Generation Upload] Extra text generated for page:', extraTextContent?.substring(0, 100));
      } catch (error) {
        console.error('[Content Generation Upload] Failed to generate extra text:', error);
        if (!getMuteOptimizationToasts()) notify.warning(NOTIFY_FAILED_TO_GENERATE_EXTRA_TEXT_CONTINUING, { duration: 3000 });
      }
    }

    const hasExtraImage = resolvedAcfContext ? hasExtraImageField(resolvedAcfContext) : false;
    const shouldGenerateExtraImage = opts.optimizeExtraImage === true && (resolvedAcfContext ? hasExtraImage : isPage);
    if (shouldGenerateExtraImage) {
      try {
        setProgress("write", 0.9, "Generating extra image…");
        const extraImageResult = await generateExtraImageForPage({
          existingContent: toStringContent(context.existingContent),
          primaryKeyword,
          site,
          apiKey: openRouterApiKey,
          siteId: site.id
        });
        extraImageBase64 = extraImageResult.imageBase64;
        console.log('[Content Generation Upload] Extra image generated for page');
      } catch (error) {
        console.error('[Content Generation Upload] Failed to generate extra image:', error);
        if (!getMuteOptimizationToasts()) notify.warning(NOTIFY_FAILED_TO_GENERATE_EXTRA_IMAGE_CONTINUIN, { duration: 3000 });
      }
    }

    if (context.wordPressPosts && context.wordPressPosts.length > 0 && extraTextContent?.trim()) {
      setProgress("polish", 0.6, "Matching extra text link placeholders to sitemap…");
      extraTextContent = await resolveInternalLinkPlaceholdersInHtml(extraTextContent, {
        siteId: site.id,
        siteUrl: site.siteUrl,
        currentPageUrl: context.url,
        wordPressPosts: context.wordPressPosts,
        apiKey: openRouterApiKey,
      });
      extraTextContent = deduplicateInternalLinksInHtml(extraTextContent);
    }

    if (extraTextContent?.trim()) {
      extraTextContent = deduplicateInternalLinksInHtml(extraTextContent);
    }

    strippedHtml = removeInvalidInternalLinks(htmlContent, context.wordPressPosts, site.siteUrl);
    strippedExtra = extraTextContent
      ? removeInvalidInternalLinks(extraTextContent, context.wordPressPosts, site.siteUrl)
      : undefined;

    if (shouldOptimizeContent && strippedHtml?.trim()) {
      fileManager.syncContentArtifactHtml(strippedHtml, htmlToMarkdown(strippedHtml));
      const filesPatch = progressWithGeneratedFiles(
        { stepId: "polish", subProgress: 0.95, message: "Content saved with resolved internal links" },
        fileManager,
      );
      setProgress(filesPatch.stepId!, filesPatch.subProgress!, filesPatch.message, filesPatch);
    }

    uploadResult = await uploadToWordPress({
      context,
      blueprintResult,
      existingTitle: cleanedExistingTitle,
      primaryKeyword,
      htmlContent: strippedHtml,
      excerpt,
      featuredImageId,
      shouldOptimizeTitle,
      writeFocusKeywords,
      generateFaqSchema,
      prefetchedFaqRaw,
      bulkFaqMinimum4,
      writeMetaDescription,
      writeExcerpt,
      setProgress: legacyProgress("publish"),
      entity,
      faqQuestions: context.selectedPeopleAlsoAsk,
      allowedExternalUrls,
      apiKey: openRouterApiKey,
      extraTextContent: strippedExtra ?? extraTextContent,
      extraImageBase64,
      seoExtraTextFieldOnly: false,
      faqSchemaOverride: optimizeFaqBundle?.faqForAcf,
    });
  }

  const { result, postId, link, finalTitle } = uploadResult;

  const postIdNum = Number(postId ?? context.existingPost?.id ?? 0);
  const subtype =
    (context.resolved?.subtype as string | undefined)?.trim() ||
    (context.existingPost?.postType as string | undefined)?.trim() ||
    "post";
  const postTypeEndpoint =
    (context.existingPost?.postTypeEndpoint as string | undefined)?.trim() ||
    restCollectionEndpointForSubtype(subtype);
  const plainExcerptForProof = excerpt
    ? excerpt.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()
    : "";
  const proofItem: OverviewBulkSeoApiItem = {
    postId: postIdNum,
    postType: subtype,
    postTypeEndpoint,
    ...(basicWordPressContentUpdate
      ? {}
      : finalTitle?.trim()
        ? { postTitle: finalTitle.trim() }
        : {}),
    ...(basicWordPressContentUpdate || !plainExcerptForProof
      ? {}
      : { postExcerpt: plainExcerptForProof }),
    ...(strippedHtml?.trim() ? { postContent: strippedHtml.trim() } : {}),
    acf: {},
  };
  const siteMismatch = !rowUrlMatchesWordPressSite(context.url, site);
  const uploadOk = result?.success === true && !!postId && !!link && !siteMismatch;
  attachWordPressUploadProofToFileManager({
    fileManager,
    site,
    pageUrl: context.url,
    item: proofItem,
    ok: uploadOk,
    skipped: siteMismatch,
    error: siteMismatch
      ? `Row URL is not on connected site ${site.name?.trim() || site.siteUrl}. Upload blocked.`
      : uploadOk
        ? undefined
        : String(result?.error ?? "WordPress upload failed"),
    apiResult: {
      postId: postIdNum,
      ok: uploadOk,
      error: result?.error,
      link: link ?? undefined,
    },
    flushGeneratedFiles: contentPrepHarnessBridge?.flushGeneratedFiles,
  });
  const wpProofFile = fileManager.getFiles().find((f) => f.name === "wordpress.json");
  markWpUploadHarness(
    uploadOk ? "done" : "error",
    wpProofFile ? `\`\`\`json\n${wpProofFile.content}\n\`\`\`` : undefined,
  );

  try {
    const { storeOverviewOptimizedHtml } = await import("@/lib/overview/overview-content-opt-html-store");
    storeOverviewOptimizedHtml(context.url, strippedHtml, link || undefined);
  } catch {
    /* ignore */
  }

  if (result?.success !== true || !postId || !link) {
    const errorMessage =
      result?.error
      ? String(result.error)
      : `Unknown WordPress upload failure (success=${String(result?.success)})`;
    throw new Error(`WordPress upload failed: ${errorMessage}`);
  }
  if (result?.contentSaveWarning) {
    throw new Error(`WordPress upload failed: ${String(result.contentSaveWarning)}`);
  }

  const existingExcerptClean = toStringContent(context.existingExcerpt).replace(/<[^>]*>/g, "").trim();
  const excerptClean = excerpt ? excerpt.replace(/<[^>]*>/g, "").trim() : "";
  const titleChanged =
    shouldOptimizeTitle && finalTitle !== existingTitle && finalTitle.trim() !== existingTitle.trim();
  const metaChanged =
    shouldOptimizeMeta && excerptClean !== existingExcerptClean && excerptClean.length > 0;
  const existingContentStrForCompare = toStringContent(context.existingContent);
  const contentChanged =
    shouldOptimizeContent &&
    markdownContent !== existingContentStrForCompare &&
    markdownContent.trim() !== existingContentStrForCompare.trim();

  const changes = {
    titleChanged,
    metaChanged,
    contentChanged,
    title: titleChanged ? finalTitle : undefined,
    meta: metaChanged ? excerptClean : undefined,
  };

  console.log('[Content Generation] Changes tracked:', {
    ...changes,
    comparison: {
      title: { existing: existingTitle, final: finalTitle, changed: titleChanged },
      meta: { existing: existingExcerptClean.substring(0, 50), final: excerptClean.substring(0, 50), changed: metaChanged },
      content: { existingLength: toStringContent(context.existingContent).length, finalLength: markdownContent?.length, changed: contentChanged }
    }
  });

  // Show success notification with post details
  if (result.success && postId && link) {
    if (!getMuteOptimizationToasts()) {
      console.log("[Content Generation] Post link:", link, postId, result.status);
      notify.success(
        context.updateMode === "update" ? `Post updated (${postId})` : `Post created (${postId})`,
        { duration: 8000 },
      );
    }
    console.log(`[Content Generation] ✅ Post ${context.updateMode === 'update' ? 'updated' : 'created'}: ID ${postId}, Link: ${link}, Status: ${result.status}`);
  } else {
    console.error('[Content Generation] ⚠️ Post upload completed but result indicates failure:', { success: result.success, postId, link, error: result.error });
    if (!getMuteOptimizationToasts()) notify.warning(NOTIFY_POST_UPLOAD_COMPLETED_BUT_MAY_NOT_HAVE_B, { duration: 8000 });
  }

  // Step 4: Update ACF Origin field (if entity sitemap URL is provided)
  // Skip when SEO extra-text-only or bulk content-only upload (inventory keyword untouched).
  if (!seoExtraTextFieldOnly && !contentOnlyUpload) {
    const blueprintOriginRaw =
      blueprintResult && typeof (blueprintResult as { origin?: unknown }).origin === "string"
        ? String((blueprintResult as { origin: string }).origin).trim()
        : "";
    await updateACFOriginField({
      postId,
      finalTitle,
      site,
      existingPost: context.existingPost,
      resolved: context.resolved,
      setProgress: legacyProgress("publish"),
      pageUrl: context.url,
      excerpt, // AI agent uses excerpt + title + slug to fill Origin (no manual extraction)
      existingOrigin: context.existingPost?.acf?.origin ?? undefined,
      preferredOrigin: blueprintOriginRaw.length > 0 ? blueprintOriginRaw : undefined,
    });
  }

  // Step 5: Optimize meta fields (meta description is set in final step by uploadToWordPress, not here)
  if (shouldOptimizeMeta && !contentOnlyUpload) {
    console.log('[Content Generation Upload] ✅ Meta optimization ENABLED - proceeding with meta field optimization');
    await optimizeMetaFields({
      postId,
      markdownContent,
      finalTitle,
      metaDescription: excerpt, // Use the generated meta description (previously called excerpt)
      primaryKeyword,
      site,
      postLink: link,
      existingPost: context.existingPost,
      fileManager,
      setProgress: legacyProgress("publish"),
      shouldOptimizeMeta,
      gscKeywordsContext: context.gscKeywordsContext,
    });
  } else {
    console.log('[Content Generation Upload] ⚠️ Meta optimization DISABLED - skipping meta field optimization', {
      optimizeMeta: opts.optimizeMeta,
      shouldOptimizeMeta,
      reason: 'User unchecked Meta optimization option'
    });
  }

  const uploadTime = Math.floor((Date.now() - uploadStartTime) / 1000);
  
  if (!getMuteOptimizationToasts()) {
    notify.success(notifyOptimizedXs(uploadTime), { duration: 5000 });
  }
  if (link) {
    if (!getMuteOptimizationToasts()) notify.info(notifyViewPostX(link), {
      duration: 5000,
      action: {
        label: 'Open',
        onClick: () => window.open(link, '_blank'),
      },
    });
  }

  const returnedExcerpt = contentOnlyUpload ? '' : excerpt;

  const acf = context.existingPost?.acf;
  const originalExtraRaw =
    acf && typeof acf === 'object'
      ? typeof acf.seo_extra_text === 'string'
        ? acf.seo_extra_text
        : typeof acf.extra_text === 'string'
          ? acf.extra_text
          : ''
      : '';
  let originalExtraForReport = originalExtraRaw;
  try {
    if (originalExtraForReport.includes('<') && originalExtraForReport.includes('>')) {
      originalExtraForReport = htmlToMarkdown(originalExtraForReport);
    }
  } catch {
    // keep raw
  }
  const newExtraForReport = (strippedExtra ?? extraTextContent ?? '').trim();

  // Step 6: Generate Implementation Report
  const implReportHarnessIndex = contentPrepHarnessBridge
    ? pipelineIndexForHarnessTitle("Implementation report", contentPrepHarnessBridge.pipelineTitles)
    : -1;
  const markImplReportHarness = (
    phase: "start" | "done" | "error",
    markdownSlice?: string,
  ) => {
    if (!contentPrepHarnessBridge || implReportHarnessIndex < 0) return;
    markContentPrepHarnessSection(
      contentPrepHarnessBridge.url,
      implReportHarnessIndex,
      phase,
      contentPrepHarnessBridge.setters,
      0,
      markdownSlice,
      contentPrepHarnessBridge.pipelineTitles,
    );
    contentPrepHarnessBridge.flushGeneratedFiles?.();
  };

  try {
    markImplReportHarness("start");
    setProgress("done", 0.9, "Generating implementation report…");
    
    // Get original content as markdown for comparison (WordPress API may return { raw, rendered })
    const rawOriginalContent = toStringContent(context.existingContent);
    let originalContentMarkdown = rawOriginalContent;
    try {
      if (originalContentMarkdown.includes('<') && originalContentMarkdown.includes('>')) {
        originalContentMarkdown = htmlToMarkdown(originalContentMarkdown);
      }
    } catch (error) {
      console.warn('[Content Generation] Could not convert original content to markdown for report:', error);
    }

    const seoResearchForReport =
      context.seoResearchRaw?.trim() ||
      resolvedAcfContext?.seoResearch?.trim() ||
      (typeof acfFields?.seo_research === "string" ? acfFields.seo_research.trim() : undefined);

    const reportMarkdown = await generateImplementationReport(
      {
        originalTitle: context.existingTitle,
        newTitle: finalTitle || blueprintResult.title || context.existingTitle || primaryKeyword,
        originalExcerpt: toStringContent(context.existingExcerpt) || '',
        newExcerpt: returnedExcerpt,
        originalContent: originalContentMarkdown,
        newContent: markdownContent,
        originalHtml: rawOriginalContent,
        newHtml: strippedHtml,
        primaryKeyword,
        clusterKeywords: context.clusterKeywords,
        selectedKeyword: context.selectedKeyword,
        gscResult: context.gscResult,
        seoResearchRaw: seoResearchForReport,
        faqEntries: optimizeFaqBundle?.faqEntries,
        blueprintResult,
        updateMode: context.updateMode,
        url: context.url,
        siteId: site.id,
        siteUrl: site.siteUrl,
        apiKey: openRouterApiKey,
        originalExtraText: originalExtraForReport || undefined,
        newExtraText: newExtraForReport || undefined,
      },
      fileManager,
      {
        skipMetaDescriptionSection: contentOnlyUpload && !shouldOptimizeMeta,
      }
    );

    markImplReportHarness("done", reportMarkdown);
    setProgress("done", 1, "Implementation report generated successfully!");
    if (!getMuteOptimizationToasts()) notify.success(NOTIFY_IMPLEMENTATION_REPORT_GENERATED, { duration: 3000 });
  } catch (error) {
    console.error('[Content Generation] Error generating implementation report:', error);
    markImplReportHarness("error");
    // Don't fail the whole process if report generation fails
    if (!getMuteOptimizationToasts()) notify.warning(NOTIFY_CONTENT_OPTIMIZED_BUT_IMPLEMENTATION_REP, { duration: 5000 });
  }

  return { result, markdownContent, excerpt: returnedExcerpt, changes };
}
