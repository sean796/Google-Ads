import {
  editorialContentPackageTierForPropertyName,
  editorialPublishTimeLocalForPropertyName,
  isEditorialContentPackageTier,
  normalizeEditorialPropertyName,
} from "@/lib/editorial-content-package";
import { isOptimizationPackageTier } from "@/lib/wordpress-optimization-package";
import { wordPressSiteHostKey } from "@/lib/wordpress-site-host-key";
import { applyWpEngineHostingDefaults } from "@/lib/wp-engine-install-defaults";
import { applyGa4PropertyIdDefaults } from "@/lib/ga4-property-id-defaults";
import { applySemrushProjectDefaults } from "@/lib/semrush-project-id-defaults";
import {
  isShutterSpotProperty,
  SHUTTER_SPOT_CANONICAL_NAME,
  SHUTTER_SPOT_GOOGLE_ADS_CUSTOMER_ID,
} from "@/lib/shutter-spot-site";
import type { WordPressSite } from "./types";

function pickLongestTrimmedName(...candidates: string[]): string {
  const trimmed = candidates.map((c) => c.trim()).filter(Boolean);
  if (trimmed.length === 0) return "";
  return trimmed.sort((a, b) => b.length - a.length)[0];
}

export function restoreOriginalIntegrationsSiteName(
  site: WordPressSite,
  mirrorRow?: WordPressSite,
): WordPressSite {
  const nap = site.napInfo?.name?.trim() ?? "";
  const mirrorName = mirrorRow?.name?.trim() ?? "";
  const bestName = pickLongestTrimmedName(site.name, nap, mirrorName);

  let next: WordPressSite =
    bestName && bestName !== site.name.trim() ? { ...site, name: bestName } : { ...site };

  if (next.menuDisplayName !== undefined) {
    const { menuDisplayName: _menu, ...rest } = next;
    next = rest as WordPressSite;
  }

  return next;
}

/** Shallow-sorted copy for cloud backup; preserves each site `id` and does not mutate the live list order. */
export function sortWordPressSitesByName(sites: WordPressSite[]): WordPressSite[] {
  return [...sites].sort((a, b) =>
    (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" }),
  );
}

/** Inline data URLs must not be persisted in browser storage (quota). Server holds uploaded logos. */
export function clientLogoUrlForLocalStorage(url?: string): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed || trimmed.startsWith("data:")) return undefined;
  return trimmed;
}

export function stripInlineClientLogoFromSite(site: WordPressSite): WordPressSite {
  const url = site.clientLogoUrl?.trim();
  if (!url?.startsWith("data:")) return site;
  return {
    ...site,
    clientLogoUrl: undefined,
    clientLogoSource: undefined,
    clientLogoFetchedAt: undefined,
  };
}

/** Drop large sitemap payloads (urls, postMetadata) that can exceed localStorage quota. Keeps childSitemaps + endpoints. */
export function slimSiteForLocalStorage(site: WordPressSite): WordPressSite {
  let next = site;
  if (site.sitemaps) {
    const {
      urls: _urls,
      postMetadata: _postMetadata,
      ...sitemapRest
    } = site.sitemaps;
    next = { ...site, sitemaps: sitemapRest };
  }
  const logoUrl = clientLogoUrlForLocalStorage(next.clientLogoUrl);
  if (logoUrl === next.clientLogoUrl?.trim() || (!logoUrl && !next.clientLogoUrl?.trim())) {
    return next;
  }
  return { ...next, clientLogoUrl: logoUrl };
}

/** Credentials + config only when slim payload still exceeds quota. */
export function minimalSiteForLocalStorage(site: WordPressSite): WordPressSite {
  const slim = slimSiteForLocalStorage(site);
  return {
    id: slim.id,
    name: slim.name,
    menuDisplayName: slim.menuDisplayName,
    siteUrl: slim.siteUrl,
    productionSiteUrl: slim.productionSiteUrl,
    username: slim.username,
    appPassword: slim.appPassword,
    connectedAt: slim.connectedAt,
    lastTested: slim.lastTested,
    connectionStatus: slim.connectionStatus,
    capabilities: slim.capabilities,
    enabled: slim.enabled,
    entitySitemapUrl: slim.entitySitemapUrl,
    competitorEntitySitemapUrl: slim.competitorEntitySitemapUrl,
    manualEndpoint: slim.manualEndpoint,
    ga4PropertyId: slim.ga4PropertyId,
    googleAdsCustomerId: slim.googleAdsCustomerId,
    gbpLocationId: slim.gbpLocationId,
    semrushSiteAuditProjectId: slim.semrushSiteAuditProjectId,
    semrushPositionTrackingProjectId: slim.semrushPositionTrackingProjectId,
    semrushPositionTrackingCampaignId: slim.semrushPositionTrackingCampaignId,
    wpEngineInstall: slim.wpEngineInstall,
    wpEngineAccountId: slim.wpEngineAccountId,
    editorialCountsPeriodStartYmd: slim.editorialCountsPeriodStartYmd,
    optimizationPackage: slim.optimizationPackage,
    editorialContentPackage: slim.editorialContentPackage,
    editorialPublishTimeLocal: slim.editorialPublishTimeLocal,
    industryVertical: slim.industryVertical,
    benchmarkCustomTag: slim.benchmarkCustomTag,
    primaryLocalKeyword: slim.primaryLocalKeyword,
    locations: slim.locations,
    napInfo: slim.napInfo,
    clientLogoUrl: clientLogoUrlForLocalStorage(slim.clientLogoUrl),
    clientLogoSource: slim.clientLogoSource,
    clientLogoFetchedAt: slim.clientLogoFetchedAt,
    clientLogoBoxTheme: slim.clientLogoBoxTheme,
    profileTags: slim.profileTags,
    pluginAccessToken: slim.pluginAccessToken,
    slackEnabledForProperty: slim.slackEnabledForProperty,
    slackChannelId: slim.slackChannelId,
    slackChannelName: slim.slackChannelName,
    slackIncomingWebhookUrl: slim.slackIncomingWebhookUrl,
    slackMentionSnippet: slim.slackMentionSnippet,
    slackConnectionStatus: slim.slackConnectionStatus,
    slackLastTestAt: slim.slackLastTestAt,
    postBankEnabled: slim.postBankEnabled,
    sitemaps: slim.sitemaps
      ? {
          mainSitemapUrl: slim.sitemaps.mainSitemapUrl,
          detectedAt: slim.sitemaps.detectedAt,
          type: slim.sitemaps.type,
          disabledChildSitemapUrls: slim.sitemaps.disabledChildSitemapUrls,
          childSitemaps: slim.sitemaps.childSitemaps,
          endpoints: slim.sitemaps.endpoints,
        }
      : undefined,
    scheduledPosts: slim.scheduledPosts,
  };
}

function siteHostForLocalDefaults(site: WordPressSite): string {
  try {
    const raw = (site.productionSiteUrl || site.siteUrl || "").trim();
    if (!raw) return "";
    const url = raw.startsWith("http") ? raw : `https://${raw}`;
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Integrations display name stays Shutter Spot (Google Ads MCC sub-account 745-406-1453). */
export function applyShutterSpotDisplayNameMigration(site: WordPressSite): WordPressSite {
  if (!isShutterSpotProperty(site)) return site;
  const ads = (site.googleAdsCustomerId ?? "").replace(/\D/g, "");
  return {
    ...site,
    name: SHUTTER_SPOT_CANONICAL_NAME,
    googleAdsCustomerId: ads.length === 10 ? site.googleAdsCustomerId : SHUTTER_SPOT_GOOGLE_ADS_CUSTOMER_ID,
  };
}

/** Persist editorial tier from the site row itself, then the canonical name map. Wave 0 removed the bundled seed. */
function applyEditorialContentPackageDefaults(site: WordPressSite): WordPressSite {
  const fromName = editorialContentPackageTierForPropertyName(site.name);
  const storedRaw = site.editorialContentPackage?.trim();
  const stored =
    storedRaw && isEditorialContentPackageTier(storedRaw) ? storedRaw : undefined;
  const tier = stored ?? fromName;
  const publishTime =
    site.editorialPublishTimeLocal?.trim() ||
    editorialPublishTimeLocalForPropertyName(site.name) ||
    undefined;

  const next = { ...site };
  if (tier) {
    next.editorialContentPackage = tier;
  } else {
    delete next.editorialContentPackage;
  }
  if (publishTime) {
    next.editorialPublishTimeLocal = publishTime;
  } else if (!stored && !fromName) {
    delete next.editorialPublishTimeLocal;
  }
  return next;
}

export function isStalePhoenixArizonaLocation(site: WordPressSite): boolean {
  const first = site.locations?.[0] ?? site.napInfo?.locations?.[0];
  if (!first) return false;
  const host = wordPressSiteHostKey(site.siteUrl).toLowerCase();
  const isPhoenixCa = host.includes("phoenixpainting.ca") || normalizeEditorialPropertyName(site.name) === "phoenix painting";
  return isPhoenixCa && (first.city?.toLowerCase() === "pheonix" || first.state?.toLowerCase() === "arizona");
}

export function normalizeSiteEntry(site: WordPressSite): WordPressSite {
  const migratedSite = {
    ...site,
    enabled: site.enabled !== undefined ? site.enabled : true,
  };

  if (migratedSite.sitemaps?.mainSitemapUrl?.includes("/wp-sitemap.xml")) {
    migratedSite.sitemaps.mainSitemapUrl = migratedSite.sitemaps.mainSitemapUrl.replace(
      "/wp-sitemap.xml",
      "/sitemap_index.xml",
    );
  }

  const rawPkg = migratedSite.optimizationPackage?.trim();
  if (rawPkg && isOptimizationPackageTier(rawPkg)) {
    migratedSite.optimizationPackage = rawPkg;
  } else {
    delete migratedSite.optimizationPackage;
  }

  return applyEditorialContentPackageDefaults(
    applySemrushProjectDefaults(
      applyGa4PropertyIdDefaults(
        applyWpEngineHostingDefaults(applyShutterSpotDisplayNameMigration(migratedSite)),
      ),
    ),
  );
}
