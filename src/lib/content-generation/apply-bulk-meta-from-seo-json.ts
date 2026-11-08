/**
 * Bulk prompt generator **fallback**: map deterministic optimizedMeta (from keyword research JSON)
 * into ACF fields - no LLM. Used when AI meta (`generateOptimizedMetaFields`) fails; primary path
 * is content-optimizer parity in bulk-auto-generate. NEO Pulse redirect post meta is written in bulk-auto-generate.
 */

import { logger } from "@/lib/logger";
import { ensureExactKeywordInMetaDescription } from "@/lib/content-generation/pulse-seo-exact-keyword";
import type { OptimizedMetaFields } from "@/lib/meta-field-optimizer";
import type { WordPressSite } from "@/components/integrations/types";
import type { ACFFieldMapping } from "@/lib/content-generation/post-field-mapper";
import { buildAcfPayload } from "@/lib/content-generation/apply-meta-fields-payload";
import { updateACFFields } from "@/lib/wordpress-post-fields-origin";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";

/** Same canonical values as `updateWordPressPostMeta` neo_pulse_seo_* in bulk upload. */
export function buildOptimizedMetaFromKeywordResearch(
  rankMeta: { seoTitle?: string; metaDescription?: string; focusKeyword?: string },
  postTitle: string,
  excerpt: string,
  primaryKw: string,
  postLink: string,
  siteUrl: string
): OptimizedMetaFields {
  const exactKw = (primaryKw || rankMeta.focusKeyword || '').trim().slice(0, 500);

  const rawDesc = rankMeta.metaDescription ? rankMeta.metaDescription.trim() : excerpt.trim();

  const title = postTitle.trim();
  const desc = ensureExactKeywordInMetaDescription(rawDesc, exactKw, 160);
  const kw = exactKw;
  const baseUrl = String(siteUrl || "").replace(/\/$/, "");
  return {
    neo_pulse_seo_title: title,
    neo_pulse_seo_description: desc,
    neo_pulse_seo_focus_keyword: kw,
    neo_pulse_seo_canonical_url: postLink || baseUrl,
    neo_pulse_seo_robots: ["index", "follow"],
    keyword_focus: kw,
  };
}

export interface ApplyBulkSeoMetaToAcfOptions {
  postId: number;
  site: WordPressSite;
  postLink: string;
  primaryKeyword: string;
  optimizedMeta: OptimizedMetaFields;
  fieldMapping: ACFFieldMapping;
  existingAcfFields: Record<string, unknown>;
  postTypeSubtype: string;
  postTypeEndpoint: string;
  /** Same string written to ACF `seo_research` in the research phase (used only for merge fallback; seo_research is not re-written here). */
  priorSeoResearchJson: string;
  fileManager: OptimizationFileManager;
  setProgress: (progress: { step: string; progress: number; message?: string }) => void;
}

export async function applyBulkSeoMetaToAcf(
  options: ApplyBulkSeoMetaToAcfOptions
): Promise<{ success: boolean }> {
  const {
    postId,
    site,
    postLink,
    primaryKeyword,
    optimizedMeta,
    fieldMapping,
    existingAcfFields,
    postTypeSubtype,
    postTypeEndpoint,
    priorSeoResearchJson,
    fileManager,
    setProgress,
  } = options;

  setProgress({
    step: "Applying SEO fields to ACF (from research JSON)...",
    progress: 96,
    message: "Writing keyword, meta description, and SEO title to ACF...",
  });

  const acfFields = buildAcfPayload(
    fieldMapping,
    optimizedMeta,
    primaryKeyword,
    existingAcfFields,
    priorSeoResearchJson,
    { includeSeoResearchInPayload: false }
  );

  if (Object.keys(acfFields).length === 0) {
    logger.warn("[Bulk ACF Meta] No mapped ACF fields to update (keyword/meta/title).");
    return { success: false };
  }

  const upd = await updateACFFields(
    site.siteUrl,
    site.username,
    site.appPassword,
    postId,
    acfFields,
    postTypeSubtype,
    postTypeEndpoint
  );

  if (upd.success) {
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
          source: "bulk_prompt_generator_json",
          updatedAt: new Date().toISOString(),
        },
        null,
        2
      ),
      "application/json"
    );
    return { success: true };
  }

  logger.warn("[Bulk ACF Meta] updateACFFields failed:", upd.error, upd.failed);
  return { success: false };
}
