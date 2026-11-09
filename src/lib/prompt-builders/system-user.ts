import { ARTICLE_MAX_WORDS, buildHarnessArticleCapLine } from "@/lib/content-generation/article-length-policy";
import { INTERNAL_LINK_PLACEHOLDER_PROMPT_BLOCK } from "../content-generation/internal-link-placeholders";
import { formatBlogPlayLinkTargetsPrompt, formatLinkTargetsPlanPrompt, keepBlogPlayLinkTargets, type LinkTargetsPlan } from "@/lib/bulk/bulk-generation-wp-inventory";
import { EXTERNAL_LINK_PLACEHOLDER_PROMPT_BLOCK, type ExternalLinkPair } from "../content-generation/external-link-placeholders";
import { appendMasterInstructionsToSystemPrompt, ensureMasterInstructionsInMemory } from "../master-instructions-storage";
import { getSiteCache } from "../wordpress-site-cache";
import { formatEntityKeywordVariantPromptBlock } from "@/lib/entity-keyword-variant-phrases";
import { getLocalEntityPhraseExamples } from "../local-entity-phrases";
import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import { resolveServiceTopicKeyword } from "@/lib/entity-place-reference";
import type { AIDrivenACFContext } from "../content-generation/ai-driven-post-fields-reader";
import { CRITICAL_LINK_RULE, SYSTEM_PROMPT_CORE, TABLE_NO_LINK_ONLY_COLUMN_RULE } from "./core";
import { MARKDOWN_QUOTE_OUTPUT_RULE } from "../feature-mapping";
import { appendUniversalContentRulesToSystemPrompt } from "../content-word-blocklist";
import { buildKeywordPunctuationPromptBlock, resolveWritingKeyword } from "./keyword-canonical-punctuation";
import { FIRST_PARAGRAPH_AUTHORITY_RULE, FIRST_PARTY_AUTHORITY_WRITING_RULE, BUSINESS_CONTACT_CAP_RULE, A_PLUS_HOMEOWNER_ARTICLE_RULE, A_PLUS_KEYWORD_AUTHORITY_RULE, AISO_AUTHORITY_PHRASING_RULE, AISO_DEPTH_RULE, AISO_SEMANTIC_BREADTH_RULE, INSTALLER_EXPERTISE_GATE_RULE, FORBIDDEN_HOLLOW_AUTHORITY_RULE, PHRASE_VARIATION_RULE, SERVICE_AREA_DENSITY_RULE, A_LEVEL_CONNECTED_SITE_ARTICLE_RULE, A_LEVEL_DECISION_PRECISION_RULE, FACTUAL_VERIFICATION_SOURCE_RULE, ILLUSTRATIVE_BLOCKQUOTE_RULE, ILLUSTRATIVE_SCENARIO_PERSONA_RULE, PRIMARY_CITY_CONSISTENCY_RULE, formatSiteUsedOpenersPromptBlock } from "@/lib/content-optimization/first-party-authority-prompt";
import { DEFENSIBLE_SPECIFICITY_RULE, NUMERIC_DENSITY_TARGET_RULE, ILLUSTRATIVE_ANSWER_GROUNDING_RULE } from "@/lib/content-optimization/defensible-specificity-prompt";
import { connectedSiteTopicAisoRules, buildSemrushApprovedExternalBlock, buildLlmAuditAuthorityApprovedBlock, buildTargetSiteBlock, buildEntityBlock, buildRegularBlogBlock, MARKDOWN_FORMAT_RULES, HTML_FORMAT_RULES_HARNESS_SECTION, HTML_FORMAT_RULES_FULL_ARTICLE, HARNESS_MODE_SYSTEM_BLOCK, LINK_RULES, ENTITY_FORBIDDEN, GSC_CONTENT_INTEGRATION_BLOCK, SEMRUSH_KEYWORDS_RAG_BLOCK, SEMRUSH_CLUSTER_SCATTER_BLOCK, OPTIMIZER_INSTRUCTIONS_LABEL, type BuildSystemPromptGenerationMode } from "./system-user-shared-blocks";
export { connectedSiteTopicAisoRules, semrushTargetDistinctCount, NO_COPYRIGHT_FAKE_BRAND_RULE, LINK_RULES, buildSemrushApprovedExternalBlock, buildLlmAuditAuthorityApprovedBlock, MARKDOWN_FORMAT_RULES, HTML_FORMAT_RULES, HTML_SEMANTIC_FOOTER_RULES, HTML_FORMAT_RULES_FULL_ARTICLE, HARNESS_HTML_NO_FOOTER_ELEMENT_RULES, HARNESS_ANCHOR_TAG_FORMAT_RULE, HTML_FORMAT_RULES_HARNESS_SECTION, HARNESS_MODE_SYSTEM_BLOCK, ENTITY_FORBIDDEN, buildTargetSiteBlock, buildEntityBlock, buildRegularBlogBlock, GSC_CONTENT_INTEGRATION_BLOCK, SEMRUSH_KEYWORDS_RAG_BLOCK, SEMRUSH_CLUSTER_SCATTER_BLOCK, OPTIMIZER_INSTRUCTIONS_LABEL, mergeOptimizerInstructions } from "./system-user-shared-blocks";
export { type BuildSystemPromptGenerationMode } from "./system-user-shared-blocks";
export { HARNESS_SECTION_SCOPE_RULE_HTML, HARNESS_SECTION_LENGTH_RULE_HTML, HARNESS_SECTION_LENGTH_RULE_MARKDOWN, HARNESS_SECTION_SCOPE_RULE_MARKDOWN, formatHarnessH2PlanBlock, buildBulkHarnessSectionUserPrompt } from "./harness-section-user-prompt";

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
    ? `\n${INSTALLER_EXPERTISE_GATE_RULE}\n${FORBIDDEN_HOLLOW_AUTHORITY_RULE}\n${A_PLUS_HOMEOWNER_ARTICLE_RULE}\n${A_PLUS_KEYWORD_AUTHORITY_RULE}\n${AISO_AUTHORITY_PHRASING_RULE}\n${AISO_DEPTH_RULE}\n${AISO_SEMANTIC_BREADTH_RULE}\n${entityKeywordVariantBlock}\n${A_LEVEL_CONNECTED_SITE_ARTICLE_RULE}\n${A_LEVEL_DECISION_PRECISION_RULE}\n${PRIMARY_CITY_CONSISTENCY_RULE}\n${ILLUSTRATIVE_SCENARIO_PERSONA_RULE}\n${ILLUSTRATIVE_BLOCKQUOTE_RULE}\n${ILLUSTRATIVE_ANSWER_GROUNDING_RULE}\n${FACTUAL_VERIFICATION_SOURCE_RULE}\n${DEFENSIBLE_SPECIFICITY_RULE}\n${NUMERIC_DENSITY_TARGET_RULE}\n${FIRST_PARAGRAPH_AUTHORITY_RULE}\n${FIRST_PARTY_AUTHORITY_WRITING_RULE}\n${BUSINESS_CONTACT_CAP_RULE}\n${PHRASE_VARIATION_RULE}${pk ? connectedSiteTopicAisoRules(pk) : ""}`
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
