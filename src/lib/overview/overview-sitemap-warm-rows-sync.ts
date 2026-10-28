import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import { applyCachedElementorFieldsToOverviewRows } from "@/lib/elementor-page-content/elementor-section-headers-from-cache";
import {
  getSitePrefetchOverviewRowsForSourceSync,
  getSitePrefetchUrlsForSourceSync,
} from "@/lib/local-analysis/entity-site-warm-cache";
import { buildOverviewSessionRowsFromWarmBulk } from "@/lib/overview/overview-inventory-progressive-hydrate";
import { mergeOverviewRowsForSitemapLoad } from "@/lib/overview/overview-rows-session-cache";
import { createEmptyOverviewRow } from "@/lib/overview/overview-row-helpers";
import {
  getOverviewRowsSessionCache,
  setOverviewRowsSessionCache,
} from "@/lib/overview/overview-rows-session-cache";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import {
  resolveEntitySiteWarmBundleSync,
  seedOverviewSessionCachesFromWarm,
} from "@/lib/local-analysis/entity-site-warm-cache";

/** Cached inventory only (local warm + row persist). */
export function loadCachedOverviewRows(
  site: WordPressSite | undefined,
  source: OverviewSitemapSource,
): OverviewRow[] {
  if (!site?.id || !site.siteUrl?.trim()) return [];
  return syncOverviewRowsFromWarmCache(site, source);
}

export function readOverviewRowsForFirstPaint(
  site: WordPressSite | undefined,
  source: OverviewSitemapSource,
): OverviewRow[] {
  return loadCachedOverviewRows(site, source);
}

export function syncOverviewRowsFromWarmCache(
  site: WordPressSite,
  source: OverviewSitemapSource,
): OverviewRow[] {
  resolveEntitySiteWarmBundleSync(site);
  seedOverviewSessionCachesFromWarm(site);

  const session = getOverviewRowsSessionCache(site.id, source)?.filter((row) =>
    Boolean(row.url?.trim()),
  );
  if (
    session?.length &&
    session.some((r) => Boolean(r.title?.trim() || r.pageHeading?.trim()))
  ) {
    return session;
  }

  const prefetchRows = getSitePrefetchOverviewRowsForSourceSync(site, source);
  if (prefetchRows.length) {
    const rows = applyCachedElementorFieldsToOverviewRows(
      buildOverviewSessionRowsFromWarmBulk(site, source, prefetchRows),
      source,
    );
    if (rows.length) {
      setOverviewRowsSessionCache(site.id, source, rows);
    }
    return rows;
  }

  return [];
}
