/**
 * Run the same Meta Optimizer AI as generateOptimizedMetaFields, then persist
 * title/description/focus into ACF only (no rank_math_* post meta writes).
 */

import { logger } from "@/lib/logger";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_ACF_SEO_FIELDS_UPDATED, NOTIFY_CONTENT_SAVED_BUT_ACF_SEO_FIELD_UPDATE_F, NOTIFY_CONTENT_SAVED_BUT_ACF_SEO_OPTIMIZATION_E, NOTIFY_CONTENT_SAVED_BUT_ACF_SEO_STEP_SKIPPED_C, NOTIFY_GENERATING_SEO_FIELDS_FOR_ACF, NOTIFY_SEO_AI_RAN_BUT_NO_MATCHING_ACF_FIELDS_WE } from "@/lib/notify-messages";
import { getMuteOptimizationToasts } from "@/hooks/content-optimization/optimization-toast-mute";
import { loadApiKey } from "@/lib/api";
import { getWordPressPostMeta } from "@/lib/wordpress-api";
import { generateOptimizedMetaFields, type OptimizedMetaFields } from "@/lib/meta-field-optimizer";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import type { WordPressSite } from "@/components/integrations/types";
import { extractEndpointFromEntitySitemapUrl } from "@/lib/entity-endpoint-extractor";
import { updateACFFields } from "@/lib/wordpress-acf-origin";
import {
  discoverACFFieldMapping,
  fallbackFieldMapping,
  type ACFFieldMapping,
} from "@/lib/content-generation/acf-field-mapper";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import type { WpExistingPostLike } from "@/hooks/content-optimization/use-optimization-state";
import { buildAcfPayload } from "@/lib/content-generation/apply-meta-acf-payload";

export interface ApplyMetaOptimizerToAcfOptions {
  postId: number;
  markdownContent: string;
  finalTitle: string;
  metaDescription: string | undefined;
  primaryKeyword: string;
  site: WordPressSite;
  postLink: string;
  existingPost?: WpExistingPostLike;
  fileManager: OptimizationFileManager;
  setProgress: (progress: { step: string; progress: number; message?: string }) => void;
  shouldApply: boolean;
  gscKeywordsContext?: string;
  /**
   * Full research JSON already saved (or about to be merged) from the pipeline.
   * When REST omits `acf.seo_research` on GET, merge still preserves DFS/Semrush instead of wiping it.
   */
  priorSeoResearchJson?: string;
}

export interface ApplyMetaOptimizerToAcfResult {
  success: boolean;
}

export async function applyMetaOptimizerToACF(
  options: ApplyMetaOptimizerToAcfOptions
): Promise<ApplyMetaOptimizerToAcfResult> {
  const {
    postId,
    markdownContent,
    finalTitle,
    metaDescription,
    primaryKeyword,
    site,
    postLink,
    existingPost,
    fileManager,
    setProgress,
    shouldApply,
    gscKeywordsContext,
    priorSeoResearchJson,
  } = options;

  if (!shouldApply) {
    return { success: true };
  }

  try {
    setProgress({
      step: "Optimizing SEO fields (ACF)...",
      progress: 94,
      message: "Fetching post and generating SEO copy for ACF...",
    });

    const subtypeRaw = existingPost?.postTypeSubtype ?? existingPost?.subtype;
    const resolvedSubtype = typeof subtypeRaw === "string" && subtypeRaw ? subtypeRaw : "post";
    const postTypeEndpoint =
      existingPost?.postTypeEndpoint ||
      (site.entitySitemapUrl ? extractEndpointFromEntitySitemapUrl(site.entitySitemapUrl) : undefined) ||
      "posts";

    const metaResult = await getWordPressPostMeta(
      site.siteUrl,
      site.username,
      site.appPassword,
      postId,
      resolvedSubtype,
      postTypeEndpoint
    );

    if (!metaResult.success) {
      const errorMsg = metaResult.error || "Unknown error";
      logger.warn(`[ACF Meta] Failed to fetch post for post ID ${postId}: ${errorMsg}`);
      if (!getMuteOptimizationToasts())
        notify.warning(NOTIFY_CONTENT_SAVED_BUT_ACF_SEO_STEP_SKIPPED_C, { duration: 5000 });
      return { success: false };
    }

    const metaObj = metaResult.meta && typeof metaResult.meta === "object" ? metaResult.meta : {};
    let acfFromPayload =
      (metaResult as { acf?: Record<string, unknown> }).acf &&
      typeof (metaResult as { acf?: Record<string, unknown> }).acf === "object"
        ? ((metaResult as { acf: Record<string, unknown> }).acf as Record<string, unknown>)
        : {};

    if (Object.keys(acfFromPayload).length === 0) {
      acfFromPayload = {
        keyword_focus: "",
        seo_research: "",
        meta_description: "",
        prompt_modifier: "",
        date_modifier: "",
        faq: "",
      };
    }

    if (!getMuteOptimizationToasts()) notify.info(NOTIFY_GENERATING_SEO_FIELDS_FOR_ACF, { duration: 3000 });
    setProgress({
      step: "Optimizing SEO fields (ACF)...",
      progress: 95,
      message: "AI generating SEO title, description, focus for ACF...",
    });

    const isPage = resolvedSubtype === "page";
    const seoBriefFromAcf =
      (typeof priorSeoResearchJson === "string" && priorSeoResearchJson.trim()) ||
      (typeof acfFromPayload?.seo_research === "string" ? acfFromPayload.seo_research.trim() : "");

    const optimizedMeta = await generateOptimizedMetaFields(
      markdownContent,
      finalTitle,
      metaDescription,
      primaryKeyword,
      metaObj,
      site.siteUrl,
      postLink,
      isPage,
      site.id,
      seoBriefFromAcf ? undefined : gscKeywordsContext,
      seoBriefFromAcf || undefined
    );

    const apiKey = loadApiKey() || "";
    const fbMapping = fallbackFieldMapping(acfFromPayload);
    const discoveredMapping =
      Object.keys(acfFromPayload).length > 0 && apiKey.trim()
        ? await discoverACFFieldMapping(
            acfFromPayload,
            resolvedSubtype,
            apiKey,
            site.siteUrl,
            getResearchModel(site.id)
          )
        : ({} as ACFFieldMapping);
    const mapping: ACFFieldMapping = { ...fbMapping, ...discoveredMapping };

    const acfFields = buildAcfPayload(
      mapping,
      optimizedMeta,
      primaryKeyword,
      acfFromPayload,
      priorSeoResearchJson
    );

    if (Object.keys(acfFields).length === 0) {
      logger.warn("[ACF Meta] No ACF field mapping matched - nothing to update");
      if (!getMuteOptimizationToasts())
        notify.warning(NOTIFY_SEO_AI_RAN_BUT_NO_MATCHING_ACF_FIELDS_WE, { duration: 5000 });
      return { success: false };
    }

    setProgress({
      step: "Updating ACF SEO fields...",
      progress: 96,
      message: "Writing SEO fields to WordPress ACF...",
    });

    const upd = await updateACFFields(
      site.siteUrl,
      site.username,
      site.appPassword,
      postId,
      acfFields,
      resolvedSubtype,
      postTypeEndpoint
    );

    if (upd.success) {
      if (!getMuteOptimizationToasts()) notify.success(NOTIFY_ACF_SEO_FIELDS_UPDATED, { duration: 3000 });

      const name = OptimizationFileManager.generateFilename("acf-seo-optimization", primaryKeyword, "json");
      fileManager.addFile(
        name,
        JSON.stringify(
          {
            postId,
            postLink,
            primaryKeyword,
            acfFieldsWritten: acfFields,
            optimizedMeta,
            updatedAt: new Date().toISOString(),
          },
          null,
          2
        ),
        "application/json"
      );
      return { success: true };
    }

    logger.warn("[ACF Meta] updateACFFields failed:", upd.error, upd.failed);
    if (!getMuteOptimizationToasts())
      notify.warning(NOTIFY_CONTENT_SAVED_BUT_ACF_SEO_FIELD_UPDATE_F, { duration: 5000 });
    return { success: false };
  } catch (e) {
    logger.error("[ACF Meta] Error:", e);
    if (!getMuteOptimizationToasts())
      notify.warning(NOTIFY_CONTENT_SAVED_BUT_ACF_SEO_OPTIMIZATION_E, { duration: 5000 });
    return { success: false };
  }
}
