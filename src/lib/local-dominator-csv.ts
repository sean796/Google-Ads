import Papa from "papaparse";
import type { LocalDominatorRow } from "./local-dominator-place-hints";

export type { LocalDominatorRow } from "./local-dominator-place-hints";
export {
  cityTokensFromPlaceHints,
  dedupedAddressLinesFromRows,
  defaultSeedEntityHintFromGrid,
  dominantCityFromPlaceHints,
  entityMatchesCsvPlaceHints,
  extractStreetCorridorHintsFromRows,
  extractTopPlaceHintsFromRows,
  firstCityStateLabelFromAddress,
  isStreetCorridorPlaceLabel,
  lastCityStateLabelFromAddress,
  mergeStreetAndCityPlaceHints,
  mergedPlaceHintsFromGridRows,
  normalizeGridEvidenceCell,
  streetCorridorLabelFromAddress,
  truncateGridEvidenceCell,
} from "./local-dominator-place-hints";
export {
  computeGridGeographicFootprint,
  haversineDistanceMiles,
  inferGridMarketContext,
  regionCodeFromFullName,
  regionFullNameFromPostalCode,
  roughCountryLabelFromCentroid,
  wikipediaSearchAugmentFromGridRows,
} from "./local-dominator-geo-market";
export type {
  GridGeographicFootprint,
  GridMarketInference,
} from "./local-dominator-geo-market";
export {
  buildLocalGridSummary,
  canadianPostalFsaFromAddress,
  gridPlaceEvidenceForWikiOrder,
  isInternalGridPlaceBucketLabel,
  pinBucketLabelFromRow,
  placeWeaknessWeightsFromRows,
  weaknessScoreFromKeywordStats,
} from "./local-dominator-weakness-summary";
export type {
  BuildLocalGridSummaryOptions,
  KeywordGridStats,
  LocalGridSummary,
  PlaceWeaknessWeight,
} from "./local-dominator-weakness-summary";

/** Hard cap on grid rows fed into summary + OpenRouter (browser memory / context). */
export const MAX_GRID_ROWS_FOR_ANALYSIS = 40_000;

/** Refuse FileReader for absurdly large files (browser safety). */
export const MAX_LOCAL_CSV_FILE_BYTES = 100 * 1024 * 1024;

/** Use worker path when file is this large (main-thread parse can freeze UI). */
export const LOCAL_CSV_WORKER_FILE_BYTES_THRESHOLD = 5 * 1024 * 1024;

function num(v: string | undefined): number {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function pick(row: Record<string, string>, ...keys: string[]): string {
  const lower = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), v])
  );
  for (const key of keys) {
    const v = lower[key.toLowerCase()];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/**
 * Parse a Local Dominator (or compatible) CSV into typed rows.
 */
export function parseLocalDominatorCsv(
  text: string,
  options?: { defaultKeyword?: string },
): {
  rows: LocalDominatorRow[];
  error?: string;
} {
  const defaultKeyword = options?.defaultKeyword?.trim() ?? "";
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors?.length) {
    const fatal = parsed.errors.find((e) => e.type === "Quotes" || e.type === "Delimiter");
    if (fatal) {
      return { rows: [], error: fatal.message || "CSV parse error" };
    }
  }

  const data = parsed.data || [];
  if (data.length === 0) {
    return { rows: [], error: "No rows found in CSV." };
  }

  const rows: LocalDominatorRow[] = [];
  for (const raw of data) {
    const keyword = pick(raw, "Keyword", "keyword") || defaultKeyword;
    const rank = num(
      pick(raw, "Rank", "rank", "Average Rank", "average rank", "Position", "position"),
    );
    const lat = num(pick(raw, "Latitude", "latitude"));
    const lng = num(pick(raw, "Longitude", "longitude"));
    const dist = num(pick(raw, "Distance", "distance"));

    if (!keyword) continue;
    if (!Number.isFinite(rank)) continue;

    rows.push({
      scanDate: pick(raw, "Scan Date", "Scan date", "scan date"),
      latitude: Number.isFinite(lat) ? lat : 0,
      longitude: Number.isFinite(lng) ? lng : 0,
      keyword,
      business: pick(raw, "Business", "business", "Business Name", "business name"),
      address: pick(raw, "Address", "address"),
      placeId: pick(raw, "Place ID", "Place Id", "place id"),
      websiteUrl: pick(raw, "Website URL", "Website Url", "website url"),
      scanSize: pick(raw, "Scan Size", "scan size"),
      distance: Number.isFinite(dist) ? dist : 0,
      distanceMeasure: pick(raw, "Distance measure", "Distance Measure", "distance measure") || "mile",
      rank,
      primaryCategory: pick(raw, "Primary Category", "primary category"),
      secondaryCategories: pick(raw, "Secondary Categories", "secondary categories"),
    });
  }

  if (rows.length === 0) {
    return {
      rows: [],
      error:
        "Could not read grid rows. Expected columns such as Keyword, Rank, Latitude, Longitude (Local Dominator export).",
    };
  }

  return { rows };
}

/** Most frequent keyword in the grid (typical scan uses one query across all points). */
export function dominantKeywordFromRows(rows: LocalDominatorRow[]): string {
  if (rows.length === 0) return "";
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = r.keyword.trim();
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best = "";
  let bestN = 0;
  for (const [k, n] of counts) {
    if (n > bestN) {
      bestN = n;
      best = k;
    }
  }
  return best || rows[0].keyword.trim();
}

/**
 * Stratified downsample (per-keyword quota + random within bucket) when the grid
 * exceeds MAX_GRID_ROWS_FOR_ANALYSIS.
 */
export function sampleGridRowsForAnalysis(
  rows: LocalDominatorRow[],
  maxRows: number = MAX_GRID_ROWS_FOR_ANALYSIS
): { sampled: LocalDominatorRow[]; wasCapped: boolean; originalCount: number } {
  const originalCount = rows.length;
  if (originalCount <= maxRows) {
    return { sampled: rows, wasCapped: false, originalCount };
  }

  const byKw = new Map<string, LocalDominatorRow[]>();
  for (const r of rows) {
    const k = r.keyword.trim();
    if (!byKw.has(k)) byKw.set(k, []);
    byKw.get(k)!.push(r);
  }

  const buckets = [...byKw.entries()].map(([kw, list]) => ({ kw, list, n: list.length }));
  const total = originalCount;

  const quotas = buckets.map(({ n }) => (maxRows * n) / total);
  const seats = quotas.map((q) => Math.floor(q));
  let sumSeats = seats.reduce((a, b) => a + b, 0);
  const remainder = maxRows - sumSeats;
  const fracs = quotas.map((q, i) => ({ i, f: q - Math.floor(q) }));
  fracs.sort((a, b) => b.f - a.f);
  for (let k = 0; k < remainder && k < fracs.length; k++) {
    seats[fracs[k].i]++;
  }

  for (let i = 0; i < buckets.length; i++) {
    seats[i] = Math.min(seats[i], buckets[i].n);
  }
  sumSeats = seats.reduce((a, b) => a + b, 0);

  while (sumSeats < maxRows) {
    let bestRoom = 0;
    let bi = -1;
    for (let i = 0; i < buckets.length; i++) {
      const room = buckets[i].n - seats[i];
      if (room > bestRoom) {
        bestRoom = room;
        bi = i;
      }
    }
    if (bi < 0) break;
    seats[bi]++;
    sumSeats++;
  }

  while (sumSeats > maxRows) {
    let best = -1;
    let bi = -1;
    for (let i = 0; i < buckets.length; i++) {
      if (seats[i] > best) {
        best = seats[i];
        bi = i;
      }
    }
    if (bi < 0 || seats[bi] <= 0) break;
    seats[bi]--;
    sumSeats--;
  }

  const shuffle = <T,>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const sampled: LocalDominatorRow[] = [];
  for (let i = 0; i < buckets.length; i++) {
    const take = Math.min(seats[i], buckets[i].n);
    sampled.push(...shuffle(buckets[i].list).slice(0, take));
  }

  return { sampled, wasCapped: true, originalCount };
}
