import Papa from "papaparse";
import {
  aggregateLocalGridScan,
  buildCanonicalBusinessKey,
  normalizeBusinessText,
  normalizeDomainHost,
} from "./local-grid-aggregator";
import { computeGridBounds, haversineDistanceBetween } from "./local-grid-math";
import {
  LOCAL_GRID_SCAN_SIZES,
  type LocalGridBusinessIdentity,
  type LocalGridDistanceMeasure,
  type LocalGridPointResult,
  type LocalGridScanDocument,
  type LocalGridScanSize,
  type LocalGridSerpItem,
} from "./local-grid-types";

export const LOCAL_DOMINATOR_CSV_HEADERS = [
  "Scan Date",
  "Latitude",
  "Longitude",
  "Keyword",
  "Business",
  "Address",
  "Place ID",
  "Website URL",
  "Scan Size",
  "Distance",
  "Distance measure",
  "Rank",
  "Primary Category",
  "Secondary Categories",
  "",
  "Rating",
  "Reviews",
  "Google URL",
] as const;

function parseNum(raw: string | undefined): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = parseFloat(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function normalizeScanSize(raw: string | undefined, pointCount: number): LocalGridScanSize {
  const cleaned = (raw ?? "").trim().toLowerCase();
  if ((LOCAL_GRID_SCAN_SIZES as readonly string[]).includes(cleaned)) {
    return cleaned as LocalGridScanSize;
  }
  if (pointCount <= 1) return "1x1";
  if (pointCount <= 9) return "3x3";
  if (pointCount <= 25) return "5x5";
  if (pointCount <= 49) return "7x7";
  if (pointCount <= 81) return "9x9";
  if (pointCount <= 169) return "13x13";
  return "15x15";
}

function normalizeDistanceMeasure(raw: string | undefined): LocalGridDistanceMeasure {
  const cleaned = (raw ?? "").trim().toLowerCase();
  if (cleaned.startsWith("km") || cleaned.startsWith("kilo")) return "km";
  return "mile";
}

/**
 * Parse a full Local Dominator 18-column CSV (with up to 20 competitors per coordinate pin)
 * into a complete `LocalGridScanDocument`.
 */
export function parseLocalDominatorFullScanCsv(
  csvText: string,
  options: {
    siteId: string;
    preferredBusinessName?: string;
    preferredWebsiteUrl?: string;
  },
): { scan: LocalGridScanDocument | null; error?: string } {
  const parsed = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: true,
  });

  if (parsed.errors?.length) {
    const fatal = parsed.errors.find((e) => e.type === "Quotes" || e.type === "Delimiter");
    if (fatal) {
      return { scan: null, error: fatal.message || "CSV parse error" };
    }
  }

  const rows = parsed.data ?? [];
  if (rows.length < 2) {
    return { scan: null, error: "CSV contains no data rows." };
  }

  const headerRow = rows[0]!.map((h) => h.trim().replace(/^\uFEFF/, "").toLowerCase());
  const colIdx = (names: string[]): number => {
    for (const name of names) {
      const idx = headerRow.indexOf(name.toLowerCase());
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const idxScanDate = colIdx(["scan date"]);
  const idxLat = colIdx(["latitude"]);
  const idxLng = colIdx(["longitude"]);
  const idxKeyword = colIdx(["keyword"]);
  const idxBusiness = colIdx(["business", "business name"]);
  const idxAddress = colIdx(["address"]);
  const idxPlaceId = colIdx(["place id", "place_id"]);
  const idxWebsite = colIdx(["website url", "website"]);
  const idxScanSize = colIdx(["scan size"]);
  const idxDistance = colIdx(["distance"]);
  const idxMeasure = colIdx(["distance measure"]);
  const idxRank = colIdx(["rank", "position"]);
  const idxPrimaryCat = colIdx(["primary category"]);
  const idxSecondaryCat = colIdx(["secondary categories"]);
  const idxRating = colIdx(["rating"]);
  const idxReviews = colIdx(["reviews"]);
  const idxGoogleUrl = colIdx(["google url", "maps url"]);

  if (idxLat < 0 || idxLng < 0 || idxRank < 0) {
    return {
      scan: null,
      error: "Missing required columns: Latitude, Longitude, and Rank.",
    };
  }

  const pinMap = new Map<
    string,
    {
      latitude: number;
      longitude: number;
      items: LocalGridSerpItem[];
    }
  >();

  let scanDateLabel = "";
  let keyword = "";
  let rawScanSize = "";
  let distance = 1;
  let distanceMeasure: LocalGridDistanceMeasure = "mile";

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]!;
    const lat = parseNum(cells[idxLat]);
    const lng = parseNum(cells[idxLng]);
    const rank = parseNum(cells[idxRank]);

    if (lat == null || lng == null || rank == null) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;

    if (!scanDateLabel && idxScanDate >= 0 && cells[idxScanDate]?.trim()) {
      scanDateLabel = cells[idxScanDate]!.trim();
    }
    if (!keyword && idxKeyword >= 0 && cells[idxKeyword]?.trim()) {
      keyword = cells[idxKeyword]!.trim();
    }
    if (!rawScanSize && idxScanSize >= 0 && cells[idxScanSize]?.trim()) {
      rawScanSize = cells[idxScanSize]!.trim();
    }
    if (idxDistance >= 0) {
      const d = parseNum(cells[idxDistance]);
      if (d != null && d > 0) distance = d;
    }
    if (idxMeasure >= 0 && cells[idxMeasure]?.trim()) {
      distanceMeasure = normalizeDistanceMeasure(cells[idxMeasure]);
    }

    const pinKey = `${lat.toFixed(6)}_${lng.toFixed(6)}`;
    let pin = pinMap.get(pinKey);
    if (!pin) {
      pin = { latitude: lat, longitude: lng, items: [] };
      pinMap.set(pinKey, pin);
    }

    const placeId = idxPlaceId >= 0 ? (cells[idxPlaceId] ?? "").trim() : "";
    const googleUrl =
      idxGoogleUrl >= 0 && cells[idxGoogleUrl]?.trim()
        ? cells[idxGoogleUrl]!.trim()
        : `https://www.google.com/maps?cid=${placeId}`;

    pin.items.push({
      rank: Math.round(rank),
      business: idxBusiness >= 0 ? (cells[idxBusiness] ?? "").trim() : "",
      address: idxAddress >= 0 ? (cells[idxAddress] ?? "").trim() : "",
      placeId,
      cid: /^\d+$/.test(placeId) ? placeId : undefined,
      websiteUrl: idxWebsite >= 0 ? (cells[idxWebsite] ?? "").trim() : "",
      primaryCategory: idxPrimaryCat >= 0 ? (cells[idxPrimaryCat] ?? "").trim() : "",
      secondaryCategories: idxSecondaryCat >= 0 ? (cells[idxSecondaryCat] ?? "").trim() : "",
      rating: idxRating >= 0 ? parseNum(cells[idxRating]) : null,
      reviews: idxReviews >= 0 ? parseNum(cells[idxReviews]) : null,
      googleUrl,
    });
  }

  if (pinMap.size === 0) {
    return { scan: null, error: "No valid coordinate rows found in CSV." };
  }

  const rawPins = [...pinMap.values()];
  const bounds = computeGridBounds(rawPins);

  const points: LocalGridPointResult[] = rawPins.map((p, index) => {
    p.items.sort((a, b) => a.rank - b.rank);
    return {
      pointId: `pin_${index}`,
      row: 0,
      col: index,
      latitude: p.latitude,
      longitude: p.longitude,
      distanceFromCenter: Number(
        haversineDistanceBetween(
          bounds.centerLat,
          bounds.centerLng,
          p.latitude,
          p.longitude,
          distanceMeasure,
        ).toFixed(2),
      ),
      items: p.items,
      error: null,
    };
  });

  const placeholderIdentity: LocalGridBusinessIdentity = {
    key: "placeholder",
    business: options.preferredBusinessName?.trim() || "",
    address: "",
    placeId: "",
    websiteUrl: options.preferredWebsiteUrl?.trim() || "",
    primaryCategory: "",
    secondaryCategories: "",
    rating: null,
    reviews: null,
    latitude: bounds.centerLat,
    longitude: bounds.centerLng,
  };

  const initialAgg = aggregateLocalGridScan(points, placeholderIdentity);
  const prefName = normalizeBusinessText(options.preferredBusinessName);
  const prefHost = normalizeDomainHost(options.preferredWebsiteUrl);

  let selectedTarget: LocalGridBusinessIdentity | null = null;
  if (prefHost || prefName) {
    const matchedComp = initialAgg.competitors.find((c) => {
      const cHost = normalizeDomainHost(c.websiteUrl);
      const cName = normalizeBusinessText(c.business);
      if (prefHost && cHost && prefHost === cHost) return true;
      if (prefName && cName && (cName === prefName || cName.includes(prefName) || prefName.includes(cName))) {
        return true;
      }
      return false;
    });
    if (matchedComp) {
      selectedTarget = matchedComp;
    }
  }

  if (!selectedTarget) {
    selectedTarget = initialAgg.competitors[0] ?? placeholderIdentity;
  }

  const finalAgg = aggregateLocalGridScan(points, selectedTarget);
  const scanSize = normalizeScanSize(rawScanSize, points.length);
  const parsedDate = scanDateLabel ? new Date(scanDateLabel) : new Date();
  const scanDateIso = Number.isNaN(parsedDate.getTime())
    ? new Date().toISOString()
    : parsedDate.toISOString();

  return {
    scan: {
      scanId: `scan_${Date.now()}`,
      siteId: options.siteId,
      scanDateIso,
      scanDateLabel: scanDateLabel || new Date().toLocaleString(),
      keyword: keyword || "local search",
      scanSize,
      shape: points.length === 177 || points.length === 37 || points.length === 61 ? "circle" : "square",
      distance,
      distanceMeasure,
      centerLat: bounds.centerLat,
      centerLng: bounds.centerLng,
      targetBusiness: {
        ...selectedTarget,
        key: buildCanonicalBusinessKey(selectedTarget),
      },
      points,
      summary: finalAgg.summary,
    },
  };
}

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  const str = String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Serialize a `LocalGridScanDocument` into an exact 18-column Local Dominator CSV string.
 */
export function serializeLocalGridScanToCsv(scan: LocalGridScanDocument): string {
  const headerLine = LOCAL_DOMINATOR_CSV_HEADERS.join(",");
  const lines: string[] = [headerLine];

  for (const pt of scan.points) {
    for (const item of pt.items) {
      const row = [
        escapeCsvCell(scan.scanDateLabel),
        escapeCsvCell(pt.latitude),
        escapeCsvCell(pt.longitude),
        escapeCsvCell(scan.keyword),
        escapeCsvCell(item.business),
        escapeCsvCell(item.address),
        escapeCsvCell(item.placeId || item.cid || ""),
        item.websiteUrl ? escapeCsvCell(item.websiteUrl) : "",
        escapeCsvCell(scan.scanSize),
        escapeCsvCell(scan.distance),
        escapeCsvCell(scan.distanceMeasure),
        escapeCsvCell(item.rank),
        escapeCsvCell(item.primaryCategory),
        escapeCsvCell(item.secondaryCategories),
        "",
        item.rating != null ? escapeCsvCell(item.rating) : "",
        item.reviews != null ? escapeCsvCell(item.reviews) : "",
        escapeCsvCell(item.googleUrl || "https://www.google.com/maps?cid="),
      ];
      lines.push(row.join(","));
    }
  }

  return lines.join("\n");
}
