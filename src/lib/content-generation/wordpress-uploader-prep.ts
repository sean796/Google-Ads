/**
 * Upload preparation helpers for the WordPress uploader.
 */

import { logger } from "@/lib/logger";
import type {
  ResolvedTargetLike,
  WpExistingPostLike,
} from "@/hooks/content-optimization/use-optimization-state";
import type { WordPressSite } from "@/components/integrations/types";
import { extractEndpointFromEntitySitemapUrl } from "@/lib/entity-endpoint-extractor";
import { sanitizeContentForUpload, validateContentForUpload } from "@/lib/content-generation/content-sanitizer";
import { wrapHarnessH2AnchorsForWordPressBlocks } from "@/lib/content-generation/wordpress-harness-heading-anchors";
import { loadApiKey } from "@/lib/api";
import { generateSEOSlug } from "@/lib/seo-slug-generator";
import { resolveRecommendedAuthor } from "@/lib/wordpress-api/author-resolver";
import { updateWordPressPostMeta, type WordPressPostCreateResult, type WordPressPostUpdateResult } from "@/lib/wordpress-api";
import { updateACFFields } from "@/lib/wordpress-acf-origin";

export interface WordPressUploaderOptions {
  context: {
    site: WordPressSite;
    url: string;
    updateMode: 'update' | 'draft';
    existingPost?: WpExistingPostLike;
    resolved?: ResolvedTargetLike;
    existingTitle: string;
    existingContent?: string;
    wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>;
    optimizationOptions?: { stagingSite?: boolean };
    /** Bulk prefetch `getACFFieldsForPost` snapshot — upload skips repeat fetch when ids match. */
    acfFullPostSnapshot?: Record<string, unknown>;
  };
  blueprintResult: { title?: string; purpose?: string };
  existingTitle: string;
  primaryKeyword: string;
  htmlContent: string;
  excerpt: string;
  featuredImageId?: number;
  shouldOptimizeTitle: boolean;
  writeFocusKeywords?: boolean;
  generateFaqSchema?: boolean;
  prefetchedFaqRaw?: string;
  bulkFaqMinimum4?: boolean;
  /** Legacy; REST excerpt uses meta when non-empty regardless of this flag. */
  writeMetaDescription?: boolean;
  writeExcerpt?: boolean;
  setProgress: (progress: { step: string; progress: number; message?: string }) => void;
  entity?: string; // Entity extracted from title/ACF origin field (e.g., "Edmonton, Alberta")
  faqQuestions?: string[]; // PAA questions for FAQ schema generation
  allowedExternalUrls?: string[]; // Pre-validated external URLs from AI Overview research (bypass sanitizer stripping)
  apiKey?: string; // OpenRouter API key for AI-driven question generation
  extraTextContent?: string; // Extra text content for pages (ACF field: seo_extra_text)
  extraImageBase64?: string; // Extra image base64 for pages (ACF field: seo_extra_image)
  /** Only merge `seo_extra_text` / `extra_text` in ACF; no FAQ, date, keyword, or other fields. */
  seoExtraTextFieldOnly?: boolean;
  /** Pre-built FAQ JSON-LD script from optimize FAQ bundle; skips PAA/template generation. */
  faqSchemaOverride?: string;
}

export interface WordPressUploaderResult {
  result: WordPressPostCreateResult | WordPressPostUpdateResult;
  postId: number;
  link: string;
  finalTitle: string;
}


/** ACF: overwrite only `seo_extra_text` / `extra_text`–style fields; leave all other keys unchanged. */
export function mergeAcfOnlyExtraText(
  existingAcf: Record<string, unknown> | undefined,
  extraTextHtml: string
): Record<string, unknown> {
  const acf: Record<string, unknown> = { ...(existingAcf && typeof existingAcf === "object" ? existingAcf : {}) };
  const keys = Object.keys(acf);
  const extraKeys = keys.filter((k) => {
    const l = k.toLowerCase();
    return l.includes("extra_text") && !l.includes("image");
  });
  if (extraKeys.length > 0) {
    for (const k of extraKeys) {
      acf[k] = extraTextHtml;
    }
  } else {
    acf["seo_extra_text"] = extraTextHtml;
  }
  return acf;
}

function reuseFullPostIfSamePost(
  snapshot: Record<string, unknown> | undefined,
  postId: number,
): Record<string, unknown> | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const sid = Number((snapshot as { id?: unknown }).id);
  if (!Number.isFinite(sid) || sid !== Number(postId)) return null;
  if (snapshot.acf && typeof snapshot.acf === "object") return snapshot;
  const { id, link, slug, ...rest } = snapshot as Record<string, unknown>;
  if (Object.keys(rest).length > 0) {
    return { id, link, slug, acf: rest };
  }
  return snapshot;
}

/** Inventory snapshot only — never hits WordPress for ACF discovery on upload. */
export function resolveFullPostForAcfUpdate(
  snapshot: Record<string, unknown> | undefined,
  postId: number,
): Record<string, unknown> | null {
  const reused = reuseFullPostIfSamePost(snapshot, postId);
  if (reused) return reused;
  if (snapshot?.acf && typeof snapshot.acf === "object") {
    return {
      id: postId,
      link: (snapshot as { link?: unknown }).link,
      slug: (snapshot as { slug?: unknown }).slug,
      acf: snapshot.acf,
    };
  }
  return null;
}

export function uploadNeedsAcfWrite(opts: {
  seoExtraTextFieldOnly: boolean;
  bulkFaqMinimum4: boolean;
  writeFocusKeywords: boolean;
  generateFaqSchema: boolean;
  writeMetaDescription: boolean;
  extraTextContent?: string;
  extraImageBase64?: string;
}): boolean {
  return (
    opts.seoExtraTextFieldOnly ||
    opts.bulkFaqMinimum4 ||
    opts.writeFocusKeywords ||
    opts.generateFaqSchema ||
    opts.writeMetaDescription ||
    Boolean(opts.extraTextContent?.trim()) ||
    Boolean(opts.extraImageBase64)
  );
}


function todayDateModifierIso(): string {
  return new Date().toISOString().split("T")[0];
}

/** Always stamp ACF date_modifier after Pulse/content optimizer writes (revision progress). */
export async function stampWordPressDateModifierAcf(
  site: WordPressSite,
  postId: number,
  postType: string,
  postTypeEndpoint: string,
): Promise<void> {
  if (!site.siteUrl?.trim() || !site.username?.trim() || !site.appPassword?.trim()) return;
  const todayDate = todayDateModifierIso();
  const dateFields = { date_modifier: todayDate, seo_date_modifier: todayDate };
  try {
    const acfResult = await updateACFFields(
      site.siteUrl,
      site.username,
      site.appPassword,
      postId,
      dateFields,
      postType,
      postTypeEndpoint,
    );
    if (acfResult.success) return;
    logger.warn(
      "[WordPress Uploader] date_modifier ACF stamp failed:",
      acfResult.error || acfResult.failed,
    );
    await updateWordPressPostMeta(
      site.siteUrl,
      site.username,
      site.appPassword,
      postId,
      postType,
      postTypeEndpoint,
      dateFields,
    );
  } catch (err) {
    logger.warn("[WordPress Uploader] date_modifier stamp error:", err);
  }
}


export function prepareWordPressUploadContent(args: {
  context: WordPressUploaderOptions["context"];
  excerpt: string;
  htmlContent: string;
  allowedExternalUrls?: string[];
  faqQuestions?: string[];
  entity?: string;
  primaryKeyword: string;
}): {
  plainTextExcerpt: string;
  excerptForRest: string;
  sanitizedHtmlContent: string;
  contentForUpdate: string;
  entityEndpoint: string;
  isPage: boolean;
} {
  const { context, excerpt, htmlContent, allowedExternalUrls, faqQuestions, entity, primaryKeyword } = args;
  const { site } = context;
  // CRITICAL: Excerpt must be plain text only - no HTML, no markdown, no headings/paragraphs (short meta-style)
  const plainTextExcerpt = excerpt
    ? excerpt
        .replace(/<[^>]*>/g, '') // Remove ALL HTML tags
        .replace(/^#+\s+/gm, '') // Remove markdown headings (##, ###)
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/\n+/g, ' ') // Single line
        .replace(/\s+/g, ' ')
        .trim()
    : excerpt;

  // Existing excerpt when we have no new meta string (e.g. empty generator output).
  const preservedExcerpt = (() => {
    const raw: unknown = context.existingPost?.excerpt;
    if (raw == null) return '';
    if (typeof raw === 'string') return raw;
    if (typeof raw === 'object' && 'rendered' in raw && typeof (raw as { rendered?: unknown }).rendered === 'string') {
      return (raw as { rendered: string }).rendered;
    }
    return String(raw);
  })();
  
  const excerptForRest =
    plainTextExcerpt?.trim() ? plainTextExcerpt.trim() : preservedExcerpt;

  
  // DEBUG: Log faqQuestions to trace if they're being passed

  // Use validated posts from context (already AI-filtered and HTTP-200 validated once per run in continue-optimization). Do NOT re-validate here to avoid "Validating 96 links" on every post.
  const postsForSanitizer = context.wordPressPosts ?? [];
  // Sanitize content before upload: placeholders, invalid internal links (only from validated list), non-Wikipedia external (pre-validated DFS links whitelisted)
    const sanitizedHtmlContent = wrapHarnessH2AnchorsForWordPressBlocks(
      sanitizeContentForUpload(htmlContent, site.siteUrl, postsForSanitizer, undefined, allowedExternalUrls),
    );
  
  // Validate content and log warnings (but don't block upload)
  const validation = validateContentForUpload(sanitizedHtmlContent);

// AGENTIC LOGIC: Use endpoint from RESOLVED post first (it tells us where the post actually exists)
  // Convert resolved.subtype to REST endpoint: 'post' -> 'posts', 'page' -> 'pages', others stay as-is
  const resolvedEndpoint = context.resolved?.subtype 
    ? (context.resolved.subtype === 'post' ? 'posts' 
      : context.resolved.subtype === 'page' ? 'pages' 
      : context.resolved.subtype)
    : null;
  
  // Extract entity endpoint from sitemap (for new posts or when resolved endpoint not available)
  const entityEndpointFromSitemap = context.site.entitySitemapUrl
    ? extractEndpointFromEntitySitemapUrl(context.site.entitySitemapUrl)
    : null;

  // Updates: trust the loaded post's REST base first (avoids wrong resolved.subtype vs CPT).
  // Create path: resolved > existing > entity sitemap > default.
  const entityEndpoint =
    context.updateMode === 'update' && context.existingPost?.postTypeEndpoint
      ? context.existingPost.postTypeEndpoint
      : resolvedEndpoint ||
        context.existingPost?.postTypeEndpoint ||
        entityEndpointFromSitemap ||
        'posts';

  const isPage = context.resolved?.subtype === 'page' || 
    context.resolved?.endpoint === 'pages' ||
    context.existingPost?.postTypeEndpoint === 'pages' ||
    entityEndpoint === 'pages';

  // Always use optimized content for update – overwrite existing. Never preserve old content for pages.
  const contentForUpdate = sanitizedHtmlContent;
  
  return { plainTextExcerpt, excerptForRest, sanitizedHtmlContent, contentForUpdate, entityEndpoint, isPage };
}

export async function resolveWordPressDraftSlug(args: {
  context: WordPressUploaderOptions["context"];
  draftTitle: string;
  primaryKeyword: string;
  entity?: string;
  apiKey?: string;
}): Promise<string | undefined> {
  const { context, draftTitle, primaryKeyword, entity, apiKey } = args;
    // Extract slug from URL
    let slug: string | undefined;
    if (context.url) {
      try {
        const urlObj = new URL(context.url);
        const pathname = urlObj.pathname.replace(/\/$/, ''); // Remove trailing slash
        const pathSegments = pathname.split('/').filter(s => s.length > 0);
        // Get the last path segment (the actual slug)
        if (pathSegments.length > 0) {
          slug = pathSegments[pathSegments.length - 1];
          // Remove any file extensions
          slug = slug.replace(/\.(html?|php)$/i, '');
        }
      } catch (error) {
        logger.warn(`[Optimize Content] Failed to parse URL for slug extraction: ${context.url}`, error);
        // If URL parsing fails, try manual extraction
        const parts = context.url.replace(/\/$/, '').split('/');
        const lastPart = parts[parts.length - 1]?.replace(/\.(html?|php)$/i, '');
        if (lastPart && !lastPart.includes('http')) {
          slug = lastPart;
        }
      }
    }

    // If we couldn't extract a valid slug from URL, use the resolved slug or existing post slug
    if (!slug && context.resolved?.slug) {
      slug = context.resolved.slug;
    } else if (!slug && context.existingPost?.slug) {
      slug = context.existingPost.slug;
    }

    // For NEW posts only: use short SEO slug when no slug yet or slug is title-like (very long).
    // Never change URL for existing posts (update path does not touch slug).
    if (!slug || slug.length > 50) {
      try {
        const seoSlug = await generateSEOSlug(draftTitle, primaryKeyword, entity, apiKey || loadApiKey());
        if (seoSlug && seoSlug.length >= 2) {
          slug = seoSlug;
        }
      } catch (err) {
        logger.warn('[Optimize Content] SEO slug generation failed, using existing slug or title-derived:', err);
      }
    }
  return slug;
}

export async function resolveWordPressDraftAuthor(args: {
  context: WordPressUploaderOptions["context"];
  site: WordPressSite;
  postTypeEndpoint: string;
}): Promise<number | undefined> {
  const { context, site, postTypeEndpoint } = args;
    // Extract author from existing post (preserve original author), or resolve via agentic author resolver for new posts
    const existingAuthor: unknown = context.existingPost?.author || context.existingPost?.author_id;
    let authorId: number | undefined =
      existingAuthor && typeof existingAuthor === 'object' && typeof (existingAuthor as { id?: unknown }).id === 'number'
        ? (existingAuthor as { id: number }).id
        : typeof existingAuthor === 'number'
          ? existingAuthor
          : typeof existingAuthor === 'string' && !isNaN(parseInt(existingAuthor))
            ? parseInt(existingAuthor)
            : undefined;

    if (authorId === undefined) {
      try {
        const resolved = await resolveRecommendedAuthor({
          site,
          postTypeEndpoint,
          apiKey: loadApiKey(),
          siteId: site.id,
        });
        if (resolved != null) authorId = resolved;
      } catch (err) {
        logger.warn('[WordPress Uploader] Author resolver failed, creating without explicit author:', err);
      }
    }
  return authorId;
}
