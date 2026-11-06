import type { WordPressSite } from "@/components/integrations/types";
import {
  getBulkGenerationWpInventoryIfReady,
  isBlogPlayLinkTarget,
  isServiceAreaUrl,
} from "@/lib/bulk/bulk-generation-wp-inventory";
import { parseCompactInventoryUrls } from "@/lib/bulk/inventory-json-slim";
import { getEntitySiteWarmCacheIfReady } from "@/lib/local-analysis/entity-site-warm-cache";
import { isNumberedSlugDuplicateHref } from "@/lib/overview/overview-blog-links-agent-payload";
import {
  getBlogLinksLinkPoolFromSession,
  loadBlogLinksLinkInventory,
} from "@/lib/overview/overview-blog-links-inventory";
import {
  slugFromUrl,
  titleFromSlug,
  type SitemapFuzzyLinkCandidate,
} from "@/lib/overview/overview-blog-sitemap-fuzzy-score";
import { getOverviewRowsSessionCache } from "@/lib/overview/overview-rows-session-cache";
import { isOverviewUtilityPage } from "@/lib/overview/overview-utility-page-filter";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";

export function isEligibleSitemapLinkCandidate(
  item: { url?: string; title?: string; slug?: string; collection?: string; postType?: string },
  currentPageUrl?: string,
): boolean {
  const url = item.url?.trim() ?? "";
  if (!url) return false;
  if (isServiceAreaUrl(url)) return false;
  if (!isBlogPlayLinkTarget({ link: url, collection: item.collection, postType: item.postType })) {
    return false;
  }
  if (isNumberedSlugDuplicateHref(url)) return false;
  if (currentPageUrl?.trim()) {
    if (normalizePageUrlKey(url) === normalizePageUrlKey(currentPageUrl)) {
      return false;
    }
  }
  const coll = (item.collection || item.postType || "").toLowerCase().trim();
  const isPage = coll === "pages" || coll === "page" || (!coll && !url.toLowerCase().includes("/blog/"));
  if (isPage && isOverviewUtilityPage({ url, slug: item.slug, title: item.title })) {
    return false;
  }
  return true;
}

/** Collect all eligible product/service pages and blog posts from warm/session caches (never entity URLs). */
export async function resolveSitemapFuzzyLinkPool(args: {
  site?: WordPressSite | null;
  siteId?: string | null;
  pageUrl?: string;
}): Promise<SitemapFuzzyLinkCandidate[]> {
  const siteId = (args.site?.id || args.siteId || "").trim();
  const pageUrl = args.pageUrl?.trim();
  const byUrlKey = new Map<string, SitemapFuzzyLinkCandidate>();

  const addCandidate = (raw: {
    url?: string;
    title?: string;
    slug?: string;
    bucket?: "page" | "post";
    collection?: string;
    postType?: string;
    focusKeyword?: string;
    excerpt?: string;
  }) => {
    const url = raw.url?.trim() ?? "";
    if (!isEligibleSitemapLinkCandidate(raw, pageUrl)) return;
    const key = normalizePageUrlKey(url);
    if (!key) return;
    const slug = (raw.slug?.trim() || slugFromUrl(url)).toLowerCase();
    const title = (raw.title?.trim() || titleFromSlug(slug)).trim();
    const coll = (raw.collection || raw.postType || raw.bucket || "").toLowerCase().trim();
    const bucket: "page" | "post" =
      raw.bucket ??
      (coll === "posts" || coll === "post" || url.toLowerCase().includes("/blog/") ? "post" : "page");

    const existing = byUrlKey.get(key);
    if (existing) {
      if (!existing.title && title) existing.title = title;
      if (!existing.focusKeyword && raw.focusKeyword) existing.focusKeyword = raw.focusKeyword;
      if (!existing.excerpt && raw.excerpt) existing.excerpt = raw.excerpt;
      if (bucket === "page") existing.bucket = "page";
      return;
    }

    byUrlKey.set(key, {
      url,
      title,
      slug,
      bucket,
      focusKeyword: raw.focusKeyword?.trim() || undefined,
      excerpt: raw.excerpt?.trim() || undefined,
    });
  };

  if (siteId) {
    const warmRows = getBulkGenerationWpInventoryIfReady(siteId);
    if (warmRows?.length) {
      for (const r of warmRows) {
        addCandidate({
          url: r.url,
          title: r.fields?.title,
          slug: r.slug,
          collection: r.collection,
          focusKeyword: r.fields?.keyword,
          excerpt: r.fields?.excerpt || r.fields?.meta,
        });
      }
    }

    const warmBundle = getEntitySiteWarmCacheIfReady(siteId);
    if (warmBundle) {
      for (const r of warmBundle.bulkInventoryRows ?? []) {
        addCandidate({
          url: r.url,
          title: r.fields?.title,
          slug: r.slug,
          collection: r.collection,
          focusKeyword: r.fields?.keyword,
          excerpt: r.fields?.excerpt || r.fields?.meta,
        });
      }
      const pageJson = warmBundle.inventory?.buckets?.pages?.json;
      if (pageJson) {
        try {
          for (const u of parseCompactInventoryUrls(pageJson)) {
            addCandidate({ url: u, bucket: "page", collection: "pages" });
          }
        } catch {
          /* ignore */
        }
      }
      const postJson = warmBundle.inventory?.buckets?.posts?.json;
      if (postJson) {
        try {
          for (const u of parseCompactInventoryUrls(postJson)) {
            addCandidate({ url: u, bucket: "post", collection: "posts" });
          }
        } catch {
          /* ignore */
        }
      }
    }

    const sessionPages = getOverviewRowsSessionCache(siteId, "pages");
    if (sessionPages?.length) {
      for (const r of sessionPages) {
        addCandidate({
          url: r.url,
          title: r.aiTitle || r.title,
          bucket: "page",
          collection: "pages",
          focusKeyword: r.focusKeyword,
          excerpt: r.aiMeta || r.metaDescription,
        });
      }
    }

    const sessionPosts = getOverviewRowsSessionCache(siteId, "posts");
    if (sessionPosts?.length) {
      for (const r of sessionPosts) {
        addCandidate({
          url: r.url,
          title: r.aiTitle || r.title,
          bucket: "post",
          collection: "posts",
          focusKeyword: r.focusKeyword,
          excerpt: r.aiMeta || r.metaDescription,
        });
      }
    }

    const sessionPool = getBlogLinksLinkPoolFromSession(siteId);
    if (sessionPool) {
      for (const p of sessionPool.pageInventory) {
        addCandidate({
          url: p.url,
          title: p.title,
          slug: p.slug,
          bucket: "page",
          collection: "pages",
          focusKeyword: p.focusKeyword,
        });
      }
      for (const p of sessionPool.postInventory) {
        addCandidate({
          url: p.url,
          title: p.title,
          slug: p.slug,
          bucket: "post",
          collection: "posts",
          focusKeyword: p.focusKeyword,
        });
      }
    }
  }

  if (byUrlKey.size === 0 && args.site) {
    try {
      const loaded = await loadBlogLinksLinkInventory(args.site);
      if (loaded?.pool) {
        for (const p of loaded.pool.pageInventory) {
          addCandidate({
            url: p.url,
            title: p.title,
            slug: p.slug,
            bucket: "page",
            collection: "pages",
            focusKeyword: p.focusKeyword,
          });
        }
        for (const p of loaded.pool.postInventory) {
          addCandidate({
            url: p.url,
            title: p.title,
            slug: p.slug,
            bucket: "post",
            collection: "posts",
            focusKeyword: p.focusKeyword,
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  return Array.from(byUrlKey.values());
}

