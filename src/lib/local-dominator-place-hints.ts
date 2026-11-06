/** One row from a Local Dominator–style local SEO grid export. */
export interface LocalDominatorRow {
  scanDate: string;
  latitude: number;
  longitude: number;
  keyword: string;
  business: string;
  address: string;
  placeId: string;
  websiteUrl: string;
  scanSize: string;
  distance: number;
  distanceMeasure: string;
  rank: number;
  primaryCategory: string;
  secondaryCategories: string;
}

/** Max distinct "City, ST" style hints appended to the geographic scope block. */
const MAX_PLACE_NAME_HINTS = 25;

/** Match "City, ST" segments in address lines (e.g. Phoenix, AZ). */
export const CITY_ST_IN_ADDRESS = /([A-Za-z][A-Za-z\s.'-]{0,48}?),\s*([A-Z]{2})\b/g;

/** Normalize whitespace in a grid cell; do not truncate - full text is sent to the model. */
export function normalizeGridEvidenceCell(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/**
 * @deprecated Use normalizeGridEvidenceCell - local analysis sends full cells without length caps.
 */
export function truncateGridEvidenceCell(s: string, maxLen: number): string {
  const t = normalizeGridEvidenceCell(s);
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

/**
 * Deduped non-empty address lines from grid rows (order preserved by first occurrence).
 */
export function dedupedAddressLinesFromRows(
  rows: LocalDominatorRow[],
  maxLines: number = Number.POSITIVE_INFINITY
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const a = r.address?.trim();
    if (!a) continue;
    const k = a.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(normalizeGridEvidenceCell(a));
    if (out.length >= maxLines) break;
  }
  return out;
}

/** All distinct City, ST labels from addresses, sorted by frequency. */
export function extractTopPlaceHintsFromRows(
  rows: LocalDominatorRow[],
  maxHints: number = MAX_PLACE_NAME_HINTS
): string[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const addr = r.address?.trim();
    if (!addr) continue;
    CITY_ST_IN_ADDRESS.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CITY_ST_IN_ADDRESS.exec(addr)) !== null) {
      const city = m[1].trim().replace(/\s+/g, " ");
      const st = m[2];
      if (city.length < 2) continue;
      const label = `${city}, ${st}`;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return sorted.map(([label]) => label).slice(0, Math.max(1, maxHints));
}

const STREETISH_ADDRESS_PREFIX =
  /\d|\b(St|Ave|Avenue|Road|Rd|Blvd|Boulevard|Dr|Drive|Lane|Way|Ct|Court|Hwy|Highway|Route|I-|Fwy|Pkwy|Pl|Place|Cir|Circle)\b/i;

/** True when a place label's leading segment looks like a street or corridor, not a neighbourhood. */
export function isStreetCorridorPlaceLabel(label: string | undefined | null): boolean {
  const trimmed = label?.trim();
  if (!trimmed) return false;
  const head = trimmed.split(",")[0]?.trim() ?? "";
  if (!head) return false;
  return STREETISH_ADDRESS_PREFIX.test(head);
}

/**
 * Street- or corridor-level labels from address lines: text **before** the first "City, ST"
 * segment, joined with that city (e.g. `123 Main St, Smyrna, GA`). Sorted by frequency.
 * Prefer these over bare **City, ST** in grid entity backfill when present.
 */
export function extractStreetCorridorHintsFromRows(
  rows: LocalDominatorRow[],
  _maxHints: number = MAX_PLACE_NAME_HINTS
): string[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const addr = r.address?.trim();
    if (!addr) continue;
    CITY_ST_IN_ADDRESS.lastIndex = 0;
    const m = CITY_ST_IN_ADDRESS.exec(addr);
    if (!m) continue;
    const city = m[1]!.trim().replace(/\s+/g, " ");
    const st = m[2]!;
    if (city.length < 2) continue;
    const needle = m[0]!;
    const idx = addr.indexOf(needle);
    if (idx <= 0) continue;
    let prefix = addr.slice(0, idx).trim().replace(/[,\s]+$/g, "");
    if (prefix.length < 4) continue;
    if (prefix.length > 120) prefix = prefix.slice(0, 120).trim();
    if (!STREETISH_ADDRESS_PREFIX.test(prefix)) continue;
    const label = `${prefix}, ${city}, ${st}`;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return sorted.map(([label]) => label);
}

/**
 * Street corridor label from one address: strip house number, keep street + City, ST.
 * e.g. `9940 Whyte Ave NW, Edmonton, AB` → `Whyte Ave NW, Edmonton, AB`
 */
export function streetCorridorLabelFromAddress(address: string | undefined): string | null {
  const addr = address?.trim();
  if (!addr) return null;
  CITY_ST_IN_ADDRESS.lastIndex = 0;
  const m = CITY_ST_IN_ADDRESS.exec(addr);
  if (!m) return null;
  const city = m[1]!.trim().replace(/\s+/g, " ");
  const st = m[2]!;
  if (city.length < 2) return null;
  const needle = m[0]!;
  const idx = addr.indexOf(needle);
  if (idx <= 0) return null;
  let prefix = addr.slice(0, idx).trim().replace(/[,\s]+$/g, "");
  if (prefix.length < 4) return null;
  prefix = prefix.replace(/^\d+[\w/-]*\s+/, "").trim();
  if (prefix.length < 4 || !STREETISH_ADDRESS_PREFIX.test(prefix)) return null;
  if (prefix.length > 80) prefix = prefix.slice(0, 80).trim();
  return `${prefix}, ${city}, ${st}`;
}

/**
 * Street-level hints first, then distinct **City, ST** labels (deduped by case-insensitive key).
 */
export function mergeStreetAndCityPlaceHints(streetHints: string[], cityHints: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const h of streetHints) {
    const k = h.toLowerCase().trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(h.trim());
  }
  for (const h of cityHints) {
    const k = h.toLowerCase().trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(h.trim());
  }
  return out;
}

/** First "City, ST" segment in an address line, or null. */
export function firstCityStateLabelFromAddress(address: string | undefined): string | null {
  const addr = address?.trim();
  if (!addr) return null;
  CITY_ST_IN_ADDRESS.lastIndex = 0;
  const m = CITY_ST_IN_ADDRESS.exec(addr);
  if (!m) return null;
  const city = m[1].trim().replace(/\s+/g, " ");
  const st = m[2];
  if (city.length < 2) return null;
  return `${city}, ${st}`;
}

/** Last "City, ST" in an address line — safer for full street addresses than the first match. */
export function lastCityStateLabelFromAddress(address: string | undefined): string | null {
  const addr = address?.trim();
  if (!addr) return null;
  CITY_ST_IN_ADDRESS.lastIndex = 0;
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = CITY_ST_IN_ADDRESS.exec(addr)) !== null) {
    const city = m[1].trim().replace(/\s+/g, " ");
    const st = m[2];
    if (city.length >= 2) last = `${city}, ${st}`;
  }
  return last;
}

/**
 * Default seed row `entityHint` after grid load: first grid `City, ST` by frequency, else optional sync fallbacks (radius / site primary).
 */
export function defaultSeedEntityHintFromGrid(
  placeHints: string[],
  fallbacks?: readonly string[] | null,
): string {
  for (const h of placeHints) {
    const t = String(h ?? "").trim();
    if (t.length > 0) return t;
  }
  if (fallbacks) {
    for (const f of fallbacks) {
      const t = String(f ?? "").trim();
      if (t.length > 0) return t;
    }
  }
  return "";
}

/**
 * City-like tokens from hints (e.g. "Phoenix, AZ" → "Phoenix") for soft entity checks.
 */
export function cityTokensFromPlaceHints(hints: string[]): string[] {
  const out: string[] = [];
  for (const h of hints) {
    const part = h.split(",")[0]?.trim();
    if (part && part.length >= 2) out.push(part);
  }
  return [...new Set(out)];
}

/**
 * City name from the first grid hint that ends with `, ST` (US/CA style), for Wikipedia pool search.
 * Prefers merged street+city hints over core-metro storefront labels when the CSV is suburban.
 */
export function dominantCityFromPlaceHints(hints: string[]): string {
  for (const h of hints) {
    const t = String(h ?? "").trim();
    if (!t) continue;
    const parts = t.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1]!;
      if (/^[A-Z]{2}$/i.test(last)) {
        const city = parts[parts.length - 2]!.trim();
        if (city.length >= 2) return city;
      }
    }
  }
  return "";
}

/**
 * True if `entity` mentions at least one city token from CSV hints (case-insensitive).
 */
export function entityMatchesCsvPlaceHints(entity: string, hints: string[]): boolean {
  if (!entity.trim() || hints.length === 0) return false;
  const e = entity.toLowerCase();
  for (const token of cityTokensFromPlaceHints(hints)) {
    if (token.length >= 2 && e.includes(token.toLowerCase())) return true;
  }
  return false;
}

/** City, ST hints plus street/corridor labels (deduped) for prompts and UI. */
export function mergedPlaceHintsFromGridRows(rows: LocalDominatorRow[]): string[] {
  const street = extractStreetCorridorHintsFromRows(rows, MAX_PLACE_NAME_HINTS);
  const city = extractTopPlaceHintsFromRows(rows, MAX_PLACE_NAME_HINTS);
  return mergeStreetAndCityPlaceHints(street, city);
}
