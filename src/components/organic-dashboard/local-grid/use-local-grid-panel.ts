import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import { notify } from "@/lib/app-notifications";
import { aggregateLocalGridScan } from "@/lib/local-grid-studio/local-grid-aggregator";
import {
  deleteLocalGridScanOnServer,
  fetchLocalGridScanById,
  saveLocalGridScanOnServer,
} from "@/lib/local-grid-studio/local-grid-api";
import { parseLocalDominatorFullScanCsv } from "@/lib/local-grid-studio/local-grid-csv";
import { generateLocalGridCoordinates } from "@/lib/local-grid-studio/local-grid-math";
import type {
  LocalGridBusinessIdentity,
  LocalGridDistanceMeasure,
  LocalGridHistoryEntry,
  LocalGridLayoutSnapshot,
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
import { initialLocalGridKeywordForSite } from "@/lib/local-grid-studio/resolve-property-primary-local-keyword";
import type { LocalGridPanelViewportProps } from "./LocalGridPanelViewport";
import {
  buildLocalGridDockSummary,
  buildLocalGridInitialAddressHint,
  buildLocalGridLayoutSnapshot,
  createInitialLocalGridBusiness,
  downloadLocalGridScanCsv,
  formatHumanFriendlyScanDate,
  getLocalGridDefaultLocation,
  getLocalGridDraggedCenter,
  getLocalGridHistoryDateLabels,
  inferInitialKeywordForSite,
  runLocalGridPanelScan,
} from "./local-grid-panel-helpers";
import type { LocalGridPanelDockSummary } from "./local-grid-panel-helpers";
import { useLocalGridEntityPrep } from "./use-local-grid-entity-prep";

export { formatHumanFriendlyScanDate };
export type { LocalGridPanelDockSummary };

export function useLocalGridPanel(
  site: WordPressSite,
  reportError: (message: string) => void,
  layoutLocked = false,
  persistedLayout?: LocalGridLayoutSnapshot | null,
  onSaveSnapshot?: (snapshot: LocalGridLayoutSnapshot) => void,
): {
  dockSummary: LocalGridPanelDockSummary;
  abortScan: () => void;
  getLayoutSnapshot: () => LocalGridLayoutSnapshot;
  viewportProps: LocalGridPanelViewportProps;
} {
  const siteRef = useRef(site);
  siteRef.current = site;

  const editorialCountSites = useMemo(() => [site], [site]);
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
  const defaultLoc = useMemo(() => getLocalGridDefaultLocation(site), [site]);

  const initialBusinessName = useMemo(
    () => site.napInfo?.name?.trim() || site.name?.trim() || "",
    [site],
  );

  const initialAddressHint = useMemo(
    () => buildLocalGridInitialAddressHint(site, defaultLoc),
    [site, defaultLoc],
  );
  const seededFromPersist = persistedLayout ?? null;
  const onSaveSnapshotRef = useRef(onSaveSnapshot);
  onSaveSnapshotRef.current = onSaveSnapshot;

  const [keyword, setKeyword] = useState(() =>
    seededFromPersist?.keyword?.trim() ||
      initialLocalGridKeywordForSite(site, defaultLoc?.city, inferInitialKeywordForSite),
  );
  const [centerLat, setCenterLat] = useState(() => seededFromPersist?.centerLat ?? 53.551864);
  const [centerLng, setCenterLng] = useState(() => seededFromPersist?.centerLng ?? -113.614238);
  const [scanSize, setScanSize] = useState<LocalGridScanSize>(
    () => seededFromPersist?.scanSize ?? "7x7",
  );
  const [shape, setShape] = useState<LocalGridShape>(() => seededFromPersist?.shape ?? "circle");
  const [distance, setDistance] = useState<number>(() => seededFromPersist?.distance ?? 3);
  const [distanceMeasure, setDistanceMeasure] = useState<LocalGridDistanceMeasure>(
    () => seededFromPersist?.distanceMeasure ?? "mile",
  );

  const [activeBusiness, setActiveBusiness] = useState<LocalGridBusinessIdentity>(() => {
    if (seededFromPersist?.activeBusiness) {
      return seededFromPersist.activeBusiness;
    }
    return createInitialLocalGridBusiness({
      businessName: initialBusinessName,
      addressHint: initialAddressHint,
      websiteUrl: sitePublicUrl,
      gbpLocationId: site.gbpLocationId,
    });
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

  const abortRef = useRef<AbortController | null>(null);
  const layoutLockedRef = useRef(layoutLocked);
  layoutLockedRef.current = layoutLocked;
  const persistedLayoutRef = useRef(persistedLayout);
  persistedLayoutRef.current = persistedLayout;

  const {
    sitePrepLoading, sitemapInventoryLinks, gscHostedLink, siteWarmBundle,
    generatingBulkCsv, bulkCsvStatus, entityHarnessSections, entityHeaderProgress,
    entityWorkspaceBusy, handleGenerateBulkCsv, handleCenterOnAddress,
  } = useLocalGridEntityPrep({
    site, sitePublicUrl, reportError, activeScan, layoutLocked,
    defaultLoc, initialAddressHint, activeBusiness,
    siteRef, abortRef, layoutLockedRef, persistedLayoutRef,
    setKeyword, setScanSize, setShape, setDistance, setDistanceMeasure,
    setCenterLat, setCenterLng, setActiveBusiness, setRecenterSignal,
    setScanning, setActiveScan, setHistory, setSelectedPointId,
    setReportDrawerOpen, setGeocodingAddress, setResolvingBusiness,
  });
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

  const handleDragPin = useCallback(
    (pointId: string, newLat: number, newLng: number) => {
      if (layoutLocked) return;
      const dragged = getLocalGridDraggedCenter({
        pointId, newLat, newLng, activeScan, previewNodes, centerLat, centerLng,
      });
      if (!dragged) return;
      setCenterLat(dragged.nextCenterLat);
      setCenterLng(dragged.nextCenterLng);
      setActiveScan(null);
      setSelectedPointId(null);
    },
    [activeScan, previewNodes, centerLat, centerLng, layoutLocked],
  );

  const runGridScan = useCallback(
    async (overrideSize?: LocalGridScanSize, reuseExisting = false) => {
      await runLocalGridPanelScan(
        {
          scanSize, keyword, centerLat, centerLng, shape, distance, distanceMeasure,
          activeScan, activeBusiness, site, layoutLocked, reportError,
          setScanSize, abortRef, setScanning, setActiveScan, setActiveBusiness,
          setSelectedPointId, setHistory, onSaveSnapshotRef,
        },
        overrideSize,
        reuseExisting,
      );
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
    downloadLocalGridScanCsv(activeScan);
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

  const activeHistoryIndex = useMemo(
    () => (activeScan ? history.findIndex((h) => h.scanId === activeScan.scanId) : -1),
    [activeScan, history],
  );

  const { oldestDateLabel, newestDateLabel } = getLocalGridHistoryDateLabels(history, activeScan);

  const chronologicalHistory = useMemo(() => [...history].reverse(), [history]);

  const dockSummary = useMemo(
    (): LocalGridPanelDockSummary =>
      buildLocalGridDockSummary({
        activeScan, keyword, business: activeBusiness.business, address: activeBusiness.address, siteName: site.name, scanning, aggregatedView, history, persistedLayout,
      }),
    [
    activeScan,
    keyword,
    activeBusiness.business,
    activeBusiness.address,
    site.name,
    scanning,
    aggregatedView,
    history,
    persistedLayout,
    ],
  );

  const getLayoutSnapshot = useCallback((): LocalGridLayoutSnapshot => {
    return buildLocalGridLayoutSnapshot({
      activeScan, keyword, centerLat, centerLng, scanSize, shape, distance, distanceMeasure, activeBusiness,
    });
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
    onGenerateBulkCsv: (mode, count, cities) => void handleGenerateBulkCsv(mode, count, cities),
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
      const snap = getLayoutSnapshot();
      onSaveSnapshotRef.current?.(snap);
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
    },
  };

  return { dockSummary, abortScan, getLayoutSnapshot, viewportProps };
}
