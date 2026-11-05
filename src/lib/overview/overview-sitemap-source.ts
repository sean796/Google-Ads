import type { WordPressSite } from "@/components/integrations/types";
import { extractEndpointFromEntitySitemapUrl } from "@/lib/entity-endpoint-extractor";
import { overviewInventoryCollectionsFromSitemapUrl } from "@/lib/overview/overview-inventory-collections";
import type { OverviewInventoryRow } from "@/lib/overview/overview-inventory-csv";
import { isOverviewUtilityPage } from "@/lib/overview/overview-utility-page-filter";
import {
  activeChildSitemapUrls,
  isChildSitemapExcludedFromProperty,
} from "@/lib/wordpress-property-sitemaps";
import { resolveChildUrlForRole } from "@/lib/sitemap-child-tags";

export type OverviewSitemapSource = "pages" | "posts" | "sap";

export const OVERVIEW_SITEMAP_SOURCE_LABELS: Record<OverviewSitemapSource, string> = {
  pages: "Pages",
  posts: "Posts",
  sap: "SAP",
};

const GENERIC_WP_COLLECTIONS = new Set(["posts", "post", "pages", "page"]);

function normalizeSitemapUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

function sitemapFilename(url: string): string {
  return (url.split("/").pop() ?? "").toLowerCase();
}

function isPageChildSitemap(url: string): boolean {
  const tail = sitemapFilename(url);
  return tail.includes("page-sitemap") || tail.includes("pages-sitemap") || tail.includes("page_sitemap");
}

function isPostChildSitemap(url: string): boolean {
  const tail = sitemapFilename(url);
  return (
    tail.includes("post-sitemap") ||
    tail.includes("post_sitemap") ||
    tail.includes("posts-sitemap") ||
    tail.includes("posts_sitemap") ||
    tail.includes("news-sitemap") ||
    tail.includes("article-sitemap") ||
    (tail.includes("post") && !isPageChildSitemap(url)) ||
    tail.includes("blog")
  );
}

/** Post child sitemap URL from property config (ignores exclusions). */
export function postChildSitemapUrlForProperty(
  site: Pick<WordPressSite, "sitemaps" | "entitySitemapUrl" | "competitorEntitySitemapUrl"> | null | undefined,
): string | null {
  if (site?.sitemaps) {
    const tagged = resolveChildUrlForRole(site, "posts");
    if (tagged) return tagged;
  }
  const children = site?.sitemaps?.childSitemaps ?? [];
  const hit = children.find(isPostChildSitemap);
  return hit?.trim() || null;
}

/** False when the property post sitemap is excluded in Integrations → Sitemaps. */
export function isOverviewPostsSourceAvailable(
  site: WordPressSite | null | undefined,
): boolean {
  return Boolean(site?.username?.trim() && site?.appPassword?.trim());
}

/** SEO geo or KML sitemaps are not wp/v2 REST collections. */
function isNonRestInventorySitemap(url: string): boolean {
  const tail = sitemapFilename(url);
  return tail.includes("local-sitemap") || tail.includes("geo-sitemap") || tail.endsWith(".kml");
}

export function pickPageSitemapUrlForSite(site: WordPressSite): string | null {
  const tagged = resolveChildUrlForRole(site, "pages");
  if (tagged) return tagged;
  const children = activeChildSitemapUrls(site);
  const pageChild = children.find(isPageChildSitemap);
  if (pageChild?.trim()) return pageChild.trim();
  return null;
}

/** Play always uses page-sitemap.xml even when Integrations has no page child listed. */
export function pageSitemapXmlUrlForPlay(site: WordPressSite): string | null {
  const listed = pickPageSitemapUrlForSite(site);
  if (listed) return listed;
  const origin = (site.siteUrl || "").trim().replace(/\/+$/, "");
  if (!origin) return null;
  const base = origin.startsWith("http") ? origin : `https://${origin}`;
  return `${base}/page-sitemap.xml`;
}

/** Every property has a service-area CPT; WordPress serves its sitemap even when it is not in the index yet. */
const DEFAULT_ENTITY_REST_COLLECTION = "service-area";

function entitySitemapUrlForSite(site: WordPressSite): string | null {
  const tagged = resolveChildUrlForRole(site, "entity");
  if (tagged) return tagged;
  const url = site.entitySitemapUrl?.trim();
  if (url) return url;
  const origin = (site.siteUrl || "").trim().replace(/\/+$/, "");
  if (!origin) return null;
  const base = origin.startsWith("http") ? origin : `https://${origin}`;
  return `${base}/${DEFAULT_ENTITY_REST_COLLECTION}-sitemap.xml`;
}

function isEntitySitemapUrl(site: WordPressSite, url: string): boolean {
  const entity = entitySitemapUrlForSite(site);
  if (!entity) return false;
  return normalizeSitemapUrl(url) === normalizeSitemapUrl(entity);
}

function restEndpointFromSitemapUrl(sitemapUrl: string): string | null {
  const ep = extractEndpointFromEntitySitemapUrl(sitemapUrl.trim());
  if (!ep || GENERIC_WP_COLLECTIONS.has(ep.toLowerCase())) return null;
  return ep;
}

/**
 * Entity CPT REST collection for Overview SAP (same resolution order as Integrations):
 * manualEndpoint → sitemaps.endpoints[entitySitemapUrl] → filename from entity sitemap URL.
 */
export function overviewEntityRestCollectionForSite(
  site: Pick<WordPressSite, "entitySitemapUrl" | "manualEndpoint" | "sitemaps">,
): string | null {
  const manual = site.manualEndpoint?.trim();
  if (manual && !GENERIC_WP_COLLECTIONS.has(manual.toLowerCase())) {
    return manual;
  }
  const entityUrl = site.entitySitemapUrl?.trim();
  if (!entityUrl) return DEFAULT_ENTITY_REST_COLLECTION;
  const fromMap = site.sitemaps?.endpoints?.[entityUrl]?.trim();
  if (fromMap && !GENERIC_WP_COLLECTIONS.has(fromMap.toLowerCase())) {
    return fromMap;
  }
  return restEndpointFromSitemapUrl(entityUrl);
}

/** Sitemap XML URLs to parse for the given Overview source. */
export function resolveOverviewSitemapUrls(
  site: WordPressSite,
  source: OverviewSitemapSource,
): string[] {
  if (source === "posts") {
    const post = postChildSitemapUrlForProperty(site);
    if (!post || isChildSitemapExcludedFromProperty(site, post)) return [];
    return [post];
  }

  if (source === "sap") {
    const entity = entitySitemapUrlForSite(site);
    return entity ? [entity] : [];
  }

  const children = activeChildSitemapUrls(site);
  const pageUrl = pickPageSitemapUrlForSite(site);
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    const key = normalizeSitemapUrl(trimmed);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  };

  if (pageUrl) push(pageUrl);

  for (const child of children) {
    if (isPostChildSitemap(child)) continue;
    if (isEntitySitemapUrl(site, child)) continue;
    if (pageUrl && normalizeSitemapUrl(child) === normalizeSitemapUrl(pageUrl)) continue;
    push(child);
  }

  return out;
}

/** Published URLs from a WordPress REST inventory prefetch for the given source bucket. */
export function overviewUrlsFromInventoryRows(
  rows: OverviewInventoryRow[],
  collections: string[],
): string[] {
  const allowed = new Set(collections.map((c) => c.toLowerCase().trim()).filter(Boolean));
  const seen = new Set<string>();
  const out: string[] = [];

  for (const row of rows) {
    const coll = row.collection?.toLowerCase().trim();
    if (!coll || !allowed.has(coll)) continue;
    if ((coll === "pages" || coll === "page") &&
      isOverviewUtilityPage({ url: row.url, slug: row.slug, title: row.fields?.title })) {
      continue;
    }
    const url = row.url?.trim();
    if (!url) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }

  return out;
}

/** REST collections to prefetch for WordPress inventory binding. */
export function overviewInventoryCollectionsFromSource(
  source: OverviewSitemapSource,
  site: WordPressSite,
): string[] {
  if (source === "posts") return ["posts"];

  if (source === "sap") {
    const ep = overviewEntityRestCollectionForSite(site);
    if (ep) return [ep];
    const configured = site.entitySitemapUrl?.trim();
    if (configured) {
      const fromUrl = extractEndpointFromEntitySitemapUrl(configured);
      if (fromUrl && !GENERIC_WP_COLLECTIONS.has(fromUrl.toLowerCase())) {
        return [fromUrl];
      }
    }
    for (const url of activeChildSitemapUrls(site)) {
      if (isPostChildSitemap(url) || isPageChildSitemap(url)) continue;
      if (isNonRestInventorySitemap(url)) continue;
      const fromChild = restEndpointFromSitemapUrl(url);
      if (fromChild) return [fromChild];
    }
    return [];
  }

  const sitemapUrls = resolveOverviewSitemapUrls(site, "pages");
  const collections: string[] = [];
  const seen = new Set<string>();

  const push = (col: string) => {
    const key = col.toLowerCase().trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    collections.push(col);
  };

  push("pages");

  for (const url of sitemapUrls) {
    if (isPageChildSitemap(url)) continue;
    if (isNonRestInventorySitemap(url)) continue;
    const ep = restEndpointFromSitemapUrl(url);
    if (ep) push(ep);
  }

  return collections;
}

/**
 * Same collections as CSV / page-bucket inventory (pages + CPT child sitemaps).
 * Previously pages-only, which dropped most page-bucket URLs from bulk extra text.
 */
export function overviewInventoryCollectionsForOverviewLoad(
  site: WordPressSite,
  source: OverviewSitemapSource,
): string[] {
  return overviewInventoryCollectionsFromSource(source, site);
}

export function canLoadOverviewSitemapSource(
  site: WordPressSite | null | undefined,
  source: OverviewSitemapSource,
): boolean {
  if (!site?.username?.trim() || !site.appPassword?.trim()) return false;
  void source;
  return true;
}

export function isOverviewSapSourceAvailable(site: WordPressSite | null | undefined): boolean {
  return Boolean(site?.username?.trim() && site?.appPassword?.trim());
}

/** Overview buckets to warm/cache for a site (SAP omitted when unavailable). */
export function overviewSitemapSourcesForSite(site: WordPressSite | null | undefined): OverviewSitemapSource[] {
  const sources: OverviewSitemapSource[] = ["pages"];
  if (isOverviewPostsSourceAvailable(site)) {
    sources.push("posts");
  }
  if (isOverviewSapSourceAvailable(site)) {
    sources.push("sap");
  }
  return sources;
}

/** REST collections for overview inventory prefetch (Load Sitemap, scrape, bulk upload, etc.). */
export function overviewInventoryCollectionsForSite(
  site: WordPressSite | null | undefined,
  sitemapSource: OverviewSitemapSource,
  manualSitemapUrl?: string,
): string[] {
  if (site?.sitemaps?.mainSitemapUrl) {
    return overviewInventoryCollectionsFromSource(sitemapSource, site);
  }
  const manual = manualSitemapUrl?.trim();
  if (manual) {
    return overviewInventoryCollectionsFromSitemapUrl(manual, site ?? undefined);
  }
  return ["posts", "pages"];
}
