import {
  META_FOCUS_KEYWORD_GRAMMAR_RULES,
} from "@/lib/ppc/meta-ad-focus-keyword-grammar";
import {
  buildMetaImageRealismSceneSpec,
  META_IMAGE_ANTI_ABSTRACT_UI_RULE,
  META_IMAGE_REALISM_RULE,
} from "@/lib/ppc/meta-ad-image-realism-spec";
import {
  buildMetaDeviceScreenLayoutBlock,
  resolveMetaDeviceScreenLayout,
} from "@/lib/ppc/meta-ad-device-screen-layout";
import {
  buildMetaImageOnImageTextLockBlock,
  META_IMAGE_SINGLE_ZONE_RULE,
  META_IMAGE_TEXT_LOCK_REFERENCE,
  prepareCreativeBriefForImageGeneration,
} from "@/lib/ppc/meta-ad-image-on-image-text";
import { formatVisualToolPaletteBlock, visualToolIsActive } from "@/lib/ppc/meta-ad-visual-tool-palette";
import { formatMetaColorPaletteBlock } from "@/lib/ppc/meta-ad-color-palette";
import { formatTypographyStyleForPrompt, type MetaAdTypographyStyle } from "@/lib/ppc/meta-ad-typography-styles";
import { META_ADS_COPY_LIMITS_PROMPT } from "@/lib/ppc/meta-ads-field-limits";
import type { PpcWpPageContext } from "@/lib/ppc/google-ads-types";
import type { MetaAdColorPalette, MetaAdCreativeBrief, MetaAdInstagramGoal, MetaAdPlacement, MetaAdVisualReferenceElement } from "@/lib/ppc/meta-ads-types";
import { metaAdPlacementLabel } from "@/lib/ppc/meta-ads-field-limits";
import {
  buildMetaBrandRules,
  META_IMAGE_ANTI_PATTERNS,
  META_IMAGE_LAYOUT_RULES,
  META_IMAGE_NO_PEOPLE_RULES,
  META_IMAGE_NO_SPEC_FRAME_RULE,
  META_IMAGE_TEXT_RULES,
  META_INSTAGRAM_CAPTION_RULES,
  META_VALUE_PROPOSITION_RULES,
  resolveMetaAdvertiserLabel,
} from "./meta-ad-prompt-rules";
export * from "./meta-ad-prompt-rules";
export * from "./meta-ad-prompt-parsers";
export function buildMetaPageContextBlock(page: PpcWpPageContext | undefined): string {
  if (!page) return "No landing page context available.";
  return [
    `URL: ${page.url}`,
    `Title: ${page.title}`,
    page.keyword ? `Keyword: ${page.keyword}` : "",
    page.metaDescription ? `Meta description: ${page.metaDescription}` : "",
    page.excerpt ? `Excerpt: ${page.excerpt.slice(0, 600)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildMetaInstagramGoalSystemPrompt(siteName?: string | null): string {
  const advertiser = resolveMetaAdvertiserLabel(siteName);
  return `You are an Instagram ads strategist for ${advertiser}.

Read all research before writing anything. State what this ad is trying to accomplish.
The landing page defines the offer and click destination. Context URL defines who we are and framing.
primaryTopic must match the landing page offer, not unrelated product UI.
creativeMode:
- agency_service: Neo Digital sells a service (SEO, web design, audits)
- product_saas: NEO Pulse product marketing only when landing/topic is the app
- local_lead: local business lead gen
visualDirection must follow the landing offer and creative strategy. Include visible designed graphic elements (icons, shapes, accent bars, motifs). Include a device or screen UI only when it supports the concept.
visualDirection must describe a designed Instagram feed creative concept (modern, engaging), not ad copy. Not text-only on empty background.
${META_VALUE_PROPOSITION_RULES}
${META_FOCUS_KEYWORD_GRAMMAR_RULES}
referenceQueries: 2 to 4 Google Images search queries for Instagram feed ad graphic design references.
${META_INSTAGRAM_CAPTION_RULES}
Return ONLY valid JSON matching outputSchema.`;
}

export function buildMetaInstagramGoalUserPayload(options: {
  landingPage: PpcWpPageContext | undefined;
  pageContext?: string;
  focusKeyword?: string;
  placement: MetaAdPlacement;
  contextSource?: string;
  landingPageUrl?: string;
  siteName?: string;
}): string {
  return JSON.stringify({
    task: "meta_ad_instagram_goal",
    siteName: options.siteName,
    placement: options.placement,
    placementLabel: metaAdPlacementLabel(options.placement),
    contextSource: options.contextSource ?? "custom",
    landingPageUrl: options.landingPageUrl?.trim() || options.landingPage?.url || "",
    focusKeyword: options.focusKeyword?.trim() || options.landingPage?.keyword?.trim() || "",
    landingPage: options.landingPage,
    pageContext: options.pageContext?.trim() || buildMetaPageContextBlock(options.landingPage),
    brandRules: buildMetaBrandRules(options.siteName),
    outputSchema: {
      goalStatement: "string, 2 to 3 sentences on ad success",
      primaryTopic: "string, one sentence topic aligned to landing page",
      audience: "string",
      adAngle: "string",
      hook: "string",
      visualDirection: "string, detailed art direction for image only",
      creativeMode: "agency_service | product_saas | local_lead",
      onImageTextHint: "string, max 6 words or none",
      referenceQueries: ["string"],
    },
  });
}

export function buildMetaBlueprintSystemPrompt(siteName?: string | null): string {
  const advertiser = resolveMetaAdvertiserLabel(siteName);
  return `You are a senior Meta (Facebook/Instagram) ads strategist for ${advertiser}.

Plan a single feed or story ad grounded in the landing page inventory context.
${META_INSTAGRAM_CAPTION_RULES}
visualDirection must describe photo-real props and environments on white backgrounds only, not ad copy.
Return ONLY valid JSON matching outputSchema.`;
}

export function buildMetaBlueprintUserPayload(options: {
  landingPage: PpcWpPageContext | undefined;
  pageContext?: string;
  focusKeyword?: string;
  placement: MetaAdPlacement;
  siteName?: string;
}): string {
  return JSON.stringify({
    task: "meta_ad_blueprint",
    siteName: options.siteName,
    placement: options.placement,
    placementLabel: metaAdPlacementLabel(options.placement),
    focusKeyword: options.focusKeyword?.trim() || options.landingPage?.keyword?.trim() || "",
    landingPage: options.landingPage,
    pageContext: options.pageContext?.trim() || buildMetaPageContextBlock(options.landingPage),
    brandRules: buildMetaBrandRules(options.siteName),
    outputSchema: {
      angle: "string, campaign angle in one sentence",
      audience: "string, target audience",
      hook: "string, scroll-stopping hook",
      visualDirection: "string, art direction for the ad image (visual only, no ad copy dump)",
    },
  });
}

export function buildMetaCopyChecklistSystemPrompt(siteName?: string | null): string {
  const advertiser = resolveMetaAdvertiserLabel(siteName);
  return `You are a Meta ads copy QA specialist for ${advertiser}.

Build a concise checklist (5 to 8 items) for Meta ad copy before writing the ad.
Each item must validate copy against the creative brief captionHook and goalStatement.
Caption must expand captionHook and must not duplicate onImageHeadline verbatim.
Include a checklist item that rejects setup-only copy with no outcome or next step.
${META_VALUE_PROPOSITION_RULES}
${META_FOCUS_KEYWORD_GRAMMAR_RULES}
${META_ADS_COPY_LIMITS_PROMPT}
Return ONLY valid JSON with this exact shape:
{"items":[{"id":"1","label":"...","detail":"..."}]}
Every item must have a non-empty label.`;
}

export function buildMetaImageChecklistSystemPrompt(options?: {
  allowPeopleInImage?: boolean;
  siteName?: string | null;
}): string {
  const noPeopleBlock =
    options?.allowPeopleInImage === true ? "" : `\n${META_IMAGE_NO_PEOPLE_RULES}`;
  const advertiser = resolveMetaAdvertiserLabel(options?.siteName);
  return `You are a Meta ads creative director for ${advertiser}.

Build an image generation checklist (5 to 8 items) for a Meta ad creative.
Follow creative brief visualConcept and visualReferenceElements exactly. Do not add elements not in the plan.
Do not quote on-image headline or subline strings in checklist labels. Refer to ON-IMAGE TEXT LOCK instead.
${META_IMAGE_NO_SPEC_FRAME_RULE}
${META_IMAGE_TEXT_RULES}
${META_IMAGE_LAYOUT_RULES}
${META_IMAGE_ANTI_PATTERNS}${noPeopleBlock}
${buildMetaBrandRules(options?.siteName)}
Checklist items must enforce the creative brief and ${META_IMAGE_REALISM_RULE}
Do not add items that ask to render full ad copy, paragraphs, or CTA buttons in the image.
Return ONLY valid JSON with this exact shape:
{"items":[{"id":"1","label":"...","detail":"..."}]}
Every item must have a non-empty label.`;
}

export function buildMetaCopySystemPrompt(siteName?: string | null): string {
  const advertiser = resolveMetaAdvertiserLabel(siteName);
  return `You are a senior Meta (Facebook/Instagram) ads copywriter for ${advertiser}.

Write ad copy grounded in the Instagram ad goal, creative brief, landing page, and checklist.
Caption (primaryText) must expand creativeBrief.captionHook in sentence 1. Do not paste onImageHeadline as the full caption.
Do not advertise NEO Pulse unless primaryTopic is NEO Pulse.
${META_VALUE_PROPOSITION_RULES}
${META_FOCUS_KEYWORD_GRAMMAR_RULES}
${META_INSTAGRAM_CAPTION_RULES}
${META_ADS_COPY_LIMITS_PROMPT}
finalUrl is provided separately; do not change it.
Return ONLY valid JSON matching outputSchema.`;
}

export function formatMetaChecklistForPrompt(items: { label: string; detail?: string }[]): string {
  return items
    .map((item, index) => `${index + 1}. ${item.label}${item.detail ? `: ${item.detail}` : ""}`)
    .join("\n");
}

export function formatMetaVisualReferenceElementsForPrompt(
  elements: MetaAdVisualReferenceElement[],
): string {
  const lines = elements.map(
    (element) =>
      `- ${element.label} (${element.kind}): attached ref must satisfy "${element.acceptanceBrief}"`,
  );
  const hasDevice = elements.some((element) => element.kind === "device");
  if (hasDevice) {
    lines.push("- Match device refs exactly for hardware shape; do not substitute older models.");
  }
  return lines.join("\n");
}

export function buildMetaImagePromptDescription(options: {
  creativeBrief: MetaAdCreativeBrief;
  focusKeyword?: string;
  placement: MetaAdPlacement;
  allowPeopleInImage?: boolean;
  imagePromptModifier?: string;
  visualReferenceElements?: MetaAdVisualReferenceElement[];
  localityCity?: string;
  typographyStyle?: MetaAdTypographyStyle;
  colorPalette?: MetaAdColorPalette;
  pageContext?: string;
}): string {
  const brief = prepareCreativeBriefForImageGeneration(options.creativeBrief);
  const elements = options.visualReferenceElements ?? [];
  const includesDevice =
    visualToolIsActive(brief.visualToolPalette.device_screen) ||
    elements.some((element) => element.kind === "device");
  const deviceLayout = resolveMetaDeviceScreenLayout(brief, {
    focusKeyword: options.focusKeyword,
    pageContext: options.pageContext,
  });
  const deviceLayoutBlock = includesDevice ? buildMetaDeviceScreenLayoutBlock(deviceLayout) : null;
  const allowPeople = options.allowPeopleInImage === true;
  const modifier = options.imagePromptModifier?.trim();
  const keyword = options.focusKeyword?.trim();
  const typographyLine =
    visualToolIsActive(brief.visualToolPalette.typography)
      ? formatTypographyStyleForPrompt(options.typographyStyle)
      : null;

  const lines = [
    "PROMPT DESCRIPTION (visual only):",
    `- Placement: ${metaAdPlacementLabel(options.placement)}`,
    `- Visual concept: ${brief.visualConcept}`,
    `- Vibe: ${brief.visualVibe}`,
    `- Background: ${brief.backgroundTreatment}`,
    `- Style: ${brief.creativeStyle === "photo_hero" ? "Photo hero" : "Designed Instagram feed graphic"}`,
    `- Mood: modern, engaging, real sponsored post creative`,
    `- ${formatVisualToolPaletteBlock(brief.visualToolPalette)}`,
    typographyLine ? `- ${typographyLine}` : "",
    formatMetaColorPaletteBlock(options.colorPalette)
      ? `- ${formatMetaColorPaletteBlock(options.colorPalette)}`
      : "",
    `- On-image text: ${META_IMAGE_TEXT_LOCK_REFERENCE}`,
    keyword ? `- DO NOT render focus keyword on image: "${keyword}"` : "",
    "- DO NOT render caption, primaryText, description, CTA, URLs, or checklist text",
    brief.useMapOverlay
      ? "- Map overlay allowed per brief (subtle, designed graphic treatment)"
      : "- No map overlay",
    `- ${META_IMAGE_ANTI_PATTERNS.replace(/\n/g, " ")}`,
  ].filter(Boolean);

  if (!allowPeople) {
    lines.push("- People: none (no faces, hands, or silhouettes)");
  }
  if (modifier) {
    lines.push(`- Modifier: ${modifier}`);
  }
  if (elements.length) {
    lines.push("- Visual reference elements:");
    lines.push(formatMetaVisualReferenceElementsForPrompt(elements));
  }
  if (deviceLayoutBlock) {
    lines.push(deviceLayoutBlock);
  }
  lines.push(
    buildMetaImageRealismSceneSpec({
      creativeBrief: brief,
      placement: options.placement,
      localityCity: options.localityCity,
      visualReferenceElements: elements,
      focusKeyword: options.focusKeyword,
      pageContext: options.pageContext,
    }),
  );
  return lines.join("\n");
}

export function buildMetaImagePromptPreview(options: {
  focusKeyword?: string;
  placement: MetaAdPlacement;
  imagePromptModifier?: string;
  allowPeopleInImage?: boolean;
}): string {
  const keyword = options.focusKeyword?.trim() || "your topic";
  const peopleClause = options.allowPeopleInImage === true ? "" : ", no people";
  const formatLabel = options.placement === "story_9x16" ? "Story" : "Square Instagram";
  let line = `${formatLabel} ad: designed Instagram creative, modern vibe${peopleClause}.`;
  const note = options.imagePromptModifier?.trim();
  if (note) line += ` ${note}`;
  return line;
}

export function buildMetaImagePrompt(options: {
  creativeBrief: MetaAdCreativeBrief;
  focusKeyword?: string;
  checklist: { label: string; detail?: string }[];
  placement: MetaAdPlacement;
  referencePromptSuffix?: string;
  allowPeopleInImage?: boolean;
  imagePromptModifier?: string;
  visualReferenceElements?: MetaAdVisualReferenceElement[];
  goal?: MetaAdInstagramGoal;
  localityCity?: string;
  siteName?: string | null;
  typographyStyle?: MetaAdTypographyStyle;
  colorPalette?: MetaAdColorPalette;
  pageContext?: string;
}): string {
  const brief = prepareCreativeBriefForImageGeneration(options.creativeBrief);
  const textLock = buildMetaImageOnImageTextLockBlock(brief);
  const checklistText = formatMetaChecklistForPrompt(options.checklist);
  const promptDescription = buildMetaImagePromptDescription({
    creativeBrief: brief,
    focusKeyword: options.focusKeyword,
    placement: options.placement,
    allowPeopleInImage: options.allowPeopleInImage,
    imagePromptModifier: options.imagePromptModifier,
    visualReferenceElements: options.visualReferenceElements,
    localityCity: options.localityCity,
    typographyStyle: options.typographyStyle,
    colorPalette: options.colorPalette,
    pageContext: options.pageContext,
  });
  const noPeopleBlock =
    options.allowPeopleInImage === true ? "" : `\n\n${META_IMAGE_NO_PEOPLE_RULES}`;
  const modifierBlock = options.imagePromptModifier?.trim()
    ? `\n\nPrompt Modifier:\n${options.imagePromptModifier.trim()}`
    : "";
  return [
    textLock,
    META_IMAGE_NO_SPEC_FRAME_RULE,
    META_IMAGE_SINGLE_ZONE_RULE,
    `Meta ad image for ${metaAdPlacementLabel(options.placement)} placement.`,
    promptDescription,
    META_IMAGE_TEXT_RULES,
    META_IMAGE_LAYOUT_RULES,
    META_IMAGE_ANTI_PATTERNS,
    META_IMAGE_ANTI_ABSTRACT_UI_RULE,
    META_IMAGE_REALISM_RULE,
    noPeopleBlock,
    buildMetaBrandRules(options.siteName, options.colorPalette),
    "Checklist:",
    checklistText,
    "Caption and Meta ad fields are for setup only. Do not paint them into the image.",
    "FINAL: Paint ON-IMAGE TEXT LOCK once in the upper third only. Lower half of the frame must have zero readable text.",
    options.referencePromptSuffix?.trim(),
    modifierBlock,
  ]
    .filter(Boolean)
    .join("\n\n");
}
