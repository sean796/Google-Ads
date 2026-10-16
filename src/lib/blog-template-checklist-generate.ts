import { streamChatCompletion, loadApiKey } from "./api";
import { postOpenRouterAppChat, postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";
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
import {
  COMPETITOR_COMPARISON_PROSE_PROMPT_BLOCK,
  isCompetitorCsvKeyword,
} from "@/lib/competitor/competitor-csv-row";
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
import {
  formatCompetitorChecklistExample,
  formatCompetitorComparisonChecklistBlock,
} from "@/lib/prompt-builders/competitor-comparison-page-template";
import {
  ARTICLE_MAX_WORDS,
  buildArticleLengthChecklistBlock,
  buildBlueprintArticleLengthBlock,
} from "@/lib/content-generation/article-length-policy";
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
import {
  buildBlogTemplateSystemPrompt,
  buildBlogTemplateUserPrompt,
  parseBlogTemplateChecklist,
  buildSemrushExactPromptParts,
  toProperCase,
  LINK_FEATURE_PLACEHOLDER,
} from "./blog-template-checklist-prompts";
import type { ChecklistFromSelectionsResult } from "./blog-template-builder-types";

async function selectBestPAAQuestionsWithAI(
  allPaaQuestions: Array<{ question: string; answer?: string; url?: string }>,
  entity?: string,
  primaryKeyword?: string,
  postTitle?: string,
  connectedSite?: { name: string; siteUrl: string },
  apiKey?: string,
  model?: string,
  temperature?: number,
  maxTokens?: number,
  topP?: number,
  strict = false,
): Promise<Array<{ question: string; answer?: string; url?: string }>> {
  // If no API key or fewer than 10 questions, return all (no need for AI analysis)
  if (!apiKey || allPaaQuestions.length <= 10) {
    return allPaaQuestions.slice(0, 10);
  }

  try {
    const siteContext = connectedSite 
      ? `Target Site: ${connectedSite.name} (${connectedSite.siteUrl})`
      : '';
    const entityContext = entity ? `Target Entity: ${entity}` : '';
    const keywordContext = primaryKeyword ? `Primary Keyword: ${primaryKeyword}` : '';
    const titleContext = postTitle ? `Post Title: ${postTitle}` : '';

    const systemPrompt = `You are an SEO expert analyzing People Also Ask (PAA) questions to select the BEST ones for an FAQ section that will appear on a specific website.

Your task is to rank and select up to 10 questions that are:
1. **MOST ALIGNED WITH THE POST TITLE** - This is CRITICAL. Questions must directly relate to the main topic of the post title
2. Most relevant to the target entity/site context
3. Most valuable for users searching for information about the entity/topic
4. Most likely to convert visitors into customers or engage them with the content
5. Best suited for a customer-service oriented FAQ section
6. Relevant to the primary keyword and search intent

Consider:
- **TITLE ALIGNMENT IS THE #1 PRIORITY** - If a question is not directly related to the post title's main topic, exclude it
- Questions directly related to the entity/topic AND the post title are highest priority
- Questions that showcase services, products, or location relevance are valuable
- Questions that demonstrate expertise and authority are important
- Questions about pricing, services, locations, comparisons, or practical information rank higher
- Generic or off-topic questions should be DEPRIORITIZED - especially if they don't align with the post title
- If a question is about a completely different topic than the post title, DO NOT include it

Return a JSON object with a "questions" field containing an array of question texts (strings) in order of best to least best, maximum 10 questions.

Example format:
{
  "questions": ["Question 1 text", "Question 2 text", "Question 3 text", ...]
}`;

    const questionsList = allPaaQuestions.map((paa, idx) => 
      `${idx + 1}. "${paa.question}"${paa.answer ? ` (Answer context: ${paa.answer.substring(0, 150)}...)` : ''}`
    ).join('\n');

    const userPrompt = `Analyze these ${allPaaQuestions.length} PAA questions and select the BEST ones for an FAQ section.

${siteContext ? `${siteContext}\n` : ''}${entityContext ? `${entityContext}\n` : ''}${keywordContext ? `${keywordContext}\n` : ''}${titleContext ? `${titleContext}\n` : ''}

**CRITICAL: TITLE ALIGNMENT CHECK**
${postTitle ? `Before selecting ANY question, ask yourself: "Is this question directly aligned with the post title: '${postTitle}'?"\n- If NO, exclude it immediately\n- Only select questions that clearly relate to the main topic in the post title\n` : ''}

Available PAA Questions:
${questionsList}

Select the BEST up to 10 questions that:
1. **ARE DIRECTLY ALIGNED WITH THE POST TITLE** ${postTitle ? `("${postTitle}")` : ''}
2. Are most relevant to ${entity || primaryKeyword || 'the target site'}
3. Are most valuable for the FAQ section

MANDATORY EXCLUSIONS - NEVER include questions that:
- Are NOT in English (no Spanish, French, or any other language - ENGLISH ONLY)
- Contain any person's name (first name, last name, or full name) - generic product/service questions ONLY

Return a JSON object with this exact format:
{
  "questions": ["Question 1 text", "Question 2 text", "Question 3 text", ...]
}

The questions array should contain the question texts in order from best to least best, maximum 10 questions.
DO NOT include explanations, numbering, or any other text. ONLY return the JSON object.`;

    const response = await postOpenRouterAppChatFetch({
      method: "POST",
      headers: openRouterWebAppHeaders(apiKey),
      body: JSON.stringify({
        model: model || getResearchModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: temperature ?? 0.7,
        max_tokens: maxTokens ?? 2000,
        top_p: topP ?? 0.9,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      if (strict) {
        throw new Error(`[PAA Selection] AI analysis failed (${response.status})`);
      }
      console.warn('[PAA Selection] AI analysis failed, using fallback selection');
      return allPaaQuestions.slice(0, 10);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      if (strict) {
        throw new Error("[PAA Selection] No content in AI response");
      }
      console.warn('[PAA Selection] No content in AI response, using fallback selection');
      return allPaaQuestions.slice(0, 10);
    }

    // Parse the JSON response
    let selectedQuestions: string[] = [];
    try {
      const parsed = JSON.parse(content);
      // Handle both {questions: [...]} and direct array formats
      if (Array.isArray(parsed)) {
        selectedQuestions = parsed;
      } else if (parsed.questions && Array.isArray(parsed.questions)) {
        selectedQuestions = parsed.questions;
      } else if (parsed.selectedQuestions && Array.isArray(parsed.selectedQuestions)) {
        selectedQuestions = parsed.selectedQuestions;
      } else {
        // Try to find any array in the response
        const values = Object.values(parsed);
        const arrayValue = values.find(v => Array.isArray(v));
        if (arrayValue) {
          selectedQuestions = arrayValue as string[];
        }
      }
    } catch (parseError) {
      if (strict) {
        throw parseError instanceof Error
          ? parseError
          : new Error("[PAA Selection] Failed to parse AI response");
      }
      console.warn('[PAA Selection] Failed to parse AI response, trying to extract array from text:', parseError);
      // Fallback: try to extract JSON array from text
      const jsonMatch = content.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        try {
          selectedQuestions = JSON.parse(jsonMatch[0]);
        } catch {
          if (strict) {
            throw new Error("[PAA Selection] Could not parse extracted JSON from AI response");
          }
          console.warn('[PAA Selection] Could not parse extracted JSON, using fallback selection');
          return allPaaQuestions.slice(0, 10);
        }
      } else {
        if (strict) {
          throw new Error("[PAA Selection] No JSON array found in AI response");
        }
        console.warn('[PAA Selection] No JSON array found in response, using fallback selection');
        return allPaaQuestions.slice(0, 10);
      }
    }

    // Map selected questions back to full PAA objects
    const selectedPaaQuestions: Array<{ question: string; answer?: string; url?: string }> = [];
    const questionMap = new Map(
      allPaaQuestions.map(paa => [paa.question.toLowerCase().trim(), paa])
    );

    for (const selectedQuestion of selectedQuestions.slice(0, 10)) {
      const normalized = selectedQuestion.toLowerCase().trim();
      const match = questionMap.get(normalized) || 
        Array.from(questionMap.values()).find(paa => 
          paa.question.toLowerCase().trim().includes(normalized) ||
          normalized.includes(paa.question.toLowerCase().trim())
        );
      
      if (match && !selectedPaaQuestions.find(p => p.question.toLowerCase().trim() === match.question.toLowerCase().trim())) {
        selectedPaaQuestions.push(match);
      }
    }

    // If AI didn't select enough, fill with remaining questions in original order
    if (selectedPaaQuestions.length < 10) {
      if (strict) {
        throw new Error(
          `[PAA Selection] AI selected ${selectedPaaQuestions.length} questions; expected up to 10`,
        );
      }
      const remaining = allPaaQuestions.filter(paa => 
        !selectedPaaQuestions.find(selected => selected.question.toLowerCase().trim() === paa.question.toLowerCase().trim())
      );
      selectedPaaQuestions.push(...remaining.slice(0, 10 - selectedPaaQuestions.length));
    }

    return selectedPaaQuestions.slice(0, 10);
  } catch (error) {
    if (strict) throw error;
    console.warn('[PAA Selection] Error during AI analysis, using fallback selection:', error);
    return allPaaQuestions.slice(0, 10);
  }
}

export async function generateChecklistFromSelections(
  selectedKeywords: string[],
  selectedH2Sections: string[],
  title: string,
  keywordData: KeywordData,
  options: {
    apiKey: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    userPrompt?: string;
    entity?: string; // Optional entity for content optimization
    entityAnalysis?: string; // AI analysis of the entity for context
    serpData?: any; // Full SERP JSON response for context
    selectedPeopleAlsoAsk?: string[]; // Selected People Also Ask questions
    peopleAlsoAskItems?: PeopleAlsoAsk[]; // Full PAA items (question + url/answer) for linking
    selectedResearchLinks?: string[]; // Selected research links for external linking
    checkedExternalLinks?: CheckedExternalLink[]; // Pre-validated external links from Google AI Mode (3-5 per blog)
    runExternalResearch?: boolean; // When true, run Google AI Mode research and inject 3-5 checked external links (uses locationName/languageCode)
    locationName?: string; // For external research (default United States)
    languageCode?: string; // For external research (default en)
    connectedSite?: { name: string; siteUrl: string }; // Connected WordPress site (target topic)
    wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>; // WordPress posts for context
    wordPressPagesForOfferTable?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>;
    setProgress?: (progress: { step: string; progress: number; message?: string }) => void; // For AI Mode research micro-step
    currentPageUrl?: string; // URL of the page currently being optimized
    /** Semrush url_organic + phrase_related keywords JSON (RAG); optional */
    semrushKeywordsContext?: string;
    /** Semrush cluster/scatter JSON for phrasing spread; optional */
    semrushScatterContext?: string;
    /** Server-filtered Semrush external URLs - third-party hrefs must match exactly when provided */
    semrushApprovedExternalUrls?: string[];
    /** Semrush keyword phrases - external anchor text must match exactly when provided */
    semrushAnchorPhrases?: string[];
    /** Blog import: exact hyperlinks from source draft — mandatory in checklist. */
    importedDraftLinks?: ImportedDraftLink[];
    /** Per-row Modifications field URLs — mandatory external links from DataForSEO research. */
    modifierExternalLinks?: ModifierExternalLink[];
    /** LLM audit liveLinks classified as authority (gov, municipal, news, weather, BBB). */
    llmAuditAuthorityLinks?: LlmAuditAuthorityLinkLike[];
    /** Entity SAP row: verified English Wikipedia URL (mandatory for entity bulk). */
    wikipediaUrl?: string;
    /** Entity SAP row: verified Wikipedia article title. */
    wikipediaTitle?: string;
    /** Prefixed CSV field contract — use title/meta/wiki/slug verbatim. */
    prefilledRowContract?: string;
    /** Row-only external links (modifier_links_json + imported_links_json). */
    userExternalLinks?: ExternalLinkPair[];
    /** Summarized LLM audit facts and mandatory content angles (runs before checklist). */
    llmAuditSummary?: string;
    dfsArticleAuditBlock?: string;
    /** First-party claims + ChatGPT business facts. */
    firstPartyAuthorityBlock?: string;
    siteId?: string;
    primaryKeyword?: string;
    /** Stored SERP brief JSON for dynamic H2 outline (blog paths). */
    serpResearchBriefJson?: string;
    /** Precomputed SERP H2 outline (5-6 titles). */
    serpH2Outline?: string[];
    /** Blog import body H2s. When set, these titles are the outline (no SERP rewrite, no 5-6 cap). */
    importedH2Outline?: string[];
    /** Live post H2s forbidden on optimize. */
    forbiddenLiveH2s?: string[];
    /** Fires when SERP H2 outline is resolved, before checklist LLM. */
    onSerpH2OutlineReady?: (bodyHarnessTitles: string[]) => void;
  }
): Promise<ChecklistFromSelectionsResult> {
  const {
    apiKey,
    model = getResearchModel(),
    temperature = 1.0,
    maxTokens = 16000,
    topP = 0.9,
  } = options;

  const hasSapEntity = Boolean(options.entity?.trim());
  const routeKeyword = keywordData.keyword?.trim() ?? "";
  const competitorComparisonRow = isCompetitorCsvKeyword(routeKeyword);
  const isCompetitorComparison = competitorComparisonRow && hasSapEntity;
  const isServiceArea = hasSapEntity && !competitorComparisonRow;
  const checklistKeywordData: KeywordData =
    competitorComparisonRow && options.primaryKeyword?.trim()
      ? { ...keywordData, keyword: options.primaryKeyword.trim() }
      : keywordData;
  const importedH2Outline = (options.importedH2Outline ?? [])
    .map((t) => t.trim())
    .filter(Boolean);
  const useImportedH2Outline = !isServiceArea && importedH2Outline.length > 0;

  let resolvedH2Sections = [...selectedH2Sections];
  if (useImportedH2Outline) {
    resolvedH2Sections = importedH2Outline;
  } else if (!isServiceArea) {
    if (options.serpH2Outline?.length) {
      resolvedH2Sections = validateSerpH2OutlineTitles(
        options.serpH2Outline,
        options.forbiddenLiveH2s,
      );
    } else {
      resolvedH2Sections = await deriveSerpH2Outline({
        apiKey,
        primaryKeyword:
          checklistKeywordData.keyword?.trim() || options.primaryKeyword?.trim() || title,
        title,
        siteName: options.connectedSite?.name?.trim() || "",
        siteUrl: options.connectedSite?.siteUrl,
        serpBriefJson: options.serpResearchBriefJson,
        forbiddenLiveH2s: options.forbiddenLiveH2s,
        model,
        siteId: options.siteId,
      });
    }
  }

  if (!isServiceArea && resolvedH2Sections.length) {
    options.onSerpH2OutlineReady?.(
      buildPredeterminedBlogBodyHarnessTitlesFromOutline(title, resolvedH2Sections),
    );
  }

  const resolvedCheckedLinks = options.checkedExternalLinks;
  const optionsWithCheckedLinks = resolvedCheckedLinks?.length
    ? { ...options, checkedExternalLinks: resolvedCheckedLinks }
    : options;
  // Keep keywords in their natural form (lowercase) - do NOT capitalize them
  // Keywords should only be capitalized when they're proper nouns, geographic locations, or at sentence starts
  const primaryKeywordNatural = checklistKeywordData.keyword.toLowerCase();
  const selectedKeywordsNatural = selectedKeywords.map(kw => kw.toLowerCase());

  // Define proper case versions for display purposes (used in template strings)
  const primaryKeywordProper = toProperCase(checklistKeywordData.keyword);
  const selectedKeywordsProper = selectedKeywords.map(kw => toProperCase(kw));

  const hasFirstPartyAiso = Boolean(options.firstPartyAuthorityBlock?.trim());
  const aisoKeywordChecklistBlock = hasFirstPartyAiso
    ? `\n${AISO_CHECKLIST_KEYWORD_RULE}\nWhen FIRST-PARTY AUTHORITY is present, AISO CHECKLIST KEYWORD replaces legacy exact-phrase density targets below.\n`
    : "";

  const keywordDensityChecklistItemLine = hasFirstPartyAiso
    ? `- CRITICAL: Each checklist item must include **[FOCUS KEYWORD DENSITY]** (AISO semantic breadth — not ~1% exact-phrase density), **[EXACT PRIMARY PER H2]** (at most once per H2 body when natural; skip if prior section used exact phrase), and **[PARAGRAPH LENGTH]** (moderately short ~2-4 sentences). Natural conversational language — forbidden stuffing one paragraph with the exact SEO slug.`
    : `- CRITICAL: Always add a note in each checklist item including **[FOCUS KEYWORD DENSITY]**, **[EXACT PRIMARY PER H2]**, and **[PARAGRAPH LENGTH]**: **minimum ~1.0%** focus keyword density across the **full article**; **exact** Primary Keyword **≥1× per H2** body; paragraphs **moderately short** (**~2–4 sentences**), **not** long walls of text, **not** all one-sentence choppiness. **Do not** aim for **~0.5%** when the target is **~1%** or higher. Also note: natural, conversational language - avoid stuffing **one** paragraph; **distribute** focus-keyword usage across intro, H2s, body, conclusion. Mix anchor text: 50% natural descriptive, 30% branded, 20% keyword-rich.`;

  const checklistKeywordSpreadRules = hasFirstPartyAiso
    ? `3. Distribute keywords naturally across sections using semantic variations; exact phrase sparingly per AISO CHECKLIST KEYWORD.
4. **FOCUS KEYWORD DENSITY (AISO)**: State semantic breadth plus exact phrase in Answer and sparingly in body — not minimum ~1% exact-phrase stuffing.
5. **EXACT PRIMARY PER H2 (AISO)**: At most once per H2 body when natural; skip when prior body section already used the exact phrase.`
    : `3. Distribute keywords naturally across sections - semantic variations **and** enough exact/combination usage to hit **[FOCUS KEYWORD DENSITY] ~1%+** (not ~0.5%)
4. **FOCUS KEYWORD DENSITY (NON-NEGOTIABLE IN CHECKLIST)**: Every checklist must explicitly require **minimum ~1.0%** focus keyword density (exact phrase + word-order combinations). Avoid **~0.5%** totals when the target is **~1%** or higher. Avoid stuffing one paragraph: **spread** mentions across the article. Mix anchor text types (descriptive, branded, keyword-rich).
5. **EXACT PRIMARY PER H2 (NON-NEGOTIABLE)**: Every checklist item that defines an **H2** section must require the **exact** Primary Keyword string (**"${primaryKeywordProper}"** / same words and order as **Primary Keyword**) **at least once** in that section's body copy - **every** H2 including intro and conclusion. State it explicitly as **[EXACT PRIMARY PER H2]** in each such item.`;

  const checklistExactPrimaryStructureLine = hasFirstPartyAiso
    ? `- **[EXACT PRIMARY PER H2] (AISO)**: At most once per H2 body when natural; skip when prior body section used exact phrase. Intro: at most one exact primary, not in sentence one.`
    : `- **[EXACT PRIMARY PER H2]**: Every checklist item that creates an H2 section MUST state that the **exact** Primary Keyword (from Keyword Context) appears **once** in that section's body - not in every sentence. Intro: at most one exact primary, not required in sentence one.`;

  const checklistLinksKeywordBlock = hasFirstPartyAiso
    ? `- **Include in the checklist**: **[FOCUS KEYWORD DENSITY] (AISO)**: semantic breadth over exact-phrase stuffing. **[EXACT PRIMARY PER H2] (AISO)**: at most once per H2 when natural. **[PARAGRAPH LENGTH]**: moderately short paragraphs (~2-4 sentences).
- Prefer semantic variants for anchor text and body copy; exact phrase only where it reads naturally.`
    : `- **Include in the checklist**: **[FOCUS KEYWORD DENSITY]**: **minimum ~1.0%** focus keyword density (exact + combinations); **not** **~0.5%** when the target is **~1%** or higher. **[EXACT PRIMARY PER H2]**: **exact** Primary Keyword phrase **once per H2** section body (minimum). **[PARAGRAPH LENGTH]**: **moderately short** paragraphs (**~2–4 sentences**); no long walls of text; not all single-sentence paragraphs.
- Use semantic variations for flow, but spread exact/partial matches across the article so focus keyword density clears **~1%**
- If one paragraph feels repetitive, **redistribute** focus-keyword usage to other sections instead of dropping below **~1%** overall`;

  const keywordFocusDensityBlock = hasFirstPartyAiso
    ? `FOCUS KEYWORD (AISO — overrides legacy density targets):
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
    : `FOCUS KEYWORD DENSITY (EXPLICIT - THE CHECKLIST MUST STATE THIS IN PLAIN LANGUAGE):
- Target **at least ~1.0%** focus keyword density for the primary phrase (plus word-order combinations), **not** staying near **~0.5%**.
- Every generated checklist MUST include an explicit line such as: **[FOCUS KEYWORD DENSITY]**: Target **minimum ~1.0%** focus keyword density across the **full article** (exact phrase + word-order combinations). **Do not** ship content around **~0.5%** when the goal is **~1%** or higher.
- Require **multiple** natural placements across **introduction, several H2 sections, body paragraphs, and conclusion** - spread usage, do not cram everything into one paragraph.
- If density is still low despite many mentions, the checklist should say to **weave the exact focus phrase** and close combinations in a few more sections until **~1%** is met, without robotic repetition in one block.

EXACT PRIMARY KEYWORD - ONCE PER EVERY H2 SECTION (NON-NEGOTIABLE - CHECKLIST MUST STATE THIS):
- The **WRITING KEYWORD** string (from KEYWORD PUNCTUATION block — full Title Case, exact words and order) MUST appear **at least once in the body** of **every** section that is an **H2** main block: introduction (first H2), **each** selected H2 topic, conclusion (final H2), and any mandatory H2s (e.g. service-area **What We Offer**, **Next Steps**). **Never** in the H2 **heading title**.
- Every generated checklist item for an H2 section MUST include an explicit line: **[EXACT PRIMARY PER H2]**: Include the **exact** primary keyword phrase **at least once** in this section's body copy (paragraphs and/or list/table text under that H2). **Not** only synonyms or partials - the **full exact phrase** must appear **somewhere** under that H2.
- The exact phrase does **not** need to appear inside the H2 **heading title**; it **must** appear in the **content** under that H2 (including inside H3 subsections that belong to that H2).
- Do **not** skip an H2: if one section lacks the exact phrase, the checklist is incomplete.

READABILITY - PARAGRAPH LENGTH (CHECKLIST SHOULD STATE **[PARAGRAPH LENGTH]**):
- Prefer **moderately short** paragraphs: typically **2–4 sentences** per paragraph on average. **Split** content when a paragraph would become a long wall of text (roughly **5+ sentences** or one dominant block) - this addresses SEO/readability feedback like “paragraph is long.”
- **Do not** default to **only** one-sentence paragraphs (over-choppy); **do not** leave **overly long** single paragraphs. Balance scannability with natural flow.

CRITICAL KEYWORD USAGE - NATURAL LANGUAGE PRIORITY (2026 SEO STANDARDS):
- AVOID KEYWORD STUFFING: Never repeat the exact-match phrase in every sentence or stack it unnaturally. Modern search engines penalize repetitive, robotic-sounding content.
- Use semantic variations **and** word-order combinations to reach **~1%** density:
  * If primary keyword is "Wood Window Blinds Seagrove Beach", use variations like:
    - "wood blinds" (often)
    - "wood window treatments in Seagrove Beach" (varied)
    - "wooden blinds for coastal homes" (natural alternative)
    - "wood blinds in the Seagrove Beach area" (natural phrasing)
  * Distribute **exact** and **partial** matches across the whole article so total focus-keyword presence meets **~1%** - do **not** rely on "1–2 exact uses only" if that leaves density at **~0.5%**
  * Split multi-word keywords naturally across sentences where it reads well, but ensure components still appear often enough overall for density targets
- Natural language patterns:
  * Write as a human would speak, not as SEO software would generate
  * Use conversational, engaging language that prioritizes reader experience
  * If non-focus wording feels forced, rephrase; the **exact** Primary Keyword must still appear once per H2 per **[EXACT PRIMARY PER H2]** - place it where it reads naturally (often mid-sentence)
  * Vary sentence structure - avoid repetitive patterns that make content feel formulaic
- Anchor text variety (CRITICAL for modern SEO):
  * Mix keyword-rich (20%), branded (30%), and natural descriptive (50%) anchor text
  * Branded examples: "In The Shade's collection", "our showroom", "in-home measure appointment"
  * Natural descriptive: "this guide to humidity-resistant blinds", "learn more about motorization", "explore your options"
  * Avoid overusing exact keyword phrase as anchor text - this signals over-optimization
- Keyword density guidance (for SEO):
  * Target **at least ~1.0%** focus keyword density (exact phrase + word-order combinations). **Avoid** finishing around **~0.5%** when the target is **~1%** or higher.
  * Prefer spreading exact and partial matches across sections over a single paragraph stuffed with repeats
  * Use partial matches and semantic variations for readability, but **do not** use "variations only" as an excuse for **below ~1%** total focus-keyword score
  * Focus on topical relevance **and** meeting the explicit density bar the checklist states
- Content quality over keyword matching:
  * Readability, user value, and natural flow matter - but the checklist must still **explicitly** require **~1%** focus keyword density, not **~0.5%**
  * Content should sound like it was written by a human expert, not an SEO tool
  * If a paragraph feels stuffed, **redistribute** mentions to other sections rather than dropping below **~1%** overall`;

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

  // Extract full PAA data from SERP if available, or use selected questions
  let paaQuestions: Array<{ question: string; answer?: string; url?: string }> = [];
  let paaItems: PeopleAlsoAsk[] = Array.isArray(options.peopleAlsoAskItems) ? options.peopleAlsoAskItems : [];
  if (paaItems.length === 0 && options.serpData) {
    // Best-effort: derive PAA items from SERP JSON so we can link sources in the FAQ section.
    try {
      const { extractPeopleAlsoAskFromSerp } = await import("./paa-extractor");
      const extracted = extractPeopleAlsoAskFromSerp(options.serpData);
      paaItems = extracted.items || [];
    } catch {
      // ignore – links are optional, questions can still be used
    }
  }

  const selectedProvided = Array.isArray(options.selectedPeopleAlsoAsk) && options.selectedPeopleAlsoAsk.length > 0;

  if (selectedProvided || paaItems.length > 0) {
    const selected = selectedProvided
      ? options.selectedPeopleAlsoAsk!.map((q) => q?.trim()).filter((q): q is string => !!q)
      : paaItems.map((p) => p.question).filter((q): q is string => !!q);

    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const q of selected) {
      const k = q.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        deduped.push(q);
      }
      // Don't break early - collect all questions for AI analysis if entity is provided
      if (!options.entity && deduped.length >= 10) break; // top 10 "most popular" (SERP order / user-selected order) - only if no entity
    }

    // Create full PAA question objects and filter out international references
    let allPaaQuestions = deduped
      .map((question) => {
        const match = paaItems.find(
          (p) => p?.question && p.question.toLowerCase().trim() === question.toLowerCase().trim()
        );
        return {
          question,
          answer: match?.answer,
          url: match?.url,
        };
      })
      .filter((paa) => {
        // Filter out questions with non-North American location references
        const lowerQuestion = paa.question.toLowerCase();
        const blockedTerms = ['australia', 'uk', 'united kingdom', 'europe', 'asia', 'london', 'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'canberra', 'england', 'scotland', 'wales', 'ireland', 'new zealand', 'singapore', 'hong kong', 'tokyo', 'paris', 'berlin', 'rome', 'madrid'];
        const hasInternationalRef = blockedTerms.some(term => lowerQuestion.includes(term));
        if (hasInternationalRef) {
          console.log(`[PAA Filter] Filtered out question with international reference: ${paa.question}`);
          return false;
        }
        return true;
      });

    // If entity is provided, use AI to select the BEST questions for the FAQ section
    const strictOptimizePath = Boolean(options.currentPageUrl);
    if (options.entity && allPaaQuestions.length > 10) {
      const apiKey = options.apiKey || loadApiKey();
      if (!apiKey) {
        if (strictOptimizePath) {
          throw new Error("[PAA Selection] API key required for entity PAA selection on optimize path");
        }
        paaQuestions = allPaaQuestions.slice(0, 10);
      } else {
        paaQuestions = await selectBestPAAQuestionsWithAI(
          allPaaQuestions,
          options.entity,
          checklistKeywordData.keyword,
          title,
          options.connectedSite,
          apiKey,
          options.model,
          options.temperature,
          options.maxTokens,
          options.topP,
          strictOptimizePath,
        );
      }
    } else {
      // No entity or not enough questions - use simple selection (top 10)
      paaQuestions = allPaaQuestions.slice(0, 10);
    }
  }

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
- Location density: Target 1-2% for exact location name, 3-5% for broader geographic variations

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
      ? `**[LINK] + [EXTERNAL_SEMRUSH]**: MANDATORY for EVERY section. **${LINK_FEATURE_PLACEHOLDER}**. **[EXTERNAL_SEMRUSH]**: at least 1 outbound citation per section - exact href from SEMRUSH APPROVED EXTERNAL URLs and exact anchor from SEMRUSH APPROVED ANCHOR PHRASES in the system prompt. Spread citations across many sections (majority of H2 items); rotate different Semrush URLs.`
      : `**[LINK]**: MANDATORY for EVERY section. **${LINK_FEATURE_PLACEHOLDER}**. ${INTERNAL_LINK_INTENT_ROUTING_RULE} Never end a sentence with a keyword or <a>. Never service-area URLs.`}
   - ${keywordDensityChecklistItemLine}
   - CRITICAL: PREVENT UNNECESSARY SUBLISTS: Explicitly state in each checklist item: "Note: Do NOT create sublists, bullet lists, or 'Key Features' lists unless the [LIST] feature is explicitly specified in this checklist item. Write content in flowing paragraphs only. Only include lists when [LIST] is explicitly mentioned as a feature requirement."
${checklistKeywordSpreadRules}
6. First and last H2: use outline titles exactly. ${hasFirstPartyAiso ? "**[EXACT PRIMARY PER H2] (AISO)** on both when natural." : "**[EXACT PRIMARY PER H2]** on both."} ${semrushParts.hasSemrushExactMode ? `${LINK_FEATURE_PLACEHOLDER}. [EXTERNAL_SEMRUSH]: at least 1 Semrush outbound citation where natural.` : `${LINK_FEATURE_PLACEHOLDER}.`}
7. Include [REAL-WORLD EXAMPLE] only when master instructions, existing page HTML, GBP, or audit blocks supply a real installer/process/climate fact. Forbidden: invented counts, fake testimonials. If those sources are empty, omit.
8. **MANDATORY CONTENT STRUCTURE ELEMENTS (NON-NEGOTIABLE)** - Every blog MUST include ALL THREE of the following elements to break up text and improve readability:
   - **AT LEAST 1 TABLE**: You MUST include [TABLE] in at least one section. Use for comparisons, features, specifications, or data. When comparing Pros/Cons or Manual vs Motorized: use an HTML table (<table><thead><tr><th>Pros</th><th>Cons</th></tr></thead><tbody>...</tbody></table>), NOT Pros/Cons sub-headings with bullet lists. NEVER markdown tables. ${TABLE_NO_LINK_ONLY_COLUMN_RULE}
   - **AT LEAST 1 BULLETED LIST (Unordered)**: You MUST include [LIST]: Bulleted list in at least one section. Use for features, benefits, items, or options. Example: "[LIST]: Bulleted list of key benefits"
   - **AT LEAST 1 NUMBERED LIST (Ordered)**: You MUST include [LIST]: Numbered list in at least one section. Use for step-by-step processes, rankings, or sequences. Example: "[LIST]: Numbered list of installation steps"
   - These THREE elements are MANDATORY and non-negotiable. A blog without all three is INCOMPLETE.
   - Distribute them across DIFFERENT sections for variety - do not put all three in one section.
   - With only 5-7 sections total, one of each element type is sufficient; do not add extra sections just for structure.
   - **VALIDATION**: Before submitting your checklist, verify that you have included at least 1 [TABLE], 1 [LIST]: Bulleted list, and 1 [LIST]: Numbered list across your sections.${semrushParts.hasSemrushExactMode ? " Also verify every checklist item includes both [LINK] (internal) and [EXTERNAL_SEMRUSH] (Semrush outbound)." : ""}`;

  const systemPrompt = `You are an expert blog content strategist and blueprint architect. Your role is to create a detailed, robust checklist for generating a blog template blueprint based on the provided selections.

${keywordSection}

CRITICAL: Use natural, conversational language - avoid stuffing one paragraph. **Focus keyword**: ${hasFirstPartyAiso ? "When FIRST-PARTY AUTHORITY is present, follow **AISO CHECKLIST KEYWORD**: semantic breadth over exact-phrase density; exact phrase in Answer plus up to ~4 natural body mentions; at most once per H2 when prior section did not already use it." : "The checklist MUST explicitly require **minimum ~1.0%** focus keyword density (exact phrase + counted combinations), **not ~0.5%**. Distribute the focus keyword across intro, multiple H2s, body, and conclusion. Use semantic variations where they help readability, but do not leave total density below **~1%** just to avoid exact matches."} **[EXACT PRIMARY PER H2]**: ${hasFirstPartyAiso ? "At most once per H2 body when natural; skip when prior section used exact phrase." : "The checklist MUST require the **exact** Primary Keyword phrase **at least once in the body of every H2 section** (see Keyword Context above)."}

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
- If no keywords: "[LINK]: 3–5 [[LINK:query|anchor]] placeholders per section (no raw https:// internal URLs)"
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
    : `1. ${resolvedH2Sections[0] || "First SERP outline section"} [STRUCTURE]: 2-3 paragraphs. [LIST]: components. Opener leads with a sourced fact, then the topic (not keyword-first, not "{keyword} offers", not a dictionary definition). **[FIRST-PARTY AUTHORITY]**. **[EXACT PRIMARY PER H2]**: exact Primary Keyword once later in the intro body. **[FOCUS KEYWORD DENSITY]**: ~1%+ across article. ${entityWikiUrl && entityName ? `[EXTERNAL_WIKI]: Link "${entityName}" to ${entityWikiUrl}. ` : ""}[LINK]: minimal in opener.
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

CRITICAL: Weave keywords elegantly into content using natural, human-like syntax. Keywords should flow organically within sentences. **Focus keyword**: ${hasFirstPartyAiso ? "When FIRST-PARTY AUTHORITY is present, follow **AISO CHECKLIST KEYWORD**: semantic breadth over exact-phrase density; exact phrase in Answer plus sparing body mentions; at most once per H2 when natural." : "The checklist MUST state **[FOCUS KEYWORD DENSITY]**: **minimum ~1.0%** focus keyword density (exact phrase + counted combinations), **not ~0.5%** - distribute across the article."} **EXACT PRIMARY PER H2**: ${hasFirstPartyAiso ? "At most once per H2 body when natural; skip when prior section used exact phrase." : "The checklist MUST state that the **exact** Primary Keyword phrase appears **once in the body of every H2** (not in every sentence)."} Intro: at most one exact primary, not required in sentence one; prefer [FIRST-PARTY AUTHORITY] in the opener.

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
    userPrompt += `\n\n--- MANDATORY: INTERNAL + SEMRUSH OUTBOUND IN EVERY CHECKLIST ITEM (NON-NEGOTIABLE) ---
- **EVERY numbered checklist item** must explicitly include BOTH: (1) "${LINK_FEATURE_PLACEHOLDER}", AND (2) "[EXTERNAL_SEMRUSH]" requiring at least one outbound citation drawn **only** from the numbered SEMRUSH APPROVED EXTERNAL URLs / ANCHOR PHRASES blocks in the system prompt.
- **ZERO HALLUCINATED EXTERNAL URLS**: Do NOT type any third-party https:// URL in the checklist unless it is a **verbatim copy** from the SEMRUSH APPROVED EXTERNAL URLs list. **FORBIDDEN**: invented URLs, "e.g." external links, competitor domains, or plausible-looking URLs not in the list. **ALLOWED**: paste URL(s) exactly from the list, OR write "use SEMRUSH approved URL #N with anchor phrase #N" with no URL string.
- **Spread outbound links**: the majority of sections (at least half of H2 items, or 6+ items when the checklist is long) must mention [EXTERNAL_SEMRUSH]. Use **different Semrush list indices** across sections where possible.
- **FORBIDDEN**: Checklist lines that only say "internal links" or "WordPress URLs only" without [EXTERNAL_SEMRUSH] when SEMRUSH data is in the system prompt.
- **H3 SUBSECTIONS**: When a section uses H3s, at least one H3 block should still include an [EXTERNAL_SEMRUSH] citation where natural (same no-hallucination rule).
- **VALIDATION**: Before submitting, count that every item has both [LINK] and [EXTERNAL_SEMRUSH] stated, and that **no third-party URL appears unless copied from the Semrush list**.${selectedKeywords.length > 0 ? `\n- Selected keywords for internal anchor text variety: ${selectedKeywords.join(", ")}` : ""}`;
  } else if (selectedKeywords.length > 0) {
    userPrompt += `\n\n--- MANDATORY: INTERNAL LINK REQUIREMENTS FOR ALL SECTIONS (NON-NEGOTIABLE) ---
- Every H2 and H3 MUST include "${LINK_FEATURE_PLACEHOLDER}"
- ${INTERNAL_LINK_INTENT_ROUTING_RULE} Never end a sentence with a keyword or <a>. Never service-area URLs.
- Selected keywords for anchor text: ${selectedKeywords.join(", ")}
- **VALIDATION**: every section states [LINK] with [[LINK:query|anchor]]`;
  } else {
    userPrompt += `\n\n--- MANDATORY: INTERNAL LINK REQUIREMENTS FOR ALL SECTIONS (NON-NEGOTIABLE) ---
- Every H2 and H3 MUST include "${LINK_FEATURE_PLACEHOLDER}"
- ${INTERNAL_LINK_INTENT_ROUTING_RULE} Never end a sentence with a keyword or <a>. Never service-area URLs.
- **VALIDATION**: every section states [LINK] with [[LINK:query|anchor]]`;
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

  const allKeywords = [checklistKeywordData.keyword, ...selectedKeywords].filter(Boolean);
  const MIN_CHECKLIST_ITEMS = useImportedH2Outline
    ? importedH2Outline.length
    : isCompetitorComparison
      ? 9
      : isServiceArea
        ? 6
        : 5;

  let fullResponse = "";
  let checklistFinishReason: string | undefined;

  const streamResult = await streamChatCompletion({
    apiKey,
    model,
    messages: [
      { role: "system", content: appendUniversalContentRulesToSystemPrompt(systemPrompt) },
      { role: "user", content: userPrompt },
    ],
    contentHarness: true,
    temperature,
    maxTokens,
    topP,
    onContentChunk: (chunk) => {
      fullResponse += chunk;
    },
    onFinishReason: (reason) => {
      checklistFinishReason = reason;
    },
  });

  const parsed = parseBlogTemplateChecklist(fullResponse, allKeywords).filter(
    (item) => !isLlmAuditAuthorityDumpChecklistItem(item),
  );

  const effectiveFinish = checklistFinishReason || streamResult.finishReason;
  if (parsed.length >= MIN_CHECKLIST_ITEMS) {
    return {
      items: parsed,
      h2Outline: isServiceArea || isCompetitorComparison ? undefined : resolvedH2Sections,
    };
  }

  throw new Error(
    `Checklist generated ${parsed.length} items; need at least ${MIN_CHECKLIST_ITEMS} (finishReason=${effectiveFinish}, len=${fullResponse.length}).`,
  );
}
