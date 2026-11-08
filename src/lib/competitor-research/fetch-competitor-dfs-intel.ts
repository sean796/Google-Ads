import { mcpPostInit } from "@/lib/mcp-tools";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { extractOrganicRowsFromSerpJson } from "@/lib/backlink-research/serp-write-for-us";
import {
  hostnameFromUrl,
  isConnectedSiteHostname,
  normalizeCompetitorHostname,
} from "@/lib/competitor-research/filter-connected-site-competitors";
import type { CompetitorPageMeta } from "@/lib/competitor-research/types";
import type { CompetitorGridPlaceRow } from "@/lib/competitor-research/local-dominator-grid-parse";
import { profileGeoToDataForSeoLocationName } from "@/lib/competitor-research/dfs-profile-location-name";
import { resolveProfileMapsGeo } from "@/lib/competitor-research/discover-competitor-places-from-dfs";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import type { WordPressSite } from "@/components/integrations/types";

function hostnameFromSerpUrl(url: string): string | null {
  try {
    return normalizeCompetitorHostname(new URL(url).hostname);
  } catch {
    return null;
  }
}

function serpPagesFromQuery(
  serpJson: unknown,
  site: WordPressSite,
  max = 8,
): CompetitorPageMeta[] {
  return extractOrganicRowsFromSerpJson(serpJson)
    .filter((row) => {
      const host = hostnameFromSerpUrl(row.url);
      if (!host) return false;
      return !isConnectedSiteHostname(host, site);
    })
    .slice(0, max)
    .map((row) => ({
      url: row.url,
      title: row.title || row.url,
      metaDescription: row.description.slice(0, 500),
      bodySnippet: row.description.slice(0, 4000),
    }));
}

function extractAiOverviewSnippet(aiJson: unknown): string {
  const root = aiJson as {
    tasks?: Array<{
      result?: Array<{ items?: unknown[] }>;
    }>;
  };
  const items = root.tasks?.[0]?.result?.[0]?.items;
  if (!Array.isArray(items)) return "";
  const chunks: string[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    if (typeof o.markdown === "string" && o.markdown.trim()) {
      chunks.push(o.markdown.trim());
    } else if (typeof o.text === "string" && o.text.trim()) {
      chunks.push(o.text.trim());
    }
  }
  return chunks.join("\n\n").slice(0, 4000);
}

async function fetchSerpOrganicJson(args: {
  keyword: string;
  locationCoordinate?: string;
  locationName?: string;
  signal?: AbortSignal;
}): Promise<unknown | null> {
  const base = (BACKEND_API_BASE || "").replace(/\/$/, "");
  const url = `${base}/DataForSEO_serp_organic_live_advanced`;
  const body: Record<string, string | number> = {
    keyword: args.keyword.trim(),
    language_code: "en",
    depth: 30,
  };
  if (args.locationCoordinate?.trim()) {
    body.location_coordinate = args.locationCoordinate.trim();
  } else if (args.locationName?.trim()) {
    body.location_name = args.locationName.trim();
  }

  const res = await fetch(url, mcpPostInit(body, { signal: args.signal }));
  if (!res.ok) return null;
  return res.json();
}

async function fetchSerpAiOverviewJson(args: {
  keyword: string;
  locationCoordinate?: string;
  locationName?: string;
  signal?: AbortSignal;
}): Promise<unknown | null> {
  const base = (BACKEND_API_BASE || "").replace(/\/$/, "");
  const url = `${base}/DataForSEO_serp_google_ai_overview`;
  const body: Record<string, string> = {
    keyword: args.keyword.trim(),
    language_code: "en",
  };
  if (args.locationCoordinate?.trim()) {
    body.location_coordinate = args.locationCoordinate.trim();
  } else if (args.locationName?.trim()) {
    body.location_name = args.locationName.trim();
  } else {
    return null;
  }

  const res = await fetch(url, mcpPostInit(body, { signal: args.signal }));
  if (!res.ok) return null;
  return res.json();
}

function serpLocationFromPlace(site: WordPressSite, place: CompetitorGridPlaceRow): {
  locationCoordinate?: string;
  locationName?: string;
} {
  if (
    place.latitude != null &&
    place.longitude != null &&
    Number.isFinite(place.latitude) &&
    Number.isFinite(place.longitude)
  ) {
    return {
      locationCoordinate: `${place.latitude},${place.longitude},10000`,
    };
  }
  if (place.dfsKeyword.startsWith("host:")) {
    try {
      const geo = resolveProfileMapsGeo(site);
      return { locationName: profileGeoToDataForSeoLocationName(geo) };
    } catch {
      /* profile geo unavailable */
    }
  }
  const fromSite = hostnameFromUrl(getPublicSiteUrl(site));
  if (fromSite?.endsWith(".ca")) {
    return { locationName: "Canada" };
  }
  if (fromSite) {
    return { locationName: "United States" };
  }
  return {};
}

export function buildCompetitorSerpKeyword(businessName: string, focusKeyword: string): string {
  return `${businessName.trim()} ${focusKeyword.trim()}`.trim();
}

export type CompetitorDfsIntelResult = {
  topPages: CompetitorPageMeta[];
  serpHitCount: number;
  serpKeyword: string;
};

export async function fetchCompetitorDfsIntel(args: {
  place: CompetitorGridPlaceRow;
  focusKeyword: string;
  site: WordPressSite;
  signal?: AbortSignal;
}): Promise<CompetitorDfsIntelResult> {
  const serpKeyword = buildCompetitorSerpKeyword(args.place.businessName, args.focusKeyword);
  const { locationCoordinate, locationName } = serpLocationFromPlace(args.site, args.place);

  const serpJson = await fetchSerpOrganicJson({
    keyword: serpKeyword,
    locationCoordinate,
    locationName,
    signal: args.signal,
  });

  const serpPages = serpJson ? serpPagesFromQuery(serpJson, args.site) : [];

  let aiSnippet = "";
  if (locationCoordinate || locationName) {
    const aiJson = await fetchSerpAiOverviewJson({
      keyword: serpKeyword,
      locationCoordinate,
      locationName,
      signal: args.signal,
    });
    aiSnippet = aiJson ? extractAiOverviewSnippet(aiJson) : "";
  }

  const topPages: CompetitorPageMeta[] = [...serpPages];
  const firstSerpUrl = serpPages[0]?.url;
  if (aiSnippet.trim() && firstSerpUrl) {
    topPages.push({
      url: firstSerpUrl,
      title: `${args.place.businessName} (AI overview · ${serpKeyword})`,
      metaDescription: aiSnippet.slice(0, 500),
      bodySnippet: aiSnippet,
    });
  }

  return {
    topPages,
    serpHitCount: serpPages.length,
    serpKeyword,
  };
}
