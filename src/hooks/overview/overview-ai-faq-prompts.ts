import type { Dispatch, SetStateAction } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import { formatPageLocalContextPromptBlock, resolvePageLocalContext } from "@/lib/content-optimization/page-local-context";
import { PRIMARY_CITY_CONSISTENCY_RULE } from "@/lib/content-optimization/first-party-authority-prompt";
import { FAQ_CONVERSATIONAL_RULE } from "@/lib/content-generation/faq-heading-policy";

export type OverviewFaqRunCompletion = (
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
  maxTokensOverride?: number,
) => Promise<string>;

export type OverviewFaqPromptDeps = {
  runCompletion: OverviewFaqRunCompletion;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  napSummary?: string;
  wordPressSite?: WordPressSite | null;
};

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

export function createOverviewFaqOptimizer(deps: OverviewFaqPromptDeps) {
  const { runCompletion, setLoading, setError, napSummary, wordPressSite } = deps;
  return async (
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
- Vary the structure and angle of questions (mix "what", "how", "why", "can", "do I need", "which", "should", etc.).
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
      } catch (err) {
        if (!skipLoadingState) {
          setError(err instanceof Error ? err.message : "AI FAQ optimization failed.");
        }
        return null;
      } finally {
        if (!skipLoadingState) {
          setLoading(false);
        }
      }
    }
}

export function createOverviewFaqQuestionOptimizer(deps: OverviewFaqPromptDeps) {
  const { runCompletion, setLoading, setError, napSummary, wordPressSite } = deps;
  return async (
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
- If several questions in the FAQ block begin with the same first 3 words (e.g. "Where can I find"), rewrite this question so it uses a different, more varied opening while preserving intent.
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
      } catch (err) {
        if (!skipLoadingState) {
          setError(err instanceof Error ? err.message : "AI FAQ question optimization failed.");
        }
        return null;
      } finally {
        if (!skipLoadingState) {
          setLoading(false);
        }
      }
    }
}

export function createOverviewFaqAnswerOptimizer(deps: OverviewFaqPromptDeps) {
  const { runCompletion, setLoading, setError, napSummary, wordPressSite } = deps;
  return async (
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
      } catch (err) {
        if (!skipLoadingState) {
          setError(err instanceof Error ? err.message : "AI FAQ answer optimization failed.");
        }
        return null;
      } finally {
        if (!skipLoadingState) {
          setLoading(false);
        }
      }
    }
}
