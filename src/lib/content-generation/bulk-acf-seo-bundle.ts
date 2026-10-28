/**
 * Bulk prompt generator: pre-blog SEO research skeleton (parallel with blueprint) and
 * post-markdown FAQ + merged seo_research JSON (parallel with featured image).
 */

import type { KeywordData } from '@/lib/keyword-types';
import type { WordPressSite } from '@/components/integrations/types';
import type { CSVRow } from '@/lib/bulk/bulk-csv-parser';
import { mergeSeoResearchWithMeta } from '@/lib/content-generation/apply-meta-acf-payload';
import { buildOptimizedMetaFromKeywordResearch } from '@/lib/content-generation/apply-bulk-meta-from-seo-json';
import {
  buildFAQSchemaScriptFromEntries,
} from '@/lib/content-generation/wordpress-uploader';
import {
  generateBulkFaqEntriesInContext,
  napLocationsFromSite,
} from '@/lib/content-generation/bulk-faq-in-context';
import type { FaqEntry } from '@/lib/faq-entries';
import { parseFaqEntries, repairFaqEntriesFromSchema } from '@/lib/faq-entries';
import {
  appendVisibleFaqTableWithIntro,
  FLO_FAQ_CLASS,
  stripTrailingFaqSection,
} from '@/lib/overview/overview-blog-faq-append';

export interface PreBlogSeoSkeletonInput {
  keywordData: KeywordData;
  enrichedRow: CSVRow;
  semrushKeywordsContext?: string;
  semrushScatterContext?: string;
  /** Before blueprint merge */
  flowTitle: string;
}

/**
 * SEO research JSON base (no post_link, no FAQ) - runs in parallel with blueprint after checklist.
 */
export function buildPreBlogSeoResearchSkeleton(input: PreBlogSeoSkeletonInput): Record<string, unknown> {
  const { keywordData, enrichedRow, semrushKeywordsContext, semrushScatterContext, flowTitle } = input;
  const obj: Record<string, unknown> = {
    primary_keyword: keywordData.keyword,
    title: flowTitle,
    generatedAt: new Date().toISOString(),
    post_link: '',
  };
  if (semrushKeywordsContext?.trim()) {
    try {
      obj.semrush_keywords = JSON.parse(semrushKeywordsContext);
    } catch {
      obj.semrush_keywords_raw = semrushKeywordsContext.slice(0, 8000);
    }
  }
  if (semrushScatterContext?.trim()) {
    try {
      obj.semrush_scatter = JSON.parse(semrushScatterContext);
    } catch {
      obj.semrush_scatter_raw = semrushScatterContext.slice(0, 8000);
    }
  }
  return obj;
}

export function mergeBlueprintIntoPreBlogSkeleton(
  skeleton: Record<string, unknown>,
  blueprintTitle: string | undefined,
  blueprintPurpose: string | undefined
): void {
  if (blueprintTitle?.trim()) skeleton.title = blueprintTitle.trim();
  if (blueprintPurpose?.trim()) skeleton.blueprint_purpose = blueprintPurpose.trim();
}

export interface PrecomputedAcfSeoBundle {
  seoResearchJson: string;
  faqForAcf: string;
  /** Q/A pairs from in-context FAQ (or CSV) — source of truth for visible flo-faq body table. */
  faqEntries?: FaqEntry[];
}

/** Visible table uses repaired backend Q/A entries (never invents from schema fallback). */
export function resolveFaqEntriesForVisibleTable(
  existing?: FaqEntry[] | null
): FaqEntry[] {
  if (!existing?.length) return [];
  return repairFaqEntriesFromSchema(existing);
}

export interface BuildPostMarkdownAcfSeoFaqBundleParams {
  preBlogSkeleton: Record<string, unknown>;
  markdownContent: string;
  enrichedRow: CSVRow;
  keywordData: KeywordData;
  blueprintTitle: string | undefined;
  excerpt: string;
  site: WordPressSite;
  postTitle: string;
  primaryKw: string;
  rankMeta: { seoTitle?: string; metaDescription?: string; focusKeyword?: string };
  openRouterApiKey: string;
  /** Placeholder URL for FAQ LLM before post exists */
  placeholderPostUrl: string;
  onProgress?: (message: string) => void;
  /** Content Optimizer: always regenerate in-context FAQ; ignore enrichedRow.faq / ACF FAQ text. */
  forceRegenerateFaq?: boolean;
}

/**
 * After markdown: FAQ LLM + merged seo_research (meta + faq_schema in one JSON string).
 * Uses placeholder post URL; caller patches `post_link` after `createWordPressPost`.
 */
export async function buildPostMarkdownAcfSeoFaqBundle(
  params: BuildPostMarkdownAcfSeoFaqBundleParams
): Promise<PrecomputedAcfSeoBundle | null> {
  const {
    preBlogSkeleton,
    markdownContent,
    enrichedRow,
    keywordData,
    blueprintTitle,
    excerpt,
    site,
    postTitle,
    primaryKw,
    rankMeta,
    openRouterApiKey,
    placeholderPostUrl,
    onProgress,
    forceRegenerateFaq = false,
  } = params;

  const entity =
    enrichedRow.entity && enrichedRow.entity.trim() && enrichedRow.entity.trim() !== 'N/A'
      ? enrichedRow.entity.trim()
      : undefined;

  const optimizedMeta = buildOptimizedMetaFromKeywordResearch(
    rankMeta,
    postTitle,
    excerpt,
    primaryKw,
    '',
    site.siteUrl
  );

  const seoResearchObj: Record<string, unknown> = {
    ...preBlogSkeleton,
    primary_keyword: keywordData.keyword,
    title: enrichedRow.title || blueprintTitle,
    generatedAt: new Date().toISOString(),
    post_link: placeholderPostUrl,
    seo_title: optimizedMeta.rank_math_title,
    meta_description: optimizedMeta.rank_math_description,
    focus_keyword: optimizedMeta.rank_math_focus_keyword,
    optimizedMeta: {
      rank_math_title: optimizedMeta.rank_math_title,
      rank_math_description: optimizedMeta.rank_math_description,
      rank_math_focus_keyword: optimizedMeta.rank_math_focus_keyword,
      rank_math_canonical_url: optimizedMeta.rank_math_canonical_url,
      rank_math_robots: optimizedMeta.rank_math_robots,
    },
  };

  let faqForAcf = '';
  let faqEntries: FaqEntry[] | undefined;
  if (!forceRegenerateFaq && enrichedRow.faq && enrichedRow.faq.trim()) {
    faqForAcf = enrichedRow.faq.trim();
    const parsed = parseFaqEntries(faqForAcf);
    if (parsed.length > 0) {
      faqEntries = parsed;
      const napLocs = napLocationsFromSite(site);
      faqForAcf = buildFAQSchemaScriptFromEntries(
        parsed,
        primaryKw,
        entity,
        site.siteUrl,
        napLocs
      );
      seoResearchObj.faq_entries = parsed.map((e) => ({
        question: e.question,
        answer: e.answer.slice(0, 2000),
      }));
    }
  } else if (primaryKw && markdownContent && openRouterApiKey?.trim()) {
    const napLocs = napLocationsFromSite(site);
    onProgress?.(`Generating in-context FAQ...`);
    const briefForFaq = JSON.stringify(seoResearchObj).slice(0, 24000);
    const entries = await generateBulkFaqEntriesInContext({
      markdownContent,
      postTitle,
      pageMeta: excerpt,
      primaryKeyword: primaryKw,
      postUrl: placeholderPostUrl,
      seoResearchBrief: briefForFaq,
      site,
      apiKey: openRouterApiKey,
      siteId: site.id,
      pairCount: 4,
    });
    if (entries.length > 0) {
      const repaired = repairFaqEntriesFromSchema(entries);
      faqEntries = repaired;
      faqForAcf = buildFAQSchemaScriptFromEntries(
        repaired,
        primaryKw,
        entity,
        site.siteUrl,
        napLocs
      );
      seoResearchObj.faq_entries = repaired.map((e) => ({
        question: e.question,
        answer: e.answer.slice(0, 2000),
      }));
    }
  }

  if (faqForAcf) {
    seoResearchObj.faq_schema_ld_json = faqForAcf;
  }

  const seoResearchJson = mergeSeoResearchWithMeta(
    JSON.stringify(seoResearchObj),
    optimizedMeta,
    primaryKw
  );

  return {
    seoResearchJson,
    faqForAcf,
    ...(faqEntries?.length ? { faqEntries } : {}),
  };
}

/** Inject real permalink after post creation (updates post_link and canonical in merged JSON). */
export function patchPostLinkInSeoResearchJson(
  seoResearchJson: string,
  postLink: string,
  siteUrl: string,
  postTitle: string,
  excerpt: string,
  primaryKw: string,
  rankMeta: { seoTitle?: string; metaDescription?: string; focusKeyword?: string }
): string {
  const optimizedMeta = buildOptimizedMetaFromKeywordResearch(
    rankMeta,
    postTitle,
    excerpt,
    primaryKw,
    postLink,
    siteUrl
  );
  let base: Record<string, unknown> = {};
  try {
    base = JSON.parse(seoResearchJson) as Record<string, unknown>;
  } catch {
    return seoResearchJson;
  }
  base.post_link = postLink;
  base.seo_title = optimizedMeta.rank_math_title;
  base.meta_description = optimizedMeta.rank_math_description;
  base.focus_keyword = optimizedMeta.rank_math_focus_keyword;
  base.optimizedMeta = {
    rank_math_title: optimizedMeta.rank_math_title,
    rank_math_description: optimizedMeta.rank_math_description,
    rank_math_focus_keyword: optimizedMeta.rank_math_focus_keyword,
    rank_math_canonical_url: optimizedMeta.rank_math_canonical_url,
    rank_math_robots: optimizedMeta.rank_math_robots,
  };
  return mergeSeoResearchWithMeta(JSON.stringify(base), optimizedMeta, primaryKw);
}

export interface ApplyOptimizeFaqToHarnessHtmlParams {
  htmlContent: string;
  markdownContent: string;
  site: WordPressSite;
  primaryKw: string;
  postTitle: string;
  excerpt: string;
  apiKey: string;
  postUrl: string;
  preBlogSkeleton?: Record<string, unknown>;
  entity?: string;
  onProgress?: (message: string) => void;
}

/** Content Optimizer: strip stale flo-faq, regenerate FAQ bundle, append visible table (post-creator parity). */
export async function applyOptimizeFaqToHarnessHtml(
  params: ApplyOptimizeFaqToHarnessHtmlParams,
): Promise<{ html: string; faqBundle: PrecomputedAcfSeoBundle | null }> {
  const apiKey = params.apiKey.trim();
  if (!apiKey) {
    throw new Error('OpenRouter API key required for FAQ generation during content optimization.');
  }

  let html = stripTrailingFaqSection(params.htmlContent);

  const preBlogSkeleton = params.preBlogSkeleton ?? {
    primary_keyword: params.primaryKw,
    title: params.postTitle,
    generatedAt: new Date().toISOString(),
    post_link: params.postUrl,
  };

  const enrichedRow = {
    title: params.postTitle,
    keyword: params.primaryKw,
    ...(params.entity?.trim() ? { entity: params.entity.trim() } : {}),
  } as CSVRow;

  const faqBundle = await buildPostMarkdownAcfSeoFaqBundle({
    preBlogSkeleton,
    markdownContent: params.markdownContent,
    enrichedRow,
    keywordData: { keyword: params.primaryKw } as KeywordData,
    blueprintTitle: params.postTitle,
    excerpt: params.excerpt,
    site: params.site,
    postTitle: params.postTitle,
    primaryKw: params.primaryKw,
    rankMeta: { focusKeyword: params.primaryKw },
    openRouterApiKey: apiKey,
    placeholderPostUrl: params.postUrl,
    onProgress: params.onProgress,
    forceRegenerateFaq: true,
  });

  const visibleFaqEntries = resolveFaqEntriesForVisibleTable(faqBundle?.faqEntries);
  if (!visibleFaqEntries.length) {
    throw new Error('FAQ generation failed: no Q/A pairs were produced for the optimized article.');
  }

  if (!html.toLowerCase().includes(`class="${FLO_FAQ_CLASS}"`)) {
    params.onProgress?.('Appending FAQ table to post body...');
    const appended = await appendVisibleFaqTableWithIntro({
      sourceHtml: html,
      entries: visibleFaqEntries,
      apiKey,
      focusKeyword: params.primaryKw,
      pageTitle: params.postTitle,
    });
    if (!appended?.html) {
      throw new Error('FAQ table append failed for optimized content.');
    }
    html = appended.html;
  }

  return { html, faqBundle };
}
