/**
 * Content Generator Module
 * Handles markdown content generation, in-content images, and HTML conversion
 */

import { notify } from "@/lib/app-notifications";
import { NOTIFY_CONTENT_GENERATED, NOTIFY_GENERATING_CONTENT, NOTIFY_GENERATING_IN_CONTENT_IMAGE, NOTIFY_HTML_READY_TO_UPLOAD, NOTIFY_IMAGE_GENERATED_BUT_MAY_NOT_HAVE_BEEN_IN, NOTIFY_IN_CONTENT_IMAGE_WAS_NOT_PRESERVED_DURIN, notifyInContentImageGeneratedAndInserted, notifyInContentImageGenerationFailedXCon } from "@/lib/notify-messages";
import { getMuteOptimizationToasts } from "@/hooks/content-optimization/optimization-toast-mute";
import { loadApiKey } from "@/lib/api";
import { markdownToHtml } from "@/lib/markdown-to-html";
import { htmlToMarkdown } from "@/lib/wordpress-converter";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import {
  generateInContentImage,
  generateInContentImageFromHtml,
} from "@/lib/in-content-image-generator";
import { insertContentIntoSection } from "@/lib/section-parser";
import { getProductionModel, getResearchModel } from "@/lib/optimization-settings-storage";
import { extractMediaFromContent } from "@/lib/content-optimization-helpers";
import { readACFFieldsAgentically } from "@/lib/content-generation/ai-driven-acf-reader";
import { buildFocusedArticlePurpose } from "@/lib/content-generation/article-length-policy";
import { isGeneratedContentHtml } from "@/lib/content-generation/content-format";
import { llmAuditSummaryFromSeoResearchBrief } from "@/lib/content-optimization/seo-research-brief-for-optimize";
import type { ContentGeneratorOptions, ContentGeneratorResult } from "@/lib/content-generation/content-generator-types";
import { generateMetaDescription } from "@/lib/content-generation/content-generator-meta";
import type { BulkProcessingOptions } from "@/lib/bulk-auto-generate";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import type { KeywordData } from "@/lib/keyword-types";

export { generateMetaDescription } from "@/lib/content-generation/content-generator-meta";
export type { ContentGeneratorOptions, ContentGeneratorResult } from "@/lib/content-generation/content-generator-types";

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
    const linkPatternMd = /\[([^\]]+)\]\(https?:\/\/[^)]+\)/g;
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
    { step: 'Content ready', progress: 88, message: 'HTML and markdown saved for download' },
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
