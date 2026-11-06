import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import type { Dispatch, SetStateAction } from "react";
import { resolveOverviewSourceHtml } from "@/lib/overview/overview-blog-overview-prepend";
import { postBodyHtmlFromInventoryRow } from "@/lib/overview/overview-inventory-seo-fields";
import type { OverviewInventoryUrlMatch } from "@/lib/overview/overview-row-scrape";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { lookupOverviewInventoryHitForUrl } from "@/hooks/content-optimization/bulk-seo-extra-text-fast-path";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";

export type SetBulkState = Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>;
export type SetOptProgress = Dispatch<SetStateAction<Record<string, unknown>>>;
export type SetIsOptimizing = Dispatch<SetStateAction<Record<string, boolean>>>;

export type WikipediaLinkCatalogRow = {
  index: number;
  url: string;
  html: string;
  title: string;
  focusKeyword: string;
};

export type WikipediaLinkHarnessSetters = {
  siteId: string;
  batchKey: string;
  setBulkOptimizationState: SetBulkState;
  setOptimizationProgress: SetOptProgress;
};

export type WikipediaLinkRowPatch = {
  postContentOptimized: string;
  blogWikiLinksRanAtIso: string;
  blogWikiLinkList: Array<{ href: string; anchor: string }>;
  blogWikiLinkSummary: string;
};

export type WikipediaLinkRowOutcome =
  | { kind: "ok"; patch: WikipediaLinkRowPatch; summary: string; markdown: string }
  | { kind: "skipped"; summary: string; markdown: string };

export function buildWikipediaLinkStubCatalog(
  rows: OverviewRow[],
  indices: number[],
): WikipediaLinkCatalogRow[] {
  return indices
    .map((index) => {
      const row = rows[index];
      const url = row?.url?.trim();
      if (!row || !url) return null;
      return {
        index,
        url,
        html: "",
        title: (row.title || "").trim(),
        focusKeyword: (row.focusKeyword || "").trim(),
      };
    })
    .filter(Boolean) as WikipediaLinkCatalogRow[];
}

export function mergeWikipediaLinkCatalogHtml(
  stub: WikipediaLinkCatalogRow[],
  withHtml: WikipediaLinkCatalogRow[],
): WikipediaLinkCatalogRow[] {
  const byIndex = new Map(withHtml.map((c) => [c.index, c]));
  return stub.map((entry) => {
    const resolved = byIndex.get(entry.index);
    if (!resolved?.html?.trim()) return entry;
    return resolved;
  });
}

export function buildWikipediaLinkCatalog(
  rows: OverviewRow[],
  indices: number[],
  bindings: Record<string, OverviewBinding | undefined>,
  site: WordPressSite,
  sitemapSource: OverviewSitemapSource | undefined,
  getInventoryMatchForUrl: (
    site: WordPressSite | null,
    url: string,
  ) => OverviewInventoryUrlMatch | undefined,
  rowHtmlByIndex?: Record<number, string>,
): WikipediaLinkCatalogRow[] {
  const catalog: WikipediaLinkCatalogRow[] = [];
  for (const index of indices) {
    const row = rows[index];
    if (!row) continue;
    const trimmedUrl = row.url?.trim();
    if (!trimmedUrl) continue;

    const snapshotHit = lookupOverviewInventoryHitForUrl(site, trimmedUrl, sitemapSource);
    const invMatch =
      snapshotHit != null
        ? {
            row: snapshotHit.row,
            subtype:
              snapshotHit.source === "pages"
                ? ("page" as const)
                : snapshotHit.source === "posts"
                  ? ("post" as const)
                  : snapshotHit.source,
          }
        : getInventoryMatchForUrl(site, trimmedUrl);

    const inventoryHtml = snapshotHit?.row?.fields?.content?.trim() ?? "";
    const html =
      rowHtmlByIndex?.[index]?.trim() ||
      row.postContentOptimized?.trim() ||
      inventoryHtml ||
      row.postContent?.trim() ||
      resolveOverviewSourceHtml(row).trim() ||
      (invMatch?.row ? postBodyHtmlFromInventoryRow(invMatch.row)?.trim() : "") ||
      "";
    if (!html) continue;

    catalog.push({
      index,
      url: trimmedUrl,
      html,
      title: (row.title || "").trim(),
      focusKeyword: (row.focusKeyword || "").trim(),
    });
  }
  return catalog;
}
