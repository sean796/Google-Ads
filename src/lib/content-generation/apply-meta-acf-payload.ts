/**
 * Shared ACF payload building for SEO meta (Rank Math–shaped fields → ACF keys).
 * Used by apply-meta-optimizer-to-acf (AI path) and bulk prompt generator (JSON-only path).
 */

import type { OptimizedMetaFields } from "@/lib/meta-field-optimizer";
import type { ACFFieldMapping } from "@/lib/content-generation/acf-field-mapper";

/** Max JSON length for seo_research ACF (large Semrush/DFS blobs). */
export const SEO_RESEARCH_JSON_MAX = 60000;

export interface BuildAcfPayloadOptions {
  /** When false, omit the merged `seo_research` field (bulk writes research in an earlier phase). Default true. */
  includeSeoResearchInPayload?: boolean;
}

export function mergeSeoResearchWithMeta(
  existing: string | undefined,
  optimized: OptimizedMetaFields,
  primaryKeyword: string
): string {
  let base: Record<string, unknown> = {};
  const raw = typeof existing === "string" ? existing.trim() : "";
  if (raw) {
    try {
      base = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      base = { research_brief: raw };
    }
  }
  base.seo_title = optimized.rank_math_title ?? base.seo_title;
  base.meta_description = optimized.rank_math_description ?? base.meta_description;
  base.focus_keyword = optimized.rank_math_focus_keyword ?? primaryKeyword ?? base.focus_keyword;
  base.updated_at = new Date().toISOString();
  return JSON.stringify(base);
}

export function buildAcfPayload(
  mapping: ACFFieldMapping,
  optimized: OptimizedMetaFields,
  primaryKeyword: string,
  existingAcf: Record<string, unknown>,
  priorSeoResearchJson?: string,
  options?: BuildAcfPayloadOptions
): Record<string, string> {
  const includeSeoResearchInPayload = options?.includeSeoResearchInPayload !== false;

  const out: Record<string, string> = {};
  const kw = String(optimized.rank_math_focus_keyword || primaryKeyword || "").trim();
  const desc = String(optimized.rank_math_description || "").trim();
  const title = String(optimized.rank_math_title || "").trim();

  const kwKey = mapping.keywordFocus || "keyword_focus";
  if (kw) {
    out[kwKey] = kw.slice(0, 500);
  }

  if (desc && mapping.metaDescription) {
    out[mapping.metaDescription] = desc.slice(0, 500);
  }

  const titleKey = mapping.seoTitle;
  if (titleKey && title) {
    out[titleKey] = title.slice(0, 120);
  }

  if (includeSeoResearchInPayload) {
    const seoResearchKey = mapping.seoResearch || "seo_research";
    const prevRaw = existingAcf[seoResearchKey] ?? existingAcf["seo_research"];
    const fromRest =
      typeof prevRaw === "string" ? prevRaw : prevRaw != null ? JSON.stringify(prevRaw) : undefined;
    const prior = typeof priorSeoResearchJson === "string" ? priorSeoResearchJson.trim() : "";
    const prevStr = prior || fromRest;
    out[seoResearchKey] = mergeSeoResearchWithMeta(prevStr || undefined, optimized, primaryKeyword);
  }

  return out;
}
