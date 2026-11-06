import { formatResearchAsOfLabel } from "@/lib/content-optimization/topic-research-fanout";
import { TABLE_NO_LINK_ONLY_COLUMN_RULE } from "@/lib/prompt-builders/table-prompt-rules";
import { INTERNAL_LINK_INTENT_ROUTING_RULE } from "./bulk/bulk-generation-wp-inventory";
import { formatSapChecklistExample, formatSapPageChecklistBlock } from "@/lib/prompt-builders/sap-page-template";
import { formatCompetitorChecklistExample, formatCompetitorComparisonChecklistBlock } from "@/lib/prompt-builders/competitor-comparison-page-template";
import { ARTICLE_MAX_WORDS, buildArticleLengthChecklistBlock } from "@/lib/content-generation/article-length-policy";
import { AUTHENTICITY_CHECKLIST_RULE } from "./prompt-builders";
import { FORBIDDEN_H2_PLACEHOLDER_PROMPT_LINE } from "@/lib/content-optimization/harness-heading-titles";
import { formatSerpH2OutlineBlock } from "@/lib/content-optimization/serp-h2-outline";
import { LINK_FEATURE_PLACEHOLDER } from "./blog-template-checklist-prompts";
import type { BlogTemplateChecklistGenerateOptions } from "./blog-template-checklist-context-sections";
import type { buildBlogTemplateChecklistContextSections } from "./blog-template-checklist-context-sections";

export function buildBlogTemplateChecklistPromptAssembly(args: {
  title: string;
  selectedKeywords: string[];
  resolvedH2Sections: string[];
  isServiceArea: boolean;
  isCompetitorComparison: boolean;
  competitorComparisonRow: boolean;
  useImportedH2Outline: boolean;
  importedH2Outline: string[];
  context: ReturnType<typeof buildBlogTemplateChecklistContextSections>;
  options: BlogTemplateChecklistGenerateOptions;
}): { systemPrompt: string; userPrompt: string } {
  const { title, selectedKeywords, resolvedH2Sections, isServiceArea, isCompetitorComparison, competitorComparisonRow, useImportedH2Outline, importedH2Outline, context, options } = args;
  const { primaryKeywordProper, selectedKeywordsProper, keywordDensityChecklistItemLine, checklistKeywordSpreadRules, checklistExactPrimaryStructureLine, checklistLinksKeywordBlock, keywordSection, h2Section, semrushParts, paaSection, entityName, entityWikiUrl, researchLinksSection, userPromptSection, prefilledRowContractSection, competitorComparisonProseSection, entityContext, targetSiteContext, wordPressPostsContext, currentPageContext, llmAuditSummarySection, firstPartyAuthoritySection, dfsArticleAuditSection, serpDataContext, semrushKeywordsContextBlock, semrushScatterContextBlock, importedLinksSection, modifierLinksSection, llmAuditAuthorityLinksSection, llmAuditAuthorityLinksPolicy, paaQuestions } = context;
  const blogChecklistCountLabel = useImportedH2Outline
    ? String(importedH2Outline.length)
    : "5-6";
  const importedOutlineOverride = useImportedH2Outline
    ? `
**IMPORTED H2 OUTLINE OVERRIDES THE 5-6 COUNT**: Create exactly ${importedH2Outline.length} checklist items, one per imported title. Do not add extra H2s. Forbidden titles: LLM Audit Authority Link, Further Links, Section.
`
    : "";

  const checklistCountInstruction = isCompetitorComparison
    ? `Create a checklist (9 items for competitor comparison) based on the COMPETITOR COMPARISON PAGE TEMPLATE.`
    : `Create a checklist (${isServiceArea ? "6-7" : blogChecklistCountLabel} items${isServiceArea ? " for service area SAP" : useImportedH2Outline ? " from the imported H2 outline" : " for blog"}) based on selected H2 sections.`;

  const connectedSiteName = options.connectedSite?.name?.trim() || "";
  const serpH2OutlinePromptBlock = isCompetitorComparison
    ? formatCompetitorComparisonChecklistBlock(options.entity!.trim(), connectedSiteName)
    : isServiceArea
      ? formatSapPageChecklistBlock(options.entity!.trim())
      : formatSerpH2OutlineBlock(resolvedH2Sections);

  const checklistStructureRequirements = `Requirements:
1. Create ${isCompetitorComparison ? "9" : isServiceArea ? "6-7" : blogChecklistCountLabel} checklist items. ${isCompetitorComparison ? "Follow COMPETITOR COMPARISON PAGE TEMPLATE exactly (provider comparison, not SAP geo). Put [ILLUSTRATIVE] on exactly one item (item 6). Forbidden: near {competitor}, treating competitor as geography, superiority claims." : isServiceArea ? "Follow SAP PAGE TEMPLATE (local problem, sourced local conditions, What We Offer, Local Recommendation table, Next Steps). Do not emit encyclopedia how-it-works, vs-adjacent, or cost-guide jobs. Put [ILLUSTRATIVE] on exactly one item (item 4). Write a unique topical H2 for that item. Forbidden: Section N. Forbidden: a second homeowner or example H2." : useImportedH2Outline ? "Use the IMPORTED H2 OUTLINE titles exactly as the first words on each checklist line (one H2 per imported title). Do not add extra H2s. Put [ILLUSTRATIVE] on exactly one item. Forbidden: Section N. Forbidden: LLM Audit Authority Link. Forbidden: a second homeowner or example H2." : "Use the SERP H2 OUTLINE titles exactly as the first words on each checklist line (one H2 per item). Each title must match the outline verbatim. Put [ILLUSTRATIVE] on exactly one item. Forbidden: Section N. Forbidden: a second homeowner or example H2."} **DEPTH IN FEWER H2s**: Cover main topics in fewer, tighter sections. One H2 per major topic when essential - NOT nested as H3s. Meet SEO with concise copy, not extra sections.
2. Each checklist item must include:
   - [STRUCTURE]: Unmarked H2s: 1-2 paragraphs. Marked H2s ([LIST]/[TABLE]/[DECISION]/[TRADEOFF]/[NUMBERS]/[ILLUSTRATIVE]/[RECOMMENDATION]): 2-3 paragraphs plus the required table or list (each paragraph **moderately short**: **~2–3 sentences**; split long blocks). If more content is needed, use H3 subheadings: "[STRUCTURE]: Include at most 2 H3 subheadings with 1-2 short paragraphs under each covering [specific subtopics]"
   - **DEPTH**: Main topics = H2 agents when essential. H3 = only for minor subtopics under an H2. **MAX 2 H3s** per H2.
   - **[ARTICLE LENGTH]**: Entire published article MUST NOT exceed ${ARTICLE_MAX_WORDS} words.
   - Mix content types: Include [TABLE] or [LIST] where appropriate for variety. For lists, suggest both bulleted lists (unordered) and numbered lists (ordered) depending on the content type - use numbered lists for step-by-step processes, rankings, or sequences, and bulleted lists for features, benefits, or general items. Block quotes: MAXIMUM 1-2 per entire blueprint — use [BLOCKQUOTE] for the one [ILLUSTRATIVE] hypothetical worked example (priority) or entity facts when no illustrative section. Put [DECISION] on exactly one item, [TRADEOFF] on exactly one item, [ILLUSTRATIVE] on exactly one item (must include [BLOCKQUOTE] for the hypothetical), and [RECOMMENDATION] on exactly one item. Prefer a decision-criteria table over a second catalog table.
   - ${semrushParts.hasSemrushExactMode
      ? `**[LINK] + [EXTERNAL_SEMRUSH]**: Include **${LINK_FEATURE_PLACEHOLDER}** where a relevant internal page exists. **[EXTERNAL_SEMRUSH]**: cite an outbound source only where a claim needs one - exact href from SEMRUSH APPROVED EXTERNAL URLs and exact anchor from SEMRUSH APPROVED ANCHOR PHRASES in the system prompt. Rotate different Semrush URLs across sections.`
      : `**[LINK]**: Include **${LINK_FEATURE_PLACEHOLDER}** where a relevant internal page exists. ${INTERNAL_LINK_INTENT_ROUTING_RULE} Never end a sentence with a keyword or <a>. Never service-area URLs.`}
   - ${keywordDensityChecklistItemLine}
   - CRITICAL: PREVENT UNNECESSARY SUBLISTS: Explicitly state in each checklist item: "Note: Do NOT create sublists, bullet lists, or 'Key Features' lists unless the [LIST] feature is explicitly specified in this checklist item. Write content in flowing paragraphs only. Only include lists when [LIST] is explicitly mentioned as a feature requirement."
${checklistKeywordSpreadRules}
6. First and last H2: use outline titles exactly. "**[EXACT PRIMARY PER H2] (AISO)** on both when natural." ${semrushParts.hasSemrushExactMode ? `${LINK_FEATURE_PLACEHOLDER}. [EXTERNAL_SEMRUSH]: at least 1 Semrush outbound citation where natural.` : `${LINK_FEATURE_PLACEHOLDER}.`}
7. Include [REAL-WORLD EXAMPLE] only when master instructions, existing page HTML, GBP, or audit blocks supply a real installer/process/climate fact. Forbidden: invented counts, fake testimonials. If those sources are empty, omit.
8. **CONTENT STRUCTURE** - Use a table or a list only where the content genuinely calls for one (comparison data, specifications, step-by-step processes, feature sets). Do not add tables or lists to satisfy a quota. When comparing Pros/Cons or Manual vs Motorized: use an HTML table (<table><thead><tr><th>Pros</th><th>Cons</th></tr></thead><tbody>...</tbody></table>), NOT Pros/Cons sub-headings with bullet lists. NEVER markdown tables. ${TABLE_NO_LINK_ONLY_COLUMN_RULE}
   - Articles with no natural comparison or process may have no table and no list. That is complete, not incomplete.`;

  const systemPrompt = `You are an expert blog content strategist and blueprint architect. Your role is to create a detailed, robust checklist for generating a blog template blueprint based on the provided selections.

${keywordSection}

CRITICAL: Use natural, conversational language - avoid stuffing one paragraph. **Focus keyword**: Follow **AISO CHECKLIST KEYWORD**: semantic breadth over exact-phrase density; exact phrase in Answer plus up to ~4 natural body mentions; at most once per H2 when prior section did not already use it. **[EXACT PRIMARY PER H2]**: At most once per H2 body when natural; skip when prior section used exact phrase.

**FORBIDDEN BODY H2 HEADERS (NON-NEGOTIABLE)**: NEVER use FAQ-style section titles in the article body. FAQ is appended later as flo-faq with H2 id="faq". Forbidden titles include: "FAQ", "Frequently Asked Questions", "Answering Your Questions…", "Common Questions…", "Q&A", or any dedicated Question/Answer section H2. PAA questions are NOT standalone body sections.

${FORBIDDEN_H2_PLACEHOLDER_PROMPT_LINE}

--- Blog Title ---
${title}
${importedLinksSection}${modifierLinksSection}${llmAuditAuthorityLinksSection}${llmAuditAuthorityLinksPolicy}${targetSiteContext}${wordPressPostsContext}${currentPageContext}${h2Section}${paaSection}${researchLinksSection}${userPromptSection}${prefilledRowContractSection}${competitorComparisonProseSection}${entityContext}${llmAuditSummarySection}${firstPartyAuthoritySection}${dfsArticleAuditSection}${serpDataContext}${semrushKeywordsContextBlock}${semrushScatterContextBlock}${semrushParts.semrushExactBlock}

${buildArticleLengthChecklistBlock(isServiceArea)}

${AUTHENTICITY_CHECKLIST_RULE}
${importedOutlineOverride}

${checklistCountInstruction} Each item must include:

**Harness contract (mandatory)**:
- Post generation date: ${formatResearchAsOfLabel(new Date())}. Every checklist item must include **[WRITING DATE]**: all section prose is published on this date.
- Each checklist line starts with the **exact published H2 heading text**, then [STRUCTURE] and other markers on the same line.
- Each checklist item becomes **exactly one H2** written in a **separate harness pass**. State: "Output is ONLY this H2 block (~${Math.floor(ARTICLE_MAX_WORDS / 6)} words)." **Never** instruct writing other H2 sections in the same pass.
- **FORBIDDEN checklist phrasing**: Never write "Create an agent", "Create a first section agent", "Create an H2 section agent", or similar meta-instructions. The H2 title is always the first words on the line.
- **No duplicate H2 titles** and **no duplicate topics** (merge overlapping service/location sections into one H2).
- Entire article: **at most 2** [TABLE] items across all checklist lines—not every section gets a table.

**Structure** (SEO HIERARCHY MANDATORY):
- H2 = main section titles ONLY. H3 = subsections under H2. H4 = sub-subsections. NEVER use H3 for a main section.
${checklistExactPrimaryStructureLine}
- **[PARAGRAPH LENGTH]**: Every checklist item should require **moderately short** paragraphs (**~2–3 sentences** typical); **avoid long** single paragraphs; **avoid** all-one-sentence choppiness unless a line truly needs emphasis.
- H2 sections: unmarked 1-2 paragraphs; marked ([LIST]/[TABLE]/[DECISION]/[TRADEOFF]/[NUMBERS]) 2-3 paragraphs plus the required table or list. If more needed: "[STRUCTURE]: Include at most 2 H3 subheadings with 1-2 short paragraphs under each covering [specific subtopics]"
- Mix content: Include [TABLE] or [LIST] where appropriate—but **entire article: max 2 [TABLE] items total**. For lists, suggest bulleted or numbered lists depending on content type
- Block quotes: You can creatively present entity facts using [BLOCKQUOTE]: [entity fact description] - use these sparingly, MAXIMUM 1-2 block quotes per entire blueprint, only where entity facts would add value and visual interest

**Links**:
${semrushParts.linksBulletExternal}
- Distribute selected keywords across sections as anchor text
- If no keywords: "[LINK]: [[LINK:query|anchor]] placeholders where a relevant internal target exists (no raw https:// internal URLs)"
- Weave keywords elegantly into anchor text - integrate them naturally within sentence structure using semantic variations and natural syntax
${checklistLinksKeywordBlock}
- **CRITICAL: Keep anchor text SHORT (2-5 words maximum)** - only link the key phrase, NOT entire sentences. Extract only the essential keyword phrase for linking
- **CRITICAL: NEVER nest anchor tags** - prevent double <a> tags that create invalid HTML
${options.currentPageUrl ? `\n**CRITICAL: NEVER SELF-LINK**:
- When optimizing an existing post, NEVER link the post's URL to itself in the content
- The current page URL (${options.currentPageUrl}) must NEVER appear in any internal link suggestions
- Self-referential links are bad for SEO and must be completely avoided
- Only suggest links to OTHER pages/posts, never to the current page being optimized
- This applies to ALL checklist items that mention links or internal links` : ""}

${semrushParts.externalLinksPolicyBlock}

**Location/Entity Variation**:
- VARY location mentions - use exact location name sparingly (2-3 times maximum)
- Use broader geographic terms frequently (Tampa Bay area, Pinellas County, coastal Florida, etc.)
- Mix location references: exact name (rare), broader region (common), general area (frequent)
- Example: "Oldsmar" (2-3 times) → "Tampa Bay area" (frequent) → "Pinellas County" (frequent) → "local homes" (most common)

**Source-grounded expertise (do not invent)**:
- If master instructions, existing page HTML, GBP, or audit blocks contain installer/process/climate facts, weave one into a relevant section with [REAL-WORLD EXAMPLE].
- Forbidden: invented counts, fake "after installing hundreds", invented testimonials.
- If those sources are empty, omit expertise claims.

**Other**:
- DO NOT include [IMAGE] unless user requests it
- Block quotes: Use [BLOCKQUOTE] for entity facts creatively, but MAXIMUM 1-2 block quotes per entire blueprint

${semrushParts.externalCompetitorBlock}

**EXPLICIT USER REQUIREMENTS**:
${options.userPrompt && options.userPrompt.trim() 
  ? `The user has provided specific requirements. You MUST explicitly note these in the checklist. CRITICAL RULES:
- If user provides an EXACT TABLE STRUCTURE (with markdown table format, columns, rows, and data), you MUST include the COMPLETE table structure in the checklist item, preserving the exact format, column headers, and all row data
- If user provides an EXACT IMAGE LINK in markdown format (![ ](url)), you MUST include the COMPLETE markdown image format in the checklist item
- If user mentions "table", include "[TABLE]: [description]" AND if they provide the exact table structure, include the full table markdown
- DO NOT include [IMAGE] features unless the user explicitly provides an image link in markdown format (![ ](url)) - in that case, preserve it exactly as provided
- If user mentions "list", include "[LIST]: [description]" in relevant checklist items, specifying whether it should be a bulleted list (unordered) or numbered list (ordered) based on the content type
- If user mentions "block quote" or "blockquote", include "[BLOCKQUOTE]: [entity fact description]" in relevant checklist items, but remember MAXIMUM 1-2 block quotes per entire blueprint
- If user mentions specific content requirements, explicitly state them in the checklist items
- Add a note like "Note: User specified [requirement]" when incorporating user requirements
- If user provides exact URLs or links in tables, preserve them exactly as provided`
  : "No specific user requirements provided."}

CRITICAL FORMAT REQUIREMENT:
Format your response as a numbered list, one item per line. **Each line MUST begin with the exact H2 heading text** (the text that will appear on the published page), then [STRUCTURE] and other feature markers.

FORBIDDEN: "Create an agent", "Create a first section agent", "Create an H2 section agent", or any similar harness meta-instruction as the line opener.
${FORBIDDEN_H2_PLACEHOLDER_PROMPT_LINE}

Example format (NOTE: H2 title first on every line):
${
  isCompetitorComparison
    ? formatCompetitorChecklistExample(options.entity!.trim(), title)
    : isServiceArea
      ? formatSapChecklistExample(options.entity!.trim(), title)
    : useImportedH2Outline
      ? importedH2Outline
          .map(
            (h2, i) =>
              `${i + 1}. ${h2} [STRUCTURE]: 1-2 paragraphs. **[EXACT PRIMARY PER H2]**. ${LINK_FEATURE_PLACEHOLDER}.`,
          )
          .join("\n")
    : `1. ${resolvedH2Sections[0] || "First SERP outline section"} [STRUCTURE]: 2-3 paragraphs. [LIST]: components. Opener leads with a sourced fact, then the topic (not keyword-first, not "{keyword} offers", not a dictionary definition). **[FIRST-PARTY AUTHORITY]**. **[EXACT PRIMARY PER H2]**: at most once in the intro body when natural. **[FOCUS KEYWORD DENSITY] (AISO)**: semantic breadth across the article. ${entityWikiUrl && entityName ? `[EXTERNAL_WIKI]: Link "${entityName}" to ${entityWikiUrl}. ` : ""}[LINK]: minimal in opener.
2. ${resolvedH2Sections[1] || "Second SERP outline section"} [STRUCTURE]: 2-3 paragraphs. [TABLE] or [DECISION]: criteria. **[EXACT PRIMARY PER H2]**. ${LINK_FEATURE_PLACEHOLDER}.
3. ${resolvedH2Sections[2] || "Third SERP outline section"} [STRUCTURE]: 1 intro paragraph, then scenario in body (not in the H2). [ILLUSTRATIVE]: labeled hypothetical worked example. [BLOCKQUOTE]: scenario in the quote, not in the heading. Short H2 (3-8 words). No links in H2 or H3. **[EXACT PRIMARY PER H2]**. ${LINK_FEATURE_PLACEHOLDER}.
4. ${resolvedH2Sections[3] || "Fourth SERP outline section"} [STRUCTURE]: 1-2 paragraphs. [LIST]: numbered steps. **[EXACT PRIMARY PER H2]**. ${LINK_FEATURE_PLACEHOLDER}.
5. ${resolvedH2Sections[4] || "Fifth SERP outline section"} [STRUCTURE]: 1-2 paragraphs. [NUMBERS] or [TRADEOFF]: when it fails. **[EXACT PRIMARY PER H2]**. ${LINK_FEATURE_PLACEHOLDER}.
6. ${resolvedH2Sections[5] || resolvedH2Sections[4] || "Last SERP outline section"} [STRUCTURE]: 1-2 paragraphs. [RECOMMENDATION]: site-first recommendation for whom and when. **[EXACT PRIMARY PER H2]**. ${LINK_FEATURE_PLACEHOLDER}.`
}

Output ONLY the numbered checklist items, no additional text or explanations.`;

  let userPrompt = `Generate a focused checklist for creating a blog template blueprint.

${serpH2OutlinePromptBlock}

${buildArticleLengthChecklistBlock(isServiceArea || isCompetitorComparison)}

${AUTHENTICITY_CHECKLIST_RULE}
${importedOutlineOverride}

${FORBIDDEN_H2_PLACEHOLDER_PROMPT_LINE}

CRITICAL: Weave keywords elegantly into content using natural, human-like syntax. Keywords should flow organically within sentences. **Focus keyword**: Follow **AISO CHECKLIST KEYWORD**: semantic breadth over exact-phrase density; exact phrase in Answer plus sparing body mentions; at most once per H2 when natural. **EXACT PRIMARY PER H2**: At most once per H2 body when natural; skip when prior section used exact phrase. Intro: at most one exact primary, not required in sentence one; prefer [FIRST-PARTY AUTHORITY] in the opener.

**PARAGRAPH LENGTH**: The checklist MUST state **[PARAGRAPH LENGTH]** - **moderately short** paragraphs (**~2–4 sentences** typical); **split** long blocks (avoid “paragraph is long” warnings); **do not** use only one-sentence paragraphs throughout (too choppy).

${competitorComparisonRow ? "COMPETITOR COMPARISON: Do not use SAP geo framing. The entity is a competitor business name only." : "CRITICAL LOCATION VARIATION: Vary location mentions naturally. Use the exact entity name sparingly (2-3 times maximum in entire article) then prefer here / this area / local. SAP pages MAY name the entity (street, neighborhood, district) and sourced streets or housing types. Forbidden: invented neighborhoods not in sources or the entity field. Forbidden: repeating the entity as an SEO slug in every sentence."}

MANDATORY REAL-WORLD EXAMPLES: Include [REAL-WORLD EXAMPLE] only when master instructions, existing page HTML, GBP, or audit blocks supply a real installer/process/climate fact. Forbidden: invented counts or fake testimonials. If those sources are empty, omit.

Blog Details:
- Title: "${title}"
${isServiceArea ? "" : `- H2 Sections to cover (exact titles): ${resolvedH2Sections.join(", ")}\n`}- Primary Keyword: "${primaryKeywordProper}"
- Related Keywords: ${selectedKeywordsProper.slice(0, 5).join(", ")}
${paaQuestions.length > 0 ? `- People Also Ask (flo-faq append only, not body H2s): ${paaQuestions.map(p => `"${p.question}"`).join(", ")}` : ""}

${checklistStructureRequirements}`;
  
  // Add user prompt modifier if provided - emphasize it must be explicitly referenced
  if (options.userPrompt && options.userPrompt.trim()) {
    userPrompt += `\n\n--- CRITICAL: USER-SPECIFIED REQUIREMENTS ---\n${options.userPrompt.trim()}\n\nYou MUST explicitly incorporate these requirements in the checklist items. CRITICAL RULES:
- If the user provides an EXACT MARKDOWN TABLE (with | columns | and rows), you MUST include the COMPLETE table structure in the checklist item, preserving the exact markdown format, all column headers, all row data, and any URLs/links within the table cells
- If the user provides an EXACT IMAGE MARKDOWN LINK (![ ](url)), you MUST include the COMPLETE markdown image format in the checklist item exactly as provided
- If the user mentions specific features (tables, lists, links, markdown tables, block quotes, etc.), you MUST explicitly state them in the relevant checklist items with the proper feature format ([TABLE], [LIST], [LINK], [BLOCKQUOTE]). For lists, specify whether it should be a bulleted list (unordered) or numbered list (ordered) based on the content type. For block quotes, remember MAXIMUM 1-2 per entire blueprint, use for entity facts
- DO NOT include [IMAGE] features unless the user explicitly provides an image link in markdown format
- Add notes like "Note: User specified [requirement]" when incorporating user requirements
- Preserve exact URLs, links, and markdown formatting from user input`;
  }
  
  // Always add link requirements (Semrush mode: internal + outbound; otherwise internal-only unless keywords branch adds detail)
  if (semrushParts.hasSemrushExactMode) {
    userPrompt += `\n\n--- INTERNAL + SEMRUSH OUTBOUND LINKS ---
- Include "${LINK_FEATURE_PLACEHOLDER}" in a checklist item where a relevant internal page exists, and "[EXTERNAL_SEMRUSH]" only where a claim needs an outbound citation, drawn **only** from the numbered SEMRUSH APPROVED EXTERNAL URLs / ANCHOR PHRASES blocks in the system prompt.
- **ZERO HALLUCINATED EXTERNAL URLS**: Do NOT type any third-party https:// URL in the checklist unless it is a **verbatim copy** from the SEMRUSH APPROVED EXTERNAL URLs list. **FORBIDDEN**: invented URLs, "e.g." external links, competitor domains, or plausible-looking URLs not in the list. **ALLOWED**: paste URL(s) exactly from the list, OR write "use SEMRUSH approved URL #N with anchor phrase #N" with no URL string.
- Use **different Semrush list indices** across sections where possible.${selectedKeywords.length > 0 ? `\n- Selected keywords for internal anchor text variety: ${selectedKeywords.join(", ")}` : ""}`;
  } else if (selectedKeywords.length > 0) {
    userPrompt += `\n\n--- INTERNAL LINKS ---
- Include "${LINK_FEATURE_PLACEHOLDER}" where a relevant internal page exists
- ${INTERNAL_LINK_INTENT_ROUTING_RULE} Never end a sentence with a keyword or <a>. Never service-area URLs.
- Selected keywords for anchor text: ${selectedKeywords.join(", ")}`;
  } else {
    userPrompt += `\n\n--- INTERNAL LINKS ---
- Include "${LINK_FEATURE_PLACEHOLDER}" where a relevant internal page exists
- ${INTERNAL_LINK_INTENT_ROUTING_RULE} Never end a sentence with a keyword or <a>. Never service-area URLs.`;
  }
  
  if (options.wordPressPagesForOfferTable?.length) {
    const pageLines = options.wordPressPagesForOfferTable
      .slice(0, 40)
      .map((p, i) => `${i + 1}. "${(p.title || p.slug).replace(/"/g, "'")}" | ${p.link}`)
      .join("\n");
    userPrompt += `\n\n--- PAGES INVENTORY (What We Offer table ONLY) ---
Use ONLY these WordPress **pages** URLs for the What We Offer / Product Category table first column links.
Format each link as <a href="EXACT_URL" title="EXACT_PAGE_TITLE">product name</a> (title attribute required).
Do NOT use blog posts or entity/service-area URLs in that table.

${pageLines}
=== END PAGES INVENTORY ===`;
  }

  // Add self-link prevention instruction if currentPageUrl is provided
  if (options.currentPageUrl) {
    userPrompt += `\n\n--- CRITICAL: NEVER SELF-LINK ---
- When optimizing an existing post, NEVER link the post's URL to itself in the content
- The current page URL (${options.currentPageUrl}) must NEVER appear in any internal link suggestions
- Self-referential links are bad for SEO and must be completely avoided
- Only suggest links to OTHER pages/posts, never to the current page being optimized
- This applies to ALL checklist items that mention links or internal links`;
  }
  return { systemPrompt, userPrompt };
}
