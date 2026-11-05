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

const loadingEmptySnapshot: OverviewSiteWarmDetailsSnapshot = {
  ...emptySnapshot,
  sitemapInventoryLoading: true,
};

type HostedSnapshotCache = {
  siteId: string;
  warmKey: string;
  links: PromptBulkSitemapInventoryLink[];
  gscHostedLink: BulkGscKeywordsHostedLink | null;
};

const hostedSnapshotCacheBySiteId = new Map<string, HostedSnapshotCache>();

const detailsSnapshotCacheBySiteId = new Map<
  string,
  {
    warmKey: string;
    snapshot: OverviewSiteWarmDetailsSnapshot;
  }
>();

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
    warm.error ?? "",
  ].join(":");
}

function buildHostedSnapshot(
  site: WordPressSite,
  warm: NonNullable<ReturnType<typeof warmBundleForSite>>,
): Pick<OverviewSiteWarmDetailsSnapshot, "sitemapInventoryLinks" | "gscHostedLink"> {
  const warmKey = warmSnapshotKey(site, warm);
  const existing = hostedSnapshotCacheBySiteId.get(site.id);
  if (existing && existing.warmKey === warmKey) {
    return {
      sitemapInventoryLinks: existing.links,
      gscHostedLink: existing.gscHostedLink,
    };
  }

  revokeBulkSitemapInventoryLinks(existing?.links ?? []);
  revokeBulkGscKeywordsHostedLink(existing?.gscHostedLink ?? null);

  const links = warmInventoryHostedLinksForSite(site, warm);
  const siteUrl = site.siteUrl?.trim() ?? "";
  const gscQueries = gscAllQueriesFromWarmBundle(warm);
  const gscHostedLink =
    siteUrl && gscQueries.length > 0
      ? createBulkGscKeywordsHostedLink(siteUrl, gscQueries)
      : null;

  hostedSnapshotCacheBySiteId.set(site.id, { siteId: site.id, warmKey, links, gscHostedLink });
  return { sitemapInventoryLinks: links, gscHostedLink };
}

/** Sync snapshot for Details drawers (localStorage + memory, no await). */
export function getOverviewSiteWarmDetailsSnapshot(
  site: WordPressSite | null | undefined,
): OverviewSiteWarmDetailsSnapshot {
  if (!site?.id || !site.siteUrl?.trim()) return emptySnapshot;

  // Read epoch so we stay subscribed to store notifications, but cache by site.id + warmKey
  getEntitySiteWarmInflightSnapshot();
  const warm = warmBundleForSite(site);
  if (!warm) {
    return loadingEmptySnapshot;
  }

  const warmKey = warmSnapshotKey(site, warm);
  const cached = detailsSnapshotCacheBySiteId.get(site.id);
  if (cached && cached.warmKey === warmKey) {
    return cached.snapshot;
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
  detailsSnapshotCacheBySiteId.set(site.id, { warmKey, snapshot });
  return snapshot;
}
