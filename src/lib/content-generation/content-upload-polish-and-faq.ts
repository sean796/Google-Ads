import type { WordPressSite } from "@/components/integrations/types";
import type { generateBlueprintFromTemplate } from "@/lib/blog-template-builder";
import type { AIDrivenACFContext } from "./ai-driven-acf-reader";
import type { RunProgressReporter } from "@/lib/content-optimization/content-optimizer-run-progress";
import type { ImageType } from "@/lib/image-section-analyzer";
import { cleanTitleForNonEntity } from "@/lib/content-optimization/title-cleaning";
import { mergeExternalLinkPairs, parseExternalSemrushPairsFromAgents, parseLlmAuditAuthorityPairsFromAgents } from "./external-link-placeholders";
import { prepareHarnessContentForUpload } from "./harness-upload-prep";
import { applyOptimizeFaqToHarnessHtml, type PrecomputedAcfSeoBundle } from "./bulk-acf-seo-bundle";
import { deduplicateInternalLinksInHtml, removeInvalidInternalLinks } from "./content-sanitizer";
import { ensureWhatWeOfferTablePageLinks } from "./what-we-offer-table-page-links";
import { ensureSemrushExternalLinksInHtml } from "./ensure-semrush-external-links";
import type { ResolvedTargetLike, WpExistingPostLike } from "@/hooks/content-optimization/use-optimization-state";
import type { ExtraTextInventoryLinkRow } from "./extra-text-inventory-links";

/** Blueprint as produced by generateBlueprintFromTemplate, plus pipeline-attached fields. */
export type BlueprintResult = Awaited<
  ReturnType<typeof generateBlueprintFromTemplate>
> & { entity?: string; h2Outline?: string[]; origin?: string };

/** WordPress REST API can return content/excerpt as { raw, rendered }. Normalize to string. */
export function toStringContent(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'raw' in value && typeof (value as { raw?: string }).raw === 'string')
    return (value as { raw: string }).raw;
  if (typeof value === 'object' && 'rendered' in value && typeof (value as { rendered?: string }).rendered === 'string')
    return (value as { rendered: string }).rendered;
  return String(value);
}

export function dedupeTrimmedUrls(urls: string[] | undefined): string[] {
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
  existingPost: WpExistingPostLike;
  resolved: ResolvedTargetLike;
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
  wordPressPagesForOfferTable?: ExtraTextInventoryLinkRow[];
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

export interface ContentUploadPolishArgs {
  htmlContent: string;
  markdownContent: string;
  blueprintResult: BlueprintResult;
  blueprintAgents: BlueprintResult["agents"];
  existingTitle: string;
  primaryKeyword: string;
  site: WordPressSite;
  context: OptimizationContext;
  shouldOptimizeContent: boolean;
  preservedMediaUrls: string[];
  acfFields?: Record<string, unknown>;
  resolvedAcfContext?: AIDrivenACFContext;
  openRouterApiKey: string;
  excerpt: string;
  setProgress: RunProgressReporter;
}

export async function polishContentForWordPressUpload(args: ContentUploadPolishArgs) {
  const { markdownContent, blueprintResult, blueprintAgents, existingTitle, primaryKeyword, site, context, shouldOptimizeContent, preservedMediaUrls, acfFields, resolvedAcfContext, openRouterApiKey, excerpt, setProgress } = args;
  let htmlContent = args.htmlContent;
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

  const blueprintEntity = blueprintResult?.entity;
  const entity = blueprintEntity && blueprintEntity !== 'N/A' ? blueprintEntity : undefined;

  let cleanedExistingTitle = existingTitle;
  if (!blueprintEntity || blueprintEntity === 'N/A') {
    cleanedExistingTitle = cleanTitleForNonEntity(existingTitle, blueprintEntity || 'N/A');
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

  const strippedHtml = removeInvalidInternalLinks(htmlContent, context.wordPressPosts, site.siteUrl);
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
  return { htmlContent, strippedHtml, optimizeFaqBundle, entity, cleanedExistingTitle, prefetchedFaqRaw, allowedExternalUrls };
}
