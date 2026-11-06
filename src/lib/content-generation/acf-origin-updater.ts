/**
 * ACF Origin Updater Module
 * Handles ACF Origin field updates using entity endpoint directly.
 * Prefers explicit `preferredOrigin`, then hyperlocal tail from SAP title (`… in Place, City`), else AI extraction.
 */

import { logger } from "@/lib/logger";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_CONTENT_SAVED_BUT_ORIGIN_FIELD_UPDATE_EN, notifyContentSavedButOriginFieldUpdateFa, notifyOriginFieldUpdatedX } from "@/lib/notify-messages";
import { getMuteOptimizationToasts } from "@/hooks/content-optimization/optimization-toast-mute";
import { analyzeAndUpdateOriginField } from "@/lib/wordpress-acf-origin";
import type { WordPressSite } from "@/components/integrations/types";
import { extractEndpointFromEntitySitemapUrl } from "@/lib/entity-endpoint-extractor";
import { extractOriginFromSapTitle } from "@/lib/sap-origin-from-title";
import type {
  ResolvedTargetLike,
  WpExistingPostLike,
} from "@/hooks/content-optimization/use-optimization-state";

export interface ACFOriginUpdaterOptions {
  postId: number;
  finalTitle: string;
  site: WordPressSite;
  existingPost?: WpExistingPostLike;
  resolved?: ResolvedTargetLike;
  setProgress: (progress: { step: string; progress: number; message?: string }) => void;
  /** Page URL (e.g. .../painter-near-baranow-edmonton/) so origin uses slug location, not just city from title. */
  pageUrl?: string;
  /** Post excerpt (used by AI agent to fill Origin from context). */
  excerpt?: string;
  /** Current ACF Origin value (for context when deriving new origin). */
  existingOrigin?: string;
  /** When set, takes precedence over title extraction (e.g. CSV `origin` from bulk). */
  preferredOrigin?: string;
}

export interface ACFOriginUpdaterResult {
  success: boolean;
  origin?: string;
}

export async function updateACFOriginField(
  options: ACFOriginUpdaterOptions
): Promise<ACFOriginUpdaterResult> {
  const {
    postId,
    finalTitle,
    site,
    existingPost,
    resolved,
    setProgress,
    pageUrl,
    excerpt,
    existingOrigin,
    preferredOrigin: preferredOriginOption,
  } = options;

  // Only update ACF Origin if entity sitemap URL is provided (indicates site supports entity-based content)
  if (!site.entitySitemapUrl) {
    return { success: true };
  }

  if (!postId) {
    return { success: true };
  }

  if (!finalTitle) {
    return { success: true };
  }

  try {
    // Extract entity endpoint directly from entity sitemap URL - NO normalization
    const entityEndpoint = extractEndpointFromEntitySitemapUrl(site.entitySitemapUrl);

    // Use entityEndpoint directly for ACF update - NO normalization
    const postTypeEndpoint = entityEndpoint;


    const preferredOrigin =
      preferredOriginOption?.trim() || extractOriginFromSapTitle(finalTitle);
    if (preferredOrigin) {
      setProgress({
        step: 'Updating ACF Origin field...',
        progress: 93,
        message: `Writing origin from SAP title…`,
      });
    } else {
      setProgress({
        step: 'Updating ACF Origin field...',
        progress: 93,
        message: `Analyzing title and extracting origin with AI...`,
      });
    }

    const originResult = await analyzeAndUpdateOriginField(
      site.siteUrl,
      site.username,
      site.appPassword,
      postId,
      finalTitle,
      entityEndpoint, // Use entityEndpoint directly
      postTypeEndpoint, // Use entityEndpoint directly
      pageUrl, // Prefer location from URL slug (e.g. Baranow, Edmonton) over AI simplifying to just city
      excerpt, // AI agent uses excerpt + title + slug to fill Origin
      existingOrigin,
      preferredOrigin || undefined
    );

    if (originResult.success && originResult.origin && originResult.origin.trim() && originResult.origin.trim() !== "N/A") {
      if (!getMuteOptimizationToasts()) notify.success(notifyOriginFieldUpdatedX(originResult.origin), { duration: 3000 });
      return { success: true, origin: originResult.origin };
    } else if (originResult.error) {
      logger.warn(`[Content Generation] Failed to update ACF Origin field: ${originResult.error}`);
      // Don't fail the whole process if origin update fails
      if (!getMuteOptimizationToasts()) notify.warning(notifyContentSavedButOriginFieldUpdateFa(originResult.error), { duration: 5000 });
      return { success: false };
    } else {
      // Could not extract origin or extracted "N/A" - this is a regular blog post
      // Don't fail - regular blog posts don't need origin fields
      return { success: true };
    }
  } catch (originError) {
    logger.error('[Content Generation] Error updating ACF Origin field:', originError);
    // Don't fail the whole process if origin update fails
    if (!getMuteOptimizationToasts()) notify.warning(NOTIFY_CONTENT_SAVED_BUT_ORIGIN_FIELD_UPDATE_EN, { duration: 5000 });
    return { success: false };
  }
}
