import { z } from "zod";
import { streamChatCompletion, loadApiKey } from "./api";
import { postOpenRouterAppChat } from "@/lib/openrouter-app-api";
import { clampOpenRouterMaxTokens } from "@/lib/openrouter-stream-chat-core";
import type { KeywordData, BlogTemplateChecklist, PeopleAlsoAsk } from "./keyword-types";
import type { AgentConfig } from "@/types/agent-config";
import {
  BULK_WORDPRESS_POST_TITLE_RULE,
  CRITICAL_LINK_RULE,
  NO_FAKE_TESTIMONIALS_RULE,
  TITLE_WELL_KNOWN_ACRONYMS_RULE,
  AUTHENTICITY_CHECKLIST_RULE,
} from "./prompt-builders";
import { formatResearchAsOfLabel } from "@/lib/content-optimization/topic-research-fanout";
import { TABLE_NO_LINK_ONLY_COLUMN_RULE } from "@/lib/prompt-builders/table-prompt-rules";
import { getResearchModel } from "./optimization-settings-storage";
import {
  formatBlogPlayLinkTargetsPrompt,
  INTERNAL_LINK_INTENT_ROUTING_RULE,
  keepBlogPlayLinkTargets,
} from "./bulk/bulk-generation-wp-inventory";
import { getLocalEntityPhraseExamples, getLocalExpertisePhrase, getLocalGeneralPhrase } from "./local-entity-phrases";
import { truncateTitleForSEO } from "./content-generation/content-sanitizer";
import type { CheckedExternalLink } from "./external-research";
import { formatImportedDraftLinksForPrompt, type ImportedDraftLink } from "./bulk/blog-import-draft-links";
import {
  formatModifierExternalLinksForPrompt,
  formatLlmAuditAuthorityLinksForPrompt,
  type ModifierExternalLink,
  type LlmAuditAuthorityLinkLike,
} from "./bulk/modifier-external-links";
import type { ExternalLinkPair } from "./content-generation/external-link-placeholders";
import { formatMandatoryEntityWikipediaForPrompt } from "./bulk/entity-wikipedia-prompt";
import {
  deriveSerpH2Outline,
  formatSerpH2OutlineBlock,
  validateSerpH2OutlineTitles,
} from "@/lib/content-optimization/serp-h2-outline";
import {
  formatSapChecklistExample,
  formatSapPageChecklistBlock,
} from "@/lib/prompt-builders/sap-page-template";
import { isCompetitorCsvKeyword } from "@/lib/competitor-research/competitor-csv-row";
import {
  ARTICLE_MAX_WORDS,
  buildArticleLengthChecklistBlock,
  buildBlueprintArticleLengthBlock,
} from "@/lib/content-generation/article-length-policy";
import {
  INTERNAL_LINK_PLACEHOLDER_FEATURE_SUFFIX,
} from "@/lib/content-generation/internal-link-placeholders";
import {
  appendUniversalContentRulesToSystemPrompt,
  enforceForbiddenWordsOnBlueprint,
  sanitizeBlueprintAgentsForPipeline,
  sanitizeForbiddenHeadingTitle,
  sanitizeForbiddenWordsInChecklistItem,
  injectBlacklistRagIntoMessages,
} from "@/lib/content-word-blocklist";
import { isFaqStyleHeadingTitle } from "@/lib/content-generation/faq-heading-policy";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import {
  extractChecklistItemTitle,
  parseBlogTemplateChecklist as parseBlogTemplateChecklistFromModule,
} from "@/lib/post-creator/post-creator-checklist-post-process";
import {
  FORBIDDEN_H2_PLACEHOLDER_PROMPT_LINE,
  isLlmAuditAuthorityDumpChecklistItem,
  isLlmAuditAuthorityDumpTitle,
} from "@/lib/content-optimization/harness-heading-titles";
import { AISO_CHECKLIST_KEYWORD_RULE } from "@/lib/content-optimization/first-party-authority-prompt";
import {
  ensureConnectedSiteHarnessMarkers,
} from "@/lib/bulk/connected-site-harness-markers";
import { buildPredeterminedBlogBodyHarnessTitlesFromOutline } from "@/lib/overview/overview-content-optimize-pipeline";
import type { BlogTemplateContext } from "./blog-template-builder-types";
import {
  buildSemrushExactPromptParts,
  LINK_FEATURE_PLACEHOLDER,
} from "./blog-template-checklist-prompts";
import { agentFromChecklistRow, buildBlueprintFromChecklistRows } from "./blog-template-checklist-rows";
import { parseBlueprintModelResponse } from "./blog-template-blueprint-response";

export async function generateBlueprintFromTemplate(
  checklist: string[],
  context: BlogTemplateContext,
  options: {
    apiKey: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    connectedSite?: { name: string; siteUrl: string };
    entity?: string;
    wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>;
    currentPageUrl?: string; // URL of the page currently being optimized
    semrushKeywordsContext?: string;
    semrushScatterContext?: string;
    semrushApprovedExternalUrls?: string[];
    semrushAnchorPhrases?: string[];
    importedDraftLinks?: ImportedDraftLink[];
    modifierExternalLinks?: ModifierExternalLink[];
    llmAuditAuthorityLinks?: LlmAuditAuthorityLinkLike[];
    userExternalLinks?: ExternalLinkPair[];
    wikipediaUrl?: string;
    wikipediaTitle?: string;
    /** Summarized LLM audit guidance for agent copy and section focus. */
    llmAuditSummary?: string;
    dfsArticleAuditBlock?: string;
    firstPartyAuthorityBlock?: string;
  }
): Promise<{ title?: string; purpose?: string; agents: AgentConfig[] }> {
  const {
    apiKey,
    model = getResearchModel(),
    temperature = 1.0,
    maxTokens = 8000,
    topP = 0.9,
  } = options;
  const sapEntity =
    typeof (options as { entity?: string }).entity === "string"
      ? (options as { entity?: string }).entity!.trim() || undefined
      : undefined;
  const routeKeyword = context.keywordData?.keyword?.trim() ?? "";
  const competitorComparisonBlueprint = isCompetitorCsvKeyword(routeKeyword) && Boolean(sapEntity);

  const userPromptSection = context.userPrompt && context.userPrompt.trim()
    ? `\n--- PROMPT MODIFIER (PRIMARY FOCUS FOR THIS BLOG) ---
${context.userPrompt.trim()}

**CRITICAL**: This modifier is the PRIMARY focus for the entire blog. The article title MUST clearly reflect this focus. Section content (body copy) should tie back to the theme so the blog stays on-topic. **AVOID KEYWORD STUFFING**: Do NOT repeat the modifier phrase in every section heading. Vary agent titles - some headings can imply the theme without repeating the exact phrase; others can be topic-specific. Only one or two headings may explicitly name the focus if it fits naturally; the rest should stay relevant through content, not by stuffing the phrase into every H2. Do not output a generic title or generic agent copy that ignores the modifier.
--- END PROMPT MODIFIER ---`
    : "";

  const prefilledRowContractSection = context.prefilledRowContract?.trim()
    ? `\n${context.prefilledRowContract.trim()}\n`
    : "";

  // Normalize siteUrl: remove trailing slash to prevent double slashes in links
  const normalizedSiteUrlForBlueprint = options.connectedSite?.siteUrl ? options.connectedSite.siteUrl.replace(/\/+$/, '') : '';
  
  const targetSiteContext = options.connectedSite
    ? `\n=== TARGET SITE CONTEXT ===
Target Website: ${options.connectedSite.name} (${normalizedSiteUrlForBlueprint})

IMPORTANT: This website is the target topic for all generated content. Use information about this site as a source of truth for generating relevant, on-brand blog blueprints. However, do NOT use the site name as an entity - use it only to inform the topics, tone, and context of the content.

All generated blueprint agents and content should be relevant to ${options.connectedSite.name} and aligned with its content focus, audience, and brand positioning. Ensure all blueprint suggestions are suitable for publication on ${options.connectedSite.name}.
=== END TARGET SITE CONTEXT ===
`
    : "";

  const postsToUse = keepBlogPlayLinkTargets(options.wordPressPosts || []);
  const wordPressPostsContext = postsToUse.length > 0
    ? `${formatBlogPlayLinkTargetsPrompt(postsToUse)}

Internal links use [[LINK:query|anchor]] from PAGES and BLOG POSTS titles above. ${INTERNAL_LINK_INTENT_ROUTING_RULE} Never paste hrefs. Never invent URLs. Never use service-area or city landings.
`
    : "";

  const entityOption = options.entity;
  const blueprintWikiUrl = options.wikipediaUrl?.trim();
  const blueprintWikiTitle = options.wikipediaTitle?.trim();
  const entityWikiBlueprintSection =
    entityOption && blueprintWikiUrl
      ? formatMandatoryEntityWikipediaForPrompt({
          entity: entityOption,
          wikipediaUrl: blueprintWikiUrl,
          wikipediaTitle: blueprintWikiTitle,
        })
      : "";
  const entityTitleRule = entityOption
    ? competitorComparisonBlueprint
      ? `\n*** COMPETITOR COMPARISON: ${entityOption} ***
Title is a provider comparison (topic + competitor business name). Forbidden: "near ${entityOption}", colons, or treating the competitor as geography.
${entityWikiBlueprintSection}`
      : `\n*** TARGET ENTITY: ${entityOption} ***
Write a natural local title that pairs the topic with ${entityOption} the way a person would search (for example "Blinds & Shades in ${entityOption}" or "Blinds & Shades Near ${entityOption}" when that reads naturally). Do not force the word "near" into every title.
No colons in titles.
${entityWikiBlueprintSection}`
    : "";

  const isGSCReport =
    (context.flowPurpose?.toLowerCase().includes('seo performance') || context.flowPurpose?.toLowerCase().includes('performance report')) ||
    (context.flowTitle?.toLowerCase().includes('search performance') || context.flowTitle?.toLowerCase().includes('seo performance'));

  const currentPageContextForBlueprint = options.currentPageUrl
    ? `\n=== CRITICAL: CURRENT PAGE BEING OPTIMIZED ===
Current Page URL: ${options.currentPageUrl}

**ABSOLUTELY CRITICAL - NEVER SELF-LINK**:
- This is the URL of the existing post/page currently being optimized
- NEVER link this URL to itself in the content
- NEVER include this URL in any internal link suggestions in agent features
- NEVER reference this URL in blueprint agent descriptions or features
- Self-referential links (linking a page to itself) are bad for SEO and must be avoided
- When suggesting internal links in agent features, exclude this URL from all link suggestions
- Only suggest links to OTHER pages/posts, never to this current page

**RE-OPTIMIZED TITLE (existing post)**:
- This is an existing post being re-optimized. The "title" field in the blueprint MUST be a re-optimized, shorter, and more concise version (at most 60 characters; the system truncates longer titles at a word boundary, so put the primary keyword first).
- Do NOT copy the existing title (Flow Context Title above) verbatim. Create a shorter, keyword-focused alternative.

This instruction applies to ALL agent features that mention links or internal links.
=== END CURRENT PAGE CONTEXT ===\n`
    : "";

  const semrushKeywordsBlueprintBlock = options.semrushKeywordsContext?.trim()
    ? `\n--- Semrush keyword research (JSON) ---
Use for topical coverage and intent only. Do NOT paste raw JSON into the blueprint output. Spread phrasings naturally across agents.
${options.semrushKeywordsContext}
`
    : "";

  const semrushScatterBlueprintBlock = options.semrushScatterContext?.trim()
    ? `\n--- Semrush cluster scatter (JSON) ---
Follow zone hints to distribute related phrases across agents. Do NOT paste JSON into the blueprint.
${options.semrushScatterContext}
`
    : "";

  const semrushPartsBlueprint = buildSemrushExactPromptParts({
    semrushApprovedExternalUrls: options.semrushApprovedExternalUrls,
    semrushAnchorPhrases: options.semrushAnchorPhrases,
    userExternalLinks: options.userExternalLinks,
    normalizedSiteUrl: normalizedSiteUrlForBlueprint,
  });

  const wordpressOnlyLinksSection = semrushPartsBlueprint.hasSemrushExactMode
    ? `**ABSOLUTELY CRITICAL - WORDPRESS INTERNAL + SEMRUSH EXTERNAL (EXACT)**:
- **INTERNAL [LINK]**: ${INTERNAL_LINK_PLACEHOLDER_FEATURE_SUFFIX}. URLs resolve from the sitemap after generation — do not paste raw https:// internal URLs in blueprint features.
- **SEMRUSH EXTERNAL**: Third-party URLs MUST come ONLY from the "SEMRUSH - APPROVED EXTERNAL URLs" block above; anchor text MUST be copied EXACTLY from the "SEMRUSH - APPROVED ANCHOR PHRASES" block. Blueprint feature: "[EXTERNAL_SEMRUSH]: href=<exact URL> | anchor=<exact phrase>". Section body: insert **[[EXTERNAL:exact-url|exact-anchor]]** mid-sentence — code replaces with <a href>; never write third-party <a href> yourself.
- **NEVER hallucinate external URLs** in blueprint features or agent descriptions - every third-party href must be a **verbatim substring** from the Semrush URL list above, or use index-only wording ("SEMRUSH URL #N") with no made-up URL.
- **Tone**: Instruct writers to use Semrush URLs as **neutral reference / knowledge-base** links in body copy - never as "buy from this site" or "do not buy from" retail advice.
- **NEVER** add external hrefs that are not in the Semrush URL list (entity Wikipedia from checklist/entity context is still allowed when applicable).
- **NEVER use links from knowledge files** as hrefs - knowledge files are for content reference ONLY.
- **NEVER create, invent, or fabricate** URLs - internal links must exist in the WordPress list; external must match Semrush lists above.
- When including "[LINK]" features, use "${LINK_FEATURE_PLACEHOLDER}" (example tokens: [[LINK:PAGES title words|short anchor]]).
- **NEVER use abstract descriptors** like [About Us] for internal links - use [[LINK:query|anchor]] placeholders only.
- If no relevant WordPress post exists for a topic, do NOT create an internal link for that topic - skip linking for that section`
    : `**ABSOLUTELY CRITICAL - PAGES AND BLOG POSTS TITLES ONLY FOR LINKS**:
- **ONLY use [[LINK:query|anchor]] from PAGES and BLOG POSTS titles** - These are the ONLY internal links allowed
- ${INTERNAL_LINK_INTENT_ROUTING_RULE}
- **NEVER use external links** that are NOT in the approved lists
- **NEVER use links from knowledge files** - Knowledge files are for content reference ONLY, NOT for linking
- **NEVER create, invent, or fabricate any links** - If a title is not in PAGES or BLOG POSTS, you MUST NOT use it
- When including "[LINK]" features, use "${LINK_FEATURE_PLACEHOLDER}" (example: [[LINK:PAGES title words|short anchor]]).
- **NEVER use abstract descriptors** like [About Us], [interior design services], [topic] - use [[LINK:query|anchor]] placeholders only.
- If no relevant PAGES or BLOG POSTS title exists for a topic, do NOT create a link for that topic - simply skip linking for that section`;

  const semrushBlueprintLinkValidationLine = semrushPartsBlueprint.hasSemrushExactMode
    ? `  - **CRITICAL: INTERNAL links** - ${INTERNAL_LINK_PLACEHOLDER_FEATURE_SUFFIX}. **SEMRUSH** - third-party hrefs only from Semrush URL list above; anchors verbatim from Semrush anchor list. Never use knowledge files for hrefs.`
    : `  - **CRITICAL: INTERNAL links** - ${INTERNAL_LINK_PLACEHOLDER_FEATURE_SUFFIX}. Never use knowledge files for hrefs.`;

  const semrushBlueprintSecondLinkLine = semrushPartsBlueprint.hasSemrushExactMode
    ? `- **SEMRUSH EXTERNAL FEATURES**: When external authority is needed, add "[EXTERNAL_SEMRUSH]: href=<exact URL> | anchor=<exact phrase>" using ONLY copy-pasted pairs from the Semrush URL and anchor lists above - never type a URL that is not in those lists.`
    : `- **CRITICAL: NEVER use external links**. Internal links: [[LINK:query|anchor]] from PAGES and BLOG POSTS titles only. ${INTERNAL_LINK_INTENT_ROUTING_RULE}`;

  const primaryKwForTitle = context.keywordData?.keyword?.trim() ?? "";
  const isReoptimizeBlueprint = Boolean(options.currentPageUrl);
  const blueprintTitleLengthRule = isReoptimizeBlueprint
    ? `**Title: at most 60 characters.** The system truncates longer titles at a word boundary, so put the primary keyword first and end on a complete word. Do not count characters.
   ${TITLE_WELL_KNOWN_ACRONYMS_RULE}`
    : `**Title: at most 60 characters.** The system truncates longer titles at a word boundary, so put the primary keyword first and end on a complete word. Do not count characters.
   PRIMARY KEYWORD for this article: "${primaryKwForTitle}"
   ${BULK_WORDPRESS_POST_TITLE_RULE}
   The blueprint "title" is the canonical article headline; follow keyword weaving rules above.`;

  const importedLinksBlueprintSection = formatImportedDraftLinksForPrompt(options.importedDraftLinks ?? []);
  const modifierLinksBlueprintSection = formatModifierExternalLinksForPrompt(
    options.modifierExternalLinks ?? [],
  );
  const llmAuditAuthorityBlueprintSection = formatLlmAuditAuthorityLinksForPrompt(
    options.llmAuditAuthorityLinks ?? [],
  );
  const hasLlmAuditAuthorityBlueprint = (options.llmAuditAuthorityLinks?.length ?? 0) > 0;
  const llmAuditAuthorityBlueprintPolicy = hasLlmAuditAuthorityBlueprint
    ? `
**LLM AUDIT AUTHORITY LINKS**: Attach [LLM_AUDIT_AUTHORITY_LINK] features to existing agents only. NEVER add an agent or H2 titled "LLM Audit Authority Link", "Further Links", or "Section".
`
    : "";

  const llmAuditBlueprintSection = options.llmAuditSummary?.trim()
    ? `
--- LLM AUDIT RESEARCH (DISTRIBUTE — NEVER NEW H2s) ---
Audit completed before blueprint. Facts below are **reference only**. Weave at most **one** assigned fact into an **existing** agent description when it fits that section's topic.

${options.llmAuditSummary.trim()}

Blueprint rules:
- **One agent per checklist item only.** Never add agents or H2 titles solely for audit facts.
- At most one audit fact per agent description. Agents with no relevant fact get no audit detail.
- Tie each fact to that section's topic (product choice, install, climate performance), not generic community praise.
- Never duplicate a fact across agent descriptions.
--- END LLM AUDIT RESEARCH ---
`
    : "";

  const firstPartyAuthorityBlueprintSection = options.firstPartyAuthorityBlock?.trim()
    ? `
${options.firstPartyAuthorityBlock.trim()}

Blueprint: intro agent must include [FIRST-PARTY AUTHORITY]. Every listed ChatGPT business fact and first-party claim must appear in the article. Do not invent counts or years.
`
    : "";

  const dfsArticleAuditBlueprintSection = options.dfsArticleAuditBlock?.trim()
    ? `
${options.dfsArticleAuditBlock.trim()}
`
    : "";

  const blueprintAgentTitleRule = `- **ABSOLUTELY FORBIDDEN - NEVER USE "INTRODUCTION", "UNDERSTANDING", "SECTION", OR FAQ-STYLE HEADINGS**: NEVER use "Section", "Introduction", "Intro", "Overview", "Getting Started", "Understanding [Topic]", "Navigating [Topic]", "FAQ", "Frequently Asked Questions", "Answering Your Questions…", "Common Questions…", "Q&A", or any dedicated Q&A section title as agent titles. The first agent (step 1) MUST have an active, SEO-friendly header (e.g., "Why Window Covering Safety Matters", "How To Choose Child-Safe Blinds"). Generic, passive, complete-guide, or FAQ-style headers are FORBIDDEN. Zero colons in agent titles.`;

  const systemPrompt = `You are the **Blueprint Architect AI**. Your task is to create a complete blog blueprint structure based on the provided checklist.

--- Flow Context ---
Title: ${context.flowTitle || "Untitled Article"}
Purpose: ${context.flowPurpose || "Not specified"}
${context.keywordData ? `Primary Keyword: ${context.keywordData.keyword.trim()}` : ""}
${targetSiteContext}${wordPressPostsContext}${currentPageContextForBlueprint}${userPromptSection}${prefilledRowContractSection}${importedLinksBlueprintSection}${modifierLinksBlueprintSection}${llmAuditAuthorityBlueprintSection}${llmAuditAuthorityBlueprintPolicy}${llmAuditBlueprintSection}${firstPartyAuthorityBlueprintSection}${dfsArticleAuditBlueprintSection}${semrushKeywordsBlueprintBlock}${semrushScatterBlueprintBlock}${semrushPartsBlueprint.semrushExactBlock}

${FORBIDDEN_H2_PLACEHOLDER_PROMPT_LINE}

--- Template Checklist ---
${checklist.map((item, index) => `${index + 1}. ${item}`).join("\n")}

${buildBlueprintArticleLengthBlock()}

--- Your Task ---
Generate a complete blueprint JSON structure with:
1. A clear, SEO-friendly "title" for the blog article
   ${entityTitleRule}   ${competitorComparisonBlueprint ? "*** COMPETITOR COMPARISON *** Follow comparison checklist titles. No SAP \"near\" title rule." : "*** ENTITY PAGES: NON-NEGOTIABLE *** When the checklist mentions entity, location, Local Recommendation, or service area: The word \"near\" MUST appear in the title (e.g. \"Blinds & Shades Near Ben Hill Atlanta\"). No colons in titles. If your title does not contain \"near\", it is WRONG."}
   Never stitch the primary keyword and a second title with a colon. One flowing headline only (not "Keyword: Other Title").
   ${blueprintTitleLengthRule}
${context.userPrompt && context.userPrompt.trim() ? `   **TITLE MUST REFLECT USER REQUIREMENTS**: If User Requirements (Prompt Modifier) specify a theme or focus (e.g. "creative structures only"), the article title MUST reflect that theme (e.g. reference the focus or structural angle). Do not output a generic title that ignores the User Requirements.` : ""}
2. A concise "purpose" description (frame as a focused guide, max ${ARTICLE_MAX_WORDS} words)
3. An "agents" array with exactly one agent per checklist item. Agent count MUST equal the checklist item count. Never exceed the checklist count. Never merge multiple checklist rows into one agent. Never split one checklist row into multiple agents.

--- CRITICAL: INTERPRETING CHECKLIST ITEMS ---
The checklist items may contain explicit feature requirements in formats like:
- "[LIST]: description" - Include this as a feature
- "[TABLE]: description" OR "[TABLE]: [COMPLETE MARKDOWN TABLE STRUCTURE]" - Include this as a feature. If a complete markdown table is provided in the checklist, preserve it exactly in the agent description or as a [CUSTOM] feature. ${TABLE_NO_LINK_ONLY_COLUMN_RULE}
- "[BLOCKQUOTE]: description" - Planner token only. The article must output a markdown quote that starts with > then the quote body. Use for the [ILLUSTRATIVE] hypothetical (priority) or entity facts. Never write the word blockquote as a wrapper. MAXIMUM 1-2 quotes per entire blueprint
- "[IMAGE]: description" OR "[IMAGE]: ![ ](url)" - Only include this if the user explicitly provided an image in the checklist. DO NOT add [IMAGE] features that weren't explicitly provided by the user. When url is present, the harness MUST embed <figure><img src="url" alt="label" /> in that section — NEVER <a href> text links to the image file
- "${LINK_FEATURE_PLACEHOLDER}": This feature MUST be included in EVERY agent. Use [[LINK:query|anchor]] tokens in agent descriptions — never raw https:// internal URLs, [topic], [About Us], or abstract descriptors. Applies to ALL agents.
- "[EXTERNAL_WIKI]: href=<exact Wikipedia URL> | anchor=<entity place name>": When the mandatory entity Wikipedia block appears above, include this in the intro agent (step 1) and at least one body agent. Copy href character-for-character from the mandatory block.
- "[DECISION]: ...": Copy into that agent's features. Allows 2-3 paragraphs and one chooser object.
- "[TRADEOFF]: ...": Copy into that agent's features. Requires a real limitation or skip-when case.
- "[ILLUSTRATIVE]: ...": Copy into that agent's features. Labeled hypothetical scenario; must include [BLOCKQUOTE] for the full worked example; ground in brief research when available.
- "[RECOMMENDATION]: ...": Copy into that agent's features. SAP: include the four-column Local Recommendation table (Product | Best for | Budget | Reason). Blog: explicit site recommendation for whom and when.
${semrushPartsBlueprint.hasSemrushExactMode ? `- "[EXTERNAL_SEMRUSH]: href=<exact URL from Semrush URL list> | anchor=<exact phrase from Semrush anchor list>": When the Semrush URL and anchor blocks appear above, use this for third-party external citations only - href and anchor must be **copy-pasted** from those lists character-for-character; never invent or "imagine" a plausible third-party URL.` : ""}
${isGSCReport ? `- "[FAQ]: 2-column Q&A table" - HTML table ONLY. Same format as all tables. Use <table><thead><tr><th>Question</th><th>Answer</th></tr></thead><tbody>...</tbody></table>. NEVER | Question | Answer | or |-|-|.` : `- **NO [FAQ] BODY SECTIONS**: FAQ is appended later as flo-faq. Do NOT add [FAQ] features or FAQ-style agent titles.`}
- "Note: User specified [requirement]" - Pay special attention to these requirements

When you see these in checklist items, you MUST include them as features in the corresponding agent object.
If a complete markdown table is provided in the checklist, preserve it exactly in the agent description or features.
${isGSCReport ? `\n*** CRITICAL - GSC REPORT ***: (1) Checklist items with [CUSTOM]: followed by a markdown table contain REAL GSC DATA. You MUST include the COMPLETE [CUSTOM] content in the agent features character-for-character. Do not summarize, truncate, or paraphrase. (2) Create ONE agent per checklist item. Do NOT merge or omit sections. Growth at a Glance, Your Strongest Search Terms, Service Area Pages, Content Performance, Branded Search Terms, FAQ - each must have its own agent when present in the checklist. (3) The agent features array must contain the full [CUSTOM] table as a feature string.` : ""}

--- CRITICAL AGENT STRUCTURE ---
Every agent object MUST have the following exact structure:
{
  "id": "unique-agent-id-string",
  "step": 1,
  "title": "Agent Title Here",
  "description": "Detailed description of what this agent does",
  "features": ["[LIST]: description", "[LINK]: description"],
  "h2Count": 1,
  "h3Count": 0,
  "h3Enabled": false,
  "headingLevel": 1,
  "maxTokens": 1000
}

- **headingLevel FIELD (CRITICAL)**: headingLevel: 1 = H2 tag (main section). headingLevel: 2 = H3 tag (subordinate subsection ONLY). ALL main topic agents MUST have headingLevel: 1, including the one [ILLUSTRATIVE] section. NEVER set headingLevel: 2 for a main topic. headingLevel: 2 is ONLY for agents that are true sub-sections nested under a parent H2 (extremely rare in blueprints). Every agent.title is a unique topical H2. Forbidden: Section N or a second homeowner-example title.

CRITICAL REQUIREMENTS:
- Use "title" NOT "name" for the agent title field
- **agent.title = H2 heading ONLY**: Copy only the checklist phrase before the first [STRUCTURE], [LINK], [TABLE], [LIST], [EXACT, or other [TAG] marker. Never put paragraph counts, [STRUCTURE] instructions, or harness markers in title.
${blueprintAgentTitleRule}
- The "description" field MUST be a string describing what the agent does. If checklist contains exact markdown table or image, you may reference it in the description
- The "features" field MUST be an array of plain JSON strings only. Each element is one string like "[LIST]: description". NEVER use objects, nested arrays, or {"type":...} shapes in features — non-string entries break the harness.
- Each feature string should follow "[TYPE]: description" where TYPE is one of: LIST, LINK, CUSTOM, FAQ, BLOCKQUOTE, DECISION, TRADEOFF
- When checklist items mention "[TABLE]" with a complete markdown table structure, include it as "[CUSTOM]: [preserve the complete markdown table structure exactly as provided in checklist]" OR include the table structure in the agent description
- DO NOT include [IMAGE] features unless the user explicitly provided an image in the checklist. If an image markdown format (![ ](url)) is explicitly provided in the checklist, include it as "[IMAGE]: [preserve the exact markdown image format from checklist]" and state in the agent description that output must use <figure><img src="exact-url"> — never a text link to the image URL
- When checklist keyword uses unpunctuated compounds (xray, ecommerce), note the canonical writing form in the agent description (X-ray, e-commerce) for harness copy
- When checklist items mention "[LIST]", include it as "[LIST]: [description from checklist]"
- **CRITICAL: PREVENT UNNECESSARY SUBLISTS**: Only include [LIST] features when explicitly specified in the checklist item. If a checklist item does NOT contain "[LIST]" as a feature requirement, the agent description must explicitly state: "Write content in flowing paragraphs only. Do NOT create sublists, bullet lists, or 'Key Features' lists. Only include lists when [LIST] is explicitly mentioned as a feature requirement."
- When checklist items mention "[BLOCKQUOTE]", include it as "[BLOCKQUOTE]: [description from checklist]". The published article uses a > quote line, never the word blockquote as a wrapper. **Never use banned words from the WORD BLACKLIST in quote text** (no crucial, vital, navigate, navigating, understand, understanding, or any listed banned word).
- **WORD BLACKLIST IN AGENT METADATA (NON-NEGOTIABLE)**: Never put banned words from the system WORD BLACKLIST in agent titles, descriptions, or features. Metadata must use plain direct wording only.
- **H3 LIMIT (NON-NEGOTIABLE)**: When checklist mentions H3 subheadings, set h3Enabled: true and h3Count: 1 or 2. NEVER set h3Count above 2. MAX 2 H3s per H2 section.
- When checklist items mention [LINK], copy this feature string exactly: "${LINK_FEATURE_PLACEHOLDER}".
- Every agent features array must include that exact [LINK] string. Do not invent a different [LINK] line. Never put raw https:// internal URLs in features.
${semrushBlueprintLinkValidationLine}
  - This validation applies to ALL agents without exception.
${options.currentPageUrl ? `- **CRITICAL: NEVER SELF-LINK**: When optimizing an existing post, NEVER link the post's URL (${options.currentPageUrl}) to itself in any agent features. Self-referential links are bad for SEO and must be completely avoided. Only suggest links to OTHER pages/posts, never to the current page being optimized.` : ""}
- CRITICAL: Keywords should be used in their NATURAL FORM (typically lowercase for generic terms) - only capitalize proper nouns, geographic locations, or at sentence starts. Do NOT randomly capitalize generic keywords like "blinds", "shades", "windows", etc.
${semrushBlueprintSecondLinkLine}
- The "id" field MUST be a unique string for each agent (e.g., "agent-1", "agent-2", etc.)
- The "step" field MUST be a number indicating the order (1, 2, 3, etc.). Steps MUST be sequential and non-overlapping
- Create one agent for each major section/requirement in the checklist
- EVERY agent MUST include "${LINK_FEATURE_PLACEHOLDER}" in features. Never use raw https:// internal URLs in features.
- If checklist items mention "Note: User specified [requirement]", ensure those requirements are reflected in the agent features and description
${context.userPrompt && context.userPrompt.trim() ? `- **PROMPT MODIFIER (PRIMARY FOCUS)**: When User Requirements / Prompt Modifier is present (see above), section content must stay on-theme and tie back to the focus. Do NOT repeat the modifier phrase in every agent title/heading - that is keyword stuffing. Vary headings: some can imply the theme; only use the exact phrase where it fits naturally (e.g. one or two sections). Agent descriptions/features should guide on-theme content without requiring the phrase in every H2.` : ""}
- If checklist contains exact markdown table, preserve the exact format in features or description
- Ensure the blueprint is valid JSON

${wordpressOnlyLinksSection}

**TITLE LENGTH**:
- The "title" field must be at most 60 characters. The system truncates longer titles at a word boundary, so put the primary keyword and main topic first. Do not count characters.
- Keep titles concise and focused.

**ABSOLUTELY FORBIDDEN - NEVER USE "INTRODUCTION" OR FAQ-STYLE HEADERS**:
- NEVER use "Introduction", "Intro", "FAQ", "Frequently Asked Questions", "Answering Your Questions…", "Common Questions…", "Q&A", or any variation as an agent title or H2 header
- The first agent (step 1) MUST have a SEO-friendly, descriptive, agentic header that helps with SEO
- Examples of GOOD first headers: "Why Window Covering Safety Matters", "How To Choose Child-Safe Blinds"
- Examples of FORBIDDEN first headers: "Introduction", "Understanding Child Safe Window Treatments", "Navigating Window Covering Safety"
- Examples of BAD first headers: "Introduction", "Intro", "Overview", "Getting Started"
- A separate "Overview" AI Overview block is auto-prepended to every article, so do NOT create your own top "Summary", "Overview", or "Key Takeaways" section - start with real body sections.

Example structure:
{
  "title": "Complete Guide to [Topic]",
  "purpose": "A focused guide covering [topic] (max ${ARTICLE_MAX_WORDS} words) with practical examples and actionable tips",
  "agents": [
    {
      "id": "agent-1",
      "step": 1,
      "title": "[Primary Topic]: Key Rules",
      "description": "Provides an engaging overview of the topic with SEO-friendly context",
      "features": ["[LIST]: Key points overview", "[LINK]: 2-4 [[LINK:query|anchor]] placeholders per section (no raw https:// internal URLs)"],
      "h2Count": 1,
      "h3Count": 0,
      "h3Enabled": false,
      "headingLevel": 1,
      "maxTokens": 1000
    }
  ]
}

Note: In every agent, use "headingLevel": 1 (1 = H2 main section; ALWAYS 1 for main topics. 2 = H3 rare subsection only).

Output ONLY valid JSON. Do not include markdown code blocks, explanations, or any text outside the JSON structure.`;

  let userPrompt = `Generate the complete blueprint JSON structure based on the checklist above. Include a title, purpose, and agents array with exactly ${checklist.length} agents (one agent per checklist row, same order). REQUIRED: Every agent must have a [LINK] feature with ${INTERNAL_LINK_PLACEHOLDER_FEATURE_SUFFIX} - no exceptions. Every features[] entry must be a plain JSON string (never an object). Output valid JSON only. The agents array MUST have exactly ${checklist.length} items.`;
  if ((options.importedDraftLinks?.length ?? 0) > 0) {
    userPrompt += ` REQUIRED: Every [IMPORTED_DRAFT_LINK] from the checklist must appear as a blueprint agent feature with the exact markdown [anchor](url) shown — do not change href or anchor text.`;
  }
  if ((options.modifierExternalLinks?.length ?? 0) > 0) {
    userPrompt += ` REQUIRED: Every [MODIFIER_EXTERNAL_LINK] from the checklist must appear as a blueprint agent feature with the exact markdown [anchor](url) shown — copy the full href character-for-character; do not change or omit any modifier URL.`;
  }
  if (semrushPartsBlueprint.hasSemrushExactMode) {
    userPrompt += ` When Semrush approved URL and anchor lists appear in the system prompt, add "[EXTERNAL_SEMRUSH]: href=... | anchor=..." features where external citations apply, using exact hrefs and exact anchor phrases from those lists only.`;
  }

  // Add user prompt modifier if provided
  if (context.userPrompt && context.userPrompt.trim()) {
    userPrompt += `\n\nPlease incorporate the following requirements: ${context.userPrompt.trim()}. The blueprint title MUST clearly reflect this focus. Section content should stay on-theme; do not repeat the modifier phrase in every section heading (avoid keyword stuffing - vary headings).`;
  }

  const blueprintMessages = injectBlacklistRagIntoMessages([
    { role: "system" as const, content: appendUniversalContentRulesToSystemPrompt(systemPrompt) },
    { role: "user" as const, content: userPrompt },
  ]);

  const jsonResult = await postOpenRouterAppChat({
    apiKey,
    model,
    messages: blueprintMessages,
    temperature,
    maxTokens: clampOpenRouterMaxTokens(maxTokens),
    topP,
    responseFormat: { type: "json_object" },
  });

  return parseBlueprintModelResponse({
    content: jsonResult.content,
    checklist,
    context,
    sapEntity,
    entity: options.entity,
    isGSCReport,
  });
}
