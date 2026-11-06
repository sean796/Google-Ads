import { logger } from "@/lib/logger";
import { streamChatCompletion } from "./api";
import type { KeywordData } from "./keyword-types";
import { getResearchModel } from "./optimization-settings-storage";
import { truncateTitleForSEO } from "./content-generation/content-sanitizer";
import { TITLE_ANTI_CLICKBAIT_RULE, TITLE_KEYWORD_WEAVING_RULE, TITLE_CASE_RULE, TITLE_WELL_KNOWN_ACRONYMS_RULE, UNIFIED_COPY_FORMATTING_RULE } from "./prompt-builders";

export interface GenerateTitleOptionsParams {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  entity?: string; // Optional entity for content optimization
}

/**
 * Generates 3-5 SEO-friendly title options based on keyword data and selected H2 sections
 */
export async function generateTitleOptions(
  keywordData: KeywordData,
  selectedH2Sections: string[],
  options: GenerateTitleOptionsParams
): Promise<string[]> {
  const {
    apiKey,
    model = getResearchModel(),
    temperature = 1.0,
    maxTokens = 2000,
    topP = 0.9,
  } = options;

  const h2Context = selectedH2Sections.length > 0
    ? `\nSelected H2 Sections to cover:\n${selectedH2Sections.map((h2, idx) => `${idx + 1}. ${h2}`).join("\n")}`
    : "";

  const entityContext = options.entity && options.entity.trim()
    ? `\n--- Entity Optimization Context ---
Target Entity: ${options.entity.trim()}

Pair the service keyword with the entity the way a person would naturally search (e.g. "Blinds & Shades Near Ben Hill Atlanta" or "Blinds & Shades in Ben Hill Atlanta"). Keyword = service/product only; do not force the word "near" when another phrasing reads better. Never place entity before the service keyword.
${TITLE_KEYWORD_WEAVING_RULE}`
    : `\n--- NO Entity / Regular Blog Post ---
CRITICAL: This is a REGULAR BLOG POST with NO entity/location targeting.

ABSOLUTELY FORBIDDEN:
- Do NOT include any city names, location names, geographic references, or place names in the titles
- Do NOT use placeholders like [city], [location], [area], or any bracket notation
- Do NOT add phrases like "in [city]", "near [location]", or similar location-based patterns
- Generate general, non-location-specific titles that are applicable broadly

The titles should be general informational content suitable for any location, with NO geographic targeting.`;

  const systemPrompt = `You are a senior SEO content title specialist. Generate 3-5 accurate, neutral, SEO-friendly blog title options for the given keyword.

Keyword Context:
- Primary Keyword: ${keywordData.keyword}
- Search Volume: ${keywordData.searchVolume?.toLocaleString() || "N/A"}
- Difficulty: ${keywordData.difficulty || "N/A"}/100
- Intent: ${keywordData.intent || "N/A"}
${h2Context}${entityContext}

Title Requirements:
- Each title at most 60 characters. The system truncates longer titles at a word boundary, so put the primary keyword first. Do not count characters.
- ${TITLE_CASE_RULE}
- ${UNIFIED_COPY_FORMATTING_RULE}
- Include the primary keyword naturally (same words and order; Title Case)
- ${TITLE_ANTI_CLICKBAIT_RULE}
- Vary the title structures while keeping each one factual, calm, and descriptive
- Ensure titles accurately reflect the content based on the H2 sections - but keep them concise
- ${TITLE_KEYWORD_WEAVING_RULE}
- ${TITLE_WELL_KNOWN_ACRONYMS_RULE}
- **EXAMPLES OF CORRECT LENGTH**:
  ✅ "Window Treatment Types Explained" (32 chars)
  ✅ "How To Choose Window Shades" (28 chars)
  ✅ "Motorized Blinds Features And Costs" (35 chars)
- **EXAMPLES OF TOO LONG (DO NOT GENERATE)**:
  ❌ "The Ultimate Guide to Hurricane-Proof Window Coverings in Florida: Costs, Benefits & Options" (88 chars - TOO LONG)
  ❌ "Top-Down/Bottom-Up Shades: Privacy, Light Control, Materials, Costs, And Installation" (84 chars - TOO LONG)

Output Format:
Return ONLY a JSON array of title strings, like:
["Title Option 1", "Title Option 2", "Title Option 3", "Title Option 4", "Title Option 5"]

Do not include any explanations, markdown formatting, or additional text. Only the JSON array.`;

  const userPrompt = `Generate 3-5 SEO-optimized blog title options for the keyword "${keywordData.keyword}". Make each title structurally distinct, neutral, and naturally written.`;

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
    const parsed = JSON.parse(cleanedResponse);
    
    // Ensure it's an array and return titles
    if (Array.isArray(parsed)) {
      // CRITICAL: Enforce 50 character limit for Content Optimizer module (optimized content)
      const filteredTitles = parsed.filter((title: unknown): title is string => typeof title === "string" && title.trim().length > 0);
      return filteredTitles.map((title) => {
        const truncated = truncateTitleForSEO(title);
        return truncated;
      });
    }

    // Fallback: try to extract titles from text if JSON parsing failed
    const lines = cleanedResponse.split("\n");
    const titles: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      // Match numbered list items or quoted strings
      const match = trimmed.match(/^(?:\d+\.\s*)?["']?([^"'\n]{20,80})["']?[,;]?$/);
      if (match && match[1]) {
        titles.push(match[1].trim());
      }
    }

    const finalTitles = titles.length > 0 ? titles.slice(0, 5) : [keywordData.keyword];
    // CRITICAL: Enforce 50 character limit for Content Optimizer module (optimized content)
    return finalTitles.map((title: string) => {
      const truncated = truncateTitleForSEO(title);
      return truncated;
    });
  } catch (error) {
    logger.error("Error generating title options:", error);
    // Fallback: return a simple title based on keyword (truncated to 50 chars)
    const fallbackTitles = [`Complete Guide to ${keywordData.keyword}`, `How to ${keywordData.keyword}`, `Everything You Need to Know About ${keywordData.keyword}`];
    return fallbackTitles.map(title => truncateTitleForSEO(title));
  }
}
