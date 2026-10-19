import { streamChatCompletion } from "@/lib/api";
import {
  AISEO_FULL_REWRITE_BODY_OUTPUT_CONTRACT,
  AISEO_FULL_REWRITE_HEADING_OUTPUT_CONTRACT,
  AISEO_FULL_REWRITE_SYSTEM_RULE,
  assertAiseoBodyRewriteChanged,
  assertAiseoHeadingRewriteChanged,
} from "@/lib/content-optimization/aiseo-full-rewrite-contract";
import {
  applyBodyHtmlToBand,
  applyHeaderToBand,
  cloneElementorData,
} from "@/lib/elementor-page-content/elementor-band-edit";
import {
  parseElementorDataJson,
  parseElementorSectionOutline,
  type ElementorSectionHeader,
} from "@/lib/elementor-page-content/parse-elementor-section-outline";
import {
  buildElementorSectionContext,
  headerPromptForSectionContext,
} from "@/lib/elementor-page-content/elementor-section-context";
import { extractExactInternalLinkTagsFromHtml } from "@/lib/overview/overview-blog-links-extract";
import { prosePlainText } from "@/lib/elementor-page-content/extract-text-editor-prose";

type ElementorNode = {
  id?: string;
  elType?: string;
  elements?: ElementorNode[];
};

export type ElementorSectionCopyKind = "section-header" | "section-content";

function findTopLevelBandIndex(data: ElementorNode[], sectionId: string): number {
  return data.findIndex((node) => node?.id === sectionId);
}

function applyBodyToBand(band: ElementorNode, bodyHtml: string): boolean {
  return applyBodyHtmlToBand(band, bodyHtml);
}

function stripJsonFences(text: string): string {
  let s = text.trim();
  const open = s.match(/^```(?:json)?\s*\n?/i);
  if (open) s = s.slice(open[0].length);
  const close = s.match(/\n?```\s*$/);
  if (close) s = s.slice(0, s.length - close[0].length);
  return s.trim();
}

function sectionFullBodyHtml(section: ElementorSectionHeader): string {
  if (section.headingInBodyHtml && section.headingHtml.trim()) {
    const body = section.bodyHtml?.trim() || section.bodyText?.trim() || "";
    return body ? `${section.headingHtml.trim()}\n${body}` : section.headingHtml.trim();
  }
  return section.bodyHtml?.trim() || section.bodyText?.trim() || "";
}

function replaceInlineHeadingTitle(headingHtml: string, title: string): string {
  return headingHtml.replace(
    /^(<h[1-6]\b[^>]*>)([\s\S]*?)(<\/h[1-6]>)$/i,
    (_, open: string, _inner: string, close: string) => `${open}${title.trim()}${close}`,
  );
}

function sectionBodyStats(html: string): { paragraphs: number; listBlocks: number; words: number } {
  const trimmed = html.trim();
  const paragraphs = trimmed.match(/<p\b/gi)?.length ?? (trimmed ? 1 : 0);
  const listBlocks = trimmed.match(/<(?:ul|ol)\b/gi)?.length ?? 0;
  const words = prosePlainText(trimmed).split(/\s+/).filter(Boolean).length;
  return { paragraphs, listBlocks, words };
}

async function generateSectionCopy(args: {
  kind: ElementorSectionCopyKind;
  section: ElementorSectionHeader;
  focusKeyword: string;
  pageTitle?: string;
  businessName?: string;
  seoResearch?: string;
  siteBaseUrl?: string;
  pageUrl?: string;
  sectionContextPrompt?: string;
  headerStylePrompt?: string;
  allowedHtmlTags?: string[];
  forbiddenHtmlTags?: string[];
  apiKey: string;
  model?: string;
}): Promise<{ title?: string; bodyHtml?: string }> {
  const {
    kind,
    section,
    focusKeyword,
    pageTitle,
    businessName,
    seoResearch,
    siteBaseUrl,
    pageUrl,
    sectionContextPrompt,
    headerStylePrompt,
    allowedHtmlTags,
    forbiddenHtmlTags,
    apiKey,
    model,
  } = args;
  const allowedLabel = allowedHtmlTags?.length ? allowedHtmlTags.join(", ") : "<p>, <a href>";
  const forbiddenLabel = forbiddenHtmlTags?.length
    ? forbiddenHtmlTags.join(", ")
    : "<table>, markdown";

  const system =
    kind === "section-header"
      ? [
          "Rewrite one Elementor section heading for SEO and on-page context.",
          AISEO_FULL_REWRITE_SYSTEM_RULE,
          'Return JSON only: {"title":"..."}. Plain title text, no markdown or HTML.',
          headerStylePrompt ?? "One concise section heading.",
        ].join(" ")
      : [
          "You fully rewrite one existing Elementor section body for SEO and AI citation clarity.",
          AISEO_FULL_REWRITE_SYSTEM_RULE,
          'Return JSON only: {"bodyHtml":"..."}.',
          "Read the full CURRENT SECTION in the user message before writing.",
          "Keep the same topics, factual coverage, and detail level. Never summarize. Never shorten. Never replace a full section with a blurb.",
          "Rephrase every non-link sentence; do not copy phrasing verbatim.",
          "Every existing internal link tag must appear in bodyHtml exactly as provided in LOCKED INTERNAL LINKS (same href and anchor text).",
          "Do NOT add links. Do NOT remove links. Do NOT change any href or anchor on existing links.",
          "Follow every COPY BLUEPRINT checklist item. Allowed HTML and forbidden HTML are layout constraints only.",
          "When COPY BLUEPRINT forbids lists and CURRENT SECTION has a list, convert each list item into its own <p> (preserve every item and detail, no lists in output).",
          `Allowed HTML: ${allowedLabel}. Forbidden HTML: ${forbiddenLabel}.`,
        ].join(" ");

  const currentBody = sectionFullBodyHtml(section);
  const currentStructure = sectionBodyStats(currentBody);
  const lockedLinkTags =
    siteBaseUrl?.trim() && kind === "section-content"
      ? extractExactInternalLinkTagsFromHtml(currentBody, siteBaseUrl.trim(), pageUrl)
      : [];
  const lockedHeadingBlock =
    section.headingInBodyHtml && section.headingHtml.trim()
      ? `LOCKED SECTION HEADING (mandatory — keep this exact tag at the top of bodyHtml, unchanged):\n${section.headingHtml.trim()}`
      : "";
  const lockedLinksBlock =
    lockedLinkTags.length > 0
      ? [
          "LOCKED INTERNAL LINKS (mandatory — copy each tag below into bodyHtml exactly as written):",
          ...lockedLinkTags.map((tag, i) => `${i + 1}. ${tag}`),
        ].join("\n")
      : "LOCKED INTERNAL LINKS: none in this section. Do not add any internal links.";

  if (kind === "section-header") {
    const user = [
      sectionContextPrompt?.trim() ?? "",
      `Page title: ${pageTitle?.trim() || "Unknown page"}`,
      businessName?.trim()
        ? `Business name (use this brand only): ${businessName.trim()}`
        : "",
      `Focus keyword: ${focusKeyword}`,
      `Current heading widget text: ${section.title?.trim() || "(empty)"}`,
      "Write one section heading. Heading only, never body copy or a paragraph.",
      "Use the page business name. Never invent a different company.",
      AISEO_FULL_REWRITE_HEADING_OUTPUT_CONTRACT,
      'Return JSON: {"title":"..."} with plain text only.',
    ]
      .filter(Boolean)
      .join("\n\n");

    const { content } = await streamChatCompletion({
      apiKey,
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.5,
      maxTokens: 512,
      topP: 1,
      onContentChunk: () => {},
    });

    const parsed = JSON.parse(stripJsonFences(content || "{}")) as { title?: string };
    const rawTitle = parsed.title?.trim();
    if (!rawTitle) {
      throw new Error("Elementor heading optimize returned empty title in JSON.");
    }
    assertAiseoHeadingRewriteChanged(section.title?.trim() || "", rawTitle);
    return { title: rawTitle };
  }

  const user = [
    `CURRENT SECTION (read this entire block before writing):\n${currentBody}`,
    `CURRENT STRUCTURE: ${currentStructure.paragraphs} paragraph(s), ${currentStructure.listBlocks} list block(s), ~${currentStructure.words} words.`,
    sectionContextPrompt?.trim() ?? "",
    lockedHeadingBlock,
    lockedLinksBlock,
    `Page title: ${pageTitle?.trim() || section.title}`,
    `Page focus keyword (use once naturally in non-link prose): ${focusKeyword}`,
    `Section title (unchanged): ${section.title}`,
    seoResearch?.trim()
      ? `Research brief (use specific angles, entities, and benefits from here):\n${seoResearch.trim().slice(0, 3000)}`
      : "No research brief on this row. Still fully rewrite the current section for the focus keyword.",
    [
      "Your bodyHtml must keep CURRENT SECTION coverage and detail while fully rewriting prose.",
      "Keep LOCKED SECTION HEADING and every LOCKED INTERNAL LINK tag unchanged.",
      "Rephrase every non-link sentence. Do not drop paragraphs, list items, offers, or themes.",
      "Obey every COPY BLUEPRINT checklist item (including list-to-paragraph conversion when lists are forbidden).",
      AISEO_FULL_REWRITE_BODY_OUTPUT_CONTRACT,
      businessName?.trim()
        ? `Use business name ${businessName.trim()} only — never invent other companies.`
        : "",
    ].join(" "),
  ]
    .filter(Boolean)
    .join("\n\n");

  const beforeBodyForCompare =
    section.headingInBodyHtml && section.headingHtml.trim()
      ? (section.bodyHtml?.trim() || section.bodyText?.trim() || "")
      : currentBody;

  const { content } = await streamChatCompletion({
    apiKey,
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.5,
    maxTokens: 8192,
    topP: 1,
    onContentChunk: () => {},
  });

  const parsed = JSON.parse(stripJsonFences(content || "{}")) as {
    bodyHtml?: string;
  };

  const rawBody = parsed.bodyHtml?.trim();
  if (!rawBody) {
    throw new Error("Elementor section optimize returned empty bodyHtml in JSON.");
  }

  let bodyHtml = rawBody;
  if (section.headingInBodyHtml && section.headingHtml.trim()) {
    bodyHtml = bodyHtml.startsWith(section.headingHtml.trim())
      ? bodyHtml.slice(section.headingHtml.trim().length).trim()
      : bodyHtml;
  }

  assertAiseoBodyRewriteChanged(beforeBodyForCompare, bodyHtml);
  return { bodyHtml };
}

export async function applyElementorSectionCopy(args: {
  elementorJson: string;
  sectionId: string;
  kind: ElementorSectionCopyKind;
  section: ElementorSectionHeader;
  focusKeyword: string;
  pageTitle?: string;
  businessName?: string;
  seoResearch?: string;
  siteBaseUrl?: string;
  pageUrl?: string;
  apiKey: string;
  model?: string;
}): Promise<unknown[]> {
  const data = cloneElementorData(parseElementorDataJson(args.elementorJson)) as ElementorNode[];
  const bandIndex = findTopLevelBandIndex(data, args.sectionId);
  if (bandIndex < 0) return data;

  const allSections = parseElementorSectionOutline(data);
  const sectionContext = buildElementorSectionContext(
    args.elementorJson,
    args.sectionId,
    args.section,
    allSections,
  );

  const generated = await generateSectionCopy({
    kind: args.kind,
    section: args.section,
    focusKeyword: args.focusKeyword,
    pageTitle: args.pageTitle,
    businessName: args.businessName,
    seoResearch: args.seoResearch,
    siteBaseUrl: args.siteBaseUrl,
    pageUrl: args.pageUrl,
    sectionContextPrompt: sectionContext.promptBlock,
    headerStylePrompt: headerPromptForSectionContext(sectionContext),
    allowedHtmlTags: sectionContext.copyBlueprint.allowedTags,
    forbiddenHtmlTags: sectionContext.copyBlueprint.forbiddenTags,
    apiKey: args.apiKey,
    model: args.model,
  });

  const band = data[bandIndex]!;
  if (args.kind === "section-header") {
    if (generated.title) applyHeaderToBand(band, generated.title);
  } else {
    let bodyToApply = generated.bodyHtml!;
    if (args.section.headingInBodyHtml && args.section.headingHtml.trim()) {
      bodyToApply = `${args.section.headingHtml.trim()}\n${bodyToApply.trim()}`;
    }
    if (bodyToApply.trim()) applyBodyToBand(band, bodyToApply);
  }

  return data;
}

export function sectionOutlineFromJson(elementorJson: string): ElementorSectionHeader[] {
  return parseElementorSectionOutline(parseElementorDataJson(elementorJson));
}

function plainTextToEditorHtml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;
  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.trim()}</p>`)
    .join("");
}

export function patchElementorSectionInJson(
  elementorJson: string,
  sectionId: string,
  patch: { title?: string; bodyText?: string; bodyHtml?: string },
): string {
  const data = cloneElementorData(parseElementorDataJson(elementorJson)) as ElementorNode[];
  const bandIndex = findTopLevelBandIndex(data, sectionId);
  if (bandIndex < 0) return elementorJson;
  const band = data[bandIndex]!;
  const section = parseElementorSectionOutline(data).find((entry) => entry.id === sectionId);

  if (patch.title != null && section) {
    if (section.hasHeadingWidget) {
      applyHeaderToBand(band, patch.title);
    } else if (section.headingInBodyHtml && section.headingHtml.trim()) {
      const nextHeading = replaceInlineHeadingTitle(section.headingHtml, patch.title);
      const bodyPart = section.bodyHtml?.trim() || "";
      applyBodyToBand(band, bodyPart ? `${nextHeading}\n${bodyPart}` : nextHeading);
    }
  }

  const nextBodyHtml =
    patch.bodyHtml != null
      ? patch.bodyHtml.trim()
      : patch.bodyText != null
        ? plainTextToEditorHtml(patch.bodyText)
        : null;

  if (nextBodyHtml != null && section) {
    if (section.headingInBodyHtml && section.headingHtml.trim()) {
      applyBodyToBand(band, `${section.headingHtml.trim()}\n${nextBodyHtml}`);
    } else {
      applyBodyToBand(band, nextBodyHtml);
    }
  }

  return JSON.stringify(data);
}
