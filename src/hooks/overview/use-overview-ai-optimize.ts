import { useCallback, useState } from "react";
import { streamChatCompletion, type Message } from "@/lib/api";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import { enforceExactFocusKeyword } from "@/lib/overview/enforce-exact-focus-keyword";
export { enforceExactFocusKeyword } from "@/lib/overview/enforce-exact-focus-keyword";
import { META_DESCRIPTION_ANTI_CLICKBAIT_RULE, TITLE_ANTI_CLICKBAIT_RULE, TITLE_KEYWORD_WEAVING_RULE, TITLE_CASE_RULE, TITLE_WELL_KNOWN_ACRONYMS_RULE } from "@/lib/prompt-builders/title-rules";
import {
  appendUniversalContentRulesToSystemPrompt,
  scrubOverviewContentOutput,
} from "@/lib/content-word-blocklist";
import { appendMasterInstructionsToSystemPrompt, ensureMasterInstructionsInMemory } from "@/lib/master-instructions-storage";
import { normalizeFocusKeywordPhrase } from "@/lib/seo-redirect-csv";
import { pathSlugToFocusHint } from "@/lib/overview/focus-keyword-path-hint";
import {
  runContentKeywordsBatch,
  runEntityKeywordsBatch,
  type OverviewKeywordCatalogRow,
} from "@/lib/overview/overview-keyword-batch-agent";
import { runAiAllMetaBatch } from "@/lib/overview/overview-ai-all-meta-batch-agent";
import type { AiAllMetaCatalogRow } from "@/lib/overview/overview-ai-all-meta-batch-catalog";
import type { AiAllMetaRowPatch } from "@/lib/overview/overview-ai-all-meta-batch-parse";
import type { WordPressSite } from "@/components/integrations/types";
import { getMetaModel } from "@/lib/optimization-settings-storage";
import {
  formatPageLocalContextPromptBlock,
  resolvePageLocalContext,
} from "@/lib/content-optimization/page-local-context";
import { PRIMARY_CITY_CONSISTENCY_RULE } from "@/lib/content-optimization/first-party-authority-prompt";
import { FAQ_CONVERSATIONAL_RULE } from "@/lib/content-generation/faq-heading-policy";

interface UseOverviewAiOptions {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  napSummary?: string;
  /** When set, client master instructions for this WordPress site are appended to every system prompt. */
  wordPressSiteId?: string | null;
  /** Full site record for primary city in FAQ/Answer prompts (Edmonton from Integrations profile). */
  wordPressSite?: WordPressSite | null;
}

interface UseOverviewAiResult {
  loading: boolean;
  focusKeywordLoading: boolean;
  error: string | null;
  optimizeTitle: (
    url: string,
    existingTitle: string,
    focusKeyword?: string,
    faq?: string,
    sentimentSource?: string,
    /** Merged JSON brief (tile `seo_research`); primary research signal when set. */
    seoResearchBrief?: string,
  ) => Promise<string | null>;
  optimizeMeta: (
    url: string,
    existingMeta: string,
    focusKeyword?: string,
    faq?: string,
    sentimentSource?: string,
    gscQuickWinsContext?: string,
    /** When set, used as primary research context; raw GSC JSON is omitted from the prompt to save tokens. */
    seoResearchBrief?: string,
    /** Parallel bulk: do not toggle shared `loading` / global error (single-row UI still uses loading). */
    options?: { skipLoadingState?: boolean; signal?: AbortSignal },
  ) => Promise<string | null>;
  optimizeFaq: (
    url: string,
    focusKeyword?: string,
    existingFaq?: string,
    dfsSerpContext?: string,
    pageTitle?: string,
    pageMeta?: string,
    /** When set, used instead of slim DFS context in the prompt. */
    seoResearchBrief?: string,
    options?: { exactQuestionCount?: number; skipLoadingState?: boolean; includeAnswers?: boolean },
  ) => Promise<string | null>;
  optimizeFaqQuestion: (
    url: string,
    focusKeyword: string | undefined,
    currentQuestion: string,
    faqContext?: string,
    dfsSerpContext?: string,
    pageTitle?: string,
    pageMeta?: string,
    seoResearchBrief?: string,
  ) => Promise<string | null>;
  optimizeFaqAnswer: (
    url: string,
    focusKeyword: string | undefined,
    question: string,
    currentAnswer: string,
    faqContext?: string,
    dfsSerpContext?: string,
    pageTitle?: string,
    pageMeta?: string,
    seoResearchBrief?: string,
  ) => Promise<string | null>;
  enhanceFocusKeywordFromGsc: (
    url: string,
    gscKeywordBasis: string,
    pageTitle?: string,
    pageMeta?: string,
  ) => Promise<string | null>;
  deriveFocusKeywordFromPageContext: (
    url: string,
    pageTitle?: string,
    pageMeta?: string,
    faq?: string,
    pageContentPlainText?: string,
    options?: { skipLoadingState?: boolean; seoResearchBrief?: string },
  ) => Promise<string | null>;
  deriveEntityKeyword: (
    url: string,
    pageTitle?: string,
    pageMeta?: string,
    options?: { skipLoadingState?: boolean },
  ) => Promise<string | null>;
  /** Short-tail keyword from SEO brief (primary), then title, then URL; 2–5 words, comparisons allowed. */
  deriveShortTailFocusKeywordFromResearch: (
    brief: string,
    pageTitle: string,
    url: string,
  ) => Promise<string | null>;
  /** True while Semrush audit fix checklist AI is running (separate from title/meta/FAQ loading). */
  auditChecklistLoading: boolean;
  buildSemrushAuditFixChecklist: (pageUrl: string, auditContext: string) => Promise<string | null>;
}

function faqPrimaryLocalPromptBlock(
  site: WordPressSite | null | undefined,
  focusKeyword: string | undefined,
): string {
  if (!site) return "";
  const ctx = resolvePageLocalContext({
    keyword: focusKeyword?.trim() ?? "",
    site,
  });
  if (!ctx.primaryCity) return "";
  return `${formatPageLocalContextPromptBlock(ctx)}\n\n${PRIMARY_CITY_CONSISTENCY_RULE}`;
}

/**
 * Hook that uses OpenRouter (Gemini) via streamChatCompletion to optimize
 * titles and meta descriptions for URLs in the Overview grid.
 */
export function useOverviewAiOptimize(options: UseOverviewAiOptions): UseOverviewAiResult {
  const { apiKey, model, temperature, maxTokens, topP, napSummary, wordPressSiteId, wordPressSite } = options;
  const resolveMetaModel = useCallback(
    () => getMetaModel(wordPressSiteId) || model,
    [wordPressSiteId, model],
  );
  const [loading, setLoading] = useState(false);
  const [focusKeywordLoading, setFocusKeywordLoading] = useState(false);
  const [auditChecklistLoading, setAuditChecklistLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCompletion = useCallback(
    async (
      systemPrompt: string,
      userPrompt: string,
      signal?: AbortSignal,
      maxTokensOverride?: number,
    ): Promise<string> => {
      const resolvedKey = apiKey?.trim() || (await resolveOpenRouterApiKeyForHarness());
      if (!resolvedKey) {
        throw new Error("OpenRouter API key is missing. Set it in Settings first.");
      }

      await ensureMasterInstructionsInMemory(wordPressSiteId);

      const messages: Message[] = [
        {
          role: "system",
          content: appendUniversalContentRulesToSystemPrompt(
            appendMasterInstructionsToSystemPrompt(systemPrompt, wordPressSiteId ?? null),
          ),
        },
        { role: "user", content: userPrompt },
      ];

      const startedAt = Date.now();
      const activeModel = resolveMetaModel();
      console.log("[Auto SEO][OpenRouter Start]", {
        model: activeModel,
        maxTokens: maxTokensOverride ?? Math.min(maxTokens || 1024, 1500),
      });

      let result = "";
      const completion = await streamChatCompletion({
        apiKey: resolvedKey,
        model: activeModel,
        messages,
        temperature,
        maxTokens: maxTokensOverride ?? Math.min(maxTokens || 1024, 1500),
        topP,
        signal,
        contentHarness: true,
        onContentChunk: (chunk) => {
          result += chunk;
        },
      });

      const finalRaw = (result.trim() || completion?.content?.trim() || "").trim();
      const cleaned = scrubOverviewContentOutput(finalRaw);
      console.log("[Auto SEO][OpenRouter Done]", {
        model: activeModel,
        ms: Date.now() - startedAt,
        chars: cleaned.length,
        preview: cleaned.slice(0, 140),
      });
      return cleaned;
    },
    [apiKey, resolveMetaModel, temperature, maxTokens, topP, wordPressSiteId],
  );

  const optimizeTitle = useCallback(
    async (
      url: string,
      existingTitle: string,
      focusKeyword?: string,
      faq?: string,
      sentimentSource?: string,
      seoResearchBrief?: string,
      options?: { skipLoadingState?: boolean; titleMode?: "default" | "sap"; signal?: AbortSignal },
    ): Promise<string | null> => {
      const skipLoadingState = options?.skipLoadingState === true;
      const titleMode = options?.titleMode === "sap" ? "sap" : "default";
      if (!skipLoadingState) {
        setLoading(true);
        setError(null);
      }
      try {
        const briefTrimmed =
          typeof seoResearchBrief === "string" ? seoResearchBrief.trim() : "";
        const hasBrief = briefTrimmed.length > 0;
        const sapTitleRules = `SAP / near-me landing page title rules (mandatory)
- These are local "near me" service-area pages, NOT blog posts.
- Write one natural commercial headline: product/service offer + place, using "Near" (preferred) or "in" / "for".
- Good examples: "Best Hunter Douglas Blinds Near Edmonton City Centre", "Hunter Douglas Blinds Near Commerce Place Edmonton".
- Do NOT paste the focus keyword as the title and bolt on filler (Forbidden suffixes: Selection, Guide, Options, Types, Solutions, Collection, Dealer).
- Do NOT force the full focus keyword string as a contiguous block if it reads like a stuffed label. Rewrite into a readable near-me headline that still covers the same product + place intent.
- Include the place from the keyword/URL (neighbourhood, landmark, mall, bridge, district). Prefer "Near [Place]" over stacking City + Province as a bare keyword dump.
- 50-60 characters. ${TITLE_CASE_RULE}
- ${TITLE_ANTI_CLICKBAIT_RULE}
- NO COLONS. No pipe / brand prefix.
- ${TITLE_WELL_KNOWN_ACRONYMS_RULE}`;

        const defaultTitleRules = `Rules
- 50-60 characters
- ${TITLE_CASE_RULE}
- Include the focus keyword phrase once with the same words, spacing, and hyphens as below. Keep word order; always Title Case every word in the title (never copy lowercase keyword casing). Do NOT add words to it, do NOT normalize, slugify, or rephrase it.
- ${TITLE_KEYWORD_WEAVING_RULE}
- ${TITLE_ANTI_CLICKBAIT_RULE}
- **NO COLONS** in this title. Never use a topic-then-subtitle structure. Write one flowing headline joined with natural connecting words ("and", "for", "vs", "without", "how", "what", "why", "when"), or end with "?". This overrides any colon allowance above.
- Do NOT prepend business name, site name, company name, or distributor name (e.g. never start with "EJH Distribution", "Acme Co", or "SiteName | …"). Output ONLY the page topic title - no "Brand | Topic" pattern and no leading brand before the real subject.
- Do NOT force the keyword into the middle of a phrase where it sounds unnatural.
- If focus keyword is empty, infer the main keyword from the URL.
- NO brand or site name at the beginning of the title
- Natural language
- ${TITLE_WELL_KNOWN_ACRONYMS_RULE}`;

        const prompt = `Create a neutral, specific SEO title.

${titleMode === "sap" ? sapTitleRules : defaultTitleRules}
${
  hasBrief
    ? `- A cached **JSON SEO content brief** is below (SERP highlights, PAA, GSC queries). Parse it for intent and angles. Do NOT paste JSON into the title; write a short, specific title that reflects that intent.
`
    : ""
}
Focus keyword (${titleMode === "sap" ? "intent signal for product + place - rewrite into a near-me headline in full Title Case" : "MUST appear once with same words and spacing; Title Case every word in the title even if this line is lowercase"})
${focusKeyword?.trim() || "(none)"}

FAQ content (use as context only – do NOT simply echo questions)
${faq || "(none)"}

Page content for sentiment (use ONLY to understand whether the page is positive, neutral, or addressing a problem; do NOT copy phrases directly)
${sentimentSource || "(none)"}

${
  hasBrief
    ? `JSON SEO content brief (primary intent - do not copy into output)
${briefTrimmed.slice(0, 24000)}

`
    : ""
}URL
${url}

Existing title (replace completely - do NOT return this exact title; author a fresh, distinct SEO title)
${existingTitle}

Return only the new title text with no quotes. Every word must be Title Case.`;

        const systemPrompt = hasBrief
          ? `You are a senior SEO content title specialist. Write a brand-new, accurate, neutral title from scratch in full Title Case (every word capitalized) that is distinct from the existing title. A structured JSON SEO content brief is provided - use it as the main signal for searcher intent and angles while following all title rules. ${TITLE_CASE_RULE}`
          : `You are a senior SEO content title specialist. Write a brand-new, accurate, neutral title from scratch in full Title Case (every word capitalized) that is distinct from the existing title. ${TITLE_CASE_RULE}`;
        const raw = await runCompletion(systemPrompt, prompt, options?.signal);
        return raw || null;
      } catch (err: any) {
        if (!skipLoadingState) {
          setError(err?.message || "AI title optimization failed.");
        }
        return null;
      } finally {
        if (!skipLoadingState) {
          setLoading(false);
        }
      }
    },
    [runCompletion],
  );

  const optimizeMeta = useCallback(
    async (
      url: string,
      existingMeta: string,
      focusKeyword?: string,
      faq?: string,
      sentimentSource?: string,
      gscQuickWinsContext?: string,
      seoResearchBrief?: string,
      options?: { skipLoadingState?: boolean; signal?: AbortSignal },
    ): Promise<string | null> => {
      const skipLoadingState = options?.skipLoadingState === true;
      if (!skipLoadingState) {
        setLoading(true);
        setError(null);
      }
      try {
        const briefTrimmed =
          typeof seoResearchBrief === "string" ? seoResearchBrief.trim() : "";
        const hasBrief = briefTrimmed.length > 0;
        const hasGsc =
          !hasBrief &&
          typeof gscQuickWinsContext === "string" &&
          gscQuickWinsContext.trim().length > 0;

        const prompt = `Write a brand-new, grammatically natural SEO meta description from scratch.

Rules
- 130-155 characters
- ${META_DESCRIPTION_ANTI_CLICKBAIT_RULE}
- **Grammar and natural flow come first (NON-NEGOTIABLE)**: Write one or two complete, fluent English sentences in standard sentence case (capitalize the first word of the sentence and proper nouns/trademarks only; never start a sentence with a lowercase letter, and never Title Case generic keyword words mid-sentence).
- **Never shove or prefix the raw keyword**: NEVER dump the focus keyword at the start of the meta description followed by a colon, dash, comma, or pipe (e.g. FORBIDDEN: "energy efficient windows science: How Low-E coatings..." or "Blinds Bushnell FL: Window treatment options...").
- **Flexible, grammatical keyword weaving**: Treat the focus keyword as the topic signal, not a rigid contiguous string. If the focus keyword is phrased like a raw search query or slug (e.g. "energy efficient windows science", "blinds bushnell fl", "roman shades cost edmonton"), reorder the words and add natural prepositions, articles, or hyphens so the sentence reads effortlessly to a human (e.g. "Explore the science behind energy-efficient windows, including how Low-E coatings, argon gas fills, and insulated frames reduce heat transfer.").
- Do not add brand names or site name.
${
  hasBrief
    ? `- A cached **JSON SEO content brief** is below (DataForSEO SERP highlights + GSC queries). Parse it mentally for intent, questions, and angles. Do NOT paste JSON into the meta; write fresh, natural sentences that reflect that intent.
`
    : ""
}${
  hasGsc
    ? `- Real Google search queries for this page are provided below as JSON. Use them actively as inspiration: infer intent, pain points, and how people phrase searches; reflect that in your benefit and angle while keeping natural sentence flow. Do NOT paste or list queries, do NOT keyword-stuff, and do NOT copy wording verbatim.
`
    : ""
}
Focus keyword (topic signal - weave its words naturally with proper grammar and sentence case; never paste as a raw prefix or ungrammatical block)
${focusKeyword?.trim() || "(none)"}

FAQ content (use as context only – summarize the value, do NOT list questions verbatim)
${faq || "(none)"}

Page content for sentiment (use ONLY to understand whether the page is positive, neutral, or addressing a problem; do NOT copy phrases directly)
${sentimentSource || "(none)"}

${
  hasBrief
    ? `JSON SEO content brief (primary intent - organics, PAA, related searches, GSC queries; do not copy into output)
${briefTrimmed.slice(0, 24000)}

`
    : ""
}Real Google search queries for this URL (JSON: gsc_keywords_for_url + rows; last calendar month, up to 50 by impressions - use for inspiration as described above; if this is "(none)" or empty, skip)
${hasBrief ? "(none - use JSON SEO content brief above)" : gscQuickWinsContext || "(none)"}

URL
${url}

Existing meta description (replace completely - do NOT return or lightly tweak this existing text; author a fresh meta description from scratch)
${existingMeta}

Return only the newly authored meta description with no quotes.`;

        const systemPrompt = hasBrief
          ? "You are a senior SEO content specialist who authors brand-new, grammatically fluent, neutral meta descriptions in natural sentence case. Never front-load a raw keyword with a colon or force an ungrammatical keyword string into a sentence; weave the topic words naturally with connecting prepositions and articles. Use the structured JSON SEO content brief as the main signal for intent and specifics."
          : hasGsc
            ? "You are a senior SEO content specialist who authors brand-new, grammatically fluent, neutral meta descriptions in natural sentence case. Never front-load a raw keyword with a colon or force an ungrammatical keyword string into a sentence; weave the topic words naturally with connecting prepositions and articles. Treat Search Console query data as inspiration for searcher intent."
            : "You are a senior SEO content specialist who authors brand-new, grammatically fluent, neutral meta descriptions in natural sentence case. Never front-load a raw keyword with a colon or force an ungrammatical keyword string into a sentence; weave the topic words naturally with connecting prepositions and articles.";
        const raw = await runCompletion(systemPrompt, prompt, options?.signal);
        const text = raw ? enforceExactFocusKeyword(raw, focusKeyword) : null;
        return text || null;
      } catch (err: any) {
        if (!skipLoadingState) {
          setError(err?.message || "AI meta optimization failed.");
        }
        return null;
      } finally {
        if (!skipLoadingState) {
          setLoading(false);
        }
      }
    },
    [runCompletion],
  );

  const optimizeFaq = useCallback(
    async (
      url: string,
      focusKeyword?: string,
      existingFaq?: string,
      dfsSerpContext?: string,
      pageTitle?: string,
      pageMeta?: string,
      seoResearchBrief?: string,
      options?: { exactQuestionCount?: number; skipLoadingState?: boolean; includeAnswers?: boolean },
    ): Promise<string | null> => {
      const skipLoadingState = options?.skipLoadingState === true;
      const exactN = options?.exactQuestionCount;
      const includeAnswers = options?.includeAnswers === true;
      const pairCount = typeof exactN === "number" && exactN > 0 ? exactN : 4;
      const countRule = includeAnswers
        ? `- Output exactly ${pairCount} question-and-answer pairs (no more, no fewer).`
        : typeof exactN === "number" && exactN > 0
          ? `- Return exactly ${exactN} questions (no more, no fewer).`
          : "- Return 3-6 questions only.";
      if (!skipLoadingState) {
        setLoading(true);
      }
      setError(null);
      try {
        const briefTrimmed =
          typeof seoResearchBrief === "string" ? seoResearchBrief.trim() : "";
        const hasBrief = briefTrimmed.length > 0;
        const dfsForPrompt = hasBrief
          ? "(none - use JSON SEO content brief below)"
          : dfsSerpContext || "(none)";

        const localContextBlock = faqPrimaryLocalPromptBlock(wordPressSite, focusKeyword);

        const sharedContext = `
${localContextBlock ? `${localContextBlock}\n\n` : ""}Location & NAP context (use to localize questions and answers, but do NOT restate it verbatim or change its meaning)
${napSummary || "(none)"}

Page intent (derive topic and searcher needs from this; FAQs MUST stay aligned with this intent)
Title: ${pageTitle || "(none)"}
Meta: ${pageMeta || "(none)"}

${
  hasBrief
    ? `JSON SEO content brief (primary - organics, PAA, related, GSC; parse intent; do not copy verbatim)
${briefTrimmed.slice(0, 24000)}

`
    : ""
}DataForSEO SERP research context (filtered People Also Ask, organic results; use ONLY to understand search intent and what users are asking; do NOT copy text verbatim. If this is "(none)" or says to use the brief above, skip this block. If this context appears off-topic for the page intent, IGNORE it completely.)
${dfsForPrompt}

URL
${url}

Focus keyword (use exactly as shown when relevant)
${focusKeyword?.trim() || "(none)"}

Existing FAQ content (if any)
${existingFaq || "(none)"}
`;

        const prompt = includeAnswers
          ? `You are acting as a senior SEO strategist creating FAQ schema for a specific page.

The page currently has no usable FAQ content (or you are replacing empty FAQs). ${countRule}

Output format (strict - the app parses lines starting with Q: and A:)
- Repeat this block exactly ${pairCount} times:
  Q: <single-line question>
  A: <answer: 2-4 concise sentences. You may continue the answer on following lines until the next "Q:" line - do not start continuation lines with "Q:" or "A:" unless they are a new pair.>
- Each question must be meaningfully different (no duplicate angles).
- Do NOT start more than one question with the same first 3 words.
- Vary question openings (what, how, why, can, do I need, which, should, etc.).
- ${FAQ_CONVERSATIONAL_RULE}
- Answers must be helpful, on-topic, and localized to the business service area from NAP; do NOT broaden geography beyond that area.
- Cost and install FAQ answers must name the primary service city from PRIMARY LOCAL CONTEXT only; do not cite other cities from SERP or brief snippets.
- Do NOT mention brand or site name in answers unless the page context already does.
${
  hasBrief
    ? `- Use the JSON SEO content brief below as the primary signal for intent. Do NOT paste JSON into your output.
`
    : ""
}
${sharedContext}

Return only Q:/A: blocks as specified - no numbering, no markdown headings, no JSON.`
          : `You are acting as a senior SEO strategist creating FAQ schema for a specific page.

Generate an FAQ section for this page.

Rules
${countRule}
- One question per line.
- Do not include answers.
- Do not number them with bullets; just plain sentences.
- Each question must be meaningfully different in topic and wording (no repeats, no near-duplicates, no simple rephrases).
- Do NOT start more than one question with the same first 3 words (e.g. avoid repeating patterns like "Where can I find", "How do I", etc.).
- Vary the structure and angle of questions (mix \"what\", \"how\", \"why\", \"can\", \"do I need\", \"which\", \"should\", etc.).
- ${FAQ_CONVERSATIONAL_RULE}
- Questions should read naturally and elegantly, as if written by a senior copywriter.
- Focus questions on what a serious searcher for this topic would actually ask before contacting the business.
- Use the business's primary service area from NAP as the geographic scope.
- Do NOT broaden beyond that area (e.g. if the NAP is in Florida, do NOT say "United States and Canada" – stay with Florida / that city/state).
- Keep the overall sentiment of the question the same (positive/neutral/negative); only adjust geography and clarity.
${
  hasBrief
    ? `- A structured **JSON SEO content brief** is below. Use it as the primary signal for search intent and real questions. Do NOT paste JSON into your output.
`
    : ""
}
${sharedContext}

Return only the questions, one per line, no extra text.`;

        const systemPrompt = includeAnswers
          ? hasBrief
            ? `You are an SEO specialist who writes FAQ question-and-answer pairs for schema. Follow the Q:/A: format exactly. Use the JSON SEO content brief as the main signal; localize to the NAP service area without broadening geography. ${FAQ_CONVERSATIONAL_RULE} ${PRIMARY_CITY_CONSISTENCY_RULE}`
            : `You are an SEO specialist who writes FAQ question-and-answer pairs for schema. Follow the Q:/A: format exactly. Match searcher intent and the site's local service area. ${FAQ_CONVERSATIONAL_RULE} ${PRIMARY_CITY_CONSISTENCY_RULE}`
          : hasBrief
            ? `You are an SEO specialist who writes high-quality FAQ questions. A structured JSON SEO content brief is provided - use it as the main signal for searcher intent and question ideas. Align with the business's service area and NAP without broadening geography; preserve sentiment. ${FAQ_CONVERSATIONAL_RULE} ${PRIMARY_CITY_CONSISTENCY_RULE}`
            : `You are an SEO specialist who writes high-quality FAQ questions that match searcher intent and align with the business's service area and NAP (city/state, phone, etc.). You must localize questions to that area without broadening it and you must preserve the original sentiment of each question. ${FAQ_CONVERSATIONAL_RULE} ${PRIMARY_CITY_CONSISTENCY_RULE}`;
        const text = await runCompletion(systemPrompt, prompt);
        return text || null;
      } catch (err: any) {
        if (!skipLoadingState) {
          setError(err?.message || "AI FAQ optimization failed.");
        }
        return null;
      } finally {
        if (!skipLoadingState) {
          setLoading(false);
        }
      }
    },
    [runCompletion, napSummary, wordPressSite],
  );

  const optimizeFaqQuestion = useCallback(
    async (
      url: string,
      focusKeyword: string | undefined,
      currentQuestion: string,
      faqContext?: string,
      dfsSerpContext?: string,
      pageTitle?: string,
      pageMeta?: string,
      seoResearchBrief?: string,
      options?: { skipLoadingState?: boolean },
    ): Promise<string | null> => {
      const skipLoadingState = options?.skipLoadingState === true;
      if (!skipLoadingState) {
        setLoading(true);
        setError(null);
      }
      try {
        const briefTrimmed =
          typeof seoResearchBrief === "string" ? seoResearchBrief.trim() : "";
        const hasBrief = briefTrimmed.length > 0;
        const dfsForPrompt = hasBrief
          ? "(none - use JSON SEO content brief below)"
          : dfsSerpContext || "(none)";

        const localContextBlock = faqPrimaryLocalPromptBlock(wordPressSite, focusKeyword);

        const prompt = `${localContextBlock ? `${localContextBlock}\n\n` : ""}You are acting as a senior SEO strategist rewriting FAQ schema from scratch.

Rewrite this FAQ question from scratch with fresh wording so it is clearer, more specific, and better aligned with searcher intent for this page. Never return the Current question unchanged.

Rules
- Keep it as a single question sentence with completely new wording.
- Do NOT answer the question.
- Keep brand names and entities consistent with the page.
- Keep the sentiment (positive/neutral/negative) the same; do not soften or exaggerate it.
- Use the page context and NAP/location only to sharpen wording and geography.
- The question must not be a duplicate or trivial rephrase of other questions in the existing FAQ block.
- If several questions in the FAQ block begin with the same first 3 words (e.g. \"Where can I find\"), rewrite this question so it uses a different, more varied opening while preserving intent.
- Localize the geography to the business's primary service area; do NOT broaden it (e.g. if NAP is in Florida, do NOT say "United States and Canada").
${
  hasBrief
    ? `- A structured **JSON SEO content brief** is below. Use it as the primary signal for search intent. Do NOT paste JSON into your output.
`
    : ""
}
URL
${url}

Focus keyword (use exactly as shown when relevant)
${focusKeyword?.trim() || "(none)"}

Existing FAQ block (context only)
${faqContext || "(none)"}

Location & NAP context (for geography only; do NOT restate it verbatim)
${napSummary || "(none)"}

Page intent (use this to judge whether the question matches the page; if it does not, rewrite the question so it clearly serves this intent)
Title: ${pageTitle || "(none)"}
Meta: ${pageMeta || "(none)"}

${
  hasBrief
    ? `JSON SEO content brief (primary - organics, PAA, related, GSC; parse intent; do not copy verbatim)
${briefTrimmed.slice(0, 24000)}

`
    : ""
}DataForSEO SERP research context (filtered People Also Ask, organic results; use ONLY to understand search intent and what users are asking; do NOT copy text verbatim. If this is "(none)" or says to use the brief above, skip this block. If this context appears off-topic for the page intent, IGNORE it completely.)
${dfsForPrompt}

Current question (replace with fresh wording - do not return unchanged)
${currentQuestion}

Return only the rewritten question, no quotes or bullets.`;

        const systemPrompt = hasBrief
          ? `You are an SEO specialist who rewrites FAQ questions from scratch with fresh phrasing aligned with search intent. A structured JSON SEO content brief is provided - use it as the main signal. Preserve sentiment; localize geography to the NAP/service area without broadening it. ${PRIMARY_CITY_CONSISTENCY_RULE}`
          : `You are an SEO specialist who rewrites FAQ questions from scratch with fresh phrasing aligned with search intent and the site's local service area. Preserve original sentiment and only adjust geography to match the NAP/service area (never broaden it). ${PRIMARY_CITY_CONSISTENCY_RULE}`;
        const text = await runCompletion(systemPrompt, prompt);
        return text || null;
      } catch (err: any) {
        if (!skipLoadingState) {
          setError(err?.message || "AI FAQ question optimization failed.");
        }
        return null;
      } finally {
        if (!skipLoadingState) {
          setLoading(false);
        }
      }
    },
    [runCompletion, napSummary, wordPressSite],
  );

  const optimizeFaqAnswer = useCallback(
    async (
      url: string,
      focusKeyword: string | undefined,
      question: string,
      currentAnswer: string,
      faqContext?: string,
      dfsSerpContext?: string,
      pageTitle?: string,
      pageMeta?: string,
      seoResearchBrief?: string,
      options?: { skipLoadingState?: boolean },
    ): Promise<string | null> => {
      const skipLoadingState = options?.skipLoadingState === true;
      if (!skipLoadingState) {
        setLoading(true);
        setError(null);
      }
      try {
        const briefTrimmed =
          typeof seoResearchBrief === "string" ? seoResearchBrief.trim() : "";
        const hasBrief = briefTrimmed.length > 0;
        const dfsForPrompt = hasBrief
          ? "(none - use JSON SEO content brief below)"
          : dfsSerpContext || "(none)";

        const hasExistingAnswer = String(currentAnswer ?? "").trim().length > 0;
        const localContextBlock = faqPrimaryLocalPromptBlock(wordPressSite, focusKeyword);

        const prompt = `${localContextBlock ? `${localContextBlock}\n\n` : ""}You are acting as a senior SEO strategist writing FAQ answers for schema from scratch.

${hasExistingAnswer ? "Author a brand-new replacement for this FAQ answer from scratch with fresh sentence structure and wording (never return or synonym-swap the Current answer)." : "There is no existing answer - write a new, helpful FAQ answer from scratch using the page context, NAP/service area, and the question below."}

Rules
- Stay strictly on-topic for the question.
- 2-4 concise sentences max, freshly written from scratch.
- Do NOT mention brand names or site name unless already present.
- Use the page context and NAP/location to add missing but obviously helpful local details.
- Keep the sentiment (positive/neutral/negative) the same; do not over-hype or downplay compared to the original.
- Localize geography to the business's primary service area; do NOT broaden it beyond that region.
- Cost and install FAQ answers must name the primary service city from PRIMARY LOCAL CONTEXT only; do not cite other cities from SERP or brief snippets.
${
  hasBrief
    ? `- A structured **JSON SEO content brief** is below. Use it as the primary signal for what searchers care about. Do NOT paste JSON into your answer.
`
    : ""
}
URL
${url}

Focus keyword (use exactly as shown when relevant)
${focusKeyword?.trim() || "(none)"}

Existing FAQ block (context only)
${faqContext || "(none)"}

Location & NAP context (for geography only; do NOT restate it verbatim)
${napSummary || "(none)"}

Page intent (answers MUST stay aligned with this intent and provide genuinely helpful information for searchers on this topic)
Title: ${pageTitle || "(none)"}
Meta: ${pageMeta || "(none)"}

${
  hasBrief
    ? `JSON SEO content brief (primary - organics, PAA, related, GSC; parse intent; do not copy verbatim)
${briefTrimmed.slice(0, 24000)}

`
    : ""
}DataForSEO SERP research context (filtered People Also Ask, organic results; use ONLY to understand search intent and what users are asking; do NOT copy text verbatim. If this is "(none)" or says to use the brief above, skip this block. If this context appears off-topic for the page intent, IGNORE it completely.)
${dfsForPrompt}

Question
${question}

Current answer (replace completely with fresh sentences - do not copy or synonym-swap)
${currentAnswer}

Return only the newly written answer text, no quotes or bullets.`;

        const systemPrompt = hasBrief
          ? `You are an SEO specialist who writes clear, concise FAQ answers from scratch with fresh sentence structure. A structured JSON SEO content brief is provided - use it as the main signal for searcher intent while staying on-topic for the question. ${PRIMARY_CITY_CONSISTENCY_RULE}`
          : `You are an SEO specialist who writes clear, concise FAQ answers from scratch with fresh sentence structure that directly address the question using the page context. ${PRIMARY_CITY_CONSISTENCY_RULE}`;
        const text = await runCompletion(systemPrompt, prompt);
        return text || null;
      } catch (err: any) {
        if (!skipLoadingState) {
          setError(err?.message || "AI FAQ answer optimization failed.");
        }
        return null;
      } finally {
        if (!skipLoadingState) {
          setLoading(false);
        }
      }
    },
    [runCompletion, napSummary, wordPressSite],
  );

  const enhanceFocusKeywordFromGsc = useCallback(
    async (
      url: string,
      gscKeywordBasis: string,
      pageTitle?: string,
      pageMeta?: string,
    ): Promise<string | null> => {
      setFocusKeywordLoading(true);
      setError(null);
      try {
        const safeBasis = (gscKeywordBasis || "").trim();
        const safeTitle = (pageTitle || "").trim();
        const safeMeta = (pageMeta || "").trim();

        const prompt = `You are an SEO specialist optimizing a primary focus keyword.

TASK
Enhance the given GSC keyword into a better SEO / ACF focus keyword for this specific page.

INPUTS
URL: ${url}
Page title: ${safeTitle || "(none)"}
Page meta description: ${safeMeta || "(none)"}
GSC top query (basis): ${safeBasis || "(none)"}

RULES (strict)
- Output ONLY the enhanced focus keyword text. No quotes, no extra words, no punctuation wrappers.
- 2–5 words (never more than 5). If the query implies a comparison (vs, diy, alternative), keep both sides - do not collapse to a single generic head term.
- Remove/ignore all locations/geography (cities, states, countries, neighborhoods) from the output.
- Keep it tightly aligned to the page topic/intent implied by URL/title/meta.
- Do NOT include the brand name or the site name.
- Prefer keeping the core topic from the GSC basis keyword while making it cleaner.

Return only the keyword.`;

        const systemPrompt =
          "You are an expert SEO keyword copywriter. Output only the final keyword phrase.";
        const raw = await runCompletion(systemPrompt, prompt);
        const firstLine = (raw || "")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)[0];

        if (!firstLine) return null;

        const unquoted = firstLine.replace(/^["']+|["']+$/g, "").trim();
        const words = unquoted.split(/\s+/).filter(Boolean);
        const short = normalizeFocusKeywordPhrase(words.slice(0, 5).join(" ").trim() || unquoted);
        return short || null;
      } catch (err: any) {
        setError(err?.message || "AI focus keyword enhancement failed.");
        return null;
      } finally {
        setFocusKeywordLoading(false);
      }
    },
    [runCompletion],
  );

  const deriveFocusKeywordFromPageContext = useCallback(
    async (
      url: string,
      pageTitle?: string,
      pageMeta?: string,
      faq?: string,
      /** Plain text from main page body (e.g. WordPress post content); primary signal when set. */
      pageContentPlainText?: string,
      options?: { skipLoadingState?: boolean; seoResearchBrief?: string },
    ) => {
      const skipLoadingState = options?.skipLoadingState === true;
      if (!skipLoadingState) {
        setFocusKeywordLoading(true);
        setError(null);
      }
      try {
        const safeTitle = (pageTitle || "").trim();
        const safeMeta = (pageMeta || "").trim();
        const safeFaq = (faq || "").trim();
        const bodyTrimmed = (pageContentPlainText || "").trim();
        const hasBody = bodyTrimmed.length >= 80;
        const bodyForPrompt = hasBody ? bodyTrimmed.slice(0, 12000) : "";
        const briefTrimmed =
          typeof options?.seoResearchBrief === "string"
            ? options.seoResearchBrief.trim().slice(0, 24000)
            : "";
        const hasBrief = briefTrimmed.length > 0;
        const pathHint = pathSlugToFocusHint(url);
        const pathBlock =
          pathHint.length > 0
            ? `PRIMARY PAGE-PATH TOPIC (from the URL slug - anchor the keyword here; body/brief refine wording only)
${pathHint}

`
            : "";

        const prompt = `You are an expert SEO keyword copywriter.

TASK
Infer a **short-tail, intent-only** primary SEO / ACF focus keyword - the core topic for this URL.

${pathBlock}When PRIMARY PAGE-PATH TOPIC is present, the keyword **must** stay on that same subject (same page as the slug). Do **not** substitute a different service, city, or generic head term that would force the user to change the URL to match the SEO keyword.

INPUTS (read in this order)
${hasBrief ? `1) SEO research brief (JSON or text - refine wording only; must not override PRIMARY PAGE-PATH TOPIC when that block is present)\n${briefTrimmed}\n\n` : ""}${hasBrief ? "2" : "1"}) Full URL
${url}

${hasBrief ? "3" : "2"}) Page title: ${safeTitle || "(none)"}
${hasBrief ? "4" : "3"}) Page meta description: ${safeMeta || "(none)"}
${hasBrief ? "5" : "4"}) FAQ context (optional): ${safeFaq || "(none)"}
${
  hasBody
    ? `${hasBrief ? "6" : "5"}) PAGE CONTENT (plain text excerpt - confirm topic; still subordinate to PRIMARY PAGE-PATH TOPIC when present)
${bodyForPrompt}
`
    : ""
}

RULES (strict)
- Output ONLY the keyword text. No quotes, no labels, no explanation.
- **Length:** 2–5 words (never more than 5). One head term is not enough when the page compares options or answers "X vs Y" - then include both sides (e.g. "social media agency vs diy", "hiring vs diy marketing"). Use 2–3 words only for simple single-topic pages (e.g. "roller shades installation").
- **Comparisons:** If title, URL, or body signal **versus / vs / or / alternative / DIY** against another option, the keyword must reflect that split - do not reduce to only the first half (e.g. not just "social media agency" when the piece is agency vs DIY).
- **Intent over fluff:** Drop filler like "which", "path", "faster", "your", "brand", "grows" - keep words that carry intent (service, comparison target, diy, etc.).
- **Path alignment:** When PRIMARY PAGE-PATH TOPIC is present, express that topic in natural words (spaces only; use "vs" not hyphens). Do not ignore it in favor of unrelated GSC-style queries.
- Use **spaces between words only** - no hyphens, no underscores (use the word "vs" not a hyphen).
- Geography: omit cities/regions unless they clearly belong to this page's URL path or title; do not add location from body/brief alone if it contradicts PRIMARY PAGE-PATH TOPIC.
- Do NOT include brand names or site names.

Return only the keyword.`;

        const systemPrompt =
          "You output only the final short-tail keyword phrase, nothing else.";
        const raw = await runCompletion(systemPrompt, prompt);
        const firstLine = (raw || "")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)[0];
        if (!firstLine) return null;

        const unquoted = firstLine.replace(/^["']+|["']+$/g, "").trim();
        const words = unquoted.split(/\s+/).filter(Boolean);
        const short = normalizeFocusKeywordPhrase(words.slice(0, 5).join(" ").trim() || unquoted);
        return short || null;
      } catch (err: any) {
        if (!skipLoadingState) {
          setError(err?.message || "AI focus keyword derivation failed.");
        }
        return null;
      } finally {
        if (!skipLoadingState) {
          setFocusKeywordLoading(false);
        }
      }
    },
    [runCompletion],
  );

  const deriveEntityKeyword = useCallback(
    async (
      url: string,
      pageTitle?: string,
      pageMeta?: string,
      options?: { skipLoadingState?: boolean },
    ): Promise<string | null> => {
      const skipLoadingState = options?.skipLoadingState === true;
      if (!skipLoadingState) {
        setFocusKeywordLoading(true);
        setError(null);
      }
      try {
        const safeTitle = (pageTitle || "").trim();
        const safeMeta = (pageMeta || "").trim();

        const prompt = `You are a local SEO entity-optimization specialist.

TASK
Generate one local SEO / ACF focus keyword from the page URL, title, meta, and NAP.

INPUTS
URL: ${url}
Page title: ${safeTitle || "(none)"}
Page meta description: ${safeMeta || "(none)"}

Location & NAP context (primary source for city and state/province when ambiguous)
${napSummary || "(none)"}

FORMAT (pick one - never omit a sub-city place when the URL encodes it)
1) Service-area / neighborhood / district pages: when the URL slug or title encodes a named sub-city place (neighborhood, borough, district) distinct from the metro, you MUST include that place in the keyword. Typical shape: [service 1–2 words] [Neighborhood] [City] [2-letter province/state] - e.g. "SEO McCauley Edmonton AB", "Local SEO Garneau Edmonton AB". Do NOT collapse to metro-only when the URL names a specific area.
2) Single-city / no sub-city entity: [service 1–2 words] [city] [2-letter ST] - e.g. "Blinds Bushnell FL", "Window Shades Orlando FL".

RULES (strict)
- Output ONLY the keyword. No quotes, no extra text, no explanation.
- Derive the service/product from the URL slug, title, or meta – pick the most specific term for that page (e.g. "Roller Shades" not just "Window Treatments" if the page is about roller shades).
- Derive neighborhood/district from the URL path/slug first when present (e.g. .../edmonton-seo-mccauley-edmonton/ → McCauley + Edmonton). If the URL clearly identifies a sub-city entity, include it in the keyword; do not output only [service] + metro + ST for those pages.
- Do NOT reuse the same metro-only keyword for many different neighborhood URLs - each row should reflect its distinct place entity when the URL differs by neighborhood.
- ALWAYS end with the 2-letter state or province abbreviation (e.g. FL, AB, CA). Use NAP as the source of truth for region when a place name is ambiguous (e.g. Bellevue could be WA or AB - follow NAP, never guess a US state if NAP is Canada).
- Derive state/province from the URL only when unambiguous (e.g. -fl, -florida → FL); otherwise use NAP.
- Do NOT include zip, "near", "near me", or filler words.
- Do NOT include brand names or the site name.
- Title Case the service and place names; UPPERCASE the state/province abbreviation.
- Up to 6 words.

Return only the keyword.`;

        const systemPrompt =
          "You output only the final local keyword phrase (include neighborhood + city + ST when the URL encodes a sub-city entity; otherwise service + city + ST), nothing else.";
        const raw = await runCompletion(systemPrompt, prompt);
        const firstLine = (raw || "")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)[0];
        if (!firstLine) return null;

        const unquoted = firstLine.replace(/^["']+|["']+$/g, "").trim();
        const words = unquoted.split(/\s+/).filter(Boolean);
        const short = normalizeFocusKeywordPhrase(words.slice(0, 6).join(" ").trim() || unquoted);
        return short || null;
      } catch (err: any) {
        if (!skipLoadingState) {
          setError(err?.message || "AI entity keyword derivation failed.");
        }
        return null;
      } finally {
        if (!skipLoadingState) {
          setFocusKeywordLoading(false);
        }
      }
    },
    [runCompletion, napSummary],
  );

  const deriveShortTailFocusKeywordFromResearch = useCallback(
    async (brief: string, pageTitle: string, url: string): Promise<string | null> => {
      setFocusKeywordLoading(true);
      setError(null);
      try {
        const safeUrl = (url || "").trim() || "(none)";
        const safeTitle = (pageTitle || "").trim() || "(none)";
        const briefTrimmed = (brief || "").trim().slice(0, 24000);
        const pathHint = pathSlugToFocusHint(url);
        const pathBlock =
          pathHint.length > 0
            ? `PRIMARY PAGE-PATH TOPIC (from the URL slug - the keyword MUST stay on this subject)
${pathHint}

`
            : "";

        const prompt = `You are an expert SEO keyword copywriter.

TASK
Infer a short-tail (head) primary SEO / ACF focus keyword.

${pathBlock}When PRIMARY PAGE-PATH TOPIC is shown above, that topic is the **anchor**: the keyword must describe the same page as that slug (polish wording; 2–5 words). Do **not** replace it with a different service, city, or generic head term pulled from the SEO brief (e.g. a blog post whose path is about seasonal decluttering must not become an unrelated "city + junk removal" keyword).

INPUTS (use in this order)

1) SEO research brief - refine intent and wording only; it must **not** override PRIMARY PAGE-PATH TOPIC when that block is present
${briefTrimmed || "(none)"}

2) Current page title
${safeTitle}

3) Full page URL
${safeUrl}

RULES (strict)
- Output ONLY the keyword text. No quotes, no labels, no explanation.
- Short-tail: 2–5 words (never more than 5). If the page compares two approaches (vs, DIY, alternative, or), include both sides in the keyword - not just one half.
- Do NOT include brand names or site names.
- Do not paste competitor titles, meta, or PAA text verbatim - synthesize one concise phrase.
- Geography: omit cities/regions **unless** they clearly belong to this page's URL path or title for this URL; never add a metro or service area from the brief alone when it would contradict PRIMARY PAGE-PATH TOPIC.

Return only the keyword.`;

        const systemPrompt =
          "You output only the final short-tail keyword phrase, nothing else.";
        const raw = await runCompletion(systemPrompt, prompt);
        const firstLine = (raw || "")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)[0];
        if (!firstLine) return null;

        const unquoted = firstLine.replace(/^["']+|["']+$/g, "").trim();
        const words = unquoted.split(/\s+/).filter(Boolean);
        const short = normalizeFocusKeywordPhrase(words.slice(0, 5).join(" ").trim() || unquoted);
        return short || null;
      } catch (err: any) {
        setError(err?.message || "AI short-tail focus keyword failed.");
        return null;
      } finally {
        setFocusKeywordLoading(false);
      }
    },
    [runCompletion],
  );

  const buildSemrushAuditFixChecklist = useCallback(
    async (pageUrl: string, auditContext: string): Promise<string | null> => {
      setAuditChecklistLoading(true);
      setError(null);
      try {
        const safeUrl = (pageUrl || "").trim() || "(unknown)";
        const ctx = (auditContext || "").trim();
        if (!ctx) {
          throw new Error("No audit data to analyze.");
        }

        const userPrompt = `You are given Semrush Site Audit JSON for a single page (compact extract). The data may be truncated at the end with the marker [TRUNCATED].

Page URL (context only)
${safeUrl}

Audit JSON (only source of truth - do not invent problems)
${ctx}

TASK
Produce a markdown checklist ONLY for on-page **content and copy** issues that a content editor could fix (title, meta, body text, headings, readability, keyword use in copy). Examples of IN-SCOPE issues when they appear in the JSON: thin or low word count, title tag too long or too short, meta description too long or too short or missing, H1 missing/wrong/multiple, heading structure problems, duplicate or weak title/description, readability, keyword stuffing or cannibalization called out in copy checks, thin main content, missing or poor alt text on content images (copy/UX), low text-to-HTML ratio when framed as content bloat.

STRICTLY OMIT (do not list, do not mention) issues that are primarily technical, server, crawl, or infrastructure, for example: SSL/certificate, DNS, redirects/redirect chains as infra, broken links to other sites, 4xx/5xx unless the fix is purely "add content on this URL", robots.txt, sitemap, canonical configuration, page speed/Core Web Vitals, structured data markup errors, hreflang, AMP, mixed content, security headers, crawl budget, orphan pages unless the fix is "add internal links in body copy" (only then you may mention adding contextual links in content).

Rules:
- Use ONLY checks present in the JSON. If nothing in-scope appears, reply in one short paragraph that no content-fixable audit items were found (or only out-of-scope items were present).
- One checklist item per distinct in-scope issue (merge duplicates).
- Each item: what is wrong + concrete content/editor steps. When the JSON includes an issue id, code, check name, or title, mention it briefly.
- Do NOT use SERP, GSC, focus keywords, or FAQ - audit JSON and page URL only.
- Output valid markdown (numbered list or ### + bullets). No preamble like "Here is the checklist".`;

        const systemPrompt =
          "You are an SEO content editor. You output markdown checklists grounded strictly in the Semrush Site Audit JSON, limited to on-page content and copy fixes only. You never invent findings and you skip technical or infrastructure issues.";
        const text = await runCompletion(systemPrompt, userPrompt);
        return text?.trim() || null;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message || "Audit checklist generation failed.");
        return null;
      } finally {
        setAuditChecklistLoading(false);
      }
    },
    [runCompletion],
  );

  const deriveFocusKeywordsFromPageContextBatch = useCallback(
    async (catalog: OverviewKeywordCatalogRow[]): Promise<Map<string, string>> => {
      const resolvedKey = apiKey?.trim() || (await resolveOpenRouterApiKeyForHarness());
      return runContentKeywordsBatch(catalog, {
        apiKey: resolvedKey,
        model: resolveMetaModel(),
        siteId: wordPressSiteId,
        napSummary,
      });
    },
    [apiKey, resolveMetaModel, wordPressSiteId, napSummary],
  );

  const deriveEntityKeywordsBatch = useCallback(
    async (catalog: OverviewKeywordCatalogRow[]): Promise<Map<string, string>> => {
      const resolvedKey = apiKey?.trim() || (await resolveOpenRouterApiKeyForHarness());
      return runEntityKeywordsBatch(catalog, {
        apiKey: resolvedKey,
        model: resolveMetaModel(),
        siteId: wordPressSiteId,
        napSummary,
      });
    },
    [apiKey, resolveMetaModel, wordPressSiteId, napSummary],
  );

  const runAiAllMetaBatchForCatalog = useCallback(
    async (catalog: AiAllMetaCatalogRow[]): Promise<Map<string, AiAllMetaRowPatch>> => {
      const resolvedKey = apiKey?.trim() || (await resolveOpenRouterApiKeyForHarness());
      return runAiAllMetaBatch(catalog, {
        apiKey: resolvedKey,
        model: resolveMetaModel(),
        siteId: wordPressSiteId,
        napSummary,
      });
    },
    [apiKey, resolveMetaModel, wordPressSiteId, napSummary],
  );

  return {
    loading,
    focusKeywordLoading,
    auditChecklistLoading,
    error,
    optimizeTitle,
    optimizeMeta,
    optimizeFaq,
    optimizeFaqQuestion,
    optimizeFaqAnswer,
    enhanceFocusKeywordFromGsc,
    deriveFocusKeywordFromPageContext,
    deriveEntityKeyword,
    deriveFocusKeywordsFromPageContextBatch,
    deriveEntityKeywordsBatch,
    runAiAllMetaBatchForCatalog,
    deriveShortTailFocusKeywordFromResearch,
    buildSemrushAuditFixChecklist,
  };
}

