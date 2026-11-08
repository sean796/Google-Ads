import {
  overviewBindingForRow,
  restCollectionEndpointForSubtype,
  resolveOverviewBindingForRow,
} from "@/lib/overview/overview-bulk-seo-payload";
import { downloadFieldsFromInventoryRow } from "@/lib/overview/overview-inventory-seo-fields";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import type {
  BulkInventoryTypeHint,
  BulkOptimizerInventorySnapshot,
  InventoryLookupMaps,
  InventoryRowSource,
} from "@/lib/wordpress-api/inventory-match";
import {
  lookupInventoryRowWithSource,
  normalizeMatch,
  snapshotHasInventoryEntries,
} from "@/lib/wordpress-api/inventory-match";
import type { SitePostInventoryRow } from "@/lib/wordpress-api/types";
import {
  getAnyBulkInventorySessionSnapshot,
  getBulkInventorySessionSnapshot,
} from "@/lib/wordpress-bulk-inventory-session-cache";
import type { PrefilledOverviewTarget } from "./bulk-optimization-params";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";
import type { OverviewInventoryUrlMatch } from "@/lib/overview/overview-row-scrape";

function collectUniqueInventoryRows(snapshot: BulkOptimizerInventorySnapshot): SitePostInventoryRow[] {
  const byId = new Map<number, SitePostInventoryRow>();
  const addFromMaps = (maps: InventoryLookupMaps | undefined) => {
    if (!maps) return;
    for (const row of maps.byLink.values()) {
      if (row.id) byId.set(row.id, row);
    }
  };
  addFromMaps(snapshot.postsMaps);
  addFromMaps(snapshot.pagesMaps);
  for (const maps of Object.values(snapshot.customMapsByCollection ?? {})) {
    addFromMaps(maps);
  }
  return [...byId.values()];
}

function inventoryTypeHint(source?: OverviewSitemapSource): BulkInventoryTypeHint {
  if (source === "pages") return "page";
  if (source === "posts") return "post";
  return "other";
}

function invMatchFromHit(
  hit: { row: SitePostInventoryRow; source: InventoryRowSource },
): OverviewInventoryUrlMatch {
  const subtype =
    hit.source === "pages" ? "page" : hit.source === "posts" ? "post" : hit.source;
  return { row: hit.row, subtype: subtype as OverviewInventoryUrlMatch["subtype"] };
}

/** Same matching as sitemap inventory CSV: session snapshot, pages bucket + CPT maps. */
export function lookupOverviewInventoryHitForUrl(
  site: WordPressSite,
  url: string,
  sitemapSource?: OverviewSitemapSource,
): { row: SitePostInventoryRow; source: InventoryRowSource } | undefined {
  const snapshot =
    (sitemapSource ? getBulkInventorySessionSnapshot(site.id, sitemapSource) : null) ??
    getAnyBulkInventorySessionSnapshot(site.id);
  if (!snapshot || !snapshotHasInventoryEntries(snapshot)) return undefined;

  const primaryHint = inventoryTypeHint(sitemapSource);
  let hit = lookupInventoryRowWithSource(snapshot, site.siteUrl, url, primaryHint);
  if (!hit?.row?.id && sitemapSource === "pages") {
    hit = lookupInventoryRowWithSource(snapshot, site.siteUrl, url, "other");
  }
  return hit?.row?.id ? hit : undefined;
}

function bindingForUrlFromMap(
  url: string,
  bindings: Record<string, OverviewBinding | undefined>,
  siteUrl: string,
): OverviewBinding | undefined {
  const direct = bindings[url];
  if (direct?.postId) return direct;
  const norm = normalizeMatch(siteUrl, url);
  if (!norm) return undefined;
  for (const [key, binding] of Object.entries(bindings)) {
    if (!binding?.postId || !key?.trim()) continue;
    if (normalizeMatch(siteUrl, key) === norm) return binding;
  }
  return undefined;
}

/** Link/title list for internal link finalize without createSiteCache. */
export function wordPressPostsFromInventorySnapshot(snapshot: BulkOptimizerInventorySnapshot): Array<{
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  link: string;
  date_gmt: string;
}> {
  return collectUniqueInventoryRows(snapshot).map((row) => ({
    id: row.id,
    slug: row.slug || "",
    title: String(row.fields?.title ?? ""),
    excerpt: String(row.fields?.excerpt ?? ""),
    link: row.url,
    date_gmt: row.date_gmt ?? "",
  }));
}

export function seedSeoExtraTextCachesFromOverviewTargets(
  urls: string[],
  prefilledOverviewTargets: Record<string, PrefilledOverviewTarget>,
  prefilledUrlKeywords: Record<string, string>,
  prefetchedPendingCache: Map<number, { pending: Record<string, unknown>; primaryKeyword: string }>,
  prefetchedPostFieldsCache: Map<number, Record<string, unknown>>,
): void {
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]?.trim();
    if (!url) continue;
    const target = prefilledOverviewTargets[url];
    if (!target) continue;

    const keyword = (target.keyword || prefilledUrlKeywords[url] || "").trim();
    const postType = (target.postType || "page").trim() || "page";
    const postTypeEndpoint =
      target.postTypeEndpoint?.trim() || restCollectionEndpointForSubtype(postType);

    prefetchedPostFieldsCache.set(i, { keyword_focus: keyword });
    prefetchedPendingCache.set(i, {
      primaryKeyword: keyword,
      pending: {
        existingPost: {
          id: target.postId,
          postTypeSubtype: postType,
          postTypeEndpoint,
          title: "",
          content: target.content || "",
          excerpt: "",
          link: url,
        },
      },
    });
  }
}

/** Grid + session inventory CSV snapshot only; no live bind or resolve-urls. */
export function buildPrefilledTargetsFromOverviewRows(
  rows: OverviewRow[],
  bindings: Record<string, OverviewBinding | undefined>,
  getInventoryMatchForUrl: (
    site: WordPressSite | null,
    url: string,
  ) => OverviewInventoryUrlMatch | undefined,
  site: WordPressSite | null,
  sitemapSource?: OverviewSitemapSource,
): {
  prefilledOverviewTargets: Record<string, PrefilledOverviewTarget>;
  prefilledUrlKeywords: Record<string, string>;
} {
  const prefilledOverviewTargets: Record<string, PrefilledOverviewTarget> = {};
  const prefilledUrlKeywords: Record<string, string> = {};

  for (const row of rows) {
    const trimmedUrl = row.url?.trim();
    if (!trimmedUrl) continue;
    const kw = row.focusKeyword?.trim();
    if (kw) prefilledUrlKeywords[trimmedUrl] = kw;

    const snapshotHit = site ? lookupOverviewInventoryHitForUrl(site, trimmedUrl, sitemapSource) : undefined;
    const invMatch =
      snapshotHit != null
        ? invMatchFromHit(snapshotHit)
        : site
          ? getInventoryMatchForUrl(site, trimmedUrl)
          : undefined;

    const binding =
      resolveOverviewBindingForRow(row, bindings, invMatch ?? null) ??
      (site ? bindingForUrlFromMap(trimmedUrl, bindings, site.siteUrl) : undefined) ??
      overviewBindingForRow(row, bindings);
    const invFields = snapshotHit?.row ? downloadFieldsFromInventoryRow(snapshotHit.row) : null;
    const keyword = kw || invFields?.focusKeyword?.trim() || "";
    const postId = binding?.postId || Number(row.postId) || Number(snapshotHit?.row?.id) || 0;
    if (!postId && !row.seoResearch?.trim() && !keyword) continue;

    const postType = (binding?.subtype || row.postType || "page").trim() || "page";

    prefilledOverviewTargets[trimmedUrl] = {
      postId,
      postType,
      postTypeEndpoint: restCollectionEndpointForSubtype(postType),
      keyword,
      content:
        row.postContent?.trim() ||
        snapshotHit?.row?.fields?.content?.trim() ||
        undefined,
      seoResearch: row.seoResearch?.trim() || undefined,
    };
  }

  return { prefilledOverviewTargets, prefilledUrlKeywords };
}

export function everyUrlHasOverviewFastPathData(
  urls: string[],
  prefilledOverviewTargets: Record<string, PrefilledOverviewTarget> | undefined,
  prefilledUrlKeywords: Record<string, string>,
): boolean {
  if (!prefilledOverviewTargets || Object.keys(prefilledOverviewTargets).length === 0) {
    return false;
  }
  for (const url of urls) {
    const trimmed = url?.trim();
    if (!trimmed) return false;
    const target = prefilledOverviewTargets[trimmed];
    const postId = Number(target?.postId);
    const keyword = (target?.keyword || prefilledUrlKeywords[trimmed] || "").trim();
    if (!Number.isFinite(postId) || postId <= 0 || !keyword) return false;
  }
  return true;
}
