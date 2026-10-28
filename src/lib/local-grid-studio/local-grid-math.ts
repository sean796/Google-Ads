import type {
  LocalGridCoordinateNode,
  LocalGridDistanceMeasure,
  LocalGridPointResult,
  LocalGridScanSize,
  LocalGridShape,
} from "./local-grid-types";

const MILES_PER_DEGREE_LAT = 69.0;
const KM_PER_DEGREE_LAT = 111.045;

export function parseGridDimension(scanSize: LocalGridScanSize): number {
  const n = parseInt(scanSize.split("x")[0] ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

export function stepDistanceInMiles(distance: number, measure: LocalGridDistanceMeasure): number {
  const safeDist = Number.isFinite(distance) && distance > 0 ? distance : 1;
  return measure === "km" ? safeDist * 0.621371 : safeDist;
}

export function haversineDistanceBetween(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  measure: LocalGridDistanceMeasure = "mile",
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const radius = measure === "km" ? 6371.0088 : 3958.7613;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radius * c;
}

/**
 * Generate Local Dominator style coordinate grid.
 * Defaults to `1x1` (single center coordinate) for fast live verification before expanding.
 * When `shape === "circle"` on N x N grids (N >= 5), masks corners using radial threshold `radiusCells + 0.25`
 * (yielding 177 points for a 15x15 circle, matching Local Dominator's circular grid).
 */
export function generateLocalGridCoordinates(options: {
  centerLat: number;
  centerLng: number;
  scanSize: LocalGridScanSize;
  shape: LocalGridShape;
  distance: number;
  distanceMeasure: LocalGridDistanceMeasure;
}): LocalGridCoordinateNode[] {
  const { centerLat, centerLng, scanSize, shape, distance, distanceMeasure } = options;
  const dim = parseGridDimension(scanSize);
  if (dim <= 1) {
    return [
      {
        pointId: "r0_c0",
        row: 0,
        col: 0,
        latitude: Number(centerLat.toFixed(7)),
        longitude: Number(centerLng.toFixed(7)),
        distanceFromCenter: 0,
      },
    ];
  }

  const half = Math.floor(dim / 2);
  const stepUnit = Number.isFinite(distance) && distance > 0 ? distance : 1;
  const unitsPerDegLat = distanceMeasure === "km" ? KM_PER_DEGREE_LAT : MILES_PER_DEGREE_LAT;
  const cosLat = Math.max(0.1, Math.cos((centerLat * Math.PI) / 180));
  const unitsPerDegLng = unitsPerDegLat * cosLat;

  const nodes: LocalGridCoordinateNode[] = [];
  const maxRadialCells = half + 0.5;

  for (let r = -half; r <= half; r++) {
    for (let c = -half; c <= half; c++) {
      const radialCells = Math.hypot(r, c);
      if (shape === "circle" && dim >= 5 && radialCells > maxRadialCells) {
        continue;
      }
      // North is +row (-r from top to bottom), East is +col
      const offsetNorth = -r * stepUnit;
      const offsetEast = c * stepUnit;
      const lat = Number((centerLat + offsetNorth / unitsPerDegLat).toFixed(7));
      const lng = Number((centerLng + offsetEast / unitsPerDegLng).toFixed(7));
      const distFromCenter = Number((radialCells * stepUnit).toFixed(2));
      nodes.push({
        pointId: `r${r}_c${c}`,
        row: r,
        col: c,
        latitude: lat,
        longitude: lng,
        distanceFromCenter: distFromCenter,
      });
    }
  }

  return nodes;
}

/**
 * Partition an expanded grid into already-scanned points (e.g. the verified 1x1 center pin)
 * and remaining points so expanding from 1x1 -> 3x3 / 5x5 / 15x15 reuses the center pin without re-billing.
 */
export function partitionReusableGridPoints(
  nextNodes: LocalGridCoordinateNode[],
  existingPoints: LocalGridPointResult[],
  toleranceDegrees = 0.0004,
): {
  reused: LocalGridPointResult[];
  missing: LocalGridCoordinateNode[];
} {
  const reused: LocalGridPointResult[] = [];
  const missing: LocalGridCoordinateNode[] = [];

  for (const node of nextNodes) {
    const match = existingPoints.find(
      (pt) =>
        pt.items.length > 0 &&
        !pt.error &&
        Math.abs(pt.latitude - node.latitude) <= toleranceDegrees &&
        Math.abs(pt.longitude - node.longitude) <= toleranceDegrees,
    );
    if (match) {
      reused.push({
        ...node,
        items: match.items,
        error: null,
      });
    } else {
      missing.push(node);
    }
  }

  return { reused, missing };
}

export function computeGridBounds(points: Array<{ latitude: number; longitude: number }>): {
  centerLat: number;
  centerLng: number;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  recommendedZoom: number;
} {
  if (points.length === 0) {
    return {
      centerLat: 49.185,
      centerLng: -97.935,
      minLat: 49.185,
      maxLat: 49.185,
      minLng: -97.935,
      maxLng: -97.935,
      recommendedZoom: 13,
    };
  }

  let minLat = points[0]!.latitude;
  let maxLat = points[0]!.latitude;
  let minLng = points[0]!.longitude;
  let maxLng = points[0]!.longitude;
  let sumLat = 0;
  let sumLng = 0;

  for (const pt of points) {
    minLat = Math.min(minLat, pt.latitude);
    maxLat = Math.max(maxLat, pt.latitude);
    minLng = Math.min(minLng, pt.longitude);
    maxLng = Math.max(maxLng, pt.longitude);
    sumLat += pt.latitude;
    sumLng += pt.longitude;
  }

  const centerLat = sumLat / points.length;
  const centerLng = sumLng / points.length;

  let maxMilesFromCenter = 0;
  for (const pt of points) {
    maxMilesFromCenter = Math.max(
      maxMilesFromCenter,
      haversineDistanceBetween(centerLat, centerLng, pt.latitude, pt.longitude, "mile"),
    );
  }

  // Pad for pin icons and so 1x1 still shows neighborhood context, not street-level only.
  const pinPadMiles = maxMilesFromCenter > 0 ? maxMilesFromCenter * 0.2 + 0.2 : 0.45;
  const radiusMiles = maxMilesFromCenter + pinPadMiles;

  const latRadius = radiusMiles / MILES_PER_DEGREE_LAT;
  const lngRadius = latRadius / Math.max(Math.cos((centerLat * Math.PI) / 180), 0.35);

  const circleMinLat = centerLat - latRadius;
  const circleMaxLat = centerLat + latRadius;
  const circleMinLng = centerLng - lngRadius;
  const circleMaxLng = centerLng + lngRadius;

  const fitMinLat = Math.min(minLat, circleMinLat);
  const fitMaxLat = Math.max(maxLat, circleMaxLat);
  const fitMinLng = Math.min(minLng, circleMinLng);
  const fitMaxLng = Math.max(maxLng, circleMaxLng);

  const span = Math.max(fitMaxLat - fitMinLat, fitMaxLng - fitMinLng);
  let recommendedZoom = 14;
  if (span > 0.85) recommendedZoom = 9;
  else if (span > 0.55) recommendedZoom = 10;
  else if (span > 0.35) recommendedZoom = 11;
  else if (span > 0.22) recommendedZoom = 11;
  else if (span > 0.14) recommendedZoom = 12;
  else if (span > 0.08) recommendedZoom = 12;
  else if (span > 0.045) recommendedZoom = 13;

  return {
    centerLat,
    centerLng,
    minLat: fitMinLat,
    maxLat: fitMaxLat,
    minLng: fitMinLng,
    maxLng: fitMaxLng,
    recommendedZoom,
  };
}

/**
 * Client report map frame from scan grid definition (size, spacing, shape, center),
 * not from pin lat/lng outliers or padded studio bounds.
 */
export function computeLocalGridReportViewportBounds(options: {
  centerLat: number;
  centerLng: number;
  scanSize: LocalGridScanSize;
  shape: LocalGridShape;
  distance: number;
  distanceMeasure: LocalGridDistanceMeasure;
}): {
  centerLat: number;
  centerLng: number;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  recommendedZoom: number;
} {
  const nodes = generateLocalGridCoordinates(options);
  if (nodes.length === 0) {
    return computeGridBounds([{ latitude: options.centerLat, longitude: options.centerLng }]);
  }

  let minLat = nodes[0]!.latitude;
  let maxLat = nodes[0]!.latitude;
  let minLng = nodes[0]!.longitude;
  let maxLng = nodes[0]!.longitude;

  for (const node of nodes) {
    minLat = Math.min(minLat, node.latitude);
    maxLat = Math.max(maxLat, node.latitude);
    minLng = Math.min(minLng, node.longitude);
    maxLng = Math.max(maxLng, node.longitude);
  }

  const latSpan = maxLat - minLat;
  const lngSpan = maxLng - minLng;
  const padLat = Math.max(latSpan * 0.04, 0.0025);
  const padLng = Math.max(lngSpan * 0.04, 0.0025);

  const centerLat = options.centerLat;
  const centerLng = options.centerLng;
  const fitMinLat = minLat - padLat;
  const fitMaxLat = maxLat + padLat;
  const fitMinLng = minLng - padLng;
  const fitMaxLng = maxLng + padLng;
  const span = Math.max(fitMaxLat - fitMinLat, fitMaxLng - fitMinLng);

  let recommendedZoom = 14;
  if (span > 0.45) recommendedZoom = 10;
  else if (span > 0.28) recommendedZoom = 11;
  else if (span > 0.18) recommendedZoom = 12;
  else if (span > 0.11) recommendedZoom = 13;
  else if (span > 0.065) recommendedZoom = 14;
  else if (span > 0.035) recommendedZoom = 15;
  else recommendedZoom = 16;

  return {
    centerLat,
    centerLng,
    minLat: fitMinLat,
    maxLat: fitMaxLat,
    minLng: fitMinLng,
    maxLng: fitMaxLng,
    recommendedZoom,
  };
}
