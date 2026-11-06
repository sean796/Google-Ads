import {
  ARTICLE_MAX_WORDS,
  buildHarnessArticleBudgetBlock,
  buildHarnessArticleCapLine,
} from "@/lib/content-generation/article-length-policy";
import { INTERNAL_LINK_PLACEHOLDER_PROMPT_BLOCK } from "../content-generation/internal-link-placeholders";
import {
  formatBlogPlayLinkTargetsPrompt,
  formatLinkTargetsPlanPrompt,
  INTERNAL_LINK_INTENT_ROUTING_RULE,
  keepBlogPlayLinkTargets,
  type LinkTargetsPlan,
} from "@/lib/bulk/bulk-generation-wp-inventory";
import { EXTERNAL_LINK_PLACEHOLDER_PROMPT_BLOCK } from "../content-generation/external-link-placeholders";
import { appendMasterInstructionsToSystemPrompt, ensureMasterInstructionsInMemory } from "../master-instructions-storage";
import { getSiteCache } from "../wordpress-site-cache";
import { getLocalEntityPhraseExamples, getLocalGeneralPhrase } from "../local-entity-phrases";
import { formatEntityKeywordVariantPromptBlock } from "@/lib/entity-keyword-variant-phrases";
import {
  entityLabelForProse,
  formatEntityReferencePromptBlock,
  resolveServiceTopicKeyword,
} from "@/lib/entity-place-reference";
import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import type { AIDrivenACFContext } from "../content-generation/ai-driven-acf-reader";
import { TABLE_FORMAT, TABLE_FORMAT_MARKDOWN, CRITICAL_LINK_RULE, NO_FAKE_TESTIMONIALS_RULE, TABLE_NO_LINK_ONLY_COLUMN_RULE, AUTHENTICITY_WRITER_RULE, SYSTEM_PROMPT_CORE } from "./core";
import { HARNESS_LABELED_LIST_HTML_RULE } from "@/lib/prompt-builders/harness-labeled-list-html-rule";
import { formatSapPageWriterBlock } from "@/lib/prompt-builders/sap-page-template";
import { formatCompetitorComparisonWriterBlock } from "@/lib/prompt-builders/competitor-comparison-page-template";
import { MARKDOWN_QUOTE_OUTPUT_RULE } from "../feature-mapping";
import {
  buildOverviewLinkRulesBlock,
} from "./overview-link-rules";
import {
  appendUniversalContentRulesToSystemPrompt,
  buildBlacklistRagBlock,
  FORBIDDEN_WORDS_USER_PROMPT_REMINDER,
} from "../content-word-blocklist";
import {
  buildKeywordPunctuationPromptBlock,
  resolveWritingKeyword,
} from "./keyword-canonical-punctuation";
import { formatDfsArticleAuditHarnessPromptBlockFromText } from "@/lib/dfs-article-audit/format-dfs-article-audit-harness";
import type { ExternalLinkPair } from "@/lib/content-generation/external-link-placeholders";
import { formatLlmAuditHarnessPromptBlock } from "@/lib/llm-audit/llm-audit-dataforseo";
import {
  FIRST_PARAGRAPH_AUTHORITY_RULE,
  FIRST_PARTY_AUTHORITY_WRITING_RULE,
  A_PLUS_HOMEOWNER_ARTICLE_RULE,
  A_PLUS_KEYWORD_AUTHORITY_RULE,
  AISO_AUTHORITY_PHRASING_RULE,
  AISO_DEPTH_RULE,
  AISO_SEMANTIC_BREADTH_RULE,
  INSTALLER_EXPERTISE_GATE_RULE,
  FORBIDDEN_HOLLOW_AUTHORITY_RULE,
  PHRASE_VARIATION_RULE,
  SERVICE_AREA_DENSITY_RULE,
  A_LEVEL_CONNECTED_SITE_ARTICLE_RULE,
  A_LEVEL_DECISION_PRECISION_RULE,
  FACTUAL_VERIFICATION_SOURCE_RULE,
  ILLUSTRATIVE_BLOCKQUOTE_RULE,
  ILLUSTRATIVE_SCENARIO_PERSONA_RULE,
  NON_ILLUSTRATIVE_HYPOTHETICAL_BAN_RULE,
  PRIMARY_CITY_CONSISTENCY_RULE,
  formatSiteUsedOpenersPromptBlock,
  COMPARISON_ANSWER_RULE,
  AUTOMATION_TIER_TAXONOMY_RULE,
  OVERVIEW_ASSIGNED_PERSONA_RULE,
  INTERNAL_LINK_ANCHOR_MATCH_RULE,
  isComparisonPrimaryKeyword,
  isAutomationTierTopic,
} from "@/lib/content-optimization/first-party-authority-prompt";
import {
  DEFENSIBLE_SPECIFICITY_RULE,
  NUMERIC_DENSITY_TARGET_RULE,
  ILLUSTRATIVE_ANSWER_GROUNDING_RULE,
} from "@/lib/content-optimization/defensible-specificity-prompt";

function connectedSiteTopicAisoRules(primaryKeyword: string): string {
  const chunks: string[] = [INTERNAL_LINK_ANCHOR_MATCH_RULE];
  if (isComparisonPrimaryKeyword(primaryKeyword)) chunks.push(COMPARISON_ANSWER_RULE);
  if (isAutomationTierTopic(primaryKeyword)) chunks.push(AUTOMATION_TIER_TAXONOMY_RULE);
  return `\n${chunks.join("\n")}`;
}

// --- Shared rule blocks (DRY) ---

/** Distinct Semrush outbound targets: 1–2 use all; 3+ use 3–5 (capped by list size). */
function semrushTargetDistinctCount(urlCount: number): number {
  if (urlCount <= 0) return 0;
  if (urlCount <= 2) return urlCount;
  return Math.min(5, urlCount);
}

/** Stops models from appending fake © / "All rights reserved" / invented brand footers (common hallucination). */
const NO_COPYRIGHT_FAKE_BRAND_RULE = `**NO COPYRIGHT OR FAKE SITE FOOTER (NON-NEGOTIABLE)**: Never output "©", "Copyright" plus a year, "All rights reserved", or invented business/brand names (e.g. placeholder sites like "MyGlamping"). If TARGET SITE names a real business, use only that name when relevant - never invent a different company name. Do not end the article with legal boilerplate or stock footer lines.`;

const LINK_RULES = (
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

function buildSemrushApprovedExternalBlock(
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

function buildLlmAuditAuthorityApprovedBlock(
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
const MARKDOWN_FORMAT_RULES = `
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
const HTML_FORMAT_RULES = `
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

const HTML_SEMANTIC_FOOTER_RULES = `
*** SEMANTIC FOOTER (<footer> - CONTENTINFO) ***
Always close the article body with **exactly one** <footer> **after** the last blueprint <h2> section (after that section’s closing tags). Inside <footer>, use only <p> and optional internal <a href> (same link rules as body). **No** <h2>, <h3>, lists, or tables inside <footer>.
**Never** put copyright lines, "©", "Copyright" + year, "All rights reserved", or invented brand names inside <footer> or anywhere at the end of the article.
Purpose for readers and assistive tech: (1) **first <p>**: one tight synthesis of the page topic and direct answer - natural language, may restate the primary keyword once if it reads well; (2) **optional second <p>**: one short next step (e.g. related service or contact) with **internal** links only when URLs exist - no new claims or keyword lists.
Do **not** paste duplicate sentences from the last section; the footer should **add** a scannable wrap-up or CTA, not repeat the full conclusion. Do **not** wrap the whole article in <footer> - only this trailing block.`;

const HTML_FORMAT_RULES_FULL_ARTICLE = `${HTML_FORMAT_RULES}${HTML_SEMANTIC_FOOTER_RULES}`;

const HARNESS_HTML_NO_FOOTER_ELEMENT_RULES = `
*** NO <footer> ELEMENT (HARNESS – NON-NEGOTIABLE) ***
You are writing **one section** of a blog post, not a page shell. **Never** output <footer>, </footer>, or role="contentinfo".
Allowed block/inline structure: <h2>, <h3>, <h4>, <p>, <a>, <ul>, <ol>, <li>, <table>, <figure>, <img> only.
Wrap-ups, conclusions, and CTAs belong in normal <p> (or lists/tables) under this section’s <h2>—never in <footer>.`;

const HARNESS_ANCHOR_TAG_FORMAT_RULE = `
*** ANCHOR TAG FORMAT (HARNESS – NON-NEGOTIABLE) ***
Every link MUST include visible anchor text inside <a>...</a> — never empty, never "here", never the raw URL.
External links: [[EXTERNAL:exact-url|exact-anchor]] only (code emits <a href="url">anchor</a>). Weave mid-sentence like [[LINK:...]] — never bare domain, never "for more"/"here", never after the final period.
Scroll links: [[SCROLL:#id|phrase]] or <a href="#id">phrase</a> with a natural phrase.
Format: <a href="url-or-#id">anchor text</a>
FORBIDDEN: a link, [[LINK]], or the writing keyword as the last words of a sentence or after the final period (". durable window coverings"). After a period, the next sentence starts with a capital letter. If you cannot weave it mid-sentence, STOP.
FORBIDDEN: wrapping **markdown**, <strong>, or <b> as the link. Never output asterisk bold.
FORBIDDEN on <a>: target=, rel=, class=, id=, style=, or any attribute besides href.
Never output partial tags, orphaned attributes (e.g. target="_blank" rel="noopener">), or markdown [text](url).`;

const HTML_FORMAT_RULES_HARNESS_SECTION = `${HTML_FORMAT_RULES}${HARNESS_HTML_NO_FOOTER_ELEMENT_RULES}${HARNESS_ANCHOR_TAG_FORMAT_RULE}`;

const HARNESS_MODE_SYSTEM_BLOCK = `**HARNESS MODE (NON-NEGOTIABLE)**: You write exactly ONE section per request.
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

const ENTITY_FORBIDDEN = `Never use [city], [location], [area] or bracket placeholders. Never fake team lists or write "our team" / "our professionals". Use the connected business name or we plus a sourced concrete detail.`;

function buildTargetSiteBlock(
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

function buildEntityBlock(entityName: string, keyword?: string): string {
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

function buildRegularBlogBlock(): string {
  return `
=== REGULAR BLOG (NO ENTITY) ===
General informational post. No specific locations or placeholders. ${ENTITY_FORBIDDEN}
=== END REGULAR BLOG ===`;
}

export async function buildSystemPrompt(
  knowledgeBaseContext: string,
  apiKey: string,
  connectedSite?: { name: string; siteUrl: string },
  wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>,
  currentPageUrl?: string,
  entity?: string,
  siteId?: string,
  primaryKeyword?: string,
  siteSummary?: string,
  semrushExternalUrls?: string[],
  portfolioBlockedHosts?: string[],
  contentKind?: "press_release",
  generationMode: BuildSystemPromptGenerationMode = "full_article",
  workflowContextBlock = "",
  llmAuditAuthorityExternalPairs?: ExternalLinkPair[],
  linkTargetsPlan?: LinkTargetsPlan,
): Promise<string> {
  const normalizedSiteUrl = connectedSite?.siteUrl ? connectedSite.siteUrl.replace(/\/+$/, "") : "";
  const normalizedCurrentPageUrl = currentPageUrl ? currentPageUrl.replace(/\/+$/, "").toLowerCase() : "";

  let postsToUse = keepBlogPlayLinkTargets(wordPressPosts ?? []);
  if (!postsToUse.length && siteId) {
    try {
      const cache = getSiteCache(siteId);
      if (cache) {
        postsToUse = keepBlogPlayLinkTargets(cache.posts);
      }
    } catch {
      // keep wordPressPosts
    }
  }

  const pageSlug = normalizedCurrentPageUrl ? (normalizedCurrentPageUrl.split("/").pop() || "") : "";
  const availablePostsForLinking =
    postsToUse.length > 0 && normalizedCurrentPageUrl
      ? postsToUse.filter((post) => {
          if (!post.link) return true;
          const norm = post.link.replace(/\/+$/, "").toLowerCase();
          return (
            norm !== normalizedCurrentPageUrl &&
            (pageSlug.length < 3 || !norm.endsWith("/" + pageSlug))
          );
        })
      : postsToUse;

  const harnessUsesMarkdown = contentKind === "press_release";
  const isPressRelease = contentKind === "press_release";
  const isHarnessSection = generationMode === "harness_section" && !isPressRelease;
  const semrushExternalBlock = buildSemrushApprovedExternalBlock(
    semrushExternalUrls,
    harnessUsesMarkdown ? "markdown" : "html",
  );
  const llmAuditAuthorityBlock = buildLlmAuditAuthorityApprovedBlock(llmAuditAuthorityExternalPairs);

  const targetSiteContext = connectedSite
    ? buildTargetSiteBlock(
        connectedSite,
        normalizedSiteUrl,
        normalizedCurrentPageUrl,
        currentPageUrl,
        siteSummary,
        semrushExternalUrls,
        portfolioBlockedHosts,
        isHarnessSection,
      )
    : "";

  const usedOpenersContext = connectedSite
    ? formatSiteUsedOpenersPromptBlock(postsToUse, currentPageUrl)
    : "";
  const linkTargetsBlock = linkTargetsPlan ? formatLinkTargetsPlanPrompt(linkTargetsPlan) : "";
  const fullCatalogBlock = formatBlogPlayLinkTargetsPrompt(availablePostsForLinking);
  const wordPressPostsContext =
    postsToUse.length > 0 && connectedSite
      ? generationMode === "harness_section"
        ? [
            INTERNAL_LINK_PLACEHOLDER_PROMPT_BLOCK,
            linkTargetsBlock || fullCatalogBlock,
          ]
            .filter(Boolean)
            .join("\n")
        : linkTargetsBlock || fullCatalogBlock
      : generationMode === "harness_section" && connectedSite
        ? INTERNAL_LINK_PLACEHOLDER_PROMPT_BLOCK
        : "";

  const hasEntity = entity?.trim() && entity.trim() !== "N/A";
  const normalizedEntity = hasEntity ? normalizeEntityHintCommaLabel(entity!.trim()) : "";
  const entityContext = hasEntity
    ? buildEntityBlock(normalizedEntity, primaryKeyword)
    : buildRegularBlogBlock();

  const knowledgeBlock = knowledgeBaseContext
    ? `\n=== KNOWLEDGE BASE ===\n${knowledgeBaseContext}\n=== END KNOWLEDGE BASE ===`
    : "";

  const workflowBlock = workflowContextBlock.trim() ? `\n${workflowContextBlock.trim()}` : "";

  const pk = primaryKeyword?.trim() ?? "";
  const serviceTopicForEntity =
    hasEntity && pk ? resolveServiceTopicKeyword(pk, normalizedEntity) : "";
  const writingKw = pk
    ? resolveWritingKeyword(serviceTopicForEntity || pk)
    : "";
  const keywordPunctuationBlock = pk ? buildKeywordPunctuationPromptBlock(pk, writingKw) : "";
  const exactPrimaryEcho = writingKw
    ? serviceTopicForEntity && serviceTopicForEntity.toLowerCase() !== pk.toLowerCase()
      ? ` Service topic for prose: "${writingKw}". Full SEO keyword "${pk}" is for metadata — do not paste the geo-stuffed slug in body copy.`
      : ` Writing keyword for copy: "${writingKw}".`
    : pk
      ? ` Primary keyword string for exact-match checks: "${pk}".`
      : "";
  const exactPrimaryPerH2BlockFull =
    !isPressRelease && writingKw
      ? connectedSite
        ? `\n**EXACT PRIMARY PER H2 (MANDATORY)**: Under each <h2>, include the **WRITING KEYWORD** phrase **at most once** when it reads naturally (paste "${writingKw}" exactly — full Title Case, same words and order). Never put WRITING KEYWORD in the H2/H3 title text. If Answer or the prior body section already used the exact phrase, use semantic synonyms only in this section. Never repeat the exact phrase in table Pros cells or list items after the one required mention. Article-wide cap: ~5 exact-phrase uses in prose (see AISO SEMANTIC BREADTH). The intro may omit it from sentence one.`
        : `\n**EXACT PRIMARY PER H2 (MANDATORY)**: In **every** ## section body, include the **WRITING KEYWORD** phrase **once** (paste "${writingKw}" exactly — full Title Case, same words and order). Never in the H2/H3 title. Do not repeat it in every sentence.`
      : "";
  const exactPrimaryPerH2BlockHarness =
    isHarnessSection && writingKw
      ? `\n**EXACT PRIMARY IN THIS SECTION (MANDATORY)**: In this section's body under its ## heading, include the **WRITING KEYWORD** phrase **at most once** when natural (paste "${writingKw}" exactly — full Title Case, same words and order). Never in the H2/H3 title. If Answer or the prior body section already used the exact phrase, use semantic synonyms only here. Do not stack it in every sentence, table row, or Pros cell. Do not preview or repeat keyword coverage for sibling sections.`
      : "";
  const exactPrimaryPerH2Block = isHarnessSection ? exactPrimaryPerH2BlockHarness : exactPrimaryPerH2BlockFull;
  const entityKeywordVariantBlock =
    connectedSite && hasEntity && pk && contentKind !== "press_release"
      ? formatEntityKeywordVariantPromptBlock({
          entity: normalizedEntity,
          keyword: pk,
        })
      : "";
  const firstParagraphRuleFull = connectedSite
    ? `\n${INSTALLER_EXPERTISE_GATE_RULE}\n${FORBIDDEN_HOLLOW_AUTHORITY_RULE}\n${A_PLUS_HOMEOWNER_ARTICLE_RULE}\n${A_PLUS_KEYWORD_AUTHORITY_RULE}\n${AISO_AUTHORITY_PHRASING_RULE}\n${AISO_DEPTH_RULE}\n${AISO_SEMANTIC_BREADTH_RULE}\n${entityKeywordVariantBlock}\n${A_LEVEL_CONNECTED_SITE_ARTICLE_RULE}\n${A_LEVEL_DECISION_PRECISION_RULE}\n${PRIMARY_CITY_CONSISTENCY_RULE}\n${ILLUSTRATIVE_SCENARIO_PERSONA_RULE}\n${ILLUSTRATIVE_BLOCKQUOTE_RULE}\n${ILLUSTRATIVE_ANSWER_GROUNDING_RULE}\n${FACTUAL_VERIFICATION_SOURCE_RULE}\n${DEFENSIBLE_SPECIFICITY_RULE}\n${NUMERIC_DENSITY_TARGET_RULE}\n${FIRST_PARAGRAPH_AUTHORITY_RULE}\n${FIRST_PARTY_AUTHORITY_WRITING_RULE}\n${PHRASE_VARIATION_RULE}${pk ? connectedSiteTopicAisoRules(pk) : ""}`
    : "";
  const generalFocusRule = isPressRelease
    ? `\n**PRESS RELEASE MODE**: Neutral AP/wire style. Output **Markdown only** (## headings, paragraphs, [anchor](url), quotes as > lines). ${MARKDOWN_QUOTE_OUTPUT_RULE}${
        pk
          ? ` Topic and keyword: "${pk}". Write about the connected business in the context of this topic; optional title override is a headline hint only.${exactPrimaryEcho}`
          : " Use the article title and purpose as the topic anchor."
      }
Do not invent grand openings, expansions, product launches, or "today announced" stories unless the user supplied that event in ACF or KNOWLEDGE BASE.
**NATURAL LANGUAGE**: Write like a journalist, not an SEO brief. Use the topic keyword sparingly (about once in the full release); prefer synonyms and plain phrasing. Do not repeat the exact keyword in every ## heading or paragraph.
**DATELINE**: Wire dateline from ACF appears **only in section 1**, first paragraph. Later sections must not repeat the dateline or start paragraphs with a calendar date. Never use bracket placeholders ([CITY], [STATE], [Month DD, YYYY], or similar).
No fabricated testimonials, customer quotes, or named spokespeople unless user-supplied text appears in KNOWLEDGE BASE or ACF blocks.
Syndication-ready copy; follow each harness section scope exactly.
Each ## subhead is topical wire copy (service, expertise, or reader need)—not a label for section type and not a fake news headline.`
    : isHarnessSection
      ? `\nContent focus: Optimize for the page topic and primary keyword. Primary keyword is the main subject of the page, not the company name or a place.${exactPrimaryEcho}
${HARNESS_MODE_SYSTEM_BLOCK}${exactPrimaryPerH2Block}${generationMode === "harness_section" ? `\n${SERVICE_AREA_DENSITY_RULE}` : ""}`
      : connectedSite
      ? `\nContent focus: Optimize for the page topic and primary keyword. Primary keyword is the main subject of the page, not the company name or a place.${exactPrimaryEcho}
${firstParagraphRuleFull}${exactPrimaryPerH2Block}`
      : pk
        ? `\nContent focus: Optimize for the page topic and primary keyword.${exactPrimaryEcho}${exactPrimaryPerH2Block}`
        : "";
  const linkRuleBlock =
    connectedSite && contentKind !== "press_release" && generationMode === "full_article"
      ? `\n${CRITICAL_LINK_RULE}`
      : "";
  const semrushOverridesWikipediaOnly =
    Array.isArray(semrushExternalUrls) && semrushExternalUrls.some((u) => String(u ?? "").trim()) &&
    generationMode === "full_article"
      ? `\n**SEMRUSH URLs - OVERRIDE**: When the "APPROVED EXTERNAL URLs (SEMRUSH)" block appears above, those exact third-party URLs are allowed and required per that block. The line in CRITICAL_LINK_RULE that limits externals to Wikipedia-only does **not** apply to URLs listed in that Semrush block (entity Wikipedia remains optional in addition).`
      : "";
  const llmAuditAuthorityOverridesWikipediaOnly =
    (llmAuditAuthorityExternalPairs?.length ?? 0) > 0 && generationMode === "full_article"
      ? `\n**LLM AUDIT AUTHORITY URLs - OVERRIDE**: When the "APPROVED EXTERNAL URLs (LLM AUDIT AUTHORITY)" block appears above, those exact third-party URLs are allowed and required per that block in addition to entity Wikipedia when applicable.`
      : "";
  const hasApprovedExternals =
    (llmAuditAuthorityExternalPairs?.length ?? 0) > 0 ||
    (semrushExternalUrls ?? []).some((u) => String(u ?? "").trim());
  const externalLinkPromptBlock = hasApprovedExternals
    ? `\n${EXTERNAL_LINK_PLACEHOLDER_PROMPT_BLOCK}`
    : "";
  // WordPress harness = HTML sections. Press release harness = Markdown. Full article = HTML.
  const formatRules =
    contentKind === "press_release"
      ? MARKDOWN_FORMAT_RULES
      : generationMode === "harness_section" && connectedSite
        ? HTML_FORMAT_RULES_HARNESS_SECTION
        : generationMode === "harness_section"
          ? MARKDOWN_FORMAT_RULES
          : HTML_FORMAT_RULES_FULL_ARTICLE;
  const core = `${SYSTEM_PROMPT_CORE}
You are an expert SEO content AI. Use the API key for content tasks. Output must be optimized, on-topic, and structurally correct.
${formatRules}${generalFocusRule}${keywordPunctuationBlock}
${knowledgeBlock}${workflowBlock}${entityContext}${targetSiteContext}${semrushExternalBlock}${llmAuditAuthorityBlock}${externalLinkPromptBlock}${wordPressPostsContext}${usedOpenersContext}${linkRuleBlock}${semrushOverridesWikipediaOnly}${llmAuditAuthorityOverridesWikipediaOnly}`;
  await ensureMasterInstructionsInMemory(siteId);
  return appendUniversalContentRulesToSystemPrompt(
    appendMasterInstructionsToSystemPrompt(core, siteId),
  );
}

const GSC_CONTENT_INTEGRATION_BLOCK = `=== SEARCH CONSOLE QUERIES (real Google searches for this page) ===
Below is JSON: gsc_keywords_for_url + rows of query strings from your site’s Search Console. Do NOT print, list, or paste this JSON in the article.

**How to use it**
1. Read the **article structure** (sections below) and the JSON together.
2. **Choose 10–20** queries that best fit the blueprint: match each section’s topic and intent. Skip queries that are off-topic, redundant, or awkward.
3. **Spread** chosen phrasings **across multiple sections** (intro, body, FAQ, etc.). Do **not** put most queries in one paragraph or one section.
4. Integrate **naturally** (semantic variations, short phrases, conversational wording). No keyword stuffing, no repeating the same long query many times.
5. You **do not** need to use every query in the JSON - **judgment over coverage**.
=== END SEARCH CONSOLE ===`;

const SEMRUSH_KEYWORDS_RAG_BLOCK = `=== SEMRUSH KEYWORD LISTS (related searches / URL organic phrases) ===
Below is JSON: url_organic and phrase_related keyword phrases from Semrush (no metrics). Do NOT print, list, or paste this JSON in the article.

**How to use it**
1. Read the **article structure** (sections below) and the JSON together.
2. **Choose** phrases that fit the blueprint and searcher intent; skip off-topic or awkward strings.
3. **Spread** natural wording across sections (intro, body, FAQ, etc.). No keyword stuffing.
4. Prefer **semantic variation**; do not repeat the same long-tail string many times.
5. You **do not** need to use every phrase - **judgment over coverage**. If skipped or empty, ignore this block.
=== END SEMRUSH KEYWORDS ===`;

const SEMRUSH_CLUSTER_SCATTER_BLOCK = `=== SEMRUSH KEYWORD CLUSTERS + SCATTER PLAN ===
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

export const buildUserPrompt = (
  flowTitle: string,
  flowPurpose: string,
  sectionsPrompt: string,
  connectedSite?: { name: string; siteUrl: string },
  entity?: string,
  acfContext?: AIDrivenACFContext,
  hasWordPressPosts?: boolean,
  currentPageUrl?: string,
  gscKeywordsContext?: string,
  semrushKeywordsContext?: string,
  semrushScatterContext?: string,
  semrushExternalUrls?: string[],
  portfolioBlockedHosts?: string[],
): string => {
  const normalizedSiteUrl = connectedSite?.siteUrl ? connectedSite.siteUrl.replace(/\/+$/, "") : "";
  const hasSemrushExternals = Array.isArray(semrushExternalUrls) && semrushExternalUrls.some((u) => u?.trim());
  const linkBlock = connectedSite
    ? `\nLinks: HTML ONLY. Same-site internals: [[LINK:query|anchor]] only. Internal = ${normalizedSiteUrl} only. ${
        hasSemrushExternals
          ? `External = entity Wikipedia when applicable, OR only URLs under APPROVED EXTERNAL URLs (SEMRUSH) in the system prompt - exact hrefs only. No other external sites.`
          : `External = ONLY entity Wikipedia page (when entity exists). No other external sites.`
      } NEVER link to competitors or businesses in the same industry. No "External Resources" sections. ${LINK_RULES(normalizedSiteUrl, currentPageUrl, semrushExternalUrls, portfolioBlockedHosts)}\n`
    : "";

  const entityName = entity?.trim() ?? "";
  const hasEntity = entityName && entityName !== "N/A";
  const entityBlock = hasEntity
    ? (() => {
        const general = getLocalEntityPhraseExamples(entityName, "general", 6);
        const expertise = getLocalEntityPhraseExamples(entityName, "expertise", 4);
        return `
Entity: ${entityName}. Use varied phrases: ${general.map((ex) => `"${ex}"`).join(", ")}. Place phrases: ${expertise.map((ex) => `"${ex}"`).join(", ")}. Local landmark/climate/process only if present in master instructions, GBP, inventory, existing HTML, or audit blocks; otherwise omit. Reduce keyword repetition with semantic product/topic variants — not hollow team filler. Short anchors (2–5 words). No nested anchors. ${ENTITY_FORBIDDEN}`;
      })()
    : `
No entity. General post; no locations or placeholders. ${ENTITY_FORBIDDEN}`;

  const acfParts: string[] = [];
  if (acfContext?.promptModifier?.trim()) acfParts.push(`${OPTIMIZER_INSTRUCTIONS_LABEL}: ${acfContext.promptModifier.trim()}`);
  if (acfContext?.keywordFocus?.trim()) acfParts.push(`Keyword focus: ${acfContext.keywordFocus.trim()}`);
  if (acfContext?.serviceArea?.trim()) acfParts.push(`Service area: ${acfContext.serviceArea.trim()}`);
  if (acfContext?.seoResearch?.trim()) {
    acfParts.push(
      `SEO content brief (JSON text in ACF seo_research - typically merged SERP/GSC/Semrush-style research from Overview; parse for intent - do not paste verbatim or keyword-stuff):\n${acfContext.seoResearch.trim()}`,
    );
  }
  if (acfContext?.contentRelevantFields && typeof acfContext.contentRelevantFields === "object") {
    for (const [k, v] of Object.entries(acfContext.contentRelevantFields)) {
      if (v?.trim()) acfParts.push(`${k}: ${v.trim()}`);
    }
  }
  const generalFocusRule = "Optimize for the page topic and primary keyword; the primary keyword is the main subject of the page, not the company name or a place.";
  if (acfParts.length) acfParts.push(generalFocusRule);
  const acfBlock = acfParts.length ? `\n=== ACF ===\n${acfParts.join("\n")}\n=== END ACF ===\n` : "";

  const gscBlock =
    gscKeywordsContext && gscKeywordsContext.trim().length > 0
      ? `\n${GSC_CONTENT_INTEGRATION_BLOCK}\n${gscKeywordsContext.trim()}\n`
      : "";

  const semrushKeywordsBlock =
    semrushKeywordsContext && semrushKeywordsContext.trim().length > 0
      ? `\n${SEMRUSH_KEYWORDS_RAG_BLOCK}\n${semrushKeywordsContext.trim()}\n`
      : "";

  const semrushScatterBlock =
    semrushScatterContext && semrushScatterContext.trim().length > 0
      ? `\n${SEMRUSH_CLUSTER_SCATTER_BLOCK}\n${semrushScatterContext.trim()}\n`
      : "";

  const legacySectionCount = Math.max(1, (sectionsPrompt.match(/<h2[\s>]/gi) || []).length);
  const legacyArticleCapLine = buildHarnessArticleCapLine(legacySectionCount);

  return [
    legacyArticleCapLine,
    `Entire article MUST NOT exceed ${ARTICLE_MAX_WORDS} words.`,
    "Write a complete professional blog article in HTML ONLY. Every element must be HTML: <h2>, <h3>, <p>, [[LINK:query|anchor]] internals, <ul><li>, <ol><li>, <table>, <footer> (closing contentinfo block per system prompt). NEVER use markdown (##, [text](url), |, -).",
    `Title: ${flowTitle || "Untitled Article"}`,
    `Purpose: ${flowPurpose}`,
    acfBlock,
    gscBlock,
    semrushKeywordsBlock,
    semrushScatterBlock,
    "Do not include H1 or 'Article Title:' in body. Start with the first H2 from the structure below.",
    "Use ONLY the headings below; do not add, remove, or change heading levels or counts.",
    sectionsPrompt,
    "--- Output ---",
    connectedSite && !hasWordPressPosts
      ? "One focused paragraph per heading unless section block says otherwise. CRITICAL: Do NOT add any internal links - no PAGES or BLOG POSTS titles from API."
      : "One focused paragraph per heading unless section block says otherwise. At least 2-3 [[LINK:query|anchor]] per body H2 from PAGES and BLOG POSTS titles (prose + table cells); natural sentence-case anchor text; follow INTERNAL LINK PLACEHOLDERS.",
    "Required: at least 1 <table>, 1 <ul><li>, 1 <ol><li>; distribute across sections. ALL tables (including FAQ) = HTML <table> only. NEVER | pipes | or |-|-|. FAQ table: <table><thead><tr><th>Question</th><th>Answer</th></tr></thead><tbody><tr><td>Q</td><td>A</td></tr></tbody></table>. Steps/sequences/processes = <ol><li> ONLY (never bullets). Features/benefits = <ul><li>. No nested sublists unless [LIST] requested. " + TABLE_NO_LINK_ONLY_COLUMN_RULE,
    hasSemrushExternals
      ? "Semrush externals - HARD REQUIREMENT: follow APPROVED EXTERNAL URLs (SEMRUSH) in the system prompt (count + exact hrefs). Integrate links in **body copy** as neutral reference / knowledge-base citations (vary wording; no boilerplate after every heading). Never frame as where to buy or not buy. Copy each href EXACTLY from the numbered list; do not invent URLs. Before you finish, verify the HTML contains the required distinct outbound <a href> to those list URLs."
      : "Do not mention external sites (Houzz, Reddit, etc.) or competitors. Wikipedia only for entity name (location) when entity exists - never for topics or products.",
    entityBlock,
    linkBlock,
    "Begin with the first <h2> (no H1):",
    "Never append copyright lines, ©, Copyright + year, All rights reserved, or invented brand/site names.",
  ].join("\n");
};

const HARNESS_SECTION_SCOPE_RULE_HTML = `**HARNESS – SINGLE SECTION ONLY**:
- Output exactly ONE section: the block under "Section to write". Start with that section's required heading (<h2> or FAQ <h2> as specified). Do NOT add any other top-level H2 from the plan in this response.
- Your response must contain **exactly 1** <h2> tag (Overview: <h2>Overview</h2> plus mandatory key-points <ul> only). A second <h2> makes the response invalid.
- Flat structure: never nest <h2> inside <h2>.
- Do not write a full article, article intro for the whole piece, or closing for the whole piece—only this section.
- Other H2s in the plan are written in separate harness steps. Do not include their headings, duplicate their topics, or append Overview scroll-link <ul> lists in body sections.
- Cover only this section's topic. Do not restate the whole article thesis or preview sibling H2s from the plan.
- Every paragraph ends with a complete sentence. Never output a standalone word (e.g. "Our") or partial link text.
- STOP: after your last </p>, </table>, </ol>, or </ul> (Overview), output nothing else.
- **Never** use <footer> or </footer> in this section. No exceptions.`;

const HARNESS_SECTION_LENGTH_RULE_HTML = `**HARNESS LENGTH (mandatory)**:
- **Section word cap**: obey **ARTICLE WORD BUDGET** in this prompt. Typical body section: **~450-530 words max** when the full article has 6 sections under the ${ARTICLE_MAX_WORDS}-word cap.
- Unmarked body sections: at most **2** <p> tags.
- Marked [LIST], [TABLE], [DECISION], [TRADEOFF], [NUMBERS]: **3** <p> tags plus the required table or list (do not skip the table/list).
- [ILLUSTRATIVE]: **3** <p> tags (do not invent a table).
- [RECOMMENDATION]: **3** <p> tags (do not invent a table) unless SAP PAGE TEMPLATE is in this prompt: then **1-2** <p> tags plus the four-column Product | Best for | Budget | Reason table.
- Each <p>: at most **3** sentences (use **4** per <p> when this section has [NUMBERS]). Moderately short paragraphs only.
- **MAX 2** <h3> subheadings in this section. No H4.
- Every paragraph MUST end with a complete sentence (. ! ?). If you cannot fit another sentence, finish the current sentence and STOP — never stop mid-sentence or mid-word.
- NEVER output Semrush API, MCP, subscription, or tool error messages in article HTML.
- Forbidden: full-article intros ("this guide will explore…"), repeating other outline H2 topics, restating the Answer definition, or restating content that belongs in other sections. Use section budget for sourced depth, not filler.`;

const HARNESS_SECTION_LENGTH_RULE_MARKDOWN = `**HARNESS LENGTH (mandatory)**:
- Unmarked body sections: at most **2** paragraphs after the ## line.
- Marked [LIST], [TABLE], [DECISION], [TRADEOFF], [NUMBERS]: **3** paragraphs plus the required table or list.
- [ILLUSTRATIVE]: **3** paragraphs (do not invent a table).
- [RECOMMENDATION]: **3** paragraphs (do not invent a table) unless SAP PAGE TEMPLATE is in this prompt: then **1-2** paragraphs plus the four-column Product | Best for | Budget | Reason table.
- Each paragraph: at most **3** sentences (use **4** when this block has [NUMBERS]).
- Forbidden: wire-style repetition of other blocks, full-release previews, restating the Answer definition, restating the whole thesis, or filler padding toward the article cap.`;

const HARNESS_SECTION_SCOPE_RULE_MARKDOWN = `**HARNESS – SINGLE SECTION ONLY**:
- Output exactly ONE section: the block under "Section to write". Start with that section's required ## heading as specified. Do NOT add any other top-level ## sections from the plan in this response.
- Do not write a full article, article intro for the whole piece, or closing for the whole piece—only this section.
- Other sections in the plan are written in separate steps. Do not include their headings or duplicate their topics as full sections.`;

function formatHarnessH2PlanBlock(
  allSectionTitles: string[],
  currentSectionIndex: number,
  assignedTitle: string,
): string {
  const planLines = allSectionTitles.map((title, i) => {
    if (i === currentSectionIndex) {
      return `${i + 1}. ${title}  ← YOU WRITE THIS ONE ONLY`;
    }
    return `${i + 1}. ${title}  [NOT YOUR SECTION — separate harness step]`;
  });
  const forbiddenSiblings = allSectionTitles
    .filter((_, i) => i !== currentSectionIndex)
    .map((t) => `- ${t}`);
  const forbiddenBlock =
    forbiddenSiblings.length > 0
      ? forbiddenSiblings.join("\n")
      : "- (no sibling sections besides yours)";
  const forbiddenSiblingH2List =
    forbiddenSiblings.length > 0
      ? forbiddenSiblings.map((t) => `- ${t}`).join("\n")
      : "";
  return [
    "=== ARTICLE H2 PLAN (titles only — write ONLY your assigned section) ===",
    ...planLines,
    "=== END PLAN ===",
    "",
    "FORBIDDEN IN YOUR OUTPUT:",
    `- Any ## heading except "${assignedTitle}"`,
    "- Any Overview scroll-link bullet list (Overview step only)",
    "- Any content belonging to these sibling sections:",
    forbiddenBlock,
    forbiddenSiblingH2List
      ? `\nThese must NOT appear as ## heading text in your output:\n${forbiddenSiblingH2List}`
      : "",
  ].join("\n");
}

/**
 * User prompt for one harness step (one blueprint agent / one H2-equivalent).
 * Reuses the same SEO/entity/link blocks as `buildUserPrompt` but scopes the writing task to a single section.
 */
export const buildBulkHarnessSectionUserPrompt = (
  flowTitle: string,
  flowPurpose: string,
  singleSectionPrompt: string,
  outlineBlock: string,
  otherSectionTitles: string[],
  currentSectionIndex: number,
  totalSections: number,
  connectedSite?: { name: string; siteUrl: string },
  entity?: string,
  acfContext?: AIDrivenACFContext,
  hasWordPressPosts?: boolean,
  currentPageUrl?: string,
  gscKeywordsContext?: string,
  semrushKeywordsContext?: string,
  semrushScatterContext?: string,
  semrushExternalUrls?: string[],
  portfolioBlockedHosts?: string[],
  contentKind?: "press_release",
  pressReleaseTopic?: string,
  /** Overview only: planned same-page #anchor citation targets. */
  inPageAnchorBlock?: string,
  /** Overview only: exact entity Wikipedia URL when CSV/row provides one (entity pages). */
  entityWikipediaUrl?: string,
  /** Harness section display title — exact <h2> text (non-Overview body sections). */
  harnessSectionDisplayTitle?: string,
  /** Stored ACF focus keyword (falls back to acfContext.keywordFocus). */
  primaryKeyword?: string,
  /** Blog harness: ordered H2 titles for plan-only context (replaces full outline block). */
  allSectionTitles?: string[],
  /** Merged multi-platform LLM audit guidance — mandatory local facts for this section. */
  llmAuditSummary?: string,
  /** DFS article audit optimization directives from upstream workflow step. */
  dfsArticleAuditBlock?: string,
  /** First-party claims + ChatGPT business facts (optimize / post creator). */
  firstPartyAuthorityBlock?: string,
  /** Published Answer section for later H2s (do not recap; illustrative also uses economic ceiling). */
  answerGroundingBlock?: string,
  /** LLM audit liveLinks classified as authority (gov, municipal, news). */
  llmAuditAuthorityExternalPairs?: ExternalLinkPair[],
  /** Body H2 only: predetermined link assignments for this section title. */
  sectionLinkTargetsBlock?: string,
  /** Competitor-comparison entity row (not SAP geo). */
  competitorComparisonHarness?: boolean,
): string => {
  const normalizedSiteUrl = connectedSite?.siteUrl ? connectedSite.siteUrl.replace(/\/+$/, "") : "";
  const storedKeyword = (primaryKeyword ?? acfContext?.keywordFocus ?? "").trim();
  const entityRaw = entity?.trim() ?? "";
  const hasEntityRow = entityRaw && entityRaw !== "N/A";
  const normalizedEntity = hasEntityRow ? normalizeEntityHintCommaLabel(entityRaw) : "";
  const serviceTopicForEntity =
    hasEntityRow && storedKeyword
      ? resolveServiceTopicKeyword(storedKeyword, normalizedEntity)
      : "";
  const writingKw = storedKeyword
    ? resolveWritingKeyword(serviceTopicForEntity || storedKeyword)
    : "";
  const keywordPunctuationBlock = storedKeyword
    ? buildKeywordPunctuationPromptBlock(storedKeyword, writingKw)
    : "";
  const hasSemrushExternals = Array.isArray(semrushExternalUrls) && semrushExternalUrls.some((u) => u?.trim());
  const hasLlmAuditAuthority =
    (llmAuditAuthorityExternalPairs?.length ?? 0) > 0;
  const hasApprovedExternals = hasSemrushExternals || hasLlmAuditAuthority;
  const isPressReleaseHarness = contentKind === "press_release";
  const entityKeywordVariantBlock =
    connectedSite && hasEntityRow && storedKeyword && !isPressReleaseHarness
      ? formatEntityKeywordVariantPromptBlock({
          entity: normalizedEntity,
          keyword: storedKeyword,
        })
      : "";
  const isOverviewSection = Boolean(inPageAnchorBlock?.trim());
  const isIllustrativeBodySection =
    !isOverviewSection &&
    !isPressReleaseHarness &&
    /\[ILLUSTRATIVE\]|ILLUSTRATIVE SCENARIO|ILLUSTRATIVE PERSONA/i.test(singleSectionPrompt);
  const entityNameForWiki = normalizedEntity || entityRaw;
  const wikiUrlForOverview = entityWikipediaUrl?.trim() ?? "";
  const overviewHasEntityWiki =
    isOverviewSection &&
    Boolean(entityNameForWiki) &&
    entityNameForWiki !== "N/A" &&
    Boolean(wikiUrlForOverview);
  const overviewLinkBlock = buildOverviewLinkRulesBlock({
    entity: entityNameForWiki,
    wikipediaUrl: wikiUrlForOverview,
    hasIllustrativeAnchor: inPageAnchorBlock?.includes("ILLUSTRATIVE (Real-World Example"),
  });
  const linkBlock = isOverviewSection
    ? overviewLinkBlock
    : connectedSite
      ? `\nLinks: Internal = ${normalizedSiteUrl} only when natural via [[LINK:query|anchor]]. ${
          hasApprovedExternals
            ? "User-specified externals only: [[EXTERNAL:exact-url|exact-anchor]] copied from the APPROVED EXTERNAL URLs block — never [anchor](url). No other third-party sites."
            : "No third-party external links. Forbidden: [[EXTERNAL:...]], raw https:// in prose, and third-party <a href=\"https://...\">. Internal links and entity Wikipedia only when listed."
        } NEVER link to competitors. No "External Resources" sections.\n`
      : "";

  const hasEntity = Boolean(normalizedEntity);
  const proseEntity = hasEntity ? entityLabelForProse(normalizedEntity) : "";
  const entityReferenceBlock = hasEntity
    ? formatEntityReferencePromptBlock({
        entity: normalizedEntity,
        keyword: storedKeyword || undefined,
      })
    : "";
  const geoKeywordNote =
    serviceTopicForEntity &&
    storedKeyword &&
    serviceTopicForEntity.toLowerCase() !== storedKeyword.toLowerCase()
      ? `\nService topic for prose: "${writingKw}". Full SEO keyword "${storedKeyword}" is metadata-only — do not paste the geo-stuffed slug in body copy.`
      : "";
  const entityBlock =
    competitorComparisonHarness && hasEntity
      ? `
Competitor business (provider comparison — NOT a geography): ${normalizedEntity}.
Forbidden: "near ${normalizedEntity}", treating the competitor as a neighborhood, or "homes in ${normalizedEntity}".
Edmonton / regional climate and home-style facts only as regional context. ${ENTITY_FORBIDDEN}`
      : hasEntity
        ? isOverviewSection
          ? `
${entityReferenceBlock}
Entity: ${normalizedEntity}. Use varied phrases: ${getLocalEntityPhraseExamples(proseEntity, "general", 6).map((ex) => `"${ex}"`).join(", ")}. Place phrases: ${getLocalEntityPhraseExamples(proseEntity, "expertise", 4).map((ex) => `"${ex}"`).join(", ")}. Local landmark/climate/process only if present in master instructions, GBP, inventory, existing HTML, or audit blocks; otherwise omit. Reduce keyword repetition with semantic product/topic variants — not hollow team filler. Overview lead paragraphs only: optional entity Wikipedia link per Overview LINKS block — no site links or # scroll links in lead prose.${geoKeywordNote} ${ENTITY_FORBIDDEN}`
          : (() => {
            const general = getLocalEntityPhraseExamples(proseEntity, "general", 6);
            const expertise = getLocalEntityPhraseExamples(proseEntity, "expertise", 4);
            return `
${entityReferenceBlock}
Entity: ${normalizedEntity}. Use varied phrases: ${general.map((ex) => `"${ex}"`).join(", ")}. Place phrases: ${expertise.map((ex) => `"${ex}"`).join(", ")}. Local landmark/climate/process only if present in master instructions, GBP, inventory, existing HTML, or audit blocks; otherwise omit. Reduce keyword repetition with semantic product/topic variants — not hollow team filler. Short anchors (2–5 words). No nested anchors.${geoKeywordNote} ${ENTITY_FORBIDDEN}`;
          })()
        : `
No entity. General post; no locations or placeholders. ${ENTITY_FORBIDDEN}`;

  const acfParts: string[] = [];
  if (acfContext?.promptModifier?.trim()) acfParts.push(`${OPTIMIZER_INSTRUCTIONS_LABEL}: ${acfContext.promptModifier.trim()}`);
  if (acfContext?.keywordFocus?.trim()) acfParts.push(`Keyword focus: ${acfContext.keywordFocus.trim()}`);
  if (acfContext?.serviceArea?.trim()) {
    acfParts.push(
      competitorComparisonHarness
        ? `Competitor fields: ${acfContext.serviceArea.trim()}`
        : `Service area: ${acfContext.serviceArea.trim()}`,
    );
  }
  if (acfContext?.seoResearch?.trim()) {
    acfParts.push(
      `SEO content brief (JSON text in ACF seo_research - typically merged SERP/GSC/Semrush-style research from Overview; parse for intent - do not paste verbatim or keyword-stuff):\n${acfContext.seoResearch.trim()}`,
    );
  }
  if (acfContext?.contentRelevantFields && typeof acfContext.contentRelevantFields === "object") {
    for (const [k, v] of Object.entries(acfContext.contentRelevantFields)) {
      if (v?.trim()) acfParts.push(`${k}: ${v.trim()}`);
    }
  }
  if (!isPressReleaseHarness) {
    const generalFocusRule =
      "Optimize for the page topic and primary keyword; the primary keyword is the main subject of the page, not the company name or a place.";
    if (acfParts.length) acfParts.push(generalFocusRule);
  }
  const acfBlock = acfParts.length ? `\n=== ACF ===\n${acfParts.join("\n")}\n=== END ACF ===\n` : "";

  const gscBlock =
    gscKeywordsContext && gscKeywordsContext.trim().length > 0
      ? `\n${GSC_CONTENT_INTEGRATION_BLOCK}\n${gscKeywordsContext.trim()}\n`
      : "";

  const semrushKeywordsBlock =
    semrushKeywordsContext && semrushKeywordsContext.trim().length > 0
      ? `\n${SEMRUSH_KEYWORDS_RAG_BLOCK}\n${semrushKeywordsContext.trim()}\n`
      : "";

  const semrushScatterBlock =
    semrushScatterContext && semrushScatterContext.trim().length > 0
      ? `\n${SEMRUSH_CLUSTER_SCATTER_BLOCK}\n${semrushScatterContext.trim()}\n`
      : "";

  const llmAuditBlock = formatLlmAuditHarnessPromptBlock(llmAuditSummary ?? "");
  const dfsArticleAuditHarnessBlock = dfsArticleAuditBlock?.trim()
    ? formatDfsArticleAuditHarnessPromptBlockFromText(dfsArticleAuditBlock)
    : "";

  const siblingBlock = isPressReleaseHarness
    ? "Other blocks of this release are written separately. Output only this block with your own invented ## subhead; do not preview or duplicate other blocks."
    : otherSectionTitles.length > 0
      ? `Other H2s in this article plan (titles only; do not duplicate these as additional top-level H2s or repeat them as full sections):\n${otherSectionTitles.map((t) => `- ${t}`).join("\n")}`
      : "No sibling headings besides yours—still write only this section.";

  const assignedTitle =
    harnessSectionDisplayTitle?.trim() ||
    (isOverviewSection ? "Overview" : allSectionTitles?.[currentSectionIndex]?.trim()) ||
    "";
  const h2PlanBlock =
    !isPressReleaseHarness && allSectionTitles && allSectionTitles.length > 0 && assignedTitle
      ? formatHarnessH2PlanBlock(allSectionTitles, currentSectionIndex, assignedTitle)
      : "";

  const prTopicBlock =
    isPressReleaseHarness && pressReleaseTopic?.trim()
      ? `\n**RELEASE TOPIC (light touch)**: ${pressReleaseTopic.trim()} — inform the angle; do not repeat the exact phrase in every ## or paragraph.`
      : "";

  const scopeRule = HARNESS_SECTION_SCOPE_RULE_MARKDOWN;
  const formatLine =
    `Write in MARKDOWN ONLY for this section: ##, ###, paragraphs, [[LINK:query|anchor]] internals, - lists. ${MARKDOWN_QUOTE_OUTPUT_RULE} NEVER HTML. NEVER [text](https://...) or raw hrefs for same-site links. ${INTERNAL_LINK_INTENT_ROUTING_RULE}`;

  const lengthRule = HARNESS_SECTION_LENGTH_RULE_MARKDOWN;

  const articleBudgetBlock = isPressReleaseHarness
    ? ""
    : buildHarnessArticleBudgetBlock(currentSectionIndex, totalSections);

  const planOrOutlineBlock = h2PlanBlock
    ? h2PlanBlock
    : [
        "=== FULL ARTICLE OUTLINE (for context; write ONLY the current section) ===",
        outlineBlock,
        "=== END OUTLINE ===",
        siblingBlock,
      ].join("\n");

  return [
    buildBlacklistRagBlock(),
    scopeRule,
    FORBIDDEN_WORDS_USER_PROMPT_REMINDER,
    lengthRule,
    isPressReleaseHarness ? "" : INSTALLER_EXPERTISE_GATE_RULE,
    isPressReleaseHarness ? "" : FORBIDDEN_HOLLOW_AUTHORITY_RULE,
    isPressReleaseHarness ? "" : A_PLUS_HOMEOWNER_ARTICLE_RULE,
    isPressReleaseHarness ? "" : A_PLUS_KEYWORD_AUTHORITY_RULE,
    isPressReleaseHarness ? "" : AISO_AUTHORITY_PHRASING_RULE,
    isPressReleaseHarness ? "" : AISO_DEPTH_RULE,
    isPressReleaseHarness ? "" : AISO_SEMANTIC_BREADTH_RULE,
    isPressReleaseHarness || !entityKeywordVariantBlock ? "" : entityKeywordVariantBlock,
    isPressReleaseHarness || !connectedSite || !isIllustrativeBodySection
      ? ""
      : `${ILLUSTRATIVE_SCENARIO_PERSONA_RULE}\n${ILLUSTRATIVE_BLOCKQUOTE_RULE}`,
    isPressReleaseHarness || !connectedSite || !isIllustrativeBodySection
      ? ""
      : ILLUSTRATIVE_ANSWER_GROUNDING_RULE,
    isPressReleaseHarness || !isOverviewSection || !connectedSite
      ? ""
      : OVERVIEW_ASSIGNED_PERSONA_RULE,
    isPressReleaseHarness || isOverviewSection || !connectedSite || isIllustrativeBodySection
      ? ""
      : NON_ILLUSTRATIVE_HYPOTHETICAL_BAN_RULE,
    AUTHENTICITY_WRITER_RULE,
    hasEntity && !isPressReleaseHarness
      ? competitorComparisonHarness
        ? formatCompetitorComparisonWriterBlock(normalizedEntity, connectedSite?.name)
        : formatSapPageWriterBlock(normalizedEntity)
      : "",
    isPressReleaseHarness || isOverviewSection ? "" : FIRST_PARAGRAPH_AUTHORITY_RULE,
    FIRST_PARTY_AUTHORITY_WRITING_RULE,
    PHRASE_VARIATION_RULE,
    connectedSite && storedKeyword && !isPressReleaseHarness
      ? connectedSiteTopicAisoRules(storedKeyword)
      : "",
    articleBudgetBlock,
    keywordPunctuationBlock,
    formatLine,
    prTopicBlock,
    `Article title: ${flowTitle || "Untitled Article"}`,
    `Purpose: ${flowPurpose}`,
    `Section ${currentSectionIndex + 1} of ${totalSections} (harness pass).`,
    isPressReleaseHarness
      ? "Before body text, output exactly one ## line you invent: a topical subhead for the keyword and business. Do not use outline or template wording as the ## text. Do not repeat the wire dateline or a calendar date unless this is section 1."
      : "",
    planOrOutlineBlock,
    sectionLinkTargetsBlock?.trim() ? sectionLinkTargetsBlock.trim() : "",
    "=== SECTION TO WRITE (follow heading and structure exactly) ===",
    singleSectionPrompt,
    "=== END SECTION ===",
    harnessSectionDisplayTitle?.trim() && !isPressReleaseHarness && !isOverviewSection
      ? `NON-NEGOTIABLE ## TITLE: The first ## line MUST be exactly: "${harnessSectionDisplayTitle.trim()}" — no paraphrase, reorder, or substitute wording. Forbidden: ## Section, ## Intro, ## Introduction, ## Content, ## Overview, or any placeholder. Output no other top-level ## heading.`
      : "",
    inPageAnchorBlock?.trim() ? inPageAnchorBlock.trim() : "",
    "--- Output ---",
    isOverviewSection
      ? overviewHasEntityWiki
        ? `Output ## Overview, 1-2 lead paragraphs that map remaining sections (NO em dashes; obey WORD BLACKLIST above). Do not recap the published Answer (dates, rates, percentages, dollar figures, statute stack, or closing company sentence). When connected-site rules apply: second lead sentence must state the article includes a labeled real-world hypothetical (one genderless named persona under stated assumptions with a site-level business recommendation) and point forward to the Real-World Example section (do not paste the full scenario in Overview; no payback or savings numbers in Overview). Then a - bullet list with one item per IN-PAGE anchor. The anchor tagged ILLUSTRATIVE MUST use bullet label **Real-World Example** exactly. Each bullet: **Label**: one sentence with exactly ONE [2-4 words](#exact-id). FORBIDDEN: second link in the same bullet, duplicate #id links, or "including [link]" phrasing. Optional entity Wikipedia in first paragraph: [${entityNameForWiki}](${wikiUrlForOverview}). Never "see below". Stop after the bullet list.`
        : 'Output ## Overview, 1-2 lead paragraphs that map remaining sections (NO em dashes; obey WORD BLACKLIST above). Do not recap the published Answer (dates, rates, percentages, dollar figures, statute stack, or closing company sentence). When connected-site rules apply: second lead sentence must state the article includes a labeled real-world hypothetical (one genderless named persona under stated assumptions with a site-level business recommendation) and point forward to the Real-World Example section (do not paste the full scenario in Overview; no payback or savings numbers in Overview). Then a - bullet list with one item per IN-PAGE anchor. The anchor tagged ILLUSTRATIVE MUST use bullet label **Real-World Example** exactly. Each bullet: one sentence with exactly ONE [2-4 words](#exact-id). FORBIDDEN: second link in the same bullet, duplicate #id links, or "including [link]" phrasing. Never "see below". Stop after the bullet list.'
      : connectedSite && !hasWordPressPosts
      ? "CRITICAL: Do NOT add internal links—no linkable URLs from API—for this section unless the system prompt lists URLs."
      : sectionLinkTargetsBlock?.trim()
        ? `Include [[LINK:query|anchor]] placeholders where a relevant internal page genuinely supports this section's text. Follow THIS SECTION LINK ASSIGNMENTS above for the queries to use. Format is exactly [[LINK:query|anchor]] — never {{LINK:...}}, {LINK:...}, or raw https:// internal URLs in body sections.`
        : `Include [[LINK:query|anchor]] placeholders where a relevant internal page genuinely supports this section's text, woven into prose and table cells. Use distinct plan queries when LINK TARGETS PLAN is present. Format is exactly [[LINK:query|anchor]] — never {{LINK:...}}, {LINK:...}, or raw https:// internal URLs in body sections.`,
    `Follow the section block for lists or quotes. ${MARKDOWN_QUOTE_OUTPUT_RULE} Use Markdown pipe tables only. NEVER HTML. ` + TABLE_NO_LINK_ONLY_COLUMN_RULE,
    hasApprovedExternals
      ? "User-specified externals only: weave [[EXTERNAL:exact-url|exact-anchor]] mid-sentence in a paragraph (same rules as [[LINK:...]]). Copy exact URL and anchor from APPROVED EXTERNAL URLs — never bare domain, never 'for more'/'here', never after the final period."
      : "No third-party external links. Forbidden: [[EXTERNAL:...]], raw https://, and third-party <a href>. Wikipedia only when entity URL is listed.",
    isPressReleaseHarness ? "" : entityBlock,
    linkBlock,
    acfBlock,
    llmAuditBlock,
    dfsArticleAuditHarnessBlock,
    answerGroundingBlock?.trim() ? answerGroundingBlock.trim() : "",
    firstPartyAuthorityBlock?.trim() ? firstPartyAuthorityBlock.trim() : "",
    gscBlock,
    semrushKeywordsBlock,
    semrushScatterBlock,
    isPressReleaseHarness
      ? "Do not include an H1 or 'Article Title:' line. Output must begin with your invented ## subhead, then the body."
      : "Do not include an H1 or 'Article Title:' line. Start with this section's required ## heading.",
    "Never append copyright lines, ©, Copyright + year, All rights reserved, or invented brand/site names.",
  ].join("\n");
};
