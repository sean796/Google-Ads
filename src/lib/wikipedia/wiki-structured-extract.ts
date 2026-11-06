import { getResearchModel } from "../optimization-settings-storage";
import { fetchWikipediaContent } from "./wiki-fetch-content";
import { logger } from "@/lib/logger";

/**
 * Extracts structured data from Wikipedia content using AI based on criteria
 */
export async function extractStructuredDataFromWikipedia(
  entity: string,
  criteria: string,
  openRouterApiKey: string
): Promise<Record<string, unknown>> {
  try {
    const chunks = await fetchWikipediaContent(entity);
    const fullContent = chunks.map((chunk) => chunk.text).join("\n\n").substring(0, 8000);

    const extractionPrompt = `Extract relevant structured data from this Wikipedia content about "${entity}" based on the criteria: "${criteria}"

Wikipedia content:
${fullContent}

Criteria: "${criteria}"

IMPORTANT: Extract whatever data is available, even if incomplete. If specific data isn't found, make reasonable inferences based on available information (e.g., if a neighborhood is mentioned as affluent/upscale, infer higher income).

Extract the following types of data based on the criteria:
- If criteria mentions income/wealth: extract median income, household income, per capita income, economic indicators, or infer from descriptions (e.g., "affluent", "upscale", "wealthy" = high income)
- If criteria mentions location/direction (north, south, east, west): extract geographic location, coordinates, region, or infer from context
- If criteria mentions size: extract population, area, size metrics
- If criteria mentions demographics: extract demographic data, age distribution, education levels
- If criteria mentions other attributes: extract relevant statistics and data points, or infer from descriptions

For "matches": 
- Return true if the entity could reasonably match the criteria based on available data or context
- Return false only if there's strong evidence it doesn't match (e.g., explicitly says "low income" when looking for "high income")
- If data is unavailable but context suggests it might match, return true with lower confidence

Return a JSON object with:
{
  "matches": true/false (true if entity could match criteria, false only if strong evidence it doesn't),
  "confidence": 0-100 (confidence score based on data quality and specificity),
  "extractedData": {
    // Key-value pairs of extracted data (e.g., "medianIncome": 75000, "location": "south", "population": 50000, "description": "affluent neighborhood")
  },
  "rankingValue": number (numeric value for sorting - use extracted value if available, or estimate based on context)
}

Return ONLY valid JSON, no explanations.`;

    const { streamChatCompletion } = await import("../api");

    let extractionResponse = "";
    await streamChatCompletion({
      apiKey: openRouterApiKey,
      model: getResearchModel(),
      messages: [
        {
          role: "system",
          content:
            "You are a data extraction expert. Extract structured data from Wikipedia content based on specific criteria. Return only valid JSON objects.",
        },
        {
          role: "user",
          content: extractionPrompt,
        },
      ],
      temperature: 0.3,
      maxTokens: 2000,
      topP: 0.9,
      onContentChunk: (chunk) => {
        extractionResponse += chunk;
      },
    });

    extractionResponse = extractionResponse.trim();
    extractionResponse = extractionResponse
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    try {
      const extractedData = JSON.parse(extractionResponse) as Record<string, unknown>;
      return extractedData;
    } catch (parseError) {
      logger.warn(`[Wikipedia API] Failed to parse extraction response for "${entity}":`, parseError);
      return {
        matches: false,
        confidence: 0,
        extractedData: {},
        rankingValue: 0,
      };
    }
  } catch (error) {
    logger.warn(`[Wikipedia API] Error extracting structured data for "${entity}":`, error);
    return {
      matches: false,
      confidence: 0,
      extractedData: {},
      rankingValue: 0,
    };
  }
}
