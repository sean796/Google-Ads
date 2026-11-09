import { ARTICLE_MAX_WORDS, buildHarnessArticleBudgetBlock } from "@/lib/content-generation/article-length-policy";
import {
  MIN_INTERNAL_LINKS_PER_BODY_H2,
  TARGET_INTERNAL_LINKS_PER_BODY_H2,
} from "@/lib/content-generation/link-anchor-text-case";
import { buildBlacklistRagBlock, FORBIDDEN_WORDS_USER_PROMPT_REMINDER } from "../content-word-blocklist";
import { buildKeywordPunctuationPromptBlock, resolveWritingKeyword } from "./keyword-canonical-punctuation";
import { formatDfsArticleAuditHarnessPromptBlockFromText } from "@/lib/dfs-article-audit/format-dfs-article-audit-harness";
import type { ExternalLinkPair } from "@/lib/content-generation/external-link-placeholders";
import type { AIDrivenACFContext } from "../content-generation/ai-driven-post-fields-reader";
import { formatLlmAuditHarnessPromptBlock } from "@/lib/llm-audit/llm-audit-dataforseo";
import { formatEntityKeywordVariantPromptBlock } from "@/lib/entity-keyword-variant-phrases";
import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import { entityLabelForProse, formatEntityReferencePromptBlock, resolveServiceTopicKeyword } from "@/lib/entity-place-reference";
import { getLocalEntityPhraseExamples } from "../local-entity-phrases";
import { buildOverviewLinkRulesBlock } from "./overview-link-rules";
import { formatSapPageWriterBlock } from "@/lib/prompt-builders/sap-page-template";
import { formatCompetitorComparisonWriterBlock } from "@/lib/prompt-builders/competitor-comparison-page-template";
import { MARKDOWN_QUOTE_OUTPUT_RULE } from "../feature-mapping";
import { TABLE_NO_LINK_ONLY_COLUMN_RULE, AUTHENTICITY_WRITER_RULE } from "./core";
import { INTERNAL_LINK_INTENT_ROUTING_RULE } from "@/lib/bulk/bulk-generation-wp-inventory";
import { FIRST_PARAGRAPH_AUTHORITY_RULE, FIRST_PARTY_AUTHORITY_WRITING_RULE, BUSINESS_CONTACT_CAP_RULE, A_PLUS_HOMEOWNER_ARTICLE_RULE, A_PLUS_KEYWORD_AUTHORITY_RULE, AISO_AUTHORITY_PHRASING_RULE, AISO_DEPTH_RULE, AISO_SEMANTIC_BREADTH_RULE, INSTALLER_EXPERTISE_GATE_RULE, FORBIDDEN_HOLLOW_AUTHORITY_RULE, PHRASE_VARIATION_RULE, ILLUSTRATIVE_BLOCKQUOTE_RULE, ILLUSTRATIVE_SCENARIO_PERSONA_RULE, NON_ILLUSTRATIVE_HYPOTHETICAL_BAN_RULE, OVERVIEW_ASSIGNED_PERSONA_RULE } from "@/lib/content-optimization/first-party-authority-prompt";
import { ILLUSTRATIVE_ANSWER_GROUNDING_RULE } from "@/lib/content-optimization/defensible-specificity-prompt";
import { GSC_CONTENT_INTEGRATION_BLOCK, SEMRUSH_KEYWORDS_RAG_BLOCK, SEMRUSH_CLUSTER_SCATTER_BLOCK, ENTITY_FORBIDDEN, OPTIMIZER_INSTRUCTIONS_LABEL, connectedSiteTopicAisoRules } from "./system-user-shared-blocks";

export const HARNESS_SECTION_SCOPE_RULE_HTML = `**HARNESS – SINGLE SECTION ONLY**:
- Output exactly ONE section: the block under "Section to write". Start with that section's required heading (<h2> or FAQ <h2> as specified). Do NOT add any other top-level H2 from the plan in this response.
- Your response must contain **exactly 1** <h2> tag (Overview: <h2>Overview</h2> plus mandatory key-points <ul> only). A second <h2> makes the response invalid.
- Flat structure: never nest <h2> inside <h2>.
- Do not write a full article, article intro for the whole piece, or closing for the whole piece—only this section.
- Other H2s in the plan are written in separate harness steps. Do not include their headings, duplicate their topics, or append Overview scroll-link <ul> lists in body sections.
- Cover only this section's topic. Do not restate the whole article thesis or preview sibling H2s from the plan.
- Every paragraph ends with a complete sentence. Never output a standalone word (e.g. "Our") or partial link text.
- STOP: after your last </p>, </table>, </ol>, or </ul> (Overview), output nothing else.
- **Never** use <footer> or </footer> in this section. No exceptions.`;

export const HARNESS_SECTION_LENGTH_RULE_HTML = `**HARNESS LENGTH (mandatory)**:
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

export const HARNESS_SECTION_LENGTH_RULE_MARKDOWN = `**HARNESS LENGTH (mandatory)**:
- Unmarked body sections: at most **2** paragraphs after the ## line.
- Marked [LIST], [TABLE], [DECISION], [TRADEOFF], [NUMBERS]: **3** paragraphs plus the required table or list.
- [ILLUSTRATIVE]: **3** paragraphs (do not invent a table).
- [RECOMMENDATION]: **3** paragraphs (do not invent a table) unless SAP PAGE TEMPLATE is in this prompt: then **1-2** paragraphs plus the four-column Product | Best for | Budget | Reason table.
- Each paragraph: at most **3** sentences (use **4** when this block has [NUMBERS]).
- Forbidden: wire-style repetition of other blocks, full-release previews, restating the Answer definition, restating the whole thesis, or filler padding toward the article cap.`;

export const HARNESS_SECTION_SCOPE_RULE_MARKDOWN = `**HARNESS – SINGLE SECTION ONLY**:
- Output exactly ONE section: the block under "Section to write". Start with that section's required ## heading as specified. Do NOT add any other top-level ## sections from the plan in this response.
- Do not write a full article, article intro for the whole piece, or closing for the whole piece—only this section.
- Other sections in the plan are written in separate steps. Do not include their headings or duplicate their topics as full sections.`;

export function formatHarnessH2PlanBlock(
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
    isPressReleaseHarness ? "" : BUSINESS_CONTACT_CAP_RULE,
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
        ? `MANDATORY: Ship ${MIN_INTERNAL_LINKS_PER_BODY_H2}-${TARGET_INTERNAL_LINKS_PER_BODY_H2} distinct [[LINK:query|anchor]] placeholders in this body H2 (target ${TARGET_INTERNAL_LINKS_PER_BODY_H2}). Follow THIS SECTION LINK ASSIGNMENTS above first, then add PAGES/BLOG POSTS queries from the system prompt until you reach at least ${MIN_INTERNAL_LINKS_PER_BODY_H2}. Count [[LINK:...]] tokens before you stop. Format is exactly [[LINK:query|anchor]] — never {{LINK:...}}, {LINK:...}, or raw https:// internal URLs in body sections.`
        : `MANDATORY: Include ${MIN_INTERNAL_LINKS_PER_BODY_H2}-${TARGET_INTERNAL_LINKS_PER_BODY_H2} [[LINK:query|anchor]] placeholders in this body H2 section (target ${TARGET_INTERNAL_LINKS_PER_BODY_H2} when this section has a table or 3+ paragraphs). Weave into prose and table cells. Use distinct plan queries when LINK TARGETS PLAN is present. Format is exactly [[LINK:query|anchor]] — never {{LINK:...}}, {LINK:...}, or raw https:// internal URLs in body sections.`,
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
