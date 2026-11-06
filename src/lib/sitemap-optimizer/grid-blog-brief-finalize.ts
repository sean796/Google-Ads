import type { BlogDestinationPolicy } from "@/lib/sitemap-optimizer/blog-destination-policy";
import { applyBlogDestinationPolicy } from "@/lib/sitemap-optimizer/blog-destination-policy";
import { editorialDestinationWithContentYear } from "@/lib/sitemap-optimizer/apply-content-year-policy";
import { getGridContentYear } from "@/lib/sitemap-optimizer/grid-title-year";
import { optimizeBlogMergeDestination } from "@/lib/sitemap-optimizer/optimize-blog-destination";
import { buildGridDestinationPreservingPermalink } from "@/lib/sitemap-optimizer/grid-destination-aiseo-policy";
import { optimizeGridDestinationForAiseo } from "@/lib/sitemap-optimizer/grid-destination-aiseo-policy";
import { resolveGridLockedDestinationUrl } from "@/lib/sitemap-optimizer/grid-locked-destination";
import { gridMemberCanonicalUrl } from "@/lib/sitemap-optimizer/grid-member-url";
import { sharedGridClusterDestinationUrl } from "@/lib/sitemap-optimizer/grid-merge-group-ids";
import { isRedirectMapOverflowPackCluster } from "@/lib/sitemap-optimizer/grid-redirect-pack-cluster";
import {
  isTemporalCannibalizationCluster,
  pickTemporalPillarDestinationUrl,
  temporalPillarKeyword,
  temporalPillarOutline,
  temporalPillarTitle,
} from "@/lib/sitemap-optimizer/grid-temporal-cannibalization";
import {
  coerceRedirectMapLockedDestination,
  isRedirectMapCluster,
  lockedDestinationForRedirectMapCluster,
  lockedUrlMatchesLegacySource,
} from "@/lib/sitemap-optimizer/grid-redirect-destination";
import type {
  SitemapOptimizerCluster,
  SitemapOptimizerMergeRecommendation,
  SitemapOptimizerPostRow,
} from "@/lib/sitemap-optimizer/types";
import { applyKeywordYearTitleRules } from "@/lib/sitemap-optimizer/grid-blog-brief-by-topic-prompts";
import { resolvedMembers } from "@/lib/sitemap-optimizer/grid-blog-brief-by-topic-helpers";

export function finalizeBrief(
  raw: SitemapOptimizerMergeRecommendation,
  cluster: SitemapOptimizerCluster,
  rowById: Map<string, SitemapOptimizerPostRow>,
  blogDestination?: BlogDestinationPolicy | null,
): SitemapOptimizerMergeRecommendation | null {
  const resolved = resolvedMembers(cluster, rowById);
  if (!resolved.length) return null;

  const memberUrls = resolved.map((m) => gridMemberCanonicalUrl(m));
  const redirectMap = isRedirectMapCluster(resolved);
  const contentYear = getGridContentYear();
  const isOverflow = isRedirectMapOverflowPackCluster(cluster);
  const isTemporal = isTemporalCannibalizationCluster(cluster);
  const presetDestination = isOverflow
    ? null
    : (lockedDestinationForRedirectMapCluster(resolved, cluster) ??
      (!isTemporal ? sharedGridClusterDestinationUrl(resolved) : null));
  if (presetDestination) {
    const optimizedPreset = blogDestination?.preserveCsvDestinations
      ? editorialDestinationWithContentYear(
          applyBlogDestinationPolicy(presetDestination, blogDestination),
          contentYear,
        )
      : editorialDestinationWithContentYear(
          optimizeBlogMergeDestination(
            presetDestination,
            raw.recommendedPrimaryKeyword,
            raw.recommendedTitle,
            memberUrls,
            blogDestination,
          ),
          contentYear,
        );
    return applyKeywordYearTitleRules({
      ...raw,
      clusterId: cluster.clusterId,
      lockedDestinationUrl: optimizedPreset,
    });
  }

  const lockedRaw = raw.lockedDestinationUrl?.trim();
  let resolvedLocked = lockedRaw
    ? resolveGridLockedDestinationUrl(lockedRaw, resolved, blogDestination)
    : null;
  if (resolvedLocked && redirectMap && lockedUrlMatchesLegacySource(resolvedLocked, resolved)) {
    resolvedLocked = null;
  }
  const coerced = coerceRedirectMapLockedDestination(resolvedLocked ?? lockedRaw, resolved);
  if (isTemporal && redirectMap) {
    const contentYear = getGridContentYear();
    const pillarLocked = applyBlogDestinationPolicy(
      pickTemporalPillarDestinationUrl(resolved, contentYear, cluster),
      blogDestination,
    );
    const pillarKeyword = temporalPillarKeyword(resolved, contentYear, cluster);
    const pillarTitle = temporalPillarTitle(resolved, contentYear, cluster);
    return {
      ...raw,
      clusterId: cluster.clusterId,
      recommendedTitle: pillarTitle,
      recommendedPrimaryKeyword: pillarKeyword,
      recommendedMeta: raw.recommendedMeta || `Consolidated ${pillarKeyword} — quarters as H2 sections.`,
      lockedDestinationUrl: pillarLocked,
      combinedOutline: temporalPillarOutline(resolved, contentYear, cluster),
    };
  }
  if (coerced && redirectMap) {
    const optimizedCoerced = blogDestination?.preserveCsvDestinations
      ? editorialDestinationWithContentYear(
          applyBlogDestinationPolicy(coerced, blogDestination),
          contentYear,
        )
      : editorialDestinationWithContentYear(
          optimizeBlogMergeDestination(
            coerced,
            raw.recommendedPrimaryKeyword,
            raw.recommendedTitle,
            memberUrls,
            blogDestination,
          ),
          contentYear,
        );
    return applyKeywordYearTitleRules({
      ...raw,
      clusterId: cluster.clusterId,
      lockedDestinationUrl: optimizedCoerced,
    });
  }
  if (!resolvedLocked && !redirectMap) {
    resolvedLocked = buildGridDestinationPreservingPermalink(
      memberUrls,
      raw.recommendedPrimaryKeyword,
      raw.recommendedTitle,
      blogDestination,
    );
  }
  if (!resolvedLocked) return null;

  const locked = optimizeBlogMergeDestination(
    resolvedLocked,
    raw.recommendedPrimaryKeyword,
    raw.recommendedTitle,
    memberUrls,
    blogDestination,
  );

  const sourcePaths = new Set(
    memberUrls.map((u) => {
      try {
        return new URL(u.trim()).pathname.replace(/\/+$/, "/").toLowerCase();
      } catch {
        return "";
      }
    }),
  );
  try {
    const destPath = new URL(locked).pathname.replace(/\/+$/, "/").toLowerCase();
    if (!redirectMap && memberUrls.length === 1 && sourcePaths.has(destPath)) {
      const topicSlug =
        resolved[0]?.gridTopicTag?.replace(/_/g, "-").toLowerCase().slice(0, 48) || "guide";
      const retry = buildGridDestinationPreservingPermalink(
        memberUrls,
        `${topicSlug}-guide`,
        raw.recommendedTitle,
        blogDestination,
      );
      if (retry) {
        const fixed =
          optimizeGridDestinationForAiseo(
            retry,
            raw.recommendedPrimaryKeyword,
            raw.recommendedTitle,
            memberUrls,
            blogDestination,
          ) ?? retry;
        return applyKeywordYearTitleRules({
          ...raw,
          clusterId: cluster.clusterId,
          lockedDestinationUrl: applyBlogDestinationPolicy(fixed, blogDestination),
        });
      }
    }
  } catch {
    return null;
  }

  return applyKeywordYearTitleRules({
    ...raw,
    clusterId: cluster.clusterId,
    lockedDestinationUrl: locked,
  });
}
