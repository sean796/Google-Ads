import { aggregateLocalGridScan } from "@/lib/local-grid-studio/local-grid-aggregator";
import {
  fetchLocalGridHistory,
  fetchLocalGridScanById,
} from "@/lib/local-grid-studio/local-grid-api";
import type {
  LocalGridCoordinateNode,
  LocalGridEvaluatedPin,
  LocalGridRankSummary,
  LocalGridScanDocument,
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
  const aggregated = aggregateLocalGridScan(scan.points, scan.targetBusiness);
  const snapshot = buildLocalGridReportingSnapshot(scan);
  if (!snapshot) return null;
  return {
    meta: {
      siteId: scan.siteId,
      scanId: scan.scanId,
      keyword: scan.keyword,
      scanDateLabel: scan.scanDateLabel,
      scanSize: scan.scanSize,
      shape: scan.shape,
      distance: scan.distance,
      distanceMeasure: scan.distanceMeasure,
      centerLat: scan.centerLat,
      centerLng: scan.centerLng,
    },
    summaryRows: buildLocalGridDeckSummaryRows(aggregated.summary, aggregated.evaluatedPins),
    evaluatedPins: aggregated.evaluatedPins,
    previewNodes: scanPointsToPreviewNodes(scan),
    snapshot,
  };
}
