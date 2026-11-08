import { gridMemberCanonicalUrl } from "@/lib/sitemap-optimizer/grid-member-url";
import type { EntityRedirectPlan } from "@/lib/sitemap-optimizer/entity-redirect-plan-parse";
import { fillFamilyStrategyFromPillar } from "@/lib/sitemap-optimizer/entity-transform-families-agent";
import {
  isWordPressNumberedSlugDuplicate,
  stripWordPressNumberedSlugSuffix,
} from "@/lib/sitemap-optimizer/wordpress-numbered-slug-duplicate";
import type {
  SitemapOptimizerCluster,
  SitemapOptimizerClusterResult,
  SitemapOptimizerMergeRecommendation,
  SitemapOptimizerPostRow,
} from "@/lib/sitemap-optimizer/types";

export function entityClustersFromRedirectPlan(plan: EntityRedirectPlan): SitemapOptimizerCluster[] {
  return plan.families.map((family) => ({
    clusterId: family.familyId,
    label: family.familyId,
    intent: "local" as const,
    memberPostIds: [...family.sourcePostIds],
    confidence: "high" as const,
    rationale: family.rationale,
  }));
}

/** Locked destination: never keep a WP numbered clone slug as the transform URL. */
export function resolveEntityRedirectDestinationUrl(
  pillar: SitemapOptimizerPostRow,
): string {
  const canonical = gridMemberCanonicalUrl(pillar);
  if (!isWordPressNumberedSlugDuplicate(canonical)) return canonical;
  return stripWordPressNumberedSlugSuffix(canonical);
}

export function entityMergesFromRedirectPlan(
  plan: EntityRedirectPlan,
  rowById: Map<string, SitemapOptimizerPostRow>,
): SitemapOptimizerMergeRecommendation[] {
  return plan.families.flatMap((family) => {
    const complete = fillFamilyStrategyFromPillar(family, rowById);
    const pillar = rowById.get(complete.destinationPostId);
    if (!pillar) return [];

    return [{
      clusterId: complete.familyId,
      recommendedTitle: complete.recommendedTitle!.trim(),
      recommendedPrimaryKeyword: complete.recommendedPrimaryKeyword!.trim(),
      recommendedMeta: complete.recommendedMeta!.trim(),
      sapEntity: complete.sapEntity!.trim(),
      sapModifier: complete.sapModifier!.trim(),
      combinedOutline: complete.combinedOutline!,
      whatToKeepFromEach: complete.whatToKeepFromEach!,
      lockedDestinationUrl: resolveEntityRedirectDestinationUrl(pillar),
      redirectOrCanonicalNote: "NEO Pulse redirect 301: legacy service-area URLs to pillar destination.",
      priority: complete.sourcePostIds.length >= 3 ? "high" : "medium",
      confidence: "high",
      rationale: complete.rationale.trim(),
    }];
  });
}

export function entityStateFromRedirectPlan(
  plan: EntityRedirectPlan,
  rowById: Map<string, SitemapOptimizerPostRow>,
): {
  clusters: SitemapOptimizerClusterResult;
  merges: SitemapOptimizerMergeRecommendation[];
} {
  return {
    clusters: { clusters: entityClustersFromRedirectPlan(plan), singletons: [] },
    merges: entityMergesFromRedirectPlan(plan, rowById),
  };
}

/** @deprecated Use entityMergesFromRedirectPlan */
export function entityStubMergesFromRedirectPlan(
  plan: EntityRedirectPlan,
  rowById: Map<string, SitemapOptimizerPostRow>,
): SitemapOptimizerMergeRecommendation[] {
  return entityMergesFromRedirectPlan(plan, rowById);
}
