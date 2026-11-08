import { runEntityCompressFamiliesAgent } from "@/lib/sitemap-optimizer/entity-compress-families-agent";
import { runEntityTransformFamiliesAgent } from "@/lib/sitemap-optimizer/entity-transform-families-agent";
import type { EntityRedirectPlan } from "@/lib/sitemap-optimizer/entity-redirect-plan-parse";
import type { SitemapOptimizerPostRow } from "@/lib/sitemap-optimizer/types";

/**
 * @deprecated Prefer runEntityCompressFamiliesAgent + runEntityTransformFamiliesAgent.
 * Kept as a thin Stage 2→3 wrapper for callers that still expect one agent.
 */
export async function runEntityRedirectPlanAgent(
  consolidateRows: readonly SitemapOptimizerPostRow[],
  apiKey: string,
  options?: {
    signal?: AbortSignal;
    onProgress?: (completed: number, total: number) => void;
  },
): Promise<EntityRedirectPlan> {
  const compressPlan = await runEntityCompressFamiliesAgent(consolidateRows, apiKey, options);
  return runEntityTransformFamiliesAgent(compressPlan, consolidateRows, apiKey, options);
}

export function redirectPlanRedirectCsvPairs(
  plan: EntityRedirectPlan,
  rowById: Map<string, SitemapOptimizerPostRow>,
): Array<{ sourceUrl: string; destinationUrl: string; familyId: string }> {
  const pairs: Array<{ sourceUrl: string; destinationUrl: string; familyId: string }> = [];
  for (const family of plan.families) {
    const pillar = rowById.get(family.destinationPostId);
    if (!pillar) continue;
    const destinationUrl = pillar.url.trim();
    for (const sourceId of family.sourcePostIds) {
      const sourceRow = rowById.get(sourceId);
      if (!sourceRow) continue;
      const sourceUrl = sourceRow.url.trim();
      if (sourceUrl.toLowerCase() === destinationUrl.toLowerCase()) continue;
      pairs.push({ sourceUrl, destinationUrl, familyId: family.familyId });
    }
  }
  return pairs;
}

export { catalogForCompressFamilies as catalogForRedirectPlan } from "@/lib/sitemap-optimizer/entity-compress-families-agent";
