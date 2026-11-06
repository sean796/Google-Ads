import type { KeywordData } from "./keyword-types";
import type { PeopleAlsoAsk } from "./keyword-types";
import type { CheckedExternalLink } from "./external-research";
import { formatImportedDraftLinksForPrompt, type ImportedDraftLink } from "./bulk/blog-import-draft-links";
import { formatModifierExternalLinksForPrompt, formatLlmAuditAuthorityLinksForPrompt, type ModifierExternalLink, type LlmAuditAuthorityLinkLike } from "./bulk/modifier-external-links";
import type { ExternalLinkPair } from "./content-generation/external-link-placeholders";
import { formatMandatoryEntityWikipediaForPrompt } from "./bulk/entity-wikipedia-prompt";
import { formatBlogPlayLinkTargetsPrompt, keepBlogPlayLinkTargets } from "./bulk/bulk-generation-wp-inventory";
import { getLocalEntityPhraseExamples } from "./local-entity-phrases";
import { COMPETITOR_COMPARISON_PROSE_PROMPT_BLOCK } from "@/lib/competitor-research/competitor-csv-row";
import { AISO_CHECKLIST_KEYWORD_RULE } from "@/lib/content-optimization/first-party-authority-prompt";
import { buildSemrushExactPromptParts, toProperCase } from "./blog-template-checklist-prompts";

export interface BlogTemplateChecklistGenerateOptions {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  userPrompt?: string;
  entity?: string;
  entityAnalysis?: string;
  serpData?: unknown;
  selectedPeopleAlsoAsk?: string[];
  peopleAlsoAskItems?: PeopleAlsoAsk[];
  selectedResearchLinks?: string[];
  checkedExternalLinks?: CheckedExternalLink[];
  runExternalResearch?: boolean;
  locationName?: string;
  languageCode?: string;
  connectedSite?: { name: string; siteUrl: string };
  wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>;
  wordPressPagesForOfferTable?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>;
  setProgress?: (progress: { step: string; progress: number; message?: string }) => void;
  currentPageUrl?: string;
  semrushKeywordsContext?: string;
  semrushScatterContext?: string;
  semrushApprovedExternalUrls?: string[];
  semrushAnchorPhrases?: string[];
  importedDraftLinks?: ImportedDraftLink[];
  modifierExternalLinks?: ModifierExternalLink[];
  llmAuditAuthorityLinks?: LlmAuditAuthorityLinkLike[];
  wikipediaUrl?: string;
  wikipediaTitle?: string;
  prefilledRowContract?: string;
  userExternalLinks?: ExternalLinkPair[];
  llmAuditSummary?: string;
  dfsArticleAuditBlock?: string;
  firstPartyAuthorityBlock?: string;
  siteId?: string;
  primaryKeyword?: string;
  serpResearchBriefJson?: string;
  serpH2Outline?: string[];
  importedH2Outline?: string[];
  forbiddenLiveH2s?: string[];
  onSerpH2OutlineReady?: (bodyHarnessTitles: string[]) => void;
}

export function buildBlogTemplateChecklistContextSections(args: {
  selectedKeywords: string[];
  checklistKeywordData: KeywordData;
  resolvedH2Sections: string[];
  paaQuestions: Array<{ question: string; answer?: string; url?: string }>;
  competitorComparisonRow: boolean;
  options: BlogTemplateChecklistGenerateOptions;
  optionsWithCheckedLinks: BlogTemplateChecklistGenerateOptions;
}) {
  const { selectedKeywords, checklistKeywordData, resolvedH2Sections, paaQuestions, competitorComparisonRow, options, optionsWithCheckedLinks } = args;
  // Keep keywords in their natural form (lowercase) - do NOT capitalize them
  // Keywords should only be capitalized when they're proper nouns, geographic locations, or at sentence starts
  const primaryKeywordNatural = checklistKeywordData.keyword.toLowerCase();
  const selectedKeywordsNatural = selectedKeywords.map(kw => kw.toLowerCase());

  // Define proper case versions for display purposes (used in template strings)
  const primaryKeywordProper = toProperCase(checklistKeywordData.keyword);
  const selectedKeywordsProper = selectedKeywords.map(kw => toProperCase(kw));

  const aisoKeywordChecklistBlock = `\n${AISO_CHECKLIST_KEYWORD_RULE}\n`;

  const keywordDensityChecklistItemLine = `- CRITICAL: Each checklist item must include **[FOCUS KEYWORD DENSITY]** (AISO semantic breadth, not exact-phrase density), **[EXACT PRIMARY PER H2]** (at most once per H2 body when natural; skip if prior section used exact phrase), and **[PARAGRAPH LENGTH]** (moderately short ~2-4 sentences). Natural conversational language; never stuff one paragraph with the exact SEO slug.`;

  const checklistKeywordSpreadRules = `3. Distribute keywords naturally across sections using semantic variations; exact phrase sparingly per AISO CHECKLIST KEYWORD.
4. **FOCUS KEYWORD DENSITY (AISO)**: State semantic breadth plus exact phrase in Answer and sparingly in body, not exact-phrase stuffing.
5. **EXACT PRIMARY PER H2 (AISO)**: At most once per H2 body when natural; skip when prior body section already used the exact phrase.`;

  const checklistExactPrimaryStructureLine = `- **[EXACT PRIMARY PER H2] (AISO)**: At most once per H2 body when natural; skip when prior body section used exact phrase. Intro: at most one exact primary, not in sentence one.`;

  const checklistLinksKeywordBlock = `- **Include in the checklist**: **[FOCUS KEYWORD DENSITY] (AISO)**: semantic breadth over exact-phrase stuffing. **[EXACT PRIMARY PER H2] (AISO)**: at most once per H2 when natural. **[PARAGRAPH LENGTH]**: moderately short paragraphs (~2-4 sentences).
- Prefer semantic variants for anchor text and body copy; exact phrase only where it reads naturally.`;

  const keywordFocusDensityBlock = `FOCUS KEYWORD (AISO):
- Prefer semantic variants across the article; exact phrase required in Answer plus up to ~4 natural body mentions total.
- **[EXACT PRIMARY PER H2]**: At most once per H2 body when natural; skip when prior section used exact phrase.
- **[FOCUS KEYWORD DENSITY]**: Semantic breadth over exact-phrase stuffing. Forbidden: exact phrase as sentence subject in consecutive paragraphs or every table row.

READABILITY - PARAGRAPH LENGTH (CHECKLIST SHOULD STATE **[PARAGRAPH LENGTH]**):
- Prefer **moderately short** paragraphs: typically **2–4 sentences** per paragraph on average.

CRITICAL KEYWORD USAGE - NATURAL LANGUAGE PRIORITY (2026 SEO STANDARDS):
- AVOID KEYWORD STUFFING: Never repeat the exact-match phrase in every sentence or stack it unnaturally.
- Use semantic variations (e.g. smart blinds vs traditional blinds, automated vs manual blinds, motorized window coverings).
- Write as a human would speak; readability first, SEO second.
- Anchor text variety: mix descriptive, branded, and keyword-rich anchors naturally.`

  const keywordSection = `
--- Keyword Context ---
Primary Keyword: ${primaryKeywordNatural}
Search Volume: ${checklistKeywordData.searchVolume?.toLocaleString() || "N/A"}
Difficulty: ${checklistKeywordData.difficulty || "N/A"}/100
Intent: ${checklistKeywordData.intent || "N/A"}
Selected Keywords: ${selectedKeywordsNatural.join(", ") || "None"}

CRITICAL: Each selected keyword listed above MUST be used as anchor text in internal links within relevant sections. When creating checklist items, explicitly specify which keywords should be used as anchor text in each section's internal links.

CRITICAL KEYWORD CAPITALIZATION RULE:
- Keywords should be used in their NATURAL FORM (typically lowercase for generic terms)
- DO NOT randomly capitalize generic keywords like "blinds", "shades", "windows", "roller", "modern", etc.
- Only capitalize keywords when they are:
  * Proper nouns (brand names, product names like "Zebra Blinds", "Roller Shades" as product names)
  * Geographic locations (cities, states, countries)
  * At the start of sentences
- Examples:
  * CORRECT: "blinds for windows near me", "custom blinds near me", "modern roller shades"
  * WRONG: "Blinds for Windows near Me", "Custom Blinds near Me", "Modern Roller Shades"
  * CORRECT: "Zebra Blinds" (product name), "New York" (location), "Blinds are essential" (sentence start)
${aisoKeywordChecklistBlock}
${keywordFocusDensityBlock}
`;

  const hasEntityForH2Hint = Boolean(options.entity?.trim());
  const h2Section =
    !hasEntityForH2Hint && resolvedH2Sections.length > 0
      ? `
--- Selected H2 Sections ---
${resolvedH2Sections.map((h2, idx) => `${idx + 1}. ${h2}`).join("\n")}
`
      : "";


  // Normalize siteUrl: remove trailing slash to prevent double slashes in links
  // Define this early as it's used in template strings below
  const normalizedSiteUrl = options.connectedSite?.siteUrl ? options.connectedSite.siteUrl.replace(/\/+$/, '') : '';

  const semrushParts = buildSemrushExactPromptParts({
    semrushApprovedExternalUrls: options.semrushApprovedExternalUrls,
    semrushAnchorPhrases: options.semrushAnchorPhrases,
    userExternalLinks: options.userExternalLinks,
    normalizedSiteUrl,
  });

  const paaSectionLabel = "People Also Ask (appended flo-faq only — not body H2 sections)";
  const paaSection = paaQuestions.length > 0
    ? `
--- ${paaSectionLabel} ---
These questions feed the appended flo-faq FAQ block at upload. Do NOT create a dedicated FAQ, Q&A, or "Answering Your Questions" body H2. Weave topical answers into normal topic H2s only when natural.
${paaQuestions.map((paa, idx) => {
  let item = `${idx + 1}. Question: "${paa.question}"`;
  if (paa.answer) {
    const answerText = `${paa.answer.substring(0, 400)}${paa.answer.length > 400 ? "..." : ""}`;
    item += `\n   Answer context: ${answerText}`;
  }
  if (paa.url) item += `\n   Source URL: ${paa.url}`;
  return item;
}).join("\n\n")}

`
    : "";
  // External links: Wikipedia for entity only - no other external research
  const entityName = optionsWithCheckedLinks.entity?.trim();
  const explicitWikiUrl = optionsWithCheckedLinks.wikipediaUrl?.trim();
  const entityWikiUrl = explicitWikiUrl
    ? explicitWikiUrl
    : entityName
      ? optionsWithCheckedLinks.selectedResearchLinks?.find((url) => {
          try {
            const u = new URL(url.startsWith('http') ? url : `https://${url}`);
            if (!u.hostname.includes('wikipedia.org')) return false;
            const pathLower = u.pathname.toLowerCase().replace(/_/g, ' ');
            return entityName.split(/[\s,]+/).filter(Boolean).some(w => pathLower.includes(w.toLowerCase()));
          } catch { return false; }
        })
      : undefined;
  const entityWikiTitle = optionsWithCheckedLinks.wikipediaTitle?.trim();
  const mandatoryEntityWikiBlock =
    entityName && entityWikiUrl
      ? formatMandatoryEntityWikipediaForPrompt({
          entity: entityName,
          wikipediaUrl: entityWikiUrl,
          wikipediaTitle: entityWikiTitle,
        })
      : "";
  const validResearchLinks = entityWikiUrl ? [entityWikiUrl] : [];

  const researchLinksSection = entityWikiUrl
    ? semrushParts.hasSemrushExactMode
      ? `
--- External reference (Semrush + mandatory Wikipedia) ---
${mandatoryEntityWikiBlock}
Entity Wikipedia (MANDATORY): ${entityWikiUrl}${entityWikiTitle ? ` (${entityWikiTitle})` : ""}

**EXTERNAL LINK RULES**:
- **Primary**: Outbound third-party links MUST follow the "SEMRUSH - APPROVED EXTERNAL URLs" and "SEMRUSH - APPROVED ANCHOR PHRASES" blocks in the prompt above (exact href + exact anchor).
- **Mandatory**: Link "${entityName}" to the entity Wikipedia URL above in intro and at least one body section.
- Do NOT invent URLs. Do NOT use sites outside Semrush (+ mandatory Wikipedia as noted).
`
      : `
--- External Links (MANDATORY WIKIPEDIA) ---
${mandatoryEntityWikiBlock}
Entity Wikipedia (MANDATORY): ${entityWikiUrl}${entityWikiTitle ? ` (${entityWikiTitle})` : ""}

**EXTERNAL LINK RULES**:
- You MUST link "${entityName}" to the entity Wikipedia URL above in the intro and at least one body section.
- The ONLY allowed external link is this entity Wikipedia page (unless imported draft links or modifier external links are listed elsewhere in this prompt).
- NO other external sites. Do NOT invent, hallucinate, or fabricate any external URL.
- NEVER create "External Resources" sections. Integrate the Wikipedia link contextually.
- NEVER link to competitors, manufacturers, or any other external domain.
`
    : "";

  const userPromptSection = options.userPrompt && options.userPrompt.trim()
    ? `\n--- USER-SPECIFIED REQUIREMENTS (MUST BE EXPLICITLY REFERENCED) ---\n${options.userPrompt.trim()}\n\nCRITICAL: If the user has provided specific requirements above, you MUST explicitly note and incorporate them in the checklist items. For example, if the user mentions "include a table", "use 3-5 links", or any specific features, you MUST explicitly state these requirements in the relevant checklist items. NOTE: Only include [IMAGE] features if the user explicitly requests images with a specific image link or markdown format.\n\nWhen the requirement is a thematic focus or modifier (e.g. "creative structures only", "focus on X"), checklist items should tie section content to that theme so the blog stays on-topic. Do not require the exact modifier phrase in every section heading - that causes keyword stuffing. Vary how sections reference the theme: some headings can imply it; only one or two section titles may use the phrase if it fits naturally. Content should support the focus without repeating the phrase in every H2.`
    : "";

  const prefilledRowContractSection = options.prefilledRowContract?.trim()
    ? `\n${options.prefilledRowContract.trim()}\n`
    : "";
  const competitorComparisonProseSection = competitorComparisonRow
    ? `\n${COMPETITOR_COMPARISON_PROSE_PROMPT_BLOCK}\n`
    : "";

  const entityContext = options.entity && options.entity.trim() && !competitorComparisonRow
    ? (() => {
        const entityName = options.entity.trim();
        const generalExamples = getLocalEntityPhraseExamples(entityName, 'general', 6);
        const expertiseExamples = getLocalEntityPhraseExamples(entityName, 'expertise', 4);
        
        return `\n--- Entity/Location Optimization Context ---
Target Entity/Location: ${entityName}
${mandatoryEntityWikiBlock}
${options.entityAnalysis ? `Entity Analysis: ${options.entityAnalysis}\n\nUse this analysis to naturally scatter entity context throughout the content.` : ''}

CRITICAL TITLE FORMAT: For entity pages, the word "near" MUST appear in the title - never omit it. Format: [keyword] near [entity]. The [keyword] is the service/product ONLY - no city or location in keyword. Entity only after "near". Never [entity] [keyword] or [entity] [keyword] Services. Apply when generating or updating the blueprint title.

CRITICAL LOCATION VARIATION REQUIREMENTS:
- VARY location mentions - do NOT repeat exact location name repeatedly (e.g., "Edmonton" over and over)
- **CRITICAL: USE VARIED PHRASES FOR ENTITY REFERENCES** - Instead of repeatedly saying "for ${entityName}" or "in ${entityName}", rotate through diverse phrases:
  * ${generalExamples.map(ex => `"${ex}"`).join(', ')}
  * Use different phrases in different sections to avoid obvious repetition
- Use geographic variations naturally:
  * Exact location name: Use 2-3 times maximum in entire article (e.g., "Edmonton", "New York", "Toronto")
  * Broader geographic terms: Use frequently (e.g., "Alberta area", "New York region", "Ontario region")
  * Neighboring/regional references: Use naturally (e.g., "local area", "regional", "area")
  * General area references: Use often (e.g., "local homes", "area residences", "regional properties")
- SAP pages MAY name the entity (street, neighborhood, district) and sourced streets, housing types, or building patterns. After the first mention prefer here / this area / local. Forbidden: repeating the entity as an SEO slug in every sentence. Forbidden: invented neighborhoods not in sources or the entity field.
- Natural location integration:
  * Use exact location name in title/intro (1-2 times)
  * Use broader geographic terms in body content (most common)
  * Use exact location sparingly in conclusion (1 time maximum)
  * Example: Instead of "${entityName} home" repeatedly, use "local area home", "regional residence", "${entityName} properties" (varied)
- Location mentions: exact location name 2-3 times maximum in the entire article; prefer broader geographic and local references everywhere else. No percentage targets.

**CRITICAL: PREVENT OVER-OPTIMIZATION**:
- Remove 15-20% of primary keyword mentions and replace with semantic product/topic variants (tier names, room types, mount styles, material words)
- Forbidden replacements: hollow "our team", "local experts", "trusted professionals" without a sourced concrete detail
- Example: Instead of "Edmonton cellular shades" repeatedly, use "blackout cellulars", "top-down bottom-up shades", "bedroom light control in Edmonton"
- This prevents keyword stuffing and makes content feel more natural and human-written

**CRITICAL: SHORTEN ANCHOR TEXT**:
- Keep anchor text SHORT (2-5 words maximum) - only link the key phrase, NOT entire sentences
- Example CORRECT: "Learn more about [window treatment SEO](link) from our experts"
- Example WRONG: "[Learn more about window treatment SEO and how it can help your business](link) from our experts"
- Extract only the essential keyword phrase for linking, leave the rest of the sentence unlinked

**CRITICAL: PREVENT DOUBLE ANCHOR TAGS**:
- NEVER nest anchor tags - this creates invalid HTML like <a><a>text</a></a>
- Each link must be independent and properly closed
- If multiple terms need linking, create separate links with proper spacing between them

**CRITICAL: SOURCE-GROUNDED LOCAL DETAIL**:
- Include a landmark, climate, neighborhood, or process fact about ${entityName} ONLY if it appears in master instructions, GBP, inventory, existing HTML, or audit blocks.
- If those sources are empty, omit. Do not invent a fun fact, install count, or years of service.
- Vary location phrasing: ${generalExamples.slice(0, 3).map(ex => `"${ex}"`).join(', ')}. Place phrases: ${expertiseExamples.map(ex => `"${ex}"`).join(', ')}.

CRITICAL: Source-grounded expertise only:
- Weave installer/process/climate facts into a relevant section only when those sources supply them.
- Forbidden: invented counts, fake testimonials, generic "hands-on experience" padding.

Entity optimization: Ensure checklist items reference the entity/location naturally with variations, not exact matches repeatedly. Name the entity and sourced local conditions; after first mention prefer here / this area / local. Use varied phrases like ${generalExamples.slice(0, 3).map(ex => `"${ex}"`).join(', ')} instead of repeatedly saying "for ${entityName}" or "in ${entityName}".`;
      })()
    : "";

  const targetSiteContext = options.connectedSite
    ? `\n=== TARGET SITE CONTEXT ===
Target Website: ${options.connectedSite.name} (${normalizedSiteUrl})

IMPORTANT: This website is the target topic for all generated content. Use information about this site as a source of truth for generating relevant, on-brand blog content. However, do NOT use the site name as an entity - use it only to inform the topics, tone, and context of the content.

All generated checklist items and content should be relevant to ${options.connectedSite.name} and aligned with its content focus, audience, and brand positioning. Ensure all content suggestions are suitable for publication on ${options.connectedSite.name}.
=== END TARGET SITE CONTEXT ===`
    : "";

  const postsToUse = keepBlogPlayLinkTargets(options.wordPressPosts || []);
  const wordPressPostsContext = postsToUse.length > 0
    ? `${formatBlogPlayLinkTargetsPrompt(postsToUse)}

Checklist internal links come from PAGES and BLOG POSTS only. Never service-area or city landings.
Use those titles and URL paths to shape related checklist items.
`
    : "";

  const currentPageContext = options.currentPageUrl
    ? `\n=== CRITICAL: CURRENT PAGE BEING OPTIMIZED ===
Current Page URL: ${options.currentPageUrl}

**ABSOLUTELY CRITICAL - NEVER SELF-LINK**:
- This is the URL of the existing post/page currently being optimized
- NEVER link this URL to itself in the content
- NEVER include this URL in any internal link suggestions
- NEVER reference this URL in checklist items
- Self-referential links (linking a page to itself) are bad for SEO and must be avoided
- When suggesting internal links, exclude this URL from all link suggestions
- Only suggest links to OTHER pages/posts, never to this current page

This instruction applies to ALL checklist items that mention links or internal links.
=== END CURRENT PAGE CONTEXT ===\n`
    : "";

  const llmAuditSummarySection = options.llmAuditSummary?.trim()
    ? `
--- LLM AUDIT RESEARCH (DISTRIBUTE — DO NOT REPEAT) ---
Multi-platform audit ran before checklist generation. Facts below are topic-tied local detail for '${checklistKeywordData?.keyword?.trim() || "this page"}'.

${options.llmAuditSummary.trim()}

Checklist rules:
- **Never add numbered checklist lines for audit facts.** Facts are reference only; weave each into one of the **existing 6-7** checklist items (product, benefits, install, etc.).
- Assign each distinct audit fact to exactly ONE checklist item / section. Never assign the same nickname, landmark, or habit to multiple items.
- **Forbidden H2 titles** from audit alone: seasonal micro-sections (e.g. "Winter Comfort", "Greenhouse Care", "Prairie Winds") unless merged into a broader topic H2.
- Do not add a dedicated LLM audit H2. Skip facts that do not fit any section topic.
--- END LLM AUDIT RESEARCH ---
`
    : "";

  const firstPartyAuthoritySection = options.firstPartyAuthorityBlock?.trim()
    ? `
${options.firstPartyAuthorityBlock.trim()}

${AISO_CHECKLIST_KEYWORD_RULE}

Checklist: put [FIRST-PARTY AUTHORITY] on the intro item. Require every listed ChatGPT business fact and first-party claim in the article. Do not invent counts or years. Use **[EXACT PRIMARY PER H2]** at most once per H2 when natural; skip when prior section used exact phrase. Prefer semantic variants over exact-phrase density.
`
    : "";

  const dfsArticleAuditSection = options.dfsArticleAuditBlock?.trim()
    ? `
${options.dfsArticleAuditBlock.trim()}
`
    : "";

  const serpDataContext = options.serpData
    ? `
--- SERP Data (Full JSON Response) ---
Below is the complete SERP (Search Engine Results Page) data from DataForSEO API. Use this data to inform your checklist generation:

1. **Top Ranking Content Patterns**: Analyze the top organic results to understand what content structure and topics are ranking well
2. **SERP Features**: Note any featured snippets, People Also Ask, related searches, or other SERP features that indicate content opportunities
3. **Content Gaps**: Identify what top-ranking pages are covering and suggest checklist items that address gaps or improve upon existing content
4. **User Intent Signals**: Use the SERP data to better understand user search intent and create checklist items that match that intent

SERP Data (JSON):
${JSON.stringify(options.serpData, null, 2)}
`
    : "";

  const semrushKeywordsContextBlock = options.semrushKeywordsContext?.trim()
    ? `
--- Semrush keyword research (JSON) ---
Use for topical coverage and search-intent signals only. Do NOT paste this JSON into checklist items. Weave phrasings naturally; avoid keyword stuffing.
${options.semrushKeywordsContext}
`
    : "";

  const semrushScatterContextBlock = options.semrushScatterContext?.trim()
    ? `
--- Semrush cluster scatter plan (JSON) ---
Use zone hints to spread related phrases across sections. Do NOT paste this JSON into checklist items.
${options.semrushScatterContext}
`
    : "";

  const importedLinksSection = formatImportedDraftLinksForPrompt(options.importedDraftLinks ?? []);
  const modifierLinksSection = formatModifierExternalLinksForPrompt(options.modifierExternalLinks ?? []);
  const llmAuditAuthorityLinksSection = formatLlmAuditAuthorityLinksForPrompt(
    options.llmAuditAuthorityLinks ?? [],
  );
  const hasLlmAuditAuthorityLinks = (options.llmAuditAuthorityLinks?.length ?? 0) > 0;
  const llmAuditAuthorityLinksPolicy = hasLlmAuditAuthorityLinks
    ? `
**LLM AUDIT AUTHORITY EXTERNAL LINKS (MANDATORY)**:
- Attach \`[LLM_AUDIT_AUTHORITY_LINK]\` with exact \`[[EXTERNAL:url|anchor]]\` to existing topical H2 checklist items only.
- These are government, municipal, news, weather, or BBB sources from stored research — not competitors.
- Weave each authority link mid-sentence in a paragraph (same rules as [[LINK:query|anchor]] internal links). Forbidden: bare domain anchors, "for more"/"here", or links after the final period.
- Spread authority links across existing body sections where topically relevant.
- NEVER create a new checklist item, H2, or agent for an authority link. Forbidden titles: "LLM Audit Authority Link", "Further Links", "Section".
`
    : "";
  return { primaryKeywordNatural, selectedKeywordsNatural, primaryKeywordProper, selectedKeywordsProper, keywordDensityChecklistItemLine, checklistKeywordSpreadRules, checklistExactPrimaryStructureLine, checklistLinksKeywordBlock, keywordSection, h2Section, normalizedSiteUrl, semrushParts, paaSection, entityName, entityWikiUrl, researchLinksSection, userPromptSection, prefilledRowContractSection, competitorComparisonProseSection, entityContext, targetSiteContext, wordPressPostsContext, currentPageContext, llmAuditSummarySection, firstPartyAuthoritySection, dfsArticleAuditSection, serpDataContext, semrushKeywordsContextBlock, semrushScatterContextBlock, importedLinksSection, modifierLinksSection, llmAuditAuthorityLinksSection, llmAuditAuthorityLinksPolicy, paaQuestions };
}
