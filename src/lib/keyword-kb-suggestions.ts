import { streamChatCompletion } from "./api";
import { getResearchModel } from "./optimization-settings-storage";
import { buildKBKeywordSuggestionPrompt } from "./prompt-builders-keyword";
import { logger } from "@/lib/logger";

export interface KBKeywordSuggestion {
  keyword: string;
  reasoning: string;
}

export interface SuggestKeywordsFromKBOptions {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

/**
 * Suggests keywords from knowledge base content using AI
 */
export async function suggestKeywordsFromKnowledgeBase(
  knowledgeBaseContent: string,
  options: SuggestKeywordsFromKBOptions
): Promise<KBKeywordSuggestion[]> {
  const {
    apiKey,
    model = getResearchModel(),
    temperature = 1.0,
    maxTokens = 4000,
    topP = 0.9,
  } = options;

  if (!apiKey || !apiKey.trim()) {
    throw new Error("OpenRouter API key is required for keyword suggestions");
  }

  if (!knowledgeBaseContent || !knowledgeBaseContent.trim()) {
    throw new Error("Knowledge base content is required");
  }

  const systemPrompt = `You are an expert SEO keyword researcher specializing in extracting valuable keywords from content. Your role is to analyze knowledge base content and identify the most relevant SEO keywords.

Always respond with valid JSON in the exact format specified. Do not include markdown code blocks, explanations, or any text outside the JSON structure.`;

  const userPrompt = buildKBKeywordSuggestionPrompt(knowledgeBaseContent);

  let fullResponse = "";

  try {
    await streamChatCompletion({
      apiKey,
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      maxTokens,
      topP,
      onContentChunk: (chunk) => {
        fullResponse += chunk;
      },
    });

    // Clean the response - remove markdown code blocks if present
    let cleanedResponse = fullResponse.trim();
    if (cleanedResponse.startsWith("```json")) {
      cleanedResponse = cleanedResponse.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (cleanedResponse.startsWith("```")) {
      cleanedResponse = cleanedResponse.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    // Parse JSON response
    const parsed = JSON.parse(cleanedResponse) as { keywords: KBKeywordSuggestion[] };

    // Validate and ensure we have keywords
    if (!parsed.keywords || !Array.isArray(parsed.keywords)) {
      throw new Error("Invalid response format: keywords array not found");
    }

    // Ensure we have exactly 10 keywords (or at least some)
    const keywords = parsed.keywords
      .filter((kw) => kw && kw.keyword && kw.keyword.trim().length > 0)
      .slice(0, 10); // Take up to 10

    if (keywords.length === 0) {
      throw new Error("No valid keywords found in response");
    }

    return keywords;
  } catch (error) {
    logger.error("Error in KB keyword suggestion:", error);
    throw new Error(
      `Failed to suggest keywords: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

