import type { WordPressSite } from "@/components/integrations/types";
import type { ConnectedSiteProfile } from "@/lib/competitor-research/types";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";

function samplePagesFromIntegrationsCache(site: WordPressSite): ConnectedSiteProfile["samplePages"] {
  const postMetadata = site.sitemaps?.postMetadata;
  if (!postMetadata) return [];

  const out: ConnectedSiteProfile["samplePages"] = [];
  for (const bucket of Object.values(postMetadata)) {
    for (const post of bucket.posts ?? []) {
      const url = post.link?.trim() || "";
      if (!url) continue;
      out.push({
        title: post.title?.trim() || url,
        url,
      });
      if (out.length >= 8) return out;
    }
  }
  return out;
}

function servicesHintFromSite(site: WordPressSite): string[] {
  const tags = site.profileTags?.map((t) => t.trim()).filter(Boolean) ?? [];
  const vertical = site.industryVertical?.trim();
  const hints = [...tags];
  if (vertical) hints.unshift(vertical);
  return [...new Set(hints)].slice(0, 8);
}

/**
 * Lightweight connected-site context for competitor comparison (no sitemap crawl or WP page analyzer).
 */
export async function readConnectedSiteProfile(
  site: WordPressSite,
  onProgress?: (message: string) => void,
): Promise<ConnectedSiteProfile> {
  const siteUrl = getPublicSiteUrl(site) || site.siteUrl?.trim() || "";
  const siteName = site.name?.trim() || siteUrl;
  onProgress?.("Using Integrations profile for connected site…");

  return {
    siteName,
    siteUrl,
    services: servicesHintFromSite(site),
    metaPatterns: [],
    samplePages: samplePagesFromIntegrationsCache(site),
  };
}
