import { resolveMcpApiBase } from "@/lib/mcp-tools";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { getGMBPullDateRanges } from "@/lib/gmb-date-helpers";
import type { LocalStrategyGmbOauthWire } from "@/lib/local-strategy-research/local-strategy-report-wire";

/**
 * DataForSEO `location_name` for GMB business_info - coarse geography for the API only.
 * When the caller does not pass `locationName`, uses the public site hostname TLD so
 * `.ca` / `.co.uk` / etc. do not default to United States (avoids "No Search Results" for wrong market).
 */
/** True when `websiteUrl` can be used to infer a DataForSEO `location_name` from TLD (not empty / invalid). */
export function isValidWebsiteUrlForGmbInference(websiteUrl: string | undefined): boolean {
  const raw = websiteUrl?.trim();
  if (!raw) return false;
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return Boolean(u.hostname?.length);
  } catch {
    return false;
  }
}

/**
 * DataForSEO GMB `location_name` must be a supported search-engine location (e.g. City,Region,Country),
 * not a street address or postal line. Passing a full address returns Invalid Field: 'location_name'.
 */
export function isLikelyDataForSeoGmbLocationName(locationName: string): boolean {
  const t = locationName.trim();
  if (!t) return false;
  if (/^\d/.test(t)) return false;
  if ((t.match(/,/g) || []).length >= 3) return false;
  if (/\bP\.?\s*O\.?\s*Box\b/i.test(t)) return false;
  return true;
}

export function inferDataForSeoLocationNameFromWebsiteUrl(websiteUrl: string): string {
  const raw = websiteUrl.trim();
  if (!raw) return "United States";
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    const hostname = u.hostname.toLowerCase();
    if (hostname.endsWith(".ca")) return "Canada";
    if (hostname.endsWith(".co.uk") || hostname.endsWith(".uk")) return "United Kingdom";
    if (hostname.endsWith(".com.au") || hostname.endsWith(".au")) return "Australia";
    if (hostname.endsWith(".co.nz") || hostname.endsWith(".nz")) return "New Zealand";
    if (hostname.endsWith(".de")) return "Germany";
    if (hostname.endsWith(".fr")) return "France";
    if (hostname.endsWith(".mx")) return "Mexico";
  } catch {
    /* invalid URL */
  }
  return "United States";
}

/**
 * DataForSEO My Business Info (live) - keyword is typically "Business Name City, ST".
 */
export async function fetchLocalStrategyGmbDfsRaw(options: {
  keyword: string;
  /** e.g. "United States", "Austin,Texas,United States" per DataForSEO locations */
  locationName?: string;
  /**
   * When set, sent as `location_coordinate` and `location_name` is omitted.
   * Use the same string as Business Listings Search for consistent geography.
   */
  locationCoordinate?: string;
  /** When `locationName` and `locationCoordinate` are omitted, TLD infers `location_name` unless `savedPropertyGeoOnly`. */
  websiteUrl?: string;
  /** When true, never infer geo from website TLD; caller must pass locationName or locationCoordinate. */
  savedPropertyGeoOnly?: boolean;
  /** Pass `AbortSignal.timeout(ms)` so the UI does not hang on slow DataForSEO responses. */
  signal?: AbortSignal;
}): Promise<unknown | null> {
  const kw = options.keyword.trim();
  if (!kw) return null;

  const base = (BACKEND_API_BASE || "").replace(/\/$/, "");
  const url = `${base}/DataForSEO_business_data_google_my_business_info_live`;

  const body: Record<string, string> = {
    keyword: kw,
    language_code: "en",
  };
  const locNameRaw = options.locationName?.trim();
  const locName =
    locNameRaw && isLikelyDataForSeoGmbLocationName(locNameRaw) ? locNameRaw : undefined;
  const locCoord = options.locationCoordinate?.trim();
  if (locCoord) {
    body.location_coordinate = locCoord;
  } else if (locName) {
    body.location_name = locName;
  } else if (options.savedPropertyGeoOnly) {
    return null;
  } else {
    if (!isValidWebsiteUrlForGmbInference(options.websiteUrl)) {
      return null;
    }
    body.location_name = inferDataForSeoLocationNameFromWebsiteUrl(options.websiteUrl ?? "");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  const j = (await res.json()) as {
    error?: string;
    details?: unknown;
    tasks?: Array<{ status_code?: number; status_message?: string; result?: unknown[] }>;
  };
  if (!res.ok) {
    if (j.details != null) return j.details;
    return j;
  }
  return j;
}

/**
 * Optional: Google OAuth GBP performance metrics (requires backend session + GMB configured).
 */
export async function fetchLocalStrategyGmbOauthSnapshot(options?: {
  locationIds?: string[];
}): Promise<LocalStrategyGmbOauthWire | null> {
  const base = (BACKEND_API_BASE || "").replace(/\/$/, "");
  if (!base) return null;

  const dates = getGMBPullDateRanges();
  const body: Record<string, unknown> = { ...dates };
  if (options?.locationIds?.length) {
    body.locationIds = options.locationIds;
  }

  try {
    const res = await fetch(`${base}/api/gmb/performance`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as {
      success?: boolean;
      currentPeriod?: LocalStrategyGmbOauthWire["currentPeriod"];
      comparisonPeriod?: LocalStrategyGmbOauthWire["comparisonPeriod"];
      locationCount?: number;
    };
    if (!res.ok || !data.success || !data.currentPeriod) {
      return null;
    }
    return {
      locationCount: data.locationCount,
      currentPeriod: data.currentPeriod,
      comparisonPeriod: data.comparisonPeriod,
    };
  } catch {
    return null;
  }
}
