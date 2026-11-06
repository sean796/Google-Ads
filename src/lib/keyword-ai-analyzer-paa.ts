import { streamChatCompletion } from "./api";
import type { PeopleAlsoAsk } from "./keyword-types";
import { extractPeopleAlsoAskFromSerp } from "./paa-extractor";
import { getResearchModel } from "./optimization-settings-storage";

/**
 * Extract People Also Ask questions from SERP data using AI
 * Prints raw SERP data and raw AI response separately before processing
 */
interface SerpTaskForPaa {
  result?: Array<{ items?: unknown[] }>;
}

interface RawPaaQuestion {
  question?: string;
  title?: string;
  text?: string;
  answer?: string;
  description?: string;
  snippet?: string;
  url?: string;
  link?: string;
  domain?: string;
}

export async function extractPeopleAlsoAskWithAI(
  serpData: unknown,
  options: {
    apiKey: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  }
): Promise<{ rawResponse: string; questions: PeopleAlsoAsk[] }> {
  const serp: { serp_error?: unknown; tasks?: SerpTaskForPaa[] } =
    serpData && typeof serpData === "object"
      ? (serpData as { serp_error?: unknown; tasks?: SerpTaskForPaa[] })
      : {};
  // If SERP data is absent, errored, or has zero tasks/items, immediately return empty in 0ms
  if (
    !serpData ||
    serp.serp_error ||
    !Array.isArray(serp.tasks) ||
    serp.tasks.length === 0
  ) {
    return { rawResponse: '', questions: [] };
  }

  // 1. Fast direct JSON extraction (0ms single pass, no LLM required)
  const direct = extractPeopleAlsoAskFromSerp(serpData);
  if (direct.items.length > 0) {
    return { rawResponse: '', questions: direct.items };
  }

  // If no items exist in tasks, or no API key, move on immediately without calling LLM
  const hasItems = serp.tasks?.some((t) =>
    Array.isArray(t?.result) && t.result.some((r) => Array.isArray(r?.items) && r.items.length > 0)
  );
  if (!hasItems || !options.apiKey?.trim()) {
    return { rawResponse: '', questions: [] };
  }

  // 2. Single AI pass only if SERP had items but direct parser found 0 PAA
  const systemPrompt = `You are an expert at extracting "People Also Ask" questions from SERP JSON data. Return ONLY a JSON array with questions found. If none found, return []. No markdown, no explanations.`;
  const itemsSample = serp.tasks?.[0]?.result?.[0]?.items?.slice(0, 15) ?? serpData;
  const userPrompt = `Extract People Also Ask questions from this SERP JSON:\n${JSON.stringify(itemsSample, null, 2)}\nReturn format: [{"question": "...", "answer": "...", "url": "..."}]`;

  let fullResponse = "";
  try {
    await streamChatCompletion({
      apiKey: options.apiKey,
      model: options.model || getResearchModel(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      maxTokens: Math.min(options.maxTokens || 1000, 2000),
      topP: options.topP || 0.9,
      onContentChunk: (chunk) => {
        fullResponse += chunk;
      },
    });

    let cleanedResponse = fullResponse.trim();
    if (cleanedResponse.startsWith("```json")) {
      cleanedResponse = cleanedResponse.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (cleanedResponse.startsWith("```")) {
      cleanedResponse = cleanedResponse.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    const parsed: unknown = JSON.parse(cleanedResponse);
    if (Array.isArray(parsed)) {
      const questions = parsed.map((item) => {
        const raw = (item && typeof item === "object" ? item : {}) as RawPaaQuestion;
        return {
          question: raw.question || raw.title || raw.text || '',
          answer: raw.answer || raw.description || raw.snippet || undefined,
          url: raw.url || raw.link || undefined,
          domain: raw.domain || (raw.url ? new URL(raw.url).hostname : undefined),
        };
      }).filter((item: PeopleAlsoAsk) => item.question && item.question.trim().length > 0);
      return { rawResponse: fullResponse, questions };
    }
    return { rawResponse: fullResponse, questions: [] };
  } catch {
    // If extraction errors: single pass is done, move on immediately with zero retries/fallbacks
    return { rawResponse: '', questions: [] };
  }
}
