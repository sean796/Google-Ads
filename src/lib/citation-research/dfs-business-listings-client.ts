/**
 * DataForSEO Business Listings Search - client for the backend MCP proxy.
 */

import { resolveMcpApiBase } from "@/lib/mcp-tools";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { inferDataForSeoLocationNameFromWebsiteUrl } from "@/lib/local-strategy-research/local-strategy-gmb-fetch";
import { normalizeCompetitorDomainKey } from "@/lib/competitor-research/competitor-domain-key";

/** Country centroid + radius (km) - mirrors server/company-scraper-helpers.js LOCATION_COORDINATE_MAP. */
const LOCATION_COORDINATE_MAP: Record<string, string> = {
  "United States": "39.8283,-98.5795,5000",
  "United Kingdom": "55.3781,-3.4360,1000",
  Canada: "56.1304,-106.3468,5000",
  Australia: "-25.2744,133.7751,5000",
};

export function getLocationCoordinateForDataForSeoLocationName(locationName: string): string {
  const k = locationName.trim();
  return LOCATION_COORDINATE_MAP[k] ?? LOCATION_COORDINATE_MAP["United States"];
}

export function getLocationCoordinateForWebsiteUrl(websiteUrl: string): string {
  const name = inferDataForSeoLocationNameFromWebsiteUrl(websiteUrl);
  return getLocationCoordinateForDataForSeoLocationName(name);
}

export type BusinessListingItem = Record<string, unknown>;

function websiteLikeFromContactInfo(item: BusinessListingItem): string {
  const arr = item.contact_info;
  if (!Array.isArray(arr)) return "";
  for (const c of arr) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    const t = String(o.type ?? "").toLowerCase();
    if (t !== "website" && t !== "web_site" && t !== "url") continue;
    const v =
      (typeof o.value === "string" && o.value) ||
      (typeof o.url === "string" && o.url) ||
      (typeof o.website === "string" && o.website) ||
      "";
    if (v.trim()) return v.trim();
  }
  return "";
}

function listingWebsiteHost(item: BusinessListingItem): string {
  const raw =
    (typeof item.url === "string" && item.url) ||
    (typeof item.link === "string" && item.link) ||
    (typeof item.website === "string" && item.website) ||
    (typeof item.domain === "string" && item.domain) ||
    websiteLikeFromContactInfo(item) ||
    "";
  if (!raw.trim()) return "";
  try {
    const full = raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`;
    return normalizeCompetitorDomainKey(full);
  } catch {
    return "";
  }
}

/**
 * Pick the business listing whose website hostname matches the connected site.
 */
export function pickListingForSiteHostname(
  items: BusinessListingItem[],
  siteUrl: string,
): BusinessListingItem | null {
  if (!items.length) return null;
  const want = normalizeCompetitorDomainKey(siteUrl);
  if (!want) return items[0] ?? null;
  const exact = items.find((it) => listingWebsiteHost(it) === want);
  if (exact) return exact;
  return (
    items.find((it) => {
      const h = listingWebsiteHost(it);
      if (!h) return false;
      return want.endsWith(h) || h.endsWith(want);
    }) ?? items[0] ?? null
  );
}

/**
 * Like {@link pickListingForSiteHostname} but never returns an unrelated first row:
 * requires a normalizable site hostname and an exact or suffix-aligned listing website match.
 */
export function pickListingForSiteHostnameStrict(
  items: BusinessListingItem[],
  siteUrl: string,
): BusinessListingItem | null {
  if (!items.length) return null;
  const want = normalizeCompetitorDomainKey(siteUrl);
  if (!want) return null;
  const exact = items.find((it) => listingWebsiteHost(it) === want);
  if (exact) return exact;
  const sub = items.find((it) => {
    const h = listingWebsiteHost(it);
    if (!h) return false;
    return want.endsWith(h) || h.endsWith(want);
  });
  return sub ?? null;
}

/**
 * Flatten DataForSEO Business Listings response items from tasks[0].result
 * (same shape as server/company-scraper-routes: result may be an array or `{ items }`).
 */
export function flattenBusinessListingItems(json: unknown): BusinessListingItem[] {
  const root = json as {
    tasks?: Array<{
      status_code?: number;
      result?: unknown;
    }>;
  };
  const t0 = root.tasks?.[0];
  if (t0?.status_code != null && t0.status_code !== 20000) {
    return [];
  }
  const resVal = t0?.result;
  if (Array.isArray(resVal)) {
    return resVal.filter(
      (x): x is BusinessListingItem => x != null && typeof x === "object",
    ) as BusinessListingItem[];
  }
  if (resVal && typeof resVal === "object" && Array.isArray((resVal as { items?: unknown[] }).items)) {
    return ((resVal as { items: unknown[] }).items ?? []).filter(
      (x): x is BusinessListingItem => x != null && typeof x === "object",
    ) as BusinessListingItem[];
  }
  return [];
}

export async function postBusinessListingsSearch(args: {
  title: string;
  locationCoordinate: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<unknown> {
  const base = (BACKEND_API_BASE || "").replace(/\/$/, "");
  const url = `${base}/DataForSEO_business_data_business_listings_search`;
  const body: Record<string, unknown> = {
    title: args.title.trim(),
    location_coordinate: args.locationCoordinate.trim(),
    limit: args.limit ?? 40,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: args.signal,
  });
  const j = (await res.json()) as { error?: string };
  if (!res.ok) {
    throw new Error(j.error || `Business Listings request failed (${res.status})`);
  }
  return j;
}
