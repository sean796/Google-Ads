import type { WordPressSite } from "@/components/integrations/types";

/** Minimal site shape for sitemap exclusion checks (full WordPressSite also satisfies this). */
export type SitemapExclusionSite = {
  sitemaps?: {
    disabledChildSitemapUrls?: string[];
    childSitemaps?: string[];
  } | null;
} | null | undefined;

/** Child sitemap URLs the user excluded for this property (Sitemaps tab menu). */
export function getExcludedChildSitemapUrls(
  site: SitemapExclusionSite,
): string[] {
  return site?.sitemaps?.disabledChildSitemapUrls ?? [];
}

export function isChildSitemapExcludedFromProperty(
  site: SitemapExclusionSite,
  childUrl: string,
): boolean {
  const url = childUrl.trim();
  if (!url) return false;
  return getExcludedChildSitemapUrls(site).includes(url);
}

/** Active child sitemaps for bulk/scrape picks (excludes per-property exclusions). */
export function activeChildSitemapUrls(
  site: Pick<WordPressSite, "sitemaps"> | null | undefined,
): string[] {
  const children = site?.sitemaps?.childSitemaps ?? [];
  const excluded = new Set(getExcludedChildSitemapUrls(site));
  return children.filter((u) => !excluded.has(u));
}
