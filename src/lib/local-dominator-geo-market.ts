import {
  CITY_ST_IN_ADDRESS,
  mergedPlaceHintsFromGridRows,
  type LocalDominatorRow,
} from "./local-dominator-place-hints";

/** Extra margin on max distance from centroid so edge grid pins stay “in scope” for the model. */
const GEO_SCOPE_RADIUS_BUFFER = 1.125;

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

export function buildGeographicScopeMarkdown(rows: LocalDominatorRow[]): string {
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
