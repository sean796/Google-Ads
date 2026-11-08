import type { WordPressSite } from "@/components/integrations/types";
import { extractEndpointFromEntitySitemapUrl } from "@/lib/entity-endpoint-extractor";
import type { OverviewInventoryRow } from "@/lib/overview/overview-inventory-csv";
import {
  buildOverviewInventorySnapshotFromRows,
  fetchOverviewInventoryForSource,
} from "@/lib/overview/overview-parallel-inventory-fetch";
import { overviewInventoryCollectionsFromSource } from "@/lib/overview/overview-sitemap-source";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import type { BulkOptimizerInventorySnapshot } from "@/lib/wordpress-api/inventory-match";
import {
  buildInventoryLookupMaps,
  inventoryRowHasUsableBodyContent,
  lookupInventoryRowWithSource,
  snapshotHasInventoryEntries,
} from "@/lib/wordpress-api/inventory-match";
import { readKeywordFocusFromAcfFields } from "@/lib/content-generation/ai-driven-post-fields-reader";
import { readKeywordFromInventoryRow } from "./bulk-optimization-grep-fields";
import {
  getBulkInventorySessionSnapshot,
  getMergedBulkInventorySessionSnapshot,
  setBulkInventorySessionSnapshot,
} from "@/lib/wordpress-bulk-inventory-session-cache";
import { resolveWarmBulkInventorySnapshot, seedBulkInventorySessionFromSiteWarmCache } from "@/lib/bulk/seed-bulk-session-from-site-warm-cache";

const GENERIC_WP_COLLECTIONS = new Set(["posts", "post", "pages", "page"]);

function isGenericWpCollection(endpoint: string): boolean {
  return GENERIC_WP_COLLECTIONS.has(endpoint.toLowerCase().trim());
}

/** REST collections across all Overview buckets (legacy single-call list). */
export function bulkOptimizerInventoryCollections(site: WordPressSite): string[] {
  const out = new Set<string>(["posts", "pages"]);

  const entityEp = site.entitySitemapUrl
    ? extractEndpointFromEntitySitemapUrl(site.entitySitemapUrl)
    : "";
  if (entityEp && !isGenericWpCollection(entityEp)) out.add(entityEp);

  const manual = site.manualEndpoint?.trim();
  if (manual && !isGenericWpCollection(manual)) out.add(manual);

  if (site.sitemaps?.mainSitemapUrl) {
    for (const col of overviewInventoryCollectionsFromSource("pages", site)) {
      out.add(col);
    }
  }

  return [...out];
}

/**
 * Bulk optimizer inventory: session cache only (filled when Overview loads the sitemap).
 * Never hits WordPress from this path.
 */
export function getBulkOptimizerInventoryFromSession(
  site: WordPressSite,
  onProgress?: (message: string) => void,
  preferredSource?: OverviewSitemapSource,
): BulkOptimizerInventorySnapshot | null {
  if (!site.username?.trim() || !site.appPassword?.trim() || !site.siteUrl?.trim()) {
    return null;
  }

  const fromPreferred = preferredSource
    ? getBulkInventorySessionSnapshot(site.id, preferredSource)
    : null;
  const cached = getMergedBulkInventorySessionSnapshot(site.id) ?? fromPreferred;
  if (cached) {
    onProgress?.("Using WordPress inventory from this session (no re-fetch).");
  }
  return cached;
}

/** Prefer source bucket when it covers every batch URL; otherwise use merged session inventory. */
export function resolveBulkOptimizerInventoryForUrls(
  site: WordPressSite,
  urls: string[],
  preferredSource?: OverviewSitemapSource,
): BulkOptimizerInventorySnapshot | null {
  if (!site.username?.trim() || !site.appPassword?.trim() || !site.siteUrl?.trim()) {
    return null;
  }

  const merged = getMergedBulkInventorySessionSnapshot(site.id);
  const fromPreferred = preferredSource
    ? getBulkInventorySessionSnapshot(site.id, preferredSource)
    : null;
  const targetUrls = urls.map((u) => u.trim()).filter(Boolean);
  if (!targetUrls.length) {
    return merged ?? fromPreferred;
  }

  const coversAllUrls = (snapshot: BulkOptimizerInventorySnapshot | null) =>
    Boolean(
      snapshot &&
        snapshotHasInventoryEntries(snapshot) &&
        targetUrls.every(
          (targetUrl) =>
            lookupInventoryRowWithSource(snapshot, site.siteUrl, targetUrl, "other")?.row,
        ),
    );

  if (coversAllUrls(fromPreferred)) return fromPreferred;
  if (coversAllUrls(merged)) return merged;
  return merged ?? fromPreferred;
}

function bulkSnapshotCoversUrls(
  snapshot: BulkOptimizerInventorySnapshot | null,
  site: WordPressSite,
  urls: string[],
): boolean {
  if (!snapshot || !snapshotHasInventoryEntries(snapshot)) return false;
  const targetUrls = urls.map((u) => u.trim()).filter(Boolean);
  if (!targetUrls.length) return true;
  return targetUrls.every(
    (targetUrl) =>
      lookupInventoryRowWithSource(snapshot, site.siteUrl, targetUrl, "other")?.row,
  );
}

export type BulkOptimizerInventoryRunRequirements = {
  requireBody?: boolean;
  requireKeyword?: boolean;
};

/** Session cache counts only when every batch URL has the fields needed for the run (not harness CSV rows). */
export function bulkSnapshotReadyForRun(
  snapshot: BulkOptimizerInventorySnapshot | null,
  site: WordPressSite,
  urls: string[],
  requirements: BulkOptimizerInventoryRunRequirements = {},
): boolean {
  const requireBody = requirements.requireBody !== false;
  const requireKeyword = requirements.requireKeyword !== false;
  if (!bulkSnapshotCoversUrls(snapshot, site, urls)) return false;

  for (const targetUrl of urls.map((u) => u.trim()).filter(Boolean)) {
    const hit = lookupInventoryRowWithSource(snapshot!, site.siteUrl, targetUrl, "other");
    if (!hit?.row?.id) return false;
    if (requireBody && !inventoryRowHasUsableBodyContent(hit.row)) return false;
    if (requireKeyword) {
      if (!readKeywordFromInventoryRow(hit.row)) return false;
    }
  }
  return true;
}

/**
 * Session cache only. Never hits WordPress. Optimize Content already has inventory
 * from the Content Opt / warm load — use it and run.
 */
export async function ensureBulkOptimizerInventoryForRun(
  site: WordPressSite,
  urls: string[],
  preferredSource?: OverviewSitemapSource,
  onProgress?: (message: string) => void,
  _requirements: BulkOptimizerInventoryRunRequirements = {},
  options?: { warmCacheOnly?: boolean },
): Promise<BulkOptimizerInventorySnapshot> {
  if (!site.username?.trim() || !site.appPassword?.trim() || !site.siteUrl?.trim()) {
    throw new Error(
      "Bulk content optimization requires WordPress inventory. Load the site inventory first (Content tab / Integrations), then retry.",
    );
  }

  seedBulkInventorySessionFromSiteWarmCache(site);

  const cached =
    resolveBulkOptimizerInventoryForUrls(site, urls, preferredSource) ??
    getMergedBulkInventorySessionSnapshot(site.id) ??
    (preferredSource ? getBulkInventorySessionSnapshot(site.id, preferredSource) : null);

  if (cached && snapshotHasInventoryEntries(cached) && bulkSnapshotCoversUrls(cached, site, urls)) {
    onProgress?.("Using WordPress inventory from this session (no re-fetch).");
    return cached;
  }

  const warmSnapshot = resolveWarmBulkInventorySnapshot(site, preferredSource);
  if (warmSnapshot && snapshotHasInventoryEntries(warmSnapshot)) {
    onProgress?.("Using WordPress inventory from site cache (no re-fetch).");
    return warmSnapshot;
  }

  if (options?.warmCacheOnly) {
    throw new Error(
      "WordPress inventory is not in site cache yet. Refresh site data or load the sitemap once, then retry.",
    );
  }

  if (preferredSource) {
    onProgress?.(`Loading ${preferredSource} inventory…`);
    const fetched = await fetchOverviewInventoryForSource(site, preferredSource, {
      includeContent: false,
    });
    if (fetched.error?.trim() && !fetched.rows.length) {
      throw new Error(fetched.error.trim());
    }
    if (!fetched.rows.length) {
      throw new Error(`No URLs found in ${preferredSource} inventory.`);
    }
    const snapshot = buildOverviewInventorySnapshotFromRows(fetched.rows, site.siteUrl);
    setBulkInventorySessionSnapshot(site.id, preferredSource, snapshot);
    onProgress?.("Using WordPress inventory from live fetch.");
    return snapshot;
  }

  onProgress?.("Loading posts and pages inventory…");
  const linked = await ensurePostsPagesInventoryForLinking(site, onProgress);
  if (snapshotHasInventoryEntries(linked)) {
    return linked;
  }

  throw new Error(
    "Bulk content optimization requires WordPress inventory. Load the sitemap first (Content tab), then retry.",
  );
}
import { ensurePostsPagesInventoryForLinking } from "./bulk-optimization-load-inventory-harness";

export {
  ensureMergedPostsPagesLinkPool,
  ensurePagesInventoryForHarness,
  ensurePagesInventoryForLinking,
  ensurePostsInventoryForHarness,
  ensurePostsPagesInventoryForLinking,
  ensureSapInventoryForHarness,
} from "./bulk-optimization-load-inventory-harness";

/** Session cache only; does not fetch WordPress. */
export async function loadBulkOptimizerInventorySnapshot(
  site: WordPressSite,
  onProgress?: (message: string) => void,
  preferredSource?: OverviewSitemapSource,
): Promise<BulkOptimizerInventorySnapshot | null> {
  return getBulkOptimizerInventoryFromSession(site, onProgress, preferredSource);
}
