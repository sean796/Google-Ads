import { normalizeCompetitorDomainKey } from "@/lib/competitor-research/competitor-domain-key";
import {
  buildDomainOrganicCsvFromKeywordRows,
  DOMAIN_ORGANIC_CSV_TOP_ROWS,
} from "@/lib/competitor-research/competitor-domain-organic-csv";
import type {
  CompetitorKeywordRow,
  CompetitorResearchSemrushResponse,
} from "@/lib/competitor-research/types";
import {
  clustersToRows,
  dedupeKeywordRowsForClustering,
  type RawSemanticCluster,
} from "@/lib/competitor-research/competitor-keyword-cluster-repair";
import {
  buildClusterSystem,
  callClusterModelRaw,
  normalizeCompetitorsInput,
  parseClustersOrThrow,
  type ParsedClusterResponse,
} from "@/lib/competitor-research/competitor-keyword-cluster-model";

export {
  MAX_SEMANTIC_CLUSTERS,
  dedupeKeywordRowsForClustering,
  repairClustersToCanonicalPartition,
  validateClusterPicksAgainstInput,
  type RawSemanticCluster,
} from "@/lib/competitor-research/competitor-keyword-cluster-repair";
export {
  MAX_CLUSTER_EXCLUDE_PHRASES,
  buildClusterExcludePhrases,
  type ParsedClusterResponse,
} from "@/lib/competitor-research/competitor-keyword-cluster-model";

/**
 * True when seed + each competitor in `reportDomainKeys` already has semantic cluster rows
 * (`clusterMembers` on every keyword row). Raw Semrush rows omit `clusterMembers`.
 */
export function isSemrushClusteredForReportDomains(
  semrush: CompetitorResearchSemrushResponse,
  reportDomainKeys: Set<string>,
): boolean {
  const seed = semrush.seedTopKeywords ?? [];
  if (seed.length === 0) return false;
  if (!seed.every((r) => Array.isArray(r.clusterMembers))) return false;

  for (const row of semrush.rows ?? []) {
    const nk = normalizeCompetitorDomainKey(row.domain);
    if (!reportDomainKeys.has(nk)) continue;
    const kw = semrush.enrichmentByDomain?.[nk]?.topKeywords ?? [];
    if (kw.length === 0) continue;
    if (!kw.every((r) => Array.isArray(r.clusterMembers))) return false;
  }
  return true;
}

const SINGLE_CALL_MAX_CHARS = 52_000;

/** Max concurrent OpenRouter clustering calls when the payload is split per competitor. */
const CLUSTER_SPLIT_COMPETITOR_CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const n = items.length;
  const ret: R[] = new Array(n);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const idx = next++;
      if (idx >= n) return;
      ret[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Math.min(Math.max(1, concurrency), n);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return ret;
}

/**
 * Semantic clusters via OpenRouter: model assigns labels + member phrases; metrics aggregated in code.
 * Member lists are aligned to INPUT phrases with fuzzy matching (no strict partition errors).
 */
export async function clusterReportKeywordsAggregated(args: {
  apiKey: string;
  model: string;
  signal?: AbortSignal;
  seed: CompetitorKeywordRow[];
  competitors: Record<string, CompetitorKeywordRow[]>;
  excludePhrases?: string[];
}): Promise<{ seed: CompetitorKeywordRow[]; competitors: Record<string, CompetitorKeywordRow[]> }> {
  const competitorsIn = normalizeCompetitorsInput(args.competitors);
  const competitorsDeduped: Record<string, CompetitorKeywordRow[]> = {};
  for (const [k, rows] of Object.entries(competitorsIn)) {
    competitorsDeduped[k] = dedupeKeywordRowsForClustering(rows);
  }
  const seed = dedupeKeywordRowsForClustering(args.seed);
  const excludePhrases = args.excludePhrases ?? [];

  const fullPayload = { seed, competitors: competitorsDeduped };
  const userStr = `INPUT_JSON:\n${JSON.stringify(fullPayload)}`;

  if (userStr.length > SINGLE_CALL_MAX_CHARS) {
    return clusterSplitBatched({
      apiKey: args.apiKey,
      model: args.model,
      signal: args.signal,
      seed,
      competitors: competitorsDeduped,
      excludePhrases,
    });
  }

  const parsed = await callClusterModelRaw(
    args.apiKey,
    args.model,
    buildClusterSystem(excludePhrases),
    fullPayload,
    args.signal,
  );

  return mergeParsedClustersIntoRows(parsed, seed, competitorsDeduped);
}

async function clusterSplitBatched(args: {
  apiKey: string;
  model: string;
  signal?: AbortSignal;
  seed: CompetitorKeywordRow[];
  competitors: Record<string, CompetitorKeywordRow[]>;
  excludePhrases: string[];
}): Promise<{ seed: CompetitorKeywordRow[]; competitors: Record<string, CompetitorKeywordRow[]> }> {
  const sys = buildClusterSystem(args.excludePhrases);
  let seedOut: CompetitorKeywordRow[] = [];
  if (args.seed.length > 0) {
    const parsed = await callClusterModelRaw(
      args.apiKey,
      args.model,
      sys,
      { seed: args.seed, competitors: {} },
      args.signal,
    );
    const raw = parseClustersOrThrow(parsed, "seed");
    seedOut = clustersToRows(raw, args.seed);
  }

  const competitorsVal: Record<string, CompetitorKeywordRow[]> = {};
  const competitorEntries = Object.entries(args.competitors);
  for (const [nk, rows] of competitorEntries) {
    if (rows.length === 0) {
      competitorsVal[nk] = [];
    }
  }
  const toCluster = competitorEntries.filter(([, rows]) => rows.length > 0) as [string, CompetitorKeywordRow[]][];
  const clustered = await mapWithConcurrency(
    toCluster,
    CLUSTER_SPLIT_COMPETITOR_CONCURRENCY,
    async ([nk, rows]) => {
      const parsed = await callClusterModelRaw(
        args.apiKey,
        args.model,
        sys,
        { seed: [], competitors: { [nk]: rows } },
        args.signal,
      );
      const raw = parsed.competitors?.[nk];
      if (!Array.isArray(raw)) {
        throw new Error(`Keyword clustering (${nk}): missing competitors["${nk}"] in batched response.`);
      }
      return [nk, clustersToRows(raw as RawSemanticCluster[], rows)] as const;
    },
  );
  for (const [nk, rowsOut] of clustered) {
    competitorsVal[nk] = rowsOut;
  }

  return { seed: seedOut, competitors: competitorsVal };
}

function mergeParsedClustersIntoRows(
  parsed: ParsedClusterResponse,
  seedIn: CompetitorKeywordRow[],
  competitorsIn: Record<string, CompetitorKeywordRow[]>,
): { seed: CompetitorKeywordRow[]; competitors: Record<string, CompetitorKeywordRow[]> } {
  let seedOut: CompetitorKeywordRow[] = [];
  if (seedIn.length > 0) {
    const raw = parsed.seed;
    if (!Array.isArray(raw)) {
      throw new Error("Keyword clustering: model response missing seed array.");
    }
    seedOut = clustersToRows(raw as RawSemanticCluster[], seedIn);
  }

  const competitorsVal: Record<string, CompetitorKeywordRow[]> = {};
  for (const [nk, rows] of Object.entries(competitorsIn)) {
    if (rows.length === 0) {
      competitorsVal[nk] = [];
      continue;
    }
    const raw = parsed.competitors?.[nk];
    if (!Array.isArray(raw)) {
      throw new Error(`Keyword clustering: model response missing competitors["${nk}"].`);
    }
    competitorsVal[nk] = clustersToRows(raw as RawSemanticCluster[], rows);
  }

  return { seed: seedOut, competitors: competitorsVal };
}

/**
 * Applies semantic-cluster rows (label + aggregated Σ Vol/Σ Tr/best pos + clusterMembers) to Semrush for wire and CSV.
 */
export function applyClusteredKeywordsToSemrush(
  semrush: CompetitorResearchSemrushResponse,
  result: { seed: CompetitorKeywordRow[]; competitors: Record<string, CompetitorKeywordRow[]> },
  reportDomainKeys: Set<string>,
): CompetitorResearchSemrushResponse {
  const seedTopKeywords = result.seed;
  const seedDomainOrganicCsv = buildDomainOrganicCsvFromKeywordRows(seedTopKeywords, DOMAIN_ORGANIC_CSV_TOP_ROWS);

  const domainOrganicCsvByDomain: Record<string, string> = { ...(semrush.domainOrganicCsvByDomain ?? {}) };
  const enrichmentByDomain = { ...(semrush.enrichmentByDomain ?? {}) };

  for (const [d, rows] of Object.entries(result.competitors)) {
    const nk = normalizeCompetitorDomainKey(d);
    if (!reportDomainKeys.has(nk)) continue;
    domainOrganicCsvByDomain[nk] = buildDomainOrganicCsvFromKeywordRows(rows, DOMAIN_ORGANIC_CSV_TOP_ROWS);
    const prev = enrichmentByDomain[nk] ?? { topKeywords: [] };
    enrichmentByDomain[nk] = { ...prev, topKeywords: rows };
  }

  return {
    ...semrush,
    seedTopKeywords,
    seedDomainOrganicCsv,
    domainOrganicCsvByDomain,
    enrichmentByDomain,
  };
}


/** Back-compat alias */
export const clusterReportKeywordsOrFallback = clusterReportKeywordsAggregated;
