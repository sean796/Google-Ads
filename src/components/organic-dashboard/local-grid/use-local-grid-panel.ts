import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import { notify } from "@/lib/app-notifications";
import {
  aggregateLocalGridScan,
  buildCanonicalBusinessKey,
} from "@/lib/local-grid-studio/local-grid-aggregator";
import {
  deleteLocalGridScanOnServer,
  executeLocalGridScanWithProgress,
  fetchLocalGridHistory,
  fetchLocalGridScanById,
  geocodeLocalGridAddress,
  resolveLocalGridBusinessViaDfs,
  saveLocalGridScanOnServer,
} from "@/lib/local-grid-studio/local-grid-api";
import {
  generateBulkTemplateCsvFromLocalGrid,
  openGeneratedCsvInBulkWorkspace,
  triggerCsvDownloadToPc,
  type LocalGridBulkCsvMode,
} from "@/lib/local-grid-studio/local-grid-bulk-csv-generator";
import {
  parseLocalDominatorFullScanCsv,
  serializeLocalGridScanToCsv,
} from "@/lib/local-grid-studio/local-grid-csv";
import {
  generateLocalGridCoordinates,
  partitionReusableGridPoints,
} from "@/lib/local-grid-studio/local-grid-math";
import type {
  LocalGridBusinessIdentity,
  LocalGridDistanceMeasure,
  LocalGridHistoryEntry,
  LocalGridLayoutSnapshot,
  LocalGridPointResult,
  LocalGridScanDocument,
  LocalGridScanSize,
  LocalGridShape,
} from "@/lib/local-grid-studio/local-grid-types";
import {
  editorialQuotasForSite,
  editorialSapScheduledRemainingForSite,
} from "@/lib/editorial-content-package";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import { useQuarterEditorialCounts } from "@/hooks/use-quarter-editorial-counts";
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
import type { GscCompetitorDateRange } from "@/lib/competitor-research/competitor-gsc-queries";
import {
  buildLocalGridEntityHeaderProgress,
  buildLocalGridEntityPipelineHarness,
} from "@/lib/local-grid-studio/local-grid-entity-details-harness";
import {
  initialLocalGridKeywordForSite,
  readSitePrimaryLocalKeyword,
} from "@/lib/local-grid-studio/resolve-property-primary-local-keyword";
import type { LocalGridPanelViewportProps } from "./LocalGridPanelViewport";

export type LocalGridPanelDockSummary = {
  businessLabel: string;
  keyword: string;
  scanning: boolean;
  avgRank: number | null;
  lastScanDateLabel: string;
};

export function formatHumanFriendlyScanDate(raw?: string | null): string {
  if (!raw || raw.trim() === "" || raw === "—") return "No scans yet";
  const trimmed = raw.trim();
  const d = new Date(trimmed);
  if (!Number.isNaN(d.getTime())) {
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday =
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear();

    const hasTime = trimmed.includes(":") || trimmed.includes("T");
    const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    if (isToday) return hasTime ? `Today at ${timeStr}` : "Today";
    if (isYesterday) return hasTime ? `Yesterday at ${timeStr}` : "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  return trimmed;
}

function inferInitialKeywordForSite(site: WordPressSite, city?: string): string {
  const combined = `${site.name} ${site.napInfo?.name ?? ""} ${site.siteUrl} ${site.industryVertical ?? ""}`.toLowerCase();
  const cityLabel = city?.trim() || "";
  if (
    combined.includes("blind") ||
    combined.includes("shade") ||
    combined.includes("shutter") ||
    combined.includes("drapery")
  ) {
    return "blinds near me";
  }
  if (
    combined.includes("kwb") ||
    combined.includes("account") ||
    combined.includes("cpa") ||
    combined.includes("tax")
  ) {
    return cityLabel ? `${cityLabel} tax advisors` : "tax advisors near me";
  }
  if (combined.includes("dent")) {
    return cityLabel ? `dentist ${cityLabel}` : "dentist near me";
  }
  return "blinds near me";
}

export function useLocalGridPanel(
  site: WordPressSite,
  reportError: (message: string) => void,
  layoutLocked = false,
  persistedLayout?: LocalGridLayoutSnapshot | null,
): {
  dockSummary: LocalGridPanelDockSummary;
  abortScan: () => void;
  getLayoutSnapshot: () => LocalGridLayoutSnapshot;
  viewportProps: LocalGridPanelViewportProps;
} {
  const siteRef = useRef(site);
  siteRef.current = site;

  const editorialCountSites = useMemo(() => [site], [site.id]);
  const { bySiteId: quarterEditorialBySiteId } = useQuarterEditorialCounts(editorialCountSites);
  const editorialEntityRowCount = useMemo((): number | null | undefined => {
    if (!editorialQuotasForSite(site)) return null;
    const stats = quarterEditorialBySiteId[site.id];
    if (!stats || stats.loading) return undefined;
    return editorialSapScheduledRemainingForSite(site, stats);
  }, [site, quarterEditorialBySiteId]);

  const sitePublicUrl = useMemo(
    () => getPublicSiteUrl(site).trim() || site.siteUrl.trim(),
    [site],
  );
  const defaultLoc = useMemo(
    () =>
      site.locations?.find((l) => l.isDefault) ??
      site.locations?.[0] ??
      site.napInfo?.locations?.find((l) => l.isDefault) ??
      site.napInfo?.locations?.[0] ??
      null,
    [site],
  );

  const initialBusinessName = useMemo(
    () => site.napInfo?.name?.trim() || site.name?.trim() || "",
    [site],
  );

  const initialAddressHint = useMemo(() => {
    if (site.napInfo?.address?.trim()) return site.napInfo.address.trim();
    if (defaultLoc) {
      return [defaultLoc.address, defaultLoc.city, defaultLoc.state, defaultLoc.zip]
        .filter(Boolean)
        .join(", ");
    }
    return "";
  }, [site, defaultLoc]);

  const seededFromPersist =
    layoutLocked && persistedLayout
      ? persistedLayout
      : null;

  const [keyword, setKeyword] = useState(() =>
    seededFromPersist?.keyword?.trim() ||
      initialLocalGridKeywordForSite(site, defaultLoc?.city, inferInitialKeywordForSite),
  );
  const [centerLat, setCenterLat] = useState(() => seededFromPersist?.centerLat ?? 53.551864);
  const [centerLng, setCenterLng] = useState(() => seededFromPersist?.centerLng ?? -113.614238);
  const [scanSize, setScanSize] = useState<LocalGridScanSize>(
    () => seededFromPersist?.scanSize ?? "1x1",
  );
  const [shape, setShape] = useState<LocalGridShape>(() => seededFromPersist?.shape ?? "circle");
  const [distance, setDistance] = useState<number>(() => seededFromPersist?.distance ?? 1);
  const [distanceMeasure, setDistanceMeasure] = useState<LocalGridDistanceMeasure>(
    () => seededFromPersist?.distanceMeasure ?? "mile",
  );

  const [activeBusiness, setActiveBusiness] = useState<LocalGridBusinessIdentity>(() => {
    if (seededFromPersist?.activeBusiness) {
      return seededFromPersist.activeBusiness;
    }
    return {
      key: buildCanonicalBusinessKey({
        business: initialBusinessName,
        address: initialAddressHint,
        websiteUrl: sitePublicUrl,
      }),
      business: initialBusinessName,
      address: initialAddressHint,
      placeId: site.gbpLocationId?.trim() || "",
      cid: site.gbpLocationId?.trim() || "",
      websiteUrl: sitePublicUrl,
      primaryCategory: "",
      secondaryCategories: "",
      rating: null,
      reviews: null,
      latitude: null,
      longitude: null,
    };
  });

  const [resolvingBusiness, setResolvingBusiness] = useState(false);
  const [geocodingAddress, setGeocodingAddress] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [activeScan, setActiveScan] = useState<LocalGridScanDocument | null>(null);
  const [history, setHistory] = useState<LocalGridHistoryEntry[]>([]);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [reportDrawerOpen, setReportDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
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
  const [entityDetailsOpenSignal, setEntityDetailsOpenSignal] = useState(0);
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

  const abortRef = useRef<AbortController | null>(null);
  const layoutLockedRef = useRef(layoutLocked);
  layoutLockedRef.current = layoutLocked;
  const persistedLayoutRef = useRef(persistedLayout);
  persistedLayoutRef.current = persistedLayout;

  const abortScan = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, [site.id]);

  useEffect(() => {
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
      if (layoutLockedRef.current && frozen?.activeScanId) {
        const scans = await fetchLocalGridHistory(currentSite.id);
        if (cancelled) return;
        setHistory(scans.filter((s) => (s.avgRank ?? 21) < 21 || s.pointCount > 1));
        const loaded = await fetchLocalGridScanById(currentSite.id, frozen.activeScanId);
        if (!cancelled && loaded) {
          setActiveScan(loaded);
          setRecenterSignal((n) => n + 1);
        }
        return;
      }

      if (layoutLockedRef.current && frozen) {
        setRecenterSignal((n) => n + 1);
        const scans = await fetchLocalGridHistory(currentSite.id);
        if (!cancelled) {
          setHistory(scans.filter((s) => (s.avgRank ?? 21) < 21 || s.pointCount > 1));
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
        if (res.suggestedKeyword && !layoutLockedRef.current && !readSitePrimaryLocalKeyword(site)) {
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

  const previewNodes = useMemo(
    () =>
      generateLocalGridCoordinates({
        centerLat,
        centerLng,
        scanSize,
        shape,
        distance,
        distanceMeasure,
      }),
    [centerLat, centerLng, scanSize, shape, distance, distanceMeasure],
  );

  const aggregatedView = useMemo(() => {
    if (!activeScan || activeScan.points.length === 0) return null;
    return aggregateLocalGridScan(activeScan.points, activeBusiness);
  }, [activeScan, activeBusiness]);

  const selectedPin = useMemo(() => {
    if (!selectedPointId || !aggregatedView) return null;
    return aggregatedView.evaluatedPins.find((p) => p.pointId === selectedPointId) ?? null;
  }, [selectedPointId, aggregatedView]);

  const handleCenterOnAddress = useCallback(
    async (customAddress?: string) => {
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

  const handleDragPin = useCallback(
    (pointId: string, newLat: number, newLng: number) => {
      if (layoutLocked) return;
      if (pointId !== "r0_c0") return;
      const sourceList = activeScan?.points.length ? activeScan.points : previewNodes;
      const originPin = sourceList.find((p) => p.pointId === pointId);
      const dLat = originPin ? newLat - originPin.latitude : newLat - centerLat;
      const dLng = originPin ? newLng - originPin.longitude : newLng - centerLng;

      const nextCenterLat = Number((centerLat + dLat).toFixed(7));
      const nextCenterLng = Number((centerLng + dLng).toFixed(7));

      setCenterLat(nextCenterLat);
      setCenterLng(nextCenterLng);
      setActiveScan(null);
      setSelectedPointId(null);
    },
    [activeScan, previewNodes, centerLat, centerLng, layoutLocked],
  );

  const runGridScan = useCallback(
    async (overrideSize?: LocalGridScanSize, reuseExisting = false) => {
      const targetSize = overrideSize ?? scanSize;
      const kw = keyword.trim();
      if (!kw) {
        reportError("Local Dominator · Enter a keyword in the business card before scanning.");
        return;
      }

      if (overrideSize) {
        if (layoutLocked && overrideSize !== scanSize) {
          return;
        }
        if (!layoutLocked) {
          setScanSize(overrideSize);
        }
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const nodes = generateLocalGridCoordinates({
        centerLat,
        centerLng,
        scanSize: targetSize,
        shape,
        distance,
        distanceMeasure,
      });

      const { reused, missing } =
        reuseExisting && activeScan && activeScan.keyword.toLowerCase() === kw.toLowerCase()
          ? partitionReusableGridPoints(nodes, activeScan.points)
          : { reused: [] as LocalGridPointResult[], missing: nodes };

      setScanning(true);
      const scanId = `scan_${Date.now()}`;
      const scanDateLabel = new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const scanDateIso = new Date().toISOString();

      try {
        const allPoints = await executeLocalGridScanWithProgress({
          keyword: kw,
          missingNodes: missing,
          reusedPoints: reused,
          batchSize: targetSize === "1x1" ? 1 : 6,
          zoom: 14,
          signal: controller.signal,
          onBatchProgress: (snap) => {
            setActiveScan({
              scanId,
              siteId: site.id,
              scanDateIso,
              scanDateLabel,
              keyword: kw,
              scanSize: targetSize,
              shape,
              distance,
              distanceMeasure,
              centerLat,
              centerLng,
              targetBusiness: activeBusiness,
              points: snap.allPoints,
            });
          },
        });

        let resolvedTarget = activeBusiness;
        const initialAgg = aggregateLocalGridScan(allPoints, resolvedTarget);
        if (
          (!resolvedTarget.business || initialAgg.summary.rankedPoints === 0) &&
          initialAgg.competitors.length > 0
        ) {
          const siteNameLower = (site.napInfo?.name || site.name || "").trim().toLowerCase();
          const bestMatch =
            initialAgg.competitors.find(
              (c) => siteNameLower && c.business.toLowerCase().includes(siteNameLower),
            ) ?? resolvedTarget;
          resolvedTarget = bestMatch;
          setActiveBusiness(bestMatch);
        }

        const finalAgg = aggregateLocalGridScan(allPoints, resolvedTarget);
        const completedDoc: LocalGridScanDocument = {
          scanId,
          siteId: site.id,
          scanDateIso,
          scanDateLabel,
          keyword: kw,
          scanSize: targetSize,
          shape,
          distance,
          distanceMeasure,
          centerLat,
          centerLng,
          targetBusiness: resolvedTarget,
          points: allPoints,
          summary: finalAgg.summary,
        };

        setActiveScan(completedDoc);
        if (allPoints.length === 1) {
          setSelectedPointId(allPoints[0]!.pointId);
        }

        const savedSummary = await saveLocalGridScanOnServer(site.id, completedDoc);
        if (savedSummary) {
          setHistory((prev) => [
            savedSummary,
            ...prev.filter((h) => h.scanId !== savedSummary.scanId),
          ]);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          const msg = err instanceof Error ? err.message : "Grid scan failed.";
          reportError(`Local Dominator · ${msg}`);
        }
      } finally {
        setScanning(false);
      }
    },
    [
      scanSize,
      keyword,
      centerLat,
      centerLng,
      shape,
      distance,
      distanceMeasure,
      activeScan,
      activeBusiness,
      site,
      layoutLocked,
      reportError,
    ],
  );

  const handleImportCsvFile = useCallback(
    (file: File) => {
      if (layoutLocked) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const text = typeof reader.result === "string" ? reader.result : "";
        const parsed = parseLocalDominatorFullScanCsv(text, {
          siteId: site.id,
          preferredBusinessName: activeBusiness.business || site.name,
          preferredWebsiteUrl: sitePublicUrl,
        });
        if (parsed.error || !parsed.scan) {
          reportError(`Local Dominator · ${parsed.error || "Could not parse CSV."}`);
          return;
        }
        const doc = parsed.scan;
        setActiveScan(doc);
        setKeyword(doc.keyword);
        setScanSize(doc.scanSize);
        setShape(doc.shape);
        setDistance(doc.distance);
        setDistanceMeasure(doc.distanceMeasure);
        setCenterLat(doc.centerLat);
        setCenterLng(doc.centerLng);
        setActiveBusiness(doc.targetBusiness);
        setSelectedPointId(null);
        setRecenterSignal((n) => n + 1);

        const savedSummary = await saveLocalGridScanOnServer(site.id, doc);
        if (savedSummary) {
          setHistory((prev) => [
            savedSummary,
            ...prev.filter((h) => h.scanId !== savedSummary.scanId),
          ]);
        }
      };
      reader.readAsText(file);
    },
    [site.id, site.name, activeBusiness.business, sitePublicUrl, layoutLocked, reportError],
  );

  const handleExportCsv = useCallback(() => {
    if (!activeScan) return;
    const csvText = serializeLocalGridScanToCsv(activeScan);
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeKw = activeScan.keyword.replace(/[^a-z0-9_-]+/gi, "_");
    a.href = url;
    a.download = `${safeKw}_${activeScan.scanSize}_local_grid.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [activeScan]);

  const handleSelectHistoryScan = useCallback(
    async (scanId: string) => {
      if (layoutLocked) return;
      const loaded = await fetchLocalGridScanById(site.id, scanId);
      if (!loaded) {
        reportError("Local Dominator · Could not load saved scan.");
        return;
      }
      setActiveScan(loaded);
      setKeyword(loaded.keyword);
      setScanSize(loaded.scanSize);
      setShape(loaded.shape);
      setDistance(loaded.distance);
      setDistanceMeasure(loaded.distanceMeasure);
      setCenterLat(loaded.centerLat);
      setCenterLng(loaded.centerLng);
      setActiveBusiness(loaded.targetBusiness);
      setSelectedPointId(null);
    },
    [site.id, layoutLocked, reportError],
  );

  const handleDeleteActiveScan = useCallback(async () => {
    if (!activeScan || layoutLocked) return;
    const next = await deleteLocalGridScanOnServer(site.id, activeScan.scanId);
    setHistory(next);
    if (next[0]?.scanId) {
      void handleSelectHistoryScan(next[0].scanId);
    } else {
      setActiveScan(null);
    }
  }, [site.id, activeScan, layoutLocked, handleSelectHistoryScan]);

  const handleGenerateBulkCsv = useCallback(
    async (mode: LocalGridBulkCsvMode, count: number) => {
      if (!activeScan || generatingBulkCsv) return;
      setEntityDetailsOpenSignal((n) => n + 1);
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

  const activeHistoryIndex = useMemo(
    () => (activeScan ? history.findIndex((h) => h.scanId === activeScan.scanId) : -1),
    [activeScan, history],
  );

  const oldestDateLabel =
    history.length > 0
      ? history[history.length - 1]!.scanDateLabel
      : activeScan?.scanDateLabel ?? "—";
  const newestDateLabel =
    activeScan?.scanDateLabel ??
    history[0]?.scanDateLabel ??
    (history.length === 0 ? "—" : new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));

  const chronologicalHistory = useMemo(() => [...history].reverse(), [history]);

  const dockSummary = useMemo((): LocalGridPanelDockSummary => {
    const kw = (activeScan?.keyword ?? keyword).trim();
    const label =
      activeBusiness.business?.trim() ||
      activeBusiness.address?.trim() ||
      site.name?.trim() ||
      "Grid";
    const avg =
      aggregatedView?.summary.avgRank != null && Number.isFinite(aggregatedView.summary.avgRank)
        ? aggregatedView.summary.avgRank
        : activeScan?.summary?.avgRank ?? null;
    const rawDate =
      activeScan?.scanDateLabel ??
      activeScan?.scanDateIso ??
      history[0]?.scanDateLabel ??
      history[0]?.scanDateIso ??
      null;
    const dateLabel = formatHumanFriendlyScanDate(rawDate);
    return {
      businessLabel: label,
      keyword: kw || "—",
      scanning,
      avgRank: avg,
      lastScanDateLabel: dateLabel,
    };
  }, [
    activeScan,
    keyword,
    activeBusiness.business,
    activeBusiness.address,
    site.name,
    scanning,
    aggregatedView,
    history,
  ]);

  const getLayoutSnapshot = useCallback((): LocalGridLayoutSnapshot => {
    const kw = (activeScan?.keyword ?? keyword).trim();
    return {
      keyword: kw,
      centerLat,
      centerLng,
      scanSize,
      shape,
      distance,
      distanceMeasure,
      activeBusiness,
      activeScanId: activeScan?.scanId ?? null,
    };
  }, [
    activeScan,
    keyword,
    centerLat,
    centerLng,
    scanSize,
    shape,
    distance,
    distanceMeasure,
    activeBusiness,
  ]);

  const viewportProps: LocalGridPanelViewportProps = {
    layoutLocked,
    oldestDateLabel,
    newestDateLabel,
    chronologicalHistory,
    activeScan,
    activeHistoryIndex,
    history,
    onSelectHistoryScan: (scanId) => void handleSelectHistoryScan(scanId),
    aggregatedView,
    previewNodes,
    scanning,
    selectedPointId,
    recenterSignal,
    onSelectPin: setSelectedPointId,
    onDragPin: handleDragPin,
    activeBusiness,
    resolvingBusiness,
    geocodingAddress,
    centerLat,
    centerLng,
    keyword,
    onKeywordChange: (value) => {
      if (layoutLocked) return;
      setKeyword(value);
    },
    scanSize,
    onScanSizeChange: (nextSize) => {
      if (layoutLocked) return;
      setScanSize(nextSize);
      setActiveScan(null);
      setSelectedPointId(null);
    },
    shape,
    onShapeChange: (nextShape) => {
      if (layoutLocked) return;
      setShape(nextShape);
      setActiveScan(null);
      setSelectedPointId(null);
    },
    distance,
    onDistanceChange: (nextDist) => {
      if (layoutLocked) return;
      setDistance(nextDist);
      setActiveScan(null);
      setSelectedPointId(null);
    },
    distanceMeasure,
    onDistanceMeasureChange: (nextMeasure) => {
      if (layoutLocked) return;
      setDistanceMeasure(nextMeasure);
      setActiveScan(null);
      setSelectedPointId(null);
    },
    selectedPin,
    onCloseSelectedPin: () => setSelectedPointId(null),
    onSelectBusiness: setActiveBusiness,
    onCenterOnAddress: (customAddr) => void handleCenterOnAddress(customAddr),
    onRunScan: (overrideSize, reuseCenter) => void runGridScan(overrideSize, reuseCenter),
    onImportCsvFile: handleImportCsvFile,
    onExportCsv: handleExportCsv,
    onDeleteActiveScan: activeScan ? () => void handleDeleteActiveScan() : undefined,
    reportDrawerOpen,
    onToggleReportDrawer: () => setReportDrawerOpen((prev) => !prev),
    onCloseReportDrawer: () => setReportDrawerOpen(false),
    generatingBulkCsv,
    onGenerateBulkCsv: (mode, count) => void handleGenerateBulkCsv(mode, count),
    site,
    editorialEntityRowCount,
    editMode,
    onToggleEditMode: () => {
      setEditMode((prev) => {
        const next = !prev;
        if (next) {
          const lat = activeBusiness.latitude;
          const lng = activeBusiness.longitude;
          if (lat != null && lng != null) {
            setCenterLat(lat);
            setCenterLng(lng);
            setRecenterSignal((n) => n + 1);
            setActiveScan(null);
            setSelectedPointId(null);
          }
        }
        return next;
      });
    },
    onCloseEditMode: () => setEditMode(false),
    onSaveEdit: () => {
      setEditMode(false);
      notify.success("Grid configuration saved");
    },
    entityDetailsBand: {
      workspaceBusy: entityWorkspaceBusy,
      isProcessing: generatingBulkCsv,
      headerProgress: entityHeaderProgress,
      liveMessage: bulkCsvStatus,
      harnessSections: entityHarnessSections,
      sitemapInventoryLinks,
      gscHostedLink,
      sitePrepLoading,
      siteWarmBundle,
      detailsOpenSignal: entityDetailsOpenSignal,
    },
  };

  return { dockSummary, abortScan, getLayoutSnapshot, viewportProps };
}
