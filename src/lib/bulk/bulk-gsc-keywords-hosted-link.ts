import {
  revokePressReleaseInventoryHostedLink,
  type PressReleaseInventoryHostedLink,
} from "@/lib/press-release/press-release-site-inventory";
import { gscKeywordsForOpenRouter } from "@/lib/bulk/bulk-gsc-site-queries";
import { stringifyInventoryKeywordList } from "@/lib/bulk/inventory-json-slim";
import type { GscCompetitorDateRange, GscSiteQueryRow } from "@/lib/competitor-research/types";

function hostSlugForInventoryFile(siteUrl: string): string {
  try {
    const raw = siteUrl.trim();
    const withProto = raw.startsWith("http") ? raw : `https://${raw}`;
    const u = new URL(withProto);
    return u.hostname.replace(/[^a-zA-Z0-9.-]+/g, "-").slice(0, 80) || "site";
  } catch {
    return "site";
  }
}

export type BulkGscKeywordsHostedLink = PressReleaseInventoryHostedLink & {
  label: string;
};

export function createBulkGscKeywordsHostedLink(
  siteUrl: string,
  queries: GscSiteQueryRow[],
  _dateRange?: GscCompetitorDateRange,
): BulkGscKeywordsHostedLink {
  const slug = hostSlugForInventoryFile(siteUrl);
  const filename = `gsc-keywords-${slug}-${Date.now()}.txt`;
  const keywords = gscKeywordsForOpenRouter(queries, queries.length);
  const text = stringifyInventoryKeywordList(keywords);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  return {
    label: "GSC (28 days)",
    href: URL.createObjectURL(blob),
    filename,
    rowCount: keywords.length,
  };
}

export function revokeBulkGscKeywordsHostedLink(
  link: BulkGscKeywordsHostedLink | null | undefined,
): void {
  revokePressReleaseInventoryHostedLink(link?.href);
}
