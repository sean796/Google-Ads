/**
 * Resolve a NEO Pulse property display name from DataForSEO Business Listings + Google Business Info,
 * matching the citation pipeline where possible, with extra fallbacks when Listings omit website URLs.
 * Optional: DataForSEO Google organic SERP (same style query as google.com/search?q=…) to recover
 * place_id / cid or a matching organic title when Maps Listings + GMB keyword paths miss.
 */

import { resolveMcpApiBase } from "@/lib/mcp-tools";
import type { WordPressSite } from "@/components/integrations/types";
import { hostnameFromMyBusinessInfoResponse } from "@/lib/competitor-research/competitor-grid-dfs-client";
import { normalizeCompetitorDomainKey } from "@/lib/competitor-research/competitor-domain-key";
import {
  buildBusinessListingsTitleQuery,
  buildGmbKeywordFromListingAndContext,
} from "@/lib/citation-research/citation-from-gmb-item";
import {
  flattenBusinessListingItems,
  getLocationCoordinateForWebsiteUrl,
  pickListingForSiteHostnameStrict,
  postBusinessListingsSearch,
  type BusinessListingItem,
} from "@/lib/citation-research/dfs-business-listings-client";
import { loadApiKey } from "@/lib/api";
import { fetchLocationDiscovery, type LocationDiscoveryResult } from "@/lib/fetch-location-discovery";
import {
  importSchemaHintsFromLiveSite,
  type LocalBusinessAddressHint,
} from "@/lib/local-business-address-hint";
import { extractGmbDfsPlaceIdentifiers, getGoogleBusinessInfoItem, parseGmbDfsBusinessInfo } from "@/lib/gmb-dfs-parse";
import {
  fetchLocalStrategyGmbDfsRaw,
  inferDataForSeoLocationNameFromWebsiteUrl,
  isLikelyDataForSeoGmbLocationName,
} from "@/lib/local-strategy-research/local-strategy-gmb-fetch";
import { getPrimaryCityStateLabel } from "@/lib/primary-location-from-site";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";

const DFS_ABORT_MS = 180_000;
const SERP_TREE_MAX_DEPTH = 90;
const GBP_SEM_PIPELINE_MS = 120_000;

type ReviewsSemanticsTaskPayload = {
  keyword?: string;
  place_id?: string;
  cid?: string;
  location_name?: string;
  location_code?: number;
  location_coordinate?: string;
  language_code: string;
  depth: number;
};

function buildReviewsSemanticsTaskFields(params: {
  gmbJson?: unknown | null;
  keywordFallback?: string;
  locationNamePrimary: string;
  locationCoordinateFallback: string;
  depth?: number;
}): ReviewsSemanticsTaskPayload | null {
  const language_code = "en";
  const depth = params.depth ?? 30;
  const locName = params.locationNamePrimary.trim();
  const locCoord = params.locationCoordinateFallback.trim();

  const loc: Pick<ReviewsSemanticsTaskPayload, "location_name" | "location_coordinate"> = {};
  if (locName) loc.location_name = locName;
  if (locCoord) loc.location_coordinate = locCoord;
  if (!loc.location_name && !loc.location_coordinate) return null;

  if (params.gmbJson) {
    const ids = extractGmbDfsPlaceIdentifiers(params.gmbJson);
    if (ids.placeId) {
      return { place_id: ids.placeId, ...loc, language_code, depth };
    }
    if (ids.cid) {
      return { cid: ids.cid, ...loc, language_code, depth };
    }
  }

  const fb = (params.keywordFallback || "").trim();
  if (!fb) return null;
  const lower = fb.toLowerCase();
  if (lower.startsWith("place_id:")) {
    const pid = fb.slice("place_id:".length).trim();
    if (pid && /^(ChIJ|GhIJ)/i.test(pid)) {
      return { place_id: pid, ...loc, language_code, depth };
    }
  }
  if (lower.startsWith("cid:")) {
    const c = fb.slice(4).trim();
    if (/^\d+$/.test(c)) {
      return { cid: c, ...loc, language_code, depth };
    }
  }
  return { keyword: fb, ...loc, language_code, depth };
}

function fireGbpReviewSemanticsPipeline(args: {
  siteId: string;
  openRouterApiKey?: string;
  businessTitle: string;
  task: ReviewsSemanticsTaskPayload;
}): void {
  const key = (args.openRouterApiKey || loadApiKey() || "").trim();
  if (!key) return;
  const base = (BACKEND_API_BASE || "").replace(/\/$/, "");
  if (!base) return;

  void (async () => {
    try {
      await fetch(`${base}/api/integrations/gbp-review-semantics-pipeline`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-OpenRouter-Api-Key": key,
        },
        body: JSON.stringify({
          siteId: args.siteId,
          businessTitle: args.businessTitle,
          openRouterApiKey: key,
          ...args.task,
        }),
        signal: AbortSignal.timeout(GBP_SEM_PIPELINE_MS),
      });
    } catch {
      /* best-effort; do not affect name resolution */
    }
  })();
}

function listingBizTitle(listing: BusinessListingItem | null): string {
  if (!listing) return "";
  const t = listing.title;
  const n = listing.name;
  const a = typeof t === "string" ? t.trim() : "";
  const b = typeof n === "string" ? n.trim() : "";
  return a || b;
}

function safeHostnameFromGmbJson(json: unknown): string | null {
  try {
    return hostnameFromMyBusinessInfoResponse(json);
  } catch {
    return null;
  }
}

function gmbWebsiteHostMatchesSite(json: unknown, wantHost: string): boolean {
  if (!wantHost) return false;
  const h = safeHostnameFromGmbJson(json);
  if (!h) return false;
  return h === wantHost || wantHost.endsWith(h) || h.endsWith(wantHost);
}

function urlHostMatchesWant(urlRaw: string, wantHost: string): boolean {
  if (!urlRaw?.trim() || !wantHost) return false;
  try {
    const h = normalizeCompetitorDomainKey(urlRaw);
    return h === wantHost || wantHost.endsWith(h) || h.endsWith(wantHost);
  } catch {
    return false;
  }
}

/**
 * Walk SERP JSON (local pack, nested items, etc.) for an object whose URL matches the site host
 * and that carries a Google place_id or cid — same evidence users see on a Google results page.
 */
function serpFindPlaceKeywordForHost(
  serpJson: unknown,
  wantHost: string,
): { keyword: string; serpTitle: string } | null {
  const seen = new WeakSet<object>();
  function walk(node: unknown, depth: number): { keyword: string; serpTitle: string } | null {
    if (depth > SERP_TREE_MAX_DEPTH || node == null || typeof node !== "object") return null;
    const o = node as Record<string, unknown>;
    if (seen.has(o)) return null;
    seen.add(o);

    const urlRaw =
      (typeof o.url === "string" && o.url) ||
      (typeof o.link === "string" && o.link) ||
      (typeof o.website === "string" && o.website) ||
      "";
    const hostOk = urlHostMatchesWant(urlRaw, wantHost);

    const title =
      (typeof o.title === "string" && o.title.trim()) ||
      (typeof o.name === "string" && o.name.trim()) ||
      "";

    const placeId = typeof o.place_id === "string" ? o.place_id.trim() : "";
    const cid = o.cid;

    if (hostOk) {
      if (placeId && /^(ChIJ|GhIJ)/i.test(placeId)) {
        const kw = placeId.startsWith("place_id:") ? placeId : `place_id:${placeId}`;
        return { keyword: kw, serpTitle: title };
      }
      if (typeof cid === "number" && Number.isFinite(cid)) {
        return { keyword: `cid:${cid}`, serpTitle: title };
      }
      const cs = typeof cid === "string" ? cid.trim() : "";
      if (cs.length > 0 && /^\d+$/.test(cs)) {
        return { keyword: `cid:${cs}`, serpTitle: title };
      }
    }

    for (const v of Object.values(o)) {
      if (Array.isArray(v)) {
        for (const x of v) {
          const r = walk(x, depth + 1);
          if (r) return r;
        }
      } else if (v && typeof v === "object") {
        const r = walk(v, depth + 1);
        if (r) return r;
      }
    }
    return null;
  }
  return walk(serpJson, 0);
}

/** First organic-like row whose URL hostname matches wantHost (title often matches knowledge panel). */
function serpFindOrganicTitleForHost(serpJson: unknown, wantHost: string): string | null {
  const seen = new WeakSet<object>();
  function walk(node: unknown, depth: number): string | null {
    if (depth > SERP_TREE_MAX_DEPTH || node == null || typeof node !== "object") return null;
    const o = node as Record<string, unknown>;
    if (seen.has(o)) return null;
    seen.add(o);

    const typ = typeof o.type === "string" ? o.type : "";
    const urlRaw =
      (typeof o.url === "string" && o.url) ||
      (typeof o.link === "string" && o.link) ||
      "";
    const title = typeof o.title === "string" ? o.title.trim() : "";
    if ((typ === "organic" || typ === "") && title && urlRaw && urlHostMatchesWant(urlRaw, wantHost)) {
      return title;
    }

    for (const v of Object.values(o)) {
      if (Array.isArray(v)) {
        for (const x of v) {
          const r = walk(x, depth + 1);
          if (r) return r;
        }
      } else if (v && typeof v === "object") {
        const r = walk(v, depth + 1);
        if (r) return r;
      }
    }
    return null;
  }
  return walk(serpJson, 0);
}

async function fetchSerpOrganicLiveAdvancedJson(args: {
  keyword: string;
  locationName: string;
  signal?: AbortSignal;
}): Promise<unknown | null> {
  const base = (BACKEND_API_BASE || "").replace(/\/$/, "");
  const url = `${base}/DataForSEO_serp_organic_live_advanced`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      keyword: args.keyword.trim(),
      location_name: args.locationName.trim(),
      language_code: "en",
      depth: 30,
    }),
    signal: args.signal,
  });
  const j = (await res.json()) as { error?: string };
  if (!res.ok) {
    return null;
  }
  return j;
}

export type ApplyGbpPropertyWandResult = { ok: true; name: string } | { ok: false; error: string };

/** GMB fetch for local tools — same keyword/geo path as Master Rules GBP wand. */
export async function fetchPropertyGmbDfsForSite(
  site: WordPressSite,
  options?: { signal?: AbortSignal },
): Promise<{ gmbJson: unknown; keyword: string } | null> {
  const publicWebUrl = getPublicSiteUrl(site).trim();
  if (!publicWebUrl) return null;
  const keyword = buildSingleGmbKeywordForWand(site, publicWebUrl);
  const geo = await resolveGmbWandGeoFromSiteUrl(site, publicWebUrl);
  const gmbJson = await fetchLocalStrategyGmbDfsRaw({
    keyword,
    locationName: geo.locationName,
    locationCoordinate: geo.locationCoordinate,
    savedPropertyGeoOnly: true,
    signal: options?.signal ?? AbortSignal.timeout(DFS_ABORT_MS),
  });
  if (gmbJson == null) return null;
  return { gmbJson, keyword };
}

function buildSingleGmbKeywordForWand(site: WordPressSite, publicWebUrl: string): string {
  const nap = site.napInfo?.name?.trim();
  const cityState = getPrimaryCityStateLabel(site)?.trim();
  const nameBase = nap || site.name.trim();
  if (cityState) return `${nameBase} ${cityState}`.trim();
  return nameBase || (publicWebUrl.includes("://") ? publicWebUrl.trim() : `https://${publicWebUrl.trim()}`);
}

function resolveGmbWandGeoFromTile(site: WordPressSite): {
  locationName?: string;
  locationCoordinate?: string;
} {
  const loc = pickPrimaryLocation(site);
  const city = loc?.city?.trim();
  const state = loc?.state?.trim();
  if (city && state) {
    const locName = `${city},${state}`;
    if (isLikelyDataForSeoGmbLocationName(locName)) {
      return { locationName: locName };
    }
  }
  const cityState = getPrimaryCityStateLabel(site)?.trim();
  if (cityState && isLikelyDataForSeoGmbLocationName(cityState)) {
    return { locationName: cityState };
  }
  return {};
}

async function resolveGmbWandGeoFromSiteUrl(
  site: WordPressSite,
  publicWebUrl: string,
): Promise<{
  locationName?: string;
  locationCoordinate?: string;
  locationDiscovery?: LocationDiscoveryResult;
  localBusinessHint?: LocalBusinessAddressHint;
}> {
  const fromTile = resolveGmbWandGeoFromTile(site);
  if (fromTile.locationName || fromTile.locationCoordinate) {
    return fromTile;
  }

  let locationDiscovery: LocationDiscoveryResult | undefined;
  try {
    locationDiscovery = await fetchLocationDiscovery(publicWebUrl, {
      entitySitemapUrl: site.entitySitemapUrl?.trim() || undefined,
    });
    const geoLabel =
      locationDiscovery.primarySuggestion?.trim() ||
      locationDiscovery.primaryAreaLabel?.trim() ||
      locationDiscovery.addresses?.[0]?.label?.trim() ||
      "";
    if (geoLabel && isLikelyDataForSeoGmbLocationName(geoLabel)) {
      return { locationName: geoLabel, locationDiscovery };
    }
  } catch {
    /* ignore */
  }

  try {
    const hint = await importSchemaHintsFromLiveSite(site);
    if (hint?.lat && hint?.lng) {
      return {
        locationCoordinate: `${hint.lat},${hint.lng},50`,
        locationDiscovery,
        localBusinessHint: hint,
      };
    }
    if (hint?.label && isLikelyDataForSeoGmbLocationName(hint.label)) {
      return { locationName: hint.label, locationDiscovery, localBusinessHint: hint };
    }
    if (hint) {
      return { locationDiscovery, localBusinessHint: hint };
    }
  } catch {
    /* ignore */
  }

  return { locationDiscovery };
}

function pickPrimaryLocation(site: WordPressSite) {
  const fromSite = site.locations?.find((l) => l.isDefault) ?? site.locations?.[0];
  const fromNap =
    site.napInfo?.locations?.find((l) => l.isDefault) ?? site.napInfo?.locations?.[0];
  return fromSite ?? fromNap ?? null;
}

/**
 * GBP property wand: one DataForSEO `my_business_info` call → OpenRouter nested triples → Master Rules.
 */
export async function applyGbpPropertyWand(
  site: WordPressSite,
  options?: { signal?: AbortSignal; openRouterApiKey?: string },
): Promise<ApplyGbpPropertyWandResult> {
  const signal = options?.signal ?? AbortSignal.timeout(DFS_ABORT_MS);
  const publicWebUrl = getPublicSiteUrl(site).trim();
  if (!publicWebUrl) {
    return { ok: false, error: "Set Site URL or Production URL first." };
  }

  const keyword = buildSingleGmbKeywordForWand(site, publicWebUrl);
  const geo = await resolveGmbWandGeoFromSiteUrl(site, publicWebUrl);

  const gmbJson =
    (await fetchLocalStrategyGmbDfsRaw({
      keyword,
      locationName: geo.locationName,
      locationCoordinate: geo.locationCoordinate,
      savedPropertyGeoOnly: true,
      signal,
    })) ?? {};

  const { importGbpAddressFromDfsForSite } = await import("@/lib/master-rules-gbp-address-import");
  const imp = await importGbpAddressFromDfsForSite(site, {
    gmbJson,
    openRouterApiKey: options?.openRouterApiKey,
    signal,
    keyword,
    locationDiscovery: geo.locationDiscovery,
    localBusinessHint: geo.localBusinessHint,
  });
  if (imp.ok === false) return { ok: false, error: imp.error };

  const name =
    imp.businessName.trim() ||
    parseGmbDfsBusinessInfo(gmbJson)?.title?.trim() ||
    site.name.trim();

  return { ok: true, name };
}

export type SuggestSiteDisplayNameFromDfsGmbResult =
  | { ok: true; name: string; gmbJson: unknown | null; gmbJsonForMasterRules: unknown | null }
  | { ok: false; error: string };

/**
 * Fetches Business Listings (Maps-style), picks a row whose website matches the public site URL,
 * then prefers the live GBP title from DataForSEO GMB Info when available.
 *
 * **DataForSEO endpoints:** `business_listings/search/live`, then `google/my_business_info/live`.
 * If Listings never attach a crawlable website URL for your place (common), we fall back to
 * GMB Info using your **site URL as keyword** or **business name + city** — only accepted when
 * the GMB payload’s website hostname matches your property URL.
 *
 * **SERP fallback:** `serp/google/organic/live/advanced` with a normal Google-style keyword (property name),
 * then scan for local / nested rows with matching website + place_id/cid, or a matching organic title.
 */
export async function suggestSiteDisplayNameFromDfsGmb(
  site: WordPressSite,
  options?: { signal?: AbortSignal; openRouterApiKey?: string },
): Promise<SuggestSiteDisplayNameFromDfsGmbResult> {
  const signal = options?.signal ?? AbortSignal.timeout(DFS_ABORT_MS);
  const publicWebUrl = getPublicSiteUrl(site).trim();
  if (!publicWebUrl) {
    return { ok: false, error: "Set Site URL or Production URL first." };
  }

  const wantHost = normalizeCompetitorDomainKey(publicWebUrl);
  if (!wantHost) {
    return { ok: false, error: "Could not read a hostname from Site URL or Production URL." };
  }

  const locCoord = getLocationCoordinateForWebsiteUrl(publicWebUrl);
  const serpLocationName = inferDataForSeoLocationNameFromWebsiteUrl(publicWebUrl);

  let cityRegion = getPrimaryCityStateLabel(site) ?? "";
  if (!cityRegion.trim()) {
    try {
      const disc = await fetchLocationDiscovery(publicWebUrl.trim());
      cityRegion =
        disc.primarySuggestion?.trim() ||
        disc.primaryAreaLabel?.trim() ||
        (Array.isArray(disc.areaLabels) && disc.areaLabels[0] ? String(disc.areaLabels[0]).trim() : "") ||
        "";
    } catch {
      /* ignore */
    }
  }

  const reviewsLocationLabel = (
    cityRegion.trim() && isLikelyDataForSeoGmbLocationName(cityRegion) ? cityRegion : serpLocationName
  ).trim();

  const titleQuery = buildBusinessListingsTitleQuery(site);
  let lastGmbFetchRaw: unknown | null = null;
  let firstGmbWithBusinessInfo: unknown | null = null;
  const captureGmbForMasterRules = (json: unknown | null | undefined) => {
    if (json && firstGmbWithBusinessInfo == null && getGoogleBusinessInfoItem(json)) {
      firstGmbWithBusinessInfo = json;
    }
  };
  const okSuggest = (name: string): SuggestSiteDisplayNameFromDfsGmbResult => ({
    ok: true,
    name: name.trim(),
    gmbJson: lastGmbFetchRaw,
    gmbJsonForMasterRules: firstGmbWithBusinessInfo,
  });

  const tryListingForBlTitle = async (title: string): Promise<BusinessListingItem | null> => {
    const t = title.trim();
    if (!t) return null;
    let blJson: unknown;
    try {
      blJson = await postBusinessListingsSearch({
        title: t,
        locationCoordinate: locCoord,
        limit: 40,
        signal,
      });
    } catch {
      return null;
    }
    const items = flattenBusinessListingItems(blJson);
    if (!items.length) return null;
    return pickListingForSiteHostnameStrict(items, publicWebUrl);
  };

  let listing: BusinessListingItem | null = await tryListingForBlTitle(titleQuery);
  if (!listing && wantHost && titleQuery.trim().toLowerCase() !== wantHost.toLowerCase()) {
    listing = await tryListingForBlTitle(wantHost);
  }

  const tryGmbTitleWhenWebsiteMatches = (json: unknown): string | null => {
    if (!gmbWebsiteHostMatchesSite(json, wantHost)) return null;
    return parseGmbDfsBusinessInfo(json)?.title?.trim() || null;
  };

  if (listing) {
    const bizTitle =
      listingBizTitle(listing) ||
      site.napInfo?.name?.trim() ||
      site.name.trim() ||
      "";

    const gmbKw = buildGmbKeywordFromListingAndContext({
      listing,
      businessTitleFallback: bizTitle,
      cityRegionLine: cityRegion,
      seedKeyword: undefined,
    });

    let gmbJson: unknown | null = null;
    try {
      const gmbLocName =
        cityRegion.trim() && isLikelyDataForSeoGmbLocationName(cityRegion) ? cityRegion.trim() : undefined;
      gmbJson = await fetchLocalStrategyGmbDfsRaw({
        keyword: gmbKw,
        websiteUrl: publicWebUrl,
        locationName: gmbLocName,
        locationCoordinate: gmbLocName ? undefined : locCoord,
        signal,
      });
    } catch {
      gmbJson = null;
    }
    if (gmbJson) {
      lastGmbFetchRaw = gmbJson;
      captureGmbForMasterRules(gmbJson);
    }

    const gmbTitle = gmbJson ? tryGmbTitleWhenWebsiteMatches(gmbJson) : null;
    const listingTitle = listingBizTitle(listing).trim();
    const name = (gmbTitle || listingTitle).trim();
    if (!name) {
      return {
        ok: false,
        error: "Could not read a business title from Google Business Profile or listings.",
      };
    }
    if (gmbJson && gmbWebsiteHostMatchesSite(gmbJson, wantHost)) {
      const task = buildReviewsSemanticsTaskFields({
        gmbJson,
        keywordFallback: gmbKw,
        locationNamePrimary: reviewsLocationLabel,
        locationCoordinateFallback: locCoord,
      });
      if (task) {
        fireGbpReviewSemanticsPipeline({
          siteId: site.id,
          openRouterApiKey: options?.openRouterApiKey,
          businessTitle: name,
          task,
        });
      }
    }
    return okSuggest(name);
  }

  const urlKeyword = publicWebUrl.includes("://") ? publicWebUrl.trim() : `https://${publicWebUrl.trim()}`;
  let gmbByUrl: unknown | null = null;
  try {
    gmbByUrl = await fetchLocalStrategyGmbDfsRaw({
      keyword: urlKeyword,
      websiteUrl: publicWebUrl,
      locationCoordinate: locCoord,
      signal,
    });
  } catch {
    gmbByUrl = null;
  }
  if (gmbByUrl) {
    lastGmbFetchRaw = gmbByUrl;
    captureGmbForMasterRules(gmbByUrl);
  }
  if (gmbByUrl) {
    const name = tryGmbTitleWhenWebsiteMatches(gmbByUrl);
    if (name) {
      const task = buildReviewsSemanticsTaskFields({
        gmbJson: gmbByUrl,
        keywordFallback: urlKeyword,
        locationNamePrimary: reviewsLocationLabel,
        locationCoordinateFallback: locCoord,
      });
      if (task) {
        fireGbpReviewSemanticsPipeline({
          siteId: site.id,
          openRouterApiKey: options?.openRouterApiKey,
          businessTitle: name,
          task,
        });
      }
      return okSuggest(name);
    }
  }

  const nameSeed = site.napInfo?.name?.trim() || titleQuery.trim();
  let gmbByName: unknown | null = null;
  if (nameSeed) {
    const geoOk = cityRegion.trim() && isLikelyDataForSeoGmbLocationName(cityRegion);
    const keyword = geoOk ? `${nameSeed} ${cityRegion.trim()}`.trim() : nameSeed;
    try {
      gmbByName = await fetchLocalStrategyGmbDfsRaw({
        keyword,
        websiteUrl: publicWebUrl,
        locationName: geoOk ? cityRegion.trim() : undefined,
        locationCoordinate: geoOk ? undefined : locCoord,
        signal,
      });
    } catch {
      gmbByName = null;
    }
    if (gmbByName) {
      lastGmbFetchRaw = gmbByName;
      captureGmbForMasterRules(gmbByName);
    }
    if (gmbByName) {
      const name = tryGmbTitleWhenWebsiteMatches(gmbByName);
      if (name) {
        const task = buildReviewsSemanticsTaskFields({
          gmbJson: gmbByName,
          keywordFallback: keyword,
          locationNamePrimary: reviewsLocationLabel,
          locationCoordinateFallback: locCoord,
        });
        if (task) {
          fireGbpReviewSemanticsPipeline({
            siteId: site.id,
            openRouterApiKey: options?.openRouterApiKey,
            businessTitle: name,
            task,
          });
        }
        return okSuggest(name);
      }
    }
  }

  const serpKeyword = (nameSeed || titleQuery).trim();
  if (serpKeyword) {
    const serpRaw = await fetchSerpOrganicLiveAdvancedJson({
      keyword: serpKeyword,
      locationName: serpLocationName,
      signal,
    });

    if (serpRaw) {
      const placeHit = serpFindPlaceKeywordForHost(serpRaw, wantHost);

      if (placeHit) {
        let gmbSerp: unknown | null = null;
        try {
          gmbSerp = await fetchLocalStrategyGmbDfsRaw({
            keyword: placeHit.keyword,
            websiteUrl: publicWebUrl,
            locationName: serpLocationName,
            signal,
          });
        } catch {
          gmbSerp = null;
        }
        if (gmbSerp) {
          lastGmbFetchRaw = gmbSerp;
          captureGmbForMasterRules(gmbSerp);
        }
        const t = gmbSerp ? parseGmbDfsBusinessInfo(gmbSerp)?.title?.trim() : "";
        if (t) {
          const task = buildReviewsSemanticsTaskFields({
            gmbJson: gmbSerp,
            keywordFallback: placeHit.keyword,
            locationNamePrimary: serpLocationName,
            locationCoordinateFallback: locCoord,
          });
          if (task) {
            fireGbpReviewSemanticsPipeline({
              siteId: site.id,
              openRouterApiKey: options?.openRouterApiKey,
              businessTitle: t,
              task,
            });
          }
          return okSuggest(t);
        }
        if (placeHit.serpTitle) {
          const task = buildReviewsSemanticsTaskFields({
            gmbJson: null,
            keywordFallback: placeHit.keyword,
            locationNamePrimary: serpLocationName,
            locationCoordinateFallback: locCoord,
          });
          if (task) {
            fireGbpReviewSemanticsPipeline({
              siteId: site.id,
              openRouterApiKey: options?.openRouterApiKey,
              businessTitle: placeHit.serpTitle,
              task,
            });
          }
          return okSuggest(placeHit.serpTitle);
        }
      }

      const organicTitle = serpFindOrganicTitleForHost(serpRaw, wantHost);
      if (organicTitle) {
        return okSuggest(organicTitle);
      }
    }
  }

  return {
    ok: false,
    error:
      "DataForSEO had no Business Listings row with your domain, and GBP did not return your site as the business URL. Try pulling NAP / address in Site Settings, or set Production URL to the exact live homepage.",
  };
}

export type BulkApplyGmbSuggestedDisplayNameStats = {
  updated: number;
  unchanged: number;
  failed: number;
  firstError: string | null;
};

/**
 * Runs {@link suggestSiteDisplayNameFromDfsGmb} for every site **sequentially** (low concurrency for DataForSEO),
 * then calls `apply` when the suggested name differs from `site.name`.
 */
export async function bulkApplyGmbSuggestedDisplayNames(
  sites: readonly WordPressSite[],
  apply: (siteId: string, trimmedName: string) => void,
  options?: { signal?: AbortSignal; openRouterApiKey?: string },
): Promise<BulkApplyGmbSuggestedDisplayNameStats> {
  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  let firstError: string | null = null;

  const results: ApplyGbpPropertyWandResult[] = [];
  for (const site of sites) {
    const r = await applyGbpPropertyWand(site, options);
    results.push(r);
  }

  for (let i = 0; i < sites.length; i++) {
    const site = sites[i]!;
    const r = results[i]!;
    if (r.ok === false) {
      failed += 1;
      if (!firstError) firstError = r.error;
      continue;
    }
    const next = r.name.trim();
    if (next === site.name.trim()) {
      unchanged += 1;
      continue;
    }
    apply(site.id, next);
    updated += 1;
  }
  return { updated, unchanged, failed, firstError };
}
