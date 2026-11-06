import Papa from "papaparse";

/** Hard cap on grid rows fed into summary + OpenRouter (browser memory / context). */
export const MAX_GRID_ROWS_FOR_ANALYSIS = 40_000;

/** Refuse FileReader for absurdly large files (browser safety). */
export const MAX_LOCAL_CSV_FILE_BYTES = 100 * 1024 * 1024;

/** Use worker path when file is this large (main-thread parse can freeze UI). */
export const LOCAL_CSV_WORKER_FILE_BYTES_THRESHOLD = 5 * 1024 * 1024;

/** Extra margin on max distance from centroid so edge grid pins stay “in scope” for the model. */
const GEO_SCOPE_RADIUS_BUFFER = 1.125;

/** Max distinct "City, ST" style hints appended to the geographic scope block. */
const MAX_PLACE_NAME_HINTS = 25;

const EARTH_RADIUS_MILES = 3958.7613;

/** @internal Exported for tests. */
export function haversineDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_MILES * c;
}

function rowHasUsableCoordinates(r: LocalDominatorRow): boolean {
  const { latitude: lat, longitude: lng } = r;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

export interface GridGeographicFootprint {
  centroidLat: number;
  centroidLon: number;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  /** Furthest grid point from centroid (miles). */
  maxRadiusMilesFromCentroid: number;
  /** Buffered radius for prompt instructions (miles). */
  bufferedRadiusMiles: number;
  pointCount: number;
}

/**
 * Centroid, bounding box, and max distance from centroid for grid rows with valid lat/lng.
 */
export function computeGridGeographicFootprint(rows: LocalDominatorRow[]): GridGeographicFootprint {
  const usable = rows.filter(rowHasUsableCoordinates);
  const n = usable.length;
  if (n === 0) {
    return {
      centroidLat: 0,
      centroidLon: 0,
      minLat: 0,
      maxLat: 0,
      minLon: 0,
      maxLon: 0,
      maxRadiusMilesFromCentroid: 0,
      bufferedRadiusMiles: 0,
      pointCount: 0,
    };
  }
  let sumLat = 0;
  let sumLon = 0;
  let minLat = usable[0].latitude;
  let maxLat = usable[0].latitude;
  let minLon = usable[0].longitude;
  let maxLon = usable[0].longitude;
  for (const r of usable) {
    sumLat += r.latitude;
    sumLon += r.longitude;
    minLat = Math.min(minLat, r.latitude);
    maxLat = Math.max(maxLat, r.latitude);
    minLon = Math.min(minLon, r.longitude);
    maxLon = Math.max(maxLon, r.longitude);
  }
  const centroidLat = sumLat / n;
  const centroidLon = sumLon / n;
  let maxR = 0;
  for (const r of usable) {
    const d = haversineDistanceMiles(centroidLat, centroidLon, r.latitude, r.longitude);
    if (d > maxR) maxR = d;
  }
  const bufferedRadiusMiles = maxR * GEO_SCOPE_RADIUS_BUFFER;
  return {
    centroidLat,
    centroidLon,
    minLat,
    maxLat,
    minLon,
    maxLon,
    maxRadiusMilesFromCentroid: maxR,
    bufferedRadiusMiles,
    pointCount: n,
  };
}

/** Match "City, ST" segments in address lines (e.g. Phoenix, AZ). */
const CITY_ST_IN_ADDRESS = /([A-Za-z][A-Za-z\s.'-]{0,48}?),\s*([A-Z]{2})\b/g;

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

/** US state / DC - two-letter codes from Address lines (same regex as CITY_ST_IN_ADDRESS). */
const US_STATE_CODE_TO_NAME: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

/** Expand CA province / US state postal code to full Wikipedia place name. */
export function regionFullNameFromPostalCode(code: string): string | undefined {
  const key = code.trim().toUpperCase();
  if (!key) return undefined;
  return CA_PROVINCE_CODE_TO_NAME[key] ?? US_STATE_CODE_TO_NAME[key];
}

const US_STATE_CODES = new Set(Object.keys(US_STATE_CODE_TO_NAME));

/** Map "Florida" / "Manitoba" to FL / MB. */
export function regionCodeFromFullName(name: string): string | undefined {
  const needle = name.trim().toLowerCase();
  if (!needle) return undefined;
  for (const [code, full] of Object.entries(CA_PROVINCE_CODE_TO_NAME)) {
    if (full.toLowerCase() === needle) return code;
  }
  for (const [code, full] of Object.entries(US_STATE_CODE_TO_NAME)) {
    if (full.toLowerCase() === needle) return code;
  }
  return undefined;
}

const CA_PROVINCE_CODE_TO_NAME: Record<string, string> = {
  AB: "Alberta",
  BC: "British Columbia",
  MB: "Manitoba",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  NS: "Nova Scotia",
  NT: "Northwest Territories",
  NU: "Nunavut",
  ON: "Ontario",
  PE: "Prince Edward Island",
  QC: "Quebec",
  SK: "Saskatchewan",
  YT: "Yukon",
};

/** Minimum City,ST code hits before we treat address lines as a country signal. */
const GRID_MARKET_ADDRESS_MIN_HITS = 2;

function countCommaStCodesInRows(rows: LocalDominatorRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const addr = r.address?.trim();
    if (!addr) continue;
    CITY_ST_IN_ADDRESS.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CITY_ST_IN_ADDRESS.exec(addr)) !== null) {
      const st = m[2]!;
      counts.set(st, (counts.get(st) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Rough country/region from centroid only (no hardcoded business locations).
 * Used when Address columns do not repeat a clear US/CA postal-style code.
 */
export function roughCountryLabelFromCentroid(lat: number, lon: number): string | null {
  if (lat >= 24.2 && lat <= 49.8 && lon >= -124.9 && lon <= -66.0) return "United States";
  if (lat >= 51.0 && lat <= 71.5 && lon >= -179.5 && lon <= -129.5) return "United States";
  if (lat >= 18.8 && lat <= 22.3 && lon >= -161.0 && lon <= -154.5) return "United States";
  if (lat >= 49.7 && lat <= 60.9 && lon >= -8.6 && lon <= 1.9) return "United Kingdom";
  if (lat >= -43.9 && lat <= -9.1 && lon >= 112.9 && lon <= 153.8) return "Australia";
  if (lat >= 41.5 && lat <= 83.0 && lon >= -141.0 && lon <= -52.0) {
    if (lat >= 52.0) return "Canada";
    if (lat >= 48.0 && lon >= -96.0 && lon <= -52.0) return "Canada";
    if (lat >= 50.5 && lon >= -141.0 && lon <= -114.0) return "Canada";
  }
  return null;
}

export type GridMarketInference = {
  primaryCountryLabel: string | null;
  howInferred: "address_codes" | "centroid" | "merged";
  dominantUsStateCodes: string[];
  dominantCaProvinceCodes: string[];
  /** Space-separated tokens for Wikipedia search bias (may be empty). */
  wikipediaSearchAugment: string;
  scopeConstraintLines: string[];
};

/**
 * Infer the real-world country/region for this grid from pin coordinates and
 * repeated City,ST-style codes in addresses (no fixed state/country baked in).
 */
export function inferGridMarketContext(
  rows: LocalDominatorRow[],
  fp: GridGeographicFootprint,
): GridMarketInference {
  const empty: GridMarketInference = {
    primaryCountryLabel: null,
    howInferred: "centroid",
    dominantUsStateCodes: [],
    dominantCaProvinceCodes: [],
    wikipediaSearchAugment: "",
    scopeConstraintLines: [],
  };
  if (fp.pointCount === 0) return empty;

  const codeCounts = countCommaStCodesInRows(rows);
  let usScore = 0;
  let caScore = 0;
  const usPairs: { code: string; n: number }[] = [];
  const caPairs: { code: string; n: number }[] = [];
  for (const [code, n] of codeCounts) {
    if (US_STATE_CODES.has(code)) {
      usScore += n;
      usPairs.push({ code, n });
    } else if (CA_PROVINCE_CODE_TO_NAME[code]) {
      caScore += n;
      caPairs.push({ code, n });
    }
  }
  usPairs.sort((a, b) => b.n - a.n || a.code.localeCompare(b.code));
  caPairs.sort((a, b) => b.n - a.n || a.code.localeCompare(b.code));

  const cent = roughCountryLabelFromCentroid(fp.centroidLat, fp.centroidLon);
  const usWins = usScore >= GRID_MARKET_ADDRESS_MIN_HITS && usScore >= caScore;
  const caWins = caScore >= GRID_MARKET_ADDRESS_MIN_HITS && caScore > usScore;

  let primary: string | null = null;
  let how: GridMarketInference["howInferred"] = "centroid";

  if (usWins) {
    primary = "United States";
    how = cent && cent !== "United States" ? "merged" : "address_codes";
  } else if (caWins) {
    primary = "Canada";
    how = cent && cent !== "Canada" ? "merged" : "address_codes";
  } else {
    primary = cent;
    how = cent ? "centroid" : "centroid";
  }

  const dominantUsStateCodes = usPairs.map((p) => p.code);
  const dominantCaProvinceCodes = caPairs.map((p) => p.code);

  let wikipediaSearchAugment = "";
  if (primary === "United States") {
    const topSt = usPairs[0]?.code;
    const name = topSt ? US_STATE_CODE_TO_NAME[topSt] : undefined;
    wikipediaSearchAugment = name ? `United States ${name}` : "United States";
  } else if (primary === "Canada") {
    const topP = caPairs[0]?.code;
    const name = topP ? CA_PROVINCE_CODE_TO_NAME[topP] : undefined;
    wikipediaSearchAugment = name ? `Canada ${name}` : "Canada";
  } else if (primary === "United Kingdom") {
    wikipediaSearchAugment = "United Kingdom";
  } else if (primary === "Australia") {
    wikipediaSearchAugment = "Australia";
  }

  const scopeConstraintLines: string[] = [];
  if (primary) {
    const basis =
      how === "address_codes" || how === "merged"
        ? "repeated City + region codes in Address columns (and scan centroid)"
        : "scan-pin centroid coordinates (and Address columns when present)";
    scopeConstraintLines.push(`Inferred market anchor: **${primary}** (${basis}).`);
    scopeConstraintLines.push(
      `Every SAP **entity** must name a real place in **this market** (same country/region as this grid). Do not invent homonymous places on other continents (e.g. for U.S. grids: do not output *Stuart, Queensland*, *Cardiff, Wales*, or UK/AU corridors unless that exact jurisdiction appears in the address samples below). Prefer names consistent with the bounding box and the nearby place list.`,
    );
  } else {
    scopeConstraintLines.push(
      `Could not infer a single country from this file alone - stay within the bounding box and prefer place names that appear verbatim in this export.`,
    );
  }

  return {
    primaryCountryLabel: primary,
    howInferred: how,
    dominantUsStateCodes,
    dominantCaProvinceCodes,
    wikipediaSearchAugment,
    scopeConstraintLines,
  };
}

/** Wikipedia search bias string derived from grid rows (centroid + addresses). */
export function wikipediaSearchAugmentFromGridRows(rows: LocalDominatorRow[]): string | undefined {
  const fp = computeGridGeographicFootprint(rows);
  if (fp.pointCount === 0) return undefined;
  const inf = inferGridMarketContext(rows, fp);
  const s = inf.wikipediaSearchAugment.trim();
  return s.length > 0 ? s : undefined;
}

function buildGeographicScopeMarkdown(rows: LocalDominatorRow[]): string {
  const fp = computeGridGeographicFootprint(rows);
  if (fp.pointCount === 0) return "";

  const hints = mergedPlaceHintsFromGridRows(rows);
  const market = inferGridMarketContext(rows, fp);
  const lines: string[] = [
    `## Geographic scope (from this file)`,
    `- Grid centroid (mean of scan pins): (${fp.centroidLat.toFixed(5)}, ${fp.centroidLon.toFixed(5)})`,
    `- Bounding box (lat × lon): ${fp.minLat.toFixed(5)} … ${fp.maxLat.toFixed(5)}, ${fp.minLon.toFixed(5)} … ${fp.maxLon.toFixed(5)}`,
    `- Furthest scan pin from centroid: **${fp.maxRadiusMilesFromCentroid.toFixed(1)} mi** (buffered planning radius **${fp.bufferedRadiusMiles.toFixed(1)} mi**).`,
    `- SAP \`entity\` values must name neighborhoods, cities, or service areas **within this footprint only** - plausible local service areas within **~${fp.bufferedRadiusMiles.toFixed(0)} mi** of the centroid. Do not suggest distant regions, national parks, scenic areas, or landmarks that do not appear in this export.`,
    `- Do not invent place names far outside the bounding box above.`,
  ];

  for (const line of market.scopeConstraintLines) {
    lines.push(`- ${line}`);
  }

  if (hints.length > 0) {
    lines.push(`- Nearby place names seen in this export (prefer these or subdivisions of them): ${hints.join("; ")}`);
  }

  lines.push("");
  return lines.join("\n");
}

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
