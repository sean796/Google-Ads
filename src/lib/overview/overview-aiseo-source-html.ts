import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import { getWordPressPostContent } from "@/lib/wordpress-api/posts";
import { resolveHarnessPrependSourceHtml } from "@/lib/overview/overview-blog-overview-prepend";
import {
  postBodyHtmlFromInventoryRow,
  sentimentHtmlFromInventoryRow,
} from "@/lib/overview/overview-inventory-seo-fields";
import type { OverviewInventoryUrlMatch } from "@/lib/overview/overview-row-scrape";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { lookupOverviewInventoryHitForUrl } from "@/hooks/content-optimization/bulk-seo-extra-text-fast-path";
import { isFaqStyleHeadingTitle } from "@/lib/content-generation/faq-heading-policy";
import { extractH2TextsFromHtml } from "@/lib/overview/overview-blog-headers-extract";

/** Cached bodies for AISEO append: always take the fullest HTML (same rule for every row). */
export function resolveAiseoHarnessSourceHtmlFromCache(args: {
  row: OverviewRow;
  site: WordPressSite;
  sitemapSource: OverviewSitemapSource;
  getInventoryMatchForUrl: (
    site: WordPressSite | null,
    url: string,
  ) => OverviewInventoryUrlMatch | undefined;
}): string {
  const { row, site, sitemapSource, getInventoryMatchForUrl } = args;
  const trimmedUrl = row.url?.trim() ?? "";
  const snapshotHit = trimmedUrl
    ? lookupOverviewInventoryHitForUrl(site, trimmedUrl, sitemapSource)
    : undefined;
  const invMatch =
    snapshotHit != null
      ? {
          row: snapshotHit.row,
          subtype:
            snapshotHit.source === "pages"
              ? ("page" as const)
              : snapshotHit.source === "posts"
                ? ("post" as const)
                : snapshotHit.source,
        }
      : trimmedUrl
        ? getInventoryMatchForUrl(site, trimmedUrl)
        : undefined;

  const inventoryHtml = snapshotHit?.row?.fields?.content?.trim() ?? "";
  const gridHtml = resolveHarnessPrependSourceHtml(row).trim();
  const invBody = invMatch?.row ? postBodyHtmlFromInventoryRow(invMatch.row)?.trim() : "";
  const sentiment = invMatch?.row ? sentimentHtmlFromInventoryRow(invMatch.row)?.trim() : "";

  const optimized = row.postContentOptimized?.trim() ?? "";
  if (optimized && !isTruncatedAiseoSourceBody(optimized)) {
    return optimized;
  }

  return pickBestAiseoSourceHtml(
    row.postContentOptimized,
    gridHtml,
    row.postContent,
    inventoryHtml,
    invBody,
    sentiment,
  );
}

/** Resolve AISEO source: fullest cache body, then live WordPress if better (every row, same path). */
export async function resolveAiseoHarnessSourceHtml(args: {
  row: OverviewRow;
  site: WordPressSite;
  sitemapSource: OverviewSitemapSource;
  getInventoryMatchForUrl: (
    site: WordPressSite | null,
    url: string,
  ) => OverviewInventoryUrlMatch | undefined;
}): Promise<{ html: string; liveHtml?: string; cachedHtml: string }> {
  const cachedHtml = resolveAiseoHarnessSourceHtmlFromCache(args).trim();
  if (cachedHtml && !isTruncatedAiseoSourceBody(cachedHtml)) {
    return { html: cachedHtml, cachedHtml };
  }
  const invMatch = args.getInventoryMatchForUrl(args.site, args.row.url?.trim() ?? "");
  const liveHtml = await fetchLiveWordPressPostBodyForRow(args.site, args.row, invMatch);
  const html = pickBestAiseoSourceHtml(cachedHtml, liveHtml).trim();
  return { html, liveHtml, cachedHtml };
}

/** Score bodies by non-FAQ article H2 count, then length (full blog beats Answer-only cache). */
export function scoreAiseoSourceBody(html: string): number {
  const trimmed = (html ?? "").trim();
  if (!trimmed) return 0;
  const h2s = extractH2TextsFromHtml(trimmed);
  const articleH2Count = h2s.filter((title) => {
    const key = title.trim().toLowerCase();
    if (!key) return false;
    if (key === "answer") return false;
    return !isFaqStyleHeadingTitle(title);
  }).length;
  return articleH2Count * 100_000 + trimmed.length;
}

/** True when HTML looks like Answer (+ FAQ) only, not a full article. */
export function isTruncatedAiseoSourceBody(html: string): boolean {
  const trimmed = (html ?? "").trim();
  if (!trimmed) return true;
  return scoreAiseoSourceBody(trimmed) < 100_000;
}

/** Prefer the fullest article body among cache/live candidates (same rule for every row). */
export function pickBestAiseoSourceHtml(...candidates: (string | undefined | null)[]): string {
  let best = "";
  let bestScore = -1;
  for (const candidate of candidates) {
    const trimmed = (candidate ?? "").trim();
    if (!trimmed) continue;
    const score = scoreAiseoSourceBody(trimmed);
    if (score > bestScore) {
      best = trimmed;
      bestScore = score;
    }
  }
  return best;
}

function postSlugFromOverviewUrl(url: string): string | undefined {
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  try {
    const pathname = new URL(trimmed).pathname.replace(/\/+$/, "");
    const slug = pathname.split("/").filter(Boolean).pop();
    return slug?.trim() || undefined;
  } catch {
    const slug = trimmed.replace(/\/+$/, "").split("/").filter(Boolean).pop();
    return slug?.trim() || undefined;
  }
}

/** Live WordPress `content.raw` for one row (server route; same path for every row). */
export async function fetchLiveWordPressPostBodyForRow(
  site: WordPressSite,
  row: OverviewRow,
  invMatch?: OverviewInventoryUrlMatch,
): Promise<string | undefined> {
  const siteUrl = site.siteUrl?.trim();
  const username = site.username?.trim();
  const appPassword = site.appPassword?.trim();
  if (!siteUrl || !username || !appPassword) return undefined;

  const postId = row.postId ?? invMatch?.row?.id ?? undefined;
  const subtype = (row.postType ?? invMatch?.subtype ?? "post").trim() || "post";
  const slug = postSlugFromOverviewUrl(row.url ?? "");

  if (!postId && !slug) return undefined;

  try {
    const result = await getWordPressPostContent(
      siteUrl,
      username,
      appPassword,
      postId ? [postId] : undefined,
      postId ? undefined : slug ? [slug] : undefined,
      postId ? [{ id: postId, subtype }] : undefined,
      {
        entitySitemapUrl: site.entitySitemapUrl,
        ...(site.manualEndpoint ? { restEndpointHints: [site.manualEndpoint] } : {}),
      },
    );
    if (result.error?.trim()) return undefined;
    const post = result.posts?.[0];
    if (!post) return undefined;
    const html = (post.fullData?.content?.raw || post.content || "").trim();
    return html || undefined;
  } catch {
    return undefined;
  }
}
