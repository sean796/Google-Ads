import {
  dedupedAddressLinesFromRows,
  firstCityStateLabelFromAddress,
  mergedPlaceHintsFromGridRows,
  normalizeGridEvidenceCell,
  type LocalDominatorRow,
} from "./local-dominator-place-hints";
import { buildGeographicScopeMarkdown } from "./local-dominator-geo-market";

export interface KeywordGridStats {
  keyword: string;
  count: number;
  avgRank: number;
  minRank: number;
  maxRank: number;
  pctAbove10: number;
}

/**
 * Single score per tracked grid keyword: higher = weaker average positions (more points need improvement).
 * Used to weight SAP page allocation toward inventory phrases that align with struggling grid keywords.
 */
export function weaknessScoreFromKeywordStats(s: KeywordGridStats): number {
  const avg = s.avgRank;
  const pctWeak = s.pctAbove10;
  const tail = s.maxRank >= 18 ? 10 : s.maxRank >= 14 ? 5 : 0;
  return Math.max(1, Math.round(avg * 2.2 + pctWeak * 0.35 + tail));
}

/** Per City, ST area: higher weight = weaker average rank (prioritize SAP/entity focus). */
export type PlaceWeaknessWeight = { place: string; weight: number };

/** Internal CSV bucket labels (FSA / lat-lng pin) — not valid user-facing entityHint text. */
export function isInternalGridPlaceBucketLabel(place: string): boolean {
  const t = place.trim();
  if (/^FSA\s+[A-Z]\d[A-Z]$/i.test(t)) return true;
  if (/^pin_-?\d+(?:\.\d+)?_-?\d+(?:\.\d+)?$/i.test(t)) return true;
  return false;
}

/**
 * Canadian postal FSA (first three characters of A1A 1A1) from an address line, or null.
 * Format-only; no locale allowlist.
 */
export function canadianPostalFsaFromAddress(address: string | undefined): string | null {
  const a = address?.trim();
  if (!a) return null;
  const m = /\b([A-Za-z]\d[A-Za-z])[\s-]?\d[A-Za-z]\d\b/.exec(a);
  if (!m) return null;
  return m[1]!.toUpperCase();
}

const PIN_ROUND_DIGITS = 2;
const MAX_PIN_BUCKETS = 60;

function rowHasValidPin(r: LocalDominatorRow): boolean {
  const { latitude: lat, longitude: lng } = r;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

/**
 * Stable grid-pin bucket from lat/lng (rounded). Returns `pin_lat_lng` or null.
 */
export function pinBucketLabelFromRow(r: LocalDominatorRow): string | null {
  if (!rowHasValidPin(r)) return null;
  const lat = Number(r.latitude.toFixed(PIN_ROUND_DIGITS));
  const lng = Number(r.longitude.toFixed(PIN_ROUND_DIGITS));
  return `pin_${lat}_${lng}`;
}

function placeWeaknessWeightsFromBucketKey(
  rows: LocalDominatorRow[],
  keyLabel: (r: LocalDominatorRow) => string | null
): PlaceWeaknessWeight[] {
  const byPlace = new Map<string, LocalDominatorRow[]>();
  for (const r of rows) {
    const label = keyLabel(r);
    if (!label) continue;
    if (!byPlace.has(label)) byPlace.set(label, []);
    byPlace.get(label)!.push(r);
  }
  const out: PlaceWeaknessWeight[] = [];
  for (const [place, list] of byPlace) {
    const ranks = list.map((x) => x.rank);
    const avg = ranks.reduce((a, b) => a + b, 0) / ranks.length;
    const minR = Math.min(...ranks);
    const maxR = Math.max(...ranks);
    const above10 = ranks.filter((x) => x > 10).length;
    const pctAbove10 = (above10 / ranks.length) * 100;
    const stats: KeywordGridStats = {
      keyword: place,
      count: list.length,
      avgRank: Math.round(avg * 10) / 10,
      minRank: minR,
      maxRank: maxR,
      pctAbove10: Math.round(pctAbove10 * 10) / 10,
    };
    out.push({ place, weight: weaknessScoreFromKeywordStats(stats) });
  }
  out.sort((a, b) => b.weight - a.weight || a.place.localeCompare(b.place));
  return out;
}

function placeWeaknessWeightsFromRowsCitySt(rows: LocalDominatorRow[]): PlaceWeaknessWeight[] {
  return placeWeaknessWeightsFromBucketKey(rows, (r) => firstCityStateLabelFromAddress(r.address));
}

function placeWeaknessWeightsFromRowsFsa(rows: LocalDominatorRow[]): PlaceWeaknessWeight[] {
  return placeWeaknessWeightsFromBucketKey(rows, (r) => {
    const fsa = canadianPostalFsaFromAddress(r.address);
    return fsa ? `FSA ${fsa}` : null;
  });
}

function placeWeaknessWeightsFromRowsPin(rows: LocalDominatorRow[]): PlaceWeaknessWeight[] {
  const byPin = new Map<string, LocalDominatorRow[]>();
  for (const r of rows) {
    const pin = pinBucketLabelFromRow(r);
    if (!pin) continue;
    if (!byPin.has(pin)) byPin.set(pin, []);
    byPin.get(pin)!.push(r);
  }
  let entries = [...byPin.entries()].sort((a, b) => b[1].length - a[1].length);
  if (entries.length > MAX_PIN_BUCKETS) {
    entries = entries.slice(0, MAX_PIN_BUCKETS);
  }
  const allowed = new Set(entries.map(([k]) => k));
  const filteredRows = rows.filter((r) => {
    const p = pinBucketLabelFromRow(r);
    return p != null && allowed.has(p);
  });
  return placeWeaknessWeightsFromBucketKey(filteredRows, (r) => pinBucketLabelFromRow(r));
}

function mergeWeightedPlaceLists(lists: PlaceWeaknessWeight[][]): PlaceWeaknessWeight[] {
  const byPlace = new Map<string, PlaceWeaknessWeight>();
  for (const list of lists) {
    for (const pw of list) {
      const k = pw.place.trim();
      if (!k) continue;
      const prev = byPlace.get(k);
      if (!prev || pw.weight > prev.weight) byPlace.set(k, { place: pw.place.trim(), weight: pw.weight });
    }
  }
  return [...byPlace.values()].sort((a, b) => b.weight - a.weight || a.place.localeCompare(b.place));
}

/**
 * Per-area weakness: City, ST (legacy), Canadian FSA buckets, and lat/lng pin buckets —
 * merged so Wikipedia ordering receives sub-metro signal from the same CSV (no gazetteers).
 */
export function placeWeaknessWeightsFromRows(rows: LocalDominatorRow[]): PlaceWeaknessWeight[] {
  const citySt = placeWeaknessWeightsFromRowsCitySt(rows);
  const fsa = placeWeaknessWeightsFromRowsFsa(rows);
  const pin = placeWeaknessWeightsFromRowsPin(rows);
  return mergeWeightedPlaceLists([citySt, fsa, pin]);
}

/**
 * Lowercased snippets from weakest-ranked rows — for overlapping Wikipedia ### titles without hardcoded places.
 */
export function gridPlaceEvidenceForWikiOrder(
  rows: LocalDominatorRow[],
  maxLen: number = 6000,
  maxRows: number = 80,
  opts?: { addressOnly?: boolean }
): string {
  const addressOnly = opts?.addressOnly !== false;
  const sorted = [...rows].sort((a, b) => b.rank - a.rank);
  const parts: string[] = [];
  let len = 0;
  let n = 0;
  for (const r of sorted) {
    if (n >= maxRows) break;
    const chunk = addressOnly
      ? `${r.address ?? ""}`.replace(/\s+/g, " ").trim()
      : `${r.business ?? ""} ${r.address ?? ""}`.replace(/\s+/g, " ").trim();
    if (chunk.length < 6) continue;
    const low = chunk.toLowerCase();
    if (len + low.length + 1 > maxLen) break;
    parts.push(low);
    len += low.length + 1;
    n++;
  }
  return parts.join(" ");
}

export interface LocalGridSummary {
  rowCount: number;
  scanDateRange: string;
  keywords: string[];
  byKeyword: KeywordGridStats[];
  /** Full markdown for the model (entire grid, not summarized). */
  summaryMarkdown: string;
  /** City/region hints from Address columns (for UI soft checks). */
  placeHints: string[];
}

export interface BuildLocalGridSummaryOptions {
  /** When rows were downsampled, original point count from the CSV. */
  originalTotalPoints?: number;
  /** When set (e.g. full grid before sampling), geographic scope uses these rows so bounds match the whole file. */
  rowsForGeographicScope?: LocalDominatorRow[];
}

/**
 * Aggregate grid stats and build markdown for the full row set (no truncation).
 */
export function buildLocalGridSummary(
  rows: LocalDominatorRow[],
  options?: BuildLocalGridSummaryOptions
): LocalGridSummary {
  const originalTotalPoints = options?.originalTotalPoints;
  const dates = rows.map((r) => r.scanDate).filter(Boolean);
  const scanDateRange =
    dates.length === 0
      ? "unknown"
      : dates.length === 1
        ? dates[0]
        : `${dates[0]} … ${dates[dates.length - 1]}`;

  const byKw = new Map<string, LocalDominatorRow[]>();
  for (const r of rows) {
    const k = r.keyword.trim();
    if (!byKw.has(k)) byKw.set(k, []);
    byKw.get(k)!.push(r);
  }

  const keywords = [...byKw.keys()].sort();
  const byKeyword: KeywordGridStats[] = [];

  const geoRows = options?.rowsForGeographicScope ?? rows;
  const geoMd = buildGeographicScopeMarkdown(geoRows);
  const placeHints = mergedPlaceHintsFromGridRows(geoRows);

  const lines: string[] = [
    `## Local grid scan`,
    `- Grid points used in this summary: ${rows.length}${
      originalTotalPoints != null && originalTotalPoints !== rows.length
        ? ` (sampled from ${originalTotalPoints} total in file)`
        : ""
    }`,
    `- Scan date(s): ${scanDateRange}`,
    `- Keywords in scan: ${keywords.join(", ")}`,
    ``,
  ];

  if (geoMd) {
    lines.push(geoMd.trimEnd());
    lines.push("");
  }

  const addressSampleLines = dedupedAddressLinesFromRows(geoRows);
  if (addressSampleLines.length > 0) {
    lines.push(`## Address samples (from export)`);
    lines.push(`- Unique Address column values (full text, deduped):`);
    for (const line of addressSampleLines) {
      lines.push(`  - ${line}`);
    }
    lines.push("");
  }

  for (const kw of keywords) {
    const list = byKw.get(kw)!;
    const ranks = list.map((r) => r.rank);
    const avg = ranks.reduce((a, b) => a + b, 0) / ranks.length;
    const minR = Math.min(...ranks);
    const maxR = Math.max(...ranks);
    const above10 = ranks.filter((x) => x > 10).length;
    const pctAbove10 = (above10 / ranks.length) * 100;

    byKeyword.push({
      keyword: kw,
      count: list.length,
      avgRank: Math.round(avg * 10) / 10,
      minRank: minR,
      maxRank: maxR,
      pctAbove10: Math.round(pctAbove10 * 10) / 10,
    });

    lines.push(`### Keyword: "${kw}"`);
    lines.push(`- Points: ${list.length}, avg rank ${avg.toFixed(1)}, min ${minR}, max ${maxR}`);
    lines.push(`- Share of points with rank > 10: ${pctAbove10.toFixed(1)}%`);

    const ordered = [...list].sort((a, b) => b.rank - a.rank);
    lines.push(`- All grid points for this keyword (rank descending = weaker first):`);
    for (const w of ordered) {
      const pin = `rank ${w.rank} @ (${w.latitude.toFixed(5)}, ${w.longitude.toFixed(5)}), dist ${w.distance} ${w.distanceMeasure}`;
      const biz = normalizeGridEvidenceCell(w.business || "");
      const addr = normalizeGridEvidenceCell(w.address || "");
      const bits = [biz && `business: ${biz}`, addr && `address: ${addr}`].filter(Boolean);
      lines.push(bits.length > 0 ? `  - ${pin} - ${bits.join("; ")}` : `  - ${pin}`);
    }
    lines.push("");
  }

  const business = rows[0]?.business || "";
  const address = rows[0]?.address || "";
  const primaryCat = rows[0]?.primaryCategory || "";
  if (business || address) {
    lines.push(`## Business context (from scan)`);
    lines.push(`- Business: ${business}`);
    lines.push(`- Address: ${address}`);
    if (primaryCat) lines.push(`- Primary category: ${primaryCat}`);
  }

  const summaryMarkdown = lines.join("\n");

  return {
    rowCount: rows.length,
    scanDateRange,
    keywords,
    byKeyword,
    summaryMarkdown,
    placeHints,
  };
}
