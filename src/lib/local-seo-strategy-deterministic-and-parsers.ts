import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import type { EntityGeographicLevel } from "@/lib/entity-geographic-level";
import type { LocalDominatorRow } from "@/lib/local-dominator-csv";
import {
  assertDistinctSapKeywordEntityPairs,
  inferFallbackRegionFromCityName,
  parseMarketLabelForFallback,
  stripGeographyTokensFromSapKeyword,
} from "@/lib/local-seo-strategy-sap-sanitizers";

export function expandKeywordTargetsToRowSeeds(targets: LocalKeywordTarget[]): string[] {
  const out: string[] = [];
  for (const t of targets) {
    for (let j = 0; j < t.sapPages; j++) {
      out.push(t.keyword);
    }
  }
  return out;
}

export function resolveSourcePhraseForSapKeywordColumn(args: {
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
export function normalizeQuestionsByKeyword(
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

export function attachKeywordQuestionsToRows(
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

export function normalizeRow(raw: Record<string, unknown>, _index: number): CSVRow | null {
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
