import type { WordPressSite } from "@/components/integrations/types";
import { resolveWordPressUrls } from "@/lib/wordpress-api";
import type { ResolvedUrl } from "@/lib/wordpress-api/types";
import { trashWordPressPost } from "@/lib/wordpress-api/crud";
import { isRedirectMapRun } from "@/lib/sitemap-optimizer/build-grid-pulse-redirect-redirects";
import { contentSheetRowsForExport } from "@/lib/sitemap-optimizer/content-sheet-bulk-export";
import { outboundRedirectInventoryRows } from "@/lib/sitemap-optimizer/sitemap-optimizer-download-csv";
import {
  filterMergeableMerges,
  resolvedMemberRows,
} from "@/lib/sitemap-optimizer/resolved-cluster-members";
import { minMembersForMergePublish } from "@/lib/sitemap-optimizer/sitemap-merge-bulk-state";
import type {
  SitemapOptimizerPostRow,
  SitemapOptimizerRunResult,
} from "@/lib/sitemap-optimizer/types";

export type TrashMergeSourceProgress = {
  completed: number;
  total: number;
  currentTitle?: string;
};

export type TrashMergeSourcePostsResult = {
  trashed: number;
  failed: number;
  skipped: number;
  errors: string[];
};

/** Numeric WP post id from row.id or wp:{n} postId (numeric-only). */
export function numericIdFromPostRow(row: SitemapOptimizerPostRow): number | null {
  if (row.id != null && Number.isFinite(row.id) && row.id > 0) {
    return Math.floor(row.id);
  }
  const pid = row.postId.trim();
  if (!pid.startsWith("wp:")) return null;
  const digits = pid.slice(3);
  if (!digits) return null;
  for (const ch of digits) {
    if (ch < "0" || ch > "9") return null;
  }
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function postTypeFromCollection(collection: string): {
  postType: string;
  postTypeEndpoint?: string;
} {
  const c = collection.trim().toLowerCase();
  if (c === "posts") return { postType: "post", postTypeEndpoint: "posts" };
  if (c === "pages") return { postType: "page", postTypeEndpoint: "pages" };
  return { postType: c, postTypeEndpoint: collection.trim() || undefined };
}

function normalizeUrlKey(url: string): string {
  try {
    const u = new URL(url.trim());
    let path = u.pathname.toLowerCase();
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return `${u.origin.toLowerCase()}${path}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

function trashTargetFromRow(
  row: SitemapOptimizerPostRow,
  resolved?: ResolvedUrl,
): { postId: number; postType: string; postTypeEndpoint?: string } | null {
  const numericId = resolved?.id ?? numericIdFromPostRow(row);
  if (numericId == null || !Number.isFinite(numericId) || numericId <= 0) return null;

  const subtype = resolved?.subtype?.trim().toLowerCase() ?? "";
  if (subtype === "page") {
    return { postId: numericId, postType: "page", postTypeEndpoint: "pages" };
  }
  if (subtype === "post") {
    return { postId: numericId, postType: "post", postTypeEndpoint: "posts" };
  }

  const fromCollection = postTypeFromCollection(row.collection);
  if (fromCollection.postType !== "post" && fromCollection.postType !== "page") {
    return {
      postId: numericId,
      postType: fromCollection.postType,
      postTypeEndpoint: fromCollection.postTypeEndpoint,
    };
  }

  if (subtype) {
    return {
      postId: numericId,
      postType: subtype,
      postTypeEndpoint: subtype === "page" ? "pages" : subtype === "post" ? "posts" : subtype,
    };
  }

  return {
    postId: numericId,
    postType: fromCollection.postType,
    postTypeEndpoint: fromCollection.postTypeEndpoint,
  };
}

function collectMergeSourcePostsFromClusters(
  result: SitemapOptimizerRunResult,
): SitemapOptimizerPostRow[] {
  const rowMap = new Map(result.rows.map((r) => [r.postId, r]));
  const sheetMergeRows = contentSheetRowsForExport(result).filter(
    (row) => row.action === "merge" && row.mergeClusterId?.trim(),
  );

  if (sheetMergeRows.length > 0) {
    const seen = new Set<string>();
    const out: SitemapOptimizerPostRow[] = [];
    for (const sheetRow of sheetMergeRows) {
      const cluster = result.clusters.clusters.find(
        (c) => c.clusterId === sheetRow.mergeClusterId,
      );
      const members = cluster
        ? resolvedMemberRows(cluster, rowMap)
        : [rowMap.get(sheetRow.postId)].filter((row): row is SitemapOptimizerPostRow => row != null);
      for (const row of members) {
        if (seen.has(row.postId)) continue;
        seen.add(row.postId);
        out.push(row);
      }
    }
    return out;
  }

  const merges = filterMergeableMerges(
    result.merges,
    result.clusters.clusters,
    result.rows,
    minMembersForMergePublish(result),
  );
  const seen = new Set<string>();
  const out: SitemapOptimizerPostRow[] = [];

  for (const merge of merges) {
    const cluster = result.clusters.clusters.find((c) => c.clusterId === merge.clusterId);
    if (!cluster) continue;
    for (const row of resolvedMemberRows(cluster, rowMap)) {
      if (seen.has(row.postId)) continue;
      seen.add(row.postId);
      out.push(row);
    }
  }
  return out;
}

/** Posts to trash on approve: every inventory URL that gets an outbound redirect (or merge sources on grid flows). */
export function collectMergeSourcePosts(result: SitemapOptimizerRunResult): SitemapOptimizerPostRow[] {
  if (isRedirectMapRun(result) || result.runMode === "grid_csv") {
    return collectMergeSourcePostsFromClusters(result);
  }
  return outboundRedirectInventoryRows(result).map((entry) => entry.row);
}

type TrashTarget = {
  row: SitemapOptimizerPostRow;
  postId: number;
  postType: string;
  postTypeEndpoint?: string;
};

async function resolveTrashTargets(
  site: WordPressSite,
  sources: SitemapOptimizerPostRow[],
): Promise<{ targets: TrashTarget[]; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  const targets: TrashTarget[] = [];
  const needResolve: SitemapOptimizerPostRow[] = [];

  for (const row of sources) {
    const direct = trashTargetFromRow(row);
    if (direct) {
      targets.push({ row, ...direct });
    } else {
      needResolve.push(row);
    }
  }

  if (!needResolve.length) {
    return { targets, skipped: 0, errors };
  }

  const username = site.username?.trim() ?? "";
  const appPassword = site.appPassword?.trim() ?? "";
  if (!username || !appPassword) {
    for (const row of needResolve) {
      errors.push(`${row.title || row.url}: WordPress credentials required to resolve URL to post ID`);
    }
    return { targets, skipped: needResolve.length, errors };
  }

  const entityEndpoint = needResolve.find((r) => {
    const c = r.collection.trim().toLowerCase();
    return c !== "posts" && c !== "pages" && c !== "post" && c !== "page" && c !== "entity";
  })?.collection?.trim();

  const resolveResult = await resolveWordPressUrls(
    site.siteUrl.trim(),
    username,
    appPassword,
    needResolve.map((r) => r.url.trim()),
    site.entitySitemapUrl?.trim() || undefined,
    entityEndpoint?.trim() || undefined,
  );

  const resolvedByKey = new Map<string, ResolvedUrl>();
  for (const item of resolveResult.resolved) {
    resolvedByKey.set(normalizeUrlKey(item.url), item);
  }

  let skipped = 0;
  for (const row of needResolve) {
    const resolved = resolvedByKey.get(normalizeUrlKey(row.url));
    const target = trashTargetFromRow(row, resolved);
    if (target) {
      targets.push({ row, ...target });
    } else {
      skipped += 1;
      const reason =
        resolveResult.unresolvable.find((u) => normalizeUrlKey(u.url) === normalizeUrlKey(row.url))
          ?.reason ?? "Could not resolve URL to a WordPress post ID";
      errors.push(`${row.title || row.url}: ${reason}`);
    }
  }

  return { targets, skipped, errors };
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const idx = next++;
      await fn(items[idx]!);
    }
  }
  const workers = Math.min(Math.max(1, concurrency), items.length || 1);
  await Promise.all(Array.from({ length: workers }, () => worker()));
}

export async function trashMergeSourcePosts(
  site: WordPressSite,
  result: SitemapOptimizerRunResult,
  onProgress?: (p: TrashMergeSourceProgress) => void,
): Promise<TrashMergeSourcePostsResult> {
  const sources = collectMergeSourcePosts(result);
  const { targets, skipped: resolveSkipped, errors: resolveErrors } = await resolveTrashTargets(
    site,
    sources,
  );

  const errors = [...resolveErrors];
  let trashed = 0;
  let failed = 0;
  let completed = 0;
  const total = targets.length;

  const siteUrl = site.siteUrl.trim();
  const username = site.username?.trim() ?? "";
  const appPassword = site.appPassword?.trim() ?? "";

  await mapWithConcurrency(targets, 3, async (target) => {
    const { row, postId, postType, postTypeEndpoint } = target;
    onProgress?.({ completed, total, currentTitle: row.title });
    try {
      const res = await trashWordPressPost(
        siteUrl,
        username,
        appPassword,
        postId,
        postType,
        postTypeEndpoint,
      );
      if (res.success) trashed += 1;
      else {
        failed += 1;
        errors.push(`${row.title || row.url}: ${res.error ?? "Trash failed"}`);
      }
    } catch (e) {
      failed += 1;
      errors.push(`${row.title || row.url}: ${e instanceof Error ? e.message : String(e)}`);
    }
    completed += 1;
    onProgress?.({ completed, total, currentTitle: row.title });
  });

  return { trashed, failed, skipped: resolveSkipped, errors };
}
