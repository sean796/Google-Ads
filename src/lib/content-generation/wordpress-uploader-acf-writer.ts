/**
 * ACF writing helpers for the WordPress uploader.
 */

import { uploadWordPressMedia, updateWordPressPostMeta } from "@/lib/wordpress-api";
import { updateACFFields } from "@/lib/wordpress-acf-origin";
import { extraTextToUploadHtml } from "@/lib/content-generation/extra-text-heading-contract";
import { stripBracketPlaceholders, stripLeadingP } from "@/lib/gsc-simple-keyword-recommendation";
import { loadApiKey } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";
import {
  mergeAcfOnlyExtraText,
  resolveFullPostForAcfUpdate,
  uploadNeedsAcfWrite,
  type WordPressUploaderOptions,
} from "@/lib/content-generation/wordpress-uploader-prep";
import {
  buildFaqSchemaForDraftPost,
  buildFaqSchemaForUpdatedPost,
} from "@/lib/content-generation/wordpress-uploader-faq-and-keywords";

async function getACFFromOpenRouter(
  fullPost: Record<string, unknown>,
  updates: {
    date: string;
    keyword?: string;
    extraText: string;
    faq?: string;
    metaDescription: string;
    extraImageId?: number;
  },
  apiKey: string,
  model: string
): Promise<Record<string, unknown>> {
  const systemPrompt = `You are a local SEO. You are given the full WordPress post API response (including its acf object) and an updates object. Your job: merge the updates into the post's acf so that every ACF field a local SEO would fill is updated. Use the EXACT key names that already exist in the post's acf object (e.g. if the post has "seo_extra_text", use that key; if it has "extra_text", use that; if it has both, set both). Preserve every key from the post's acf; overwrite only with the corresponding update when applicable. Map updates like this: updates.date -> date_modifier / seo_date_modifier; updates.keyword -> keyword_focus (only if updates.keyword is present); updates.extraText -> extra_text / seo_extra_text; updates.faq -> faq / seo_faq (only if updates.faq is present); updates.metaDescription -> meta_description / seo_meta_description; updates.extraImageId -> extra_image / seo_extra_image. Return only the complete merged acf object as valid JSON, no markdown, no explanation.`;
  const userContent = `Full WordPress post (read the acf object and use its exact key names):\n${JSON.stringify(fullPost)}\n\nUpdates to apply:\n${JSON.stringify(updates)}\n\nReturn only the merged acf object as JSON.`;
  const res = await postOpenRouterAppChatFetch( {
    method: "POST",
    headers: openRouterWebAppHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 8000,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter failed: ${res.status}`);
  const data = await res.json();
  const raw = (data.choices?.[0]?.message?.content ?? "").trim();
  const json = raw.replace(/^```json?\s*|\s*```$/g, "").trim();
  return JSON.parse(json) as Record<string, unknown>;
}


export async function writeWordPressAcfForUpdatedPost(args: {
  options: WordPressUploaderOptions;
  postId: number;
  postTypeEndpoint: string;
  plainTextExcerpt: string;
  faqSchemaOverrideTrimmed: string;
}): Promise<void> {
  const { postId, postTypeEndpoint, plainTextExcerpt, faqSchemaOverrideTrimmed } = args;
  const {
    context,
    primaryKeyword,
    entity,
    setProgress,
    apiKey,
    extraTextContent,
    extraImageBase64,
    prefetchedFaqRaw = "",
    writeFocusKeywords = true,
    generateFaqSchema = true,
    bulkFaqMinimum4 = false,
    seoExtraTextFieldOnly = false,
    writeMetaDescription = false,
  } = args.options;
  const { site } = context;
      const needsAcfWrite = uploadNeedsAcfWrite({
        seoExtraTextFieldOnly,
        bulkFaqMinimum4,
        writeFocusKeywords,
        generateFaqSchema,
        writeMetaDescription,
        extraTextContent,
        extraImageBase64,
      });

      if (!needsAcfWrite) {
        setProgress({
          step: "Upload complete",
          progress: 100,
          message: "Post content saved to WordPress.",
        });
      } else try {
        const postType = context.existingPost?.post_type || context.resolved?.subtype || 'post';
        const fullPostForAcf = resolveFullPostForAcfUpdate(context.acfFullPostSnapshot, postId);
        if (!fullPostForAcf) {
          throw new Error(
            `Missing inventory ACF snapshot for post ${postId}. Reload inventory and retry.`,
          );
        }
        setProgress({
          step: "Updating ACF fields...",
          progress: 92,
          message: "Using inventory snapshot for ACF merge (no WordPress prefetch).",
        });

        if (seoExtraTextFieldOnly) {
          const raw = (extraTextContent ?? "").trim();
          if (raw) {
            const extraTextHtml = extraTextToUploadHtml(raw);
            const existingAcf = (fullPostForAcf as { acf?: Record<string, unknown> }).acf;
            const mergedAcf = mergeAcfOnlyExtraText(existingAcf, extraTextHtml);
            setProgress({
              step: "Updating SEO extra text",
              progress: 95,
              message: "Writing ACF `seo_extra_text` only (no keyword, FAQ, or date fields)...",
            });
            const acfExtraOnly = await updateACFFields(
              site.siteUrl,
              site.username,
              site.appPassword,
              postId,
              mergedAcf,
              context.existingPost?.post_type || "post",
              postTypeEndpoint
            );
            if (acfExtraOnly.success) {
              console.log("[WordPress Uploader] ACF extra text only updated:", acfExtraOnly.updated.join(", "));
            } else {
              console.warn("[WordPress Uploader] ACF extra text only update failed:", acfExtraOnly.error || acfExtraOnly.failed);
            }
          } else {
            console.warn("[WordPress Uploader] seoExtraTextFieldOnly: empty extraTextContent, skipping ACF write.");
          }
        } else {
        const todayDate = new Date().toISOString().split('T')[0];
        let keywordForFocus = "";
        if (writeFocusKeywords) {
          keywordForFocus = stripLeadingP(stripBracketPlaceholders(primaryKeyword?.trim() ?? ""));
        }

        const napLocations =
          site.napInfo?.locations?.map((loc) => ({ city: loc.city, state: loc.state })) ||
          site.locations?.map((loc) => ({ city: loc.city, state: loc.state })) ||
          [];

        const { faqSchema, skipFaqWrites } = buildFaqSchemaForUpdatedPost({
          faqSchemaOverrideTrimmed,
          generateFaqSchema,
          bulkFaqMinimum4,
          prefetchedFaqRaw,
          primaryKeyword,
          entity,
          siteUrl: site.siteUrl,
          napLocations,
          setProgress,
        });
        let extraTextHtml = '';
        let extraImageId: number | undefined;
        if (extraTextContent?.trim()) extraTextHtml = extraTextToUploadHtml(extraTextContent.trim());
        if (extraImageBase64) {
            try {
              setProgress({ step: 'Uploading extra image...', progress: 94, message: 'Uploading extra image...' });
              const imageDataUrl = `data:image/png;base64,${extraImageBase64}`;
              const imageFilename = `extra-image-${primaryKeyword.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.png`;
              const mediaResult = await uploadWordPressMedia(site.siteUrl, site.username, site.appPassword, imageDataUrl, imageFilename, `Extra image for ${primaryKeyword}`, primaryKeyword ? `Image for ${primaryKeyword}` : undefined);
              if (mediaResult.success && mediaResult.mediaId) extraImageId = mediaResult.mediaId;
            } catch {
              // skip
            }
        }

        const updates: {
          date: string;
          keyword?: string;
          extraText: string;
          faq?: string;
          metaDescription: string;
          extraImageId?: number;
        } = {
          date: todayDate,
          extraText: extraTextHtml,
          metaDescription: plainTextExcerpt?.trim() ?? '',
          ...(extraImageId != null && { extraImageId }),
        };
        if (writeFocusKeywords) updates.keyword = keywordForFocus;
        if (faqSchema && !skipFaqWrites) updates.faq = faqSchema;

        setProgress({ step: 'Sending to OpenRouter...', progress: 94, message: 'Applying updates via AI...' });
        const openRouterKey = apiKey || loadApiKey();
        if (!openRouterKey?.trim()) throw new Error('OpenRouter API key required to update ACF.');
        const acf = await getACFFromOpenRouter(fullPostForAcf, updates, openRouterKey, getResearchModel(site.id));

        // FORCE-OVERWRITE critical fields (date_modifier, keyword_focus, faq)
        // AI merge is unreliable for these - deterministic pattern-match guarantees they're always updated
        const acfObj = acf as Record<string, unknown>;
        for (const key of Object.keys(acfObj)) {
          const lk = key.toLowerCase();
          if (lk.includes('date_modifier') || lk.includes('date_mod') || lk === 'seo_date_modifier') {
            acfObj[key] = todayDate;
          }
          if (
            writeFocusKeywords &&
            (lk.includes('keyword_focus') || lk.includes('focus_keyword')) &&
            keywordForFocus.trim()
          ) {
            acfObj[key] = keywordForFocus.trim();
          }
          if (!skipFaqWrites && (lk.includes('faq') || lk === 'seo_faq') && faqSchema) {
            acfObj[key] = faqSchema;
          }
        }
        console.log('[WordPress Uploader] Force-overwritten critical ACF fields (date, keyword_focus, faq)');

        setProgress({ step: 'Updating ACF fields...', progress: 95, message: 'Writing to WordPress...' });
        const acfUpdateResult = await updateACFFields(
          site.siteUrl,
          site.username,
          site.appPassword,
          postId,
          acf as Record<string, unknown>,
          context.existingPost?.post_type || 'post',
          postTypeEndpoint
        );
        if (acfUpdateResult.success) {
          console.log('[WordPress Uploader] ACF fields updated:', acfUpdateResult.updated.join(', '));
        } else {
          console.warn('[WordPress Uploader] ACF update failed:', acfUpdateResult.error || acfUpdateResult.failed);
        }

        // Fallback: update critical fields via post meta so they persist even if ACF POST fails
        const metaUpdates: Record<string, string> = {};
        metaUpdates.date_modifier = todayDate;
        if (writeFocusKeywords && keywordForFocus.trim()) metaUpdates.keyword_focus = keywordForFocus.trim();
        if (!skipFaqWrites && faqSchema) metaUpdates.faq = faqSchema;
        if (extraTextHtml?.trim()) metaUpdates.extra_text = extraTextHtml.trim();
        if (Object.keys(metaUpdates).length > 0) {
          try {
            await updateWordPressPostMeta(site.siteUrl, site.username, site.appPassword, postId, context.existingPost?.post_type || 'post', postTypeEndpoint, metaUpdates);
          } catch {
            // skip
          }
        }
        }
      } catch (acfError) {
        console.warn(`[WordPress Uploader] Error updating ACF fields:`, acfError);
        // Don't fail the entire operation if ACF update fails
      }
}

export async function writeWordPressAcfForDraftPost(args: {
  options: WordPressUploaderOptions;
  postId: number;
  postTypeEndpoint: string;
  plainTextExcerpt: string;
  faqSchemaOverrideTrimmed: string;
}): Promise<void> {
  const { postId, postTypeEndpoint, plainTextExcerpt, faqSchemaOverrideTrimmed } = args;
  const {
    context,
    primaryKeyword,
    entity,
    setProgress,
    apiKey,
    extraTextContent,
    extraImageBase64,
    prefetchedFaqRaw = "",
    writeFocusKeywords = true,
    generateFaqSchema = true,
    bulkFaqMinimum4 = false,
    seoExtraTextFieldOnly = false,
    writeMetaDescription = false,
  } = args.options;
  const { site } = context;
      const needsAcfWriteDraft = uploadNeedsAcfWrite({
        seoExtraTextFieldOnly,
        bulkFaqMinimum4,
        writeFocusKeywords,
        generateFaqSchema,
        writeMetaDescription,
        extraTextContent,
        extraImageBase64,
      });

      if (!needsAcfWriteDraft) {
        setProgress({
          step: "Upload complete",
          progress: 100,
          message: "Draft content saved to WordPress.",
        });
      } else try {
        const postType = context.resolved?.subtype || 'post';
        const fullPostForAcfDraft = resolveFullPostForAcfUpdate(context.acfFullPostSnapshot, postId);
        if (!fullPostForAcfDraft) {
          throw new Error(
            `Missing inventory ACF snapshot for draft ${postId}. Reload inventory and retry.`,
          );
        }

        if (seoExtraTextFieldOnly) {
          const raw = (extraTextContent ?? "").trim();
          if (raw) {
            const extraTextHtml = extraTextToUploadHtml(raw);
            const existingAcf = (fullPostForAcfDraft as { acf?: Record<string, unknown> }).acf;
            const mergedAcf = mergeAcfOnlyExtraText(existingAcf, extraTextHtml);
            setProgress({
              step: "Updating SEO extra text (draft)",
              progress: 95,
              message: "Writing ACF `seo_extra_text` only (no other fields)...",
            });
            const acfExtraOnly = await updateACFFields(
              site.siteUrl,
              site.username,
              site.appPassword,
              postId,
              mergedAcf,
              postType,
              postTypeEndpoint
            );
            if (acfExtraOnly.success) {
              console.log("[WordPress Uploader] DRAFT: ACF extra text only updated:", acfExtraOnly.updated.join(", "));
            } else {
              console.warn("[WordPress Uploader] DRAFT: ACF extra text only failed:", acfExtraOnly.error || acfExtraOnly.failed);
            }
          } else {
            console.warn("[WordPress Uploader] DRAFT seoExtraTextFieldOnly: empty extraTextContent, skipping ACF write.");
          }
        } else {
        const todayDate = new Date().toISOString().split('T')[0];
        let keywordForFocusDraft = "";
        if (writeFocusKeywords) {
          keywordForFocusDraft = stripLeadingP(stripBracketPlaceholders(primaryKeyword?.trim() ?? ""));
        }

        const napLocationsDraft =
          site.napInfo?.locations?.map((loc) => ({ city: loc.city, state: loc.state })) ||
          site.locations?.map((loc) => ({ city: loc.city, state: loc.state })) ||
          [];

        const keyDraft = apiKey || loadApiKey() || '';
        const { faqSchema: faqSchemaDraft, skipFaqWrites: skipFaqWritesDraft } =
          buildFaqSchemaForDraftPost({
            faqSchemaOverrideTrimmed,
            generateFaqSchema,
            bulkFaqMinimum4,
            prefetchedFaqRaw,
            primaryKeyword,
            entity,
            siteUrl: site.siteUrl,
            napLocations: napLocationsDraft,
            setProgress,
          });
        let extraTextHtmlDraft = '';
        let extraImageIdDraft: number | undefined;
        if (extraTextContent?.trim()) extraTextHtmlDraft = extraTextToUploadHtml(extraTextContent.trim());
        if (extraImageBase64) {
          try {
            setProgress({ step: 'Uploading extra image...', progress: 94, message: 'Uploading extra image...' });
            const imageDataUrl = `data:image/png;base64,${extraImageBase64}`;
            const imageFilename = `extra-image-${primaryKeyword.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.png`;
            const mediaResult = await uploadWordPressMedia(site.siteUrl, site.username, site.appPassword, imageDataUrl, imageFilename, `Extra image for ${primaryKeyword}`, primaryKeyword ? `Image for ${primaryKeyword}` : undefined);
            if (mediaResult.success && mediaResult.mediaId) extraImageIdDraft = mediaResult.mediaId;
          } catch {
            // skip
          }
        }

        const updatesDraft = {
          date: todayDate,
          ...(writeFocusKeywords && keywordForFocusDraft.trim() ? { keyword: keywordForFocusDraft } : {}),
          extraText: extraTextHtmlDraft,
          ...(faqSchemaDraft && !skipFaqWritesDraft ? { faq: faqSchemaDraft } : {}),
          metaDescription: plainTextExcerpt?.trim() ?? '',
          ...(extraImageIdDraft != null && { extraImageId: extraImageIdDraft }),
        };

        setProgress({ step: 'Sending to OpenRouter...', progress: 94, message: 'Applying updates via AI...' });
        const openRouterKeyDraft = apiKey || loadApiKey();
        if (!openRouterKeyDraft?.trim()) throw new Error('OpenRouter API key required to update ACF.');
        const acfDraft = await getACFFromOpenRouter(fullPostForAcfDraft, updatesDraft, openRouterKeyDraft, getResearchModel(site.id));

        // FORCE-OVERWRITE critical fields (date_modifier, keyword_focus, faq)
        const acfDraftObj = acfDraft as Record<string, unknown>;
        for (const key of Object.keys(acfDraftObj)) {
          const lk = key.toLowerCase();
          if (lk.includes('date_modifier') || lk.includes('date_mod') || lk === 'seo_date_modifier') {
            acfDraftObj[key] = todayDate;
          }
          if (
            writeFocusKeywords &&
            (lk.includes('keyword_focus') || lk.includes('focus_keyword')) &&
            keywordForFocusDraft.trim()
          ) {
            acfDraftObj[key] = keywordForFocusDraft.trim();
          }
          if ((lk.includes('faq') || lk === 'seo_faq') && faqSchemaDraft && !skipFaqWritesDraft) {
            acfDraftObj[key] = faqSchemaDraft;
          }
        }
        console.log('[WordPress Uploader] DRAFT: Force-overwritten critical ACF fields (date, keyword_focus, faq)');

        setProgress({ step: 'Updating ACF fields...', progress: 95, message: 'Writing to WordPress...' });
        const acfUpdateResult = await updateACFFields(
          site.siteUrl,
          site.username,
          site.appPassword,
          postId,
          acfDraftObj,
          postType,
          postTypeEndpoint
        );
        if (acfUpdateResult.success) {
          console.log('[WordPress Uploader] DRAFT: ACF fields updated:', acfUpdateResult.updated.join(', '));
        } else {
          console.warn('[WordPress Uploader] DRAFT: ACF update failed:', acfUpdateResult.error || acfUpdateResult.failed);
        }

        // Fallback: update critical fields via post meta so they persist even if ACF POST fails
        const metaUpdatesDraft: Record<string, string> = {};
        metaUpdatesDraft.date_modifier = todayDate;
        if (writeFocusKeywords && keywordForFocusDraft.trim()) {
          metaUpdatesDraft.keyword_focus = keywordForFocusDraft.trim();
        }
        if (faqSchemaDraft && !skipFaqWritesDraft) metaUpdatesDraft.faq = faqSchemaDraft;
        if (extraTextHtmlDraft?.trim()) metaUpdatesDraft.extra_text = extraTextHtmlDraft.trim();
        if (Object.keys(metaUpdatesDraft).length > 0) {
          try {
            await updateWordPressPostMeta(site.siteUrl, site.username, site.appPassword, postId, postType, postTypeEndpoint, metaUpdatesDraft);
          } catch {
            // skip
          }
        }
        }
      } catch (acfError) {
        console.warn(`[WordPress Uploader] DRAFT: Error updating ACF fields:`, acfError);
        // Don't fail the entire operation if ACF update fails
      }
}
