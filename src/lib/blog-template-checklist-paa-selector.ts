import { loadApiKey } from "./api";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";
import type { PeopleAlsoAsk } from "./keyword-types";
import { getResearchModel } from "./optimization-settings-storage";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { logger } from "@/lib/logger";

export interface BlogTemplateChecklistPaaOptions {
  selectedPeopleAlsoAsk?: string[];
  peopleAlsoAskItems?: PeopleAlsoAsk[];
  serpData?: unknown;
  entity?: string;
  connectedSite?: { name: string; siteUrl: string };
  currentPageUrl?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export async function selectBestPAAQuestionsWithAI(
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
      logger.warn('[PAA Selection] AI analysis failed, using fallback selection');
      return allPaaQuestions.slice(0, 10);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      if (strict) {
        throw new Error("[PAA Selection] No content in AI response");
      }
      logger.warn('[PAA Selection] No content in AI response, using fallback selection');
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
      logger.warn('[PAA Selection] Failed to parse AI response, trying to extract array from text:', parseError);
      // Fallback: try to extract JSON array from text
      const jsonMatch = content.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        try {
          selectedQuestions = JSON.parse(jsonMatch[0]);
        } catch {
          if (strict) {
            throw new Error("[PAA Selection] Could not parse extracted JSON from AI response");
          }
          logger.warn('[PAA Selection] Could not parse extracted JSON, using fallback selection');
          return allPaaQuestions.slice(0, 10);
        }
      } else {
        if (strict) {
          throw new Error("[PAA Selection] No JSON array found in AI response");
        }
        logger.warn('[PAA Selection] No JSON array found in response, using fallback selection');
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
    logger.warn('[PAA Selection] Error during AI analysis, using fallback selection:', error);
    return allPaaQuestions.slice(0, 10);
  }
}


export async function resolveBlogTemplateChecklistPaaQuestions(args: {
  options: BlogTemplateChecklistPaaOptions;
  checklistKeyword: string;
  title: string;
}): Promise<Array<{ question: string; answer?: string; url?: string }>> {
  const { options, checklistKeyword, title } = args;
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
    const allPaaQuestions = deduped
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
          checklistKeyword,
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
  return paaQuestions;
}
