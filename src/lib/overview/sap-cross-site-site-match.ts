import type { WordPressSite } from "@/components/integrations/types";
import { entityEndpointFromSite } from "@/lib/sitemap-optimizer/entity-compression-profile";

export function trimTrailingSlashes(url: string): string {
  let s = url.trim().toLowerCase();
  while (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

/** Same host/path ignoring trailing slashes (current site vs peers). */
export function sameWordPressSiteUrl(a: string, b: string): boolean {
  const left = trimTrailingSlashes(a);
  const right = trimTrailingSlashes(b);
  return Boolean(left && right && left === right);
}

/** True when `candidate` is the site we are writing to (never search it for peer images). */
export function isCurrentConnectedSite(
  candidate: Pick<WordPressSite, "id" | "siteUrl" | "productionSiteUrl">,
  current: Pick<WordPressSite, "id" | "siteUrl" | "productionSiteUrl">,
): boolean {
  if (candidate.id && current.id && candidate.id === current.id) return true;
  const candUrls = [
    candidate.siteUrl,
    candidate.productionSiteUrl,
  ]
    .map((u) => (u || "").trim())
    .filter(Boolean);
  const curUrls = [
    current.siteUrl,
    current.productionSiteUrl,
  ]
    .map((u) => (u || "").trim())
    .filter(Boolean);
  for (const a of candUrls) {
    for (const b of curUrls) {
      if (sameWordPressSiteUrl(a, b)) return true;
    }
  }
  return false;
}

export function urlsEqual(a: string, b: string): boolean {
  return sameWordPressSiteUrl(a, b);
}

export function siteEnabledForSapSearch(site: WordPressSite): boolean {
  // Peer image reuse uses all connected SAP sites with creds + entity sitemap.
  // Do not gate on site.enabled — that flag is the Integrations "active site" switch,
  // and peers are normally disabled while one site is selected.
  if (!site.entitySitemapUrl?.trim()) return false;
  if (!site.username?.trim() || !site.appPassword?.trim()) return false;
  return Boolean(entityEndpointFromSite(site));
}
