import type { WordPressSite } from "@/components/integrations/types";
import { parseSitemap } from "@/lib/wordpress-api";
import { activeChildSitemapUrls } from "@/lib/wordpress-property-sitemaps";

export type MultiSiteUrlSource = "post" | "entity" | "both";

export function multiSiteSourceLabel(source: MultiSiteUrlSource): string {
  switch (source) {
    case "post":
      return "Post";
    case "entity":
      return "Entity";
    case "both":
      return "Both";
  }
}

/**
 * Default post sitemap URL for **Post sitemap** mode: prefer a child whose
 * filename hints at posts, else main index/urlset, else first child.
 */
export function pickPostSitemapUrlForSite(site: WordPressSite): string | null {
  const children = activeChildSitemapUrls(site);
  const hintsPosts = (u: string) => {
    const tail = (u.split("/").pop() ?? "").toLowerCase();
    return (
      tail.includes("post") ||
      tail.includes("blog") ||
      /(^|[-_])posts?\.xml$/i.test(tail)
    );
  };
  const postChild = children.find(hintsPosts);
  if (postChild?.trim()) return postChild.trim();
  const main = site.sitemaps?.mainSitemapUrl?.trim();
  if (main) return main;
  const first = children[0]?.trim();
  if (first) return first;
  return null;
}

export type LoadMultiSiteUrlsResult =
  | { ok: true; urls: string[] }
  | { ok: false; error: string };

/**
 * Load loc URLs for Content Optimizer multi-site runs (post sitemap XML or entity sitemap from Integrations).
 */
export async function loadUrlsForMultiSiteSource(
  site: WordPressSite,
  source: Exclude<MultiSiteUrlSource, "both">,
  postSitemapUrl: string | null,
): Promise<LoadMultiSiteUrlsResult> {
  const user = site.username?.trim();
  const pass = site.appPassword?.trim();
  const hasCreds = Boolean(user && pass);

  if (source === "entity") {
    const entityUrl = site.entitySitemapUrl?.trim();
    if (!entityUrl) {
      return { ok: false, error: "No entity sitemap URL saved for this site in Integrations." };
    }
    try {
      const result = await parseSitemap(
        site.siteUrl,
        entityUrl,
        hasCreds ? user : undefined,
        hasCreds ? pass : undefined,
      );
      const urls = Array.isArray(result?.urls) ? result.urls.filter((u) => typeof u === "string" && u.trim()) : [];
      if (!urls.length) {
        return { ok: false, error: "No URLs found in the entity sitemap." };
      }
      return { ok: true, urls };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to parse entity sitemap.";
      return { ok: false, error: message };
    }
  }

  const trimmed = postSitemapUrl?.trim() ?? "";
  if (!trimmed) {
    return {
      ok: false,
      error: "No post sitemap could be resolved. Detect sitemaps for this property in Integrations.",
    };
  }

  try {
    const result = await parseSitemap(
      site.siteUrl,
      trimmed,
      hasCreds ? user : undefined,
      hasCreds ? pass : undefined,
    );
    const urls = Array.isArray(result?.urls) ? result.urls.filter((u) => typeof u === "string" && u.trim()) : [];
    if (!urls.length) {
      return { ok: false, error: "No URLs found in this sitemap." };
    }
    return { ok: true, urls };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to parse sitemap.";
    return { ok: false, error: message };
  }
}
