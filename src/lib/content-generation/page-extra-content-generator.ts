/**
 * Page Extra Content Generator
 * Staged HTML for seo_extra_text: harness section 0 = <h2>+intro, section 1 = <h3>+body
 */

import { logger } from "@/lib/logger";
import { streamChatCompletion } from "@/lib/api";
import { appendUniversalContentRulesToSystemPrompt } from "@/lib/content-word-blocklist";
import { generateImage } from "@/lib/image-api";
import { buildImagePrompt } from "@/lib/image-prompt-builder";
import {
  buildGroundedImagePromptSuffix,
  collectReferenceDataUrls,
  researchGoogleImageReferences,
} from "@/lib/image-reference-research";
import { getImageModel, getResearchModel } from "@/lib/optimization-settings-storage";
import { dataUrlToBase64, fetchImageDataUrlViaApi } from "@/lib/proxy-fetch-text";
import type { WordPressSite } from "@/components/integrations/types";
import type { BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";
import {
  EXTRA_TEXT_HEADING_RETRY_USER,
  enforceKeywordInExtraTextHeadings,
  extraTextHeadingContractOk,
  extraTextHeadingIncludesKeywordFocus,
  extraTextHeadingsIncludeKeywordFocus,
  extractFirstHeadingInnerText,
  finalizeExtraTextHtml,
  stitchExtraTextFragments,
} from "@/lib/content-generation/extra-text-heading-contract";
import {
  buildExtraTextFullSystemPrompt,
  buildExtraTextFullUserPrompt,
  buildExtraTextH2SystemPrompt,
  buildExtraTextH2UserPrompt,
  buildExtraTextH3SystemPrompt,
  buildExtraTextH3UserPrompt,
  extraTextKeywordInHeadingsRule,
  EXTRA_TEXT_HARNESS_TOTAL_SECTIONS,
  type ExtraTextPromptContext,
} from "@/lib/content-generation/page-extra-content-generator-prompts";
import { formatBlogPlayLinkTargetsPrompt } from "@/lib/bulk/bulk-generation-wp-inventory";

const EXTRA_TEXT_KEYWORD_HEADING_RETRY = `REJECTED: <h2> or <h3> did not include the focus keyword phrase exactly.
Both headings must contain the full focus keyword (verbatim). Stay on the page topic from PAGE SOURCE.`;

/** Last path segment (e.g. product slug) reinforces topic when title/keyword are broad. */
function hintFromPageUrl(pageUrl: string | undefined): string | undefined {
  const raw = (pageUrl || "").trim();
  if (!raw) return undefined;
  try {
    const u = new URL(raw.includes("://") ? raw : `https://placeholder.local${raw.startsWith("/") ? "" : "/"}${raw}`);
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    if (!last || !/[-_]/.test(last)) return undefined;
    return last.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ");
  } catch {
    return undefined;
  }
}

export interface GenerateExtraTextOptions {
  existingContent: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  pageUrl?: string;
  pageTitle?: string;
  wordPressRAGContext?: string;
  wordPressPosts?: Array<{
    id: number;
    slug: string;
    title: string;
    excerpt: string;
    link: string;
    date_gmt: string;
    collection?: string;
    postType?: string;
  }>;
  site: WordPressSite;
  apiKey: string;
  siteId?: string;
  /** Same harness callback as blueprint content (BulkHarnessSectionsPanel). */
  onHarnessSection?: (payload: BulkHarnessSectionPayload) => void;
  setProgress?: (progress: { step: string; progress: number; message?: string }) => void;
}

export interface GenerateExtraImageOptions {
  existingContent: string;
  primaryKeyword: string;
  site: WordPressSite;
  apiKey: string;
  siteId?: string;
}

function stripCodeFence(raw: string): string {
  const text = raw.trim();
  const fence = text.match(/^```(?:html)?\s*\n?([\s\S]*?)\n?```$/i);
  return fence ? fence[1].trim() : text;
}

/**
 * Generate complementary helpful linked content for pages (seo_extra_text ACF field).
 */
export async function generateExtraTextForPage(
  options: GenerateExtraTextOptions
): Promise<string> {
  const {
    existingContent,
    primaryKeyword,
    secondaryKeywords,
    pageUrl = "",
    pageTitle = "",
    wordPressRAGContext = "",
    wordPressPosts = [],
    apiKey,
    siteId,
    onHarnessSection,
    setProgress,
  } = options;

  const subjectLine = (pageTitle || primaryKeyword).trim() || "this page";
  const urlHint = hintFromPageUrl(pageUrl);
  const secondaryShort = secondaryKeywords
    .filter((kw) => kw && kw.trim().length > 0)
    .slice(0, 5);

  try {
    const researchModel = getResearchModel(siteId);

    const textContent = existingContent
      .replace(/<[^>]*>/g, "")
      .replace(/^#+\s+/gm, "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`[^`]+`/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 3000);

    const hasLinkInventory = wordPressPosts.length > 0;
    const wordPressPostsContext = hasLinkInventory
      ? formatBlogPlayLinkTargetsPrompt(wordPressPosts)
      : `\n=== INTERNAL LINK TARGETS ===\n(none loaded — do not emit [[LINK]] or <a> tags)\n=== END INTERNAL LINK TARGETS ===\n`;

    const ragContext = wordPressRAGContext
      ? wordPressRAGContext.substring(0, 5000).trim()
      : "";

    const pageUrlDisplay = (pageUrl || "(not provided)").trim() || "(not provided)";
    const promptCtx: ExtraTextPromptContext = {
      subjectLine,
      pageUrl: pageUrlDisplay,
      urlHintLine: urlHint
        ? `URL topic hint: "${urlHint}" (align with path when title/keyword are broad)\n`
        : "",
      primaryKeyword,
      secondaryLine:
        secondaryShort.length > 0
          ? `Secondary phrases (phrasing only): ${secondaryShort.join(", ")}\n`
          : "",
      textContent,
      wordPressPostsContext,
      ragContext,
      ragGuard: wordPressRAGContext
        ? "Ground extra text in PAGE SOURCE above. Do not write about a different product, city, or service than that page body.\n"
        : "",
    };

    const emitSection = (
      sectionIndex: number,
      title: string,
      phase: "start" | "done",
      markdownSlice?: string,
    ) => {
      onHarnessSection?.({
        rowIndex: 0,
        sectionIndex,
        totalSections: EXTRA_TEXT_HARNESS_TOTAL_SECTIONS,
        title,
        phase,
        markdownSlice,
      });
      const pctBase = 78;
      const pctSpan = 8;
      const doneSlots = phase === "done" ? sectionIndex + 1 : sectionIndex;
      setProgress?.({
        step: "Generating extra text...",
        progress: pctBase + Math.floor((doneSlots / EXTRA_TEXT_HARNESS_TOTAL_SECTIONS) * pctSpan),
        message: `Extra text ${sectionIndex + 1}/${EXTRA_TEXT_HARNESS_TOTAL_SECTIONS}: ${title}${phase === "start" ? "…" : ""}`,
      });
    };

    const runCompletion = async (
      systemPrompt: string,
      userContent: string,
      temperature: number,
    ): Promise<string> => {
      let out = "";
      await streamChatCompletion({
        apiKey,
        model: researchModel,
        messages: [
          { role: "system", content: appendUniversalContentRulesToSystemPrompt(systemPrompt) },
          { role: "user", content: userContent },
        ],
        contentHarness: true,
        temperature,
        maxTokens: 1200,
        topP: 0.9,
        onContentChunk: (chunk) => {
          out += chunk;
        },
      });
      return stripCodeFence(out);
    };

    const h2Placeholder = "H2";
    emitSection(0, h2Placeholder, "start");
    let h2Section = finalizeExtraTextHtml(
      await runCompletion(
        buildExtraTextH2SystemPrompt({ subjectLine, primaryKeyword }),
        buildExtraTextH2UserPrompt(promptCtx),
        0.5,
      ),
    );
    let h2Title = extractFirstHeadingInnerText(h2Section, "h2") || h2Placeholder;
    if (!extraTextHeadingIncludesKeywordFocus(h2Title, primaryKeyword)) {
      logger.warn("[Page Extra Text Generator] H2 missing focus keyword, retrying section 1");
      emitSection(0, h2Placeholder, "start");
      h2Section = finalizeExtraTextHtml(
        await runCompletion(
          buildExtraTextH2SystemPrompt({ subjectLine, primaryKeyword }),
          `${EXTRA_TEXT_KEYWORD_HEADING_RETRY}\n\n${extraTextKeywordInHeadingsRule(primaryKeyword)}\n\n${buildExtraTextH2UserPrompt(promptCtx)}`,
          0.35,
        ),
      );
      h2Title = extractFirstHeadingInnerText(h2Section, "h2") || h2Placeholder;
    }
    emitSection(0, h2Title, "done", h2Section);

    const h3Placeholder = "H3";
    emitSection(1, h3Placeholder, "start");
    let h3Section = finalizeExtraTextHtml(
      await runCompletion(
        buildExtraTextH3SystemPrompt({ subjectLine, primaryKeyword, hasLinkInventory }),
        buildExtraTextH3UserPrompt(promptCtx, h2Section, hasLinkInventory),
        0.5,
      ),
    );
    let h3Title = extractFirstHeadingInnerText(h3Section, "h3") || h3Placeholder;
    if (!extraTextHeadingIncludesKeywordFocus(h3Title, primaryKeyword)) {
      logger.warn("[Page Extra Text Generator] H3 missing focus keyword, retrying section 2");
      emitSection(1, h3Placeholder, "start");
      h3Section = finalizeExtraTextHtml(
        await runCompletion(
          buildExtraTextH3SystemPrompt({ subjectLine, primaryKeyword, hasLinkInventory }),
          `${EXTRA_TEXT_KEYWORD_HEADING_RETRY}\n\n${extraTextKeywordInHeadingsRule(primaryKeyword)}\n\n${buildExtraTextH3UserPrompt(promptCtx, h2Section, hasLinkInventory)}`,
          0.35,
        ),
      );
      h3Title = extractFirstHeadingInnerText(h3Section, "h3") || h3Placeholder;
    }
    emitSection(1, h3Title, "done", h3Section);

    let html = stitchExtraTextFragments(h2Section, h3Section);

    const needsFullRetry =
      !extraTextHeadingContractOk(html) || !extraTextHeadingsIncludeKeywordFocus(html, primaryKeyword);

    if (needsFullRetry) {
      logger.warn("[Page Extra Text Generator] Contract or keyword-heading check failed, one full-block retry");
      emitSection(0, h2Title, "start");
      const retryRaw = await runCompletion(
        buildExtraTextFullSystemPrompt({ subjectLine, primaryKeyword, hasLinkInventory }),
        `${EXTRA_TEXT_HEADING_RETRY_USER}\n\n${EXTRA_TEXT_KEYWORD_HEADING_RETRY}\n\n${extraTextKeywordInHeadingsRule(primaryKeyword)}\n\n${buildExtraTextFullUserPrompt(promptCtx, hasLinkInventory)}`,
        0.3,
      );
      html = finalizeExtraTextHtml(retryRaw);
      const retryH2 = extractFirstHeadingInnerText(html, "h2") || h2Placeholder;
      const retryH3 = extractFirstHeadingInnerText(html, "h3") || h3Placeholder;
      emitSection(0, retryH2, "done", html);
      emitSection(1, retryH3, "done");
    }

    html = enforceKeywordInExtraTextHeadings(html, primaryKeyword);

    if (!extraTextHeadingContractOk(html)) {
      throw new Error(
        "Extra text must start with <h2> and include exactly one <h3>. Regenerate this page.",
      );
    }
    if (!extraTextHeadingsIncludeKeywordFocus(html, primaryKeyword)) {
      throw new Error(
        `Extra text <h2> and <h3> must include the focus keyword "${primaryKeyword}". Regenerate this page.`,
      );
    }

    return html;
  } catch (error) {
    logger.error("[Page Extra Text Generator] Error generating extra text:", error);
    throw new Error(
      `Failed to generate extra text: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Generate AI image for pages (seo_extra_image ACF field)
 */
export async function generateExtraImageForPage(
  options: GenerateExtraImageOptions
): Promise<{ imageBase64: string; imageUrl?: string }> {
  const {
    existingContent,
    primaryKeyword,
    site,
    apiKey,
    siteId
  } = options;

  try {
    const textContent = existingContent
      .replace(/<[^>]*>/g, '')
      .replace(/^#+\s+/gm, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]+`/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
      .trim()
      .substring(0, 1500);

    const imagePrompt = buildImagePrompt(
      {
        flowTitle: primaryKeyword,
        flowPurpose: `Visual representation for page about ${primaryKeyword}`,
        finalOutput: textContent
      },
      {
        includeText: false,
        includePeople: false,
        includeAnimals: false,
        includeCars: false,
        isInfographic: false,
        aspectRatio: '1:1',
        style: 'professional',
        colorScheme: 'vibrant'
      }
    );

    const imagePromptWithRestrictions = `${imagePrompt} ABSOLUTELY NO text, logos, characters, letters, numbers, symbols, watermarks, or any written content visible in the image. Pure visual representation only.`;

    const research = await researchGoogleImageReferences({
      apiKey,
      model: getResearchModel(siteId),
      context: {
        title: primaryKeyword,
        purpose: `Visual representation for page about ${primaryKeyword}`,
        body: textContent,
      },
    });
    const groundedPrompt =
      imagePromptWithRestrictions + buildGroundedImagePromptSuffix(research.references);

    const imageResult = await generateImage({
      apiKey,
      prompt: groundedPrompt,
      model: getImageModel(siteId),
      aspectRatio: '1:1',
      referenceImageDataUrls: collectReferenceDataUrls(research.references),
    });

    if (imageResult.error) {
      throw new Error(imageResult.error);
    }

    if (!imageResult.imageBase64 && !imageResult.imageUrl) {
      throw new Error('No image data returned from image generation API');
    }

    let imageBase64: string;
    if (imageResult.imageBase64) {
      if (imageResult.imageBase64.startsWith('data:')) {
        const base64Match = imageResult.imageBase64.match(/base64,(.+)$/);
        imageBase64 = base64Match ? base64Match[1] : imageResult.imageBase64;
      } else {
        imageBase64 = imageResult.imageBase64;
      }
    } else if (imageResult.imageUrl) {
      const dataUrl = await fetchImageDataUrlViaApi(imageResult.imageUrl);
      imageBase64 = dataUrlToBase64(dataUrl);
    } else {
      throw new Error('No image data available');
    }

    return {
      imageBase64,
      imageUrl: imageResult.imageUrl
    };
  } catch (error) {
    logger.error('[Page Extra Image Generator] Error generating extra image:', error);
    throw new Error(`Failed to generate extra image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
