import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewInventoryRow } from "@/lib/overview/overview-inventory-csv";
import {
  splitOverviewInventoryRowsBySource,
} from "@/lib/overview/overview-unified-sitemap-inventory";
import { fetchAllOverviewInventoriesParallel } from "@/lib/overview/overview-parallel-inventory-fetch";
import {
  OVERVIEW_SITEMAP_SOURCE_LABELS,
  overviewSitemapSourcesForSite,
  type OverviewSitemapSource,
} from "@/lib/overview/overview-sitemap-source";
import {
  customScopeIdFromLabel,
  restCollectionsForCustomTag,
} from "@/lib/sitemap-child-tags";
import {
  filterCustomBucketsByScopes,
  filterPromptBulkSitemapBucketsByScopes,
  totalRowsInScopedBuckets,
  type BulkSitemapScopeTag,
} from "@/lib/bulk/bulk-sitemap-mode";
import { seedBulkGenerationWpInventoryFromParallel } from "@/lib/bulk/bulk-generation-inventory-cache-store";
import {
  createPressReleaseInventoryHostedLink,
  revokePressReleaseInventoryHostedLink,
  type PressReleaseInventoryHostedLink,
} from "@/lib/press-release/press-release-site-inventory";
import {
  compactInventoryUrlsForJson,
  parseCompactInventoryUrls,
  stringifyContentBucketPostsJson,
  stringifyInventoryUrlList,
} from "@/lib/bulk/inventory-json-slim";

export type PromptBulkSitemapInventoryLink = PressReleaseInventoryHostedLink & {
  source: OverviewSitemapSource;
  label: string;
};

export type PromptBulkSitemapInventoryBucket = {
  json: string;
  rowCount: number;
};

export type PromptBulkCustomScopeBucket = PromptBulkSitemapInventoryBucket & {
  label: string;
};

export type PromptBulkSitemapInventoryBuckets = Record<
  OverviewSitemapSource,
  PromptBulkSitemapInventoryBucket
> & {
  customByScope?: Record<string, PromptBulkCustomScopeBucket>;
};

export type PromptBulkSitemapInventoryResult = {
  links: PromptBulkSitemapInventoryLink[];
  buckets: PromptBulkSitemapInventoryBuckets;
  totalRows: number;
  sources: OverviewSitemapSource[];
  errors: Record<string, string>;
};

function hostSlugForInventoryFile(siteUrl: string): string {
  try {
    const raw = siteUrl.trim();
    const withProto = raw.startsWith("http") ? raw : `https://${raw}`;
    const u = new URL(withProto);
    return u.hostname.replace(/[^a-zA-Z0-9.-]+/g, "-").slice(0, 80) || "site";
  } catch {
    return "site";
  }
}

function emptyBuckets(): PromptBulkSitemapInventoryBuckets {
  return {
    pages: { json: "", rowCount: 0 },
    posts: { json: "", rowCount: 0 },
    sap: { json: "", rowCount: 0 },
    customByScope: undefined,
  };
}

function buildCustomScopeBucketsFromRows(
  site: WordPressSite,
  mergedRows: OverviewInventoryRow[],
): Record<string, PromptBulkCustomScopeBucket> {
  const out: Record<string, PromptBulkCustomScopeBucket> = {};
  for (const label of site.customSitemapTagLabels ?? []) {
    const scopeId = customScopeIdFromLabel(label);
    const collections = new Set(
      restCollectionsForCustomTag(site, label).map((c) => c.toLowerCase()),
    );
    if (collections.size === 0) continue;
    const rows = mergedRows.filter((r) =>
      collections.has((r.collection ?? "").toLowerCase()),
    );
    const urls = compactInventoryUrlsForJson(rows);
    out[scopeId] = {
      label,
      json: stringifyContentBucketPostsJson("pages", rows),
      rowCount: urls.length,
    };
  }
  return out;
}

export function createBucketHostedLink(
  siteUrl: string,
  source: OverviewSitemapSource,
  urls: string[],
): PromptBulkSitemapInventoryLink {
  const slug = hostSlugForInventoryFile(siteUrl);
  const filename = `wp-sitemap-${source}-${slug}-${Date.now()}.txt`;
  const text = stringifyInventoryUrlList(urls);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  return {
    source,
    label: OVERVIEW_SITEMAP_SOURCE_LABELS[source],
    href: URL.createObjectURL(blob),
    filename,
    rowCount: urls.length,
  };
}

export function revokePromptBulkSitemapInventoryLinks(
  links: PromptBulkSitemapInventoryLink[] | null | undefined,
): void {
  for (const link of links ?? []) {
    revokePressReleaseInventoryHostedLink(link.href);
  }
}

/** Recreate hosted links after hydrating prefetch from disk (blob URLs are not persisted). */
export function recreatePromptBulkSitemapInventoryLinks(
  siteUrl: string,
  buckets: PromptBulkSitemapInventoryBuckets,
  sources: OverviewSitemapSource[],
): PromptBulkSitemapInventoryLink[] {
  const links: PromptBulkSitemapInventoryLink[] = [];
  for (const source of sources) {
    const block = buckets[source]?.json?.trim();
    if (!block) continue;
    const urls = parseCompactInventoryUrls(block);
    if (!urls.length) continue;
    links.push(createBucketHostedLink(siteUrl, source, urls));
  }
  return links;
}

/** Build Pages + Posts + SAP buckets and hosted links synchronously from already-loaded inventory rows. */
export function buildPromptBulkSitemapInventoryFromRows(
  site: WordPressSite,
  mergedRows: OverviewInventoryRow[],
): PromptBulkSitemapInventoryResult {
  const sources = overviewSitemapSourcesForSite(site);
  const buckets = emptyBuckets();
  const links: PromptBulkSitemapInventoryLink[] = [];
  const bySource = splitOverviewInventoryRowsBySource(site, mergedRows);

  let totalRows = 0;
  for (const source of sources) {
    const rows = bySource[source] ?? [];
    const urls = compactInventoryUrlsForJson(rows);
    const json = stringifyContentBucketPostsJson(source, rows);
    buckets[source] = { json, rowCount: urls.length };
    totalRows += urls.length;
    if (urls.length > 0 && site.siteUrl?.trim()) {
      links.push(createBucketHostedLink(site.siteUrl, source, urls));
    }
  }

  const customBuilt = buildCustomScopeBucketsFromRows(site, mergedRows);
  if (Object.keys(customBuilt).length > 0) {
    buckets.customByScope = customBuilt;
  }

  return {
    links,
    buckets,
    totalRows,
    sources,
    errors: {},
  };
}

/** Fetch Pages + Posts + SAP buckets and build hosted JSON links for the Details drawer. */
export async function fetchPromptBulkSitemapInventory(
  site: WordPressSite,
  onProgress?: (message: string) => void,
  options?: { scopeTags?: BulkSitemapScopeTag[] },
): Promise<PromptBulkSitemapInventoryResult> {
  const sources = overviewSitemapSourcesForSite(site);
  const buckets = emptyBuckets();
  const links: PromptBulkSitemapInventoryLink[] = [];

  if (!site.siteUrl?.trim() || !site.username?.trim() || !site.appPassword?.trim()) {
    throw new Error("WordPress username and application password are required to load sitemap inventory.");
  }

  onProgress?.(`Loading sitemap inventory (${sources.length} buckets: ${sources.join(", ")})…`);

  const parallel = await fetchAllOverviewInventoriesParallel(site, {
    includeContent: false,
    includePageHeading: false,
    includeRawAcf: false,
    includeScheduled: true,
  });
  seedBulkGenerationWpInventoryFromParallel(site, parallel);

  let totalRows = 0;
  for (const source of sources) {
    const rows = parallel.bySource[source] ?? [];
    const urls = compactInventoryUrlsForJson(rows);
    const json = stringifyContentBucketPostsJson(source, rows);
    buckets[source] = { json, rowCount: urls.length };
    totalRows += rows.length;
    links.push(createBucketHostedLink(site.siteUrl, source, urls));
  }

  const customBuilt = buildCustomScopeBucketsFromRows(site, parallel.mergedRows);
  if (Object.keys(customBuilt).length > 0) {
    buckets.customByScope = customBuilt;
  }

  const scopedBuckets = filterPromptBulkSitemapBucketsByScopes(buckets, options?.scopeTags);
  scopedBuckets.customByScope = filterCustomBucketsByScopes(
    buckets.customByScope,
    options?.scopeTags,
  );
  const scopedTotal = totalRowsInScopedBuckets(scopedBuckets);
  const scopedLinks =
    options?.scopeTags?.length && options.scopeTags.length > 0
      ? recreatePromptBulkSitemapInventoryLinks(site.siteUrl, scopedBuckets, sources)
      : links;

  if (Object.keys(parallel.errors).length > 0 && scopedTotal === 0) {
    const errText = Object.values(parallel.errors).filter(Boolean).join(" · ");
    throw new Error(errText || "Could not load WordPress sitemap inventory.");
  }

  return {
    links: scopedLinks,
    buckets: scopedBuckets,
    totalRows: scopedTotal,
    sources,
    errors: parallel.errors,
  };
}

/** Legacy single-block JSON (quarter-gap and other callers). */
export function mergeSitemapBucketsToLegacyJson(
  _siteUrl: string,
  buckets: PromptBulkSitemapInventoryBuckets,
): string {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const source of overviewSitemapSourcesForSite({ siteUrl: _siteUrl } as WordPressSite)) {
    const block = buckets[source]?.json?.trim();
    if (!block) continue;
    for (const url of parseCompactInventoryUrls(block)) {
      const key = url.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(url);
    }
  }
  return stringifyInventoryUrlList(merged);
}

/** Re-export for callers that only need one hosted link helper. */
export { createPressReleaseInventoryHostedLink };
