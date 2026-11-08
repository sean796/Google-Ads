import { applyBlogDestinationPolicy } from "@/lib/sitemap-optimizer/blog-destination-policy";
import { editorialDestinationWithContentYear } from "@/lib/sitemap-optimizer/apply-content-year-policy";
import { getGridContentYear, refreshYearsInText } from "@/lib/sitemap-optimizer/grid-title-year";
import { buildGridDestinationPreservingPermalink } from "@/lib/sitemap-optimizer/grid-destination-aiseo-policy";
import {
  gridMemberCanonicalUrl,
  gridMemberSourceUrl,
} from "@/lib/sitemap-optimizer/grid-member-url";
import {
  isRedirectMapCluster,
  lockedDestinationForRedirectMapCluster,
} from "@/lib/sitemap-optimizer/grid-redirect-destination";
import {
  isRedirectMapOverflowPackCluster,
  overflowKeywordFromRedirectMembers,
} from "@/lib/sitemap-optimizer/grid-redirect-pack-cluster";
import {
  isTemporalCannibalizationCluster,
  pickTemporalPillarDestinationUrl,
  temporalPillarKeyword,
  temporalPillarOutline,
  temporalPillarTitle,
} from "@/lib/sitemap-optimizer/grid-temporal-cannibalization";
import { normalizeGridDestinationKey } from "@/lib/sitemap-optimizer/grid-merge-group-ids";
import { optimizeGridDestinationForAiseo } from "@/lib/sitemap-optimizer/grid-destination-aiseo-policy";
import { optimizeBlogMergeDestination } from "@/lib/sitemap-optimizer/optimize-blog-destination";
import type { BlogDestinationPolicy } from "@/lib/sitemap-optimizer/blog-destination-policy";
import { displayPostTitle } from "@/lib/sitemap-optimizer/merge-results-display";
import { resolvedMemberRows } from "@/lib/sitemap-optimizer/resolved-cluster-members";
import type {
  SitemapOptimizerCluster,
  SitemapOptimizerMergeRecommendation,
  SitemapOptimizerPostRow,
} from "@/lib/sitemap-optimizer/types";

function keywordFromCluster(
  cluster: SitemapOptimizerCluster,
  members: readonly SitemapOptimizerPostRow[],
): string {
  if (isRedirectMapOverflowPackCluster(cluster)) {
    return overflowKeywordFromRedirectMembers(members);
  }
  const primary = members[0];
  const tagLabel = primary?.gridTagLabel?.trim();
  if (tagLabel) return tagLabel;
  const fromTag = primary?.gridTopicTag?.replace(/_/g, " ").trim();
  if (fromTag && fromTag !== "untagged") return fromTag;
  return cluster.label.trim() || primary?.title.trim() || "blog topic";
}

function legacyBulletsForMember(row: SitemapOptimizerPostRow): string[] {
  const bullets: string[] = [];
  const title = displayPostTitle(row.title || row.gridTagLabel || "").trim();
  if (title) bullets.push(`Cover angle: ${title}`);
  const tag = row.gridTagLabel?.trim();
  if (tag && tag !== title) bullets.push(tag);
  const topic = row.gridTopicTag?.replace(/_/g, " ").trim();
  if (topic && topic !== "untagged" && !bullets.includes(topic)) bullets.push(topic);
  return bullets.length ? bullets.slice(0, 4) : ["Topic from legacy URL"];
}

function combinedOutlineForCluster(
  cluster: SitemapOptimizerCluster,
  members: readonly SitemapOptimizerPostRow[],
  keyword: string,
): string[] {
  if (members.length > 1) {
    const sections = members
      .map((m) => displayPostTitle(m.title || m.gridTagLabel || cluster.label))
      .filter(Boolean)
      .slice(0, 4);
    return [`Introduction to ${keyword}`, ...sections, "Summary and next steps"].slice(0, 6);
  }
  return ["Overview", "Key points", "Next steps"];
}

function titleFromKeyword(keyword: string): string {
  const base = keyword
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return base.length <= 60 ? base : `${base.slice(0, 57).trim()}...`;
}

/** Deterministic NEO Pulse redirect brief when the model omits or rejects a cluster. */
export function buildDeterministicGridBrief(
  cluster: SitemapOptimizerCluster,
  rowById: Map<string, SitemapOptimizerPostRow>,
  _partIndex?: number,
  blogDestination?: BlogDestinationPolicy | null,
): SitemapOptimizerMergeRecommendation | null {
  const members = resolvedMemberRows(cluster, rowById);
  if (!members.length) return null;

  const keyword = keywordFromCluster(cluster, members);
  const title = titleFromKeyword(keyword);
  const metaBase = `Consolidated guide for ${keyword}. Covers ${members.length} related GSC URL(s).`;
  const meta = metaBase.length <= 160 ? metaBase : `${metaBase.slice(0, 157).trim()}...`;
  const memberUrls = members.map((m) => gridMemberCanonicalUrl(m));
  const isOverflow = isRedirectMapOverflowPackCluster(cluster);
  const isTemporal = isTemporalCannibalizationCluster(cluster);
  const presetDestination = lockedDestinationForRedirectMapCluster(members, cluster);
  const redirectMap = isRedirectMapCluster(members);
  const csvBaseKey = presetDestination
    ? normalizeGridDestinationKey(presetDestination)
    : normalizeGridDestinationKey(gridMemberCanonicalUrl(members[0]!));

  if (isTemporal) {
    const contentYear = getGridContentYear();
    const pillarKeyword = temporalPillarKeyword(members, contentYear, cluster);
    const pillarTitle = temporalPillarTitle(members, contentYear, cluster);
    let locked = pickTemporalPillarDestinationUrl(members, contentYear, cluster);
    locked = applyBlogDestinationPolicy(locked, blogDestination);
    return {
      clusterId: cluster.clusterId,
      recommendedTitle: pillarTitle,
      recommendedPrimaryKeyword: pillarKeyword,
      recommendedMeta: `Consolidated ${pillarKeyword} guide — each quarter as an H2 section.`.slice(
        0,
        160,
      ),
      lockedDestinationUrl: locked,
      combinedOutline: temporalPillarOutline(members, contentYear, cluster),
      whatToKeepFromEach: members.map((row) => ({
        url: gridMemberSourceUrl(row),
        title: displayPostTitle(row.title || row.gridTagLabel || ""),
        bullets: legacyBulletsForMember(row),
      })),
      redirectOrCanonicalNote: "One annual pillar — preserve subject year; quarters become H2 sections.",
      priority: "medium",
      confidence: "medium",
      rationale: "Temporal cannibalization pillar (subject year preserved).",
    };
  }

  let locked = presetDestination;
  if (!locked) {
    locked =
      buildGridDestinationPreservingPermalink(memberUrls, keyword, title) ??
      buildGridDestinationPreservingPermalink(memberUrls, `${keyword} guide`, title);
  }
  if (!locked) return null;

  if (isOverflow && csvBaseKey && normalizeGridDestinationKey(locked) === csvBaseKey) {
    const distinctKeyword = overflowKeywordFromRedirectMembers(members);
    locked =
      buildGridDestinationPreservingPermalink(memberUrls, distinctKeyword, title) ??
      buildGridDestinationPreservingPermalink(memberUrls, `${distinctKeyword} guide`, title) ??
      locked;
  }

  const contentYear = getGridContentYear();
  locked = blogDestination?.preserveCsvDestinations
    ? editorialDestinationWithContentYear(
        applyBlogDestinationPolicy(locked, blogDestination),
        contentYear,
      )
    : editorialDestinationWithContentYear(
        optimizeBlogMergeDestination(locked, keyword, title, memberUrls, blogDestination),
        contentYear,
      );

  const refreshedKeyword = refreshYearsInText(keyword, contentYear);
  const refreshedTitle = refreshYearsInText(title, contentYear);

  if (!presetDestination && !redirectMap) {
    try {
      const destPath = new URL(locked).pathname.replace(/\/+$/, "/").toLowerCase();
      const sourcePaths = memberUrls.map((u) => {
        try {
          return new URL(u.trim()).pathname.replace(/\/+$/, "/").toLowerCase();
        } catch {
          return "";
        }
      });
      if (members.length === 1 && sourcePaths[0] === destPath) {
        const slugBase = keyword.replace(/\s+/g, "-").toLowerCase().slice(0, 48) || "guide";
        const retry = buildGridDestinationPreservingPermalink(
          memberUrls,
          `${slugBase}-guide`,
          title,
        );
        if (retry) locked = optimizeGridDestinationForAiseo(retry, keyword, title, memberUrls) ?? retry;
      }
    } catch {
      /* keep locked */
    }
  }

  return {
    clusterId: cluster.clusterId,
    recommendedTitle: refreshedTitle,
    recommendedPrimaryKeyword: refreshedKeyword,
    recommendedMeta: refreshYearsInText(meta, contentYear),
    lockedDestinationUrl: locked,
    combinedOutline: combinedOutlineForCluster(cluster, members, keyword),
    whatToKeepFromEach: members.map((row) => ({
      url: gridMemberSourceUrl(row),
      title: displayPostTitle(row.title || row.gridTagLabel || ""),
      bullets: legacyBulletsForMember(row),
    })),
    redirectOrCanonicalNote: "Redirect sources to this consolidated destination.",
    priority: "medium",
    confidence: "medium",
    rationale: "Deterministic grid brief (model gap filled).",
  };
}

export function fillMissingClusterBriefs(
  clusters: readonly SitemapOptimizerCluster[],
  existing: Map<string, SitemapOptimizerMergeRecommendation>,
  rowById: Map<string, SitemapOptimizerPostRow>,
): void {
  for (const cluster of clusters) {
    if (existing.has(cluster.clusterId)) continue;
    const brief = buildDeterministicGridBrief(cluster, rowById);
    if (brief) existing.set(cluster.clusterId, brief);
  }
}

export function buildDeterministicGridBriefs(
  clusters: readonly SitemapOptimizerCluster[],
  rows: readonly SitemapOptimizerPostRow[],
): SitemapOptimizerMergeRecommendation[] {
  const rowById = new Map(rows.map((r) => [r.postId, r]));
  const out: SitemapOptimizerMergeRecommendation[] = [];
  for (const cluster of clusters) {
    const brief = buildDeterministicGridBrief(cluster, rowById);
    if (brief) out.push(brief);
  }
  return out;
}
