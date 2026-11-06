import type { WordPressSite } from "@/components/integrations/types";
import type { CompetitorGridPlaceRow } from "@/lib/competitor-research/local-dominator-grid-parse";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";

export const GRID_ONLY_CONNECTED_SITE_MESSAGE =
  "Grid only contains your connected site. Upload a Local Dominator grid with competitor businesses.";

export function normalizeCompetitorHostname(host: string): string {
  return host.trim().replace(/^www\./i, "").toLowerCase();
}

export function hostnameFromUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    const h = u.hostname?.trim();
    if (!h) return null;
    return normalizeCompetitorHostname(h);
  } catch {
    return null;
  }
}

function normalizeBusinessLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isConnectedSiteBusinessName(businessName: string, site: WordPressSite): boolean {
  const siteLabel = normalizeBusinessLabel(site.name ?? "");
  const bizLabel = normalizeBusinessLabel(businessName);
  if (!siteLabel || !bizLabel) return false;
  if (bizLabel === siteLabel) return true;
  if (bizLabel.includes(siteLabel) || siteLabel.includes(bizLabel)) return true;
  const siteTokens = siteLabel.split(" ").filter((token) => token.length > 2);
  if (siteTokens.length >= 2 && siteTokens.every((token) => bizLabel.includes(token))) {
    return true;
  }
  return false;
}

export function connectedSiteHostnames(site: WordPressSite): Set<string> {
  const hosts = new Set<string>();
  for (const raw of [getPublicSiteUrl(site), site.siteUrl ?? "", site.productionSiteUrl ?? ""]) {
    const h = hostnameFromUrl(raw);
    if (h) hosts.add(h);
  }
  return hosts;
}

export function isConnectedSiteHostname(hostname: string | null | undefined, site: WordPressSite): boolean {
  if (!hostname?.trim()) return false;
  const norm = normalizeCompetitorHostname(hostname);
  return connectedSiteHostnames(site).has(norm);
}

export function isConnectedSitePlace(place: CompetitorGridPlaceRow, site: WordPressSite): boolean {
  if (isConnectedSiteBusinessName(place.businessName, site)) return true;
  if (place.websiteHostname && isConnectedSiteHostname(place.websiteHostname, site)) return true;
  return false;
}

export function filterPlacesExcludingConnectedSite(
  places: CompetitorGridPlaceRow[],
  site: WordPressSite,
  hostnameByDfsKeyword?: Map<string, string | null>,
): CompetitorGridPlaceRow[] {
  return places.filter((place) => {
    if (isConnectedSitePlace(place, site)) {
      return false;
    }
    const resolved = hostnameByDfsKeyword?.get(place.dfsKeyword);
    if (resolved != null && isConnectedSiteHostname(resolved, site)) {
      return false;
    }
    return true;
  });
}

export function selectCompetitorPlacesForRun(
  places: CompetitorGridPlaceRow[],
  site: WordPressSite,
  count: number,
): CompetitorGridPlaceRow[] {
  return filterPlacesExcludingConnectedSite(places, site).slice(0, count);
}
