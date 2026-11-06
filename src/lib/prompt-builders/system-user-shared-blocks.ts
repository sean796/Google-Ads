import { ARTICLE_MAX_WORDS } from "@/lib/content-generation/article-length-policy";
import { INTERNAL_LINK_INTENT_ROUTING_RULE } from "@/lib/bulk/bulk-generation-wp-inventory";
import type { ExternalLinkPair } from "@/lib/content-generation/external-link-placeholders";
import { getLocalEntityPhraseExamples, getLocalGeneralPhrase } from "../local-entity-phrases";
import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import { entityLabelForProse, formatEntityReferencePromptBlock } from "@/lib/entity-place-reference";
import { TABLE_FORMAT, TABLE_FORMAT_MARKDOWN, NO_FAKE_TESTIMONIALS_RULE, TABLE_NO_LINK_ONLY_COLUMN_RULE, AUTHENTICITY_WRITER_RULE } from "./core";
import { HARNESS_LABELED_LIST_HTML_RULE } from "@/lib/prompt-builders/harness-labeled-list-html-rule";
import { A_PLUS_HOMEOWNER_ARTICLE_RULE, A_PLUS_KEYWORD_AUTHORITY_RULE, AISO_AUTHORITY_PHRASING_RULE, AISO_DEPTH_RULE, COMPARISON_ANSWER_RULE, AUTOMATION_TIER_TAXONOMY_RULE, INSTALLER_EXPERTISE_GATE_RULE, INTERNAL_LINK_ANCHOR_MATCH_RULE, isComparisonPrimaryKeyword, isAutomationTierTopic } from "@/lib/content-optimization/first-party-authority-prompt";

export function connectedSiteTopicAisoRules(primaryKeyword: string): string {
  const chunks: string[] = [INTERNAL_LINK_ANCHOR_MATCH_RULE];
  if (isComparisonPrimaryKeyword(primaryKeyword)) chunks.push(COMPARISON_ANSWER_RULE);
  if (isAutomationTierTopic(primaryKeyword)) chunks.push(AUTOMATION_TIER_TAXONOMY_RULE);
  return `\n${chunks.join("\n")}`;
}

// --- Shared rule blocks (DRY) ---

/** Distinct Semrush outbound targets: 1–2 use all; 3+ use 3–5 (capped by list size). */
export function semrushTargetDistinctCount(urlCount: number): number {
  if (urlCount <= 0) return 0;
  if (urlCount <= 2) return urlCount;
  return Math.min(5, urlCount);
}

/** Stops models from appending fake © / "All rights reserved" / invented brand footers (common hallucination). */
export const NO_COPYRIGHT_FAKE_BRAND_RULE = `**NO COPYRIGHT OR FAKE SITE FOOTER (NON-NEGOTIABLE)**: Never output "©", "Copyright" plus a year, "All rights reserved", or invented business/brand names (e.g. placeholder sites like "MyGlamping"). If TARGET SITE names a real business, use only that name when relevant - never invent a different company name. Do not end the article with legal boilerplate or stock footer lines.`;

export const LINK_RULES = (
  siteUrl: string,
  currentPageUrl?: string,
  semrushExternalUrls?: string[],
  portfolioBlockedHosts?: string[],
) => {
  const list = (semrushExternalUrls ?? []).map((u) => (typeof u === "string" ? u.trim() : "")).filter(Boolean);
  const hasSemrush = list.length > 0;
  const t = semrushTargetDistinctCount(list.length);
  const externalRule = hasSemrush
    ? `(2) External - NON-NEGOTIABLE: When APPROVED EXTERNAL URLs (SEMRUSH) exists, you MUST output ${list.length <= 2 ? `exactly ${t}` : `at least 3 and up to ${t}`} distinct outbound <a href="…"> links using ONLY those list URLs - href character-for-character exact match. Wikipedia allowed only for entity (when applicable) in addition. Zero outbound links to the Semrush list is INVALID. Spread links across section **body** paragraphs (not a repeated line stuck under every heading). No other third-party domains. **Semrush links = knowledge-base / reference citations only**: neutral background, industry or product context, or documentation-style mention. FORBIDDEN: "buy here", "purchase from", "get them at [site]", "avoid buying from", "do not shop at", or any purchase / anti-purchase recommendation tied to those URLs.`
    : `(2) External - ONLY entity Wikipedia page allowed (when entity exists). No other external sites.`;
  const portfolioHosts = (portfolioBlockedHosts ?? [])
    .map((h) => (typeof h === "string" ? h.trim() : ""))
    .filter(Boolean);
  const uniquePortfolio = [...new Set(portfolioHosts)].sort((a, b) => a.localeCompare(b, "en"));
  const portfolioRule =
    uniquePortfolio.length > 0
      ? ` **Other managed clients (NEVER link)** - do not link to these domains or any URL on them (other sites in this workspace): ${uniquePortfolio.slice(0, 45).join(", ")}${uniquePortfolio.length > 45 ? " …" : ""}.`
      : "";
  return `
Links: HTML ONLY. Same-site internal links: [[LINK:query|anchor]] only (${siteUrl}). Never <a href> or [text](url) for same-site URLs. ${INTERNAL_LINK_INTENT_ROUTING_RULE} Third-party/Semrush citations: NEVER write <a href="https://..."> — use [[EXTERNAL:exact-url|exact-anchor]] copied from the assigned blueprint Semrush pair. Overview scroll: [[SCROLL:#id|phrase]]. ${externalRule} NEVER link to competitors or local businesses in the same industry.${portfolioRule} **Blacklist (never link)**: forums, chat/messaging apps, Reddit, Discord, Quora, Stack Overflow, Pinterest, or other thread/UGC platforms - unless that exact URL appears in the Semrush approved list (lists are pre-filtered). (3) Never "External Resources" sections. (4) NEVER use markdown [text](url) for external URLs. (5) NEVER use "here" in or after a link. (7) FORBIDDEN: parenthetical footnotes (anchor phrase) or bare (https://...). (8) FORBIDDEN: any third-party URL in prose except inside [[EXTERNAL:url|anchor]].${currentPageUrl ? ` (6) INVALID - REJECT: Any link that matches the page being optimized (${currentPageUrl}). Same path = self-link = forbidden. Do not use it.` : ""}`;
};

export function buildSemrushApprovedExternalBlock(
  urls: string[] | undefined,
  format: "markdown" | "html" = "html",
): string {
  const list = (urls ?? []).map((u) => (typeof u === "string" ? u.trim() : "")).filter(Boolean);
  if (!list.length) return "";
  const lines = list.map((u, i) => `${i + 1}. ${u}`).join("\n");
  const n = list.length;
  const target = semrushTargetDistinctCount(n);
  const isMarkdown = format === "markdown";
  const mandate =
    n <= 2
      ? isMarkdown
        ? `MANDATORY: The full press release must include exactly ${n} outbound Markdown link${n === 1 ? "" : "s"} [anchor text](EXACT_URL) using the URL${n === 1 ? "" : "s"} below. URL must match the list EXACTLY. Only one harness section should contain the link (usually Supporting details); other sections must not repeat it.`
        : `MANDATORY: Include EVERY URL below as an outbound <a href="EXACT_URL">…</a> in the article body (${n} distinct link${n === 1 ? "" : "s"}). Href must match the list EXACTLY - no edits, no tracking params unless already in the list.`
      : isMarkdown
        ? `MANDATORY: Include at least 3 and at most ${target} distinct Markdown links [anchor](EXACT_URL) from the list below (${n} approved). Each URL must copy one of the numbered URLs EXACTLY.`
        : `MANDATORY: Include at least 3 and at most ${target} distinct outbound links from the list below (${n} approved). Each <a href> must copy one of the numbered URLs EXACTLY. Weave them into normal paragraphs inside sections (follow the blueprint) - not boilerplate pasted after headings. NEVER submit with 0 external links to these URLs.`;

  return `
=== APPROVED EXTERNAL URLs (SEMRUSH) ===
${mandate}
${lines}

**REFERENCE-ONLY FRAMING (NON-NEGOTIABLE)**: These URLs are third-party **reference / knowledge-base** material (background, industry context, specs, or general product category information). Write them into sentences that cite them neutrally. **FORBIDDEN**: any wording that recommends buying from, ordering from, or avoiding that site as a retailer; any "where to buy" or "where not to buy" tied to these links; any repeated one-line template after every <h2>. Vary sentence structure and placement across sections.

Do NOT type any third-party URL in your output unless it is copied exactly from the numbered list above. Never invent, guess, or substitute similar URLs.
=== END APPROVED EXTERNAL URLs ===
`;
}

export function buildLlmAuditAuthorityApprovedBlock(
  pairs: ExternalLinkPair[] | undefined,
): string {
  const list = (pairs ?? []).filter((p) => p.url.trim() && p.anchor.trim());
  if (!list.length) return "";
  const lines = list
    .map((p, i) => `${i + 1}. URL: ${p.url.trim()} | Anchor: ${p.anchor.trim()}`)
    .join("\n");
  return `
=== APPROVED EXTERNAL URLs (LLM AUDIT AUTHORITY) ===
MANDATORY: Include EVERY URL below as an outbound citation using [[EXTERNAL:exact-url|exact-anchor]] with the **exact** URL and **exact** Anchor from this list.
Weave each link mid-sentence inside a body paragraph — same rules as [[LINK:query|anchor]] internal placeholders. Never append links after the final period. Never use bare domain names or "for more" / "here" as anchor text.
${lines}
=== END LLM AUDIT AUTHORITY ===
`;
}

// Manager Panel / Blueprint flow: Markdown output (plan, draft, final report)
export const MARKDOWN_FORMAT_RULES = `
*** OUTPUT: MARKDOWN ONLY. NEVER HTML. ***
All content MUST be valid Markdown. Headings: ## H2, ### H3. Links: [anchor text](url). Lists: - bullets or 1. 2. 3. numbered. Tables: | col | col | with separator line.
**PARAGRAPH LENGTH**: Use **moderately short** paragraphs (blank line between them). Target roughly **2–4 sentences** per paragraph on average - **not** one-sentence micro-paragraphs for every thought, and **not** long wall-of-text blocks. Split any paragraph that would exceed **~5 sentences** or read as an oversized block (avoids SEO/readability warnings like “paragraph is long”).
Pros/Cons, advantages vs disadvantages, or strengths vs weaknesses MUST be rendered as a two-column Markdown table with "Pros" and "Cons" headers - NEVER as bullet lists or numbered lists.
NEVER use: <p>, <h2>, <a href>, <table>, <ul>, <ol>, or any HTML tags. Use markdown syntax only.
${TABLE_FORMAT_MARKDOWN} No duplicate headings. No placeholder names; never use hollow "our team" filler. ${TABLE_NO_LINK_ONLY_COLUMN_RULE}
${NO_COPYRIGHT_FAKE_BRAND_RULE}
${NO_FAKE_TESTIMONIALS_RULE}
`;

// Content Optimizer / Optimization flow: HTML output for WordPress upload
export const HTML_FORMAT_RULES = `
*** OUTPUT: HTML ONLY. NEVER MARKDOWN. ***
All content MUST be valid HTML. Paragraphs: <p>...</p>. Same-site internals: [[LINK:query|anchor]] only (never raw <a href> or [text](url)). Images: <figure class="wp-block-image size-full"><img src="url" alt="description" loading="lazy" /></figure> — NEVER use <a href="image-url"> for wp-content/uploads images; display them inline with <img>. Lists: <ul><li>...</li></ul> or <ol><li>...</li></ol>. Tables: <table><thead><tr><th>H1</th><th>H2</th></tr></thead><tbody><tr><td>...</td><td>...</td></tr></tbody></table>.
**PARAGRAPH LENGTH**: Keep each <p> **moderately short** - typically **2–4 sentences**. Do **not** create **long** single paragraphs (wall of text); split into additional <p> tags when needed. Do **not** over-split into **only** one-sentence paragraphs unless emphasis truly needs it. Avoid any one paragraph carrying a whole section’s worth of text (addresses tools that flag “paragraph is long”).
Pros/Cons, advantages vs disadvantages, or strengths vs weaknesses MUST be rendered as a two-column HTML <table> with <th>Pros</th> and <th>Cons</th> headers - NEVER as <ul>/<ol> lists.
CRITICAL: FAQ table = SAME HTML format as every other table. <table><thead><tr><th>Question</th><th>Answer</th></tr></thead><tbody>...</tbody></table>. NEVER | Question | Answer | or |-|-|.
NEVER use: ## headings, [text](url), | markdown tables |, - bullets, 1. numbered, **asterisk bold**, or *italic* (use HTML elements instead). Never put a keyword or <a> as the last words of a sentence.
${TABLE_FORMAT} No empty tables; at least one data row. No duplicate headings. No "Article Title:" label. No placeholder names; never use hollow "our team" filler. ${TABLE_NO_LINK_ONLY_COLUMN_RULE}
Lists: Numbered steps = <ol><li>one sentence on the same line as the number</li></ol>. Bullet items = <ul><li>one sentence</li></ul>. NEVER use bullets for sequential steps. Every <li> MUST be inside <ul> or <ol>. NEVER output bare <li>. Wrong: <li>Item</li>. Correct: <ol><li>Prepare your data. Organize titles and SEO metadata into a CSV.</li></ol>. Forbidden inside <li>: <p>, <br>, a number on its own line, typing "1." in the item (the <ol> already numbers), a bold mini-heading then a paragraph, or **Label**: markdown.
${HARNESS_LABELED_LIST_HTML_RULE}

*** SEO HEADING HIERARCHY (THIS IS THE ONLY RULE - FOLLOW IT) ***
DEPTH OF CONTENT: Each main substantive topic = H2. When SERP H2 OUTLINE is present, those titles are the body H2s. When SAP PAGE TEMPLATE is present, those mandatory titles are the body H2s. These are NOT H3s - they are H2s. One H2 per major concept. Forbidden as a main H2: "What is [X]?", "Your Guide to [X]", "Introduction".
H2 = agents you dictate + every main substantive topic from the outline or SAP template.
H3 = only truly subordinate subtopics under an H2 (e.g. under "How it works" you might have 2-3 H3s). MAX 3-5 H3s per H2.
H4 = rare; sub-subsections when 3+ levels.
FORBIDDEN: Nesting main topics (how it works, comparison, costs, recommendation) as H3s. Flattening everything to H3. More than 5 H3s under any H2.
Each heading = one short phrase (3–10 words). Never wrap paragraphs in heading tags.
${NO_COPYRIGHT_FAKE_BRAND_RULE}
${NO_FAKE_TESTIMONIALS_RULE}`;

export const HTML_SEMANTIC_FOOTER_RULES = `
*** SEMANTIC FOOTER (<footer> - CONTENTINFO) ***
Always close the article body with **exactly one** <footer> **after** the last blueprint <h2> section (after that section’s closing tags). Inside <footer>, use only <p> and optional internal <a href> (same link rules as body). **No** <h2>, <h3>, lists, or tables inside <footer>.
**Never** put copyright lines, "©", "Copyright" + year, "All rights reserved", or invented brand names inside <footer> or anywhere at the end of the article.
Purpose for readers and assistive tech: (1) **first <p>**: one tight synthesis of the page topic and direct answer - natural language, may restate the primary keyword once if it reads well; (2) **optional second <p>**: one short next step (e.g. related service or contact) with **internal** links only when URLs exist - no new claims or keyword lists.
Do **not** paste duplicate sentences from the last section; the footer should **add** a scannable wrap-up or CTA, not repeat the full conclusion. Do **not** wrap the whole article in <footer> - only this trailing block.`;

export const HTML_FORMAT_RULES_FULL_ARTICLE = `${HTML_FORMAT_RULES}${HTML_SEMANTIC_FOOTER_RULES}`;

export const HARNESS_HTML_NO_FOOTER_ELEMENT_RULES = `
*** NO <footer> ELEMENT (HARNESS – NON-NEGOTIABLE) ***
You are writing **one section** of a blog post, not a page shell. **Never** output <footer>, </footer>, or role="contentinfo".
Allowed block/inline structure: <h2>, <h3>, <h4>, <p>, <a>, <ul>, <ol>, <li>, <table>, <figure>, <img> only.
Wrap-ups, conclusions, and CTAs belong in normal <p> (or lists/tables) under this section’s <h2>—never in <footer>.`;

export const HARNESS_ANCHOR_TAG_FORMAT_RULE = `
*** ANCHOR TAG FORMAT (HARNESS – NON-NEGOTIABLE) ***
Every link MUST include visible anchor text inside <a>...</a> — never empty, never "here", never the raw URL.
External links: [[EXTERNAL:exact-url|exact-anchor]] only (code emits <a href="url">anchor</a>). Weave mid-sentence like [[LINK:...]] — never bare domain, never "for more"/"here", never after the final period.
Scroll links: [[SCROLL:#id|phrase]] or <a href="#id">phrase</a> with a natural phrase.
Format: <a href="url-or-#id">anchor text</a>
FORBIDDEN: a link, [[LINK]], or the writing keyword as the last words of a sentence or after the final period (". durable window coverings"). After a period, the next sentence starts with a capital letter. If you cannot weave it mid-sentence, STOP.
FORBIDDEN: wrapping **markdown**, <strong>, or <b> as the link. Never output asterisk bold.
FORBIDDEN on <a>: target=, rel=, class=, id=, style=, or any attribute besides href.
Never output partial tags, orphaned attributes (e.g. target="_blank" rel="noopener">), or markdown [text](url).`;

export const HTML_FORMAT_RULES_HARNESS_SECTION = `${HTML_FORMAT_RULES}${HARNESS_HTML_NO_FOOTER_ELEMENT_RULES}${HARNESS_ANCHOR_TAG_FORMAT_RULE}`;

export const HARNESS_MODE_SYSTEM_BLOCK = `**HARNESS MODE (NON-NEGOTIABLE)**: You write exactly ONE section per request.
- Output contains exactly ONE top-level heading for this section (<h2> for HTML harness; Overview uses <h2>Overview</h2> plus mandatory key-points bullet list only).
- Forbidden: any other top-level heading from the plan, whole-article intros, conclusions, Overview scroll-link bullets in body sections, or repeating sibling sections.
- Forbidden H2 placeholders: Section, Intro, Introduction, Content, Overview (body), Section N, or harness meta-instructions ("Create an agent", etc.). The assigned heading text must be copied exactly.
- Full article cap: ${ARTICLE_MAX_WORDS} words total across all sections; write only this section's allocated budget. Exceeding your section budget breaks the ${ARTICLE_MAX_WORDS}-word article cap. ${ARTICLE_MAX_WORDS} is a hard cap, not a target; do not pad.
${INSTALLER_EXPERTISE_GATE_RULE}
${A_PLUS_HOMEOWNER_ARTICLE_RULE}
${A_PLUS_KEYWORD_AUTHORITY_RULE}
${AISO_AUTHORITY_PHRASING_RULE}
${AISO_DEPTH_RULE}
${AUTHENTICITY_WRITER_RULE}`;

export type BuildSystemPromptGenerationMode = "full_article" | "harness_section";

export const ENTITY_FORBIDDEN = `Never use [city], [location], [area] or bracket placeholders. Never fake team lists or write "our team" / "our professionals". Use the connected business name or we plus a sourced concrete detail.`;

export function buildTargetSiteBlock(
  connectedSite: { name: string; siteUrl: string },
  normalizedSiteUrl: string,
  normalizedCurrentPageUrl: string,
  currentPageUrl?: string,
  siteSummary?: string,
  semrushExternalUrls?: string[],
  portfolioBlockedHosts?: string[],
  harnessSectionMode?: boolean,
): string {
  const linkRules = harnessSectionMode
    ? "Per-section link rules are in the user prompt for this harness step only — do not apply full-article link lists here."
    : LINK_RULES(normalizedSiteUrl, currentPageUrl, semrushExternalUrls, portfolioBlockedHosts);
  return `
=== TARGET SITE ===
Site: ${connectedSite.name} (${normalizedSiteUrl})${currentPageUrl ? ` | PAGE BEING OPTIMIZED: ${currentPageUrl} - Any link matching this URL is INVALID. Reject it. Never self-link.` : ""}${siteSummary ? ` | Site summary: ${siteSummary}` : ""}
${linkRules}
=== END TARGET SITE ===`;
}

export function buildEntityBlock(entityName: string, keyword?: string): string {
  const canonical = normalizeEntityHintCommaLabel(entityName);
  const proseLabel = entityLabelForProse(canonical);
  const general = getLocalEntityPhraseExamples(proseLabel, "general", 5);
  const expertise = getLocalEntityPhraseExamples(proseLabel, "expertise", 3);
  const referenceBlock = formatEntityReferencePromptBlock({
    entity: canonical,
    keyword,
  });
  return `
=== ENTITY/LOCAL CONTENT: ${canonical} ===
${referenceBlock}
Use location naturally: exact canonical comma label 2–3×, broader terms (e.g. "area", "region") often. Vary phrases: ${general.map((ex) => `"${ex}"`).join(", ")}. Place phrases: ${expertise.map((ex) => `"${ex}"`).join(", ")}. Reduce keyword repetition with semantic product/topic variants — not hollow "our team" or "local experts" filler. Landmark, climate, or process detail only if present in master instructions, GBP, inventory, existing HTML, or audit blocks; otherwise omit. Authentic to readers ${getLocalGeneralPhrase(proseLabel, 0)}. ${ENTITY_FORBIDDEN}
=== END ENTITY ===`;
}

export function buildRegularBlogBlock(): string {
  return `
=== REGULAR BLOG (NO ENTITY) ===
General informational post. No specific locations or placeholders. ${ENTITY_FORBIDDEN}
=== END REGULAR BLOG ===`;
}

export const GSC_CONTENT_INTEGRATION_BLOCK = `=== SEARCH CONSOLE QUERIES (real Google searches for this page) ===
Below is JSON: gsc_keywords_for_url + rows of query strings from your site’s Search Console. Do NOT print, list, or paste this JSON in the article.

**How to use it**
1. Read the **article structure** (sections below) and the JSON together.
2. **Choose 10–20** queries that best fit the blueprint: match each section’s topic and intent. Skip queries that are off-topic, redundant, or awkward.
3. **Spread** chosen phrasings **across multiple sections** (intro, body, FAQ, etc.). Do **not** put most queries in one paragraph or one section.
4. Integrate **naturally** (semantic variations, short phrases, conversational wording). No keyword stuffing, no repeating the same long query many times.
5. You **do not** need to use every query in the JSON - **judgment over coverage**.
=== END SEARCH CONSOLE ===`;

export const SEMRUSH_KEYWORDS_RAG_BLOCK = `=== SEMRUSH KEYWORD LISTS (related searches / URL organic phrases) ===
Below is JSON: url_organic and phrase_related keyword phrases from Semrush (no metrics). Do NOT print, list, or paste this JSON in the article.

**How to use it**
1. Read the **article structure** (sections below) and the JSON together.
2. **Choose** phrases that fit the blueprint and searcher intent; skip off-topic or awkward strings.
3. **Spread** natural wording across sections (intro, body, FAQ, etc.). No keyword stuffing.
4. Prefer **semantic variation**; do not repeat the same long-tail string many times.
5. You **do not** need to use every phrase - **judgment over coverage**. If skipped or empty, ignore this block.
=== END SEMRUSH KEYWORDS ===`;

export const SEMRUSH_CLUSTER_SCATTER_BLOCK = `=== SEMRUSH KEYWORD CLUSTERS + SCATTER PLAN ===
Below is JSON: semrush_keyword_clusters with **clusters** (related phrases) and **scatter** (which clusters belong in which part of the article: introduction, body_early, body_mid, body_late, faq, conclusion). Do NOT print this JSON in the article.

**How to use it**
1. Map each **zone** in scatter to the closest matching **H2 sections** in the structure below (intro → first H2; body_* → middle H2s in order; faq → FAQ/table section; conclusion → closing H2).
2. Work in phrases from the assigned **cluster keywords** only in those zones - natural wording, no lists of keywords in the body.
3. Prefer **semantic variation**; do not repeat the same long-tail string in multiple zones.
4. If a cluster does not fit a section’s topic, skip it - judgment over coverage.
=== END SEMRUSH CLUSTERS ===`;

export const OPTIMIZER_INSTRUCTIONS_LABEL = "INSTRUCTIONS (MUST FOLLOW)";

export function mergeOptimizerInstructions(
  operator: string | undefined,
  existing: string | undefined,
): string | undefined {
  const a = operator?.trim() ?? "";
  const b = existing?.trim() ?? "";
  if (!a) return b || undefined;
  if (!b) return a;
  if (a === b || b.includes(a)) return b;
  if (a.includes(b)) return a;
  return `${a}\n\n${b}`;
}
