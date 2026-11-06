import { fetchExternalSitemap } from "@/lib/competitor-research/fetch-external-sitemap";

export type CompetitorSitemapDiscovery = {
  sitemapUrl: string | null;
  urls: string[];
  origin: string | null;
};

export async function discoverCompetitorSitemap(
  domain: string,
  signal?: AbortSignal,
): Promise<CompetitorSitemapDiscovery> {
  const result = await fetchExternalSitemap({ domain, signal });
  return {
    sitemapUrl: result.sitemapUrl,
    urls: result.urls,
    origin: result.origin,
  };
}

const SERVICE_PATH_HINTS = [
  "service",
  "services",
  "product",
  "products",
  "blind",
  "shade",
  "shutter",
  "drape",
  "window",
  "treatment",
  "install",
  "repair",
  "about",
  "solution",
];

export function pickServiceLikeUrls(urls: string[], max = 8): string[] {
  const scored = urls.map((url) => {
    const path = url.toLowerCase();
    let score = 0;
    for (const hint of SERVICE_PATH_HINTS) {
      if (path.includes(hint)) score += 2;
    }
    if (path.endsWith("/") || path.split("/").filter(Boolean).length <= 2) score += 1;
    return { url, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const picked = scored.filter((s) => s.score > 0).slice(0, max).map((s) => s.url);
  if (picked.length > 0) return picked;
  return urls.slice(0, Math.min(max, urls.length));
}

export function homepageUrlFromDomain(domain: string): string {
  const d = domain.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  return `https://${d}`;
}
