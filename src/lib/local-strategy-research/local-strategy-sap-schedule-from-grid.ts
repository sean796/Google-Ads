import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { normalizeCompetitorDomainKey } from "@/lib/competitor-research/competitor-domain-key";
import type {
  CompetitorResearchSemrushResponse,
  GscSiteQueryRow,
  TieredCompetitorsResult,
} from "@/lib/competitor-research/types";
import {
  LOCAL_ANALYSIS_SAP_MAX,
  LOCAL_ANALYSIS_SAP_MIN,
} from "@/lib/local-analysis-target-constants";
import { repairSapPageAllocationWeighted } from "@/lib/local-analysis-suggest-keyword-targets";
import {
  extractContentOpportunityMatrixRows,
  sapKeywordStringFromMatrixRow,
} from "@/lib/competitor-research/competitor-report-keyword-extract";
import type { GridKeywordWeight } from "@/lib/process-local-dominator-upload";
import {
  defaultSeedEntityHintFromGrid,
  wikipediaSearchAugmentFromGridRows,
  type LocalDominatorRow,
} from "@/lib/local-dominator-csv";
import { buildSapRowsFromGridDirectWithWikiPool } from "@/lib/local-strategy-research/build-sap-rows-from-grid-direct";
import { fetchLocalSeoStrategyFromGrid, type LocalKeywordTarget } from "@/lib/local-seo-strategy-from-grid";

/** 15 posts/month × 3 months - same total as prior entity-schedule export. */
export const LOCAL_STRATEGY_SAP_SCHEDULE_TOTAL_ROWS = 45;

const MAX_DISTINCT_KEYWORDS_FOR_ALLOCATION = 25;

type WeightedPhrase = { phrase: string; weight: number };

function tierScoreForDomain(domainKey: string, tiers: TieredCompetitorsResult): number {
  for (const g of tiers.tiers) {
    for (const c of g.competitors) {
      if (normalizeCompetitorDomainKey(c.domain) === domainKey) {
        return typeof c.score === "number" && Number.isFinite(c.score) ? c.score : 50;
      }
    }
  }
  return 50;
}

/**
 * Markdown evidence block for SAP (competitor organic grid: tiers, traffic, sample keywords).
 * Passed as `supplementalUserEvidenceMarkdown` with manual SAP prompts so the model sees competitor data without requiring a Dominator grid schema.
 * Exposed for tests and optional UI/debug.
 */
export function buildLocalStrategyCompetitorGridSummaryMarkdown(args: {
  semrush: CompetitorResearchSemrushResponse;
  tiers: TieredCompetitorsResult;
  geoLabel?: string | null;
}): string {
  const lines: string[] = [];
  lines.push("## Organic competitor grid (DataForSEO Labs)");
  if (args.geoLabel?.trim()) {
    lines.push(`- **Market / geo label:** ${args.geoLabel.trim()}`);
  }
  lines.push(`- **Seed domain:** ${args.semrush.seedDomain}`);
  const seedKw = (args.semrush.seedTopKeywords ?? [])
    .slice(0, 8)
    .map((r) => r.phrase?.trim())
    .filter(Boolean);
  if (seedKw.length) {
    lines.push(`- **Seed keyword samples:** ${seedKw.join("; ")}`);
  }
  for (const g of args.tiers.tiers) {
    lines.push(`### ${g.label} (${g.tier})`);
    for (const c of g.competitors) {
      const dk = normalizeCompetitorDomainKey(c.domain);
      const row = (args.semrush.rows ?? []).find((r) => normalizeCompetitorDomainKey(r.domain) === dk);
      const traf = row?.organicTraffic ?? " - ";
      const okw = row?.organicKeywords ?? " - ";
      const top = args.semrush.enrichmentByDomain?.[dk]?.topKeywords ?? [];
      const topPhrases = top
        .slice(0, 5)
        .map((k) => k.phrase?.trim())
        .filter(Boolean)
        .join("; ");
      lines.push(
        `- **${dk}** - AI relevance ${typeof c.score === "number" ? c.score : " - "}; organic traffic ${traf}; organic kw ${okw}${topPhrases ? `. Top phrases: ${topPhrases}` : ""}`,
      );
    }
  }
  return lines.join("\n");
}

function mergeWeightedPhrases(map: Map<string, WeightedPhrase>, phrase: string, delta: number): void {
  const t = phrase.trim();
  if (!t) return;
  const k = t.toLowerCase();
  const ex = map.get(k);
  if (ex) {
    ex.weight += delta;
  } else {
    map.set(k, { phrase: t, weight: delta });
  }
}

/**
 * Pool keywords from seed + selected competitors' enrichment + GSC; weights from traffic × tier score.
 */
export function buildWeightedKeywordPoolForSap(args: {
  semrush: CompetitorResearchSemrushResponse;
  tiers: TieredCompetitorsResult;
  selectedDomainKeys: Set<string>;
  gscQueries?: GscSiteQueryRow[];
}): WeightedPhrase[] {
  const map = new Map<string, WeightedPhrase>();

  for (const sk of args.semrush.seedTopKeywords ?? []) {
    const p = sk.phrase?.trim();
    if (!p) continue;
    mergeWeightedPhrases(map, p, 120);
  }

  for (const row of args.semrush.rows ?? []) {
    const dk = normalizeCompetitorDomainKey(row.domain);
    if (!args.selectedDomainKeys.has(dk)) continue;
    const score = tierScoreForDomain(dk, args.tiers);
    const base = Math.max(1, (row.organicTraffic ?? 0) + 1) * (0.5 + score / 100);
    const enr = args.semrush.enrichmentByDomain?.[dk] ?? args.semrush.enrichmentByDomain?.[row.domain];
    for (const kw of enr?.topKeywords ?? []) {
      const p = kw.phrase?.trim();
      if (!p) continue;
      mergeWeightedPhrases(map, p, base);
    }
  }

  for (const g of args.gscQueries ?? []) {
    const q = g.query?.trim();
    if (!q) continue;
    mergeWeightedPhrases(map, q, Math.max(1, (g.impressions ?? 0) + 1));
  }

  return [...map.values()].sort((a, b) => b.weight - a.weight);
}

/**
 * Build `LocalKeywordTarget[]` with total SAP row count = `targetTotal` (default 45), weighted by competitor grid.
 */
export function buildLocalStrategySapKeywordTargets(args: {
  semrush: CompetitorResearchSemrushResponse;
  tiers: TieredCompetitorsResult;
  selectedDomainKeys: Set<string>;
  gscQueries?: GscSiteQueryRow[];
  entityHint?: string | null;
  targetTotal?: number;
}): LocalKeywordTarget[] {
  const targetTotal = args.targetTotal ?? LOCAL_STRATEGY_SAP_SCHEDULE_TOTAL_ROWS;
  if (targetTotal < LOCAL_ANALYSIS_SAP_MIN) {
    throw new Error(`SAP row total must be at least ${LOCAL_ANALYSIS_SAP_MIN}.`);
  }

  const pool = buildWeightedKeywordPoolForSap(args).slice(0, MAX_DISTINCT_KEYWORDS_FOR_ALLOCATION);
  if (pool.length === 0) {
    throw new Error(
      "No keywords to schedule - run Analyze with competitors that have enrichment keywords, or ensure seed/GSC queries exist.",
    );
  }

  const hint = args.entityHint?.trim() || undefined;
  const rows = pool.map((p) => ({
    keyword: p.phrase,
    sapPages: LOCAL_ANALYSIS_SAP_MIN,
    ...(hint ? { entityHint: hint } : {}),
  }));
  const weights = pool.map((p) => p.weight);

  return repairSapPageAllocationWeighted(
    rows,
    weights,
    targetTotal,
    LOCAL_ANALYSIS_SAP_MIN,
    LOCAL_ANALYSIS_SAP_MAX,
  );
}

/**
 * Build SAP keyword targets from Local Dominator grid CSV weights (weakness scores) and place hints.
 * Higher grid weight → more allocated SAP rows (same weighted repair as Semrush/GSC pool).
 */
export function buildLocalStrategySapKeywordTargetsFromGrid(args: {
  gridKeywordWeights: GridKeywordWeight[];
  placeHints: string[];
  geoLabel: string | null;
  entityLocation: string | null;
  targetTotal?: number;
}): LocalKeywordTarget[] {
  const targetTotal = args.targetTotal ?? LOCAL_STRATEGY_SAP_SCHEDULE_TOTAL_ROWS;
  if (targetTotal < LOCAL_ANALYSIS_SAP_MIN) {
    throw new Error(`SAP row total must be at least ${LOCAL_ANALYSIS_SAP_MIN}.`);
  }

  const sorted = [...args.gridKeywordWeights]
    .filter((k) => k.keyword.trim())
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_DISTINCT_KEYWORDS_FOR_ALLOCATION);
  if (sorted.length === 0) {
    throw new Error("Grid CSV has no keyword weights - re-export the Local Dominator grid or check the file.");
  }

  const geo = [args.geoLabel?.trim(), args.entityLocation?.trim()].filter(Boolean).join(" ").trim();
  const hints = args.placeHints.map((h) => h.trim()).filter(Boolean);
  const rows = sorted.map((k, i) => {
    const baseHint =
      hints.length > 0
        ? `${hints[i % hints.length]!}${geo ? ` ${geo}` : ""}`.trim()
        : geo
          ? `${k.keyword} ${geo}`.trim()
          : k.keyword;
    return {
      keyword: k.keyword,
      sapPages: LOCAL_ANALYSIS_SAP_MIN,
      entityHint: baseHint,
    };
  });
  const weights = sorted.map((k) => k.weight);

  return repairSapPageAllocationWeighted(
    rows,
    weights,
    targetTotal,
    LOCAL_ANALYSIS_SAP_MIN,
    LOCAL_ANALYSIS_SAP_MAX,
  );
}

/**
 * Weight from Local Dominator grid for a matrix-derived keyword: max `weight` among grid rows that match
 * (substring / equality on normalized strings). Default 1 when no grid match.
 */
export function matchGridWeightForSapKeyword(matrixKeyword: string, grid: GridKeywordWeight[]): number {
  const m = matrixKeyword.trim().toLowerCase().replace(/\s+/g, " ");
  if (!m) return 1;
  let best = 1;
  for (const g of grid) {
    const gk = g.keyword.trim().toLowerCase().replace(/\s+/g, " ");
    if (!gk) continue;
    if (m === gk || m.includes(gk) || gk.includes(m)) {
      best = Math.max(best, g.weight);
    }
  }
  return best;
}

/**
 * Proposal SAP: keywords **only** from the competitor report **Content Opportunity Matrix** (Anchor Demand / What to Produce).
 * Row allocation weights use **gridKeywordWeights** when a matrix phrase matches a tracked grid keyword; otherwise neutral weight 1.
 * **Entity hints** use grid `placeHints` + geo like [`buildLocalStrategySapKeywordTargetsFromGrid`].
 */
export function buildLocalStrategySapKeywordTargetsFromProposalMatrix(args: {
  competitorReportMd: string;
  gridKeywordWeights: GridKeywordWeight[];
  placeHints: string[];
  geoLabel: string | null;
  entityLocation: string | null;
  targetTotal?: number;
}): LocalKeywordTarget[] {
  const targetTotal = args.targetTotal ?? LOCAL_STRATEGY_SAP_SCHEDULE_TOTAL_ROWS;
  if (targetTotal < LOCAL_ANALYSIS_SAP_MIN) {
    throw new Error(`SAP row total must be at least ${LOCAL_ANALYSIS_SAP_MIN}.`);
  }

  const matrixRows = extractContentOpportunityMatrixRows(args.competitorReportMd);
  if (matrixRows.length === 0) {
    throw new Error(
      "Proposal SAP requires the Content Opportunity Matrix in the competitor report. Regenerate the competitor strategist section so the matrix (M1–M3 with Anchor Demand) is present.",
    );
  }

  const merged = new Map<string, { keyword: string; weight: number }>();
  for (const row of matrixRows) {
    const kw = sapKeywordStringFromMatrixRow(row);
    if (!kw.trim()) continue;
    const weight = matchGridWeightForSapKeyword(kw, args.gridKeywordWeights);
    const key = kw.toLowerCase();
    const ex = merged.get(key);
    if (!ex) merged.set(key, { keyword: kw, weight });
    else merged.set(key, { keyword: ex.keyword, weight: Math.max(ex.weight, weight) });
  }

  const list = [...merged.values()].slice(0, MAX_DISTINCT_KEYWORDS_FOR_ALLOCATION);
  if (list.length === 0) {
    throw new Error(
      "Content Opportunity Matrix rows have no usable Anchor Demand or What to Produce text for SAP keywords.",
    );
  }

  const geo = [args.geoLabel?.trim(), args.entityLocation?.trim()].filter(Boolean).join(" ").trim();
  const hints = args.placeHints.map((h) => h.trim()).filter(Boolean);
  const rows = list.map((item, i) => {
    const baseHint =
      hints.length > 0
        ? `${hints[i % hints.length]!}${geo ? ` ${geo}` : ""}`.trim()
        : geo
          ? `${item.keyword} ${geo}`.trim()
          : item.keyword;
    return {
      keyword: item.keyword,
      sapPages: LOCAL_ANALYSIS_SAP_MIN,
      entityHint: baseHint,
    };
  });
  const weights = list.map((r) => r.weight);

  return repairSapPageAllocationWeighted(
    rows,
    weights,
    targetTotal,
    LOCAL_ANALYSIS_SAP_MIN,
    LOCAL_ANALYSIS_SAP_MAX,
  );
}

export type RunLocalStrategySapScheduleParams = {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  siteId?: string;
  siteName: string;
  siteUrl?: string | null;
  entityLocation?: string | null;
  semrush: CompetitorResearchSemrushResponse;
  tiers: TieredCompetitorsResult;
  selectedDomainKeys: Set<string>;
  gscQueries?: GscSiteQueryRow[];
  geoLabel?: string | null;
  signal?: AbortSignal;
  /** Total SAP bulk rows (default: {@link LOCAL_STRATEGY_SAP_SCHEDULE_TOTAL_ROWS}). */
  targetTotal?: number;
  /** Non-empty after processing a Local Dominator grid CSV - enables grid system prompt + weighted targets when weights exist. */
  gridSummaryMarkdown?: string | null;
  gridPlaceHints?: string[];
  gridKeywordWeights?: GridKeywordWeight[];
  /**
   * When set with a parseable Content Opportunity Matrix, SAP keyword targets can come from that matrix (with optional
   * grid weights for allocation). **Proposal** uses `proposalGridOnly` instead - do not pass matrix markdown for entity SAP.
   */
  proposalCompetitorReportMarkdown?: string | null;
  /**
   * When true: require a parseable Content Opportunity Matrix in `proposalCompetitorReportMarkdown` and **do not** fall
   * back to grid/Semrush keyword pools if matrix parsing fails.
   */
  proposalStrictMatrix?: boolean;
  /**
   * Proposal entity SAP: **only** the Local Dominator grid path - `gridSummaryMarkdown` is used as-is (no trim), keyword
   * targets from `buildLocalStrategySapKeywordTargetsFromGrid` only; throws if grid text or weights missing (no Semrush pool).
   */
  proposalGridOnly?: boolean;
  /**
   * When set (from grid CSV import), SAP rows are built **deterministically** from grid pins + local analysis - no OpenRouter
   * JSON for row content. Ignores `apiKey` for that step.
   */
  gridParsedRows?: LocalDominatorRow[];
};

/**
 * SAP-shaped bulk rows: either **direct** from grid pins (no OpenRouter row model) or via `fetchLocalSeoStrategyFromGrid`.
 */
export async function runLocalStrategySapSchedule(
  params: RunLocalStrategySapScheduleParams,
): Promise<{ sapRows: CSVRow[]; usedFallback: boolean; builtFromGridDirect?: boolean }> {
  const targetTotal = params.targetTotal ?? LOCAL_STRATEGY_SAP_SCHEDULE_TOTAL_ROWS;
  const gridParsed = params.gridParsedRows;
  if (gridParsed && gridParsed.length > 0) {
    const sapRows = await buildSapRowsFromGridDirectWithWikiPool({
      rows: gridParsed,
      targetTotal,
      placeHints: params.gridPlaceHints ?? [],
      geoLabel: params.geoLabel ?? null,
      entityLocation: params.entityLocation ?? null,
      semrush: params.semrush,
      tiers: params.tiers,
      apiKey: params.apiKey,
      siteId: params.siteId,
    });
    return { sapRows, usedFallback: false, builtFromGridDirect: true };
  }

  const proposalGridOnly = params.proposalGridOnly === true;
  const gridWeights = params.gridKeywordWeights ?? [];
  const hasGridWeights = gridWeights.length > 0;
  let gridMd: string;
  if (proposalGridOnly) {
    gridMd = params.gridSummaryMarkdown ?? "";
  } else {
    gridMd = params.gridSummaryMarkdown?.trim() ?? "";
  }
  const hasGridMd = gridMd.length > 0;
  const proposalMd = params.proposalCompetitorReportMarkdown?.trim() ?? "";
  const proposalMatrixTablePresent =
    proposalMd.length > 0 && extractContentOpportunityMatrixRows(proposalMd).length > 0;
  const proposalStrict = params.proposalStrictMatrix === true;

  if (proposalStrict) {
    if (!proposalMd) {
      throw new Error("Proposal SAP requires the competitor strategist markdown.");
    }
    if (!proposalMatrixTablePresent) {
      throw new Error(
        "Proposal requires a Content Opportunity Matrix in the competitor report (Traffic & Intent Gaps). Regenerate the competitor strategist section.",
      );
    }
  }

  let proposalKeywordMode = false;
  let keywordTargets: LocalKeywordTarget[];

  if (proposalGridOnly) {
    if (!hasGridMd || !hasGridWeights) {
      throw new Error(
        "Import a Local Dominator grid CSV before generating a proposal - entity SAP uses the grid scan (keywords + rank evidence).",
      );
    }
    keywordTargets = buildLocalStrategySapKeywordTargetsFromGrid({
      gridKeywordWeights: gridWeights,
      placeHints: params.gridPlaceHints ?? [],
      geoLabel: params.geoLabel ?? null,
      entityLocation: params.entityLocation ?? null,
      targetTotal,
    });
  } else if (proposalStrict) {
    keywordTargets = buildLocalStrategySapKeywordTargetsFromProposalMatrix({
      competitorReportMd: proposalMd,
      gridKeywordWeights: gridWeights,
      placeHints: params.gridPlaceHints ?? [],
      geoLabel: params.geoLabel ?? null,
      entityLocation: params.entityLocation ?? null,
      targetTotal,
    });
    proposalKeywordMode = true;
  } else if (proposalMatrixTablePresent) {
    try {
      keywordTargets = buildLocalStrategySapKeywordTargetsFromProposalMatrix({
        competitorReportMd: proposalMd,
        gridKeywordWeights: gridWeights,
        placeHints: params.gridPlaceHints ?? [],
        geoLabel: params.geoLabel ?? null,
        entityLocation: params.entityLocation ?? null,
        targetTotal,
      });
      proposalKeywordMode = true;
    } catch {
      keywordTargets =
        hasGridMd && hasGridWeights
          ? buildLocalStrategySapKeywordTargetsFromGrid({
              gridKeywordWeights: gridWeights,
              placeHints: params.gridPlaceHints ?? [],
              geoLabel: params.geoLabel ?? null,
              entityLocation: params.entityLocation ?? null,
              targetTotal,
            })
          : buildLocalStrategySapKeywordTargets({
              semrush: params.semrush,
              tiers: params.tiers,
              selectedDomainKeys: params.selectedDomainKeys,
              gscQueries: params.gscQueries,
              entityHint: params.geoLabel?.trim() || params.entityLocation?.trim() || null,
              targetTotal,
            });
    }
  } else {
    keywordTargets =
      hasGridMd && hasGridWeights
        ? buildLocalStrategySapKeywordTargetsFromGrid({
            gridKeywordWeights: gridWeights,
            placeHints: params.gridPlaceHints ?? [],
            geoLabel: params.geoLabel ?? null,
            entityLocation: params.entityLocation ?? null,
            targetTotal,
          })
        : buildLocalStrategySapKeywordTargets({
            semrush: params.semrush,
            tiers: params.tiers,
            selectedDomainKeys: params.selectedDomainKeys,
            gscQueries: params.gscQueries,
            entityHint: params.geoLabel?.trim() || params.entityLocation?.trim() || null,
            targetTotal,
          });
  }

  let entityLocation: string | undefined;
  if (hasGridMd) {
    const fromGrid = defaultSeedEntityHintFromGrid(params.gridPlaceHints ?? [], null).trim();
    entityLocation = fromGrid.length > 0 ? fromGrid : undefined;
  } else {
    entityLocation =
      params.entityLocation?.trim() ||
      params.geoLabel?.trim() ||
      undefined;
  }

  const supplementalUserEvidenceMarkdown = buildLocalStrategyCompetitorGridSummaryMarkdown({
    semrush: params.semrush,
    tiers: params.tiers,
    geoLabel: params.geoLabel ?? null,
  });

  const wikipediaSearchAugment =
    params.gridParsedRows?.length ? wikipediaSearchAugmentFromGridRows(params.gridParsedRows) : undefined;

  const result = await fetchLocalSeoStrategyFromGrid({
    apiKey: params.apiKey,
    model: params.model,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    topP: params.topP,
    signal: params.signal,
    targetSapCount: targetTotal,
    keywordTargets,
    gridSummaryMarkdown: hasGridMd ? gridMd : "",
    manualTargetsOnly: !hasGridMd,
    supplementalUserEvidenceMarkdown,
    siteName: params.siteName,
    siteUrl: params.siteUrl?.trim() || undefined,
    entityLocation,
    siteId: params.siteId,
    wikipediaSearchAugment,
    proposalKeywordMode,
    proposalGridSap: proposalGridOnly,
    refineSapRowKeywordsWithRag: true,
    gridParsedRows: params.gridParsedRows,
    gridPlaceHints: params.gridPlaceHints,
  });

  return { sapRows: result.sapRows, usedFallback: false };
}
