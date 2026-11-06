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
import type { LocalKeywordTarget } from "@/lib/local-seo-strategy-from-grid";

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

