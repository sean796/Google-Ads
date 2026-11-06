/**
 * Criteria Validation Module
 * Validates entities against specific criteria using Wikipedia data
 */

import { extractStructuredDataFromWikipedia } from "@/lib/wikipedia-api";
import type { ValidationResult } from "../types";

/**
 * Validates if an entity matches criteria by extracting data from Wikipedia
 */
export async function validateEntityByCriteria(
  entity: string,
  criteria: string,
  openRouterApiKey: string
): Promise<ValidationResult> {
  try {
    const result = await extractStructuredDataFromWikipedia(entity, criteria, openRouterApiKey);
    const extracted = result.extractedData;
    return {
      matches: Boolean(result.matches),
      confidence: typeof result.confidence === "number" ? result.confidence : 0,
      extractedData:
        extracted && typeof extracted === "object" && !Array.isArray(extracted)
          ? (extracted as Record<string, unknown>)
          : {},
      rankingValue: typeof result.rankingValue === "number" ? result.rankingValue : undefined
    };
  } catch (error) {
    console.warn(`[Entity Generation] Error validating entity "${entity}" by criteria:`, error);
    return {
      matches: false,
      confidence: 0,
      extractedData: {},
      rankingValue: 0
    };
  }
}
