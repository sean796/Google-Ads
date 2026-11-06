import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import { notify } from "@/lib/app-notifications";
import {
  fetchLocalGridHistory,
  fetchLocalGridScanById,
  geocodeLocalGridAddress,
  resolveLocalGridBusinessViaDfs,
} from "@/lib/local-grid-studio/local-grid-api";
import {
  generateBulkTemplateCsvFromLocalGrid,
  openGeneratedCsvInBulkWorkspace,
  triggerCsvDownloadToPc,
  type LocalGridBulkCsvMode,
} from "@/lib/local-grid-studio/local-grid-bulk-csv-generator";
import type {
  LocalGridBusinessIdentity,
  LocalGridDistanceMeasure,
  LocalGridHistoryEntry,
  LocalGridLayoutSnapshot,
  LocalGridScanDocument,
  LocalGridScanSize,
  LocalGridShape,
} from "@/lib/local-grid-studio/local-grid-types";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import type { BulkGscKeywordsHostedLink } from "@/lib/bulk/bulk-gsc-keywords-hosted-link";
import {
  createBulkGscKeywordsHostedLink,
  revokeBulkGscKeywordsHostedLink,
} from "@/lib/bulk/bulk-gsc-keywords-hosted-link";
import type { PromptBulkSitemapInventoryLink } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import { revokeBulkSitemapInventoryLinks } from "@/lib/bulk/bulk-sitemap-inventory-session";
import { mergeGscQueriesWithInventoryFallback } from "@/lib/local-analysis/entity-gsc-inventory-fallback";
import {
  ensureEntitySiteWarmCache,
  gscAllQueriesFromWarmBundle,
  type EntitySiteWarmBundle,
} from "@/lib/local-analysis/entity-site-warm-cache";
import type { LocalAnalysisHeaderProgress } from "@/lib/local-analysis/header-progress";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import type { GscSiteQueryRow } from "@/lib/competitor-research/types";
import type { GscCompetitorDateRange } from "@/lib/competitor-research/types";
import {
  buildLocalGridEntityHeaderProgress,
  buildLocalGridEntityPipelineHarness,
} from "@/lib/local-grid-studio/local-grid-entity-details-harness";
import { readSitePrimaryLocalKeyword } from "@/lib/local-grid-studio/resolve-property-primary-local-keyword";
import { getLocalGridDefaultLocation } from "./local-grid-panel-helpers";

export interface UseLocalGridEntityPrepDeps {
  site: WordPressSite;
  sitePublicUrl: string;
  reportError: (message: string) => void;
  activeScan: LocalGridScanDocument | null;
  layoutLocked: boolean;
  defaultLoc: ReturnType<typeof getLocalGridDefaultLocation>;
  initialAddressHint: string;
  activeBusiness: LocalGridBusinessIdentity;
  siteRef: { current: WordPressSite };
  abortRef: { current: AbortController | null };
  layoutLockedRef: { current: boolean };
  persistedLayoutRef: { current: LocalGridLayoutSnapshot | null | undefined };
  setKeyword: Dispatch<SetStateAction<string>>;
  setScanSize: Dispatch<SetStateAction<LocalGridScanSize>>;
  setShape: Dispatch<SetStateAction<LocalGridShape>>;
  setDistance: Dispatch<SetStateAction<number>>;
  setDistanceMeasure: Dispatch<SetStateAction<LocalGridDistanceMeasure>>;
  setCenterLat: Dispatch<SetStateAction<number>>;
  setCenterLng: Dispatch<SetStateAction<number>>;
  setActiveBusiness: Dispatch<SetStateAction<LocalGridBusinessIdentity>>;
  setRecenterSignal: Dispatch<SetStateAction<number>>;
  setScanning: Dispatch<SetStateAction<boolean>>;
  setActiveScan: Dispatch<SetStateAction<LocalGridScanDocument | null>>;
  setHistory: Dispatch<SetStateAction<LocalGridHistoryEntry[]>>;
  setSelectedPointId: Dispatch<SetStateAction<string | null>>;
  setReportDrawerOpen: Dispatch<SetStateAction<boolean>>;
  setGeocodingAddress: Dispatch<SetStateAction<boolean>>;
  setResolvingBusiness: Dispatch<SetStateAction<boolean>>;
}

export function useLocalGridEntityPrep(deps: UseLocalGridEntityPrepDeps) {
  const {
    site,
    sitePublicUrl,
    reportError,
    activeScan,
    layoutLocked,
    defaultLoc,
    initialAddressHint,
    activeBusiness,
  } = deps;
  const entityPrepDepsRef = useRef(deps);
  entityPrepDepsRef.current = deps;
  const [generatingBulkCsv, setGeneratingBulkCsv] = useState(false);
  const [bulkCsvStatus, setBulkCsvStatus] = useState("");
  const [lastGeneratedBulkCsv, setLastGeneratedBulkCsv] = useState<{
    csvContent: string;
    filename: string;
    rowCount: number;
  } | null>(null);
  const [sitePrepLoading, setSitePrepLoading] = useState(false);
  const [sitemapInventoryLinks, setSitemapInventoryLinks] = useState<
    PromptBulkSitemapInventoryLink[]
  >([]);
  const [gscHostedLink, setGscHostedLink] = useState<BulkGscKeywordsHostedLink | null>(null);
  const [siteWarmBundle, setSiteWarmBundle] = useState<EntitySiteWarmBundle | null>(null);
  const [entityBulkRowCount, setEntityBulkRowCount] = useState(0);
  const [entityHarnessSections, setEntityHarnessSections] = useState<BulkHarnessSectionUi[]>(() =>
    buildLocalGridEntityPipelineHarness(""),
  );
  const sitemapLinksRef = useRef<PromptBulkSitemapInventoryLink[]>([]);
  const gscLinkRef = useRef<BulkGscKeywordsHostedLink | null>(null);

  const commitSitemapInventoryLinks = useCallback((links: PromptBulkSitemapInventoryLink[]) => {
    revokeBulkSitemapInventoryLinks(sitemapLinksRef.current);
    sitemapLinksRef.current = links;
    setSitemapInventoryLinks(links);
  }, []);

  const commitGscKeywordsHostedLink = useCallback(
    (siteUrl: string, queries: GscSiteQueryRow[], dateRange?: GscCompetitorDateRange) => {
      revokeBulkGscKeywordsHostedLink(gscLinkRef.current);
      const link = createBulkGscKeywordsHostedLink(siteUrl, queries, dateRange);
      gscLinkRef.current = link;
      setGscHostedLink(link);
    },
    [],
  );

  const applySitePrepFromWarm = useCallback(
    (warm: Awaited<ReturnType<typeof ensureEntitySiteWarmCache>>, siteUrl: string) => {
      setSiteWarmBundle(warm);
      if (warm.inventory.links.length > 0) {
        commitSitemapInventoryLinks(warm.inventory.links);
      }
      const allGsc = gscAllQueriesFromWarmBundle(warm);
      const mergedGsc = mergeGscQueriesWithInventoryFallback(allGsc, warm.inventory.buckets);
      if (siteUrl && mergedGsc.length > 0) {
        commitGscKeywordsHostedLink(siteUrl, mergedGsc, warm.gsc.dateRange);
      } else {
        revokeBulkGscKeywordsHostedLink(gscLinkRef.current);
        gscLinkRef.current = null;
        setGscHostedLink(null);
      }
    },
    [commitSitemapInventoryLinks, commitGscKeywordsHostedLink],
  );

  const loadSitePrep = useCallback(async () => {
    const siteUrl = sitePublicUrl;
    const warm = await ensureEntitySiteWarmCache(site, { requireGsc: false });
    applySitePrepFromWarm(warm, siteUrl);
  }, [site, sitePublicUrl, applySitePrepFromWarm]);

  const loadSitePrepAndGsc = useCallback(async () => {
    const siteUrl = sitePublicUrl;
    const warm = await ensureEntitySiteWarmCache(site, { requireGsc: true });
    if (warm.error) {
      throw new Error(warm.error);
    }
    applySitePrepFromWarm(warm, siteUrl);
  }, [site, sitePublicUrl, applySitePrepFromWarm]);

  useEffect(() => {
    let cancelled = false;
    setSitePrepLoading(true);
    void loadSitePrep()
      .catch((e) => {
        if (!cancelled) {
          console.error("[LocalGrid · site prep]", e);
        }
      })
      .finally(() => {
        if (!cancelled) setSitePrepLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [site.id, loadSitePrep]);

  useEffect(() => {
    const {
      siteRef, abortRef, layoutLockedRef, persistedLayoutRef,
      setKeyword, setScanSize, setShape, setDistance, setDistanceMeasure,
      setCenterLat, setCenterLng, setActiveBusiness, setRecenterSignal,
      setScanning, setActiveScan, setHistory, setSelectedPointId,
      setReportDrawerOpen, setGeocodingAddress, setResolvingBusiness,
    } = entityPrepDepsRef.current;
    let cancelled = false;
    let didInitialCenter = false;
    const currentSite = siteRef.current;
    const pubUrl = getPublicSiteUrl(currentSite).trim() || currentSite.siteUrl.trim();
    const loc =
      currentSite.locations?.find((l) => l.isDefault) ??
      currentSite.locations?.[0] ??
      currentSite.napInfo?.locations?.find((l) => l.isDefault) ??
      currentSite.napInfo?.locations?.[0] ??
      null;
    const name = currentSite.napInfo?.name?.trim() || currentSite.name?.trim() || "";
    const addr =
      currentSite.napInfo?.address?.trim() ||
      (loc ? [loc.address, loc.city, loc.state, loc.zip].filter(Boolean).join(", ") : "");

    abortRef.current?.abort();
    abortRef.current = null;
    setScanning(false);
    setActiveScan(null);
    setHistory([]);
    setSelectedPointId(null);
    setReportDrawerOpen(false);

    void (async () => {
      const frozen = persistedLayoutRef.current;
      if (frozen) {
        setKeyword(frozen.keyword);
        setScanSize(frozen.scanSize);
        setShape(frozen.shape);
        setDistance(frozen.distance);
        setDistanceMeasure(frozen.distanceMeasure);
        setCenterLat(frozen.centerLat);
        setCenterLng(frozen.centerLng);
        setActiveBusiness(frozen.activeBusiness);
        setRecenterSignal((n) => n + 1);

        const scans = await fetchLocalGridHistory(currentSite.id);
        if (cancelled) return;
        setHistory(scans.filter((s) => (s.avgRank ?? 21) < 21 || s.pointCount > 1));

        if (frozen.activeScanId) {
          const loaded = await fetchLocalGridScanById(currentSite.id, frozen.activeScanId);
          if (!cancelled && loaded) {
            setActiveScan(loaded);
            setRecenterSignal((n) => n + 1);
          }
        }
        return;
      }

      if (addr || loc?.city || loc?.zip) {
        setGeocodingAddress(true);
        void geocodeLocalGridAddress({
          address: addr,
          city: loc?.city,
          state: loc?.state,
          zip: loc?.zip,
          country: loc?.country,
        })
          .then((geo) => {
            if (cancelled || didInitialCenter || layoutLockedRef.current) return;
            didInitialCenter = true;
            setCenterLat(geo.latitude);
            setCenterLng(geo.longitude);
            setActiveBusiness((prev) => ({
              ...prev,
              latitude: prev.latitude ?? geo.latitude,
              longitude: prev.longitude ?? geo.longitude,
            }));
            setRecenterSignal((n) => n + 1);
          })
          .catch(() => {
            /* resolved by DataForSEO step below */
          })
          .finally(() => {
            if (!cancelled) setGeocodingAddress(false);
          });
      }

      const scans = await fetchLocalGridHistory(currentSite.id);
      if (cancelled) return;
      const validScans = scans.filter((s) => (s.avgRank ?? 21) < 21 || s.pointCount > 1);
      setHistory(validScans);

      if (validScans[0]?.scanId) {
        const loaded = await fetchLocalGridScanById(currentSite.id, validScans[0].scanId);
        const hasValidItems = loaded?.points?.some((p) => p.items && p.items.length > 0);
        if (!cancelled && loaded && hasValidItems && !layoutLockedRef.current) {
          setActiveScan(loaded);
          setKeyword(loaded.keyword);
          setScanSize(loaded.scanSize);
          setShape(loaded.shape);
          setDistance(loaded.distance);
          setDistanceMeasure(loaded.distanceMeasure);
          setCenterLat(loaded.centerLat);
          setCenterLng(loaded.centerLng);
          setActiveBusiness(loaded.targetBusiness);
          if (!didInitialCenter) {
            didInitialCenter = true;
            setRecenterSignal((n) => n + 1);
          }
          return;
        }
      }

      setResolvingBusiness(true);
      try {
        const res = await resolveLocalGridBusinessViaDfs({
          siteId: currentSite.id,
          siteName: name,
          napName: currentSite.napInfo?.name,
          siteUrl: pubUrl,
          gbpLocationId: currentSite.gbpLocationId,
          city: loc?.city,
          state: loc?.state,
          zip: loc?.zip,
          country: loc?.country,
          address: addr,
        });
        if (cancelled) return;
        if (res.business && !layoutLockedRef.current) {
          setActiveBusiness(res.business);
          if (res.business.latitude != null && res.business.longitude != null && !didInitialCenter) {
            didInitialCenter = true;
            setCenterLat(res.business.latitude);
            setCenterLng(res.business.longitude);
            setRecenterSignal((n) => n + 1);
          }
        }
        if (res.suggestedKeyword && !layoutLockedRef.current && !readSitePrimaryLocalKeyword(currentSite)) {
          setKeyword(res.suggestedKeyword);
        }
      } catch {
        /* keep geocoded coordinates */
      } finally {
        if (!cancelled) setResolvingBusiness(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [site.id]);

  const handleCenterOnAddress = useCallback(
    async (customAddress?: string) => {
      const { setCenterLat, setCenterLng, setActiveBusiness, setRecenterSignal, setGeocodingAddress } = entityPrepDepsRef.current;
      if (layoutLocked) return;
      const targetAddress = (customAddress ?? activeBusiness.address ?? initialAddressHint).trim();
      if (!customAddress && activeBusiness.latitude != null && activeBusiness.longitude != null) {
        setCenterLat(activeBusiness.latitude);
        setCenterLng(activeBusiness.longitude);
        setRecenterSignal((n) => n + 1);
        return;
      }
      if (!targetAddress) {
        setRecenterSignal((n) => n + 1);
        return;
      }

      setGeocodingAddress(true);
      try {
        const geo = await geocodeLocalGridAddress({
          address: targetAddress,
          city: defaultLoc?.city,
          state: defaultLoc?.state,
          zip: defaultLoc?.zip,
          country: defaultLoc?.country,
        });
        setCenterLat(geo.latitude);
        setCenterLng(geo.longitude);
        setActiveBusiness((prev) => ({
          ...prev,
          address: customAddress ? targetAddress : prev.address || geo.label,
          latitude: geo.latitude,
          longitude: geo.longitude,
        }));
        setRecenterSignal((n) => n + 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not center on address.";
        reportError(`Local Dominator · ${msg}`);
      } finally {
        setGeocodingAddress(false);
      }
    },
    [activeBusiness, initialAddressHint, defaultLoc, layoutLocked, reportError],
  );

  const handleGenerateBulkCsv = useCallback(
    async (mode: LocalGridBulkCsvMode, count: number, cities?: string[]) => {
      if (!activeScan || generatingBulkCsv) return;
      setGeneratingBulkCsv(true);
      setEntityBulkRowCount(count);
      setEntityHarnessSections(buildLocalGridEntityPipelineHarness("Starting"));
      setBulkCsvStatus(
        mode === "locations"
          ? `Building ${count} entit${count === 1 ? "y" : "ies"} from grid…`
          : `Building ${count} competitor row${count === 1 ? "" : "s"} from grid…`,
      );
      try {
        if (mode === "locations") {
          setSitePrepLoading(true);
          await loadSitePrepAndGsc();
        }
        const res = await generateBulkTemplateCsvFromLocalGrid({
          site,
          scan: activeScan,
          mode,
          count,
          cities,
          onProgress: (status) => {
            setBulkCsvStatus(status);
            setEntityHarnessSections(buildLocalGridEntityPipelineHarness(status));
          },
        });
        setLastGeneratedBulkCsv({
          csvContent: res.csvContent,
          filename: res.filename,
          rowCount: res.rows.length,
        });
        setEntityHarnessSections(buildLocalGridEntityPipelineHarness("Export complete"));
        setBulkCsvStatus(
          `Bulk template ready (${res.rows.length} row${res.rows.length === 1 ? "" : "s"}).`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Bulk CSV generation failed.";
        console.error("[LocalGrid · Bulk] generate failed", err);
        reportError(`Local Dominator · ${msg}`);
        notify.error(msg);
        setBulkCsvStatus(msg);
      } finally {
        setSitePrepLoading(false);
        setGeneratingBulkCsv(false);
      }
    },
    [activeScan, generatingBulkCsv, site, reportError, loadSitePrepAndGsc],
  );

  const entityHeaderProgress = useMemo((): LocalAnalysisHeaderProgress | null => {
    return buildLocalGridEntityHeaderProgress({
      phase: bulkCsvStatus,
      entityCount: entityBulkRowCount,
      busy: generatingBulkCsv || Boolean(bulkCsvStatus.trim()),
    });
  }, [bulkCsvStatus, entityBulkRowCount, generatingBulkCsv]);

  const entityWorkspaceBusy = generatingBulkCsv || sitePrepLoading;

  const handleOpenLastBulkCsvInTab = useCallback(() => {
    if (!lastGeneratedBulkCsv) return;
    openGeneratedCsvInBulkWorkspace(lastGeneratedBulkCsv.csvContent);
  }, [lastGeneratedBulkCsv]);

  const handleDownloadLastBulkCsv = useCallback(() => {
    if (!lastGeneratedBulkCsv) return;
    triggerCsvDownloadToPc(lastGeneratedBulkCsv.filename, lastGeneratedBulkCsv.csvContent);
  }, [lastGeneratedBulkCsv]);
  return {
    sitePrepLoading,
    sitemapInventoryLinks,
    gscHostedLink,
    siteWarmBundle,
    generatingBulkCsv,
    bulkCsvStatus,
    entityHarnessSections,
    entityHeaderProgress,
    entityWorkspaceBusy,
    handleGenerateBulkCsv,
    handleCenterOnAddress,
    handleOpenLastBulkCsvInTab,
    handleDownloadLastBulkCsv,
    loadSitePrepAndGsc,
  };
}
