import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { WordPressSite } from "@/components/integrations/types";
import {
  elementorSectionHeadersFromCachedRow,
  type ElementorSectionHeader,
} from "@/lib/elementor-page-content/elementor-section-headers-from-cache";
import { overviewStudioRowFromWarmInventory } from "@/lib/overview/overview-studio-row-inventory-merge";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";

export function filterStudioDrawerElementorHeaders(
  headers: ElementorSectionHeader[],
): ElementorSectionHeader[] {
  return headers.filter((sec) => {
    const key = (sec.title ?? "").trim().toLowerCase();
    return (
      key !== "faq" &&
      key !== "frequently asked questions" &&
      key !== "answer" &&
      key !== "direct answer" &&
      key !== "overview" &&
      key !== "ai overview"
    );
  });
}

export function resolveStudioDrawerElementorHeaders(
  row: OverviewRow,
  site: WordPressSite | undefined,
  sitemapSource: OverviewSitemapSource,
): ElementorSectionHeader[] {
  const merged = overviewStudioRowFromWarmInventory(row, site, sitemapSource);
  return filterStudioDrawerElementorHeaders(elementorSectionHeadersFromCachedRow(merged));
}
