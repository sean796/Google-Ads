import type { WordPressSite } from "@/components/integrations/types";
import { fetchLocationDiscovery, type LocationDiscoveryResult } from "@/lib/fetch-location-discovery";
import {
  importSchemaHintsFromLiveSite,
  type LocalBusinessAddressHint,
} from "@/lib/local-business-address-hint";
import { parseGmbDfsBusinessInfo } from "@/lib/gmb-dfs-parse";
import {
  fetchLocalStrategyGmbDfsRaw,
  isLikelyDataForSeoGmbLocationName,
} from "@/lib/local-strategy-research/local-strategy-gmb-fetch";
import { getPrimaryCityStateLabel } from "@/lib/primary-location-from-site";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import { DFS_ABORT_MS } from "@/lib/wordpress-site-display-name-dfs-helpers";

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
export type ApplyGbpPropertyWandResult = { ok: true; name: string } | { ok: false; error: string };

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
