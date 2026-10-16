import { loadApiKey, streamChatCompletion } from "@/lib/api";
import { generateImage } from "@/lib/image-api";
import { buildImagePrompt } from "@/lib/image-prompt-builder";
import {
  buildGroundedImagePromptSuffix,
  collectReferenceDataUrls,
  researchGoogleImageReferences,
} from "@/lib/image-reference-research";
import {
  buildImageChecklistSystemPrompt,
  buildImageChecklistUserPrompt,
  parseImageChecklist,
  type ImageChecklistItem,
} from "@/lib/image-checklist-builder";
import { uploadWordPressMedia } from "@/lib/wordpress-api";
import { dataUrlToBase64, fetchImageDataUrlViaApi } from "@/lib/proxy-fetch-text";
import {
  analyzeBestSectionForImage,
  type ImageType,
  IMAGE_TYPE_REQUIREMENTS,
} from "@/lib/image-section-analyzer";
import { parseMarkdownSections } from "@/lib/section-parser";
import type { WordPressSite } from "@/components/integrations/types";
import { buildFocusedArticlePurpose } from "@/lib/content-generation/article-length-policy";
import {
  OVERVIEW_AUDIT_FULL_POST_LABEL,
  OVERVIEW_AUDIT_PREAMBLE_LABEL,
  splitHtmlForOverviewAudit,
} from "@/lib/overview/overview-post-html-audit-sections";
import {
  buildInContentImageFigureHtml,
  inContentImageAltFromFocusKeyword,
  inContentImageFilenameFromFocusKeyword,
  inContentImageTitleFromFocusKeyword,
  insertFigureAfterH2,
} from "@/lib/overview/overview-blog-in-content-image-insert";
import { applyAiGeneratedImageDisclaimer } from "@/lib/images/ai-generated-image-disclaimer";
import { DEFAULT_IMAGE_MODEL } from "@/lib/image-model-defaults";
import { getImageModel, getResearchModel } from "@/lib/optimization-settings-storage";

/** Default OpenRouter model constant kept for backward compatibility; runtime calls resolve getImageModel(siteId). */
export const IN_CONTENT_IMAGE_MODEL = DEFAULT_IMAGE_MODEL;

export interface InContentImageResult {
  imageUrl: string;
  sectionHeader: string;
  markdownImage: string;
  mediaId?: number;
  alt?: string;
}

export interface InContentImageFromHtmlResult extends InContentImageResult {
  html: string;
  htmlFigure: string;
  alt: string;
}

export interface InContentImageOptions {
  markdownContent: string;
  flowTitle: string;
  flowPurpose: string;
  imageType: ImageType;
  site: WordPressSite;
  userPrompt?: string;
  /** Focus keyword for filename, alt, and media title. */
  focusKeyword?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export interface InContentImageFromHtmlOptions {
  html: string;
  flowTitle: string;
  flowPurpose?: string;
  focusKeyword: string;
  site: WordPressSite;
  imageType?: ImageType;
  userPrompt?: string;
  /** When set, skip auto heading pick and use this H2 (must exist in HTML). */
  forcedSectionHeader?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

function normalizeHeadingKey(title: string): string {
  return (title ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Resolve a forced H2 against parsed markdown sections (exact, then case-insensitive). */
export function resolveForcedH2Section(
  sections: ReturnType<typeof parseMarkdownSections>,
  forcedSectionHeader: string,
): { header: string; content: string; fullText: string } {
  const forced = forcedSectionHeader.trim();
  if (!forced) {
    throw new Error("Forced section header is empty");
  }
  const h2s = sections.filter((s) => s.headerLevel === 2);
  const exact = h2s.find((s) => s.header === forced);
  if (exact) {
    return { header: exact.header, content: exact.content, fullText: exact.fullText };
  }
  const key = normalizeHeadingKey(forced);
  const fuzzy = h2s.find((s) => normalizeHeadingKey(s.header) === key);
  if (fuzzy) {
    return { header: fuzzy.header, content: fuzzy.content, fullText: fuzzy.fullText };
  }
  throw new Error(`Selected section "${forced}" not found in content`);
}

function stripHtmlToPlain(html: string): string {
  let out = "";
  let inTag = false;
  for (const ch of html) {
    if (ch === "<") {
      inTag = true;
      continue;
    }
    if (ch === ">") {
      inTag = false;
      continue;
    }
    if (!inTag) out += ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Project HTML H2 sections into markdown for analyzeBestSectionForImage. */
export function htmlBodyToMarkdownH2Projection(html: string): string {
  const sections = splitHtmlForOverviewAudit(html);
  const parts: string[] = [];
  for (const sec of sections) {
    if (sec.sectionLabel === OVERVIEW_AUDIT_PREAMBLE_LABEL) continue;
    if (sec.sectionLabel === OVERVIEW_AUDIT_FULL_POST_LABEL) {
      const plain = stripHtmlToPlain(sec.html);
      if (plain) parts.push(plain);
      continue;
    }
    const plain = stripHtmlToPlain(sec.html);
    parts.push(`## ${sec.sectionLabel}`);
    parts.push("");
    parts.push(plain || sec.sectionLabel);
    parts.push("");
  }
  return parts.join("\n").trim();
}

async function imageBase64FromGenerateResult(imageResult: {
  imageBase64?: string;
  imageUrl?: string;
}): Promise<string> {
  if (imageResult.imageBase64) return imageResult.imageBase64;
  if (imageResult.imageUrl) {
    const dataUrl = await fetchImageDataUrlViaApi(imageResult.imageUrl);
    return dataUrlToBase64(dataUrl);
  }
  throw new Error("No image data available");
}

type SelectedSection = {
  header: string;
  content: string;
  fullText: string;
};

async function buildChecklistAndGenerate(params: {
  apiKey: string;
  researchModel: string;
  siteId?: string;
  flowTitle: string;
  flowPurpose: string;
  selectedSection: SelectedSection;
  imageType: ImageType;
  userPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}): Promise<{ imageBase64: string; checklist: ImageChecklistItem[] }> {
  const imageTypeInfo = IMAGE_TYPE_REQUIREMENTS[params.imageType];
  const systemPrompt = buildImageChecklistSystemPrompt(
    params.flowTitle,
    params.flowPurpose,
    undefined,
    {
      header: params.selectedSection.header,
      content: params.selectedSection.content,
      fullText: params.selectedSection.fullText,
    },
    params.userPrompt,
  );

  const checklistContext = {
    flowTitle: params.flowTitle,
    flowPurpose: params.flowPurpose,
    selectedSection: {
      header: params.selectedSection.header,
      content: params.selectedSection.content,
      fullText: params.selectedSection.fullText,
    },
    userPrompt: params.userPrompt,
    includeText: params.imageType === "infographic",
    includePeople: false,
    includeAnimals: false,
    includeCars: false,
    isInfographic: params.imageType === "infographic",
    aspectRatio: imageTypeInfo.aspectRatio,
    style: "professional" as const,
    colorScheme: "vibrant" as const,
    imageType: params.imageType,
  };

  const userPromptText = buildImageChecklistUserPrompt(checklistContext);
  let checklistContent = "";
  await streamChatCompletion({
    apiKey: params.apiKey,
    model: params.researchModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPromptText },
    ],
    temperature: params.temperature || 1.0,
    maxTokens: params.maxTokens || 4000,
    topP: params.topP || 0.9,
    onContentChunk: (chunk) => {
      checklistContent += chunk;
    },
  });

  const imageChecklist = parseImageChecklist(checklistContent);
  const checklistText =
    imageChecklist.length > 0
      ? `\n\nImage Generation Checklist:\n${imageChecklist
          .map((item, idx) => `${idx + 1}. ${item.title}\n   ${item.description}`)
          .join("\n")}`
      : "";

  const basePrompt = buildImagePrompt(
    {
      flowTitle: params.flowTitle,
      flowPurpose: params.flowPurpose,
      selectedSection: {
        header: params.selectedSection.header,
        content: params.selectedSection.content,
        fullText: params.selectedSection.fullText,
      },
    },
    {
      userPrompt: params.userPrompt,
      includeText: params.imageType === "infographic",
      includePeople: false,
      includeAnimals: false,
      includeCars: false,
      isInfographic: params.imageType === "infographic",
      aspectRatio: imageTypeInfo.aspectRatio,
      style: "professional",
      colorScheme: "vibrant",
      realisticBackground: true,
    },
  );

  const research = await researchGoogleImageReferences({
    apiKey: params.apiKey,
    model: params.researchModel,
    context: {
      title: params.flowTitle,
      purpose: params.flowPurpose,
      sectionHeader: params.selectedSection.header,
      sectionContent: params.selectedSection.content,
      userPrompt: params.userPrompt,
    },
  });
  const refSuffix = buildGroundedImagePromptSuffix(research.references);
  const prompt =
    basePrompt +
    checklistText +
    "\n\nFollow the checklist above EXACTLY. Ensure all requirements are met, especially regarding what should and should NOT be included." +
    refSuffix;

  const imageResult = await generateImage({
    apiKey: params.apiKey,
    prompt,
    model: getImageModel(params.siteId),
    aspectRatio: imageTypeInfo.aspectRatio,
    referenceImageDataUrls: collectReferenceDataUrls(research.references),
  });
  if (imageResult.error) throw new Error(imageResult.error);
  if (!imageResult.imageBase64 && !imageResult.imageUrl) {
    throw new Error("No image data returned from image generation API");
  }

  const imageBase64Raw = await imageBase64FromGenerateResult(imageResult);
  const imageBase64 = await applyAiGeneratedImageDisclaimer(imageBase64Raw);
  return { imageBase64, checklist: imageChecklist };
}

/**
 * Generates an in-content image for a blog post (markdown path).
 * Uses flash-lite-image + focus-keyword filename/alt when focusKeyword is set.
 */
export async function generateInContentImage(
  options: InContentImageOptions,
): Promise<InContentImageResult> {
  const apiKey = options.apiKey || loadApiKey();
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("OpenRouter API key not found. Please set it in settings.");
  }

  const researchModel = options.model || getResearchModel(options.site?.id);
  const sectionHeader = await analyzeBestSectionForImage(
    options.markdownContent,
    options.imageType,
    options.flowTitle,
    options.flowPurpose,
    options.userPrompt,
    apiKey,
    researchModel,
  );

  const sections = parseMarkdownSections(options.markdownContent);
  const selectedSection = sections.find(
    (s) => s.header === sectionHeader && s.headerLevel === 2,
  );
  if (!selectedSection) {
    throw new Error(`Selected section "${sectionHeader}" not found in content`);
  }

  const { imageBase64 } = await buildChecklistAndGenerate({
    apiKey,
    researchModel,
    siteId: options.site?.id,
    flowTitle: options.flowTitle,
    flowPurpose: options.flowPurpose,
    selectedSection: {
      header: selectedSection.header,
      content: selectedSection.content,
      fullText: selectedSection.fullText,
    },
    imageType: options.imageType,
    userPrompt: options.userPrompt,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    topP: options.topP,
  });

  const focusKeyword =
    (options.focusKeyword ?? "").trim() || options.flowTitle.trim();
  const imageFileName = inContentImageFilenameFromFocusKeyword(focusKeyword);
  const altText = inContentImageAltFromFocusKeyword(focusKeyword, sectionHeader);
  const mediaTitle = inContentImageTitleFromFocusKeyword(focusKeyword, sectionHeader);

  const uploadResult = await uploadWordPressMedia(
    options.site.siteUrl,
    options.site.username,
    options.site.appPassword,
    imageBase64,
    imageFileName,
    mediaTitle,
    altText,
  );
  if (!uploadResult.success || !uploadResult.url) {
    throw new Error(uploadResult.error || "Failed to upload image to WordPress");
  }

  const markdownImage = `![${altText}](${uploadResult.url})`;
  return {
    imageUrl: uploadResult.url,
    sectionHeader,
    markdownImage,
    mediaId: uploadResult.mediaId,
    alt: altText,
  };
}

/**
 * Generates an in-content image from post HTML, inserts a WP figure after the chosen H2.
 * Default image type: photo (realistic).
 */
export async function generateInContentImageFromHtml(
  options: InContentImageFromHtmlOptions,
): Promise<InContentImageFromHtmlResult> {
  const apiKey = options.apiKey || loadApiKey();
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("OpenRouter API key not found. Please set it in settings.");
  }

  const html = (options.html ?? "").trim();
  if (!html) throw new Error("No HTML body for in-content image");

  const markdownProjection = htmlBodyToMarkdownH2Projection(html);
  if (!markdownProjection.includes("## ")) {
    throw new Error("No H2 sections found in the content");
  }

  const imageType: ImageType = options.imageType ?? "photo";
  const flowPurpose =
    options.flowPurpose ||
    buildFocusedArticlePurpose(options.focusKeyword || options.flowTitle || "this topic");
  const researchModel = options.model || getResearchModel(options.site?.id);
  const sections = parseMarkdownSections(markdownProjection);
  const forced = (options.forcedSectionHeader ?? "").trim();

  let selectedSection: SelectedSection;
  let sectionHeader: string;

  if (forced) {
    selectedSection = resolveForcedH2Section(sections, forced);
    sectionHeader = selectedSection.header;
  } else {
    sectionHeader = await analyzeBestSectionForImage(
      markdownProjection,
      imageType,
      options.flowTitle,
      flowPurpose,
      options.userPrompt,
      apiKey,
      researchModel,
    );
    const found = sections.find(
      (s) => s.header === sectionHeader && s.headerLevel === 2,
    );
    if (!found) {
      throw new Error(`Selected section "${sectionHeader}" not found in content`);
    }
    selectedSection = {
      header: found.header,
      content: found.content,
      fullText: found.fullText,
    };
  }

  const { imageBase64 } = await buildChecklistAndGenerate({
    apiKey,
    researchModel,
    siteId: options.site?.id,
    flowTitle: options.flowTitle,
    flowPurpose,
    selectedSection,
    imageType,
    userPrompt: options.userPrompt,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    topP: options.topP,
  });

  const focusKeyword =
    (options.focusKeyword ?? "").trim() || options.flowTitle.trim();
  const imageFileName = inContentImageFilenameFromFocusKeyword(focusKeyword);
  const altText = inContentImageAltFromFocusKeyword(focusKeyword, sectionHeader);
  const mediaTitle = inContentImageTitleFromFocusKeyword(focusKeyword, sectionHeader);

  const uploadResult = await uploadWordPressMedia(
    options.site.siteUrl,
    options.site.username,
    options.site.appPassword,
    imageBase64,
    imageFileName,
    mediaTitle,
    altText,
  );
  if (!uploadResult.success || !uploadResult.url) {
    throw new Error(uploadResult.error || "Failed to upload image to WordPress");
  }

  const htmlFigure = buildInContentImageFigureHtml({
    imageUrl: uploadResult.url,
    alt: altText,
    mediaId: uploadResult.mediaId,
  });
  const updatedHtml = insertFigureAfterH2(html, sectionHeader, htmlFigure);
  const markdownImage = `![${altText}](${uploadResult.url})`;

  return {
    imageUrl: uploadResult.url,
    sectionHeader,
    markdownImage,
    mediaId: uploadResult.mediaId,
    alt: altText,
    htmlFigure,
    html: updatedHtml,
  };
}
