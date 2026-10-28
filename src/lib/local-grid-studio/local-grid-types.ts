export const LOCAL_GRID_SCAN_SIZES = [
  "1x1",
  "3x3",
  "5x5",
  "7x7",
  "9x9",
  "13x13",
  "15x15",
] as const;

export type LocalGridScanSize = (typeof LOCAL_GRID_SCAN_SIZES)[number];

export const LOCAL_GRID_SHAPES = ["circle", "square"] as const;
export type LocalGridShape = (typeof LOCAL_GRID_SHAPES)[number];

export const LOCAL_GRID_DISTANCE_MEASURES = ["mile", "km"] as const;
export type LocalGridDistanceMeasure = (typeof LOCAL_GRID_DISTANCE_MEASURES)[number];

export const LOCAL_GRID_STEP_DISTANCES = [0.25, 0.5, 1, 1.5, 2, 3, 5] as const;

export interface LocalGridCoordinateNode {
  pointId: string;
  row: number;
  col: number;
  latitude: number;
  longitude: number;
  distanceFromCenter: number;
}

export interface LocalGridSerpItem {
  rank: number;
  business: string;
  address: string;
  placeId: string;
  cid?: string;
  googlePlaceId?: string;
  websiteUrl: string;
  primaryCategory: string;
  secondaryCategories: string;
  rating: number | null;
  reviews: number | null;
  googleUrl: string;
  itemLat?: number | null;
  itemLng?: number | null;
}

export interface LocalGridPointResult extends LocalGridCoordinateNode {
  items: LocalGridSerpItem[];
  error?: string | null;
}

export interface LocalGridBusinessIdentity {
  key: string;
  business: string;
  address: string;
  placeId: string;
  cid?: string;
  googlePlaceId?: string;
  websiteUrl: string;
  primaryCategory: string;
  secondaryCategories: string;
  rating: number | null;
  reviews: number | null;
  latitude: number | null;
  longitude: number | null;
}

export type LocalGridPinBucket = "rank1" | "high" | "med" | "low" | "out";

export interface LocalGridEvaluatedPin extends LocalGridPointResult {
  targetRank: number | null;
  bucket: LocalGridPinBucket;
  matchedItem: LocalGridSerpItem | null;
}

export interface LocalGridRankSummary {
  totalPoints: number;
  rankedPoints: number;
  avgRank: number;
  tarp: number;
  highCount: number;
  medCount: number;
  lowCount: number;
  outCount: number;
  highPct: number;
  medPct: number;
  lowPct: number;
  outPct: number;
}

export interface LocalGridCompetitorRow extends LocalGridBusinessIdentity {
  summary: LocalGridRankSummary;
  bestRank: number;
  worstRank: number;
  shareOfVoicePct: number;
}

export interface LocalGridCategoryBenchmark {
  category: string;
  businessCount: number;
  top3SharePct: number;
  avgRating: number | null;
  avgReviews: number | null;
}

export interface LocalGridScanDocument {
  scanId: string;
  siteId: string;
  scanDateIso: string;
  scanDateLabel: string;
  keyword: string;
  scanSize: LocalGridScanSize;
  shape: LocalGridShape;
  distance: number;
  distanceMeasure: LocalGridDistanceMeasure;
  centerLat: number;
  centerLng: number;
  targetBusiness: LocalGridBusinessIdentity;
  points: LocalGridPointResult[];
  summary?: LocalGridRankSummary;
}

export interface LocalGridHistoryEntry {
  scanId: string;
  siteId: string;
  scanDateIso: string;
  scanDateLabel: string;
  keyword: string;
  scanSize: LocalGridScanSize;
  shape: LocalGridShape;
  distance: number;
  distanceMeasure: LocalGridDistanceMeasure;
  targetBusiness: string;
  pointCount: number;
  avgRank: number | null;
  tarp: number | null;
}

export interface LocalGridAggregatedView {
  activeBusiness: LocalGridBusinessIdentity;
  summary: LocalGridRankSummary;
  evaluatedPins: LocalGridEvaluatedPin[];
  competitors: LocalGridCompetitorRow[];
  categoryBenchmarks: LocalGridCategoryBenchmark[];
  top3AvgReviews: number;
  top3AvgRating: number;
}

/** Frozen grid layout saved when a workspace panel is locked. */
export type LocalGridLayoutSnapshot = {
  keyword: string;
  centerLat: number;
  centerLng: number;
  scanSize: LocalGridScanSize;
  shape: LocalGridShape;
  distance: number;
  distanceMeasure: LocalGridDistanceMeasure;
  activeBusiness: LocalGridBusinessIdentity;
  activeScanId: string | null;
};

export type LocalGridWorkspaceDocument = {
  version: 1;
  updatedAt: string;
  activePanelId: string;
  panels: Array<{
    id: string;
    siteId: string;
    layoutLocked: boolean;
    layoutSnapshot?: LocalGridLayoutSnapshot | null;
  }>;
};
