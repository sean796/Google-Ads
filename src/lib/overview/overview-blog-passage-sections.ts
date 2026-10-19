import { stitchHarnessSections } from "@/lib/bulk/bulk-harness-outline";
import { parseJsonStrict } from "@/lib/json-repair-utility";
import { callAgentCategoryOpenRouterChat } from "@/lib/openrouter-agent-category-api";
import {
  findH2OpenPositions,
} from "@/lib/overview/overview-blog-overview-prepend";
import { plainTextFromH2InnerHtml } from "@/lib/overview/overview-blog-headers-extract";
import { scrubOverviewContentOutput } from "@/lib/content-word-blocklist";
import {
  normalizeSectionProseHtml,
  prosePlainText,
} from "@/lib/elementor-page-content/extract-text-editor-prose";
import { extractExactInternalLinkTagsFromHtml } from "@/lib/overview/overview-blog-links-extract";
import {
  AISEO_FULL_REWRITE_BODY_OUTPUT_CONTRACT,
  AISEO_FULL_REWRITE_HEADING_OUTPUT_CONTRACT,
  AISEO_FULL_REWRITE_SYSTEM_RULE,
  assertAiseoBodyRewriteChanged,
  assertAiseoHeadingRewriteChanged,
} from "@/lib/content-optimization/aiseo-full-rewrite-contract";

export type BlogPassageSection = {
  id: string;
  index: number;
  /** Original opening tag, e.g. `<h2 id="why-wordpress-maintenance">` or `<h2>` */
  h2OpenTag: string;
  title: string;
  bodyHtml: string;
};

export type ParsedBlogPassageDocument = {
  leadingHtml: string;
  sections: BlogPassageSection[];
};

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Split core article HTML (after Answer/Overview and before trailing FAQ) into discrete H2 sections
 * for passage-level editing and optimization.
 */
export function splitHtmlBodyIntoH2PassageSections(html: string): ParsedBlogPassageDocument {
  const src = (html ?? "").trim();
  if (!src) {
    return { leadingHtml: "", sections: [] };
  }

  const positions = findH2OpenPositions(src);
  if (positions.length === 0) {
    return { leadingHtml: src, sections: [] };
  }

  const leadingHtml = src.slice(0, positions[0]!).trim();
  const sections: BlogPassageSection[] = [];
  const low = src.toLowerCase();

  for (let i = 0; i < positions.length; i += 1) {
    const openAt = positions[i]!;
    const nextOpenAt = i + 1 < positions.length ? positions[i + 1]! : src.length;
    const gt = src.indexOf(">", openAt);
    if (gt === -1 || gt >= nextOpenAt) continue;

    const h2OpenTag = src.slice(openAt, gt + 1);
    const closeAt = low.indexOf("</h2>", gt + 1);
    if (closeAt === -1 || closeAt >= nextOpenAt) continue;

    const rawTitleInner = src.slice(gt + 1, closeAt);
    const title = plainTextFromH2InnerHtml(rawTitleInner);
    const bodyStart = closeAt + "</h2>".length;
    const bodyHtml = src.slice(bodyStart, nextOpenAt).trim();

    const idMatch = /\bid\s*=\s*["']([^"']+)["']/i.exec(h2OpenTag);
    const id = idMatch?.[1]?.trim() || `passage-h2-${i}`;

    sections.push({
      id,
      index: i,
      h2OpenTag,
      title,
      bodyHtml,
    });
  }

  return { leadingHtml, sections };
}

/**
 * Stitch discrete H2 passage sections back into clean HTML while preserving H2 attributes (like `#id` jump anchors).
 */
export function stitchHtmlBodyFromH2PassageSections(doc: ParsedBlogPassageDocument): string {
  const parts: string[] = [];
  if (doc.leadingHtml.trim()) {
    parts.push(doc.leadingHtml.trim());
  }

  for (const sec of doc.sections) {
    const openTag = sec.h2OpenTag.trim() || "<h2>";
    const headingLine = `${openTag}${escapeHtmlText(sec.title.trim())}</h2>`;
    const body = sec.bodyHtml.trim();
    parts.push(body ? `${headingLine}\n${body}` : headingLine);
  }

  return parts.join("\n\n").trim();
}

/** Full post HTML: Answer, Overview, H2 core, trailing FAQ. */
export function stitchOverviewBlogPostHtml(args: {
  ansHtml: string;
  ovHtml: string;
  leadingHtml: string;
  sections: BlogPassageSection[];
  trailingFaq: string;
}): string {
  const nextCore = stitchHtmlBodyFromH2PassageSections({
    leadingHtml: args.leadingHtml,
    sections: args.sections,
  });
  return stitchHarnessSections(
    [args.ansHtml, args.ovHtml, nextCore, args.trailingFaq].filter((part) =>
      Boolean(part?.trim()),
    ),
  );
}

export type PassageRewriteMode = "header" | "copy" | "both";

export async function rewriteBlogPassageSection(args: {
  mode: PassageRewriteMode;
  section: BlogPassageSection;
  siblingTitles: string[];
  articleTitle: string;
  focusKeyword: string;
  seoResearchBrief?: string;
  siteId?: string | null;
  siteUrl?: string;
  pageUrl?: string;
  businessName?: string;
  apiKey?: string;
}): Promise<{ title: string; bodyHtml: string }> {
  const {
    mode,
    section,
    siblingTitles,
    articleTitle,
    focusKeyword,
    seoResearchBrief,
    siteId,
    siteUrl,
    pageUrl,
    businessName,
    apiKey,
  } = args;

  const lockedLinks =
    siteUrl?.trim() && mode !== "header"
      ? extractExactInternalLinkTagsFromHtml(section.bodyHtml, siteUrl.trim(), pageUrl)
      : [];

  const lockedLinksBlock =
    lockedLinks.length > 0
      ? [
          "LOCKED LINKS (mandatory - preserve every <a> tag below with identical href and anchor text in bodyHtml):",
          ...lockedLinks.map((tag, idx) => `${idx + 1}. ${tag}`),
        ].join("\n")
      : "LOCKED LINKS: keep any existing <a href> links intact; do not invent broken URLs.";

  if (mode === "header") {
    const system = [
      "You are a Mastra AISEO Passage Heading Optimizer.",
      AISEO_FULL_REWRITE_SYSTEM_RULE,
      "Rewrite the single H2 heading so it is specific, search-intent aligned, and distinct from sibling H2s.",
      'Return JSON only: {"title":"..."}. Plain text only, no HTML tags or colons.',
    ].join(" ");

    const user = [
      `Article title: ${articleTitle || "(untitled)"}`,
      `Focus keyword: ${focusKeyword || "(none)"}`,
      businessName ? `Business name: ${businessName}` : "",
      `Sibling H2 headings: ${siblingTitles.filter(Boolean).join(" | ") || "(none)"}`,
      `Current H2 heading: ${section.title}`,
      `Passage content summary:\n${section.bodyHtml.slice(0, 1200)}`,
      'Return JSON: {"title":"..."}',
    ]
      .filter(Boolean)
      .join("\n\n");

    const { content } = await callAgentCategoryOpenRouterChat({
      category: "blog",
      siteId,
      apiKey,
      system,
      user,
      temperature: 0.35,
      maxTokens: 512,
      responseFormat: { type: "json_object" },
      useMasterInstructions: true,
      useWordBlacklist: true,
    });

    const parsed = parseJsonStrict<{ title?: string }>(content);
    const rawTitle = parsed.title?.trim();
    if (!rawTitle) {
      throw new Error("Heading rewrite returned empty title in JSON.");
    }
    const title = scrubOverviewContentOutput(rawTitle);
    if (!title.trim()) {
      throw new Error("Heading rewrite title was empty after scrub.");
    }
    assertAiseoHeadingRewriteChanged(section.title, title);
    return {
      title,
      bodyHtml: section.bodyHtml,
    };
  }

  const system =
    mode === "copy"
      ? [
          "You are a Mastra AISEO Passage Optimizer.",
          AISEO_FULL_REWRITE_SYSTEM_RULE,
          "Fully rewrite this H2 passage body for passage-level ranking, AI Overviews citation clarity, and factual specificity.",
          'Return JSON only: {"bodyHtml":"..."}.',
          "Do NOT include the outer <h2> tag in bodyHtml.",
          "Keep the same section depth, HTML structure (<p>, <ul>, <ol>, <table>, <h3>, <blockquote>), facts, and every LOCKED LINK.",
          "Obey the WORD BLACKLIST in the user message (no em dashes, no banned words).",
        ].join(" ")
      : [
          "You are a Mastra AISEO Passage & Heading Optimizer.",
          AISEO_FULL_REWRITE_SYSTEM_RULE,
          "Fully rewrite the H2 heading and passage body for passage-level ranking, AI Overviews citation clarity, and factual specificity.",
          'Return JSON only: {"title":"...","bodyHtml":"..."}.',
          "Do NOT include the outer <h2> tag inside bodyHtml.",
          "Keep the same section depth, HTML structure, facts, and every LOCKED LINK.",
          "Obey the WORD BLACKLIST in the user message (no em dashes, no banned words).",
        ].join(" ");

  const user = [
    `Article title: ${articleTitle || "(untitled)"}`,
    `Focus keyword: ${focusKeyword || "(none)"}`,
    businessName ? `Business name: ${businessName}` : "",
    `Current H2 heading: ${section.title}`,
    `CURRENT PASSAGE HTML:\n${section.bodyHtml}`,
    lockedLinksBlock,
    seoResearchBrief?.trim()
      ? `RESEARCH BRIEF CONTEXT:\n${seoResearchBrief.trim().slice(0, 2500)}`
      : "",
    mode === "copy"
      ? 'Return JSON only: {"bodyHtml":"..."}'
      : 'Return JSON only: {"title":"...","bodyHtml":"..."}',
    AISEO_FULL_REWRITE_BODY_OUTPUT_CONTRACT,
    mode === "both" ? AISEO_FULL_REWRITE_HEADING_OUTPUT_CONTRACT : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const { content } = await callAgentCategoryOpenRouterChat({
    category: "blog",
    siteId,
    apiKey,
    system,
    user,
    temperature: 0.5,
    maxTokens: 4096,
    responseFormat: { type: "json_object" },
    useMasterInstructions: true,
    useWordBlacklist: true,
  });

  const parsed = parseJsonStrict<{ title?: string; bodyHtml?: string }>(content);
  const rawBody = parsed.bodyHtml?.trim();
  if (!rawBody) {
    throw new Error("Passage rewrite returned empty bodyHtml in JSON.");
  }
  const bodyHtml = scrubOverviewContentOutput(normalizeSectionProseHtml(rawBody));
  if (!prosePlainText(bodyHtml).trim()) {
    throw new Error("Passage rewrite bodyHtml was empty after normalize and scrub.");
  }
  assertAiseoBodyRewriteChanged(section.bodyHtml, bodyHtml);

  let title = section.title;
  if (mode === "both") {
    const rawTitle = parsed.title?.trim();
    if (!rawTitle) {
      throw new Error("Passage rewrite returned empty title in JSON.");
    }
    const nextTitle = scrubOverviewContentOutput(rawTitle).trim();
    if (!nextTitle) {
      throw new Error("Passage rewrite title was empty after scrub.");
    }
    assertAiseoHeadingRewriteChanged(section.title, nextTitle);
    title = nextTitle;
  }

  return {
    title,
    bodyHtml,
  };
}

type LeadRewriteCtx = Omit<
  Parameters<typeof rewriteBlogPassageSection>[0],
  "section" | "siblingTitles" | "mode"
> & { siblingTitles?: string[] };

/** Rewrite an Answer/Overview block (or other lead HTML) as one passage. */
export async function rewriteBlogLeadSectionBlock(
  sectionHtml: string,
  ctx: LeadRewriteCtx,
): Promise<string> {
  const src = (sectionHtml ?? "").trim();
  if (!src) return src;

  const parsed = splitHtmlBodyIntoH2PassageSections(src);
  const siblingTitles = ctx.siblingTitles ?? [];

  if (parsed.sections.length === 0) {
    const rewritten = await rewriteBlogPassageSection({
      ...ctx,
      mode: "copy",
      section: {
        id: "lead-block",
        index: 0,
        h2OpenTag: "<h2>",
        title: "Lead",
        bodyHtml: src,
      },
      siblingTitles,
    });
    return normalizeSectionProseHtml(rewritten.bodyHtml);
  }

  const sec = parsed.sections[0]!;
  const rewritten = await rewriteBlogPassageSection({
    ...ctx,
    mode: "copy",
    section: sec,
    siblingTitles,
  });
  const bodyHtml = normalizeSectionProseHtml(rewritten.bodyHtml);
  const title = rewritten.title?.trim() || sec.title;
  const leading = parsed.leadingHtml.trim();
  const head = `${sec.h2OpenTag}${title}</h2>${bodyHtml}`;
  return leading ? `${leading}\n${head}`.trim() : head;
}
