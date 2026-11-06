function parseImageFeature(feature: string): { alt: string; url: string } | null {
  const trimmed = feature.trim();
  const md = trimmed.match(/^\[IMAGE\]\s*:\s*!\[([^\]]*)\]\(([^)]+)\)/i);
  if (md) return { alt: (md[1] ?? "").trim(), url: (md[2] ?? "").trim() };
  const html = trimmed.match(/^\[IMAGE\]\s*:\s*<img[^>]+src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?/i);
  if (html) return { alt: (html[2] ?? "").trim(), url: (html[1] ?? "").trim() };
  return null;
}

import { TABLE_NO_LINK_ONLY_COLUMN_RULE } from "@/lib/prompt-builders/table-prompt-rules";
import {
  MIN_INTERNAL_LINKS_PER_BODY_H2,
  TARGET_INTERNAL_LINKS_PER_BODY_H2,
} from "@/lib/content-generation/link-anchor-text-case";

/** Writer contract: markdown quotes use `>`, never the word blockquote as a wrapper. */
export const MARKDOWN_QUOTE_OUTPUT_RULE =
  "Quotes: start the line with > then a space then the sentence (example: > We size each array for the roof). Forbidden: wrapping the quote with the word blockquote, [BLOCKQUOTE] in the article, or HTML quote tags.";

/** Writer contract: HTML quotes use real tags, never the word blockquote as a wrapper. */
export const HTML_QUOTE_OUTPUT_RULE =
  "Quotes: output <blockquote><p>sentence</p></blockquote>. Forbidden: wrapping the quote with the word blockquote or [BLOCKQUOTE] in the article.";

export const mapFeatureToInstruction = (
  feature: string,
  format: 'markdown' | 'html' = 'html',
  opts?: { illustrativeContext?: boolean },
): string => {
  const normalizedFeature = feature.toLowerCase().trim();
  const useMarkdown = format === 'markdown';

  const imageFeature = parseImageFeature(feature);
  if (imageFeature?.url) {
    const safeAlt = imageFeature.alt.replace(/"/g, "&quot;");
    const safeUrl = imageFeature.url.replace(/"/g, "&quot;");
    if (useMarkdown) {
      return `[IMAGE EMBED - MANDATORY]: After the first paragraph in this section, output exactly: ![${imageFeature.alt.replace(/[[\]]/g, "")}](${imageFeature.url}). NEVER use [text](${imageFeature.url}). The image must render inline, not as a keyword link. NEVER omit this image.`;
    }
    return `[IMAGE EMBED - MANDATORY]: After the first <p> in this section, output exactly: <figure class="wp-block-image size-full"><img src="${safeUrl}" alt="${safeAlt}" loading="lazy" /></figure>. NEVER use <a href="${safeUrl}">. Images must display as <img>, not text links to the PNG/JPEG. NEVER append a standalone link-only <p> at the section or article end.`;
  }

  // 0. Preserve [CUSTOM] table data - do not replace with generic instruction
  const trimmed = feature.trimStart();
  if (trimmed.toLowerCase().startsWith('[custom]:') && feature.includes('|')) {
    const hasSeparator = /\|[\s\-:]+\|/.test(feature);
    if (hasSeparator) {
      return `[CRITICAL: OUTPUT THIS EXACT TABLE VERBATIM. Do not change columns, headers, or data. Do not add/remove rows. Do not invent values.] ${feature}`;
    }
  }

  // 1. Check for table-like instructions (e.g., user supplies column headers)
  if (feature.includes('|')) {
    return useMarkdown
      ? `[CRITICAL: Markdown table ONLY. Use | Col1 | Col2 |, newline, | --- | --- |, newline, | A | B |. Same-site links as [[LINK:query|anchor]] in substantive cells only. Never [text](https://...). ${TABLE_NO_LINK_ONLY_COLUMN_RULE}]`
      : `[CRITICAL: HTML table ONLY. NEVER markdown (| col | or |---|). Use <table><thead><tr><th>H1</th><th>H2</th></tr></thead><tbody><tr><td>...</td><td>...</td></tr></tbody></table>. Same-site links as [[LINK:query|anchor]] inside substantive cells only. Never raw <a href> or [text](url). ${TABLE_NO_LINK_ONLY_COLUMN_RULE}]`;
  }

  if (normalizedFeature.startsWith("[table]")) {
    return useMarkdown
      ? `[TABLE - MANDATORY]: Markdown pipe table with substantive columns only. ${TABLE_NO_LINK_ONLY_COLUMN_RULE}`
      : `[TABLE - MANDATORY]: HTML table with substantive columns only. ${TABLE_NO_LINK_ONLY_COLUMN_RULE}`;
  }

  if (normalizedFeature.startsWith("[illustrative]")) {
    return useMarkdown
      ? "[ILLUSTRATIVE - MANDATORY]: Copy ILLUSTRATIVE EXAMPLE — one decision matching Answer and Keyword, compact. Forbidden: Homeowner A/B, a different vertical than Answer, product tours, keyword slug phrasing."
      : "[ILLUSTRATIVE - MANDATORY]: Copy ILLUSTRATIVE EXAMPLE — one decision matching Answer and Keyword, compact (this section's unique planner H2 + summary p + blockquote + Recommendation h3 + p). Forbidden: retitling to a stock label, a second homeowner H2, Homeowner A/B, a different vertical than Answer, product catalog tours, keyword slug phrasing, Scenario: label, links in headings.";
  }

  if (normalizedFeature.startsWith("[blockquote]")) {
    if (opts?.illustrativeContext) {
      return useMarkdown
        ? `[BLOCKQUOTE - MANDATORY ILLUSTRATIVE]: After the summary paragraph, scenario prose inside > blockquote. Persona name in quote only. Forbidden: "Scenario:" label; Scenario as a ### heading. ${MARKDOWN_QUOTE_OUTPUT_RULE}`
        : `[BLOCKQUOTE - MANDATORY ILLUSTRATIVE]: After the summary <p>, scenario prose inside <blockquote><p>…</p></blockquote>. Persona name in quote only. Weave the CITY INTERNAL LINK [[LINK]] from ILLUSTRATIVE EXAMPLE inside that sentence. Forbidden: a location cite as the first child of the blockquote; "Scenario:" label; Scenario as an H3 heading. ${HTML_QUOTE_OUTPUT_RULE}`;
    }
    return useMarkdown
      ? `[BLOCKQUOTE - MANDATORY]: After the first paragraph, output one entity fact as a markdown quote. ${MARKDOWN_QUOTE_OUTPUT_RULE}`
      : `[BLOCKQUOTE - MANDATORY]: After the first paragraph, output one entity fact as an HTML quote. ${HTML_QUOTE_OUTPUT_RULE}`;
  }
  
  if (normalizedFeature.startsWith("[decision]")) {
    return "[DECISION]: Include one chooser object in this section: an If you have / choose table, or a short Choose A when / Choose B when pair. Include If {named constraint}, choose {option} sentences here and/or in [RECOMMENDATION] (article total 2-4). Use only facts in the prompt sources. Forbidden: empty if-you-want-quality chains.";
  }
  if (normalizedFeature.startsWith("[recommendation]")) {
    return "[RECOMMENDATION]: Answer so what should I actually buy. Output an extractable Best for {job}: {option} list (4-6 rows when sources have options) then one closing sentence with the connected business name and a sourced installer constraint. Use only options in prompt sources. Forbidden: generic next-step with no pick.";
  }
  if (normalizedFeature.startsWith("[tradeoff]")) {
    return "[TRADEOFF]: State a real limitation or skip-this-when case. Do not invent drawbacks that contradict supplied sources.";
  }

  if (normalizedFeature.startsWith("[list]")) {
    return useMarkdown
      ? "[LIST - MANDATORY]: Unordered facts use - Label: sentence on one line, or 1. 2. 3. for steps. Markdown only."
      : "[LIST - MANDATORY]: HTML only. Labeled bullets: <ul><li><strong>Label</strong>: one sentence.</li></ul>. Numbered steps: <ol><li><strong>Step</strong>: one sentence.</li></ol>. Forbidden: **Label**:, - bullets, or 1. markdown in HTML.";
  }

  // 2. Check for FAQ feature — body FAQ is appended later as flo-faq Question/Answer table (Content Opt parity).
  if (normalizedFeature.includes('[faq]') || normalizedFeature.includes('faq')) {
    return useMarkdown
      ? `[FAQ: Do NOT write an FAQ section in this body. FAQ is appended later as H2 "FAQ" + intro + Question/Answer table. Omit FAQ headings, tables, and Q/A pairs here.]`
      : `[FAQ: Do NOT write an FAQ section in this body. FAQ is appended later as flo-faq with H2 id="faq" "FAQ" + intro + HTML Question/Answer table. Omit FAQ headings, tables, and Q/A pairs here.]`;
  }
  
  // 3. Link placeholders (harness internal links)
  if (normalizedFeature.startsWith("[link]")) {
    return useMarkdown
      ? `[LINK: Use ${MIN_INTERNAL_LINKS_PER_BODY_H2}-${TARGET_INTERNAL_LINKS_PER_BODY_H2} [[LINK:query|anchor]] placeholders woven into sentences and table cells. Brand, product, and service queries use PAGES titles. Informational queries use BLOG POSTS titles. No raw https:// internal URLs.]`
      : `[LINK: Use ${MIN_INTERNAL_LINKS_PER_BODY_H2}-${TARGET_INTERNAL_LINKS_PER_BODY_H2} [[LINK:query|anchor]] placeholders woven into sentences and table cells. Brand, product, and service queries use PAGES titles. Informational queries use BLOG POSTS titles. No raw https:// internal URLs in body HTML.]`;
  }

  // 4. Original switch for predefined features
  switch(normalizedFeature) {
    case 'i need an image':
      return '[Insert: Image, specify format e.g. PNG, JPEG, or embed a Markdown link to a figurative image/chart/gif/etc in the generated text]';
    case 'i need 3-5 links':
      return '[Insert: Page Links (e.g., internal/external links related to the topic). CRITICAL: Ensure at least 3, but no more than 5, high-quality, relevant links are included. Ensure links are naturally woven into the prose, never ending a sentence with an anchor, and are surrounded by optimize SEO text.]';
    case 'i need a video':
       return '[Insert: Video, specify an embed or a link to a relevant video in the generated text]';
    default:
      return feature;
  }
};
