import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { TITLE_KEYWORD_WEAVING_RULE, TITLE_CASE_RULE, TITLE_WELL_KNOWN_ACRONYMS_RULE } from "@/lib/prompt-builders/title-rules";
import type { EntityGeographicLevel } from "@/lib/entity-geographic-level";
import {
  buildSapEntityFieldRulesGridBroad,
  buildSapEntityFieldRulesManualBroad,
  buildSapEntityFooterGridBroad,
  buildSapEntityFooterManualBroad,
  clusterAnchorDistinctEntityClause,
  resolveEntityGeographicLevel,
  singleSeedEntityDifferentiationClause,
  targetsBlockMultiRowNote,
  targetsBlockOptionalEntityOutputPhrase,
} from "@/lib/entity-geographic-level";
import { formatStrategyMarkdownAsBullets } from "@/lib/strategy-markdown-bullets";
import { extractJsonObjectFromModelText } from "@/lib/gsc-manual-ai-aggregate";
import { fetchWikipediaClustersForSapEntityHints } from "@/lib/wikipedia-api";
import { harvestWikiPoolTitlesFromGridRows } from "@/lib/wikipedia/wiki-entity-pool";
import type { LocalDominatorRow } from "@/lib/local-dominator-csv";
import { dedupeRepeatedCommaPlaceSegments } from "@/lib/comma-place-label";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";
import { resolveModelForAgentCategory } from "@/lib/openrouter-agent-category-api";
import {
  appendMasterInstructionsToSystemPrompt,
  buildSapMasterRulesKeywordMixRecap,
  buildSapMasterRulesWorkflowPrefix,
  ensureMasterInstructionsInMemory,
  hasMasterInstructions,
} from "@/lib/master-instructions-storage";

export type { EntityGeographicLevel } from "@/lib/entity-geographic-level";

/** Row-count hint for observability only. SAP calls do not send max_tokens. */
export function sapJsonRowTokenFloor(targetSapCount: number): number {
  return 10_000 + Math.max(0, targetSapCount) * 1_400;
}

function parseMarketLabelForFallback(market: string | null | undefined): { city: string; region: string } {
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

function inferFallbackRegionFromCityName(city: string): string {
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

function expandKeywordTargetsToRowSeeds(targets: LocalKeywordTarget[]): string[] {
  const out: string[] = [];
  for (const t of targets) {
    for (let j = 0; j < t.sapPages; j++) {
      out.push(t.keyword);
    }
  }
  return out;
}

function resolveSourcePhraseForSapKeywordColumn(args: {
  rowIndex: number;
  modelKeyword: string;
  laSingleSeedSap: boolean;
  proposalKeywordMode: boolean;
  keywordTargets: LocalKeywordTarget[];
  rowSeeds: string[];
}): string {
  const { rowIndex, modelKeyword, laSingleSeedSap, proposalKeywordMode, keywordTargets, rowSeeds } = args;
  if (proposalKeywordMode) {
    return rowSeeds[rowIndex] ?? modelKeyword;
  }
  if (laSingleSeedSap && keywordTargets[0] && modelKeyword.length === 0) {
    return keywordTargets[0].keyword;
  }
  return modelKeyword;
}

/** Same-intent variations for multi-row clusters (deterministic builder tests / tooling). */
function deterministicKeywordVariantForClusterRow(baseKeyword: string, rowInCluster: number): string {
  const b = baseKeyword.trim();
  const pool = [
    b,
    `${b} rental`,
    `${b} service`,
    `${b} tents`,
    `premium ${b}`,
    `residential ${b}`,
    `commercial ${b}`,
    `${b} events`,
  ];
  return pool[rowInCluster % pool.length]!;
}

const SAP_DETERMINISTIC_AREA_SEGMENTS = [
  "Central Corridor",
  "North District",
  "South District",
  "East Side",
  "West Side",
  "Metro Core",
  "Parkside Area",
  "Downtown Corridor",
  "Waterfront District",
  "Riverside",
  "Uptown Corridor",
  "Suburban Hub",
  "Highway Corridor",
  "Mall District",
  "University Area",
  "Industrial Corridor",
  "Medical District",
  "Airport Corridor",
  "Lakeside Area",
  "Hill District",
  "Gateway District",
  "Midtown Corridor",
  "Retail Corridor",
  "Civic Corridor",
  "Greenway Area",
  "Cultural District",
] as const;

/**
 * Deterministic SAP rows for tests and offline tooling - **not** used when the research model fails.
 * Titles include the exact keyword substring; entities use comma-separated hyperlocal + city (+ optional region).
 */
export function buildDeterministicSapRowsFromKeywordTargets(args: {
  keywordTargets: LocalKeywordTarget[];
  targetTotal: number;
  entityLocation?: string | null;
}): CSVRow[] {
  const { city, region } = parseMarketLabelForFallback(args.entityLocation);
  const regionSeg = region || (city === "Local" ? "US" : inferFallbackRegionFromCityName(city));
  const rows: CSVRow[] = [];
  let idx = 0;
  for (const t of args.keywordTargets) {
    for (let r = 0; r < t.sapPages; r++) {
      const kw =
        t.sapPages > 1
          ? deterministicKeywordVariantForClusterRow(t.keyword, r)
          : t.keyword.trim();
      const seg = SAP_DETERMINISTIC_AREA_SEGMENTS[idx % SAP_DETERMINISTIC_AREA_SEGMENTS.length];
      const entity = `${seg}, ${city}, ${regionSeg}`;
      const stripped = stripGeographyTokensFromSapKeyword(kw, entity, args.entityLocation);
      const kwOut = stripped.trim() ? stripped : kw.trim();
      if (!kwOut.trim()) {
        throw new Error(
          `Deterministic SAP: keyword empty after geography strip (seed "${kw.slice(0, 120)}", entity "${entity}").`,
        );
      }
      const title = "";
      rows.push({ keyword: kwOut, entity, title, modifier: "", featuredImage: "google-maps" });
      idx++;
    }
  }
  while (rows.length > args.targetTotal) rows.pop();
  const last = args.keywordTargets[args.keywordTargets.length - 1] ?? args.keywordTargets[0];
  while (rows.length < args.targetTotal && last) {
    const seg = SAP_DETERMINISTIC_AREA_SEGMENTS[rows.length % SAP_DETERMINISTIC_AREA_SEGMENTS.length];
    const fillR = rows.length;
    const kw =
      last.sapPages > 1
        ? deterministicKeywordVariantForClusterRow(last.keyword, fillR)
        : last.keyword.trim();
    const entityFill = `${seg}, ${city}, ${regionSeg}`;
    const strippedFill = stripGeographyTokensFromSapKeyword(kw, entityFill, args.entityLocation);
    const kwOut = strippedFill.trim() ? strippedFill : kw.trim();
    if (!kwOut.trim()) {
      throw new Error(
        `Deterministic SAP: keyword empty after geography strip (seed "${kw.slice(0, 120)}", entity "${entityFill}").`,
      );
    }
    rows.push({
      keyword: kwOut,
      entity: entityFill,
      title: "",
      modifier: "",
      featuredImage: "google-maps",
    });
  }
  const sliced = rows.slice(0, args.targetTotal);
  assertDistinctSapKeywordEntityPairs(sliced, "buildDeterministicSapRowsFromKeywordTargets");
  return sliced;
}

function dedupeQuestionsCaseInsensitive(questions: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of questions) {
    const t = q?.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/** Normalize model `questionsByKeyword` to target keywords only; values deduped, keys canonical from targets. */
function normalizeQuestionsByKeyword(
  raw: unknown,
  keywordTargets: LocalKeywordTarget[]
): Record<string, string[]> {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const out: Record<string, string[]> = {};
  for (const t of keywordTargets) {
    const kw = t.keyword;
    let arr: unknown = obj[kw];
    if (arr === undefined) {
      const found = Object.keys(obj).find((k) => k.toLowerCase() === kw.toLowerCase());
      if (found) arr = obj[found];
    }
    if (!Array.isArray(arr)) continue;
    const qs = dedupeQuestionsCaseInsensitive(arr.map((x) => String(x)));
    if (qs.length) out[kw] = qs;
  }
  return out;
}

function attachKeywordQuestionsToRows(
  rows: CSVRow[],
  questionsByKeyword: Record<string, string[]>,
  keywordTargets?: LocalKeywordTarget[]
): CSVRow[] {
  if (Object.keys(questionsByKeyword).length === 0) return rows;
  if (!keywordTargets?.length) {
    return rows.map((row) => {
      const qs = questionsByKeyword[row.keyword];
      if (!qs?.length) return row;
      return { ...row, keyword_questions_json: JSON.stringify(qs) };
    });
  }
  let ti = 0;
  let slotInCluster = 0;
  return rows.map((row) => {
    const t = keywordTargets[ti];
    const clusterKey = t?.keyword ?? row.keyword;
    const qs = questionsByKeyword[clusterKey] ?? questionsByKeyword[row.keyword];
    if (t && t.sapPages > 0) {
      slotInCluster++;
      if (slotInCluster >= t.sapPages) {
        slotInCluster = 0;
        ti++;
      }
    }
    if (!qs?.length) return row;
    return { ...row, keyword_questions_json: JSON.stringify(qs) };
  });
}

function normalizeRow(raw: Record<string, unknown>, _index: number): CSVRow | null {
  const keyword = String(raw.keyword ?? raw.Keyword ?? "");
  const entity = String(raw.entity ?? raw.Entity ?? "").trim();
  const modifier = String(raw.modifier ?? raw.Modifier ?? "").trim();
  const featuredImage = String(raw.featuredImage ?? raw.featured_image ?? "google-maps").trim() || "google-maps";

  if (keyword.length === 0 || !entity) {
    return null;
  }

  return {
    keyword,
    entity,
    title: "",
    modifier: modifier || undefined,
    featuredImage,
  };
}

/** User-defined targets: each keyword gets exactly `sapPages` SAP rows in the output. */
export interface LocalKeywordTarget {
  keyword: string;
  sapPages: number;
  /** When set, biases geographic naming for that keyword’s rows (still must obey grid scope). */
  entityHint?: string;
}

export interface LocalSeoStrategyFromGridParams {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  signal?: AbortSignal;
  /** Sum of keywordTargets[].sapPages - total length of sapRows. */
  targetSapCount: number;
  /** Non-empty keyword targets with per-keyword SAP counts (user-provided only). */
  keywordTargets: LocalKeywordTarget[];
  gridSummaryMarkdown: string;
  /** When true, no grid CSV was uploaded; prompts use manual targets, hints, and market only (no rank evidence). */
  manualTargetsOnly?: boolean;
  siteName: string;
  siteUrl?: string;
  /** Optional market/city/metro label - guides SAP `entity` naming when set; still must match grid scope. */
  entityLocation?: string;
  /** Used for Wikipedia entity→article resolution (per-site research model). */
  siteId?: string;
  /** From grid CSV (coordinates + addresses); biases Wikipedia search toward the scan’s country/region. */
  wikipediaSearchAugment?: string;
  /**
   * Appended to the user message in manual mode only - e.g. organic competitor markdown from Local Strategy.
   * Does not switch to the Dominator grid system prompt (avoids centroid/bbox requirements we do not have).
   */
  supplementalUserEvidenceMarkdown?: string;
  /**
   * Proposal flow: SAP row intent is anchored on the competitor report Content Opportunity Matrix.
   * The exported **keyword** column follows the model per prompt; the server only collapses internal whitespace (no geography or token stripping).
   */
  proposalKeywordMode?: boolean;
  /**
   * Proposal entity SAP from grid CSV: grid markdown is passed verbatim; validate presence by string length, not `.trim()`.
   */
  proposalGridSap?: boolean;
  /**
   * Second OpenRouter pass: rewrite each SAP row's `keyword` only (same user message + draft JSON).
   * Skipped when `proposalKeywordMode` is true. Titles stay empty until the Gemini title agent runs.
   */
  refineSapRowKeywordsWithRag?: boolean;
  /**
   * Local analysis with a **single** keyword target: SAP rows reuse the **same** `keyword` on every row and vary only `entity`
   * (distinct neighbourhood-scale areas around the main market). Skips the refine pass that would diversify keywords per row.
   */
  localAnalysisSingleSeed?: boolean;
  /** When not `city`, SAP entity rules use national or provincial scale (Local analysis panel). Defaults to `city`. */
  entityGeographicLevel?: EntityGeographicLevel;
  /** Optional subset of taxonomy labels to prioritize in prompts. */
  entityTypeFocus?: string[];
  /**
   * Published WordPress posts (title + focus keyword). When non-empty, prompts require SAP
   * `keyword` phrases to be grounded in this vocabulary (Local analysis passes inventory from the client).
   */
  wordpressPostInventory?: ReadonlyArray<{ title: string; keyword: string }>;
  /**
   * Short markdown: business name, site, focus, GMB/inventory skim — steers **which** places to prioritize.
   */
  clientAudienceContextMarkdown?: string;
  /** Granular Wikipedia pool titles for the session — pool-first entity→article resolution. */
  wikipediaPreferredTitles?: string[];
  /** When set without `wikipediaPreferredTitles`, tiered Wikipedia harvest fills the entity pool. */
  gridParsedRows?: LocalDominatorRow[];
  gridPlaceHints?: string[];
  /** Grid place weakness weights (same shape as suggest) — order preferred titles before lookup. */
  gridPlaceWeightsForWiki?: ReadonlyArray<{ place: string; weight: number }>;
  /** Progress while resolving Wikipedia intros before the SAP JSON call. */
  onWikiProgress?: (done: number, total: number) => void;
  /** Fires immediately before the single SAP JSON OpenRouter completion. */
  onSapGenerateStart?: () => void;
}

function emptyLocalSeoStrategyResult(): {
  strategyMarkdown: string;
  keywordStrategyMarkdown: string;
  questionsByKeyword: Record<string, string[]>;
  sapRows: CSVRow[];
} {
  return {
    strategyMarkdown: "-",
    keywordStrategyMarkdown: "",
    questionsByKeyword: {},
    sapRows: [],
  };
}

/**
 * Calls the research model with Local Dominator grid summary; returns strategy + filled bulk rows.
 * The model must not output a page-count field - strategyMarkdown, keywordStrategyMarkdown, questionsByKeyword, sapRows.
 */
export async function fetchLocalSeoStrategyFromGrid(
  params: LocalSeoStrategyFromGridParams
): Promise<{
  strategyMarkdown: string;
  keywordStrategyMarkdown: string;
  questionsByKeyword: Record<string, string[]>;
  sapRows: CSVRow[];
}> {
  const {
    apiKey,
    model,
    temperature,
    maxTokens,
    topP,
    signal,
    targetSapCount,
    keywordTargets,
    gridSummaryMarkdown,
    siteName,
    siteUrl,
    entityLocation,
    siteId,
    wikipediaSearchAugment,
    manualTargetsOnly = false,
    supplementalUserEvidenceMarkdown,
    proposalKeywordMode = false,
    proposalGridSap = false,
    refineSapRowKeywordsWithRag = false,
    localAnalysisSingleSeed: localAnalysisSingleSeedParam = false,
    entityGeographicLevel: entityGeographicLevelParam,
    entityTypeFocus: entityTypeFocusParam,
    wordpressPostInventory,
    clientAudienceContextMarkdown,
    wikipediaPreferredTitles,
    gridParsedRows,
    gridPlaceHints,
    gridPlaceWeightsForWiki,
    onWikiProgress,
    onSapGenerateStart,
  } = params;
  const localAnalysisSingleSeed = localAnalysisSingleSeedParam === true;

  const wpPosts =
    wordpressPostInventory?.filter((r) => r && (String(r.title ?? "").trim() || String(r.keyword ?? "").trim())) ??
    [];
  const hasWpInventoryForPrompt = wpPosts.length > 0;
  const wpInventoryPayload = hasWpInventoryForPrompt
    ? wpPosts.slice(0, 120).map((p) => ({
        title: String(p.title ?? "").trim(),
        keyword: String(p.keyword ?? "").trim(),
      }))
    : [];
  const inventorySystemBlock = hasWpInventoryForPrompt
    ? `\n**WordPress post inventory (JSON in the user message):** Every SAP \`keyword\` must be **2–4 words**, geography-free, and built **only** from words or short multi-word snippets that appear in \`postInventoryRows\` (\`title\` and \`keyword\` fields). You may recombine tokens across rows; stay in **one industry**. **Do not** invent transactional patterns: **no** leading \`buy \`, trailing \` online\`, generic \`… near me\`, standalone \`cost\`, \`installation\`, \`packages\`, or \`financing\` **unless that exact substring appears** in an inventory string.\n`
    : "";
  const wpInventoryUserBlock = hasWpInventoryForPrompt
    ? `\n\n--- WordPress post inventory (postInventoryRows — **mandatory SAP keyword vocabulary**) ---
Each \`sapRows[].keyword\` must be **2–4 words**, geography-free, and traceable to the **title** / **keyword** strings below (reuse, split, or merge phrases — **not** unrelated SEO templates).

${JSON.stringify(wpInventoryPayload, null, 2)}
`
    : "";

  const manual = manualTargetsOnly === true;
  const laSingleSeedSap = localAnalysisSingleSeed === true && proposalKeywordMode !== true;

  let effectiveWikiPreferredTitles = (wikipediaPreferredTitles ?? [])
    .map((t) => t.trim())
    .filter(Boolean);
  if (
    effectiveWikiPreferredTitles.length === 0 &&
    gridParsedRows?.length &&
    !manual
  ) {
    effectiveWikiPreferredTitles = await harvestWikiPoolTitlesFromGridRows({
      rows: gridParsedRows,
      gridPlaceHints: gridPlaceHints ?? [],
      minCount: targetSapCount,
      wikipediaSearchAugment: wikipediaSearchAugment,
    });
  }

  const wikiPoolEntityBlock =
    effectiveWikiPreferredTitles.length > 0 && !manual
      ? `\n--- Wikipedia entity pool (read full list — pick allowed physical places only) ---
Each SAP row \`entity\` must come from **one title on this harvested list**. Read every line. **Allowed:** neighbourhoods, districts, communities, suburbs, streets, parks, buildings, malls, civic venues, landmarks. **Never use:** murders, crimes, deaths, trials, disasters, biographies, sports teams, companies, newspapers, films, or "List of …" pages — skip those even if listed. Format as **Place, City, Province/State** when needed. **Never** invent a name not on this list.

${effectiveWikiPreferredTitles
  .slice(0, 80)
  .map((t, i) => `${i + 1}. ${t}`)
  .join("\n")}

`
      : "";
  const rowSeeds = expandKeywordTargetsToRowSeeds(keywordTargets);
  const egLevel = resolveEntityGeographicLevel(entityGeographicLevelParam);
  const entityTypeFocus = (entityTypeFocusParam ?? []).filter(
    (s) => typeof s === "string" && s.trim().length > 0,
  );
  const useCityEntityRules = egLevel === "city";

  const proposalMatrixSapKeywordSupplement =
    proposalKeywordMode === true
      ? `
- **Proposal matrix - geography never in \`keyword\`:** Matrix lines may include city or region words for context. **Never** put those tokens in \`keyword\`. Output **short-tail** (**2–4 words**) **service-only** intent: remove every neighbourhood, city, province, region, and landmark token from the matrix line. Use \`entity\` and \`title\` for local wording; \`keyword\` stays geography-free.
- **Proposal matrix - offer-only phrasing:** If a matrix line leans on **reviews**, **case studies**, **testimonials**, or similar, strip those tokens when forming \`keyword\` and \`title\` — keep the **core product/service** the business sells or does (see **SAP product/service focus**).`
      : "";

  const sapTitleOmitBlock = `**SAP "title" field:** Set \`title\` to \`""\` on every row. Page titles are written later by a dedicated Gemini title agent — do not author titles in this response.`;

  if (!apiKey?.trim()) {
    return emptyLocalSeoStrategyResult();
  }
  if (!manual) {
    const g = gridSummaryMarkdown ?? "";
    if (proposalGridSap) {
      if (g.length === 0) {
        return emptyLocalSeoStrategyResult();
      }
    } else if (!g.trim()) {
      return emptyLocalSeoStrategyResult();
    }
  }

  await ensureMasterInstructionsInMemory(siteId ?? null);
  const sapMasterPrefix = buildSapMasterRulesWorkflowPrefix(siteId ?? null);

  const targetsBlock = keywordTargets
    .map((t, i) => {
      const hint = t.entityHint?.trim();
      const multiRowNote = t.sapPages > 1 ? targetsBlockMultiRowNote(egLevel, manual) : "";
      const hintScope = manual
        ? `(anchor within the user's stated geography / hints): "${hint}"`
        : `(anchor within grid bounds): "${hint}"`;
      const outputPhrase = targetsBlockOptionalEntityOutputPhrase(egLevel);

      if (proposalKeywordMode === true) {
        const base = `${i + 1}. Target (Content Opportunity Matrix line): "${t.keyword}": produce exactly ${t.sapPages} SAP row(s). **SAP \`keyword\`** must be **short-tail and geography-free** (2–4 words of service intent) - strip every city, neighbourhood, province, and region token from the matrix line; **never** paste place names into \`keyword\`.`;
        if (!hint) return base;
        return `${base}
   Optional user entity focus for these rows ${hintScope}. ${outputPhrase}${multiRowNote}`;
      }

      if (laSingleSeedSap && t.sapPages > 1) {
        const base = `${i + 1}. **Single seed target (Local analysis):** "${t.keyword}". Produce exactly ${t.sapPages} SAP rows. **Every row must use the same short-tail geography-free \`keyword\`** (strip all place tokens from the seed - no location words). **Differentiate rows only** with ${singleSeedEntityDifferentiationClause(egLevel)} **Never repeat the same \`entity\` on two rows** - each row needs a **unique** (\`keyword\`, \`entity\`) pair (same keyword is OK only because every \`entity\` differs).`;
        if (!hint) return base;
        return `${base}
   Optional user entity focus for these rows ${hintScope}. ${outputPhrase}${multiRowNote}`;
      }

      if (t.sapPages <= 1) {
        const base = `${i + 1}. Target keyword: "${t.keyword}": produce exactly 1 SAP row. **SAP \`keyword\`** must be **short-tail and geography-free** (strip city, neighbourhood, province, and region tokens from the target; service intent only).`;
        if (!hint) return base;
        return `${base}
   Optional user entity focus for this row ${hintScope}. ${outputPhrase}`;
      }

      const base = `${i + 1}. **Cluster anchor (seed keyword):** "${t.keyword}". Produce exactly ${t.sapPages} SAP rows. **Each row must use a different \`keyword\` string** - same **product/service-offer** intent as the anchor, grounded in **grid keyword themes**, **seed** phrases, and **postInventoryRows** when provided — vary with distinct equipment, audience, or package angles that match real offers (no generic transactional crutches like buy/online/cost/reviews/financing/packages unless those exact words appear in inventory or grid evidence). **Do not** use review, testimonial, case-study, or "best of" comparison angles as \`keyword\` variants (see **SAP product/service focus** in the system prompt). **Do not** repeat the same keyword text on multiple rows in this cluster. **Do not** vary \`keyword\` by appending city or neighbourhood tokens - vary \`entity\` for geography (see **SAP "keyword" field** in the system prompt). **Across the full \`sapRows\` array, no two objects may share the same (\`keyword\`, \`entity\`) pair.** ${clusterAnchorDistinctEntityClause(egLevel)}`;
      if (!hint) return base;
      return `${base}
   Optional user entity focus for these rows ${hintScope}. ${outputPhrase}${multiRowNote}`;
    })
    .join("\n\n");

  const gridEntitySection = useCityEntityRules
    ? `**SAP "entity" field (mandatory):** \`entity\` is **only** a structured place label (for UI and exports). **No filler words, no prose, no prefixes.**
- **Shape:** **Two or three** comma-separated segments: (1) **hyperlocal proper name** - neighbourhood, district, named community, park, landmark, mall, civic building or complex, campus, waterfront; (2) **city** only; (3) **province/state** optional when multi-region or export clarity needs it - **not** optional as an excuse to output \`City, Province\` without segment (1). **Never** two-part \`City, Province\` (or \`City, ST\`) **without** a distinct first segment when the grid supports finer places. Street/avenue/corridor as place (no civic numbers) is a **last resort** only when no neighbourhood, district, or landmark fits.
- **First segment = proper name only:** It must **begin** with the geographic **name** (e.g. \`Millwood\`, \`Memorial Park\`, \`Arts District\`, \`Altona Community Centre\`). **Forbidden at the start of \`entity\`:** \`Near \`, \`Around \`, \`Close to \`, \`By \`, \`At \`, \`In \`, \`In the \`, or any similar conversational prefix. **Wrong:** \`Near Confederation Park, Calgary, AB\`. **Right:** \`Confederation Park, Calgary, AB\`.
- **Where to use "near":** Words like "near" or "in" belong in \`title\` (headline) if useful for SEO, **not** in \`entity\`.
- **Good examples (diverse types):** \`Millwood, Altona, MB\`; \`The Annex, Toronto, ON\`; \`Altona Community Centre, Altona, MB\`; \`River Valley Park, Edmonton, AB\`. **Priority order for the first segment:** (1) **Neighbourhood, district, or named community** from the grid's "Nearby place names" / district labels when available; (2) parks, landmarks, malls, campuses; (3) **main-street / corridor** as place **without** a street number **only** when (1) and (2) are unavailable. **Do not** pick a street-by-default when the grid names a neighbourhood or district for that area.
- **Grid cluster - use named areas from the scan (mandatory):** The grid markdown includes **Nearby place names**, POIs, corridors, and neighbourhood/district labels. **Each** SAP row must use a **distinct** first-segment **hyperlocal** name taken from that evidence (or from sample weak points / pins **inside** the footprint). **Do not** output lazy \`City, Province\` or \`City, ST\` as the **whole** \`entity\` (e.g. \`Edmonton, Alberta\`, \`Edmonton, AB\`) **when** the cluster lists **any** specific sub-city areas for that market. **Do not** reuse the **same** \`entity\` string on two rows. **Do not** use the **city name alone** as the first segment - the first segment must be a **different** proper place than the city token in segment (2).
- **Forbidden in \`entity\` (any segment):** street numbers, unit/suite lines (\`Unit 3\`, \`#200\`), full street addresses (\`16329 130 Ave NW\`), or postal codes (\`T5V 1K5\`). Part (2) must be the **city name only** (e.g. \`Edmonton\`) - never paste a full mailing address from GBP or grid pins into \`entity\`. Named corridors and **street-as-place** names are OK without civic numbers only as a last resort.`
    : buildSapEntityFieldRulesGridBroad(egLevel, entityTypeFocus);

  const manualEntitySection = useCityEntityRules
    ? `**SAP "entity" field (mandatory):** \`entity\` is **only** a structured place label (for UI and exports). **No filler words, no prose, no prefixes.**
- **Shape:** **Two or three** comma-separated segments: (1) **hyperlocal proper name** - neighbourhood, district, named community, park, landmark, mall, civic building or complex, campus, waterfront; (2) **city** only; (3) **province/state** optional when multi-region or export clarity needs it - **not** optional as an excuse to output \`City, Province\` without segment (1). **Never** two-part \`City, Province\` without a distinct first segment when hints and market allow finer places. Street/avenue/corridor as place is a **last resort**.
- **First segment = proper name only:** It must **begin** with the geographic **name** (e.g. \`Millwood\`, \`Memorial Park\`, \`Arts District\`, \`Altona Community Centre\`). **Forbidden at the start of \`entity\`:** \`Near \`, \`Around \`, \`Close to \`, \`By \`, \`At \`, \`In \`, \`In the \`, or any similar conversational prefix. **Wrong:** \`Near Confederation Park, Calgary, AB\`. **Right:** \`Confederation Park, Calgary, AB\`.
- **Where to use "near":** Words like "near" or "in" belong in \`title\` (headline) if useful for SEO, **not** in \`entity\`.
- **Good examples (diverse types):** \`Millwood, Altona, MB\`; \`The Annex, Toronto, ON\`; \`River Valley Park, Edmonton, AB\`. **Priority order:** neighbourhood or district **first** when hints/market name them; then parks and landmarks. **Do not** default to a street when a neighbourhood label fits the row.
- **No grid - avoid lazy city:** Without a rank scan, use **entity hints** and **market** to pick **distinct** sub-city area names; do **not** use \`City, Province\` alone for every row when hints name different areas. **Do not** duplicate the same \`entity\` on two rows.
- **Forbidden in \`entity\` (any segment):** street numbers, unit/suite lines, full street addresses, or postal codes. Part (2) must be the **city name only** - never paste a full mailing address from GBP into \`entity\`. Named corridors and **street-as-place** names are OK without civic numbers only as a last resort.`
    : buildSapEntityFieldRulesManualBroad(egLevel, entityTypeFocus);

  const gridFooterTail = useCityEntityRules
    ? `- **Per-target optional entity hint:** If the user message lists an "Optional user entity focus" for a target keyword, prioritize that service area for those SAP rows, subject to the grid geographic scope. Output "entity" as **hyperlocal place, city**[, **province/state** when needed]. If \`sapPages\` for that target is greater than 1, use **distinct** first segments; **prioritize neighbourhood, district, and named-community** labels from the grid, then parks and landmarks; if no hint is given for a target, choose entities from grid evidence alone.
- **"entity" label order (mandatory):** **Hyperlocal anchor first** (proper name: neighbourhood, district, landmark, park, building, campus, waterfront - **not** the city name first), **then** city, **then** province/state **when useful**. Street/avenue/corridor as place is a last resort. Do **not** output two-part "City, Province" with no finer first segment. Do **not** lead with province or country alone. Do **not** prefix the string with \`Near\`, \`Around\`, or similar (see **SAP entity field rules**).
- "entity" must be a concrete, unambiguous place string suitable for a service-area / location page; the opening segment must name a sub-city location when the grid gives any basis for one. The \`entity\` field is **data**, not a sentence.
- **Geographic scope (mandatory):** The grid data includes a "## Geographic scope (from this file)" section with centroid, bounding box, and a buffered radius in miles. Every "entity" MUST sit within that footprint. Prefer first-segment names from **neighborhood/district labels**, **Nearby place names**, and **landmarks** before any street-as-place or corridor name; use POI labels, parks, malls, campuses, and civic complexes. Do **not** paste full street addresses or postal codes from grid pins into "entity" - use **neighbourhood or district, or hyperlocal anchor + city**[, **province** when needed]. Do NOT name distant towns or regions hundreds of miles away unless that exact name appears in the grid evidence. **Do not** substitute a **regional hub** city (e.g. a core-metro name) when the grid file only evidences **suburban or corridor** names - every named place must be **traceable** to a line in the uploaded grid summary, not invented for convenience.
- **Forbidden** for "entity": city-only or province-only strings as the whole label (e.g. "Calgary, AB"); **also** \`City, Province\` where the **first segment is not** a distinct sub-city place **when** the grid lists such places; inventing far-away geography unrelated to the scan pins. Local parks and landmarks **inside** the footprint are encouraged as the first segment when relevant.
- If the user message includes **Wikipedia intros (one per entity hint)**, use them only to ground **names** and light facts about each hinted place. They do **not** replace the grid: **rank evidence, pins, and service-area geography must still come from the grid scan**. Do **not** paste long Wikipedia text into "strategyMarkdown" or row fields.
${
      entityLocation?.trim()
        ? `
- **Optional user market label:** The user provided a preferred market/area string (see user message). Prefer local place and service-area "entity" names (neighborhoods, corridors, parks, landmarks, etc.) that sit within or relate to that market when consistent with the grid footprint and evidence. Use it to disambiguate **entity** strings (e.g. include the city when helpful). If the grid scope conflicts, obey the grid.`
        : ""
    }`
    : `${buildSapEntityFooterGridBroad(egLevel)}${
        entityLocation?.trim()
          ? `

- **Optional user market label:** The user provided a preferred market/area string (see user message). Prefer place names that fit that market and the chosen geographic scope when consistent with evidence. If the grid scope conflicts, obey the grid.`
          : ""
      }`;

  const manualFooterTail = useCityEntityRules
    ? `- **Per-target optional entity hint:** If the user message lists an "Optional user entity focus" for a target keyword, prioritize that service area for those SAP rows, consistent with the stated geography. Output "entity" as **hyperlocal place, city**[, **province/state** when needed]. If \`sapPages\` for that target is greater than 1, use **distinct** first segments; **prioritize neighbourhood, district, and named-community** names, then parks and landmarks; if no hint is given for a target, choose plausible sub-city places from the market and context.
- **"entity" label order (mandatory):** **Hyperlocal anchor first** (proper name: neighbourhood, district, landmark, park, building, campus, waterfront - **not** the city name first), **then** city, **then** province/state **when useful**. Street/avenue/corridor as place is a last resort. Do **not** output two-part "City, Province" with no finer first segment. Do **not** lead with province or country alone. Do **not** prefix the string with \`Near\`, \`Around\`, or similar (see **SAP entity field rules**).
- "entity" must be a concrete, unambiguous place string suitable for a service-area / location page; the opening segment must name a sub-city location when the stated geography allows. The \`entity\` field is **data**, not a sentence.
- **Geographic scope (manual mode):** There is no grid footprint. Use the optional market label, per-target entity hints, and Wikipedia intros to ground geography. Pick plausible sub-city places within the implied metro or region; do **not** name distant cities or regions far from the user's stated geography unless the hint explicitly names them.
- **Forbidden** for "entity": city-only or province-only strings as the whole label (e.g. "Calgary, AB"); **also** \`City, Province\` where the first segment is not a distinct sub-city place **when** hints or market allow finer areas; inventing far-away geography unrelated to the user's hints. Local parks and landmarks in the implied market are encouraged as the first segment when relevant.
- If the user message includes **Wikipedia intros (one per entity hint)**, use them only to ground **names** and light facts about each hinted place. They do **not** replace the need for sensible local geography. Do **not** paste long Wikipedia text into "strategyMarkdown" or row fields.
${
      entityLocation?.trim()
        ? `
- **Optional user market label:** The user provided a preferred market/area string (see user message). Prefer local place and service-area "entity" names (neighborhoods, corridors, parks, landmarks, etc.) that sit within or relate to that market. Use it to disambiguate **entity** strings (e.g. include the city when helpful).`
        : ""
    }`
    : `${buildSapEntityFooterManualBroad(egLevel)}${
        entityLocation?.trim()
          ? `

- **Optional user market label:** The user provided a preferred market/area string (see user message). Prefer place names that fit that market and the chosen geographic scope.`
          : ""
      }`;

  const sapProductServiceFocusBlock = `- **SAP product/service focus (mandatory):** Each row is a **commercial service or product** location page — what the business offers in that area. **Do not** frame \`keyword\` as **reviews**, **ratings**, **testimonials**, **case studies**, **success stories**, **client stories**, **portfolio** as the lead intent, editorial **best-of** roundups, or **vs** competitor comparison pages. If a target, grid line, or seed contains those words, **omit them** and keep the **core offer** phrase (still geography-free in \`keyword\`; see **SAP "keyword" field**). **Examples:** use "luxury glamping tents" not "luxury glamping tent reviews"; "event tent rental" not "event tent rental case studies".`;

  const masterRulesSapKeywordRecap = hasMasterInstructions(siteId ?? null)
    ? `\n${buildSapMasterRulesKeywordMixRecap(siteId ?? null)}\n`
    : "";

  const gridSystemPrompt = `${sapMasterPrefix}You are a local SEO analyst interpreting a Local Dominator–style rank grid. Output ONLY valid JSON with keys strategyMarkdown, keywordStrategyMarkdown, questionsByKeyword, sapRows (exactly ${targetSapCount} row objects: keyword, entity, title, modifier, featuredImage).

${inventorySystemBlock}${gridEntitySection}

**keyword field (mandatory):** 2–4 words, service intent, **no geography** (all places in entity).
${sapProductServiceFocusBlock}${masterRulesSapKeywordRecap}
- **Forbidden in \`keyword\`:** Any neighbourhood, district, city, province, landmark, ravine, valley, or **any word that appears in that row's \`entity\`** (including the hyperlocal first segment and city). Do **not** append "Near [Place]", "[Place] Edmonton", "Central [City]", or similar to differentiate rows.
- **No duplicate (\`keyword\`, \`entity\`) rows (mandatory):** Across **all** \`sapRows\`, **each** row must be **unique** on the pair **(\`keyword\`, \`entity\`)** - the same two strings must **not** appear on two objects. Before you finish, **scan the full array**: if any pair repeats, fix it by giving one row a **different \`entity\`** (different first segment / area name) or, when multi-keyword mode applies, a **different \`keyword\`**. Repeating the same neighbourhood or corridor label on two rows is invalid.
${
  laSingleSeedSap
    ? `- **Local analysis - single target:** When \`sapPages\` > 1 for the only keyword target, **reuse the same geography-free short-tail \`keyword\` on every row** (strip place tokens from the seed). **Differentiate rows only** with **distinct \`entity\` values** - neighbourhood- or district-scale first segments within the main market (grid **Nearby place names**, POIs, weak-rank samples). **Every \`entity\` must be different** - **never** use the same \`entity\` string twice; that duplicates (\`keyword\`, \`entity\`) and fails validation. **Do not** use different service-intent \`keyword\` strings per row.`
    : `- **Multi-row clusters:** When \`sapPages\` > 1, vary rows by **non-geographic** product or service **nouns and modifiers** that stay in the same vertical (e.g. different equipment types, audience, or use-case words) — **not** transactional crutches like **buy / online / cost / installation / packages / financing / near me** unless those exact tokens appear in the user's WordPress inventory JSON. **Never** use review, testimonial, case-study, or comparison-hub angles to differentiate \`keyword\` (see **SAP product/service focus**). **Never** use place names to make keywords distinct - vary \`entity\` for geography instead.`
}
${proposalMatrixSapKeywordSupplement}

${sapTitleOmitBlock}

For "strategyMarkdown", cover these topics **only as bullets** (no paragraph blocks):
- Bullets summarizing what the grid shows per tracked keyword (weak vs strong areas, patterns).
- Under each target keyword (heading or bullet group), bullets naming which **areas/entities** you prioritized and **why**, citing the grid (ranks, sample weak points, geography) - not generic SEO advice.
- Bullets tying the **sapRows** to concrete gaps or opportunities visible in the sheet.

Rules:
- **JSON validity (mandatory):** The entire response must parse with JSON.parse. Inside every string value, escape double quotes as \\" and newlines as \\n. Do not place unescaped double-quote characters inside strategyMarkdown, keywordStrategyMarkdown, titles, or any string field (use 'single quotes' for quoted terms if needed).
- **Unique pairs - you must comply in the model output:** **Never** emit two \`sapRows\` objects with the **same** \`keyword\` **and** \`same** \`entity\`. The server keeps your \`keyword\` strings as authored (whitespace normalization only) — write each \`keyword\` so the pair stays unique without relying on server-side rewriting.
- Do NOT include any field named recommendedSapCount, pageCount, or suggested number of pages. Do NOT output a separate count.
- **questionsByKeyword** must align with **keywordStrategyMarkdown** (same strings per keyword). Keys must match user target keywords exactly.
- The length of "sapRows" MUST be exactly ${targetSapCount}.
${
  proposalKeywordMode
    ? `- The user gave explicit keyword targets with counts from the Content Opportunity Matrix. You MUST allocate rows exactly as specified. **Each row's \`keyword\` must be short-tail and geography-free** (strip place names from the matrix line; see **SAP "keyword" field**).
- Choose **entities** (and keyword assignment per row) that directly address weaker or strategic points visible in the grid summary (use the sample points and per-keyword stats).`
    : laSingleSeedSap
      ? `- **sapRows order (mandatory):** emit all rows for the single target in order. Row count must equal that target's \`sapPages\`; the sum must equal ${targetSapCount}.
- **Single-target keyword rule:** Every SAP row must use the **same geography-free short-tail \`keyword\`** (strip place tokens from the seed). **Do not** vary \`keyword\` between rows. **Vary only \`entity\`** - distinct neighbourhood- or finer-scale areas within the main market (optional entity hint + grid evidence).
- Choose **entities** that align with weaker or strategic points visible in the grid summary.`
      : `- **sapRows order (mandatory):** emit rows in **target list order** - all rows for target 1 (in order), then target 2, etc. Row counts per target must match each target's \`sapPages\`; the sum must equal ${targetSapCount}.
- **Keywords per cluster:** For each target, produce exactly \`sapPages\` rows. When \`sapPages\` is 1, that row's \`keyword\` must match the target string exactly (geography-free). When \`sapPages\` is greater than 1, **each row in that cluster must use a different \`keyword\` string** - same **product/service-offer** intent as the anchor, grounded in **grid keyword themes**, **seed** phrases, or **non-geographic** offer modifiers only; **never** use review, testimonial, or case-study angles (see **SAP product/service focus**); **never** duplicate the same keyword text on two rows in the cluster; **never** put place names from \`entity\` into \`keyword\`.
- Choose **entities** (and keyword assignment per row) that directly address weaker or strategic points visible in the grid summary (use the sample points and per-keyword stats).`
}
${gridFooterTail}`;

  const manualSystemPrompt = `${sapMasterPrefix}You are a local SEO analyst. The user did not upload a rank grid. Output ONLY valid JSON with keys strategyMarkdown, keywordStrategyMarkdown, questionsByKeyword, sapRows (exactly ${targetSapCount} row objects: keyword, entity, title, modifier, featuredImage).

${inventorySystemBlock}${manualEntitySection}

**keyword field (mandatory):** 2–4 words, service intent, **no geography** (all places in entity).
${sapProductServiceFocusBlock}${masterRulesSapKeywordRecap}
- **Forbidden in \`keyword\`:** Any neighbourhood, district, city, province, landmark, ravine, valley, or **any word that appears in that row's \`entity\`** (including the hyperlocal first segment and city). Do **not** append "Near [Place]", "[Place] Edmonton", "Central [City]", or similar to differentiate rows.
- **No duplicate (\`keyword\`, \`entity\`) rows (mandatory):** Across **all** \`sapRows\`, **each** row must be **unique** on the pair **(\`keyword\`, \`entity\`)** - the same two strings must **not** appear on two objects. Before you finish, **scan the full array**: if any pair repeats, fix it by giving one row a **different \`entity\`** (different first segment / area name) or, when multi-keyword mode applies, a **different \`keyword\`**. Repeating the same neighbourhood or corridor label on two rows is invalid.
${
  laSingleSeedSap
    ? `- **Local analysis - single target:** When \`sapPages\` > 1 for the only keyword target, **reuse the same geography-free short-tail \`keyword\` on every row** (strip place tokens from the seed). **Differentiate rows only** with **distinct \`entity\` values** - neighbourhood- or district-scale first segments within the main market (entity hints + optional market label). **Every \`entity\` must be different** - **never** use the same \`entity\` string twice; that duplicates (\`keyword\`, \`entity\`) and fails validation. **Do not** use different service-intent \`keyword\` strings per row.`
    : `- **Multi-row clusters:** When \`sapPages\` > 1, vary rows by **non-geographic** product or service **nouns and modifiers** in the same vertical — **not** transactional crutches like **buy / online / cost / installation / packages / financing / near me** unless those exact tokens appear in the user's WordPress inventory JSON. **Never** use review, testimonial, case-study, or comparison-hub angles to differentiate \`keyword\` (see **SAP product/service focus**). **Never** use place names to make keywords distinct - vary \`entity\` for geography instead.`
}
${proposalMatrixSapKeywordSupplement}

${sapTitleOmitBlock}

For "strategyMarkdown", cover these topics **only as bullets** (no paragraph blocks):
- Bullets summarizing how each target keyword aligns with the user's stated geography (hints + market when present).
- Under each target keyword (heading or bullet group), bullets naming which **areas/entities** you prioritized and **why**, citing hints and market fit - not generic SEO advice.
- Bullets tying the **sapRows** to concrete service-area choices implied by the hints and market (no invented rank claims).

Rules:
- **JSON validity (mandatory):** The entire response must parse with JSON.parse. Inside every string value, escape double quotes as \\" and newlines as \\n. Do not place unescaped double-quote characters inside strategyMarkdown, keywordStrategyMarkdown, titles, or any string field (use 'single quotes' for quoted terms if needed).
- **Unique pairs - you must comply in the model output:** **Never** emit two \`sapRows\` objects with the **same** \`keyword\` **and** \`same** \`entity\`. The server keeps your \`keyword\` strings as authored (whitespace normalization only) — write each \`keyword\` so the pair stays unique without relying on server-side rewriting.
- Do NOT include any field named recommendedSapCount, pageCount, or suggested number of pages. Do NOT output a separate count.
- **questionsByKeyword** must align with **keywordStrategyMarkdown** (same strings per keyword). Keys must match user target keywords exactly.
- The length of "sapRows" MUST be exactly ${targetSapCount}.
${
  proposalKeywordMode
    ? `- The user gave explicit keyword targets with counts from the Content Opportunity Matrix. You MUST allocate rows exactly as specified. **Each row's \`keyword\` must be short-tail and geography-free** (strip place names from the matrix line; see **SAP "keyword" field**).
- Choose **entities** (and keyword assignment per row) that fit the user's entity hints and market; use plausible sub-city place names - do **not** infer rank weaknesses (no grid data).`
    : laSingleSeedSap
      ? `- **sapRows order (mandatory):** emit all rows for the single target in order. Row count must equal that target's \`sapPages\`; the sum must equal ${targetSapCount}.
- **Single-target keyword rule:** Every SAP row must use the **same geography-free short-tail \`keyword\`** (strip place tokens from the seed). **Do not** vary \`keyword\` between rows. **Vary only \`entity\`** - distinct neighbourhood- or finer-scale areas within the main market (hints + optional market label).
- Choose **entities** that fit the user's entity hints and market.`
      : `- **sapRows order (mandatory):** emit rows in **target list order** - all rows for target 1 (in order), then target 2, etc. Row counts per target must match each target's \`sapPages\`; the sum must equal ${targetSapCount}.
- **Keywords per cluster:** For each target, produce exactly \`sapPages\` rows. When \`sapPages\` is 1, that row's \`keyword\` must match the target string exactly (geography-free). When \`sapPages\` is greater than 1, **each row in that cluster must use a different \`keyword\` string** - same **product/service-offer** intent as the anchor, grounded in **seed** phrases or **non-geographic** offer modifiers only; **never** use review, testimonial, or case-study angles (see **SAP product/service focus**); **never** duplicate the same keyword text on two rows in the cluster; **never** put place names from \`entity\` into \`keyword\`.
- Choose **entities** (and keyword assignment per row) that fit the user's entity hints and market; use plausible sub-city place names - do **not** infer rank weaknesses (no grid data).`
}
${manualFooterTail}`;

  const systemPrompt = appendMasterInstructionsToSystemPrompt(
    manual ? manualSystemPrompt : gridSystemPrompt,
    siteId ?? null,
  );

  const optionalLocationBlock =
    entityLocation?.trim() && manual
      ? `--- Optional user-provided entity location (market) ---
The user wants SAP "entity" values to align with this market: "${entityLocation.trim()}"
Prefer sub-city locations (neighborhoods, corridors, parks, landmarks, districts) within or clearly associated with this label. There is no grid footprint - choose plausible geography consistent with this market.

`
      : entityLocation?.trim()
        ? `--- Optional user-provided entity location (market) ---
The user wants SAP "entity" values to align with this market when consistent with the grid geographic scope: "${entityLocation.trim()}"
Prefer sub-city locations (neighborhoods, corridors, parks, landmarks, districts) within or clearly associated with this label. Still obey the grid bounds and evidence above.

`
        : "";

  const uniqueEntityHints = [
    ...new Set(
      keywordTargets
        .map((t) => t.entityHint?.trim())
        .filter((h): h is string => typeof h === "string" && h.length > 0)
    ),
  ];

  const clienteTrim = (clientAudienceContextMarkdown ?? "").trim();
  const clienteBlock = clienteTrim.length > 0 ? `\n${clienteTrim}\n` : "";

  let wikipediaClustersBlock = "";
  if (uniqueEntityHints.length > 0) {
    const wikiOpts: Parameters<typeof fetchWikipediaClustersForSapEntityHints>[1] = {
      siteId,
      wikipediaSearchAugment,
      onWikiProgress,
      ...(effectiveWikiPreferredTitles.length ? { preferredTitles: effectiveWikiPreferredTitles } : {}),
      ...(gridPlaceWeightsForWiki?.length ? { gridPlaceWeights: gridPlaceWeightsForWiki } : {}),
    };
    const clusters = await fetchWikipediaClustersForSapEntityHints(uniqueEntityHints, wikiOpts);
    if (clusters.length > 0) {
      wikipediaClustersBlock = `--- Wikipedia intros (one block per distinct entity hint; shared by all rows using that hint - do not request full articles again per row) ---

${clusters
  .map(
    (c) =>
      `**User entity hint:** "${c.entityHint}"
**Article:** ${c.title}
**URL:** ${c.url}
**Intro:** ${c.extract || "(no extract available)"}
`
  )
  .join("\n")}
`;
    }
  }

  const evidenceBlock = supplementalUserEvidenceMarkdown?.trim()
    ? `\n\n--- Organic competitor analysis (reference for entities and titles; not a rank-grid CSV) ---\n\n${supplementalUserEvidenceMarkdown.trim()}`
    : "";

  const proposalMatrixUserBlock =
    proposalKeywordMode === true
      ? `--- Proposal: Content Opportunity Matrix (intent anchor) ---
Each target line below comes from the competitor report **Content Opportunity Matrix** (bulk columns \`keyword\` / \`title\`, or legacy Anchor Demand / What to Produce). **SAP \`keyword\` must be a short-tail, geography-free service phrase** derived from that line (strip city, neighbourhood, province, region). Do **not** use organic competitor or GSC phrases as SAP \`keyword\` values - those blocks are for context and entities only.

`
      : "";

  const clusterKeywordUserNote =
    proposalKeywordMode === true
      ? ""
      : laSingleSeedSap
        ? `

**Single target (Local analysis):** When \`sapPages\` > 1, **reuse the same geography-free short-tail \`keyword\` on every row** (strip place tokens from the seed). **Differentiate rows only** with **distinct \`entity\` values** - neighbourhood- or district-scale first segments within the main market. **Do not** output different \`keyword\` strings per row. **With grid data:** ground **\`entity\`** in **distinct** first-segment names from the scan (not the same \`City, Province\` twice).
`
        : `

**Multi-row clusters:** When a target has \`sapPages\` greater than 1, output **different \`keyword\` strings per row** in that cluster (same **product/service-offer** intent as the anchor), using **non-geographic** grid/seed variations (offer angles, not place names) — **not** reviews, case studies, or testimonials as \`keyword\` variants (see system prompt). **Do not** repeat the same keyword text on every row while varying \`entity\` only. **With grid data:** also vary **\`entity\`** across rows using **distinct** first-segment names from the scan (not the same \`City, Province\` twice).
`;

  const userPrompt = `Site: ${siteName}${siteUrl ? `\nSite URL: ${siteUrl}` : ""}

Total SAP rows to output: ${targetSapCount} (fixed by the user, not by you).
${wpInventoryUserBlock}${proposalMatrixUserBlock}${optionalLocationBlock}--- User target keywords (counts are mandatory) ---
${targetsBlock}${clusterKeywordUserNote}
${clienteBlock}
For every SAP row: (1) \`keyword\` must be **geography-free** **product/service-offer** intent (see system prompt; **no** lead framing as reviews, case studies, or testimonials): **no** city, neighbourhood, or other tokens copied from that row's \`entity\`. **Never** make \`keyword\` only a district, strip, or corridor name plus a city—always include a **service / product / rental** term so the phrase is a real search query. (2) \`entity\` must be a **raw place label only** - **two or three** comma segments (**hyperlocal anchor**, **city**, optional **province/state**), **starting with the place proper name** (e.g. \`Whyte Avenue, Edmonton\` or \`Confederation Park, Calgary, AB\`). **Never** put \`Near \`, \`Around \`, or similar at the start of \`entity\`. **Never** put street numbers, unit/suite lines, full street addresses, or postal codes in \`entity\` - the city segment is the **city name** only (e.g. Edmonton).${
    manual
      ? ""
      : ` **With grid data (below):** each row's first segment must be a **distinct** named sub-city area from the scan (**Nearby place names**, POIs, corridors, weak-rank samples) - **not** a shortcut \`City, Province\` / \`City, ST\` when the cluster lists specific areas. **Do not** reuse the same \`entity\` on two rows.`
  } (3) Set \`title\` to \`""\` on every row (Gemini title agent runs after entity generation).

${wikiPoolEntityBlock}${wikipediaClustersBlock}${
    manual
      ? `--- Manual mode (no grid CSV) ---

No rank grid or pin data. Ground entities in the user's targets, optional entity hints, optional market label, and Wikipedia blocks above. Do not claim rank positions, weak grid points, or geographic patterns from a scan you did not receive.

`
      : `--- Grid data (Local Dominator–style scan) - use this as the ONLY evidence for why you pick locations ---

${gridSummaryMarkdown}`
  }${evidenceBlock}`;

  type ChatMsg = { role: "system" | "user" | "assistant"; content: string };
  const baseMessages: ChatMsg[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const runOpenRouterJsonCompletion = async (
    messages: ChatMsg[],
    opts?: { temperature?: number },
  ): Promise<string> => {
    const t = opts?.temperature ?? temperature;
    const response = await postOpenRouterAppChatFetch({
      method: "POST",
      headers: openRouterWebAppHeaders(apiKey),
      body: JSON.stringify({
        model: resolveModelForAgentCategory("research", siteId),
        messages,
        temperature: t,
        top_p: topP,
        response_format: { type: "json_object" },
      }),
      signal,
    });

    if (!response.ok) {
      return "";
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    return content;
  };

  const runRefineSapRowKeywordsPass = async (draft: CSVRow[]): Promise<CSVRow[]> => {
    if (draft.length === 0) return draft;
    const refineInventoryClause = hasWpInventoryForPrompt
      ? `When **postInventoryRows** appears in the first user message, each **keyword** must reuse **only** vocabulary from that JSON (2–4 words) — **no** invented "buy … online", "… near me", cost, installation, packages, or financing strings unless those exact substrings exist in inventory. `
      : "";
    const refineSystem = `You are a local SEO editor. Output ONLY one JSON object with key "sapRows" (array). Length and order MUST match the draft exactly. Each element: "keyword" (string, required). Rules: (1) ${refineInventoryClause}Each "keyword" is **2–4 words**, **service/commercial intent** — **no** city, neighbourhood, province, region, or words copied from that row's "entity" in the draft (including hyperlocal first-segment tokens); do not append geography to differentiate rows. **No** transactional filler (buy, online, cost, installation, packages, financing, generic near me) unless it appears in post inventory. (2) Do not output "entity" or "title" in JSON - the server keeps draft entities unchanged and titles are filled by a separate Gemini title agent. The server stores your "keyword" after **trim and internal whitespace collapse only** — **no** automatic geography stripping, token removal, or rewrites. Rejects duplicate keyword+entity pairs. ${TITLE_WELL_KNOWN_ACRONYMS_RULE}`;
    const draftJson = JSON.stringify(
      draft.map((r) => ({ keyword: r.keyword, entity: r.entity })),
      null,
      0
    );
    const refineUser = `${userPrompt}

--- SAP draft rows (rewrite keyword only; entities are fixed server-side; same row count and order) ---
${draftJson}`;
    const refineMessages: ChatMsg[] = [
      { role: "system", content: refineSystem },
      { role: "user", content: refineUser },
    ];
    try {
      const out = await runOpenRouterJsonCompletion(refineMessages, {
        temperature: Math.min(temperature, 0.25),
      });
      if (!out.trim()) return draft;
      const p = JSON.parse(out) as Record<string, unknown>;
      const arr = p.sapRows ?? p.sap_rows;
      if (!Array.isArray(arr) || arr.length !== draft.length) return draft;
      const refined: CSVRow[] = [];
      for (let i = 0; i < draft.length; i++) {
        const row = draft[i]!;
        const item = arr[i] as Record<string, unknown>;
        const kwModel = String(item?.keyword ?? "");
        const entityBefore = row.entity;
        const entityAfter = sanitizeSapEntityForExport(entityBefore, entityLocation);
        const sourcePhrase = resolveSourcePhraseForSapKeywordColumn({
          rowIndex: i,
          modelKeyword: kwModel || row.keyword,
          laSingleSeedSap,
          proposalKeywordMode,
          keywordTargets,
          rowSeeds,
        });
        const kw = sapKeywordFromModelPhrase(sourcePhrase, entityAfter, entityLocation);
        if (!kw.trim()) {
          refined.push(row);
          continue;
        }
        refined.push({ ...row, keyword: kw, entity: entityAfter, title: "" });
      }
      return refined;
    } catch {
      return draft;
    }
  };

  const parseModelObjectFromContent = (rawContent: string): Record<string, unknown> => {
    const parsed = JSON.parse(extractJsonObjectFromModelText(rawContent)) as unknown;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Research model returned invalid JSON.");
    }
    return parsed as Record<string, unknown>;
  };

  const buildFromModelObject = (obj: Record<string, unknown>) => {
    const strategyMarkdown =
      formatStrategyMarkdownAsBullets(String(obj.strategyMarkdown ?? obj.strategy_markdown ?? "").trim()) || "-";
    const keywordStrategyMarkdown = String(
      obj.keywordStrategyMarkdown ?? obj.keyword_strategy_markdown ?? "",
    ).trim();
    const questionsByKeyword = normalizeQuestionsByKeyword(
      obj.questionsByKeyword ?? obj.questions_by_keyword,
      keywordTargets,
    );
    const rawRows = obj.sapRows ?? obj.sap_rows;
    if (!Array.isArray(rawRows)) {
      return {
        strategyMarkdown,
        keywordStrategyMarkdown,
        questionsByKeyword,
        sapRowsRaw: [] as CSVRow[],
      };
    }
    const sapRowsRaw: CSVRow[] = [];
    for (let i = 0; i < rawRows.length; i++) {
      const item = rawRows[i];
      if (!item || typeof item !== "object") continue;
      const row = normalizeRow(item as Record<string, unknown>, i);
      if (!row) continue;
      const entityBefore = row.entity;
      const entityAfter = sanitizeSapEntityForExport(entityBefore, entityLocation);
      const sourcePhrase = resolveSourcePhraseForSapKeywordColumn({
        rowIndex: i,
        modelKeyword: row.keyword,
        laSingleSeedSap,
        proposalKeywordMode,
        keywordTargets,
        rowSeeds,
      });
      let kwAfter = sapKeywordFromModelPhrase(sourcePhrase, entityAfter, entityLocation);
      if (!/\S/.test(kwAfter)) {
        kwAfter = normalizeSapKeywordFromModelOutput(row.keyword);
      }
      sapRowsRaw.push({ ...row, keyword: kwAfter, entity: entityAfter, title: "" });
    }
    return {
      strategyMarkdown,
      keywordStrategyMarkdown,
      questionsByKeyword,
      sapRowsRaw,
    };
  };

  onSapGenerateStart?.();
  const content = await runOpenRouterJsonCompletion(baseMessages);
  if (!content.trim()) {
    return emptyLocalSeoStrategyResult();
  }

  const parsed = parseModelObjectFromContent(content);
  const built = buildFromModelObject(parsed);
  const { strategyMarkdown, keywordStrategyMarkdown, questionsByKeyword, sapRowsRaw } = built;

  let refinedSapRows = sapRowsRaw;
  if (
    refineSapRowKeywordsWithRag === true &&
    proposalKeywordMode !== true &&
    localAnalysisSingleSeed !== true &&
    refinedSapRows.length === targetSapCount
  ) {
    refinedSapRows = await runRefineSapRowKeywordsPass(refinedSapRows);
  }

  const sapRows = attachKeywordQuestionsToRows(
    refinedSapRows.slice(0, targetSapCount),
    questionsByKeyword,
    keywordTargets,
  );
  return { strategyMarkdown, keywordStrategyMarkdown, questionsByKeyword, sapRows };
}
