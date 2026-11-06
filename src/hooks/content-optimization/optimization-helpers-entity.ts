import { logger } from "@/lib/logger";
import { type WordPressSite } from "@/components/integrations/types";
import {
  extractGeographicEntityWithAI,
} from "@/lib/content-optimization-helpers";
import type { GeographicSiteContext } from "@/lib/content-optimization/entity";
import type { GscResultLike } from "@/hooks/content-optimization/use-optimization-state";

// ============================================================================
// Entity Extraction Helpers
// ============================================================================

function buildSiteContext(site?: WordPressSite | null): GeographicSiteContext | undefined {
  if (!site) return undefined;
  const locsSource = site.locations || site.napInfo?.locations || [];
  const locations =
    Array.isArray(locsSource) && locsSource.length > 0
      ? locsSource
          .map((l) => ({
            city: l.city,
            state: l.state,
          }))
          .filter((l) => !!(l.city || l.state))
      : undefined;

  return {
    siteUrl: site.siteUrl,
    siteName: site.name,
    locations,
    napAddress: site.napInfo?.address,
  };
}

export async function extractEntityFromTitle(
  title: string,
  apiKey: string,
  site?: WordPressSite | null
): Promise<string | "N/A"> {
  if (!title || !title.trim()) return "N/A";
  try {
    const origin = await extractGeographicEntityWithAI({ title }, apiKey, buildSiteContext(site));
    return origin && origin.trim() ? origin.trim() : "N/A";
  } catch (error) {
    logger.warn("[Entity Extraction] Error extracting from title:", error);
    return "N/A";
  }
}

export async function extractEntityFromUrl(
  url: string,
  title?: string,
  site?: WordPressSite | null
): Promise<string | "N/A"> {
  if (!url) return "N/A";
  try {
    const origin = await extractGeographicEntityWithAI({ url, title }, undefined, buildSiteContext(site));
    return origin && origin.trim() ? origin.trim() : "N/A";
  } catch (error) {
    logger.warn("[Entity Extraction] Error extracting from URL:", error);
    return "N/A";
  }
}

export async function determineEntity(
  hasEntityOverride: boolean | undefined,
  title: string,
  url: string,
  apiKey: string,
  site?: WordPressSite | null
): Promise<{ entity: string | "N/A"; cleanedTitle: string }> {
  let extractedEntity: string | "N/A" = "N/A";
  const finalTitle = title;

  if (hasEntityOverride === false) {
    return { entity: "N/A", cleanedTitle: finalTitle };
  }

  try {
    const origin = await extractGeographicEntityWithAI({ title, url }, apiKey, buildSiteContext(site));
    extractedEntity = origin && origin.trim() ? origin.trim() : "N/A";
  } catch (error) {
    logger.warn("[Entity Extraction] Error during extraction:", error);
    extractedEntity = "N/A";
  }

  return { entity: extractedEntity, cleanedTitle: finalTitle };
}

// ============================================================================
// GSC Data Helpers
// ============================================================================

export function validateGSCData(gscResult: GscResultLike): {
  hasValidData: boolean;
  primaryKeyword: string | null;
  isNoQueriesError: boolean;
} {
  const isNoQueriesError =
    typeof gscResult.error === "string" &&
    gscResult.error.toLowerCase().includes("no valid search queries found");

  let hasValidGSCData = false;
  let primaryKeywordFromGSC: string | null = null;

  const topQuery =
    typeof gscResult.topKeyword?.query === "string" ? gscResult.topKeyword.query : "";
  if (gscResult.success && gscResult.topKeyword) {
    if (topQuery !== "Page-level aggregate" && topQuery.trim().length > 0) {
      if (gscResult.queries && Array.isArray(gscResult.queries) && gscResult.queries.length > 0) {
        const keywordExists = gscResult.queries.some((q) => q.query === topQuery);
        if (keywordExists) {
          hasValidGSCData = true;
          primaryKeywordFromGSC = topQuery.trim();
        }
      }
    }
  }

  if (isNoQueriesError) {
    hasValidGSCData = false;
  }

  return {
    hasValidData: hasValidGSCData,
    primaryKeyword: primaryKeywordFromGSC,
    isNoQueriesError,
  };
}
