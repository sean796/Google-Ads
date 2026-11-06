import type { WordPressSite } from "@/components/integrations/types";
import {
  ensurePagesInventoryForLinking,
  ensurePostsPagesInventoryForLinking,
  ensureSapInventoryForHarness,
} from "@/hooks/content-optimization/bulk-optimization-load-inventory-snapshot";
import {
  resolveTaskExecutionInventoryFromWarmCache,
  seedBulkInventorySessionFromSiteWarmCache,
} from "@/lib/bulk/seed-bulk-session-from-site-warm-cache";
import {
  buildOverviewInventorySnapshotFromRows,
  fetchOverviewInventoryForSource,
} from "@/lib/overview/overview-parallel-inventory-fetch";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { overviewUrlsFromBucketRows } from "@/lib/overview/overview-unified-sitemap-inventory";
import type { TaskExecutionTargetBucket } from "@/lib/task-execution-bucket";
import {
  lookupInventoryRow,
  type BulkInventoryTypeHint,
  type BulkOptimizerInventorySnapshot,
} from "@/lib/wordpress-api/inventory-match";
import {
  getBulkInventorySessionSnapshot,
  setBulkInventorySessionSnapshot,
} from "@/lib/wordpress-bulk-inventory-session-cache";

export type TaskExecutionBucketInventory = {
  urls: string[];
  snapshot: BulkOptimizerInventorySnapshot;
};

export type TaskExecutionBucketInventoryOptions = {
  includeContent?: boolean;
};

export function bucketToInventoryTypeHint(bucket: TaskExecutionTargetBucket): BulkInventoryTypeHint {
  if (bucket === "pages") return "page";
  if (bucket === "posts") return "post";
  return "other";
}

/** Map audit/CSV URLs onto inventory links (slash and www differences). */
export function workUrlsFromExplicitTargets(
  targetUrls: string[],
  snapshot: BulkOptimizerInventorySnapshot,
  siteUrl: string,
  bucket: TaskExecutionTargetBucket,
): string[] {
  const hint = bucketToInventoryTypeHint(bucket);
  return targetUrls.map((url) => {
    const row = lookupInventoryRow(snapshot, siteUrl, url, hint);
    const matched = String(row?.url ?? "").trim();
    return matched || url;
  });
}

function urlsFromSnapshot(snapshot: BulkOptimizerInventorySnapshot, source: OverviewSitemapSource): string[] {
  const urls = new Set<string>();
  if (source === "posts") {
    for (const link of snapshot.postsMaps.byLink.keys()) urls.add(link);
  } else if (source === "pages") {
    for (const link of snapshot.pagesMaps.byLink.keys()) urls.add(link);
  } else {
    for (const maps of Object.values(snapshot.customMapsByCollection ?? {})) {
      for (const link of maps.byLink.keys()) urls.add(link);
    }
  }
  return [...urls];
}

function urlsFromSessionBucket(site: WordPressSite, source: OverviewSitemapSource): string[] | null {
  const snap = getBulkInventorySessionSnapshot(site.id, source);
  if (!snap) return null;
  const urls = urlsFromSnapshot(snap, source);
  return urls.length > 0 ? urls : null;
}

async function fetchBucketInventory(
  site: WordPressSite,
  source: OverviewSitemapSource,
  onProgress?: (message: string) => void,
  includeContent = false,
): Promise<TaskExecutionBucketInventory> {
  if (!includeContent) {
    const fromSession = urlsFromSessionBucket(site, source);
    if (fromSession?.length) {
      onProgress?.(`Using ${source} inventory from this session.`);
      return {
        urls: fromSession,
        snapshot: getBulkInventorySessionSnapshot(site.id, source)!,
      };
    }
  }

  onProgress?.(`Loading ${source} inventory…`);
  const fetched = await fetchOverviewInventoryForSource(site, source, {
    includeContent,
  });
  if (fetched.errors && Object.keys(fetched.errors).length > 0 && !fetched.rows.length) {
    const first = Object.values(fetched.errors).find(Boolean);
    if (first) throw new Error(String(first));
  }
  const urls = overviewUrlsFromBucketRows(fetched.rows);
  if (!urls.length) {
    throw new Error(`No URLs found in ${source} inventory.`);
  }

  const snapshot = buildOverviewInventorySnapshotFromRows(fetched.rows, site.siteUrl);
  setBulkInventorySessionSnapshot(site.id, source, snapshot);

  return { urls, snapshot };
}

export async function resolveTaskExecutionBucketInventory(
  site: WordPressSite,
  bucket: TaskExecutionTargetBucket,
  onProgress?: (message: string) => void,
  options?: TaskExecutionBucketInventoryOptions,
): Promise<TaskExecutionBucketInventory> {
  const includeContent = options?.includeContent === true;
  if (!includeContent) {
    seedBulkInventorySessionFromSiteWarmCache(site);
    const fromWarm = resolveTaskExecutionInventoryFromWarmCache(site, bucket);
    if (fromWarm) {
      onProgress?.("Using site cache (warm prefetch).");
      return fromWarm;
    }
  }

  if (bucket === "all") {
    if (includeContent) {
      const posts = await fetchBucketInventory(site, "posts", onProgress, true);
      const pages = await fetchBucketInventory(site, "pages", onProgress, true);
      const urls = [...new Set([...posts.urls, ...pages.urls])];
      if (!urls.length) throw new Error("No URLs found in WordPress inventory.");
      return {
        urls,
        snapshot: {
          postsMaps: posts.snapshot.postsMaps,
          pagesMaps: pages.snapshot.pagesMaps,
          ...(pages.snapshot.customMapsByCollection || posts.snapshot.customMapsByCollection
            ? {
                customMapsByCollection: {
                  ...(posts.snapshot.customMapsByCollection ?? {}),
                  ...(pages.snapshot.customMapsByCollection ?? {}),
                },
              }
            : {}),
        },
      };
    }
    const snapshot = await ensurePostsPagesInventoryForLinking(site, onProgress);
    const urls = new Set<string>();
    for (const link of snapshot.postsMaps.byLink.keys()) urls.add(link);
    for (const link of snapshot.pagesMaps.byLink.keys()) urls.add(link);
    if (urls.size === 0) {
      throw new Error("No URLs found in WordPress inventory.");
    }
    return { urls: [...urls], snapshot };
  }

  if (bucket === "pages") {
    if (!includeContent) {
      const snapshot = await ensurePagesInventoryForLinking(site, onProgress);
      const urls = [...snapshot.pagesMaps.byLink.keys()];
      if (!urls.length) throw new Error("No URLs found in pages inventory.");
      return { urls, snapshot };
    }
    return fetchBucketInventory(site, "pages", onProgress, true);
  }

  if (bucket === "sap") {
    if (!includeContent) {
      try {
        const snapshot = await ensureSapInventoryForHarness(site, onProgress);
        const urls = urlsFromSnapshot(snapshot, "sap");
        if (urls.length > 0) return { urls, snapshot };
      } catch {
        /* fall through to fetch */
      }
    }
    return fetchBucketInventory(site, "sap", onProgress, includeContent);
  }

  return fetchBucketInventory(site, "posts", onProgress, includeContent);
}

export async function resolveTaskExecutionBucketUrls(
  site: WordPressSite,
  bucket: TaskExecutionTargetBucket,
  onProgress?: (message: string) => void,
): Promise<string[]> {
  const resolved = await resolveTaskExecutionBucketInventory(site, bucket, onProgress);
  return resolved.urls;
}
