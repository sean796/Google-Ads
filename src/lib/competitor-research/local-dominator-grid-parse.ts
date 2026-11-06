import Papa from "papaparse";
import { hostnameFromUrl } from "@/lib/competitor-research/filter-connected-site-competitors";

export interface CompetitorGridPlaceRow {
  /** DataForSEO `keyword` value, e.g. `cid:123` or `place_id:ChIJ...`. */
  dfsKeyword: string;
  businessName: string;
  rank: number;
  /** For DFS location context when available. */
  latitude: number | null;
  longitude: number | null;
  /** Human-readable id for errors (cid or place id snippet). */
  idLabel: string;
  /** Hostname from CSV Website column when present. */
  websiteHostname: string | null;
}

function num(v: string | undefined): number {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

/** Normalize CSV header keys: trim, strip BOM, lowercase (Excel/exports often add a BOM to the first header). */
function rowKeyMap(row: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.trim().replace(/^\uFEFF/g, "").toLowerCase(), v]),
  );
}

function pick(row: Record<string, string>, ...keys: string[]): string {
  const lower = rowKeyMap(row);
  for (const key of keys) {
    const v = lower[key.toLowerCase()];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

const RANK_HEADER_KEYS = [
  "Rank",
  "rank",
  "Position",
  "position",
  "Pos",
  "pos",
  "#",
  "Grid Rank",
  "grid rank",
  "Rank #",
  "Rank#",
  "GRID RANK",
];

/** Extract Google Maps numeric cid from a URL query string. */
export function extractCidFromMapsUrl(s: string): string | null {
  if (!s) return null;
  const m = s.match(/[?&]cid=([0-9]+)/i);
  return m ? m[1] : null;
}

/**
 * Build `keyword` for DataForSEO Google My Business Info from Place ID column and/or cid.
 */
export function buildDfsKeywordFromPlaceFields(placeIdCell: string, cidFromUrl: string | null): string | null {
  const trimmed = placeIdCell.trim();
  if (cidFromUrl) {
    return `cid:${cidFromUrl}`;
  }
  if (!trimmed) return null;
  // Numeric-only cell is treated as cid (common export quirk).
  if (/^\d+$/.test(trimmed)) {
    return `cid:${trimmed}`;
  }
  // Google Place ID (ChIJ… / GhIJ… style).
  if (/^[A-Za-z0-9_-]{10,}$/.test(trimmed)) {
    return `place_id:${trimmed}`;
  }
  return null;
}

/** Default cap on distinct places per import (top 10 by rank). */
export const GRID_CSV_MAX_PLACES_DEFAULT = 10;

/**
 * Parse a Local Dominator–style grid CSV: Rank + Place ID column and/or cid in Maps URLs.
 * Rows with a Google identifier but no usable Rank use a fallback rank so they are not dropped.
 * Dedupes by canonical id (cid string preferred), sorts by Rank ascending, returns up to `maxPlaces` rows.
 */
export function parseCompetitorGridTopPlaces(csvText: string, maxPlaces = GRID_CSV_MAX_PLACES_DEFAULT): {
  places: CompetitorGridPlaceRow[];
  error?: string;
} {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (h) => h.trim().replace(/^\uFEFF/g, ""),
  });

  if (parsed.errors?.length) {
    const fatal = parsed.errors.find((e) => e.type === "Quotes" || e.type === "Delimiter");
    if (fatal) {
      return { places: [], error: fatal.message || "CSV parse error" };
    }
  }

  const data = parsed.data || [];
  if (data.length === 0) {
    return { places: [], error: "No rows found in CSV." };
  }

  /** canonical id → best row (lowest rank wins). */
  const bestById = new Map<
    string,
    { dfsKeyword: string; businessName: string; rank: number; lat: number | null; lng: number | null; idLabel: string; websiteHostname: string | null }
  >();

  for (const raw of data) {
    const businessName = pick(raw, "Business", "business", "Business Name", "business name", "Name", "name");
    const websiteUrl = pick(
      raw,
      "Website URL",
      "Website Url",
      "website url",
      "Website",
      "website",
      "Site",
      "site",
    );
    const googleUrl = pick(
      raw,
      "Google URL",
      "Google Url",
      "google url",
      "Maps URL",
      "maps url",
      "Google Maps URL",
      "Map URL",
      "map url",
    );
    const placeIdCol = pick(raw, "Place ID", "Place Id", "place id", "PlaceID", "place_id");

    const cidFromUrl = extractCidFromMapsUrl(websiteUrl) || extractCidFromMapsUrl(googleUrl);
    const dfsKeyword = buildDfsKeywordFromPlaceFields(placeIdCol, cidFromUrl);
    if (!dfsKeyword) continue;

    let rank = num(pick(raw, ...RANK_HEADER_KEYS));
    if (!Number.isFinite(rank)) {
      rank = 999;
    }

    const lat = num(pick(raw, "Latitude", "latitude"));
    const lng = num(pick(raw, "Longitude", "longitude"));
    const latOk = Number.isFinite(lat) && lat >= -90 && lat <= 90;
    const lngOk = Number.isFinite(lng) && lng >= -180 && lng <= 180;

    const canon =
      dfsKeyword.startsWith("cid:") ? `cid:${dfsKeyword.slice(4)}` : `place:${dfsKeyword.replace(/^place_id:/, "")}`;
    const idLabel = dfsKeyword.startsWith("cid:") ? `cid ${dfsKeyword.slice(4)}` : dfsKeyword.replace(/^place_id:/, "place_id ");

    const websiteHostname = hostnameFromUrl(websiteUrl);

    const prev = bestById.get(canon);
    if (!prev || rank < prev.rank) {
      bestById.set(canon, {
        dfsKeyword,
        businessName: businessName || "Unknown business",
        rank,
        lat: latOk ? lat : null,
        lng: lngOk ? lng : null,
        idLabel,
        websiteHostname,
      });
    }
  }

  const sorted = [...bestById.values()].sort((a, b) => a.rank - b.rank);
  const capped = sorted.slice(0, maxPlaces);

  if (capped.length === 0) {
    return {
      places: [],
      error:
        "No competitor rows with a Google identifier (Place ID, numeric cid, or cid= in a Maps/Website URL). Check column names or add a Rank column.",
    };
  }

  return {
    places: capped.map((r) => ({
      dfsKeyword: r.dfsKeyword,
      businessName: r.businessName,
      rank: r.rank,
      latitude: r.lat,
      longitude: r.lng,
      idLabel: r.idLabel,
      websiteHostname: r.websiteHostname,
    })),
  };
}
