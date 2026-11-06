import { displayPostTitle } from "@/lib/sitemap-optimizer/merge-results-display";
import { gridMemberSourceUrl } from "@/lib/sitemap-optimizer/grid-member-url";
import type { SitemapOptimizerCluster, SitemapOptimizerPostRow } from "@/lib/sitemap-optimizer/types";

/** 1-based pack part from cluster ids like `grid-dest-1-part-2`. */
export function redirectMapClusterPackPart(clusterId: string): number {
  const match = clusterId.match(/-part-(\d+)$/);
  return match ? Number(match[1]) : 1;
}

/** Overflow chunk when a CSV new_url family exceeds max URLs per post (part 2+). */
export function isRedirectMapOverflowPackCluster(
  cluster: Pick<SitemapOptimizerCluster, "clusterId"> & { rationale?: string },
): boolean {
  if (cluster.clusterId.startsWith("grid-temporal-")) return false;
  return redirectMapClusterPackPart(cluster.clusterId) > 1;
}

/** Derive a distinct brief keyword from legacy URLs/titles in an overflow pack. */
export function overflowKeywordFromRedirectMembers(
  members: readonly SitemapOptimizerPostRow[],
): string {
  for (const member of members) {
    const legacy = gridMemberSourceUrl(member);
    try {
      const tail = new URL(legacy).pathname.split("/").filter(Boolean).pop();
      if (tail) {
        const phrase = tail.replace(/-/g, " ").replace(/\s+/g, " ").trim();
        if (phrase.length >= 4) return phrase.slice(0, 56);
      }
    } catch {
      /* skip */
    }
    const title = displayPostTitle(member.title || member.gridTagLabel || "").trim();
    if (title.length >= 4) return title.slice(0, 56);
  }
  return "consolidated topic guide";
}
