import type { GridLocationBucket } from "@/lib/local-analysis/grid-location-buckets";
import {
  extractClusterWikiGeo,
  isRejectedNeighbourhoodWikiTitle,
  type ClusterWikiGeo,
} from "@/lib/local-analysis/cluster-wiki-candidates";
import { firstCityStateLabelFromAddress } from "@/lib/local-dominator-csv";
import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import {
  isRejectedSapGridEntityLabel,
  isRejectedSapGridWikiTitle,
} from "@/lib/local-analysis/sap-grid-entity-reject";

export type WikiGeoTier = "place" | "building_landmark";

export type WikiGeoEntry = {
  wikipediaTitle: string;
  wikipediaUrl: string;
  entityLabel: string;
  tier: WikiGeoTier;
};

export type HarvestWikiPlacesResult = {
  pool: WikiGeoEntry[];
  tier1Count: number;
  tier2Count: number;
};

export function wikiUrlFromTitle(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, "_"))}`;
}

export function entityLabelFromWikiTitle(title: string, geo: ClusterWikiGeo | null): string {
  const t = title.trim();
  if (!t) return "";
  if (geo && t.includes(",")) {
    return t;
  }
  if (geo) {
    return `${t}, ${geo.city}, ${geo.regionCode}`;
  }
  return t;
}

export function isListIndexWikiTitle(title: string): boolean {
  return title.trim().toLowerCase().startsWith("list of");
}

/** Reject org/gov/conference/news titles that are not physical places. */
export function isRejectedNonPlaceWikiTitle(title: string): boolean {
  if (isRejectedSapGridWikiTitle(title)) return true;
  const lower = title.trim().toLowerCase();
  if (!lower) return true;
  if (/\bconference\b/.test(lower)) return true;
  if (/\bdepartment of\b/.test(lower)) return true;
  if (/\bministry of\b/.test(lower)) return true;
  if (/\bjustice\b/.test(lower) && !/\bpark\b/.test(lower)) return true;
  if (/\bmurder\b/.test(lower)) return true;
  if (/\bshooting\b/.test(lower)) return true;
  if (/\btrial\b/.test(lower)) return true;
  if (/\bdisaster\b/.test(lower)) return true;
  if (/\baccident\b/.test(lower)) return true;
  if (/^block settlement\b/.test(lower)) return true;
  return false;
}

function isCityOnlyWikiTitle(title: string, geo: ClusterWikiGeo): boolean {
  const lower = title.trim().toLowerCase();
  return (
    lower === `${geo.city}, ${geo.regionName}`.toLowerCase()
    || lower === `${geo.city}, ${geo.regionCode}`.toLowerCase()
    || lower === geo.city.toLowerCase()
  );
}

/** Entity label must name a place inside parentCity (not a different city in the grid list). */
export function entityBelongsToParentCity(entity: string, parentLabel: string): boolean {
  const parentGeo = extractClusterWikiGeo(parentLabel);
  if (!parentGeo) return true;
  const norm = normalizeEntityHintCommaLabel(entity);
  const parts = norm.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  const parentCity = parentGeo.city.toLowerCase();
  if (parts.length === 2) {
    const first = parts[0]!.toLowerCase();
    const second = parts[1]!.toLowerCase();
    if (second === parentCity) return true;
    if (second === parentGeo.regionCode.toLowerCase() || second === parentGeo.regionName.toLowerCase()) {
      return first === parentCity;
    }
    return first === parentCity;
  }
  if (parts.length >= 3) {
    return parts[parts.length - 2]!.toLowerCase() === parentCity;
  }
  return parts[0]!.toLowerCase() === parentCity;
}

/** Keep only neighbourhood/building titles scoped to this parent city bucket. */
export function wikiPoolEntriesForParentCity(
  pool: WikiGeoEntry[],
  parentLabel: string,
  geo: ClusterWikiGeo,
): WikiGeoEntry[] {
  return pool.filter((entry) => {
    if (isListIndexWikiTitle(entry.wikipediaTitle)) return false;
    if (isRejectedNonPlaceWikiTitle(entry.wikipediaTitle)) return false;
    if (isRejectedNeighbourhoodWikiTitle(entry.wikipediaTitle, geo)) return false;
    if (isCityOnlyWikiTitle(entry.wikipediaTitle, geo)) return false;
    const entity = normalizeEntityHintCommaLabel(entry.entityLabel);
    if (!entity || isRejectedSapGridEntityLabel(entity)) return false;
    return entityBelongsToParentCity(entity, parentLabel);
  });
}

/** Place hints from this bucket only (not the whole grid export). */
export function bucketPlaceHints(bucket: GridLocationBucket): string[] {
  const out = new Set<string>();
  for (const addr of bucket.sampleAddresses) {
    const citySt = firstCityStateLabelFromAddress(addr);
    if (citySt) out.add(citySt);
  }
  const label = bucket.placeLabel.trim();
  if (label) out.add(label);
  return [...out];
}

export function cityGeoFromBucket(bucket: GridLocationBucket): ClusterWikiGeo | null {
  for (const addr of bucket.sampleAddresses) {
    const citySt = firstCityStateLabelFromAddress(addr);
    if (citySt) {
      const geo = extractClusterWikiGeo(citySt);
      if (geo) return geo;
    }
  }
  const label = bucket.placeLabel.trim();
  return extractClusterWikiGeo(label) ?? extractClusterWikiGeo(`${label}, MB`);
}

export function isWikiTitleScopedToParentCity(title: string, parentLabel: string): boolean {
  const geo = extractClusterWikiGeo(parentLabel);
  if (!geo) return true;
  const t = title.trim();
  if (!t) return false;
  if (t.includes(",")) return true;
  const city = geo.city.trim();
  const cityLower = city.toLowerCase();
  const titleLower = t.toLowerCase();
  if (titleLower.includes(cityLower)) return true;
  if (city.includes(" ") && titleLower.length < cityLower.length) {
    const firstWord = cityLower.split(/\s+/)[0] ?? "";
    if (firstWord && titleLower === firstWord) return false;
  }
  return true;
}

export function wikiEntryToGridClusterWiki(
  entry: WikiGeoEntry,
  gridPlaceLabel: string,
): { gridPlaceLabel: string; title: string; url: string } {
  return {
    gridPlaceLabel,
    title: entry.wikipediaTitle,
    url: entry.wikipediaUrl,
  };
}
