import { notify } from "@/lib/app-notifications";
import { NOTIFY_IMPLEMENTATION_REPORT_GENERATED, NOTIFY_CONTENT_OPTIMIZED_BUT_IMPLEMENTATION_REP, NOTIFY_POST_UPLOAD_COMPLETED_BUT_MAY_NOT_HAVE_B, notifyOptimizedXs, notifyViewPostX } from "@/lib/notify-messages";
import { getMuteOptimizationToasts } from "@/hooks/content-optimization/optimization-toast-mute";
import { htmlToMarkdown } from "@/lib/wordpress-converter";
import { generateImplementationReport } from "@/lib/implementation-report-generator";
import type { WordPressSite } from "@/components/integrations/types";
import type { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { uploadToWordPress } from "./wordpress-uploader";
import { optimizeMetaFields } from "./meta-optimizer";
import { updateACFOriginField } from "./acf-origin-updater";
import { restCollectionEndpointForSubtype } from "@/lib/overview/overview-bulk-seo-payload";
import { rowUrlMatchesWordPressSite } from "@/lib/overview/overview-aiseo-after-upload";
import { attachWordPressUploadProofToFileManager } from "@/lib/overview/overview-wp-upload-harness-artifacts";
import type { OverviewBulkSeoApiItem } from "@/lib/overview/overview-bulk-seo-payload";
import { markContentPrepHarnessSection, type ContentPrepHarnessBridge, pipelineIndexForHarnessTitle } from "@/lib/overview/overview-content-prep-harness-run";
import type { RunProgressReporter, ContentOptimizerStepId } from "@/lib/content-optimization/content-optimizer-run-progress";
import type { AIDrivenACFContext } from "./ai-driven-acf-reader";
import type { PrecomputedAcfSeoBundle } from "./bulk-acf-seo-bundle";
import { toStringContent, type BlueprintResult, type OptimizationContext } from "./content-upload-polish-and-faq";

export interface ContentUploadPostSyncReportArgs {
  uploadResult: Awaited<ReturnType<typeof uploadToWordPress>>;
  strippedHtml: string;
  extraTextContent?: string;
  strippedExtra?: string;
  context: OptimizationContext;
  site: WordPressSite;
  blueprintResult: BlueprintResult;
  existingTitle: string;
  primaryKeyword: string;
  excerpt: string;
  markdownContent: string;
  shouldOptimizeTitle: boolean;
  shouldOptimizeMeta: boolean;
  shouldOptimizeContent: boolean;
  contentOnlyUpload: boolean;
  seoExtraTextFieldOnly: boolean;
  basicWordPressContentUpdate: boolean;
  fileManager: OptimizationFileManager;
  setProgress: RunProgressReporter;
  legacyProgress: (stepId: ContentOptimizerStepId) => (p: { step: string; progress: number; message?: string }) => void;
  uploadStartTime: number;
  openRouterApiKey: string;
  resolvedAcfContext?: AIDrivenACFContext;
  acfFields?: Record<string, unknown>;
  optimizeFaqBundle: PrecomputedAcfSeoBundle | null;
  markWpUploadHarness: (phase: "start" | "done" | "error", markdownSlice?: string) => void;
  contentPrepHarnessBridge?: ContentPrepHarnessBridge;
  opts: { optimizeMeta?: boolean };
}

export async function completeContentUploadPostSyncAndReport(args: ContentUploadPostSyncReportArgs) {
  const { uploadResult, strippedHtml, extraTextContent, strippedExtra, context, site, blueprintResult, existingTitle, primaryKeyword, excerpt, markdownContent, shouldOptimizeTitle, shouldOptimizeMeta, shouldOptimizeContent, contentOnlyUpload, seoExtraTextFieldOnly, basicWordPressContentUpdate, fileManager, setProgress, legacyProgress, uploadStartTime, openRouterApiKey, resolvedAcfContext, acfFields, optimizeFaqBundle, markWpUploadHarness, contentPrepHarnessBridge, opts } = args;
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
      blueprintResult && typeof blueprintResult.origin === "string"
        ? blueprintResult.origin.trim()
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
      existingOrigin:
        typeof context.existingPost?.acf?.origin === "string"
          ? context.existingPost.acf.origin
          : undefined,
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
      phase === "error" ? "done" : phase,
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
