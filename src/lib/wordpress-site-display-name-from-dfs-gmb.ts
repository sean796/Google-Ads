/**
 * Resolve a NEO Pulse property display name from DataForSEO Business Listings + Google Business Info,
 * matching the citation pipeline where possible, with extra fallbacks when Listings omit website URLs.
 * Optional: DataForSEO Google organic SERP (same style query as google.com/search?q=…) to recover
 * place_id / cid or a matching organic title when Maps Listings + GMB keyword paths miss.
 */

import type { WordPressSite } from "@/components/integrations/types";
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
import { fetchLocationDiscovery } from "@/lib/fetch-location-discovery";
import { getGoogleBusinessInfoItem, parseGmbDfsBusinessInfo } from "@/lib/gmb-dfs-parse";
import {
  fetchLocalStrategyGmbDfsRaw,
  inferDataForSeoLocationNameFromWebsiteUrl,
  isLikelyDataForSeoGmbLocationName,
} from "@/lib/local-strategy-research/local-strategy-gmb-fetch";
import { getPrimaryCityStateLabel } from "@/lib/primary-location-from-site";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import {
  DFS_ABORT_MS,
  buildReviewsSemanticsTaskFields,
  fetchSerpOrganicLiveAdvancedJson,
  fireGbpReviewSemanticsPipeline,
  gmbWebsiteHostMatchesSite,
  listingBizTitle,
  serpFindOrganicTitleForHost,
  serpFindPlaceKeywordForHost,
} from "@/lib/wordpress-site-display-name-dfs-helpers";
import { applyGbpPropertyWand, type ApplyGbpPropertyWandResult } from "@/lib/wordpress-site-display-name-gmb-wand";

export { applyGbpPropertyWand, fetchPropertyGmbDfsForSite } from "@/lib/wordpress-site-display-name-gmb-wand";
export type { ApplyGbpPropertyWandResult };

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
