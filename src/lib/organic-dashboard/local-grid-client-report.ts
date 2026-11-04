import { aggregateLocalGridScan } from "@/lib/local-grid-studio/local-grid-aggregator";
import {
  fetchLocalGridHistory,
  fetchLocalGridScanById,
  fetchLocalGridWorkspace,
} from "@/lib/local-grid-studio/local-grid-api";
import { generateLocalGridCoordinates } from "@/lib/local-grid-studio/local-grid-math";
import type {
  LocalGridCoordinateNode,
  LocalGridDistanceMeasure,
  LocalGridEvaluatedPin,
  LocalGridLayoutSnapshot,
  LocalGridRankSummary,
  LocalGridScanDocument,
  LocalGridScanSize,
  LocalGridShape,
} from "@/lib/local-grid-studio/local-grid-types";
import type { DeckSummaryRow } from "@/lib/organic-dashboard/organic-client-report-deck-helpers";

export type LocalGridReportingSnapshot = {
  scanId: string;
  keyword: string;
  scanDateLabel: string;
  scanSize: string;
  shape: string;
  distance: number;
  distanceMeasure: string;
  summary: LocalGridRankSummary;
};

export type LocalGridClientReportSection = {
  meta: {
    siteId: string;
    scanId: string;
    keyword: string;
    locationLabel?: string;
    businessLabel?: string;
    scanDateLabel: string;
    scanSize: string;
    shape: string;
    distance: number;
    distanceMeasure: string;
    centerLat: number;
    centerLng: number;
  };
  summaryRows: DeckSummaryRow[];
  evaluatedPins: LocalGridEvaluatedPin[];
  previewNodes: LocalGridCoordinateNode[];
  snapshot: LocalGridReportingSnapshot;
};

function scanPointsToPreviewNodes(scan: LocalGridScanDocument): LocalGridCoordinateNode[] {
  return scan.points.map((point) => ({
    pointId: point.pointId,
    row: point.row,
    col: point.col,
    latitude: point.latitude,
    longitude: point.longitude,
    distanceFromCenter: point.distanceFromCenter,
  }));
}

const emptyDelta = { deltaPercent: null, deltaPositive: null };

export async function fetchLatestLocalGridScanForSite(
  siteId: string,
  signal?: AbortSignal,
): Promise<LocalGridScanDocument | null> {
  if (signal?.aborted) return null;
  const history = await fetchLocalGridHistory(siteId);
  const latest = history[0];
  if (!latest?.scanId) return null;
  if (signal?.aborted) return null;
  return fetchLocalGridScanById(siteId, latest.scanId);
}

function buildConfiguredScanDocumentFromLayout(
  siteId: string,
  panelId: string,
  snap: LocalGridLayoutSnapshot,
): LocalGridScanDocument {
  const nodes = generateLocalGridCoordinates({
    centerLat: snap.centerLat,
    centerLng: snap.centerLng,
    scanSize: snap.scanSize,
    shape: snap.shape,
    distance: snap.distance,
    distanceMeasure: snap.distanceMeasure,
  });
  return {
    scanId: snap.activeScanId || panelId,
    siteId,
    scanDateIso: "",
    scanDateLabel: "Configured grid",
    keyword: snap.keyword,
    scanSize: snap.scanSize,
    shape: snap.shape,
    distance: snap.distance,
    distanceMeasure: snap.distanceMeasure,
    centerLat: snap.centerLat,
    centerLng: snap.centerLng,
    targetBusiness: snap.activeBusiness,
    points: nodes.map((n) => ({ ...n, items: [] })),
  };
}

export async function fetchAllLocalGridScansForSite(
  siteId: string,
  signal?: AbortSignal,
): Promise<LocalGridScanDocument[]> {
  if (signal?.aborted) return [];
  const [wsRaw, history] = await Promise.all([
    fetchLocalGridWorkspace(siteId),
    fetchLocalGridHistory(siteId),
  ]);
  if (signal?.aborted) return [];

  const wsObj = wsRaw && typeof wsRaw === "object" ? (wsRaw as Record<string, unknown>) : null;
  const panels = Array.isArray(wsObj?.panels)
    ? (wsObj!.panels as Array<{
        id?: string;
        siteId?: string;
        layoutSnapshot?: LocalGridLayoutSnapshot | null;
      }>).filter((p) => !p.siteId || p.siteId === siteId)
    : [];

  if (panels.length > 0) {
    const out: LocalGridScanDocument[] = [];
    for (let i = 0; i < panels.length; i++) {
      const panel = panels[i]!;
      const snap = panel.layoutSnapshot;
      if (snap?.activeScanId) {
        const loaded = await fetchLocalGridScanById(siteId, snap.activeScanId);
        if (loaded && loaded.points.length > 0) {
          out.push({
            ...loaded,
            targetBusiness: {
              ...loaded.targetBusiness,
              address:
                loaded.targetBusiness?.address?.trim() ||
                snap.activeBusiness?.address?.trim() ||
                "",
            },
          });
          continue;
        }
      }
      if (snap && typeof snap.centerLat === "number" && typeof snap.centerLng === "number") {
        out.push(
          buildConfiguredScanDocumentFromLayout(
            siteId,
            panel.id || `grid_${siteId}_${i + 1}`,
            snap,
          ),
        );
      }
    }
    if (out.length > 0) return out;
  }

  const latest = history[0];
  if (latest?.scanId) {
    const doc = await fetchLocalGridScanById(siteId, latest.scanId);
    if (doc) return [doc];
  }
  return [];
}

export function buildLocalGridReportingSnapshot(
  scan: LocalGridScanDocument,
): LocalGridReportingSnapshot | null {
  if (!scan.points.length) return null;
  const aggregated = aggregateLocalGridScan(scan.points, scan.targetBusiness);
  return {
    scanId: scan.scanId,
    keyword: scan.keyword,
    scanDateLabel: scan.scanDateLabel,
    scanSize: scan.scanSize,
    shape: scan.shape,
    distance: scan.distance,
    distanceMeasure: scan.distanceMeasure,
    summary: aggregated.summary,
  };
}

function formatRankValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(1);
}

function formatPercent(count: number, total: number): string {
  if (total <= 0) return "—";
  return `${Math.round((count / total) * 100)}%`;
}

export function buildLocalGridDeckSummaryRows(
  summary: LocalGridRankSummary,
  evaluatedPins: LocalGridEvaluatedPin[],
): DeckSummaryRow[] {
  const total = summary.totalPoints;
  const rank1Count = evaluatedPins.filter((p) => p.targetRank === 1).length;
  return [
    {
      label: "TARP (avg map rank)",
      earlier: "—",
      later: formatRankValue(summary.tarp),
      delta: emptyDelta,
    },
    {
      label: "Average rank (ranked pins)",
      earlier: "—",
      later: formatRankValue(summary.avgRank),
      delta: emptyDelta,
    },
    {
      label: "Rank 1 pins",
      earlier: "—",
      later: formatPercent(rank1Count, total),
      delta: emptyDelta,
    },
    {
      label: "Top 3 coverage",
      earlier: "—",
      later: `${summary.highPct}%`,
      delta: emptyDelta,
    },
    {
      label: "Outside top 20",
      earlier: "—",
      later: `${summary.outPct}%`,
      delta: emptyDelta,
    },
  ];
}

export function buildLocalGridClientReportSection(
  scan: LocalGridScanDocument | null | undefined,
): LocalGridClientReportSection | null {
  if (!scan?.points.length) return null;
  const hasScannedItems = scan.points.some((p) => Array.isArray(p.items) && p.items.length > 0);
  const aggregated = aggregateLocalGridScan(scan.points, scan.targetBusiness);
  const snapshot = buildLocalGridReportingSnapshot(scan);
  if (!snapshot) return null;
  const locationLabel = scan.targetBusiness?.address?.trim() || undefined;
  const businessLabel = scan.targetBusiness?.business?.trim() || undefined;
  const summaryRows = hasScannedItems
    ? buildLocalGridDeckSummaryRows(aggregated.summary, aggregated.evaluatedPins)
    : [
        ...(locationLabel
          ? [{ label: "Location", earlier: "—", later: locationLabel, delta: emptyDelta }]
          : []),
        { label: "Target keyword", earlier: "—", later: scan.keyword, delta: emptyDelta },
        {
          label: "Grid footprint",
          earlier: "—",
          later: `${scan.points.length} pins (${scan.scanSize} ${scan.shape}, ${scan.distance} ${scan.distanceMeasure === "mile" ? "mi" : "km"})`,
          delta: emptyDelta,
        },
      ];
  return {
    meta: {
      siteId: scan.siteId,
      scanId: scan.scanId,
      keyword: scan.keyword,
      locationLabel,
      businessLabel,
      scanDateLabel: scan.scanDateLabel,
      scanSize: scan.scanSize,
      shape: scan.shape,
      distance: scan.distance,
      distanceMeasure: scan.distanceMeasure,
      centerLat: scan.centerLat,
      centerLng: scan.centerLng,
    },
    summaryRows,
    evaluatedPins: hasScannedItems ? aggregated.evaluatedPins : [],
    previewNodes: scanPointsToPreviewNodes(scan),
    snapshot,
  };
}

export function buildLocalGridClientReportSections(
  scans: LocalGridScanDocument[] | null | undefined,
  fallbackSingleScan?: LocalGridScanDocument | null,
): LocalGridClientReportSection[] {
  const list =
    scans && scans.length > 0
      ? scans
      : fallbackSingleScan
        ? [fallbackSingleScan]
        : [];
  return list
    .map((s) => buildLocalGridClientReportSection(s))
    .filter((sec): sec is LocalGridClientReportSection => sec !== null);
}
