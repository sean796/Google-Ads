import type { WordPressSite } from "@/components/integrations/types";
import {
  createBulkGscKeywordsHostedLink,
  revokeBulkGscKeywordsHostedLink,
  type BulkGscKeywordsHostedLink,
} from "@/lib/bulk/bulk-gsc-keywords-hosted-link";
import { revokeBulkSitemapInventoryLinks } from "@/lib/bulk/bulk-sitemap-inventory-session";
import type { PromptBulkSitemapInventoryLink } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import { warmInventoryHostedLinksForSite } from "@/lib/bulk/warm-inventory-hosted-links";
import {
  getEntitySiteWarmInflightSnapshot,
  gscAllQueriesFromWarmBundle,
  resolveEntitySiteWarmBundleSync,
} from "@/lib/local-analysis/entity-site-warm-cache";
import {
  buildSiteWarmInventoryDisplayRows,
  type SiteWarmInventoryDisplayRow,
} from "@/lib/overview/site-warm-inventory-display-rows";

export type OverviewSiteWarmDetailsSnapshot = {
  sitemapInventoryLinks: PromptBulkSitemapInventoryLink[];
  gscHostedLink: BulkGscKeywordsHostedLink | null;
  inventoryRows: SiteWarmInventoryDisplayRow[];
  sitemapInventoryLoading: boolean;
};

const emptySnapshot: OverviewSiteWarmDetailsSnapshot = {
  sitemapInventoryLinks: [],
  gscHostedLink: null,
  inventoryRows: buildSiteWarmInventoryDisplayRows(null, [], null),
  sitemapInventoryLoading: false,
};

type HostedSnapshotCache = {
  siteId: string;
  warmKey: string;
  links: PromptBulkSitemapInventoryLink[];
  gscHostedLink: BulkGscKeywordsHostedLink | null;
};

let hostedSnapshotCache: HostedSnapshotCache | null = null;

let detailsSnapshotCache: {
  siteId: string;
  storeEpoch: number;
  warmKey: string;
  snapshot: OverviewSiteWarmDetailsSnapshot;
} | null = null;

function warmBundleForSite(site: WordPressSite) {
  return resolveEntitySiteWarmBundleSync(site);
}

function warmSnapshotKey(site: WordPressSite, warm: NonNullable<ReturnType<typeof warmBundleForSite>>): string {
  return [
    site.id,
    warm.fetchedAt,
    warm.counts.inventoryTotal,
    warm.counts.gscQueries,
    warm.credentialsKey,
  ].join(":");
}

function buildHostedSnapshot(
  site: WordPressSite,
  warm: NonNullable<ReturnType<typeof warmBundleForSite>>,
): Pick<OverviewSiteWarmDetailsSnapshot, "sitemapInventoryLinks" | "gscHostedLink"> {
  const warmKey = warmSnapshotKey(site, warm);
  if (hostedSnapshotCache?.siteId === site.id && hostedSnapshotCache.warmKey === warmKey) {
    return {
      sitemapInventoryLinks: hostedSnapshotCache.links,
      gscHostedLink: hostedSnapshotCache.gscHostedLink,
    };
  }

  revokeBulkSitemapInventoryLinks(hostedSnapshotCache?.links ?? []);
  revokeBulkGscKeywordsHostedLink(hostedSnapshotCache?.gscHostedLink ?? null);

  const links = warmInventoryHostedLinksForSite(site, warm);
  const siteUrl = site.siteUrl?.trim() ?? "";
  const gscQueries = gscAllQueriesFromWarmBundle(warm);
  const gscHostedLink =
    siteUrl && gscQueries.length > 0
      ? createBulkGscKeywordsHostedLink(siteUrl, gscQueries)
      : null;

  hostedSnapshotCache = { siteId: site.id, warmKey, links, gscHostedLink };
  return { sitemapInventoryLinks: links, gscHostedLink };
}

/** Sync snapshot for Details drawers (localStorage + memory, no await). */
export function getOverviewSiteWarmDetailsSnapshot(
  site: WordPressSite | null | undefined,
): OverviewSiteWarmDetailsSnapshot {
  if (!site?.id || !site.siteUrl?.trim()) return emptySnapshot;

  const storeEpoch = getEntitySiteWarmInflightSnapshot();
  const warm = warmBundleForSite(site);
  if (!warm) {
    if (detailsSnapshotCache?.siteId === site.id && detailsSnapshotCache.storeEpoch === storeEpoch) {
      return detailsSnapshotCache.snapshot;
    }
    const snapshot = { ...emptySnapshot, sitemapInventoryLoading: true };
    detailsSnapshotCache = { siteId: site.id, storeEpoch, warmKey: "", snapshot };
    return snapshot;
  }

  const warmKey = warmSnapshotKey(site, warm);
  if (
    detailsSnapshotCache?.siteId === site.id &&
    detailsSnapshotCache.storeEpoch === storeEpoch &&
    detailsSnapshotCache.warmKey === warmKey
  ) {
    return detailsSnapshotCache.snapshot;
  }

  const hosted = buildHostedSnapshot(site, warm);
  const inventoryRows = buildSiteWarmInventoryDisplayRows(
    warm,
    hosted.sitemapInventoryLinks,
    hosted.gscHostedLink,
  );
  const hasRows = inventoryRows.some((row) => row.count > 0);
  const snapshot: OverviewSiteWarmDetailsSnapshot = {
    ...hosted,
    inventoryRows,
    sitemapInventoryLoading: !hasRows,
  };
  detailsSnapshotCache = { siteId: site.id, storeEpoch, warmKey, snapshot };
  return snapshot;
}
