import type { WordPressSite } from "@/components/integrations/types";
import { logger } from "@/lib/logger";
import type { SlimLinkCandidate } from "@/lib/overview/overview-blog-links-agent-payload";
import type { OverviewInventoryRow } from "@/lib/overview/overview-inventory-csv";
import { downloadFieldsFromInventoryRow } from "@/lib/overview/overview-inventory-seo-fields";
import { buildOverviewInventorySnapshotFromRows } from "@/lib/overview/overview-parallel-inventory-fetch";
import { urlPathTail } from "@/lib/sitemap-optimizer/build-cluster-catalog-payload";
import type { LinkInventoryBucket } from "@/lib/overview/overview-blog-links-bucket";
import { getSiteInventoryBulk } from "@/lib/wordpress-api";
import type { BulkOptimizerInventorySnapshot } from "@/lib/wordpress-api/inventory-match";
import { snapshotHasInventoryEntries } from "@/lib/wordpress-api/inventory-match";
import {
  getBulkInventorySessionSnapshot,
  setBulkInventorySessionSnapshot,
} from "@/lib/wordpress-bulk-inventory-session-cache";
import type { SitePostInventoryRow } from "@/lib/wordpress-api/types";

export type BlogLinksSiteLinkPool = {
  postInventory: SlimLinkCandidate[];
  pageInventory: SlimLinkCandidate[];
  postCount: number;
  pageCount: number;
};

const poolBySiteId = new Map<string, BlogLinksSiteLinkPool>();

export function getBlogLinksLinkPoolFromSession(siteId: string): BlogLinksSiteLinkPool | null {
  return poolBySiteId.get(siteId) ?? null;
}

function bucketFromCollection(collection: string | undefined): LinkInventoryBucket {
  const coll = (collection ?? "").toLowerCase().trim();
  return coll === "pages" || coll === "page" ? "page" : "post";
}

function slimFromInventoryRow(row: SitePostInventoryRow, bucket: LinkInventoryBucket): SlimLinkCandidate | null {
  const url = row.url?.trim();
  if (!url) return null;
  const fields = downloadFieldsFromInventoryRow(row);
  return {
    url,
    title: (fields?.title ?? row.slug ?? "").trim().slice(0, 80),
    focusKeyword: fields?.focusKeyword?.trim() || undefined,
    bucket,
    slug: urlPathTail(url),
  };
}

export function buildBlogLinksSiteLinkPoolFromSnapshot(
  snapshot: BulkOptimizerInventorySnapshot,
): BlogLinksSiteLinkPool {
  const postInventory: SlimLinkCandidate[] = [];
  const pageInventory: SlimLinkCandidate[] = [];
  const seenPost = new Set<string>();
  const seenPage = new Set<string>();

  for (const row of snapshot.postsMaps.byLink.values()) {
    const slim = slimFromInventoryRow(row, "post");
    if (!slim || seenPost.has(slim.url)) continue;
    seenPost.add(slim.url);
    postInventory.push(slim);
  }
  for (const row of snapshot.pagesMaps.byLink.values()) {
    const slim = slimFromInventoryRow(row, "page");
    if (!slim || seenPage.has(slim.url)) continue;
    seenPage.add(slim.url);
    pageInventory.push(slim);
  }

  return {
    postInventory,
    pageInventory,
    postCount: postInventory.length,
    pageCount: pageInventory.length,
  };
}

export function buildBlogLinksSiteLinkPoolFromRows(rows: OverviewInventoryRow[]): BlogLinksSiteLinkPool {
  const postInventory: SlimLinkCandidate[] = [];
  const pageInventory: SlimLinkCandidate[] = [];

  for (const row of rows) {
    const url = row.url?.trim();
    if (!url) continue;
    const bucket = bucketFromCollection(row.collection);
    const fields = downloadFieldsFromInventoryRow(row as SitePostInventoryRow);
    const slim: SlimLinkCandidate = {
      url,
      title: (fields?.title ?? row.slug ?? "").trim().slice(0, 80),
      focusKeyword: fields?.focusKeyword?.trim() || undefined,
      bucket,
      slug: urlPathTail(url),
    };
    if (bucket === "page") pageInventory.push(slim);
    else postInventory.push(slim);
  }

  return {
    postInventory,
    pageInventory,
    postCount: postInventory.length,
    pageCount: pageInventory.length,
  };
}

function snapshotFromPoolCache(siteId: string): BulkOptimizerInventorySnapshot | null {
  const posts = getBulkInventorySessionSnapshot(siteId, "posts");
  const pages = getBulkInventorySessionSnapshot(siteId, "pages");
  if (posts && pages) {
    return {
      postsMaps: posts.postsMaps,
      pagesMaps: pages.pagesMaps,
      customMapsByCollection: posts.customMapsByCollection ?? pages.customMapsByCollection,
    };
  }
  return posts ?? pages ?? null;
}

/** Use Content Optimizer session inventory when present; one WP bulk only if missing. */
export async function loadBlogLinksLinkInventory(
  site: WordPressSite,
  onProgress?: (message: string) => void,
): Promise<{ pool: BlogLinksSiteLinkPool; snapshot: BulkOptimizerInventorySnapshot; fromCache: boolean } | null> {
  if (!site.id?.trim() || !site.username?.trim() || !site.appPassword?.trim() || !site.siteUrl?.trim()) {
    return null;
  }

  const cachedSnapshot = snapshotFromPoolCache(site.id);
  if (cachedSnapshot && snapshotHasInventoryEntries(cachedSnapshot)) {
    let pool = poolBySiteId.get(site.id);
    if (!pool) {
      pool = buildBlogLinksSiteLinkPoolFromSnapshot(cachedSnapshot);
      poolBySiteId.set(site.id, pool);
    }
    onProgress?.(
      `Content Optimizer inventory: ${pool.postCount} posts | ${pool.pageCount} pages (session cache)`,
    );
    return { pool, snapshot: cachedSnapshot, fromCache: true };
  }

  onProgress?.("Downloading posts + pages inventory…");

  const bulk = await getSiteInventoryBulk(site.siteUrl, site.username, site.appPassword, {
    collections: ["posts", "pages"],
    includeContent: false,
  });

  if (bulk.error?.trim() && !(bulk.rows?.length ?? 0)) {
    logger.warn("[Blog Links] inventory bulk failed:", bulk.error);
    return null;
  }

  const rows = (bulk.rows ?? []) as OverviewInventoryRow[];
  const pool = buildBlogLinksSiteLinkPoolFromRows(rows);
  if (!pool.postCount && !pool.pageCount) return null;

  const snapshot = buildOverviewInventorySnapshotFromRows(rows, site.siteUrl);
  setBulkInventorySessionSnapshot(site.id, "posts", snapshot);
  setBulkInventorySessionSnapshot(site.id, "pages", snapshot);
  poolBySiteId.set(site.id, pool);

  onProgress?.(`Posts: ${pool.postCount} | Pages: ${pool.pageCount} ready.`);
  return { pool, snapshot, fromCache: false };
}
