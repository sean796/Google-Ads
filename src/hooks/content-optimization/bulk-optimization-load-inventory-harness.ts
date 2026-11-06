import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewInventoryRow } from "@/lib/overview/overview-inventory-csv";
import {
  buildOverviewInventorySnapshotFromRows,
  fetchOverviewInventoryForSource,
} from "@/lib/overview/overview-parallel-inventory-fetch";
import { getSiteInventoryBulk } from "@/lib/wordpress-api";
import type { BulkOptimizerInventorySnapshot } from "@/lib/wordpress-api/inventory-match";
import {
  buildInventoryLookupMaps,
  snapshotHasInventoryEntries,
} from "@/lib/wordpress-api/inventory-match";
import {
  getBulkInventorySessionSnapshot,
  setBulkInventorySessionSnapshot,
} from "@/lib/wordpress-bulk-inventory-session-cache";
import { resolveWarmBulkInventorySnapshot, seedBulkInventorySessionFromSiteWarmCache } from "@/lib/bulk/seed-bulk-session-from-site-warm-cache";

function mergePostsPagesSnapshotFromSession(
  siteId: string,
  siteUrl: string,
): BulkOptimizerInventorySnapshot | null {
  const empty = buildInventoryLookupMaps([], siteUrl);
  const postsSnap = getBulkInventorySessionSnapshot(siteId, "posts");
  const pagesSnap = getBulkInventorySessionSnapshot(siteId, "pages");

  const postsMaps =
    postsSnap?.postsMaps?.byLink.size ? postsSnap.postsMaps : empty;
  const pagesMaps =
    pagesSnap?.pagesMaps?.byLink.size
      ? pagesSnap.pagesMaps
      : postsSnap?.pagesMaps?.byLink.size
        ? postsSnap.pagesMaps
        : empty;

  if (!postsMaps.byLink.size || !pagesMaps.byLink.size) {
    return null;
  }

  return {
    postsMaps,
    pagesMaps,
    customMapsByCollection: {},
  };
}

/** Posts + pages inventory for internal linking (entity/SAP runs). One bulk fetch when session cache is empty. */
export async function ensurePostsPagesInventoryForLinking(
  site: WordPressSite,
  onProgress?: (message: string) => void,
): Promise<BulkOptimizerInventorySnapshot> {
  if (!site.username?.trim() || !site.appPassword?.trim() || !site.siteUrl?.trim()) {
    throw new Error(
      "Bulk content optimization requires WordPress inventory. Load the site inventory first (Content tab / Integrations), then retry.",
    );
  }

  const fromSession = mergePostsPagesSnapshotFromSession(site.id, site.siteUrl);
  if (fromSession) {
    onProgress?.("Using posts and pages inventory for linking (session cache).");
    return fromSession;
  }

  onProgress?.("Loading posts and pages inventory for linking...");

  const empty = buildInventoryLookupMaps([], site.siteUrl);
  const postsSnap = getBulkInventorySessionSnapshot(site.id, "posts");
  const pagesSnap = getBulkInventorySessionSnapshot(site.id, "pages");
  const postsReady = Boolean(postsSnap?.postsMaps?.byLink.size);
  const pagesReady = Boolean(
    pagesSnap?.pagesMaps?.byLink.size || postsSnap?.pagesMaps?.byLink.size,
  );

  const collectionsToFetch: ("posts" | "pages")[] = [];
  if (!postsReady) collectionsToFetch.push("posts");
  if (!pagesReady) collectionsToFetch.push("pages");

  const bulk = await getSiteInventoryBulk(site.siteUrl, site.username, site.appPassword, {
    collections: collectionsToFetch.length > 0 ? collectionsToFetch : ["posts", "pages"],
    includeContent: false,
  });

  if (bulk.error?.trim() && !(bulk.rows?.length ?? 0)) {
    throw new Error(bulk.error.trim());
  }

  const rows = (bulk.rows ?? []) as OverviewInventoryRow[];
  if (!rows.length && (!postsReady || !pagesReady)) {
    throw new Error("No published posts or pages returned from WordPress inventory.");
  }

  const fetched = rows.length
    ? buildOverviewInventorySnapshotFromRows(rows, site.siteUrl)
    : null;

  const postsMaps = postsReady
    ? postsSnap!.postsMaps
    : fetched?.postsMaps ?? empty;
  const pagesMaps = pagesReady
    ? pagesSnap?.pagesMaps?.byLink.size
      ? pagesSnap.pagesMaps
      : postsSnap!.pagesMaps
    : fetched?.pagesMaps ?? empty;

  if (!postsMaps.byLink.size || !pagesMaps.byLink.size) {
    throw new Error("Posts and pages inventory required for entity linking.");
  }

  const snapshot: BulkOptimizerInventorySnapshot = {
    postsMaps,
    pagesMaps,
    customMapsByCollection: {},
  };

  setBulkInventorySessionSnapshot(site.id, "posts", snapshot);
  setBulkInventorySessionSnapshot(site.id, "pages", snapshot);

  return snapshot;
}

/** Entity/SAP bucket — session only, no WordPress re-fetch. */
export async function ensureSapInventoryForHarness(
  site: WordPressSite,
  onProgress?: (message: string) => void,
  _options?: { includeContent?: boolean; includeRawAcf?: boolean },
): Promise<BulkOptimizerInventorySnapshot> {
  if (!site.username?.trim() || !site.appPassword?.trim() || !site.siteUrl?.trim()) {
    throw new Error(
      "Bulk content optimization requires WordPress inventory. Load the site inventory first (Content tab / Integrations), then retry.",
    );
  }
  if (!site.entitySitemapUrl?.trim()) {
    throw new Error("Entity sitemap URL is required in Integrations for entity optimization.");
  }

  const sapSnap = getBulkInventorySessionSnapshot(site.id, "sap");
  if (sapSnap && snapshotHasInventoryEntries(sapSnap)) {
    onProgress?.("Using entity sitemap inventory (session cache).");
    return sapSnap;
  }

  throw new Error(
    "Entity inventory not in session. Load the SAP sitemap in Content Opt first.",
  );
}

/** Posts bucket — session only, no WordPress re-fetch. */
export async function ensurePostsInventoryForHarness(
  site: WordPressSite,
  onProgress?: (message: string) => void,
): Promise<BulkOptimizerInventorySnapshot> {
  const emptyPosts = buildInventoryLookupMaps([], site.siteUrl);
  const emptyPages = buildInventoryLookupMaps([], site.siteUrl);
  if (!site.username?.trim() || !site.appPassword?.trim() || !site.siteUrl?.trim()) {
    throw new Error(
      "Bulk content optimization requires WordPress inventory. Load the site inventory first (Content tab / Integrations), then retry.",
    );
  }

  seedBulkInventorySessionFromSiteWarmCache(site);

  const postsSnap = getBulkInventorySessionSnapshot(site.id, "posts");
  if (postsSnap?.postsMaps?.byLink.size) {
    onProgress?.("Using posts inventory (session cache).");
    return {
      postsMaps: postsSnap.postsMaps,
      pagesMaps: emptyPages,
      customMapsByCollection: {},
    };
  }

  onProgress?.("Posts inventory missing from session (continuing).");
  return {
    postsMaps: emptyPosts,
    pagesMaps: emptyPages,
    customMapsByCollection: {},
  };
}

/** Pages bucket — session only, no WordPress re-fetch. */
export async function ensurePagesInventoryForHarness(
  site: WordPressSite,
  onProgress?: (message: string) => void,
): Promise<BulkOptimizerInventorySnapshot> {
  const emptyPosts = buildInventoryLookupMaps([], site.siteUrl);
  const emptyPages = buildInventoryLookupMaps([], site.siteUrl);
  if (!site.username?.trim() || !site.appPassword?.trim() || !site.siteUrl?.trim()) {
    throw new Error(
      "Bulk content optimization requires WordPress inventory. Load the site inventory first (Content tab / Integrations), then retry.",
    );
  }

  seedBulkInventorySessionFromSiteWarmCache(site);

  const pagesSnap = getBulkInventorySessionSnapshot(site.id, "pages");
  if (pagesSnap?.pagesMaps?.byLink.size) {
    onProgress?.("Using pages inventory (session cache).");
    return {
      postsMaps: emptyPosts,
      pagesMaps: pagesSnap.pagesMaps,
      customMapsByCollection: {},
    };
  }

  const postsSnap = getBulkInventorySessionSnapshot(site.id, "posts");
  if (postsSnap?.pagesMaps?.byLink.size) {
    onProgress?.("Using pages inventory (session cache).");
    return {
      postsMaps: emptyPosts,
      pagesMaps: postsSnap.pagesMaps,
      customMapsByCollection: {},
    };
  }

  onProgress?.("Pages inventory missing from session (continuing).");
  return {
    postsMaps: emptyPosts,
    pagesMaps: emptyPages,
    customMapsByCollection: {},
  };
}

/** Pages bucket only (entity What We Offer table). One fetch when session cache is empty. */
export async function ensurePagesInventoryForLinking(
  site: WordPressSite,
  onProgress?: (message: string) => void,
): Promise<BulkOptimizerInventorySnapshot> {
  if (!site.username?.trim() || !site.appPassword?.trim() || !site.siteUrl?.trim()) {
    throw new Error(
      "Bulk content optimization requires WordPress inventory. Load the site inventory first (Content tab / Integrations), then retry.",
    );
  }

  const pagesSnap = getBulkInventorySessionSnapshot(site.id, "pages");
  if (pagesSnap?.pagesMaps.byLink.size) {
    onProgress?.("Using pages inventory for offer table (session cache).");
    return {
      postsMaps: buildInventoryLookupMaps([], site.siteUrl),
      pagesMaps: pagesSnap.pagesMaps,
      customMapsByCollection: {},
    };
  }

  const postsSnap = getBulkInventorySessionSnapshot(site.id, "posts");
  if (postsSnap?.pagesMaps.byLink.size) {
    onProgress?.("Using pages inventory for offer table (session cache).");
    return {
      postsMaps: buildInventoryLookupMaps([], site.siteUrl),
      pagesMaps: postsSnap.pagesMaps,
      customMapsByCollection: {},
    };
  }

  onProgress?.("Loading pages inventory for offer table...");

  const fetched = await fetchOverviewInventoryForSource(site, "pages", {
    includeContent: false,
  });

  if (fetched.error?.trim() && !fetched.rows.length) {
    throw new Error(fetched.error.trim());
  }
  if (!fetched.rows.length) {
    throw new Error("No published pages returned from WordPress inventory.");
  }

  const snapshot = buildOverviewInventorySnapshotFromRows(fetched.rows, site.siteUrl);
  setBulkInventorySessionSnapshot(site.id, "pages", snapshot);

  return {
    postsMaps: buildInventoryLookupMaps([], site.siteUrl),
    pagesMaps: snapshot.pagesMaps,
    customMapsByCollection: {},
  };
}

/**
 * Posts + pages for internal link catalog (all bulk runs).
 * Session first; fetches missing bucket via ensurePostsPagesInventoryForLinking.
 */
export async function ensureMergedPostsPagesLinkPool(
  site: WordPressSite,
  onProgress?: (message: string) => void,
  options?: { warmCacheOnly?: boolean },
): Promise<BulkOptimizerInventorySnapshot> {
  seedBulkInventorySessionFromSiteWarmCache(site);
  const fromSession = mergePostsPagesSnapshotFromSession(site.id, site.siteUrl);
  if (fromSession) {
    onProgress?.("Using posts and pages inventory for linking (session cache).");
    return fromSession;
  }

  const warm = resolveWarmBulkInventorySnapshot(site, "posts");
  if (warm && warm.postsMaps.byLink.size && warm.pagesMaps.byLink.size) {
    onProgress?.("Using posts and pages inventory for linking (site cache).");
    return {
      postsMaps: warm.postsMaps,
      pagesMaps: warm.pagesMaps,
      customMapsByCollection: warm.customMapsByCollection ?? {},
    };
  }

  if (options?.warmCacheOnly) {
    if (warm && warm.postsMaps.byLink.size) {
      onProgress?.("Using posts inventory for linking (site cache).");
      return {
        postsMaps: warm.postsMaps,
        pagesMaps: warm.pagesMaps.byLink.size ? warm.pagesMaps : buildInventoryLookupMaps([], site.siteUrl),
        customMapsByCollection: warm.customMapsByCollection ?? {},
      };
    }
    throw new Error(
      "Posts and pages inventory is not in site cache yet. Refresh site data or load the sitemap once, then retry.",
    );
  }

  const snapshot = await ensurePostsPagesInventoryForLinking(site, onProgress);
  if (!snapshot.postsMaps.byLink.size) {
    throw new Error(
      "Posts inventory is empty. Load the posts sitemap in Content Opt, then retry.",
    );
  }
  if (!snapshot.pagesMaps.byLink.size) {
    throw new Error(
      "Pages inventory is empty. Load the pages sitemap in Content Opt, then retry.",
    );
  }
  return snapshot;
}
