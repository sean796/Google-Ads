/**
 * WordPress Uploader Module
 * Handles WordPress post creation and updates using entity endpoint directly
 * NO service-area conditionals, NO normalization
 */

import { notify } from "@/lib/app-notifications";
import { updateWordPressPost, createWordPressPost, uploadWordPressMedia, updateWordPressPostMeta, type WordPressPostCreateResult, type WordPressPostUpdateResult } from "@/lib/wordpress-api";
import type {
  ResolvedTargetLike,
  WpExistingPostLike,
} from "@/hooks/content-optimization/use-optimization-state";
import { updateACFFields } from "@/lib/wordpress-acf-origin";
import type { WordPressSite } from "@/components/integrations/types";
import { extractEndpointFromEntitySitemapUrl } from "@/lib/entity-endpoint-extractor";
import { cleanTitleForNonEntity } from "@/lib/content-optimization-helpers";
import { sanitizeContentForUpload, validateContentForUpload, truncateTitleForSEO } from "@/lib/content-generation/content-sanitizer";
import { wrapHarnessH2AnchorsForWordPressBlocks } from "@/lib/content-generation/wordpress-harness-heading-anchors";
import { loadApiKey } from "@/lib/api";
import { markdownToHtml } from "@/lib/markdown-to-html";
import { extraTextToUploadHtml } from "@/lib/content-generation/extra-text-heading-contract";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { stripBracketPlaceholders, stripLeadingP } from "@/lib/gsc-simple-keyword-recommendation";
import { generateOptimizedTitle } from "@/lib/title-optimizer";
import { generateSEOSlug } from "@/lib/seo-slug-generator";
import { resolveRecommendedAuthor } from "@/lib/wordpress-api/author-resolver";
import { parseFaqEntries, type FaqEntry } from "@/lib/faq-entries";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";

/** ACF: overwrite only `seo_extra_text` / `extra_text`–style fields; leave all other keys unchanged. */
function mergeAcfOnlyExtraText(
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

/**
 * When no primary keyword is available, infer one from title, meta, and PROMPT MODIFIER using Open Router.
 * The PROMPT MODIFIER (when present) is the source of truth; keyword is derived from it.
 */
async function inferKeywordForKeywordFocus(
  title: string,
  excerpt: string | undefined,
  url: string,
  siteId: string,
  metaDescription?: string,
  promptModifier?: string
): Promise<string> {
  const cleanTitle = (title || "").replace(/<[^>]+>/g, "").trim();
  const excerptText = (excerpt || "").replace(/<[^>]+>/g, "").trim().substring(0, 300);
  const metaText = (metaDescription || excerptText || "").trim().substring(0, 300);
  const modifierText = (promptModifier || "").trim().substring(0, 500);
  if (!cleanTitle && !metaText && !modifierText) return "";

  try {
    const openRouterApiKey = loadApiKey();
    if (!openRouterApiKey?.trim()) return "";

    const researchModel = getResearchModel(siteId);
    const parts: string[] = [];
    if (modifierText) parts.push(`PROMPT MODIFIER (read first - defines what to prioritize): "${modifierText}"`);
    parts.push(`Page Title: "${cleanTitle || "(none)"}"`, `Page URL: "${url}"`);
    if (metaText) parts.push(`Meta description (use as context for the page topic): "${metaText}"`);

    const response = await postOpenRouterAppChatFetch( {
      method: "POST",
      headers: openRouterWebAppHeaders(openRouterApiKey),
      body: JSON.stringify({
        model: researchModel,
        messages: [
          {
            role: "user",
            content: `The PROMPT MODIFIER (when provided above) is the SOURCE OF TRUTH for what this company/site specializes in. Your keyword MUST be derived from and consistent with it.

${parts.join("\n")}

RULES:
- If a PROMPT MODIFIER is provided above, it is the SOURCE OF TRUTH. Derive the primary keyword from it. IGNORE the page title, FAQ, or any other page content that suggests a different topic. The modifier overrides everything.
- If no PROMPT MODIFIER is provided, use the meta description as the primary signal for the site's business, then the title. The keyword must reflect what the modifier or meta says the company does.
- Return a 2-5 word keyword phrase that matches the source of truth (modifier first, then meta).

Return ONLY the keyword phrase, nothing else. No quotes, no explanation.`,
          },
        ],
        temperature: 0.3,
        max_tokens: 30,
      }),
    });

    if (!response.ok) return "";

    const data = await response.json();
    const aiKeyword = (data.choices?.[0]?.message?.content ?? "").trim();
    if (!aiKeyword || aiKeyword.length < 2) return "";

    const cleaned = aiKeyword.replace(/^["']|["']$/g, "").trim().substring(0, 80);
    return cleaned.length >= 3 ? cleaned : "";
  } catch (error) {
    console.warn("[WordPress Uploader] Failed to infer keyword for keyword_focus:", error);
    return "";
  }
}



/**
 * FAQ JSON-LD script from explicit Q/A pairs. Only entries with a real stored
 * answer are emitted. Returns "" when no entry has a real answer, so callers
 * omit FAQPage schema instead of publishing invented answers.
 */
export function buildFAQSchemaScriptFromEntries(
  entries: FaqEntry[],
  _primaryKeyword: string,
  _entity: string | undefined,
  _siteUrl: string,
  _napLocations?: Array<{ city: string; state: string }>
): string {
  const faqItems = entries
    .map((entry) => {
      const cleanQuestion = String(entry.question || "").trim();
      const answerText = String(entry.answer || "").trim();
      if (!cleanQuestion || !answerText) return null;
      return {
        "@type": "Question",
        name: cleanQuestion,
        acceptedAnswer: {
          "@type": "Answer",
          text: answerText,
        },
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (!faqItems.length) return "";

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems,
  };
  const jsonString = JSON.stringify(faqSchema);
  return `<script type="application/ld+json">${jsonString}</script>`;
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
function resolveFullPostForAcfUpdate(
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

function uploadNeedsAcfWrite(opts: {
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
async function stampWordPressDateModifierAcf(
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
    console.warn(
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
    console.warn("[WordPress Uploader] date_modifier stamp error:", err);
  }
}

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

  console.log('[WordPress Uploader] Excerpt being uploaded:', {
    hasExcerpt: !!excerpt,
    excerptLength: excerpt?.length || 0,
    plainTextLength: plainTextExcerpt?.length || 0,
    excerptPreview: excerptForRest?.substring(0, 100) || 'N/A',
    hadHTML: excerpt !== plainTextExcerpt,
    usingGeneratedMeta: !!plainTextExcerpt?.trim(),
  });
  
  // DEBUG: Log faqQuestions to trace if they're being passed
  console.log('[WordPress Uploader] FAQ Questions received:', {
    hasFaqQuestions: !!faqQuestions,
    faqQuestionsLength: faqQuestions?.length || 0,
    faqQuestionsPreview: faqQuestions?.slice(0, 2) || [],
    entity,
    primaryKeyword
  });

  // Use validated posts from context (already AI-filtered and HTTP-200 validated once per run in continue-optimization). Do NOT re-validate here to avoid "Validating 96 links" on every post.
  const postsForSanitizer = context.wordPressPosts ?? [];
  // Sanitize content before upload: placeholders, invalid internal links (only from validated list), non-Wikipedia external (pre-validated DFS links whitelisted)
    const sanitizedHtmlContent = wrapHarnessH2AnchorsForWordPressBlocks(
      sanitizeContentForUpload(htmlContent, site.siteUrl, postsForSanitizer, undefined, allowedExternalUrls),
    );
  
  // Validate content and log warnings (but don't block upload)
  const validation = validateContentForUpload(sanitizedHtmlContent);
  if (validation.warnings.length > 0) {
    console.warn('[WordPress Uploader] Content validation warnings:', validation.warnings);
  }
  
  console.log('[WordPress Uploader] Content sanitization applied:', {
    originalLength: htmlContent.length,
    sanitizedLength: sanitizedHtmlContent.length,
    bytesRemoved: htmlContent.length - sanitizedHtmlContent.length,
    validationWarnings: validation.warnings.length
  });

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
  
  console.log('[WordPress Uploader] Entity endpoint extracted (AGENTIC):', {
    entitySitemapUrl: context.site.entitySitemapUrl,
    resolvedSubtype: context.resolved?.subtype,
    resolvedEndpoint,
    extractedEndpoint: entityEndpoint,
    fallbackFromExistingPost: context.existingPost?.postTypeEndpoint,
    priority:
      context.updateMode === 'update' && context.existingPost?.postTypeEndpoint
        ? 'existingPost(updateFirst)'
        : resolvedEndpoint
          ? 'resolved'
          : context.existingPost?.postTypeEndpoint
            ? 'existingPost'
            : entityEndpointFromSitemap
              ? 'sitemap'
              : 'default',
  });

  
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
        const fullPostForAcf = resolveFullPostForAcfUpdate(context.acfFullPostSnapshot, result.postId);
        if (!fullPostForAcf) {
          throw new Error(
            `Missing inventory ACF snapshot for post ${result.postId}. Reload inventory and retry.`,
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
              result.postId,
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

        let faqSchema = '';
        let skipFaqWrites = false;
        const runFaqBlock =
          generateFaqSchema || bulkFaqMinimum4 || Boolean(faqSchemaOverrideTrimmed);

        if (runFaqBlock) {
          if (faqSchemaOverrideTrimmed) {
            faqSchema = faqSchemaOverrideTrimmed;
            setProgress({
              step: 'Applying FAQ Schema...',
              progress: 93,
              message: 'Writing optimized FAQ schema to ACF...',
            });
          } else {
          setProgress({
            step: 'Creating FAQ Schema...',
            progress: 93,
            message: bulkFaqMinimum4
              ? 'Checking stored FAQ answers...'
              : 'Building FAQ schema from stored answers...',
          });

          try {
            if (bulkFaqMinimum4) {
              const existingEntries = parseFaqEntries(prefetchedFaqRaw);
              if (existingEntries.length >= 4) {
                faqSchema = '';
                skipFaqWrites = true;
                console.log('[WordPress Uploader] Bulk FAQ minimum: existing FAQ count >= 4; leaving ACF FAQ unchanged.');
              } else {
                faqSchema = buildFAQSchemaScriptFromEntries(existingEntries, primaryKeyword, entity, site.siteUrl, napLocations);
                if (faqSchema) {
                  console.log(`[WordPress Uploader] Bulk FAQ: schema built from stored FAQ answers only; no answers invented to reach 4.`);
                } else {
                  setProgress({ step: 'Creating FAQ Schema...', progress: 93, message: 'FAQ schema omitted: no stored FAQ answers for this post.' });
                  console.warn('[WordPress Uploader] FAQ schema omitted: no stored FAQ answers.');
                }
              }
            } else if (generateFaqSchema) {
              const storedEntries = parseFaqEntries(prefetchedFaqRaw);
              faqSchema = buildFAQSchemaScriptFromEntries(storedEntries, primaryKeyword, entity, site.siteUrl, napLocations);
              if (faqSchema) {
                console.log(`[WordPress Uploader] FAQ schema built from ${storedEntries.length} stored FAQ answer(s)`);
              } else {
                setProgress({ step: 'Creating FAQ Schema...', progress: 93, message: 'FAQ schema omitted: no stored FAQ answers for this post.' });
                console.warn('[WordPress Uploader] FAQ schema omitted: no stored FAQ answers.');
              }
            }
          } catch (faqError) {
            console.warn('[WordPress Uploader] Failed to generate FAQ schema:', faqError);
          }
          }
        }

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
          result.postId,
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
            await updateWordPressPostMeta(site.siteUrl, site.username, site.appPassword, result.postId, context.existingPost?.post_type || 'post', postTypeEndpoint, metaUpdates);
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
  } else {
    // Title optimization is disabled (content-only module).
    // Preserve the existing WordPress title without modification.
    const draftTitle = existingTitle;
    finalTitle = draftTitle;

    // Use entityEndpoint directly - NO normalization
    const postTypeEndpoint = entityEndpoint;

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
          console.log(`[Optimize Content] Extracted slug from URL: "${slug}" (from: ${context.url})`);
        }
      } catch (error) {
        console.warn(`[Optimize Content] Failed to parse URL for slug extraction: ${context.url}`, error);
        // If URL parsing fails, try manual extraction
        const parts = context.url.replace(/\/$/, '').split('/');
        const lastPart = parts[parts.length - 1]?.replace(/\.(html?|php)$/i, '');
        if (lastPart && !lastPart.includes('http')) {
          slug = lastPart;
          console.log(`[Optimize Content] Manually extracted slug: "${slug}"`);
        }
      }
    }

    // If we couldn't extract a valid slug from URL, use the resolved slug or existing post slug
    if (!slug && context.resolved?.slug) {
      slug = context.resolved.slug;
      console.log(`[Optimize Content] Using resolved slug: "${slug}"`);
    } else if (!slug && context.existingPost?.slug) {
      slug = context.existingPost.slug;
      console.log(`[Optimize Content] Using existing post slug: "${slug}"`);
    }

    // For NEW posts only: use short SEO slug when no slug yet or slug is title-like (very long).
    // Never change URL for existing posts (update path does not touch slug).
    if (!slug || slug.length > 50) {
      try {
        const seoSlug = await generateSEOSlug(draftTitle, primaryKeyword, entity, apiKey || loadApiKey());
        if (seoSlug && seoSlug.length >= 2) {
          slug = seoSlug;
          console.log(`[Optimize Content] Using SEO slug for new post: "${slug}"`);
        }
      } catch (err) {
        console.warn('[Optimize Content] SEO slug generation failed, using existing slug or title-derived:', err);
      }
    }

    console.log('[Optimize Content] Creating draft:', {
      postTypeEndpoint: postTypeEndpoint,
      resolvedSubtype: context.resolved?.subtype,
      existingPostEndpoint: context.existingPost?.postTypeEndpoint,
      slug: slug,
      url: context.url
    });
setProgress({ step: 'Creating draft...', progress: 92, message: `Creating new draft: "${draftTitle}" in ${postTypeEndpoint} endpoint...` });

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
        console.warn('[WordPress Uploader] Author resolver failed, creating without explicit author:', err);
      }
    }

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
    if (result.success && result.postId) {
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
        const fullPostForAcfDraft = resolveFullPostForAcfUpdate(context.acfFullPostSnapshot, result.postId);
        if (!fullPostForAcfDraft) {
          throw new Error(
            `Missing inventory ACF snapshot for draft ${result.postId}. Reload inventory and retry.`,
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
              result.postId!,
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

        let faqSchemaDraft = '';
        let skipFaqWritesDraft = false;
        const runFaqBlockDraft =
          generateFaqSchema || bulkFaqMinimum4 || Boolean(faqSchemaOverrideTrimmed);

        if (runFaqBlockDraft) {
          if (faqSchemaOverrideTrimmed) {
            faqSchemaDraft = faqSchemaOverrideTrimmed;
            setProgress({
              step: 'Applying FAQ Schema...',
              progress: 93,
              message: 'Writing optimized FAQ schema to ACF...',
            });
          } else {
          setProgress({
            step: 'Creating FAQ Schema...',
            progress: 93,
            message: bulkFaqMinimum4 ? 'Checking stored FAQ answers...' : 'Building FAQ schema from stored answers...',
          });
          try {
            if (bulkFaqMinimum4) {
              const existingEntries = parseFaqEntries(prefetchedFaqRaw);
              if (existingEntries.length >= 4) {
                faqSchemaDraft = '';
                skipFaqWritesDraft = true;
              } else {
                faqSchemaDraft = buildFAQSchemaScriptFromEntries(existingEntries, primaryKeyword, entity, site.siteUrl, napLocationsDraft);
                if (!faqSchemaDraft) {
                  setProgress({ step: 'Creating FAQ Schema...', progress: 93, message: 'FAQ schema omitted: no stored FAQ answers for this post.' });
                }
              }
            } else if (generateFaqSchema) {
              const storedEntries = parseFaqEntries(prefetchedFaqRaw);
              faqSchemaDraft = buildFAQSchemaScriptFromEntries(storedEntries, primaryKeyword, entity, site.siteUrl, napLocationsDraft);
              if (!faqSchemaDraft) {
                setProgress({ step: 'Creating FAQ Schema...', progress: 93, message: 'FAQ schema omitted: no stored FAQ answers for this post.' });
              }
            }
          } catch {
            // FAQ schema omitted on failure; never invent answers.
          }
          }
        }

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
          result.postId,
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
            await updateWordPressPostMeta(site.siteUrl, site.username, site.appPassword, result.postId, postType, postTypeEndpoint, metaUpdatesDraft);
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

