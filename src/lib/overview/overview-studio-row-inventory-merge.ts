import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { WordPressSite } from "@/components/integrations/types";
import { elementorSectionHeadersFromCachedRow } from "@/lib/elementor-page-content/elementor-section-headers-from-cache";
import { lookupOverviewInventoryHitForUrl } from "@/hooks/content-optimization/bulk-seo-extra-text-fast-path";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";

/** Merge warm bulk inventory into the studio row before first paint (no network). */
export function overviewStudioRowFromWarmInventory(
  row: OverviewRow,
  site: WordPressSite | undefined,
  sitemapSource: OverviewSitemapSource,
): OverviewRow {
  if (!site?.id || !row.url?.trim()) return row;
  if (elementorSectionHeadersFromCachedRow(row).length > 0) return row;

  const hit = lookupOverviewInventoryHitForUrl(site, row.url.trim(), sitemapSource);
  const inv = hit?.row;
  if (!inv?.fields) return row;

  const content = String(inv.fields.content ?? "").trim();
  const elementorJson = String(
    (inv.fields as { elementorDataJson?: string }).elementorDataJson ?? "",
  ).trim();
  const title = String(inv.fields.title ?? "").trim();

  if (!content && !elementorJson) return row;

  return {
    ...row,
    title: row.title?.trim() || title || row.title,
    postContent: row.postContent?.trim() || content || row.postContent,
    elementorDataJson: row.elementorDataJson?.trim() || elementorJson || row.elementorDataJson,
    contentFormat: row.contentFormat ?? (elementorJson || sitemapSource === "pages" ? "elementor" : row.contentFormat),
  };
}
