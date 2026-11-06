/**
 * Sequential SAP peer search for in-content images.
 * Builds a one-shot entity URL index per peer site, then looks up by place entity
 * (no per-image sitemap re-fetch).
 */

import type { WordPressSite } from "@/components/integrations/types";
import { resolveMarketCityForPlaceEntity } from "@/lib/overview/sap-peer-market-select";
import type { SapCrossSiteImageHit, SapCrossSiteImageSearchResult, SapPeerEntityEntry, SapPeerLibraryCsvFile } from "@/lib/overview/sap-cross-site-image-search-types";
import { isCurrentConnectedSite, sameWordPressSiteUrl, siteEnabledForSapSearch } from "@/lib/overview/sap-cross-site-site-match";
import { buildCombinedSapPeerLibraryCsvFile, peerInventoryFuzzyMatchesCity } from "@/lib/overview/sap-peer-library-csv";
import { loadPeerSiteEntriesCached, searchCachedSite } from "@/lib/overview/sap-peer-entity-index";

export type { SapCrossSiteImageHit, SapPeerLibraryCsvFile, SapCrossSiteImageSearchResult, SapPeerEntityEntry, SapPeerEntityIndex, SapPlaceMatchResult } from "@/lib/overview/sap-cross-site-image-search-types";
export { normalizePlaceKey, placeKeyFromSlug, placeKeyFromPageUrl, sapPageMatchesPlaceEntity } from "@/lib/overview/sap-cross-site-place-match";
export { locatePreferredBodyImageInHtml, extractPreferredBodyImageFromHtml, stripPreferredBodyImageFromHtml, htmlHasLocalInContentImage } from "@/lib/overview/sap-cross-site-body-image";
export { sameWordPressSiteUrl, isCurrentConnectedSite, siteEnabledForSapSearch } from "@/lib/overview/sap-cross-site-site-match";
export { peerInventoryFuzzyMatchesCity, formatSapPeerLibraryCsv, formatCombinedSapPeerLibraryCsv, buildCombinedSapPeerLibraryCsvFile, buildSapPeerLibraryCsvFile } from "@/lib/overview/sap-peer-library-csv";
export { prewarmSapPeerSiteInventories, ensureSapPeerEntityIndex, clearSapPeerEntityIndexCache } from "@/lib/overview/sap-peer-entity-index";

/**
 * Search same-market peer SAP sites for an in-content image.
 * Builds one combined CSV for all city-matched peers;
 * first entity body-image hit is kept for reuse.
 */
export async function searchSapCrossSiteInContentImage(params: {
  sites: WordPressSite[];
  placeEntity: string;
  apiKey: string;
  model?: string;
  excludePageUrl?: string;
  /** Site receiving the new image — never searched for peer reuse. */
  excludeSite?: Pick<WordPressSite, "id" | "siteUrl" | "productionSiteUrl" | "napInfo" | "name">;
  /** @deprecated prefer excludeSite */
  excludeSiteUrl?: string;
  /** Optional progress: peerIndex is 0-based among selected market peers. */
  onPeerProgress?: (info: {
    peerIndex: number;
    peerTotal: number;
    siteName: string;
  }) => void;
  /** Fired once market peers are known, before any library crawl. */
  onPeerPlanReady?: (
    peers: Array<{ name: string; siteUrl: string }>,
  ) => void;
  /** Fired after each peer library CSV is built (incremental Details downloads). */
  onPeerCsvReady?: (file: SapPeerLibraryCsvFile) => void;
}): Promise<SapCrossSiteImageSearchResult> {
  const empty: SapCrossSiteImageSearchResult = { hit: null, peerCsvFiles: [] };
  const placeEntityRaw = (params.placeEntity || "").trim();
  if (!placeEntityRaw) return empty;
  if (!params.apiKey?.trim()) {
    // #region agent log
    // #endregion
    return empty;
  }

  const incoming = params.sites ?? [];
  const excludeSite = params.excludeSite;
  const excludeSiteUrl = (params.excludeSiteUrl ?? excludeSite?.siteUrl ?? "").trim();
  let sites = incoming.filter(siteEnabledForSapSearch);
  if (excludeSite) {
    sites = sites.filter((s) => !isCurrentConnectedSite(s, excludeSite));
  } else if (excludeSiteUrl) {
    sites = sites.filter((s) => !sameWordPressSiteUrl(s.siteUrl, excludeSiteUrl));
  }
  // #region agent log
  // #endregion
  if (!sites.length) return empty;

  const marketCity = await resolveMarketCityForPlaceEntity({
    placeEntity: placeEntityRaw,
    apiKey: params.apiKey,
    model: params.model,
    writeSite: excludeSite ?? null,
  });
  // #region agent log
  // #endregion
  if (!marketCity) {
    // #region agent log
    // #endregion
    return empty;
  }

  // Phase 1: load every peer inventory in parallel, city-match on sitemap URLs,
  // then publish the FULL matched list + CSVs before any image search.
  type MatchedPeer = { site: WordPressSite; entries: SapPeerEntityEntry[] };
  const planSites = sites.filter(
    (site) => !(excludeSite && isCurrentConnectedSite(site, excludeSite)),
  );

  const planResults = await Promise.all(
    planSites.map(async (site, i) => {
      params.onPeerProgress?.({
        peerIndex: i,
        peerTotal: planSites.length,
        siteName: (site.name || site.siteUrl || "").trim(),
      });
      try {
        const entries = await loadPeerSiteEntriesCached(site);
        const urlMatch = peerInventoryFuzzyMatchesCity(marketCity, entries);
        // #region agent log
        // #endregion
        return { site, entries, matched: urlMatch.matched };
      } catch (err) {
        // #region agent log
        // #endregion
        return { site, entries: [] as SapPeerEntityEntry[], matched: false };
      }
    }),
  );

  const matched: MatchedPeer[] = planResults
    .filter((r) => r.matched)
    .map((r) => ({ site: r.site, entries: r.entries }));

  // #region agent log
  // #endregion

  if (!matched.length) {
    return empty;
  }

  params.onPeerPlanReady?.(
    matched.map(({ site }) => ({
      name: (site.name || "").trim() || site.siteUrl || "peer",
      siteUrl: (site.siteUrl || "").trim(),
    })),
  );
  const earlyCombined = buildCombinedSapPeerLibraryCsvFile(matched);
  params.onPeerCsvReady?.(earlyCombined);

  // Phase 2: parallel image search among city-matched peers; first ordered hit wins.
  const phase2Results = await Promise.all(
    matched.map(async ({ site, entries }, i) => {
      params.onPeerProgress?.({
        peerIndex: i,
        peerTotal: matched.length,
        siteName: (site.name || site.siteUrl || "").trim(),
      });
      try {
        const found = await searchCachedSite({
          site,
          entries,
          placeEntity: placeEntityRaw,
          excludePageUrl: params.excludePageUrl,
        });
        const hitOk =
          Boolean(found) &&
          !(excludeSite && found && sameWordPressSiteUrl(found.sourceSiteUrl, excludeSite.siteUrl));
        // #region agent log
        // #endregion
        return {
          index: i,
          found: hitOk ? found : null,
        };
      } catch (err) {
        // #region agent log
        // #endregion
        return {
          index: i,
          found: null as SapCrossSiteImageHit | null,
        };
      }
    }),
  );

  phase2Results.sort((a, b) => a.index - b.index);
  let hit: SapCrossSiteImageHit | null = null;
  for (const row of phase2Results) {
    if (!hit && row.found) hit = row.found;
  }

  // Rebuild after hydrate so imageUrl columns include body images found during search.
  const combinedCsv = buildCombinedSapPeerLibraryCsvFile(matched);
  params.onPeerCsvReady?.(combinedCsv);
  const peerCsvFiles: SapPeerLibraryCsvFile[] = [combinedCsv];

  // #region agent log
  // #endregion

  return { hit, peerCsvFiles };
}
