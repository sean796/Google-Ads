/**
 * Agentic Report Planner
 * AI-driven report section planning based on available data
 */

import { logger } from "@/lib/logger";
import { streamChatCompletion } from "./api";
import { getResearchModel } from "./optimization-settings-storage";
import type { ReportDiscoveryData } from "./report-discovery";

export const AGENCY_NAME = "Neo Digital Inc";

export type ReportFocus =
  | "local-seo"
  | "content-growth"
  | "brand-visibility"
  | "mixed";

export interface ReportPlanSection {
  id: string;
  title: string;
  priority: number;
  rationale: string;
  dataSource: "gsc" | "entity" | "wordpress" | "combined";
  includeEntitySitemapSection: boolean;
}

export interface ReportPlan {
  focus: ReportFocus;
  sections: ReportPlanSection[];
  insightsToHighlight: string[];
  keywordFocus: string[];
}

/**
 * Use AI to plan report sections based on discovery data.
 * Decides what a business owner would want to see.
 */
export async function planReport(
  discoveryData: ReportDiscoveryData,
  apiKey: string,
  model: string = getResearchModel()
): Promise<ReportPlan> {
  const wp = discoveryData.wordPressContext;
  const stats = discoveryData.stats;
  const hasEntityData =
    discoveryData.entityPagesData &&
    discoveryData.entityPagesData.pages?.length > 0;
  const hasEntitySitemap = !!wp.entitySitemapUrl && wp.entitySitemapCount > 0;
  const hasHistorical = !!discoveryData.historicalData?.dateRange?.monthsOfData;
  const hasNAP = !!wp.napInfo?.name || wp.locationsCount > 0;

  const systemPrompt = `You are a senior strategist at ${AGENCY_NAME} preparing an SEO performance report for a business owner. Your job is to decide what sections to include in the report based on the available data.

AUDIENCE: Non-technical business executives who want to see RESULTS, GROWTH, and ACTIONABLE INSIGHTS.

AVAILABLE DATA:
- Site: ${wp.siteName} (${wp.siteUrl})
- WordPress: ${wp.postsCount} posts, ${wp.pagesCount} pages
- Entity sitemap: ${hasEntitySitemap ? `Yes, ${wp.entitySitemapCount} URLs` : "No"}
- Entity pages in GSC: ${hasEntityData ? discoveryData.entityPagesData!.pages.length : 0}
- NAP/Locations: ${hasNAP ? `Yes (${wp.locationsCount} locations)` : "No"}
- Historical data: ${hasHistorical ? `${discoveryData.historicalData!.dateRange.monthsOfData} months` : "No"}
- GSC stats: ${stats.currentPeriod.impressions.toLocaleString()} impressions, ${stats.currentPeriod.pagesCount} pages ranking, ${stats.currentPeriod.searchTermsCount} search terms
${discoveryData.entityCoverage ? `- Service Area Pages (SAP) indexation: ${discoveryData.entityCoverage.indexedPercent}% of SAP in GSC (${discoveryData.entityCoverage.totalInGSC}/${discoveryData.entityCoverage.totalInSitemap})` : ""}
${discoveryData.gmbData ? "- Google Business Profile (GMB): Yes - report includes a dedicated GMB section (calls, directions, website clicks) and GMB in key insights." : discoveryData.site.gbpLocationId?.trim() ? "- Google Business Profile (GMB): Location ID set; dedicated GMB section and key insights included when GMB is connected." : ""}

CRITICAL RULES:
1. ALWAYS include "Key Points for the Team" (key-points-for-team) - quick-scan bullets for ops/tech, placed early in the report.
2. NEVER include a "Next Steps" or "Looking Ahead" section.
3. When entity sitemap exists (${hasEntitySitemap}), ALWAYS include a dedicated "Service Area Pages (SAP) & Local SEO" section - this is non-negotiable for local SEO focus.
4. Prioritize sections based on data richness - don't emphasize sections with sparse data.
5. Focus on what a business owner cares about: growth, new opportunities, local visibility, content performance.
6. When NAP/locations/entity sitemap exist, emphasize LOCAL SEO throughout.
7. Include 6-12 sections total, ordered by priority (1 = highest).
8. insightsToHighlight: 3-5 key insights the AI should emphasize in the report (business-impact focused).
9. keywordFocus: 2-4 keyword buckets to emphasize (e.g., "local service terms", "brand terms", "product category").

Return ONLY valid JSON. No markdown code blocks, no text before or after. Do not use quotes inside rationale strings (use plain words only). Keep each rationale to 5-10 words so the response is not truncated.
{
  "focus": "local-seo" | "content-growth" | "brand-visibility" | "mixed",
  "sections": [
    { "id": "executive-summary", "title": "Executive Summary", "priority": 1, "rationale": "Lead with key wins", "dataSource": "gsc", "includeEntitySitemapSection": false },
    { "id": "entity-sitemap-local-seo", "title": "Service Area Pages (SAP) & Local SEO", "priority": 2, "rationale": "Local SEO and SAP performance", "dataSource": "entity", "includeEntitySitemapSection": true }
  ],
  "insightsToHighlight": ["insight 1", "insight 2", "insight 3"],
  "keywordFocus": ["local service terms", "brand visibility"]
}

Section IDs: executive-summary, key-points-for-team, growth-highlights, new-search-terms, top-performers, local-presence, branded-search-terms, entity-sitemap-local-seo, content-reach, historical-context, seasonal-factors, infographic.
Only include sections that make sense. When entity sitemap exists, MUST include entity-sitemap-local-seo.`;

  const userPrompt = `Plan the report for ${wp.siteName}. Entity sitemap: ${hasEntitySitemap ? `${wp.entitySitemapCount} URLs` : "none"}. Entity GSC: ${hasEntityData ? "yes" : "no"}. Local/NAP: ${hasNAP ? "yes" : "no"}. Historical: ${hasHistorical ? "yes" : "no"}. Top keywords: ${stats.topKeywords.slice(0, 5).map((k) => k.query).join(", ")}. Output the ReportPlan JSON only.`;

  try {
    let fullResponse = "";
    await streamChatCompletion({
      apiKey,
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      maxTokens: 3000,
      topP: 0.9,
      onContentChunk: (chunk) => {
        fullResponse += chunk;
      },
    });

    let cleaned = fullResponse.trim();
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }
    // Extract JSON object only (in case model added text before/after)
    const firstBrace = cleaned.indexOf("{");
    if (firstBrace >= 0) cleaned = cleaned.slice(firstBrace);
    const lastBrace = cleaned.lastIndexOf("}");
    if (lastBrace > 0) cleaned = cleaned.slice(0, lastBrace + 1);

    let parsed: ReportPlan;
    try {
      parsed = JSON.parse(cleaned) as ReportPlan;
    } catch (parseErr) {
      // Try to repair truncated JSON (unterminated string or cut-off array/object)
      const repaired = repairTruncatedReportJson(cleaned);
      if (repaired) {
        parsed = JSON.parse(repaired) as ReportPlan;
      } else {
        throw parseErr;
      }
    }

    // Ensure entity sitemap section is included when entity sitemap exists
    if (hasEntitySitemap) {
      const hasEntitySection = parsed.sections.some(
        (s) => s.id === "entity-sitemap-local-seo" || s.includeEntitySitemapSection
      );
      if (!hasEntitySection) {
        parsed.sections.push({
      id: "entity-sitemap-local-seo",
      title: "Service Area Pages (SAP) & Local SEO",
          priority: 2,
          rationale: "Dedicated section for Service Area Pages (SAP) performance - critical for local SEO",
          dataSource: "entity",
          includeEntitySitemapSection: true,
        });
        parsed.sections.sort((a, b) => a.priority - b.priority);
      }
    }

    return parsed;
  } catch (error) {
    logger.error("[Report Planner] AI planning failed:", error);
    throw new Error(
      "Report plan could not be generated: the AI returned invalid JSON. Please try again. If it keeps failing, check your connection or try a different model."
    );
  }
}

/**
 * Attempt to repair truncated or slightly malformed JSON from the model.
 * Handles unterminated strings (stream cut off) and unclosed brackets.
 */
function repairTruncatedReportJson(raw: string): string | null {
  if (!raw || !raw.trim()) return null;
  let s = raw.trim();
  // Remove trailing comma before closing (invalid in JSON)
  s = s.replace(/,(\s*[}\]])/g, "$1");
  // If we end mid-string (no closing quote), add one
  const inString = (s.match(/"/g) || []).length % 2 !== 0;
  if (inString) s += '"';
  // Close any unclosed brackets
  const openBrackets = (s.match(/[{[]/g) || []).length;
  const closeBrackets = (s.match(/[}\]]/g) || []).length;
  let needClose = openBrackets - closeBrackets;
  while (needClose > 0) {
    const lastOpen = Math.max(s.lastIndexOf("["), s.lastIndexOf("{"));
    if (lastOpen < 0) break;
    s += s[lastOpen] === "[" ? "]" : "}";
    needClose--;
  }
  return s;
}

