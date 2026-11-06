import { resolveMcpApiBase } from "@/lib/mcp-tools";
import type { Location, WordPressSite } from "@/components/integrations/types";
import { extractCompetitorDiscoverySerpRows } from "@/lib/backlink-research/serp-write-for-us";
import {
  hostnameFromUrl,
  isConnectedSiteHostname,
} from "@/lib/competitor-research/filter-connected-site-competitors";
import type { CompetitorGridPlaceRow } from "@/lib/competitor-research/local-dominator-grid-parse";
import {
  getPrimaryCityStateLabel,
  resolveEntityClusterLocationLabel,
} from "@/lib/primary-location-from-site";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { logClustersPipeline } from "@/lib/local-analysis/entity-clusters-console-log";
import { profileGeoToDataForSeoLocationName } from "@/lib/competitor-research/dfs-profile-location-name";
import { stripTitlePipeSuffix } from "@/lib/sap-title-pipe-brand";

function pickDefaultLocation(site: WordPressSite): Location | null {
  const fromSite = site.locations?.length ? site.locations : null;
  const fromNap = site.napInfo?.locations?.length ? site.napInfo.locations : null;
  const list = fromSite ?? fromNap;
  if (!list?.length) return null;
  const def = list.find((l) => l.isDefault);
  return def ?? list[0] ?? null;
}

function countryCodeFromProfileCountry(country: string | undefined): string {
  const c = (country ?? "").trim().toLowerCase();
  if (c === "canada" || c === "ca") return "CA";
  if (c === "united states" || c === "us" || c === "usa") return "US";
  if (c === "united kingdom" || c === "uk" || c === "gb") return "GB";
  if (c === "australia" || c === "au") return "AU";
  return "";
}

export type ProfileMapsGeo = {
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  cityRegionLabel: string;
};

/** City/region/zip from Integrations profile locations only (no homepage discovery). */
export function resolveProfileMapsGeo(site: WordPressSite): ProfileMapsGeo {
  const loc = pickDefaultLocation(site);
  const city = loc?.city?.trim() ?? "";
  const region = loc?.state?.trim() ?? "";
  const postalCode = loc?.zip?.trim() ?? "";
  const countryCode = countryCodeFromProfileCountry(loc?.country);

  const cityRegionLabel =
    getPrimaryCityStateLabel(site)?.trim() ||
    resolveEntityClusterLocationLabel(site, null).trim() ||
    [city, region].filter(Boolean).join(", ");

  if (!city.trim() && !region.trim()) {
    throw new Error("Set a business city in Integrations profile settings.");
  }

  return { city, region, postalCode, countryCode, cityRegionLabel };
}

function businessNameFromOrganicTitle(title: string, hostname: string): string {
  const stripped = stripTitlePipeSuffix(title.trim());
  if (stripped) return stripped;
  return hostname;
}

/**
 * DataForSEO Google organic SERP JSON → competitor place rows (one per domain, discovery order).
 */
export function parseOrganicSerpPlacesFromJson(
  json: unknown,
  maxPlaces: number,
  site?: WordPressSite,
): CompetitorGridPlaceRow[] {
  if (maxPlaces < 1) return [];

  const out: CompetitorGridPlaceRow[] = [];
  const seenHosts = new Set<string>();

  for (const row of extractCompetitorDiscoverySerpRows(json)) {
    if (out.length >= maxPlaces) break;
    const hostname = hostnameFromUrl(row.url);
    if (!hostname) continue;
    if (seenHosts.has(hostname)) continue;
    if (site && isConnectedSiteHostname(hostname, site)) continue;
    seenHosts.add(hostname);

    const businessName = businessNameFromOrganicTitle(row.title, hostname);
    out.push({
      dfsKeyword: `host:${hostname}`,
      businessName,
      rank: out.length + 1,
      latitude: null,
      longitude: null,
      idLabel: hostname,
      websiteHostname: hostname,
    });
  }

  return out;
}

export function buildMapsSearchKeyword(serviceKeyword: string, cityRegionLabel: string): string {
  const kw = serviceKeyword.trim();
  const geo = cityRegionLabel.trim();
  if (kw && geo) return `${kw} ${geo}`.trim();
  return kw || geo;
}

function organicSerpDepthForLimit(limit: number): number {
  return Math.min(Math.max(limit * 5, 20), 100);
}

async function fetchGoogleOrganicSerpJson(args: {
  keyword: string;
  locationName: string;
  depth: number;
  signal?: AbortSignal;
}): Promise<unknown> {
  const base = (BACKEND_API_BASE || "").replace(/\/$/, "");
  const url = `${base}/DataForSEO_serp_organic_live_advanced`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      keyword: args.keyword.trim(),
      location_name: args.locationName.trim(),
      language_code: "en",
      depth: args.depth,
    }),
    signal: args.signal,
  });
  const j = (await res.json()) as { error?: string; tasks?: Array<{ status_code?: number; status_message?: string }> };
  if (!res.ok) {
    throw new Error(j.error || `DataForSEO Google Search request failed (${res.status})`);
  }
  const t0 = j.tasks?.[0];
  if (t0?.status_code != null && t0.status_code !== 20000) {
    throw new Error(t0.status_message || `DataForSEO Google Search task status ${t0.status_code}`);
  }
  return j;
}

export async function discoverCompetitorPlacesFromDfs(args: {
  site: WordPressSite;
  keyword: string;
  limit: number;
  signal?: AbortSignal;
}): Promise<CompetitorGridPlaceRow[]> {
  const kw = args.keyword.trim();
  if (!kw) {
    throw new Error("Enter a keyword.");
  }
  if (!Number.isFinite(args.limit) || args.limit < 1) {
    throw new Error("Enter a valid competitor count.");
  }

  logClustersPipeline("competitors", "dfs_discovery_started", {
    keyword: kw,
    limit: args.limit,
    siteId: args.site.id,
    siteName: args.site.name,
  });

  const profile = resolveProfileMapsGeo(args.site);
  const locationName = profileGeoToDataForSeoLocationName(profile);
  const searchKeyword = buildMapsSearchKeyword(kw, profile.cityRegionLabel);
  const depth = organicSerpDepthForLimit(args.limit);

  logClustersPipeline("competitors", "dfs_organic_request", {
    profile,
    locationName,
    searchKeyword,
    depth,
  });

  const serpJson = await fetchGoogleOrganicSerpJson({
    keyword: searchKeyword,
    locationName,
    depth,
    signal: args.signal,
  });

  const discoveryRows = extractCompetitorDiscoverySerpRows(serpJson);
  const places = parseOrganicSerpPlacesFromJson(serpJson, args.limit, args.site);
  if (places.length === 0) {
    logClustersPipeline("competitors", "dfs_discovery_empty", {
      searchKeyword,
      locationName,
      serpRowCount: discoveryRows.length,
    });
    if (discoveryRows.length > 0) {
      throw new Error(
        `Google Search returned only your connected site for "${searchKeyword}" in ${profile.cityRegionLabel}. Try a different keyword or upload a grid CSV.`,
      );
    }
    throw new Error(`No Google Search results for "${searchKeyword}" in ${profile.cityRegionLabel}.`);
  }

  logClustersPipeline("competitors", "dfs_discovery_complete", {
    placeCount: places.length,
    placesPreview: places.slice(0, 25).map((p) => ({
      businessName: p.businessName,
      dfsKeyword: p.dfsKeyword,
      rank: p.rank,
    })),
  });

  return places;
}
