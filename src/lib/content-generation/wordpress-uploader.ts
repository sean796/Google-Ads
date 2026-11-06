/**
 * WordPress Uploader Module
 * Handles WordPress post creation and updates using entity endpoint directly
 * NO service-area conditionals, NO normalization
 */

import { createWordPressPost, updateWordPressPost, type WordPressPostCreateResult, type WordPressPostUpdateResult } from "@/lib/wordpress-api";
import {
  prepareWordPressUploadContent,
  resolveWordPressDraftAuthor,
  resolveWordPressDraftSlug,
  stampWordPressDateModifierAcf,
  type WordPressUploaderOptions,
  type WordPressUploaderResult,
} from "@/lib/content-generation/wordpress-uploader-prep";
import {
  writeWordPressAcfForDraftPost,
  writeWordPressAcfForUpdatedPost,
} from "@/lib/content-generation/wordpress-uploader-acf-writer";

export { buildFAQSchemaScriptFromEntries } from "@/lib/content-generation/wordpress-uploader-faq-and-keywords";
export type {
  WordPressUploaderOptions,
  WordPressUploaderResult,
} from "@/lib/content-generation/wordpress-uploader-prep";

export async function uploadToWordPress(
  options: WordPressUploaderOptions
): Promise<WordPressUploaderResult> {
  const {
    context,
    blueprintResult,
    existingTitle,
    primaryKeyword,
    htmlContent,
    excerpt,
    featuredImageId,
    shouldOptimizeTitle,
    writeFocusKeywords = true,
    generateFaqSchema = true,
    prefetchedFaqRaw = "",
    bulkFaqMinimum4 = false,
    setProgress,
    entity,
    faqQuestions,
    allowedExternalUrls,
    apiKey,
    extraTextContent,
    extraImageBase64,
    seoExtraTextFieldOnly = false,
    writeMetaDescription = false,
    writeExcerpt: _writeExcerpt = false,
    faqSchemaOverride = "",
  } = options;

  const faqSchemaOverrideTrimmed = faqSchemaOverride?.trim() ?? "";

  const { site } = context;
  const { plainTextExcerpt, excerptForRest, contentForUpdate, entityEndpoint } =
    prepareWordPressUploadContent({ context, htmlContent, excerpt, allowedExternalUrls, faqQuestions, entity, primaryKeyword });
  let result: WordPressPostCreateResult | WordPressPostUpdateResult;
  let finalTitle: string = '';

  // NOTE: We NO LONGER read existingOrigin from existing post
  // Origin is ALWAYS extracted fresh from title using AI during optimization
  // This ensures accurate, up-to-date entity extraction every time

  if (context.updateMode === 'update') {
    // Use entityEndpoint directly - NO normalization
    const postTypeEndpoint = entityEndpoint;

    console.log('[Optimize Content] Updating existing post:', {
      id: context.existingPost.id,
      postTypeEndpoint: postTypeEndpoint,
      resolvedSubtype: context.resolved?.subtype,
      existingPostEndpoint: context.existingPost?.postTypeEndpoint
    });

    // Title optimization is disabled (content-only module).
    // Preserve the existing WordPress title without modification.
    const updateTitle = existingTitle;
    finalTitle = updateTitle;
    
    // Preserve the original slug to prevent URL changes
    const originalSlug = context.existingPost?.slug || context.resolved?.slug;

    // Preserve original status from existing post exactly.
    // WordPress "update" must not demote scheduled/pending/private/etc posts to plain "draft".
    const postStatus = context.existingPost?.status || 'publish';

    console.log('[WordPress Uploader] Updating post:', {
      postId: context.existingPost.id,
      postStatus,
      postTypeEndpoint,
      originalSlug,
      hasFeaturedImage: !!featuredImageId,
      updateTitle,
      existingPostStatus: context.existingPost?.status
    });

    if (seoExtraTextFieldOnly) {
      const postId = Number(context.existingPost.id);
      if (!site.siteUrl?.trim() || !site.username?.trim() || !site.appPassword?.trim()) {
        result = {
          success: false,
          error: 'Missing WordPress site URL, username, or application password',
        };
      } else if (!Number.isFinite(postId) || postId <= 0) {
        result = { success: false, error: 'Invalid WordPress post ID for SEO extra text update' };
      } else {
        setProgress({
          step: 'Updating SEO extra text',
          progress: 90,
          message: `Writing ACF extra text only (post ID ${postId})…`,
        });
        result = {
          success: true,
          postId,
          link:
            (typeof context.existingPost?.link === 'string' && context.existingPost.link) ||
            context.url,
        };
      }
    } else {
      const missingFields: string[] = [];
      if (!site.siteUrl?.trim()) missingFields.push("siteUrl");
      if (!site.username?.trim()) missingFields.push("username");
      if (!site.appPassword?.trim()) missingFields.push("appPassword");
      const postIdNum = Number(context.existingPost.id);
      if (!Number.isFinite(postIdNum) || postIdNum <= 0) missingFields.push("postId");
      if (!String(updateTitle ?? "").trim()) missingFields.push("title");
      if (!String(contentForUpdate ?? "").trim()) missingFields.push("content");
      if (missingFields.length > 0) {
        const errMsg = `WordPress update blocked: missing or empty ${missingFields.join(", ")}`;
        result = { success: false, error: errMsg };
      } else {
      setProgress({ step: 'Updating post...', progress: 90, message: `Updating existing post (ID: ${context.existingPost.id}) with optimized content: "${updateTitle}"...` });
      result = await updateWordPressPost(
        site.siteUrl,
        site.username,
        site.appPassword,
        Number(context.existingPost.id),
        updateTitle,
        contentForUpdate, // Always optimized content – overwrite existing (posts and pages)
        excerptForRest,
        postStatus, // Preserve original status
        context.existingPost?.post_type || 'post', // Use post type from existing post
        featuredImageId,
        undefined,
        undefined,
        originalSlug, // Preserve original slug
        postTypeEndpoint // Use entityEndpoint directly - NO normalization
      );
      }
    }

    console.log('[WordPress Uploader] Post update result:', {
      success: result.success,
      postId: result.postId,
      link: result.link,
      status: result.status,
      error: result.error,
      title: result.title,
      expectedStatus: postStatus
    });

    // After successful update, set ACF fields
    if (result.success && result.postId) {
      await writeWordPressAcfForUpdatedPost({
        options,
        postId: result.postId,
        postTypeEndpoint,
        plainTextExcerpt,
        faqSchemaOverrideTrimmed,
      });
    }
  } else {
    // Title optimization is disabled (content-only module).
    // Preserve the existing WordPress title without modification.
    const draftTitle = existingTitle;
    finalTitle = draftTitle;

    // Use entityEndpoint directly - NO normalization
    const postTypeEndpoint = entityEndpoint;
    const slug = await resolveWordPressDraftSlug({
      context,
      draftTitle,
      primaryKeyword,
      entity,
      apiKey,
    });
    console.log('[Optimize Content] Creating draft:', {
      postTypeEndpoint: postTypeEndpoint,
      resolvedSubtype: context.resolved?.subtype,
      existingPostEndpoint: context.existingPost?.postTypeEndpoint,
      slug: slug,
      url: context.url
    });
setProgress({ step: 'Creating draft...', progress: 92, message: `Creating new draft: "${draftTitle}" in ${postTypeEndpoint} endpoint...` });
    const authorId = await resolveWordPressDraftAuthor({ context, site, postTypeEndpoint });
    console.log('[WordPress Uploader] Creating post in DRAFT mode:', {
      postTypeEndpoint,
      slug,
      hasFeaturedImage: !!featuredImageId,
      draftTitle
    });
result = await createWordPressPost(
      site.siteUrl,
      site.username,
      site.appPassword,
      draftTitle,
      contentForUpdate, // Always optimized content – overwrite existing (posts and pages)
      excerptForRest,
      'draft',
      undefined,
      featuredImageId,
      undefined,
      undefined,
      undefined, // No internal type - use endpoint directly
      postTypeEndpoint, // Use entityEndpoint directly - NO normalization
      slug,
      authorId
    );
    
    console.log('[WordPress Uploader] Post creation result (DRAFT mode):', {
      success: result.success,
      postId: result.postId,
      link: result.link,
      status: result.status,
      error: result.error,
      title: result.title
    });

    // After successful draft creation, set ACF fields
    // After successful draft creation, set ACF fields
    if (result.success && result.postId) {
      await writeWordPressAcfForDraftPost({
        options,
        postId: result.postId,
        postTypeEndpoint,
        plainTextExcerpt,
        faqSchemaOverrideTrimmed,
      });
    }
  }
  console.log('[WordPress Uploader] Final result check:', {
    success: result.success,
    postId: result.postId,
    link: result.link,
    status: result.status,
    error: result.error,
    hasPostId: !!result.postId,
    hasLink: !!result.link
  });
  if (!result.success) {
    const details = (result as { details?: { code?: string; message?: string } }).details;
    if (details) {
      console.error('[WordPress Uploader] ❌ WordPress REST response (403/error details):', details);
    }
    console.error('[WordPress Uploader] ❌ Post creation FAILED:', {
      error: result.error,
      postId: result.postId,
      link: result.link,
      ...(details && { wpCode: details.code, wpMessage: details.message })
    });
    const wpHint = details?.message ? ` WordPress said: "${details.message}" (code: ${details?.code ?? 'unknown'}).` : '';
    throw new Error((result.error || 'Failed to save post') + wpHint);
  }

  console.log('[WordPress Uploader] ✅ Post upload SUCCESSFUL:', {
    postId: result.postId,
    link: result.link,
    status: result.status,
    title: result.title,
    finalTitle
  });

  const postTypeForDateStamp =
    context.existingPost?.post_type || context.resolved?.subtype || "post";
  await stampWordPressDateModifierAcf(
    site,
    result.postId!,
    postTypeForDateStamp,
    entityEndpoint,
  );

  // Origin is now extracted fresh via AI in updateACFOriginField, not preserved from existing post
  return {
    result,
    postId: result.postId!,
    link: result.link || '',
    finalTitle
  };
}
