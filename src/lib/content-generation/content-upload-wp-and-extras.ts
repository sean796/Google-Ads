import { logger } from "@/lib/logger";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_FAILED_TO_GENERATE_EXTRA_IMAGE_CONTINUIN, NOTIFY_FAILED_TO_GENERATE_EXTRA_TEXT_CONTINUING } from "@/lib/notify-messages";
import { getMuteOptimizationToasts } from "@/hooks/content-optimization/optimization-toast-mute";
import { htmlToMarkdown } from "@/lib/wordpress-converter";
import type { WordPressSite } from "@/components/integrations/types";
import type { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { handleFeaturedImage } from "./featured-image-handler";
import { uploadToWordPress } from "./wordpress-uploader";
import { updateWordPressPost } from "@/lib/wordpress-api";
import { generateExtraTextForPage, generateExtraImageForPage } from "./page-extra-content-generator";
import { EXTRA_TEXT_HARNESS_TOTAL_SECTIONS } from "./page-extra-content-generator-prompts";
import { hasExtraTextField, hasExtraImageField, type AIDrivenACFContext } from "./ai-driven-post-fields-reader";
import { removeInvalidInternalLinks, deduplicateInternalLinksInHtml } from "./content-sanitizer";
import { resolveInternalLinkPlaceholdersInHtml } from "./internal-link-placeholders";
import { reduceHarnessSectionList } from "@/lib/bulk/harness-sections-reducer";
import { mergeHarnessProgressSiteAndBatch, progressWithGeneratedFiles } from "@/hooks/content-optimization/optimization-helpers";
import type { RunProgressReporter, ContentOptimizerStepId } from "@/lib/content-optimization/content-optimizer-run-progress";
import { harnessSubProgress } from "@/lib/content-optimization/content-optimizer-run-progress";
import { markContentPrepHarnessSection, type ContentPrepHarnessBridge, pipelineIndexForHarnessTitle } from "@/lib/overview/overview-content-prep-harness-run";
import type { PrecomputedAcfSeoBundle } from "./bulk-post-fields-seo-bundle";
import type { Dispatch, SetStateAction } from "react";
import type { OptimizationProgressState } from "@/hooks/content-optimization/use-optimization-state";
import { toStringContent, type BlueprintResult, type OptimizationContext } from "./content-upload-polish-and-faq";

export interface ContentUploadWpAndExtrasArgs {
  context: OptimizationContext;
  blueprintResult: BlueprintResult;
  cleanedExistingTitle: string;
  existingTitle: string;
  primaryKeyword: string;
  htmlContent: string;
  strippedHtml: string;
  markdownContent: string;
  excerpt: string;
  shouldOptimizeContent: boolean;
  shouldOptimizeTitle: boolean;
  shouldOptimizeFeaturedImage: boolean;
  optimizeExtraText: boolean;
  optimizeExtraImage: boolean;
  featuredImageType?: "ai-generated" | "google-maps";
  writeFocusKeywords: boolean;
  generateFaqSchema: boolean;
  prefetchedFaqRaw: string;
  bulkFaqMinimum4: boolean;
  writeMetaDescription: boolean;
  writeExcerpt: boolean;
  legacyProgress: (stepId: ContentOptimizerStepId) => (p: { step: string; progress: number; message?: string }) => void;
  entity?: string;
  allowedExternalUrls: string[];
  openRouterApiKey: string;
  optimizeFaqBundle: PrecomputedAcfSeoBundle | null;
  skipMediaPipeline: boolean;
  contentOnlyUpload: boolean;
  seoExtraTextFieldOnly: boolean;
  site: WordPressSite;
  fileManager: OptimizationFileManager;
  setProgress: RunProgressReporter;
  setOptimizationProgressRaw?: Dispatch<SetStateAction<Record<string, OptimizationProgressState>>>;
  resolvedAcfContext?: AIDrivenACFContext;
  contentPrepHarnessBridge?: ContentPrepHarnessBridge;
}

export async function uploadContentToWordPressWithExtras(args: ContentUploadWpAndExtrasArgs) {
  const { context, blueprintResult, cleanedExistingTitle, existingTitle, primaryKeyword, htmlContent, markdownContent, excerpt, shouldOptimizeContent, shouldOptimizeTitle, shouldOptimizeFeaturedImage, optimizeExtraText, optimizeExtraImage, featuredImageType: featuredImageTypeOpt, writeFocusKeywords, generateFaqSchema, prefetchedFaqRaw, bulkFaqMinimum4, writeMetaDescription, writeExcerpt, legacyProgress, entity, allowedExternalUrls, openRouterApiKey, optimizeFaqBundle, skipMediaPipeline, contentOnlyUpload, seoExtraTextFieldOnly, site, fileManager, setProgress, setOptimizationProgressRaw, resolvedAcfContext, contentPrepHarnessBridge } = args;
  let strippedHtml = args.strippedHtml;
  const opts = { featuredImageType: featuredImageTypeOpt, optimizeExtraText, optimizeExtraImage };
  let extraTextContent: string | undefined;
  let extraImageBase64: string | undefined;
  let strippedExtra: string | undefined;
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
      phase === "error" ? "done" : phase,
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
          setOptimizationProgressRaw((prev) =>
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
                setOptimizationProgressRaw((prev) => {
                  const nextSections = reduceHarnessSectionList(prev[site.id]?.harnessSections || [], payload);
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
      } catch (error) {
        logger.error('[Content Generation Upload] Failed to generate extra text:', error);
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
      } catch (error) {
        logger.error('[Content Generation Upload] Failed to generate extra image:', error);
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
  return { uploadResult, extraTextContent, extraImageBase64, strippedExtra, strippedHtml, markWpUploadHarness, basicWordPressContentUpdate };
}
