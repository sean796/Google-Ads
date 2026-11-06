import type { Dispatch, SetStateAction } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import {
  aggregateLocalGridScan,
  buildCanonicalBusinessKey,
} from "@/lib/local-grid-studio/local-grid-aggregator";
import {
  executeLocalGridScanWithProgress,
  saveLocalGridScanOnServer,
} from "@/lib/local-grid-studio/local-grid-api";
import { serializeLocalGridScanToCsv } from "@/lib/local-grid-studio/local-grid-csv";
import {
  generateLocalGridCoordinates,
  partitionReusableGridPoints,
} from "@/lib/local-grid-studio/local-grid-math";
import type {
  LocalGridBusinessIdentity,
  LocalGridCoordinateNode,
  LocalGridDistanceMeasure,
  LocalGridHistoryEntry,
  LocalGridLayoutSnapshot,
  LocalGridPointResult,
  LocalGridScanDocument,
  LocalGridScanSize,
  LocalGridShape,
} from "@/lib/local-grid-studio/local-grid-types";

export type LocalGridPanelDockSummary = {
  businessLabel: string;
  locationLabel: string;
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

export function inferInitialKeywordForSite(site: WordPressSite, city?: string): string {
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
export function getLocalGridDefaultLocation(site: WordPressSite) {
  return (
    site.locations?.find((l) => l.isDefault) ??
    site.locations?.[0] ??
    site.napInfo?.locations?.find((l) => l.isDefault) ??
    site.napInfo?.locations?.[0] ??
    null
  );
}

export function buildLocalGridInitialAddressHint(
  site: WordPressSite,
  defaultLoc: ReturnType<typeof getLocalGridDefaultLocation>,
): string {
  if (site.napInfo?.address?.trim()) return site.napInfo.address.trim();
  if (defaultLoc) {
    return [defaultLoc.address, defaultLoc.city, defaultLoc.state, defaultLoc.zip]
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

export function createInitialLocalGridBusiness(args: {
  businessName: string;
  addressHint: string;
  websiteUrl: string;
  gbpLocationId?: string;
}): LocalGridBusinessIdentity {
  const { businessName, addressHint, websiteUrl, gbpLocationId } = args;
  return {
    key: buildCanonicalBusinessKey({
      business: businessName,
      address: addressHint,
      websiteUrl,
    }),
    business: businessName,
    address: addressHint,
    placeId: gbpLocationId?.trim() || "",
    cid: gbpLocationId?.trim() || "",
    websiteUrl,
    primaryCategory: "",
    secondaryCategories: "",
    rating: null,
    reviews: null,
    latitude: null,
    longitude: null,
  };
}

export function buildLocalGridDockSummary(args: {
  activeScan: LocalGridScanDocument | null;
  keyword: string;
  business: string;
  address: string;
  siteName: string;
  scanning: boolean;
  aggregatedView: { summary: { avgRank: number | null } } | null;
  history: LocalGridHistoryEntry[];
  persistedLayout: LocalGridLayoutSnapshot | null | undefined;
}): LocalGridPanelDockSummary {
  const { activeScan, keyword, business, address, siteName, scanning, aggregatedView, history, persistedLayout } = args;
    const kw = (activeScan?.keyword ?? keyword).trim();
    const label =
      business?.trim() ||
      address?.trim() ||
      siteName?.trim() ||
      "Grid";
    const locationLabel = address?.trim() || "";
    const avg =
      aggregatedView?.summary.avgRank != null && Number.isFinite(aggregatedView.summary.avgRank)
        ? aggregatedView.summary.avgRank
        : activeScan?.summary?.avgRank ?? null;
    const rawDate =
      activeScan?.scanDateLabel ??
      activeScan?.scanDateIso ??
      (!persistedLayout ? (history[0]?.scanDateLabel ?? history[0]?.scanDateIso ?? null) : null);
    const dateLabel = formatHumanFriendlyScanDate(rawDate);
    return {
      businessLabel: label,
      locationLabel,
      keyword: kw || "—",
      scanning,
      avgRank: avg,
      lastScanDateLabel: dateLabel,
    };
}

export function buildLocalGridLayoutSnapshot(args: {
  activeScan: LocalGridScanDocument | null;
  keyword: string;
  centerLat: number;
  centerLng: number;
  scanSize: LocalGridScanSize;
  shape: LocalGridShape;
  distance: number;
  distanceMeasure: LocalGridDistanceMeasure;
  activeBusiness: LocalGridBusinessIdentity;
}): LocalGridLayoutSnapshot {
  const { activeScan, keyword, centerLat, centerLng, scanSize, shape, distance, distanceMeasure, activeBusiness } = args;
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
}

export function getLocalGridHistoryDateLabels(
  history: LocalGridHistoryEntry[],
  activeScan: LocalGridScanDocument | null,
): { oldestDateLabel: string; newestDateLabel: string } {
  const oldestDateLabel =
    history.length > 0
      ? history[history.length - 1]!.scanDateLabel
      : activeScan?.scanDateLabel ?? "—";
  const newestDateLabel =
    activeScan?.scanDateLabel ??
    history[0]?.scanDateLabel ??
    (history.length === 0 ? "—" : new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));
  return { oldestDateLabel, newestDateLabel };
}

export function getLocalGridDraggedCenter(args: {
  pointId: string;
  newLat: number;
  newLng: number;
  activeScan: LocalGridScanDocument | null;
  previewNodes: LocalGridCoordinateNode[];
  centerLat: number;
  centerLng: number;
}): { nextCenterLat: number; nextCenterLng: number } | null {
  const { pointId, newLat, newLng, activeScan, previewNodes, centerLat, centerLng } = args;
  if (pointId !== "r0_c0") return null;
  const sourceList = activeScan?.points.length ? activeScan.points : previewNodes;
  const originPin = sourceList.find((p) => p.pointId === pointId);
  const dLat = originPin ? newLat - originPin.latitude : newLat - centerLat;
  const dLng = originPin ? newLng - originPin.longitude : newLng - centerLng;
  const nextCenterLat = Number((centerLat + dLat).toFixed(7));
  const nextCenterLng = Number((centerLng + dLng).toFixed(7));
  return { nextCenterLat, nextCenterLng };
}

export function downloadLocalGridScanCsv(activeScan: LocalGridScanDocument): void {
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
}

export interface LocalGridPanelScanRunnerDeps {
  scanSize: LocalGridScanSize;
  keyword: string;
  centerLat: number;
  centerLng: number;
  shape: LocalGridShape;
  distance: number;
  distanceMeasure: LocalGridDistanceMeasure;
  activeScan: LocalGridScanDocument | null;
  activeBusiness: LocalGridBusinessIdentity;
  site: WordPressSite;
  layoutLocked: boolean;
  reportError: (message: string) => void;
  setScanSize: Dispatch<SetStateAction<LocalGridScanSize>>;
  abortRef: { current: AbortController | null };
  setScanning: Dispatch<SetStateAction<boolean>>;
  setActiveScan: Dispatch<SetStateAction<LocalGridScanDocument | null>>;
  setActiveBusiness: Dispatch<SetStateAction<LocalGridBusinessIdentity>>;
  setSelectedPointId: Dispatch<SetStateAction<string | null>>;
  setHistory: Dispatch<SetStateAction<LocalGridHistoryEntry[]>>;
  onSaveSnapshotRef: {
    current: ((snapshot: LocalGridLayoutSnapshot) => void) | undefined;
  };
}

export async function runLocalGridPanelScan(
  deps: LocalGridPanelScanRunnerDeps,
  overrideSize?: LocalGridScanSize,
  reuseExisting = false,
): Promise<void> {
  const {
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
    setScanSize,
    abortRef,
    setScanning,
    setActiveScan,
    setActiveBusiness,
    setSelectedPointId,
    setHistory,
    onSaveSnapshotRef,
  } = deps;
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
        onSaveSnapshotRef.current?.({
          keyword: kw,
          centerLat,
          centerLng,
          scanSize: targetSize,
          shape,
          distance,
          distanceMeasure,
          activeBusiness: resolvedTarget,
          activeScanId: completedDoc.scanId,
        });
      } catch (err) {
        if (!controller.signal.aborted) {
          const msg = err instanceof Error ? err.message : "Grid scan failed.";
          reportError(`Local Dominator · ${msg}`);
        }
      } finally {
        setScanning(false);
      }
}
