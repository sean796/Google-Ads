import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { dedupeRepeatedCommaPlaceSegments } from "@/lib/comma-place-label";

/** Row-count hint for observability only. SAP calls do not send max_tokens. */
export function sapJsonRowTokenFloor(targetSapCount: number): number {
  return 10_000 + Math.max(0, targetSapCount) * 1_400;
}

export function parseMarketLabelForFallback(market: string | null | undefined): { city: string; region: string } {
  const t = market?.trim();
  if (!t) return { city: "Local", region: "" };
  const parts = t.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { city: parts[0]!, region: parts[parts.length - 1]! };
  }
  return { city: t, region: "" };
}

/** Fallback province when market has no region segment - plain lookup, no regex (SAP deterministic path). */
const ALBERTA_CITIES = new Set([
  "edmonton",
  "calgary",
  "red deer",
  "lethbridge",
  "fort mcmurray",
  "medicine hat",
  "grande prairie",
]);
const BC_CITIES = new Set(["vancouver", "victoria", "kelowna", "surrey", "burnaby", "richmond"]);

export function inferFallbackRegionFromCityName(city: string): string {
  const c = city.trim().toLowerCase();
  if (ALBERTA_CITIES.has(c)) return "AB";
  if (BC_CITIES.has(c)) return "BC";
  return "US";
}

function stripPostalCodesFromText(s: string): string {
  return s
    .replace(/\b[A-Z]\d[A-Z] ?\d[A-Z]\d\b/gi, "")
    // Do not strip generic 5-digit runs - those are often street numbers (e.g. 16329), not US ZIP.
    .replace(/\s*,\s*,/g, ",")
    .replace(/,\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function segmentLooksLikeStreetAddress(segment: string): boolean {
  const t = segment.trim();
  if (!t) return false;
  if (/^\d+\s/.test(t)) return true;
  if (/\b(unit|suite|ste\.?|#)\s*\d+/i.test(t)) return true;
  if (/\d+\s+\d+\s+(ave|avenue|st\.?|street|rd|road|blvd|way|dr\.?|drive|ln\.?|lane)\b/i.test(t)) return true;
  if (/\d/.test(t) && /\b(nw|ne|sw|se)\b/i.test(t)) return true;
  return false;
}

/**
 * Collapse model output that pasted full street + postal into `entity`.
 * Keeps neighborhood (or similar) + city + region only - no unit numbers or postal codes.
 */
function canadaLikeMarketHint(hint: string): boolean {
  return /\bCanada\b|\.ca\b|\b(AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)\b/i.test(hint);
}

function provinceAbbrevFromMarketHint(marketHint: string | null | undefined): string | null {
  const h = marketHint ?? "";
  const m = h.match(/\b(AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)\b/i);
  if (m?.[1]) return m[1]!.toUpperCase();
  const full = h.match(
    /\b(alberta|british columbia|manitoba|new brunswick|newfoundland|nova scotia|northwest territories|nunavut|ontario|prince edward island|quebec|saskatchewan|yukon)\b/i,
  );
  if (!full?.[1]) return null;
  const map: Record<string, string> = {
    alberta: "AB",
    "british columbia": "BC",
    manitoba: "MB",
    "new brunswick": "NB",
    newfoundland: "NL",
    "nova scotia": "NS",
    "northwest territories": "NT",
    nunavut: "NU",
    ontario: "ON",
    "prince edward island": "PE",
    quebec: "QC",
    saskatchewan: "SK",
    yukon: "YT",
  };
  return map[full[1]!.toLowerCase()] ?? null;
}

const US_STATE_NAME_TO_ABBR: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};

function abbreviateRegionSegment(segment: string): string {
  const t = segment.trim();
  if (!t) return t;
  if (/^[A-Z]{2}$/i.test(t)) return t.toUpperCase();
  const lower = t.toLowerCase();
  const us = US_STATE_NAME_TO_ABBR[lower];
  if (us) return us;
  const prov = provinceAbbrevFromMarketHint(t);
  if (prov) return prov;
  return t;
}

export function sanitizeSapEntityForExport(entity: string, marketHint?: string | null): string {
  const { city } = parseMarketLabelForFallback(marketHint);
  const s = stripPostalCodesFromText(entity).normalize("NFKC");
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return dedupeRepeatedCommaPlaceSegments(stripPostalCodesFromText(entity));
  const out = [...parts];
  const citySafe = city && city !== "Local" ? city : null;

  if (out.length >= 2 && segmentLooksLikeStreetAddress(out[1]!) && citySafe) {
    out[1] = citySafe;
  }
  if (out.length >= 1 && segmentLooksLikeStreetAddress(out[0]!) && out.length >= 2 && !segmentLooksLikeStreetAddress(out[1]!)) {
    out.shift();
  }
  for (let i = 0; i < out.length; i++) {
    out[i] = stripPostalCodesFromText(out[i]!);
  }

  if (out.length >= 2) {
    out[out.length - 1] = abbreviateRegionSegment(out[out.length - 1]!);
  }

  if (out.length >= 3) {
    const last = out[out.length - 1]!.trim();
    const lastToken = last.split(/\s+/)[0] ?? last;
    if (
      (lastToken === "US" || lastToken === "United" || last.toUpperCase().startsWith("UNITED STATES")) &&
      canadaLikeMarketHint(marketHint ?? "")
    ) {
      const prov = provinceAbbrevFromMarketHint(marketHint);
      out[out.length - 1] = prov ?? "AB";
    }
  }

  const joined = out.join(", ");
  return dedupeRepeatedCommaPlaceSegments(stripPostalCodesFromText(joined));
}

const GEO_STRIP_STOPWORDS = new Set([
  "in",
  "on",
  "at",
  "to",
  "of",
  "and",
  "or",
  "the",
  "a",
  "an",
  "for",
  "near",
]);

/**
 * Province/state (and similar) tokens stripped from SAP `keyword` even when the model never repeats them in `entity`
 * (e.g. "MURB solar Alberta ROI" with entity "Acheson, Edmonton, AB").
 */
function escapeRegexForSapKeywordToken(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Civic-style "127 Street" phrases in the keyword column - removed even when absent from `entity`. */
const NUMERIC_STREET_IN_SAP_KEYWORD =
  /\b\d+\s+(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|ct|court|way)\b/gi;

function stripNumericStreetPhrasesFromSapKeyword(keyword: string): string {
  return keyword.replace(NUMERIC_STREET_IN_SAP_KEYWORD, " ").replace(/\s+/g, " ").trim();
}

/** Fixed phrase → abbreviation for keyword column only (same spirit as slug abbreviations; no invented acronyms). */
const SAP_KEYWORD_PROGRAM_PHRASE_TO_ABBR: Array<{ pattern: RegExp; abbr: string }> = [
  { pattern: /\bclean\s+energy\s+improvement\s+program\b/gi, abbr: "CEIP" },
];

function applyKnownProgramAbbreviationsToSapKeyword(keyword: string): string {
  let s = keyword;
  for (const { pattern, abbr } of SAP_KEYWORD_PROGRAM_PHRASE_TO_ABBR) {
    s = s.replace(pattern, abbr);
  }
  return s.replace(/\s+/g, " ").trim();
}

const SAP_KEYWORD_EXTRA_GEO_TOKENS = new Set<string>([
  "alberta",
  "saskatchewan",
  "manitoba",
  "ontario",
  "quebec",
  "yukon",
  "nunavut",
  "newfoundland",
  "labrador",
  "california",
  "texas",
  "florida",
  "nevada",
  "arizona",
  "colorado",
  "ohio",
  "michigan",
  "illinois",
  "pennsylvania",
  "tennessee",
  "maryland",
  "louisiana",
  "connecticut",
  "arkansas",
  "mississippi",
  "minnesota",
  "wisconsin",
  "kentucky",
  "alabama",
  "alaska",
  "hawaii",
  "vermont",
  "delaware",
  "montana",
  "wyoming",
  "nebraska",
  "kansas",
  "iowa",
  "idaho",
  "oklahoma",
  "missouri",
  "oregon",
  "utah",
]);

/**
 * Removes geography tokens from a SAP `keyword`: any word that appears in `entityAfter` plus city/region
 * from the optional market label. Used after model output so the keyword column stays short-tail and
 * geography-free even when the model leaks place names.
 */
export function stripGeographyTokensFromSapKeyword(
  keyword: string,
  entityAfter: string,
  entityLocation?: string | null,
): string {
  const workingKeyword = stripNumericStreetPhrasesFromSapKeyword(keyword.trim());
  const entityNorm = entityAfter.replace(/,/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

  const banned = new Set<string>();
  const addToken = (w: string) => {
    const t = w.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "").toLowerCase();
    if (t.length < 2 || GEO_STRIP_STOPWORDS.has(t)) return;
    banned.add(t);
  };
  const tokenize = (s: string) =>
    s
      .split(/[\s,]+/)
      .map((x) => x.trim())
      .filter(Boolean);

  for (const seg of entityAfter.split(",")) {
    for (const w of tokenize(seg)) addToken(w);
  }
  const { city, region } = parseMarketLabelForFallback(entityLocation);
  if (city && city !== "Local") {
    for (const w of tokenize(city)) addToken(w);
  }
  if (region) {
    for (const w of tokenize(region)) addToken(w);
  }
  const prov = provinceAbbrevFromMarketHint(entityLocation ?? "");
  if (prov) addToken(prov);
  for (const g of SAP_KEYWORD_EXTRA_GEO_TOKENS) banned.add(g);

  const kwLower = workingKeyword.toLowerCase();
  const words = workingKeyword.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const w of words) {
    const wl = w.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "").toLowerCase();
    if (!wl) continue;
    if (wl === "central" && /\bcentral\s+(air|heating|vac(?:uum)?)\b/i.test(kwLower)) {
      out.push(w);
      continue;
    }
    if (banned.has(wl)) continue;
    out.push(w);
  }

  const out2: string[] = [];
  for (const w of out) {
    const wl = w.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "").toLowerCase();
    if (!wl) continue;
    if (wl === "central" && /\bcentral\s+(air|heating|vac(?:uum)?)\b/i.test(kwLower)) {
      out2.push(w);
      continue;
    }
    if (new RegExp(`\\b${escapeRegexForSapKeywordToken(wl)}\\b`, "i").test(entityNorm)) continue;
    out2.push(w);
  }

  let joined = out2.join(" ").replace(/\s+/g, " ").trim();
  joined = applyKnownProgramAbbreviationsToSapKeyword(joined);
  return joined.replace(/\s+/g, " ").trim();
}

/**
 * Keyword text after the research model (main + refine passes): trim, collapse whitespace, remove civic-style
 * street-number phrases, apply known program abbreviations. **No geography / entity-token stripping** — the model output is kept.
 */
export function normalizeSapKeywordFromModelOutput(keyword: string): string {
  const cleaned = stripNumericStreetPhrasesFromSapKeyword(keyword.trim());
  return applyKnownProgramAbbreviationsToSapKeyword(cleaned).replace(/\s+/g, " ").trim();
}

/**
 * SAP `keyword` exactly as the model authored it in JSON: **no** server-side trim, whitespace
 * collapse, geography stripping, or rewrites — pass through the string from the parse step.
 */
export function sapKeywordFromModelPhrase(
  phrase: string,
  _entityAfter?: string,
  _entityLocation?: string | null,
): string {
  return String(phrase ?? "");
}

function normalizeForSapKeywordEntityKey(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function sapKeywordEntityPairKey(keyword: string, entity: string): string {
  return `${normalizeForSapKeywordEntityKey(keyword)}\0${normalizeForSapKeywordEntityKey(entity)}`;
}

/** Enforces unique `(keyword, entity)` pairs (same keyword + different entity is allowed, e.g. single-seed mode). */
export function assertDistinctSapKeywordEntityPairs(rows: CSVRow[], context: string): void {
  const seen = new Map<string, number>();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const k = sapKeywordEntityPairKey(row.keyword, row.entity);
    if (seen.has(k)) {
      const first = seen.get(k)! + 1;
      throw new Error(
        `${context}: duplicate keyword+entity (rows ${first} and ${i + 1}) - each row must be a unique pair.`,
      );
    }
    seen.set(k, i);
  }
}

