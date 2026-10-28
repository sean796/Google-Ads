/**
 * Content Generator Module
 * Handles markdown content generation, in-content images, and HTML conversion
 */

import { notify } from "@/lib/app-notifications";
import { NOTIFY_CONTENT_GENERATED, NOTIFY_GENERATING_CONTENT, NOTIFY_GENERATING_IN_CONTENT_IMAGE, NOTIFY_HTML_READY_TO_UPLOAD, NOTIFY_IMAGE_GENERATED_BUT_MAY_NOT_HAVE_BEEN_IN, NOTIFY_IN_CONTENT_IMAGE_WAS_NOT_PRESERVED_DURIN, notifyInContentImageGeneratedAndInserted, notifyInContentImageGenerationFailedXCon } from "@/lib/notify-messages";
import { getMuteOptimizationToasts } from "@/hooks/content-optimization/optimization-toast-mute";
import { loadApiKey } from "@/lib/api";
import { markdownToHtml, generateExcerpt } from "@/lib/markdown-to-html";
import { htmlToMarkdown } from "@/lib/wordpress-converter";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { progressWithGeneratedFiles } from "@/hooks/content-optimization/optimization-helpers";
import {
  generateInContentImage,
  generateInContentImageFromHtml,
} from "@/lib/in-content-image-generator";
import { insertContentIntoSection } from "@/lib/section-parser";
import type { ImageType } from "@/lib/image-section-analyzer";
import type { WordPressSite } from "@/components/integrations/types";
import { getBlogModel, getProductionModel, getResearchModel } from "@/lib/optimization-settings-storage";
import { appendMasterInstructionsToSystemPrompt, ensureMasterInstructionsInMemory } from "@/lib/master-instructions-storage";
import { extractMediaFromContent } from "@/lib/content-optimization-helpers";
import { readACFFieldsAgentically, type AIDrivenACFContext } from "@/lib/content-generation/ai-driven-acf-reader";
import type { BulkHarnessSectionPayload, BulkProcessingOptions } from "@/lib/bulk-auto-generate";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import type { KeywordData } from "@/lib/keyword-types";
import { buildFocusedArticlePurpose } from "@/lib/content-generation/article-length-policy";
import { isGeneratedContentHtml } from "@/lib/content-generation/content-format";
import { postOpenRouterAppChat } from "@/lib/openrouter-app-api";
import { llmAuditSummaryFromSeoResearchBrief } from "@/lib/content-optimization/seo-research-brief-for-optimize";

/**
 * AI-driven function to generate a SEO-optimized meta description
 * Creates a fresh, agentic meta description from WordPress content or keyword+title context.
 * The exact page title (when provided) should be naturally front-loaded at the beginning
 * of the meta description, as part of a fluent sentence (no quotes, no label).
 */
export async function generateMetaDescription(
  markdownContent: string, // This can be WordPress content OR minimal context (keyword + title)
  primaryKeyword: string,
  apiKey: string,
  siteId?: string,
  pageTitle?: string,
  isPage?: boolean
): Promise<string> {
  try {
    // CRITICAL: Meta description is INDEPENDENT - but can use WordPress content as context if available
    // Extract text content - remove HTML and markdown formatting
    let textContent = markdownContent
      .replace(/<[^>]*>/g, '') // Remove ALL HTML tags
      .replace(/^#+\s+/gm, '') // Remove headers
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`[^`]+`/g, '') // Remove inline code
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Convert links to text
      .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '') // Remove images
      .replace(/\*\*([^\*]+)\*\*/g, '$1') // Remove bold
      .replace(/\*([^\*]+)\*/g, '$1') // Remove italic
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .substring(0, 3000); // Use up to 3000 chars if WordPress content is available

    const blogModel = getBlogModel(siteId);

    await ensureMasterInstructionsInMemory(siteId);

    const metaSystemBase = `You are an expert SEO meta description writer. Write ONLY concise meta descriptions for Google search results.

🔥 CRITICAL: This is a SEPARATE META DESCRIPTION for SEO, NOT an excerpt from the blog content, NOT a paragraph from the post, NOT a summary of the article.

You MUST create a BRAND NEW, FRESH meta description that is:
- Written specifically for Google search results (SERP)
- Optimized for click-through rate (CTR)
- Completely independent from the blog content

ABSOLUTE REQUIREMENTS:
- EXACTLY 120-150 characters (count them - this is CRITICAL for SERP display)
- ONE sentence or two short sentences maximum
${isPage ? `- Naturally FRONT-LOAD the exact page title at the very beginning of the description, woven into a fluent sentence (for example: "Emergency Plumbing Repair Edmonton – fast, reliable help when you need it most.")
- Do NOT wrap the title in quotes and do NOT repeat it multiple times` : `- Start with a direct question or hook ("Looking for...?", "Need...?", "Searching for...?") or a compelling benefit statement
- Do NOT use the page title in the description - generate a completely independent meta description`}
- Include key service/benefit (GENERIC service terms, NOT business names)
- End with a clear call to action ("Learn more", "Discover", "Find out", "Get started")
- Plain text ONLY - NO HTML, NO <p> or <h2>, NO markdown (no ## or **), NO line breaks - one short line like a meta description
- Conversational, punchy, attention-grabbing
- Optimized for SERP - this appears in Google search results, make it compelling!

ABSOLUTE FORBIDDEN:
- NO copying text from the content - create something COMPLETELY NEW
- NO "Introduction" or any variation
- NO HTML tags (<p>, <h2>, <div>, &hellip;, etc.) and NO markdown (no ## headings, no **bold**) - PLAIN TEXT ONLY, one line
- NO generic openings ("This article", "In this guide", "Many residents", etc.)
- NO full paragraphs - this is a META DESCRIPTION, not blog content
- NO quotes around text
- NO labels ("Excerpt:", "Meta description:", "Description:", etc.)
- NO company names or competitor names - use GENERIC service terms only
- NO location + business name combinations
- NO ellipsis or truncation indicators (... or &hellip;)
${isPage ? `
Example (with title naturally front-loaded):
Emergency Plumbing Repair Edmonton – fast, reliable help for burst pipes, leaks, and drain emergencies. Call now to get same-day service.` : `
Example:
Looking for expert window treatment solutions? Discover durable, moisture-resistant coverings perfect for humid climates. Get started today.`}

Your output MUST be 120-150 characters. Count them. This is a SEPARATE META DESCRIPTION for Google SERP, NOT a content excerpt. Create something FRESH and NEW, don't copy from the content.${isPage ? ' Always begin by naturally weaving in the exact page title at the start of the sentence (no quotes, no labels).' : ' Do NOT include the page title in the meta description.'}`;

    const { content: excerptRaw } = await postOpenRouterAppChat({
      apiKey,
      model: blogModel,
      messages: [
          {
            role: "system",
            content: appendMasterInstructionsToSystemPrompt(metaSystemBase, siteId),
          },
          {
            role: "user",
            content: `Write a SEPARATE, AGENTIC META DESCRIPTION (120-150 characters) for this blog.

PAGE TITLE: "${pageTitle || primaryKeyword}"
PRIMARY KEYWORD: "${primaryKeyword}"

🔥 CRITICAL: This is a COMPLETELY INDEPENDENT meta description for Google SERP.
- It is NOT an excerpt from blog content
- It is NOT a paragraph from the post
- It is NOT a summary of the article
- It is a FRESH, NEW meta description written specifically for SEO

You MUST:
- Create a BRAND NEW meta description - do NOT copy text from the content below
- Write it specifically for Google search results (SERP optimization)
- Use GENERIC service terms (e.g., "dental care", "family dentistry", "dental services")
- NEVER include business names, company names, or competitor names
- Focus on the SERVICE/BENEFIT, not the business
- Make it compelling for click-through in search results
- Use the content below ONLY as context to understand the topic - create something NEW
${isPage ? `
FRONT-LOAD TITLE NATURALLY:
- Start the description by naturally incorporating the exact PAGE TITLE at the very beginning of the sentence (no quotes, no "Title:" label)
- Example pattern: "Emergency Plumbing Repair Edmonton – fast, reliable help when you need it most. Call today for same-day service."
- Do NOT start with a question hook like "Looking for...?" or "Need...?" if it would push the title away from the beginning` : `
DO NOT USE THE TITLE:
- Do NOT include the page title in the meta description
- Start with a direct question hook ("Looking for...?", "Need...?") or a compelling benefit statement
- The meta description must be completely independent of the title`}

WordPress content (for context only - create a NEW meta description, don't copy):
${textContent.substring(0, 3000)}

Write ONLY the meta description (120-150 characters). Output a single line of plain text: no HTML, no markdown, no headings (no ##), no paragraph breaks - just one short engaging sentence like a meta description. Include a call to action. NO business names. Completely independent from content:`
          }
        ],
      temperature: 0.7,
      maxTokens: 2048,
    });

    let excerpt = excerptRaw.trim();
    
    // CRITICAL: Remove ALL HTML tags and entities (AI should not output these, but aggressive cleanup)
    excerpt = excerpt
      .replace(/<[^>]*>/g, '') // Remove ALL HTML tags
      .replace(/&hellip;/g, '') // Remove HTML ellipsis entity
      .replace(/&nbsp;/g, ' ') // Replace non-breaking space
      .replace(/&[a-z]+;/gi, '') // Remove any other HTML entities
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // CRITICAL: Strip any markdown so excerpt is plain text only (no h2, no paragraphs)
    excerpt = excerpt
      .replace(/^#+\s+/gm, '') // Remove markdown headings (##, ###)
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
      .replace(/\*([^*]+)\*/g, '$1') // Remove italic
      .replace(/\n+/g, ' ') // Collapse newlines to one line
      .replace(/\s+/g, ' ')
      .trim();
    
    // Remove quotes, labels, prefixes
    excerpt = excerpt
      .replace(/^["']|["']$/g, '')
      .replace(/^(Excerpt|Meta description|Description|Meta Description):\s*/i, '')
      .replace(/^Introduction:\s*/i, '')
      .replace(/^Many residents/i, '') // Remove common content openings
      .replace(/^This article/i, '')
      .replace(/^In this guide/i, '')
      .trim();
    
    // Final aggressive cleanup - remove any remaining HTML-like patterns
    if (excerpt.includes('<') || excerpt.includes('&')) {
      console.warn('[Content Generator] ⚠️ Meta description still contains HTML-like content, cleaning aggressively');
      excerpt = excerpt.replace(/[<>&]/g, '').trim();
    }
    
    // SEO-pragmatic: use 50–160 chars. Google shows variable lengths; don't fail the flow for a short description.
    if (!excerpt || excerpt.length < 50) {
      excerpt = `${primaryKeyword.trim()} | Learn more.`;
      if (excerpt.length > 160) excerpt = excerpt.substring(0, 157) + '...';
    }
    if (excerpt.length > 160) {
      const truncated = excerpt.substring(0, 157);
      const lastSpace = truncated.lastIndexOf(' ');
      excerpt = lastSpace > 50 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
    }
    
    // CRITICAL: Final check - ensure NO HTML or content excerpt patterns
    if (excerpt.includes('<') || excerpt.includes('&') || excerpt.toLowerCase().includes('many residents') || excerpt.toLowerCase().startsWith('introduction')) {
      console.warn('[Content Generator] Meta description contains HTML or content excerpt patterns, sanitizing:', excerpt);
      excerpt = excerpt.replace(/[<>&]/g, '').trim();
      if (excerpt.toLowerCase().startsWith('introduction')) {
        excerpt = excerpt.replace(/^introduction\s*/i, '').trim();
      }
    }
    
    console.log(`[Content Generator] ✅ AI-generated FRESH agentic meta description (${excerpt.length} chars):`, excerpt);
    return excerpt;
  } catch (error) {
    console.warn('[Content Generator] Failed to generate AI excerpt:', error);
    throw error;
  }
}

export interface ContentGeneratorOptions {
  blueprintResult: any;
  existingTitle: string;
  primaryKeyword: string;
  site: WordPressSite;
  context: {
    wordPressRAGContext?: string;
    wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>;
    url: string;
    existingContent: string;
    inContentImageRequest?: { imageType: ImageType; userPrompt?: string };
    acfFields?: Record<string, any>;
    acfContext?: AIDrivenACFContext; // When present, use for prompt (no reader call)
    isPage?: boolean;
    /** Real Search Console queries JSON - model picks 10–20 and spreads across sections */
    gscKeywordsContext?: string;
    /** Semrush keyword lists JSON (url_organic + phrase_related) for RAG. */
    semrushKeywordsContext?: string;
    /** Semrush clusters + scatter zones JSON (bulk content run). */
    semrushScatterContext?: string;
    /** Semrush-approved external URLs - prompts + upload sanitizer allowlist. */
    semrushExternalUrls?: string[];
    /** Other managed client domains - never link in prose (mirrors Semrush server filter). */
    portfolioBlockedHosts?: string[];
    /** LLM audit facts for harness (optimizer). */
    llmAuditSummary?: string;
    firstPartyAuthorityBlock?: string;
    llmAuditAuthorityExternalPairs?: import("@/lib/content-generation/external-link-placeholders").ExternalLinkPair[];
    linkTargetsPlan?: import("@/lib/bulk/bulk-generation-wp-inventory").LinkTargetsPlan;
  };
  fileManager: OptimizationFileManager;
  setProgress: (progress: { step: string; progress: number; message?: string; generatedFiles?: ReturnType<OptimizationFileManager["getFiles"]> }) => void;
  onContentChunk?: (chunk: string) => void;
  shouldOptimizeContent: boolean;
  hasEntityOverride?: boolean; // Manual override: true = force entity mode, false = force no entity, undefined = auto-detect
  /** When true, skip parallel meta generation (content-only / optimize-meta off). */
  skipMetaDescriptionGeneration?: boolean;
  /** Harness section lifecycle (same payload shape as bulk SAP/post gen). */
  onHarnessSection?: (payload: BulkHarnessSectionPayload) => void;
}

export interface ContentGeneratorResult {
  markdownContent: string;
  htmlContent: string;
  excerpt: string;
  /** Original image/video URLs from the post (upload sanitizer allowlist only). */
  preservedMediaUrls?: string[];
}

export async function generateOptimizedContent(
  options: ContentGeneratorOptions
): Promise<ContentGeneratorResult> {
  const {
    blueprintResult,
    existingTitle,
    primaryKeyword,
    site,
    context,
    fileManager,
    setProgress,
    onContentChunk,
    shouldOptimizeContent,
    hasEntityOverride,
    skipMetaDescriptionGeneration,
    onHarnessSection,
  } = options;

  // Extract entity from blueprint result (if present)
  // Entity is stored in blueprintResult.entity when blueprint is generated
  // If entity is "N/A" or undefined, this is a regular blog post
  // 
  // MANUAL OVERRIDE LOGIC:
  // - hasEntityOverride === true: Force entity mode (use blueprintResult.entity or title as entity)
  // - hasEntityOverride === false: Force no entity mode (treat as regular blog post)
  // - hasEntityOverride === undefined: Auto-detect from blueprintResult.entity
  let entity: string | undefined;
  
  if (hasEntityOverride === false) {
    // User explicitly disabled entity mode - treat as regular blog post
    entity = undefined;
    console.log('[Content Generator] Entity mode manually DISABLED by user');
  } else if (hasEntityOverride === true) {
    // User explicitly enabled entity mode - use blueprint entity or extract from title
    entity = blueprintResult.entity && blueprintResult.entity !== "N/A" 
      ? blueprintResult.entity 
      : existingTitle || primaryKeyword; // Fallback to title/keyword as entity
    console.log('[Content Generator] Entity mode manually ENABLED by user, entity:', entity);
  } else {
    // Auto-detect from blueprint
    entity = blueprintResult.entity && blueprintResult.entity !== "N/A" 
      ? blueprintResult.entity 
      : undefined;
    console.log('[Content Generator] Entity mode AUTO-DETECTED:', entity ? `"${entity}"` : 'No entity');
  }

  // === CONTENT OPTIMIZER MODULE: CONTENT GENERATION SPECIFICATION ===
  // This module will generate blog content using the following inputs:
  //
  // KEYWORD:
  //   - PRIMARY KEYWORD: "${primaryKeyword}"
  //   - Will be used as the main SEO target throughout the content
  //   - Will be naturally integrated using semantic variations (95% of mentions)
  //   - Exact match will be limited to 1-2 instances maximum
  //   - Will drive anchor text for internal links
  //
  // TITLE:
  //   - BLUEPRINT TITLE: "${blueprintResult.title || 'N/A'}"
  //   - EXISTING TITLE: "${existingTitle || 'N/A'}"
  //   - FINAL TITLE: Will use blueprint title if available, otherwise existing title, otherwise keyword
  //   - Will be used to structure the article and inform content context
  //   - NO H1 heading will be generated - title is set separately in WordPress
  //
  // ENTITY:
  //   - ENTITY STATUS: ${entity ? `LOCAL/ENTITY-BASED POST for "${entity.trim()}"` : 'REGULAR BLOG POST (NO ENTITY)'}
  //   - ${entity ? `Will use entity "${entity.trim()}" for local optimization and location context` : 'Will generate general informational content with NO location mentions'}
  //   - ${entity ? `Will integrate geographic variations: exact location (2-3x max), broader terms frequently` : 'Will NOT mention any specific locations, cities, or entities'}
  //   - ${entity ? `Will use VARIED PHRASES for entity references (e.g., "near ${entity.trim()}", "residents living by ${entity.trim()}", "the ${entity.trim()} community") instead of repeating "for ${entity.trim()}" or "in ${entity.trim()}"` : 'Will focus on general information applicable broadly'}
  //   - ${entity ? `Will include local expertise examples using varied phrasing to reference "${entity.trim()}" naturally` : 'Will focus on general information applicable broadly'}
  //   - ABSOLUTELY FORBIDDEN: ${entity ? `NEVER use placeholders - always use actual entity: "${entity.trim()}"` : 'NEVER use placeholders like [city], [location], or ANY bracket notation'}
  //
  // PROMPT SELECTION:
  //   - ${entity ? `Using ENTITY-BASED prompt: Local SEO optimization with location context` : 'Using REGULAR BLOG POST prompt: General informational content, no location targeting'}
  // === END CONTENT OPTIMIZER SPECIFICATION ===

  console.log('[Content Generator] CONTENT OPTIMIZER MODULE - Content Generation Specification:', {
    primaryKeyword,
    blueprintTitle: blueprintResult.title || 'N/A',
    existingTitle: existingTitle || 'N/A',
    finalTitle: blueprintResult.title || existingTitle || primaryKeyword,
    hasEntity: !!entity,
    entity: entity || 'N/A (regular blog post)',
    promptType: entity ? 'ENTITY-BASED (local SEO)' : 'REGULAR BLOG POST (general informational)',
    blueprintHasEntity: !!blueprintResult.entity
  });

  // Load API key
  const openRouterApiKey = loadApiKey();
  if (!openRouterApiKey || openRouterApiKey.trim().length === 0) {
    throw new Error('OpenRouter API key not found. Please set it in settings.');
  }

  const skipMeta = skipMetaDescriptionGeneration === true;

  // Meta uses keyword + title only — skip when content-only / meta optimization off
  const metaContextEarly = `Blog post title: "${existingTitle || primaryKeyword}". Primary keyword: "${primaryKeyword}".`;
  const metaPromise = skipMeta
    ? Promise.resolve('')
    : generateMetaDescription(
        metaContextEarly,
        primaryKeyword,
        openRouterApiKey,
        site.id,
        existingTitle || primaryKeyword,
        context.isPage
      );

  let markdownContent = '';

  try {
  // CRITICAL: Only generate content if optimizeContent is explicitly enabled
  // Defensive check - log if content generation is being skipped
  if (!shouldOptimizeContent) {
    console.log('[Content Generator] ⚠️ CONTENT GENERATION SKIPPED - shouldOptimizeContent is false', {
      shouldOptimizeContent,
      reason: 'User unchecked Content optimization option'
    });
    // Return existing content without modification - this should never happen as the caller should check first
    // But we include it as a defensive measure
    markdownContent = context.existingContent || '';
  } else {
    void onContentChunk;
    console.log('[Content Generator] ✅ Content generation ENABLED - proceeding with harness generation');
    if (!getMuteOptimizationToasts()) notify.info(NOTIFY_GENERATING_CONTENT);
    setProgress({ step: 'Generating optimized content...', progress: 80, message: 'Blueprint sections (harness)...' });

    const MAX_KB_CHARS = 18_000;
    let knowledgeBaseContext = '';
    if (context.wordPressRAGContext && context.wordPressRAGContext.trim().length > 0) {
      const rag = context.wordPressRAGContext.trim();
      const capped =
        rag.length > MAX_KB_CHARS
          ? rag.slice(0, MAX_KB_CHARS) +
            "\n\n[Content truncated for token limit. Use for topics, tone, and internal link context only.]"
          : rag;
      knowledgeBaseContext = `=== WORDPRESS CONTENT FOR REFERENCE ===\n${capped}\n=== END WORDPRESS CONTENT ===\n`;
    }

    let acfContext = context.acfContext;
    if (!acfContext && context.acfFields && Object.keys(context.acfFields).length > 0) {
      acfContext = await readACFFieldsAgentically(context.acfFields, {
        apiKey: openRouterApiKey,
        siteUrl: site.siteUrl,
        model: getResearchModel(site.id),
      });
    }

    const { generateMarkdownContentHarnessed, resolveAgentsForBulk } = await import('@/lib/bulk/bulk-content-generator');
    if (resolveAgentsForBulk(blueprintResult).length === 0) {
      throw new Error(
        'Content optimization requires blueprint sections. Turn off content for title/meta-only runs, or run full blueprint generation.',
      );
    }
    const row: CSVRow = {
      keyword: primaryKeyword,
      title: existingTitle || blueprintResult.title || primaryKeyword,
      keyword_focus: primaryKeyword,
    };
    if (entity) row.entity = entity;

    const keywordData: KeywordData = {
      keyword: primaryKeyword,
      difficulty: 0,
      searchVolume: 0,
      cpc: 0,
      competition: 'LOW',
      intent: 'informational',
      relatedKeywords: [],
      serpFeatures: [],
    };

    const bulkHarnessOptions: BulkProcessingOptions = {
      apiKey: '',
      openRouterApiKey,
      selectedModel: getProductionModel(site.id),
      temperature: 1.0,
      maxTokens: 16000,
      topP: 0.9,
      useEntitySitemapTemplate: !!entity,
      portfolioBlockedHosts: context.portfolioBlockedHosts,
      sequentialHarnessSections: true,
      onHarnessSection: onHarnessSection
        ? (payload) => {
            onHarnessSection(payload);
            if (payload.phase === 'start') {
              setProgress({
                step: 'Generating optimized content...',
                progress: Math.min(
                  87,
                  80 + Math.floor(((payload.sectionIndex + 1) / Math.max(payload.totalSections, 1)) * 7),
                ),
                message: `Harness ${payload.sectionIndex + 1}/${payload.totalSections}: ${payload.title}…`,
              });
            }
          }
        : undefined,
    };

    markdownContent = await generateMarkdownContentHarnessed(
      blueprintResult,
      row,
      keywordData,
      [],
      '',
      bulkHarnessOptions,
      0,
      { name: site.name, siteUrl: site.siteUrl },
      context.wordPressPosts,
      undefined,
      context.semrushKeywordsContext,
      context.semrushScatterContext,
      context.semrushExternalUrls,
      {
        knowledgeBaseContext,
        currentPageUrl: context.url,
        gscKeywordsContext: context.gscKeywordsContext,
        harnessEntity: entity,
        acfContextOverride: acfContext,
        siteId: site.id,
        primaryKeyword,
        llmAuditSummary:
          context.llmAuditSummary?.trim()
          || llmAuditSummaryFromSeoResearchBrief(acfContext?.seoResearch),
        firstPartyAuthorityBlock: context.firstPartyAuthorityBlock,
        llmAuditAuthorityExternalPairs: context.llmAuditAuthorityExternalPairs,
        wordpressSite: site,
        linkTargetsPlan: context.linkTargetsPlan,
      },
    );

    if (!markdownContent || markdownContent.trim().length === 0) {
      throw new Error('Content generation returned empty content');
    }

    const existingBody = (context.existingContent || '').trim();
    const generatedBody = markdownContent.trim();
    if (existingBody && generatedBody === existingBody) {
      throw new Error(
        'Content optimization produced identical body to the live post. Refusing to upload unchanged content.',
      );
    }

    const isHtmlContent = isGeneratedContentHtml(markdownContent);
    const linkPatternHtml = /<a\s+[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
    const linkPatternMd = /\[([^\]]+)\]\(https?:\/\/[^\)]+\)/g;
    const linkCount = isHtmlContent
      ? (markdownContent.match(linkPatternHtml) || []).length
      : (markdownContent.match(linkPatternMd) || []).length;
    if (linkCount > 0) {
      console.log(`[Content Generator] ✅ Content validation: Found ${linkCount} links (${isHtmlContent ? 'HTML' : 'markdown'})`);
    }

    setProgress({
      step: 'Content generated',
      progress: 88,
      message: 'Harness sections stitched. Processing...',
    });
    if (!getMuteOptimizationToasts()) notify.success(NOTIFY_CONTENT_GENERATED, { duration: 4000 });
  }

  // Note: If shouldOptimizeContent is false, markdownContent was already set to existingContent in the if block above

  // Handle in-content image generation if requested
  if (context.inContentImageRequest && markdownContent) {
    try {
      setProgress({ step: 'Generating in-content image...', progress: 87, message: 'Analyzing content and generating image...' });
      if (!getMuteOptimizationToasts()) notify.info(NOTIFY_GENERATING_IN_CONTENT_IMAGE, { duration: 3000 });

      // Harness output is HTML. Markdown ![alt](url) insert never becomes <img> when contentIsHtml skips markdownToHtml.
      const contentLooksHtml = isGeneratedContentHtml(markdownContent);
      let insertedSectionHeader = "";
      if (contentLooksHtml) {
        const imageResult = await generateInContentImageFromHtml({
          html: markdownContent,
          flowTitle: blueprintResult.title || existingTitle || primaryKeyword,
          flowPurpose: blueprintResult.purpose || buildFocusedArticlePurpose(primaryKeyword),
          imageType: context.inContentImageRequest.imageType,
          site,
          userPrompt: context.inContentImageRequest.userPrompt,
          focusKeyword: primaryKeyword,
          apiKey: openRouterApiKey,
        });
        insertedSectionHeader = imageResult.sectionHeader;
        markdownContent = imageResult.html;
        console.log('[Content Generation] Inserted in-content figure (HTML path):', {
          sectionHeader: imageResult.sectionHeader,
          imageUrl: imageResult.imageUrl,
          mediaId: imageResult.mediaId,
        });
        if (!/<img[\s>]/i.test(markdownContent)) {
          console.error('[Content Generation] WARNING: HTML figure insert missing <img>');
          if (!getMuteOptimizationToasts()) notify.warning(NOTIFY_IMAGE_GENERATED_BUT_MAY_NOT_HAVE_BEEN_IN, { duration: 5000 });
        }
      } else {
        const imageResult = await generateInContentImage({
          markdownContent,
          flowTitle: blueprintResult.title || existingTitle || primaryKeyword,
          flowPurpose: blueprintResult.purpose || buildFocusedArticlePurpose(primaryKeyword),
          imageType: context.inContentImageRequest.imageType,
          site,
          userPrompt: context.inContentImageRequest.userPrompt,
          focusKeyword: primaryKeyword,
          apiKey: openRouterApiKey,
        });
        insertedSectionHeader = imageResult.sectionHeader;

        console.log('[Content Generation] Inserting in-content image:', {
          sectionHeader: imageResult.sectionHeader,
          markdownImage: imageResult.markdownImage,
          imageUrl: imageResult.imageUrl
        });
        
        const markdownBeforeInsertion = markdownContent;
        markdownContent = insertContentIntoSection(
          markdownContent,
          imageResult.sectionHeader,
          imageResult.markdownImage,
          'start'
        );

        const imageInserted = markdownContent.includes(imageResult.markdownImage);
        console.log('[Content Generation] Image insertion verification:', {
          imageInserted,
          markdownLengthBefore: markdownBeforeInsertion.length,
          markdownLengthAfter: markdownContent.length,
          markdownImagePreview: imageResult.markdownImage.substring(0, 100)
        });

        if (!imageInserted) {
          console.error('[Content Generation] WARNING: Image markdown not found in content after insertion!');
          if (!getMuteOptimizationToasts()) notify.warning(NOTIFY_IMAGE_GENERATED_BUT_MAY_NOT_HAVE_BEEN_IN, { duration: 5000 });
        }

        const markdownFiles = fileManager.getFiles().filter(f => f.name.includes('content') && f.name.endsWith('.md'));
        if (markdownFiles.length > 0) {
          const markdownFile = markdownFiles[0];
          fileManager.removeFile(markdownFile.name);
          fileManager.addFile(
            markdownFile.name,
            markdownContent,
            'text/markdown'
          );
          console.log('[Content Generation] Updated markdown file with inserted image');
        }
      }

      setProgress({ step: 'In-content image generated', progress: 87.5, message: `Image inserted into "${insertedSectionHeader}" section` });
      if (!getMuteOptimizationToasts()) notify.success(notifyInContentImageGeneratedAndInserted(insertedSectionHeader), { duration: 5000 });
    } catch (error) {
      console.error('[Content Generation] Error generating in-content image:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate in-content image';
      if (!getMuteOptimizationToasts()) notify.warning(notifyInContentImageGenerationFailedXCon(errorMessage), { duration: 7000 });
      // Continue without image - don't fail the entire process
    }
  }

  let preservedMediaUrls: string[] = [];
  if (context.existingContent && shouldOptimizeContent) {
    try {
      const originalMedia = await extractMediaFromContent(context.existingContent, openRouterApiKey);
      preservedMediaUrls = originalMedia.map((m) => m.url).filter(Boolean);
      if (preservedMediaUrls.length > 0) {
        console.log(`[Content Generation] ${preservedMediaUrls.length} original media URL(s) on sanitizer allowlist (harness embeds via [IMAGE] prompts)`);
      }
    } catch (error) {
      console.warn('[Content Generation] Could not read original media URLs for allowlist:', error);
    }
  }

  // Use content as-is: optimizer outputs HTML directly. No markdown conversion, no sanitizing.
  const contentIsHtml = shouldOptimizeContent && isGeneratedContentHtml(markdownContent);
  const htmlContent = shouldOptimizeContent
    ? (contentIsHtml ? markdownContent : markdownToHtml(markdownContent))
    : context.existingContent;
  
  // Verify in-content image is in HTML after conversion (if one was generated)
  if (context.inContentImageRequest && shouldOptimizeContent) {
    const imageHtmlPattern = /<img[^>]+src=["']https?:\/\/[^"']+["'][^>]*>/i;
    const hasImageInHtml = imageHtmlPattern.test(htmlContent);
    console.log('[Content Generation] Post-HTML conversion check:', {
      hasImageInHtml,
      htmlContentLength: htmlContent.length,
      htmlPreview: htmlContent.substring(0, 1000)
    });
    if (!hasImageInHtml) {
      console.error('[Content Generation] ERROR: No image HTML found in content after conversion!');
      if (!getMuteOptimizationToasts()) notify.error(NOTIFY_IN_CONTENT_IMAGE_WAS_NOT_PRESERVED_DURIN, { duration: 7000 });
    }
  }

  // Meta (parallel start above) — skip when content-only / meta optimization off
  let excerpt = '';
  if (!skipMeta) {
    setProgress({ step: 'Crafting elegant meta description...', progress: 85, message: 'Finalizing SEO meta description...' });

    console.log('[Content Generator] 🔥 Awaiting meta description (started in parallel with content generation)');
    excerpt = await metaPromise;

    console.log('[Content Generator] ✅ INDEPENDENT meta description generated (not from content):', excerpt.substring(0, 80) + '...');

    if (!excerpt || excerpt.length < 50) {
      console.warn(`[Content Generator] Meta description missing or too short (${excerpt?.length || 0} chars), using keyword fallback`);
      excerpt = `${primaryKeyword.trim()} | Learn more.`;
      if (excerpt.length > 160) excerpt = excerpt.substring(0, 157) + '...';
    }
    console.log('[Content Generator] AI-generated meta description:', excerpt.length + ' chars');
    setProgress({ step: 'Crafting elegant meta description...', progress: 86, message: `Meta description generated (${excerpt.length} chars)` });
  }

  if (shouldOptimizeContent) {
    if (!getMuteOptimizationToasts()) notify.success(NOTIFY_HTML_READY_TO_UPLOAD, { duration: 3000 });
  }

  // Save HTML content file
  const htmlFileName = OptimizationFileManager.generateFilename('content', primaryKeyword, 'html');
  fileManager.addFile(
    htmlFileName,
    htmlContent,
    'text/html'
  );

  const mdFileName = OptimizationFileManager.generateFilename('content', primaryKeyword, 'md');
  fileManager.addFile(
    mdFileName,
    contentIsHtml ? htmlToMarkdown(htmlContent) : markdownContent,
    'text/markdown'
  );

  setProgress(
    progressWithGeneratedFiles(
      { step: 'Content ready', progress: 88, message: 'HTML and markdown saved for download' },
      fileManager,
    ),
  );

  return {
    markdownContent,
    htmlContent,
    excerpt,
    ...(preservedMediaUrls.length > 0 ? { preservedMediaUrls } : {}),
  };
  } finally {
    await metaPromise.catch(() => {});
  }
}

