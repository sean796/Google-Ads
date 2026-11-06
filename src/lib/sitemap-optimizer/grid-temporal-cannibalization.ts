import { getGridContentYear } from "@/lib/sitemap-optimizer/grid-title-year";
import { gridMemberCanonicalUrl } from "@/lib/sitemap-optimizer/grid-member-url";
import { displayPostTitle } from "@/lib/sitemap-optimizer/merge-results-display";
import type { SitemapOptimizerCluster, SitemapOptimizerPostRow } from "@/lib/sitemap-optimizer/types";

function slugifyLabel(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "guide"
  );
}

/** Slug stem from AI cluster metadata (required for temporal groups). */
export function pickTemporalPillarSlugStem(
  members: readonly SitemapOptimizerPostRow[],
  cluster?: Pick<SitemapOptimizerCluster, "temporalPillarSlugStem" | "label">,
): string {
  if (cluster?.temporalPillarSlugStem?.trim()) {
    return cluster.temporalPillarSlugStem.trim().toLowerCase();
  }
  if (cluster?.label?.trim()) return slugifyLabel(cluster.label);
  const title = displayPostTitle(members[0]?.title || members[0]?.gridTagLabel || "");
  return slugifyLabel(title);
}

/** One live pillar URL: `{stem}-{contentYear}/` — all quarters redirect here. */
export function pickTemporalPillarDestinationUrl(
  members: readonly SitemapOptimizerPostRow[],
  contentYear: number = getGridContentYear(),
  cluster?: Pick<SitemapOptimizerCluster, "temporalPillarSlugStem" | "label">,
): string {
  if (!members.length) return "";
  const stem = pickTemporalPillarSlugStem(members, cluster);
  try {
    const origin = new URL(gridMemberCanonicalUrl(members[0]!)).origin;
    const pathPrefix = new URL(gridMemberCanonicalUrl(members[0]!)).pathname
      .split("/")
      .filter(Boolean)
      .slice(0, -1)
      .join("/");
    const prefix = pathPrefix ? `/${pathPrefix}` : "/blog";
    const slug = `${stem}-${contentYear}`.replace(/-+/g, "-");
    return `${origin}${prefix}/${slug}/`;
  } catch {
    return "";
  }
}

export function temporalPillarKeyword(
  members: readonly SitemapOptimizerPostRow[],
  contentYear: number = getGridContentYear(),
  cluster?: Pick<SitemapOptimizerCluster, "temporalPillarSlugStem" | "label">,
): string {
  const phrase = pickTemporalPillarSlugStem(members, cluster)
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${phrase} ${contentYear}`.trim().slice(0, 56);
}

export function temporalPillarTitle(
  members: readonly SitemapOptimizerPostRow[],
  contentYear: number = getGridContentYear(),
  cluster?: Pick<SitemapOptimizerCluster, "temporalPillarSlugStem" | "label">,
): string {
  const keyword = temporalPillarKeyword(members, contentYear, cluster);
  return keyword
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
    .slice(0, 60);
}

/** H2 sections — from AI sectionHeaders or member titles. */
export function temporalPillarOutline(
  members: readonly SitemapOptimizerPostRow[],
  contentYear: number = getGridContentYear(),
  cluster?: Pick<SitemapOptimizerCluster, "temporalSectionHeaders" | "temporalPillarSlugStem" | "label">,
): string[] {
  const keyword = temporalPillarKeyword(members, contentYear, cluster);
  const aiHeaders = cluster?.temporalSectionHeaders?.filter(Boolean) ?? [];
  const headers =
    aiHeaders.length >= members.length
      ? aiHeaders.slice(0, members.length)
      : [...members]
          .sort((a, b) => (a.uploadRowIndex ?? 0) - (b.uploadRowIndex ?? 0))
          .map((m) => displayPostTitle(m.title || m.gridTagLabel || "").trim())
          .filter(Boolean);

  return [`${keyword} overview`, ...headers, "Summary and planning takeaways"].slice(0, 10);
}

export function isTemporalCannibalizationCluster(
  cluster: Pick<SitemapOptimizerCluster, "clusterId"> & { rationale?: string },
): boolean {
  return (
    cluster.clusterId.startsWith("grid-temporal-") ||
    Boolean(cluster.rationale?.includes("temporal cannibalization"))
  );
}

export type { TemporalCannibalizationExemptResult } from "@/lib/sitemap-optimizer/grid-temporal-cannibalization-agent";
export { runGridTemporalCannibalizationAgent } from "@/lib/sitemap-optimizer/grid-temporal-cannibalization-agent";
